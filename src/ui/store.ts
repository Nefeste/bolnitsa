// Хранилище панелей (spec docs/specs/2026-10-shell-3d.md, «Панели»): игра пишет сюда не чаще 10 раз в секунду, панели
// читают через `useSyncExternalStore`. Снимок неизменяемый: каждое `set` — новый объект.
import { useSyncExternalStore } from 'react';
import type { PathLine, PatientFilter, PatientRow } from '../app/flow';
import type { Id, ObjectKind } from '../content/types';
import type { Lang } from '../i18n';
import type { PersonInfo } from '../render/population';
import type { Quality } from '../render/view';
import type { WallMode } from '../render/world';
import type { DoctorAction, DoctorHud } from './doctor/types';
import type { EconomyHud, MoneyAction } from '../app/money';
import type { HintKey } from '../app/hints';

/** Скорость игры (spec docs/specs/2026-10-walk.md): ×1, ×3, ×12; 0 — пауза. */
export type Speed = 0 | 1 | 3 | 12;
export type Tab = 'patients' | 'staff' | 'asks' | 'journal' | 'reports' | 'goals';

/** Инструменты стройки (spec docs/specs/2026-10-build.md, «Экран и управление»). */
export type Tool = 'room' | 'item' | 'door' | 'door2' | 'demolish';

export interface BuildHud {
  on: boolean;
  tool?: Tool;
  roomType?: Id;
  item?: { kind: ObjectKind; eq?: Id };
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
  staff: string[];
  people: number;
  /** больница ПК: размер, работает ли и почему нет, нужное, должности, «Обставить», снос, каталог предметов */
  size?: string;
  ok?: boolean;
  state?: string;
  problems?: string[];
  needs?: { name: string; have: number; need: number }[];
  posts?: { role: Id; name: string; who?: string; staffId?: string; salary: string; you?: boolean }[];
  furnish?: { ok: boolean; text: string };
  demolish?: string;
  catalog?: { kind: ObjectKind; eq?: Id; name: string; price: string }[];
}

/** Тип помещения в каталоге стройки: наименьший размер и цена за м². */
export interface RoomTypeRow {
  id: Id;
  name: string;
  min: string;
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
  quality: Quality;
  projection: 'persp' | 'ortho';
  tab: Tab | null;
  selected?: { key: string; info: PersonInfo };
  room?: RoomCard;
  notices: { t: number; text: string }[];
  /** вкладка «Пациенты» (spec docs/specs/2026-10-flow-ui.md): строки по фильтру, сколько всего, ушедшие */
  patients: PatientRow[];
  patientsAll: number;
  patientFilter: PatientFilter;
  gone: PatientRow[];
  /** «Путь пациента» выбранного: лента, итог, почему ушёл; `none` — пути нет (пришёл до этой версии) */
  path?: { lines: PathLine[]; summary: string; left?: string } | { none: true };
  /** слои карты: меню открыто; «Очереди и загрузка» включён */
  layers: { open: boolean; queues: boolean };
  staffList: { key: string; text: string }[];
  debug: boolean;
  build: BuildHud;
  roomTypes: RoomTypeRow[];
  /** больница ПК закрыта — почему (пациенты не приходят) */
  closed?: string;
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
  /** панель вида (стены, качество, камера) раскрыта; свёрнутая — одна кнопка */
  viewOpen: boolean;
}

export const initial: Hud = {
  ready: false,
  status: '',
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
  walls: 'cut',
  quality: 'medium',
  projection: 'persp',
  tab: null,
  notices: [],
  patients: [],
  patientsAll: 0,
  patientFilter: { triage: 'all', where: 'all', long: false, gone: false },
  gone: [],
  layers: { open: false, queues: false },
  staffList: [],
  debug: false,
  build: { on: false, moving: false, spent: 0, undo: 0 },
  roomTypes: [],
  fps: 0,
  cpuMs: 0,
  gpuMs: null,
  people: 0,
  version: '',
  viewOpen: false,
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
export interface Actions {
  setSpeed(s: Speed): void;
  untilMorning(): void;
  setWalls(m: WallMode): void;
  setQuality(q: Quality): void;
  setProjection(p: 'persp' | 'ortho'): void;
  overview(): void;
  rotate(steps: number): void;
  select(key: string | undefined): void;
  setTab(t: Tab | null): void;
  toggleDebug(): void;
  bench(uncapped: boolean): void;
  setLang(l: Lang): void;
  /** стройка (spec docs/specs/2026-10-build.md) */
  toggleBuild(): void;
  setTool(t: Tool | undefined): void;
  pickRoomType(id: Id): void;
  pickItem(kind: ObjectKind, eq?: Id): void;
  undo(): void;
  done(): void;
  furnish(room: string): void;
  demolish(room: string): void;
  hire(room: string, role: Id): void;
  dismiss(id: string): void;
  /** начало игры: пустое здание или готовая больница */
  startGame(kind: 'empty' | 'preset'): void;
  /** часть 3 (spec docs/specs/2026-10-flow-ui.md): фильтры «Пациентов», камера к человеку и выбор, слои карты */
  filterPatients(patch: Partial<PatientFilter>): void;
  focus(key: string): void;
  /** «Найти» (spec docs/specs/2026-10-owner-play.md): пациент по номеру в движке — камера к нему и его карточка */
  find(id: string): void;
  toggleLayers(): void;
  toggleQueues(): void;
  /** режим врача (spec docs/specs/2026-10-doctor-mode.md) */
  doctor(a: DoctorAction): void;
  /** касса и планёрка (spec docs/specs/2026-10-economy.md): экран планёрки, автопауза, часы приёма, кредит */
  money(a: MoneyAction): void;
  /** подсказки первых минут и панель вида (spec docs/specs/2026-10-aaa-polish.md) */
  dismissHint(): void;
  toggleView(): void;
}

export function useHud(store: Store): Hud {
  return useSyncExternalStore(store.subscribe, store.get);
}
