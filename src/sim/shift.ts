// из anamnez: src/state/single.ts @ bed1996, изменено: итог смены врача на ПК (spec docs/specs/2026-11-doctor-shift.md) —
// пришедшие — за сутки потока до сих пор (`s.summary`: смена — с 08:00 тех же суток), ваши приёмы — в состоянии, как там
// (`evict` их не трогает: их разбор открывают); без недели сценария и испытаний «Анамнеза». Считает расчётный поток: окно
// правды не видит.
//
// «Смена» (spec 2026-09-campaign, часть 14): итог одного дня в выбранной больнице — оценки по
// категориям (точность, обоснованность, бережливость, безопасность, скорость) и общая.
//
// Точность смены — доля верных диагнозов (почти верный — за половину). Скорость — минуты врача
// на приём: у разумного врача в практике около 23, у ждущего результаты в кабинете — около 40.
// Остальное — средняя оценка приёмов. Общая — средняя с весами (диагноз — главное), но не выше
// точности и не больше чем на ступень выше худшей категории: быстрый врач с неверными
// диагнозами хорошей смены не делает. Проверено на стратегиях «виртуального врача»: разумный —
// A, ждущий результаты в кабинете — B, ленивый и «всё подряд» — C, «всем один диагноз» — D.
import type { ContentDb } from '../content/types';
import type { Grade } from '../engine/med/score';
import type { ShiftPatient, ShiftState } from '../engine/shift/types';

/**
 * Конец смены врача (spec docs/specs/2026-11-doctor-shift.md, решение агента 1): конец дневной смены первых суток — 20:00 по
 * `content/hospital/economy.yaml` (`staff.shifts.day`), секунды от начала первых суток.
 */
export const shiftEndOf = (db: ContentDb): number => (db.economy.staff.shifts?.day[1] ?? 20) * 3600;

/** Смена кончилась — окну: итог (никого не приняли — нет), сколько пришли и сколько ушли, не дождавшись. */
export interface ShiftEnd {
  result?: ShiftResult;
  arrived: number;
  left: number;
}

/** Итог в конце смены: досчитан тем же счётом, что `shiftResult`. */
export function shiftEnd(s: ShiftState): ShiftEnd {
  const result = shiftResult(s);
  return { ...(result ? { result } : {}), arrived: s.summary.arrived, left: s.summary.left };
}

/** Скорость: не дольше стольких минут на приём — A, B, C; дольше — D. */
export const SPEED_MINUTES: readonly [number, number, number] = [25, 40, 60];
/** Точность: доля верных не меньше стольких процентов — A, B, C; меньше — D. */
export const ACCURACY_SHARE: readonly [number, number, number] = [85, 70, 50];

export type ShiftCategory = 'accuracy' | 'defensibility' | 'thrift' | 'safety' | 'speed';
export const SHIFT_CATEGORIES: readonly ShiftCategory[] = ['accuracy', 'defensibility', 'thrift', 'safety', 'speed'];

export const POINTS: Record<Grade, number> = { A: 3, B: 2, C: 1, D: 0 };
const GRADE_OF_POINTS: Grade[] = ['D', 'C', 'B', 'A'];
const gradeOf = (mean: number): Grade => (mean >= 2.5 ? 'A' : mean >= 1.75 ? 'B' : mean >= 1 ? 'C' : 'D');
const byScale = (x: number, [a, b, c]: readonly [number, number, number], lower: boolean): Grade =>
  (lower ? (x <= a ? 'A' : x <= b ? 'B' : x <= c ? 'C' : 'D') : x >= a ? 'A' : x >= b ? 'B' : x >= c ? 'C' : 'D');
/** Веса категорий в общей: диагноз — главное. */
const WEIGHTS: Record<ShiftCategory, number> = { accuracy: 3, defensibility: 2, safety: 2, thrift: 1, speed: 1 };

export interface ShiftResult {
  seen: number;
  arrived: number;
  /** минут врача на приём в среднем */
  minutes: number;
  /** доля верных диагнозов, % (почти — за половину) */
  correct: number;
  grades: Record<ShiftCategory, Grade>;
  overall: Grade;
  /** средняя с весами, 0–3 — вторая мерка лучшего результата после общей оценки */
  points: number;
}

/** Ваши закрытые приёмы — приёмы нанятых врачей не в счёт. */
export const ownCases = (s: ShiftState): ShiftPatient[] => Object.values(s.patients).filter(p => p.closed && !p.closed.by);

/** Итог смены по закрытым приёмам; никого не приняли — итога нет. */
export function shiftResult(s: ShiftState): ShiftResult | undefined {
  const cases = ownCases(s);
  if (cases.length === 0) return undefined;
  const mean = (k: 'defensibility' | 'thrift' | 'safety') => cases.reduce((a, p) => a + POINTS[p.closed!.grades[k]], 0) / cases.length;
  const correct = Math.round((100 * cases.reduce((a, p) => a + (p.closed!.verdict === 'correct' ? 1 : p.closed!.verdict === 'partly' ? 0.5 : 0), 0)) / cases.length);
  const minutes = Math.round(cases.reduce((a, p) => a + p.spent.seconds, 0) / cases.length / 60);
  const grades: Record<ShiftCategory, Grade> = {
    accuracy: byScale(correct, ACCURACY_SHARE, false),
    defensibility: gradeOf(mean('defensibility')),
    thrift: gradeOf(mean('thrift')),
    safety: gradeOf(mean('safety')),
    speed: byScale(minutes, SPEED_MINUTES, true),
  };
  const means: Record<ShiftCategory, number> = {
    accuracy: POINTS[grades.accuracy], defensibility: mean('defensibility'), thrift: mean('thrift'), safety: mean('safety'), speed: POINTS[grades.speed],
  };
  const points = SHIFT_CATEGORIES.reduce((a, k) => a + WEIGHTS[k] * means[k], 0) / SHIFT_CATEGORIES.reduce((a, k) => a + WEIGHTS[k], 0);
  const worst = Math.min(...SHIFT_CATEGORIES.map(k => POINTS[grades[k]]));
  const overall = GRADE_OF_POINTS[Math.min(POINTS[gradeOf(points)], POINTS[grades.accuracy], worst + 1)];
  return { seen: cases.length, arrived: s.summary.arrived, minutes, correct, grades, overall, points: Math.round(points * 100) / 100 };
}
