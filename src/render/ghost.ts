// Призраки стройки (spec docs/specs/2026-10-build.md, «Экран и управление»): прямоугольник помещения со стенами, предмет
// его моделью, дверь, подсветка клеток того, что снесут, — полупрозрачно, зелёным (можно) или красным (нельзя).
// Отдельные небольшие сетки поверх сцены: двигаются за мышью, пересобираются, только когда меняется, что показывать.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Cell } from '../content/types';
import { furnishThing } from './furniture';
import type { Thing } from './layout';
import type { Model } from './models';
import { DOOR_H, WALL_T } from './world';

/** Можно — зелёный, нельзя — красный, снос — красный. */
export const GHOST_OK = 0x3fbf7f;
export const GHOST_BAD = 0xe0533f;

const ghostMat = (color: number, opacity: number) =>
  new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });

/** Высота призрака стены: стены в стройке опущены, призрак — чуть выше них. */
const WALL = 0.6;

function dispose(g: THREE.Object3D) {
  g.traverse(o => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry.dispose();
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) mat.dispose();
  });
}

export class Ghosts {
  readonly group = new THREE.Group();
  private roomG = new THREE.Group();
  private roomKey = '';
  private itemG = new THREE.Group();
  private itemKey = '';
  private doorG = new THREE.Group();
  private doorKey = '';
  private marks: THREE.InstancedMesh;
  private m4 = new THREE.Matrix4();
  private color = new THREE.Color();

  constructor(private models: Map<string, Model>) {
    this.group.name = 'build ghosts';
    this.group.add(this.roomG, this.itemG, this.doorG);
    const quad = new THREE.PlaneGeometry(0.94, 0.94).rotateX(-Math.PI / 2);
    this.marks = new THREE.InstancedMesh(quad, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false }), 512);
    this.marks.count = 0;
    this.marks.frustumCulled = false;
    this.marks.setColorAt(0, this.color.set(GHOST_OK));
    this.group.add(this.marks);
    this.group.renderOrder = 10;
  }

  /** Прямоугольник помещения со стенами (`null` — нет). */
  room(r: { x: number; y: number; w: number; h: number } | null, ok: boolean) {
    const key = r ? `${r.x},${r.y},${r.w},${r.h},${ok}` : '';
    if (key === this.roomKey) return;
    this.roomKey = key;
    dispose(this.roomG);
    this.roomG.clear();
    if (!r) return;
    const color = ok ? GHOST_OK : GHOST_BAD;
    if (r.w > 2 && r.h > 2) {
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(r.w - 2, r.h - 2).rotateX(-Math.PI / 2), ghostMat(color, 0.28));
      floor.position.set(r.x + r.w / 2, 0.03, r.y + r.h / 2);
      this.roomG.add(floor);
    }
    const t = WALL_T * 1.6;
    const wall = (x: number, z: number, w: number, d: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, WALL, d), ghostMat(color, 0.55));
      m.position.set(x, WALL / 2, z);
      this.roomG.add(m);
    };
    wall(r.x + r.w / 2, r.y + 0.5, r.w - 1 + t, t);
    wall(r.x + r.w / 2, r.y + r.h - 0.5, r.w - 1 + t, t);
    wall(r.x + 0.5, r.y + r.h / 2, t, r.h - 1);
    wall(r.x + r.w - 0.5, r.y + r.h / 2, t, r.h - 1);
  }

  /** Предмет его моделью: `t` — предмет раскладки в клетке (x, y). */
  item(t: Thing | null, ok: boolean) {
    if (!t) {
      this.itemG.visible = false;
      return;
    }
    const [x, y] = t.cell;
    // модель строится в клетке (0, 0) и переносится: призрак за мышью не пересобирается
    const rel: Thing = { ...t, cell: [0, 0], cells: t.cells.map(([cx, cy]): Cell => [cx - x, cy - y]) };
    const key = `${t.kind}|${t.equipment ?? ''}|${t.type}|${rel.cells.map(c => c.join(',')).join(';')}|${t.yaw.toFixed(3)}|${ok}`;
    if (key !== this.itemKey) {
      this.itemKey = key;
      dispose(this.itemG);
      this.itemG.clear();
      const b = furnishThing(rel, this.models);
      const geos = [...b.colored, ...b.textured, ...b.glow].map(g => {
        const out = new THREE.BufferGeometry();
        out.setAttribute('position', g.attributes.position);
        if (g.attributes.normal) out.setAttribute('normal', g.attributes.normal);
        else out.computeVertexNormals();
        return out;
      });
      const merged = geos.length ? mergeGeometries(geos) : null;
      if (merged) this.itemG.add(new THREE.Mesh(merged, ghostMat(ok ? GHOST_OK : GHOST_BAD, 0.6)));
      // клетки предмета — подсветкой на полу
      for (const [cx, cy] of rel.cells) {
        const q = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.96).rotateX(-Math.PI / 2), ghostMat(ok ? GHOST_OK : GHOST_BAD, 0.35));
        q.position.set(cx + 0.5, 0.025, cy + 0.5);
        this.itemG.add(q);
      }
    }
    this.itemG.position.set(x, 0, y);
    this.itemG.visible = true;
  }

  /** Дверь в клетках стены; `out` — наружу. */
  door(cells: Cell[] | null, out: Cell, ok: boolean) {
    const key = cells ? `${cells.map(c => c.join(',')).join(';')}|${out.join(',')}|${ok}` : '';
    if (key === this.doorKey) return;
    this.doorKey = key;
    dispose(this.doorG);
    this.doorG.clear();
    if (!cells) return;
    const alongX = out[0] === 0;
    for (const [x, y] of cells) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(alongX ? 0.96 : 0.34, DOOR_H, alongX ? 0.34 : 0.96), ghostMat(ok ? GHOST_OK : GHOST_BAD, 0.5));
      m.position.set(x + 0.5, DOOR_H / 2, y + 0.5);
      this.doorG.add(m);
    }
  }

  /** Подсветка клеток: что снесут, курсор. */
  cells(cells: readonly Cell[], color: number) {
    const n = Math.min(cells.length, 512);
    for (let i = 0; i < n; i++) {
      this.m4.makeTranslation(cells[i][0] + 0.5, 0.04, cells[i][1] + 0.5);
      this.marks.setMatrixAt(i, this.m4);
      this.marks.setColorAt(i, this.color.set(color));
    }
    this.marks.count = n;
    this.marks.instanceMatrix.needsUpdate = true;
    if (this.marks.instanceColor) this.marks.instanceColor.needsUpdate = true;
  }

  clear() {
    this.room(null, true);
    this.item(null, true);
    this.door(null, [0, 1], true);
    this.cells([], GHOST_OK);
  }
}
