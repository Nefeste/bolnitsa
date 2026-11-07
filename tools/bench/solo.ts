// Проба к спецификации «Смена врача и случай дня» (docs/specs/2026-11-doctor-shift.md, «Замер»): дневная смена готовой
// больницы, где принимает один врач, — сколько больных придут к нему за смену, сколько он успеет принять и сколько уйдут, не
// дождавшись, — чтобы длина смены и пороги её итога опирались на числа «Больницы», а не на числа «Анамнеза».
//
// Больницы — готовые городская (`preset.city`) и поликлиника (`site.polyclinic`), как их открывает окно, со сменами.
// Принимает один: врачей кабинетов (терапевтов и специалистов) нет, в вашем кабинете — нанятый терапевт навыка 3, как у роли
// без своего кабинета (`startFor`): врача никто не играет. Медсёстры, лаборанты, рентген, УЗИ, хирурги — как есть. Поток от
// больницы при одном враче — на один кабинет и без записи к специалистам (`capacityOf`), скорая — по местам смотровой; так
// будет и в смене, где нанятые врачи не принимают. Считается за дневную смену первых суток, 08:00–20:00 (`--hours`):
// - пришли — сами, по записи, повторно и по скорой; ушли, не дождавшись; ждут врача в конце смены;
// - врач: принял, минут на приём — от того, как позвал, до решения, — средняя и медиана; ожидание врача — медиана и дольше всех.
//
// bun tools/bench/solo.ts [--seeds 1,2,3,4,5,6] [--hospital city,poly] [--manage calm,normal,hard] [--hours 12]
import type { ContentDb, Manage } from '../../src/content/types';
import { db as bundle } from '../../src/content';
import { DOCTOR } from '../../src/engine/hospital/requirements';
import { hospitalOf, type Site } from '../../src/engine/hospital/site';
import { siteOfPlan } from '../../src/engine/hospital/site-plan';
import { siteOfPreset } from '../../src/engine/hospital/site-preset';
import { presetStaff, type StaffMember, withNightShift } from '../../src/engine/hospital/staff';
import { apply, newFlowShift } from '../../src/engine/shift/engine';
import { startCash } from '../../src/engine/shift/money';
import type { ShiftState, VisitKind } from '../../src/engine/shift/types';
import { startFor } from '../../src/app/roles';

const arg = (name: string, def: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
};
const SEEDS = arg('seeds', '1,2,3,4,5,6').split(',').map(Number);
const HOSPITALS = arg('hospital', 'city,poly').split(',');
const LEVELS = arg('manage', 'normal').split(',') as Manage[];
const HOURS = Number(arg('hours', '12'));
const db: ContentDb = bundle;
const H = 3600;
const START = 8 * H;

/** Больница, как её открывает окно (`hospitalAt`, src/app/game.ts), но в вашем кабинете — нанятый терапевт, и он один. */
function hospital(name: string): { site: Site; staff: StaffMember[]; doctor: string } {
  const r =
    name === 'poly'
      ? (() => {
          const p = siteOfPlan(db, db.sites!['site.polyclinic']);
          if (!p.ok) throw new Error(`site.polyclinic: ${p.error.kind}`);
          return startFor(db, p.site, p.staff, 'manager');
        })()
      : startFor(db, siteOfPreset(db, db.presets[`preset.${name}`]), presetStaff(db, db.presets[`preset.${name}`]), 'manager');
  // нанятый в ваш кабинет — последний в списке (`startFor`); остальные врачи кабинетов сегодня не принимают — их нет
  const doctor = r.staff.at(-1)!;
  const staff = r.staff.filter(m => m === doctor || db.roles[m.role]?.stands !== DOCTOR);
  return { site: r.site, staff: withNightShift(db, r.site.rooms, staff), doctor: doctor.id };
}

interface Row {
  arrived: Record<VisitKind, number>;
  left: number;
  waiting: number;
  seen: number;
  minutes: number[];
  waits: number[];
}

function run(name: string, seed: number, manage: Manage): Row {
  const h = hospital(name);
  const s: ShiftState = newFlowShift(db, {
    seed, season: 'winter', hospital: hospitalOf(db, h.site), staff: h.staff, flow: { perHour: 0, auto: true },
    economy: { cash: startCash(db, 'preset', manage) }, manage,
  });
  apply(db, s, { kind: 'site', cmd: { kind: 'done' } });
  const end = START + HOURS * H;
  while (s.t < end) apply(db, s, { kind: 'advance', seconds: Math.min(300, end - s.t) });
  const arrived: Record<VisitKind, number> = { walkIn: 0, appointment: 0, return: 0, ambulance: 0 };
  const row: Row = { arrived, left: 0, waiting: 0, seen: 0, minutes: [], waits: [] };
  const seen = new Set<string>();
  const count = (p: { id: string; kind: VisitKind; arriveT: number; calledT?: number }) => {
    if (seen.has(p.id) || p.arriveT < START || p.arriveT >= end) return false;
    seen.add(p.id);
    arrived[p.kind]++;
    if (p.calledT !== undefined) row.waits.push(Math.round((p.calledT - p.arriveT) / 60));
    return true;
  };
  for (const g of s.gone ?? []) {
    if (!count(g)) continue;
    if (g.end === 'left') row.left++;
    if (g.end === 'done' && g.by === h.doctor) row.seen++;
  }
  for (const x of s.past ?? []) count(x.p);
  for (const p of Object.values(s.patients)) {
    if (!count(p)) continue;
    if (p.status === 'waiting' && p.calledT === undefined) row.waiting++;
    if (p.closed && p.closed.by === h.doctor) {
      row.seen++;
      if (p.calledT !== undefined) row.minutes.push(Math.round((p.closed.at - p.calledT) / 60));
    }
  }
  // минуты на приём — и у тех, кто уже ушёл: их карта в `past`
  for (const x of s.past ?? []) {
    const p = x.p;
    if (p.arriveT >= START && p.arriveT < end && p.closed?.by === h.doctor && p.calledT !== undefined) row.minutes.push(Math.round((p.closed.at - p.calledT) / 60));
  }
  return row;
}

const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : 0);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

for (const name of HOSPITALS) {
  for (const manage of LEVELS) {
    console.log(`\n## ${name}, «Управление» ${manage}: смена ${HOURS} ч с 08:00, зёрна ${SEEDS.join(', ')}`);
    const all: Row[] = [];
    for (const seed of SEEDS) {
      const r = run(name, seed, manage);
      all.push(r);
      const total = Object.values(r.arrived).reduce((a, b) => a + b, 0);
      console.log(
        `  зерно ${seed}: пришли ${total} (сами ${r.arrived.walkIn}, по записи ${r.arrived.appointment}, повторно ${r.arrived.return}, скорая ${r.arrived.ambulance}); ` +
          `принял ${r.seen}, ушли ${r.left}, ждут в конце ${r.waiting}; на приём — средняя ${mean(r.minutes).toFixed(0)} мин, медиана ${median(r.minutes)}; ` +
          `ожидание врача — медиана ${median(r.waits)} мин, дольше всех ${Math.max(0, ...r.waits)}`,
      );
    }
    const sum = (f: (r: Row) => number) => all.reduce((a, r) => a + f(r), 0) / all.length;
    const kinds = (k: VisitKind) => sum(r => r.arrived[k]);
    console.log(
      `  в среднем: пришли ${sum(r => Object.values(r.arrived).reduce((a, b) => a + b, 0)).toFixed(1)} (сами ${kinds('walkIn').toFixed(1)}, скорая ${kinds('ambulance').toFixed(1)}), ` +
        `принял ${sum(r => r.seen).toFixed(1)}, ушли ${sum(r => r.left).toFixed(1)}, ждут в конце ${sum(r => r.waiting).toFixed(1)}; ` +
        `на приём — медиана ${median(all.flatMap(r => r.minutes))} мин; ожидание — медиана ${median(all.flatMap(r => r.waits))} мин`,
    );
  }
}
