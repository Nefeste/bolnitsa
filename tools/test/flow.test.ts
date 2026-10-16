// Поток пациентов для ПК (spec docs/specs/2026-10-engine-speed.md, ч. 2–3): приток в час, пациент — к приходу, ушедшие —
// строками журнала; детерминизм — тот же хэш у двух смен с одним зерном и при другом шаге времени; «красных»,
// повторных и привезённых скорой ведут нанятые врачи.
import { describe, expect, test } from 'bun:test';
import { apply, newFlowShift, reviewsDue, settleReviews } from '../../src/engine/shift/engine';
import { DAY, type ShiftState } from '../../src/engine/shift/types';
import { buildDb } from '../content/load';
import { hospitalFor } from '../bench/hospital';
import { hash, liveUntil } from './scenario';

const { db } = buildDb();
const layout = hospitalFor(db, 6, 100, { emergency: true });
const start = (seed: number): ShiftState =>
  newFlowShift(db, { seed, season: 'winter', hospital: layout.hospital, staff: layout.staff, flow: { perHour: 12, ambulancePerHour: 2 } });

/** Хэш состояния в каждый полный час до `until` и после закрытия дня. */
function hourly(seed: number, step: number, until = 17): string[] {
  const s = start(seed);
  const out: string[] = [];
  for (let h = 9; h <= until; h++) {
    liveUntil(db, s, h, step);
    out.push(hash(s));
  }
  apply(db, s, { kind: 'closeDay' });
  out.push(hash(s));
  return out;
}

describe('поток для ПК', () => {
  test('пациент генерируется к приходу: ещё не пришедших в состоянии нет', () => {
    const s = start(11);
    expect(Object.keys(s.patients).length).toBe(0);
    liveUntil(db, s, 10);
    const all = Object.values(s.patients);
    expect(all.length).toBeGreaterThan(10);
    expect(all.every(p => p.status !== 'coming' && p.arriveT <= s.t)).toBe(true);
    // одно событие на поток, а не весь день с утра
    expect(s.events.filter(e => e.event.kind === 'flow').length).toBeLessThanOrEqual(2);
  }, 60_000);

  test('детерминизм: две смены с одним зерном — тот же хэш каждый час; шаг 15 с — тот же', () => {
    const a = hourly(12, 60);
    expect(hourly(12, 60)).toEqual(a);
    expect(hourly(12, 15)).toEqual(a);
    expect(hourly(13, 60)).not.toEqual(a);
  }, 180_000);

  test('ушедшие — строками журнала: приём нанятого врача с досчитанным разбором уходит из состояния', () => {
    const s = start(14);
    liveUntil(db, s, 12);
    const due = reviewsDue(s);
    expect(due).toBeGreaterThan(0);
    const before = Object.keys(s.patients).length;
    settleReviews(db, s);
    expect(reviewsDue(s)).toBe(0);
    const gone = s.gone ?? [];
    expect(gone.length).toBeGreaterThan(0);
    expect(Object.keys(s.patients).length).toBe(before - gone.length);
    for (const r of gone) {
      expect(s.patients[r.id]).toBeUndefined();
      expect(s.events.some(e => 'id' in e.event && e.event.id === r.id)).toBe(false);
      expect(r.end).toBe('done');
      expect(r.by).toBeDefined();
    }
    liveUntil(db, s, 18);
    apply(db, s, { kind: 'closeDay' });
    // к вечеру в состоянии — только те, кого ждут обратно, лежащие и ваши
    for (const p of Object.values(s.patients)) expect(p.closed?.outcome.returns !== undefined || p.closed?.stay !== undefined || p.status === 'admitted' || ['admit', 'icu', 'ricu', 'box', 'surgery'].includes(p.closed?.plan.setting ?? '')).toBe(true);
  }, 120_000);

  test('«красных», повторных и привезённых скорой ведут нанятые врачи — до конца дня никто не висит', () => {
    const s = start(15);
    for (let d = 0; d < 2; d++) {
      if (d > 0) apply(db, s, { kind: 'nextDay' });
      liveUntil(db, s, 20);
      const waiting = Object.values(s.patients).filter(p => p.status === 'waiting' || p.status === 'inRoom' || p.status === 'away');
      expect(waiting).toEqual([]);
      apply(db, s, { kind: 'closeDay' });
    }
    const seen = [...Object.values(s.patients), ...(s.gone ?? [])];
    expect(seen.some(p => p.kind === 'ambulance')).toBe(true);
    expect(seen.some(p => p.kind === 'return' || p.returnOf !== undefined)).toBe(true);
    expect(s.history.every(h => h.unseen === 0)).toBe(true);
    expect(Math.floor(s.t / DAY) + 1).toBe(2);
  }, 180_000);
});
