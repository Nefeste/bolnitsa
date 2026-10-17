// из anamnez: src/state/caseView.ts @ 1f80da6, изменено: база — из потока расчёта (`useDb`), строки — `T.case` «Больницы»;
// без картинок результатов (рисунки ЭКГ, снимков и срезов — Skia «Анамнеза», на ПК — позже) и портретов
// (spec docs/specs/2026-10-doctor-mode.md, «Поток расчёта»)
// «Вид» приёма одного пациента — то, что знает врач (`02-architecture.md` §7 «Анамнеза»): жалобы,
// пришедшие результаты, назначенное, подсказки, черновик решения, итог и разбор закрытого
// случая. В «Больнице» его строит поток расчёта (src/sim/doctor.ts) и отдаёт окну готовым; окно берёт отсюда только
// знание о медицине — списки обследований, их цену и «Что это?». Правда здесь появляется только в разборе закрытого случая.
import { type BodySystem, type Condition, type ContentDb, type Id, membersOf, type Rule, type Setting, SYSTEMS, type Tactics, type TacticsByParam } from '../content/types';
import { fnv1a } from '../engine/core/hash';
import type { Outcome } from '../engine/med/course';
import { complaintObservations, examFits, expectedFindings, falseRate } from '../engine/med/exams';
import { evidenceFor } from '../engine/med/differential';
import { type Belief, contextOf, type InferContext, knownFacts, posterior } from '../engine/med/infer';
import { jobName } from '../engine/med/jobs';
import { bedsideLack, type PlanEval, STAYS } from '../engine/med/plan';
import type { ReviewData } from '../engine/med/review';
import { type CaseScore, type Grade, type ScoreNote, worstGrade } from '../engine/med/score';
import { ageBand, checkRule, knownOf, rulesFor } from '../engine/med/rules';
import { complaintText, observationText } from '../engine/med/text';
import type { Observation, Patient } from '../engine/med/types';
import type { TargetResult } from '../engine/shift/targets';
import type { Difficulty } from '../engine/shift/types';
import { money, T } from '../i18n';
import { lowerFirst } from '../i18n/case';

/** База: поток расчёта и окно задают её при старте — у каждого своя копия (`content.json`). */
let db: ContentDb;
export function useDb(x: ContentDb) {
  db = x;
}

export const DEPARTMENT = 'dept.therapy';

export interface Line {
  f: Id;
  text: string;
  shown: boolean;
  exam: Id | 'complaint';
}

/** Результаты одного обследования. `fresh` — пришли за последнее действие игрока. */
export interface ResultGroup {
  key: string;
  exam: Id;
  name: string;
  at: string;
  fresh: boolean;
  lines: Line[];
}

/** Справка о термине для «Что это?»: только знания из базы, не правда о пациенте. `id` — статья энциклопедии. */
export interface TermInfo {
  id?: Id;
  title: string;
  text: string[];
  list?: { label: string; items: string[] };
}

export interface Decision {
  diagnosis: Id;
  verdict: 'correct' | 'partly' | 'wrong';
  /** настоящая болезнь — для ссылки в энциклопедию из разбора */
  truth: Id;
  truthName: string;
  /** уверенность идеального врача в поставленном диагнозе, 0–10 */
  outOf10: number;
  pearls: string[];
  causes: { finding: string; cause: string }[];
  /** что было дальше: исход за неделю или перевод */
  outcome: string;
  grades: { key: string; label: string; grade: Grade }[];
  overall: Grade;
  notes: string[];
  /** сроки по рекомендации (часть 37): оценка — худшая из сроков, она входит в «Итог»; строки — по каждому */
  targets?: { grade: Grade; lines: string[] };
  plan: { name: string; role: string }[];
  settingName: string;
  rational: string;
  idle: string[];
  timeline: { label: string; truth: number; chosen: number }[];
}

/** Вариант «где лечить» на экране решения: своя палата — со свободными койками (spec 2026-09-chapter-2, часть 26). */
export interface SettingOption {
  key: Setting;
  title: string;
  hint?: string;
  disabled?: boolean;
}

/** Срок по рекомендации на приёме (часть 37): строка и сделано ли уже. */
export interface CaseTarget {
  text: string;
  done: boolean;
}

/** Решение до «Завершить приём»: можно менять и дальше обследовать. */
export interface Draft {
  diagnosis?: Id;
  treatments: Id[];
  setting: Setting;
  /** дифференциальный ряд игрока (spec 2026-10-differential) — по порядку добавления */
  hypotheses?: Id[];
}

export interface VisitView {
  version: number;
  title: string;
  /** кем работает (spec 2026-10-occupation, 0.5.10): «Строитель», «Пенсионерка»; нет — пациент из старого сохранения */
  job?: string;
  /** для портрета: пол и возраст видны врачу, ключ портрета — не зерно генерации */
  /** кто пациент; жалобы — кому какой расспрос (часть 32г: о травме головы — при травме головы) */
  portrait: { key: number; sex: 'm' | 'f'; age: number; complaints: Id[] };
  clock: string;
  minutesSpent: number;
  money: number;
  complaints: Line[];
  /** все результаты по порядку прихода */
  results: Line[];
  /** те же результаты по обследованиям, новые сверху */
  groups: ResultGroup[];
  /** сколько результатов пришло за последнее действие */
  freshCount: number;
  /** игрок на этом приёме уже что-то сделал: карта открывается «Картой», а не «Спросить» (0.6.0) */
  acted: boolean;
  pending: { exam: Id; name: string; at: string }[];
  /** ушёл на обследование в другой кабинет (0.5.12): строка — когда вернётся */
  away?: string;
  /** приём закрывается (0.5.13): разбор ещё считается — экран итога ждёт его */
  finishing?: true;
  meanwhile: string[];
  /** смена: за это время пришёл срочный пациент — звук «срочно», а не «готово» */
  urgent?: boolean;
  /** смена: за это время у больного в смотровой остановилось сердце — тревога монитора (FR-AV-1) */
  alarm?: boolean;
  done: Id[];
  /** обследования, которых в этой больнице не сделать, — и почему */
  unavailable: Record<Id, string>;
  /** где лечить: варианты этой больницы */
  settings: SettingOption[];
  /** `word` — у «Ординатора» вместо числа (spec 2026-10-resident) */
  hints: { id: Id; name: string; outOf10: number; word?: string }[];
  /** дифференциальный ряд игрока (FR-DX-7, spec 2026-10-differential): гипотезы с доводами — по порядку добавления */
  differential: HypothesisView[];
  /** «Студенту» — правила решения к жалобе (часть 32): что говорят по уже проверенному */
  rules: { id: Id; name: string; text: string }[];
  /** из чего выбирают диагноз — болезни отделений этой больницы по системам органов */
  diagnoses: DiagnosisGroup[];
  /**
   * всё лечение базы по алфавиту; warning — противопоказание, о котором врач уже знает; disabled —
   * здесь не назначить (часть 39а: тромболизис без монитора у постели), warning — почему
   */
  treatments: { id: Id; name: string; warning?: string; disabled?: boolean }[];
  /** то же лечение — по группам (антибиотики, обезболивающие…) для экрана решения */
  treatmentGroups: { key: string; title: string; items: VisitView['treatments'] }[];
  /**
   * сверху экрана решения (вопрос 34): лечение, которое база называет при выбранном диагнозе и болезнях его группы, —
   * и нужное, и лишнее; выбранное — тоже; по алфавиту. Остальное — свёрнуто, с поиском
   */
  suggested: VisitView['treatments'];
  /**
   * «Практикант» (spec 2026-10-trainee): обследования, которые относятся к жалобе, — их карта показывает сверху,
   * остальное сворачивает; нет — уровень другой или пациент пришёл без жалоб (профосмотр)
   */
  focus?: Id[];
  draft: Draft;
  /** название выбранного, но ещё не поставленного диагноза */
  draftDiagnosisName?: string;
  /** смена: можно отпустить ждать результатов и принять другого */
  canSendAway?: boolean;
  /** смена: ждать нечего, а ждёт кто-то срочнее — можно попросить подождать (часть 37) */
  canStepOut?: boolean;
  /** смена: что делается у постели и сколько минут (часть 37: ЭКГ в смотровой приёмного) */
  bedside?: Record<Id, number>;
  /** смена: обследования, которые с умениями дня идут дольше или короче базы (spec 2026-10-skills), — их минуты */
  minutes?: Record<Id, number>;
  /**
   * смена: сроки по рекомендации — строками (часть 37); `done` — уже сделано: идущие — в шапке карты, сделанные — на
   * «Карте» (0.6.0)
   */
  targets?: CaseTarget[];
  /** смена: повторное обращение — строка для «Карты» */
  returnNote?: string;
  /** песочница: кто платит и что оплатит — строка для шапки */
  payerNote?: string;
  /** песочница: оплата закрытого приёма — на экране итога */
  payment?: string[];
  /** достижения, полученные этим приёмом, — названия */
  achievements?: string[];
  /** «Случай дня», повтор: чем засчитана первая попытка */
  firstTry?: string;
  /** приём ведёт нанятый врач — карта только для чтения, внизу «Забрать себе» (spec 2026-09-hired-doctors, часть 19) */
  colleague?: { id: string; doctor: string; away?: boolean };
  /** закрытый приём нанятого врача — строка «Приём вёл…»; есть — на экране итога и «лечение врача» */
  byDoctor?: string;
  decision?: Decision;
}

/** Результаты, пришедшие разом: шаг — номер действия игрока, за которое они пришли. */
export interface Arrival {
  exam: Id;
  step: number;
  /** минуты от полуночи — для подписи «в 08:35» */
  at: number;
  obs: Observation[];
  /** повторный забор того же назначения (spec 2026-10-chapter-3, часть 39в): тропонин через час */
  repeat?: true;
}

/** Как назвать результат: повторный забор (часть 39в) — своим именем, «Тропонин через час». */
export const resultName = (exam: Id, repeat?: true): string => (repeat && db.exams[exam].repeat?.name.ru) || db.exams[exam].name.ru;

/** Всё, из чего строится вид приёма: у прототипа и у смены — свои источники. */
export interface CaseInput {
  version: number;
  patient: Patient;
  /** часы — минуты от полуночи */
  clock: number;
  minutesSpent: number;
  money: number;
  step: number;
  arrived: Arrival[];
  pending: { exam: Id; readyAt: number; repeat?: true }[];
  /** ушёл на обследование в другой кабинет (0.5.12): что делают, когда вернётся — минуты от полуночи */
  away?: { exam: Id; back: number };
  /** приём закрывается (0.5.13): разбор ещё считается */
  finishing?: true;
  meanwhile: string[];
  urgent?: boolean;
  alarm?: boolean;
  done: Id[];
  draft: Draft;
  decision?: Decision;
  canSendAway?: boolean;
  canStepOut?: boolean;
  bedside?: Record<Id, number>;
  minutes?: Record<Id, number>;
  /** аппараты у постели (часть 39а): лежит в смотровой приёмного — монитор; нет — в кабинете врача ничего */
  bedsideEquipment?: readonly Id[];
  /** своя реанимация (spec 2026-10-chapter-4, часть 47): есть свободная койка с ИВЛ — `free`, все заняты — `full`; нет — её нет */
  ricu?: 'free' | 'full';
  /** работающие кабинеты больницы (часть 53а): гемостаз — где работает эндоскопический кабинет */
  rooms?: readonly Id[];
  targets?: CaseTarget[];
  returnNote?: string;
  /** сложность: «Похоже на» — только у «Студента» (09-game-design.md §14); нет — «Студент» (прототип П4) */
  difficulty?: Difficulty;
  /** своя больница: обследования, которых здесь не сделать, — и почему (spec 2026-09-own-hospital) */
  unavailable?: Record<Id, string>;
  /** отделения больницы: из их болезней диагноз и «Похоже на» (часть 30); нет — терапия */
  departments?: readonly Id[];
  /** где лечить — что есть в этой больнице; нет — как в амбулатории: домой, в стационар, скорая */
  settings?: SettingOption[];
  payerNote?: string;
  payment?: string[];
  achievements?: string[];
  colleague?: { id: string; doctor: string; away?: boolean };
  byDoctor?: string;
}

export function hhmm(min: number): string {
  const m = Math.floor(min);
  return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function patientName(p: Patient): string {
  const n = T.case.names;
  const first = p.sex === 'm' ? n.male : n.female;
  const surname = n.surnames[fnv1a(`${p.seed}:s`) % n.surnames.length];
  return `${p.sex === 'm' ? surname : n.feminine(surname)} ${first[fnv1a(`${p.seed}:f`) % first.length]}`;
}

/** Болезни, из которых выбирают диагноз: отделения больницы (с приёмным — и хирургия, часть 30); нет — терапия. */
export function candidates(departments: readonly Id[] = [DEPARTMENT]): Id[] {
  return Object.keys(db.conditions).filter(id => db.conditions[id].presenting && departments.includes(db.conditions[id].department));
}

/**
 * «Практикант» (spec 2026-10-trainee): обследования, которые относятся к жалобе. Болезни с этой жалобой — из тех, что
 * принимает больница, у которых жалоба пациента есть среди признаков записи; обследование относится к жалобе, если
 * проверяет признак такой болезни, кроме самих жалоб, её фактор риска или то, без чего она не бывает (курение, ХОБЛ),
 * или противопоказание к её лечению (аллергия на пенициллин). По жалобе, а не по выводу: список не подсказывает
 * диагноз, а настоящая болезнь пациента всегда среди болезней с его жалобой. Без жалоб (профосмотр) — ничего:
 * относится всё.
 */
export function complaintExams(patient: Pick<Patient, 'complaints'>, departments?: readonly Id[]): Id[] {
  const told = new Set(patient.complaints);
  if (told.size === 0) return [];
  const findings = new Set<Id>();
  // чем узнают о факторе риска, хронической болезни или противопоказании: признаки фактора, анамнез болезни
  const reveal = (id: Id) => {
    if (db.findings[id]) findings.add(id);
    for (const l of db.risks[id]?.findings ?? []) findings.add(l.f);
    for (const l of db.conditions[id]?.findings ?? []) if (db.findings[l.f]?.kind === 'hx') findings.add(l.f);
  };
  for (const id of candidates(departments)) {
    const c = db.conditions[id];
    if (!c.findings.some(l => told.has(l.f) && l.p > 0)) continue;
    for (const l of c.findings) if (!told.has(l.f)) findings.add(l.f);
    for (const r of c.risks ?? []) reveal(r.id);
    for (const r of c.requires ?? []) reveal(r);
    for (const tx of tacticsTreatments(c)) for (const x of db.treatments[tx]?.contraindications ?? []) reveal(x.id);
  }
  return Object.keys(db.exams).filter(e => db.exams[e].checks.some(x => findings.has(x.f))).sort();
}

/** Жалобы и всё, что пришло, — как для вывода. */
export function observationsOfCase(patient: Patient, arrived: readonly Arrival[]): Observation[] {
  return [...complaintObservations(patient), ...arrived.flatMap(a => a.obs)];
}

export function beliefsOf(patient: Patient, obs: readonly Observation[], departments?: readonly Id[]): Belief[] {
  return posterior(db, candidates(departments), obs, contextOf(db, patient, obs));
}

/** Противопоказание — фактор риска (аллергия) или состояние. */
export function riskName(id: Id): string {
  return db.risks[id]?.name.ru ?? db.conditions[id]?.name.ru ?? id;
}

/** Группа лечения для списка — по классу препарата; без класса — режим и советы. */
const TX_GROUPS: [string, string[]][] = [
  ['antibiotics', ['antibiotic']],
  ['antivirals', ['antiviral']],
  ['pain', ['analgesic', 'antimigraine']],
  // противосудорожные (spec 2026-10-chapter-3, часть 44в): бензодиазепин и вальпроевая кислота в вену при
  // эпилептическом статусе, свой противоэпилептический препарат при эпилепсии
  ['seizures', ['anticonvulsant']],
  ['breathing', ['bronchodilator', 'asthma', 'steroid.systemic']],
  // кислород через маску (spec 2026-10-chapter-3, часть 38б): при низкой сатурации; с частью 43в — маска CPAP
  ['oxygen', ['oxygen']],
  ['nose', ['nasal', 'steroid.intranasal', 'antihistamine']],
  // глаза (spec 2026-10-chapter-3, часть 44б): искусственная слеза и гель при лагофтальме
  ['eyes', ['ophthalmic']],
  // сердце и сосуды: с частью 33а — антикоагулянты, компрессионный трикотаж и гель при тромбофлебите;
  // с частью 33б — эпинефрин при анафилактическом шоке (АТХ C01CA24 — сердечно-сосудистая система);
  // с частью 39а — тромболизис при инфаркте; с частью 39г — статин (АТХ C10 — сердечно-сосудистая система);
  // с частью 42а — кардиоверсия, амиодарон и верапамил при фибрилляции предсердий; с частью 42в — атропин,
  // допамин и наружная стимуляция при АВ-блокаде; с частью 43в — фуросемид в вену при сердечной недостаточности;
  // с частью 43д — колхицин при перикардите
  ['heart', ['antihypertensive', 'antiplatelet', 'antianginal', 'anticoagulant', 'vascular', 'adrenergic', 'thrombolytic', 'lipid', 'antiarrhythmic', 'anticholinergic', 'diuretic', 'cardiac']],
  // противодиарейные (spec 2026-10-chapter-4, часть 49б): лоперамид — при кишечных инфекциях не нужен или вреден; с частью
  // 54а — лактулоза при кровотечении из вен пищевода и печёночной энцефалопатии, орнитин при ней (АТХ A05 — болезни печени)
  ['digestive', ['acid', 'antidiarrheal', 'laxative', 'liver']],
  // растворы для питья и капельница (часть 32д-2): и при кишечной инфекции, и при обширном ожоге; с частью 54а — альбумин
  // при циррозе с асцитом и спонтанном бактериальном перитоните
  ['fluids', ['rehydration', 'plasma']],
  // с частью 41в — гемостатики: протромбиновый комплекс, витамин K1, транексамовая кислота; с частью 44а — декстроза и
  // быстрые углеводы при гипогликемии (глюкагон — гормон); с частью 54б — тиамин при синдроме отмены алкоголя
  ['metabolic', ['antidiabetic', 'hormone', 'mineral', 'hemostatic', 'glucose', 'vitamin']],
  // травма (часть 32): гипсовая лонгета и закрытая репозиция
  ['trauma', ['immobilization']],
  // травма груди (часть 32в): плевральная пункция и дренирование
  ['drainage', ['drainage']],
  // раны (часть 32г-2): повязка, обработка со швом и без; анатоксин, вакцина, иммуноглобулины
  ['wounds', ['wound']],
  ['vaccines', ['vaccine']],
  // антидоты (spec 2026-10-chapter-4, часть 57а): налоксон при отравлении опиоидами
  ['antidotes', ['antidote']],
  // консультация нейрохирурга при кровоизлиянии (часть 41в), в том числе по телемедицине
  ['consult', ['consult']],
];

/** Порядок групп лечения — для решения и энциклопедии. */
export const TX_GROUP_ORDER = [...TX_GROUPS.map(([k]) => k), 'regimen'];

/** Группа по классу лечения; без класса — режим и советы. */
export function txGroupOfClass(cls: string | undefined): string {
  const c = cls ?? '';
  return TX_GROUPS.find(([, prefixes]) => prefixes.some(p => c === p || c.startsWith(`${p}.`)))?.[0] ?? 'regimen';
}

function txGroup(id: Id): string {
  return txGroupOfClass(db.treatments[id].class);
}

/** Всё лечение тактики болезни — все роли, и по значениям параметров (вопрос 34). */
function tacticsTreatments(c: Condition): Id[] {
  const roles = (t: Tactics | TacticsByParam) => [
    ...t.firstLine, ...t.acceptable, ...t.supportive, ...t.notIndicated, ...t.harmful, ...(t.plan ?? []), ...(t.prevent ?? []),
    ...membersOf(t.require), ...(t.preHospital ?? []), ...membersOf(t.beforeTransfer),
  ];
  return c.treatment ? [...roles(c.treatment), ...(c.treatment.byParam ?? []).flatMap(roles)] : [];
}

/**
 * Что предложить сверху (вопрос 34, замечание владельца 12.10.2026): при ОРВИ «Режим и обильное питьё» был в самом
 * низу списка, рядом с прививками, ранами и гипсом. Наверху — лечение, которое база называет при выбранном диагнозе и
 * болезнях его группы, — и нужное, и лишнее: при ОРВИ — режим и жаропонижающие, но и антибиотики, которые не нужны;
 * выбранное — тоже. По диагнозу игрока, а не по выводу: тот на уровне «Врач» подсказывал бы диагноз.
 */
export function suggestedTreatments(diagnosis: Id | undefined, chosen: readonly Id[]): Set<Id> {
  const c = diagnosis ? db.conditions[diagnosis] : undefined;
  const kin = c ? Object.values(db.conditions).filter(x => x.id === c.id || (c.group !== undefined && x.group === c.group)) : [];
  return new Set([...kin.flatMap(tacticsTreatments), ...chosen]);
}

function groupTreatments(items: VisitView['treatments']): VisitView['treatmentGroups'] {
  const titles = T.case.decision.txGroup;
  return TX_GROUP_ORDER
    .map(key => ({ key, title: titles[key], items: items.filter(x => txGroup(x.id) === key) }))
    .filter(g => g.items.length > 0);
}

/**
 * Лечение по группам с предупреждениями о том, что уже известно, — для смены плана на обходе;
 * `bedside` — аппараты у его койки (часть 39а): в палате монитора нет, в ПИТ — у каждой койки.
 */
export function treatmentGroupsFor(obs: readonly Observation[], bedside: readonly Id[] = [], rooms: readonly Id[] = []): VisitView['treatmentGroups'] {
  return groupTreatments(treatmentChoices(obs, bedside, undefined, rooms));
}

export function conditionChoices(departments?: readonly Id[]): { id: Id; name: string }[] {
  return candidates(departments).map(id => ({ id, name: db.conditions[id].name.ru })).sort((a, b) => (a.name < b.name ? -1 : 1));
}

export type DiagnosisGroup = { key: BodySystem; title: string; items: { id: Id; name: string }[] };

/** Диагнозы по системам органов — в порядке SYSTEMS; внутри — по алфавиту. */
export function diagnosisGroups(departments?: readonly Id[]): DiagnosisGroup[] {
  const all = conditionChoices(departments);
  return SYSTEMS
    .map(key => ({ key, title: T.case.decision.system[key], items: all.filter(c => db.conditions[c.id].system === key) }))
    .filter(g => g.items.length > 0);
}

/**
 * Выбор лечения: противопоказание, о котором пациент сказал, — предупреждение (`10` §8); лечению
 * у постели нужен его аппарат у постели (часть 39а) — без него кнопка серая, и сказано почему. Лечение
 * реанимации (spec 2026-10-chapter-4, часть 47) — ИВЛ — можно, если в ней есть свободная койка.
 */
function treatmentChoices(obs: readonly Observation[], bedside: readonly Id[] = [], ricu?: 'free' | 'full', rooms: readonly Id[] = []): VisitView['treatments'] {
  const known = knownFacts(db, obs);
  const knownIds = new Set([...known.risks, ...known.conditions]);
  // операцию выбирают не здесь, а «В операционную»: какая — по диагнозу (часть 28)
  return Object.values(db.treatments)
    .filter(x => x.kind !== 'surgery')
    .map(x => {
      const lack = bedsideLack(db, x.id, { bedside, rooms, ...(ricu === 'free' ? { ricu: true } : {}) });
      if (lack && x.place) return { id: x.id, name: x.name.ru, warning: ricu === 'full' ? T.case.patient.ricuFull : T.case.patient.onlyRicu, disabled: true };
      // лечение в кабинете (часть 53а): гемостаз — только где работает эндоскопический кабинет
      if (lack && x.room) return { id: x.id, name: x.name.ru, warning: T.case.patient.noRoom(db.rooms[x.room]?.gen.ru ?? x.room), disabled: true };
      if (lack) return { id: x.id, name: x.name.ru, warning: T.case.patient.noBedside(db.equipment[lack].gen.ru), disabled: true };
      const by = x.contraindications.find(k => knownIds.has(k.id));
      return { id: x.id, name: x.name.ru, warning: by ? T.case.patient.contraindicated(riskName(by.id)) : undefined };
    })
    .sort((a, b) => (a.name < b.name ? -1 : 1));
}

/** «Студенту» — до пяти гипотез с частотой (09-game-design.md §14). */
const HINTS = 5;
/** «Ординатор» (spec 2026-10-resident): «Похоже на» — до трёх, словами (09-game-design.md §14). */
const RESIDENT_HINTS = 3;

/**
 * Уверенность словами (FR-DX-8, spec 2026-10-resident): пять слов шкалы, как в «Words of Estimative Probability»
 * Шермана Кента (1964), — от «едва ли» до «почти наверняка»; границы 1, 3, 6 и 9 из 10 — игровая оценка.
 */
export function confidenceWord(p: number): string {
  const w = T.case.differential.words;
  return p >= 0.9 ? w[4] : p >= 0.6 ? w[3] : p >= 0.3 ? w[2] : p >= 0.1 ? w[1] : w[0];
}

/**
 * Правила решения к жалобе пациента (часть 32): есть признак правила — что оно велит («Снимок
 * нужен: …»); проверили все и ни одного — «перелом маловероятен»; иначе — что осталось проверить.
 * С части 32г — и дополнительные признаки, возраст и «правило не применяется».
 */
function rulesOf(p: Patient, obs: readonly Observation[]): VisitView['rules'] {
  const t = T.case.patient;
  const names = (ids: Id[]) => ids.map(f => lowerFirst(db.findings[f].name.ru));
  const known = knownOf(obs);
  // правило о самом обследовании (spec 2026-10-chapter-4, часть 50а: «Можно ли пункцию») — только когда применимо: при
  // менингеальных знаках или геморрагической сыпи, а не у каждого с головной болью
  const shown = (r: Rule) => !r.decides?.startsWith('exam.') || checkRule(r, p, known).applies === true;
  return rulesFor(db, p).filter(shown).map(r => {
    const x = checkRule(r, p, known);
    const age = r.age?.main !== undefined ? t.ruleAgeOver(r.age.main) : r.age?.from !== undefined ? t.ruleAgeFrom(r.age.from) : undefined;
    const main = [...names(x.main), ...(x.ageMain && age ? [age] : [])];
    const minor = [...names(x.minor), ...(x.ageMinor && r.age?.minor ? [t.ruleAgeRange(r.age.minor[0], r.age.minor[1])] : [])];
    // шкала с баллами (часть 41б): сколько набрано и за какие пункты
    const counted = (r.points?.items ?? []).filter(i => known(i.f) === true && !(i.unless ?? []).some(u => known(u) === true)).map(i => i.f);
    // возраст — по своей полосе, пол — если за него балл (часть 42а: CHA₂DS₂-VASc)
    const band = r.points ? ageBand(r.points, p.age) : undefined;
    const byAge = band ? [band.to !== undefined ? t.ruleAgeRange(band.from, band.to) : t.ruleAgeFrom(band.from)] : [];
    const bySex = r.points?.sex?.[p.sex] ? [t.ruleSex(p.sex)] : [];
    const scored = r.points && x.points ? t.rulePoints(x.points.min, [...byAge, ...bySex, ...names(counted)].join(', ')) : undefined;
    const why = scored ?? (main.length > 0 ? main.join(', ') : t.ruleMinor(minor.join(', ')));
    const no = x.points && x.points.min === x.points.max && x.applies !== false ? t.rulePointsNo(x.points.min, r.texts.no.ru) : r.texts.no.ru;
    const text =
      x.verdict === 'yes' ? t.ruleYes(r.texts.yes.ru, why)
      : x.verdict === 'no' ? (x.applies === false ? r.texts.na?.ru ?? r.texts.no.ru : no)
      : t.ruleCheck(names(x.left).join(', '));
    return { id: r.id, name: r.name.ru, text };
  });
}

/** Гипотеза дифференциального ряда игрока (FR-DX-7, spec 2026-10-differential): доводы — строками, по убыванию частоты. */
export interface HypothesisView {
  id: Id;
  name: string;
  /** «7 из 10» — у «Практиканта» и «Студента»; у «Ординатора» — словом (`word`); у «Врача» уверенности нет (§14) */
  outOf10?: number;
  word?: string;
  pro: string[];
  con: string[];
  unchecked: string[];
  /** чем подтвердить: обследования из записи болезни — сделано ли; пусто и `clinical` — по расспросу и осмотру */
  confirm: { name: string; done: boolean }[];
  clinical?: true;
}

/**
 * Доводы за каждую гипотезу ряда и против неё (`evidenceFor`): что найдено, чего нет, что типичное не проверено и чем
 * подтвердить. Уверенность — из того же вывода, что «Похоже на».
 */
function differentialOf(p: Patient, obs: readonly Observation[], c: CaseInput, context: () => InferContext, beliefs?: readonly Belief[]): HypothesisView[] {
  const ids = (c.draft.hypotheses ?? []).filter(id => db.conditions[id]);
  if (ids.length === 0) return [];
  const t = T.case.differential;
  const ctx = context();
  const share = new Map(beliefs?.map(b => [b.id, b.p]));
  const name = (f: Id) => db.findings[f]?.name.ru ?? f;
  // «у 10 из 10» — только почти у всех: 95 из 100 — это «у 9 из 10», а не «всегда»
  const n = (x: number) => (x >= 0.995 ? 10 : Math.min(9, Math.round(x * 10)));
  return ids.map(id => {
    const cond = db.conditions[id];
    const ev = evidenceFor(db, id, obs, ctx, p, c.done);
    return {
      id,
      name: cond.name.ru,
      ...(beliefs ? (c.difficulty === 'resident' ? { word: confidenceWord(share.get(id) ?? 0) } : { outOf10: n(share.get(id) ?? 0) }) : {}),
      pro: ev.pro.map(x => t.pro(name(x.f), n(x.p))),
      con: ev.con.map(x => (x.kind === 'absent' ? t.absent(name(x.f), n(x.p)) : t.unexplained(name(x.f)))),
      unchecked: ev.unchecked.map(x => t.unchecked(name(x.f), n(x.p), x.exam ? lowerFirst(db.exams[x.exam].name.ru) : undefined, x.exam ? c.unavailable?.[x.exam] : undefined)),
      confirm: cond.confirm === 'clinical' ? [] : cond.confirm.map(e => ({ name: db.exams[e]?.name.ru ?? e, done: c.done.includes(e) })),
      ...(cond.confirm === 'clinical' ? { clinical: true as const } : {}),
    };
  });
}

export function makeCaseView(c: CaseInput): VisitView {
  const p = c.patient;
  const line = (o: Observation): Line => ({
    f: o.f,
    shown: o.shown,
    exam: o.exam,
    text: o.exam === 'complaint' ? complaintText(db, o, p.sex, p.seed) : observationText(db, o, p.sex, p.seed),
  });
  // уточнения, которых нет, отдельной строкой не пишутся (часть 32в): у такого признака нет текста
  // «нет» — «пневмоторакса нет» скажет основной признак, а «средостение не смещено» уже лишнее
  const visible = (o: Observation) => o.shown || (db.findings[o.f]?.texts.absent?.length ?? 0) > 0;
  const obs = observationsOfCase(p, c.arrived);
  const treatments = treatmentChoices(obs, c.bedsideEquipment, c.ricu, c.rooms);
  const suggested = suggestedTreatments(c.draft.diagnosis, c.draft.treatments);
  // вывод для «Похоже на» и уверенности в гипотезах — у «Практиканта» и «Студента»; у «Врача» их нет (§14). Контекст
  // вывода — один на вид и только когда нужен: у «Врача» без гипотез его не считают
  let ctx: InferContext | undefined;
  const context = () => (ctx ??= contextOf(db, p, obs));
  const beliefs = c.difficulty === 'doctor' ? undefined : posterior(db, candidates(c.departments), obs, context());
  return {
    version: c.version,
    title: `${patientName(p)}, ${T.case.patient.years(p.age)}, ${p.sex === 'm' ? T.case.patient.male : T.case.patient.female}`,
    ...(p.job ? { job: jobName(db, p.job, p.sex) } : {}),
    portrait: { key: fnv1a(`${p.seed}:portrait`), sex: p.sex, age: p.age, complaints: p.complaints },
    clock: hhmm(c.clock),
    minutesSpent: c.minutesSpent,
    money: c.money,
    complaints: complaintObservations(p).map(line),
    results: c.arrived.flatMap(a => a.obs).filter(visible).map(line),
    groups: c.arrived
      .map((a, i) => ({ key: `${i}:${a.exam}`, exam: a.exam, name: resultName(a.exam, a.repeat), at: hhmm(a.at), fresh: c.step > 0 && a.step === c.step, lines: a.obs.filter(visible).map(line) }))
      .reverse(),
    freshCount: c.arrived.filter(a => c.step > 0 && a.step === c.step).reduce((n, a) => n + a.obs.filter(visible).length, 0),
    acted: c.step > 0,
    pending: c.pending.map(x => ({ exam: x.exam, name: resultName(x.exam, x.repeat), at: hhmm(x.readyAt) })),
    ...(c.away ? { away: T.case.patient.away(resultName(c.away.exam), hhmm(c.away.back)) } : {}),
    ...(c.finishing ? { finishing: true as const } : {}),
    meanwhile: c.meanwhile,
    ...(c.urgent ? { urgent: true } : {}),
    ...(c.alarm ? { alarm: true } : {}),
    done: c.done,
    unavailable: c.unavailable ?? {},
    settings: c.settings ?? (['home', 'ward', 'ambulance'] as const).map(key => ({ key, title: T.case.patient.setting[key] })),
    // «0 из 10» ничего не подсказывает — такие не показываем, первую — всегда
    diagnoses: diagnosisGroups(c.departments),
    hints: beliefs ? beliefs.slice(0, c.difficulty === 'resident' ? RESIDENT_HINTS : HINTS)
      .map(b => ({ id: b.id, name: db.conditions[b.id].name.ru, outOf10: Math.round(b.p * 10), ...(c.difficulty === 'resident' ? { word: confidenceWord(b.p) } : {}) }))
      .filter((h, i) => i === 0 || h.outOf10 > 0) : [],
    differential: differentialOf(p, obs, c, context, beliefs),
    rules: c.difficulty === 'doctor' ? [] : rulesOf(p, obs),
    treatments,
    treatmentGroups: groupTreatments(treatments),
    suggested: treatments.filter(x => suggested.has(x.id)),
    ...(c.difficulty === 'trainee' && p.complaints.length > 0 ? { focus: complaintExams(p, c.departments) } : {}),
    draft: c.draft,
    draftDiagnosisName: c.draft.diagnosis ? db.conditions[c.draft.diagnosis].name.ru : undefined,
    ...(c.canSendAway ? { canSendAway: true } : {}),
    ...(c.canStepOut ? { canStepOut: true } : {}),
    ...(c.bedside ? { bedside: c.bedside } : {}),
    ...(c.minutes ? { minutes: c.minutes } : {}),
    ...(c.targets && c.targets.length > 0 ? { targets: c.targets } : {}),
    ...(c.returnNote ? { returnNote: c.returnNote } : {}),
    ...(c.payerNote ? { payerNote: c.payerNote } : {}),
    ...(c.payment ? { payment: c.payment } : {}),
    ...(c.achievements && c.achievements.length > 0 ? { achievements: c.achievements } : {}),
    ...(c.colleague ? { colleague: c.colleague } : {}),
    ...(c.byDoctor ? { byDoctor: c.byDoctor } : {}),
    decision: c.decision,
  };
}

/** Итог и разбор закрытого случая — словами (`10` §10). */
export function decisionOf(x: {
  patient: Patient; arrived: readonly Arrival[]; diagnosis: Id; verdict: Decision['verdict']; confidence: number;
  plan: { treatments: Id[]; setting: Setting }; ev: PlanEval; outcome: Outcome; score: CaseScore; review: ReviewData;
  targets?: readonly TargetResult[];
  /** до решения сняли фибрилляцию желудочков разрядом под монитором (часть 39б) */
  arrest?: boolean;
}): Decision {
  const t = T.case.patient;
  const p = x.patient;
  const cond = db.conditions[p.truth.conditions[0].id];
  const outOf10 = (v: number) => Math.round(v * 10);
  const seen = x.arrived.flatMap(a => a.obs);
  const keys = ['accuracy', 'defensibility', 'thrift', 'treatment', 'setting', 'safety'] as const;
  return {
    diagnosis: x.diagnosis,
    verdict: x.verdict,
    truth: cond.id,
    truthName: cond.name.ru,
    outOf10: outOf10(x.confidence),
    pearls: (cond.pearls ?? []).map(v => v.ru),
    causes: [
      ...p.truth.findings
        .filter(f => seen.some(o => o.f === f.f && o.shown) || p.complaints.includes(f.f))
        .map(f => ({ finding: db.findings[f.f].name.ru, cause: f.cause === 'leak' ? t.causeLeak : (db.conditions[f.cause]?.name.ru ?? db.risks[f.cause]?.name.ru ?? f.cause) })),
      ...falseFindings(p, seen),
    ],
    outcome: `${x.arrest ? `${t.outcome.arrest}. ` : ''}${outcomeText(x.outcome, x.plan.setting, p.sex === 'f')}`,
    grades: keys.map(k => ({ key: k, label: t.grade[k], grade: x.score[k] })),
    overall: x.score.overall,
    notes: x.score.notes.map(noteText),
    ...(x.targets && x.targets.length > 0
      ? { targets: { grade: worstGrade(x.targets.map(r => r.grade)), lines: x.targets.map(r => targetLineOf(r)) } }
      : {}),
    // не лекарство — «лечение выбора» (часть 32)
    plan: x.ev.roles.map(r => ({ name: db.treatments[r.tx].name.ru, role: (db.treatments[r.tx].kind !== 'drug' ? t.roleTx[r.role] : undefined) ?? t.role[r.role] })),
    settingName: t.setting[x.plan.setting],
    rational: t.rationalLine(
      x.review.rational.exams.length > 0 ? x.review.rational.exams.map(e => db.exams[e].name.ru).join(', ') : t.rationalNone,
      x.review.rational.minutes, money(x.review.rational.money), db.conditions[x.review.rational.diagnosis].name.ru),
    idle: x.review.idle.map(e => db.exams[e].name.ru),
    timeline: x.review.timeline.map(v => ({ label: v.exam === 'complaint' ? t.timelineComplaints : db.exams[v.exam].name.ru, truth: outOf10(v.truth), chosen: outOf10(v.chosen) })),
  };
}

/**
 * Ложные находки в разборе (вопрос 33): обследование показало то, чего нет, — и как часто так бывает без болезни: у N из
 * 100, реже одного — из 1000; осмотр, снимок и ЭКГ, не показанные по жалобам, ошибаются реже (`falseRate`). Ответы на
 * вопросы — не находки: их здесь нет.
 */
export function falseFindings(p: Patient, seen: readonly Observation[]): { finding: string; cause: string }[] {
  const t = T.case.patient;
  const present = new Set(p.truth.findings.map(x => x.f));
  const expected = expectedFindings(db, p.complaints);
  const out = new Map<Id, string>();
  for (const o of seen) {
    const exam = db.exams[o.exam];
    const check = exam?.checks.find(k => k.f === o.f);
    if (!o.shown || present.has(o.f) || out.has(o.f) || !check || exam.kind === 'ask') continue;
    const rate = falseRate(exam, o.f, check.spec, expected);
    out.set(o.f, rate >= 50 ? t.causeFalse(Math.round(rate / 100), 100) : t.causeFalse(Math.max(1, Math.round(rate / 10)), 1000));
  }
  return [...out].map(([f, cause]) => ({ finding: db.findings[f].name.ru, cause }));
}

/** Строка срока в разборе: от прихода или (часть 39б) от находки — словами записи. */
function targetLineOf(r: TargetResult): string {
  const target = db.targets[r.id];
  const t = T.case.patient;
  return target?.texts.from && target.texts.after
    ? t.targetLine(target.name.ru, r.minutes, r.limit, target.texts.from.ru, target.texts.after.ru)
    : t.targetLine(target?.name.ru ?? r.id, r.minutes, r.limit);
}

export function outcomeText(outcome: Outcome, setting: Setting, female: boolean): string {
  const out = T.case.patient.outcome;
  // осложнение обследования при противопоказании (spec 2026-10-chapter-4, часть 50а): что было и чем кончилось
  if (outcome.examHarm) {
    const what = out.examHarm(db.exams[outcome.examHarm.exam]?.name.ru ?? outcome.examHarm.exam);
    if (outcome.kind === 'died') return `${what}. ${out.examHarmDied(outcome.day, female)}`;
    if (outcome.kind === 'transferred') return `${what}. ${out.transferredSevere(female)}`;
    return `${what}. ${outcomeText({ ...outcome, examHarm: undefined }, setting, female)}`;
  }
  // переведённый в сосудистый центр с подъёмом ST (часть 39б): как открыли артерию, и чем кончилось
  if (outcome.rsc) {
    const r = out.rsc;
    const how = `${r[outcome.rsc.by](outcome.rsc.hours)}${outcome.rsc.loss >= 100 ? `; ${r.late}` : ''}`;
    if (outcome.kind === 'died') return `${how}. ${r.died(outcome.day, female)}`;
    return `${outcome.severe ? r.severe(female) : r.transferred(female)}. ${how}`;
  }
  switch (outcome.kind) {
    // острый период позади (часть 41а): у инсульта — с последствиями или без
    case 'recovered': return outcome.settled === 'clear' ? out.settledClear(outcome.day) : outcome.settled === 'residual' ? out.settledResidual(outcome.day) : out.recovered(outcome.day, female);
    case 'improved': return out.improved(female);
    case 'unchanged': return out.unchanged;
    case 'worse':
      if (outcome.returns?.as && outcome.harmBy) return out.worseAfter(outcome.day, lowerFirst(db.conditions[outcome.returns.as]?.name.ru ?? ''), db.treatments[outcome.harmBy]?.name.ru ?? outcome.harmBy);
      return outcome.returns?.as ? out.worseAs(outcome.day, lowerFirst(db.conditions[outcome.returns.as]?.name.ru ?? '')) : out.worse(outcome.day);
    case 'reaction': return outcome.reaction ? out.reaction(db.treatments[outcome.reaction.tx].name.ru, riskName(outcome.reaction.by)) : out.unchanged;
    case 'transferred':
      if (outcome.severe) return out.transferredSevere(female);
      return setting === 'ambulance' ? out.ambulance : STAYS.includes(setting) ? out.transferred(female) : out.ward(female);
    // своя палата интенсивной терапии (spec 2026-10-chapter-3, часть 38а) и реанимация (spec 2026-10-chapter-4, часть 47)
    case 'admitted': return setting === 'surgery' ? out.operated : setting === 'icu' ? out.icu : setting === 'ricu' ? out.ricu : setting === 'box' ? out.box : out.admitted;
    case 'died': return out.died(outcome.day, female);
  }
}

/**
 * Условие по скрытому параметру словами: «при тяжёлом течении», «при ишемии кишки». Подпись —
 * по паре «параметр:значение», иначе по значению (тяжесть одна у многих болезней); без подписи
 * значение не показываем — «yes» в статье хуже, чем ничего.
 */
export function whenText(when: Record<string, string[]> | undefined): string | undefined {
  if (!when) return undefined;
  const words = Object.entries(when).flatMap(([name, values]) => {
    // подпись набора значений (часть 41а): гемипарез при инсульте — «при слабости в руке и ноге», а не
    // четыре шаблона выпадений подряд
    const set = values.length > 1 ? T.case.when[`${name}:${[...values].sort().join('|')}`] : undefined;
    return set !== undefined ? [set] : values.map(v => T.case.when[`${name}:${v}`] ?? T.case.when[v]);
  }).filter((w): w is string => w !== undefined);
  // несколько значений (часть 30д): «при инфильтрате, абсцессе и перитоните» — «при» один раз
  return words.length <= 1 ? words[0] : T.case.whenList(words);
}

export function noteText(n: ScoreNote): string {
  const t = T.case.patient.note;
  const tx = (id: Id) => db.treatments[id].name.ru;
  switch (n.code) {
    case 'tx.harmful': return t.harmful(tx(n.tx));
    case 'tx.notIndicated': return t.notIndicated(tx(n.tx));
    case 'tx.acceptable': return db.treatments[n.tx].kind === 'drug' ? t.acceptable(tx(n.tx)) : t.acceptableTx(tx(n.tx));
    case 'tx.noCure': return t.noCure;
    case 'tx.none': return t.none;
    case 'tx.preHospitalMissing': return t.preHospitalMissing(tx(n.tx));
    case 'tx.preventMissing': return t.preventMissing(tx(n.tx));
    // обязательное при лечении здесь (часть 38б): «обязательно при сатурации ниже 90 %»
    case 'tx.requireMissing': return t.requireMissing(tx(n.tx), whenText(n.when));
    // обязательное и при переводе (часть 39а): «при инфаркте с подъёмом ST в первые 12 часов»
    case 'tx.beforeTransferMissing': return t.beforeTransferMissing(tx(n.tx), whenText(n.when));
    case 'tx.companionMissing': return t.companionMissing(tx(n.tx), tx(n.of));
    // окно закрылось, пока шло обследование (часть 41а): тромболизис при инсульте
    case 'tx.windowMissed': return t.windowMissed(tx(n.tx), n.at);
    case 'setting.under': return t.settingUnder(n.recommended);
    case 'setting.over': return t.settingOver(n.recommended);
    case 'setting.contacts': return t.settingContacts;
    case 'safety.knownViolation': return t.knownViolation(tx(n.tx), riskName(n.by));
    case 'safety.unaskedViolation': return t.unaskedViolation(tx(n.tx), riskName(n.by));
    case 'safety.deniedViolation': return t.deniedViolation(tx(n.tx), riskName(n.by));
    case 'safety.notAsked': return t.notAsked(riskName(n.by));
    // обследование при противопоказании (spec 2026-10-chapter-4, часть 50а): пункция при коме
    case 'safety.examHarmKnown':
    case 'safety.examHarmUnchecked': {
      const by = n.by.map(f => lowerFirst(db.findings[f]?.name.ru ?? f)).join(', ');
      const exam = db.exams[n.exam]?.name.ru ?? n.exam;
      return n.code === 'safety.examHarmKnown' ? t.examHarmKnown(exam, by) : t.examHarmUnchecked(exam, by);
    }
    case 'safety.redFlagIgnored': return t.redFlagIgnored(db.findings[n.f].name.ru);
    case 'safety.redFlagUnchecked': return t.redFlagUnchecked(db.findings[n.f].name.ru);
    case 'thrift.over': return t.thriftOver(n.times);
    case 'level.lenient': return t.lenient;
    case 'triage.under': return t.triageUnder(n.triage, n.news2, n.flag && db.findings[n.flag]?.name.ru);
    case 'triage.over': return t.triageOver(n.triage, n.news2, n.flag && db.findings[n.flag]?.name.ru);
    case 'op.onTime': return t.opOnTime(tx(n.tx), n.hours, n.window, n.onset === true, n.observed === true);
    case 'op.late': return t.opLate(tx(n.tx), n.hours, n.window, n.onset === true, n.observed === true);
    case 'op.complication': return t.opComplication(tx(n.tx));
    case 'op.complicated': return t.opComplicated(db.conditions[n.of]?.complication?.name.ru ?? n.of, n.hours, n.before);
  }
}

/** Вопрос об анамнезе жизни — аллергия, лекарства, болезни родных: все его признаки — из анамнеза (`hx.`). */
export const lifeHistory = (id: Id): boolean => db.exams[id].checks.every(c => c.f.startsWith('hx.'));

/**
 * Обследования по разделам действий карты пациента — те, что ему подходят по полу, возрасту и
 * жалобе: о месячных и беременности мужчину не спрашивают, о травме головы — без травмы головы.
 */
export function examsByAction(patient: Pick<Patient, 'sex' | 'age' | 'complaints'>): Record<'ask' | 'examine' | 'order', Id[]> {
  // по названию; в «Спросить» сначала расспрос о жалобах по системам, потом анамнез жизни
  const byName = (a: Id, b: Id) => (db.exams[a].name.ru < db.exams[b].name.ru ? -1 : 1);
  const history = (id: Id) => (lifeHistory(id) ? 1 : 0);
  const ids = Object.keys(db.exams).filter(id => examFits(db.exams[id], patient)).sort(byName);
  return {
    ask: ids.filter(id => db.exams[id].kind === 'ask').sort((a, b) => history(a) - history(b) || byName(a, b)),
    examine: ids.filter(id => ['physical', 'bedside'].includes(db.exams[id].kind)),
    order: ids.filter(id => ['lab', 'rapid', 'imaging', 'functional'].includes(db.exams[id].kind)),
  };
}

export function examInfo(id: Id): { name: string; minutes: number; cost: number } {
  const e = db.exams[id];
  return { name: e.name.ru, minutes: e.time.procedure + (e.time.report ?? 0) + (e.time.turnaround ?? 0), cost: e.cost };
}

/** «Что это?» о признаке: объяснение и чем его выявляют. */
export function findingInfo(id: Id): TermInfo {
  const f = db.findings[id];
  const by = (db.revealedBy[id] ?? []).map(e => db.exams[e].name.ru);
  return {
    id,
    title: f.name.ru,
    text: f.texts.hint ? [f.texts.hint.ru] : [],
    list: by.length > 0 ? { label: T.case.patient.revealedBy, items: by } : undefined,
  };
}

/** «Что это?» об обследовании: как делают, что показывает, какие признаки проверяет. */
export function examTerm(id: Id): TermInfo {
  const e = db.exams[id];
  return {
    id,
    title: e.name.ru,
    text: [e.texts.summary.ru, ...(e.texts.hint ? [e.texts.hint.ru] : [])],
    list: { label: T.case.patient.checks, items: e.checks.map(c => db.findings[c.f].name.ru) },
  };
}

/** «Что это?» о лечении. */
export function treatmentTerm(id: Id): TermInfo {
  const x = db.treatments[id];
  return { id, title: x.name.ru, text: [x.texts.hint.ru] };
}

/** «Что это?» о болезни — только общее описание из энциклопедии. */
export function conditionTerm(id: Id): TermInfo {
  const c = db.conditions[id];
  return { id, title: c.name.ru, text: [c.texts.summary.ru] };
}
