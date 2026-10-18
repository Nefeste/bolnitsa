// Выделение и наведение на карте (spec docs/specs/2026-10-aaa-polish.md, «Выделение и наведение»): рамка выбранного
// помещения — четыре полосы по внутреннему краю без наложений; выбранное и наведённое помещение, кольца у выбранного и
// наведённого человека, вспышка стройки — состояние сеток по кадрам. Three.js без WebGL: геометрия и флаги видимости.
import { describe, expect, test } from 'bun:test';
import { FRAME_W, frameQuads, Highlight } from '../../src/render/highlight';

/** Площадь треугольников (x, z подряд). */
function area(q: Float32Array): number {
  let s = 0;
  for (let i = 0; i < q.length; i += 6) s += Math.abs((q[i + 2] - q[i]) * (q[i + 5] - q[i + 1]) - (q[i + 4] - q[i]) * (q[i + 3] - q[i + 1])) / 2;
  return s;
}

describe('рамка помещения', () => {
  test('четыре полосы шириной FRAME_W по внутреннему краю: площадь — площадь рамки, все точки внутри прямоугольника', () => {
    const q = frameQuads(2, 3, 9, 8);
    expect(q.length).toBe(4 * 12);
    const w = 7;
    const h = 5;
    // Float32: точность до 1e-4
    expect(area(q)).toBeCloseTo(w * h - (w - 2 * FRAME_W) * (h - 2 * FRAME_W), 4);
    for (let i = 0; i < q.length; i += 2) {
      expect(q[i]).toBeGreaterThanOrEqual(2);
      expect(q[i]).toBeLessThanOrEqual(9);
      expect(q[i + 1]).toBeGreaterThanOrEqual(3);
      expect(q[i + 1]).toBeLessThanOrEqual(8);
    }
  });

  test('узкое помещение: полосы не шире половины стороны', () => {
    const q = frameQuads(0, 0, 0.2, 5);
    expect(area(q)).toBeCloseTo(0.2 * 5, 4);
  });
});

describe('подсветка на карте', () => {
  const room = { x: 4, y: 6, w: 8, h: 7 };
  const other = { x: 20, y: 6, w: 6, h: 6 };

  test('выбранное помещение — рамка; наведённое — вторая; наведение на выбранное второй рамки не даёт', () => {
    const h = new Highlight();
    const s = h.dump();
    expect(s).toEqual({ sel: false, hover: false, ring: false, hoverRing: false, flashing: 0 });
    h.update(1 / 60, room, null, null, null);
    expect(h.dump().sel).toBe(true);
    expect(h.dump().hover).toBe(false);
    h.update(1 / 60, room, other, null, null);
    expect(h.dump().hover).toBe(true);
    h.update(1 / 60, room, room, null, null);
    expect(h.dump().hover).toBe(false);
    h.update(1 / 60, null, null, null, null);
    expect(h.dump().sel).toBe(false);
  });

  test('кольцо у выбранного человека — на его месте, с пульсом; у наведённого — тонкое, не поверх выбранного', () => {
    const h = new Highlight();
    h.update(1 / 60, null, null, { x: 3, y: 0, z: 4 }, null);
    expect(h.dump().ring).toBe(true);
    expect(h.ring.position.x).toBe(3);
    expect(h.ring.position.z).toBe(4);
    const s0 = h.ring.scale.x;
    for (let i = 0; i < 20; i++) h.update(1 / 60, null, null, { x: 3, y: 0, z: 4 }, null);
    expect(h.ring.scale.x).not.toBe(s0);
    h.update(1 / 60, null, null, { x: 3, y: 0, z: 4 }, { x: 3, y: 0, z: 4 });
    expect(h.dump().hoverRing).toBe(false);
    h.update(1 / 60, null, null, { x: 3, y: 0, z: 4 }, { x: 7, y: 0, z: 4 });
    expect(h.dump().hoverRing).toBe(true);
    expect(h.hoverRing.position.x).toBe(7);
  });

  test('вспышка стройки гаснет за 0,7 с и убирается из сцены', () => {
    const h = new Highlight();
    const n0 = h.group.children.length;
    h.flash(room, true);
    expect(h.flashing).toBe(1);
    expect(h.group.children.length).toBe(n0 + 1);
    for (let i = 0; i < 30; i++) h.update(1 / 60, null, null, null, null);
    expect(h.flashing).toBe(1);
    for (let i = 0; i < 30; i++) h.update(1 / 60, null, null, null, null);
    expect(h.flashing).toBe(0);
    expect(h.group.children.length).toBe(n0);
  });
});
