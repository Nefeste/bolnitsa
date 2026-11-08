// Рекорды испытаний (spec docs/specs/2026-11-challenges.md, часть 2): лучший итог каждого испытания — в хранилище страницы, как
// рекорды смены врача (`records.ts`): они про игрока, а не про больницу. Лучший — по оценке, при равной — по числу итога: у
// доли не принятых — меньше, у остальных — больше. Пройдено ли — помнят отдельно: пройдено однажды — пройдено. Чисто:
// хранилище передают, без него — в памяти сеанса.
import type { Challenge } from '../content/types';
import type { Grade } from '../engine/med/score';

export interface ChallengeRecord {
  grade: Grade;
  /** число итога: доля не принятых, %; принятые; касса, ₽; балл смены врача */
  value: number;
  /** пройдено хоть раз */
  passed: boolean;
  /** день по часам компьютера: `2026-11-08` */
  day: string;
}

export type ChallengeRecords = Record<string, ChallengeRecord>;

const KEY = 'bolnitsa.challenges';
const GRADES: readonly Grade[] = ['A', 'B', 'C', 'D'];
const RANK: Record<Grade, number> = { A: 3, B: 2, C: 1, D: 0 };

/** Рекорды из строки хранилища: чужое и испорченное — прочь. */
export function parseChallenges(raw: string | null | undefined): ChallengeRecords {
  let v: unknown;
  try {
    v = raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
  const out: ChallengeRecords = {};
  if (!v || typeof v !== 'object') return out;
  for (const [k, r] of Object.entries(v as Record<string, unknown>)) {
    const x = r as Partial<ChallengeRecord>;
    if (!k.startsWith('challenge.') || !x || !GRADES.includes(x.grade as Grade) || typeof x.value !== 'number' || !Number.isFinite(x.value)) continue;
    if (typeof x.passed !== 'boolean' || typeof x.day !== 'string') continue;
    out[k] = { grade: x.grade as Grade, value: x.value, passed: x.passed, day: x.day };
  }
  return out;
}

/** Лучше ли итог прежнего: по оценке, при равной — по числу итога, в его сторону. */
export function betterChallenge(c: Pick<Challenge, 'grade'>, r: Pick<ChallengeRecord, 'grade' | 'value'>, prev?: Pick<ChallengeRecord, 'grade' | 'value'>): boolean {
  if (!prev) return true;
  if (RANK[r.grade] !== RANK[prev.grade]) return RANK[r.grade] > RANK[prev.grade];
  return c.grade.by === 'unseen' ? r.value < prev.value : r.value > prev.value;
}

/** Записать итог: новый лучший заменяет прежний, «пройдено» не забывается; что было до него — для окна «Итог испытания». */
export function recordChallenge(records: ChallengeRecords, c: Challenge, r: ChallengeRecord): { records: ChallengeRecords; best: boolean; prev?: ChallengeRecord } {
  const prev = records[c.id];
  const passed = r.passed || prev?.passed === true;
  if (!betterChallenge(c, r, prev)) return { records: prev && passed !== prev.passed ? { ...records, [c.id]: { ...prev, passed } } : records, best: false, ...(prev ? { prev } : {}) };
  return { records: { ...records, [c.id]: { ...r, passed } }, best: true, ...(prev ? { prev } : {}) };
}

/** Хранилище страницы, если оно есть и доступно. */
function storage(): Pick<Storage, 'getItem' | 'setItem'> | undefined {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : undefined;
  } catch {
    return undefined;
  }
}

export function readChallenges(store = storage()): ChallengeRecords {
  try {
    return parseChallenges(store?.getItem(KEY));
  } catch {
    return {};
  }
}

/** Записать; не вышло — рекорд живёт до конца сеанса. */
export function writeChallenges(r: ChallengeRecords, store = storage()): void {
  try {
    store?.setItem(KEY, JSON.stringify(r));
  } catch {
    // хранилище недоступно или полно
  }
}
