// Размеры для моделей Blender (docs/reports/2026-11-blender-pilot.md; blender/README.md) — из игры, а не на глаз: сколько
// клеток занимает предмет (длинные — две по 1 м, layout.ts `isLong`), высота постели (`LIE_TOP`), габарит нынешней модели
// кодом (furniture.ts — та же раскладка, тот же предмет) и палитра больницы (`PALETTE`), у кровати — где стойка капельницы.
// Для запечённого света — готовое помещение, как его строит игра (рентген-кабинет M без поворота): стены и дверь по клеткам
// плана, высота стен, предметы раскладки с местом, поворотом и размером, светильники (lamps.ts, `lampPoints`).
// Скрипты blender/*.py читают только этот файл.
//
// Часть 2 (docs/specs/2026-11-blender-2.md): для моделей групп из blender/budgets.json — то же для заменяемых моделей кодом
// (`codes`: габарит, высота постели, сдвиг места) и место из каталога для заменяемых моделей наборов (`kits`: габарит места,
// высота сиденья, у стены ли, перекраски по имени материала, компьютер на столе); кабинка санузла — из `TOILET`.
//
//   npm run content && bun tools/app/blender-sizes.ts   → blender/sizes.json
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { db } from '../../src/content';
import type { Id, ObjectKind, RoomSizeId } from '../../src/content/types';
import { addReady, emptySite, planOfSite } from '../../src/engine/hospital/site';
import { BLENDER_CODE, BLENDER_KIT, CATALOG, type Code, entryOf, EXTRA_MODELS } from '../../src/render/catalog';
import { benchItem, CODE_SHIFT, furnishThing, IV_AT, LIE_TOP, PALETTE, TOILET, toiletSpots } from '../../src/render/furniture';
import { lampPoints } from '../../src/render/lamps';
import { isLong, layoutOf, type Thing } from '../../src/render/layout';
import type { Model } from '../../src/render/models';
import { WALL_H, WALL_T } from '../../src/render/world';
import { furnitureModels } from '../test/render-kit';

const OUT = join(import.meta.dir, '../../blender/sizes.json');
const BUDGETS = JSON.parse(readFileSync(join(import.meta.dir, '../../blender/budgets.json'), 'utf8')) as {
  light: Record<string, Id[]>;
  models: Record<string, { group: number; replaces: string; decor?: true; tris: number }>;
};

/** Предметы пилота: вид предмета, помещение (у кровати палаты — капельница), аппарат с места шаблона. */
const ITEMS: { name: string; kind: ObjectKind; type: Id; equipment?: Id; code: 'bed' | 'monitor' | 'xray' }[] = [
  { name: 'bed', kind: 'bed', type: 'room.ward', code: 'bed' },
  { name: 'monitor', kind: 'monitor', type: 'room.icu', equipment: 'eq.monitor_defib', code: 'monitor' },
  { name: 'xray', kind: 'xray', type: 'room.xray', equipment: 'eq.xray_digital', code: 'xray' },
];

/** Где стоит вещь, которую заменяет модель кодом части 2: вид предмета и помещение (по ним — запись каталога). */
const CODE_AT: Partial<Record<Code, { kind: ObjectKind; type: Id; equipment?: Id }>> = {
  counter: { kind: 'desk', type: 'room.reception' },
  examCouch: { kind: 'couch', type: 'room.office' },
  labBench: { kind: 'table', type: 'room.lab' },
  analyzer: { kind: 'analyzer', type: 'room.lab' },
  procedureTable: { kind: 'table', type: 'room.procedure' },
  ecg: { kind: 'ecg', type: 'room.ecg' },
  // группа 2: кровать палаты — со стойкой капельницы; монитор и ИВЛ — аппараты с места шаблона
  bed: { kind: 'bed', type: 'room.ward' },
  monitor: { kind: 'monitor', type: 'room.icu', equipment: 'eq.monitor_defib' },
  ventilator: { kind: 'anesthesia', type: 'room.ricu', equipment: 'eq.ventilator' },
  // группа 3: аппараты диагностики и пульт кабинета
  xray: { kind: 'xray', type: 'room.xray', equipment: 'eq.xray_digital' },
  ct: { kind: 'ct', type: 'room.ct' },
  mri: { kind: 'mri', type: 'room.mri' },
  us: { kind: 'us', type: 'room.ultrasound' },
  console: { kind: 'table', type: 'room.xray' },
  // группа 4: операционная и эндоскопия — аппараты с места шаблона; эндоскопическая стойка стоит на месте аппарата УЗИ
  orTable: { kind: 'or_table', type: 'room.or', equipment: 'eq.or_table' },
  anesthesia: { kind: 'anesthesia', type: 'room.or', equipment: 'eq.anesthesia' },
  instrumentTable: { kind: 'table', type: 'room.or' },
  endoscope: { kind: 'us', type: 'room.endoscopy', equipment: 'eq.videoendoscope' },
};


const round = (v: number) => Math.round(v * 1000) / 1000;
const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** Предметы пилота: место в клетках, высота постели, габарит модели кодом, у кровати — где капельница. */
function itemsOf(): Record<string, unknown> {
  const items: Record<string, unknown> = {};
  for (const it of ITEMS) {
    const long = isLong(it.kind, it.type);
    const cells: [number, number][] = long ? [[0, 0], [0, 1]] : [[0, 0]];
    const t: Thing = { kind: it.kind, room: 0, type: it.type, cell: [0, 0], cells, face: [0, 1], yaw: 0, ...(it.equipment ? { equipment: it.equipment } : {}) };
    const batch = furnishThing(t, new Map());
    // габарит модели кодом в осях предмета: середина места — (0,5; 1) у длинных и (0,5; 0,5) у остальных
    const box = new THREE.Box3();
    for (const g of [...batch.colored, ...batch.glow]) {
      g.computeBoundingBox();
      box.union(g.boundingBox!);
    }
    const cz = long ? 1 : 0.5;
    items[it.name] = {
      cells: [1, cells.length],
      ...(LIE_TOP[it.code] !== undefined ? { lieTop: LIE_TOP[it.code] } : {}),
      code: { min: [round(box.min.x - 0.5), round(box.min.y), round(box.min.z - cz)], max: [round(box.max.x - 0.5), round(box.max.y), round(box.max.z - cz)], tris: Math.round(batch.tris) },
      ...(it.name === 'bed' ? { iv: [...IV_AT] } : {}),
    };
  }
  return items;
}

/** Габарит модели кодом в осях её места (середина места — 0), м; треугольников. */
function codeBox(kind: ObjectKind, type: Id, models: Map<string, Model>, equipment?: Id): { min: number[]; max: number[]; tris: number } {
  const long = isLong(kind, type);
  const cells: [number, number][] = long ? [[0, 0], [0, 1]] : [[0, 0]];
  const t: Thing = { kind, room: 0, type, cell: [0, 0], cells, face: [0, 1], yaw: 0, ...(equipment ? { equipment } : {}) };
  const batch = furnishThing(t, models);
  const box = new THREE.Box3();
  for (const g of [...batch.colored, ...batch.textured, ...batch.glow]) {
    g.computeBoundingBox();
    box.union(g.boundingBox!);
  }
  const cz = long ? 1 : 0.5;
  return { min: [round(box.min.x - 0.5), round(box.min.y), round(box.min.z - cz)], max: [round(box.max.x - 0.5), round(box.max.y), round(box.max.z - cz)], tris: Math.round(batch.tris) };
}

const hexMap = (r: Record<string, number>) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, hex(v)]));

/**
 * Модели части 2 (blender/budgets.json): заменяемые модели кодом — их габарит и высота постели (`codes`); заменяемые модели
 * наборов — место из каталога: все записи каталога с этой моделью, их габарит места, сиденье, «у стены», перекраски (`kits`).
 */
function partTwo(models: Map<string, Model>): { codes: Record<string, unknown>; kits: Record<string, unknown> } {
  const codes: Record<string, unknown> = {};
  const kits: Record<string, unknown> = {};
  for (const [name, b] of Object.entries(BUDGETS.models).sort(([a], [c]) => (a < c ? -1 : 1))) {
    if (b.replaces.startsWith('code:')) {
      const code = b.replaces.slice(5) as Code;
      const at = CODE_AT[code];
      if (!at) continue;
      const long = isLong(at.kind, at.type);
      codes[name] = {
        replaces: b.replaces, group: b.group, cells: [1, long ? 2 : 1], code: codeBox(at.kind, at.type, models, at.equipment),
        ...(LIE_TOP[code] !== undefined ? { lieTop: LIE_TOP[code] } : {}), ...(CODE_SHIFT[code] !== undefined ? { shift: CODE_SHIFT[code] } : {}),
      };
      continue;
    }
    if (b.decor && b.replaces === 'kenney/toilet') {
      kits[name] = { replaces: b.replaces, group: b.group, fits: [{ ...TOILET.fit }], back: true, cubicle: { side: { ...TOILET.side }, door: { ...TOILET.door } } };
      continue;
    }
    const entries = Object.values(CATALOG).filter((e): e is Extract<typeof e, { model: string }> => 'model' in e && e.model === b.replaces);
    if (entries.length === 0) continue;
    const fits = [...new Map(entries.map(e => [JSON.stringify(e.fit), e.fit])).values()];
    const recolors = [...new Map(entries.flatMap(e => (e.recolor ? [[JSON.stringify(e.recolor), hexMap(e.recolor)] as const] : []))).values()];
    const e = entries[0];
    kits[name] = {
      replaces: b.replaces, group: b.group, fits, ...(e.seat !== undefined ? { seat: e.seat } : {}), ...(e.back ? { back: true } : {}),
      ...(recolors.length ? { recolors } : {}), ...(entries.some(x => !x.recolor) && recolors.length ? { plain: true } : {}), ...(e.computer ? { computer: true } : {}),
    };
  }
  return { codes, kits };
}

/** Габарит предмета раскладки в его осях: у моделей кодом — по их сетке, у моделей наборов — место из catalog.ts. */
function boxOf(t: Thing, models: Map<string, Model>): { min: number[]; max: number[] } {
  const e = entryOf(t.kind, t.type, t.equipment);
  if (e && 'model' in e) {
    const h = e.fit.h || (e.seat ? 0.85 : 0.75);
    // прижатый к стене (`back`) стоит у задней кромки места, как в furniture.ts (`place`)
    const back = e.back ? -(1 - e.fit.d) / 2 : 0;
    return { min: [-e.fit.w / 2, 0, round(back - e.fit.d / 2)], max: [e.fit.w / 2, h, round(back + e.fit.d / 2)] };
  }
  const one: Thing = { ...t, cell: [0, 0], cells: t.cells.map((_, i) => [0, i] as [number, number]), yaw: 0 };
  const b = new THREE.Box3();
  const batch = furnishThing(one, models);
  for (const g of [...batch.colored, ...batch.textured, ...batch.glow]) {
    g.computeBoundingBox();
    b.union(g.boundingBox!);
  }
  const cz = t.cells.length / 2;
  return { min: [round(b.min.x - 0.5), round(b.min.y), round(b.min.z - cz)], max: [round(b.max.x - 0.5), round(b.max.y), round(b.max.z - cz)] };
}

/** Модель Blender вещи — та, что окно ставит по умолчанию (части 2, `BLENDER_CODE` и `BLENDER_KIT`): имя в blender/. */
const blenderOf = (e: ReturnType<typeof entryOf>): string | undefined => {
  const file = e && ('code' in e ? BLENDER_CODE[e.code] : BLENDER_KIT[e.model]);
  return file?.replace('blender/', '');
};

/**
 * Образец группы части 2 для запекания света (docs/specs/2026-11-blender-2.md, «Запечённый свет») — готовое помещение без
 * поворота, как его ставит игрок (стройка ПК: `addReady`, `planOfSite`; повороты вещей — из образца помещения): на такие и
 * ложится свет. У вещей — модель Blender, которую ставит окно (`blender`), сдвиг места модели кодом (`shift`), что стоит на
 * лабораторном столе (`item`), и кабинки санузла (`decor`). До группы 4 образцы строились помещением «Анамнеза» (`oneRoom`): у
 * части вещей был другой поворот, а в операционной — два наркозных аппарата вместо аппарата и стола (решение агента 16).
 */
function roomOf(type: Id, size: RoomSizeId, models: Map<string, Model>, group: number) {
  const ready = addReady(db, emptySite(), type, size, 20, 10, 0);
  if (!ready.ok) throw new Error(`${type} ${size}: ${JSON.stringify(ready.error)}`);
  const plan = planOfSite(db, ready.site);
  const layout = layoutOf(db, plan, []);
  const n = plan.rooms.findIndex(r => r.id === ready.room);
  const r = plan.rooms[n];
  const cells: string[] = [];
  for (let y = 0; y < r.h; y++) {
    let row = '';
    for (let x = 0; x < r.w; x++) row += String(plan.grid.cells[(r.y + y) * plan.grid.w + r.x + x]);
    cells.push(row);
  }
  const things = layout.things
    .filter(t => t.room === n)
    .map(t => {
      const cx = t.cells.reduce((a, c) => a + c[0] + 0.5, 0) / t.cells.length - r.x;
      const cz = t.cells.reduce((a, c) => a + c[1] + 0.5, 0) / t.cells.length - r.y;
      const e = entryOf(t.kind, t.type, t.equipment);
      const code = e && 'code' in e ? e.code : undefined;
      const blender = blenderOf(e);
      return {
        kind: t.kind, ...(e && 'code' in e ? { code: e.code } : e ? { model: e.model } : {}), ...(blender ? { blender } : {}),
        ...(code && CODE_SHIFT[code] !== undefined ? { shift: CODE_SHIFT[code] } : {}), ...(code === 'labBench' ? { item: benchItem(t) } : {}),
        // стойка капельницы — только у кровати палаты и бокса (furniture.ts, `skipOf`); длинный предмет в одной клетке — вдвое
        // короче (`placeThing`: койка в реанимации, где вторая клетка разрезала бы помещение)
        ...(code === 'bed' ? { iv: t.type === 'room.ward' || t.type === 'room.box' } : {}),
        ...(code && LIE_TOP[code] !== undefined && t.cells.length === 1 ? { short: true } : {}),
        at: [round(cx), round(cz)], yaw: round(t.yaw), box: boxOf(t, models),
      };
    });
  const lamps = lampPoints(layout)
    .filter(p => p.room === n)
    .map(p => [round(p.x - r.x), round(p.z - r.y)]);
  // кабинки санузла — декор окна (furniture.ts, `decorate`): в образце их нет, но тень они дают
  const decor = toiletSpots(layout)
    .filter(s => s.room === n)
    .map(s => ({ kind: 'toilet', blender: blenderOf({ model: 'kenney/toilet', fit: TOILET.fit }), at: [round(s.cell[0] + 0.5 - r.x), round(s.cell[1] + 0.5 - r.y)], yaw: round(s.yaw) }));
  // клетки плана: 1 — пол, 3 — стена, 4 — дверь (engine/hospital/grid.ts, CELL)
  return { w: r.w, h: r.h, cells, wallH: WALL_H, wallT: WALL_T, things, ...(decor.length ? { decor } : {}), lamps, group };
}

/** Модели наборов, без которых не собрать модели кодом (монитор на стойке регистратуры, тумба лабораторного стола). */
export const sizesModels = () => furnitureModels([...EXTRA_MODELS]);

/** Текст blender/sizes.json — из игры сейчас (тест `blender.test.ts` сверяет с ним файл в git); `models` — `sizesModels()`. */
export function sizesJson(models: Map<string, Model>): string {
  const palette = Object.fromEntries(Object.entries(PALETTE).map(([k, v]) => [k.toLowerCase(), hex(v)]));
  // образцы групп части 2 со светом (blender/budgets.json, `light`) — каждого размера; рентген-кабинет M пилота стал образцом
  // группы 3
  const rooms: Record<string, unknown> = {};
  for (const [group, types] of Object.entries(BUDGETS.light)) {
    for (const type of types) for (const z of db.rooms[type].sizes) rooms[`${type}:${z.id}`] = roomOf(type, z.id, models, Number(group));
  }
  return `${JSON.stringify({ about: 'tools/app/blender-sizes.ts — из игры; не править руками', cell: 1, palette, items: itemsOf(), ...partTwo(models), rooms }, null, 1)}\n`;
}

if (import.meta.main) {
  const text = sizesJson(await sizesModels());
  writeFileSync(OUT, text);
  const j = JSON.parse(text);
  console.log(`blender/sizes.json: ${ITEMS.map(it => it.name).join(', ')}; часть 2: ${[...Object.keys(j.codes), ...Object.keys(j.kits)].join(', ')}; ${Object.keys(j.rooms).join(', ')}`);
}
