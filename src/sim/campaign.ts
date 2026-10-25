// Ход сценария для окна (spec docs/specs/2026-10-scenario-1.md, часть 2): пришедшие письма, цели с ходом, конец и отметки окна
// — поток расчёта собирает их из состояния движка и шлёт окну, когда они изменились. Цели окно само не считает: итоги суток —
// в движке. Ход целей — по закрытым суткам, как их считает планёрка; «помещение работает» — по больнице сейчас.
import type { ContentDb, Id } from '../content/types';
import { missionProgress, scenarioOf } from '../engine/campaign/campaign';
import type { ShiftState } from '../engine/shift/types';

export interface GoalView {
  id: string;
  main: boolean;
  value: number;
  target: number;
  /** у «принять N» — точность, % */
  accuracy?: number;
  done: boolean;
}

export interface ScenarioView {
  id: Id;
  /** пришедшие письма — по порядку прихода; день, прочитано ли */
  letters: { id: string; day: number; read?: boolean }[];
  goals: GoalView[];
  /** сутки, когда выполнены все основные цели */
  complete?: number;
  /** «Без обучения» */
  off?: true;
  /** закрытые подсказки первых минут */
  hints: string[];
  /** показанные подсказки в карте */
  tips: Id[];
}

/** Вид хода сценария; не сценарий — нет. */
export function scenarioView(db: ContentDb, s: ShiftState): ScenarioView | undefined {
  const c = s.campaign;
  const sc = scenarioOf(db, c);
  if (!c || !sc) return undefined;
  const v = { campaign: c, history: s.history, hospital: s.hospital, staff: s.staff };
  return {
    id: sc.id,
    letters: c.letters.map(l => ({ ...l })),
    goals: sc.missions.map(m => {
      const p = missionProgress(db, v, m);
      return { id: m.id, main: m.main, value: p.value, target: p.target, ...(p.accuracy !== undefined ? { accuracy: p.accuracy } : {}), done: p.done };
    }),
    ...(c.complete !== undefined ? { complete: c.complete } : {}),
    ...(c.tips?.off ? { off: true as const } : {}),
    hints: [...(c.hints ?? [])],
    tips: [...(c.tips?.shown ?? [])],
  };
}

/**
 * Когда вид пересчитывать: ход сценария, число закрытых суток, больница или штат стали другими. Цели «помещение работает»
 * считают план больницы — не каждый кадр, а когда что-то из этого изменилось.
 */
export function scenarioKey(s: ShiftState): unknown[] {
  return [JSON.stringify(s.campaign ?? null), s.history.length, s.hospital, s.staff];
}
