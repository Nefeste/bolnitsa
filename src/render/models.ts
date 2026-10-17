// из spikes/render-3d: src/assets.ts (мебель: модель → части с цветом материала) — изменено: посадочная точка по
// геометрии сиденья.
//
// Мебель CC0 (assets/models, сжата meshopt — tools/app/assets.mjs). Модель раскладывается на «части» — геометрия в
// координатах модели и цвет материала; потом все предметы сцены сливаются в несколько больших сеток (furniture.ts).
// Чистый Three.js без DOM: посадочные точки проверяют тесты в Bun (tools/test/seats.test.ts).
import * as THREE from 'three';
import { subset, toFloat } from './bake';

export interface Part {
  geometry: THREE.BufferGeometry;
  /** имя материала из модели — по нему перекрашиваем (одеяло, обивка) */
  mat: string;
  color: THREE.Color;
  /** текстура-атлас (у наборов KayKit) или null */
  map: THREE.Texture | null;
}

export interface Model {
  name: string;
  parts: Part[];
  box: THREE.Box3;
}

export interface Index {
  kenney: string[];
  kaykit: string[];
  people: string[];
}

/** Части модели из разобранного glTF: геометрия каждой группы материала — в координатах модели. */
export function modelOf(gltf: { scene: THREE.Object3D }, name: string): Model {
  gltf.scene.updateMatrixWorld(true);
  const parts: Part[] = [];
  gltf.scene.traverse(o => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const base = toFloat(mesh.geometry);
    base.applyMatrix4(mesh.matrixWorld);
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const groups = mesh.geometry.groups.length ? mesh.geometry.groups : [{ start: 0, count: base.index!.count, materialIndex: 0 }];
    for (const gr of groups) {
      const m = mats[gr.materialIndex ?? 0] as THREE.MeshStandardMaterial;
      parts.push({ geometry: subset(base, gr.start, gr.count), mat: m.name, color: m.color.clone(), map: m.map ?? null });
    }
  });
  const box = new THREE.Box3();
  for (const p of parts) {
    p.geometry.computeBoundingBox();
    box.union(p.geometry.boundingBox!);
  }
  return { name, parts, box };
}

/** Сиденье модели в её координатах: высота верха, середина и края. */
export interface Seat {
  y: number;
  x: number;
  z: number;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/**
 * Сиденье по геометрии: среди горизонтальных граней, смотрящих вверх, — высота с наибольшей площадью ниже 70 % высоты
 * модели (спинка и подлокотники выше и меньше). Середина — центр этой площади. Так человек садится на сиденье, а не на
 * спинку и не в середину коробки модели.
 */
export function seatOf(model: Model): Seat | null {
  const top = model.box.max.y;
  const bottom = model.box.min.y;
  const area = new Map<number, number>();
  const tris: { y: number; a: number; cx: number; cz: number; x0: number; x1: number; z0: number; z1: number }[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (const p of model.parts) {
    const pos = p.geometry.attributes.position;
    const idx = p.geometry.index!.array as ArrayLike<number>;
    for (let i = 0; i < idx.length; i += 3) {
      a.fromBufferAttribute(pos, idx[i]);
      b.fromBufferAttribute(pos, idx[i + 1]);
      c.fromBufferAttribute(pos, idx[i + 2]);
      n.subVectors(b, a).cross(c.clone().sub(a));
      const len = n.length();
      if (len === 0 || n.y / len < 0.95) continue;
      const y = (a.y + b.y + c.y) / 3;
      if (y > bottom + (top - bottom) * 0.7 || y < bottom + (top - bottom) * 0.15) continue;
      const ar = len / 2;
      const yk = Math.round(y * 200);
      area.set(yk, (area.get(yk) ?? 0) + ar);
      tris.push({
        y, a: ar, cx: (a.x + b.x + c.x) / 3, cz: (a.z + b.z + c.z) / 3,
        x0: Math.min(a.x, b.x, c.x), x1: Math.max(a.x, b.x, c.x), z0: Math.min(a.z, b.z, c.z), z1: Math.max(a.z, b.z, c.z),
      });
    }
  }
  let best = -1;
  let bestArea = 0;
  for (const [yk, ar] of area) {
    if (ar > bestArea) {
      bestArea = ar;
      best = yk;
    }
  }
  if (best < 0) return null;
  const level = tris.filter(t => Math.abs(Math.round(t.y * 200) - best) <= 1);
  let sx = 0;
  let sz = 0;
  let sa = 0;
  let y = -Infinity;
  const s: Seat = { y: 0, x: 0, z: 0, x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
  for (const t of level) {
    sx += t.cx * t.a;
    sz += t.cz * t.a;
    sa += t.a;
    y = Math.max(y, t.y);
    s.x0 = Math.min(s.x0, t.x0);
    s.x1 = Math.max(s.x1, t.x1);
    s.z0 = Math.min(s.z0, t.z0);
    s.z1 = Math.max(s.z1, t.z1);
  }
  return { ...s, y, x: sx / sa, z: sz / sa };
}

/** Самая высокая точка модели над точкой (x, z) в её координатах — для проверки, что над сиденьем нет спинки. */
export function heightAt(model: Model, x: number, z: number, below = Infinity): number {
  const ray = new THREE.Ray(new THREE.Vector3(x, 100, z), new THREE.Vector3(0, -1, 0));
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const hit = new THREE.Vector3();
  let best = -Infinity;
  for (const p of model.parts) {
    const pos = p.geometry.attributes.position;
    const idx = p.geometry.index!.array as ArrayLike<number>;
    for (let i = 0; i < idx.length; i += 3) {
      a.fromBufferAttribute(pos, idx[i]);
      b.fromBufferAttribute(pos, idx[i + 1]);
      c.fromBufferAttribute(pos, idx[i + 2]);
      if (ray.intersectTriangle(a, b, c, false, hit) && hit.y < below && hit.y > best) best = hit.y;
    }
  }
  return best;
}
