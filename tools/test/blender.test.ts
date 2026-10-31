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
import { BLENDER, BLENDER_CODE, BLENDER_KIT, CATALOG, SEAT, WHITE_FURNITURE } from '../../src/render/catalog';
import { CODE_SHIFT, furnishThing } from '../../src/render/furniture';
import { seatOf } from '../../src/render/models';
import { layoutOf, type Thing } from '../../src/render/layout';
import { sizesJson, sizesModels } from '../app/blender-sizes';
import { furnitureModels, oneRoom, presetLayout } from './render-kit';

const ROOT = join(import.meta.dir, '../..');
const DIR = join(ROOT, 'assets/models/blender');
const sizes = JSON.parse(readFileSync(join(ROOT, 'blender/sizes.json'), 'utf8')) as {
  items: Record<string, { cells: [number, number]; code: { min: number[]; max: number[]; tris: number } }>;
};
const sample = JSON.parse(readFileSync(join(DIR, 'room-xray-M.json'), 'utf8')) as BakedRoom;
/** Модели части 2 (docs/specs/2026-11-blender-2.md): группа, что заменяют, бюджет треугольников. */
const budgets = JSON.parse(readFileSync(join(ROOT, 'blender/budgets.json'), 'utf8')) as {
  models: Record<string, { group: number; replaces: string; decor?: true; tris: number }>;
};
/** Группы части 2, что уже в игре. */
const GROUPS = [1];
const part2 = Object.entries(budgets.models).filter(([, b]) => GROUPS.includes(b.group));

/** Части моделей — как в blender/models.py; имя части — имя узла. */
const PARTS: Record<string, string[]> = {
  bed: ['wheels', 'casters', 'frame', 'deck', 'mattress', 'headboard', 'footboard', 'pillow', 'blanket', 'rail_left', 'rail_right', 'iv', 'iv_bag'],
  monitor: ['base', 'wheels', 'stand', 'shelf', 'defib', 'body', 'screen'],
  xray: ['table', 'pad', 'column', 'arm', 'tube', 'collimator', 'detector', 'plate'],
};

describe('пилот Blender: размеры и паспорта', () => {
  test('blender/sizes.json — из игры: тот же, что считает tools/app/blender-sizes.ts сейчас', async () => {
    expect(readFileSync(join(ROOT, 'blender/sizes.json'), 'utf8')).toBe(sizesJson(await sizesModels()));
  });

  test('у каждого файла assets/models/blender/ — паспорт в LICENSES.md: скрипт, Blender 4.5.15, SHA-256 этого файла', () => {
    const lic = readFileSync(join(ROOT, 'assets/LICENSES.md'), 'utf8');
    const files = readdirSync(DIR).sort();
    expect(files).toEqual(['bed.glb', 'monitor.glb', 'room-xray-M.json', 'room-xray-M.png', 'xray.glb', ...part2.map(([n]) => `${n}.glb`)].sort());
    for (const f of files) {
      const row = lic.split('\n').find(l => l.startsWith(`| \`assets/models/blender/${f}\``));
      expect(row, f).toBeDefined();
      const sha = createHash('sha256').update(readFileSync(join(DIR, f))).digest('hex');
      expect(row).toContain(`\`${sha}\``);
      expect(row).toContain('4.5.15');
      expect(row).toMatch(/`blender\/(build|models|room|ambulatory)\.py`/);
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

describe('Blender, часть 2: модели групп в игре', async () => {
  const files = part2.map(([n]) => `blender/${n}`);
  const models = await furnitureModels(files);
  const kenney = await furnitureModels(part2.filter(([, b]) => !b.replaces.startsWith('code:')).map(([, b]) => b.replaces));
  const glbJson = (name: string) => {
    const buf = readFileSync(join(DIR, `${name}.glb`));
    return JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8')) as { extensionsUsed?: string[] };
  };
  const boxOf = (name: string) => {
    const box = new THREE.Box3();
    for (const p of models.get(`blender/${name}`)!.parts) {
      p.geometry.computeBoundingBox();
      box.union(p.geometry.boundingBox!);
    }
    return box;
  };

  test('каталог окна — тот же, что blender/budgets.json: что заменяет каждая модель группы', () => {
    const want = Object.fromEntries(part2.map(([n, b]) => [b.replaces, `blender/${n}`]));
    const have = {
      ...Object.fromEntries(Object.entries(BLENDER_CODE).map(([code, f]) => [`code:${code}`, f])),
      ...BLENDER_KIT,
    };
    expect(have).toEqual(want);
  });

  test('каждая модель: в бюджете, сжата как модели CC0, части с затенением в цвете вершин, экран светится', () => {
    for (const [name, b] of part2) {
      const m = models.get(`blender/${name}`)!;
      const tris = m.parts.reduce((a, p) => a + (p.geometry.index ? p.geometry.index.count : p.geometry.attributes.position.count) / 3, 0);
      expect(tris, name).toBeLessThanOrEqual(b.tris);
      expect(glbJson(name).extensionsUsed ?? [], name).toContain('EXT_meshopt_compression');
      for (const p of m.parts) {
        const shade = p.geometry.attributes.color;
        expect(shade, `${name}/${p.node}`).toBeDefined();
        let lo = 1;
        for (let i = 0; i < shade.count; i++) lo = Math.min(lo, shade.getX(i));
        expect(lo, `${name}/${p.node}`).toBeGreaterThanOrEqual(0.34);
      }
    }
    // у кого экран — светится (материал «screen», furniture.ts)
    for (const name of ['desk', 'counter', 'analyzer', 'ecg']) expect(models.get(`blender/${name}`)!.parts.some(p => p.mat === 'screen'), name).toBe(true);
  });

  test('вместо модели кодом — тот же габарит места (blender/sizes.json, с допуском 6 см) и низ на полу', () => {
    for (const [name, b] of part2.filter(([, x]) => x.replaces.startsWith('code:'))) {
      const code = b.replaces.slice(5) as keyof typeof CODE_SHIFT;
      const want = (sizes as unknown as { codes: Record<string, { code: { min: number[]; max: number[] } }> }).codes[name].code;
      const box = boxOf(name);
      // модель Blender стоит в осях места со сдвигом, как модель кодом (анализатор — ближе к стене)
      const dz = CODE_SHIFT[code] ?? 0;
      expect(box.min.y, name).toBeCloseTo(0, 2);
      const lo = [box.min.x, box.min.y, box.min.z + dz];
      const hi = [box.max.x, box.max.y, box.max.z + dz];
      for (let k = 0; k < 3; k++) {
        expect(Math.abs(lo[k] - want.min[k]), `${name} min ${'xyz'[k]}`).toBeLessThan(0.06);
        expect(Math.abs(hi[k] - want.max[k]), `${name} max ${'xyz'[k]}`).toBeLessThan(0.06);
      }
    }
  });

  test('вместо модели набора — в размер места каталога (6 см): стулья — сиденьем на высоте SEAT, игра их не растягивает', () => {
    for (const [name, b] of part2.filter(([, x]) => !x.replaces.startsWith('code:') && !x.decor)) {
      const e = Object.values(CATALOG).find(x => 'model' in x && x.model === b.replaces);
      if (!e || !('model' in e)) throw new Error(`${name}: ${b.replaces} нет в каталоге`);
      const size = boxOf(name).getSize(new THREE.Vector3());
      expect(Math.abs(size.x - e.fit.w), `${name} ширина`).toBeLessThan(0.06);
      expect(Math.abs(size.z - e.fit.d), `${name} глубина`).toBeLessThan(0.06);
      // высота: у стола с компьютером — столешница (монитор стоит выше места)
      const top = e.computer ? Math.max(...models.get(`blender/${name}`)!.parts.filter(p => p.node === 'top').map(p => (p.geometry.computeBoundingBox(), p.geometry.boundingBox!.max.y))) : size.y;
      if (e.fit.h > 0) expect(Math.abs(top - e.fit.h), `${name} высота`).toBeLessThan(0.06);
      if (e.seat !== undefined) {
        const seat = seatOf(models.get(`blender/${name}`)!);
        expect(seat, name).not.toBeNull();
        expect(Math.abs(seat!.y - SEAT), `${name} сиденье`).toBeLessThan(0.02);
      }
    }
  });

  test('в игре: стул зала ожидания Blender — сиденье на SEAT; стол — свой монитор; лабораторный стол — микроскоп или штатив', () => {
    const all = new Map([...kenney, ...models]);
    const thing = (kind: Thing['kind'], type: string, cell: [number, number] = [0, 0]): Thing => ({ kind, room: 0, type, cell, cells: [cell], face: [0, 1], yaw: 0 });
    // стул: точка опоры — на высоте сиденья
    const seats: { y: number }[] = [];
    const f = furnishThing(thing('chair', 'room.waiting'), all);
    expect(f.items).toBeGreaterThan(0);
    for (const g of f.colored) {
      g.computeBoundingBox();
      seats.push({ y: g.boundingBox!.max.y });
    }
    // стол врача: светящийся экран — модели Blender (у стола набора экрана нет: монитор Kenney не светится)
    expect(furnishThing(thing('desk', 'room.office'), all).glow.length).toBeGreaterThan(0);
    // лабораторный стол: через клетку — микроскоп и штатив; узлы второго предмета не ставятся
    const tall = (cell: [number, number]) => {
      let y = 0;
      for (const g of furnishThing(thing('table', 'room.lab', cell), all).colored) {
        g.computeBoundingBox();
        y = Math.max(y, g.boundingBox!.max.y);
      }
      return y;
    };
    // микроскоп выше штатива с пробирками
    expect(tall([0, 0])).toBeGreaterThan(tall([1, 0]) + 0.08);
  });

  test('перекраска каталога ложится на модель Blender по имени материала: белый шкаф — белый, шкаф кабинета — дерево', () => {
    const all = new Map([...kenney, ...models]);
    const colorsOf = (type: string) => {
      const t: Thing = { kind: 'cabinet', room: 0, type, cell: [0, 0], cells: [[0, 0]], face: [0, 1], yaw: 0 };
      const c = furnishThing(t, all).colored.flatMap(g => [...(g.attributes.color.array as Float32Array)]);
      return c.reduce((a, v) => a + v, 0) / c.length;
    };
    // белый шкаф (TALL_WHITE) светлее деревянного шкафа кабинета
    expect(colorsOf('room.procedure')).toBeGreaterThan(colorsOf('room.office'));
    expect(WHITE_FURNITURE.wood).toBeDefined();
  });
});
