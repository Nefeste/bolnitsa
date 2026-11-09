// Испытания ПК (spec docs/specs/2026-11-challenges.md, часть 1): условие испытания — запись `content/challenges/`, а здесь —
// что из неё нужно движку: испытание смены, его поток, сколько пришло сами, волна у пришедшего сами. Остальное читают там,
// где оно действует: начало потоков — `planFlow`, «не больше стольких сами» и волна — `flowArrive`, показания без кассы —
// назначение обследования, кредит — `offerOf` (src/engine/shift/money.ts). Без испытания всё — как прежде, байт в байт.
import type { Challenge, ContentDb, Id } from '../../content/types';
import type { Flow, ShiftState } from './types';

/** Испытание смены — запись базы; нет — смена без испытания. */
export const challengeOf = (db: ContentDb, s: ShiftState): Challenge | undefined => (s.meta.challenge ? db.challenges?.[s.meta.challenge] : undefined);

/** Поток испытания: от больницы — или свой: сами в час приёма в среднем и скорая в час в среднем за сутки. */
export function challengeFlow(c: Challenge): Flow {
  return c.flow === 'auto' ? { perHour: 0, auto: true } : { perHour: c.flow.walk, ...(c.flow.ambulance > 0 ? { ambulancePerHour: c.flow.ambulance } : {}) };
}

/** Сколько пришли сами в эти сутки: и те, кто ещё в больнице, и ушедшие — номера `<сутки>-w…`. */
export function walkInsOf(s: ShiftState): number {
  const prefix = `${s.day}-w`;
  let n = 0;
  for (const id of Object.keys(s.patients)) if (id.startsWith(prefix)) n++;
  for (const r of s.gone ?? []) if (r.id.startsWith(prefix)) n++;
  return n;
}

/**
 * Болезнь волны — пришедшему сами, если жребий его прихода выпал: `share` % — в долях 1/10 000, как `Rng.chance`; нет волны
 * или не выпал — как всем.
 */
export function waveOf(c: Challenge | undefined, roll: (p: number) => boolean): readonly Id[] | undefined {
  return c?.wave && roll(c.wave.share * 100) ? [c.wave.condition] : undefined;
}
