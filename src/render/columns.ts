// Слой «Показатели» (spec docs/specs/2026-10-metrics-layer.md): объёмные столбики над помещениями — одна сетка с
// экземплярами на всю больницу, один вызов отрисовки. Высоты и цвета считает окно (src/app/metrics.ts, `columnOf`), здесь —
// показать: столбик плавно идёт к новой высоте, цвет меняется сразу. Щелчок и наведение — по самому столбику (`pick`).
// Без света сцены: грани затенены раз и навсегда (верх светлее, бока темнее) — цвет читается и ночью, и в тени стен.
import * as THREE from 'three';
import type { Layout } from './layout';

/** Сторона столбика, м: по меньшей стороне помещения, в пределах. */
const SIDE_MIN = 0.7;
const SIDE_MAX = 1.6;
/** За сколько секунд столбик проходит около двух третей пути к новой высоте. */
const EASE = 0.25;

export class Columns {
  readonly group = new THREE.Group();
  private mesh: THREE.InstancedMesh | undefined;
  private geo = shadedBox();
  private mat = new THREE.MeshBasicMaterial({ vertexColors: true });
  /** середина и сторона каждого помещения плана */
  private spots: { x: number; z: number; side: number }[] = [];
  private now: number[] = [];
  private target: number[] = [];
  private m = new THREE.Matrix4();
  private c = new THREE.Color();
  private ray = new THREE.Raycaster();

  constructor() {
    this.group.visible = false;
  }

  /** Помещения плана — заново (стройка): по столбику на помещение, в его середине. */
  setLayout(layout: Layout) {
    if (this.mesh) {
      this.group.remove(this.mesh);
      this.mesh.dispose();
    }
    const rooms = layout.plan.rooms;
    this.spots = rooms.map(r => ({ x: r.x + r.w / 2, z: r.y + r.h / 2, side: Math.min(SIDE_MAX, Math.max(SIDE_MIN, Math.min(r.w, r.h) * 0.22)) }));
    this.now = rooms.map(() => 0);
    this.target = rooms.map(() => 0);
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, Math.max(1, rooms.length));
    this.mesh.count = rooms.length;
    // столбики выше стен и над крышей помещений: границы сетки меняются с высотами — не отсекать
    this.mesh.frustumCulled = false;
    for (let i = 0; i < rooms.length; i++) this.mesh.setColorAt(i, this.c.setHex(0x4f6a78));
    this.place();
    this.group.add(this.mesh);
  }

  /** Высоты и цвета столбиков — по помещениям плана (10 раз в секунду); цвет — сразу, высота — плавно (`frame`). */
  set(columns: readonly { height: number; color: number }[]) {
    if (!this.mesh) return;
    columns.forEach((col, i) => {
      if (i >= this.target.length) return;
      this.target[i] = col.height;
      this.mesh!.setColorAt(i, this.c.setHex(col.color));
    });
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  /** Кадр: столбики идут к своей высоте; слой только что включили — сразу на месте. */
  frame(dt: number) {
    if (!this.mesh || !this.group.visible) return;
    const k = 1 - Math.exp(-dt / EASE);
    let moved = false;
    for (let i = 0; i < this.now.length; i++) {
      const d = this.target[i] - this.now[i];
      if (Math.abs(d) < 1e-3) continue;
      this.now[i] += d * k;
      moved = true;
    }
    if (moved) this.place();
  }

  /** Показать или спрятать; при показе — высоты сразу целевые, без роста от пола. */
  show(on: boolean) {
    if (on && !this.group.visible) {
      this.now = [...this.target];
      this.place();
    }
    this.group.visible = on;
  }

  /** Помещение плана под точкой экрана — по столбику; нет — -1. */
  pick(ndc: THREE.Vector2, camera: THREE.Camera): number {
    if (!this.mesh || !this.group.visible) return -1;
    this.ray.setFromCamera(ndc, camera);
    const hit = this.ray.intersectObject(this.mesh, false)[0];
    return hit?.instanceId ?? -1;
  }

  /** Сколько столбиков видно и их высоты — для сценария в браузере. */
  get heights(): number[] {
    return this.group.visible ? [...this.now] : [];
  }

  /** Верх столбика помещения `i` сейчас — над ним число (src/app/collabels.ts). */
  top(i: number): { x: number; y: number; z: number } | undefined {
    const s = this.spots[i];
    return s ? { x: s.x, y: this.now[i], z: s.z } : undefined;
  }

  private place() {
    const mesh = this.mesh!;
    this.spots.forEach((s, i) => {
      this.m.makeScale(s.side, Math.max(0.01, this.now[i]), s.side).setPosition(s.x, 0, s.z);
      mesh.setMatrixAt(i, this.m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }
}

/**
 * Коробка с основанием на полу и затенёнными гранями: цвет вершины — доля света грани; цвет экземпляра умножается на неё.
 * Грани BoxGeometry — по порядку +x, −x, +y, −y, +z, −z, по 4 вершины.
 */
function shadedBox(): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const shade = [0.8, 0.6, 1, 0.4, 0.7, 0.55];
  const colors = new Float32Array(g.attributes.position.count * 3);
  for (let v = 0; v < g.attributes.position.count; v++) colors.fill(shade[Math.floor(v / 4)], v * 3, v * 3 + 3);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}
