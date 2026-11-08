// из anamnez: src/state/daily.ts @ bed1996, изменено: случай дня ПК (spec docs/specs/2026-11-doctor-shift.md, часть 3) —
// только день, зерно и подбор, и подбор целиком, а не по частям: он идёт в потоке расчёта при начале смены, а у разумного
// врача «Больницы» нет `sofar` — путь досчитывается до решения (тест «Анамнеза» «подбор … — зерно то же, что по всему пути»
// показывает, что так выходит то же зерно). Приём, слот начатого приёма и профиль — свои у ПК (окно, src/app/daily.ts).
//
// «Случай дня»: один больной в сутки, одинаковый у всех с той же версией базы, — зерно из даты и номера базы. Любой из
// последних 30 дней можно сыграть когда угодно; засчитывается первая попытка, переиграть можно. Серии дней нет: пропущенный
// день ничего не отнимает (устав, «Без давления»). Случай дня — трудный по мере (ответ владельца «Анамнезу» на вопрос 56): из
// зёрен дня — первая загадка, много болезней в ряду у двери, правда — не первая в «Похоже на», разумному врачу разбора
// расспроса и осмотра мало, а с обследованиями он ставит верный диагноз.
import type { ContentDb, Id } from '../content/types';
import { fnv1a } from '../engine/core/hash';
import { Rng } from '../engine/core/rng';
import { doorRow, HARD_ROW, hardnessOf } from '../engine/med/difficulty';
import { complaintObservations } from '../engine/med/exams';
import { generatePatient } from '../engine/med/generate';
import { startRational } from '../engine/med/policy';
import { reviewBeliefs } from '../engine/med/review';
import type { Grade } from '../engine/med/score';
import type { Patient } from '../engine/med/types';
import { DAILY_DEPARTMENT } from '../engine/shift/engine';
import { dailySeed, seasonOfDay } from './days';

/**
 * Сколько зёрен дня пробует подбор: трудной решаемой загадки среди них нет — случай дня — по первому. В «Анамнезе» за 365 дней
 * она находится в среднем на 8-м зерне, позже 81-го — ни разу.
 */
export const DAILY_TRIES = 100;

const pickSeed = (day: string, base: number, k: number) => (k === 0 ? dailySeed(day, base) : fnv1a(`${dailySeed(day, base)}:${k}`));

/** Болезни, из которых выбирают диагноз у больного дня: его отделение, как `candidates()` окна врача. */
export const dailyCandidates = (db: ContentDb): Id[] =>
  Object.keys(db.conditions).filter(id => db.conditions[id].presenting && db.conditions[id].department === DAILY_DEPARTMENT);

/** Больной дня из зерна — тем же вызовом генератора, что движок, когда он приходит (`flowArrive`, `meta.daily`). */
export const dailyPatient = (db: ContentDb, seed: number, day: string): Patient => generatePatient(db, seed, { department: DAILY_DEPARTMENT, season: seasonOfDay(day) });

/**
 * Зерно случая дня: из зёрен дня — первая загадка, трудная по мере и решаемая. Загадка — много болезней в ряду у двери, и
 * правда — не первая из них в «Похоже на»: иначе каждый третий случай дня — ОРВИ. У загадки — разумный врач разбора со всеми
 * обследованиями, тем же зерном, что разбор «Анамнеза»: трудный (`hardnessOf`: расспроса и осмотра мало) и решаемый —
 * верный диагноз в конце. Нет такой среди `DAILY_TRIES` — первое зерно дня.
 */
export function dailyCaseSeed(db: ContentDb, day: string, base: number = db.contentVersion): number {
  const cands = dailyCandidates(db);
  const exams = Object.keys(db.exams).sort();
  for (let k = 0; k < DAILY_TRIES; k++) {
    const seed = pickSeed(day, base, k);
    const patient = dailyPatient(db, seed, day);
    const door = reviewBeliefs(db, patient, cands, complaintObservations(patient));
    if (doorRow(door) < HARD_ROW || door[0].id === patient.truth.conditions[0].id) continue;
    const r = startRational(db, patient, Rng.seeded(seed).fork('visit').fork('review'), { candidates: [...cands], exams }).result();
    if (hardnessOf(db, patient, cands, door, r).level === 'hard' && r.correct) return seed;
  }
  return pickSeed(day, base, 0);
}

/** Приём дня закрыт — окну: кто, вердикт и общая оценка разбора (`grades.overall`); засчитывает окно — первую попытку. */
export interface DailyEnd {
  id: string;
  verdict: 'correct' | 'partly' | 'wrong';
  grade: Grade;
}
