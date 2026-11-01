// Появление мебели (spec docs/specs/2026-10-aaa-polish.md, «Появление мебели»): новая вещь вырастает из пола с лёгким
// перелётом — до появления её нет; вещи одна за другой, вся стройка — не дольше полусекунды сверх роста; старые вещи и первая
// раскладка не растут. На настоящей стройке: после второго готового помещения новые — ровно его вещи, а номер вещи у каждой
// вершины слитых сеток указывает на вещь рядом с ней. Без WebGL: шейдер повторяет `appearScale`.
import { describe, expect, test } from 'bun:test';
import { db } from '../../src/content';
import { addReady, emptySite, planOfSite, type Site } from '../../src/engine/hospital/site';
import { APPEAR, appearScale, bornOf, LONG_AGO } from '../../src/render/appear';
import { CATALOG, EXTRA_MODELS } from '../../src/render/catalog';
import { furnish } from '../../src/render/furniture';
import { layoutOf } from '../../src/render/layout';
import { furnitureModels } from './render-kit';

describe('появление мебели: рост', () => {
  test('до появления вещи нет; в начале — доля размера, к концу — целиком, по пути — чуть больше целого', () => {
    expect(appearScale(-0.01)).toBe(0);
    expect(appearScale(0)).toBeCloseTo(APPEAR.from, 6);
    expect(appearScale(APPEAR.dur)).toBeCloseTo(1, 6);
    expect(appearScale(APPEAR.dur * 3)).toBeCloseTo(1, 6);
    const xs = Array.from({ length: 101 }, (_, i) => appearScale((APPEAR.dur * i) / 100));
    const peak = Math.max(...xs);
    expect(peak).toBeGreaterThan(1.01);
    expect(peak).toBeLessThan(1.1);
    // растёт до вершины перелёта, потом садится к целому — без скачков
    const top = xs.indexOf(peak);
    for (let i = 1; i <= top; i++) expect(xs[i]).toBeGreaterThanOrEqual(xs[i - 1]);
    for (let i = top + 1; i < xs.length; i++) expect(xs[i]).toBeLessThanOrEqual(xs[i - 1] + 1e-9);
  });

  test('новые — с этой минуты одна за другой, вся стройка — не дольше `last`; старые и первая раскладка — давно', () => {
    expect([...bornOf(['a', 'b'], null, 5)]).toEqual([LONG_AGO, LONG_AGO]);
    const born = bornOf(['a', 'n1', 'b', 'n2', 'n3'], new Set(['a', 'b']), 10);
    expect(born[0]).toBe(LONG_AGO);
    expect(born[2]).toBe(LONG_AGO);
    expect([born[1], born[3], born[4]].map(b => Math.round((b - 10) * 1000) / 1000)).toEqual([0, APPEAR.stagger, 2 * APPEAR.stagger]);
    const many = bornOf(Array.from({ length: 100 }, (_, i) => `k${i}`), new Set(), 0);
    expect(Math.max(...many)).toBeCloseTo(APPEAR.last, 5);
  });
});

describe('появление мебели на стройке', () => {
  const names = [...new Set([...Object.values(CATALOG).flatMap(e => ('model' in e ? [e.model] : [])), ...EXTRA_MODELS])];
  const layoutAt = (site: Site) => layoutOf(db, planOfSite(db, site), site.decor, []);

  test('после второго готового помещения растут ровно его вещи; номер вещи у каждой вершины — вещь рядом', async () => {
    const models = await furnitureModels(names);
    const one = addReady(db, emptySite(), 'room.reception', 'S', 20, 10, 0);
    expect(one.ok).toBe(true);
    if (!one.ok) return;
    const two = addReady(db, one.site, 'room.office', 'M', 32, 10, 0);
    expect(two.ok).toBe(true);
    if (!two.ok) return;
    const before = furnish(layoutAt(one.site), models).batch.owners;
    const layout = layoutAt(two.site);
    const after = furnish(layout, models);
    const owners = after.batch.owners;
    // ключи — свои у каждой вещи
    expect(new Set(owners.map(o => o.key)).size).toBe(owners.length);
    const born = bornOf(
      owners.map(o => o.key),
      new Set(before.map(o => o.key)),
      0,
    );
    const fresh = owners.filter((_, i) => born[i] > LONG_AGO);
    const office = planOfSite(db, two.site).rooms.find(r => r.id === two.room)!;
    const inside = (o: { x: number; z: number }) => o.x >= office.x && o.x <= office.x + office.w && o.z >= office.y && o.z <= office.y + office.h;
    expect(fresh.length).toBeGreaterThan(0);
    expect(fresh.length).toBe(owners.filter(inside).length);
    expect(fresh.every(inside)).toBe(true);
    // вершины слитых сеток: номер вещи есть у каждой и указывает на вещь не дальше 3 м по полу
    const geos = [...after.batch.colored, ...after.batch.textured, ...after.batch.glow];
    let far = 0;
    let none = 0;
    for (const g of geos) {
      const own = g.attributes.owner;
      const pos = g.attributes.position;
      expect(own).toBeDefined();
      for (let i = 0; i < own.count; i += 7) {
        const o = owners[own.getX(i)];
        if (!o) {
          none++;
          continue;
        }
        if (Math.hypot(pos.getX(i) - o.x, pos.getZ(i) - o.z) > 3) far++;
      }
    }
    expect(none).toBe(0);
    expect(far).toBe(0);
  });
});
