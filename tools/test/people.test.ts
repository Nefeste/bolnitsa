// Люди (spec docs/specs/2026-10-shell-3d.md, «Масштаб и опора»; замечание владельца к пробе: «люди висят над полом и тень
// отстаёт»): ступни на полу в каждом кадре «стоит», «идёт», «садится», «сидит», «встаёт» — у полной и у упрощённой модели;
// рост — по таблице cast.ts; плечи и таз сидя не «схлопываются»; лёжа спина — на постели. Голова: у видов обычных
// пропорций — 1/7–1/8 роста (геймдизайн §13); набор Quaternius — мультяшный, и это записано в cast.ts.
import { describe, expect, test } from 'bun:test';
import { CLIP_NAMES, skinnedY } from '../../src/render/bake';
import { LOOKS, lookSpec, statureOf } from '../../src/render/cast';
import { bakedPeople, index } from './render-kit';

describe('люди', () => {
  test('все виды набора — в таблице cast.ts', () => {
    expect(index.people.slice().sort()).toEqual(LOOKS.map(l => l.name).sort());
  });

  test('ступни на полу: в каждом кадре нижняя точка — у пола (полная и упрощённая модель)', async () => {
    const p = await bakedPeople();
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
    const p = await bakedPeople();
    for (const look of p.looks) {
      const s = lookSpec(look.name)!;
      expect(look.height).toBeCloseTo(statureOf(s), 3);
      const y = skinnedY(p, look, look.clips.Idle.start);
      expect(y.max - y.min).toBeCloseTo(statureOf(s), 2);
    }
  });

  test('плечи и таз сидя — той же ширины, что стоя; опора сидя — таз позади ступней', async () => {
    const p = await bakedPeople();
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

  test('пропорции: голова у видов «обычных пропорций» — 1/7–1/8 роста; мультяшные — отмечены в cast.ts', async () => {
    const p = await bakedPeople();
    for (const look of p.looks) {
      const s = lookSpec(look.name)!;
      if (s.proportions === 'normal') {
        expect(look.headRatio).toBeGreaterThan(6.5);
        expect(look.headRatio).toBeLessThan(8.5);
      } else expect(look.headRatio).toBeLessThan(4);
    }
  });
});
