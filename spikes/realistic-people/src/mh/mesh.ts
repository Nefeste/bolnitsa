// Сетка Three.js из .obj MakeHuman: вершина Three — пара (вершина, координата текстуры), четырёхугольники — по два
// треугольника. Положения берутся из массива исходных вершин (тело с целями или подогнанное прокси), нормали считаются по
// исходным вершинам — на швах развёртки свет не рвётся. Единицы MakeHuman — дециметры, здесь — метры.
import * as THREE from 'three';
import type { Obj } from './formats';

export const UNIT = 0.1;

export class MhMesh {
  readonly geometry = new THREE.BufferGeometry();
  /** вершина Three → исходная вершина */
  private vmap: Uint32Array;
  /** треугольники в исходных вершинах — для нормалей */
  private tri: Uint32Array;
  private nSrc: number;
  private acc: Float32Array;
  readonly tris: number;

  constructor(obj: Obj, keep: (face: number) => boolean = () => true) {
    const key = new Map<number, number>();
    const vmap: number[] = [];
    const uv: number[] = [];
    const index: number[] = [];
    const tri: number[] = [];
    const corner = (v: number, t: number) => {
      const k = v * 65536 + t;
      let i = key.get(k);
      if (i === undefined) {
        i = vmap.length;
        key.set(k, i);
        vmap.push(v);
        uv.push(obj.vt[t * 2], obj.vt[t * 2 + 1]);
      }
      return i;
    };
    for (let f = 0; f < obj.fSize.length; f++) {
      if (!keep(f)) continue;
      const s = obj.fStart[f];
      const n = obj.fSize[f];
      const ids: number[] = [];
      for (let k = 0; k < n; k++) ids.push(corner(obj.fv[s + k], obj.ft[s + k]));
      for (let k = 1; k + 1 < n; k++) {
        index.push(ids[0], ids[k], ids[k + 1]);
        tri.push(obj.fv[s], obj.fv[s + k], obj.fv[s + k + 1]);
      }
    }
    this.vmap = new Uint32Array(vmap);
    this.tri = new Uint32Array(tri);
    this.nSrc = obj.v.length / 3;
    this.acc = new Float32Array(this.nSrc * 3);
    this.tris = index.length / 3;
    const g = this.geometry;
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vmap.length * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(vmap.length * 3), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(index), 1));
  }

  /** Новые положения исходных вершин (дециметры) → положения и нормали сетки. */
  update(src: Float32Array) {
    const acc = this.acc;
    acc.fill(0);
    const t = this.tri;
    for (let i = 0; i < t.length; i += 3) {
      const a = t[i] * 3;
      const b = t[i + 1] * 3;
      const c = t[i + 2] * 3;
      const ux = src[b] - src[a];
      const uy = src[b + 1] - src[a + 1];
      const uz = src[b + 2] - src[a + 2];
      const vx = src[c] - src[a];
      const vy = src[c + 1] - src[a + 1];
      const vz = src[c + 2] - src[a + 2];
      // нормаль грани с весом площади
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      acc[a] += nx;
      acc[a + 1] += ny;
      acc[a + 2] += nz;
      acc[b] += nx;
      acc[b + 1] += ny;
      acc[b + 2] += nz;
      acc[c] += nx;
      acc[c + 1] += ny;
      acc[c + 2] += nz;
    }
    const pos = this.geometry.attributes.position.array as Float32Array;
    const nrm = this.geometry.attributes.normal.array as Float32Array;
    for (let i = 0; i < this.vmap.length; i++) {
      const s = this.vmap[i] * 3;
      pos[i * 3] = src[s] * UNIT;
      pos[i * 3 + 1] = src[s + 1] * UNIT;
      pos[i * 3 + 2] = src[s + 2] * UNIT;
      const l = Math.hypot(acc[s], acc[s + 1], acc[s + 2]) || 1;
      nrm[i * 3] = acc[s] / l;
      nrm[i * 3 + 1] = acc[s + 1] / l;
      nrm[i * 3 + 2] = acc[s + 2] / l;
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.normal.needsUpdate = true;
    this.geometry.computeBoundingSphere();
    this.geometry.computeBoundingBox();
  }
}
