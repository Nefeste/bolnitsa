// Проба к части 2 «Персонала в движении» (docs/specs/2026-10-staff-motion.md, «Часть 2. Обход»): сколько времени займёт
// утренний обход, если он стоит времени врача (решение владельца 27.10.2026, #166).
//
// Готовая больница без игрока, поток от больницы — как у tools/bench/state.ts. Каждое утро в 08:30 для каждого нанятого
// врача в смене: сколько лежащих он ведёт, у скольких на обходе решение (выписка, хуже, реакция на лечение — `wardState`) и
// сколько минут игры займёт обход: из кабинета к ближней палате, от неё — к ближней из оставшихся, назад в кабинет — пешком,
// как ходят люди (`walkPc`), у каждой койки `--bed` минут. Второе число — врач идёт только к тем, кому нужно решение: так
// было бы, если остальных обходит клиническая медсестра палаты. И сколько больных ждёт приёма в 08:30–10:00.
//
// bun tools/bench/rounds.ts [--days 7] [--hospital city|poly] [--seed 3] [--bed 3]
import { hospitalOf } from '../../src/engine/hospital/site';
import { siteOfPlan } from '../../src/engine/hospital/site-plan';
import { siteOfPreset } from '../../src/engine/hospital/site-preset';
import { presetStaff, type StaffMember, withNightShift } from '../../src/engine/hospital/staff';
import type { Plan } from '../../src/engine/hospital/build';
import { apply, colleaguesOf, hospitalCtx, inpatientsOf, newFlowShift } from '../../src/engine/shift/engine';
import { startCash } from '../../src/engine/shift/money';
import { DAY, type ShiftPatient } from '../../src/engine/shift/types';
import { walkPc } from '../../src/engine/shift/walking';
import { daysIn, wardState } from '../../src/engine/shift/ward';
import { buildDb } from '../content/load';

const arg = (k: string, d: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const days = Number(arg('days', '7'));
const which = arg('hospital', 'city');
const seed = Number(arg('seed', '3'));
const BED = Number(arg('bed', '3'));
const { db } = buildDb();

/** Больница как у симулятора экономики (tools/sim/economy.ts): ночная смена, касса начала. */
function start() {
  const flow = { perHour: 0, auto: true as const };
  if (which === 'poly') {
    const p = siteOfPlan(db, db.sites!['site.polyclinic']);
    if (!p.ok) throw new Error(`поликлиника: помещение ${p.room} — ${p.error.kind}`);
    return newFlowShift(db, { seed, season: 'winter', hospital: hospitalOf(db, p.site), staff: withNightShift(db, p.site.rooms, p.staff), flow, economy: { cash: startCash(db, 'poly') } });
  }
  const rec = db.presets['preset.city'];
  const site = siteOfPreset(db, rec);
  return newFlowShift(db, { seed, season: 'winter', hospital: hospitalOf(db, site), staff: withNightShift(db, site.rooms, presetStaff(db, rec)), flow, economy: { cash: startCash(db, 'preset') } });
}

const s = start();
const t0 = s.t;
const to = (t: number) => {
  while (s.t < t) apply(db, s, { kind: 'advance', seconds: Math.min(600, t - s.t) });
};

/** Минут игры на обход коек `beds` из кабинета `office`: к ближней палате, от неё — к ближней из оставшихся, назад. */
function roundMin(plan: Plan, office: string | undefined, beds: readonly ShiftPatient[]): number {
  if (beds.length === 0) return 0;
  const left = new Set(beds.map(p => p.stay!.room));
  let at = office;
  let walk = 0;
  while (left.size) {
    let best = '';
    let d = Number.POSITIVE_INFINITY;
    for (const r of left) {
      const w = walkPc(plan, at, r);
      if (w < d) {
        d = w;
        best = r;
      }
    }
    walk += d;
    at = best;
    left.delete(best);
  }
  walk += walkPc(plan, at, office);
  return walk / 60 + BED * beds.length;
}

/** На обходе решение: лежит сутки и больше, операции не ждёт, и можно выписывать, хуже или реакция. */
function needs(p: ShiftPatient): boolean {
  const stay = p.stay!;
  const n = daysIn(stay, s.day);
  if (n < 1 || (stay.op && !stay.op.done)) return false;
  const w = wardState(stay, n);
  return w === 'ready' || w === 'worse' || w === 'reaction';
}

const waiting = () => Object.values(s.patients).filter(p => p.status === 'waiting').length;
const q = (a: readonly number[], k: number) => {
  const b = [...a].sort((x, y) => x - y);
  return b[Math.min(b.length - 1, Math.floor(k * b.length))] ?? 0;
};

console.log(`${which}, зерно ${seed}, у койки ${BED} мин`);
const full: number[] = [];
const only: number[] = [];
let docs = 0;
let lying = 0;
let decide = 0;
let most = 0;
for (let d = 1; d <= days; d++) {
  const morning = t0 + d * DAY; // 08:00 следующих суток
  to(morning + 30 * 60);
  const plan = hospitalCtx(db, s).plan;
  const all = inpatientsOf(s);
  const rows = colleaguesOf(db, s).flatMap((m: StaffMember) => {
    const mine = all.filter(p => p.closed?.by === m.id);
    if (mine.length === 0) return [];
    const need = mine.filter(needs);
    const a = roundMin(plan, m.room, mine);
    const b = roundMin(plan, m.room, need);
    full.push(a);
    only.push(b);
    docs++;
    lying += mine.length;
    decide += need.length;
    most = Math.max(most, mine.length);
    return [`  ${m.role.replace('role.', '')} ${m.id}: лежат ${mine.length}, решение у ${need.length}; обход ${a.toFixed(0)} мин, только к решениям ${b.toFixed(0)}`];
  });
  const w = [waiting()];
  for (const min of [60, 90, 120]) {
    to(morning + min * 60);
    w.push(waiting());
  }
  console.log(`сутки ${d + 1}: лежат ${all.length}, ваших ${all.filter(p => !p.closed?.by).length}; ждут приёма в 08:30, 09:00, 09:30, 10:00 — ${w.join(', ')}`);
  for (const r of rows) console.log(r);
}
const med = (a: number[]) => `медиана ${q(a, 0.5).toFixed(0)}, p90 ${q(a, 0.9).toFixed(0)}, больше всего ${Math.max(0, ...a).toFixed(0)}`;
console.log(`врачей с лежащими по утрам: ${docs}; лежащих на врача ${(lying / Math.max(1, docs)).toFixed(1)}, больше всего ${most}; с решением ${(decide / Math.max(1, docs)).toFixed(1)}`);
console.log(`обход врача, мин: ${med(full)}`);
console.log(`врач только к решениям, мин: ${med(only)}`);
