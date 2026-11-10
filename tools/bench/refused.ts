// Отказ в госпитализации для проб (tools/bench/infections.ts, tools/bench/levels.ts; spec docs/specs/2026-11-scenario-5.md): больного
// отправили в другую больницу, а по базе ему нужна койка — своя такого вида была вся занята в минуту решения («мест нет»: вид в
// `full` конца пути) или таких у больницы нет («нет своих»). Нужна операция — койка после неё, если операционная работает.
import type { ContentDb, Setting } from '../../src/content/types';
import { recommendedSetting } from '../../src/engine/med/plan';
import { boxBeds, icuBeds, orBlock, ricuBeds, wardBeds } from '../../src/engine/shift/engine';
import type { End, Place } from '../../src/engine/shift/journey';
import type { ShiftPatient, ShiftState } from '../../src/engine/shift/types';

/** Какая койка нужна по месту из базы: палата (и после операции), ПИТ, реанимация, бокс. */
const NEEDS: Partial<Record<Setting, Place>> = { admit: 'ward', surgery: 'ward', icu: 'icu', ricu: 'ricu', box: 'box' };
const BEDS = { ward: wardBeds, icu: icuBeds, ricu: ricuBeds, box: boxBeds };

export function refusalOf(db: ContentDb, s: ShiftState, p: ShiftPatient, e: End): { place: Place; full: boolean } | undefined {
  if (e.how !== 'away' || !p.closed) return undefined;
  const need = recommendedSetting(db, p.patient, p.results.map(r => r.exam), p.closed.bedside, p.closed.rooms);
  const place = NEEDS[need];
  if (!place || (need === 'surgery' && orBlock(db, s) !== null)) return undefined;
  if (e.full?.includes(place)) return { place, full: true };
  return BEDS[place](db, s).length === 0 ? { place, full: false } : undefined;
}
