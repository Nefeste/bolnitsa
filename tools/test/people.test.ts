// Люди (spec docs/specs/2026-10-shell-3d.md, «Масштаб и опора»; замечание владельца к пробе: «люди висят над полом и тень
// отстаёт»): ступни на полу в каждом кадре «стоит», «идёт», «садится», «сидит», «встаёт» — у полной и у упрощённой модели;
// рост — по таблице cast.ts; плечи и таз сидя не «схлопываются»; лёжа спина — на постели. Голова: у видов обычных
// пропорций — 1/6–1/8 роста с причёской (геймдизайн §13); набор Quaternius — мультяшный, и это записано в cast.ts. То же —
// у людей Rocketbox (spec docs/specs/2026-10-people.md), и у них ещё: шаг без скольжения ступни.
import { describe, expect, test } from 'bun:test';
import { BAKE_FPS, CLIP_NAMES, frameData, type People, skinnedY, skinPositions } from '../../src/render/bake';
import { LOOKS, lookSpec, RB_LOOKS, statureOf } from '../../src/render/cast';
import { bakedPeople, bakedRocketbox, index, rocketboxIndex } from './render-kit';

const SETS: [string, () => Promise<People>, string[], string[]][] = [
  ['Quaternius', bakedPeople, index.people, LOOKS.map(l => l.name)],
  ['Rocketbox', bakedRocketbox, rocketboxIndex.looks, RB_LOOKS.map(l => l.name)],
];

for (const [set, baked, files, table] of SETS) {
  describe(`люди: ${set}`, () => {
    test('все виды набора — в таблице cast.ts', () => {
      expect(files.slice().sort()).toEqual(table.slice().sort());
    });

    test('ступни на полу: в каждом кадре нижняя точка — у пола (полная и упрощённая модель)', async () => {
      const p = await baked();
      for (const look of p.looks) {
        for (const cn of CLIP_NAMES) {
          const c = look.clips[cn];
          for (let f = 0; f < c.frames; f++) {
            for (const g of [look.geometry, look.lod]) {
              const y = skinnedY(p, look, c.start + f, g).min;
              // шаг и бег отрывают ступню; в фазе полёта бега обе ноги в воздухе
              const [lo, hi] = cn === 'Run' && look.clips.Run.start !== look.clips.Walk.start ? [-0.06, 0.2] : cn === 'Walk' || cn === 'Run' ? [-0.02, 0.025] : [-0.012, 0.012];
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

    test('пропорции: голова у видов «обычных пропорций» — 1/6–1/8 роста с причёской; мультяшные — отмечены в cast.ts', async () => {
      const p = await baked();
      for (const look of p.looks) {
        const s = lookSpec(look.name)!;
        if (s.proportions === 'normal') {
          expect(look.headRatio).toBeGreaterThan(5.5);
          expect(look.headRatio).toBeLessThan(8.5);
        } else expect(look.headRatio).toBeLessThan(4);
      }
    });
  });
}

describe('люди Rocketbox', () => {
  test('атлас и маска — у каждого вида; скорость шага и бега — из анимации, правдоподобная', async () => {
    const p = await bakedRocketbox();
    for (const look of p.looks) {
      expect(look.geometry.attributes.uv).toBeDefined();
      expect(look.lod.index!.count / 3).toBeLessThan(1200);
      expect(look.walk).toBeGreaterThan(1);
      expect(look.walk).toBeLessThan(1.6);
      expect(look.run).toBeGreaterThan(2.5);
      expect(look.run).toBeLessThan(3.6);
    }
  });

  test('шаг без скольжения: точка опоры подошвы, пока она у пола, в мире стоит на месте (сдвиг меньше 2 см)', async () => {
    const p = await bakedRocketbox();
    for (const look of p.looks) {
      // ступни — вершины ниже 12 см в позе «стоит», левая и правая — по знаку x
      const idle = skinPositions(look.geometry, frameData(p, look, look.clips.Idle.start));
      const n = look.geometry.attributes.position.count;
      const sides = [[], []] as number[][];
      for (let v = 0; v < n; v++) if (idle[v * 3 + 1] < 0.12) sides[idle[v * 3] > 0 ? 0 : 1].push(v);
      const c = look.clips.Walk;
      const step = look.walk / BAKE_FPS;
      const frames = Array.from({ length: c.frames }, (_, f) => skinPositions(look.geometry, frameData(p, look, c.start + f)));
      for (const side of sides) {
        // середина опоры: кадр, где самая низкая вершина стопы ниже всего; дальше — она же, пока касается пола (не выше
        // 5 мм над своей нижней точкой: на отрыве носок ещё у пола, но уже уходит вперёд — это начало шага, не опора)
        let mid = 0;
        let v0 = side[0];
        let low = Infinity;
        frames.forEach((pos, f) => {
          for (const v of side) {
            if (pos[v * 3 + 1] < low) [low, mid, v0] = [pos[v * 3 + 1], f, v];
          }
        });
        // человек идёт вперёд (+z) на шаг кадра: в мире точка = своя глубина + шаг × кадр
        const world = (f: number) => frames[f][v0 * 3 + 2] + step * f;
        let worst = 0;
        for (const dir of [-1, 1]) {
          for (let f = mid + dir; f >= 0 && f < c.frames && frames[f][v0 * 3 + 1] < low + 0.005; f += dir) worst = Math.max(worst, Math.abs(world(f) - world(mid)));
        }
        expect([look.name, Math.round(worst * 1000), worst < 0.02]).toEqual([look.name, Math.round(worst * 1000), true]);
      }
    }
  });
});
