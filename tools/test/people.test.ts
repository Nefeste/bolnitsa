// Люди Rocketbox (spec docs/specs/2026-10-shell-3d.md, «Масштаб и опора»; spec docs/specs/2026-10-people.md; замечание
// владельца к пробе: «люди висят над полом и тень отстаёт»): ступни на полу в каждом кадре «стоит», «идёт», «садится»,
// «встаёт» и петли «сидит» — у полной и у упрощённой модели; рост — по таблице cast.ts; плечи и таз сидя не «схлопываются»;
// лёжа спина — на постели; голова — 1/6–1/8 роста с причёской (геймдизайн §13); шаг и бег без скольжения ступни; петля сидя
// начинается там, где кончилась посадка.
import { describe, expect, test } from 'bun:test';
import { BAKE_FPS, bakeLook, CLIP_NAMES, frameData, fromWire, skinnedY, skinPositions, toWire } from '../../src/render/bake';
import { LOOKS, lookSpec, statureOf } from '../../src/render/cast';
import { bakedPeople as baked, gltfOf, rocketboxIndex } from './render-kit';

describe('люди', () => {
  test('все виды набора — в таблице cast.ts', () => {
    expect(rocketboxIndex.looks.slice().sort()).toEqual(LOOKS.map(l => l.name).sort());
  });

  test('ступни на полу: в каждом кадре нижняя точка — у пола (полная и упрощённая модель)', async () => {
    const p = await baked();
    for (const look of p.looks) {
      for (const cn of CLIP_NAMES) {
        const c = look.clips[cn];
        for (let f = 0; f < c.frames; f++) {
          for (const g of [look.geometry, look.lod]) {
            const y = skinnedY(p, look, c.start + f, g).min;
            // шаг и бег отрывают ступню; в фазе полёта бега обе ноги в воздухе; медленный шаг (часть 2б) — тот же перекат с
            // пятки на носок: нижняя точка до 1,23 см, у шага — до 1,77 см
            const [lo, hi] = cn === 'Run' ? [-0.06, 0.2] : cn === 'Walk' || cn === 'WalkSlow' ? [-0.02, 0.025] : [-0.012, 0.012];
            expect([look.name, cn, f, y >= lo && y <= hi]).toEqual([look.name, cn, f, true]);
          }
        }
      }
    }
  }, 120_000);

  test('рост — по таблице: мужчины, женщины, пожилые', async () => {
    const p = await baked();
    for (const look of p.looks) {
      const s = lookSpec(look.name)!;
      expect(look.height).toBeCloseTo(statureOf(s), 3);
      const y = skinnedY(p, look, look.clips.Idle.start);
      expect(y.max - y.min).toBeCloseTo(statureOf(s), 2);
    }
  });

  test('плечи и таз сидя — той же ширины, что стоя; опора сидя — таз позади ступней', async () => {
    const p = await baked();
    for (const look of p.looks) {
      expect(look.collapse.shoulders).toBeGreaterThan(0.9);
      expect(look.collapse.shoulders).toBeLessThan(1.1);
      expect(look.collapse.hips).toBeGreaterThan(0.9);
      expect(look.collapse.hips).toBeLessThan(1.1);
      expect(look.seat.z).toBeLessThan(0);
      expect(look.seat.y).toBeGreaterThan(0.15);
      expect(look.lie.back).toBeGreaterThan(0.05);
      expect(look.lie.back).toBeLessThan(0.25);
    }
  });

  test('пропорции: голова — 1/6–1/8 роста с причёской', async () => {
    const p = await baked();
    for (const look of p.looks) {
      expect([look.name, look.headRatio > 5.5 && look.headRatio < 8.5]).toEqual([look.name, true]);
    }
  });
});

describe('люди: атлас, шаг, сидя', () => {
  test('атлас и маска — у каждого вида; скорость шага и бега — из анимации, правдоподобная', async () => {
    const p = await baked();
    for (const look of p.looks) {
      expect(look.geometry.attributes.uv).toBeDefined();
      // упрощённая — до 1500 треугольников: у видов с прядями и инструментом упрощение упирается в швы развёртки (people.mjs)
      expect(look.lod.index!.count / 3).toBeLessThan(1500);
      expect(look.walk).toBeGreaterThan(1);
      expect(look.walk).toBeLessThan(1.6);
      expect(look.run).toBeGreaterThan(2.5);
      expect(look.run).toBeLessThan(3.6);
    }
  });

  test('шаг и бег без скольжения: опорная точка подошвы, пока стопа на полу, в мире стоит на месте (сдвиг меньше 3 мм)', async () => {
    const p = await baked();
    for (const look of p.looks) {
      for (const cn of ['Walk', 'Run'] as const) {
        const c = look.clips[cn];
        // петля: последний кадр — снова первый
        const n = c.frames - 1;
        // человек идёт вперёд (+z) на шаг кадра
        const step = (cn === 'Walk' ? look.walk : look.run) / BAKE_FPS;
        const pos = Array.from({ length: n }, (_, f) => skinPositions(look.geometry, frameData(p, look, c.start + f)));
        // подошвы обуви (bake.ts, `soles`): вершины костей стопы ниже 12 см в позе «стоит», левая и правая
        for (const sole of look.soles) {
          // опорная точка кадра — нижняя вершина подошвы; стопа на полу — она не выше 5 мм
          const low = pos.map(q => sole.reduce((b, v) => (q[v * 3 + 1] < q[b * 3 + 1] ? v : b), sole[0]));
          const on = low.map((v, f) => pos[f][v * 3 + 1] < 0.005);
          let worst = 0;
          let touches = 0;
          for (let f = 0; f < n; f++) {
            if (!on[f] || on[(f + n - 1) % n]) continue;
            touches++;
            // от касания, пока стопа на полу: куда в мире ушла опорная точка каждого кадра к следующему — накопленно
            let sum = 0;
            for (let g = f, i = 0; on[(g + 1) % n] && i < n; g = (g + 1) % n, i++) {
              const v = low[g];
              sum += pos[(g + 1) % n][v * 3 + 2] - pos[g][v * 3 + 2] + step;
              worst = Math.max(worst, Math.abs(sum));
            }
          }
          expect([look.name, cn, Math.round(worst * 1000), worst < 0.003]).toEqual([look.name, cn, Math.round(worst * 1000), true]);
          // в шаге каждая стопа стоит на полу хотя бы раз за петлю
          if (cn === 'Walk') expect([look.name, touches > 0]).toEqual([look.name, true]);
        }
      }
    }
  });

  test('из потока запекания (bake-worker.ts) вид приходит тем же: сетки, кадры и числа (toWire / fromWire)', async () => {
    const name = rocketboxIndex.looks[0];
    const r = bakeLook(await gltfOf(`rocketbox/${name}`), name);
    const back = fromWire(toWire(r).look);
    expect(back.frames.length).toBe(r.frames.length);
    for (let f = 0; f < r.frames.length; f += 37) expect(Array.from(back.frames[f])).toEqual(Array.from(r.frames[f]));
    for (const k of ['geometry', 'lod'] as const) {
      for (const [n, a] of Object.entries(r[k].attributes)) expect([n, Array.from(back[k].attributes[n].array)]).toEqual([n, Array.from(a.array)]);
      expect(Array.from(back[k].index!.array)).toEqual(Array.from(r[k].index!.array));
    }
    const { geometry: _g, lod: _l, frames: _f, map: _m, mask: _k, ...rest } = r;
    const { geometry: _g2, lod: _l2, frames: _f2, map: _m2, mask: _k2, ...same } = back;
    expect(same).toEqual(rest);
  });
});
