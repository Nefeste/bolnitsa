// Проба к спецификации сценария 3 «Хирургия» (docs/specs/2026-11-scenario-3.md, «Замер»): что делает больница с операционной
// круглые сутки, если никто не играет, — чтобы цели сценария опирались на числа, а не на догадку.
//
// Больницы — готовые районная (глава 2 «Анамнеза»: смотровая приёмного, две палаты, операционная) и городская, в потоке для
// ПК, со сменами: ночная там, где у готовой больницы койки или смотровая (`withNightShift`). Все случаи ведут нанятые врачи:
// в кабинете врача без врача (ваш кабинет районной больницы) — нанятый терапевт днём и ночью, как в замере сценария 2.
// Считается по суткам:
// - пришли с болезнью хирургии или травмы (по правде, `routeDept`) — сами и по скорой;
// - операции: решили, сделали, в срок и поздно (срок болезни), в осложнённой стадии на момент разреза, из них осложнилось
//   уже в больнице, пока ждал, осложнения после операции, умершие после операции;
// - ожидание стола: от решения оперировать до начала операции, медиана и самое долгое; занятость операционных.
//
// bun tools/bench/surgery.ts [--days 7] [--seeds 1,2,3] [--hospital district,city]
import type { ContentDb } from '../../src/content/types';
import { db as bundle } from '../../src/content';
import { routeDept } from '../../src/engine/hospital/departments';
import { hospitalOf } from '../../src/engine/hospital/site';
import { siteOfPreset } from '../../src/engine/hospital/site-preset';
import { presetStaff, withNightShift } from '../../src/engine/hospital/staff';
import { primaryOf } from '../../src/engine/med/plan';
import { apply, newFlowShift } from '../../src/engine/shift/engine';
import { startCash } from '../../src/engine/shift/money';
import type { ShiftPatient, ShiftState } from '../../src/engine/shift/types';

const arg = (name: string, def: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
};
const DAYS = Number(arg('days', '7'));
const SEEDS = arg('seeds', '1,2,3').split(',').map(Number);
const HOSPITALS = arg('hospital', 'district,city').split(',');
const db: ContentDb = bundle;
const H = 3600;

function start(name: string, seed: number): ShiftState {
  const rec = db.presets[`preset.${name}`];
  // ваш кабинет — не ваш: врача никто не играет, его ведёт нанятый терапевт (как в симуляторе экономики, `emergency`)
  const { mine: _, ...site } = siteOfPreset(db, rec);
  const s = newFlowShift(db, {
    seed, season: 'winter', hospital: hospitalOf(db, site), staff: withNightShift(db, site.rooms, presetStaff(db, rec)),
    flow: { perHour: 0, auto: true }, economy: { cash: startCash(db, 'preset') },
  });
  // кабинет врача без врача — нанятый терапевт днём и ночью: врача никто не играет
  for (const r of s.hospital!.site!.rooms.filter(x => x.type === 'room.office')) {
    for (const shift of ['day', 'night'] as const) {
      if (!s.staff!.some(m => m.room === r.id && (m.shift === shift || m.shift === undefined) && db.roles[m.role]?.stands === 'role.doctor')) {
        apply(db, s, { kind: 'site', cmd: { kind: 'hire', room: r.id, role: 'role.doctor', shift } });
      }
    }
  }
  apply(db, s, { kind: 'site', cmd: { kind: 'done' } });
  return s;
}

const surgical = (p: ShiftPatient) => routeDept(db, primaryOf(p.patient).id) === 'dept.surgery';
const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : 0);

interface DayRow {
  day: number;
  walk: number;
  amb: number;
  decided: number;
  done: number;
  onTime: number;
  late: number;
  complicated: number;
  waited: number;
  complications: number;
  died: number;
  waitMed: number;
  waitMax: number;
  busy: number;
}

function run(name: string, seed: number): DayRow[] {
  const s = start(name, seed);
  const ors = s.hospital!.site!.rooms.filter(r => r.type === 'room.or').length;
  const seen = new Map<string, ShiftPatient>();
  const rows: DayRow[] = [];
  const end = (DAYS * 24 + 8) * H;
  let day = s.day;
  const collect = () => {
    for (const p of Object.values(s.patients)) seen.set(p.id, p);
    for (const x of s.past ?? []) seen.set(x.p.id, x.p);
  };
  while (s.t < end) {
    apply(db, s, { kind: 'advance', seconds: 300 });
    collect();
    if (s.day === day) continue;
    // сутки закрылись на планёрке: пришедшие этих суток — по номеру `сутки-…`
    const h = s.history.at(-1)!;
    const ps = [...seen.values()].filter(p => p.id.startsWith(`${h.day}-`));
    const ops = [...seen.values()].map(p => p.stay?.op).filter((op): op is NonNullable<typeof op> => !!op && op.start !== undefined && op.queued >= (h.day - 1) * 24 * H + 8 * H && op.queued < h.day * 24 * H + 8 * H);
    const waits = ops.map(op => Math.round((op.start! - op.queued) / 60));
    const busy = ops.reduce((a, op) => a + ((op.end ?? op.start!) - op.start!), 0) / (Math.max(1, ors) * 24 * H);
    const sg = h.surgery;
    rows.push({
      day: h.day,
      walk: ps.filter(p => surgical(p) && p.kind === 'walkIn').length,
      amb: ps.filter(p => surgical(p) && p.kind === 'ambulance').length,
      decided: ops.length,
      done: sg?.done ?? 0, onTime: sg?.onTime ?? 0, late: sg?.late ?? 0, complicated: sg?.complicated ?? 0, waited: sg?.waited ?? 0,
      complications: sg?.complications ?? 0, died: h.ward?.died ?? 0,
      waitMed: median(waits), waitMax: Math.max(0, ...waits), busy: Math.round(100 * busy),
    });
    day = s.day;
  }
  return rows;
}

for (const name of HOSPITALS) {
  const rec = db.presets[`preset.${name}`];
  if (!rec) {
    console.error(`нет готовой больницы preset.${name}`);
    continue;
  }
  const ors = rec.rooms.filter(r => r.type === 'room.or').length;
  console.log(`\n## ${name}: операционных ${ors}, суток ${DAYS}, зёрна ${SEEDS.join(', ')}`);
  const all: DayRow[] = [];
  for (const seed of SEEDS) {
    const rows = run(name, seed);
    all.push(...rows);
    console.log(`  зерно ${seed}`);
    for (const r of rows) {
      console.log(
        `    сутки ${r.day}: хирургия и травма — сами ${r.walk}, скорая ${r.amb}; операций решено ${r.decided}, сделано ${r.done} (в срок ${r.onTime}, поздно ${r.late}); ` +
          `осложнённая стадия ${r.complicated} (из них в больнице ${r.waited}), осложнений ${r.complications}, умерли в стационаре ${r.died}; ` +
          `ожидание стола — медиана ${r.waitMed} мин, дольше всех ${r.waitMax}; операционная занята ${r.busy} %`,
      );
    }
  }
  const sum = (k: keyof DayRow) => all.reduce((a, r) => a + (r[k] as number), 0);
  const n = all.length;
  console.log(
    `  в сутки в среднем: хирургия и травма ${((sum('walk') + sum('amb')) / n).toFixed(1)} (скорая ${(sum('amb') / n).toFixed(1)}); ` +
      `операций ${(sum('done') / n).toFixed(1)}, в срок ${sum('onTime')} из ${sum('onTime') + sum('late')}; осложнённая стадия ${sum('complicated')}, ` +
      `осложнений ${sum('complications')}; ожидание стола — медиана по суткам ${median(all.map(r => r.waitMed))} мин, дольше всех ${Math.max(0, ...all.map(r => r.waitMax))}`,
  );
}
