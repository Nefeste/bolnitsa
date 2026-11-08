// Итоги случая дня (spec docs/specs/2026-11-doctor-shift.md, часть 3; как профиль «Анамнеза», `recordDaily`): по дню —
// первая попытка: вердикт, общая оценка разбора и номер базы, на которой играли; переиграть можно, итог дня — тот же.
// Хранятся в хранилище страницы, как рекорды смены (`records.ts`): они про игрока, а не про больницу. Чисто: хранилище
// передают, без него — в памяти сеанса. Серии дней нет: пропущенный день ничего не отнимает (устав, «Без давления»).
import type { Grade } from '../engine/med/score';
import { DAILY_DAYS, dailyDays, isDay } from '../sim/days';

export interface DailyRecord {
  verdict: 'correct' | 'partly' | 'wrong';
  grade: Grade;
  /** номер базы: больной дня — от даты и его */
  base: number;
}

export type DailyRecords = Record<string, DailyRecord>;

const KEY = 'bolnitsa.daily';
const GRADES: readonly Grade[] = ['A', 'B', 'C', 'D'];
const VERDICTS: readonly DailyRecord['verdict'][] = ['correct', 'partly', 'wrong'];
/** Сколько дней хранить: вдвое больше списка — ушедшие из списка дни не нужны. */
const KEEP = DAILY_DAYS * 2;

/** Итоги из строки хранилища: чужое и испорченное — прочь. */
export function parseDaily(raw: string | null | undefined): DailyRecords {
  let v: unknown;
  try {
    v = raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
  const out: DailyRecords = {};
  if (!v || typeof v !== 'object') return out;
  for (const [day, r] of Object.entries(v as Record<string, unknown>)) {
    const x = r as Partial<DailyRecord>;
    if (!isDay(day) || !x || !VERDICTS.includes(x.verdict!) || !GRADES.includes(x.grade!) || typeof x.base !== 'number') continue;
    out[day] = { verdict: x.verdict!, grade: x.grade!, base: x.base };
  }
  return out;
}

/** Записать итог дня: засчитывается первая попытка — у сыгранного дня итог тот же; дней — не больше `KEEP`, последние. */
export function recordDaily(records: DailyRecords, day: string, r: DailyRecord): { records: DailyRecords; first: boolean } {
  if (records[day]) return { records, first: false };
  const days = [day, ...Object.keys(records)].sort().reverse().slice(0, KEEP);
  const all: DailyRecords = { ...records, [day]: r };
  return { records: Object.fromEntries(days.map(d => [d, all[d]])), first: true };
}

/** Строка списка дней: день, итог первой попытки — если сыгран. */
export interface DailyRow {
  day: string;
  record?: DailyRecord;
}

/** Список последних дней — сегодня первым, с итогами сыгранных. */
export function dailyRows(today: Date, records: DailyRecords): DailyRow[] {
  return dailyDays(today).map(day => ({ day, ...(records[day] ? { record: records[day] } : {}) }));
}

/** Хранилище страницы, если оно есть и доступно. */
function storage(): Pick<Storage, 'getItem' | 'setItem'> | undefined {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : undefined;
  } catch {
    return undefined;
  }
}

export function readDaily(store = storage()): DailyRecords {
  try {
    return parseDaily(store?.getItem(KEY));
  } catch {
    return {};
  }
}

/** Записать; не вышло — итог живёт до конца сеанса. */
export function writeDaily(r: DailyRecords, store = storage()): void {
  try {
    store?.setItem(KEY, JSON.stringify(r));
  } catch {
    // хранилище недоступно или полно
  }
}
