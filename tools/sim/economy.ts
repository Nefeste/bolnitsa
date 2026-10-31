// Симулятор экономики больницы ПК (spec docs/specs/2026-10-economy.md, «Симулятор экономики»; идея — `npm run economy-sim`
// «Анамнеза», его tools/sim/economy.ts): больница по сценарию живёт 7 суток в потоке для ПК с кассой и потоком от больницы;
// врача никто не играет — все случаи ведут нанятые врачи. Больницы:
//   clinic   — пустое здание: шесть помещений прототипа (как в сценарии в браузере) и санузел, построены в 08:00 первых суток;
//   district — пустое здание: районная — три терапевта, доврачебный, ЭКГ, рентген, смотровая приёмного, две палаты, санузел;
//              со сменами (spec 2026-10-staff-shifts) — и ночная смена там, где работают ночью, и ночной терапевт, как у
//              готовой больницы;
//   city     — готовая городская больница (как «Городская больница» в окне) — с ночной сменой;
//   poly     — поликлиника по нормам проектирования из готовых помещений (как «Поликлиника» в окне, spec
//              2026-10-real-hospital): ваш кабинет пустует — врача никто не играет, принимают три нанятых терапевта;
//   polyspec — та же поликлиника, где два терапевта заменены гастроэнтерологом и эндокринологом (spec
//              2026-10-specialists): у специалистов своя запись, пришедших сами берёт один терапевт;
//   ambulatory — сценарий 1 «Амбулатория» (spec docs/specs/2026-10-scenario-1.md, часть 4): касса сценария, разумный игрок
//              строит в первые сутки все девять помещений его порядка стройки; ваш кабинет ведёт нанятый терапевт — вместо
//              вас, его зарплату у игрока не платят: она — отдельной строкой. Не меньше 10 суток; критерий — цель «Пять
//              суток с кассой в плюсе» выполнена к 10-м суткам («разумный игрок выходит в плюс к 10-м суткам»).
// Критерии: касса ни разу не ниже предела минуса (кредит не нужен); за 7 суток больница не окупается целиком — не богатеет
// нелепо; поток за сутки — в ориентирах геймдизайна §5. Персонал (spec docs/specs/2026-10-staff-mood.md): кто собирался уйти
// и кто ушёл сам, настроение в конце, кто вырос и сколько смен пропущено по болезни; с `--days 14` и больше — критерий: игрок
// ничего не делает, а за первые две недели уходят сами не больше двух. `--raise` — игрок на каждой планёрке поднимает зарплату
// тем, кто вырос и кто собирается уйти (как «Поднять зарплату» в строке планёрки): тогда уходят не больше двух за каждые две
// недели всего срока, а в отчёте — сколько раз поднимали и как выросли зарплаты за сутки. Каталка (spec
// docs/specs/2026-10-orderlies.md): сколько перевозок, сколько лежачие ждали её, сколько раз везла медсестра; `--no-orderly
// night` — готовая больница без ночных санитаров, `--no-orderly all` — без санитаров вовсе. Резерв (spec
// docs/specs/2026-10-staff-mood.md, часть 5): `--reserve registrar,nurse` — в начале по человеку в резерв на каждую должность
// списка; в отчёте — сколько раз резерв встал на место заболевшего и сколько смен места стояли пустыми.
// Утренний обход (spec docs/specs/2026-10-staff-motion.md, часть 2): сколько раз врачи и клинические медсёстры обходили, у
// скольких коек и сколько минут; ушедшие, пока их врач на обходе, — «round» в строке «ушли». `--clinical` — на дневном месте
// медсестры в каждом помещении с койками, где она бывает (палата, ПИТ, реанимация, бокс), с начала — клиническая медсестра;
// `--clinical ward` — только в палатах (список типов через запятую).
// `--hall N` — сидя или стоя по своему залу не дальше N м (content/hospital/inflow.yaml, `hall`); `--hall 0` — по всей больнице.
// `--bench N` — скамьи у дверей кабинетов не дальше N шагов (`bench`, spec docs/specs/2026-10-door-benches.md); `--bench 0` — без них.
// Ось «Управление» (spec docs/specs/2026-10-difficulty.md): `--manage calm,normal,hard` — каждая больница на каждом уровне;
// критерии уровней: «Спокойно» — ушли, не дождавшись, не больше 5 % пришедших, касса ни разу не ниже нуля, за 7 суток
// прибыль больше, чем на «Обычно»; «Обычно» — как выше; «Трудно» — ушли 10–20 %, касса не ниже предела минуса уровня, за
// 7 суток не окупается. Касса сценария 1 — его, на любом уровне; его цель к 10-м суткам — критерий только «Обычно».
//   bun tools/sim/economy.ts [--days 7] [--seeds 1,2,3] [--only clinic,district,city,poly,polyspec,ambulatory] [--hall N] [--bench N] [--raise]
//                            [--no-orderly night|all] [--reserve registrar,nurse] [--manage calm,normal,hard] [--clinical [ward,icu]] [--json]
import type { ContentDb, Id, Manage } from '../../src/content/types';
import { expensesOf, incomeOf } from '../../src/engine/economy/economy';
import { DOOR_PRICE, emptySite, hospitalOf, priceOf, roomPrice, type Site, type SiteCommand } from '../../src/engine/hospital/site';
import { siteOfPlan } from '../../src/engine/hospital/site-plan';
import { siteOfPreset } from '../../src/engine/hospital/site-preset';
import { nightHospital, presetStaff, salaryOf, type StaffMember, withNightShift } from '../../src/engine/hospital/staff';
import { apply, capacityOf, newFlowShift } from '../../src/engine/shift/engine';
import { CLINICAL } from '../../src/engine/shift/rounds';
import { ambulancePerHour, walkPerHour } from '../../src/engine/shift/inflow';
import { levelOf } from '../../src/engine/shift/manage';
import { cashNow, startCash } from '../../src/engine/shift/money';
import type { InflowDay, LeftBy, Ride, ShiftState, VisitKind } from '../../src/engine/shift/types';
import { buildDb } from '../content/load';

const arg = (name: string, def: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
};
const DAYS = Number(arg('days', '7'));
const SEEDS = arg('seeds', '1,2,3').split(',').map(Number);
const ONLY = arg('only', '').split(',').filter(Boolean);
const asJson = process.argv.includes('--json');
const RAISE = process.argv.includes('--raise');
/** `--clinical` — клиническая медсестра в каждое помещение с койками, где она бывает; `--clinical ward,icu` — только в эти */
const CLINICAL_AT = process.argv.indexOf('--clinical');
const CLINICAL_IN: string[] | undefined =
  CLINICAL_AT < 0 ? undefined
    : !process.argv[CLINICAL_AT + 1] || process.argv[CLINICAL_AT + 1].startsWith('--') ? []
      : process.argv[CLINICAL_AT + 1].split(',').map(r => (r.startsWith('room.') ? r : `room.${r}`));
const NO_ORDERLY = arg('no-orderly', '');
/** Уровни «Управления» (`--manage`): каждая больница — на каждом. */
const MANAGES = arg('manage', 'normal').split(',').filter((x): x is Manage => x === 'calm' || x === 'normal' || x === 'hard');
const LEVEL_NAME: Record<Manage, string> = { calm: 'Спокойно', normal: 'Обычно', hard: 'Трудно' };
/** Резерв (`--reserve`): должности — по человеку без места на каждую в начале. */
const RESERVE = arg('reserve', '').split(',').filter(Boolean).map(r => (r.startsWith('role.') ? r : `role.${r}`));
/** Готовая больница без ночных санитаров или без санитаров вовсе (`--no-orderly`). */
const orderlies = (staff: StaffMember[]) =>
  NO_ORDERLY ? staff.filter(m => m.role !== 'role.orderly' || (NO_ORDERLY === 'night' && m.shift !== 'night')) : staff;

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
// скамьи у дверей кабинетов (spec docs/specs/2026-10-door-benches.md): `--bench 0` — у дверей стоят, как до них
const BENCH = arg('bench', '');
if (BENCH !== '' && db.inflow) {
  if (Number(BENCH) > 0) db.inflow.bench = Number(BENCH);
  else delete db.inflow.bench;
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

/**
 * Сценарий 1 (часть 4): девять помещений его порядка стройки, по порядку — ряд прототипа с санузлом, ЭКГ рядом, доврачебный
 * — во втором ряду, как в районной.
 */
const AMBULATORY_SC = 'scenario.ambulatory';
const AMBULATORY: Spec[] = (db.scenarios?.[AMBULATORY_SC]?.guide ?? []).map(g => {
  const at = [...CLINIC, ...DISTRICT].find(x => x[0] === g.room);
  if (!at) throw new Error(`сценарий 1: где строить ${g.room} — нет в плане`);
  return at;
});

/** Нужна ли помещению двойная дверь: в его образцах лежат (как в стройке, часть 2б) — палаты, рентген, смотровая. */
const DOUBLE = new Set(['room.ward', 'room.xray', 'room.emergency', 'room.icu', 'room.ricu', 'room.box', 'room.ct', 'room.mri', 'room.or']);

function site(s: ShiftState, cmd: SiteCommand): string | undefined {
  const out = apply(db, s, { kind: 'site', cmd });
  const n = out.find(x => x.kind === 'site');
  if (!n || n.kind !== 'site' || !n.ok) throw new Error(`стройка: ${JSON.stringify(cmd)} — ${JSON.stringify(n)}`);
  return n.room;
}

/**
 * Построить по плану: протянуть, обставить, дверь посередине стены к коридору, люди на все должности; «Готово». Больница, где
 * лежат и куда везёт скорая, — со сменами (spec 2026-10-staff-shifts), как готовая: и ночная смена в помещениях, что работают
 * ночью, и ночной терапевт в первом кабинете.
 */
function build(s: ShiftState, plan: Spec[]) {
  const night = nightHospital(db, plan.map(([type]) => ({ type })));
  let office: string | undefined;
  for (const [type, x, y, w, h, side] of plan) {
    const id = site(s, { kind: 'room', type, x, y, w, h })!;
    site(s, { kind: 'furnish', room: id });
    const mid = x + Math.floor(w / 2);
    const wy = side === 'top' ? y : y + h - 1;
    site(s, { kind: 'door', room: id, cells: DOUBLE.has(type) ? [[mid - 1, wy], [mid, wy]] : [[mid, wy]] });
    const roles = db.rooms[type].staff;
    for (const role of roles) site(s, { kind: 'hire', room: id, role, shift: 'day' });
    if (night && db.rooms[type].night) for (const role of roles) site(s, { kind: 'hire', room: id, role, shift: 'night' });
    if (type === 'room.office') office ??= id;
  }
  if (night && office) site(s, { kind: 'hire', room: office, role: 'role.doctor', shift: 'night' });
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
  salaries: number;
  /** скорая: больше всего ждали у входа сразу; каталку ждали дольше порога планёрки — сколько раз и дольше всего, минут */
  door: number;
  gurney?: { n: number; wait: number };
  /**
   * «Почему?» у цифр планёрки (spec docs/specs/2026-10-why.md): пришли по виду, ушли по причинам; прогноз потока на эти
   * сутки — с планёрки, которой они начались (у первых суток его нет)
   */
  by: Partial<Record<VisitKind, number>>;
  why?: LeftBy;
  forecast?: InflowDay;
}
interface Run {
  /** `week` — прибыль за первые 7 суток без стройки: критерий «не окупается за 7 суток» и при `--days` больше 7 */
  scenario: string; manage: Manage; seed: number; start: number; value: number; minCash: number; profit: number; week: number; days: DayRow[];
  lines: Record<string, number>;
  /** персонал (spec 2026-10-staff-mood): собирались уйти и ушли сами — сутки, должность, причины; настроение в конце */
  quits: { day: number; role: Id }[];
  leaves: { day: number; role: Id; why: string[] }[];
  /** разделы 3–5: выросли (сутки, навык), смен пропущено по болезни */
  grew: { day: number; skill: number }[];
  /** кто болел: сутки и должность; резерв (часть 5) — на чьё место встал; смен без замены — места пустовали */
  sick: { day: number; role: Id }[];
  covered: { day: number; role: Id }[];
  bare: number;
  /** `--raise`: сколько раз игрок поднял зарплату */
  raised: number;
  /** каталка (spec docs/specs/2026-10-orderlies.md): перевозки — зачем, сколько ждали (минут), везла ли медсестра */
  rides: { why: Ride['why']; wait: number; nurse: boolean }[];
  /** утренние обходы (spec docs/specs/2026-10-staff-motion.md, часть 2): кто — врач или клиническая медсестра, коек, минут */
  rounds: { nurse: boolean; beds: number; min: number }[];
  /**
   * лежачие, кого некому было везти (решение владельца #99: не срочного медсестра не везёт): сколько их было, сколько ждут к
   * концу прогона и дольше всех, минут, — до выхода из очереди (повезли, выписали, умер) с точностью до шага прогона
   */
  stuck: { n: number; now: number; longest: number };
  moods: { n: number; low: number; min: number; mean: number; why: Record<string, number> };
  /**
   * сценарий 1 (часть 4): в какие сутки выполнены его цели (планёрка их записывает), зарплата терапевта вашего кабинета за
   * сутки — у игрока её нет
   */
  goals?: Record<string, number>;
  proxy?: number;
}

/**
 * `--clinical` (spec docs/specs/2026-10-staff-motion.md, часть 2б; решение владельца #183, вариант 2): на дневном месте
 * медсестры в помещениях с койками, где она бывает, — клиническая медсестра того же навыка, как если бы игрок с начала
 * нанял её вместо медсестры.
 */
function start(name: string, seed: number, manage: Manage): ShiftState {
  const s = startOf(name, seed, manage);
  if (!CLINICAL_IN) return s;
  const where = db.roles[CLINICAL].rooms.filter(t => CLINICAL_IN.length === 0 || CLINICAL_IN.includes(t));
  const types = new Map((s.hospital?.rooms ?? []).map(r => [r.id, r.type] as const));
  s.staff = (s.staff ?? []).map(m =>
    m.shift === 'day' && m.role === 'role.nurse' && m.room !== undefined && where.includes(types.get(m.room) ?? '')
      ? { ...m, role: CLINICAL, salary: salaryOf(db, CLINICAL, m.skill) }
      : m,
  );
  return s;
}

function startOf(name: string, seed: number, manage: Manage): ShiftState {
  const flow = { perHour: 0, auto: true as const };
  const level = manage === 'normal' ? {} : { manage };
  if (name === 'city') {
    const rec = db.presets['preset.city'];
    const st = siteOfPreset(db, rec);
    return newFlowShift(db, { seed, season: 'winter', hospital: hospitalOf(db, st), staff: orderlies(withNightShift(db, st.rooms, presetStaff(db, rec))), flow, economy: { cash: startCash(db, 'preset', manage) }, ...level });
  }
  if (name === 'poly' || name === 'polyspec') {
    const p = siteOfPlan(db, db.sites!['site.polyclinic']);
    if (!p.ok) throw new Error(`поликлиника: помещение ${p.room} — ${p.error.kind}`);
    // два терапевта — специалистами: в третьем и четвёртом кабинетах (r5, r6)
    const swap: Record<string, Id> = name === 'polyspec' ? { r5: 'role.gastroenterologist', r6: 'role.endocrinologist' } : {};
    const staff = p.staff.map(m => (m.room && swap[m.room] ? { ...m, role: swap[m.room], salary: salaryOf(db, swap[m.room], 3) } : m));
    // смены (spec 2026-10-staff-shifts): все — дневная, ночью поликлиника закрыта
    return newFlowShift(db, { seed, season: 'winter', hospital: hospitalOf(db, p.site), staff: withNightShift(db, p.site.rooms, staff), flow, economy: { cash: startCash(db, 'poly', manage) }, ...level });
  }
  if (name === 'ambulatory') {
    // касса и что строят — из записи сценария; часы — с 08:00 первых суток, как у прочих
    const s = newFlowShift(db, { seed, season: 'winter', hospital: hospitalOf(db, emptySite()), staff: [], flow, scenario: AMBULATORY_SC, ...level });
    build(s, AMBULATORY);
    return s;
  }
  const s = newFlowShift(db, { seed, season: 'winter', hospital: hospitalOf(db, emptySite()), staff: [], flow, economy: { cash: startCash(db, 'empty', manage) }, ...level });
  build(s, name === 'clinic' ? CLINIC : DISTRICT);
  return s;
}

/** Сколько суток прожить: сценарию 1 — не меньше 10, его критерий — к 10-м суткам. */
const daysOf = (name: string) => (name === 'ambulatory' ? Math.max(DAYS, 10) : DAYS);

function run(name: string, seed: number, manage: Manage): Run {
  const s = start(name, seed, manage);
  for (const role of RESERVE) site(s, { kind: 'reserve', role });
  const first = s.economy!.cash;
  const value = valueOf(s.hospital!.site!);
  let minCash = cashNow(s)!;
  const lines: Record<string, number> = {};
  const quits: Run['quits'] = [];
  const leaves: Run['leaves'] = [];
  const grew: Run['grew'] = [];
  const sick: Run['sick'] = [];
  const covered: Run['covered'] = [];
  let bare = 0;
  let raised = 0;
  const rides: Run['rides'] = [];
  const rounds: Run['rounds'] = [];
  const seen = new Set<string>();
  const waited = new Map<string, { since: number; until?: number }>();
  const end = (daysOf(name) * 24 + 8) * 3600;
  while (s.t < end) {
    for (const n of apply(db, s, { kind: 'advance', seconds: 300 })) {
      if (n.kind !== 'morning' || !n.staff) continue;
      for (const q of n.staff.quit ?? []) quits.push({ day: s.day, role: s.staff!.find(m => m.id === q.id)?.role ?? '' });
      for (const l of n.staff.leave ?? []) leaves.push({ day: s.day, role: l.role, why: l.why });
      for (const g of n.staff.grew ?? []) grew.push({ day: s.day, skill: g.skill });
      for (const id of n.staff.sick ?? []) sick.push({ day: s.day, role: s.staff!.find(m => m.id === id)?.role ?? '' });
      // резерв: на чьё место встал; заболевший без замены — его место эту смену пустое
      const cov = new Set((n.staff.covered ?? []).map(c => c.id));
      for (const id of cov) covered.push({ day: s.day, role: s.staff!.find(m => m.id === id)?.role ?? '' });
      bare += (n.staff.sick ?? []).filter(id => !cov.has(id)).length;
      if (!RAISE) continue;
      const ask = new Set([...(n.staff.grew ?? []).map(g => g.id), ...(n.staff.quit ?? []).map(q => q.id)]);
      for (const id of ask) if (apply(db, s, { kind: 'site', cmd: { kind: 'raise', id } }).some(x => x.kind === 'site' && x.ok)) raised++;
    }
    minCash = Math.min(minCash, cashNow(s)!);
    // каталка: кого некому везти — с какого часа ждёт и до какого (повезли, выписали, умер)
    const queue = new Set((s.rideWait ?? []).map(w => `${w.id}:${w.why}`));
    for (const w of s.rideWait ?? []) if (!waited.has(`${w.id}:${w.why}`)) waited.set(`${w.id}:${w.why}`, { since: w.since });
    for (const [key, x] of waited) if (x.until === undefined && !queue.has(key)) x.until = s.t;
    // каталка: новые записанные перевозки
    for (const r of s.rides ?? []) {
      const key = `${r.id}:${r.by}:${r.pick}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rides.push({ why: r.why, wait: Math.round((r.pick - r.since) / 60), nurse: s.staff?.find(m => m.id === r.by)?.role !== 'role.orderly' });
    }
    // утренний обход: новые
    for (const r of s.rounds?.on ?? []) {
      const key = `round:${r.by}:${r.from}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rounds.push({ nurse: r.nurse === true, beds: r.stops.length, min: Math.round((r.until - r.from) / 60) });
    }
  }
  // ждали каталку, потому что некому везти: до того, как вышли из очереди (повезли, выписали, умер), или до конца прогона
  let longest = 0;
  for (const x of waited.values()) longest = Math.max(longest, Math.round(((x.until ?? s.t) - x.since) / 60));
  const stuck = { n: waited.size, now: (s.rideWait ?? []).length, longest };
  // настроение в конце: у кого есть смена
  const vs = (s.staff ?? []).filter(m => m.shift !== undefined).map(m => s.moods?.[m.id]?.v ?? db.economy.staff.mood?.start ?? 70);
  const why: Record<string, number> = {};
  for (const r of Object.values(s.moods ?? {})) for (const w of r.why ?? []) why[w] = (why[w] ?? 0) + 1;
  const moods = { n: vs.length, low: vs.filter(v => v < (db.economy.staff.mood?.quit ?? 30)).length, min: vs.length ? Math.min(...vs) : 0, mean: vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : 0, why };
  const days = s.history.map((d, i): DayRow => {
    const e = d.economy!;
    const col = Object.values(d.colleagues ?? {});
    for (const [k, v] of Object.entries(e.ledger.income)) lines[k] = (lines[k] ?? 0) + v;
    lines.ward = (lines.ward ?? 0) + (e.ledger.ward?.income ?? 0);
    for (const [k, v] of Object.entries(e.ledger.expenses)) lines[`−${k}`] = (lines[`−${k}`] ?? 0) + (v ?? 0);
    lines.cut = (lines.cut ?? 0) + e.ledger.audit.cut;
    return {
      day: d.day, cash: e.cash, income: incomeOf(e.ledger), expenses: expensesOf(e.ledger), works: e.ledger.expenses.works ?? 0, rep: e.reputation.to, score: e.reputation.score,
      arrived: d.arrived, ambulance: d.ambulance?.arrived ?? 0, seen: col.reduce((n, c) => n + c.seen, d.seen), left: d.left, died: d.ward?.died ?? 0, lying: d.ward?.lying ?? 0,
      flowWalk: 0, flowAmb: 0, salaries: e.ledger.expenses.salaries, door: d.load?.door ?? 0, ...(d.load?.gurney ? { gurney: { ...d.load.gurney } } : {}),
      by: d.arrivedBy ?? {}, ...(d.leftBy ? { why: d.leftBy } : {}), ...(s.history[i - 1]?.inflow ? { forecast: s.history[i - 1].inflow } : {}),
    };
  });
  // поток от больницы сейчас — в среднем в сутки при часах по умолчанию
  const c = capacityOf(db, s);
  const hours = db.day!.walk.slice(db.day!.hours[0], db.day!.hours[1]).reduce((a, b) => a + b, 0) / 100;
  // ось «Управление»: поток — на множитель уровня
  const k = levelOf(db, manage).inflow / 100;
  for (const d of days) {
    d.flowWalk = Math.round(walkPerHour(db, c, d.rep) * hours * k);
    d.flowAmb = Math.round(ambulancePerHour(db, c) * 24 * k);
  }
  // прибыль — без стройки первых суток: сколько больница зарабатывает, когда построена
  const gain = (list: DayRow[]) => list.reduce((n, d, i) => n + d.income - d.expenses + (i === 0 ? d.works : 0), 0);
  // сценарий 1: цели — в ходе сценария; ваш кабинет — первый кабинет врача, его терапевт — вместо вас
  const office = s.hospital?.site?.rooms.find(r => r.type === 'room.office')?.id;
  // на месте врача нанимают терапевта (role.doctor — место, человек — role.therapist)
  const proxy = s.staff?.find(m => m.room === office)?.salary;
  const goals = name === 'ambulatory' && s.campaign ? { ...s.campaign.done } : undefined;
  return {
    scenario: name, manage, seed, start: first, value, minCash, profit: gain(days), week: gain(days.slice(0, 7)), days, lines, quits, leaves, moods, grew, sick, covered, bare, raised, rides, rounds, stuck,
    ...(goals ? { goals, ...(proxy !== undefined ? { proxy } : {}) } : {}),
  };
}

const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU');
const scenarios = ['clinic', 'district', 'city', 'poly', 'polyspec', 'ambulatory'].filter(x => ONLY.length === 0 || ONLY.includes(x));
const runs: Run[] = [];
/** Больницы, что на уровне не строятся сразу: касса начала с пределом минуса меньше цены (на «Трудно» — районная). */
const unbuilt: { name: string; manage: Manage; error: string }[] = [];
for (const name of scenarios)
  for (const manage of MANAGES)
    for (const seed of SEEDS) {
      try {
        runs.push(run(name, seed, manage));
      } catch (e) {
        if (manage === 'normal' || !String(e).includes('"kind":"money"')) throw e;
        if (!unbuilt.some(u => u.name === name && u.manage === manage)) unbuilt.push({ name, manage, error: String(e) });
      }
    }

if (asJson) {
  console.log(JSON.stringify(runs, null, 1));
} else {
  let fails = 0;
  for (const name of scenarios) for (const manage of MANAGES) {
    const limit = levelOf(db, manage).overdraft ?? 0;
    const rs = runs.filter(r => r.scenario === name && r.manage === manage);
    const level = MANAGES.length > 1 || manage !== 'normal' ? ` · ${LEVEL_NAME[manage]}` : '';
    if (rs.length === 0 && unbuilt.some(u => u.name === name && u.manage === manage)) {
      const start = startCash(db, name === 'city' ? 'preset' : name.startsWith('poly') ? 'poly' : 'empty', manage);
      console.log(`\n## ${name}${level}: не строится сразу — касса начала ${fmt(start)} ₽ и предел минуса −${fmt(limit)} ₽ меньше цены; строят по частям`);
      continue;
    }
    console.log(`\n## ${name}${level}: касса в начале ${fmt(rs[0].start)} ₽, больница стоит ${fmt(rs[0].value)} ₽`);
    for (const r of rs) {
      console.log(`  зерно ${r.seed}: касса не ниже ${fmt(r.minCash)}, прибыль за ${r.days.length} сут. без стройки ${fmt(r.profit)} ₽`);
      for (const d of r.days) {
        console.log(`    сутки ${d.day}: пришли ${d.arrived} (скорая ${d.ambulance}; поток ${d.flowWalk}+${d.flowAmb}), приняты ${d.seen}, ушли ${d.left}, умерли ${d.died}, лежат ${d.lying} · доходы ${fmt(d.income)}, расходы ${fmt(d.expenses)}${d.works ? ` (стройка ${fmt(d.works)})` : ''} · касса ${fmt(d.cash)} · репутация ${d.rep}${d.score !== undefined ? ` (оценка ${d.score})` : ''}`);
        // «Почему?» (spec docs/specs/2026-10-why.md): по виду и прогноз планёрки на эти сутки; ушли — по причинам
        const f = d.forecast;
        const w = d.why;
        const why = w ? Object.entries(w.why).map(([k, v]) => `${k} ${v}`).join(', ') + (w.asks ? ` (из busy при просьбах ${w.asks})` : '') + (w.stood ? `; стояли ${w.stood}` : '') : '';
        console.log(`      почему: сами ${d.by.walkIn ?? 0}, по записи ${d.by.appointment ?? 0}, скорая ${d.by.ambulance ?? 0}, повторно ${d.by.return ?? 0}${f ? ` · прогноз ${fmt(f.walk)} + ${fmt(f.book)} + ${fmt(f.amb)} (кабинетов ${f.offices}, специалистов ${f.booked}, мест ${f.bays}, ${f.pct} %)` : ''}${why ? ` · ушли: ${why}` : ''}`);
      }
      const lines = Object.entries(r.lines).filter(([, v]) => v !== 0).map(([k, v]) => `${k} ${fmt(v)}`).join(', ');
      console.log(`    за ${r.days.length} сут.: ${lines}`);
      // сценарий 1 (часть 4): когда выполнены цели; первые сутки в плюсе; касса без зарплаты терапевта вашего кабинета
      if (r.goals) {
        const sc = db.scenarios![AMBULATORY_SC];
        const done = sc.missions.map(m => `«${m.text.ru}» — ${r.goals![m.id] !== undefined ? `сутки ${r.goals![m.id]}` : 'нет'}`).join('; ');
        const plus = r.days.find(d => d.income - d.expenses >= 0)?.day;
        const n = r.days.length;
        const own = (r.proxy ?? 0) * n;
        console.log(`    цели: ${done}`);
        console.log(`    первые сутки в плюсе — ${plus ?? 'нет'}; терапевт вашего кабинета — ${fmt(r.proxy ?? 0)} ₽ в сутки, у игрока этих денег не платят: касса в конце без них ${fmt(r.days[n - 1].cash + own)} (с ними ${fmt(r.days[n - 1].cash)})`);
      }
      // персонал (spec 2026-10-staff-mood)
      const m = r.moods;
      const why = Object.entries(m.why).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ');
      const gone = r.leaves.map(l => `сутки ${l.day}: ${l.role.slice(5)} (${l.why.join(', ') || 'без причин'})`).join('; ');
      console.log(`    персонал: со сменой ${m.n}, настроение в конце ${m.min}–${Math.round(m.mean)} (ниже 30 — ${m.low}); причины ${why || 'нет'}; собирались уйти ${r.quits.length}, ушли сами ${r.leaves.length}${gone ? ` — ${gone}` : ''}`);
      const up = r.grew.length ? ` (сутки ${Math.min(...r.grew.map(g => g.day))}–${Math.max(...r.grew.map(g => g.day))})` : '';
      const ill = r.sick.map(x => `${x.role.slice(5)} ${x.day}`).join(', ');
      // резерв (часть 5): замещали — по должностям
      const cov = r.covered.map(x => `${x.role.slice(5)} ${x.day}`).join(', ');
      const res = RESERVE.length > 0 ? `; резерв (${RESERVE.map(x => x.slice(5)).join(', ')}) встал на место ${r.covered.length}${cov ? ` — ${cov}` : ''}` : '';
      console.log(`    выросли ${r.grew.length}${up}; смен пропущено по болезни ${r.sick.length}${ill ? ` — ${ill}` : ''}${res}; места пустовали ${r.bare} смен`);
      if (r.rides.length > 0) {
        const by = (w: Ride['why']) => r.rides.filter(x => x.why === w).length;
        const waits = r.rides.map(x => x.wait).sort((a, b) => a - b);
        const mean = waits.reduce((a, b) => a + b, 0) / waits.length;
        console.log(
          `    каталка: перевозок ${r.rides.length} (на койку ${by('bed')}, на операцию ${by('op')}, назад ${by('back')}, на обследование ${by('exam')}), ждали в среднем ${mean.toFixed(1)} мин, 9 из 10 — не дольше ${waits[Math.floor(waits.length * 0.9)]}, дольше всех ${waits[waits.length - 1]}; везла медсестра ${r.rides.filter(x => x.nurse).length}; скорая у входа — до ${Math.max(...r.days.map(d => d.door))} сразу`,
        );
        // некому везти (#99): не срочного медсестра не везёт — ждёт санитара
        if (r.stuck.n > 0) console.log(`    некому везти: ${r.stuck.n} раз, к концу ждут ${r.stuck.now}, дольше всех ${r.stuck.longest} мин`);
      }
      // утренний обход (spec docs/specs/2026-10-staff-motion.md, часть 2): врачи — сколько раз, у скольких коек, минут
      const docs = r.rounds.filter(x => !x.nurse);
      if (r.rounds.length > 0) {
        const mins = docs.map(x => x.min).sort((a, b) => a - b);
        const left = r.days.reduce((n, d) => n + (d.why?.why.round ?? 0), 0);
        const nurse = r.rounds.length - docs.length;
        console.log(
          `    обход: врачи — ${docs.length} раз, у коек ${docs.reduce((n, x) => n + x.beds, 0)}${mins.length ? `, минут — медиана ${mins[Math.floor(mins.length / 2)]}, 9 из 10 — не дольше ${mins[Math.floor(mins.length * 0.9)]}, дольше всех ${mins[mins.length - 1]}` : ''}; клиническая медсестра — ${nurse} раз; ушли, пока их врач на обходе, — ${left}`,
        );
      }
      if (RAISE) {
        // зарплаты за сутки: первые и последние семь (или все, если суток меньше)
        const avg = (list: DayRow[]) => list.reduce((n, d) => n + d.salaries, 0) / Math.max(1, list.length);
        const k = Math.min(7, r.days.length);
        console.log(`    подняли зарплату ${r.raised} раз; зарплаты за сутки — ${fmt(avg(r.days.slice(0, k)))} в первые ${k}, ${fmt(avg(r.days.slice(-k)))} в последние ${k}`);
      }
    }
    // «Спокойно» (spec 2026-10-difficulty): касса ни разу не ниже нуля; на других уровнях — не ниже предела минуса уровня
    const floor = manage === 'calm' ? 0 : -limit;
    const low = rs.filter(r => r.minCash < floor);
    if (low.length) console.log(`  ✗ касса ниже ${manage === 'calm' ? 'нуля' : `предела (−${fmt(limit)})`}: зёрна ${low.map(r => r.seed).join(', ')}`);
    else console.log(`  ✓ касса ни разу не ниже ${manage === 'calm' ? 'нуля' : `предела −${fmt(limit)} ₽`}`);
    fails += low.length;
    const week = Math.min(DAYS, 7);
    // «Спокойно» окупается быстрее «Обычно» — ему этот критерий не нужен
    if (manage !== 'calm') {
      const rich = rs.filter(r => r.week > r.value);
      if (rich.length) console.log(`  ✗ окупилась за ${week} суток: зёрна ${rich.map(r => r.seed).join(', ')}`);
      else console.log(`  ✓ за ${week} суток не окупается целиком: прибыль ${rs.map(r => fmt(r.week)).join(' / ')} при цене ${fmt(rs[0].value)}`);
      fails += rich.length;
    }
    // ось «Управление»: доля ушедших, не дождавшись, и прибыль «Спокойно» против «Обычно»
    if (manage !== 'normal') {
      const arrived = rs.reduce((n, r) => n + r.days.reduce((m, d) => m + d.arrived, 0), 0);
      const left = rs.reduce((n, r) => n + r.days.reduce((m, d) => m + d.left, 0), 0);
      const pct = arrived ? (100 * left) / arrived : 0;
      const [lo, hi] = manage === 'calm' ? [0, 5] : [10, 20];
      const ok = pct >= lo && pct <= hi;
      console.log(`  ${ok ? '✓' : '✗'} ушли, не дождавшись, — ${pct.toFixed(1)} % пришедших (${left} из ${arrived}); нужно ${lo}–${hi} %`);
      if (!ok) fails++;
      const normal = runs.filter(r => r.scenario === name && r.manage === 'normal');
      if (manage === 'calm' && normal.length) {
        const mean = (list: Run[]) => list.reduce((n, r) => n + r.week, 0) / list.length;
        const faster = mean(rs) > mean(normal);
        console.log(`  ${faster ? '✓' : '✗'} прибыль за ${week} суток — ${fmt(mean(rs))} ₽ в среднем, на «Обычно» — ${fmt(mean(normal))}`);
        if (!faster) fails++;
      }
    }
    // сценарий 1 (часть 4): «разумный игрок выходит в плюс к 10-м суткам» — цель «Пять суток с кассой в плюсе» к 10-м суткам;
    // касса и цели сценария подобраны на «Обычно»
    if (name === 'ambulatory' && manage === 'normal') {
      const late = rs.filter(r => (r.goals?.cash ?? Infinity) > 10);
      if (late.length) console.log(`  ✗ «Пять суток с кассой в плюсе» — не к 10-м суткам: зёрна ${late.map(r => r.seed).join(', ')}`);
      else console.log(`  ✓ «Пять суток с кассой в плюсе» — к суткам ${rs.map(r => r.goals!.cash).join(' / ')}, не позже 10-х`);
      fails += late.length;
    }
    // персонал (spec 2026-10-staff-mood): игрок ничего не делает — за первые две недели уходят сами не больше двух (дальше
    // растут, а зарплату им не поднимают, — уходят: решение владельца, #83); поднимает, когда просят, — не больше двух за
    // каждые две недели всего срока
    if (DAYS >= 14) {
      const span = RAISE ? DAYS : 14;
      const most = Math.floor((2 * span) / 14);
      const count = (r: Run) => r.leaves.filter(l => l.day <= span).length;
      const many = rs.filter(r => count(r) > most);
      if (many.length) console.log(`  ✗ ушли сами больше ${most} за ${span} суток: зёрна ${many.map(r => `${r.seed} (${count(r)})`).join(', ')}`);
      else console.log(`  ✓ ушли сами: ${rs.map(count).join(' / ')} за ${span} суток — не больше ${most}`);
      fails += many.length;
    }
  }
  if (fails) process.exitCode = 1;
}
