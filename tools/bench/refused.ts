// Отказ в госпитализации для проб (tools/bench/infections.ts, tools/bench/levels.ts; spec docs/specs/2026-11-scenario-5.md): больного
// отправили в другую больницу, а по базе ему нужна койка — свои годные были все заняты в минуту решения («мест нет»: вид в `full`
// конца пути) или таких у больницы нет («своих нет»). Годные — как их берёт решение (`choiceFor`): «в стационар» и «вызвать
// скорую» — своя палата, операция — палата после неё, если операционная работает, ПИТ — или реанимация, реанимация, бокс.
import type { ContentDb, Setting } from '../../src/content/types';
import { recommendedSetting } from '../../src/engine/med/plan';
import { boxBeds, icuBeds, orBlock, ricuBeds, wardBeds } from '../../src/engine/shift/engine';
import type { End, Place } from '../../src/engine/shift/journey';
import type { ShiftPatient, ShiftState } from '../../src/engine/shift/types';

const NEEDS: Partial<Record<Setting, Place[]>> = {
  ward: ['ward'], ambulance: ['ward'], admit: ['ward'], surgery: ['ward'], icu: ['icu', 'ricu'], ricu: ['ricu'], box: ['box'],
};
const BEDS = { ward: wardBeds, icu: icuBeds, ricu: ricuBeds, box: boxBeds };

export function refusalOf(db: ContentDb, s: ShiftState, p: ShiftPatient, e: End): { place: Place; full: boolean } | undefined {
  if (e.how !== 'away' || !p.closed) return undefined;
  const need = recommendedSetting(db, p.patient, p.results.map(r => r.exam), p.closed.bedside, p.closed.rooms);
  const kinds = NEEDS[need];
  if (!kinds || (need === 'surgery' && orBlock(db, s) !== null)) return undefined;
  const full = e.full ?? [];
  // свободная годная была: такие есть, и в минуту решения они не были все заняты
  if (kinds.some(k => !full.includes(k) && BEDS[k](db, s).length > 0)) return undefined;
  const have = kinds.find(k => full.includes(k));
  return have ? { place: have, full: true } : { place: kinds[0], full: false };
}
