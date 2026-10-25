// Настройки игрока (spec docs/specs/2026-10-settings.md; решение владельца #70): вид — стены и камера, качество — «авто» или
// своё, «Отладка». Хранятся на этом компьютере — в хранилище страницы, в Electron тоже, — а не в сохранении игры: это
// настройки игрока, а не больницы. Чистые функции и выбор качества по времени кадра — их проверяют тесты
// (tools/test/settings.test.ts).
import type { Projection, Quality } from '../render/view';
import type { WallMode } from '../render/world';

/** Качество: «авто» — по первым секундам игры, или своё. */
export type QualityMode = 'auto' | Quality;

export interface Settings {
  walls: WallMode;
  projection: Projection;
  quality: QualityMode;
  debug: boolean;
}

/** По умолчанию — вид владельца: стены вниз (решение #70), перспектива; качество — «авто». */
export const DEFAULT_SETTINGS: Settings = { walls: 'down', projection: 'persp', quality: 'auto', debug: false };

const KEY = 'bolnitsa.settings';
const WALLS: readonly WallMode[] = ['full', 'cut', 'down'];
const PROJECTIONS: readonly Projection[] = ['persp', 'ortho'];
const QUALITIES: readonly QualityMode[] = ['auto', 'low', 'medium', 'high'];

/** Настройки из строки хранилища: чего нет или не то — по умолчанию; испорченная строка — все по умолчанию. */
export function parseSettings(raw: string | null | undefined): Settings {
  let x: Partial<Record<keyof Settings, unknown>> = {};
  try {
    const v: unknown = raw ? JSON.parse(raw) : {};
    if (v && typeof v === 'object') x = v as typeof x;
  } catch {
    x = {};
  }
  const pick = <T>(list: readonly T[], v: unknown, def: T): T => list.find(y => y === v) ?? def;
  return {
    walls: pick(WALLS, x.walls, DEFAULT_SETTINGS.walls),
    projection: pick(PROJECTIONS, x.projection, DEFAULT_SETTINGS.projection),
    quality: pick(QUALITIES, x.quality, DEFAULT_SETTINGS.quality),
    debug: x.debug === true,
  };
}

/** Хранилище страницы, если оно есть и доступно (в закрытом окне браузера его может не быть). */
function storage(): Pick<Storage, 'getItem' | 'setItem'> | undefined {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : undefined;
  } catch {
    return undefined;
  }
}

export function readSettings(store = storage()): Settings {
  try {
    return parseSettings(store?.getItem(KEY));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** Записать; не вышло — игра идёт с ними до конца сеанса. */
export function writeSettings(s: Settings, store = storage()): void {
  try {
    store?.setItem(KEY, JSON.stringify(s));
  } catch {
    // хранилище недоступно или полно — настройки живут до конца сеанса
  }
}

/**
 * «Авто»: начать с высокого и смотреть на интервал кадра. Разогрев — `warm` кадров или `warmMs` мс, что раньше (сборка
 * шейдеров, первые слои), — не в счёт; затем медиана `frames` кадров или `framesMs` мс, но не меньше `least` кадров: на
 * слабом компьютере кадр долгий, и ждать сотню кадров на каждой ступени — минуты. Медиана дольше `slow` мс — кадров меньше
 * 45 в секунду: ступенью ниже, разогреться и смотреть снова; на низком — остаться.
 */
export const AUTO = { warm: 60, warmMs: 2000, frames: 90, framesMs: 3000, least: 10, slow: 22 } as const;

export class AutoQuality {
  quality: Quality = 'high';
  done = false;
  private warming = true;
  private seen = 0;
  private spent = 0;
  private xs: number[] = [];

  /** Интервал кадра, мс. Вернуть качество — когда пора сменить ступень. */
  push(ms: number): Quality | undefined {
    if (this.done) return undefined;
    this.spent += ms;
    if (this.warming) {
      this.seen++;
      if (this.seen >= AUTO.warm || this.spent >= AUTO.warmMs) {
        this.warming = false;
        this.spent = 0;
      }
      return undefined;
    }
    this.xs.push(ms);
    if (this.xs.length < AUTO.frames && (this.spent < AUTO.framesMs || this.xs.length < AUTO.least)) return undefined;
    const sorted = [...this.xs].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    this.xs = [];
    this.spent = 0;
    this.seen = 0;
    this.warming = true;
    if (median <= AUTO.slow || this.quality === 'low') {
      this.done = true;
      return undefined;
    }
    this.quality = this.quality === 'high' ? 'medium' : 'low';
    return this.quality;
  }
}
