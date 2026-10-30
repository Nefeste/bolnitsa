// Запечённый свет на полу готового помещения (пилот Blender, docs/reports/2026-11-blender-pilot.md; blender/room.py): серая
// картинка-множитель — затенение (AO) и мягкие тени от светильников, запечённые в Blender для образца помещения. Ложится на
// пол каждого помещения того же образца — того же типа и размера, с предметами на своих местах (иначе тени были бы не от
// тех вещей) — при любом повороте. Только под ключом ?baked=1: у светильников в игре теней нет (lamps.ts), а GTAO видит лишь
// то, что в кадре; без ключа пол как был.
import * as THREE from 'three';
import type { Layout } from './layout';

/** Образец: тип и размер помещения, его клетки без поворота и где стоят предметы (середина места, в клетках). */
export interface BakedRoom {
  key: string;
  type: string;
  size: string;
  w: number;
  h: number;
  things: { kind: string; at: [number, number] }[];
}

/** Над полом, м: под полосами у дверей (0,008) и окраской слоёв. */
const Y = 0.004;

/** Точка образца (tx, tz) — в клетках помещения на участке при повороте `rot` (как `turn` в build.ts, но не по клеткам). */
export function turnPoint(w: number, h: number, rot: number, tx: number, tz: number): [number, number] {
  if (rot === 0) return [tx, tz];
  if (rot === 1) return [h - tz, tx];
  if (rot === 2) return [w - tx, h - tz];
  return [tz, w - tx];
}

/** Обратно: точка помещения на участке — в образец. */
export function unturnPoint(w: number, h: number, rot: number, ux: number, uz: number): [number, number] {
  if (rot === 0) return [ux, uz];
  if (rot === 1) return [uz, h - ux];
  if (rot === 2) return [w - ux, h - uz];
  return [w - uz, ux];
}

const sig = (list: { kind: string; at: [number, number] }[]) =>
  list
    .map(t => `${t.kind}@${t.at[0].toFixed(2)},${t.at[1].toFixed(2)}`)
    .sort()
    .join(';');

/** Помещения раскладки, на пол которых ложится запечённый свет образца: тот же тип и размер, те же предметы на тех же местах. */
export function bakedRooms(layout: Layout, room: BakedRoom): number[] {
  const want = sig(room.things);
  const out: number[] = [];
  layout.plan.rooms.forEach((r, n) => {
    if (r.type !== room.type || r.size !== room.size) return;
    const things = layout.things
      .filter(t => t.room === n)
      .map(t => {
        const cx = t.cells.reduce((a, c) => a + c[0] + 0.5, 0) / t.cells.length - r.x;
        const cz = t.cells.reduce((a, c) => a + c[1] + 0.5, 0) / t.cells.length - r.y;
        return { kind: t.kind, at: unturnPoint(room.w, room.h, r.rot, cx, cz) };
      });
    if (sig(things) === want) out.push(n);
  });
  return out;
}

export class BakedFloors {
  readonly group = new THREE.Group();
  private material: THREE.MeshBasicMaterial | undefined;

  constructor(
    private room: BakedRoom,
    map: THREE.Texture,
  ) {
    // строка картинки — z образца, без переворота; числа — уже линейные (множитель)
    map.flipY = false;
    map.colorSpace = THREE.NoColorSpace;
    map.needsUpdate = true;
    // множитель пола: результат = картинка × то, что уже нарисовано (три.js r186: только с premultipliedAlpha)
    this.material = new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, blending: THREE.MultiplyBlending, premultipliedAlpha: true, fog: false });
    this.group.renderOrder = 1;
  }

  /** Раскладка — заново (стройка): плоскость на пол каждого подходящего помещения; отдаёт, сколько их. */
  setLayout(layout: Layout): number {
    for (const m of [...this.group.children]) {
      this.group.remove(m);
      (m as THREE.Mesh).geometry.dispose();
    }
    const { w, h } = this.room;
    for (const n of bakedRooms(layout, this.room)) {
      const r = layout.plan.rooms[n];
      // пол образца — от середины стены до середины стены (blender/room.py, `floor_mesh`)
      const corners: [number, number][] = [
        [0.5, 0.5],
        [w - 0.5, 0.5],
        [w - 0.5, h - 0.5],
        [0.5, h - 0.5],
      ];
      const pos: number[] = [];
      const uv: number[] = [];
      for (const k of [0, 3, 2, 0, 2, 1]) {
        const [tx, tz] = corners[k];
        const [ux, uz] = turnPoint(w, h, r.rot, tx, tz);
        pos.push(r.x + ux, Y, r.y + uz);
        uv.push((tx - 0.5) / (w - 1), (tz - 0.5) / (h - 1));
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      const mesh = new THREE.Mesh(g, this.material);
      mesh.name = `baked ${this.room.key} ${r.id}`;
      // лицом вверх при любом повороте: обход меняется вместе с поворотом — пусть рисуется с обеих сторон
      this.material!.side = THREE.DoubleSide;
      this.group.add(mesh);
    }
    return this.group.children.length;
  }
}
