// Размеры для моделей Blender (docs/reports/2026-11-blender-pilot.md; blender/README.md) — из игры, а не на глаз: сколько
// клеток занимает предмет (длинные — две по 1 м, layout.ts `isLong`), высота постели (`LIE_TOP`), габарит нынешней модели
// кодом (furniture.ts — та же раскладка, тот же предмет) и палитра больницы (`PALETTE`), у кровати — где стойка капельницы.
// Для запечённого света — готовое помещение, как его строит игра (рентген-кабинет M без поворота): стены и дверь по клеткам
// плана, высота стен, предметы раскладки с местом, поворотом и размером, светильники (lamps.ts, `lampPoints`).
// Скрипты blender/*.py читают только этот файл.
//
//   npm run content && bun tools/app/blender-sizes.ts   → blender/sizes.json
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { db } from '../../src/content';
import type { Id, ObjectKind, RoomSizeId } from '../../src/content/types';
import { planOf } from '../../src/engine/hospital/build';
import { entryOf } from '../../src/render/catalog';
import { furnishThing, IV_AT, LIE_TOP, PALETTE } from '../../src/render/furniture';
import { lampPoints } from '../../src/render/lamps';
import { isLong, layoutOf, type Thing } from '../../src/render/layout';
import { WALL_H, WALL_T } from '../../src/render/world';
import { oneRoom } from '../test/render-kit';

const OUT = join(import.meta.dir, '../../blender/sizes.json');

/** Предметы пилота: вид предмета, помещение (у кровати палаты — капельница), аппарат с места шаблона. */
const ITEMS: { name: string; kind: ObjectKind; type: Id; equipment?: Id; code: 'bed' | 'monitor' | 'xray' }[] = [
  { name: 'bed', kind: 'bed', type: 'room.ward', code: 'bed' },
  { name: 'monitor', kind: 'monitor', type: 'room.icu', equipment: 'eq.monitor_defib', code: 'monitor' },
  { name: 'xray', kind: 'xray', type: 'room.xray', equipment: 'eq.xray_digital', code: 'xray' },
];

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

/** Габарит предмета раскладки в его осях: у моделей кодом — по их сетке, у моделей наборов — место из catalog.ts. */
function boxOf(t: Thing): { min: number[]; max: number[] } {
  const e = entryOf(t.kind, t.type, t.equipment);
  if (e && 'model' in e) {
    const h = e.fit.h || (e.seat ? 0.85 : 0.75);
    // прижатый к стене (`back`) стоит у задней кромки места, как в furniture.ts (`place`)
    const back = e.back ? -(1 - e.fit.d) / 2 : 0;
    return { min: [-e.fit.w / 2, 0, round(back - e.fit.d / 2)], max: [e.fit.w / 2, h, round(back + e.fit.d / 2)] };
  }
  const one: Thing = { ...t, cell: [0, 0], cells: t.cells.map((_, i) => [0, i] as [number, number]), yaw: 0 };
  const b = new THREE.Box3();
  for (const g of [...furnishThing(one, new Map()).colored, ...furnishThing(one, new Map()).glow]) {
    g.computeBoundingBox();
    b.union(g.boundingBox!);
  }
  const cz = t.cells.length / 2;
  return { min: [round(b.min.x - 0.5), round(b.min.y), round(b.min.z - cz)], max: [round(b.max.x - 0.5), round(b.max.y), round(b.max.z - cz)] };
}

/** Готовое помещение без поворота, как его ставит игра (render-kit `oneRoom`: помещение на участке, вокруг коридор). */
function roomOf(type: Id, size: RoomSizeId) {
  const hs = oneRoom(db, type, size, 0);
  const plan = planOf(db, hs);
  const layout = layoutOf(db, plan, hs.decor);
  const n = plan.rooms.findIndex(r => r.type === type);
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
      return { kind: t.kind, ...(e && 'code' in e ? { code: e.code } : e ? { model: e.model } : {}), at: [round(cx), round(cz)], yaw: round(t.yaw), box: boxOf(t) };
    });
  const lamps = lampPoints(layout)
    .filter(p => p.room === n)
    .map(p => [round(p.x - r.x), round(p.z - r.y)]);
  // клетки плана: 1 — пол, 3 — стена, 4 — дверь (engine/hospital/grid.ts, CELL)
  return { w: r.w, h: r.h, cells, wallH: WALL_H, wallT: WALL_T, things, lamps };
}

/** Текст blender/sizes.json — из игры сейчас (тест `blender.test.ts` сверяет с ним файл в git). */
export function sizesJson(): string {
  const palette = Object.fromEntries(Object.entries(PALETTE).map(([k, v]) => [k.toLowerCase(), hex(v)]));
  const rooms = { 'room.xray:M': roomOf('room.xray', 'M') };
  return `${JSON.stringify({ about: 'tools/app/blender-sizes.ts — из игры; не править руками', cell: 1, palette, items: itemsOf(), rooms }, null, 1)}\n`;
}

if (import.meta.main) {
  writeFileSync(OUT, sizesJson());
  console.log(`blender/sizes.json: ${ITEMS.map(it => it.name).join(', ')}, ${Object.keys(JSON.parse(sizesJson()).rooms).join(', ')}`);
}
