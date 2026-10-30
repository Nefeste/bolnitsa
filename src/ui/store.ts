// Хранилище панелей (spec docs/specs/2026-10-shell-3d.md, «Панели»): игра пишет сюда не чаще 10 раз в секунду, панели
// читают через `useSyncExternalStore`. Снимок неизменяемый: каждое `set` — новый объект.
import { useSyncExternalStore } from 'react';
import type { PathLine, PatientFilter, PatientRow } from '../app/flow';
import type { Id, Manage, ObjectKind, RoomSizeId } from '../content/types';
import type { Lang } from '../i18n';
import type { PersonInfo } from '../render/population';
import type { Quality } from '../render/view';
import type { WallMode } from '../render/world';
import type { DoctorAction, DoctorHud } from './doctor/types';
import type { EconomyHud, MoneyAction } from '../app/money';
import type { HintKey } from '../app/hints';
import type { SaveRow } from '../app/saves';
import type { Role } from '../app/roles';
import type { NoticeRow } from '../app/toasts';
import type { QualityMode, TextScale } from '../app/settings';
import type { ScenarioAction, ScenarioHud } from '../app/scenario';
import type { Metric } from '../app/metrics';
import type { ProblemGo, ProblemList } from '../app/problems';
import type { LegRow } from '../app/paths';
import type { DemoHud } from './Demo';

/** Скорость игры (spec docs/specs/2026-10-walk.md): ×1, ×3, ×12; 0 — пауза. */
export type Speed = 0 | 1 | 3 | 12;
export type Tab = 'patients' | 'staff' | 'asks' | 'journal' | 'reports' | 'goals';

/**
 * Инструменты стройки (spec docs/specs/2026-10-build.md, «Экран и управление»; готовое — docs/specs/2026-10-ready-rooms.md;
 * «Отделение» — docs/specs/2026-10-departments.md, часть 2).
 */
export type Tool = 'ready' | 'room' | 'item' | 'door' | 'door2' | 'bench' | 'demolish' | 'dept';

export interface BuildHud {
  on: boolean;
  tool?: Tool;
  roomType?: Id;
  /** готовое помещение: тип и образец */
  ready?: { type: Id; size: RoomSizeId };
  /** «С персоналом»: готовое — с людьми на всех должностях */
  withStaff: boolean;
  item?: { kind: ObjectKind; eq?: Id };
  /** «Отделение»: в какое переводить; null — снять отметку (отделение снова по тем, кто работает) */
  dept?: Id | null;
  /** переставляют поставленный предмет */
  moving: boolean;
  /** строка призрака: что, размер, цена — или почему нельзя */
  ghost?: { ok: boolean; text: string };
  /** что вышло у последнего действия */
  result?: { ok: boolean; text: string };
  spent: number;
  undo: number;
}

export interface RoomCard {
  room: number;
  name: string;
  id: string;
  /** вид помещения — его статья в энциклопедии по F1 (spec docs/specs/2026-10-encyclopedia.md) */
  type: Id;
  staff: string[];
  people: number;
  /** больница ПК: размер, работает ли и почему нет, нужное, должности, «Обставить», снос, каталог предметов */
  size?: string;
  ok?: boolean;
  state?: string;
  problems?: string[];
  needs?: { name: string; have: number; need: number }[];
  /**
   * должности: кто на месте или кого нанять; на место врача — выбор: терапевт или специалист (`options`, spec
   * docs/specs/2026-10-specialists.md); смены (spec docs/specs/2026-10-staff-shifts.md): строка на смену, `both` — человек
   * без смены, на обеих
   */
  /** заметка под должностями: «в ночную смену санитара нет — лежачих повезут медсёстры» (spec 2026-10-orderlies) */
  note?: string;
  posts?: {
    role: Id; name: string; who?: string; staffId?: string; salary: string; you?: boolean; shift?: 'day' | 'night' | 'both';
    /** «Уволить» — подсказка с выплатой за три смены (spec docs/specs/2026-10-staff-mood.md) */
    fire?: string;
    /** должность, без которой помещение работает (санитар, spec docs/specs/2026-10-orderlies.md): что без неё будет */
    optional?: string;
    options?: { role: Id; name: string; salary: string; hint: string }[];
  }[];
  furnish?: { ok: boolean; text: string };
  demolish?: string;
  /**
   * отделение (spec docs/specs/2026-10-departments.md, часть 2): название, цвет, откуда оно; `value` — у палаты и кабинета,
   * которые можно перевести: отметка инструмента, `''` — её нет
   */
  dept?: { name: string; color: string; why: string; value?: Id | '' };
  /**
   * деньги помещения по суткам (spec docs/specs/2026-10-metrics-layer.md, часть 2): прошедшие (последние 14) и сегодня до сих
   * пор (`day: null`) — для графика; `service` — служебное: выручки нет, оно работает на всю больницу
   */
  money?: { day: number | null; income: number; expenses: number }[];
  service?: true;
  catalog?: { kind: ObjectKind; eq?: Id; name: string; price: string }[];
}

/** Тип помещения в каталоге стройки: наименьший размер и цена за м². */
export interface RoomTypeRow {
  id: Id;
  name: string;
  /** группа каталога (spec docs/specs/2026-10-catalog.md): отделение, `service` или `common` */
  group: string;
  min: string;
  price: string;
}

/** Тип в каталоге готовых помещений: образцы S/M/L — размер и цена готового целиком. */
export interface ReadyTypeRow {
  id: Id;
  name: string;
  group: string;
  sizes: { id: RoomSizeId; text: string }[];
  /** у одного образца — его размер и цена; у нескольких — «от» самой низкой цены */
  price: string;
}

export interface Hud {
  ready: boolean;
  status: string;
  error?: string;
  lang: Lang;
  t: number;
  day: number;
  speed: Speed;
  /** промотка «до утра» (заглушка части 2а) */
  ff: boolean;
  cash?: number;
  arrived: number;
  seen: number;
  left: number;
  queue: number;
  /** на сколько игровых минут расчёт отстаёт */
  lag: number;
  walls: WallMode;
  /** качество на сцене сейчас; `qualityMode` — что выбрано в настройках: «авто» или своё; `autoQuality` — что выбрало «авто» */
  quality: Quality;
  qualityMode: QualityMode;
  autoQuality?: Quality;
  projection: 'persp' | 'ortho';
  /** размер текста (spec docs/specs/2026-10-settings.md, «Размер текста») */
  text: TextScale;
  tab: Tab | null;
  selected?: { key: string; info: PersonInfo };
  /** «Следить» (spec docs/specs/2026-10-owner-play-2.md): камера идёт за выбранным */
  following?: boolean;
  room?: RoomCard;
  notices: NoticeRow[];
  /** вкладка «Пациенты» (spec docs/specs/2026-10-flow-ui.md): строки по фильтру, сколько всего, ушедшие */
  patients: PatientRow[];
  patientsAll: number;
  patientFilter: PatientFilter;
  gone: PatientRow[];
  /** «Приняты» (spec docs/specs/2026-10-discharged-card.md): приняты и ушли — последние, новые сверху; всех за сутки */
  seenRows: PatientRow[];
  seenAll: number;
  /** «Путь пациента» выбранного: лента, итог, почему ушёл; `none` — пути нет (пришёл до этой версии) */
  path?: { lines: PathLine[]; summary: string; left?: string } | { none: true };
  /** слои карты: меню, «Очереди и загрузка», «Показатели» — включённый показатель (spec docs/specs/2026-10-metrics-layer.md) */
  /**
   * `day` — сутки денег на слое (часть 2): номер прошедших суток, `null` — сегодня до сих пор; `days` — какие прошедшие
   * сутки есть (последние 14)
   */
  layers: { open: boolean; queues: boolean; depts: boolean; paths: boolean; problems: boolean; metric: Metric | null; day: number | null; days: number[] };
  /**
   * слой «Пути пациентов» (spec docs/specs/2026-10-layers.md, часть 2): переходы за сутки, где прошли больше всего метров;
   * сколько переходов всего, сколько метров и сколько строк не вошло; `sel` — выбранный переход (на полу — только он)
   */
  paths: { rows: LegRow[]; total: number; meters: number; more: number; sel: string | null };
  /** слой «Проблемы» (spec docs/specs/2026-10-layers.md, часть 1): что сейчас мешает больнице — список и число в меню */
  problems: ProblemList;
  /**
   * отделения (spec docs/specs/2026-10-departments.md, часть 2): в какие переводит инструмент — по порядку записи; легенда
   * слоя и фильтр «Пациентов» — отделения этой больницы, сколько помещений, `''` — без отделения
   */
  departments: { id: Id; name: string; color: string }[];
  deptLegend: { id: Id | ''; name: string; color: string; rooms: number }[];
  /** вкладка «Персонал»: `on` — сейчас в смене (spec docs/specs/2026-10-staff-shifts.md) */
  /** «Персонал»: строка человека; `on` — в смене; `bad` — собирается уйти или уходит (spec docs/specs/2026-10-staff-mood.md) */
  staffList: { key: string; text: string; on?: true; bad?: true }[];
  /** «Нанять в резерв» (spec docs/specs/2026-10-staff-mood.md, часть 5): должности тех, кто на местах, и зарплата за сутки */
  reserveHire: { role: Id; text: string }[];
  debug: boolean;
  build: BuildHud;
  roomTypes: RoomTypeRow[];
  readyTypes: ReadyTypeRow[];
  /** группы каталога стройки по порядку (spec docs/specs/2026-10-catalog.md); у отделения — его цвет */
  catalogGroups: { id: string; name: string; color?: string }[];
  /** миниатюры готовых помещений (spec docs/specs/2026-10-catalog.md): `вид|образец` → PNG адресом `blob:`; пусто — не вышла */
  thumbs: Record<string, string>;
  /** больница ПК закрыта — почему (пациенты не приходят) */
  closed?: string;
  /** не та смена (spec docs/specs/2026-10-staff-shifts.md): пришедших сами не примут до утра — спокойной строкой */
  night?: string;
  /** выбор начала: пустое здание или готовая больница */
  choose?: boolean;
  fps: number;
  cpuMs: number;
  gpuMs: number | null;
  people: number;
  version: string;
  /** режим врача (spec docs/specs/2026-10-doctor-mode.md): окно врача, карта пациента, просьбы */
  doctor?: DoctorHud;
  /** касса, репутация, планёрка, часы приёма (spec docs/specs/2026-10-economy.md) */
  economy?: EconomyHud;
  /** подсказка первых минут (spec docs/specs/2026-10-aaa-polish.md): что сделать дальше; нет — ничего не показывать */
  hint?: { key: HintKey; text: string };
  /** окно «Настройки» (spec docs/specs/2026-10-settings.md; решение владельца #70): стены, камера, качество, «Отладка» */
  settingsOpen: boolean;
  /** меню игры (spec docs/specs/2026-10-saves.md): раскрыто ли и сохранения — новые сверху */
  menu: { open: boolean; rows: SaveRow[] };
  /** экран начала: сохранения — «Продолжить» и «Загрузить»; `problem` — почему не открылось то, что выбрали */
  startSaves?: SaveRow[];
  startProblem?: string;
  /** экран начала (spec docs/specs/2026-10-scenario-1.md): карточки «Кампании» — сценарии по порядку */
  startScenarios?: { id: Id; title: string; about: string }[];
  /** названия сценариев для строк сохранений: «Сценарий 1. Амбулатория» */
  scenarioNames?: Record<Id, string>;
  /** сценарий кампании (spec docs/specs/2026-10-scenario-1.md): письма, цели, «Сценарий пройден»; не сценарий — нет */
  scenario?: ScenarioHud;
  /** сложность этой игры (spec docs/specs/2026-10-difficulty.md, часть 2): уровень «Управления» и мягкий режим */
  manage: Manage;
  soft: boolean;
  /** экран начала: числа уровней «Управления» из базы — строке под кнопками второго шага */
  startLevels?: Record<Manage, LevelRow>;
  /**
   * демо (spec docs/specs/2026-11-demo.md): `demoMode` — игра открыта ключом `demo` (на экране начала — только «Кампания»);
   * `demo` — окно «Итог» после первой планёрки; `progress` — полоса загрузки: сделано из всего и что грузится сейчас
   */
  demoMode: boolean;
  demo?: DemoHud;
  progress?: { done: number; total: number; text: string };
}

/** Уровень «Управления» на экране начала: множители, %; предел минуса, ₽ (нет — без предела); касса начала по началу, ₽. */
export interface LevelRow {
  inflow: number;
  patience: number;
  salary: number;
  /** оплата случаев (решение владельца #151) */
  pay: number;
  breakdown: number;
  overdraft?: number;
  cash: Record<'empty' | 'preset' | 'poly', number>;
}

/** Сложность новой игры: уровень «Управления» и мягкий режим (spec docs/specs/2026-10-difficulty.md, часть 2). */
export interface Level {
  manage: Manage;
  soft: boolean;
}

export const initial: Hud = {
  ready: false,
  status: '',
  demoMode: false,
  lang: 'ru',
  t: 8 * 3600,
  day: 0,
  speed: 1,
  ff: false,
  arrived: 0,
  seen: 0,
  left: 0,
  queue: 0,
  lag: 0,
  walls: 'down',
  quality: 'high',
  qualityMode: 'auto',
  projection: 'persp',
  text: 1,
  tab: null,
  notices: [],
  patients: [],
  patientsAll: 0,
  patientFilter: { triage: 'all', where: 'all', dept: 'all', long: false, list: 'present' },
  gone: [],
  seenRows: [],
  seenAll: 0,
  layers: { open: false, queues: false, depts: false, paths: false, problems: false, metric: null, day: null, days: [] },
  paths: { rows: [], total: 0, meters: 0, more: 0, sel: null },
  problems: { rows: [], more: 0, count: 0 },
  departments: [],
  deptLegend: [],
  staffList: [],
  reserveHire: [],
  debug: false,
  build: { on: false, withStaff: true, moving: false, spent: 0, undo: 0 },
  roomTypes: [],
  readyTypes: [],
  catalogGroups: [],
  thumbs: {},
  fps: 0,
  cpuMs: 0,
  gpuMs: null,
  people: 0,
  version: '',
  settingsOpen: false,
  menu: { open: false, rows: [] },
  manage: 'normal',
  soft: false,
};

export class Store {
  private state: Hud = initial;
  private listeners = new Set<() => void>();

  get = () => this.state;

  set(patch: Partial<Hud>) {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
}

/** Что панели могут попросить у игры. */
/** Кнопки окна «Итог» демо (spec docs/specs/2026-11-demo.md). */
export type DemoAction = { kind: 'save' } | { kind: 'wishlist' } | { kind: 'close' };

export interface Actions {
  setSpeed(s: Speed): void;
  untilMorning(): void;
  setWalls(m: WallMode): void;
  setQuality(q: Quality): void;
  /** «Настройки»: качество «авто» или своё — запоминается */
  setQualityMode(m: QualityMode): void;
  setProjection(p: 'persp' | 'ortho'): void;
  setText(k: TextScale): void;
  overview(): void;
  select(key: string | undefined): void;
  setTab(t: Tab | null): void;
  toggleDebug(): void;
  bench(uncapped: boolean): void;
  setLang(l: Lang): void;
  /** стройка (spec docs/specs/2026-10-build.md) */
  toggleBuild(): void;
  setTool(t: Tool | undefined): void;
  pickRoomType(id: Id): void;
  /** готовое помещение (spec docs/specs/2026-10-ready-rooms.md): тип и образец; без образца — первый */
  pickReady(id: Id, size?: RoomSizeId): void;
  toggleReadyStaff(): void;
  pickItem(kind: ObjectKind, eq?: Id): void;
  /** «Отделение» (spec docs/specs/2026-10-departments.md, часть 2): какое — инструменту; помещению — из его карточки */
  pickDept(dept: Id | null): void;
  markDept(room: string, dept: Id | null): void;
  undo(): void;
  done(): void;
  furnish(room: string): void;
  demolish(room: string): void;
  /**
   * `as` — кого на место врача: терапевта или специалиста (spec docs/specs/2026-10-specialists.md); `shift` — на дневную или
   * ночную смену (spec docs/specs/2026-10-staff-shifts.md)
   */
  hire(room: string, role: Id, as?: Id, shift?: 'day' | 'night'): void;
  dismiss(id: string): void;
  /** «Поднять зарплату» и «В другую смену» в карточке человека (spec docs/specs/2026-10-staff-mood.md) */
  raise(id: string): void;
  reshift(id: string): void;
  /** «Отправить учиться» (spec docs/specs/2026-10-staff-mood.md, раздел 4) */
  study(id: string): void;
  /** «Нанять в резерв» (spec docs/specs/2026-10-staff-mood.md, часть 5) */
  reserve(role: Id): void;
  /**
   * начало игры: пустое здание, готовая больница или поликлиника и роль (spec docs/specs/2026-10-two-ways.md, F4); `{ load }`
   * — сохранение (spec 2026-10-saves); `level` — сложность новой игры (spec docs/specs/2026-10-difficulty.md, часть 2)
   */
  startGame(kind: 'empty' | 'preset' | 'poly' | { load: string } | { scenario: Id }, role?: Role, level?: Level): void;
  /** сложность в игре (spec docs/specs/2026-10-difficulty.md, часть 2; решение владельца #136): в любой момент — с этой минуты */
  setManage(level: Manage): void;
  setSoft(on: boolean): void;
  /** часть 3 (spec docs/specs/2026-10-flow-ui.md): фильтры «Пациентов», камера к человеку и выбор, слои карты */
  filterPatients(patch: Partial<PatientFilter>): void;
  focus(key: string): void;
  /** «Найти» (spec docs/specs/2026-10-owner-play.md): пациент по номеру в движке — камера к нему и его карточка */
  find(id: string): void;
  /** «Следить» за выбранным — включить или отпустить (spec docs/specs/2026-10-owner-play-2.md) */
  follow(): void;
  toggleLayers(): void;
  toggleQueues(): void;
  /** слой «Отделения» (spec docs/specs/2026-10-departments.md, часть 2): вместо «Очередей» — пол красят они */
  toggleDepts(): void;
  /** слой «Проблемы» (spec docs/specs/2026-10-layers.md, часть 1): пол красит он; строка списка — туда, куда она ведёт */
  toggleProblems(): void;
  /** слой «Пути пациентов» (часть 2): пол коридоров по частоте; строка списка — только её путь, ещё раз — все */
  togglePaths(): void;
  pickLeg(key: string | null): void;
  goProblem(go: ProblemGo): void;
  /** слой «Показатели»: показатель или выключить (`null`); сутки денег — прошедшие или сегодня (`null`) */
  setMetric(m: Metric | null): void;
  setMetricDay(day: number | null): void;
  /** режим врача (spec docs/specs/2026-10-doctor-mode.md) */
  doctor(a: DoctorAction): void;
  /** касса и планёрка (spec docs/specs/2026-10-economy.md): экран планёрки, автопауза, часы приёма, кредит */
  money(a: MoneyAction): void;
  /** подсказки первых минут (spec docs/specs/2026-10-aaa-polish.md) */
  dismissHint(): void;
  /** сценарий кампании (spec docs/specs/2026-10-scenario-1.md): письмо прочитано, «Без обучения», «Продолжить здесь» */
  scenario(a: ScenarioAction): void;
  /** «Итог» демо (spec docs/specs/2026-11-demo.md): сохранить снимок, список желаемого Steam, играть дальше */
  demo(a: DemoAction): void;
  /** «Настройки» (spec docs/specs/2026-10-settings.md): окно из меню игры */
  toggleSettings(): void;
  /** меню игры (spec docs/specs/2026-10-saves.md): раскрыть, сохранить, загрузить ячейку, удалить, новая игра */
  toggleMenu(): void;
  saveGame(): void;
  loadGame(slot: string): void;
  deleteGame(slot: string): void;
  newGame(): void;
}

export function useHud(store: Store): Hud {
  return useSyncExternalStore(store.subscribe, store.get);
}
