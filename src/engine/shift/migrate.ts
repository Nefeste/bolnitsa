// Сохранение — снимок с версией схемы и миграциями (spec docs/specs/2026-10-saves.md; устав, ADR студии 0004): номер
// схемы файла и цепочка шагов со старого номера на новый. Номер растёт, когда старое уже не читается как есть; новое
// необязательное поле его не меняет — движок читает отсутствие поля. Каждый новый номер — шаг здесь и образец сохранения
// в tools/test/fixtures/saves/.
import type { ShiftState } from './types';

/** Номер схемы сохранения. */
export const SAVE_SCHEMA = 2;

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

/** Человек штата в сыром снимке — сколько нужно миграции. */
interface RawStaff {
  id: string;
  role: string;
  room?: string;
  shift?: 'day' | 'night';
}

/** FNV-1a строки — облик добавленного миграцией человека: тот же снимок — тот же человек. */
function fnv(x: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < x.length; i++) h = Math.imul(h ^ x.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

/**
 * 1 → 2, версия 0.17.0 (spec docs/specs/2026-10-orderlies.md, «Санитар»): в больнице ПК со штатом по сменам — санитар в каждой
 * смотровой приёмного и операционной, по одному в каждую смену, где его там нет (ночная — если в больнице есть ночная смена):
 * навык 3 и зарплата каталога 0.17.0 — 1 150 ₽, номер — следующий номер найма, облик — из номера.
 */
function orderlies(state: Record<string, unknown>): Record<string, unknown> {
  const rooms = (state.hospital as { site?: { rooms?: { id: string; type: string }[] } } | undefined)?.site?.rooms;
  const staff = state.staff as RawStaff[] | undefined;
  if (!state.flow || !rooms || !staff?.some(m => m.shift !== undefined)) return state;
  const shifts: ('day' | 'night')[] = staff.some(m => m.shift === 'night') ? ['day', 'night'] : ['day'];
  let n = typeof state.nextStaff === 'number' ? state.nextStaff : 1;
  const add: Record<string, unknown>[] = [];
  for (const r of rooms) {
    if (r.type !== 'room.emergency' && r.type !== 'room.or') continue;
    for (const shift of shifts) {
      if (staff.some(m => m.room === r.id && m.role === 'role.orderly' && m.shift === shift)) continue;
      const id = `s${n++}`;
      add.push({ id, role: 'role.orderly', sex: fnv(`sex:${id}`) % 2 ? 'f' : 'm', seed: fnv(`orderly:${id}`), skill: 3, salary: 1150, room: r.id, days: 0, shift });
    }
  }
  return add.length > 0 ? { ...state, staff: [...staff, ...add], nextStaff: n } : state;
}

/** Шаги миграции: со схемы N на N + 1, над сырым снимком старого формата. */
const STEPS: Record<number, (state: Record<string, unknown>) => Record<string, unknown>> = { 1: orderlies };

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
