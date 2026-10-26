// Ось «Управление» (spec docs/specs/2026-10-difficulty.md; геймдизайн §10; решения владельца 26.10.2026, #135–#137) — своё
// «Больницы», поток для ПК: «Спокойно», «Обычно», «Трудно». «Обычно» — числа базы как есть; у других уровней — множители к
// ним и свои предел минуса и касса начала (content/hospital/difficulty.yaml). Уровень — `meta.manage`, нет — «Обычно»: так
// играли до него. Менять его можно в любой момент (#136): новое действует с этой минуты. В сменах «Анамнеза» — всегда
// «Обычно».
import type { ContentDb, Manage, ManageLevel } from '../../content/types';
import type { ShiftState } from './types';

/** Числа уровня: «Обычно» — множители 100 %, предел минуса money.yaml (нет — без предела), бюджет «обычный». */
export function levelOf(db: ContentDb, manage: Manage | undefined): Omit<ManageLevel, 'overdraft'> & { overdraft?: number } {
  const l = manage && manage !== 'normal' ? db.manage?.[manage] : undefined;
  if (l) return l;
  return { inflow: 100, patience: 100, salary: 100, breakdown: 100, ...(db.money ? { overdraft: db.money.overdraft } : {}), budget: 'normal' };
}

/** Числа уровня смены: только в потоке для ПК; в сменах «Анамнеза» — «Обычно». */
export const manageOf = (db: ContentDb, s: ShiftState) => levelOf(db, s.flow ? s.meta.manage : undefined);

/** `n` × `pct` %: при 100 — то же число, байт в байт, без округлений. */
export const scaled = (n: number, pct: number): number => (pct === 100 ? n : (n * pct) / 100);

/** То же, до целого: ₽, секунды. */
export const scaledInt = (n: number, pct: number): number => (pct === 100 ? n : Math.round((n * pct) / 100));
