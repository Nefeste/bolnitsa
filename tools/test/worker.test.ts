// Движок в отдельном потоке (spec docs/specs/2026-10-engine-speed.md, «Поток расчёта»; решение владельца 16.10.2026):
// смена в `worker_threads` — кадрами по 4 игровые секунды с бюджетом 4 мс, как ×4 при 60 к/с, — даёт то же состояние, что в
// основном потоке минутами; и сколько стоит переслать срез на 200 человек.
import { describe, expect, test } from 'bun:test';
import { Worker } from 'node:worker_threads';
import { db } from '../../src/content';
import { apply, newFlowShift } from '../../src/engine/shift/engine';
import { sliceOf } from '../../src/engine/shift/slice';
import { DAY } from '../../src/engine/shift/types';
import type { FromSim, ToSim } from '../../src/sim/protocol';
import { hospitalFor } from '../bench/hospital';

const layout = hospitalFor(db, 6, 100, { emergency: true });
const flow = { perHour: 12, ambulancePerHour: 2 };
const hash = (x: unknown) => Bun.hash(JSON.stringify(x)).toString(16);

function call(w: Worker, msg: ToSim): Promise<FromSim> {
  return new Promise(resolve => {
    w.once('message', resolve);
    w.postMessage(msg);
  });
}

describe('поток расчёта', () => {
  test('смена в worker_threads, кадрами с бюджетом, — то же состояние, что в основном потоке', async () => {
    // основной поток: минутами до 14:00
    const s = newFlowShift(db, { seed: 21, season: 'winter', hospital: layout.hospital, staff: layout.staff, flow });
    const end = 14 * 3600;
    while (s.t < end) apply(db, s, { kind: 'advance', seconds: Math.min(60, end - s.t) });

    const w = new Worker(new URL('./sim-worker.ts', import.meta.url).href);
    try {
      const first = await call(w, { kind: 'start', seed: 21, season: 'winter', hospital: layout.hospital, staff: layout.staff, flow });
      expect(first.kind).toBe('slice');
      let lag = 0;
      let people = 0;
      // 08:00 → 14:00 — кадрами ×4 (4 игровые секунды), движку по 4 мс
      for (let i = 0; i < (6 * 3600) / 4; i++) {
        const r = await call(w, { kind: 'tick', seconds: 4, budgetMs: 4 });
        if (r.kind !== 'slice') throw new Error(r.kind === 'error' ? r.message : r.kind);
        lag = r.lag;
        people = Math.max(people, r.slice.people.length);
      }
      // догнать: кадры без хода часов
      for (let k = 0; lag > 0 && k < 100_000; k++) {
        const r = await call(w, { kind: 'tick', seconds: 0, budgetMs: 4 });
        if (r.kind === 'slice') lag = r.lag;
      }
      expect(lag).toBe(0);
      expect(people).toBeGreaterThan(5);
      const saved = await call(w, { kind: 'save' });
      if (saved.kind !== 'state') throw new Error(saved.kind);
      expect(saved.state.t).toBe(s.t);
      expect(hash(saved.state)).toBe(hash(s));
      // и дальше — тот же день: закрыть в обоих
      apply(db, s, { kind: 'closeDay' });
      const after = await call(w, { kind: 'command', cmd: { kind: 'closeDay' } });
      expect(after.kind).toBe('slice');
      const closed = await call(w, { kind: 'save' });
      if (closed.kind !== 'state') throw new Error(closed.kind);
      expect(hash(closed.state)).toBe(hash(s));
      expect(Math.floor(closed.state.t / DAY)).toBe(0);
    } finally {
      await w.terminate();
    }
  }, 300_000);

  test('срез на 300 человек: клонирование и пересылка в поток и обратно — доли миллисекунды', async () => {
    const people = Array.from({ length: 300 }, (_, i) => ({ id: `1-w${String(i).padStart(4, '0')}`, status: 'inRoom' as const, triage: 'green' as const, room: `r${i % 90}`, by: `p${i % 60}` }));
    const slice = { ...sliceOf(newFlowShift(db, { seed: 1, season: 'winter', hospital: layout.hospital, staff: layout.staff, flow })), people };
    const N = 200;
    let t0 = performance.now();
    for (let i = 0; i < N; i++) structuredClone(slice);
    const clone = (performance.now() - t0) / N;
    const w = new Worker('data:text/javascript,' + encodeURIComponent("const { parentPort } = require('node:worker_threads'); parentPort.on('message', m => parentPort.postMessage(m));"));
    try {
      await new Promise<void>(resolve => {
        w.once('message', () => resolve());
        w.postMessage(slice);
      });
      t0 = performance.now();
      for (let i = 0; i < N; i++) {
        await new Promise<void>(resolve => {
          w.once('message', () => resolve());
          w.postMessage(slice);
        });
      }
      const roundTrip = (performance.now() - t0) / N;
      console.log(`срез на 300 человек: structuredClone ${clone.toFixed(3)} мс, туда и обратно через worker_threads ${roundTrip.toFixed(3)} мс`);
      expect(clone).toBeLessThan(1);
      expect(roundTrip).toBeLessThan(2);
    } finally {
      await w.terminate();
    }
  }, 60_000);
});
