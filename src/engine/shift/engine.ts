// из anamnez: src/engine/shift/engine.ts @ 96503ac, изменено: разбор приёма нанятого врача — по требованию (spec 2026-10-engine-speed); «Просят посмотреть» (spec 2026-10-consults); стройка ПК — команда `site`, событие `siteFree`, приход в закрытую больницу, аппараты коек ПИТ из плана (spec 2026-10-build); сутки целиком в потоке для ПК — часы приёма, поток по часам, планёрка в 08:00, обход нанятых врачей, ночь по часам (spec 2026-10-day); путь пациента — однострочные вызовы `journey.*` (spec 2026-10-flow-ui); фибрилляция желудочков после полуночи — в ночь суток поступления и в сменах «Анамнеза» (`hospitalDay`; так же в anamnez 0.6.4, Nefeste/anamnez#152); касса и поток от больницы, планёрка с узкими местами, «стало хуже», долгий случай нанятого врача (spec 2026-10-economy); ходьба в потоке для ПК — свой врач, свой зал, следующие у двери, приём, когда дошёл (spec 2026-10-walk); приём вашего — когда он дошёл, `meet` и событие `reach` (spec 2026-10-owner-play-2); карты ушедших — `s.past` (spec 2026-10-discharged-card); скамьи у дверей кабинетов — `bench` (spec 2026-10-door-benches); настроение нанятых на планёрке и уход сам в пересменку (spec 2026-10-staff-mood); рост, учёба и болезнь нанятых (spec 2026-10-staff-mood, части 3–5); каталка — перевозки лежачих, операция и снимки на каталке (spec 2026-10-orderlies); главврач утверждает — галочки «О чём спрашивать», решение на утверждении, «Ещё обследование», выписка через утверждение (spec 2026-10-two-ways, часть 2); направление к специалисту — правило нанятого терапевта, команда `refer`, поправка профиля направленных (spec 2026-10-specialists, часть 2)
// Движок смены: приход пациентов, сортировка, очередь, терпение, обследования со своими
// сроками, закрытие случая и дня (spec 2026-09-first-shift, «Движок»; ADR 0005).
//
// Две точки входа, как в `02-architecture.md` §2: `apply(state, command)` — действие врача,
// которое двигает часы на свою цену, и команда `advance` — время на карте. Состояние
// меняется на месте; случайность — только из именованных ветвей зерна смены (ADR 0004).
import { type BodySystem, type Chapter, type ContentDb, type Equipment, type Exam, type Id, type Manage, type Preset, type Season, type Setting, SYSTEMS, type TutorialPatient } from '../../content/types';
import { fnv1a } from '../core/hash';
import {
  caseIncome, consumablesOf, emptyLedger, expensesOf, flowOf, incomeOf, interestOf, type Ledger, levelOf, payerOf, reputationAfter, salariesOf, upkeepOf,
  type WardClose, wardIncome,
} from '../economy/economy';
import { type CampaignProgress, campaignEvening, chapterOf, nextChapterOf, plotOf, scenarioOf, startChapter, tutorialDayOf } from '../campaign/campaign';
import { build, emptyPlot, type HospitalState, type PlacedRoom, type Plan, planOf, presetHospital, sizeOf, UNDO_DEPTH, widenPlot } from '../hospital/build';
import { bedsideIn, DOCTOR, doctorRoom, examWhere, NONE_BROKEN, openBlocks, type Problem, problemsOf, slotKey, type Staffing, workingRooms } from '../hospital/requirements';
import { applicantsOf, doctorOf, dutyOf, grow, memberAt, onDuty, ORDERLY, presetStaff, readingOf, type StaffMember, speedOf, staffingOf, wageOf } from '../hospital/staff';
import { metersBetween, WALK_SPEED, walkSeconds } from '../hospital/walk';
import { log2 } from '../core/math';
import { P_ONE, RNG_VERSION, Rng } from '../core/rng';
import { examHarmOutcome, observe, type Outcome, rscOutcome } from '../med/course';
import { complaintObservations, type ExamSkill, examFits, NORMAL_SKILL, runExam } from '../med/exams';
import { freezeClock, type GenContext, generatePatient, patientAt, typicalPatient } from '../med/generate';
import { type Belief, contextOf, likelyParams, posterior } from '../med/infer';
import { scaleTriage } from '../med/news2';
import { alsoSettings, choiceFor, evaluatePlan, primaryOf, recommendedSetting, selfLimits, settingFit, settingRoomsOf, STAYS, surgeriesOf, treatable, txAvailable, type Venue, verdictOf, whenHolds } from '../med/plan';
import { type DoctorRun, examCost, indicated, ORDER_MINUTES, type Parts, startRational, type StepResult, stepParts, whole } from '../med/policy';
import { buildReview, type ReviewData, reviewBeliefs } from '../med/review';
import { type Grade, scoreBase, type ScoreBase, scoreThrift, worstGrade } from '../med/score';
import { askMinutes, examSkillWith, mentorOf } from '../career/skills';
import type { Observation, Patient } from '../med/types';
import {
  type ClosedCase, type ColleagueDay, type Command, DAY, type Flow, type GoneRow, type DaySummary, type Difficulty, easyLevel, type Notice, type PlannedReturn, REGISTRATION, SHIFT_END, SHIFT_SCHEMA_VERSION,
  SHIFT_START, type ShiftEvent, type ShiftPatient, type ShiftState, TRIAGE, type Triage, type VisitKind, type WardDay, type AmbulanceDay, type SurgeryDay, type Ride,
  type ChiefDay, type InflowDay, type LeftWhy,
} from './types';
import { type Ask, askFor, askLong } from './consult';
import { type ApproveAsk, approveFor, ASK_RULES, asksDecisions, asksOf, DEFAULT_ASKS } from './approve';
import { backAt, beginRest, blurredOf, dropCrew, dueOf, restLeft, shiftEnded, slowedOf, startRest, tiredOf, wakeOf, worked } from './crew';
import * as journey from './journey';
import { AT_DOOR, doorBenches, fromDesk, hallNear, moveTo, PER_QUEUED, readyAt, route, slowOf, patientSpeed, toDoctor, toDoor, WALK_SPEED_PC, waitsAt, walkPc } from './walking';
import { COMPLICATION_DAYS, complicationAt, complicationsOf, deathsOf, onsetHours, operationFor } from './surgery';
import { dueIn, type TargetPlace, targetResults } from './targets';
import { occupied, siteCommand, siteFree } from './site';
import { arrivalAfter, dayOf, hospitalDay, hoursOf, returnWindow, roundsAt, validHours } from './day';
import { type Bed, daysIn, type StayEnd, stayNorm, wardCourse, wardState } from './ward';
import { accrue, offerOf, openEconomy, payWorks, repay, shortOf, takeLoan, unpaidShift } from './money';
import { ambulancePerHour, bookedPerHour, type Capacity, reputationPct, walkPerHour } from './inflow';
import * as meeting from './meeting';
import { depart, leaversDue, moodMorning } from './mood';
import { backMorning, growMorning, sickMorning, tenure } from './growth';
import { caseIncomeRooms, caseRoom, COMMON as ROOMS_COMMON, roomExpense, roomIncome } from './rooms';
import { cover } from './reserve';
import { manageOf, scaled, scaledInt } from './manage';
import { priorOf, referTo } from './refer';
import { book, carriersOf, gurneyOf, lying, planRide, rideHome, ridesUntil } from './gurney';
import { CLINICAL, roundLeft, roundMinutes, roundOf, roundsDue } from './rounds';

const MIN = 60;
const HOUR = 60 * MIN;
const TRIAGE_RANK: Record<Triage, number> = { red: 0, yellow: 1, green: 2 };
/** Сколько минут готовы ждать: красный не уходит, а ухудшается (`09-game-design.md` §4). */
const PATIENCE: Record<Exclude<Triage, 'red'>, [number, number]> = { yellow: [120, 180], green: [60, 150] };
/** Слоты записи: каждые 20 минут с 08:00 до 13:40, занято около 60 %. */
const SLOTS = 18;
const SLOT_MIN = 20;
const SLOT_BOOKED = 6000;

/** первая скорая в первую смену главы с обучением по скорой — не позже стольких минут (часть 34б) */
const TUTORIAL_AMBULANCE_MIN = 20;
/**
 * сколько зёрен перебрать, чтобы заданная болезнь была у человека обычной (и в заданном возрасте, с заданными
 * производными параметрами, а обязательное лечение ему можно): инсульт в первые 3 часа — у каждого седьмого
 */
const TUTORIAL_TRIES = 64;
/** Без записи — 2–6 человек, больше утром. */
const WALK_INS: [number, number] = [2, 6];

const branch = (s: ShiftState, name: string) => Rng.seeded(s.meta.seed).fork(name);

/** Сутки по часам: в потоке для ПК — с 08:00 до 08:00, как их сменяет планёрка (spec 2026-10-day); в сменах «Анамнеза» — по полуночи. */
const dayAt = (s: ShiftState, t: number) => (s.flow ? hospitalDay(t) : Math.floor(t / DAY) + 1);

// --- больница смены: план, штат, что работает (spec 2026-09-own-hospital, часть 8) ------------

/** Больница смены: план, штат, кто на месте, какие помещения работают, стулья, есть ли доврачебный. */
export interface HospitalCtx {
  plan: Plan;
  /** кто в смене (spec 2026-10-staff-shifts): по нему — кто на месте, кто принимает, кто читает снимок */
  staff: readonly StaffMember[];
  /** весь штат — найти человека по номеру: врач доводит приём и после своей смены */
  all: readonly StaffMember[];
  staffed: Staffing;
  working: Set<string>;
  /** работающие кабинеты — виды помещений, по порядку (spec 2026-10-chapter-4, часть 53а): где можно лечить в кабинете */
  rooms: readonly Id[];
  seats: number;
  triage: boolean;
}

const presets = new WeakMap<ContentDb, { hospital: HospitalState; staff: StaffMember[] }>();
const ctxs = new WeakMap<HospitalState, WeakMap<readonly StaffMember[], HospitalCtx>>();

/** Практика — готовая амбулатория каталога со своим штатом; песочница — своя больница. */
function presetOf(db: ContentDb) {
  let p = presets.get(db);
  if (!p) {
    const rec = db.presets['preset.clinic'];
    p = { hospital: presetHospital(db, rec).hospital, staff: presetStaff(db, rec) };
    presets.set(db, p);
  }
  return p;
}

/**
 * План и штат меняются только между сменами, и каждый раз — новым объектом: за день план
 * строится один раз. Смены (spec 2026-10-staff-shifts): кто на месте — по смене часа `at`, одна больница на пересменку.
 */
export function hospitalCtx(db: ContentDb, s: ShiftState, at = s.t): HospitalCtx {
  const hospital = s.hospital ?? presetOf(db).hospital;
  const all = s.staff ?? presetOf(db).staff;
  const staff = dutyOf(db, all, at);
  let byStaff = ctxs.get(hospital);
  if (!byStaff) {
    byStaff = new WeakMap();
    ctxs.set(hospital, byStaff);
  }
  let c = byStaff.get(staff);
  if (!c) {
    const plan = planOf(db, hospital);
    const staffed = staffingOf(db, plan, staff);
    const working = workingRooms(db, plan, staffed);
    const live = plan.rooms.filter(r => working.has(r.id));
    const rooms = [...new Set(live.map(r => r.type))].sort();
    c = { plan, staff, all, staffed, working, rooms, seats: live.reduce((n, r) => n + r.seats.length, 0), triage: live.some(r => r.type === 'room.triage') };
    byStaff.set(staff, c);
  }
  return c;
}
/** «Студент»: обследования не ошибаются, пациенты ждут в полтора раза дольше (09-game-design.md §14). */
const exact = (s: ShiftState) => easyLevel(s.meta.difficulty);
const STUDENT_PATIENCE = 1.5;
/** «Ординатор» (spec 2026-10-resident): обследования ошибаются, как у «Врача», а ждут в 1,2 раза дольше (§14). */
const RESIDENT_PATIENCE = 1.2;
const patienceOf = (d: Difficulty | undefined) => (easyLevel(d) ? STUDENT_PATIENCE : d === 'resident' ? RESIDENT_PATIENCE : 1);

/** Как пришли бы больные (spec 2026-10-variety): `variety` — «разнообразие» из настроек; нет — как в жизни. */
interface Variety {
  variety?: boolean;
}

export function newShift(db: ContentDb, opts: { seed: number; season: Season; department?: Id; difficulty?: Difficulty } & Variety): ShiftState {
  const s = shiftBase(db, opts);
  planDay(db, s);
  return s;
}

/** Практика в первый день, 08:00, без разыгранного дня: его разыгрывают, когда известна больница. */
function shiftBase(db: ContentDb, opts: { seed: number; season: Season; department?: Id; difficulty?: Difficulty } & Variety): ShiftState {
  return {
    meta: {
      schemaVersion: SHIFT_SCHEMA_VERSION, contentVersion: db.contentVersion, rngVersion: RNG_VERSION, mode: 'shift',
      seed: opts.seed >>> 0, season: opts.season, department: opts.department ?? 'dept.therapy', difficulty: opts.difficulty ?? 'doctor',
      ...(opts.variety ? { variety: true } : {}),
    },
    t: SHIFT_START,
    day: 1,
    dayOpen: true,
    patients: {},
    queue: [],
    events: [],
    seq: 0,
    rooms: {},
    returns: [],
    summary: emptySummary(1),
    history: [],
    journal: [],
  };
}

/**
 * Песочница — своя больница (spec 2026-09-own-hospital): день 0, смена ещё не открыта, касса
 * по выбранному бюджету. С готовой амбулаторией — та же амбулатория, что в практике, в углу
 * участка, а денег — только доля бюджета.
 */
export function newSandbox(db: ContentDb, opts: { seed: number; season: Season; difficulty?: Difficulty; start: 'empty' | 'clinic'; budget: number } & Variety): ShiftState {
  const sb = db.economy.sandbox;
  const [w, h] = sb.plot;
  const hospital = opts.start === 'clinic'
    ? presetHospital(db, db.presets['preset.clinic'], sb.plot).hospital
    : emptyPlot(w, h, sb.entrance, sb.corridor);
  const cash = opts.start === 'clinic' ? Math.floor((opts.budget * sb.clinicShare) / 100) : opts.budget;
  const staff = opts.start === 'clinic' ? presetStaff(db, db.presets['preset.clinic']) : [];
  const hired = applicantsOf(db, opts.seed >>> 0, 0, 1);
  return {
    meta: {
      schemaVersion: SHIFT_SCHEMA_VERSION, contentVersion: db.contentVersion, rngVersion: RNG_VERSION, mode: 'sandbox', start: opts.start,
      seed: opts.seed >>> 0, season: opts.season, department: 'dept.therapy', difficulty: opts.difficulty ?? 'doctor',
      ...(opts.variety ? { variety: true } : {}),
    },
    t: 0,
    day: 0,
    dayOpen: false,
    patients: {},
    queue: [],
    events: [],
    seq: 0,
    rooms: {},
    returns: [],
    summary: emptySummary(0),
    history: [],
    journal: [],
    hospital,
    economy: { cash, reputation: db.economy.reputation.start, ledger: emptyLedger() },
    undo: [],
    staff,
    candidates: hired.list,
    nextStaff: hired.next,
  };
}

/** Где идёт «Смена»: своя больница из песочницы — не запись базы. */
export const SANDBOX_VENUE = 'sandbox';

/**
 * «Смена» (spec 2026-09-campaign, часть 14): один день в выбранной больнице — готовой из базы
 * (амбулатория практики, больница главы) или копии своей из песочницы, со своим штатом. Кассы
 * нет, как в практике; итог — по категориям (src/state/single.ts).
 */
export function newSingle(
  db: ContentDb,
  opts: { seed: number; season: Season; difficulty?: Difficulty; venue: Id; hospital?: HospitalState; staff?: StaffMember[] } & Variety,
): ShiftState {
  const s = singleBase(db, opts);
  // день — в этой больнице (spec 2026-10-variety, «Заодно»): прежде он разыгрывался до неё, и в
  // районной больнице приходили только с терапией, без скорой
  planDay(db, s);
  return s;
}

/**
 * Смена ПК с потоком (spec 2026-10-engine-speed, ч. 2): своя больница со штатом, как «Смена», а приток — `flow.perHour`
 * человек в час и машины скорой в час, не по слотам записи у кабинетов. Пациент генерируется, когда приходит.
 */
export function newFlowShift(
  db: ContentDb,
  opts: { seed: number; season: Season; difficulty?: Difficulty; hospital: HospitalState; staff: StaffMember[]; flow: Flow; economy?: { cash: number }; scenario?: Id; manage?: Manage; soft?: boolean } & Variety,
): ShiftState {
  // рост (spec 2026-10-staff-mood, раздел 3): у людей со сменой — разный стаж, растут не в одно утро
  const s = singleBase(db, { ...opts, staff: tenure(db, opts.seed, opts.staff), venue: SANDBOX_VENUE });
  s.flow = { ...opts.flow };
  // уровень «Управления» и мягкий режим (spec 2026-10-difficulty) — с начала: по ним поток, терпение и касса
  if (opts.manage && opts.manage !== 'normal') s.meta.manage = opts.manage;
  if (opts.soft) s.meta.soft = true;
  // часы приёма — только верные (spec 2026-10-day): иначе — базы
  if (s.flow.hours && !validHours(s.flow.hours[0], s.flow.hours[1])) delete s.flow.hours;
  // сценарий ПК (spec 2026-10-scenario-1): ход — как у главы «Анамнеза», дни сценария — с первых суток; отделение и касса —
  // его. Больницу — пустое здание или готовую — строит окно, как у песочницы
  const sc = opts.scenario ? db.scenarios?.[opts.scenario] : undefined;
  if (sc) {
    s.meta.department = sc.department;
    s.campaign = startChapter(db, sc.id, s.day - 1);
  }
  // касса (spec 2026-10-economy): с ней — плательщики, оплата случаев, расходы и репутация «Анамнеза»; до плана суток
  const cash = sc ? sc.budget : opts.economy?.cash;
  if (cash !== undefined) s.economy = openEconomy(db, cash, s.t);
  planDay(db, s);
  // усталость (spec 2026-10-staff-shifts, часть 2): у врачей в смене перерывы и туалет — с первой минуты, даже если звать
  // ещё некого
  if (s.staff?.some(m => m.shift !== undefined)) {
    staffDesks(db, s);
    crewAll(db, s);
  }
  return s;
}

/**
 * Готовая больница «Смены» без разыгранного дня (spec 2026-10-study-case, часть 74): по ней «Разобрать случай» знает,
 * какие отделения, места и обследования есть там, куда он кладёт больного из статьи.
 */
export function venueState(db: ContentDb, venue: Id): ShiftState {
  return singleBase(db, { seed: 0, season: 'winter', venue });
}

function singleBase(
  db: ContentDb,
  opts: { seed: number; season: Season; difficulty?: Difficulty; venue: Id; hospital?: HospitalState; staff?: StaffMember[] } & Variety,
): ShiftState {
  const s = shiftBase(db, opts);
  s.meta.mode = 'single';
  s.meta.venue = opts.venue;
  // амбулатория практики — та, что у движка по умолчанию; другая готовая — из её записи
  const rec = db.presets[opts.venue];
  if (opts.venue !== 'preset.clinic' && rec) {
    s.hospital = presetHospital(db, rec).hospital;
    s.staff = presetStaff(db, rec);
  } else if (opts.hospital) {
    // копия: смена своей больницы не меняет песочницу
    s.hospital = JSON.parse(JSON.stringify(opts.hospital)) as HospitalState;
    s.staff = JSON.parse(JSON.stringify(opts.staff ?? [])) as StaffMember[];
  }
  return s;
}

/**
 * Кого нанимают в главе кампании: тех, кому не нужно своё помещение, или чьё помещение глава
 * строит, — терапевты придут с главой, где откроется ординаторская (spec 2026-09-hired-doctors);
 * и только тех, кто работает в помещении, которое глава строит или которое уже стоит в её больнице:
 * хирург и анестезиолог — с главой, где есть операционная (spec 2026-09-chapter-2, часть 28).
 * Специалисты — только в главе со специалистами: в главах 1–3 их нет, они приходят с главой 4 (spec
 * 2026-10-chapter-4, части 59 и 60а).
 */
function builtIn(db: ContentDb, ch: Chapter): (role: Id) => boolean {
  const here = new Set([...ch.build, ...(db.presets[ch.preset]?.rooms.map(r => r.type) ?? [])]);
  return role => {
    const r = db.roles[role];
    if (!r || (r.profile && !ch.specialists) || (r.needs && !ch.build.includes(r.needs))) return false;
    return r.rooms.some(id => here.has(id));
  };
}

/**
 * Машин скорой за смену (spec 2026-10-chapter-4, часть 60а): у готовой больницы главы или «Смены» — её собственные (в
 * городскую везут больше), иначе — как везде.
 */
function ambulanceOf(db: ContentDb, s: ShiftState): [number, number] {
  const preset = s.campaign ? db.presets[chapterOf(db, s.campaign)?.preset ?? ''] : s.meta.mode === 'single' ? db.presets[s.meta.venue ?? ''] : undefined;
  return preset?.ambulance ?? db.economy.ambulance.perDay;
}

/**
 * Участок главы: участок песочницы, а больница главы шире него — её собственный: у главы 3 — с крылом (часть 45а), у
 * главы 4 — большая больница 56 × 40 (spec 2026-10-chapter-4, часть 60а).
 */
function chapterPlot(db: ContentDb, preset: Preset): [number, number] {
  const sb = db.economy.sandbox.plot;
  return [Math.max(sb[0], preset.plot[0]), Math.max(sb[1], preset.plot[1])];
}

/**
 * Кампания (spec 2026-09-campaign): карьера в слоте `career`, первая глава — по порядку.
 * Больница главы — её готовая больница на участке песочницы со штатом, касса — бюджет главы;
 * в начале — письма «в начале главы». Остальное — как в песочнице. Что строят и кого нанимают заданием главы
 * (часть 60а), в начале главы нет.
 */
export function newCampaign(db: ContentDb, opts: { seed: number; season: Season; difficulty?: Difficulty; career: number; chapter?: Id }): ShiftState {
  const ch = opts.chapter ? db.chapters[opts.chapter] : Object.values(db.chapters)[0];
  const preset = db.presets[ch.preset];
  const hired = applicantsOf(db, opts.seed >>> 0, 0, 1, builtIn(db, ch));
  return {
    meta: {
      schemaVersion: SHIFT_SCHEMA_VERSION, contentVersion: db.contentVersion, rngVersion: RNG_VERSION, mode: 'campaign', career: opts.career,
      seed: opts.seed >>> 0, season: opts.season, department: ch.department, difficulty: opts.difficulty ?? 'doctor',
    },
    t: 0,
    day: 0,
    dayOpen: false,
    patients: {},
    queue: [],
    events: [],
    seq: 0,
    rooms: {},
    returns: [],
    summary: emptySummary(0),
    history: [],
    journal: [],
    hospital: presetHospital(db, preset, chapterPlot(db, preset), true).hospital,
    economy: { cash: ch.budget, reputation: db.economy.reputation.start, ledger: emptyLedger() },
    undo: [],
    staff: presetStaff(db, preset, true),
    candidates: hired.list,
    nextStaff: hired.next,
    campaign: startChapter(db, ch.id, 0),
  };
}

/**
 * Следующая глава карьеры (spec 2026-09-chapter-2, часть 34): основные задания главы выполнены,
 * день закрыт — врач переходит в готовую больницу следующей главы. Врач, сложность, итоги дней и
 * подсказки — прежние; больница, штат, кандидаты, касса (бюджет главы) и репутация — новые. Кто
 * должен был вернуться — вернётся в прежнюю больницу: его возврат снят. Глава с крылом (spec
 * 2026-10-chapter-3, часть 45а) — та же больница: см. `wingChapter`.
 */
function nextChapter(db: ContentDb, s: ShiftState) {
  const c = s.campaign;
  const next = c ? nextChapterOf(db, c) : undefined;
  if (!c || !next || c.complete === undefined || s.dayOpen) return;
  if (next.wing) {
    wingChapter(db, s, c, next);
    return;
  }
  // лежащих долечат врачи прежней больницы (spec 2026-10-chapter-4, часть 61б), как вернувшихся: случай закрыт тем, что
  // было на день переезда, пребывание — «передан». Прежде переход ждал выписки, а в главе 3 палаты пусты не бывают
  for (const p of inpatientsOf(s)) closeStay(db, s, p, 'handed', daysIn(p.stay!, s.day));
  const preset = db.presets[next.preset];
  const hired = applicantsOf(db, s.meta.seed, s.day, s.nextStaff ?? 1, builtIn(db, next));
  s.meta.department = next.department;
  s.hospital = presetHospital(db, preset, chapterPlot(db, preset), true).hospital;
  s.staff = presetStaff(db, preset, true);
  s.candidates = hired.list;
  s.nextStaff = hired.next;
  s.economy = { cash: next.budget, reputation: db.economy.reputation.start, ledger: emptyLedger() };
  s.undo = [];
  s.rooms = {};
  s.returns = [];
  delete s.desk;
  s.campaign = { ...startChapter(db, next.id, s.day), ...(c.tips ? { tips: c.tips } : {}) };
}

/** Острый коронарный синдром — задание «без пропущенного инфаркта» (часть 45а). */
const ACS = 'cond.acs';
/** Замечания разбора, с которыми тромболизис не в счёт: вредно, не показан (в том числе поздно), противопоказание нарушено. */
const LYSIS_BAD: readonly string[] = ['tx.harmful', 'tx.notIndicated', 'safety.knownViolation', 'safety.unaskedViolation'];

/**
 * Итоги дня для заданий главы 3 (spec 2026-10-chapter-3, часть 45а), ваш приём: тромболизис — в окне и
 * без противопоказаний (не «вредно» и не «не показан», противопоказания спрошены и не нарушены) или нет;
 * ОКС — был ли и пропущен ли (диагноз не тот).
 */
function campaignCase(db: ContentDb, sum: DaySummary, p: ShiftPatient, closed: ClosedCase) {
  for (const tx of closed.plan.treatments.filter(id => db.treatments[id]?.class === 'thrombolytic')) {
    const contra = new Set(db.treatments[tx].contraindications.map(k => k.id));
    const bad = closed.notes.some(n => ('tx' in n && n.tx === tx && LYSIS_BAD.includes(n.code)) || (n.code === 'safety.notAsked' && contra.has(n.by)));
    const day = (sum.lysis ??= { good: 0, bad: 0 });
    if (bad) day.bad++;
    else day.good++;
  }
  if (primaryOf(p.patient).id === ACS) {
    const day = (sum.acs ??= { seen: 0, missed: 0 });
    day.seen++;
    if (closed.verdict === 'wrong') day.missed++;
  }
}

/**
 * Глава с крылом (spec 2026-10-chapter-3, часть 45а): больница остаётся — штат, построенное, лежащие,
 * кто должен вернуться, репутация и касса, к которой прибавляется бюджет главы; участок прирастает
 * справа клетками крыла. Кандидаты — по стройке новой главы; отмена стройки — с чистого листа: в
 * прежних снимках участок уже.
 */
function wingChapter(db: ContentDb, s: ShiftState, c: CampaignProgress, next: Chapter) {
  const hired = applicantsOf(db, s.meta.seed, s.day, s.nextStaff ?? 1, builtIn(db, next));
  s.meta.department = next.department;
  if (s.hospital) s.hospital = widenPlot(s.hospital, next.wing ?? 0);
  s.candidates = hired.list;
  s.nextStaff = hired.next;
  if (s.economy) s.economy.cash += next.budget;
  s.undo = [];
  s.campaign = { ...startChapter(db, next.id, s.day), ...(c.tips ? { tips: c.tips } : {}) };
}

/**
 * Действие врача или ход времени. Недопустимая команда ничего не меняет (но пишется в журнал).
 * Ходы времени подряд журнал сливает в один: прожить a, затем b — то же, что прожить a + b,
 * а часы на карте тикают по четыре раза в секунду.
 */
export function apply(db: ContentDb, s: ShiftState, cmd: Command, more?: () => boolean): Notice[] {
  // время прошлой команды, ещё не прожитое (0.5.13), — сначала всё: команда видит больницу такой же, как прежде
  const before = catchUp(db, s);
  const last = s.journal[s.journal.length - 1];
  if (cmd.kind === 'advance' && last?.kind === 'advance') last.seconds += cmd.seconds;
  else s.journal.push({ ...cmd });
  tailMore = more;
  morningAt = undefined;
  try {
    const out = command(db, s, cmd);
    return before.length > 0 ? [...before, ...out] : out;
  } finally {
    tailMore = undefined;
    // планёрка посреди команды, чьё время не в `until` (spec 2026-10-day): журнал новых суток — её время после 08:00
    if (morningAt !== undefined) {
      const left = (s.until ?? s.t) - morningAt;
      s.journal = left > 0 ? [{ kind: 'advance', seconds: left }] : [];
      morningAt = undefined;
    }
  }
}

/** Действия приёма: идут, только когда вы с пациентом. */
const VISIT = new Set<Command['kind']>(['exam', 'waitResults', 'sendAway', 'diagnose', 'hypothesis', 'toggleTreatment', 'setting', 'finish', 'refer']);

function command(db: ContentDb, s: ShiftState, cmd: Command): Notice[] {
  // поток для ПК (spec 2026-10-owner-play-2): пациент ещё идёт к вам — приём не начат
  if (s.meet !== undefined && s.meet > s.t && VISIT.has(cmd.kind)) return [];
  switch (cmd.kind) {
    case 'advance':
      return s.dayOpen ? later(db, s, undefined, cmd.seconds) : [];
    case 'call':
      return call(db, s, cmd.id);
    case 'exam':
      return exam(db, s, cmd.exam);
    case 'waitResults': {
      const p = current(s);
      if (!p || (p.pending.length === 0 && !isOut(s, p))) return [];
      p.step++;
      // поток для ПК (spec 2026-10-owner-play-2): ждут часами игры — время не проживается разом; вернётся или будет готово
      // — извещение
      if (s.flow) return [];
      // и пока он не вернётся с обследования (0.5.12): что делают при нём — тогда
      const target = Math.min(...p.pending.map(x => x.readyAt), ...(isOut(s, p) ? [p.out!.back] : []));
      // привезла скорая, пока ждали, — ожидание кончается с её приездом: врачу пора в смотровую
      // (spec 2026-10-chapter-3, часть 37: ЭКГ при боли в груди — в первые 10 минут)
      const car = s.events.find(x => x.t <= target && x.event.kind === 'arrive' && s.patients[x.event.id]?.kind === 'ambulance');
      return later(db, s, p, Math.max(0, (car ? car.t : target) - s.t));
    }
    case 'sendAway': {
      const p = current(s);
      // ждать нечего — «подождите» только ради того, кто срочнее (spec 2026-10-chapter-3, часть 37):
      // иначе срок 10 минут не выполнить, пока идёт долгий опрос
      if (!p || (p.pending.length === 0 && !moreUrgent(db, s, p))) return [];
      p.step++; // что придёт, пока его нет, — «новое» при следующем вызове, а прежнее — нет
      s.current = undefined;
      // ушёл на обследование — после него в зал, не к вам (0.5.12)
      delete p.out;
      if (p.pending.length > 0) {
        p.status = 'away';
        p.wait++;
        journey.away(s, p);
      } else {
        // в очередь на своё место — как вернувшийся с анализов, по времени прихода; стоял — снова у двери (spec
        // 2026-10-own-hall)
        standBack(db, s, p);
        enqueue(s, p, p.arriveT);
      }
      return later(db, s, p, MIN);
    }
    case 'diagnose': {
      const p = current(s);
      // из болезней отделений, с какими его приняли (часть 30): в амбулатории хирургии нет
      if (p && db.conditions[cmd.id]?.presenting && (p.departments ?? [s.meta.department]).includes(db.conditions[cmd.id].department)) {
        p.draft.diagnosis = cmd.id;
        // у нового диагноза операции здесь нет — в палату, а нет койки — скорая (часть 28)
        if (p.draft.setting === 'surgery' && !canOperate(db, s, cmd.id, p)) p.draft.setting = freeBeds(db, s).length > 0 ? 'admit' : 'ambulance';
      }
      return [];
    }
    case 'hypothesis': {
      // дифференциальный ряд игрока (spec 2026-10-differential): из тех же болезней, что диагноз; новая — в конец
      const p = current(s);
      if (p && db.conditions[cmd.id]?.presenting && (p.departments ?? [s.meta.department]).includes(db.conditions[cmd.id].department)) {
        const row = p.draft.hypotheses ?? [];
        p.draft.hypotheses = row.includes(cmd.id) ? row.filter(x => x !== cmd.id) : [...row, cmd.id];
      }
      return [];
    }
    case 'toggleTreatment': {
      const p = current(s);
      // операцию выбирают «В операционную», а не в списке лечения (часть 28)
      if (!p || !db.treatments[cmd.id] || db.treatments[cmd.id].kind === 'surgery') return [];
      const has = p.draft.treatments.includes(cmd.id);
      // лечение у постели (часть 39а): тромболизис — только лежащему под монитором; лечение реанимации (spec
      // 2026-10-chapter-4, часть 47) — ИВЛ — если в ней есть свободная койка
      const ricu = freeRicuBeds(db, s).length > 0;
      // лечение в кабинете (часть 53а) — гемостаз — если эндоскопический кабинет больницы работает
      if (!has && !txAvailable(db, cmd.id, { bedside: bedsideEquipment(db, s, p), rooms: hospitalCtx(db, s).rooms, ...(ricu ? { ricu } : {}) })) return [];
      p.draft.treatments = has ? p.draft.treatments.filter(x => x !== cmd.id) : [...p.draft.treatments, cmd.id].sort();
      // назначил лечение реанимации — и место «В ОРИТ»: ИВЛ делают там
      const place = db.treatments[cmd.id].place;
      if (!has && place) p.draft.setting = place;
      return [];
    }
    case 'setting': {
      const p = current(s);
      // в свою палату — только если есть свободная койка (часть 26); в операционную — если у
      // диагноза есть операция, операционная её делает и после неё есть койка (часть 28); в ПИТ —
      // если свободна койка под монитором (часть 38а); в реанимацию — если свободна койка с монитором и
      // аппаратом ИВЛ (spec 2026-10-chapter-4, часть 47); в бокс — если он свободен (часть 49а)
      const ok = cmd.setting === 'admit' ? freeBeds(db, s).length > 0
        : cmd.setting === 'surgery' ? canOperate(db, s, p?.draft.diagnosis, p)
        : cmd.setting === 'icu' ? freeIcuBeds(db, s).length > 0
        : cmd.setting === 'ricu' ? freeRicuBeds(db, s).length > 0
        : cmd.setting === 'box' ? freeBoxBeds(db, s).length > 0 : true;
      if (p && ok) {
        p.draft.setting = cmd.setting;
        // лечение реанимации — только «В ОРИТ»: выбрал другое место — оно снимается (часть 47)
        p.draft.treatments = placeBound(db, p.draft.treatments, cmd.setting);
      }
      return [];
    }
    case 'finish':
      return finish(db, s);
    case 'closeDay':
      closeDay(db, s);
      return [];
    case 'nextDay':
      nextDay(db, s);
      return [];
    case 'build':
    case 'undo':
    case 'buildEnd':
      building(db, s, cmd);
      return [];
    case 'hire':
    case 'fire':
    case 'assign':
      hiring(db, s, cmd);
      return [];
    case 'takeOver':
      return takeOver(db, s, cmd.id);
    case 'consult':
      return answerConsult(db, s, cmd);
    case 'refer':
      return referOwn(db, s, cmd.to);
    // «Главврач утверждает» (spec 2026-10-two-ways, F3): галочки — сразу, следующее решение врача уже по ним
    case 'asks': {
      const rules = ASK_RULES.filter(r => cmd.rules.includes(r));
      if (sameIds(rules, DEFAULT_ASKS)) delete s.meta.asks;
      else s.meta.asks = rules;
      // шаг врача, посчитанный заранее, — по прежним галочкам (долгий случай): посчитать заново, тем же счётом
      colleagueJobs.delete(s);
      return [];
    }
    case 'approve':
      return answerApproval(db, s, cmd);
    case 'order':
      return chiefOrder(db, s, cmd.id, cmd.exam);
    case 'hours':
      return setHours(db, s, cmd.open, cmd.close);
    case 'discharge':
    case 'transfer':
      return leaveWard(db, s, cmd.id, cmd.kind);
    case 'replan':
      return replan(db, s, cmd.id, cmd.treatments);
    case 'sort':
      return sortAmbulance(db, s, cmd.id, cmd.triage);
    case 'operate':
      return operate(db, s, cmd.id);
    case 'soft':
      if (cmd.on) s.meta.soft = true;
      else delete s.meta.soft;
      return [];
    // ось «Управление» (spec 2026-10-difficulty): с этой минуты — зарплаты и содержание до неё записаны по прежнему уровню; тот
    // же уровень — ничего не меняется
    case 'manage':
      if (!s.flow || cmd.level === (s.meta.manage ?? 'normal')) return [];
      accrue(db, s);
      if (cmd.level === 'normal') delete s.meta.manage;
      else s.meta.manage = cmd.level;
      return [];
    case 'variety':
      if (cmd.on) s.meta.variety = true;
      else delete s.meta.variety;
      return [];
    // умения врача (spec 2026-10-skills, часть 75): умения дня — те, что были, когда он открылся; новое — завтра
    case 'skills':
      if (cmd.today) setSkills(s, cmd.ids);
      else if (sameIds(cmd.ids, s.meta.skills ?? [])) delete s.meta.skillsNext;
      else s.meta.skillsNext = [...cmd.ids];
      return [];
    // «свои больные» (spec 2026-10-own-patients, часть 76): сразу — следующий, кого врач позовёт, уже по ним
    case 'mine':
      if (cmd.systems.length > 0) s.meta.mine = [...cmd.systems];
      else delete s.meta.mine;
      return [];
    case 'nextChapter':
      nextChapter(db, s);
      return [];
    // сценарий ПК (spec 2026-10-scenario-1): отметка окна — письмо к подсказке, прочитано, «Без обучения»
    case 'mark':
      mark(db, s, cmd);
      return [];
    // стройка ПК (spec 2026-10-build): в любой момент, пока идут часы
    case 'site': {
      // касса ПК (spec 2026-10-economy): зарплаты и содержание — по эту минуту; больница стала другой — и поток от неё
      accrue(db, s);
      const was = s.flow?.auto ? capacityOf(db, s) : undefined;
      const out = siteCommand(db, s, cmd.cmd);
      reflow(db, s, was);
      // нанят первый со сменой (spec 2026-10-staff-shifts): пересменки этих суток — с этой минуты; нанятый делать
      // обследования — его перерывы и туалет (часть 2б)
      scheduleDuty(db, s);
      crewAll(db, s);
      // каталка (spec docs/specs/2026-10-orderlies.md): наняли санитара или медсестру — лежачие, кого некому было везти
      retryRides(db, s);
      return out;
    }
    // касса ПК (spec 2026-10-economy): кредит, который банк предложил на планёрке
    case 'loan':
      takeLoan(db, s);
      return [];
  }
}

/** Умения дня (spec 2026-10-skills): пусто — без поля, как в сохранениях до 0.5.18. */
function setSkills(s: ShiftState, ids: readonly Id[]) {
  if (ids.length > 0) s.meta.skills = [...ids];
  else delete s.meta.skills;
}

const sameIds = (a: readonly Id[], b: readonly Id[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Найм — только в песочнице и между сменами. Назначенный на занятое место сменяет того, кто там был, — тот в резерв. */
function hiring(db: ContentDb, s: ShiftState, cmd: Extract<Command, { kind: 'hire' | 'fire' | 'assign' }>) {
  if (!s.staff || !s.hospital || s.dayOpen) return;
  if (cmd.kind === 'hire') {
    const c = s.candidates?.find(x => x.id === cmd.id);
    if (!c) return;
    s.staff = [...s.staff, c];
    s.candidates = (s.candidates ?? []).filter(x => x.id !== cmd.id);
    return;
  }
  const m = s.staff.find(x => x.id === cmd.id);
  if (!m) return;
  if (cmd.kind === 'fire') {
    s.staff = s.staff.filter(x => x.id !== cmd.id);
    return;
  }
  // встающий на чужое место (терапевт, специалист) — на место врача, но в вашем кабинете врач — вы
  const postOf = (x: StaffMember) => db.roles[x.role]?.stands ?? x.role;
  const post = postOf(m);
  if (cmd.room !== undefined) {
    const room = s.hospital.rooms.find(r => r.id === cmd.room);
    if (!room || !db.rooms[room.type].staff.includes(post)) return;
    if (post === DOCTOR && room.id === doctorRoom(hospitalCtx(db, s).plan)) return;
  }
  s.staff = s.staff.map(x => {
    if (x.id === m.id) return cmd.room === undefined ? { ...x, room: undefined } : { ...x, room: cmd.room };
    // место одно: специалист сменяет терапевта в кабинете, как терапевт — терапевта (часть 59)
    if (cmd.room !== undefined && x.room === cmd.room && postOf(x) === post) return { ...x, room: undefined };
    return x;
  });
}

/** Стройка — только в песочнице и только между сменами (ADR 0016); ошибка — ничего не меняется. */
function building(db: ContentDb, s: ShiftState, cmd: Extract<Command, { kind: 'build' | 'undo' | 'buildEnd' }>) {
  if (!s.hospital || !s.economy || s.dayOpen) return;
  if (cmd.kind === 'buildEnd') {
    s.undo = [];
    return;
  }
  if (cmd.kind === 'undo') {
    const prev = s.undo?.pop();
    if (prev) {
      s.hospital = prev.hospital;
      s.economy.cash = prev.cash;
    }
    return;
  }
  // в главе кампании строят только то, что глава разрешает
  if (s.campaign && cmd.cmd.kind === 'room' && !plotOf(db, s.campaign)?.build.includes(cmd.cmd.type)) return;
  const r = build(db, { hospital: s.hospital, cash: s.economy.cash }, cmd.cmd);
  if (!r.ok) return;
  s.undo = [...(s.undo ?? []), { hospital: s.hospital, cash: s.economy.cash }].slice(-UNDO_DEPTH);
  s.hospital = r.state.hospital;
  s.economy.cash = r.state.cash;
  // снесли помещение — кто в нём работал, в резерве
  const gone = cmd.cmd.kind === 'demolish' ? cmd.cmd.room : undefined;
  if (gone && s.staff?.some(m => m.room === gone)) s.staff = s.staff.map(m => (m.room === gone ? { ...m, room: undefined } : m));
}

export function current(s: ShiftState): ShiftPatient | undefined {
  return s.current ? s.patients[s.current] : undefined;
}

// --- день ---------------------------------------------------------------------------

function emptySummary(day: number): DaySummary {
  return { day, arrived: 0, seen: 0, left: 0, unseen: 0, correct: 0, partly: 0, wrong: 0, grades: { A: 0, B: 0, C: 0, D: 0 }, money: 0, returnsPlanned: 0, returnsToday: 0 };
}

/**
 * Кто придёт сегодня: по записи, без записи и повторно. Каждый пациент — из своей ветви
 * (слот, номер без записи, чей возврат), поэтому новый повтор не меняет остальных.
 */
function planDay(db: ContentDb, s: ShiftState) {
  if (s.flow) return planFlow(db, s);
  const d = s.day;
  const base = (d - 1) * DAY;
  const r = branch(s, `day:${d}`);
  // песочница: с репутацией записываются и приходят чаще или реже (spec 2026-09-own-hospital)
  const flow = s.economy ? flowOf(db, s.economy.reputation ?? db.economy.reputation.start) : 100;
  const plan: { t: number; kind: VisitKind; key: string; ret?: PlannedReturn; to?: string; only?: readonly Id[] }[] = [];
  // какие отделения больница принимает сегодня (часть 30): с работающей смотровой приёмного — и хирургию
  const admits = departmentsOf(db, s);
  // запись: у вашего кабинета и у каждого нанятого врача — своя (spec 2026-09-hired-doctors);
  // ветви вашей записи — прежние, поэтому без врачей день тот же. К специалисту (spec 2026-10-chapter-4,
  // часть 59) записываются с болезнями его профиля, которых больница принимает: нет таких — записи к нему нет
  const desks = colleaguesOf(db, s);
  for (let k = 0; k <= desks.length; k++) {
    const m = k === 0 ? undefined : desks[k - 1];
    const only = m ? profileHere(db, m, admits) : undefined;
    if (only?.length === 0) continue;
    for (let slot = 0; slot < SLOTS; slot++) {
      const key = k === 0 ? `slot:${slot}` : `desk:${k}:slot:${slot}`;
      const sr = r.fork(key);
      if (!sr.chance(Math.min(10000, Math.round((SLOT_BOOKED * flow) / 100)))) continue;
      const late = sr.range(-5, 10);
      plan.push({ t: base + SHIFT_START + Math.max(0, slot * SLOT_MIN + late) * MIN, kind: 'appointment', key, ...(m && only ? { to: m.id, only } : {}) });
    }
  }
  const wr = r.fork('walk-ins');
  const walkIns = Math.round((wr.range(WALK_INS[0], WALK_INS[1]) * flow) / 100);
  for (let i = 0; i < walkIns; i++) {
    const w = wr.fork(`walk:${i}`);
    const minute = Math.min(w.range(0, 330), w.range(0, 330)); // меньшее из двух — ближе к утру
    plan.push({ t: base + SHIFT_START + minute * MIN, kind: 'walkIn', key: `walk:${i}` });
  }
  // вернулся с другой болезнью (часть 41б): инсульт после ТИА привозит скорая — туда, где его
  // принимают; больница его не принимает — человека увезли в другую
  for (const ret of s.returns.filter(x => x.day === d)) {
    const as = ret.as ? db.conditions[ret.as] : undefined;
    if (as && !admits.includes(as.department)) continue;
    const kind: VisitKind = as?.arrival === 'ambulance' ? 'ambulance' : 'return';
    plan.push({ t: base + SHIFT_START + r.fork(`return:${ret.of}`).range(0, 120) * MIN, kind, key: `return:${ret.of}`, ret });
  }
  // кампания: в первый день главы первые пришедшие — с болезнями, заданными главой (обучение
  // с наставником); человек — тот же, что пришёл бы, если болезнь у него обычна. У главы с помещением
  // обучения (часть 45б) — в первый её день, когда оно работает
  const tutorial = s.campaign && d === tutorialDay(db, s) ? (chapterOf(db, s.campaign)?.tutorial ?? []) : [];
  // скорая (spec 2026-09-chapter-2, часть 27): работает смотровая приёмного — машины в любое
  // время смены, из своей ветви дня; без смотровой день прежний
  if (emergencyBays(db, s).length > 0) {
    const ar = r.fork('ambulance');
    const [lo, hi] = ambulanceOf(db, s);
    const cars = ar.range(lo, hi);
    // обучение со скорой (часть 34б): первая машина — в первые двадцать минут смены
    const early = tutorial.some(x => x.ambulance);
    for (let i = 0; i < cars; i++) {
      const minute = ar.fork(`amb:${i}`).range(0, (SHIFT_END - SHIFT_START) / MIN - 30);
      plan.push({ t: base + SHIFT_START + (early && i === 0 ? Math.min(minute, TUTORIAL_AMBULANCE_MIN) : minute) * MIN, kind: 'ambulance', key: `amb:${i}` });
    }
  }
  // у главы с промежутком обучения (часть 46в) заданные приходят по порядку и не разом
  const gap = s.campaign ? chapterOf(db, s.campaign)?.tutorialGap : undefined;
  const spaced = tutorial.length > 0 && gap !== undefined ? spaceTutorial(tutorial, plan, gap * MIN, base + SHIFT_END - 30 * MIN) : undefined;
  plan.sort((a, b) => a.t - b.t || (a.key < b.key ? -1 : 1));
  // заданного пациента получает первый пришедший того же вида: скорая — скорая (часть 34б); записанный к
  // специалисту — не он: заданный — для вас
  const taught = new Set<number>();
  const departments = admits;
  // «Больные: разнообразие» (spec 2026-10-variety) — кроме кампании: на частоты жизни настроены главы
  const varied = s.meta.variety === true && s.meta.mode !== 'campaign';
  plan.forEach((a, i) => {
    const id = `${d}-${String(i + 1).padStart(2, '0')}`;
    const gen = { department: s.meta.department, departments, season: s.meta.season, ...(varied ? { variety: true } : {}) };
    const k = spaced ? (spaced.get(a) ?? -1) : a.ret || a.to ? -1 : tutorial.findIndex((x, j) => !taught.has(j) && !!x.ambulance === (a.kind === 'ambulance'));
    const teach = k >= 0 ? tutorial[k] : undefined;
    if (teach) taught.add(k);
    const patient = a.ret
      ? returningPatient(db, s, a.ret)
      : teach
        ? typicalPatient(
          db, n => fnv1a(`${s.meta.seed}:${d}:${a.key}${n ? `:${n}` : ''}`), { ...gen, primary: teach.condition, ...(teach.params ? { params: teach.params } : {}) }, TUTORIAL_TRIES, teach.age,
          // с заданными жалобами (часть 60б)
          p => treatable(db, p) && (teach.complaints ?? []).every(f => p.complaints.includes(f)),
        )
        : a.kind === 'ambulance'
          ? ambulancePatient(db, s, d, a.key, departments, varied)
          // пришёл сам (часть 41а): инсульта у него нет — его привозит скорая; к специалисту — с болезнью профиля (часть 59)
          : generatePatient(db, fnv1a(`${s.meta.seed}:${d}:${a.key}`), { ...gen, walkIn: true, ...(a.only ? { only: a.only } : {}) });
    // вернувшийся — и с теми отделениями, с какими его приняли в первый раз
    const own = a.ret ? [...new Set([...(s.patients[a.ret.of]?.departments ?? []), ...departments])] : departments;
    s.patients[id] = {
      id, patient, arriveT: a.t, kind: a.kind, triage: 'green', status: 'coming', queuedT: 0, wait: 0, patience: 0,
      results: [], pending: [], done: [], step: 0, spent: { seconds: 0, money: 0 }, draft: { treatments: [], setting: 'home' },
      ...(a.ret ? { returnOf: a.ret.of, returnReason: a.ret.reason } : {}),
      ...(a.to ? { to: a.to } : {}),
      ...(teach ? { taught: true as const } : {}),
      // выписали из палаты недолеченным — вернулся хуже: новый случай стационара не оплатят (часть 35)
      ...(a.ret && s.patients[a.ret.of]?.closed?.stay?.end === 'early' ? { afterEarly: true as const } : {}),
      ...(own.length > 1 ? { departments: own } : {}),
      // скорая не платит отдельно: привезённый — случай ОМС (spec 2026-09-chapter-2, «Баланс»;
      // скорую и экстренную помощь оказывают бесплатно — 323-ФЗ, ст. 11 и 35)
      ...(s.economy ? { payer: a.kind === 'ambulance' ? 'oms' : payerOf(db, s.meta.seed, id, s.economy.reputation ?? db.economy.reputation.start) } : {}),
    };
    schedule(s, a.t, { kind: 'arrive', id });
  });
  schedule(s, base + SHIFT_END, { kind: 'shiftEnd' });
}

// --- поток для ПК (spec 2026-10-engine-speed, ч. 2) -------------------------------------------------------------------

/**
 * Сутки в потоке (spec 2026-10-day): следующая планёрка — в 08:00, обход нанятых врачей — в свой час; вернувшиеся — в первые
 * два часа приёма; первый пришедший сам и первая машина скорой — по своим часам с 08:00; остальных назначает приход
 * предыдущего (`flowArrive`). Пациентов ещё нет — они генерируются к приходу. Конца приёма, который останавливал бы день,
 * нет: часы идут сутки за сутками.
 */
function planFlow(db: ContentDb, s: ShiftState) {
  const d = s.day;
  const base = (d - 1) * DAY;
  const r = branch(s, `day:${d}`);
  const admits = departmentsOf(db, s);
  schedule(s, base + SHIFT_START + DAY, { kind: 'morning' });
  schedule(s, base + roundsAt(db), { kind: 'rounds' });
  scheduleDuty(db, s);
  const back = returnWindow(hoursOf(db, s.flow!));
  for (const ret of s.returns.filter(x => x.day === d)) {
    const as = ret.as ? db.conditions[ret.as] : undefined;
    if (as && !admits.includes(as.department)) continue;
    schedule(s, base + back.from + r.fork(`return:${ret.of}`).range(0, back.minutes) * MIN, { kind: 'flow', stream: 'ret', n: 0, of: ret.of });
  }
  scheduleFlow(db, s, 'walk', 0, base + SHIFT_START);
  // больница ПК (spec 2026-10-build): смотровую могут построить днём — машины едут, а принимает их `flowArrive`
  if (emergencyBays(db, s).length > 0 || s.hospital?.site) scheduleFlow(db, s, 'amb', 0, base + SHIFT_START);
  // по записи к специалисту (spec 2026-10-specialists): у каждого свой поток — только в потоке от больницы
  if (s.flow?.auto) for (const to of capacityOf(db, s).booked) scheduleFlow(db, s, 'book', 0, base + SHIFT_START, to);
}

/**
 * Пересмены до следующей планёрки (spec 2026-10-staff-shifts): начала дневной и ночной смен — после этой минуты и до 08:00
 * следующих суток включительно; уже назначенные — не дважды. Только когда в штате есть люди со сменой: больница без смен
 * (сохранения до них) живёт, как прежде. Найм со сменой зовёт это сам — сутки, начатые без смен.
 */
export function scheduleDuty(db: ContentDb, s: ShiftState) {
  const day = db.economy.staff.shifts?.day;
  if (!s.flow || !day || !s.staff?.some(m => m.shift !== undefined)) return;
  const until = s.day * DAY + SHIFT_START;
  const times: number[] = [];
  for (let base = Math.floor(s.t / DAY) * DAY; base <= until; base += DAY) for (const h of day) times.push(base + h * 3600);
  for (const t of times.sort((a, b) => a - b)) {
    if (t > s.t && t <= until && !s.events.some(e => e.t === t && e.event.kind === 'duty')) schedule(s, t, { kind: 'duty' });
  }
}

/**
 * Пересменка (spec 2026-10-staff-shifts): кто пришёл, тот на месте, — больница и «кто на месте» считаются по новой смене
 * сами (`hospitalCtx`); ушедший со сменой врач доводит начатые приёмы (`lateOf`). Ждущих в очереди врача, ушедшего со
 * сменой, записывают к тем, кто в смене, как пришедших (`docFor`); сменить его некому — их он тоже доводит. Поток от
 * больницы — по новой больнице; свободные зовут ждущих.
 */
function duty(db: ContentDb, s: ShiftState) {
  const was = s.flow?.auto ? capacityOf(db, s, s.t - 1) : undefined;
  // настроение (spec 2026-10-staff-mood): дошёл ли ушедший со сменой до предела к её концу; уходящие сами — прочь, их
  // зарплата — по эту минуту
  shiftEnded(db, s);
  if (leaversDue(s)) {
    accrue(db, s);
    depart(s, occupied(db, s).staff);
  }
  // резерв (spec 2026-10-staff-mood, часть 5): замещающий, что на планёрке ещё вёл пациента, — в резерв сейчас; ушедшего
  // сам — заменить; зарплата — по эту минуту по прежнему штату
  cover(s, () => occupied(db, s).staff, () => accrue(db, s));
  // усталость (spec 2026-10-staff-shifts, часть 2): ушедшие со сменой отдохнут дома, пришедшие — отдохнувшие
  dropCrew(db, s);
  const list = colleaguesOf(db, s);
  for (const x of s.queue) {
    const p = s.patients[x];
    if (p.doc === undefined || p.by !== undefined || list.some(m => m.id === p.doc)) continue;
    const m = docFor(db, s, p, list);
    if (m) p.doc = m.id;
  }
  reflow(db, s, was);
  staffDesks(db, s);
  // часть 2б: пришедшие делать обследования — их перерывы и туалет
  crewAll(db, s);
  // каталка (spec 2026-10-orderlies): пришли санитары и медсёстры — лежачие, кого некому было везти
  retryRides(db, s);
}

/**
 * В час, по часам суток (spec 2026-10-day): пришедших сами — только в часы приёма, по форме `walk` базы, с репутацией чаще
 * или реже, как запись в песочнице; машин скорой — по форме `ambulance`, круглые сутки.
 */
function flowRate(db: ContentDb, s: ShiftState, stream: 'walk' | 'amb' | 'book', hour: number): number {
  // ось «Управление» (spec 2026-10-difficulty): поток — сами, по записи, скорая — на множитель уровня
  return scaled(flowBase(db, s, stream, hour), manageOf(db, s).inflow);
}

function flowBase(db: ContentDb, s: ShiftState, stream: 'walk' | 'amb' | 'book', hour: number): number {
  const f = s.flow!;
  const day = dayOf(db);
  // поток от больницы (spec 2026-10-economy): сами — по кабинетам и репутации, скорая — по местам смотровой; по записи —
  // к каждому специалисту поровну, по той же форме часов приёма, что сами (spec 2026-10-specialists)
  if (f.auto) {
    const c = capacityOf(db, s);
    if (stream === 'amb') return (ambulancePerHour(db, c) * day.ambulance[hour]) / 100;
    const [open, close] = hoursOf(db, f);
    if (hour < open || hour >= close) return 0;
    const reputation = s.economy?.reputation ?? db.economy.reputation.start;
    return ((stream === 'book' ? bookedPerHour(db, reputation) : walkPerHour(db, c, reputation)) * day.walk[hour]) / 100;
  }
  if (stream === 'book') return 0;
  if (stream === 'amb') return ((f.ambulancePerHour ?? 0) * day.ambulance[hour]) / 100;
  const [open, close] = hoursOf(db, f);
  if (hour < open || hour >= close) return 0;
  const k = s.economy ? flowOf(db, s.economy.reputation ?? db.economy.reputation.start) : 100;
  return (f.perHour * k * day.walk[hour]) / 10000;
}

/**
 * Следующий приход потока после `from`: промежуток — показательный, из своей ветви зерна `flow:<сутки>:<поток>:<номер>`;
 * логарифм — целочисленный (`log2`, как у фибрилляции); частота — по часам суток (`arrivalAfter`, spec 2026-10-day). Приход
 * может прийтись и на следующие сутки — его отменит планёрка: в 08:00 потоки начинаются заново.
 */
function scheduleFlow(db: ContentDb, s: ShiftState, stream: 'walk' | 'amb' | 'book', n: number, from: number, to?: string) {
  const u = branch(s, `flow:${s.day}:${stream}:${to ? `${to}:` : ''}${n}`).range(1, P_ONE) / P_ONE;
  const t = arrivalAfter(from, -log2(u) * Math.LN2, h => flowRate(db, s, stream, h));
  if (t !== undefined) schedule(s, t, { kind: 'flow', stream, n, ...(to ? { to } : {}) });
}

/** Пришёл следующий из потока: пациент генерируется сейчас — из своего зерна, тот же, когда бы его ни сгенерировали. */
function flowArrive(db: ContentDb, s: ShiftState, ev: Extract<ShiftEvent, { kind: 'flow' }>, notices: Notice[]) {
  // по записи (spec 2026-10-specialists): к тому, кто сегодня принимает и к кому записываются; нет его — поток кончился,
  // вернётся — заново (`rebook`)
  const to = ev.stream === 'book' ? colleaguesOf(db, s).find(m => m.id === ev.to && capacityOf(db, s).booked.includes(m.id)) : undefined;
  if (ev.stream === 'book' && !to) return;
  // больница ПК (spec 2026-10-build): в закрытую не приходят — следующий в свой час; скорая — если работает смотровая
  if (s.hospital?.site && !siteOpen(db, s, ev.stream === 'book' ? 'walk' : ev.stream)) {
    if (ev.stream !== 'ret') scheduleFlow(db, s, ev.stream, ev.n + 1, s.t, ev.to);
    return;
  }
  const d = s.day;
  const admits = departmentsOf(db, s);
  const varied = s.meta.variety === true;
  const gen = { department: s.meta.department, departments: admits, season: s.meta.season, ...(varied ? { variety: true } : {}) };
  const ret = ev.stream === 'ret' ? s.returns.find(x => x.day === d && x.of === ev.of) : undefined;
  if (ev.stream === 'ret' && (!ret || !s.patients[ret.of])) return;
  const as = ret?.as ? db.conditions[ret.as] : undefined;
  const kind: VisitKind = ev.stream === 'amb' || as?.arrival === 'ambulance' ? 'ambulance' : ev.stream === 'ret' ? 'return' : ev.stream === 'book' ? 'appointment' : 'walkIn';
  const key = ev.stream === 'ret' ? `return:${ev.of}` : ev.stream === 'book' ? `flow:book:${ev.to}:${ev.n}` : `flow:${ev.stream}:${ev.n}`;
  const id = ev.stream === 'ret' ? `${d}-r${ev.of}` : ev.stream === 'book' ? `${bookPrefix(d, ev.to!)}${String(ev.n).padStart(3, '0')}` : `${d}-${ev.stream === 'amb' ? 'a' : 'w'}${String(ev.n).padStart(4, '0')}`;
  // сценарий ПК (spec 2026-10-scenario-1): первые пришедшие сами — заданные сценарием, по порядку
  const teach = ev.stream === 'walk' ? tutorialNext(db, s) : undefined;
  // записанный к специалисту болен болезнью его профиля, которую больница принимает (как запись «Анамнеза», часть 59)
  const patient = ret ? returningPatient(db, s, ret)
    : ev.stream === 'amb' ? ambulancePatient(db, s, d, key, admits, varied)
      : teach ? taughtPatient(db, s, d, key, teach, gen)
        : generatePatient(db, fnv1a(`${s.meta.seed}:${d}:${key}`), { ...gen, walkIn: true, ...(to ? { only: profileHere(db, to, admits) } : {}) });
  const own = ret ? [...new Set([...(s.patients[ret.of]?.departments ?? []), ...admits])] : admits;
  s.patients[id] = {
    id, patient, arriveT: s.t, kind, triage: 'green', status: 'coming', queuedT: 0, wait: 0, patience: 0,
    results: [], pending: [], done: [], step: 0, spent: { seconds: 0, money: 0 }, draft: { treatments: [], setting: 'home' },
    ...(ret ? { returnOf: ret.of, returnReason: ret.reason } : {}),
    ...(ret && s.patients[ret.of]?.closed?.stay?.end === 'early' ? { afterEarly: true as const } : {}),
    ...(to ? { to: to.id } : {}),
    ...(teach ? { taught: true as const } : {}),
    ...(own.length > 1 ? { departments: own } : {}),
    ...(s.economy ? { payer: kind === 'ambulance' ? 'oms' : payerOf(db, s.meta.seed, id, s.economy.reputation ?? db.economy.reputation.start) } : {}),
  };
  if (teach) s.campaign!.taught = (s.campaign!.taught ?? 0) + 1;
  if (ev.stream !== 'ret') scheduleFlow(db, s, ev.stream, ev.n + 1, s.t, ev.to);
  arrive(db, s, s.patients[id], notices);
  // путь пациента (spec 2026-10-flow-ui): стоит ли и почему — решил приход (spec 2026-10-own-hall); сел ли на скамейку у
  // двери (spec 2026-10-door-benches)
  const stood = s.patients[id].stands;
  const sat = s.patients[id].bench !== undefined ? { bench: true as const } : {};
  journey.arrived(s, s.patients[id], () => colleaguesOf(db, s).filter((m, _, list) => colleagueTakes(db, s, s.patients[id], m, list)).length, () => !!teach || forPlayer(db, s, s.patients[id]), stood === 'far' ? { far: db.inflow?.hall ?? 0, ...sat } : stood === 'full' ? { full: true, ...sat } : {});
}

/**
 * Следующий заданный больной сценария ПК (spec 2026-10-scenario-1): пока не пришли все из списка и работает ваш кабинет.
 * Нанятые врачи заданных не берут (`taught`) — без вашего кабинета их некому принять: приходят обычные, а заданные ждут его.
 */
function tutorialNext(db: ContentDb, s: ShiftState): TutorialPatient | undefined {
  const sc = scenarioOf(db, s.campaign);
  const k = s.campaign?.taught ?? 0;
  if (!sc || k >= sc.tutorial.length) return undefined;
  const ctx = hospitalCtx(db, s);
  const mine = doctorRoom(ctx.plan);
  return mine !== undefined && ctx.working.has(mine) ? sc.tutorial[k] : undefined;
}

/**
 * Заданный больной: болезнь — из записи, человек — типичный для неё, как у главы «Анамнеза» (`planDay`), из зерна
 * пришедшего на его месте.
 */
function taughtPatient(db: ContentDb, s: ShiftState, d: number, key: string, teach: TutorialPatient, gen: GenContext) {
  return typicalPatient(
    db, n => fnv1a(`${s.meta.seed}:${d}:${key}${n ? `:${n}` : ''}`), { ...gen, primary: teach.condition, ...(teach.params ? { params: teach.params } : {}) }, TUTORIAL_TRIES, teach.age,
    p => treatable(db, p) && (teach.complaints ?? []).every(f => p.complaints.includes(f)),
  );
}

/**
 * Отметка окна в сценарии ПК (spec 2026-10-scenario-1): ход сценария хранит её сам — после загрузки письмо не придёт второй
 * раз, закрытая подсказка не вернётся. Письмо к состоянию подсказки — одно на состояние, раз и не при «Без обучения»; вне
 * сценария — ничего.
 */
function mark(db: ContentDb, s: ShiftState, cmd: Extract<Command, { kind: 'mark' }>) {
  const c = s.campaign;
  const sc = scenarioOf(db, c);
  if (!c || !sc) return;
  if (cmd.what === 'off') {
    const tips = (c.tips ??= { shown: [] });
    if (cmd.on) tips.off = true;
    else delete tips.off;
    return;
  }
  if (cmd.what === 'guide') {
    if (cmd.on) delete c.guideOff;
    else c.guideOff = true;
    return;
  }
  const id = cmd.id;
  switch (cmd.what) {
    case 'hint': {
      const l = sc.letters.find(x => typeof x.when === 'object' && 'hint' in x.when && x.when.hint === id);
      if (l && !c.tips?.off && !c.letters.some(x => x.id === l.id)) c.letters.push({ id: l.id, day: s.day });
      return;
    }
    case 'closed':
      if (!(c.hints ??= []).includes(id)) c.hints.push(id);
      return;
    case 'read': {
      const l = c.letters.find(x => x.id === id);
      if (l) l.read = true;
      return;
    }
    case 'tip': {
      const tips = (c.tips ??= { shown: [] });
      if (!tips.shown.includes(id)) tips.shown.push(id);
      return;
    }
  }
}

/**
 * Больница ПК открыта (spec 2026-10-build, «Стройка в любой момент»): сами приходят, когда работают регистратура, зона
 * ожидания и кабинет врача с врачом (`openBlocks`, как открытие смены «Анамнеза»); скорую принимают, когда работает
 * смотровая приёмного.
 */
export function siteOpen(db: ContentDb, s: ShiftState, stream: 'walk' | 'amb' | 'ret', at = s.t): boolean {
  if (stream === 'amb') return emergencyBays(db, s).length > 0;
  const ctx = hospitalCtx(db, s, at);
  return openBlocks(db, ctx.plan, ctx.working, ctx.staffed).length === 0;
}

/**
 * Медсестра приёмного сортирует привезённого по листу передачи — по шкале (поток для ПК: игрок не сортирует каждого), и
 * свободный нанятый врач его зовёт.
 */
function nurseSorts(db: ContentDb, s: ShiftState, p: ShiftPatient) {
  if (!p.scale || p.sorted) return;
  p.triage = p.scale.triage;
  p.sorted = true;
  ambulanceDay(s).sorted++;
  enqueue(s, p, p.arriveT);
  staffDesks(db, s);
}

/**
 * Ушедшего — из состояния в строку журнала (поток для ПК): ушёл, не дождавшись, не принят до конца дня или принят и
 * отпущен, а разбор досчитан. Кого ждут обратно, кто лежит или в операционной, — остаются. Его события — тоже прочь.
 */
function evict(s: ShiftState, p: ShiftPatient) {
  if (!s.flow) return;
  journey.gone(s, p);
  const c = p.closed;
  const end = p.status === 'left' ? 'left' : p.status === 'unseen' ? 'unseen' : p.status === 'done' ? 'done' : undefined;
  // ваши приёмы — остаются (их разбор открывают), как и те, кого ждут обратно и кто лежит; приём нанятого врача уходит и без
  // разбора — его в потоке не считают
  if (!end || (c && (!c.by || c.outcome.returns || c.stay || STAYS.includes(c.plan.setting)))) return;
  if (s.returns.some(r => r.of === p.id)) return;
  const row: GoneRow = {
    id: p.id, kind: p.kind, end, arriveT: p.arriveT, ...(p.calledT !== undefined ? { calledT: p.calledT } : {}), truth: p.patient.truth.conditions[0].id,
    ...(c?.by ? { by: c.by } : {}),
    ...(c ? { diagnosis: c.diagnosis, verdict: c.verdict, ...(c.review ? {} : { overall: c.grades.overall }), setting: c.plan.setting } : {}),
    ...(c && c.grades.safety !== 'A' ? { unsafe: true as const } : {}),
    ...(p.returnOf ? { returnOf: p.returnOf } : {}), ...(p.returnReason ? { returnReason: p.returnReason } : {}),
    ...(p.paid ? { paid: p.paid.paid } : {}),
  };
  (s.gone ??= []).push(row);
  delete s.patients[p.id];
  s.events = s.events.filter(e => !('id' in e.event) || e.event.id !== p.id);
  keepCard(s, p);
}

/**
 * Карта ушедшего (spec 2026-10-discharged-card): он сам, каким ушёл, — для чтения: диагноз и назначенное, вопросы, ответы и
 * результаты. Сутки после ухода и не больше `journey.MAX_DONE` последних, как его путь; старые убираются здесь же — по
 * часам ухода, при любом шаге времени одинаково.
 */
function keepCard(s: ShiftState, p: ShiftPatient) {
  const past = (s.past ??= []);
  past.push({ t: s.t, p });
  let old = 0;
  while (old < past.length && (past[old].t <= s.t - journey.KEEP || past.length - old > journey.MAX_DONE)) old++;
  if (old > 0) past.splice(0, old);
}

/**
 * Заданные пациенты главы с промежутком обучения (spec 2026-10-chapter-3, часть 46в): по порядку списка, каждый — первому
 * пришедшему того же вида не раньше чем через `gap` после предыдущего заданного (первый — как прежде, первому пришедшему).
 * Машины скорой позже не нашлось — приезжает ближайшая к этому сроку из оставшихся, но не позже `last`. Кому из плана
 * дня — какой по списку.
 */
function spaceTutorial(tutorial: readonly TutorialPatient[], plan: { t: number; kind: VisitKind; key: string; ret?: PlannedReturn; to?: string }[], gap: number, last: number) {
  const out = new Map<object, number>();
  let after = -Infinity;
  tutorial.forEach((x, j) => {
    const free = plan.filter(a => !a.ret && !a.to && !out.has(a) && !!x.ambulance === (a.kind === 'ambulance')).sort((a, b) => a.t - b.t || (a.key < b.key ? -1 : 1));
    let a = free.find(e => e.t >= after);
    if (!a && x.ambulance && free.length > 0 && after <= last) {
      a = free[free.length - 1];
      a.t = after;
    }
    if (!a) return;
    out.set(a, j);
    after = a.t + gap;
  });
  return out;
}

/**
 * День смены с обучением в главе (spec 2026-10-chapter-3, часть 45б): первый день главы; у главы с
 * помещениями обучения (`tutorialRoom`) — первый её день, когда они работают, — его запоминает ход главы:
 * главе 3 нужен кабинет КТ, без него неврологию не привозят; главе 4 (spec 2026-10-chapter-4, часть 60б) — эндоскопия и
 * бокс: без них кровотечение и заразного переводят.
 */
function tutorialDay(db: ContentDb, s: ShiftState): number | undefined {
  const c = s.campaign;
  const ch = c ? chapterOf(db, c) : undefined;
  if (!c || !ch) return undefined;
  if (ch.tutorialRoom && c.tutorialDay === undefined && s.day > c.since) {
    const ctx = hospitalCtx(db, s);
    if (ch.tutorialRoom.every(t => ctx.plan.rooms.some(r => r.type === t && ctx.working.has(r.id)))) c.tutorialDay = s.day;
  }
  return tutorialDayOf(ch, c);
}

/**
 * Кого везёт скорая: человек — как любой пришедший, болезнь — из отделений больницы с весом у
 * него (возраст, привычки, камни — часть 30) и по тяжести: лёгкое не везут. У болезни с тяжестью
 * — чаще тяжёлая, жребий ветви машины.
 */
function ambulancePatient(db: ContentDb, s: ShiftState, d: number, key: string, departments: readonly Id[], variety: boolean) {
  const a = db.economy.ambulance;
  const severe = branch(s, `ambulance:${d}:${key}`).fork('severe').chance(a.severe * 100);
  return generatePatient(db, fnv1a(`${s.meta.seed}:${d}:${key}`), {
    department: s.meta.department, departments, season: s.meta.season, carried: a.weight, ...(severe ? { params: { severity: 'severe' } } : {}), ...(variety ? { variety: true } : {}),
  });
}

/**
 * Тот же человек с той же болезнью, но новый её день (`generatePatient`, `visit`).
 * Вернулся хуже — у болезни с тяжестью она становится тяжёлой.
 */
function returningPatient(db: ContentDb, s: ShiftState, ret: PlannedReturn) {
  const prev = s.patients[ret.of];
  let visit = 1;
  for (let x = prev; x?.returnOf; x = s.patients[x.returnOf]) visit++;
  // вернулся с другой болезнью (часть 41б) — тот же человек, болезнь новая
  const primary = ret.as ?? prev.patient.truth.conditions[0].id;
  const severe = !ret.as && ret.reason === 'worse' && db.conditions[primary].params?.severity?.severe !== undefined;
  return generatePatient(db, prev.patient.seed, {
    department: s.meta.department, season: s.meta.season, primary, visit, ...(severe ? { params: { severity: 'severe' } } : {}),
  });
}

function closeDay(db: ContentDb, s: ShiftState) {
  // в потоке для ПК день не закрывают: сутки кончаются сами, в 08:00, а часы идут дальше (`morning`, spec 2026-10-day)
  if (!s.dayOpen || s.flow) return;
  // итоги дня — полные: отложенные разборы приёмов нанятых врачей досчитываются (spec 2026-10-engine-speed, ч. 1); в потоке
  // для ПК их нет: оценку считают только приёмам игрока (решение владельца 16.10.2026)
  settleReviews(db, s);
  for (const p of Object.values(s.patients)) {
    if (p.status === 'waiting' || p.status === 'inRoom' || p.status === 'away' || p.status === 'coming') {
      if (p.status !== 'coming') s.summary.unseen++;
      p.status = 'unseen';
    }
  }
  s.queue = [];
  s.current = undefined;
  s.events = [];
  s.dayOpen = false;
  nightOperations(db, s);
  nightDeaths(db, s);
  wardLying(db, s);
  if (s.economy && s.hospital) settle(db, s);
  // журнал ушедших — по приходу: итог дня тот же, когда бы ни досчитывали разборы и ни выгружали приёмы
  if (s.gone) s.gone.sort((x, y) => x.arriveT - y.arriveT || (x.id < y.id ? -1 : 1));
  s.history.push({ ...s.summary, grades: { ...s.summary.grades } });
  // кампания: задания и письма — по итогам дня, в том числе сегодняшнего
  if (s.campaign) {
    const got = campaignEvening(db, { campaign: s.campaign, history: s.history, hospital: s.hospital, staff: s.staff }, s.day);
    s.summary.campaign = got;
    s.history[s.history.length - 1].campaign = got;
  }
  // песочница: кто работал — на смену опытнее; вечером — новые кандидаты
  if (s.staff && s.hospital) {
    s.staff = s.staff.map(m => grow(db, m));
    const ch = s.campaign ? chapterOf(db, s.campaign) : undefined;
    const c = applicantsOf(db, s.meta.seed, s.day, s.nextStaff ?? 1, s.campaign ? (ch ? builtIn(db, ch) : () => false) : undefined);
    s.candidates = c.list;
    s.nextStaff = c.next;
  }
}

/** Лежащие в конце суток — в итог: сколько, из них в ПИТ, реанимации, боксах, тяжёлых. */
function wardLying(db: ContentDb, s: ShiftState) {
  const lying = inpatientsOf(s);
  if (lying.length > 0 || s.summary.ward) {
    const day = wardDay(s);
    day.lying = lying.length;
    // в ПИТ — отдельно (часть 38а), в реанимации — тоже (spec 2026-10-chapter-4, часть 47), в боксах — тоже (часть 49а)
    const ricu = lying.filter(p => inRicu(db, s, p)).length;
    const icu = lying.filter(p => inIcu(db, s, p)).length - ricu;
    const box = lying.filter(p => inBox(db, s, p)).length;
    if (icu > 0) day.icuLying = icu;
    if (ricu > 0) day.ricuLying = ricu;
    if (box > 0) day.boxLying = box;
    const heavy = lying.filter(p => p.stay?.heavy).length;
    if (heavy > 0) day.heavyLying = heavy;
  }
}

// --- сутки на ПК (spec 2026-10-day) -----------------------------------------------------------------------------------

/**
 * Планёрка (spec 2026-10-day): в 08:00 сутки потока для ПК кончаются, а часы идут дальше. Что «Анамнез» делает, закрывая
 * день (`closeDay`) и открывая следующий (`nextDay`), — здесь, кроме того, что на ПК идёт само по часам: кто в больнице, тот
 * на месте, очередь и события — те же, операционная работала ночью. Итог суток — ровно за 24 часа: каждый счётчик
 * прибавлялся в час события. Роста навыка и новых кандидатов нет: на ПК нанимают на месте, рост — персонал этапа Б. Настроение
 * нанятых — по прошедшим суткам (spec 2026-10-staff-mood): кто собирается уйти и кто уходит — в извещение планёрки; ночной,
 * что уходит, — сразу.
 */
function morning(db: ContentDb, s: ShiftState, notices: Notice[]) {
  // команды суток — с планёрки; время команды, на которой она пришлась, после 08:00 — первой строкой, чтобы повтор от снимка в
  // 08:00 дал то же; команда со временем не в `until` (`advanceBy`) допишет его сама (`apply`)
  morningAt = s.until === undefined ? s.t : undefined;
  s.journal = s.until !== undefined && s.until > s.t ? [{ kind: 'advance', seconds: s.until - s.t }] : [];
  // ночь (часть 28б «Анамнеза»): кому выпало умереть в ночь этих суток — сейчас, в итог этих суток
  nightDeaths(db, s);
  wardLying(db, s);
  if (s.economy && s.hospital) settle(db, s);
  // журнал ушедших — по приходу, как при закрытии дня «Анамнеза»
  if (s.gone) s.gone.sort((x, y) => x.arriveT - y.arriveT || (x.id < y.id ? -1 : 1));
  // узкие места суток для планёрки (spec 2026-10-economy): ожидание врача и койки — сейчас
  meeting.closeLoad(s, wardBeds(db, s).length + icuBeds(db, s).length + ricuBeds(db, s).length + boxBeds(db, s).length);
  const summary: DaySummary = { ...s.summary, grades: { ...s.summary.grades } };
  s.history.push(summary);
  // сценарий ПК (spec 2026-10-scenario-1): цели и письма по поводам — по закрытым суткам, тем же счётом, что вечер главы
  // «Анамнеза»; что выполнено и что пришло — в итог суток, на планёрку
  if (s.campaign) summary.campaign = campaignEvening(db, { campaign: s.campaign, history: s.history, hospital: s.hospital, staff: s.staff }, s.day);
  // утро — следующие сутки, без остановки
  s.day++;
  if (s.economy) s.economy.ledger = emptyLedger();
  s.summary = emptySummary(s.day);
  // умения врача (spec 2026-10-skills): выросшие за вчера — с утра
  if (s.meta.skillsNext) {
    setSkills(s, s.meta.skillsNext);
    delete s.meta.skillsNext;
  }
  // настроение (spec 2026-10-staff-mood): ночная смена кончилась — дошёл ли до предела; санузел — как у репутации, сейчас;
  // ночной, что не дождался ответа, уходит сейчас (дневной — в 20:00, в пересменку)
  shiftEnded(db, s);
  // рост (раздел 3): кто отработал прошедшие сутки — на смену ближе к навыку; до настроения — выросшему рынок уже выше
  const grew = growMorning(db, s);
  const plan = hospitalCtx(db, s).plan;
  const mood = moodMorning(db, s, plan.rooms.some(r => r.type === 'room.toilet' && plan.connected[r.id]));
  if (mood?.leave) depart(s, occupied(db, s).staff);
  // учёба и болезнь (разделы 4–5): вернувшиеся — с навыком и настроением; кто сегодня болеет, на смену не выйдет и денег за
  // неё не получит
  const back = backMorning(db, s);
  const sick = sickMorning(db, s, m => wageOf(db, m, manageOf(db, s).salary), (rub, m) => unpaidShift(s, rub, m.room));
  // резерв (spec 2026-10-staff-mood, часть 5; решение владельца #97): на место заболевшего — из резерва; вернувшийся — на своё
  const cov = cover(s, () => occupied(db, s).staff);
  const news = mood || grew || back || sick || cov ? { ...mood, ...(grew ? { grew } : {}), ...(back ? { back } : {}), ...(sick ? { sick } : {}), ...cov } : undefined;
  // аппараты, сломавшиеся с утра (FR-EQ-3): до следующего утра их нет
  const broken = breakdowns(db, s);
  if (broken.length > 0) s.broken = broken;
  else delete s.broken;
  // потоки — с 08:00 заново, ветвями новых суток: кто по вчерашнему счёту пришёл бы позже, не придёт — у показательного
  // промежутка нет памяти, и новый отсчёт даёт тот же поток
  s.events = s.events.filter(e => e.event.kind !== 'flow' || e.event.stream === 'ret');
  planFlow(db, s);
  // «Почему?» у цифр планёрки (spec 2026-10-why): от чего поток наступивших суток и сколько придёт
  if (s.flow?.auto) summary.inflow = inflowDay(db, s);
  prune(s);
  notices.push({ kind: 'morning', summary, ...(broken.length > 0 ? { broken } : {}), ...(news ? { staff: news } : {}) });
  // «стало хуже» (spec 2026-10-economy, «Обход»): ваши лежащие — для автопаузы
  for (const id of meeting.turnedWorse(s)) notices.push({ kind: 'worse', id });
}

/** Планёрка прошла посреди команды, чьё время идёт не через `until` (`advanceBy`): с какого часа `apply` допишет журнал суток. */
let morningAt: number | undefined;

/**
 * Часы амбулаторного приёма (spec 2026-10-day): с `open` до `close`, целые часы. Действуют сразу: тот, кто придёт сам
 * следующим, — по новым часам (тот же номер, промежуток — от этой минуты). Повторные этих суток уже назначены — придут в
 * своё время. Те же часы — ничего не меняется.
 */
function setHours(db: ContentDb, s: ShiftState, open: number, close: number): Notice[] {
  const f = s.flow;
  if (!f || !validHours(open, close)) return [];
  const [a, b] = hoursOf(db, f);
  if (a === open && b === close) return [];
  f.hours = [open, close];
  restream(db, s, 'walk');
  return [];
}

/**
 * Следующий приход потока — заново, от этой минуты (часы приёма, больница стала другой): тот же номер, промежуток — от сейчас
 * (у показательного промежутка нет памяти). Не назначен ни один (прежние часы или больница не пускали никого) — номер после
 * последнего пришедшего в эти сутки: имена `<сутки>-w<номер>` и `-a<номер>` не повторяются.
 */
function restream(db: ContentDb, s: ShiftState, stream: 'walk' | 'amb') {
  const next = s.events.find(e => e.event.kind === 'flow' && e.event.stream === stream);
  if (next) s.events = s.events.filter(e => e !== next);
  const n = next?.event.kind === 'flow' ? next.event.n : arrivedToday(s, `${s.day}-${stream === 'walk' ? 'w' : 'a'}`);
  // первый заданный больной сценария — вскоре после того, как заработал ваш кабинет (`FIRST_TAUGHT`)
  if (stream === 'walk' && !s.campaign?.taught && tutorialNext(db, s)) schedule(s, s.t + FIRST_TAUGHT, { kind: 'flow', stream, n });
  else scheduleFlow(db, s, stream, n, s.t);
}

/**
 * Первый заданный больной сценария (spec docs/specs/2026-11-demo.md, «Ощущение», О3): заработал ваш кабинет, а заданных ещё
 * не было — следующий пришедший сам придёт через столько секунд игры, а не через случайный промежуток потока (у амбулатории
 * с одним кабинетом — около 20 минут игры, минута настоящего времени на ×1). Дальше — по частоте потока.
 */
const FIRST_TAUGHT = 120;

/** Номер записанного к специалисту `to` в сутки `day` — без порядкового номера (spec 2026-10-specialists). */
const bookPrefix = (day: number, to: string) => `${day}-b${to}-`;

/**
 * Записываются к другим специалистам (spec 2026-10-specialists): кто перестал принимать — его следующий записанный не придёт;
 * кто начал — его поток с этой минуты, номера продолжают сегодняшние. Поток уже идёт (планёрка в 08:00 начала его раньше
 * пересменки, spec 2026-10-staff-shifts) — второго нет.
 */
function rebook(db: ContentDb, s: ShiftState, was: readonly string[], now: readonly string[]) {
  s.events = s.events.filter(e => e.event.kind !== 'flow' || e.event.stream !== 'book' || now.includes(e.event.to!));
  for (const to of now) {
    if (was.includes(to) || s.events.some(e => e.event.kind === 'flow' && e.event.stream === 'book' && e.event.to === to)) continue;
    scheduleFlow(db, s, 'book', arrivedToday(s, bookPrefix(s.day, to)), s.t, to);
  }
}

function arrivedToday(s: ShiftState, prefix: string): number {
  let n = 0;
  for (const id of [...Object.keys(s.patients), ...(s.gone ?? []).map(r => r.id)]) if (id.startsWith(prefix)) n = Math.max(n, Number(id.slice(prefix.length)) + 1);
  return n;
}

// --- поток от больницы (spec 2026-10-economy) --------------------------------------------------------------------------

const capacities = new WeakMap<HospitalCtx, Capacity>();

/**
 * Что в больнице принимает поток (spec 2026-10-economy, «Поток от больницы»): кабинеты нанятых врачей, которые принимают
 * пришедших сами (терапевт; специалист берёт только записанных к нему), — а нет таких, ваш кабинет, если он работает; места
 * работающих смотровых приёмного. Одно на больницу и штат; смены (spec 2026-10-staff-shifts) — по смене часа `at`.
 */
export function capacityOf(db: ContentDb, s: ShiftState, at = s.t): Capacity {
  const ctx = hospitalCtx(db, s, at);
  let c = capacities.get(ctx);
  if (!c) {
    const list = colleaguesOf(db, s, at);
    const hired = list.filter(m => !db.roles[m.role]?.profile).length;
    const yours = doctorRoom(ctx.plan);
    // к специалисту записываются с болезнями его профиля, которые больница принимает (spec 2026-10-specialists)
    const admits = departmentsOf(db, s);
    const booked = list.filter(m => (profileHere(db, m, admits)?.length ?? 0) > 0).map(m => m.id);
    c = { offices: hired > 0 ? hired : yours !== undefined && ctx.working.has(yours) ? 1 : 0, bays: emergencyBays(db, s).length, booked };
    capacities.set(ctx, c);
  }
  return c;
}

/**
 * Поток от больницы на сутки `s.day` (spec docs/specs/2026-10-why.md): по часам суток — с теми, кто в этот час в смене, сами
 * и по записи — в часы приёма и пока больница открыта, как их считает `flowRate`; что его задаёт — кабинеты, специалисты и
 * места смотровой в начале суток, репутация сейчас; на одного — кабинет и специалиста все часы приёма, место смотровой.
 * Всё — на множитель потока уровня «Управления», как у `flowRate`. Средние, до десятых.
 */
function inflowDay(db: ContentDb, s: ShiftState): InflowDay {
  const base = (s.day - 1) * DAY;
  const day = dayOf(db);
  const [open, close] = hoursOf(db, s.flow!);
  const reputation = s.economy?.reputation ?? db.economy.reputation.start;
  const one: Capacity = { offices: 1, bays: 1, booked: [] };
  let walk = 0;
  let book = 0;
  let amb = 0;
  let hours = 0;
  for (let h = 0; h < 24; h++) {
    // середина часа этих суток: с 08:00 до полуночи — тот же календарный день, раньше — следующий
    const at = base + (h * HOUR >= SHIFT_START ? 0 : DAY) + h * HOUR + HOUR / 2;
    const c = capacityOf(db, s, at);
    amb += (ambulancePerHour(db, c) * day.ambulance[h]) / 100;
    if (h < open || h >= close) continue;
    hours += day.walk[h] / 100;
    if (s.hospital?.site && !siteOpen(db, s, 'walk', at)) continue;
    walk += (walkPerHour(db, c, reputation) * day.walk[h]) / 100;
    book += (bookedPerHour(db, reputation) * c.booked.length * day.walk[h]) / 100;
  }
  const now = capacityOf(db, s, base + SHIFT_START + HOUR / 2);
  // ось «Управление» (spec 2026-10-difficulty): тот же множитель уровня, что у самого потока (`flowRate`)
  const k = manageOf(db, s).inflow;
  const tenth = (x: number) => Math.round(scaled(x, k) * 10) / 10;
  return {
    offices: now.offices, booked: now.booked.length, bays: now.bays, pct: Math.round(reputationPct(db, reputation) * 10) / 10,
    walk: tenth(walk), book: tenth(book), amb: tenth(amb),
    perOffice: tenth(walkPerHour(db, one, reputation) * hours), perDoctor: tenth(bookedPerHour(db, reputation) * hours), perBay: tenth(ambulancePerHour(db, one) * 24),
  };
}

/** Больница стала другой (стройка, найм, отложенный снос): поток, чья частота изменилась, — заново от этой минуты. */
function reflow(db: ContentDb, s: ShiftState, was: Capacity | undefined) {
  if (!was || !s.flow?.auto) return;
  const now = capacityOf(db, s);
  if (now.offices !== was.offices) restream(db, s, 'walk');
  if (now.bays !== was.bays) restream(db, s, 'amb');
  if (now.booked.join() !== was.booked.join()) rebook(db, s, was.booked, now.booked);
}

function ledgerOf(s: ShiftState): Ledger {
  const e = s.economy!;
  e.ledger ??= emptyLedger();
  return e.ledger;
}

/**
 * Вечер в песочнице: зарплаты, содержание аппаратов и помещений, процент на долг; касса;
 * репутация за день — и всё это в итоги дня (spec 2026-09-own-hospital, часть 9).
 */
function settle(db: ContentDb, s: ShiftState) {
  const e = s.economy!;
  const ledger = ledgerOf(s);
  // поток для ПК (spec 2026-10-economy): зарплаты и содержание уже записаны по часам — здесь остаток суток, до 08:00
  const upkeep = s.flow ? undefined : upkeepOf(db, s.hospital!);
  if (s.flow) accrue(db, s);
  if (upkeep) {
    ledger.expenses.salaries = salariesOf(s.staff ?? []);
    ledger.expenses.equipment = upkeep.equipment;
  }
  // ремонт сломанного с утра (FR-EQ-3)
  const repairs = repairsOf(db, s);
  if (repairs > 0) ledger.expenses.repairs = repairs;
  if (upkeep) ledger.expenses.rooms = upkeep.rooms;
  // лежащие ночуют в палате: койко-день у каждого (часть 26), по месту и тому, что с ними делают (`bedDayOf`); и палате
  // (spec docs/specs/2026-10-metrics-layer.md, часть 2)
  ledger.expenses.ward = inpatientsOf(s).reduce((a, p) => {
    const day = bedDayOf(db, s, p);
    roomExpense(s, p.stay!.room, day);
    return a + day;
  }, 0);
  // поток для ПК: выплата по кредиту (spec 2026-10-economy)
  if (s.flow) repay(s);
  const before = e.cash + incomeOf(ledger) - expensesOf(ledger);
  ledger.expenses.interest = interestOf(db, before);
  roomExpense(s, ROOMS_COMMON, ledger.expenses.interest);
  e.cash = before - ledger.expenses.interest;
  // поток для ПК: касса ниже предела — банк предлагает кредит до следующей планёрки
  if (s.flow) {
    const offer = offerOf(db, s);
    if (offer !== undefined) e.offer = offer;
    else delete e.offer;
  }
  // и ушедшие из потока для ПК — строками журнала (spec 2026-10-engine-speed, ч. 2)
  const today = [...Object.values(s.patients), ...(s.gone ?? [])].filter(p => dayAt(s, p.arriveT) === s.day);
  const waits = today.filter(p => p.calledT !== undefined).map(p => (p.calledT! - p.arriveT) / MIN);
  const ctx = hospitalCtx(db, s);
  // репутация — по всем приёмам больницы: и вашим, и нанятых врачей
  const col = Object.values(s.summary.colleagues ?? {});
  const change = reputationAfter(db, e.reputation ?? db.economy.reputation.start, {
    arrived: s.summary.arrived, left: s.summary.left, unseen: s.summary.unseen,
    correct: col.reduce((n, c) => n + c.correct, s.summary.correct), wrong: col.reduce((n, c) => n + c.wrong, s.summary.wrong),
    // вернувшийся с другой болезнью (часть 41б) — тоже: инсульт после ТИА привозит скорая
    returned: today.filter(p => p.returnOf !== undefined && (p.returnReason === 'worse' || p.returnReason === 'reaction')).length,
    ...(waits.length > 0 ? { meanWait: waits.reduce((a, b) => a + b, 0) / waits.length } : {}),
    toilet: ctx.plan.rooms.some(r => r.type === 'room.toilet' && ctx.plan.connected[r.id]),
    died: s.summary.ward?.died ?? 0,
    severe: s.summary.ward?.severe ?? 0,
  });
  e.reputation = change.to;
  s.summary.economy = {
    ledger: {
      income: { ...ledger.income }, cases: { ...ledger.cases }, expenses: { ...ledger.expenses }, audit: { ...ledger.audit },
      ...(ledger.ward ? { ward: { ...ledger.ward } } : {}),
    },
    cash: e.cash, reputation: change, level: levelOf(db, ctx.plan, ctx.working),
    ...(e.loan ? { loan: { ...e.loan } } : {}), ...(e.offer !== undefined ? { offer: e.offer } : {}),
  };
}

/** Следующий день: часы — на 08:00, кабинеты свободны, план прихода с повторными обращениями. */
function nextDay(db: ContentDb, s: ShiftState) {
  if (s.dayOpen) return;
  // своя больница: без регистратуры, зоны ожидания и кабинета смену не открыть
  if (s.hospital) {
    const c = hospitalCtx(db, s);
    if (openBlocks(db, c.plan, c.working, c.staffed).length > 0) return;
    s.undo = [];
  }
  s.day++;
  s.t = (s.day - 1) * DAY + SHIFT_START;
  s.rooms = {};
  delete s.desk;
  if (s.economy) s.economy.ledger = emptyLedger();
  s.summary = emptySummary(s.day);
  s.journal = [];
  s.dayOpen = true;
  // утром врач — в своём кабинете (FR-HOS-4)
  delete s.doctorAt;
  // умения врача (spec 2026-10-skills): выросшие за вчера — с утра
  if (s.meta.skillsNext) {
    setSkills(s, s.meta.skillsNext);
    delete s.meta.skillsNext;
  }
  // аппараты, сломавшиеся с утра (FR-EQ-3): до конца дня их нет, к завтра починят
  const broken = breakdowns(db, s);
  if (broken.length > 0) s.broken = broken;
  else delete s.broken;
  planDay(db, s);
  prune(s);
  // ночью операционная не работала — утром бригада берёт очередь (часть 28)
  startOperations(db, s);
}

/**
 * Что ломается (FR-EQ-3): аппараты обследований в кабинетах; монитор у постели, наркозный и дыхательный аппараты и
 * стол — нет: у них в больнице есть запасной.
 */
export const breaks = (eq: Equipment): boolean => eq.exams.length > 0;
/** Ремонт за счёт больницы — процент цены аппарата (игровая оценка: выезд сервиса и деталь). */
export const REPAIR_PCT = 2;

/**
 * С утра (FR-EQ-3, spec 2026-10-walk-breakdowns): у каждого аппарата обследований — свой жребий по «надёжности»
 * каталога (`breakdown`, доля за рабочий день) из ветви `breakdown:<день>:<помещение>:<место>`. В учебный день главы — нет:
 * его пациенты ждут работающих кабинетов.
 */
export function breakdowns(db: ContentDb, s: ShiftState): string[] {
  if (tutorialDay(db, s) === s.day) return [];
  const out: string[] = [];
  // ось «Управление» (spec 2026-10-difficulty): поломки — на множитель уровня; жребий тот же
  const k = manageOf(db, s).breakdown;
  for (const r of hospitalCtx(db, s).plan.rooms) {
    r.equipment.forEach((id, slot) => {
      const eq = id ? db.equipment[id] : undefined;
      if (eq && breaks(eq) && eq.breakdown > 0 && branch(s, `breakdown:${s.day}:${r.id}:${slot}`).chance(scaled(eq.breakdown, k))) out.push(slotKey(r.id, slot));
    });
  }
  return out;
}

/** Сломанные сегодня аппараты — для `examWhere`. */
export const brokenOf = (s: ShiftState): ReadonlySet<string> => (s.broken && s.broken.length > 0 ? new Set(s.broken) : NONE_BROKEN);

/** Сколько стоит починить сломанное сегодня, ₽: процент цены каждого аппарата; и помещению, где он стоит (часть 2 слоя «Показатели»). */
function repairsOf(db: ContentDb, s: ShiftState): number {
  const plan = hospitalCtx(db, s).plan;
  return (s.broken ?? []).reduce((sum, key) => {
    const [room, slot] = key.split(':');
    const id = plan.rooms.find(r => r.id === room)?.equipment[Number(slot)];
    const rub = id ? Math.round((db.equipment[id].price * REPAIR_PCT) / 100) : 0;
    roomExpense(s, room, rub);
    return sum + rub;
  }, 0);
}

/**
 * Старое не храним: принятых — неделю (их исходы — в итогах следующих дней) и тех, к кому
 * ещё вернутся; ушедших и не принятых в прошлые дни — нет: их числа уже в итогах дня.
 */
function prune(s: ShiftState) {
  const keep = new Set(s.returns.filter(r => r.day >= s.day).map(r => r.of));
  for (const [id, p] of Object.entries(s.patients)) {
    const day = Number(id.split('-')[0]);
    // в потоке для ПК кто ещё в больнице, тот остаётся (spec 2026-10-day): сутки кончаются, а приём идёт
    if (keep.has(id) || day >= s.day || p.status === 'admitted' || (s.flow && (p.status === 'waiting' || p.status === 'inRoom' || p.status === 'away'))) continue;
    if (day < s.day - 7 || p.status === 'left' || p.status === 'unseen') delete s.patients[id];
  }
  s.returns = s.returns.filter(r => r.day >= s.day);
  if (s.gone) s.gone = s.gone.filter(r => Number(r.id.split('-')[0]) >= s.day - 7);
}

// --- врач ---------------------------------------------------------------------------

function call(db: ContentDb, s: ShiftState, id: string): Notice[] {
  const p = s.patients[id];
  if (!s.dayOpen || s.current || !p || p.status !== 'waiting' || p.by) return [];
  // привезённого скорой сначала сортируют по листу передачи (часть 27)
  if (p.kind === 'ambulance' && !p.sorted) return [];
  s.queue = s.queue.filter(x => x !== id);
  p.status = 'inRoom';
  p.calledT ??= s.t;
  p.wait++; // прежняя проверка терпения недействительна
  s.current = id;
  journey.called(s, p);
  // к привезённому скорой врач идёт в смотровую приёмного, к пришедшему сам — в свой кабинет (FR-HOS-4)
  const meet = meetIn(db, s, p);
  // поток для ПК (spec 2026-10-walk): пришедший сам идёт к вам из зала или от двери — приём, когда дойдёт; теперь он ваш,
  // а к вашей двери идёт следующий из ваших
  const walk = s.flow && !p.bay ? walkToYou(db, s, p, (ctx, office) => toDoctor(ctx.plan, p, office, s.t)) : 0;
  delete p.doc;
  delete p.next;
  delete p.nextAt;
  delete p.bench;
  doors(db, s);
  goTo(s, p);
  // поток для ПК (spec 2026-10-owner-play-2): дорога — часами игры, а не разом; приём — когда встретитесь
  if (s.flow) return meetAt(s, p, s.t + Math.max(meet, walk));
  return later(db, s, p, Math.max(meet, walk));
}

/**
 * Поток для ПК (spec 2026-10-owner-play-2): вы встретитесь с пациентом в час `at` — он дойдёт до кабинета или вы до
 * смотровой; дорога `road` — в счёт приёма, как прежде; в этот час — извещение «вошёл к вам».
 */
function meetAt(s: ShiftState, p: ShiftPatient, at: number, road = at - s.t): Notice[] {
  p.spent.seconds += road;
  s.meet = at;
  schedule(s, at, { kind: 'reach', id: p.id });
  return [];
}

/**
 * Сколько пациенту идти в ваш кабинет (spec 2026-10-walk): дорога — `walk(ctx, ваш кабинет)`; идёт — записано, куда и к
 * какому часу (для окна). Кабинета нет — 0.
 */
function walkToYou(db: ContentDb, s: ShiftState, p: ShiftPatient, walk: (ctx: HospitalCtx, office: string) => number, from = s.t): number {
  const ctx = hospitalCtx(db, s);
  const office = doctorRoom(ctx.plan);
  if (!office) return 0;
  const sec = walk(ctx, office);
  if (sec > 0) p.walk = { to: office, at: from + sec };
  return sec;
}

/**
 * Сколько секунд врачу идти к больному (FR-HOS-4, spec 2026-10-walk-breakdowns): от того места, где он был у прошлого, —
 * до смотровой, где лежит привезённый скорой, или до своего кабинета; от одного лежащего в смотровой к другому — без
 * дороги.
 */
export function walkTo(db: ContentDb, s: ShiftState, p: ShiftPatient): number {
  const plan = hospitalCtx(db, s).plan;
  const office = doctorRoom(plan);
  return walkSeconds(plan, s.doctorAt ?? office, p.bay?.room ?? office, walkSpeed(s));
}

/** Скорость пешком: в потоке для ПК — как люди идут на экране (spec 2026-10-walk), в сменах «Анамнеза» — прежняя. */
export const walkSpeed = (s: ShiftState): number => (s.flow ? WALK_SPEED_PC : WALK_SPEED);

/** Скорость пешком пациента: в потоке для ПК — его шагом (spec 2026-10-people, «Медленный шаг»), иначе — `walkSpeed`. */
const paceOf = (s: ShiftState, p: ShiftPatient): number => (s.flow ? patientSpeed(p) : WALK_SPEED);

/**
 * Через сколько секунд врач и больной встретятся (FR-HOS-4): позвать — минута, как и прежде, а врач тем временем идёт к
 * нему в смотровую или обратно в кабинет; дорога дольше минуты — столько, сколько идти.
 */
export function meetIn(db: ContentDb, s: ShiftState, p: ShiftPatient): number {
  return Math.max(MIN, walkTo(db, s, p));
}

/** Врач — у этого больного: в смотровой, где он лежит, или в своём кабинете. */
function goTo(s: ShiftState, p: ShiftPatient) {
  if (p.bay) s.doctorAt = p.bay.room;
  else delete s.doctorAt;
}

/**
 * Обследование текущему пациенту. Цена для врача — сама процедура; рентген и ЭКГ — назначить.
 * Сделать можно, только если в больнице работает его помещение с подходящим аппаратом и есть
 * где взять материал (spec 2026-09-own-hospital); иначе ничего не меняется. К аппарату —
 * очередь по помещению: снимок делают там, где освободятся раньше. Время — с поправкой
 * аппарата и человека, точность снимка — аппарата и того, кто описывает снимок; в готовой амбулатории
 * всё ровно как в базе.
 */
function exam(db: ContentDb, s: ShiftState, examId: Id): Notice[] {
  const p = current(s);
  const cost = p ? orderExam(db, s, p, examId) : null;
  return p && cost !== null ? later(db, s, p, cost) : [];
}

/**
 * Точность снимка в помещении: поправка аппарата и того, кто снимки этого помещения описывает, —
 * в рентгене рентгенолога, в УЗИ врача УЗД (роль с `reads`, часть 29), п. п.
 */
export function imagingSkill(db: ContentDb, staff: readonly StaffMember[], room: { id: string; type: Id }, eqId?: Id): ExamSkill {
  const eq = eqId ? db.equipment[eqId] : undefined;
  const reader = db.rooms[room.type].staff.find(r => db.roles[r]?.reads);
  const [rs, rp] = readingOf(db, reader ? memberAt(staff, room.id, reader) : undefined);
  return { sens: 1, spec: 1, sensPp: (eq?.quality.sens ?? 0) + rs, specPp: (eq?.quality.spec ?? 0) + rp };
}

/**
 * Обследование у постели (spec 2026-10-chapter-3, часть 37): лежит в смотровой приёмного, она
 * работает, и в ней стоит аппарат из записи `bedside` — запись о том, как и сколько; иначе нет.
 */
export function bedsideOf(db: ContentDb, s: ShiftState, p: ShiftPatient, examId: Id): Exam['bedside'] {
  if (!p.bay) return undefined;
  const ctx = hospitalCtx(db, s);
  return bedsideIn(db, ctx.plan, ctx.working, examId, p.bay.room) ? db.exams[examId].bedside : undefined;
}

/**
 * Где лежит пациент — для сроков (часть 37): вид помещения по номеру, что можно у постели и (часть 43г) что
 * — в этой больнице: у постели или в работающем кабинете.
 */
export function targetPlace(db: ContentDb, s: ShiftState, p: ShiftPatient): TargetPlace {
  const ctx = hospitalCtx(db, s);
  const bedside = (exam: Id) => bedsideOf(db, s, p, exam) !== undefined;
  return {
    roomType: room => ctx.plan.rooms.find(r => r.id === room)?.type,
    bedside,
    can: exam => bedside(exam) || !('block' in examWhere(db, ctx.plan, ctx.working, ctx.staffed, exam, brokenOf(s))),
  };
}

/**
 * Назначить обследование пациенту — вашему или нанятого врача. Возвращает, сколько времени
 * занят врач (сама процедура в кабинете, у нанятого — с поправкой `pct` его навыка), или null —
 * сделать нельзя, ничего не меняется.
 */
function orderExam(db: ContentDb, s: ShiftState, p: ShiftPatient, examId: Id, pct = 100): number | null {
  const how = examSetup(db, s, p, examId);
  if (!how) return null;
  const { e, ctx, bed, queued, room, eqId, roomPct, walk, to } = how;
  const reading = room && e.kind === 'imaging' ? imagingSkill(db, ctx.staff, room, eqId) : NORMAL_SKILL;
  // ваше обследование — с умениями дня (spec 2026-10-skills, часть 75); у нанятого врача — без них
  const skill = p.by ? reading : examSkillWith(db, s.meta.skills, examId, reading);

  // песочница: показано ли — по тому, что известно сейчас; показанные оплачивают ОМС и ДМС
  if (s.economy && e.cost > 0 && indicated(db, p.patient, observationsOf(p), candidatesOf(db, p.departments ?? s.meta.department), examId, Math.round((s.t - p.arriveT) / 60))) (p.indicated ??= []).push(examId);
  p.step++;
  p.done.push(examId);
  p.spent.money += e.cost;
  if (!p.by) s.summary.money += e.cost; // в итогах — ваши обследования
  // деньги по помещениям (spec docs/specs/2026-10-metrics-layer.md, часть 2): где делают — у постели, в кабинете
  // обследований (анализ — в лаборатории), где берут (процедурный) или у врача; туда — и расходники, и доход, когда приём
  // закроют
  const where = bed && p.bay ? p.bay.room : (room?.id ?? to ?? caseRoom(s, p));
  if (s.flow && s.hospital?.site) (p.examRooms ??= {})[examId] = where;
  if (s.economy) {
    const used = consumablesOf(db, e);
    ledgerOf(s).expenses.consumables += used;
    roomExpense(s, where, used);
  }
  const obs = runExam(db, p.patient, examId, branch(s, `exam:${p.id}:${p.done.length}:${examId}`), skill, exact(s));
  // ушёл на обследование в другой кабинет (0.5.12, отзыв на 0.5.11) — что делают при нём, то когда вернётся
  const away = Math.max(0, (p.out?.back ?? 0) - s.t);
  if (bed) {
    const cost = Math.round((bed.time.procedure * MIN * pct) / 100);
    p.results.push({ exam: examId, obs, at: s.t + away + cost, step: p.step });
    return away + cost;
  }
  const after = (e.time.report ?? 0) + (e.time.turnaround ?? 0);
  if (queued && room && how.wheel) {
    // лежачий (spec docs/specs/2026-10-orderlies.md): к аппарату везут на каталке, у аппарата ждут его и везут назад
    const order = ORDER_MINUTES * MIN;
    const ride = examRide(db, s, ctx, p, room.id, Math.round((e.time.procedure * MIN * roomPct) / 100), s.t + order);
    if (ride?.exam) {
      startRide(db, s, ride);
      const { start, end } = ride.exam;
      s.rooms[room.id] = end;
      if (s.flow) meeting.examWait(s, room.id, ride.done, start);
      addPending(s, p, examId, end + after * MIN, obs, { room: room.id, start, end });
      p.out = { exam: examId, room: room.id, until: end, back: ride.exam.done };
      if (s.flow && !p.by) schedule(s, p.out.back, { kind: 'reach', id: p.id });
      const nurse = s.staff?.find(x => x.id === ride.by)?.role !== ORDERLY;
      journey.examOut(s, p, ride.since, ride.done, undefined, { pick: ride.pick, ...(ride.go > ride.since ? { busy: true as const } : {}), ...(nurse ? { nurse: true as const } : {}) });
      const doer = examDoerOf(db, ctx, room.id);
      if (doer) worked(db, s, doer, 'exam');
      return order;
    }
  }
  if (queued && room) {
    const order = ORDER_MINUTES * MIN;
    // к аппарату — назначить, и пациент идёт туда сразу (0.5.12): из кабинета или прямо с прошлого обследования
    const go = outFrom(ctx, s, p, room.id, s.t + order);
    const start = Math.max(go.at + go.walk, s.rooms[room.id] ?? 0);
    const end = start + Math.round((e.time.procedure * MIN * roomPct) / 100);
    s.rooms[room.id] = end;
    // узкие места суток (spec 2026-10-economy): очередь у кабинета обследования
    if (s.flow) meeting.examWait(s, room.id, go.at + go.walk, start);
    addPending(s, p, examId, end + after * MIN, obs, { room: room.id, start, end });
    goOut(ctx, s, p, examId, room.id, end);
    // кто делает (spec 2026-10-staff-shifts, часть 2б): устаёт за каждое; начнут, когда он вернётся с перерыва, — путь знает
    const doer = examDoerOf(db, ctx, room.id);
    if (doer) worked(db, s, doer, 'exam');
    const r = doer ? s.crew?.[doer.id]?.rest : undefined;
    journey.examOut(s, p, go.at, go.at + go.walk, r && start === r.until && start > go.at + go.walk ? doer!.role : undefined);
    return order;
  }
  // вопрос расспроса у вас — короче с «Быстрым опросом» (spec 2026-10-skills)
  const minutes = p.by ? e.time.procedure : askMinutes(db, s.meta.skills, e, e.time.procedure);
  const cost = Math.round((minutes * MIN * pct) / 100);
  // анализ: пока лаборатория готовит, — с поправкой лаборатории
  const wait = room ? Math.round((after * MIN * roomPct) / 100) : after * MIN;
  // повторный забор (spec 2026-10-chapter-3, часть 39в): его проверки — через `minutes` минут после
  // первого, со своим временем анализа; тропонин по алгоритму 0/1 час
  const again = e.repeat?.checks ?? [];
  const first = obs.filter(o => !again.includes(o.f));
  const second = obs.filter(o => again.includes(o.f));
  // анализ: кровь берут в процедурном — пациент идёт туда сразу, как выписали направление (FR-HOS-4; 0.5.12), и
  // возвращается; результат — когда лаборатория приготовит. Берут там, где он лежит, — на месте
  // кто берёт и кто готовит (spec 2026-10-staff-shifts, часть 2б): устают за каждое; медсестра на перерыве — берут, когда
  // вернётся; лаборант на перерыве — готовят, когда вернётся
  const lab = room && after > 0 ? examDoerOf(db, ctx, room.id) : undefined;
  if (lab) worked(db, s, lab, 'exam');
  const ready = (end: number) => backAt(s, lab, end) + wait;
  if (after > 0 && room && to !== undefined && to !== fromRoom(ctx, p)) {
    const order = ORDER_MINUTES * MIN;
    const go = outFrom(ctx, s, p, to, s.t + order);
    const nurse = examDoerOf(db, ctx, to);
    if (nurse) worked(db, s, nurse, 'exam');
    const start = backAt(s, nurse, go.at + go.walk, cost);
    // к ней записан: до конца забора не уйдёт (очереди, как у аппарата, здесь нет — помнит она сама)
    const c = nurse ? s.crew?.[nurse.id] : undefined;
    if (c) c.busy = Math.max(c.busy ?? 0, start + cost);
    addPending(s, p, examId, ready(start + cost), first, { room: room.id, start, end: start + cost });
    goOut(ctx, s, p, examId, to, start + cost);
    journey.examOut(s, p, go.at, go.at + go.walk, start > go.at + go.walk ? nurse!.role : undefined);
    if (e.repeat && second.length > 0) {
      const draw = s.t + e.repeat.minutes * MIN + walk;
      addPending(s, p, examId, ready(draw + cost), second, { room: room.id, start: draw, end: draw + cost }, true);
    }
    return order;
  }
  if (after > 0) addPending(s, p, examId, ready(s.t + away + walk + cost), first, room ? { room: room.id, start: s.t + away + walk, end: s.t + away + walk + cost } : undefined);
  else p.results.push({ exam: examId, obs: first, at: s.t + away + cost, step: p.step });
  if (e.repeat && second.length > 0) {
    const draw = s.t + away + e.repeat.minutes * MIN + walk;
    addPending(s, p, examId, ready(draw + cost), second, room ? { room: room.id, start: draw, end: draw + cost } : undefined, true);
  }
  return away + cost;
}

/** Ушёл на обследование в другой кабинет и ещё не вернулся (0.5.12). */
export const isOut = (s: ShiftState, p: ShiftPatient) => p.out !== undefined && p.out.back > s.t;

/**
 * Делают ли обследование при враче (0.5.12): вопрос, осмотр, у постели, анализ, взятый на месте, — да; снимок, ЭКГ в
 * кабинете, анализ в процедурном — пациент идёт туда сам. Нельзя сделать — undefined.
 */
export function atDoctor(db: ContentDb, s: ShiftState, p: ShiftPatient, examId: Id): boolean | undefined {
  const how = examSetup(db, s, p, examId);
  if (!how) return undefined;
  const { e, ctx, bed, queued, room, to } = how;
  if (bed) return true;
  if (queued && room) return false;
  const after = (e.time.report ?? 0) + (e.time.turnaround ?? 0);
  return !(after > 0 && room && to !== undefined && to !== fromRoom(ctx, p));
}

/**
 * Откуда и когда пациент пойдёт на обследование в другом кабинете (0.5.12): сейчас на другом обследовании — прямо
 * оттуда, когда оно кончится; иначе — от врача (или со своего места в смотровой), как только выписали направление.
 */
function outFrom(ctx: HospitalCtx, s: ShiftState, p: ShiftPatient, to: string, leave: number): { at: number; walk: number } {
  const out = p.out && p.out.back > s.t ? p.out : undefined;
  const v = paceOf(s, p);
  return out ? { at: Math.max(leave, out.until), walk: walkSeconds(ctx.plan, out.room, to, v) } : { at: leave, walk: walkSeconds(ctx.plan, fromRoom(ctx, p), to, v) };
}

/**
 * Ушёл на обследование (0.5.12): там — до `until`, у врача снова — когда дойдёт обратно. Ваш, в потоке для ПК (spec
 * 2026-10-owner-play-2), — в этот час извещение «вошёл к вам».
 */
function goOut(ctx: HospitalCtx, s: ShiftState, p: ShiftPatient, exam: Id, room: string, until: number) {
  p.out = { exam, room, until, back: until + walkSeconds(ctx.plan, room, fromRoom(ctx, p), paceOf(s, p)) };
  if (s.flow && !p.by) schedule(s, p.out.back, { kind: 'reach', id: p.id });
}

// --- усталость тех, кто делает обследования (spec docs/specs/2026-10-staff-shifts.md, часть 2б) ---------------------------

/** Как в помещении этого вида делают обследования: у аппарата по очереди, берут материал, готовят анализы. */
type ExamRoom = 'queued' | 'collect' | 'lab';
const examRoomsOf = new WeakMap<ContentDb, Map<Id, ExamRoom>>();

/**
 * Помещения, где обследования делает их первая должность: снимки и функциональные — по очереди у аппарата, забор материала,
 * лаборатория. Смотровая приёмного, где тоже берут кровь, — нет: там медсестра сортирует привезённых.
 */
function examRooms(db: ContentDb): Map<Id, ExamRoom> {
  let m = examRoomsOf.get(db);
  if (m) return m;
  m = new Map();
  for (const e of Object.values(db.exams)) {
    if (e.room) m.set(e.room, e.kind === 'imaging' || e.kind === 'functional' ? 'queued' : (m.get(e.room) ?? 'lab'));
    if (e.collect && !db.rooms[e.collect]?.emergency && !m.has(e.collect)) m.set(e.collect, 'collect');
  }
  examRoomsOf.set(db, m);
  return m;
}

/** Кто делает обследования в помещении `room`: его первая должность, кто в смене; не обследования там — никто. */
function examDoerOf(db: ContentDb, ctx: HospitalCtx, room: string): StaffMember | undefined {
  const type = ctx.plan.rooms.find(r => r.id === room)?.type;
  return type && examRooms(db).has(type) ? memberAt(ctx.staff, room, db.rooms[type].staff[0]) : undefined;
}

/** До какого часа к нему записаны: очередь аппарата; в процедурном — кто записан сдать кровь; в лаборатории — никто. */
function bookedUntil(s: ShiftState, how: ExamRoom, m: StaffMember): number {
  if (how === 'queued') return s.rooms[m.room!] ?? 0;
  return how === 'collect' ? (s.crew?.[m.id]?.busy ?? 0) : 0;
}

/**
 * Отдыхать ли тому, кто делает обследования, — как врачу: никто к нему не записан, а усталость не ниже `slow`, — на
 * перерыв; на пределе — после записанных, и новых пишут после перерыва; в туалет — тоже после записанных. Иначе — проверить
 * снова, когда станет пора или кончатся записанные. Перерыв, который начнётся позже, — отложенный: ушёл — событие `crew`.
 */
function examCrew(db: ContentDb, s: ShiftState, m: StaffMember) {
  if (!m.room) return;
  const ctx = hospitalCtx(db, s);
  // санитар (spec docs/specs/2026-10-orderlies.md) — как те, кто делает обследования: записаны к нему перевозки
  const carrier = m.role === ORDERLY && gurneyOf(db, s) !== undefined;
  const how = carrier ? undefined : examRooms(db).get(ctx.plan.rooms.find(r => r.id === m.room)?.type ?? '');
  if (!carrier && (!how || examDoerOf(db, ctx, m.room)?.id !== m.id)) return;
  const due = dueOf(db, s, m);
  if (!due) return;
  const booked = how ? bookedUntil(s, how, m) : (ridesUntil(s, m.id) ?? 0);
  const from = Math.max(s.t, booked);
  const go = (kind: 'toilet' | 'rest'): boolean => {
    // к тому часу смена кончится — уйдёт домой
    if (!onDuty(db, m, from)) return false;
    const r = startRest(db, s, ctx.plan, ctx.working, m, kind, from);
    if (!r) return false;
    if (how === 'queued') s.rooms[m.room!] = Math.max(s.rooms[m.room!] ?? 0, r.until);
    if (r.planned) schedule(s, r.from, { kind: 'crew', id: m.id });
    schedule(s, r.until, { kind: 'crew', id: m.id });
    return true;
  };
  if (due.wc && go('toilet')) return;
  if ((due.tired === 2 || (due.tired === 1 && booked <= s.t)) && go('rest')) return;
  const c = s.crew?.[m.id];
  const next = Math.min(wakeOf(db, s, m) ?? Number.POSITIVE_INFINITY, due.tired === 1 && booked > s.t ? booked : Number.POSITIVE_INFINITY);
  if (!c || !Number.isFinite(next) || c.wake === next || !onDuty(db, m, next)) return;
  c.wake = next;
  schedule(s, next, { kind: 'crew', id: m.id });
}

/** Событие `crew`: ушёл на отложенный перерыв — усталость падает; вернулся или пора проверить — решает `examCrew`. */
function crewStep(db: ContentDb, s: ShiftState, id: string) {
  const m = s.staff?.find(x => x.id === id);
  if (!m || !s.flow) return;
  const r = s.crew?.[id]?.rest;
  if (r?.planned) {
    if (s.t >= r.from) beginRest(db, s, m);
    return;
  }
  examCrew(db, s, m);
}

/**
 * Для окна (spec 2026-10-staff-shifts, часть 2): кто устаёт и отдыхает — нанятые врачи, те, кто делает обследования, и
 * санитары (spec docs/specs/2026-10-orderlies.md), в смене.
 */
export function crewList(db: ContentDb, s: ShiftState): StaffMember[] {
  const ctx = hospitalCtx(db, s);
  const carriers = gurneyOf(db, s) !== undefined;
  return [...colleaguesOf(db, s), ...ctx.staff.filter(m => m.room !== undefined && (examDoerOf(db, ctx, m.room)?.id === m.id || (carriers && m.role === ORDERLY)))];
}

/** Все, кто сейчас в смене делает обследования: их перерывы и туалет — с этой минуты (начало игры, пересменка, найм). */
function crewAll(db: ContentDb, s: ShiftState) {
  if (!s.flow || !db.economy.staff.fatigue || !s.staff?.some(m => m.shift !== undefined)) return;
  for (const m of hospitalCtx(db, s).staff) if (m.shift !== undefined) examCrew(db, s, m);
}

/** Где и как сделать обследование этому пациенту сейчас: у постели или в кабинете, время — с поправкой аппарата и человека; нельзя — null. */
function examSetup(db: ContentDb, s: ShiftState, p: ShiftPatient, examId: Id) {
  const e = db.exams[examId];
  if (!e || p.done.includes(examId) || !examFits(e, p.patient)) return null;
  const ctx = hospitalCtx(db, s);
  // у постели (spec 2026-10-chapter-3, часть 37): лежащему в смотровой приёмного с монитором ЭКГ
  // снимают на месте — врач, без очереди в кабинет и без описания
  const bed = bedsideOf(db, s, p, examId);
  const where = bed ? { rooms: [] } : examWhere(db, ctx.plan, ctx.working, ctx.staffed, examId, brokenOf(s));
  if ('block' in where) return null;
  const queued = !bed && (e.kind === 'imaging' || e.kind === 'functional');
  // лежачий (spec docs/specs/2026-10-orderlies.md, «Как будет», 4): к аппарату — на каталке и только туда, где она
  // пройдёт, — в помещение с двойной дверью; везти некому — нельзя
  const wheel = gurneyOf(db, s) !== undefined && lying(p);
  const all = e.room && !bed ? where.rooms.map(id => ctx.plan.rooms.find(r => r.id === id)!) : [];
  const rooms = wheel && queued ? all.filter(r => r.door.length >= 2) : all;
  if (wheel && queued && (rooms.length === 0 || carriersOf(ctx.plan, ctx.staff, p.bay!.room, urgentRide(p)).length === 0)) return null;
  // аппарат — тот, что раньше освободится; в потоке для ПК — где раньше начнут, с дорогой до него (spec 2026-10-walk)
  const room = queued ? (s.flow ? soonest(ctx, s, p, rooms) : rooms.reduce((a, b) => ((s.rooms[b.id] ?? 0) < (s.rooms[a.id] ?? 0) ? b : a))) : rooms[0];
  const broken = brokenOf(s);
  const eqId = room?.equipment.find((x, slot) => x !== null && (e.equipment ?? []).includes(x) && !broken.has(slotKey(room.id, slot))) ?? undefined;
  const eq = eqId ? db.equipment[eqId] : undefined;
  // время: аппарат и тот, кто делает (первая должность помещения), — в процентах записанного; устал — дольше (spec
  // 2026-10-staff-shifts, часть 2б)
  const doer = room ? memberAt(ctx.staff, room.id, db.rooms[room.type].staff[0]) : undefined;
  const roomPct = room ? Math.round((eq?.speed ?? 1) * (doer ? slowedOf(db, s, doer, speedOf(db, doer)) : speedOf(db, doer))) : 100;
  // дорога (FR-HOS-4, spec 2026-10-walk-breakdowns): снимок и функциональное — в своём кабинете, материал берут там, где
  // записано (кровь — в процедурном, тропонин и пункцию — в смотровой приёмного); у лежачего — у постели
  const to = queued ? room?.id : e.collect && !bed ? (wheel ? p.bay!.room : collectRoom(ctx, p, e.collect, s.flow !== undefined)) : undefined;
  const walk = to ? walkSeconds(ctx.plan, fromRoom(ctx, p), to, paceOf(s, p)) : 0;
  return { e, ctx, bed, queued, room, eqId, roomPct, walk, to, wheel };
}

/**
 * Где берут материал (FR-HOS-4): лежит в помещении этого вида — там же, иначе — в первом работающем; в потоке для ПК
 * (`near`, spec 2026-10-walk) — в ближайшем по дороге.
 */
function collectRoom(ctx: HospitalCtx, p: ShiftPatient, type: Id, near = false): string | undefined {
  if (p.bay && ctx.plan.rooms.find(r => r.id === p.bay!.room)?.type === type) return p.bay.room;
  const list = ctx.plan.rooms.filter(r => r.type === type && ctx.working.has(r.id));
  if (!near || list.length < 2) return list[0]?.id;
  const from = fromRoom(ctx, p);
  let best = list[0].id;
  let d = walkPc(ctx.plan, from, best);
  for (const r of list) {
    const x = walkPc(ctx.plan, from, r.id);
    if (x < d) {
      best = r.id;
      d = x;
    }
  }
  return best;
}

/** Кабинет обследования, где пациента начнут раньше (spec 2026-10-walk): когда он дойдёт и когда кабинет освободится. */
function soonest(ctx: HospitalCtx, s: ShiftState, p: ShiftPatient, rooms: readonly PlacedRoom[]): PlacedRoom | undefined {
  let best: PlacedRoom | undefined;
  let t = Number.POSITIVE_INFINITY;
  for (const r of rooms) {
    const go = outFrom(ctx, s, p, r.id, s.t + ORDER_MINUTES * MIN);
    const start = Math.max(go.at + go.walk, s.rooms[r.id] ?? 0);
    if (start < t) {
      best = r;
      t = start;
    }
  }
  return best;
}

/**
 * Откуда пациент идёт на обследование (FR-HOS-4): лежит в смотровой приёмного — оттуда, его ведёт нанятый врач — из
 * кабинета врача, иначе — из вашего кабинета.
 */
function fromRoom(ctx: HospitalCtx, p: ShiftPatient): string | undefined {
  if (p.bay) return p.bay.room;
  if (p.by) return ctx.all.find(m => m.id === p.by)?.room;
  return doctorRoom(ctx.plan);
}

/**
 * Через сколько минут придёт результат, если назначить обследование сейчас (spec 2026-10-chapter-3, часть 46б): у
 * постели — процедура; снимок — назначить, дождаться аппарата, процедура с поправкой аппарата и человека и описание;
 * анализ — забор и лаборатория. Так разумный врач знает свою больницу: томограф на 16 срезов медленнее записанного.
 * Сделать нельзя — undefined.
 */
export function readyIn(db: ContentDb, s: ShiftState, p: ShiftPatient, examId: Id): number | undefined {
  const how = examSetup(db, s, p, examId);
  if (!how) return undefined;
  const { e, ctx, bed, queued, room, roomPct, walk, to } = how;
  // ушёл на другое обследование (0.5.12): при нём — когда вернётся, в другой кабинет — оттуда
  const away = Math.max(0, (p.out?.back ?? 0) - s.t) / MIN;
  if (bed) return away + bed.time.procedure;
  const after = (e.time.report ?? 0) + (e.time.turnaround ?? 0);
  // лежачий (spec docs/specs/2026-10-orderlies.md): на каталке — когда кончат у аппарата
  const ride = queued && room && how.wheel ? examRide(db, s, ctx, p, room.id, Math.round((e.time.procedure * MIN * roomPct) / 100), s.t + ORDER_MINUTES * MIN) : undefined;
  if (ride?.exam) return (ride.exam.end - s.t) / MIN + after;
  if (queued && room) {
    const go = outFrom(ctx, s, p, room.id, s.t + ORDER_MINUTES * MIN);
    return (Math.max(go.at + go.walk, s.rooms[room.id] ?? 0) - s.t) / MIN + (e.time.procedure * roomPct) / 100 + after;
  }
  if (room && to !== undefined && to !== fromRoom(ctx, p)) {
    const go = outFrom(ctx, s, p, to, s.t + ORDER_MINUTES * MIN);
    return (go.at + go.walk - s.t) / MIN + e.time.procedure + (after * roomPct) / 100 + (e.repeat?.minutes ?? 0);
  }
  return away + walk / MIN + e.time.procedure + (room ? (after * roomPct) / 100 : after) + (e.repeat?.minutes ?? 0);
}

function addPending(s: ShiftState, p: ShiftPatient, examId: Id, readyAt: number, obs: Observation[], at?: { room: string; start: number; end: number }, repeat?: true) {
  p.pending.push({ exam: examId, readyAt, obs, ...(at ?? {}), ...(repeat ? { repeat } : {}) });
  schedule(s, readyAt, { kind: 'result', id: p.id });
}

function finish(db: ContentDb, s: ShiftState): Notice[] {
  const p = current(s);
  if (!p || !p.draft.diagnosis) return [];
  closePatient(db, s, p);
  s.current = undefined;
  return later(db, s, p, 2 * MIN); // рецепт, направление
}

/**
 * Закрыть приём — ваш или нанятого врача: оценки, оплата, итоги дня, повторное обращение.
 * Приёмы врача идут в его строку итогов, а ваши строки — только о ваших приёмах. `at` — минута решения (`closeCase`).
 */
function closePatient(db: ContentDb, s: ShiftState, p: ShiftPatient, at = s.t): ClosedCase {
  // путь пациента (spec 2026-10-flow-ui): место, которое выбрал врач, — до того, как его заменит свободное
  const wanted = p.draft.setting;
  // не дождались — результат приходит в пустоту: случай решён тем, что было известно
  p.pending = [];
  delete p.out;
  // последнюю койку успели занять — направить в стационар другой больницы (часть 26); оперировать
  // этот диагноз здесь нечем или некому — вызвать скорую, как из амбулатории (часть 28)
  if (p.draft.setting === 'admit' && freeBeds(db, s).length === 0) p.draft.setting = 'ward';
  // последнюю койку ПИТ успели занять — перевести, как из больницы без ПИТ (часть 38а); реанимации — так же, и
  // её лечение снимается (spec 2026-10-chapter-4, часть 47)
  if (p.draft.setting === 'icu' && freeIcuBeds(db, s).length === 0) p.draft.setting = 'ambulance';
  if (p.draft.setting === 'ricu' && freeRicuBeds(db, s).length === 0) {
    p.draft.setting = 'ambulance';
    p.draft.treatments = placeBound(db, p.draft.treatments, 'ambulance');
  }
  if (p.draft.setting === 'surgery' && !canOperate(db, s, p.draft.diagnosis, p)) p.draft.setting = 'ambulance';
  // последний бокс успели занять — перевести в инфекционную больницу (spec 2026-10-chapter-4, часть 49а)
  if (p.draft.setting === 'box' && freeBoxBeds(db, s).length === 0) p.draft.setting = 'ambulance';
  const closed = closeCase(db, s, p, at);
  if (p.by) closed.by = p.by;
  // главврач изменил решение врача (spec 2026-10-two-ways, F5) — к лучшему или нет
  chiefOutcome(s, p, closed.verdict);
  if (p.from) closed.from = p.from;
  // нанятый врач выбрал диагноз уставшим (spec 2026-10-staff-shifts, часть 2); забрали — решали вы
  if (p.by && p.tired !== undefined) closed.tired = p.tired;
  p.closed = closed;
  p.status = 'done';
  // скорая (часть 27): сверка сортировки со шкалой — строкой разбора; место в смотровой свободно
  if (p.kind === 'ambulance' && p.sorted && p.scale) {
    const d = TRIAGE_RANK[p.triage] - TRIAGE_RANK[p.scale.triage];
    if (d !== 0) {
      closed.notes.push({ code: d > 0 ? 'triage.under' : 'triage.over', triage: p.scale.triage, news2: p.scale.news2, ...(p.scale.flag ? { flag: p.scale.flag } : {}) });
    }
  }
  // сроки за день (часть 37): ваши приёмы — у скольких срок был и у скольких выполнен; с частью 45а —
  // и оценки по порядку закрытия, для заданий «срок у N больных подряд»; срок с серией (часть 60а) — и в строку серии
  if (!p.by) {
    for (const t of closed.targets ?? []) {
      const day = ((s.summary.targets ??= {})[t.id] ??= { onTime: 0, total: 0 });
      day.total++;
      if (t.grade === 'A') day.onTime++;
      const seq = (s.summary.targetSeq ??= {});
      for (const key of [t.id, db.targets[t.id]?.series]) if (key) seq[key] = (seq[key] ?? '') + t.grade;
    }
  }
  // каталка (spec docs/specs/2026-10-orderlies.md): кого кладут в стационар, лежит в смотровой, пока его не увезут
  const keepBay = p.bay !== undefined && gurneyOf(db, s) !== undefined && STAYS.includes(closed.plan.setting);
  if (p.bay && !keepBay) {
    delete p.bay;
    seatAtDoor(db, s);
  }
  // песочница: ОМС и ДМС платят после экспертизы, платный пациент — за всё сделанное
  if (s.economy) {
    const payer = p.payer ?? 'oms';
    const ctx = hospitalCtx(db, s);
    // ось «Управление» (решение владельца #151): оплата случая — на множитель уровня; «Обычно» — до байта как было
    const pay = manageOf(db, s).pay;
    const base = caseIncome(db, payer, closed.diagnosis, p.done, p.indicated ?? [], closed.grades.defensibility, levelOf(db, ctx.plan, ctx.working).level);
    const x = pay === 100 ? base : { ...base, paid: scaledInt(base.paid, pay), cut: scaledInt(base.cut, pay) };
    const ledger = ledgerOf(s);
    ledger.income[payer] += x.paid;
    ledger.cases[payer]++;
    // деньги по помещениям (часть 2 слоя «Показатели»): обследования — где сделали, обращение — кабинету врача
    caseIncomeRooms(db, s, p, payer, x.paid, x.unindicated, pay);
    ledger.audit.cut += x.cut;
    if (x.quality < 100) ledger.audit.weak++;
    if (x.unconfirmed) ledger.audit.unconfirmed++;
    ledger.audit.unindicated += x.unindicated.length;
    p.paid = x;
  }
  const sum = s.summary;
  // кампания (spec 2026-10-chapter-4, часть 60а): заразный, которому нужен бокс, — у всех приёмов больницы; положен ли он в
  // общую палату (строка разбора «соседи по палате — контактные»)
  if (s.campaign && recommendedSetting(db, p.patient, p.results.map(r => r.exam), closed.bedside, closed.rooms) === 'box') {
    const day = (sum.isolation ??= { seen: 0, ward: 0 });
    day.seen++;
    if (closed.plan.setting === 'admit') day.ward++;
  }
  if (p.by) {
    const c = colleagueDay(s, p.by);
    c.seen++;
    c[closed.verdict]++;
    // общая оценка — когда досчитан разбор (`settleReviews`)
    if (!closed.review) c.grades[closed.grades.overall]++;
    // поток для ПК: разбора нет — то, что известно без него (решение владельца 16.10.2026, spec 2026-10-engine-speed, ч. 1)
    if (s.flow) {
      if (STAYS.includes(closed.plan.setting)) c.admitted = (c.admitted ?? 0) + 1;
      else if (closed.plan.setting !== 'home') c.referred = (c.referred ?? 0) + 1;
      if (closed.grades.safety !== 'A') c.unsafe = (c.unsafe ?? 0) + 1;
    }
  } else {
    sum.seen++;
    sum[closed.verdict]++;
    sum.grades[closed.grades.overall]++;
    // кампания: антибиотик, который не показан, — для задания «дни без него»
    if (s.campaign && closed.notes.some(n => n.code === 'tx.notIndicated' && db.treatments[n.tx]?.class?.startsWith('antibiotic.'))) {
      sum.needlessAntibiotic = (sum.needlessAntibiotic ?? 0) + 1;
    }
    if (s.campaign) campaignCase(db, sum, p, closed);
  }
  const back = closed.outcome.returns;
  if (back) {
    s.returns.push({ day: s.day + Math.max(1, back.day), of: p.id, reason: back.reason, ...(back.as ? { as: back.as } : {}) });
    sum.returnsPlanned++;
  }
  if (STAYS.includes(closed.plan.setting)) admit(db, s, p);
  // положить некуда — место в смотровой свободно
  if (keepBay && !p.stay && p.bay) {
    delete p.bay;
    seatAtDoor(db, s);
  }
  journey.closed(s, p, wanted, () => ({ ward: [wardBeds(db, s).length, freeBeds(db, s).length], icu: [icuBeds(db, s).length, freeIcuBeds(db, s).length], ricu: [ricuBeds(db, s).length, freeRicuBeds(db, s).length], box: [boxBeds(db, s).length, freeBoxBeds(db, s).length] }));
  // поток для ПК (решение владельца 16.10.2026): приём нанятого врача — сразу строкой журнала, его разбор не досчитывается
  if (s.flow && p.by) evict(s, p);
  return closed;
}

/** Строка итогов нанятого врача за день (spec 2026-09-hired-doctors) — с его должностью (spec 2026-10-chapter-4, часть 60а). */
function colleagueDay(s: ShiftState, by: string): ColleagueDay {
  const role = s.staff?.find(m => m.id === by)?.role;
  return ((s.summary.colleagues ??= {})[by] ??= { ...(role ? { role } : {}), seen: 0, correct: 0, partly: 0, wrong: 0, grades: { A: 0, B: 0, C: 0, D: 0 } });
}

/** Лечение реанимации (spec 2026-10-chapter-4, часть 47) остаётся, только если место — его: ИВЛ — «В ОРИТ». */
function placeBound(db: ContentDb, treatments: Id[], setting: Setting): Id[] {
  return treatments.filter(tx => db.treatments[tx]?.place === undefined || db.treatments[tx].place === setting);
}

/** Кандидаты вывода — всё, с чем приходят в это отделение. */
export function candidatesOf(db: ContentDb, department: Id | readonly Id[]): Id[] {
  const depts: readonly Id[] = typeof department === 'string' ? [department] : department;
  return Object.keys(db.conditions).filter(id => db.conditions[id].presenting && depts.includes(db.conditions[id].department)).sort();
}

/**
 * Какие отделения принимает больница смены (spec 2026-09-chapter-2, часть 30): своё и те, что
 * принимают её работающие помещения (`admits`: смотровая приёмного — хирургию). В амбулатории
 * практики и в главе 1 — только своё.
 */
export function departmentsOf(db: ContentDb, s: ShiftState): Id[] {
  const ctx = hospitalCtx(db, s);
  const out = [s.meta.department];
  for (const r of ctx.plan.rooms) {
    if (!ctx.working.has(r.id)) continue;
    for (const d of db.rooms[r.type]?.admits ?? []) if (!out.includes(d)) out.push(d);
  }
  return out;
}

/** Всё, что врач знает о пациенте: жалобы и пришедшие результаты. */
export function observationsOf(p: ShiftPatient): Observation[] {
  return [...complaintObservations(p.patient), ...p.results.flatMap(r => r.obs)];
}

/**
 * Закрыть случай: проверить план по правде, промотать болезнь, поставить оценки (`10` §8–10). `at` — минута решения: решение
 * нанятого врача ждало главврача (spec 2026-10-two-ways, F3) — окна по часам и сроки на ту минуту, когда он решил.
 */
function closeCase(db: ContentDb, s: ShiftState, p: ShiftPatient, at = s.t): ClosedCase {
  const dx = p.draft.diagnosis!;
  const patient = p.patient;
  const truth = patient.truth.conditions[0].id;
  const cond = db.conditions[truth];
  const obs = observationsOf(p);
  const candidates = candidatesOf(db, p.departments ?? s.meta.department);
  // у ваших приёмов — уверенность разбора, посчитанная заранее (0.5.11): тот же вывод по тем же наблюдениям
  const beliefs = p.by ? posterior(db, candidates, obs, contextOf(db, patient, obs)) : reviewTimeline(db, s.meta, p)[p.results.length];
  const confidence = beliefs.find(b => b.id === dx)?.p ?? 0;
  // в операционную — операцией поставленного диагноза (часть 28): по тому, что видно на снимке (часть 32б)
  const op = p.draft.setting === 'surgery' ? operationFor(db, dx, likelyParams(db, dx, obs, patient)) : undefined;
  const plan = { treatments: op ? [...new Set([...p.draft.treatments, op])].sort() : [...p.draft.treatments], setting: p.draft.setting };
  // аппараты у постели в момент решения (часть 39а): под монитором тромболизис был возможен
  const bedside = bedsideEquipment(db, s, p);
  // окна по часам — на минуту решения (часть 41а): тромболизис при инсульте — в первые 4,5 часа от начала
  const minutes = Math.round((at - p.arriveT) / 60);
  const before = freezeClock(db, patient, minutes);
  // и что сделано, хотя результат ещё не пришёл (spec 2026-10-chapter-4, часть 50а): пункция при противопоказании
  // и работающие кабинеты (часть 53а): с эндоскопическим кабинетом кровотечение из язвы останавливают у себя
  const rooms = settingRoomsOf(db, hospitalCtx(db, s).rooms);
  const ev = evaluatePlan(db, patient, plan, obs, { bedside, minutes, done: p.done, rooms }, before);
  // переведённый из больницы с приёмным (часть 39б): инфаркт с подъёмом ST — исход по часам до реперфузии; осложнение
  // обследования (часть 50а) — раньше всего
  const soft = s.meta.soft === true;
  const outcome = examHarmOutcome(db, plan, ev, branch(s, `outcome:${p.id}`), soft) ?? rscFor(db, s, p, plan) ?? observe(db, patient, plan, ev, branch(s, `outcome:${p.id}`), soft);
  // разумный врач разбора — посчитанный заранее (0.5.11, NFR-PRF-1): у вашего приёма — пока вы думаете; не готов —
  // досчитывается здесь. У приёма нанятого врача — по требованию (spec 2026-10-engine-speed, ч. 1): бережливость и общая
  // оценка досчитываются `settleReviews` (в свободное время и при закрытии дня), а читаются `reviewedCase`
  const later = p.by !== undefined;
  const present = new Set(patient.truth.findings.map(f => f.f));
  // та же группа — частично; с частью 48а — и источник сепсиса (пневмония вместо сепсиса из неё)
  const verdict = verdictOf(db, dx, patient);
  // сроки (spec 2026-10-chapter-3, часть 37): лежит в смотровой с болью в груди — ЭКГ за 10 минут
  // с частью 39б — и решения: тромболизис и перевод сделаны в минуту, когда врач закрыл приём
  const targets = targetResults(db, p, targetPlace(db, s, p), { t: at, plan });
  const cost = p.done.reduce((a, id) => a + examCost(db, id), 0);
  const base = scoreBase({
    verdict, confidence, cost,
    plan: ev, outcome, selfLimiting: selfLimits(db, primaryOf(patient)), ...(cond.settles ? { settles: true } : {}),
    redFlags: (cond.redFlags ?? []).filter(f => present.has(f)).map(f => ({ f, seen: obs.some(o => o.f === f && o.shown) })),
    // что было правильно выбрать здесь: со своей палатой — положить в неё, со своей операционной — оперировать
    should: choiceFor(recommendedSetting(db, patient, p.results.map(r => r.exam), bedside, rooms), venueOf(db, s, operationFor(db, truth, primaryOf(patient).params) ?? null, plan.setting)),
    ...(targets.length > 0 ? { targets: targets.map(t => t.grade) } : {}),
    // «Практикант» (spec 2026-10-trainee): обоснованность и бережливость — для сведения
    ...(s.meta.difficulty === 'trainee' ? { lenient: true as const } : {}),
  });
  const rational = later ? { cost: 0, money: 0 } : rationalOf(db, s.meta, p);
  // отложенный разбор: бережливость пока «как у разумного» (A), общая — по ней; замечания — без бережливости
  const score = scoreThrift(later ? { ...base, notes: [] } : base, cost, later ? cost : rational.cost);
  const { notes, targets: _worst, ...grades } = score;
  return {
    at: s.t, diagnosis: dx, verdict, confidence, plan, outcome, grades, notes: later ? [...base.notes] : notes, rationalCost: rational.cost, rationalMoney: rational.money,
    ...(targets.length > 0 ? { targets } : {}), ...(bedside.length > 0 ? { bedside } : {}), ...(rooms.length > 0 ? { rooms: [...rooms] } : {}),
    ...(p.arrest !== undefined ? { arrest: true as const } : {}),
    ...(later ? { review: base.lenient ? 'lenient' as const : 'due' as const } : {}),
  };
}

/** Цена и деньги разумного врача разбора на этом пациенте. */
function rationalOf(db: ContentDb, meta: Pick<ShiftState['meta'], 'seed' | 'department'>, p: ShiftPatient): { cost: number; money: number } {
  const r = reviewEntry(db, meta, p).run.result();
  return { cost: r.exams.reduce((a, id) => a + examCost(db, id), 0), money: r.money };
}

// --- разбор приёма нанятого врача по требованию (spec 2026-10-engine-speed, ч. 1) -------------------------------------

/** Замечание, которое закрытие приёма дописывает после оценки: сверка сортировки привезённого скорой со шкалой. */
const afterScore = (n: ClosedCase['notes'][number]) => n.code === 'triage.under' || n.code === 'triage.over';

/** Оценка без бережливости — из закрытого приёма: оценки, сроки и замечания оценки, записанные при закрытии. */
function baseOf(c: ClosedCase): ScoreBase {
  const g = c.grades;
  const targets: Grade[] = (c.targets ?? []).map(t => t.grade);
  return {
    verdict: c.verdict, accuracy: g.accuracy, defensibility: g.defensibility, treatment: g.treatment, setting: g.setting, safety: g.safety,
    ...(targets.length > 0 ? { targets: worstGrade(targets) } : {}), lenient: c.review === 'lenient', notes: c.notes.filter(n => !afterScore(n)),
  };
}

/** Досчитать разбор в `c` (тот же объект или его копию): бережливость, общая оценка, замечания, цена разумного пути. */
function finishReview(db: ContentDb, meta: Pick<ShiftState['meta'], 'seed' | 'department'>, p: ShiftPatient, c: ClosedCase): ClosedCase {
  const rational = rationalOf(db, meta, p);
  const score = scoreThrift(baseOf(c), p.done.reduce((a, id) => a + examCost(db, id), 0), rational.cost);
  c.grades.thrift = score.thrift;
  c.grades.overall = score.overall;
  c.notes.splice(0, c.notes.length, ...score.notes, ...c.notes.filter(afterScore));
  c.rationalCost = rational.cost;
  c.rationalMoney = rational.money;
  delete c.review;
  return c;
}

/**
 * Закрытый приём с досчитанным разбором — для экранов, не меняя состояния: тот же до байта, что после `settleReviews`.
 * Разбор досчитан — сам приём.
 */
export function reviewedCase(db: ContentDb, s: ShiftState, p: ShiftPatient): ClosedCase | undefined {
  const c = p.closed;
  if (!c?.review) return c;
  const copy = JSON.parse(JSON.stringify(c)) as ClosedCase;
  return finishReview(db, s.meta, p, copy);
}

/** Сколько приёмов ждут досчёта разбора. */
export function reviewsDue(s: ShiftState): number {
  let n = 0;
  for (const p of Object.values(s.patients)) if (p.closed?.review) n++;
  return n;
}

/**
 * Досчитать отложенные разборы — по порядку закрытия, пока `more()` (разумный врач разбора — по частям); без `more` —
 * все. Строка оценок нанятого врача в итогах того дня, когда приём закрыт, получает его общую оценку. true — всё
 * досчитано.
 */
export function settleReviews(db: ContentDb, s: ShiftState, more?: () => boolean): boolean {
  const due = Object.values(s.patients).filter(p => p.closed?.review).sort((a, b) => a.closed!.at - b.closed!.at || (a.id < b.id ? -1 : 1));
  for (const p of due) {
    const run = reviewEntry(db, s.meta, p).run;
    while (!run.done()) {
      if (more && !more()) return false;
      run.part();
    }
    const c = finishReview(db, s.meta, p, p.closed!);
    const day = Math.floor(c.at / DAY) + 1;
    const sum = s.summary.day === day ? s.summary : s.history.find(h => h.day === day);
    const col = sum?.colleagues?.[c.by!];
    if (col) col.grades[c.grades.overall]++;
    evict(s, p);
  }
  return true;
}

/**
 * Исход переведённого в сосудистый центр (spec 2026-10-chapter-3, часть 39б): из больницы, где
 * работает смотровая приёмного, — по часам от начала болезни до решения, пути и тому, был ли
 * тромболизис. Из амбулатории — прежний: тромболизис там решает бригада скорой. Часов от начала нет
 * (сохранения до 0.3.5) — тоже прежний.
 */
function rscFor(db: ContentDb, s: ShiftState, p: ShiftPatient, plan: { treatments: Id[]; setting: Setting }): Outcome | undefined {
  if ((plan.setting !== 'ambulance' && plan.setting !== 'transfer') || emergencyBays(db, s).length === 0) return undefined;
  const onset = db.conditions[p.patient.truth.conditions[0].id]?.onset;
  const hours = onset ? p.patient.truth.values[onset.f] : undefined;
  if (hours === undefined) return undefined;
  const decided = hours * 60 + Math.round((s.t - p.arriveT) / 60);
  return rscOutcome(db, p.patient, plan, decided, db.economy.transfer, branch(s, `rsc:${p.id}`), s.meta.soft === true);
}

/** Аппараты работающего помещения — то, что стоит у постели лежащего в нём (часть 39а). */
function roomEquipment(db: ContentDb, s: ShiftState, roomId: string | undefined): Id[] {
  if (roomId === undefined) return [];
  const ctx = hospitalCtx(db, s);
  const room = ctx.plan.rooms.find(r => r.id === roomId);
  return room && ctx.working.has(room.id) ? [...new Set(room.equipment.filter((id): id is Id => id !== null))].sort() : [];
}

/**
 * Аппараты у постели больного (spec 2026-10-chapter-3, часть 39а): лежит в работающей смотровой
 * приёмного — её аппараты, монитор с дефибриллятором; в кабинете врача и в амбулатории — ничего.
 */
export function bedsideEquipment(db: ContentDb, s: ShiftState, p: ShiftPatient): Id[] {
  return roomEquipment(db, s, p.bay?.room);
}

/** Аппараты у койки лежащего — для смены лечения на обходе (часть 39а): в ПИТ — монитор, в палате — ничего. */
export function stayEquipment(db: ContentDb, s: ShiftState, p: ShiftPatient): Id[] {
  return roomEquipment(db, s, p.stay?.room);
}

/**
 * Разбор случая: как менялась уверенность, что ничего не добавило, как прошёл бы его разумный
 * врач. Та же ветвь зерна, что при закрытии, — поэтому экран разбора пересчитывает его, а не
 * хранит в сохранении.
 */
export function reviewOf(db: ContentDb, s: ShiftState, p: ShiftPatient, diagnosis: Id): ReviewData {
  return reviewFor(db, s.meta, p, diagnosis);
}

/**
 * Разбор по одной записи пациента: из смены нужны только зерно и отделение — так его строит и
 * архив профиля; отделения, с какими больница его приняла (часть 30), — в самой записи.
 */
export function reviewFor(db: ContentDb, meta: Pick<ShiftState['meta'], 'seed' | 'department'>, p: ShiftPatient, diagnosis: Id): ReviewData {
  // разбор один на приём (0.5.11): экран разбора и архив профиля его не пересчитывают
  const entry = reviewEntry(db, meta, p);
  const key = `${diagnosis}|${p.results.length}`;
  let out = entry.reviews.get(key);
  if (!out) {
    const beliefs = reviewTimeline(db, meta, p);
    out = buildReview(db, p.patient, p.results.map(r => ({ exam: r.exam, obs: r.obs })), diagnosis, entry.candidates, entry.exams, entry.rng, entry.run.result(), beliefs);
    entry.reviews.set(key, out);
  }
  return out;
}

/**
 * Разумный врач разбора этого приёма и уверенность после каждого результата — по шагу (0.5.11, NFR-PRF-1): их считают
 * заранее, пока игрок думает над пациентом (`prepareReview`), и закрытие приёма не ждёт. Зерно, кандидаты, обследования
 * и наблюдения — те же, что у разбора подряд, поэтому и разбор тот же. В памяти, не в сохранении: после открытия
 * сохранения — заново.
 */
interface ReviewEntry {
  rng: Rng;
  candidates: Id[];
  exams: Id[];
  run: DoctorRun;
  reviews: Map<string, ReviewData>;
  /** уверенность после жалоб и после каждого результата приёма — по порядку, по одному (`reviewBeliefs`) */
  beliefs: Belief[][];
  /** наблюдения, по которым посчитана последняя из них */
  obs: Observation[];
}
const reviewEntries = new WeakMap<ContentDb, WeakMap<ShiftPatient['patient'], Map<string, ReviewEntry>>>();

function reviewEntry(db: ContentDb, meta: Pick<ShiftState['meta'], 'seed' | 'department'>, p: ShiftPatient): ReviewEntry {
  let byDb = reviewEntries.get(db);
  if (!byDb) reviewEntries.set(db, (byDb = new WeakMap()));
  let byPatient = byDb.get(p.patient);
  if (!byPatient) byDb.set(p.patient, (byPatient = new Map()));
  const departments = p.departments ?? meta.department;
  const key = `${meta.seed}|${p.id}|${typeof departments === 'string' ? departments : departments.join(',')}`;
  let entry = byPatient.get(key);
  if (!entry) {
    const rng = Rng.seeded(meta.seed).fork(`review:${p.id}`);
    const candidates = candidatesOf(db, departments);
    const exams = Object.keys(db.exams).sort();
    entry = {
      rng, candidates, exams, run: startRational(db, p.patient, rng, { candidates: [...candidates], exams: [...exams] }), reviews: new Map(),
      beliefs: [], obs: complaintObservations(p.patient),
    };
    byPatient.set(key, entry);
  }
  return entry;
}

/**
 * Посчитать заранее шаг разумного врача разбора (0.5.11, NFR-PRF-1) — у того, кто у вас в кабинете, а когда он готов —
 * уверенность разбора после очередного пришедшего результата; затем — у приёмов нанятых врачей и у ждущих в очереди.
 * Интерфейс зовёт это в паузах игры, по шагу за раз, и закрытие приёма берёт готовое. Состояния смены не меняет. Вернёт
 * false, когда считать нечего.
 */
export function prepareReview(db: ContentDb, s: ShiftState): boolean {
  const p = s.current ? s.patients[s.current] : undefined;
  if (p && !p.by && !p.closed) {
    const entry = reviewEntry(db, s.meta, p);
    if (entry.run.part() !== true) return true;
    // разумный врач готов — уверенность после пришедших результатов, по одному за раз
    if (entry.beliefs.length <= p.results.length) {
      nextBelief(db, entry, p);
      return true;
    }
  }
  // затем — у приёмов нанятых врачей и у тех, кто ждёт в очереди: разумный врач разбора нужен при закрытии каждого
  for (const q of ahead(s)) if (reviewEntry(db, s.meta, q).run.part() !== true) return true;
  // и у закрытых приёмов нанятых врачей, чей разбор отложен (spec 2026-10-engine-speed «Больницы»): закрытие дня возьмёт готовое
  if (!s.flow) for (const q of Object.values(s.patients)) if (q.closed?.review && reviewEntry(db, s.meta, q).run.part() !== true) return true;
  return false;
}

/**
 * Разбор вашего приёма к закрытию — по частям (0.5.13, NFR-PRF-1): разумный врач разбора и уверенность после каждого
 * пришедшего результата, пока `more()`; true — готово, и закрытие приёма берёт готовое. Не успели посчитать заранее —
 * интерфейс доводит это в кадрах и закрывает приём, когда готово. Состояния смены не меняет.
 */
export function prepareFinish(db: ContentDb, s: ShiftState, more: () => boolean = () => true): boolean {
  const p = s.current ? s.patients[s.current] : undefined;
  if (!p || p.by || p.closed) return true;
  const entry = reviewEntry(db, s.meta, p);
  while (!entry.run.done()) {
    if (!more()) return false;
    entry.run.part();
  }
  while (entry.beliefs.length <= p.results.length) {
    if (!more()) return false;
    nextBelief(db, entry, p);
  }
  return true;
}

/** Кого закроют следом: приёмы нанятых врачей — по времени прихода, затем очередь — по порядку. */
function ahead(s: ShiftState): ShiftPatient[] {
  const theirs = Object.values(s.patients)
    .filter(p => p.by !== undefined && !p.closed && (p.status === 'inRoom' || p.status === 'away' || p.status === 'waiting'))
    .sort((a, b) => a.arriveT - b.arriveT || (a.id < b.id ? -1 : 1));
  return [...theirs, ...s.queue.map(id => s.patients[id]).filter(p => p && !p.closed && p.by === undefined)];
}

/** Уверенность после следующего результата приёма (после жалоб — первая). */
function nextBelief(db: ContentDb, entry: ReviewEntry, p: ShiftPatient) {
  const i = entry.beliefs.length;
  if (i > 0) entry.obs.push(...p.results[i - 1].obs);
  entry.beliefs.push(reviewBeliefs(db, p.patient, entry.candidates, entry.obs));
}

/** Уверенность разбора после жалоб и после каждого результата — что не посчитано заранее, досчитывается. */
function reviewTimeline(db: ContentDb, meta: Pick<ShiftState['meta'], 'seed' | 'department'>, p: ShiftPatient): Belief[][] {
  const entry = reviewEntry(db, meta, p);
  while (entry.beliefs.length <= p.results.length) nextBelief(db, entry, p);
  return entry.beliefs.slice(0, p.results.length + 1);
}

// --- стационар (spec 2026-09-chapter-2, часть 26) ---------------------------------------------

/** Койки своей больницы в работающих палатах, по порядку помещений и коек. */
export function wardBeds(db: ContentDb, s: ShiftState): Bed[] {
  if (!s.hospital) return [];
  const ctx = hospitalCtx(db, s);
  return ctx.plan.rooms
    .filter(r => db.rooms[r.type]?.beds && ctx.working.has(r.id))
    .flatMap(r => r.beds.map((_, bed) => ({ room: r.id, bed })));
}

/** Занятые койки — палаты и ПИТ: «помещение:койка» лежащих. */
function takenBeds(s: ShiftState): Set<string> {
  return new Set(Object.values(s.patients).filter(p => p.status === 'admitted' && p.stay).map(p => `${p.stay!.room}:${p.stay!.bed}`));
}

/** Свободные койки: работающие, на которых никто не лежит. */
export function freeBeds(db: ContentDb, s: ShiftState): Bed[] {
  const taken = takenBeds(s);
  return wardBeds(db, s).filter(b => !taken.has(`${b.room}:${b.bed}`));
}

/**
 * Работает ли койка палаты интенсивной терапии: на её месте под аппарат (место с номером койки) что-то стоит —
 * монитор (часть 38а); у реанимации (spec 2026-10-chapter-4, часть 47) места койки названы в `slotsOf` — на
 * каждом свой аппарат: монитор и аппарат ИВЛ.
 */
function bedWorks(db: ContentDb, r: Plan['rooms'][number], bed: number): boolean {
  // больница ПК (spec 2026-10-build): аппараты коек — из плана, по тому, что стоит у койки
  const of = r.slotsOf ?? sizeOf(db, r.type, r.size)?.slotsOf;
  return of ? Object.entries(of).every(([eq, slots]) => r.equipment[slots[bed]] === eq) : !!r.equipment[bed];
}

/** Койки интенсивной терапии в работающих помещениях: ПИТ или реанимация (часть 47), по порядку помещений и коек. */
function careBeds(db: ContentDb, s: ShiftState, vent: boolean): Bed[] {
  if (!s.hospital) return [];
  const ctx = hospitalCtx(db, s);
  return ctx.plan.rooms
    .filter(r => db.rooms[r.type]?.icu && (db.rooms[r.type].vent ?? false) === vent && ctx.working.has(r.id))
    .flatMap(r => r.beds.flatMap((_, bed) => (bedWorks(db, r, bed) ? [{ room: r.id, bed }] : [])));
}

/**
 * Койки палаты интенсивной терапии (spec 2026-10-chapter-3, часть 38а): в работающих ПИТ — те, у
 * которых на своём месте (место под аппарат с номером койки) стоит монитор; по порядку помещений и
 * коек. Монитор продали — койка не работает, а лежащий на ней долежит. Реанимация — не ПИТ (часть 47).
 */
export function icuBeds(db: ContentDb, s: ShiftState): Bed[] {
  return careBeds(db, s, false);
}

/** Свободные койки ПИТ: под монитором и никто не лежит. */
export function freeIcuBeds(db: ContentDb, s: ShiftState): Bed[] {
  const taken = takenBeds(s);
  return icuBeds(db, s).filter(b => !taken.has(`${b.room}:${b.bed}`));
}

/**
 * Койки реанимации (spec 2026-10-chapter-4, часть 47): в работающих — те, у которых стоят и монитор, и аппарат
 * ИВЛ; продали один — койка не работает, а лежащий на ней долежит.
 */
export function ricuBeds(db: ContentDb, s: ShiftState): Bed[] {
  return careBeds(db, s, true);
}

/** Свободные койки реанимации: с монитором и аппаратом ИВЛ, никто не лежит. */
export function freeRicuBeds(db: ContentDb, s: ShiftState): Bed[] {
  const taken = takenBeds(s);
  return ricuBeds(db, s).filter(b => !taken.has(`${b.room}:${b.bed}`));
}

/** Лежит в интенсивной терапии (часть 38а): в ПИТ или в реанимации (часть 47). */
export function inIcu(db: ContentDb, s: ShiftState, p: ShiftPatient): boolean {
  const room = p.stay && s.hospital?.rooms.find(r => r.id === p.stay!.room);
  return !!room && !!db.rooms[room.type]?.icu;
}

/** Лежит в реанимации (spec 2026-10-chapter-4, часть 47). */
export function inRicu(db: ContentDb, s: ShiftState, p: ShiftPatient): boolean {
  const room = p.stay && s.hospital?.rooms.find(r => r.id === p.stay!.room);
  return !!room && !!db.rooms[room.type]?.vent;
}

/** Койки боксов инфекционного отделения в работающих боксах (spec 2026-10-chapter-4, часть 49а), по порядку помещений. */
export function boxBeds(db: ContentDb, s: ShiftState): Bed[] {
  if (!s.hospital) return [];
  const ctx = hospitalCtx(db, s);
  return ctx.plan.rooms
    .filter(r => db.rooms[r.type]?.box && ctx.working.has(r.id))
    .flatMap(r => r.beds.map((_, bed) => ({ room: r.id, bed })));
}

/** Свободные боксы: работают, никто не лежит. */
export function freeBoxBeds(db: ContentDb, s: ShiftState): Bed[] {
  const taken = takenBeds(s);
  return boxBeds(db, s).filter(b => !taken.has(`${b.room}:${b.bed}`));
}

/** Лежит в боксе (spec 2026-10-chapter-4, часть 49а). */
export function inBox(db: ContentDb, s: ShiftState, p: ShiftPatient): boolean {
  const room = p.stay && s.hospital?.rooms.find(r => r.id === p.stay!.room);
  return !!room && !!db.rooms[room.type]?.box;
}

/**
 * Койко-день лежащего, ₽: в палате (часть 26); в ПИТ — дороже (часть 38а); в реанимации на ИВЛ — ещё дороже (spec
 * 2026-10-chapter-4, часть 47): расходники аппарата и наркоз; в реанимации без ИВЛ — как в ПИТ (часть 61б): лежит под
 * монитором, аппарат стоит; в боксе — свой, с изоляцией (часть 49а).
 */
export function bedDayOf(db: ContentDb, s: ShiftState, p: ShiftPatient): number {
  const e = db.economy;
  if (inBox(db, s, p)) return e.box.bedDay;
  if (inRicu(db, s, p)) return p.stay!.plan.treatments.some(tx => db.treatments[tx]?.bedside?.equipment.includes('eq.ventilator')) ? e.ricu.bedDay : e.icu.bedDay;
  return inIcu(db, s, p) ? e.icu.bedDay : e.ward.bedDay;
}

/**
 * Что есть в больнице для решения «где лечить»: своя палата со свободной койкой; операционная, где сделают операцию
 * `op` (не указана — хоть какую; `null` — операции у болезни нет), и койка после неё; ПИТ со свободной койкой под
 * монитором (часть 38а); реанимация со свободной койкой с аппаратом ИВЛ (spec 2026-10-chapter-4, часть 47); свободный
 * бокс (часть 49а). `chosen` — место, куда этого пациента уже положили: его койка — тоже его.
 */
function venueOf(db: ContentDb, s: ShiftState, op?: Id | null, chosen?: Setting): Venue {
  const bed = chosen === 'admit' || chosen === 'surgery' || freeBeds(db, s).length > 0;
  const or = bed && op !== null && orBlock(db, s, op) === null;
  const icu = chosen === 'icu' || freeIcuBeds(db, s).length > 0;
  const ricu = chosen === 'ricu' || freeRicuBeds(db, s).length > 0;
  const box = chosen === 'box' || freeBoxBeds(db, s).length > 0;
  const rooms = hospitalCtx(db, s).rooms;
  return { ...(bed ? { ward: true } : {}), ...(or ? { or: true } : {}), ...(icu ? { icu: true } : {}), ...(ricu ? { ricu: true } : {}), ...(box ? { box: true } : {}), ...(rooms.length > 0 ? { rooms } : {}) };
}

/** Лежащие сейчас. */
export function inpatientsOf(s: ShiftState): ShiftPatient[] {
  return Object.values(s.patients).filter(p => p.status === 'admitted' && p.stay).sort((a, b) => a.stay!.since - b.stay!.since || (a.id < b.id ? -1 : 1));
}

// --- приёмное и скорая (spec 2026-09-chapter-2, часть 27) -----------------------------------

/** Места смотровой приёмного в работающих помещениях, по порядку помещений и коек. */
export function emergencyBays(db: ContentDb, s: ShiftState): Bed[] {
  if (!s.hospital) return [];
  const ctx = hospitalCtx(db, s);
  return ctx.plan.rooms
    .filter(r => db.rooms[r.type]?.emergency && ctx.working.has(r.id))
    .flatMap(r => r.beds.map((_, bed) => ({ room: r.id, bed })));
}

/**
 * Место занято, пока пациента не закрыли: ждёт, у врача или на обследовании; положили в стационар — пока его не увезли на
 * каталке (spec docs/specs/2026-10-orderlies.md).
 */
const holdsBay = (p: ShiftPatient) => p.bay !== undefined && (p.status === 'waiting' || p.status === 'inRoom' || p.status === 'away' || p.status === 'admitted');

/**
 * Свободные места смотровой. Медсестра смотровой везёт кого-то на каталке (spec docs/specs/2026-10-orderlies.md: её места
 * нет) — новых туда не кладут, пока она не вернётся: ждут у входа.
 */
export function freeBays(db: ContentDb, s: ShiftState): Bed[] {
  const taken = new Set(Object.values(s.patients).filter(holdsBay).map(p => `${p.bay!.room}:${p.bay!.bed}`));
  const away = s.rides ? awayRooms(db, s) : undefined;
  return emergencyBays(db, s).filter(b => !taken.has(`${b.room}:${b.bed}`) && !away?.has(b.room));
}

/** Смотровые, чья медсестра сейчас везёт кого-то на каталке. */
function awayRooms(db: ContentDb, s: ShiftState): Set<string> {
  const out = new Set<string>();
  for (const m of hospitalCtx(db, s).staff) if (m.role === 'role.nurse' && m.room !== undefined && backAt(s, m, s.t) > s.t) out.add(m.room);
  return out;
}

/** Привезённые скорой, что ждут у входа: мест в смотровой не было. По времени приезда. */
export function atDoorOf(s: ShiftState): ShiftPatient[] {
  return Object.values(s.patients)
    .filter(p => p.kind === 'ambulance' && !p.bay && p.status === 'waiting')
    .sort((a, b) => a.arriveT - b.arriveT || (a.id < b.id ? -1 : 1));
}

/** Освободилось место — первый ждущий у входа занимает его. */
function seatAtDoor(db: ContentDb, s: ShiftState) {
  for (const p of atDoorOf(s)) {
    const bay = freeBays(db, s)[0];
    if (!bay) return;
    p.bay = bay;
  }
}

function ambulanceDay(s: ShiftState): AmbulanceDay {
  return (s.summary.ambulance ??= { arrived: 0, sorted: 0, under: 0, over: 0 });
}

/**
 * Врач сортирует привезённого по листу передачи: цвет — место в очереди. Сверка со шкалой —
 * в итогах дня и в разборе. Прочитать лист — минута.
 */
function sortAmbulance(db: ContentDb, s: ShiftState, id: string, triage: Triage): Notice[] {
  const p = s.patients[id];
  if (!s.dayOpen || !p || p.kind !== 'ambulance' || p.sorted || p.status !== 'waiting' || !p.scale) return [];
  p.triage = triage;
  p.sorted = true;
  const day = ambulanceDay(s);
  day.sorted++;
  const d = TRIAGE_RANK[triage] - TRIAGE_RANK[p.scale.triage];
  if (d > 0) day.under++;
  if (d < 0) day.over++;
  enqueue(s, p, p.arriveT);
  return later(db, s, undefined, MIN);
}

function wardDay(s: ShiftState): WardDay {
  return (s.summary.ward ??= { admitted: 0, discharged: 0, early: 0, transferred: 0, lying: 0, stayDays: 0, stayNorm: 0 });
}

/**
 * Положить в палату: первая свободная койка, план приёма, как пойдёт болезнь — своя ветвь зерна.
 * В операционную (часть 28) — так же на койку, и в очередь операционной: операция — в плане.
 */
function admit(db: ContentDb, s: ShiftState, p: ShiftPatient) {
  const closed = p.closed!;
  // в ПИТ — на свободную койку под монитором (часть 38а), в реанимацию — с монитором и аппаратом ИВЛ (часть 47), в
  // бокс — свободный бокс (spec 2026-10-chapter-4, часть 49а), иначе — в палату
  const ricu = closed.plan.setting === 'ricu';
  const icu = closed.plan.setting === 'icu' || ricu;
  const box = closed.plan.setting === 'box';
  const bed = (ricu ? freeRicuBeds(db, s) : icu ? freeIcuBeds(db, s) : box ? freeBoxBeds(db, s) : freeBeds(db, s))[0];
  if (!bed) return;
  const plan = { treatments: [...closed.plan.treatments], setting: closed.plan.setting };
  const ev = evaluatePlan(db, p.patient, plan, observationsOf(p));
  // операция — та, что выбрали при закрытии (часть 32б: по снимку)
  const op = plan.setting === 'surgery' ? (plan.treatments.find(tx => db.treatments[tx]?.kind === 'surgery') ?? operationOf(db, p, closed.diagnosis)) : undefined;
  p.stay = {
    ...bed, since: s.day, plan, planFrom: 0, replans: 0, ...wardCourse(db, p.patient, plan, ev, branch(s, `ward:${p.id}:0`)),
    ...(op ? { op: { tx: op, queued: s.t } } : {}),
  };
  // осложнение обследования при противопоказании (spec 2026-10-chapter-4, часть 50а): пункция при коме — смерть в ночь этих
  // суток, раньше любой другой
  if (closed.outcome.examHarm) p.stay.dies = 0;
  // фибрилляция желудочков после поступления (часть 39б): в ПИТ под монитором её снимут разрядом —
  // строка обхода; в палате без монитора — смерть в ночь этих суток (сутки — с 08:00: после полуночи — ещё те же)
  const vf = p.arrest === undefined ? arrestAfter(db, s, p) : undefined;
  if (vf !== undefined && p.arriveT + vf >= s.t) {
    const night = hospitalDay(p.arriveT + vf) - s.day;
    if (icu) p.stay.shock = night;
    else p.stay.dies = Math.min(p.stay.dies ?? night, night);
  }
  // тяжёлый (spec 2026-10-rules, часть 72): по шкале листа передачи, а не по тому, как отсортировали, — и в ПИТ или
  // реанимации; по ним — задание главы 4 о смертности
  if (icu || (p.kind === 'ambulance' && p.scale?.triage === 'red')) p.stay.heavy = true;
  p.status = 'admitted';
  // узкие места суток (spec 2026-10-economy): сколько лежит сразу
  if (s.flow) meeting.lying(s);
  const day = wardDay(s);
  day.admitted++;
  if (p.stay.heavy) day.heavy = (day.heavy ?? 0) + 1;
  if (icu && !ricu) day.icu = (day.icu ?? 0) + 1;
  if (ricu) day.ricu = (day.ricu ?? 0) + 1;
  if (box) day.box = (day.box ?? 0) + 1;
  // каталка (spec docs/specs/2026-10-orderlies.md): привезённого скорой — из смотровой, кого кладут в ПИТ или реанимацию —
  // от врача; остальные идут сами
  if (gurneyOf(db, s)) {
    const from = p.bay?.room ?? (icu ? fromRoom(hospitalCtx(db, s), p) : undefined);
    if (from) carry(db, s, p, 'bed', from, bed.room);
  }
  if (op) startOperations(db, s);
}

// --- операционная (spec 2026-09-chapter-2, часть 28) -------------------------------------------

/** Почему операцию не сделать: нет операционной, она не работает (и первая причина), нет аппарата. */
export type OrBlock = { kind: 'noRoom' } | { kind: 'down'; problem: Problem } | { kind: 'noEquipment'; equipment: Id };

/** Операции базы — на них проверяют операционную, когда операция ещё не выбрана. */
const operations = (db: ContentDb) => Object.values(db.treatments).filter(t => t.surgery).map(t => t.id).sort();

/** Работающие операционные, где есть все аппараты операции, — по порядку помещений. */
function orsFor(db: ContentDb, s: ShiftState, op: Id): string[] {
  const x = db.treatments[op]?.surgery;
  if (!s.hospital || !x) return [];
  const ctx = hospitalCtx(db, s);
  return ctx.plan.rooms
    .filter(r => r.type === x.room && ctx.working.has(r.id) && x.equipment.every(e => r.equipment.includes(e)))
    .map(r => r.id);
}

/** Можно ли сделать операцию `op` (без неё — хоть одну) и если нет — почему. */
export function orBlock(db: ContentDb, s: ShiftState, op?: Id): OrBlock | null {
  const ops = op ? [op] : operations(db);
  if (!s.hospital || ops.length === 0) return { kind: 'noRoom' };
  if (ops.some(o => orsFor(db, s, o).length > 0)) return null;
  const ctx = hospitalCtx(db, s);
  const x = db.treatments[ops[0]].surgery!;
  const rooms = ctx.plan.rooms.filter(r => r.type === x.room);
  if (rooms.length === 0) return { kind: 'noRoom' };
  const down = rooms.find(r => !ctx.working.has(r.id));
  if (down && rooms.every(r => !ctx.working.has(r.id))) return { kind: 'down', problem: problemsOf(db, ctx.plan, down, ctx.staffed)[0] };
  const room = rooms.find(r => ctx.working.has(r.id))!;
  return { kind: 'noEquipment', equipment: x.equipment.find(e => !room.equipment.includes(e))! };
}

/** Можно ли с этим диагнозом в операционную: у него есть операция, операционная её делает, после неё есть койка. */
/** Операция диагноза для этого пациента (часть 32б): по самому вероятному значению скрытого параметра из того, что видно. */
export function operationOf(db: ContentDb, p: ShiftPatient, diagnosis: Id): Id | undefined {
  return operationFor(db, diagnosis, likelyParams(db, diagnosis, observationsOf(p), p.patient));
}

function canOperate(db: ContentDb, s: ShiftState, diagnosis: Id | undefined, p?: ShiftPatient): boolean {
  const op = !diagnosis ? undefined : p ? operationOf(db, p, diagnosis) : operationFor(db, diagnosis);
  return op !== undefined && orBlock(db, s, op) === null && freeBeds(db, s).length > 0;
}

/** Лежащие с операцией, которая ещё не началась, — по времени решения. */
export function orQueueOf(s: ShiftState): ShiftPatient[] {
  return inpatientsOf(s)
    .filter(p => p.stay!.op && p.stay!.op.start === undefined)
    .sort((a, b) => a.stay!.op!.queued - b.stay!.op!.queued || (a.id < b.id ? -1 : 1));
}

/**
 * Кто сейчас на столе в этой операционной. На каталке (spec docs/specs/2026-10-orderlies.md) — с той минуты, как за ним пошли,
 * и пока его не увезли со стола после операции.
 */
export function onTableIn(s: ShiftState, room: string): ShiftPatient | undefined {
  return inpatientsOf(s).find(p => {
    const op = p.stay!.op;
    return op?.room === room && op.start !== undefined && (!op.done || (op.carried === true && (op.off === undefined || op.off > s.t)));
  });
}

/** Свободные операционные берут следующих из очереди: операция — `minutes` минут по часам смены. */
function startOperations(db: ContentDb, s: ShiftState) {
  if (!s.dayOpen) return;
  for (const p of orQueueOf(s)) {
    const op = p.stay!.op!;
    const room = orsFor(db, s, op.tx).find(r => !onTableIn(s, r));
    if (!room) continue;
    // каталка (spec docs/specs/2026-10-orderlies.md): из палаты на стол везут — операция начнётся, когда переложили; везти
    // некому — ждёт в очереди операционной, стол свободен
    let start = s.t;
    if (gurneyOf(db, s)) {
      const ride = carry(db, s, p, 'op', p.stay!.room, room);
      if (!ride) continue;
      start = ride.done;
      op.carried = true;
    }
    const surgeon = hospitalCtx(db, s).staff.find(m => m.room === room && m.role === 'role.surgeon');
    op.room = room;
    if (surgeon) op.surgeon = surgeon.id;
    op.start = start;
    op.end = start + db.treatments[op.tx].surgery!.minutes * MIN;
    schedule(s, op.end, { kind: 'opEnd', id: p.id });
  }
}

function surgeryDay(s: ShiftState): SurgeryDay {
  return (s.summary.surgery ??= { done: 0, onTime: 0, late: 0, complications: 0 });
}

/**
 * Операция кончилась: осложнение — по доле операции и навыку хирурга, из ветви зерна пациента;
 * стационар после него дольше. В разбор — сколько часов прошло от решения до операции и в срок
 * ли это для болезни; расходники — в кассу дня. Операционная свободна — берёт следующего.
 */
function finishOperation(db: ContentDb, s: ShiftState, p: ShiftPatient | undefined) {
  const op = p?.stay?.op;
  if (!p || !op || op.done || op.start === undefined || p.status !== 'admitted') return;
  op.done = true;
  const surgeon = hospitalCtx(db, s).all.find(m => m.id === op.surgeon);
  const day = surgeryDay(s);
  const stay = p.stay!;
  day.done++;
  // стадия болезни на момент разреза (часть 28б): перфорация, если ждали дольше, чем она ждёт
  const truth = primaryOf(p.patient).id;
  const onset = onsetHours(p.patient);
  const hours = onset + (op.start - p.arriveT) / 3600;
  const at = complicationAt(db, p.patient);
  const complicated = hours >= at;
  // после операции — свой срок стационара от суток операции: в осложнённой стадии (часть 28б) и у
  // того, что лечат и без операции, — после рассечения спаек дольше, чем без него (часть 30в)
  const after = db.conditions[truth]?.surgery;
  // своя операция болезни — и по параметру (часть 32б: винты при переломе шейки бедра без смещения)
  const own = after && surgeriesOf(db, truth).includes(op.tx) ? after.stay : undefined;
  const norm = complicated ? (db.conditions[truth]?.complication?.stay ?? own) : own;
  if (norm && stay.readyAfter !== undefined) stay.readyAfter = daysIn(stay, s.day) + branch(s, `surgery:${p.id}:stay`).range(norm[0], norm[1]);
  if (complicated) {
    op.complicated = true;
    day.complicated = (day.complicated ?? 0) + 1;
    // осложнилось после поступления — пока ждал в больнице (задание главы 2, часть 34)
    if (at > onset) day.waited = (day.waited ?? 0) + 1;
    p.closed!.notes.push({ code: 'op.complicated', tx: op.tx, of: truth, hours: Math.round(hours), before: at <= onset });
  }
  if (branch(s, `surgery:${p.id}`).chance(complicationsOf(db, op.tx, surgeon, complicated))) {
    op.complication = true;
    day.complications++;
    if (stay.readyAfter !== undefined) stay.readyAfter += branch(s, `surgery:${p.id}:days`).range(COMPLICATION_DAYS[0], COMPLICATION_DAYS[1]);
    p.closed!.notes.push({ code: 'op.complication', tx: op.tx });
  }
  // умер после операции — решено сейчас, случится ночью (часть 28б): доля — по стадии
  if (branch(s, `surgery:${p.id}:death`).chance(deathsOf(db, op.tx, complicated, (op.start - p.arriveT) / 3600))) stay.dies = daysIn(stay, s.day);
  if (!op.complication && stay.dies === undefined) day.good = (day.good ?? 0) + 1;
  // срок — от решения положить: наблюдали, потом оперировали — считается от поступления; у
  // холецистита — от начала болезни (часть 30): пришедшему на третьи сутки оперировать уже поздно
  const plan = db.conditions[p.closed!.diagnosis]?.surgery;
  // срок — у операции, которая по правде была нужна, или после наблюдения; оперировали то, что
  // лечат без операции (часть 30д: дивертикулит без перитонита), — строки срока нет, разбор скажет
  // «больше нужного»
  const needed = recommendedSetting(db, p.patient, p.results.map(r => r.exam)) === 'surgery';
  if (plan && (needed || plan.observe !== undefined)) {
    const fromOnset = plan.from === 'onset';
    const rounded = fromOnset ? Math.round(hours * 10) / 10 : Math.round((op.start - p.closed!.at) / 360) / 10;
    // экстренной операции не было нужно, лечили в палате — срок после наблюдения (часть 30в): у
    // непроходимости без ишемии и перитонита — не позже 72 ч от поступления
    const observed = plan.observe !== undefined && !needed;
    const window = observed ? plan.observe! : plan.window;
    // срока нет (часть 32: закрытый перелом) — строки срока нет
    if (window !== undefined) {
      const onTime = rounded <= window;
      if (onTime) day.onTime++;
      else day.late++;
      p.closed!.notes.push({
        code: onTime ? 'op.onTime' : 'op.late', tx: op.tx, hours: rounded, window,
        ...(fromOnset ? { onset: true as const } : {}), ...(observed ? { observed: true as const } : {}),
      });
    }
  }
  if (s.economy) {
    ledgerOf(s).expenses.consumables += db.treatments[op.tx].cost;
    roomExpense(s, op.room ?? stay.room, db.treatments[op.tx].cost);
  }
  // каталка (spec docs/specs/2026-10-orderlies.md): со стола — назад на свою койку; стол свободен, когда его увезли
  if (op.carried && op.room) {
    const ride = carry(db, s, p, 'back', op.room, stay.room);
    if (ride) op.off = ride.off;
  }
  startOperations(db, s);
}

/**
 * Ночь (часть 28): неотложную операцию не откладывают до утра — идущие кончаются, очередь
 * оперируют по одному в каждой работающей операционной, начиная с вечера. Операционной нет —
 * ждут утра.
 */
function nightOperations(db: ContentDb, s: ShiftState) {
  const running = inpatientsOf(s).filter(p => p.stay!.op && !p.stay!.op.done && p.stay!.op.start !== undefined);
  const free: Record<string, number> = {};
  for (const p of running) {
    free[p.stay!.op!.room!] = p.stay!.op!.end!;
    finishOperation(db, s, p);
  }
  for (const p of orQueueOf(s)) {
    const op = p.stay!.op!;
    const rooms = orsFor(db, s, op.tx);
    if (rooms.length === 0) continue;
    const room = rooms.reduce((a, b) => ((free[b] ?? s.t) < (free[a] ?? s.t) ? b : a));
    const surgeon = hospitalCtx(db, s).staff.find(m => m.room === room && m.role === 'role.surgeon');
    op.room = room;
    if (surgeon) op.surgeon = surgeon.id;
    op.start = Math.max(s.t, free[room] ?? s.t);
    op.end = op.start + db.treatments[op.tx].surgery!.minutes * MIN;
    free[room] = op.end;
    finishOperation(db, s, p);
  }
}

/**
 * С обхода — в операционную (часть 28): лежащего, у которого операции ещё не было, — операцией
 * его диагноза; болезнь идёт дальше с планом, где она есть, с этих суток.
 */
function operate(db: ContentDb, s: ShiftState, id: string): Notice[] {
  if (!s.dayOpen || !toTable(db, s, s.patients[id])) return [];
  const notices = advanceBy(db, s, 2 * MIN);
  startOperations(db, s);
  return notices;
}

/** Лежащего — в очередь операционной, операцией его диагноза; нельзя — false, ничего не меняется. Время — у того, кто решил. */
function toTable(db: ContentDb, s: ShiftState, p: ShiftPatient | undefined): boolean {
  if (!p || p.status !== 'admitted' || !p.stay || p.stay.op || !p.closed) return false;
  const op = operationOf(db, p, p.closed.diagnosis);
  if (!op || orBlock(db, s, op) !== null) return false;
  const stay = p.stay;
  const from = daysIn(stay, s.day);
  const plan = { treatments: [...new Set([...stay.plan.treatments, op])].sort(), setting: 'surgery' as const };
  const ev = evaluatePlan(db, p.patient, plan, observationsOf(p));
  const replans = stay.replans + 1;
  const course = wardCourse(db, p.patient, plan, ev, branch(s, `ward:${p.id}:${replans}`), from);
  p.stay = { room: stay.room, bed: stay.bed, since: stay.since, plan, planFrom: from, replans, ...course, op: { tx: op, queued: s.t } };
  return true;
}

// --- каталка (spec docs/specs/2026-10-orderlies.md) ---------------------------------------------------------------------

/**
 * Перевозка лежачего на обследование и назад (spec docs/specs/2026-10-orderlies.md, «Как будет», 4): процедура `seconds`
 * секунд в кабинете `room`, аппарат свободен с часа его очереди; взять его — не раньше `after` и не раньше, чем он вернётся
 * с другого обследования. Ничего не меняет; везти некому — нет.
 */
function examRide(db: ContentDb, s: ShiftState, ctx: HospitalCtx, p: ShiftPatient, room: string, seconds: number, after: number): Ride | undefined {
  return planRide(db, s, ctx.plan, ctx.staff, p.id, 'exam', p.bay!.room, room, { exam: { seconds, ready: s.rooms[room] ?? 0 }, after: Math.max(after, p.out?.back ?? 0), since: after, urgent: urgentRide(p) });
}

/**
 * Срочный лежачий — кого везут первым, когда некому было везти, и кого без санитара везёт медсестра (решение владельца
 * #99): красный, в ПИТ или реанимацию; на операцию и назад со стола — тоже (`carry`): иначе операционная стоит занятой.
 */
const urgentRide = (p: ShiftPatient): boolean => p.triage === 'red' || p.stay?.plan.setting === 'icu' || p.stay?.plan.setting === 'ricu';

/**
 * Везти лежачего `p` на каталке из `from` в `to` (`why`): на того, кто раньше будет у него (`planRide`). Записали — его
 * перевозка (`startRide`); некому — ждёт в `rideWait`, пока кто-то не выйдет на смену или его не наймут, а на операцию —
 * в очереди операционной. `since` — с какого часа ждёт.
 */
function carry(db: ContentDb, s: ShiftState, p: ShiftPatient, why: 'bed' | 'op' | 'back', from: string, to: string, since = s.t): Ride | undefined {
  const ctx = hospitalCtx(db, s);
  const urgent = why !== 'bed' || urgentRide(p);
  const ride = planRide(db, s, ctx.plan, ctx.staff, p.id, why, from, to, { since, urgent });
  if (!ride) {
    if (why !== 'op') (s.rideWait ??= []).push({ id: p.id, why, from, to, since, ...(urgent ? { urgent: true as const } : {}) });
    if (why === 'bed') journey.bedRide(s, p, { since, from, to }, false, !urgent);
    return undefined;
  }
  startRide(db, s, ride);
  return ride;
}

/**
 * Перевозка записана: она за ним, он устал на `ride` очков; события — увезли оттуда, где лежал (из смотровой — место
 * свободно, со стола — операционная свободна), и вернулся на место. Ждал дольше `gurney`-порога планёрки — в её узкие места.
 */
function startRide(db: ContentDb, s: ShiftState, ride: Ride) {
  book(s, ride);
  if (ride.why === 'bed' && s.patients[ride.id]) journey.bedRide(s, s.patients[ride.id], ride, s.staff?.find(x => x.id === ride.by)?.role !== ORDERLY);
  const m = s.staff?.find(x => x.id === ride.by);
  if (m) worked(db, s, m, 'ride');
  if (ride.why === 'back' || (ride.why === 'bed' && s.patients[ride.id]?.bay)) schedule(s, ride.off, { kind: 'ride', id: ride.id, at: 'off', by: ride.by });
  schedule(s, ride.home, { kind: 'ride', id: ride.id, at: 'home', by: ride.by });
  meeting.gurney(s, ride.since, ride.pick);
}

/**
 * Событие перевозки: увезли из смотровой — место свободно, первый ждущий у входа занимает его; увезли со стола —
 * операционная берёт следующего. Вернулся на место — перевозка кончилась; санитару, может быть, пора отдыхать.
 */
function rideStep(db: ContentDb, s: ShiftState, ev: Extract<ShiftEvent, { kind: 'ride' }>) {
  if (ev.at === 'off') {
    const p = s.patients[ev.id];
    if (p?.bay && p.status === 'admitted') {
      delete p.bay;
      seatAtDoor(db, s);
    }
    startOperations(db, s);
    return;
  }
  rideHome(s, ev.id, ev.by);
  const m = s.staff?.find(x => x.id === ev.by);
  if (m && m.role === ORDERLY) examCrew(db, s, m);
  // медсестра вернулась — в её смотровую снова кладут ждущих у входа
  if (m && m.role !== ORDERLY) seatAtDoor(db, s);
}

/**
 * Пересменка и найм: лежачие, кого некому было везти, — срочные первыми, потом по порядку; везти снова некому — ждут
 * дальше. Очередь операционной — тоже: на операцию везти было некому.
 */
function retryRides(db: ContentDb, s: ShiftState) {
  if (!gurneyOf(db, s)) return;
  const wait = s.rideWait;
  if (wait) {
    delete s.rideWait;
    const order = [...wait].sort((a, b) => Number(!!b.urgent) - Number(!!a.urgent) || a.since - b.since);
    for (const w of order) {
      const p = s.patients[w.id];
      if (!p || p.status !== 'admitted') continue;
      const ride = carry(db, s, p, w.why, w.from, w.to, w.since);
      if (ride && w.why === 'back' && p.stay?.op) p.stay.op.off = ride.off;
    }
  }
  startOperations(db, s);
}

/**
 * Выписать или перевести лежащего. Выписка, когда болезнь разрешилась, — «выздоровел»; раньше —
 * вернётся хуже. Перевод — исход «переведён». ОМС платит за случай стационара: выписка в срок —
 * полностью, прерванный (перевод, ранняя выписка) — долю, госпитализация без показаний — ничего;
 * итог стационара — в закрытый случай.
 */
function leaveWard(db: ContentDb, s: ShiftState, id: string, how: 'discharge' | 'transfer'): Notice[] {
  const p = s.patients[id];
  // врач спрашивал о выписке (spec 2026-10-two-ways, F3): выписали из «Обхода» — согласились, перевели — изменили
  const asked = p?.approve ? (how === 'discharge' ? 'agreed' : 'changed') : undefined;
  // обход — днём: доход случая идёт в кассу этого дня
  if (!s.dayOpen || !leave(db, s, p, how, asked)) return [];
  return later(db, s, undefined, 2 * MIN); // выписка, эпикриз
}

/**
 * Выписать или перевести (`leaveWard`), не тратя времени: время — у того, кто решил. Нельзя — false, ничего не меняется.
 * Врач спрашивал главврача о выписке (spec 2026-10-two-ways, F3) — `asked`: чем это кончилось для итогов главврача.
 */
function leave(db: ContentDb, s: ShiftState, p: ShiftPatient | undefined, how: 'discharge' | 'transfer', asked?: Settled): boolean {
  if (!p || p.status !== 'admitted' || !p.stay || !p.closed) return false;
  const stay = p.stay;
  // на столе — ни выписать, ни перевести; ждёт операции — только перевести (часть 28)
  if (stay.op && !stay.op.done && (stay.op.start !== undefined || how === 'discharge')) return false;
  if (asked && p.approve) closeApproval(s, p, asked);
  const days = daysIn(stay, s.day);
  const state = wardState(stay, days);
  const ward = wardDay(s);
  let end: StayEnd;
  if (how === 'transfer') {
    end = 'transferred';
    p.closed.outcome = { kind: 'transferred', day: days, cured: false };
    ward.transferred++;
  } else if (state === 'ready') {
    end = 'discharged';
    // острый период позади (часть 41а): без тромболизиса последствия инсульта остались
    p.closed.outcome = { kind: 'recovered', day: days, cured: stay.settled !== 'residual', ...(stay.settled ? { settled: stay.settled } : {}) };
    ward.discharged++;
  } else {
    // выписан, когда болезнь ещё не прошла: вернётся хуже через день-два
    end = 'early';
    const back = Math.max(1, branch(s, `early:${p.id}`).range(1, 2));
    p.closed.outcome = { kind: 'worse', day: days + back, returns: { day: back, reason: 'worse' }, cured: false };
    s.returns.push({ day: s.day + back, of: p.id, reason: 'worse' });
    s.summary.returnsPlanned++;
    ward.discharged++;
    ward.early++;
    // тяжёлый раньше срока — потеря для задания о смертности (spec 2026-10-rules, часть 72)
    if (stay.heavy) ward.heavyEarly = (ward.heavyEarly ?? 0) + 1;
  }
  closeStay(db, s, p, end, days);
  return true;
}

/**
 * Утренний обход нанятых врачей (поток для ПК, spec 2026-10-day; со временем врача — spec docs/specs/2026-10-staff-motion.md,
 * часть 2, решения владельца #166 и #181). Кого кто обойдёт — `roundsDue`: свои лежащие нанятого врача в смене, лежащие
 * отсутствующего — замещающего или врача той же должности; где обходит клиническая медсестра — только те, кому нужно
 * решение. Свободный врач идёт сразу, занятый — когда допримет текущего (`callIn`, `goRound`); клиническая медсестра — сразу,
 * по койкам своего помещения. Решение — у койки (`roundStop`). Ваших лежащих (приём закрыли вы) обход не трогает: они в
 * вашем списке «Обход». Без чисел обхода (`round` в economy.yaml) — мгновенный, как до части 2.
 */
function rounds(db: ContentDb, s: ShiftState, notices: Notice[]) {
  const minutes = roundMinutes(db);
  if (minutes === undefined) {
    for (const p of inpatientsOf(s)) decideAtBed(db, s, p, notices);
    return;
  }
  const ctx = hospitalCtx(db, s);
  const lying = inpatientsOf(s);
  // клинические медсёстры в смене (часть 2б): в своём работающем помещении
  const nurses = ctx.staff.filter(m => m.role === CLINICAL && m.room !== undefined && ctx.working.has(m.room));
  const watched = new Set(nurses.map(m => m.room!));
  s.rounds = { day: s.day, due: roundsDue(colleaguesOf(db, s), ctx.all, lying, watched, s.day), on: [] };
  for (const n of nurses) {
    const beds = lying.filter(p => p.stay!.room === n.room);
    if (beds.length === 0) continue;
    const r = roundOf(ctx.plan, n.id, n.room, beds, s.t, minutes, true);
    s.rounds.on.push(r);
    for (const st of r.stops) schedule(s, st.end, { kind: 'roundStop', by: n.id, id: st.id, nurse: true });
  }
  staffDesks(db, s);
}

/**
 * Врач `m` свободен, а его ждёт обход (часть 2а): путь с часами сразу — от кабинета по палатам и назад (`roundOf`); до
 * возвращения он занят (`desk`) и никого не зовёт, у каждой койки — решение в конце его минут (`roundStop`). Ждущие его
 * ждут, как врача на перерыве: в пути — «на обходе». Обходить некого (лежащих увезли, выписали) — нет обхода.
 */
function goRound(db: ContentDb, s: ShiftState, plan: Plan, m: StaffMember): boolean {
  const ids = s.rounds!.due[m.id];
  delete s.rounds!.due[m.id];
  const minutes = roundMinutes(db);
  const beds = ids.map(id => s.patients[id]).filter(p => p?.status === 'admitted' && p.stay);
  if (minutes === undefined || beds.length === 0) return false;
  const r = roundOf(plan, m.id, m.room, beds, s.t, minutes);
  s.rounds!.on.push(r);
  (s.desk ??= {})[m.id] = r.until;
  schedule(s, r.until, { kind: 'free', by: m.id });
  for (const st of r.stops) schedule(s, st.end, { kind: 'roundStop', by: m.id, id: st.id });
  journey.rested(s, m.id, 'round', r.until);
  return true;
}

/**
 * Обход (часть 2): `by` кончил свои минуты у койки больного `id` — койка для него работа (усталость); врач решает о больном,
 * клиническая медсестра — нет: кому нужно решение, врач знал с часа обхода.
 */
function roundStop(db: ContentDb, s: ShiftState, ev: Extract<ShiftEvent, { kind: 'roundStop' }>, notices: Notice[]) {
  // уволен посреди обхода — остальных его коек сегодня не обходят
  const m = s.staff?.find(x => x.id === ev.by);
  if (!m) return;
  worked(db, s, m, 'bed');
  const p = s.patients[ev.id];
  if (!ev.nurse && p?.status === 'admitted' && p.stay) decideAtBed(db, s, p, notices);
}

/**
 * Решение обхода у койки лежащего нанятого врача — по правилу разумного врача «Анамнеза» из его симулятора районной больницы
 * (`tools/sim/district.ts`, `rounds`): кто лежит хотя бы сутки и не ждёт операции — можно выписывать — выписывает; хуже — в
 * операционную, если у болезни есть операция и её здесь сделают, иначе переводит; реакция на лечение — переводит. Ваших
 * лежащих (приём закрыли вы) не трогает. Главврач просил спрашивать о выписке (spec 2026-10-two-ways, F3) — врач спрашивает,
 * прежде чем выписать.
 */
function decideAtBed(db: ContentDb, s: ShiftState, p: ShiftPatient, notices: Notice[]) {
  const stay = p.stay!;
  if (!p.closed?.by || (stay.op && !stay.op.done)) return;
  const days = daysIn(stay, s.day);
  if (days < 1) return;
  const state = wardState(stay, days);
  if (state === 'ready' && asksOf(s).includes('discharge') && db.consults) askDischarge(db, s, p, notices);
  else if (state === 'ready') leave(db, s, p, 'discharge');
  else if (state === 'worse' && !stay.op && toTable(db, s, p)) startOperations(db, s);
  else if (state === 'worse' || state === 'reaction') leave(db, s, p, 'transfer');
}

/**
 * Случай стационара кончился: срок — у выписанных, касса — по тому, как кончился. Без показаний
 * — то, что разбор приёма счёл лишним: по нужде пациента, как оценка «где лечить»; повторный —
 * вернулся хуже после ранней выписки (часть 35); умер — страховая платит за случай, как за
 * законченный (часть 28б).
 */
function closeStay(db: ContentDb, s: ShiftState, p: ShiftPatient, end: StayEnd, days: number) {
  const stay = p.stay!;
  const closed = p.closed!;
  const norm = stayNorm(db, closed.diagnosis);
  const ward = wardDay(s);
  if (end === 'discharged' || end === 'early') {
    ward.stayDays += days;
    ward.stayNorm += norm;
  }
  closed.stay = { days, norm, end };
  p.status = 'done';
  // врач спрашивал главврача о выписке, а случай кончился иначе (spec 2026-10-two-ways, F3) — спрашивать не о чем
  if (p.approve) closeApproval(s, p);
  // каталка (spec docs/specs/2026-10-orderlies.md): ушёл, не дождавшись её, — место в смотровой свободно, ждать нечего
  if (p.bay) {
    delete p.bay;
    seatAtDoor(db, s);
  }
  if (s.rideWait) {
    s.rideWait = s.rideWait.filter(w => w.id !== p.id);
    if (s.rideWait.length === 0) delete s.rideWait;
  }
  if (s.economy) {
    const chosen = stay.plan.setting === 'surgery' || stay.plan.setting === 'icu' || stay.plan.setting === 'ricu' || stay.plan.setting === 'box' ? stay.plan.setting : 'admit';
    // место — по пришедшим результатам (часть 40): после КТ без крови палата при сотрясении — не ошибка
    const done = p.results.map(r => r.exam);
    // и по аппаратам у постели в момент решения (часть 42б)
    const recommended = recommendedSetting(db, p.patient, done, closed.bedside, closed.rooms);
    const over = settingFit(recommended, chosen, alsoSettings(db, p.patient, done, closed.bedside, closed.rooms)) === 'over';
    const close: WardClose = over ? 'unindicated' : p.afterEarly ? 'repeat' : end === 'discharged' || end === 'died' ? 'full' : 'interrupted';
    const ledger = ledgerOf(s);
    ledger.ward ??= { cases: 0, income: 0, interrupted: 0, unindicated: 0 };
    ledger.ward.cases++;
    // прибавка за ПИТ — только если ПИТ была нужна (часть 38а): без показаний — тариф палаты; за реанимацию с ИВЛ
    // — если она была нужна, нужна была ПИТ — прибавка за ПИТ (spec 2026-10-chapter-4, часть 47); за бокс — если
    // изоляция была нужна (часть 49а)
    const unit = careUnit(chosen, recommended);
    const op = stay.op?.done ? stay.op.tx : undefined;
    // ось «Управление» (решение владельца #151): и случай стационара — на множитель уровня
    const pay = manageOf(db, s).pay;
    const paid = scaledInt(wardIncome(db, closed.diagnosis, closed.grades.defensibility, close, op, unit), pay);
    ledger.ward.income += paid;
    // деньги по помещениям (часть 2 слоя «Показатели»): палате — случай стационара; операционной — то, что прибавила
    // операция, — разница тарифа с ней и без неё
    const surgery = op && stay.op?.room ? paid - scaledInt(wardIncome(db, closed.diagnosis, closed.grades.defensibility, close, undefined, unit), pay) : 0;
    if (surgery !== 0) roomIncome(s, stay.op!.room!, surgery);
    roomIncome(s, stay.room, paid - surgery, 'stays');
    if (close === 'interrupted') ledger.ward.interrupted++;
    if (close === 'unindicated') ledger.ward.unindicated++;
    if (close === 'repeat') ledger.ward.repeat = (ledger.ward.repeat ?? 0) + 1;
  }
}

/**
 * За какую интенсивную терапию прибавка ОМС (части 38а и 47): выбранная, если нужна она или меньшая; за бокс (spec
 * 2026-10-chapter-4, часть 49а) — если изоляция была нужна.
 */
export function careUnit(chosen: Setting, recommended: Setting): 'icu' | 'ricu' | 'box' | undefined {
  if (chosen === 'ricu' && recommended === 'ricu') return 'ricu';
  if ((chosen === 'icu' || chosen === 'ricu') && recommended === 'icu') return 'icu';
  if (chosen === 'box' && recommended === 'box') return 'box';
  return undefined;
}

/**
 * Ночь (часть 28б): кому после операции выпало умереть — умирает; в «мягком режиме» его вместо
 * этого переводят в областную больницу в тяжёлом состоянии, оценки те же. В итогах — одной
 * спокойной строкой.
 */
function nightDeaths(db: ContentDb, s: ShiftState) {
  for (const p of inpatientsOf(s)) {
    const stay = p.stay!;
    const days = daysIn(stay, s.day);
    if (stay.dies === undefined || days < stay.dies || !p.closed) continue;
    const ward = wardDay(s);
    // осложнение обследования (часть 50а) остаётся в исходе: разбор называет его
    const harm = p.closed.outcome.examHarm ? { examHarm: p.closed.outcome.examHarm } : {};
    if (stay.heavy) ward.heavyDied = (ward.heavyDied ?? 0) + 1;
    if (s.meta.soft) {
      p.closed.outcome = { kind: 'transferred', day: days, cured: false, severe: true, ...harm };
      ward.transferred++;
      ward.severe = (ward.severe ?? 0) + 1;
      closeStay(db, s, p, 'transferred', days);
    } else {
      p.closed.outcome = { kind: 'died', day: days, cured: false, ...harm };
      ward.died = (ward.died ?? 0) + 1;
      closeStay(db, s, p, 'died', days);
    }
  }
}

/** Сменить лечение лежащего на обходе: болезнь идёт дальше с новым планом с этих суток. */
function replan(db: ContentDb, s: ShiftState, id: string, treatments: Id[]): Notice[] {
  const p = s.patients[id];
  if (!s.dayOpen || !p || p.status !== 'admitted' || !p.stay) return [];
  const stay = p.stay;
  // лечение у постели (часть 39а) добавить можно только у койки с его аппаратом; назначенное — остаётся
  const bed = stayEquipment(db, s, p);
  const known = treatments.filter(tx => db.treatments[tx] && db.treatments[tx].kind !== 'surgery'
    && (stay.plan.treatments.includes(tx) || txAvailable(db, tx, { bedside: bed, rooms: hospitalCtx(db, s).rooms })));
  const from = daysIn(stay, s.day);
  // операция остаётся в плане: её меняют «В операционную», а не сменой лечения (часть 28)
  const plan = { treatments: [...new Set([...known, ...(stay.op ? [stay.op.tx] : [])])].sort(), setting: stay.plan.setting };
  // часы идут (часть 41а): на обходе окно тромболизиса давно закрыто — течение по нынешнему часу, а
  // разбор приёма остаётся на минуту решения
  const now = patientAt(db, p.patient, Math.round((s.t - p.arriveT) / 60)).patient;
  const ev = evaluatePlan(db, now, plan, observationsOf(p));
  const replans = stay.replans + 1;
  const course = wardCourse(db, now, plan, ev, branch(s, `ward:${p.id}:${replans}`), from);
  if (stay.op?.done) {
    // после операции причина устранена: новое лечение выписку не сдвигает, своя у него — только реакция
    const { reaction: _, ...kept } = stay;
    p.stay = { ...kept, plan, replans, ...(course.reaction ? { reaction: course.reaction } : {}) };
  } else {
    // смерть в ночь (фибрилляция без монитора, осложнение пункции — часть 50а) сменой лечения не отменить
    p.stay = {
      room: stay.room, bed: stay.bed, since: stay.since, plan, planFrom: from, replans, ...course, ...(stay.op ? { op: stay.op } : {}),
      ...(stay.dies !== undefined ? { dies: stay.dies } : {}), ...(stay.shock !== undefined ? { shock: stay.shock } : {}),
    };
  }
  return later(db, s, undefined, 2 * MIN);
}

// --- время --------------------------------------------------------------------------

function spend(db: ContentDb, s: ShiftState, p: ShiftPatient, seconds: number): Notice[] {
  p.spent.seconds += seconds;
  return advanceBy(db, s, seconds);
}

/** Сколько за раз проживать время в конце команды — даёт сессия (`apply` с `more`); нет — всё сразу. */
let tailMore: (() => boolean) | undefined;

/**
 * Время в конце команды (0.5.13, NFR-PRF-1): обследование, вызов, «подождите», закрытие приёма, промотка часов. С `more`
 * от сессии — по частям (`catchUp`): что не прожито, прожито будет в следующих кадрах, а следующая команда сначала
 * доживёт всё. Без `more` — сразу, как `spend` и `advanceBy`.
 */
function later(db: ContentDb, s: ShiftState, p: ShiftPatient | undefined, seconds: number): Notice[] {
  if (p) p.spent.seconds += seconds;
  if (seconds <= 0) return [];
  s.until = s.t + seconds;
  return catchUp(db, s, tailMore);
}

/**
 * Дожить время команды (0.5.13): события по порядку, пока `more()` перед каждым, — остальное в следующий раз; без `more`
 * — всё. Как `advanceBy`: время идёт по событиям, а в конце — тот час, до которого жили. Нечего доживать — ничего.
 */
export function catchUp(db: ContentDb, s: ShiftState, more?: () => boolean): Notice[] {
  const notices: Notice[] = [];
  const target = s.until;
  if (target === undefined) return notices;
  while (s.events.length > 0 && s.events[0].t <= target) {
    if (more && !more()) return notices;
    // шаг нанятого врача — по частям (0.5.13): часы — уже на его минуте, событие — когда он посчитан
    s.t = Math.max(s.t, s.events[0].t);
    if (more && !colleagueReady(db, s, more)) return notices;
    const { event } = s.events.shift()!;
    handle(db, s, event, notices);
  }
  s.t = target;
  delete s.until;
  return notices;
}

function schedule(s: ShiftState, t: number, event: ShiftEvent) {
  const item = { t, seq: s.seq++, event };
  let i = s.events.length;
  while (i > 0 && (s.events[i - 1].t > t || (s.events[i - 1].t === t && s.events[i - 1].seq > item.seq))) i--;
  s.events.splice(i, 0, item);
}

/** Прожить `seconds`: события по порядку, при равном времени — по номеру постановки. */
function advanceBy(db: ContentDb, s: ShiftState, seconds: number): Notice[] {
  const notices: Notice[] = [];
  if (seconds <= 0) return notices;
  const target = s.t + seconds;
  while (s.events.length > 0 && s.events[0].t <= target) {
    const { t, event } = s.events.shift()!;
    s.t = Math.max(s.t, t);
    handle(db, s, event, notices);
  }
  s.t = target;
  return notices;
}

function handle(db: ContentDb, s: ShiftState, ev: ShiftEvent, notices: Notice[]) {
  switch (ev.kind) {
    case 'arrive':
      return arrive(db, s, s.patients[ev.id], notices);
    case 'result':
      results(db, s, s.patients[ev.id], notices);
      return staffDesks(db, s);
    case 'patience': {
      const p = s.patients[ev.id];
      if (p.status !== 'waiting' || p.wait !== ev.wait) return;
      // «Почему?» у цифр планёрки (spec 2026-10-why): почему ушёл — пока он ещё ждёт
      const gone = s.flow ? leaving(db, s, p) : undefined;
      p.status = 'left';
      s.queue = s.queue.filter(x => x !== p.id);
      s.summary.left++;
      // узкие места суток (spec 2026-10-economy): ждал врача до ухода; и почему ушёл
      if (gone) meeting.left(s, p, gone.why, gone.stood, gone.asks);
      notices.push({ kind: 'left', id: p.id });
      evict(s, p);
      if (gone) journey.leftWhy(s, p, gone.why);
      return doors(db, s);
    }
    case 'flow':
      return flowArrive(db, s, ev, notices);
    case 'colleague':
      return colleagueStep(db, s, s.patients[ev.id], ev, notices);
    case 'nurse':
      return nurse(db, s, s.patients[ev.id], notices);
    case 'opEnd':
      return finishOperation(db, s, s.patients[ev.id]);
    case 'arrest': {
      // фибрилляция желудочков в смотровой (часть 39б): под монитором — разряд, ритм восстановлен. Уже
      // закрыт: увезли — в машине дефибриллятор; лежит у нас — решено при поступлении
      const p = s.patients[ev.id];
      if (!p || p.closed || p.kind !== 'ambulance') return;
      p.arrest = s.t;
      notices.push({ kind: 'arrest', id: p.id });
      return;
    }
    case 'free':
    case 'ready':
      return staffDesks(db, s);
    case 'shiftEnd':
      notices.push({ kind: 'shiftEnd' });
      return;
    case 'siteFree': {
      // касса и поток от больницы (spec 2026-10-economy) — как у команды стройки
      accrue(db, s);
      const was = s.flow?.auto ? capacityOf(db, s) : undefined;
      siteFree(db, s);
      return reflow(db, s, was);
    }
    case 'morning':
      return morning(db, s, notices);
    case 'rounds':
      return rounds(db, s, notices);
    case 'roundStop':
      return roundStop(db, s, ev, notices);
    // «Главврач утверждает» (spec 2026-10-two-ways, F3): срок ответа — молчание тоже ответ, решение врача в силе
    case 'approve': {
      const p = s.patients[ev.id];
      if (p?.approve && p.approve.until <= s.t) settleApproval(db, s, p, 'silent');
      return;
    }
    case 'duty':
      return duty(db, s);
    case 'crew':
      return crewStep(db, s, ev.id);
    case 'ride':
      return rideStep(db, s, ev);
    case 'reach': {
      // поток для ПК (spec 2026-10-owner-play-2): ваш пациент дошёл — если он ещё ваш и не ушёл на другое обследование
      const p = s.patients[ev.id];
      if (!p || s.current !== p.id || (s.meet !== undefined && s.meet > s.t)) return;
      if (isOut(s, p)) {
        // взяли у врача, пока он был на снимке, — встретитесь, когда вернётся
        if (s.meet !== undefined) meetAt(s, p, p.out!.back);
        return;
      }
      delete s.meet;
      notices.push({ kind: 'reached', id: p.id });
      return;
    }
  }
}

/**
 * Пришёл: регистратор слышит жалобу — по ней и срочность; медсестра доврачебного кабинета меряет витальные, когда он до
 * неё дойдёт (0.5.12, отзыв на 0.5.11: срочный, которого позвали сразу, приходил к врачу уже измеренным). Нет её —
 * меряет врач.
 */
function arrive(db: ContentDb, s: ShiftState, p: ShiftPatient, notices: Notice[]) {
  if (p.status !== 'coming') return;
  if (p.kind === 'ambulance') return arriveByAmbulance(db, s, p, notices);
  const ctx = hospitalCtx(db, s);
  const nurse = ctx.triage && db.exams['exam.vitals'] !== undefined;
  p.triage = triageOf(db, p);
  if (!ctx.triage) p.triaged = false;
  // терпение — каков он на самом деле: и по тому, что медсестра у него намеряет
  const sure = nurse ? triageOf(db, p, vitalsOf(db, s, p)) : p.triage;
  const [lo, hi] = sure === 'red' ? [0, 0] : PATIENCE[sure];
  // ось «Управление» (spec 2026-10-difficulty): терпение пришедших — на множитель уровня
  p.patience = Math.round(scaled(branch(s, `patience:${p.id}`).range(lo, hi) * MIN * patienceOf(s.meta.difficulty), manageOf(db, s).patience));
  // своя больница: пришёл в полную зону ожидания — стоит, и ждать готов вдвое меньше; в потоке для ПК — по своему залу,
  // это решает `seatPc` (spec 2026-10-own-hall)
  if (s.hospital && !s.flow && p.patience > 0 && s.queue.length >= ctx.seats) p.patience = Math.round(p.patience / 2);
  s.summary.arrived++;
  if (p.kind === 'return') s.summary.returnsToday++;
  // «Почему?» у цифр планёрки (spec 2026-10-why): пришли по виду
  if (s.flow) meeting.arrived(s, p.kind);
  // поток для ПК (spec 2026-10-walk): к какому врачу записан, где ждёт и когда туда дойдёт
  if (s.flow) seatPc(db, s, p, ctx, nurse);
  enqueue(s, p, s.t, p.seatAt ?? s.t);
  notices.push({ kind: 'arrived', id: p.id, triage: p.triaged === false ? 'green' : p.triage });
  if (nurse) schedule(s, p.triAt !== undefined ? p.triAt + TRIAGE : s.t + REGISTRATION + TRIAGE, { kind: 'nurse', id: p.id });
  // поток для ПК (spec 2026-10-walk): оформят и измерят — тогда его позовёт нанятый врач
  if (s.flow && readyAt(p) > s.t) schedule(s, readyAt(p), { kind: 'ready', id: p.id });
  staffDesks(db, s);
}

/**
 * Поток для ПК (spec 2026-10-walk, «Свой врач», «Своя зона ожидания»): к кому записан пришедший, в какой зоне ожидания
 * ждёт — у кабинета его врача (ваш — у вашего) — и когда до неё дойдёт от входа.
 */
function seatPc(db: ContentDb, s: ShiftState, p: ShiftPatient, ctx: HospitalCtx, nurse: boolean) {
  const m = docFor(db, s, p, colleaguesOf(db, s));
  if (m) p.doc = m.id;
  const office = m?.room ?? doctorRoom(ctx.plan);
  const hall = hallNear(ctx.plan, ctx.working, office);
  // сидя или стоя — по своему залу (spec 2026-10-own-hall): места в своём зале нет — ждёт у двери кабинета, в дальний зал
  // не идёт; у двери свободная скамейка (spec 2026-10-door-benches) — сидит на ней, нет — стоит и ждать готов вдвое меньше
  const stands = standsPc(db, s, ctx, hall, office);
  const door = stands !== undefined && office !== undefined && db.inflow?.hall !== undefined;
  const bench = door ? freeBench(db, s, ctx.plan, office, p) : undefined;
  if (stands) {
    p.stands = stands;
    if (bench !== undefined) p.bench = bench;
    else if (p.patience > 0) p.patience = Math.round(p.patience / 2);
  }
  const r = route(ctx.plan, ctx.working, door ? office : hall, nurse, s.t, slowOf(p));
  if (door) {
    p.next = office;
    p.nextAt = r.seatAt;
  } else p.hall = hall;
  p.regAt = r.regAt;
  if (r.triAt !== undefined) p.triAt = r.triAt;
  if (r.leg) p.leg = r.leg;
  p.seatAt = r.seatAt;
}

/**
 * Сидя или стоя (spec 2026-10-own-hall; решение владельца 18.10.2026): свой зал — `hall`, ближайший к кабинету его врача
 * `office`, — не дальше `inflow.hall` м от двери кабинета; в нём есть место — сидит. Нет такого зала — стоит (`far`), он
 * полон — стоит (`full`). Числа нет — как прежде: по местам всей больницы.
 */
function standsPc(db: ContentDb, s: ShiftState, ctx: HospitalCtx, hall: string | undefined, office: string | undefined): ShiftPatient['stands'] {
  const near = db.inflow?.hall;
  if (near === undefined) return s.queue.length >= ctx.seats ? 'full' : undefined;
  const room = hall !== undefined ? ctx.plan.rooms.find(r => r.id === hall) : undefined;
  if (!room) return 'far';
  if (office !== undefined && (metersBetween(ctx.plan, room.id, office) ?? Number.POSITIVE_INFINITY) > near) return 'far';
  return seatedIn(s, room.id) >= room.seats.length ? 'full' : undefined;
}

/** Сколько ждут в зале `hall` — сидят или идут туда, — а не у двери кабинета (поток для ПК). */
function seatedIn(s: ShiftState, hall: string): number {
  let n = 0;
  for (const p of Object.values(s.patients)) if (p.status === 'waiting' && p.hall === hall && p.next === undefined) n++;
  return n;
}

/**
 * Вернулся с результатами ждать своего врача (поток для ПК, spec 2026-10-own-hall): стоял — снова у двери кабинета врача,
 * в зал не садится.
 */
function standBack(db: ContentDb, s: ShiftState, p: ShiftPatient) {
  if (!s.flow || !p.stands || db.inflow?.hall === undefined) return;
  const ctx = hospitalCtx(db, s);
  const office = p.by ? ctx.all.find(m => m.id === p.by)?.room : doctorRoom(ctx.plan);
  if (!office) return;
  p.next = office;
  p.nextAt = s.t;
  seatDoor(db, s, ctx.plan, p);
}

/**
 * Свободная скамейка у двери кабинета `office` (spec 2026-10-door-benches): ближняя к двери, на которой никто, кроме `me`,
 * не ждёт. Числа `inflow.bench` нет — скамеек у дверей не ищут.
 */
function freeBench(db: ContentDb, s: ShiftState, plan: Plan, office: string, me: ShiftPatient): number | undefined {
  const steps = db.inflow?.bench;
  if (steps === undefined) return undefined;
  const near = doorBenches(plan, office, steps);
  if (near.length === 0) return undefined;
  const taken = new Set<number>();
  for (const p of Object.values(s.patients)) if (p !== me && p.bench !== undefined && p.status === 'waiting' && p.next !== undefined) taken.add(p.bench);
  return near.find(c => !taken.has(c));
}

/**
 * Снова у двери (spec 2026-10-door-benches): кто ждёт у двери, потому что места в своём зале не было, садится на свободную
 * скамейку у неё; нет её — стоит. Терпение — как решилось при приходе.
 */
function seatDoor(db: ContentDb, s: ShiftState, plan: Plan, p: ShiftPatient) {
  delete p.bench;
  if (!p.stands || p.next === undefined) return;
  const b = freeBench(db, s, plan, p.next, p);
  if (b !== undefined) p.bench = b;
}

/**
 * К какому нанятому врачу записать нового (spec 2026-10-walk, «Свой врач»): записанного к специалисту — к нему; вашего
 * («Свои больные») и заданного главой — к вам, без нанятого; остальных — к терапевту, к которому он раньше попадёт:
 * очередь (с теми, кто у него на приёме и на обследованиях) по `PER_QUEUED` на каждого плюс дорога от регистратуры до
 * кабинета; при равном — к первому по кабинету. Терапевтов нет — к вам.
 */
function docFor(db: ContentDb, s: ShiftState, p: ShiftPatient, list: readonly StaffMember[]): StaffMember | undefined {
  if (bookedHere(p, list)) return list.find(m => m.id === p.to);
  if (p.taught || forPlayer(db, s, p)) return undefined;
  // очередь врача — кто у него на приёме, на обследованиях и ждёт его; ждёт решения главврача — не его (spec 2026-10-two-ways)
  const load = new Map<string, number>();
  for (const x of Object.values(s.patients)) {
    const id = x.status === 'inRoom' || x.status === 'away' ? x.by : x.status === 'waiting' && !x.approve ? (x.by ?? x.doc) : undefined;
    if (id) load.set(id, (load.get(id) ?? 0) + 1);
  }
  const ctx = hospitalCtx(db, s);
  let best: StaffMember | undefined;
  let n = Number.POSITIVE_INFINITY;
  for (const m of list) {
    if (db.roles[m.role]?.profile) continue;
    // на перерыве (spec 2026-10-staff-shifts, часть 2) — ждать его дольше на остаток перерыва
    const q = (load.get(m.id) ?? 0) * PER_QUEUED + fromDesk(ctx.plan, ctx.working, m.room) + restLeft(s, m.id);
    if (q < n) {
      best = m;
      n = q;
    }
  }
  return best;
}

/** Давление, пульс, температура и сатурация у медсестры — своей ветвью зерна: те же, когда бы она ни мерила. */
const vitalsOf = (db: ContentDb, s: ShiftState, p: ShiftPatient) => runExam(db, p.patient, 'exam.vitals', branch(s, `vitals:${p.id}`), undefined, exact(s));

/**
 * Медсестра доврачебного кабинета закончила (0.5.12): витальные — в карту, срочность — и по ним; стал срочным — в очереди
 * выше, и об этом знают. Его уже позвали — к врачу он пришёл без них.
 */
function nurse(db: ContentDb, s: ShiftState, p: ShiftPatient, notices: Notice[]) {
  if (p.status !== 'waiting' || p.calledT !== undefined || p.done.includes('exam.vitals')) return;
  const was = p.triage;
  p.done.push('exam.vitals');
  p.results.push({ exam: 'exam.vitals', obs: vitalsOf(db, s, p), at: s.t, step: 0 });
  p.triage = triageOf(db, p);
  if (p.triage === was) return;
  sortQueue(s);
  doors(db, s);
  if (p.triage === 'red') notices.push({ kind: 'arrived', id: p.id, triage: 'red' });
}

/**
 * Привезла скорая (часть 27): фельдшер передаёт лист — жалобы и витальные, которые он измерил;
 * пациент — на свободное место в смотровой приёмного, мест нет — ждёт у входа. В очередь он
 * встаёт, когда его отсортирует врач; шкала (NEWS2 и красные флаги) — для сверки. Не уходит.
 */
function arriveByAmbulance(db: ContentDb, s: ShiftState, p: ShiftPatient, notices: Notice[]) {
  if (db.exams['exam.vitals']) {
    p.done.push('exam.vitals');
    p.results.push({ exam: 'exam.vitals', obs: runExam(db, p.patient, 'exam.vitals', branch(s, `paramedic:${p.id}`), undefined, exact(s)), at: s.t, step: 0 });
  }
  p.scale = scaleTriage(db, p.patient.complaints, p.results.flatMap(r => r.obs));
  p.sorted = false;
  p.patience = 0;
  p.status = 'waiting';
  p.queuedT = s.t;
  const bay = freeBays(db, s)[0];
  if (bay) p.bay = bay;
  // узкие места суток (spec 2026-10-economy): мест в смотровой нет — ждёт у входа
  else if (s.flow) meeting.atDoor(s);
  s.summary.arrived++;
  // вернулся с другой болезнью (часть 41б): инсульт после ТИА — тоже повторное обращение
  if (p.returnOf !== undefined) s.summary.returnsToday++;
  if (s.flow) meeting.arrived(s, p.kind);
  ambulanceDay(s).arrived++;
  // фибрилляция желудочков до реперфузии (часть 39б): лежит в смотровой под монитором, ждёт у входа — с
  // бригадой скорой и её дефибриллятором
  const vf = arrestAfter(db, s, p);
  if (vf !== undefined) schedule(s, Math.max(s.t, p.arriveT + vf), { kind: 'arrest', id: p.id });
  notices.push({ kind: 'ambulance', id: p.id });
  if (s.flow) nurseSorts(db, s, p);
}

/**
 * Через сколько секунд от прихода у больного фибрилляция желудочков (spec 2026-10-chapter-3, часть
 * 39б): до реперфузии — доля в час из записи болезни, пока от её начала меньше `hours` часов; момент
 * распределён показательно (−ln u / λ), из ветви `minute:<пациент>`. Нет записи, часов от начала или
 * момент за окном — undefined.
 */
export function arrestAfter(db: ContentDb, s: ShiftState, p: ShiftPatient): number | undefined {
  const primary = primaryOf(p.patient);
  const cond = db.conditions[primary.id];
  const a = cond?.arrest;
  if (!a || !cond.onset || a.perHour <= 0 || !whenHolds(a.when, primary.params)) return undefined;
  const onset = p.patient.truth.values[cond.onset.f];
  if (onset === undefined || onset >= a.hours) return undefined;
  const u = branch(s, `minute:${p.id}`).range(1, P_ONE) / P_ONE;
  const hours = (-log2(u) * Math.LN2 * P_ONE) / a.perHour;
  return hours < a.hours - onset ? Math.round(hours * 3600) : undefined;
}

export function triageOf(db: ContentDb, p: ShiftPatient, more: readonly Observation[] = []): Triage {
  const seen = [...p.patient.complaints, ...[...p.results.flatMap(r => r.obs), ...more].filter(o => o.shown).map(o => o.f)];
  const levels = seen.map(f => db.findings[f]?.triage).filter(Boolean);
  return levels.includes('red') ? 'red' : levels.includes('yellow') ? 'yellow' : 'green';
}

const rankOf = (q: ShiftPatient) => (q.triaged === false ? TRIAGE_RANK.green : TRIAGE_RANK[q.triage]);

/**
 * Ждёт ли кто-то срочнее того, кто в кабинете (часть 37): скорая привезла и ещё не рассортировали — по
 * листу передачи он может оказаться «красным»; в очереди — с идущим сроком, который кончается раньше,
 * чем у того, кто в кабинете (часть 43г: ЭКГ привезённому с давлением 180/110 — за 15 минут, а опрос
 * жёлтого в кабинете идёт и полчаса); у того, кто в кабинете, срока нет — и тот, кто выше по срочности.
 */
export function moreUrgent(db: ContentDb, s: ShiftState, p: ShiftPatient): boolean {
  if (Object.values(s.patients).some(q => q.kind === 'ambulance' && q.status === 'waiting' && !q.sorted)) return true;
  const mine = dueIn(db, p, targetPlace(db, s, p), s.t);
  return s.queue.some(id => {
    const q = s.patients[id];
    const left = dueIn(db, q, targetPlace(db, s, q), s.t);
    if (left !== undefined && (mine === undefined || left < mine)) return true;
    return mine === undefined && rankOf(q) < rankOf(p);
  });
}

function enqueue(s: ShiftState, p: ShiftPatient, queuedT: number, patienceFrom = s.t) {
  p.status = 'waiting';
  p.queuedT = queuedT;
  p.wait++;
  s.queue = [...s.queue.filter(x => x !== p.id), p.id];
  sortQueue(s);
  journey.queued(s, p);
  // поток для ПК (spec 2026-10-walk): терпение — с той минуты, как сел в зале, а не в пути
  if (p.patience > 0) schedule(s, patienceFrom + p.patience, { kind: 'patience', id: p.id, wait: p.wait });
  // узкие места суток (spec 2026-10-economy): больше всего ждали врача сразу
  if (s.flow) meeting.queued(s);
}

/** Очередь: срочность, если её определили (есть доврачебный кабинет), затем — кто раньше. */
function sortQueue(s: ShiftState) {
  s.queue = [...s.queue].sort((a, b) => {
    const x = s.patients[a];
    const y = s.patients[b];
    return rankOf(x) - rankOf(y) || x.queuedT - y.queuedT || (a < b ? -1 : 1);
  });
}

/** Результаты пришли. Ушедший на анализы возвращается в очередь — впереди, по времени прихода. */
function results(db: ContentDb, s: ShiftState, p: ShiftPatient, notices: Notice[]) {
  const ready = p.pending.filter(x => x.readyAt <= s.t).sort((a, b) => a.readyAt - b.readyAt || (a.exam < b.exam ? -1 : 1));
  if (ready.length === 0) return;
  p.pending = p.pending.filter(x => x.readyAt > s.t);
  for (const x of ready) p.results.push({ exam: x.exam, obs: x.obs, at: x.readyAt, step: p.step, ...(x.repeat ? { repeat: x.repeat } : {}) });
  if (p.status === 'away' && p.pending.length === 0 && p.by) {
    // пациент нанятого врача ждёт его, а не общей очереди: врач позовёт, когда освободится
    p.status = 'waiting';
    p.queuedT = s.t;
    p.wait++;
    standBack(db, s, p);
    journey.own(s, p);
  } else if (p.status === 'away' && p.pending.length === 0) {
    standBack(db, s, p);
    enqueue(s, p, p.arriveT);
    notices.push({ kind: 'resultsReady', id: p.id });
  } else if (p.status === 'inRoom' && !p.by) {
    // у нанятого врача результаты ждёт он сам — его следующий шаг уже назначен
    notices.push({ kind: 'resultsReady', id: p.id });
  }
}

/**
 * Почему уходит, не дождавшись (spec docs/specs/2026-10-why.md) — пока он ещё ждёт. По последнему ожиданию пути: его врач на
 * перерыве; ждал вас. Иначе — по тому, кто принимает в час ухода: есть нанятый врач, который взял бы его, — все такие заняты
 * (свободный позвал бы сразу); нет — в смене ни одного такого: смена кончилась, врача уволили, такого нет. Пути нет — другое.
 * `stood` — стоял у кабинета (терпения вдвое меньше), `asks` — при приходе или сейчас врачи ждали вашего ответа.
 */
function leaving(db: ContentDb, s: ShiftState, p: ShiftPatient): { why: LeftWhy; stood: boolean; asks: boolean } {
  const { wait, queue } = journey.lastWaits(s, p);
  const why: LeftWhy = !wait || (wait.k !== 'queue' && wait.k !== 'rest') ? 'other'
    : wait.k === 'rest' ? (wait.round ? 'round' : 'rest')
      : wait.why === 'you' ? 'you'
        : colleaguesOf(db, s).some((m, _, list) => colleagueTakes(db, s, p, m, list)) ? 'busy' : 'none';
  const stood = queue !== undefined && (queue.full === true || queue.far !== undefined) && queue.bench !== true;
  return { why, stood, asks: (queue?.asks ?? 0) > 0 || (s.consults?.length ?? 0) > 0 };
}

// --- нанятые врачи (spec 2026-09-hired-doctors) -------------------------------------------

/**
 * Кто из нанятых врачей сегодня принимает: терапевт в работающем кабинете врача — не в вашем
 * и с местом в ординаторской; со сменами (spec 2026-10-staff-shifts) — кто в смене часа `at`. Порядок — по номеру
 * кабинета, затем человека.
 */
export function colleaguesOf(db: ContentDb, s: ShiftState, at = s.t): StaffMember[] {
  if (!s.hospital || !s.staff) return [];
  const ctx = hospitalCtx(db, s, at);
  const mine = doctorRoom(ctx.plan);
  return ctx.staff
    .filter(m => db.roles[m.role]?.stands === DOCTOR && m.room !== undefined && m.room !== mine && ctx.working.has(m.room) && ctx.staffed(m.room, DOCTOR))
    .sort((a, b) => (a.room! < b.room! ? -1 : a.room! > b.room! ? 1 : a.id < b.id ? -1 : 1));
}

/**
 * С какими болезнями к специалисту записываются в этой больнице (spec 2026-10-chapter-4, часть 59): его профиль — те,
 * чьё отделение больница принимает. У терапевта профиля нет.
 */
function profileHere(db: ContentDb, m: StaffMember, admits: readonly Id[]): Id[] | undefined {
  return db.roles[m.role]?.profile?.filter(id => admits.includes(db.conditions[id].department));
}

/**
 * Кого берёт нанятый врач: нового пациента, которого ещё никто не смотрел, — не «красного» по
 * сортировке, не повторное обращение и не того, кого вы отпустили ждать результатов. Без
 * доврачебного кабинета срочность никто не определил — берёт по очереди прихода. Специалист (часть 59) —
 * только записанных к нему; терапевт — кроме записанных к специалисту, который сегодня принимает. Заданного пациента
 * первой смены главы (часть 61в) — никто: он для вас. «Своих больных» (часть 76) — тоже: их оставляют вам.
 */
function colleagueTakes(db: ContentDb, s: ShiftState, p: ShiftPatient, m: StaffMember, list: readonly StaffMember[]): boolean {
  if (!newcomer(p, s.flow !== undefined)) return false;
  if (db.roles[m.role]?.profile) return p.to === m.id;
  if (bookedHere(p, list)) return false;
  return !forPlayer(db, s, p);
}

/**
 * Новый, кого нанятый врач может позвать: ждёт, никем не взят и не вызван, не повторный, не со скорой, не «красный». В
 * потоке для ПК (`all`, spec 2026-10-engine-speed, ч. 3) — и повторный, и привезённый (рассортированный), и «красный»:
 * игрок не ведёт каждого.
 */
function newcomer(p: ShiftPatient, all = false): boolean {
  return p.status === 'waiting' && p.by === undefined && p.calledT === undefined && !p.taught
    && (all ? p.kind !== 'ambulance' || p.sorted === true : p.kind !== 'return' && p.kind !== 'ambulance' && !(p.triaged !== false && p.triage === 'red'));
}

/** Записан к специалисту, который сегодня принимает: его берёт только он. */
const bookedHere = (p: ShiftPatient, list: readonly StaffMember[]): boolean => p.to !== undefined && list.some(x => x.id === p.to);

/** Куда направили бы по жалобам — один раз на пациента: вывод по тому, что видно, от времени не зависит. */
const routes = new WeakMap<Patient, BodySystem>();

/**
 * Куда регистратура направила бы нового больного (spec 2026-10-own-patients, часть 76): в группу болезней — систему
 * органов, как в выборе диагноза, — самую вероятную по тому, что видно у двери: жалобы, возраст, пол, сезон, профессия.
 * Тот же вывод, что считает «Похоже на», по болезням отделений, с какими его приняли. Скрытый диагноз не участвует:
 * отметка «ждёт вас» его не выдаёт.
 */
export function routeOf(db: ContentDb, s: ShiftState, p: ShiftPatient): BodySystem {
  const known = routes.get(p.patient);
  if (known !== undefined) return known;
  const obs = complaintObservations(p.patient);
  const by = new Map<BodySystem, number>();
  for (const b of posterior(db, candidatesOf(db, p.departments ?? s.meta.department), obs, contextOf(db, p.patient, obs))) {
    const sys = db.conditions[b.id].system;
    if (sys) by.set(sys, (by.get(sys) ?? 0) + b.p);
  }
  // ничья — по порядку групп в выборе диагноза
  const r = SYSTEMS.reduce<BodySystem>((best, x) => ((by.get(x) ?? 0) > (by.get(best) ?? 0) ? x : best), SYSTEMS[0]);
  routes.set(p.patient, r);
  return r;
}

/**
 * Новый больной — «ваш» (часть 76): его группа — среди выбранных в настройках. Больница ПК без вашего кабинета («Не
 * принимаю», spec 2026-10-doctor-mode «Больницы») — ваших нет: всех ведут нанятые врачи.
 */
export function forPlayer(db: ContentDb, s: ShiftState, p: ShiftPatient): boolean {
  return (s.meta.mine?.length ?? 0) > 0 && s.meta.mine!.includes(routeOf(db, s, p)) && (!s.hospital?.site || doctorRoom(hospitalCtx(db, s).plan) !== undefined);
}

/**
 * Ждёт вас (часть 76): «ваш» новый больной, которого иначе позвал бы нанятый терапевт; записанного к специалисту,
 * который сегодня принимает, тот возьмёт сам, а повторных, срочных и со скорой нанятые врачи и так не берут.
 */
export function leftForPlayer(db: ContentDb, s: ShiftState, p: ShiftPatient): boolean {
  return newcomer(p) && forPlayer(db, s, p) && !bookedHere(p, colleaguesOf(db, s));
}

/**
 * Свободные врачи зовут: сначала своего, вернувшегося с результатами, потом нового из очереди. В потоке для ПК следующий
 * к каждому врачу идёт к двери его кабинета (spec 2026-10-walk).
 */
function staffDesks(db: ContentDb, s: ShiftState) {
  if (!s.dayOpen) return;
  const list = colleaguesOf(db, s);
  const late = s.flow ? lateOf(db, s) : [];
  callIn(db, s, list, late);
  if (s.flow) toDoors(db, s, list, late);
}

/** Следующие — к дверям (spec 2026-10-walk): после того, как очередь изменилась без вызова нанятым врачом. */
function doors(db: ContentDb, s: ShiftState) {
  if (s.flow && s.dayOpen) toDoors(db, s, colleaguesOf(db, s), lateOf(db, s));
}

/**
 * Кто из нанятых врачей уже не в смене (spec 2026-10-staff-shifts), а его больной ещё у него на приёме, на обследовании или
 * вернулся к нему с результатами, или в очереди ждёт записанный к нему, кого на пересменке некому было передать: врач
 * доводит их и уходит, новых не зовёт. Без смен — никого.
 */
export function lateOf(db: ContentDb, s: ShiftState): StaffMember[] {
  const ctx = hospitalCtx(db, s);
  if (ctx.staff === ctx.all) return [];
  const on = new Set(ctx.staff.map(m => m.id));
  const ids = new Set<string>();
  for (const p of Object.values(s.patients)) {
    if (p.by !== undefined && !on.has(p.by) && (p.status === 'waiting' || p.status === 'inRoom' || p.status === 'away')) ids.add(p.by);
    else if (p.by === undefined && p.doc !== undefined && !on.has(p.doc) && p.status === 'waiting') ids.add(p.doc);
  }
  return ids.size > 0 ? ctx.all.filter(m => ids.has(m.id) && m.room !== undefined) : [];
}

/**
 * Свободные врачи зовут: сначала своего, вернувшегося с результатами, потом нового из очереди. Ушедший со сменой (`late`,
 * spec 2026-10-staff-shifts) — только своих: вернувшегося и записанного к нему.
 */
function callIn(db: ContentDb, s: ShiftState, list: readonly StaffMember[], late: readonly StaffMember[] = []) {
  if (list.length === 0 && late.length === 0) return;
  const all = Object.values(s.patients);
  const busy = new Set(all.flatMap(p => (p.status === 'inRoom' && p.by ? [p.by] : [])));
  const ctx = hospitalCtx(db, s);
  // кто ждёт решения главврача (spec 2026-10-two-ways, F3), того врач не зовёт: его приём кончен
  const backOf = (m: StaffMember) => all.filter(p => p.status === 'waiting' && p.by === m.id && !p.approve).sort((a, b) => a.queuedT - b.queuedT || (a.id < b.id ? -1 : 1))[0];
  const call = (m: StaffMember, id: string, back: boolean) => {
    const p = s.patients[id];
    s.queue = s.queue.filter(x => x !== id);
    p.status = 'inRoom';
    if (!back) {
      p.by = m.id;
      p.phase = {};
    }
    p.calledT ??= s.t;
    p.wait++; // прежняя проверка терпения недействительна
    journey.called(s, p, m.room);
    p.spent.seconds += MIN;
    // поток для ПК (spec 2026-10-walk): приём начнётся, когда он дойдёт до кабинета; врач ждёт его
    const walk = s.flow && m.room ? toDoctor(ctx.plan, p, m.room, s.t) : 0;
    if (s.flow) {
      p.doc = m.id;
      delete p.next;
      delete p.nextAt;
      delete p.bench;
    }
    if (walk > 0) p.walk = { to: m.room!, at: s.t + walk };
    schedule(s, s.t + Math.max(MIN, walk), { kind: 'colleague', id });
    busy.add(m.id);
  };
  // усталость (spec 2026-10-staff-shifts, часть 2): устают только люди со сменой; ушёл отдыхать — никого не зовёт до `until`,
  // тогда и вернётся
  const tires = s.flow !== undefined && list.some(m => m.shift !== undefined);
  const rest = (m: StaffMember, kind: 'toilet' | 'rest'): boolean => {
    const r = startRest(db, s, ctx.plan, ctx.working, m, kind);
    if (!r) return false;
    (s.desk ??= {})[m.id] = r.until;
    schedule(s, r.until, { kind: 'free', by: m.id });
    journey.rested(s, m.id, r.kind, r.until);
    if (kind === 'rest') {
      const day = colleagueDay(s, m.id);
      day.rests = (day.rests ?? 0) + 1;
    }
    return true;
  };
  // поток для ПК (spec 2026-10-walk): сперва все свободные зовут своих, потом свободный без своих — из чужой очереди
  for (const steal of s.flow ? [false, true] : [false]) {
    // своих звать некого, а устал (spec 2026-10-staff-shifts, часть 2), — на перерыв, а не к чужой очереди
    if (steal && tires) {
      for (const m of list) {
        if (busy.has(m.id) || (s.desk?.[m.id] ?? 0) > s.t || !dueOf(db, s, m)?.tired || backOf(m)) continue;
        rest(m, 'rest');
      }
    }
    for (const m of list) {
      if ((s.desk?.[m.id] ?? 0) > s.t || (steal && busy.has(m.id))) continue;
      if (busy.has(m.id)) {
        releaseWaiting(db, s, all.find(p => p.status === 'inRoom' && p.by === m.id)!, m, list);
        continue;
      }
      // утренний обход (spec docs/specs/2026-10-staff-motion.md, часть 2а): с часа обхода свободный врач не зовёт следующего,
      // а идёт к своим лежащим; кто был у него в кабинете, того он уже допринял
      if (!steal && s.rounds?.due[m.id] && goRound(db, s, ctx.plan, m)) continue;
      const back = backOf(m);
      // в туалет и на пределе усталости — между приёмами, даже если его ждут; своего, вернувшегося с результатами, сперва
      // принимает
      if (tires && !steal && !back) {
        const due = dueOf(db, s, m);
        if (due && ((due.wc && rest(m, 'toilet')) || (due.tired === 2 && rest(m, 'rest')))) continue;
      }
      const id = back?.id ?? (s.flow ? pickPc(db, s, m, list, steal) : s.queue.find(x => colleagueTakes(db, s, s.patients[x], m, list)));
      if (id) call(m, id, back !== undefined);
    }
  }
  // свободному звать некого и отдыхать не пора (spec 2026-10-staff-shifts, часть 2) — разбудить, когда станет пора: без
  // событий в больнице его никто не позовёт
  if (tires) {
    for (const m of list) {
      if (busy.has(m.id) || (s.desk?.[m.id] ?? 0) > s.t) continue;
      const at = wakeOf(db, s, m);
      const c = s.crew?.[m.id];
      if (at === undefined || !c || c.wake === at) continue;
      c.wake = at;
      schedule(s, at, { kind: 'free', by: m.id });
    }
  }
  for (const m of late) {
    if ((s.desk?.[m.id] ?? 0) > s.t || busy.has(m.id)) continue;
    const back = backOf(m);
    const id = back?.id ?? pickPc(db, s, m, list, false);
    if (id) call(m, id, back !== undefined);
  }
}

/**
 * Следующие к каждому врачу идут к двери его кабинета (spec 2026-10-walk; геймдизайн §5: «ждут у двери кабинета, и врач
 * зовёт следующего, заканчивая с прежним»): к нанятому — первые `AT_DOOR` из тех, кого он позовёт, к вам — первые из ваших
 * в очереди. Один проход по очереди. Кто уже у двери, там и остаётся, даже если впереди встал срочный. К ушедшему со
 * сменой (`late`, spec 2026-10-staff-shifts) — только его: вернувшиеся с результатами и записанные к нему.
 */
function toDoors(db: ContentDb, s: ShiftState, list: readonly StaffMember[], late: readonly StaffMember[] = []) {
  const plan = hospitalCtx(db, s).plan;
  // к другой двери (spec 2026-10-door-benches): кто стоял у прежней без места в зале — на свободную скамейку у новой
  const go = (p: ShiftPatient, office: string) => {
    const was = p.next;
    toDoor(plan, p, office, s.t);
    if (p.next !== was && p.stands) seatDoor(db, s, plan, p);
  };
  // сколько уже идут к двери каждого врача; свои, вернувшиеся с результатами, — первыми, как их зовёт `callIn`: раньше
  // вставший в очередь
  const n = new Map<string, number>();
  const doc = new Map<string, StaffMember>();
  for (const m of [...list, ...late]) if (m.room) doc.set(m.id, m);
  if (doc.size > 0) {
    // ждёт решения главврача (spec 2026-10-two-ways, F3) — стоит у двери, но врач его не позовёт
    const back = Object.values(s.patients).filter(p => p.status === 'waiting' && p.by !== undefined && doc.has(p.by) && !p.approve);
    back.sort((a, b) => a.queuedT - b.queuedT || (a.id < b.id ? -1 : 1));
    for (const p of back) {
      const k = n.get(p.by!) ?? 0;
      if (k >= AT_DOOR) continue;
      go(p, doc.get(p.by!)!.room!);
      n.set(p.by!, k + 1);
    }
  }
  // за ними — свои из очереди, по её порядку; к вам — первые из ваших
  const office = doctorRoom(plan);
  let yours = 0;
  for (const x of s.queue) {
    const p = s.patients[x];
    if (p.doc === undefined) {
      if (!office || yours >= AT_DOOR || p.kind === 'ambulance') continue;
      go(p, office);
      yours++;
      continue;
    }
    const m = doc.get(p.doc);
    const k = m ? (n.get(m.id) ?? 0) : AT_DOOR;
    if (k >= AT_DOOR || !colleagueTakes(db, s, p, m!, list)) continue;
    go(p, m!.room!);
    n.set(m!.id, k + 1);
  }
}

/**
 * Кого зовёт свободный нанятый врач в потоке для ПК (spec 2026-10-walk, «Свой врач»): первого из записанных к нему; своих
 * нет и можно чужих (`steal`) — терапевт зовёт первого из самой длинной чужой очереди, кому дойти до него быстрее, чем
 * дождаться своего врача (по `PER_QUEUED` на каждого впереди и на него самого); специалист — никого. Только готовых:
 * оформленных и измеренных.
 */
function pickPc(db: ContentDb, s: ShiftState, m: StaffMember, list: readonly StaffMember[], steal: boolean): string | undefined {
  const can = s.queue.filter(x => readyAt(s.patients[x]) <= s.t && colleagueTakes(db, s, s.patients[x], m, list));
  const own = can.find(x => s.patients[x].doc === m.id);
  if (own || !steal || db.roles[m.role]?.profile) return own;
  const by = new Map<string, string[]>();
  for (const x of can) {
    const d = s.patients[x].doc ?? '';
    const q = by.get(d);
    if (q) q.push(x);
    else by.set(d, [x]);
  }
  let best: string[] | undefined;
  for (const q of by.values()) if (!best || q.length > best.length) best = q;
  if (!best) return undefined;
  const plan = hospitalCtx(db, s).plan;
  // свой врач на перерыве (spec 2026-10-staff-shifts, часть 2) или на обходе (spec 2026-10-staff-motion, часть 2) — ждать его
  // дольше на остаток; врач у всех в `best` один
  const doc = s.patients[best[0]].doc;
  const away = Math.max(restLeft(s, doc), roundLeft(s, doc));
  return best.find((x, i) => !m.room || toDoctor(plan, s.patients[x], m.room, s.t) < (i + 1) * PER_QUEUED + away);
}

/**
 * Врач ждёт у себя результатов, а пришёл тот, кого он может принять, — отпускает ждать, как отпустил бы, будь тот в
 * очереди сразу (spec 2026-10-chapter-4, часть 59): к специалисту записанные приходят по одному, и прежде он сидел над
 * анализами, пока они уходили. Ожидание, записанное в приём вперёд, снимается; минута — сказать, и врач свободен.
 */
function releaseWaiting(db: ContentDb, s: ShiftState, p: ShiftPatient, m: StaffMember, list: readonly StaffMember[]) {
  if (p.pending.length === 0 || p.results.some(r => r.at > s.t)) return;
  const step = s.events.find(e => e.event.kind === 'colleague' && e.event.id === p.id);
  if (!step || step.t <= s.t || !s.queue.some(x => (!s.flow || readyAt(s.patients[x]) <= s.t) && colleagueTakes(db, s, s.patients[x], m, list))) return;
  s.events = s.events.filter(e => e !== step);
  p.spent.seconds -= step.t - s.t;
  p.status = 'away';
  delete p.out;
  p.wait++;
  journey.away(s, p);
  p.spent.seconds += MIN;
  (s.desk ??= {})[m.id] = s.t + MIN;
  schedule(s, s.t + MIN, { kind: 'free', by: m.id });
}

/**
 * Забрать себе пациента нанятого врача (часть 19): со всем, что уже пришло, — сразу в ваш
 * кабинет, если вы свободны (врач доделывает начатый вопрос или осмотр), иначе в вашу очередь
 * по времени прихода; ушедший на обследования вернётся к вам. Назначенное врачом, что ещё
 * идёт, придёт вам. Врач свободен и зовёт следующего.
 */
function takeOver(db: ContentDb, s: ShiftState, id: string): Notice[] {
  const p = s.patients[id];
  if (!s.dayOpen || !p?.by || p.closed || !(p.status === 'inRoom' || p.status === 'waiting' || p.status === 'away')) return [];
  // врач просил посмотреть (spec 2026-10-consults) — вы забрали: просьба исполнена
  closeConsult(s, id);
  // решение ждало главврача (spec 2026-10-two-ways, F3) — вы забрали: ответ «Взять»; что главврач назначил, — теперь ваше дело
  if (p.approve) closeApproval(s, p, 'changed');
  delete p.orders;
  delete p.chief;
  const by = p.by;
  const was = p.status;
  delete p.by;
  delete p.phase;
  p.from = by;
  // поток для ПК (spec 2026-10-walk): теперь он ваш; был у врача — идёт из его кабинета
  if (s.flow) delete p.doc;
  const room = s.flow ? hospitalCtx(db, s).all.find(x => x.id === by)?.room : undefined;
  // начатый вопрос или осмотр врач доделывает: результат уже записан, со временем конца. Время
  // шага записано вперёд, до следующего шага; ожидание результатов у врача — не в счёт приёма
  const busy = Math.max(s.t, ...p.results.map(r => r.at));
  const step = s.events.find(e => e.event.kind === 'colleague' && e.event.id === id);
  if (step) {
    p.spent.seconds -= Math.max(0, step.t - busy);
    s.events = s.events.filter(e => e !== step);
  }
  const col = colleagueDay(s, by);
  col.taken = (col.taken ?? 0) + 1;
  let notices: Notice[] = [];
  if (p.status !== 'away') {
    if (!s.current) {
      p.status = 'inRoom';
      p.wait++;
      s.current = p.id;
      journey.called(s, p);
      // дослушать ответ у врача и дойти до вас; вы — из смотровой приёмного, если были там (FR-HOS-4)
      const meet = meetIn(db, s, p);
      // поток для ПК (spec 2026-10-walk): от врача — из его кабинета, из зала или от двери — оттуда
      const walk = s.flow && !p.bay
        ? walkToYou(db, s, p, (ctx, office) => (was === 'inRoom' && room ? walkPc(ctx.plan, room, office, slowOf(p)) : toDoctor(ctx.plan, p, office, busy)), busy)
        : 0;
      delete p.next;
      delete p.nextAt;
      delete p.bench;
      goTo(s, p);
      // поток для ПК (spec 2026-10-owner-play-2): дослушать и дойти — часами игры
      if (s.flow) notices = meetAt(s, p, busy + Math.max(meet, walk), Math.max(meet, walk));
      else notices = [...advanceBy(db, s, busy - s.t), ...spend(db, s, p, Math.max(meet, walk))];
    } else {
      // впереди — по времени прихода, как вернувшийся с обследований; в потоке для ПК — в зал у вашего кабинета
      if (s.flow) {
        const ctx = hospitalCtx(db, s);
        const w = waitsAt(p);
        moveTo(ctx.plan, ctx.working, p, was === 'inRoom' ? room : w.at, doctorRoom(ctx.plan), Math.max(s.t, w.t ?? s.t));
        seatDoor(db, s, ctx.plan, p);
      }
      enqueue(s, p, p.arriveT);
    }
  }
  staffDesks(db, s);
  return notices;
}

/**
 * Обследования, которые в этой больнице можно сделать, — из них выбирает нанятый врач. Больница днями та же, а сломанное
 * с утра — своё у каждого дня (FR-EQ-3): список — по больнице и сломанному.
 */
const examLists = new WeakMap<HospitalCtx, Map<string, Id[]>>();
export function examsHere(db: ContentDb, s: ShiftState): Id[] {
  const ctx = hospitalCtx(db, s);
  let byBroken = examLists.get(ctx);
  if (!byBroken) {
    byBroken = new Map();
    examLists.set(ctx, byBroken);
  }
  const key = (s.broken ?? []).join(',');
  let list = byBroken.get(key);
  if (!list) {
    list = Object.keys(db.exams).sort().filter(id => !('block' in examWhere(db, ctx.plan, ctx.working, ctx.staffed, id, brokenOf(s))));
    byBroken.set(key, list);
  }
  return list;
}

/**
 * Шаг нанятого врача: тот же разумный врач, что проверяет базу (`nextStep`), с порогами своего
 * навыка. Обследование — как у вас, следующий шаг — когда придут результаты; решение — приём
 * закрыт, пара минут на карту, и врач зовёт следующего. Главврач назначил обследование (spec 2026-10-two-ways, F2) — оно
 * первым; просил утверждать такие решения (F3) — решение ждёт его, а врач всё равно зовёт следующего.
 */
function colleagueStep(db: ContentDb, s: ShiftState, p: ShiftPatient, ev?: ShiftEvent, notices: Notice[] = []) {
  const m = colleagueOf(db, s, p);
  if (!m) return;
  // просил посмотреть, а ответа нет до срока (spec 2026-10-consults) — продолжает сам: это его шаг после просьбы
  if (ev) closeConsult(s, p.id);
  // главврач назначил (spec 2026-10-two-ways, F2): врач делает это первым, как своё, — своим временем и с усталостью
  const order = s.flow ? p.orders?.[0] : undefined;
  if (order !== undefined) {
    colleagueJobs.delete(s);
    if (p.orders!.length > 1) p.orders = p.orders!.slice(1);
    else delete p.orders;
    return examStep(db, s, p, m, order, slowedOf(db, s, m, speedOf(db, m)), true);
  }
  const rules = asksOf(s);
  // долгий случай (spec 2026-10-economy, решение владельца 17.10.2026): `long` часов без диагноза — просит посмотреть, если о нём
  // ещё не просил и главврач о таком спрашивать велел (spec 2026-10-two-ways, F3); просил или не велели — решает тем, что знает
  if (s.flow && !p.asked && p.phase?.diagnosis === undefined && rules.includes('long') && longCase(db, s, p)) {
    colleagueJobs.delete(s);
    const prior = priorOf(db, p, m);
    const ask = askLong(db, { candidates: candidatesOf(db, p.departments ?? s.meta.department), obs: observationsOf(p), patient: p.patient, ...(prior ? { prior } : {}) });
    // вторая гипотеза — из профиля специалиста, который сейчас принимает (решение владельца #112): направляет к нему, а не
    // просит вас посмотреть
    const to = referOf(db, s, p, m, ask.lead);
    if (to) return sendOn(db, s, p, m, to);
    return openConsult(db, s, p, m, ask, notices);
  }
  // устал (spec 2026-10-staff-shifts, часть 2) — работает дольше
  const pct = slowedOf(db, s, m, speedOf(db, m));
  // считался по частям, пока больница доживала время команды (0.5.13), — готовый или досчитать; нет — сейчас, тем же счётом
  const job = colleagueJobs.get(s);
  const r = job && job.event === ev ? (job.result ?? whole(job.parts)) : whole(colleagueParts(db, s, p, m));
  colleagueJobs.delete(s);
  // выбрал диагноз уставшим (spec 2026-10-staff-shifts, часть 2): порог был ниже — карта и итоги дня это помнят
  if (s.flow && r.phase.diagnosis !== undefined && p.phase?.diagnosis === undefined && !hurried(db, s, p)) {
    const tired = tiredOf(db, s, m);
    if (tired !== undefined) {
      p.tired = tired;
      const day = colleagueDay(s, m.id);
      day.tired = (day.tired ?? 0) + 1;
    }
  }
  // поток для ПК: выбрал диагноз — дальше только вопросы перед лечением и решение, — но не уверен: просит вас посмотреть, а
  // больной ждёт у него (spec 2026-10-consults). О больном просят один раз; «не уверен» снят (spec 2026-10-two-ways, F3) — нет.
  // Вторая гипотеза — из профиля специалиста, который сейчас принимает (решение владельца #112): направляет к нему, а не
  // просит; это его решение, вас оно не зовёт, — и при снятой галочке
  if (s.flow && !p.asked && r.phase.diagnosis !== undefined && p.phase?.diagnosis === undefined && (rules.includes('unsure') || refers(db, s, p, m))) {
    const ask = askOf(db, s, p, m, r.phase.diagnosis, r.phase.confidence);
    const to = ask && referOf(db, s, p, m, ask.lead);
    if (to) return sendOn(db, s, p, m, to);
    if (ask && rules.includes('unsure')) {
      p.phase = r.phase;
      return openConsult(db, s, p, m, ask, notices);
    }
  }
  p.phase = r.phase;
  if (r.step.kind === 'exam') return examStep(db, s, p, m, r.step.exam, pct);
  const plan = { diagnosis: r.step.diagnosis, treatments: [...r.step.plan.treatments], setting: r.step.plan.setting };
  // поток для ПК (spec 2026-10-two-ways, F3): главврач просил утверждать такие решения — врач пишет план и зовёт следующего,
  // а больной ждёт ответа у двери кабинета
  const approve = s.flow ? approveOf(db, s, p, m, plan.diagnosis, plan.setting) : undefined;
  delete p.chief;
  if (approve) openApproval(db, s, p, m, plan, approve, notices);
  else {
    p.draft = plan;
    closePatient(db, s, p);
  }
  worked(db, s, m);
  const paper = Math.round((2 * MIN * pct) / 100);
  p.spent.seconds += paper;
  (s.desk ??= {})[m.id] = s.t + paper;
  schedule(s, s.t + paper, { kind: 'free', by: m.id });
}

/**
 * Нанятый врач назначил обследование — своё или главврача (`chief`, spec 2026-10-two-ways, F2): результатов ждать, а в
 * очереди есть кого принять, — отпустить ждать и позвать следующего, как вы; иначе следующий шаг — когда всё придёт.
 */
function examStep(db: ContentDb, s: ShiftState, p: ShiftPatient, m: StaffMember, exam: Id, pct: number, chief = false) {
  const cost = orderExam(db, s, p, exam, pct) ?? 0;
  if (!p.done.includes(exam)) p.done.push(exam); // сделать нельзя — дальше без него
  if (chief) journey.chief(s, p, exam);
  const list = colleaguesOf(db, s);
  // ушедший со сменой (spec 2026-10-staff-shifts) новых не зовёт: ждёт результатов с больным
  if (p.pending.length > 0 && onDuty(db, m, s.t) && s.queue.some(x => colleagueTakes(db, s, s.patients[x], m, list))) {
    p.status = 'away';
    delete p.out;
    p.wait++;
    journey.away(s, p);
    const away = cost + MIN;
    p.spent.seconds += away;
    (s.desk ??= {})[m.id] = s.t + away;
    schedule(s, s.t + away, { kind: 'free', by: m.id });
    return;
  }
  const next = Math.max(s.t + cost, ...p.pending.map(x => x.readyAt));
  p.spent.seconds += next - s.t;
  schedule(s, next, { kind: 'colleague', id: p.id });
}

// --- «Просят посмотреть» (spec 2026-10-consults, поток для ПК) -------------------------------------------------------

/** Долгий случай (spec 2026-10-economy): с первого вызова прошло `long` часов (`consults.yaml`). */
function longCase(db: ContentDb, s: ShiftState, p: ShiftPatient): boolean {
  const h = db.consults?.long;
  return h !== undefined && p.calledT !== undefined && s.t - p.calledT >= h * 3600;
}

/**
 * Долгий случай, о котором нанятый врач уже просил (spec 2026-10-economy) или о котором главврач спрашивать не велел (spec
 * 2026-10-two-ways, F3): решает тем, что знает, уверенности не ждёт.
 */
const hurried = (db: ContentDb, s: ShiftState, p: ShiftPatient): boolean =>
  s.flow !== undefined && (p.asked === true || !asksOf(s).includes('long')) && longCase(db, s, p);

/**
 * Попросит ли нанятый врач `m` посмотреть больного, выбрав диагноз `dx`, — по тому, что знает сам: тот же вывод, что у его
 * шага (он только что посчитан для тех же наблюдений и запомнен, поэтому почти даром).
 */
function askOf(db: ContentDb, s: ShiftState, p: ShiftPatient, m: StaffMember, dx: Id, confidence?: number): Ask | undefined {
  const prior = priorOf(db, p, m);
  return askFor(db, {
    skill: m.skill, dx, ...(confidence !== undefined ? { confidence } : {}), candidates: candidatesOf(db, p.departments ?? s.meta.department), obs: observationsOf(p), patient: p.patient,
    minutes: Math.round((s.t - p.arriveT) / 60), ...(prior ? { prior } : {}),
  });
}

/** Специалисты, которые сейчас принимают, — кроме `m`. */
function specialistsNow(db: ContentDb, s: ShiftState, m: StaffMember): StaffMember[] {
  return colleaguesOf(db, s).filter(x => x.id !== m.id && db.roles[x.role]?.profile !== undefined);
}

/**
 * Может ли нанятый врач `m` направить больного к специалисту (решение владельца #112): он не специалист, больного ещё не
 * направляли, тот не лежит в смотровой приёмного, а специалист сейчас принимает. Поток для ПК; без числа `consults.refer`
 * (база тестов, пробы) — не направляют.
 */
function refers(db: ContentDb, s: ShiftState, p: ShiftPatient, m: StaffMember): boolean {
  return s.flow !== undefined && db.consults?.refer !== undefined && db.roles[m.role]?.profile === undefined && p.ref === undefined && !p.bay
    && specialistsNow(db, s, m).length > 0;
}

/**
 * К кому нанятый терапевт `m` направит больного, а не попросит вас посмотреть (решение владельца #112, «вариант 2»): к
 * специалисту, который сейчас принимает, по второй гипотезе (`referTo`).
 */
function referOf(db: ContentDb, s: ShiftState, p: ShiftPatient, m: StaffMember, lead: readonly Belief[]): StaffMember | undefined {
  return lead.length >= 2 && refers(db, s, p, m) ? referTo(db, specialistsNow(db, s, m), lead) : undefined;
}

/**
 * Нанятый врач просит посмотреть: больной ждёт у него в кабинете, его следующий шаг — вопросы перед лечением и решение —
 * к сроку ответа (`wait` минут), а ответите раньше — раньше. Извещение — для звука и автопаузы.
 */
function openConsult(db: ContentDb, s: ShiftState, p: ShiftPatient, m: StaffMember, ask: Ask, notices: Notice[]) {
  const until = s.t + db.consults!.wait * MIN;
  p.asked = true;
  (s.consults ??= []).push({ id: p.id, by: m.id, at: s.t, until, why: ask.why, lead: ask.lead });
  journey.asked(s, p, m.id, until);
  const day = colleagueDay(s, m.id);
  day.asked = (day.asked ?? 0) + 1;
  p.spent.seconds += until - s.t;
  schedule(s, until, { kind: 'colleague', id: p.id });
  notices.push({ kind: 'consult', id: p.id, by: m.id });
}

/** Просьба о больном `id` закрыта — ответом или сроком; просьб не осталось — поля нет. */
function closeConsult(s: ShiftState, id: string) {
  if (!s.consults) return;
  const rest = s.consults.filter(c => c.id !== id);
  if (rest.length === s.consults.length) return;
  if (rest.length > 0) s.consults = rest;
  else delete s.consults;
}

/**
 * Ответ на просьбу: `look` — больной ваш, как «Забрать» (`takeOver`); `self` — врач продолжает сейчас, своим навыком:
 * вопросы перед лечением и решение тем диагнозом, что выбрал; `refer` — к другому нанятому врачу, который сегодня
 * принимает: тот позовёт его первым, когда освободится, и рассудит заново, своим навыком, а этот свободен. Просьбы нет —
 * ничего.
 */
function answerConsult(db: ContentDb, s: ShiftState, cmd: Extract<Command, { kind: 'consult' }>): Notice[] {
  const p = s.patients[cmd.id];
  const m = p && s.consults?.some(c => c.id === p.id) ? colleagueOf(db, s, p) : undefined;
  if (!m) return [];
  if (cmd.answer === 'look') return takeOver(db, s, p.id);
  const to = cmd.answer === 'refer' ? colleaguesOf(db, s).find(x => x.id === cmd.to && x.id !== m.id) : undefined;
  if (cmd.answer === 'refer' && !to) return [];
  closeConsult(s, p.id);
  // шаг, назначенный к сроку ответа, — не нужен; ожидание — до сейчас
  const step = s.events.find(e => e.event.kind === 'colleague' && e.event.id === p.id);
  if (step) {
    p.spent.seconds -= Math.max(0, step.t - s.t);
    s.events = s.events.filter(e => e !== step);
  }
  if (!to) {
    const notices: Notice[] = [];
    colleagueStep(db, s, p, undefined, notices);
    return notices;
  }
  passOn(db, s, p, m, to);
  return [];
}

/**
 * Передать больного другому нанятому врачу `to` (spec 2026-10-consults; spec 2026-10-specialists, часть 2): тот позовёт его
 * первым, когда освободится, и рассудит заново своим навыком — со всем, что узнано; специалист — с поправкой профиля
 * направленного (`priorOf`). Поток для ПК (spec 2026-10-walk): из кабинета `room` прежнего врача или вашего — в зону ожидания
 * у кабинета нового, к `at`. `from` — направил нанятый врач сам (по второй гипотезе); нет — вы.
 */
function handOver(db: ContentDb, s: ShiftState, p: ShiftPatient, to: StaffMember, room: string | undefined, at: number, from?: string) {
  p.by = to.id;
  p.ref = to.id;
  p.phase = {};
  delete p.tired;
  p.status = 'waiting';
  p.queuedT = s.t;
  p.wait++;
  delete p.out;
  if (s.flow) {
    const ctx = hospitalCtx(db, s);
    p.doc = to.id;
    moveTo(ctx.plan, ctx.working, p, room, to.room, at);
    seatDoor(db, s, ctx.plan, p);
  }
  journey.own(s, p, true, from);
}

/** Нанятый врач `m` передаёт больного со своего приёма врачу `to`: минута — передать карту, и он свободен. */
function passOn(db: ContentDb, s: ShiftState, p: ShiftPatient, m: StaffMember, to: StaffMember, from?: string) {
  handOver(db, s, p, to, m.room, s.t + MIN, from);
  (s.desk ??= {})[m.id] = s.t + MIN;
  schedule(s, s.t + MIN, { kind: 'free', by: m.id });
  staffDesks(db, s);
}

/**
 * Нанятый терапевт `m` не уверен, а его вторая гипотеза — из профиля специалиста `to` (решение владельца #112): направляет
 * больного к нему сам, а не просит вас посмотреть; в итогах дня врача — `sent`.
 */
function sendOn(db: ContentDb, s: ShiftState, p: ShiftPatient, m: StaffMember, to: StaffMember) {
  const day = colleagueDay(s, m.id);
  day.sent = (day.sent ?? 0) + 1;
  passOn(db, s, p, m, to, m.id);
}

/**
 * «Направить к …» из вашего кабинета (решение владельца #112): ваш больной — к специалисту `to`, который сейчас принимает, со
 * всем, что узнано; тот позовёт его первым, когда освободится, и поведёт с поправкой профиля. Ждёт результатов, вышел на
 * обследование или лежит в смотровой приёмного — нельзя. Минута — направление, и вы свободны.
 */
function referOwn(db: ContentDb, s: ShiftState, toId: string): Notice[] {
  const p = current(s);
  if (!s.flow || !p || p.pending.length > 0 || isOut(s, p) || p.bay) return [];
  const to = colleaguesOf(db, s).find(x => x.id === toId && db.roles[x.role]?.profile !== undefined);
  if (!to) return [];
  s.current = undefined;
  handOver(db, s, p, to, doctorRoom(hospitalCtx(db, s).plan), s.t + MIN);
  staffDesks(db, s);
  return later(db, s, p, MIN);
}

// --- «Главврач утверждает» (spec docs/specs/2026-10-two-ways.md, F2–F3, поток для ПК) --------------------------------------

/** Чем кончилось решение на утверждении — для итогов главврача: согласились, промолчали до срока, изменили. */
type Settled = 'agreed' | 'silent' | 'changed';

/** Итоги главврача за сутки. */
const chiefDay = (s: ShiftState): ChiefDay => (s.summary.chief ??= { asked: 0, agreed: 0, silent: 0, changed: 0 });

/** Придёт ли решение врача `m` главврачу на утверждение — по галочкам и тому, что знает врач (`approveFor`). */
function approveOf(db: ContentDb, s: ShiftState, p: ShiftPatient, m: StaffMember, dx: Id, setting: Setting): ApproveAsk | undefined {
  const rules = asksOf(s);
  if (!db.consults || !asksDecisions(rules, p.chief === true)) return undefined;
  const prior = priorOf(db, p, m);
  return approveFor(db, {
    rules, chief: p.chief === true, dx, setting, candidates: candidatesOf(db, p.departments ?? s.meta.department), obs: observationsOf(p), patient: p.patient,
    minutes: Math.round((s.t - p.arriveT) / 60), ...(prior ? { prior } : {}),
  });
}

/**
 * Решение — главврачу на утверждение: врач написал план и зовёт следующего; больной выходит к двери его кабинета — стоит или
 * садится на свободную скамейку у неё (spec 2026-10-door-benches), — и терпение не тратится: его уже приняли. Привезённый
 * скорой лежит на своём месте в смотровой. Срок ответа — как у просьб (`consults.yaml`, решение владельца #64); извещение —
 * для звука и счётчика, без автопаузы.
 */
function openApproval(db: ContentDb, s: ShiftState, p: ShiftPatient, m: StaffMember, plan: { diagnosis: Id; treatments: Id[]; setting: Setting }, ask: ApproveAsk, notices: Notice[]) {
  const until = s.t + db.consults!.wait * MIN;
  p.approve = { by: m.id, at: s.t, until, why: ask.why, plan, lead: ask.lead.map(b => ({ id: b.id, p: b.p })), verdict: verdictOf(db, plan.diagnosis, p.patient) };
  p.status = 'waiting';
  p.queuedT = s.t;
  p.wait++; // прежняя проверка терпения недействительна, новой нет
  delete p.out;
  if (!p.bay && m.room) {
    const ctx = hospitalCtx(db, s);
    delete p.hall;
    delete p.seatAt;
    delete p.bench;
    p.next = m.room;
    p.nextAt = s.t;
    p.leg = { from: m.room, at: s.t };
    const b = freeBench(db, s, ctx.plan, m.room, p);
    if (b !== undefined) p.bench = b;
  }
  chiefDay(s).asked++;
  journey.approve(s, p, m.id, until);
  schedule(s, until, { kind: 'approve', id: p.id });
  notices.push({ kind: 'approve', id: p.id, by: m.id });
}

/**
 * Утренний обход (`rounds`): лежащий «можно выписывать», а главврач просил спрашивать о выписке — его врач спрашивает, прежде
 * чем выписать. Не ответили до срока — выписывает (решение врача в силе, #64).
 */
function askDischarge(db: ContentDb, s: ShiftState, p: ShiftPatient, notices: Notice[]) {
  const by = p.closed!.by!;
  const until = s.t + db.consults!.wait * MIN;
  p.approve = { by, at: s.t, until, why: ['discharge'] };
  const day = chiefDay(s);
  day.asked++;
  day.discharges = (day.discharges ?? 0) + 1;
  schedule(s, until, { kind: 'approve', id: p.id });
  notices.push({ kind: 'approve', id: p.id, by });
}

/** Решение больше не ждёт главврача: ответ, срок или случай кончился иначе; `how` — в итоги главврача (нет — не в счёт). */
function closeApproval(s: ShiftState, p: ShiftPatient, how?: Settled) {
  const a = p.approve;
  if (!a) return;
  delete p.approve;
  s.events = s.events.filter(e => e.event.kind !== 'approve' || e.event.id !== p.id);
  if (!how) return;
  const day = chiefDay(s);
  day[how]++;
  if (a.verdict === 'wrong') (day.wrong ??= { agreed: 0, silent: 0, changed: 0 })[how]++;
  // изменили решение приёма (F5) — когда случай закроют, сравнить с диагнозом врача
  if (how === 'changed' && a.verdict) p.chiefFrom ??= a.verdict;
}

/** Верность диагноза по возрастанию — для «к лучшему» (F5). */
const VERDICT_RANK = { wrong: 0, partly: 1, correct: 2 } as const;

/**
 * Случай, решение по которому главврач изменил, закрыт (`closePatient`, spec 2026-10-two-ways, F5): диагноз вернее, чем был
 * у врача, — «к лучшему», хуже — «к худшему».
 */
function chiefOutcome(s: ShiftState, p: ShiftPatient, verdict: ClosedCase['verdict']) {
  const from = p.chiefFrom;
  if (!from) return;
  delete p.chiefFrom;
  const d = VERDICT_RANK[verdict] - VERDICT_RANK[from];
  const day = chiefDay(s);
  if (d > 0) day.better = (day.better ?? 0) + 1;
  else if (d < 0) day.worse = (day.worse ?? 0) + 1;
}

/**
 * Решение врача в силе — главврач согласен или не ответил до срока: выписка — выписать; решение приёма — закрыть приём планом
 * врача. Часы болезни — на минуту, когда врач решил (`closePatient`, `at`): согласие и молчание исхода не меняют.
 */
function settleApproval(db: ContentDb, s: ShiftState, p: ShiftPatient, how: 'agreed' | 'silent') {
  const a = p.approve!;
  closeApproval(s, p, how);
  if (!a.plan) {
    leave(db, s, p, 'discharge');
    return;
  }
  p.draft = { diagnosis: a.plan.diagnosis, treatments: [...a.plan.treatments], setting: a.plan.setting };
  closePatient(db, s, p, a.at);
  journey.approved(s, p, how);
}

/**
 * Ответ главврача: `agree` — решение врача в силе (выписку — выписать); `take` — случай ваш, как «Взять случай»; `refer` — к
 * другому нанятому врачу, который сегодня принимает: тот позовёт его первым и рассудит заново, своим навыком; `stay` —
 * выписку — на сутки позже: завтра на обходе врач спросит снова. «Ещё обследование» — команда `order`. Решения нет или ответ
 * не к нему — ничего.
 */
function answerApproval(db: ContentDb, s: ShiftState, cmd: Extract<Command, { kind: 'approve' }>): Notice[] {
  const p = s.patients[cmd.id];
  const a = p?.approve;
  if (!s.dayOpen || !a) return [];
  if (!a.plan) {
    if (cmd.answer === 'agree') settleApproval(db, s, p, 'agreed');
    else if (cmd.answer === 'stay') closeApproval(s, p, 'changed');
    return [];
  }
  if (cmd.answer === 'agree') {
    settleApproval(db, s, p, 'agreed');
    return [];
  }
  if (cmd.answer === 'take') return takeOver(db, s, p.id);
  const to = cmd.answer === 'refer' ? colleaguesOf(db, s).find(x => x.id === cmd.to && x.id !== a.by) : undefined;
  if (!to) return [];
  closeApproval(s, p, 'changed');
  // от двери прежнего врача — в зону ожидания у кабинета нового
  handOver(db, s, p, to, s.flow ? hospitalCtx(db, s).all.find(x => x.id === a.by)?.room : undefined, s.t);
  staffDesks(db, s);
  return [];
}

/**
 * Главврач назначил обследование больному нанятого врача (F2): тот, кто его ведёт, сделает его первым, как своё, — время,
 * деньги и показания считаются, как у его назначений, — и рассудит заново, уже с результатом; его следующее решение — к
 * главврачу на утверждение. На приёме — когда кончит начатый вопрос или осмотр; на обследованиях — когда вернётся; ждал
 * решения главврача или просил посмотреть — это и есть ответ: ждёт своего врача, тот позовёт его первым. Здесь не сделать,
 * не подходит больному, уже сделано или назначено — ничего.
 */
function chiefOrder(db: ContentDb, s: ShiftState, id: string, exam: Id): Notice[] {
  const p = s.patients[id];
  if (!s.dayOpen || !s.flow || !p?.by || p.closed || !(p.status === 'inRoom' || p.status === 'waiting' || p.status === 'away')) return [];
  const e = db.exams[exam];
  if (!e || p.done.includes(exam) || p.orders?.includes(exam) || !examFits(e, p.patient) || !examsHere(db, s).includes(exam)) return [];
  const approving = p.approve !== undefined;
  if (approving) closeApproval(s, p, 'changed');
  closeConsult(s, id);
  (p.orders ??= []).push(exam);
  p.chief = true;
  p.phase = {};
  if (p.status === 'inRoom') {
    // ещё идёт к врачу — назначит, когда дойдёт
    const busy = Math.max(s.t, p.walk?.at ?? 0, ...p.results.map(r => r.at));
    const step = s.events.find(x => x.event.kind === 'colleague' && x.event.id === id);
    if (step && step.t > busy) {
      p.spent.seconds -= step.t - busy;
      s.events = s.events.filter(x => x !== step);
      schedule(s, busy, { kind: 'colleague', id });
    }
  } else if (approving) {
    p.queuedT = s.t;
    journey.own(s, p);
  }
  staffDesks(db, s);
  return [];
}

/** Чей это приём, если врач его ведёт: день открыт, пациент у него в кабинете, врач в штате. */
function colleagueOf(db: ContentDb, s: ShiftState, p: ShiftPatient): StaffMember | undefined {
  if (!s.dayOpen || p.status !== 'inRoom' || !p.by) return undefined;
  // врач доводит приём и после своей смены (spec 2026-10-staff-shifts)
  return hospitalCtx(db, s).all.find(x => x.id === p.by);
}

/** Шаг нанятого врача по частям (`stepParts`): по тому, что он знает о пациенте сейчас. */
function colleagueParts(db: ContentDb, s: ShiftState, p: ShiftPatient, m: StaffMember): Parts<StepResult> {
  const how = doctorOf(db, m);
  // «Наставник» (spec 2026-10-skills): нанятый врач под вашим началом реже забывает спросить
  const forget = how.forget / mentorOf(db, s.meta.skills, m.role);
  // специалист знает, с чем к нему записываются (spec 2026-10-chapter-4, часть 60а): у записанного к нему болезни профиля
  // вероятнее — во столько раз; у направленного к нему — во столько, во сколько вероятнее у направленных (`priorOf`)
  const prior = priorOf(db, p, m);
  // долгий случай, о котором уже просил (spec 2026-10-economy): решает тем, что знает — ни анализов, ни снимков, только вопросы
  // перед лечением; уверенности не ждёт. Устал (spec 2026-10-staff-shifts, часть 2) — ставит диагноз при меньшей уверенности
  const hurry = hurried(db, s, p);
  return stepParts(db, p.patient, observationsOf(p), p.done, p.phase ?? {}, {
    candidates: candidatesOf(db, p.departments ?? s.meta.department), exams: hurry ? examsHere(db, s).filter(id => db.exams[id].kind === 'ask') : examsHere(db, s),
    threshold: hurry ? 0 : blurredOf(db, s, m, how.threshold), minGain: how.minGain,
    ...(prior ? { prior } : {}),
    // навык 1–2 иногда забывает спросить перед лечением — жребий своей ветви
    skipAsk: q => forget > 0 && branch(s, `forget:${p.id}:${q}`).chance(forget * 100),
    // и что у постели (часть 39а): под монитором — тромболизис; и сколько прошло с прихода (часть 41а)
    venue: { ...venueOf(db, s), bedside: bedsideEquipment(db, s, p), minutes: Math.round((s.t - p.arriveT) / 60), ready: id => readyIn(db, s, p, id) },
  });
}

/**
 * Шаг нанятого врача по частям (0.5.13, NFR-PRF-1): событие `colleague` в начале очереди считается между кадрами — его
 * шаг, а если он решает, — и разумный врач разбора его приёма; само событие — когда посчитано. Пока считается, больница
 * не меняется: следующая команда сначала доживает всё. В памяти, не в сохранении: после открытия — заново, тем же счётом.
 */
interface ColleagueJob {
  event: ShiftEvent;
  parts: Parts<StepResult>;
  result?: StepResult;
}
const colleagueJobs = new WeakMap<ShiftState, ColleagueJob>();

/**
 * Посчитать шаг нанятого врача в начале очереди: часть — сразу (за неё уже спросили `more()` перед событием), следующие —
 * пока `more()`; true — посчитан или считать нечего.
 */
function colleagueReady(db: ContentDb, s: ShiftState, more: () => boolean): boolean {
  const ev = s.events[0].event;
  if (ev.kind !== 'colleague') return true;
  const p = s.patients[ev.id];
  const m = colleagueOf(db, s, p);
  if (!m) return true;
  let job = colleagueJobs.get(s);
  if (job?.event !== ev) colleagueJobs.set(s, (job = { event: ev, parts: colleagueParts(db, s, p, m) }));
  while (!job.result) {
    const r = job.parts.next();
    if (r.done) job.result = r.value;
    else if (!more()) return false;
  }
  // решил — закроет приём; разумный врач разбора не нужен сейчас: бережливость — по требованию (spec 2026-10-engine-speed)
  return true;
}
