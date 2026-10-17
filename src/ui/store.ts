// Хранилище панелей (spec docs/specs/2026-10-shell-3d.md, «Панели»): игра пишет сюда не чаще 10 раз в секунду, панели
// читают через `useSyncExternalStore`. Снимок неизменяемый: каждое `set` — новый объект.
import { useSyncExternalStore } from 'react';
import type { Lang } from '../i18n';
import type { PersonInfo } from '../render/population';
import type { Quality } from '../render/view';
import type { WallMode } from '../render/world';

export type Speed = 0 | 1 | 2 | 4;
export type Tab = 'patients' | 'staff' | 'asks' | 'journal' | 'reports' | 'goals';

export interface RoomCard {
  room: number;
  name: string;
  id: string;
  staff: string[];
  people: number;
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
  patients: { key: string; text: string; triage: string }[];
  staffList: { key: string; text: string }[];
  debug: boolean;
  fps: number;
  cpuMs: number;
  gpuMs: number | null;
  people: number;
  version: string;
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
  staffList: [],
  debug: false,
  fps: 0,
  cpuMs: 0,
  gpuMs: null,
  people: 0,
  version: '',
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
}

export function useHud(store: Store): Hud {
  return useSyncExternalStore(store.subscribe, store.get);
}
