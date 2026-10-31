// Проба к части 2 «Персонала в движении» (docs/specs/2026-10-staff-motion.md, «Часть 2. Обход»): сколько времени занимает
// утренний обход, если он стоит времени врача (решение владельца 27.10.2026, #166), — с 0.55.0 по обходу самого движка.
//
// Готовая больница без игрока, поток от больницы — как у симулятора экономики. Каждое утро в 08:30 для каждого нанятого врача
// в смене: сколько лежащих он ведёт и у скольких из них на обходе решение (выписка, хуже, реакция на лечение —
// `needsDecision`); потом — обходы движка за утро (`s.rounds.on`): когда ушёл, у скольких коек был, сколько минут игры занял;
// у клинической медсестры (`--clinical` — она на дневном месте медсестры в каждом помещении с койками, где бывает) — так же. И
// сколько больных ждёт приёма в 08:30, 09:00, 09:30 и 10:00.
//
// bun tools/bench/rounds.ts [--days 7] [--hospital city|poly] [--seed 3] [--clinical]
import { hospitalOf } from '../../src/engine/hospital/site';
import { siteOfPlan } from '../../src/engine/hospital/site-plan';
import { siteOfPreset } from '../../src/engine/hospital/site-preset';
import { presetStaff, salaryOf, type StaffMember, withNightShift } from '../../src/engine/hospital/staff';
import { apply, colleaguesOf, inpatientsOf, newFlowShift } from '../../src/engine/shift/engine';
import { startCash } from '../../src/engine/shift/money';
import { CLINICAL, needsDecision } from '../../src/engine/shift/rounds';
import { DAY, type Round } from '../../src/engine/shift/types';
import { buildDb } from '../content/load';

const arg = (k: string, d: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const days = Number(arg('days', '7'));
const which = arg('hospital', 'city');
const seed = Number(arg('seed', '3'));
const clinical = process.argv.includes('--clinical');
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
// клиническая медсестра на дневном месте медсестры в помещениях с койками (решение владельца #183, вариант 2) — с начала
if (clinical) {
  const types = new Map((s.hospital?.rooms ?? []).map(r => [r.id, r.type] as const));
  s.staff = (s.staff ?? []).map(m =>
    m.shift === 'day' && m.role === 'role.nurse' && m.room !== undefined && db.roles[CLINICAL].rooms.includes(types.get(m.room) ?? '')
      ? { ...m, role: CLINICAL, salary: salaryOf(db, CLINICAL, m.skill) }
      : m,
  );
}
const to = (t: number) => {
  while (s.t < t) apply(db, s, { kind: 'advance', seconds: Math.min(600, t - s.t) });
};

const waiting = () => Object.values(s.patients).filter(p => p.status === 'waiting').length;
const q = (a: readonly number[], k: number) => {
  const b = [...a].sort((x, y) => x - y);
  return b[Math.min(b.length - 1, Math.floor(k * b.length))] ?? 0;
};
const hhmm = (t: number) => `${String(Math.floor((t % DAY) / 3600)).padStart(2, '0')}:${String(Math.floor((t % 3600) / 60)).padStart(2, '0')}`;

console.log(`${which}, зерно ${seed}, у койки ${db.economy.staff.round?.bed ?? '—'} мин${clinical ? ', клиническая медсестра в каждом помещении с койками' : ''}`);
const docMin: number[] = [];
const nurseMin: number[] = [];
let docs = 0;
let lying = 0;
let decide = 0;
let most = 0;
let beds = 0;
for (let d = 0; d < days; d++) {
  const at = t0 + d * DAY + 30 * 60; // 08:30
  to(at - 60);
  const all = inpatientsOf(s);
  const lines = colleaguesOf(db, s, at).flatMap((m: StaffMember) => {
    const mine = all.filter(p => p.closed?.by === m.id);
    if (mine.length === 0) return [];
    docs++;
    lying += mine.length;
    const need = mine.filter(p => needsDecision(p, s.day)).length;
    decide += need;
    most = Math.max(most, mine.length);
    return [`  ${m.role.replace('role.', '')} ${m.id}: лежат ${mine.length}, решение у ${need}`];
  });
  const w = [waiting()];
  for (const min of [30, 60, 90]) {
    to(at + min * 60);
    w.push(waiting());
  }
  // обходы утра — по часам движка: дождаться, пока все кончатся
  to(at + 4 * 3600);
  const on: Round[] = s.rounds?.day === s.day ? s.rounds.on : [];
  for (const r of on) {
    const min = Math.round((r.until - r.from) / 60);
    (r.nurse ? nurseMin : docMin).push(min);
    if (!r.nurse) beds += r.stops.length;
    const m = s.staff?.find(x => x.id === r.by);
    lines.push(`  обход ${r.nurse ? 'клинической медсестры' : m?.role.replace('role.', '')} ${r.by}: ${hhmm(r.from)}–${hhmm(r.until)}, ${min} мин, коек ${r.stops.length}`);
  }
  console.log(`сутки ${d + 1}: лежат ${all.length}, ваших ${all.filter(p => !p.closed?.by).length}; ждут приёма в 08:30, 09:00, 09:30, 10:00 — ${w.join(', ')}`);
  for (const l of lines) console.log(l);
}
const med = (a: number[]) => (a.length ? `медиана ${q(a, 0.5)}, p90 ${q(a, 0.9)}, больше всего ${Math.max(...a)}` : 'нет');
console.log(`врачей с лежащими по утрам: ${docs}; лежащих на врача ${(lying / Math.max(1, docs)).toFixed(1)}, больше всего ${most}; с решением ${(decide / Math.max(1, docs)).toFixed(1)}`);
console.log(`обход врача, мин: ${med(docMin)}; обходов ${docMin.length}, коек на обход ${(beds / Math.max(1, docMin.length)).toFixed(1)}`);
console.log(`обход клинической медсестры, мин: ${med(nurseMin)}; обходов ${nurseMin.length}`);
