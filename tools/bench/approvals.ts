// «Главврач утверждает» (spec docs/specs/2026-10-two-ways.md, F3, «Числа»): сколько решений нанятых врачей приходит главврачу
// на утверждение и сколько из них неверных — в потоке для ПК, на больницах бенчмарка (как tools/bench/consults.ts:
// кабинетов — нагрузка / 1,5, приток — 1,4 × нагрузка в час, со смотровой приёмного и скорой; терапевты по навыку — по весам
// кандидатов), день 08:00–20:00. Главврач отвечает «Согласен» на всё сразу (на просьбы — «пусть решает сам») или молчит до
// срока; рядом — та же больница с галочками по умолчанию: врачи не должны простаивать.
//
// bun tools/bench/approvals.ts                                   — галочки роли «Главврач»: «не уверен», «долгий случай»,
//                                                                  «ниже 90 %»; «Согласен» на всё
// bun tools/bench/approvals.ts --rules below90 --answer silent   — только «ниже 90 %», главврач молчит
// bun tools/bench/approvals.ts --rules every                     — каждое решение
// bun tools/bench/approvals.ts --load 50,100,200 --seeds 1,2,3,4 — нагрузки и зёрна
import { hospitalFor } from './hospital';
import type { ContentDb } from '../../src/content/types';
import type { StaffMember } from '../../src/engine/hospital/staff';
import { apply, newFlowShift } from '../../src/engine/shift/engine';
import type { AskRule, ShiftState } from '../../src/engine/shift/types';
import { buildDb } from '../content/load';

const arg = (name: string, def: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
};
const LOADS = arg('load', '50,100,200').split(',').map(Number);
const SEEDS = arg('seeds', '1,2,3,4').split(',').map(Number);
const RULES = arg('rules', 'unsure,long,below90').split(',').filter(Boolean) as AskRule[];
const ANSWER = arg('answer', 'agree') as 'agree' | 'silent';
/** Часов приёма — с 08:00 до 20:00. */
const HOURS = 12;

const built = buildDb();
if (built.errors.length) {
  console.error(built.errors.join('\n'));
  process.exit(1);
}
const db: ContentDb = built.db;

const PHI = (Math.sqrt(5) - 1) / 2;
/** Навык терапевтов — по весам кандидатов, вперемешку по кабинетам (как tools/bench/consults.ts). */
function skilled(staff: StaffMember[]): StaffMember[] {
  const w = db.economy.staff.skills;
  const total = w.reduce((a, b) => a + b, 0);
  let k = 0;
  const skillAt = (x: number) => {
    let left = x * total;
    for (let i = 0; i < w.length; i++) if ((left -= w[i]) < 0) return i + 1;
    return w.length;
  };
  return staff.map(m => (m.role === 'role.therapist' ? { ...m, skill: skillAt((++k * PHI) % 1) } : m));
}

interface Day {
  /** приёмов нанятых врачей закрыто; из них неверных */
  seen: number;
  wrong: number;
  /** решений пришло на утверждение; неверных среди них; просьб «Просят посмотреть» */
  asked: number;
  wrongAsked: number;
  consults: number;
  /** ушли, не дождавшись; самое большее решений на утверждении сразу */
  left: number;
  open: number;
}

function day(load: number, seed: number, rules: readonly AskRule[] | undefined): Day {
  const layout = hospitalFor(db, Math.ceil(load / 1.5), 100, { emergency: true });
  const s: ShiftState = newFlowShift(db, {
    seed, season: 'winter', hospital: layout.hospital, staff: skilled(layout.staff), flow: { perHour: Math.round(1.4 * load), ambulancePerHour: Math.max(1, Math.round(load / 50)) },
  });
  if (rules) apply(db, s, { kind: 'asks', rules: [...rules] });
  const out: Day = { seen: 0, wrong: 0, asked: 0, wrongAsked: 0, consults: 0, left: 0, open: 0 };
  while (s.t < 20 * 3600) {
    for (const n of apply(db, s, { kind: 'advance', seconds: 60 })) {
      // просьба «не уверен» — сразу «пусть решает сам»: врач не ждёт ответа у себя в кабинете, решение придёт на утверждение
      if (n.kind === 'consult') {
        out.consults++;
        if (ANSWER === 'agree') apply(db, s, { kind: 'consult', id: n.id, answer: 'self' });
      }
      // «Согласен» сразу — как в спецификации; молчит — решение врача в силе к сроку
      if (n.kind === 'approve' && ANSWER === 'agree') apply(db, s, { kind: 'approve', id: n.id, answer: 'agree' });
    }
    out.open = Math.max(out.open, Object.values(s.patients).filter(p => p.approve).length);
  }
  for (const c of Object.values(s.summary.colleagues ?? {})) {
    out.seen += c.seen;
    out.wrong += c.wrong;
  }
  const chief = s.summary.chief;
  out.asked = (chief?.asked ?? 0) - (chief?.discharges ?? 0);
  out.wrongAsked = (chief?.wrong?.agreed ?? 0) + (chief?.wrong?.silent ?? 0) + (chief?.wrong?.changed ?? 0);
  out.left = s.summary.left;
  return out;
}

const pct = (a: number, b: number) => (b > 0 ? `${((100 * a) / b).toFixed(1)} %` : '—');
const sum = (xs: Day[], k: keyof Day) => xs.reduce((a, x) => a + x[k], 0);

console.log(`галочки: ${RULES.join(', ') || 'ни о чём'}; главврач: ${ANSWER === 'agree' ? '«Согласен» на всё сразу' : 'молчит до срока'}; зёрна ${SEEDS.join(', ')}`);
console.log('| больных в час | приёмов | на утверждение | в час | неверных среди них | неверных без вопроса | просьб | ушли (по умолчанию) | закрыто (по умолчанию) | сразу на утверждении |');
console.log('|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
const all: Day[] = [];
const base: Day[] = [];
for (const load of LOADS) {
  const days = SEEDS.map(seed => day(load, seed, RULES));
  const plain = SEEDS.map(seed => day(load, seed, undefined));
  all.push(...days);
  base.push(...plain);
  const seen = sum(days, 'seen');
  const asked = sum(days, 'asked');
  const wrongAsked = sum(days, 'wrongAsked');
  console.log(
    `| ${Math.round(1.4 * load)} | ${seen} | ${asked} (${pct(asked, seen)}) | ${(asked / SEEDS.length / HOURS).toFixed(1)} | ${wrongAsked} (${pct(wrongAsked, asked)}) | ${sum(days, 'wrong') - wrongAsked} (${pct(sum(days, 'wrong') - wrongAsked, seen - asked)}) | ${sum(days, 'consults')} | ${sum(days, 'left')} (${sum(plain, 'left')}) | ${seen} (${sum(plain, 'seen')}) | ${Math.max(...days.map(d => d.open))} |`,
  );
}
const seen = sum(all, 'seen');
const asked = sum(all, 'asked');
console.log(`\nвсего: ${seen} приёмов, на утверждение ${asked} (${pct(asked, seen)}), неверных среди них ${pct(sum(all, 'wrongAsked'), asked)}, без вопроса — ${pct(sum(all, 'wrong') - sum(all, 'wrongAsked'), seen - asked)}; по умолчанию закрыто ${sum(base, 'seen')}, ушли ${sum(base, 'left')}, с галочками — ${sum(all, 'left')}`);
