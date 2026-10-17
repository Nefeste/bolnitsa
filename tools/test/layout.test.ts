// Раскладка 3D-вида по шаблонам помещений (spec docs/specs/2026-10-shell-3d.md, «Больница на экране»): на всех шаблонах
// всех размеров и поворотов предметы не налезают друг на друга и на проход у двери, длинные нашли вторую клетку, а места
// персонала, пациента, стулья и койки достижимы от двери. И в готовых больницах — от входа.
import { describe, expect, test } from 'bun:test';
import type { Rot } from '../../src/content/types';
import { planOf } from '../../src/engine/hospital/build';
import { buildDb } from '../content/load';
import { isLong, layoutOf, type Layout } from '../../src/render/layout';
import { accessOf, doorInside, thingAt } from '../../src/render/place';
import { oneRoom, presetLayout, staffCells } from './render-kit';

const { db } = buildDb();

/** Клетки, до которых можно дойти от `from` по проходимым. */
function reach(l: Layout, from: number): Set<number> {
  const seen = new Set([from]);
  const queue = [from];
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    const x = i % l.w;
    const y = (i / l.w) | 0;
    for (const [nx, ny] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ]) {
      if (nx < 0 || ny < 0 || nx >= l.w || ny >= l.h) continue;
      const n = ny * l.w + nx;
      if (seen.has(n) || !l.walk[n]) continue;
      seen.add(n);
      queue.push(n);
    }
  }
  return seen;
}

/** Куда идти к месту в клетке: предмет — к его клетке доступа, свободно — в саму клетку. */
function target(l: Layout, c: readonly [number, number]): number {
  const t = thingAt(l, c[0], c[1]);
  return t >= 0 ? accessOf(l, t) : c[1] * l.w + c[0];
}

describe('раскладка шаблонов', () => {
  const cases: [string, string, Rot][] = [];
  for (const room of Object.values(db.rooms)) for (const z of room.sizes) for (const rot of [0, 1, 2, 3] as Rot[]) cases.push([room.id, z.id, rot]);

  test.each(cases)('%s %s, поворот %d', (type, size, rot) => {
    const hs = oneRoom(db, type, size as never, rot);
    const plan = planOf(db, hs);
    const r = plan.rooms[0];
    const l = layoutOf(db, plan, hs.decor, Object.values(r.staff).map(c => [c[0], c[1]]));
    // предметы не делят клеток и стоят внутри помещения
    const owner = new Map<number, number>();
    l.things.forEach((t, i) => {
      for (const [x, y] of t.cells) {
        const k = y * l.w + x;
        expect(owner.has(k)).toBe(false);
        owner.set(k, i);
        expect(x > r.x && y > r.y && x < r.x + r.w - 1 && y < r.y + r.h - 1).toBe(true);
      }
    });
    // длинные — в две клетки; в одну — только если вторая отрезала бы часть помещения от двери (центральная нижняя
    // койка реанимации на шесть коек), и такая — одна на помещение
    const short = l.things.filter(t => isLong(t.kind, t.type) && t.cells.length < 2);
    expect(short.length).toBeLessThanOrEqual(type === 'room.ricu' && size === 'L' ? 1 : 0);
    // клетка за дверью свободна, от неё достижимо всё
    const door = doorInside(l, 0);
    expect(l.walk[door]).toBe(1);
    const ok = reach(l, door);
    for (const c of Object.values(r.staff)) expect(ok.has(target(l, c))).toBe(true);
    if (r.patient) expect(ok.has(target(l, r.patient))).toBe(true);
    for (const c of [...r.seats, ...r.beds]) expect(ok.has(target(l, c))).toBe(true);
  });
});

describe('раскладка готовых больниц', () => {
  test.each(['preset.city', 'preset.district', 'preset.clinic', 'preset.village', 'preset.vascular'])('%s: все места достижимы от входа', id => {
    const { layout: l, staff } = presetLayout(db, id);
    const [ex, ey] = l.plan.entrance;
    const ok = reach(l, ey * l.w + ex);
    const cells = staffCells(l.plan, staff, db);
    for (const c of cells) expect(ok.has(target(l, c))).toBe(true);
    for (const r of l.plan.rooms) {
      if (!l.plan.connected[r.id]) continue;
      if (r.patient) expect(ok.has(target(l, r.patient))).toBe(true);
      for (const c of [...r.seats, ...r.beds]) expect(ok.has(target(l, c))).toBe(true);
    }
    // скамьи коридора стоят на проходимых клетках коридора и не перекрывают его
    for (const t of l.things.filter(x => x.room < 0)) expect(l.plan.grid.cells[t.cell[1] * l.w + t.cell[0]]).toBe(2);
  });
});
