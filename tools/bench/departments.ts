// Проба к спецификации отделений (docs/specs/2026-10-departments.md, «Замер: как часто регистратор ошибается»): как часто
// регистратор, который знает только то, что видно у двери, направил бы пришедшего сам не в то отделение.
//
// Готовая городская больница (принимает терапию, хирургию, травму, инфекционное, неврологию), поток от больницы, день с
// 08:00 до 20:00. Для каждого пришедшего сам: вероятности болезней его отделений по одним жалобам (та же модель, что у
// врачей, — `posterior`), сложенные по отделениям; где больше — туда. С правдой сравнивается отделение его болезни.
// С `--vitals` — и по давлению, пульсу, температуре, как у медсестры доврачебного кабинета; с `--first` — по одной
// главной жалобе (первой), как в окошке регистратуры.
//
// bun tools/bench/departments.ts [--seeds 1,2,…,12] [--vitals] [--first] [--list]   (--list — кто направлен не туда)
import type { ContentDb, Id } from '../../src/content/types';
import { hospitalOf } from '../../src/engine/hospital/site';
import { siteOfPreset } from '../../src/engine/hospital/site-preset';
import { presetStaff, withNightShift } from '../../src/engine/hospital/staff';
import { complaintObservations, runExam } from '../../src/engine/med/exams';
import { contextOf, posterior } from '../../src/engine/med/infer';
import { primaryOf } from '../../src/engine/med/plan';
import { startCash } from '../../src/engine/shift/money';
import { apply, candidatesOf, newFlowShift } from '../../src/engine/shift/engine';
import type { ShiftPatient } from '../../src/engine/shift/types';
import { Rng } from '../../src/engine/core/rng';
import { buildDb } from '../content/load';

const arg = (name: string, def: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
};
const SEEDS = arg('seeds', '1,2,3,4,5,6,7,8,9,10,11,12').split(',').map(Number);
const VITALS = process.argv.includes('--vitals');
const FIRST = process.argv.includes('--first');
const LIST = process.argv.includes('--list');

const built = buildDb();
if (built.errors.length) {
  console.error(built.errors.join('\n'));
  process.exit(1);
}
const db: ContentDb = built.db;
const deptOf = (id: Id) => db.conditions[id].department;

/** Куда направил бы регистратор: отделение с наибольшей суммой вероятностей болезней по тому, что видно у двери; `top` — его доля. */
function routed(p: ShiftPatient, seed: number): { to: Id; top: number } {
  const obs = complaintObservations(p.patient).slice(0, FIRST ? 1 : undefined);
  if (VITALS) obs.push(...runExam(db, p.patient, 'exam.vitals', Rng.seeded(seed)));
  const candidates = candidatesOf(db, p.departments ?? 'dept.therapy');
  const sum = new Map<Id, number>();
  for (const b of posterior(db, candidates, obs, contextOf(db, p.patient, obs))) sum.set(deptOf(b.id), (sum.get(deptOf(b.id)) ?? 0) + b.p);
  let best = 'dept.therapy';
  let top = -1;
  for (const [d, x] of [...sum].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (x > top) {
      best = d;
      top = x;
    }
  }
  return { to: best, top };
}

const rows = new Map<string, number>();
const seen = new Map<string, ShiftPatient>();
/** все больные смены по тому, как пришли: сами, по записи, на скорой, повторно */
const kinds = new Map<string, Set<string>>();
for (const seed of SEEDS) {
  const rec = db.presets['preset.city'];
  const st = siteOfPreset(db, rec);
  const s = newFlowShift(db, { seed, season: 'winter', hospital: hospitalOf(db, st), staff: withNightShift(db, st.rooms, presetStaff(db, rec)), flow: { perHour: 0, auto: true }, economy: { cash: startCash(db, 'preset') } });
  while (s.t < 20 * 3600) {
    apply(db, s, { kind: 'advance', seconds: 300 });
    for (const p of Object.values(s.patients)) {
      if (!kinds.has(p.kind)) kinds.set(p.kind, new Set());
      kinds.get(p.kind)!.add(`${seed}:${p.id}`);
      if (p.kind === 'walkIn' && !seen.has(`${seed}:${p.id}`)) seen.set(`${seed}:${p.id}`, p);
    }
  }
}
let i = 0;
/** неуверенные: у выбранного отделения меньше 0,8 — сколько их и сколько из них направлено верно */
let unsure = 0;
let unsureRight = 0;
for (const p of seen.values()) {
  const truth = deptOf(primaryOf(p.patient).id);
  const { to, top } = routed(p, 1000 + i++);
  rows.set(`${truth}→${to}`, (rows.get(`${truth}→${to}`) ?? 0) + 1);
  if (LIST && to !== truth) console.log(`  не туда: ${primaryOf(p.patient).id} (${truth.slice(5)}) → ${to.slice(5)} ${Math.round(100 * top)} %; жалобы: ${p.patient.complaints.join(', ')}`);
  if (top < 0.8) {
    unsure++;
    if (to === truth) unsureRight++;
  }
}
const total = seen.size;
const right = [...rows].filter(([k]) => k.split('→')[0] === k.split('→')[1]).reduce((a, [, n]) => a + n, 0);
console.log(`пришли сами: ${total} (зёрна ${SEEDS.join(', ')}, до 20:00)${FIRST ? ', по одной главной жалобе' : ''}${VITALS ? ', с давлением, пульсом и температурой' : ''}; в своё отделение — ${right} (${Math.round((100 * right) / total)} %)`);
console.log(`  все больные до 20:00: ${[...kinds].map(([k, v]) => `${k} ${v.size}`).join(', ')}`);
console.log(`  неуверенных (у выбранного отделения меньше 0,8): ${unsure} (${Math.round((100 * unsure) / total)} %), из них верно — ${unsureRight}`);
const depts = [...new Set([...rows.keys()].map(k => k.split('→')[0]))].sort();
for (const d of depts) {
  const of = [...rows].filter(([k]) => k.startsWith(`${d}→`));
  const n = of.reduce((a, [, x]) => a + x, 0);
  const to = of.sort((a, b) => b[1] - a[1]).map(([k, x]) => `${k.split('→')[1].slice(5)} ${x}`).join(', ');
  console.log(`  ${d.slice(5)}: ${n} → ${to}`);
}
