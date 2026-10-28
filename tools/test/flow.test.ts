// Поток пациентов для ПК (spec docs/specs/2026-10-engine-speed.md, ч. 2–3): приток в час, пациент — к приходу, ушедшие —
// строками журнала; детерминизм — тот же хэш у двух смен с одним зерном и при другом шаге времени; «красных»,
// повторных и привезённых скорой ведут нанятые врачи. Сутки — целиком, итог — на планёрке в 08:00 (spec 2026-10-day).
import { describe, expect, test } from 'bun:test';
import { db } from '../../src/content';
import { apply, newFlowShift } from '../../src/engine/shift/engine';
import { DAY, type ShiftState } from '../../src/engine/shift/types';
import { hospitalFor } from '../bench/hospital';
import { hash, liveUntil } from './scenario';

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

  test('приём нанятого врача — сразу строкой журнала, без разбора; итоги дня — то, что известно без него', () => {
    const s = start(14);
    liveUntil(db, s, 12);
    const gone = s.gone ?? [];
    const hired = gone.filter(r => r.by !== undefined);
    expect(hired.length).toBeGreaterThan(10);
    for (const r of gone) {
      expect(s.patients[r.id]).toBeUndefined();
      expect(s.events.some(e => 'id' in e.event && e.event.id === r.id)).toBe(false);
    }
    // общей оценки у приёма нанятого врача нет — разбор не считается
    for (const r of hired) {
      expect(r.end).toBe('done');
      expect(r.overall).toBeUndefined();
      expect(r.verdict).toBeDefined();
    }
    // в состоянии из приёмов нанятых врачей — только те, кого ждут обратно, и лежащие
    for (const p of Object.values(s.patients)) {
      if (p.closed?.by) expect(p.closed.outcome.returns !== undefined || p.status === 'admitted' || ['admit', 'icu', 'ricu', 'box', 'surgery'].includes(p.closed.plan.setting)).toBe(true);
    }
    // итог суток — на планёрке в 08:00 (spec 2026-10-day): все приёмы нанятых врачей этих суток — строки журнала и лежащие
    liveUntil(db, s, 32);
    expect(s.history.length).toBe(1);
    const day = s.history[0];
    const cols = Object.values(day.colleagues ?? {});
    const seen = cols.reduce((n, c) => n + c.seen, 0);
    expect(seen).toBe((s.gone ?? []).filter(r => r.by !== undefined).length + Object.values(s.patients).filter(p => p.closed?.by).length);
    // оценок нет — ни вечером, ни в остаток кадра; счётчики без разбора — есть
    expect(cols.every(c => c.grades.A + c.grades.B + c.grades.C + c.grades.D === 0)).toBe(true);
    expect(cols.reduce((n, c) => n + c.correct + c.partly + c.wrong, 0)).toBe(seen);
    expect(cols.some(c => (c.admitted ?? 0) + (c.referred ?? 0) > 0)).toBe(true);
  }, 120_000);

  test('«красных», повторных и привезённых скорой ведут нанятые врачи — к утру в очереди не висит никто', () => {
    const s = start(15);
    // сутки целиком (spec 2026-10-day): сами приходят до 20:00, скорая — и ночью; к 08:00 очередь к врачу разобрана — ждут
    // врача только привезённые за последний час
    for (let d = 1; d <= 2; d++) {
      liveUntil(db, s, 32);
      const queued = Object.values(s.patients).filter(p => p.status === 'waiting' && p.by === undefined);
      expect(queued.filter(p => p.arriveT < s.t - 3600)).toEqual([]);
      expect(s.day).toBe(d + 1);
    }
    const seen = [...Object.values(s.patients), ...(s.gone ?? [])];
    expect(seen.some(p => p.kind === 'ambulance')).toBe(true);
    expect(seen.some(p => p.kind === 'return' || p.returnOf !== undefined)).toBe(true);
    expect(s.history.every(h => h.unseen === 0)).toBe(true);
    expect(Math.floor(s.t / DAY) + 1).toBe(3);
  }, 180_000);
});
