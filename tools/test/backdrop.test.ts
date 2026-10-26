// Живая сцена за экраном начала (spec docs/specs/2026-10-aaa-polish.md, «Экран начала на живой сцене»): путь облёта
// камеры — круг над помещениями, замкнутый, с ровной скоростью, в пределах здания.
import { describe, expect, test } from 'bun:test';
import { db } from '../../src/content';
import { planOfSite } from '../../src/engine/hospital/site';
import { siteOfPreset } from '../../src/engine/hospital/site-preset';
import { ringOf, TOUR_INSET, TOUR_SPEED, tourAt, tourOf, type Pt, type Rect } from '../../src/app/backdrop';

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.z - b.z);
/** Длина эллипса с полуосями a, b (Рамануджан): точность — доли процента. */
const ellipse = (a: number, b: number) => Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));

describe('путь облёта', () => {
  const rooms: Rect[] = [
    { x: 0, y: 0, w: 10, h: 8 },
    { x: 30, y: 2, w: 10, h: 8 },
    { x: 12, y: 22, w: 8, h: 8 },
  ];

  test('круг — эллипс около середины помещений, в доле до края; первая точка — на западе', () => {
    const ring = ringOf(rooms);
    expect(ring.length).toBe(96);
    // общий прямоугольник 40 × 30, середина (20, 15)
    const rx = 20 * TOUR_INSET;
    const rz = 15 * TOUR_INSET;
    for (const p of ring) expect(((p.x - 20) / rx) ** 2 + ((p.z - 15) / rz) ** 2).toBeCloseTo(1, 9);
    expect(ring[0].x).toBeCloseTo(20 - rx, 9);
    expect(ring[0].z).toBeCloseTo(15, 9);
    expect(Math.min(...ring.map(p => p.x))).toBeCloseTo(ring[0].x, 9);
    expect(ringOf([])).toEqual([]);
  });

  test('путь замкнут, длина — длина эллипса; за длиной — снова начало, назад — с конца', () => {
    const t = tourOf(ringOf(rooms));
    expect(t.pts[t.pts.length - 1]).toEqual(t.pts[0]);
    for (let i = 1; i < t.cum.length; i++) expect(t.cum[i]).toBeGreaterThan(t.cum[i - 1]);
    expect(t.length / ellipse(20 * TOUR_INSET, 15 * TOUR_INSET)).toBeCloseTo(1, 2);
    expect(dist(tourAt(t, 0), t.pts[0])).toBeLessThan(1e-9);
    expect(dist(tourAt(t, t.length), t.pts[0])).toBeLessThan(1e-9);
    expect(dist(tourAt(t, t.length * 2.25), tourAt(t, t.length * 0.25))).toBeLessThan(1e-9);
    expect(dist(tourAt(t, -1), tourAt(t, t.length - 1))).toBeLessThan(1e-9);
  });

  test('скорость ровная: равные доли пути — равные шаги по земле, без рывков', () => {
    const t = tourOf(ringOf(rooms));
    // кадр в 60 Гц на скорости облёта
    const ds = TOUR_SPEED / 60;
    let prev = tourAt(t, 0);
    for (let s = ds; s < t.length * 1.5; s += ds) {
      const p = tourAt(t, s);
      const step = dist(p, prev);
      expect(step).toBeLessThanOrEqual(ds + 1e-9);
      expect(step).toBeGreaterThan(ds * 0.98);
      prev = p;
    }
  });

  test('одна точка — стоянка; нет точек — на месте', () => {
    const one = tourOf([{ x: 3, z: 4 }]);
    expect(one.length).toBe(0);
    expect(tourAt(one, 10)).toEqual({ x: 3, z: 4 });
    expect(tourAt(tourOf([]), 5)).toEqual({ x: 0, z: 0 });
  });

  test('городская больница: круг над зданием, внутри его помещений; круг — около минуты', () => {
    const plan = planOfSite(db, siteOfPreset(db, db.presets['preset.city']));
    const rooms = plan.rooms;
    const x0 = Math.min(...rooms.map(r => r.x));
    const x1 = Math.max(...rooms.map(r => r.x + r.w));
    const z0 = Math.min(...rooms.map(r => r.y));
    const z1 = Math.max(...rooms.map(r => r.y + r.h));
    const t = tourOf(ringOf(rooms));
    for (const p of t.pts) {
      expect(p.x).toBeGreaterThan(x0 + 5);
      expect(p.x).toBeLessThan(x1 - 5);
      expect(p.z).toBeGreaterThan(z0 + 5);
      expect(p.z).toBeLessThan(z1 - 5);
    }
    // пустое восточное крыло (spec docs/specs/2026-10-city-land.md) — не помещения: круг его не захватывает
    expect(Math.max(...t.pts.map(p => p.x))).toBeLessThan(52);
    const secs = t.length / TOUR_SPEED;
    expect(secs).toBeGreaterThan(35);
    expect(secs).toBeLessThan(65);
  });
});
