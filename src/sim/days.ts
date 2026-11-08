// Дни случая дня (spec docs/specs/2026-11-doctor-shift.md, часть 3; из anamnez: src/state/daily.ts @ bed1996 — день, зерно,
// время года, последние дни): чистые функции без движка — их берут и поток расчёта (подбор, src/sim/daily.ts), и окно
// (список дней на экране начала, src/app/daily.ts). День — по часам компьютера, это не движок.
import type { Season } from '../content/types';
import { fnv1a } from '../engine/core/hash';

/** Сколько последних дней можно сыграть. */
export const DAILY_DAYS = 30;

const two = (n: number) => String(n).padStart(2, '0');

/** День по часам компьютера: 2026-11-08. */
export function dayOf(d: Date): string {
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

/** День верного вида: ГГГГ-ММ-ДД. */
export const isDay = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x);

/** Зерно дня: дата и номер базы — у всех с той же базой больной тот же. */
export const dailySeed = (day: string, base: number) => fnv1a(`daily:${day.replace(/-/g, '')}:${base}`);

/** Время года дня — для больного: зимой больше гриппа. */
export function seasonOfDay(day: string): Season {
  const m = Number(day.slice(5, 7)) - 1;
  return m === 11 || m <= 1 ? 'winter' : m <= 4 ? 'spring' : m <= 7 ? 'summer' : 'autumn';
}

/** Последние дни — сегодня первым. */
export function dailyDays(today: Date, n = DAILY_DAYS): string[] {
  return Array.from({ length: n }, (_, i) => dayOf(new Date(today.getFullYear(), today.getMonth(), today.getDate() - i)));
}
