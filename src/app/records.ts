// Рекорды смены врача (spec docs/specs/2026-11-doctor-shift.md, часть 2; решение агента 7): лучший итог по больнице и
// уровню «Управления» — в хранилище страницы, как настройки (`settings.ts`), не в сохранениях: они про игрока. Лучший — по
// баллу, при равном — кто принял больше (как «Смена» «Анамнеза»). Чисто: хранилище передают, без него — в памяти сеанса.
import type { Manage } from '../content/types';
import type { Grade } from '../engine/med/score';

/** Больница смены: готовые поликлиника и городская (решение агента 2). */
export type ShiftHospital = 'poly' | 'preset';

export interface ShiftRecord {
  grade: Grade;
  /** балл итога, 0–3 */
  points: number;
  seen: number;
  arrived: number;
  /** день по часам компьютера: `2026-11-08` */
  day: string;
}

export type Records = Record<string, ShiftRecord>;

const KEY = 'bolnitsa.records';
const GRADES: readonly Grade[] = ['A', 'B', 'C', 'D'];

/** Ключ рекорда: больница и уровень. */
export const recordKey = (hospital: ShiftHospital, manage: Manage): string => `${hospital}:${manage}`;

/** Рекорды из строки хранилища: чужое и испорченное — прочь. */
export function parseRecords(raw: string | null | undefined): Records {
  let v: unknown;
  try {
    v = raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
  const out: Records = {};
  if (!v || typeof v !== 'object') return out;
  for (const [k, r] of Object.entries(v as Record<string, unknown>)) {
    const x = r as Partial<ShiftRecord>;
    const num = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0;
    if (!x || !GRADES.includes(x.grade as Grade) || !num(x.points) || !num(x.seen) || !num(x.arrived) || typeof x.day !== 'string') continue;
    out[k] = { grade: x.grade as Grade, points: x.points!, seen: x.seen!, arrived: x.arrived!, day: x.day };
  }
  return out;
}

/** Лучше ли итог прежнего: по баллу, при равном — кто принял больше. */
export const better = (r: Pick<ShiftRecord, 'points' | 'seen'>, prev?: Pick<ShiftRecord, 'points' | 'seen'>): boolean =>
  !prev || r.points > prev.points || (r.points === prev.points && r.seen > prev.seen);

/** Записать итог смены: новый лучший — заменяет прежний; что было до него — для окна «Итог смены». */
export function recordShift(records: Records, key: string, r: ShiftRecord): { records: Records; best: boolean; prev?: ShiftRecord } {
  const prev = records[key];
  if (!better(r, prev)) return { records, best: false, ...(prev ? { prev } : {}) };
  return { records: { ...records, [key]: r }, best: true, ...(prev ? { prev } : {}) };
}

/** Хранилище страницы, если оно есть и доступно. */
function storage(): Pick<Storage, 'getItem' | 'setItem'> | undefined {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : undefined;
  } catch {
    return undefined;
  }
}

export function readRecords(store = storage()): Records {
  try {
    return parseRecords(store?.getItem(KEY));
  } catch {
    return {};
  }
}

/** Записать; не вышло — рекорд живёт до конца сеанса. */
export function writeRecords(r: Records, store = storage()): void {
  try {
    store?.setItem(KEY, JSON.stringify(r));
  } catch {
    // хранилище недоступно или полно
  }
}

/** День по часам компьютера: `2026-11-08` (окно, не движок). */
export function today(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
