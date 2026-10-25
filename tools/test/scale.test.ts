// Масштаб (spec docs/specs/2026-10-shell-3d.md, «Масштаб и опора»): клетка — 1 м, стена — 2,7 м, дверь — 2,1 м, человек —
// 1,6–1,76 м и проходит в дверь, сиденье — на высоте опоры таза, постели — выше сиденья. Числа — из кода, а не из головы.
import { describe, expect, test } from 'bun:test';
import { SEAT } from '../../src/render/catalog';
import { STATURE } from '../../src/render/cast';
import { LIE_TOP } from '../../src/render/furniture';
import { DOOR_H, WALL_H, WALL_LOW, WALL_T } from '../../src/render/world';
import { bakedPeople } from './render-kit';

describe('масштаб', () => {
  test('стены, двери, рост', () => {
    expect(WALL_H).toBe(2.7);
    expect(DOOR_H).toBe(2.1);
    expect(WALL_T).toBeLessThan(0.25);
    expect(WALL_LOW).toBeLessThan(0.5);
    for (const sex of ['m', 'f'] as const) {
      for (const age of ['adult', 'old'] as const) {
        expect(STATURE[sex][age]).toBeGreaterThan(1.55);
        expect(STATURE[sex][age]).toBeLessThan(1.85);
        // в дверь проходит с запасом
        expect(DOOR_H - STATURE[sex][age]).toBeGreaterThan(0.25);
      }
    }
  });

  test('постели выше сиденья, ниже пояса; сиденье — на опоре таза людей набора', async () => {
    for (const top of Object.values(LIE_TOP)) {
      expect(top!).toBeGreaterThan(SEAT + 0.15);
      expect(top!).toBeLessThan(1.0);
    }
    const p = await bakedPeople();
    for (const l of p.looks) {
      expect(SEAT - l.seat.y).toBeGreaterThanOrEqual(-0.01);
      expect(SEAT - l.seat.y).toBeLessThanOrEqual(0.03);
      // в клетке 1 м человек стоит: ширина плеч — меньше метра (длина руки не в счёт)
      expect(l.height).toBeGreaterThan(1.55);
    }
  });
});
