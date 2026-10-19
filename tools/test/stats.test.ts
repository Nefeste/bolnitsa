// из pharma: tools/test/stats.test.ts @ b9696c0, изменено: те же шесть прогонов — и на настоящих GpuTimer и SimClient
// Выборка бенча с отметки (src/app/stats.ts, `since`): память замеров обрезана — у таймера видеокарты держит последние
// 2000, у клиента потока расчёта при 2001 срезает первую тысячу. Отметка начала прогона — счёт замеров, и каждый из шести
// прогонов бенча получает ровно свои замеры при обоих правилах обрезки; с отметкой длиной массива — нет (замер владельца
// в «Фармзаводе» 19.10.2026: время видеокарты пропало с третьего прогона, время потока — со второго).
import { describe, expect, test } from 'bun:test';
import { since } from '../../src/app/stats';
import { GpuTimer } from '../../src/render/gpu';
import { SimClient } from '../../src/sim/client';

/** Память замеров с правилом обрезки и счётом всех пришедших. */
function tally(trim: (list: number[]) => void) {
  const list: number[] = [];
  let total = 0;
  return {
    list,
    get total() {
      return total;
    },
    push(v: number) {
      list.push(v);
      total++;
      trim(list);
    },
  };
}

const keepLast = (list: number[]) => {
  if (list.length > 2000) list.splice(0, list.length - 2000);
};
const cutThousand = (list: number[]) => {
  if (list.length > 2000) list.splice(0, 1000);
};

describe('выборка с отметки', () => {
  for (const [name, trim] of [
    ['таймер видеокарты — последние 2000', keepLast],
    ['клиент потока — срез тысячи', cutThousand],
  ] as const) {
    test(`${name}: шесть прогонов по 900 замеров после 180 на прогрев — у каждого свои 900`, () => {
      const t = tally(trim);
      let n = 0;
      let broken = 0;
      for (let run = 0; run < 6; run++) {
        for (let i = 0; i < 180; i++) t.push(n++);
        const mark = t.total;
        const byLength = t.list.length;
        const first = n;
        for (let i = 0; i < 900; i++) t.push(n++);
        const got = since(t.list, t.total, mark);
        expect(got.length).toBe(900);
        expect(got[0]).toBe(first);
        expect(got[899]).toBe(n - 1);
        // прежняя отметка — длина массива: после обрезки она теряет замеры прогона
        if (t.list.slice(byLength).length !== 900) broken++;
      }
      expect(broken).toBeGreaterThan(0);
    });
  }

  test('пришло больше, чем держит память, — последние; ничего не пришло — пусто', () => {
    const t = tally(keepLast);
    const mark = t.total;
    for (let i = 0; i < 2500; i++) t.push(i);
    expect(since(t.list, t.total, mark)).toEqual(t.list);
    expect(since(t.list, t.total, t.total)).toEqual([]);
  });
});

/** Шесть прогонов бенча кадрами: 180 на прогрев, отметка по счёту и по длине, 900 на замер. */
function sixRuns(frame: () => void, list: () => readonly number[], total: () => number) {
  const runs: { got: number[]; byLength: number }[] = [];
  for (let run = 0; run < 6; run++) {
    for (let i = 0; i < 180; i++) frame();
    const mark = total();
    const length = list().length;
    for (let i = 0; i < 900; i++) frame();
    runs.push({ got: since(list(), total(), mark), byLength: list().slice(length).length });
  }
  return runs;
}

describe('отметка по счёту у настоящих таймера видеокарты и клиента потока', () => {
  test('GpuTimer: `taken` растёт с каждым замером, у каждого прогона — свои 900', () => {
    // WebGL2 без видеокарты: результат запроса готов сразу, время кадра в мс — номер замера
    let k = 0;
    const gl = {
      QUERY_RESULT: 1,
      QUERY_RESULT_AVAILABLE: 2,
      getExtension: () => ({ TIME_ELAPSED_EXT: 3, GPU_DISJOINT_EXT: 4 }),
      getParameter: () => false,
      createQuery: () => ({}),
      beginQuery: () => {},
      endQuery: () => {},
      getQueryParameter: (_q: unknown, p: number) => (p === 2 ? true : 1e6 * k++),
    };
    const timer = new GpuTimer(gl as unknown as WebGL2RenderingContext);
    const frame = () => {
      timer.begin();
      timer.end();
    };
    const runs = sixRuns(frame, () => timer.samples, () => timer.taken);
    expect(timer.taken).toBe(6 * 1080);
    expect(timer.samples.length).toBe(2000);
    runs.forEach((r, run) => {
      expect(r.got.length).toBe(900);
      expect(r.got[0]).toBe(run * 1080 + 180);
      expect(r.got[899]).toBe(run * 1080 + 1079);
    });
    expect(runs.some(r => r.byLength !== 900)).toBe(true);
  });

  test('SimClient: `roundTripsTaken` растёт с каждым ответом на `tick`, у каждого прогона — 900', () => {
    // поток без Worker: на каждый `tick` сразу приходит пустой срез
    const workers: { onmessage: (e: { data: unknown }) => void }[] = [];
    const real = globalThis.Worker;
    globalThis.Worker = class {
      onmessage = (_e: { data: unknown }) => {};
      constructor() {
        workers.push(this);
      }
      postMessage() {}
    } as unknown as typeof Worker;
    let client: SimClient;
    try {
      client = new SimClient('sim.js');
    } finally {
      globalThis.Worker = real;
    }
    const slice = { kind: 'slice', buf: new Int32Array(0), names: [], notices: [], lag: 0 };
    const frame = () => {
      client.frame(1, 4);
      workers[0].onmessage({ data: slice });
    };
    const runs = sixRuns(frame, () => client.roundTrips, () => client.roundTripsTaken);
    expect(client.roundTripsTaken).toBe(6 * 1080);
    expect(client.roundTrips.length).toBeLessThan(2001);
    for (const r of runs) expect(r.got.length).toBe(900);
    expect(runs.some(r => r.byLength !== 900)).toBe(true);
  });
});
