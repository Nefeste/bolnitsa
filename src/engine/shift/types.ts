// из anamnez: src/engine/shift/types.ts @ 96503ac, изменено: ClosedCase.review — разбор по требованию (spec 2026-10-engine-speed); «Просят посмотреть» (spec 2026-10-consults); стройка ПК — команда, событие, извещение и счётчики (spec 2026-10-build); сутки целиком — часы приёма, планёрка и обход (spec 2026-10-day); путь пациента — поле `journeys` (spec 2026-10-flow-ui); касса и поток от больницы, планёрка, обход, долгий случай (spec 2026-10-economy)
// Смена в амбулатории (spec 2026-09-first-shift, «Движок»; `04-data-model.md` §2).
//
// Состояние — обычный сериализуемый объект: сохранение — снимок (ADR 0010). Случайность
// в нём не хранится: всё берётся из именованных ветвей зерна смены (ADR 0004), поэтому
// одинаковые зерно и команды дают одинаковую смену — на телефоне, в тестах и в повторе.
import type { BodySystem, Id, Season, Setting } from '../../content/types';
import type { Scheduled } from '../core/events';
import type { Outcome } from '../med/course';
import type { BuildCommand, Built, HospitalState } from '../hospital/build';
import type { SiteCommand, SiteResult, Works } from '../hospital/site';
import type { CampaignProgress } from '../campaign/campaign';
import type { CaseIncome, Ledger, Payer, RepChange } from '../economy/economy';
import type { StaffMember } from '../hospital/staff';
import type { DoctorPhase } from '../med/policy';
import type { Grade, ScoreNote } from '../med/score';
import type { Observation, Patient } from '../med/types';
import type { Bed, Stay, StayResult } from './ward';
import type { TargetResult } from './targets';
import type { Journeys } from './journey';

export const SHIFT_SCHEMA_VERSION = 1;

/** Время — игровые секунды от полуночи первого дня. */
export const DAY = 24 * 3600;
export const SHIFT_START = 8 * 3600;
/** После 14:00 новые пациенты не приходят; очередь можно допринять. */
export const SHIFT_END = 14 * 3600;
/**
 * Сколько игровых секунд новый пациент у регистратуры и у медсестры доврачебного кабинета, прежде чем сесть. Медсестра
 * меряет давление, пульс, температуру и сатурацию, когда он до неё дошёл и она закончила (0.5.12, отзыв на 0.5.11):
 * позвали раньше — пришёл к врачу без них.
 */
export const REGISTRATION = 2 * 60;
export const TRIAGE = 3 * 60;

/** Срочность по сортировке: красный — сразу к врачу, не уходит, а ухудшается. */
export type Triage = 'red' | 'yellow' | 'green';

/**
 * coming — ещё не пришёл (запланирован на сегодня); waiting — в очереди; inRoom — в
 * кабинете; away — ушёл на анализы и ждёт результатов; done — приём завершён; left — ушёл,
 * не дождавшись; unseen — день закрыт, а до него не дошли.
 */
/**
 * Сложность (09-game-design.md §14): «Студент» — обследования не ошибаются, пациенты ждут
 * в полтора раза дольше, подсказки «Похоже на» с частотой; «Практикант» (spec 2026-10-trainee,
 * с 0.5.4) — то же, и в карте пациента сверху — то, что относится к жалобе, а разбор мягче;
 * «Ординатор» (spec 2026-10-resident, с 0.5.8) — обследования ошибаются, как у «Врача», пациенты ждут в 1,2 раза
 * дольше, «Похоже на» — до трёх и уверенность словами; «Врач» — всё как в жизни. Медицина — болезни, частоты,
 * точность обследований в базе — одна на всех уровнях.
 */
export type Difficulty = 'trainee' | 'student' | 'resident' | 'doctor';

/** «Практикант» и «Студент»: обследования не ошибаются, пациенты ждут дольше, подсказки — на виду. */
export const easyLevel = (d: Difficulty | undefined): boolean => d === 'trainee' || d === 'student';

/** admitted — лежит в палате своей больницы (spec 2026-09-chapter-2, часть 26). */
export type PatientStatus = 'coming' | 'waiting' | 'inRoom' | 'away' | 'done' | 'left' | 'unseen' | 'admitted';

/** Практика в готовой амбулатории или песочница — своя больница (spec 2026-09-own-hospital). */
/** Практика, песочница, кампания (spec 2026-09-campaign) — у каждой свои сохранения. */
/** Практика, песочница, кампания и «Смена» — один день в выбранной больнице (spec 2026-09-campaign, часть 14). */
export type Mode = 'shift' | 'sandbox' | 'campaign' | 'single';

/** ambulance — привезла скорая (spec 2026-09-chapter-2, часть 27) */
export type VisitKind = 'appointment' | 'walkIn' | 'return' | 'ambulance';
export type ReturnReason = 'worse' | 'reaction' | 'unchanged';

/**
 * Результаты одного обследования; step — номер действия врача, за которое они пришли. `repeat` —
 * повторный забор того же назначения (spec 2026-10-chapter-3, часть 39в): тропонин через час.
 */
export interface ResultBatch {
  exam: Id;
  obs: Observation[];
  at: number;
  step: number;
  repeat?: true;
}

export interface PendingResult {
  exam: Id;
  readyAt: number;
  obs: Observation[];
  /** повторный забор (часть 39в) */
  repeat?: true;
  /** где делают (помещение больницы) и когда сама процедура — для карты; нет — в кабинете врача */
  room?: string;
  start?: number;
  end?: number;
}

export interface ShiftPatient {
  id: string;
  patient: Patient;
  arriveT: number;
  kind: VisitKind;
  /** повторное обращение: какой приём и почему вернулся */
  returnOf?: string;
  returnReason?: ReturnReason;
  /**
   * вернулся после ранней выписки из стационара (spec 2026-09-chapter-2, часть 35): его новый
   * случай стационара страховая не оплачивает
   */
  afterEarly?: true;
  triage: Triage;
  /** false — доврачебного кабинета нет: срочность никто не определил, очередь — по приходу */
  triaged?: boolean;
  /** песочница: кто платит — ОМС, ДМС или сам (spec 2026-09-own-hospital, часть 9) */
  payer?: Payer;
  /** когда впервые вызвали в кабинет — ожидание для репутации */
  calledT?: number;
  status: PatientStatus;
  /** с какого момента ждёт в очереди — для порядка */
  queuedT: number;
  /** номер ожидания: вызвали или отпустили на анализы — прежняя проверка терпения недействительна */
  wait: number;
  /** сколько секунд готов ждать; 0 — не уходит (красный) */
  patience: number;
  results: ResultBatch[];
  pending: PendingResult[];
  /** обследования, уже сделанные или назначенные этому пациенту */
  done: Id[];
  /** песочница: какие из них были показаны, когда их назначали, — их оплачивают ОМС и ДМС */
  indicated?: Id[];
  /** песочница: что заплатили за закрытый приём и что сняла экспертиза */
  paid?: CaseIncome;
  step: number;
  spent: { seconds: number; money: number };
  /** `hypotheses` — дифференциальный ряд игрока (FR-DX-7, spec 2026-10-differential): болезни, которые он подозревает */
  draft: { diagnosis?: Id; treatments: Id[]; setting: Setting; hypotheses?: Id[] };
  closed?: ClosedCase;
  /** ведёт нанятый врач — номер человека из штата (spec 2026-09-hired-doctors); нет — вы */
  by?: string;
  /**
   * записан к специалисту (spec 2026-10-chapter-4, часть 59) — номер человека из штата: из врачей его зовёт только он, а
   * вы — как любого
   */
  to?: string;
  /**
   * поток для ПК (spec 2026-10-walk): к какому врачу записан — номер нанятого врача; нет — к вам. Ждёт в зоне ожидания
   * `hall` у его кабинета, а следующий к врачу — у двери его кабинета `next`. От входа доходит до регистратуры к `regAt`,
   * до медсестры доврачебного кабинета — к `triAt` (если она есть), садится в зале к `seatAt` (с этого часа тратится
   * терпение), до двери доходит к `nextAt`; `walk` — куда он идёт по вызову и когда дойдёт (для окна)
   */
  doc?: string;
  hall?: string;
  next?: string;
  regAt?: number;
  triAt?: number;
  seatAt?: number;
  nextAt?: number;
  /** откуда и с какого часа идёт туда, где ждёт (от стойки, от медсестры, из зала к двери, от прежнего врача) */
  leg?: { from: string; at: number };
  walk?: { to: string; at: number };
  /**
   * заданный пациент первой смены главы (spec 2026-10-chapter-4, часть 61в): он для вас — нанятые врачи его не берут, иначе
   * в больнице с терапевтом подсказку о нём читал бы не врач
   */
  taught?: true;
  /** вы забрали его у нанятого врача (номер человека) и продолжили приём (часть 19) */
  from?: string;
  /**
   * поток для ПК: нанятый врач уже просил вас посмотреть его (spec 2026-10-consults «Больницы») — второй раз о нём не просят,
   * ни этот врач, ни тот, к кому его направили
   */
  asked?: true;
  /** где он в приёме: ищет диагноз или спрашивает о противопоказаниях перед лечением */
  phase?: DoctorPhase;
  /** лежит в палате своей больницы: койка, план, как идёт болезнь (часть 26) */
  stay?: Stay;
  /** привезла скорая (часть 27): место в смотровой приёмного; нет — ждёт у входа */
  bay?: Bed;
  /**
   * ушёл от врача на обследование в другой кабинет (0.5.12, отзыв на 0.5.11): `exam` в помещении `room` — до `until`, у
   * врача снова — к `back`; что делают при нём, — когда вернётся
   */
  out?: { exam: Id; room: string; until: number; back: number };
  /** скорая: врач отсортировал по листу передачи (цвет — `triage`) */
  sorted?: boolean;
  /** скорая: как отсортировала бы медсестра по шкале NEWS2 и красным флагам — для сверки; `flag` — признак, что поднял цвет выше баллов */
  scale?: { triage: Triage; news2: number; flag?: Id };
  /**
   * отделения, с какими больница его приняла (spec 2026-09-chapter-2, часть 30): работала
   * смотровая приёмного — и хирургия; из их болезней вывод, выбор диагноза и разбор, даже если
   * смотровую потом закрыли. Нет — одно отделение смены
   */
  departments?: Id[];
  /** фибрилляция желудочков в смотровой (часть 39б): когда её сняли разрядом */
  arrest?: number;
}

export interface ClosedCase {
  at: number;
  diagnosis: Id;
  verdict: 'correct' | 'partly' | 'wrong';
  /** уверенность идеального врача в поставленном диагнозе, 0–1 */
  confidence: number;
  plan: { treatments: Id[]; setting: Setting };
  outcome: Outcome;
  grades: Record<'accuracy' | 'defensibility' | 'thrift' | 'treatment' | 'setting' | 'safety' | 'overall', Grade>;
  notes: ScoreNote[];
  /** цена разумного пути на этом пациенте — для итогов дня: в условных единицах и в рублях */
  rationalCost: number;
  rationalMoney: number;
  /** принял нанятый врач — номер человека из штата; нет — вы */
  by?: string;
  /** вы продолжили приём, забрав его у нанятого врача (номер человека) */
  from?: string;
  /** лежал в палате: сколько суток, обычный срок, как ушёл (часть 26) */
  stay?: StayResult;
  /** сроки приёма (spec 2026-10-chapter-3, часть 37): ЭКГ при боли в груди — через сколько минут от прихода */
  targets?: TargetResult[];
  /** аппараты у постели в момент решения (часть 39а): под монитором тромболизис был возможен — разбор это помнит */
  bedside?: Id[];
  /**
   * работающие кабинеты, от которых зависит место (spec 2026-10-chapter-4, часть 53а): с эндоскопическим кабинетом
   * кровотечение из язвы лечат у себя — разбор и касса это помнят
   */
  rooms?: Id[];
  /** до решения была фибрилляция желудочков, её сняли разрядом под монитором (часть 39б) */
  arrest?: true;
  /**
   * разбор приёма нанятого врача ещё не досчитан (spec 2026-10-engine-speed, ч. 1): бережливость и общая оценка —
   * предварительные, цена разумного пути — 0; `lenient` — разбор «Практиканта». Досчитывает `settleReviews`, читает
   * `reviewedCase`
   */
  review?: 'due' | 'lenient';
}

export type ShiftEvent =
  | { kind: 'arrive'; id: string }
  /** подошёл срок результатов у пациента */
  | { kind: 'result'; id: string }
  /** проверить, не ушёл ли: то же ожидание (wait) — значит, терпение кончилось */
  | { kind: 'patience'; id: string; wait: number }
  /** нанятый врач: следующее действие с его пациентом (spec 2026-09-hired-doctors) */
  | { kind: 'colleague'; id: string }
  /** медсестра доврачебного кабинета померила пришедшего (0.5.12): витальные и срочность по ним */
  | { kind: 'nurse'; id: string }
  /** нанятый врач дописал карту и свободен — зовёт следующего */
  | { kind: 'free'; by: string }
  /** поток для ПК (spec 2026-10-walk): пришедший оформлен и измерен — теперь его может позвать нанятый врач */
  | { kind: 'ready'; id: string }
  /** операция кончилась (spec 2026-09-chapter-2, часть 28): исход и следующий в очереди операционной */
  | { kind: 'opEnd'; id: string }
  /** фибрилляция желудочков у лежащего в смотровой (spec 2026-10-chapter-3, часть 39б) */
  | { kind: 'arrest'; id: string }
  /**
   * поток для ПК (spec 2026-10-engine-speed, ч. 2): приходит следующий — пришёл сам (`walk`), привезла скорая (`amb`)
   * или вернулся (`ret`, `of` — прежний приём); пациент генерируется сейчас. По записи к специалисту (`book`, spec
   * 2026-10-specialists): у каждого специалиста свой поток, `to` — его номер
   */
  | { kind: 'flow'; stream: 'walk' | 'amb' | 'ret' | 'book'; n: number; of?: string; to?: string }
  | { kind: 'shiftEnd' }
  /** стройка ПК (spec 2026-10-build): убрать освободившееся — предметы и помещения, ждущие сноса */
  | { kind: 'siteFree' }
  /** сутки на ПК (spec 2026-10-day): 08:00 — планёрка, сутки кончились, часы идут дальше */
  | { kind: 'morning' }
  /** сутки на ПК: утренний обход — нанятые врачи смотрят своих лежащих */
  | { kind: 'rounds' }
  /**
   * поток для ПК (spec 2026-10-owner-play-2): ваш пациент дошёл до вас — вошёл в кабинет, к привезённому скорой вы дошли
   * до смотровой, вернулся с обследования в другом кабинете
   */
  | { kind: 'reach'; id: string };

/** Почему нанятый врач просит посмотреть (spec 2026-10-consults): не уверен в своём диагнозе; две гипотезы рядом. */
/** `long` — 4 часа без диагноза, решение владельца 17.10.2026 (spec 2026-10-economy, «Долгий случай»). */
export type ConsultWhy = 'unsure' | 'close' | 'long';

/**
 * «Просят посмотреть» (spec 2026-10-consults «Больницы», поток для ПК): нанятый врач после своих обследований не уверен и
 * зовёт вас. Больной ждёт у него в кабинете, пока вы не ответите или до `until`; потом врач решает сам.
 */
export interface Consult {
  /** больной */
  id: string;
  /** кто просит — номер человека из штата */
  by: string;
  /** когда попросил; до какого часа ждёт ответа */
  at: number;
  until: number;
  why: ConsultWhy[];
  /** что он думает: его диагноз и самая вероятная болезнь второй группы — с уверенностью во всей группе каждого, 0–1 */
  lead: { id: Id; p: number }[];
}

/** Поток пациентов для ПК (spec 2026-10-engine-speed, ч. 2): сколько приходит в час, не зависит от числа кабинетов. */
export interface Flow {
  /**
   * приходят сами, человек в час — в среднем за час приёма по умолчанию; по часам — форма `walk` базы, только в часы приёма
   * (spec 2026-10-day)
   */
  perHour: number;
  /** привозит скорая, машин в час — в среднем за сутки, по часам — форма `ambulance`; если работает смотровая приёмного */
  ambulancePerHour?: number;
  /** часы амбулаторного приёма, если игрок их менял (команда `hours`): с какого часа и до какого; нет — `hours` базы */
  hours?: [number, number];
  /**
   * поток от больницы (spec 2026-10-economy): сами — по кабинетам нанятых врачей и репутации, скорая — по местам смотровой
   * приёмного (`content/hospital/inflow.yaml`); `perHour` и `ambulancePerHour` тогда не действуют
   */
  auto?: true;
}

/**
 * Узкие места суток (spec 2026-10-economy, «Планёрка»), поток для ПК: что движок видел за 24 часа — для экрана планёрки.
 */
export interface DayLoad {
  /** ждали врача: больше всего в общей очереди сразу; дольше всего ждали вызова, минут (считается на планёрке) */
  queue: number;
  wait: number;
  /** кабинеты обследований с очередью: номер помещения → больше всего впереди, дольше всего ждали у кабинета (минут), сколько обследований */
  rooms?: Record<string, { queue: number; wait: number; n: number }>;
  /** скорая: больше всего ждали у входа сразу — мест в смотровой не было */
  door?: number;
  /** стационар: больше всего лежало в палатах сразу и сколько там коек (на планёрке) */
  beds?: { peak: number; of: number };
}

/** Кредит банка (spec 2026-10-economy, «Предел минуса и кредит»): сколько осталось вернуть и по сколько на планёрке, ₽. */
export interface Loan {
  left: number;
  perDay: number;
}

/** Ушедший из больницы — строка журнала дня вместо пациента в состоянии (spec 2026-10-engine-speed, ч. 2). */
export interface GoneRow {
  id: string;
  kind: VisitKind;
  /** чем кончилось: принят и отпущен, ушёл, не дождавшись, не успели принять */
  end: 'done' | 'left' | 'unseen';
  arriveT: number;
  calledT?: number;
  /** основное заболевание — правда */
  truth: Id;
  /** кто вёл: номер человека из штата; нет — вы */
  by?: string;
  diagnosis?: Id;
  verdict?: ClosedCase['verdict'];
  /** общая оценка — только у приёма с разбором (ваш); у приёма нанятого врача в потоке её нет */
  overall?: Grade;
  /** решение с замечанием безопасности — известно без разбора */
  unsafe?: true;
  setting?: Setting;
  returnOf?: string;
  returnReason?: ReturnReason;
  /** оплачено за приём, ₽ */
  paid?: number;
}

export type Command =
  | { kind: 'call'; id: string }
  | { kind: 'exam'; exam: Id }
  /** в кабинете: подождать ближайший результат этого пациента */
  | { kind: 'waitResults' }
  /**
   * отпустить ждать результатов, а пока принять другого; ждать нечего, а ждёт кто-то срочнее, —
   * попросить подождать в очереди (часть 37)
   */
  | { kind: 'sendAway' }
  | { kind: 'diagnose'; id: Id }
  | { kind: 'toggleTreatment'; id: Id }
  | { kind: 'setting'; setting: Setting }
  /** дифференциальный ряд (spec 2026-10-differential): добавить гипотезу или убрать её — времени не тратит */
  | { kind: 'hypothesis'; id: Id }
  | { kind: 'finish' }
  /** время на карте: часы идут сами (ADR 0005) */
  | { kind: 'advance'; seconds: number }
  | { kind: 'closeDay' }
  | { kind: 'nextDay' }
  /** песочница, между сменами (ADR 0016): постройка, отмена последней, стройка закончена */
  | { kind: 'build'; cmd: BuildCommand }
  | { kind: 'undo' }
  | { kind: 'buildEnd' }
  /** песочница, между сменами: нанять кандидата, уволить, назначить в помещение (нет — в резерв) */
  | { kind: 'hire'; id: string }
  | { kind: 'fire'; id: string }
  | { kind: 'assign'; id: string; room?: string }
  /** забрать себе пациента нанятого врача (spec 2026-09-hired-doctors, часть 19) */
  | { kind: 'takeOver'; id: string }
  /** обход (spec 2026-09-chapter-2, часть 26): выписать, перевести, сменить лечение лежащего */
  | { kind: 'discharge'; id: string }
  | { kind: 'transfer'; id: string }
  | { kind: 'replan'; id: string; treatments: Id[] }
  /** скорая (часть 27): врач сортирует привезённого по листу передачи */
  | { kind: 'sort'; id: string; triage: Triage }
  /** обход (часть 28): лежащего — в операционную, операцией его диагноза */
  | { kind: 'operate'; id: string }
  /** «мягкий режим» из настроек (часть 28б): вместо смерти — перевод в тяжёлом состоянии */
  | { kind: 'soft'; on: boolean }
  /** «Больные: разнообразие» из настроек (spec 2026-10-variety): со следующего разыгранного дня */
  | { kind: 'variety'; on: boolean }
  /** умения врача из профиля (spec 2026-10-skills): со следующего дня; `today` — в начале игры, сразу */
  | { kind: 'skills'; ids: Id[]; today?: true }
  /** «свои больные» из настроек (spec 2026-10-own-patients): сразу — нанятые врачи оставляют вам новых этих групп */
  | { kind: 'mine'; systems: BodySystem[] }
  /**
   * поток для ПК, ответ на «Просят посмотреть» (spec 2026-10-consults): `look` — посмотреть самому, больной ваш, как
   * `takeOver`; `self` — пусть решает сам, сейчас; `refer` — направить к другому нанятому врачу `to`
   */
  | { kind: 'consult'; id: string; answer: 'look' | 'self' | 'refer'; to?: string }
  /** кампания (часть 34): основные задания главы выполнены — в больницу следующей главы */
  | { kind: 'nextChapter' }
  /** стройка ПК (spec 2026-10-build): в любой момент, в потоке для ПК */
  | { kind: 'site'; cmd: SiteCommand }
  /** поток для ПК (spec 2026-10-day): часы амбулаторного приёма — с `open` до `close`, целые часы; сразу */
  | { kind: 'hours'; open: number; close: number }
  /** касса ПК (spec 2026-10-economy): взять кредит, который банк предложил на планёрке */
  | { kind: 'loan' };

/** Что случилось — для интерфейса: звук, автопауза, сводка «за это время». */
export type Notice =
  | { kind: 'arrived'; id: string; triage: Triage }
  | { kind: 'resultsReady'; id: string }
  | { kind: 'left'; id: string }
  /** привезла скорая (часть 27): звук и автопауза, как у «красного» */
  | { kind: 'ambulance'; id: string }
  /** фибрилляция желудочков в смотровой (часть 39б): под монитором — разряд, ритм восстановлен */
  | { kind: 'arrest'; id: string }
  /** поток для ПК: нанятый врач `by` просит посмотреть больного (spec 2026-10-consults) — звук и автопауза */
  | { kind: 'consult'; id: string; by: string }
  | { kind: 'shiftEnd' }
  /** стройка ПК (spec 2026-10-build): что вышло — цена или почему нельзя */
  | ({ kind: 'site' } & SiteResult)
  /**
   * поток для ПК (spec 2026-10-day): планёрка в 08:00 — итог прошедших суток и что сломалось с утра («помещение:место»);
   * для экрана планёрки и автопаузы
   */
  | { kind: 'morning'; summary: DaySummary; broken?: string[] }
  /** поток для ПК (spec 2026-10-economy, «Обход»): ваш лежащий в 08:00 стал хуже или реагирует на лечение — автопауза */
  | { kind: 'worse'; id: string }
  /** поток для ПК (spec 2026-10-owner-play-2): ваш пациент у вас — вошёл или вернулся с обследования; карта и пауза */
  | { kind: 'reached'; id: string };

export interface DaySummary {
  day: number;
  arrived: number;
  seen: number;
  left: number;
  unseen: number;
  correct: number;
  partly: number;
  wrong: number;
  grades: Record<Grade, number>;
  money: number;
  /** сколько из сегодняшних случаев вернутся (запланированы повторные обращения) */
  returnsPlanned: number;
  /** сколько повторных обращений пришло сегодня */
  returnsToday: number;
  /** песочница: касса за день, остаток вечером, как изменилась репутация */
  /** поток для ПК (spec 2026-10-economy): ещё кредит — сколько осталось — и предложение банка ниже предела, ₽ */
  economy?: { ledger: Ledger; cash: number; reputation: RepChange; level: { level: number; rooms: Id[] }; loan?: Loan; offer?: number };
  /** поток для ПК (spec 2026-10-economy): узкие места суток — для планёрки */
  load?: DayLoad;
  /** сколько раз назначен антибиотик, который не показан (задание главы 1) */
  needlessAntibiotic?: number;
  /** кампания: какие задания выполнены за день и какие письма пришли */
  campaign?: { done: string[]; letters: string[] };
  /** нанятые врачи: номер человека из штата → его приёмы за день; прежние строки — ваши приёмы */
  colleagues?: Record<string, ColleagueDay>;
  /** стационар за день (часть 26): поступили, выписаны (из них рано), переведены, лежат вечером; суток и обычных сроков у выписанных */
  ward?: WardDay;
  /** скорая за день (часть 27): привезли, отсортировали, из них недооценили и переоценили по шкале */
  ambulance?: AmbulanceDay;
  /** операционная за день (часть 28): операций, из них в срок `window` и позже; осложнений после операции */
  surgery?: SurgeryDay;
  /** сроки за день (часть 37): у скольких ваших приёмов срок был и у скольких выполнен */
  targets?: Record<Id, { onTime: number; total: number }>;
  /**
   * глава 3 (spec 2026-10-chapter-3, часть 45а): оценки сроков ваших приёмов по порядку закрытия —
   * «AAB», для заданий «срок у N больных подряд»; оценка срока с серией (spec 2026-10-chapter-4, часть 60а) — и в строке
   * срока серии: антибиотик при шоке и без шока — одна строка
   */
  targetSeq?: Record<Id, string>;
  /** тромболизисы ваших приёмов (часть 45а): в окне и без противопоказаний — и остальные */
  lysis?: { good: number; bad: number };
  /** ОКС у ваших приёмов (часть 45а): сколько было и у скольких он пропущен — диагноз не тот */
  acs?: { seen: number; missed: number };
  /**
   * глава 4 (spec 2026-10-chapter-4, часть 60а): заразные, которым нужен бокс, — у всех приёмов больницы, ваших и нанятых
   * врачей; из них положены в общую палату
   */
  isolation?: { seen: number; ward: number };
}

export interface SurgeryDay {
  done: number;
  onTime: number;
  late: number;
  complications: number;
  /** на момент разреза — осложнённая стадия, перфорация (часть 28б) */
  complicated?: number;
  /** из них осложнилось уже в больнице, пока ждал (часть 34: задание главы 2) */
  waited?: number;
  /** без осложнения после операции и без смерти после неё (часть 34: задание главы 2) */
  good?: number;
}

export interface AmbulanceDay {
  arrived: number;
  sorted: number;
  under: number;
  over: number;
}

export interface WardDay {
  admitted: number;
  discharged: number;
  early: number;
  transferred: number;
  lying: number;
  stayDays: number;
  stayNorm: number;
  /** умерли в стационаре (часть 28б); в «мягком режиме» их переводят — это `transferred` */
  died?: number;
  /** из переведённых — в тяжёлом состоянии вместо смерти, «мягкий режим» (часть 35: для репутации) */
  severe?: number;
  /** из поступивших — в палату интенсивной терапии (spec 2026-10-chapter-3, часть 38а) */
  icu?: number;
  /** из лежащих вечером — в ПИТ (часть 38а) */
  icuLying?: number;
  /** из поступивших — в реанимацию, и из лежащих вечером — в ней (spec 2026-10-chapter-4, часть 47) */
  ricu?: number;
  ricuLying?: number;
  /** из поступивших — в бокс инфекционного отделения, и из лежащих вечером — в нём (spec 2026-10-chapter-4, часть 49а) */
  box?: number;
  boxLying?: number;
  /**
   * тяжёлые (spec 2026-10-rules, часть 72): поступившие — привезённые скорой «красными» по шкале или положенные в ПИТ и
   * реанимацию; умершие из них — и в «мягком режиме» переведённые в тяжёлом состоянии вместо смерти; выписанные раньше
   * срока — такой вернётся хуже; лежащие вечером
   */
  heavy?: number;
  heavyDied?: number;
  heavyEarly?: number;
  heavyLying?: number;
}

/** Приёмы нанятого врача за день (spec 2026-09-hired-doctors). */
export interface ColleagueDay {
  /**
   * должность (spec 2026-10-chapter-4, часть 60а): задание «приёмы специалистов» считает их и после увольнения врача; в
   * итогах до 0.5.0 её нет — специалистов в кампании тогда не было
   */
  role?: Id;
  seen: number;
  correct: number;
  partly: number;
  wrong: number;
  grades: Record<Grade, number>;
  /** сколько его пациентов вы забрали себе (часть 19) */
  taken?: number;
  /**
   * поток для ПК, без разбора (spec 2026-10-engine-speed «Больницы», ч. 1): положил в свою палату, ПИТ, реанимацию, бокс или
   * операционную; перевёл (скорая, стационар другой больницы); решение с замечанием безопасности (оценка не A)
   */
  admitted?: number;
  referred?: number;
  unsafe?: number;
  /** поток для ПК: сколько раз просил вас посмотреть (spec 2026-10-consults) */
  asked?: number;
}

export interface PlannedReturn {
  day: number;
  of: string;
  reason: ReturnReason;
  /** с другой болезнью (spec 2026-10-chapter-3, часть 41б): после ТИА без профилактики — с инсультом */
  as?: Id;
}

export interface ShiftState {
  meta: {
    schemaVersion: number;
    contentVersion: number;
    rngVersion: number;
    mode: Mode;
    /** песочница: с чего начали — пустой участок или готовая амбулатория */
    start?: 'empty' | 'clinic';
    /** кампания: номер карьеры — её слот (1–3) */
    career?: number;
    /** «Смена»: в какой больнице — запись готовой больницы (preset.*) или своя из песочницы (sandbox) */
    venue?: Id;
    seed: number;
    season: Season;
    department: Id;
    /** сложность (09-game-design.md §14); нет — «Врач»: так играли до 0.0.16 */
    difficulty?: Difficulty;
    /** «мягкий режим» (spec 2026-09-chapter-2, часть 28б): вместо смерти — перевод в тяжёлом состоянии */
    soft?: boolean;
    /**
     * «Больные: разнообразие» (spec 2026-10-variety, 0.3.11): день разыгрывается со сглаженными
     * частотами болезней; в кампании — нет. Нет поля — как в жизни
     */
    variety?: boolean;
    /** умения врача этого дня (spec 2026-10-skills, часть 75): обследования игрока точнее и короче; нет — без умений */
    skills?: Id[];
    /** умения со следующего дня: профиль изменился за день — новое действует завтра */
    skillsNext?: Id[];
    /**
     * «свои больные» (spec 2026-10-own-patients, часть 76): новых, кого по жалобам направили бы в эти группы болезней,
     * нанятые врачи оставляют вам; нет — берут всех, как прежде
     */
    mine?: BodySystem[];
  };
  t: number;
  day: number;
  /** false — день закрыт, итоги показаны, ждём «следующий день» */
  dayOpen: boolean;
  patients: Record<string, ShiftPatient>;
  /** ждут врача: по срочности, затем по времени */
  queue: string[];
  /** кто в кабинете */
  current?: string;
  /**
   * поток для ПК (spec 2026-10-owner-play-2): когда вы встретитесь с ним — он дойдёт до кабинета или вы до смотровой; до
   * этого приём не начат, его действия не идут; нет — уже встретились
   */
  meet?: number;
  /** очередь событий по (t, seq); seq — сквозной номер постановки, для одинакового порядка */
  events: Scheduled<ShiftEvent>[];
  seq: number;
  /** когда освободится помещение с очередью к аппарату (рентген, ЭКГ): номер помещения → время */
  rooms: Record<string, number>;
  /**
   * аппараты, сломавшиеся с утра (FR-EQ-3, spec 2026-10-walk-breakdowns): «помещение:место»; до конца дня их будто нет, к
   * завтра починят; нет — всё работает
   */
  broken?: string[];
  /**
   * где врач (FR-HOS-4): смотровая приёмного, где он был у последнего больного; к следующему он идёт оттуда; нет — в своём
   * кабинете
   */
  doctorAt?: string;
  /**
   * до какого часа ещё прожить время последней команды (0.5.13, NFR-PRF-1): события до него доживаются по частям, в
   * следующих кадрах (`catchUp`), а следующая команда сначала доживает их все; нет — всё прожито
   */
  until?: number;
  returns: PlannedReturn[];
  summary: DaySummary;
  history: DaySummary[];
  /** команды текущего дня — для отчёта об ошибке и повтора (`02-architecture.md` §8) */
  journal: Command[];
  /** своя больница — только в песочнице; практика идёт в готовой амбулатории каталога */
  hospital?: HospitalState;
  /** песочница: касса, ₽; репутация 0–100; касса текущего дня (нет — сохранение 0.0.20–0.0.21) */
  /**
   * поток для ПК (spec 2026-10-economy): `cash` — на последней планёрке, а касса сейчас — с кассой суток (`cashNow`);
   * `accrued` — до какого часа зарплаты и содержание записаны в кассу суток; `loan` — кредит; `offer` — предложение банка
   * с планёрки, ₽
   */
  economy?: { cash: number; reputation?: number; ledger?: Ledger; accrued?: number; loan?: Loan; offer?: number };
  /** «Отменить» на экране стройки: прежние больница и касса, последние UNDO_DEPTH */
  undo?: Built[];
  /** штат песочницы; в практике — штат готовой амбулатории */
  staff?: StaffMember[];
  /** кандидаты — новые каждый вечер */
  candidates?: StaffMember[];
  /** номер следующего человека */
  nextStaff?: number;
  /** кампания: глава, задания, письма (spec 2026-09-campaign) */
  campaign?: CampaignProgress;
  /** нанятые врачи: номер человека → до какого времени дописывает карту после приёма */
  desk?: Record<string, number>;
  /** поток для ПК (spec 2026-10-engine-speed, ч. 2): приток в час; нет — запись по слотам кабинетов, как в «Анамнезе» */
  flow?: Flow;
  /** поток для ПК: ушедшие — строками, по дням; хранятся неделю, как принятые */
  gone?: GoneRow[];
  /** поток для ПК: «Просят посмотреть» — просьбы нанятых врачей без ответа, по времени (spec 2026-10-consults) */
  consults?: Consult[];
  /** стройка ПК (spec 2026-10-build): потрачено на стройку и отмена */
  works?: Works;
  /** поток для ПК: путь пациента — что с ним было и почему ждал; сутки после ухода (spec 2026-10-flow-ui) */
  journeys?: Journeys;
}
