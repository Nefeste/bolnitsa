// Залы ожидания у кабинетов или у входа (spec docs/specs/2026-10-real-hospital.md, «Чем это лучше: проба»): поликлиника из
// базы и она же, где залы ожидания стоят у главного входа, — один большой (как в городской больнице) или те же два. Поток —
// числом в час (под нагрузкой) или от больницы (`--flow 0`). Врача никто не играет: в вашем кабинете — тоже нанятый
// терапевт, как если бы вы принимали сами; `--yours` — ваш кабинет пустует, как в симуляторе экономики. Что меряем: от зала
// до двери кабинета, ушедших за сутки, от прихода до вызова к врачу.
// `--hall N` — сидя или стоя по своему залу: зал не дальше N м от кабинета (content/hospital/inflow.yaml, `hall`); `--hall 0` —
// по местам всей больницы, как прежде.
//   bun tools/sim/halls.ts [--days 3] [--seeds 1,2,3] [--flow 14] [--yours] [--hall N]
import type { SitePlan } from '../../src/content/types';
import { hospitalOf, planOfSite } from '../../src/engine/hospital/site';
import { siteOfPlan } from '../../src/engine/hospital/site-plan';
import { metersBetween } from '../../src/engine/hospital/walk';
import { apply, newFlowShift } from '../../src/engine/shift/engine';
import { startCash } from '../../src/engine/shift/money';
import type { Flow } from '../../src/engine/shift/types';
import { buildDb } from '../content/load';

const arg = (name: string, def: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
};
const DAYS = Number(arg('days', '3'));
const SEEDS = arg('seeds', '1,2,3').split(',').map(Number);
const PER_HOUR = Number(arg('flow', '14'));
const YOURS = process.argv.includes('--yours');

const { db, errors } = buildDb();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
const HALL = arg('hall', '');
if (HALL !== '' && db.inflow) {
  if (Number(HALL) > 0) db.inflow.hall = Number(HALL);
  else delete db.inflow.hall;
}

const rec = db.sites!['site.polyclinic'];
// без отметки «ваш» терапевта нанимают во все кабинеты
const base: SitePlan = YOURS ? rec : { id: rec.id, rooms: rec.rooms.map(({ mine: _, ...r }) => r) };
const rest = base.rooms.filter(r => r.type !== 'room.waiting');
const VARIANTS: [string, SitePlan][] = [
  ['залы у кабинетов (два M, 20 мест)', base],
  ['один зал у входа (L, 18 мест)', { id: base.id, rooms: [...rest, { type: 'room.waiting', size: 'L', x: 9, y: 26, rot: 2 }] }],
  ['два зала у входа (два M, 20 мест)', { id: base.id, rooms: [...rest, { type: 'room.waiting', size: 'M', x: 10, y: 26, rot: 2 }, { type: 'room.waiting', size: 'M', x: 39, y: 26, rot: 2 }] }],
];

const flow: Flow = PER_HOUR > 0 ? { perHour: PER_HOUR, ambulancePerHour: 0 } : { perHour: 0, auto: true };
const avg = (a: number[]) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 0);
console.log(`поток: ${PER_HOUR > 0 ? `${PER_HOUR} в час` : 'от больницы'}; ${DAYS} сут.; зёрна ${SEEDS.join(', ')}; ${YOURS ? 'ваш кабинет пустует' : 'терапевт в каждом кабинете'}; ${db.inflow?.hall ? `сидя — в своём зале не дальше ${db.inflow.hall} м` : 'сидя — по местам всей больницы'}`);
for (const [name, p] of VARIANTS) {
  const built = siteOfPlan(db, p);
  if (!built.ok) throw new Error(`${name}: помещение ${built.room} — ${built.error.kind}`);
  const plan = planOfSite(db, built.site);
  const halls = plan.rooms.filter(r => r.type === 'room.waiting').map(r => r.id);
  const offices = plan.rooms.filter(r => r.type === 'room.office').map(r => r.id);
  const near = offices.map(o => Math.min(...halls.map(h => metersBetween(plan, h, o) ?? Infinity)));
  console.log(`\n## ${name}: от зала до кабинета ${Math.min(...near)}–${Math.max(...near)} м`);
  for (const seed of SEEDS) {
    const s = newFlowShift(db, { seed, season: 'winter', hospital: hospitalOf(db, built.site), staff: built.staff, flow, economy: { cash: startCash(db, 'poly') } });
    const called = new Map<string, number>();
    const end = (DAYS * 24 + 8) * 3600;
    while (s.t < end) {
      apply(db, s, { kind: 'advance', seconds: 300 });
      for (const x of Object.values(s.patients)) if (x.calledT !== undefined && !called.has(x.id)) called.set(x.id, (x.calledT - x.arriveT) / 60);
    }
    const rows = s.history.map(d => `${d.arrived}/${Object.values(d.colleagues ?? {}).reduce((n, c) => n + c.seen, d.seen)}/${d.left}`);
    console.log(`  зерно ${seed}: пришли/приняты/ушли по суткам ${rows.join(' · ')}; от прихода до вызова — ${avg([...called.values()])} мин`);
  }
}
