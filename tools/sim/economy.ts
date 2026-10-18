// Симулятор экономики больницы ПК (spec docs/specs/2026-10-economy.md, «Симулятор экономики»; идея — `npm run economy-sim`
// «Анамнеза», его tools/sim/economy.ts): больница по сценарию живёт 7 суток в потоке для ПК с кассой и потоком от больницы;
// врача никто не играет — все случаи ведут нанятые врачи. Больницы:
//   clinic   — пустое здание: шесть помещений прототипа (как в сценарии в браузере) и санузел, построены в 08:00 первых суток;
//   district — пустое здание: районная — три терапевта, доврачебный, ЭКГ, рентген, смотровая приёмного, две палаты, санузел;
//   city     — готовая городская больница (как «Городская больница» в окне);
//   poly     — поликлиника по нормам проектирования из готовых помещений (как «Поликлиника» в окне, spec
//              2026-10-real-hospital): ваш кабинет пустует — врача никто не играет, принимают три нанятых терапевта.
// Критерии: касса ни разу не ниже предела минуса (кредит не нужен); за 7 суток больница не окупается целиком — не богатеет
// нелепо; поток за сутки — в ориентирах геймдизайна §5.
//   bun tools/sim/economy.ts [--days 7] [--seeds 1,2,3] [--only clinic,district,city,poly] [--json]
import type { ContentDb, Id } from '../../src/content/types';
import { expensesOf, incomeOf } from '../../src/engine/economy/economy';
import { DOOR_PRICE, emptySite, hospitalOf, priceOf, roomPrice, type Site, type SiteCommand } from '../../src/engine/hospital/site';
import { siteOfPlan } from '../../src/engine/hospital/site-plan';
import { siteOfPreset } from '../../src/engine/hospital/site-preset';
import { presetStaff } from '../../src/engine/hospital/staff';
import { apply, capacityOf, newFlowShift } from '../../src/engine/shift/engine';
import { ambulancePerHour, walkPerHour } from '../../src/engine/shift/inflow';
import { cashNow, startCash } from '../../src/engine/shift/money';
import type { ShiftState } from '../../src/engine/shift/types';
import { buildDb } from '../content/load';

const arg = (name: string, def: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
};
const DAYS = Number(arg('days', '7'));
const SEEDS = arg('seeds', '1,2,3').split(',').map(Number);
const ONLY = arg('only', '').split(',').filter(Boolean);
const asJson = process.argv.includes('--json');

const { db, errors } = buildDb();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

/** Помещение по плану: тип, прямоугольник со стенами, дверь — `door` клеток посередине верхней (`top`) или нижней стены. */
type Spec = [type: Id, x: number, y: number, w: number, h: number, side: 'top' | 'bottom'];

/** Шесть помещений прототипа — как в сценарии в браузере (tools/app/e2e.mjs, PROTO) — и санузел рядом. */
const CLINIC: Spec[] = [
  ['room.reception', 6, 6, 6, 7, 'bottom'],
  ['room.waiting', 11, 6, 9, 7, 'bottom'],
  ['room.office', 19, 6, 8, 7, 'bottom'],
  ['room.staff', 26, 6, 6, 7, 'bottom'],
  ['room.procedure', 31, 6, 6, 7, 'bottom'],
  ['room.lab', 36, 6, 6, 7, 'bottom'],
  ['room.toilet', 41, 6, 6, 7, 'bottom'],
];

/** Районная: ряд прототипа и ЭКГ у северной стены; средний ряд — кабинеты, доврачебный, вторая зона ожидания, рентген, палаты; смотровая — у входа скорой. */
const DISTRICT: Spec[] = [
  ...CLINIC,
  ['room.ecg', 46, 6, 6, 7, 'bottom'],
  ['room.office', 6, 15, 8, 7, 'top'],
  ['room.office', 13, 15, 8, 7, 'top'],
  ['room.triage', 20, 15, 6, 7, 'top'],
  ['room.waiting', 25, 15, 6, 7, 'top'],
  ['room.xray', 30, 15, 8, 7, 'top'],
  ['room.ward', 37, 15, 7, 7, 'top'],
  ['room.ward', 43, 15, 7, 7, 'top'],
  ['room.emergency', 44, 27, 7, 6, 'top'],
];

/** Нужна ли помещению двойная дверь: в его образцах лежат (как в стройке, часть 2б) — палаты, рентген, смотровая. */
const DOUBLE = new Set(['room.ward', 'room.xray', 'room.emergency', 'room.icu', 'room.ricu', 'room.box', 'room.ct', 'room.mri', 'room.or']);

function site(s: ShiftState, cmd: SiteCommand): string | undefined {
  const out = apply(db, s, { kind: 'site', cmd });
  const n = out.find(x => x.kind === 'site');
  if (!n || n.kind !== 'site' || !n.ok) throw new Error(`стройка: ${JSON.stringify(cmd)} — ${JSON.stringify(n)}`);
  return n.room;
}

/** Построить по плану: протянуть, обставить, дверь посередине стены к коридору, люди на все должности; «Готово». */
function build(s: ShiftState, plan: Spec[]) {
  for (const [type, x, y, w, h, side] of plan) {
    const id = site(s, { kind: 'room', type, x, y, w, h })!;
    site(s, { kind: 'furnish', room: id });
    const mid = x + Math.floor(w / 2);
    const wy = side === 'top' ? y : y + h - 1;
    site(s, { kind: 'door', room: id, cells: DOUBLE.has(type) ? [[mid - 1, wy], [mid, wy]] : [[mid, wy]] });
    for (const role of db.rooms[type].staff) site(s, { kind: 'hire', room: id, role });
  }
  apply(db, s, { kind: 'site', cmd: { kind: 'done' } });
}

/** Сколько стоила бы больница сейчас: помещения, мебель, аппараты, двери. */
function valueOf(st: Site): number {
  let v = 0;
  for (const r of st.rooms) {
    v += roomPrice(db, r.type, r.w, r.h) + (r.door ? (DOOR_PRICE[r.door.length] ?? 0) : 0);
    for (const i of r.items) v += priceOf(db, i.kind, i.eq);
  }
  return v;
}

interface DayRow {
  day: number; cash: number; income: number; expenses: number; works: number; rep: number; score?: number;
  arrived: number; ambulance: number; seen: number; left: number; died: number; lying: number; flowWalk: number; flowAmb: number;
}
interface Run {
  scenario: string; seed: number; start: number; value: number; minCash: number; profit: number; days: DayRow[];
  lines: Record<string, number>;
}

function start(name: string, seed: number): ShiftState {
  const flow = { perHour: 0, auto: true as const };
  if (name === 'city') {
    const rec = db.presets['preset.city'];
    return newFlowShift(db, { seed, season: 'winter', hospital: hospitalOf(db, siteOfPreset(db, rec)), staff: presetStaff(db, rec), flow, economy: { cash: startCash(db, 'preset') } });
  }
  if (name === 'poly') {
    const p = siteOfPlan(db, db.sites!['site.polyclinic']);
    if (!p.ok) throw new Error(`поликлиника: помещение ${p.room} — ${p.error.kind}`);
    return newFlowShift(db, { seed, season: 'winter', hospital: hospitalOf(db, p.site), staff: p.staff, flow, economy: { cash: startCash(db, 'poly') } });
  }
  const s = newFlowShift(db, { seed, season: 'winter', hospital: hospitalOf(db, emptySite()), staff: [], flow, economy: { cash: startCash(db, 'empty') } });
  build(s, name === 'clinic' ? CLINIC : DISTRICT);
  return s;
}

function run(name: string, seed: number): Run {
  const s = start(name, seed);
  const first = s.economy!.cash;
  const value = valueOf(s.hospital!.site!);
  let minCash = cashNow(s)!;
  const lines: Record<string, number> = {};
  const end = (DAYS * 24 + 8) * 3600;
  while (s.t < end) {
    apply(db, s, { kind: 'advance', seconds: 300 });
    minCash = Math.min(minCash, cashNow(s)!);
  }
  const days = s.history.map((d): DayRow => {
    const e = d.economy!;
    const col = Object.values(d.colleagues ?? {});
    for (const [k, v] of Object.entries(e.ledger.income)) lines[k] = (lines[k] ?? 0) + v;
    lines.ward = (lines.ward ?? 0) + (e.ledger.ward?.income ?? 0);
    for (const [k, v] of Object.entries(e.ledger.expenses)) lines[`−${k}`] = (lines[`−${k}`] ?? 0) + (v ?? 0);
    lines.cut = (lines.cut ?? 0) + e.ledger.audit.cut;
    return {
      day: d.day, cash: e.cash, income: incomeOf(e.ledger), expenses: expensesOf(e.ledger), works: e.ledger.expenses.works ?? 0, rep: e.reputation.to, score: e.reputation.score,
      arrived: d.arrived, ambulance: d.ambulance?.arrived ?? 0, seen: col.reduce((n, c) => n + c.seen, d.seen), left: d.left, died: d.ward?.died ?? 0, lying: d.ward?.lying ?? 0,
      flowWalk: 0, flowAmb: 0,
    };
  });
  // поток от больницы сейчас — в среднем в сутки при часах по умолчанию
  const c = capacityOf(db, s);
  const hours = db.day!.walk.slice(db.day!.hours[0], db.day!.hours[1]).reduce((a, b) => a + b, 0) / 100;
  for (const d of days) {
    d.flowWalk = Math.round(walkPerHour(db, c, d.rep) * hours);
    d.flowAmb = Math.round(ambulancePerHour(db, c) * 24);
  }
  // прибыль — без стройки первых суток: сколько больница зарабатывает, когда построена
  const profit = days.reduce((n, d, i) => n + d.income - d.expenses + (i === 0 ? d.works : 0), 0);
  return { scenario: name, seed, start: first, value, minCash, profit, days, lines };
}

const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU');
const scenarios = ['clinic', 'district', 'city', 'poly'].filter(x => ONLY.length === 0 || ONLY.includes(x));
const runs: Run[] = [];
for (const name of scenarios) for (const seed of SEEDS) runs.push(run(name, seed));

if (asJson) {
  console.log(JSON.stringify(runs, null, 1));
} else {
  const limit = db.money?.overdraft ?? 0;
  let fails = 0;
  for (const name of scenarios) {
    const rs = runs.filter(r => r.scenario === name);
    console.log(`\n## ${name}: касса в начале ${fmt(rs[0].start)} ₽, больница стоит ${fmt(rs[0].value)} ₽`);
    for (const r of rs) {
      console.log(`  зерно ${r.seed}: касса не ниже ${fmt(r.minCash)}, прибыль за ${DAYS} сут. без стройки ${fmt(r.profit)} ₽`);
      for (const d of r.days) {
        console.log(`    сутки ${d.day}: пришли ${d.arrived} (скорая ${d.ambulance}; поток ${d.flowWalk}+${d.flowAmb}), приняты ${d.seen}, ушли ${d.left}, умерли ${d.died}, лежат ${d.lying} · доходы ${fmt(d.income)}, расходы ${fmt(d.expenses)}${d.works ? ` (стройка ${fmt(d.works)})` : ''} · касса ${fmt(d.cash)} · репутация ${d.rep}${d.score !== undefined ? ` (оценка ${d.score})` : ''}`);
      }
      const lines = Object.entries(r.lines).filter(([, v]) => v !== 0).map(([k, v]) => `${k} ${fmt(v)}`).join(', ');
      console.log(`    за ${DAYS} сут.: ${lines}`);
    }
    const low = rs.filter(r => r.minCash < -limit);
    const rich = rs.filter(r => r.profit > r.value);
    if (low.length) console.log(`  ✗ касса ниже предела (−${fmt(limit)}): зёрна ${low.map(r => r.seed).join(', ')}`);
    else console.log(`  ✓ касса ни разу не ниже предела −${fmt(limit)} ₽`);
    if (rich.length) console.log(`  ✗ окупилась за ${DAYS} суток: зёрна ${rich.map(r => r.seed).join(', ')}`);
    else console.log(`  ✓ за ${DAYS} суток не окупается целиком: прибыль ${rs.map(r => fmt(r.profit)).join(' / ')} при цене ${fmt(rs[0].value)}`);
    fails += low.length + rich.length;
  }
  if (fails) process.exitCode = 1;
}
