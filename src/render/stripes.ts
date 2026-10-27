// Полосы на полу у дверей (spec docs/specs/2026-10-departments.md, часть 2; геймдизайн §3, «Отделение»): у входа в
// помещение отделения — полоса его цвета на полу коридора, как краска в настоящей больнице; у служб и общих помещений
// полосы нет. Одна сетка на всю больницу, вершины в цвет; пересобирается, когда меняются отделения или план. Освещена, как
// пол: тот же свет светильников (карта света пола, `uv1`) и тени — днём и ночью она лежит на полу, а не светится над ним.
import * as THREE from 'three';
import type { Layout } from './layout';
import { WALL_T } from './world';

/** Полоса начинается за стеной и уходит в коридор на столько, м. */
const NEAR = WALL_T / 2 + 0.06;
const FAR = NEAR + 0.34;
/** Шире проёма с каждой стороны, м. */
const SIDE = 0.18;
/** Над полом, м: ниже подсветки слоя (0,035) и заметно выше плитки. */
const Y = 0.008;

export class DoorStripes {
  readonly group = new THREE.Group();
  readonly material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  private mesh: THREE.Mesh | undefined;
  private layout: Layout | undefined;
  private colors: readonly (number | null)[] = [];
  private c = new THREE.Color();

  /** Помещения плана — заново (стройка); карта света — та же, что у пола. */
  setLayout(layout: Layout, lightMap?: THREE.Texture) {
    this.layout = layout;
    this.material.lightMap = lightMap ?? null;
    this.material.needsUpdate = true;
    // номера помещений — по новому плану: цвета пришлёт окно (`set`)
    this.colors = [];
    this.build();
  }

  /** Цвет полосы каждого помещения плана; null — без полосы. Те же цвета — ничего не делать. */
  set(colors: readonly (number | null)[]) {
    if (colors.length === this.colors.length && colors.every((c, i) => c === this.colors[i])) return;
    this.colors = [...colors];
    this.build();
  }

  /** Сколько полос лежит — для сценария в браузере. */
  get count(): number {
    return this.mesh ? (this.mesh.geometry.getAttribute('position').count / 6) : 0;
  }

  private build() {
    if (this.mesh) {
      this.group.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh = undefined;
    }
    const l = this.layout;
    if (!l) return;
    const quads: { x0: number; z0: number; x1: number; z1: number; color: number }[] = [];
    for (const d of l.doors) {
      const color = d.room >= 0 ? this.colors[d.room] : null;
      if (color === null || color === undefined) continue;
      const [ox, oz] = d.out;
      const xs = d.cells.map(c => c[0]);
      const zs = d.cells.map(c => c[1]);
      // проём — по середине стены, как у створок (doors.ts); полоса — снаружи, в сторону коридора
      if (ox === 0) {
        const wall = Math.min(...zs) + 0.5;
        const a = wall + oz * NEAR;
        const b = wall + oz * FAR;
        quads.push({ x0: Math.min(...xs) - SIDE, x1: Math.max(...xs) + 1 + SIDE, z0: Math.min(a, b), z1: Math.max(a, b), color });
      } else {
        const wall = Math.min(...xs) + 0.5;
        const a = wall + ox * NEAR;
        const b = wall + ox * FAR;
        quads.push({ x0: Math.min(a, b), x1: Math.max(a, b), z0: Math.min(...zs) - SIDE, z1: Math.max(...zs) + 1 + SIDE, color });
      }
    }
    if (quads.length === 0) return;
    const n = quads.length * 6;
    const pos = new Float32Array(n * 3);
    const nor = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const uv1 = new Float32Array(n * 2);
    quads.forEach((q, i) => {
      this.c.setHex(q.color);
      // два треугольника лицом вверх, обход — как у плиток пола (world.ts)
      const v = [q.x0, q.z0, q.x0, q.z1, q.x1, q.z1, q.x0, q.z0, q.x1, q.z1, q.x1, q.z0];
      for (let j = 0; j < 6; j++) {
        const k = i * 6 + j;
        pos[k * 3] = v[j * 2];
        pos[k * 3 + 1] = Y;
        pos[k * 3 + 2] = v[j * 2 + 1];
        nor[k * 3 + 1] = 1;
        col[k * 3] = this.c.r;
        col[k * 3 + 1] = this.c.g;
        col[k * 3 + 2] = this.c.b;
        uv1[k * 2] = v[j * 2] / l.w;
        uv1[k * 2 + 1] = 1 - v[j * 2 + 1] / l.h;
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2));
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.receiveShadow = true;
    this.mesh.name = 'door stripes';
    this.group.add(this.mesh);
  }
}
