// Пилот Blender (docs/reports/2026-11-blender-pilot.md; blender/README.md): кровать, монитор у кровати и рентген — модели
// Blender, и запечённый свет рентген-кабинета M. Размеры для скриптов — из игры: blender/sizes.json тот же, что считает
// tools/app/blender-sizes.ts сейчас. У каждого файла assets/models/blender/ — паспорт в assets/LICENSES.md (скрипт, версия
// Blender, SHA-256), и файл тот. Модели собраны из частей: узел .glb называется как часть (капельница кровати — `iv`,
// `iv_bag`: вне палаты её нет), у каждой части — затенение в цвете вершин, габарит — как у модели кодом. Запечённый свет
// ложится на пол рентген-кабинета M при любом повороте помещения и только там, где предметы на своих местах.
import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { db } from '../../src/content';
import { planOf } from '../../src/engine/hospital/build';
import { type BakedRoom, bakedRooms, turnPoint, unturnPoint } from '../../src/render/baked';
import { BLENDER } from '../../src/render/catalog';
import { furnishThing } from '../../src/render/furniture';
import { layoutOf, type Thing } from '../../src/render/layout';
import { sizesJson } from '../app/blender-sizes';
import { furnitureModels, oneRoom, presetLayout } from './render-kit';

const ROOT = join(import.meta.dir, '../..');
const DIR = join(ROOT, 'assets/models/blender');
const sizes = JSON.parse(readFileSync(join(ROOT, 'blender/sizes.json'), 'utf8')) as {
  items: Record<string, { cells: [number, number]; code: { min: number[]; max: number[]; tris: number } }>;
};
const sample = JSON.parse(readFileSync(join(DIR, 'room-xray-M.json'), 'utf8')) as BakedRoom;

/** Части моделей — как в blender/models.py; имя части — имя узла. */
const PARTS: Record<string, string[]> = {
  bed: ['wheels', 'casters', 'frame', 'deck', 'mattress', 'headboard', 'footboard', 'pillow', 'blanket', 'rail_left', 'rail_right', 'iv', 'iv_bag'],
  monitor: ['base', 'wheels', 'stand', 'shelf', 'defib', 'body', 'screen'],
  xray: ['table', 'pad', 'column', 'arm', 'tube', 'collimator', 'detector', 'plate'],
};

describe('пилот Blender: размеры и паспорта', () => {
  test('blender/sizes.json — из игры: тот же, что считает tools/app/blender-sizes.ts сейчас', () => {
    expect(readFileSync(join(ROOT, 'blender/sizes.json'), 'utf8')).toBe(sizesJson());
  });

  test('у каждого файла assets/models/blender/ — паспорт в LICENSES.md: скрипт, Blender 4.5.15, SHA-256 этого файла', () => {
    const lic = readFileSync(join(ROOT, 'assets/LICENSES.md'), 'utf8');
    const files = readdirSync(DIR).sort();
    expect(files).toEqual(['bed.glb', 'monitor.glb', 'room-xray-M.json', 'room-xray-M.png', 'xray.glb']);
    for (const f of files) {
      const row = lic.split('\n').find(l => l.startsWith(`| \`assets/models/blender/${f}\``));
      expect(row, f).toBeDefined();
      const sha = createHash('sha256').update(readFileSync(join(DIR, f))).digest('hex');
      expect(row).toContain(`\`${sha}\``);
      expect(row).toContain('4.5.15');
      expect(row).toMatch(/`blender\/(build|models|room)\.py`/);
    }
  });
});

describe('пилот Blender: модели', async () => {
  const models = await furnitureModels(Object.values(BLENDER) as string[]);

  test('модели собраны из частей: узел .glb — часть из blender/models.py, у каждой части — затенение в цвете вершин', () => {
    for (const [code, file] of Object.entries(BLENDER)) {
      const m = models.get(file!)!;
      expect(new Set(m.parts.map(p => p.node)), code).toEqual(new Set(PARTS[code]));
      for (const p of m.parts) {
        const shade = p.geometry.attributes.color;
        expect(shade, `${code}/${p.node}`).toBeDefined();
        // затенение — множитель от AO_FLOOR (0,35, blender/common.py) до 1
        let lo = 1;
        for (let i = 0; i < shade.count; i++) lo = Math.min(lo, shade.getX(i));
        expect(lo).toBeGreaterThanOrEqual(0.34);
      }
    }
  });

  test('габарит модели — как у модели кодом (blender/sizes.json) с допуском 6 см; стоит на полу', () => {
    for (const [code, file] of Object.entries(BLENDER)) {
      const m = models.get(file!)!;
      const want = sizes.items[code].code;
      // без стойки капельницы: у модели кодом вне палаты её нет, а sizes.json — кровать палаты (с ней)
      const box = new THREE.Box3();
      for (const p of m.parts) {
        p.geometry.computeBoundingBox();
        box.union(p.geometry.boundingBox!);
      }
      expect(box.min.y, code).toBeCloseTo(0, 2);
      for (const [k, axis] of (['x', 'y', 'z'] as const).entries()) {
        expect(Math.abs(box.min[axis] - want.min[k]), `${code} min.${axis}`).toBeLessThan(0.06);
        expect(Math.abs(box.max[axis] - want.max[k]), `${code} max.${axis}`).toBeLessThan(0.06);
      }
    }
  });

  test('в игре: кровать палаты — со стойкой капельницы, кровать вне палаты — без неё; в цвете — затенение', () => {
    const place = (type: string): THREE.BufferGeometry[] => {
      const t: Thing = { kind: 'bed', room: 0, type, cell: [0, 0], cells: [[0, 0], [0, 1]], face: [0, 1], yaw: 0 };
      return furnishThing(t, models).colored;
    };
    const tall = (gs: THREE.BufferGeometry[]) => {
      let y = 0;
      for (const g of gs) {
        g.computeBoundingBox();
        y = Math.max(y, g.boundingBox!.max.y);
      }
      return y;
    };
    // стойка капельницы — 1,9 м; без неё выше всего изголовье (около метра)
    expect(tall(place('room.ward'))).toBeGreaterThan(1.8);
    expect(tall(place('room.icu'))).toBeLessThan(1.2);
    // цвет вершин — цвет материала, помноженный на затенение: есть и тёмные, и светлые вершины одной части
    const colors = place('room.ward').flatMap(g => [...(g.attributes.color.array as Float32Array)]);
    expect(Math.min(...colors)).toBeLessThan(Math.max(...colors) * 0.5);
  });
});

describe('пилот Blender: запечённый свет рентген-кабинета', () => {
  test('точка образца — в помещение и обратно при любом повороте', () => {
    for (let rot = 0; rot < 4; rot++) {
      for (const [x, z] of [
        [0.5, 0.5],
        [3.25, 1.75],
        [7.5, 6.5],
      ]) {
        const [ux, uz] = turnPoint(sample.w, sample.h, rot, x, z);
        const [bx, bz] = unturnPoint(sample.w, sample.h, rot, ux, uz);
        expect(bx).toBeCloseTo(x, 9);
        expect(bz).toBeCloseTo(z, 9);
      }
    }
  });

  test('образец ложится на рентген-кабинет M при каждом из четырёх поворотов и не ложится на кабинет КТ', () => {
    for (const rot of [0, 1, 2, 3] as const) {
      const hs = oneRoom(db, 'room.xray', 'M', rot);
      const plan = planOf(db, hs);
      const layout = layoutOf(db, plan, hs.decor);
      const n = plan.rooms.findIndex(r => r.type === 'room.xray');
      expect(bakedRooms(layout, sample), `поворот ${rot}`).toEqual([n]);
    }
    const hs = oneRoom(db, 'room.ct', 'M', 0);
    const plan = planOf(db, hs);
    expect(bakedRooms(layoutOf(db, plan, hs.decor), sample)).toEqual([]);
  });

  test('в городской больнице — на её рентген-кабинет; картинка — серая, по 64 точки на метр пола', () => {
    const { layout } = presetLayout(db, 'preset.city');
    const xr = layout.plan.rooms.flatMap((r, n) => (r.type === 'room.xray' && r.size === 'M' ? [n] : []));
    expect(xr.length).toBeGreaterThan(0);
    expect(bakedRooms(layout, sample)).toEqual(xr);
    const png = readFileSync(join(DIR, 'room-xray-M.png'));
    // IHDR: ширина, высота, 8 бит, серый
    expect(png.readUInt32BE(16)).toBe((sample.w - 1) * 64);
    expect(png.readUInt32BE(20)).toBe((sample.h - 1) * 64);
    expect(png[24]).toBe(8);
    expect(png[25]).toBe(0);
  });
});
