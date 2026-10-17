// Сутки целиком в потоке для ПК (spec docs/specs/2026-10-day.md) — своё «Больницы». Чистые расчёты: часы приёма, частота
// прихода по часам суток и когда придёт следующий, окно повторных, час обхода. Движок (engine.ts) берёт их отсюда; в
// сменах «Анамнеза» ничего из этого не участвует.
import type { ContentDb, Day } from '../../content/types';
import { DAY, type Flow, SHIFT_START } from './types';

const HOUR = 3600;

/**
 * Без `hospital/day.yaml` (база тестов; сборка без него не проходит) — ровный поток в часы приёма геймдизайна §2
 * (08:00–20:00), скорая ровно круглые сутки, обход в 09:00.
 */
const FLAT: Day = { hours: [8, 20], walk: Array<number>(24).fill(100), ambulance: Array<number>(24).fill(100), rounds: 9 };

export const dayOf = (db: ContentDb): Day => db.day ?? FLAT;

/** Часы амбулаторного приёма: заданные игроком или базы. */
export const hoursOf = (db: ContentDb, flow: Flow): [number, number] => flow.hours ?? dayOf(db).hours;

/** Часы приёма из команды — целые, `0 ≤ open < close ≤ 24`. */
export const validHours = (open: number, close: number): boolean => Number.isInteger(open) && Number.isInteger(close) && open >= 0 && close <= 24 && open < close;

/** Час суток 0–23. */
export const hourOf = (t: number): number => Math.floor((t % DAY) / HOUR);

/** Сутки больницы по часам: с 08:00 до 08:00 — номер `s.day`, как его растит планёрка. */
export const hospitalDay = (t: number): number => Math.floor((t - SHIFT_START) / DAY) + 1;

/**
 * Когда придёт следующий после `from`, если частота меняется по часам суток (`rate(час)`, человек в час): «работа»
 * показательного промежутка `e` (−ln u) тратится час за часом по частоте этого часа, приход — там, где она кончилась.
 * Подряд идущие часы с одной частотой — один отрезок, поэтому при ровной частоте приход — `from + round(e · 3600 / частота)`,
 * как у прежнего потока, до секунды; в часы с нулевой частотой работа не тратится. Только + − × ÷ (ADR 0004); `e` — из
 * своего `log2`. Ни в один час суток никто не приходит — undefined.
 */
export function arrivalAfter(from: number, e: number, rate: (hour: number) => number): number | undefined {
  const rates: number[] = [];
  for (let h = 0; h < 24; h++) rates.push(rate(h));
  if (!rates.some(x => x > 0)) return undefined;
  let t = from;
  let left = e;
  let first = true;
  for (;;) {
    const h = hourOf(t);
    const x = rates[h];
    let end = t - (t % HOUR) + HOUR;
    for (let k = 1; k < 24 && rates[(h + k) % 24] === x; k++) end += HOUR;
    if (x > 0) {
      const gap = Math.round((left * HOUR) / x);
      // первый — не раньше чем через секунду после предыдущего, как прежде
      const at = t + (first ? Math.max(1, gap) : gap);
      if (at < end) return at;
      left = Math.max(0, left - ((end - t) * x) / HOUR);
    }
    first = false;
    t = end;
  }
}

/**
 * Повторные — «как пришедший сам» (геймдизайн §5): в первые два часа приёма этих суток, как в «Анамнезе» — с 08:00. Сутки —
 * с 08:00: приём, открытый в 08:00, — с 08:00; открывающийся позже — с открытия; ночной, закрытый уже к 08:00, — с открытия
 * в ночь этих суток. `from` — секунды от начала календарного дня суток, `minutes` — в каком окне, включительно.
 */
export function returnWindow(hours: [number, number]): { from: number; minutes: number } {
  const [open, close] = hours;
  const start = SHIFT_START / HOUR;
  const [a, b] = open <= start && close > start ? [start, close] : open >= start ? [open, close] : [open + 24, close + 24];
  return { from: a * HOUR, minutes: Math.min(120, (b - a) * 60 - 1) };
}

/** Обход нанятых врачей — в свой час этих суток: от 08:00 до полуночи — в тот же календарный день, раньше — назавтра. */
export function roundsAt(db: ContentDb): number {
  const h = dayOf(db).rounds;
  return (h * HOUR >= SHIFT_START ? h : h + 24) * HOUR;
}
