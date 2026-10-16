// Смены для тестов ускорения (spec docs/specs/2026-10-engine-speed.md): готовые больницы базы с нанятыми врачами —
// городская (терапевт и три специалиста, скорая) — и больница бенчмарка на несколько кабинетов. Игрока нет:
// время идёт само, больных ведут нанятые врачи.
import type { ContentDb } from '../../src/content/types';
import { apply, newSingle, SANDBOX_VENUE } from '../../src/engine/shift/engine';
import { DAY, type ShiftPatient, type ShiftState } from '../../src/engine/shift/types';
import { hospitalFor } from '../bench/hospital';

export type Venue = 'preset.city' | 'bench.4';

export function startShift(db: ContentDb, venue: Venue, seed: number): ShiftState {
  if (venue === 'bench.4') {
    const l = hospitalFor(db, 4);
    return newSingle(db, { seed, season: 'winter', venue: SANDBOX_VENUE, hospital: l.hospital, staff: l.staff });
  }
  return newSingle(db, { seed, season: 'winter', venue });
}

/** Прожить смену минутами до `until` (час дня). */
export function liveUntil(db: ContentDb, s: ShiftState, until: number, step = 60) {
  const end = (s.day - 1) * DAY + until * 3600;
  while (s.t < end) apply(db, s, { kind: 'advance', seconds: Math.min(step, end - s.t) });
}

/** Приёмы нанятых врачей, закрытые к этому часу, — по номеру. */
export function hiredClosed(s: ShiftState): ShiftPatient[] {
  return Object.values(s.patients).filter(p => p.closed?.by !== undefined).sort((a, b) => (a.id < b.id ? -1 : 1));
}

export const hash = (x: unknown) => Bun.hash(JSON.stringify(x)).toString(16);

/** Зёрна и больницы проверки: у каждой — свои. */
export const CASES: { venue: Venue; seed: number }[] = [
  { venue: 'preset.city', seed: 1 },
  { venue: 'preset.city', seed: 2 },
  { venue: 'preset.city', seed: 3 },
  { venue: 'bench.4', seed: 6 },
  { venue: 'bench.4', seed: 4 },
  { venue: 'bench.4', seed: 5 },
];
