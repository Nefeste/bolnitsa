// Каталки (spec docs/specs/2026-10-orderlies.md, «Что видно»): модель кодом — рама на четырёх колёсах, матрас с простынёй,
// низкие поручни и ручка у изголовья. Каталка стоит у места санитара, а пока он везёт — перед ним: пустая, когда он идёт за
// больным и возвращается, с лежачим — когда везёт. Каталок у движка нет (spec, «Чего здесь нет»: у каждого санитара своя):
// где они, решает окно по перевозкам (`Population.gurneys`). Оси — как у предметов: перёд на +z, изголовье — на −z, к тому,
// кто везёт; размеры — как у кушетки, верх матраса — `GURNEY_TOP`.
import * as THREE from 'three';
import { GURNEY_TOP } from './crowd';

/** Где каталка в этом кадре: середина и поворот. */
export interface GurneyAt {
  x: number;
  z: number;
  yaw: number;
}

const STEEL = 0xb9c2c8;
const STEEL_D = 0x6f7a82;
const SHEET = 0xe9eff1;
const PAD = 0x7fb3c8;
const TYRE = 0x2e3338;

/** Одна каталка: части — меши с общими материалами; клонами из запаса делятся и геометрии. */
function build(): THREE.Group {
  const g = new THREE.Group();
  const mats = new Map<number, THREE.MeshStandardMaterial>();
  const mat = (c: number) => {
    let m = mats.get(c);
    if (!m) mats.set(c, (m = new THREE.MeshStandardMaterial({ color: c, roughness: c === STEEL || c === STEEL_D ? 0.35 : 0.7, metalness: c === STEEL || c === STEEL_D ? 0.4 : 0 })));
    return m;
  };
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, c: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c));
    m.position.set(x, y + h / 2, z);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  };
  // колёса — поперёк хода, у четырёх углов
  for (const sx of [-0.27, 0.27]) {
    for (const sz of [-0.82, 0.82]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.045, 14), mat(TYRE));
      w.rotation.z = Math.PI / 2;
      w.position.set(sx, 0.065, sz);
      w.castShadow = true;
      g.add(w);
      box(0.03, 0.34, 0.03, sx, 0.12, sz, STEEL_D);
    }
  }
  box(0.6, 0.05, 1.86, 0, 0.46, 0, STEEL); // рама
  box(0.58, 0.07, 1.82, 0, 0.51, 0, PAD); // матрас
  box(0.6, 0.08, 1.84, 0, GURNEY_TOP - 0.08, 0, SHEET); // простыня
  for (const sx of [-0.31, 0.31]) box(0.025, 0.12, 1.3, sx, GURNEY_TOP - 0.04, 0.1, STEEL); // поручни
  // ручка у изголовья — за неё и везут
  for (const sx of [-0.26, 0.26]) box(0.025, 0.42, 0.025, sx, 0.5, -0.93, STEEL_D);
  box(0.56, 0.03, 0.03, 0, 0.92, -0.93, STEEL);
  return g;
}

/** Каталки на карте: запас групп, каждый кадр — столько, сколько нужно. */
export class Gurneys {
  readonly group = new THREE.Group();
  private readonly proto = build();
  private readonly pool: THREE.Group[] = [];

  /** Каталки этого кадра: лишние прячутся, недостающие берутся из запаса. */
  frame(list: readonly GurneyAt[]) {
    while (this.pool.length < list.length) {
      const g = this.proto.clone();
      this.pool.push(g);
      this.group.add(g);
    }
    for (let i = 0; i < this.pool.length; i++) {
      const g = this.pool[i];
      const at = list[i];
      g.visible = at !== undefined;
      if (!at) continue;
      g.position.set(at.x, 0, at.z);
      g.rotation.y = at.yaw;
    }
  }

  /** Сколько каталок видно — для сценария в браузере. */
  get shown(): number {
    return this.pool.filter(g => g.visible).length;
  }
}
