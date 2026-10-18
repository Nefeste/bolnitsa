// Сохранение — снимок с версией схемы и миграциями (spec docs/specs/2026-10-saves.md; устав, ADR студии 0004): номер
// схемы файла и цепочка шагов со старого номера на новый. Номер растёт, когда старое уже не читается как есть; новое
// необязательное поле его не меняет — движок читает отсутствие поля. Каждый новый номер — шаг здесь и образец сохранения
// в tools/test/fixtures/saves/.
import type { ShiftState } from './types';

/** Номер схемы сохранения. */
export const SAVE_SCHEMA = 1;

/** Почему сохранение не открыть: записано более новой версией игры; испорчено или не сохранение вовсе. */
export type SaveProblem = 'newer' | 'broken';

export class SaveError extends Error {
  constructor(
    readonly problem: SaveProblem,
    message: string,
  ) {
    super(message);
  }
}

/** Шаги миграции: со схемы N на N + 1, над сырым снимком старого формата. Пока ни одного: схема 1 — первая. */
const STEPS: Record<number, (state: Record<string, unknown>) => Record<string, unknown>> = {};

/** Снимок схемы `schema` — в нынешний формат: шаги по очереди. Новее нынешней или не снимок — ошибка, ничего не меняется. */
export function migrate(schema: unknown, state: unknown): ShiftState {
  if (typeof schema !== 'number' || !Number.isInteger(schema) || schema < 1) throw new SaveError('broken', `schema: ${String(schema)}`);
  if (schema > SAVE_SCHEMA) throw new SaveError('newer', `schema ${schema} > ${SAVE_SCHEMA}`);
  if (!looksLikeState(state)) throw new SaveError('broken', 'not a shift state');
  let s = state as Record<string, unknown>;
  for (let v = schema; v < SAVE_SCHEMA; v++) {
    const step = STEPS[v];
    if (!step) throw new SaveError('broken', `no migration ${v} → ${v + 1}`);
    s = step(s);
  }
  return s as unknown as ShiftState;
}

/** Похоже ли на снимок движка: часы, сутки, пациенты, очередь событий на месте. */
function looksLikeState(x: unknown): boolean {
  const s = x as Partial<ShiftState> | null;
  return !!s && typeof s === 'object' && typeof s.t === 'number' && typeof s.day === 'number' && !!s.meta && !!s.patients && typeof s.patients === 'object' && Array.isArray(s.events);
}
