// Створки дверей (spec docs/specs/2026-10-shell-3d.md, «Больница на экране»): у двери в одну клетку — одна створка, в две —
// две (в них провозят каталку: палаты, смотровая приёмного, рентген, КТ, МРТ, операционная, реанимация — геймдизайн),
// шире — проём без створок. Створка открывается внутрь, когда рядом человек, и закрывается за ним; у камеры она
// срезается вместе со стенами. Все створки — одна InstancedMesh.
import * as THREE from 'three';
import type { Layout } from './layout';
import { cutAt, WALL_LOW, type Walls } from './world';

const LEAF_H = 2.02;
const LEAF_T = 0.045;
/** Ближе этого к двери кто-то идёт — створка открыта, м. */
export const OPEN_NEAR = 1.25;

interface Leaf {
  /** петля */
  hx: number;
  hz: number;
  /** вдоль стены от петли (закрыта) */
  ax: number;
  az: number;
  /** куда открывается: внутрь помещения */
  ix: number;
  iz: number;
  width: number;
  door: number;
}

export interface DoorState {
  cx: number;
  cz: number;
  /** наружу */
  ox: number;
  oz: number;
  open: number;
  leaves: number[];
}

export interface Doors {
  mesh: THREE.InstancedMesh;
  doors: DoorState[];
  /** открыть и закрыть по людям рядом (`near`), срезать у камеры */
  update(dt: number, near: (x: number, z: number, r: number) => boolean, walls: Walls['uniforms']): void;
}

/** Створки всех дверей раскладки: сколько их у двери — по её ширине. */
export function leavesOf(l: Layout): { leaves: Leaf[]; doors: DoorState[] } {
  const leaves: Leaf[] = [];
  const doors: DoorState[] = [];
  l.doors.forEach((d, di) => {
    const [ox, oz] = d.out;
    const alongX = ox === 0;
    const xs = d.cells.map(c => c[0]);
    const zs = d.cells.map(c => c[1]);
    // проём — от края первой клетки до края последней, по середине стены
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs) + 1;
    const z0 = Math.min(...zs);
    const z1 = Math.max(...zs) + 1;
    const cx = alongX ? (x0 + x1) / 2 : x0 + 0.5;
    const cz = alongX ? z0 + 0.5 : (z0 + z1) / 2;
    const state: DoorState = { cx, cz, ox, oz, open: 0, leaves: [] };
    doors.push(state);
    const n = d.cells.length;
    if (n > 2) return;
    const frame = 0.07;
    const span = (alongX ? x1 - x0 : z1 - z0) - frame * 2;
    const [ax, az] = alongX ? [1, 0] : [0, 1];
    const start = alongX ? x0 + frame : z0 + frame;
    const at = (s: number): [number, number] => (alongX ? [s, cz] : [cx, s]);
    const make = (hinge: number, dir: number, width: number) => {
      const [hx, hz] = at(hinge);
      state.leaves.push(leaves.length);
      leaves.push({ hx, hz, ax: ax * dir, az: az * dir, ix: -ox, iz: -oz, width, door: di });
    };
    if (n === 1) make(start, 1, span);
    else {
      make(start, 1, span / 2 - 0.01);
      make(start + span, -1, span / 2 - 0.01);
    }
  });
  return { leaves, doors };
}

export function buildDoors(l: Layout): Doors {
  const { leaves, doors } = leavesOf(l);
  const geo = new THREE.BoxGeometry(1, LEAF_H, LEAF_T);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55 });
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, leaves.length));
  mesh.name = 'door leaves';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.count = leaves.length;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const entrance = new THREE.Color(0x8fb8c8);
  const leafColor = new THREE.Color(0xdfe5e2);
  leaves.forEach((lf, i) => mesh.setColorAt(i, l.doors[lf.door].room === -1 ? entrance : leafColor));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const shown = new Float32Array(leaves.length * 2).fill(-1);
  const place = (i: number, angle: number, cut: number) => {
    const lf = leaves[i];
    if (Math.abs(shown[i * 2] - angle) < 1e-3 && Math.abs(shown[i * 2 + 1] - cut) < 1e-3) return false;
    shown[i * 2] = angle;
    shown[i * 2 + 1] = cut;
    // направление створки от петли: закрыта — вдоль стены, открыта — внутрь
    const dx = Math.cos(angle) * lf.ax + Math.sin(angle) * lf.ix;
    const dz = Math.cos(angle) * lf.az + Math.sin(angle) * lf.iz;
    const k = 1 + (WALL_LOW / LEAF_H - 1) * cut;
    q.setFromAxisAngle(up, Math.atan2(-dz, dx));
    p.set(lf.hx + (dx * lf.width) / 2, (LEAF_H * k) / 2, lf.hz + (dz * lf.width) / 2);
    s.set(lf.width, k, 1);
    mesh.setMatrixAt(i, m.compose(p, q, s));
    return true;
  };
  leaves.forEach((_, i) => place(i, 0, 0));
  return {
    mesh,
    doors,
    update(dt, near, walls) {
      let changed = false;
      for (const d of doors) {
        if (!d.leaves.length) continue;
        const target = near(d.cx, d.cz, OPEN_NEAR) ? 1 : 0;
        d.open += (target - d.open) * Math.min(1, dt * 7);
        if (Math.abs(target - d.open) < 0.01) d.open = target;
        const cut = cutAt(walls, d.cx, d.cz, d.ox, d.oz);
        for (const i of d.leaves) changed = place(i, (d.open * Math.PI) / 2 * 0.95, cut) || changed;
      }
      if (changed) mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
