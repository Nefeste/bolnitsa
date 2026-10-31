// Демо для Next Fest (spec docs/specs/2026-11-demo.md): ключ `?demo=1` (у Electron `--demo`), окно «Итог» после первой
// планёрки сценария и снимок больницы. Здесь — чистая часть: что показать в «Итоге» (числа — из планёрки, стройки и часов
// окна, слова — при отрисовке, src/ui/Demo.tsx) и имя файла снимка. Без DOM: проверяет tools/test/demo.test.ts.
import type { DaySummary } from '../engine/shift/types';

/**
 * Номер приложения Steam: открывает страницу игры в клиенте Steam (`steam://store/<номер>`). Страницы ещё нет (путь к 1.0,
 * этап В; имя и марка — №85, Steamworks — №82): пусто — кнопки «В список желаемого» в «Итоге» нет.
 */
export const STEAM_APP_ID = '';

/** Адрес страницы игры для клиента Steam; номера нет — нет и адреса. */
export function wishlistUrl(id = STEAM_APP_ID): string | null {
  return /^\d+$/.test(id) ? `steam://store/${id}` : null;
}

/** Помещение в «Итоге»: тип, сколько таких построено. */
export interface BuiltRow {
  type: string;
  n: number;
}

/** «Итог» демо: что построено, больные за сутки, ваши приёмы, касса, сколько вы играете. */
export interface DemoResult {
  /** сутки, которые подвела планёрка */
  day: number;
  /** помещения: сначала по порядку стройки сценария, потом остальные по первому появлению */
  built: BuiltRow[];
  arrived: number;
  seen: number;
  left: number;
  /**
   * ушло больше, чем принято, а нанятые врачи не приняли никого — врач здесь вы один: «Итог» советует ещё кабинет врача с
   * терапевтом, как «почему?» на планёрке (spec docs/specs/2026-11-demo.md, проход по снимкам 2)
   */
  hire: boolean;
  /** ваши приёмы за сутки и из них верных */
  own: number;
  right: number;
  cash: number | null;
  /** сколько вы играете — настоящих секунд с «Начать» */
  played: number;
}

/**
 * «Итог» из планёрки (`summary` — итог суток), построенных помещений (`rooms` — типы по порядку стройки) и порядка стройки
 * сценария (`guide`); `played` — настоящих секунд игры.
 */
export function demoResult(summary: DaySummary, rooms: readonly string[], guide: readonly string[], played: number): DemoResult {
  const count = new Map<string, number>();
  for (const t of rooms) count.set(t, (count.get(t) ?? 0) + 1);
  const order = [...guide.filter(t => count.has(t)), ...[...count.keys()].filter(t => !guide.includes(t))];
  return {
    day: summary.day,
    built: order.map(type => ({ type, n: count.get(type)! })),
    arrived: summary.arrived,
    seen: summary.seen,
    left: summary.left,
    hire: summary.left > summary.seen && Object.values(summary.colleagues ?? {}).every(c => c.seen === 0),
    own: summary.correct + summary.partly + summary.wrong,
    right: summary.correct,
    cash: summary.economy?.cash ?? null,
    played: Math.max(0, Math.round(played)),
  };
}

/** Имя файла снимка: `snapshot-2026-10-30T18-04-05.png` — время по часам компьютера, только латиница, цифры и дефис. */
export function snapshotName(at: Date): string {
  return `snapshot-${at.toISOString().slice(0, 19).replace(/:/g, '-')}.png`;
}
