// Проба к спецификации сценария 4 «Сердце и мозг» (docs/specs/2026-11-scenario-4.md, «Замер»): что делает больница с КТ и
// палатой интенсивной терапии круглые сутки, если никто не играет, — чтобы цели сценария опирались на числа, а не на
// догадку.
//
// Больницы — готовые районная с сосудистым отделением (глава 3 «Анамнеза»: смотровая приёмного, КТ, палата интенсивной
// терапии) и городская, в потоке для ПК, со сменами: ночная там, где у готовой больницы койки или смотровая (`withNightShift`).
// Все случаи ведут нанятые врачи: в кабинете врача без врача — нанятый терапевт днём и ночью, как в замере сценария 3.
// Считается по суткам — по всем закрытым приёмам больницы, а не по вашим (итоги суток «Анамнеза» считают сроки только
// ваших приёмов):
// - сроки (`content/targets/`): у скольких закрытых был срок и у скольких он выполнен (оценка «A») — ЭКГ при боли в груди за
//   10 минут, осмотр и КТ при подозрении на инсульт, тромболизис и перевод при подъёме ST;
// - пришли с болью в груди и с признаками инсульта — по жалобам сроков; сами и по скорой;
// - кого положили в палату интенсивной терапии; сколько раз нанятые врачи просили посмотреть;
// - с `--routes` (часть 1 сценария, решение владельца #219): маршруты для срочного включены с первой минуты — медсестра
//   смотровой снимает ЭКГ при боли в груди и везёт на КТ при признаках инсульта до врача; сколько прошло по каждому за сутки
//   и во что обошлись расходники.
//
// bun tools/bench/vascular.ts [--days 7] [--seeds 1,2,3] [--hospital vascular,city] [--routes]
import type { ContentDb, Id } from '../../src/content/types';
import { db as bundle } from '../../src/content';
import { hospitalOf } from '../../src/engine/hospital/site';
import { siteOfPreset } from '../../src/engine/hospital/site-preset';
import { presetStaff, withNightShift } from '../../src/engine/hospital/staff';
import { apply, newFlowShift } from '../../src/engine/shift/engine';
import { startCash } from '../../src/engine/shift/money';
import type { ShiftPatient, ShiftState } from '../../src/engine/shift/types';

const arg = (name: string, def: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
};
const DAYS = Number(arg('days', '7'));
const SEEDS = arg('seeds', '1,2,3').split(',').map(Number);
const HOSPITALS = arg('hospital', 'vascular,city').split(',');
const ROUTES = process.argv.includes('--routes') ? Object.keys(bundle.routes ?? {}) : [];
const db: ContentDb = bundle;
const H = 3600;
/** Сроки сценария: боль в груди и инсульт. */
const TARGETS: Id[] = ['target.ecg_chest_pain', 'target.lysis_stemi', 'target.transfer_stemi', 'target.stroke_exam', 'target.stroke_ct'];

function start(name: string, seed: number): ShiftState {
  const rec = db.presets[`preset.${name}`];
  // ваш кабинет — не ваш: врача никто не играет, его ведёт нанятый терапевт (как в симуляторе экономики, `emergency`)
  const { mine: _, ...site } = siteOfPreset(db, rec);
  const s = newFlowShift(db, {
    seed, season: 'winter', hospital: hospitalOf(db, site), staff: withNightShift(db, site.rooms, presetStaff(db, rec)),
    flow: { perHour: 0, auto: true }, economy: { cash: startCash(db, 'preset') },
  });
  for (const r of s.hospital!.site!.rooms.filter(x => x.type === 'room.office')) {
    for (const shift of ['day', 'night'] as const) {
      if (!s.staff!.some(m => m.room === r.id && (m.shift === shift || m.shift === undefined) && db.roles[m.role]?.stands === 'role.doctor')) {
        apply(db, s, { kind: 'site', cmd: { kind: 'hire', room: r.id, role: 'role.doctor', shift } });
      }
    }
  }
  apply(db, s, { kind: 'site', cmd: { kind: 'done' } });
  if (ROUTES.length > 0) apply(db, s, { kind: 'routes', on: ROUTES });
  return s;
}

/** Жалобы срока: пришёл с ними — его срок мог быть. */
const complaintsOf = (id: Id) => new Set(db.targets[id]?.complaints ?? []);
const CHEST = complaintsOf('target.ecg_chest_pain');
const STROKE = complaintsOf('target.stroke_ct');
const has = (p: ShiftPatient, set: Set<Id>) => p.patient.complaints.some(c => set.has(c));

interface DayRow {
  day: number;
  chest: { walk: number; amb: number };
  stroke: { walk: number; amb: number };
  targets: Record<Id, { onTime: number; total: number }>;
  icu: number;
  asks: number;
  routes: Record<Id, { n: number; rub: number }>;
}

function run(name: string, seed: number): DayRow[] {
  const s = start(name, seed);
  const seen = new Map<string, ShiftPatient>();
  const rows: DayRow[] = [];
  const end = (DAYS * 24 + 8) * H;
  let day = s.day;
  let asks = 0;
  const collect = () => {
    for (const p of Object.values(s.patients)) seen.set(p.id, p);
    for (const x of s.past ?? []) seen.set(x.p.id, x.p);
  };
  while (s.t < end) {
    for (const n of apply(db, s, { kind: 'advance', seconds: 300 })) if (n.kind === 'consult') asks++;
    collect();
    if (s.day === day) continue;
    const h = s.history.at(-1)!;
    const ps = [...seen.values()].filter(p => p.id.startsWith(`${h.day}-`));
    const closed = [...seen.values()].filter(p => p.closed && p.closed.at >= (h.day - 1) * 24 * H + 8 * H && p.closed.at < h.day * 24 * H + 8 * H);
    const targets: DayRow['targets'] = Object.fromEntries(TARGETS.map(t => [t, { onTime: 0, total: 0 }]));
    for (const p of closed) {
      for (const t of p.closed!.targets ?? []) {
        if (!targets[t.id]) continue;
        targets[t.id].total++;
        if (t.grade === 'A') targets[t.id].onTime++;
      }
    }
    const kinds = (set: Set<Id>) => ({ walk: ps.filter(p => has(p, set) && p.kind !== 'ambulance').length, amb: ps.filter(p => has(p, set) && p.kind === 'ambulance').length });
    rows.push({ day: h.day, chest: kinds(CHEST), stroke: kinds(STROKE), targets, icu: closed.filter(p => p.closed!.plan.setting === 'icu').length, asks, routes: h.routes ?? {} });
    asks = 0;
    day = s.day;
  }
  return rows;
}

const short = (id: Id) => id.slice('target.'.length);

for (const name of HOSPITALS) {
  const rec = db.presets[`preset.${name}`];
  if (!rec) {
    console.error(`нет готовой больницы preset.${name}`);
    continue;
  }
  const kinds = new Set(rec.rooms.map(r => r.type));
  console.log(`\n## ${name}: КТ ${kinds.has('room.ct') ? 'есть' : 'нет'}, палата интенсивной терапии ${kinds.has('room.icu') ? 'есть' : 'нет'}; суток ${DAYS}, зёрна ${SEEDS.join(', ')}`);
  const all: DayRow[] = [];
  for (const seed of SEEDS) {
    const rows = run(name, seed);
    all.push(...rows);
    console.log(`  зерно ${seed}`);
    for (const r of rows) {
      const t = TARGETS.map(id => `${short(id)} ${r.targets[id].onTime}/${r.targets[id].total}`).join(', ');
      const rt = ROUTES.length > 0 ? `; по маршрутам: ${ROUTES.map(id => `${id.slice('route.'.length)} ${r.routes[id]?.n ?? 0}`).join(', ')}` : '';
      console.log(`    сутки ${r.day}: боль в груди — сами ${r.chest.walk}, скорая ${r.chest.amb}; инсульт — сами ${r.stroke.walk}, скорая ${r.stroke.amb}; сроки в срок/всего: ${t}; в ПИТ ${r.icu}; просили посмотреть ${r.asks}${rt}`);
    }
  }
  const n = all.length;
  const avg = (f: (r: DayRow) => number) => (all.reduce((a, r) => a + f(r), 0) / n).toFixed(1);
  const tot = TARGETS.map(id => {
    const on = all.reduce((a, r) => a + r.targets[id].onTime, 0);
    const all_ = all.reduce((a, r) => a + r.targets[id].total, 0);
    return `${short(id)} ${on} из ${all_}`;
  }).join(', ');
  const rt = ROUTES.map(id => `${id.slice('route.'.length)} ${avg(r => r.routes[id]?.n ?? 0)} (${avg(r => r.routes[id]?.rub ?? 0)} ₽)`).join(', ');
  console.log(
    `  в сутки в среднем: боль в груди ${avg(r => r.chest.walk + r.chest.amb)} (скорая ${avg(r => r.chest.amb)}), инсульт ${avg(r => r.stroke.walk + r.stroke.amb)} (скорая ${avg(r => r.stroke.amb)}); ` +
      `в ПИТ ${avg(r => r.icu)}; просили посмотреть ${avg(r => r.asks)}; сроки за ${n} суток: ${tot}${rt ? `; по маршрутам: ${rt}` : ''}`,
  );
}
