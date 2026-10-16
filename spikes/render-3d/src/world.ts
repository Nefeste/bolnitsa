// Неподвижная часть сцены: земля, полы, стены с режимами «целые / срез / вниз», мебель и
// оборудование. Всё сливается в несколько больших сеток по материалу — несколько вызовов
// отрисовки на всю больницу, сколько бы предметов в ней ни было.
//
// Мир: x — столбец клетки, z — строка, y — вверх; 1 клетка = 1 м. Модель «смотрит» на +Z;
// поправки для отдельных наборов — FRONT ниже.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Model } from './assets';
import { CELL, H, type Hospital, type Room, type RoomType, type Thing, W } from './hospital';
import type { Stall } from './decor';
import { rng } from './rng';
import { type FloorKind, makeFloor } from './textures';

export const WALL_H = 2.7;
export const WALL_LOW = 0.32;
const WALL_T = 0.16;
const DOOR_H = 2.15;
const WIN_LOW = 0.9;
const WIN_HIGH = 2.15;

const FLOOR_OF: Record<RoomType, FloorKind> = {
  reception: 'hall',
  waiting: 'hall',
  office: 'wood',
  procedure: 'white',
  lab: 'white',
  xray: 'grey',
  ward: 'ward',
  ecg: 'white',
  staff: 'wood',
  toilet: 'toiletTile',
};

// ---------------------------------------------------------------- сборщик слитых сеток

/** Копит геометрию в мировых координатах; в конце — одна сетка на материал. */
class Batch {
  colored: THREE.BufferGeometry[] = [];
  textured: THREE.BufferGeometry[] = [];
  glow: THREE.BufferGeometry[] = [];
  map: THREE.Texture | null = null;
  tris = 0;
  items = 0;

  addColored(g: THREE.BufferGeometry, color: THREE.Color | number, m: THREE.Matrix4, glow = false) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', g.attributes.position.clone());
    if (g.attributes.normal) geo.setAttribute('normal', g.attributes.normal.clone());
    if (g.index) geo.setIndex(g.index.clone());
    let out = geo.index ? geo.toNonIndexed() : geo;
    if (!out.attributes.normal) out.computeVertexNormals();
    out.applyMatrix4(m);
    const c = color instanceof THREE.Color ? color : new THREE.Color(color);
    const n = out.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) c.toArray(col, i * 3);
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out = stripTo(out, ['position', 'normal', 'color']);
    (glow ? this.glow : this.colored).push(out);
    this.tris += n / 3;
  }

  addTextured(g: THREE.BufferGeometry, map: THREE.Texture, m: THREE.Matrix4) {
    this.map = map;
    let out = (g.index ? g.toNonIndexed() : g.clone()) as THREE.BufferGeometry;
    out.applyMatrix4(m);
    out = stripTo(out, ['position', 'normal', 'uv']);
    this.textured.push(out);
    this.tris += out.attributes.position.count / 3;
  }
}

function stripTo(g: THREE.BufferGeometry, keep: string[]): THREE.BufferGeometry {
  for (const k of Object.keys(g.attributes)) if (!keep.includes(k)) g.deleteAttribute(k);
  return g;
}

// ---------------------------------------------------------------- предметы

export interface Fit {
  w: number;
  d: number;
  h: number;
}

/** Перекраска материалов модели по имени: больничная палитра вместо домашней. */
type Recolor = Record<string, number>;

const HOSPITAL_BED: Recolor = { carpet: 0x9cc7d6, carpetDarker: 0x7fb0c2, wood: 0xdde3e6, woodDark: 0xb9c3c8, carpetWhite: 0xf6f8f8, _defaultMat: 0xf2f4f4 };
const WHITE_CABINET: Recolor = { wood: 0xe9ecec, woodDark: 0xc9d0d2 };
const OFFICE_CHAIR: Recolor = { carpet: 0x4d6a73, carpetDarker: 0x3e5860, carpetWhite: 0x4d6a73 };
const RUG: Recolor = { carpet: 0x7aa6a0, carpetDarker: 0x5f8f8a, carpetBlue: 0x7aa6a0, carpetWhite: 0xe6efe9, _defaultMat: 0x7aa6a0 };

/** Поворот, на который у модели набора перёд не на +Z (подобрано по снимку debug=models). */
const FRONT: Record<string, number> = {};

export class Furnisher {
  readonly batch = new Batch();
  constructor(private models: Map<string, Model>) {}

  /**
   * Поставить модель: центр следа (cx, cz), поворот yaw (перёд на +Z при 0), вписать в след
   * fit (ширина × глубина × высота, м) с сохранением пропорций; back — прижать к задней кромке.
   */
  place(name: string, cx: number, cz: number, yaw: number, fit: Fit, opts: { recolor?: Recolor; back?: boolean; y?: number; scale?: number } = {}) {
    const model = this.models.get(name);
    if (!model) throw new Error(`нет модели ${name}`);
    const fr = FRONT[name] ?? 0;
    const b = model.box.clone().applyMatrix4(new THREE.Matrix4().makeRotationY(fr));
    const size = b.getSize(new THREE.Vector3());
    const s = opts.scale ?? Math.min(fit.w / size.x, fit.d / size.z, fit.h / size.y);
    const center = b.getCenter(new THREE.Vector3());
    const back = opts.back ? -(fit.d - size.z * s) / 2 : 0;
    const m = new THREE.Matrix4()
      .makeTranslation(cx, opts.y ?? 0, cz)
      .multiply(new THREE.Matrix4().makeRotationY(yaw))
      .multiply(new THREE.Matrix4().makeTranslation(0, 0, back))
      .multiply(new THREE.Matrix4().makeScale(s, s, s))
      .multiply(new THREE.Matrix4().makeTranslation(-center.x, -b.min.y, -center.z))
      .multiply(new THREE.Matrix4().makeRotationY(fr));
    for (const p of model.parts) {
      if (p.map) this.batch.addTextured(p.geometry, p.map, m);
      else {
        const rc = opts.recolor?.[p.mat];
        this.batch.addColored(p.geometry, rc !== undefined ? new THREE.Color(rc) : p.color, m, p.mat === 'screen');
      }
    }
    this.batch.items++;
    return { top: (opts.y ?? 0) + size.y * s, s };
  }

  /** Коробка кодом в локальных координатах предмета (перёд на +Z), м. */
  box(base: THREE.Matrix4, w: number, h: number, d: number, x: number, y: number, z: number, color: number, glow = false) {
    const g = new THREE.BoxGeometry(w, h, d);
    const m = base.clone().multiply(new THREE.Matrix4().makeTranslation(x, y + h / 2, z));
    this.batch.addColored(g, color, m, glow);
  }

  cyl(base: THREE.Matrix4, r0: number, r1: number, h: number, x: number, y: number, z: number, color: number, seg = 12, rotX = 0) {
    const g = new THREE.CylinderGeometry(r1, r0, h, seg);
    const m = base
      .clone()
      .multiply(new THREE.Matrix4().makeTranslation(x, y, z))
      .multiply(new THREE.Matrix4().makeRotationX(rotX))
      .multiply(new THREE.Matrix4().makeTranslation(0, h / 2, 0));
    this.batch.addColored(g, color, m);
  }
}

function frame(cx: number, cz: number, yaw: number, y = 0): THREE.Matrix4 {
  return new THREE.Matrix4().makeTranslation(cx, y, cz).multiply(new THREE.Matrix4().makeRotationY(yaw));
}

// Оборудование кодом: в наборах CC0 больничного нет (assets/LICENSES.md, «Чего нет в наборах»).
const STEEL = 0xc9d1d5;
const STEEL_D = 0x7d8a90;
const WHITE = 0xf1f3f3;
const MINT = 0x8fc9b9;
const SCREEN = 0x1d3b45;
const DARK = 0x39434a;

function examCouch(f: Furnisher, m: THREE.Matrix4, len: number) {
  // кушетка: рама, мягкий верх, приподнятое изголовье; длина вдоль локальной Z
  for (const sx of [-0.28, 0.28]) for (const sz of [-len / 2 + 0.1, len / 2 - 0.1]) f.box(m, 0.05, 0.55, 0.05, sx, 0, sz, STEEL_D);
  f.box(m, 0.66, 0.06, len - 0.1, 0, 0.55, 0, STEEL);
  f.box(m, 0.62, 0.1, len * 0.7, 0, 0.61, len * 0.12, MINT);
  const head = m.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0.66, -len / 2 + 0.3)).multiply(new THREE.Matrix4().makeRotationX(-0.45));
  f.box(head, 0.62, 0.1, 0.5, 0, -0.05, -0.05, MINT);
  f.box(m, 0.6, 0.02, len * 0.55, 0, 0.71, len * 0.15, 0xf7f7f2); // простыня
}

function ivStand(f: Furnisher, m: THREE.Matrix4) {
  f.cyl(m, 0.18, 0.18, 0.03, 0, 0, 0, STEEL_D, 5);
  f.cyl(m, 0.012, 0.012, 1.85, 0, 0.03, 0, STEEL, 6);
  f.box(m, 0.36, 0.015, 0.015, 0, 1.86, 0, STEEL);
  f.box(m, 0.09, 0.16, 0.04, 0.14, 1.66, 0, 0xe8f4f6);
}

function analyzer(f: Furnisher, m: THREE.Matrix4) {
  f.box(m, 0.8, 0.85, 0.6, 0, 0, 0, WHITE);
  f.box(m, 0.82, 0.05, 0.62, 0, 0.85, 0, 0xd7dcdc);
  f.box(m, 0.36, 0.24, 0.02, -0.12, 0.55, 0.305, SCREEN, true);
  f.box(m, 0.8, 0.05, 0.02, 0, 0.35, 0.305, 0x2f7f86);
  f.box(m, 0.3, 0.3, 0.4, 0.15, 0.9, -0.05, 0xe3e7e7);
  f.box(m, 0.2, 0.06, 0.25, 0.15, 1.2, -0.05, 0x9ab0b8);
}

function ecgCart(f: Furnisher, m: THREE.Matrix4) {
  for (const sx of [-0.2, 0.2]) for (const sz of [-0.15, 0.15]) f.cyl(m, 0.035, 0.035, 0.05, sx, 0, sz, DARK, 8);
  f.box(m, 0.5, 0.06, 0.4, 0, 0.05, 0, STEEL_D);
  f.box(m, 0.05, 0.75, 0.05, 0, 0.1, -0.12, STEEL);
  f.box(m, 0.48, 0.2, 0.38, 0, 0.82, 0, WHITE);
  f.box(m, 0.42, 0.3, 0.05, 0, 1.02, -0.12, DARK);
  f.box(m, 0.36, 0.24, 0.01, 0, 1.05, -0.09, SCREEN, true);
}

function xrayUnit(f: Furnisher, m: THREE.Matrix4) {
  // стол пациента, колонна с трубкой над столом, стойка-детектор
  f.box(m, 0.5, 0.65, 0.5, 0, 0, 0.15, STEEL_D);
  f.box(m, 0.8, 0.08, 2.0, 0, 0.65, 0.15, 0xe6eaeb);
  f.box(m, 0.72, 0.04, 1.6, 0, 0.73, 0.25, 0x6fa9c9);
  f.box(m, 0.22, 2.25, 0.22, -0.75, 0, -0.55, WHITE);
  f.box(m, 0.9, 0.16, 0.18, -0.35, 1.85, -0.55, WHITE);
  f.box(m, 0.36, 0.3, 0.36, 0, 1.55, -0.45, 0xdfe3e3);
  f.cyl(m, 0.12, 0.16, 0.12, 0, 1.43, -0.45, DARK, 14);
  f.box(m, 0.6, 1.4, 0.12, 0.75, 0.35, -0.85, 0xe6eaeb);
}

function console_(f: Furnisher, m: THREE.Matrix4) {
  f.box(m, 0.9, 0.75, 0.55, 0, 0, 0, 0xd9dedf);
  f.box(m, 0.92, 0.04, 0.6, 0, 0.75, 0, 0x7e8b91);
  f.box(m, 0.5, 0.32, 0.04, 0, 0.82, -0.12, DARK);
  f.box(m, 0.46, 0.28, 0.01, 0, 0.84, -0.095, SCREEN, true);
}

function microscope(f: Furnisher, m: THREE.Matrix4) {
  f.box(m, 0.16, 0.03, 0.2, 0, 0, 0, DARK);
  f.box(m, 0.04, 0.24, 0.04, 0, 0.03, -0.07, DARK);
  f.cyl(m, 0.025, 0.025, 0.14, 0, 0.2, 0, 0xe8e8e8, 8, 0.5);
}

function tubes(f: Furnisher, m: THREE.Matrix4) {
  f.box(m, 0.22, 0.05, 0.1, 0, 0, 0, 0xe0e4e4);
  const cols = [0xc94a4a, 0x5a8fd0, 0xe2c044, 0x7bbf6a, 0xc94a4a];
  cols.forEach((c, i) => f.cyl(m, 0.012, 0.012, 0.12, -0.08 + i * 0.04, 0.03, 0, c, 6));
}

function counter(f: Furnisher, m: THREE.Matrix4, len: number) {
  // стойка регистратуры: длина вдоль локальной X, лицом на +Z
  f.box(m, len, 1.05, 0.12, 0, 0, 0.3, 0x5f8f8a);
  f.box(m, len, 0.05, 0.3, 0, 1.05, 0.28, 0xc9a77c);
  f.box(m, len, 0.72, 0.55, 0, 0, -0.05, 0xe7e2d8);
  f.box(m, len, 0.04, 0.6, 0, 0.72, -0.05, 0xc9a77c);
}

// ---------------------------------------------------------------- расстановка по помещениям

interface Side {
  dx: number;
  dy: number;
}

/** С какой стороны у предмета стена (по всем клеткам следа); null — свободно стоит. */
function wallSide(h: Hospital, t: Thing, room: Room): Side | null {
  const sides: Side[] = [
    { dx: 0, dy: -1 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
    { dx: 1, dy: 0 },
  ];
  const doorTop = room.door[1] === room.y;
  const backDy = doorTop ? 1 : -1;
  let best: Side | null = null;
  let bestScore = 0;
  for (const s of sides) {
    let walls = 0;
    let total = 0;
    if (s.dy) {
      const y = s.dy < 0 ? t.y - 1 : t.y + t.h;
      for (let x = t.x; x < t.x + t.w; x++, total++) if (h.cells[y * W + x] === CELL.wall) walls++;
    } else {
      const x = s.dx < 0 ? t.x - 1 : t.x + t.w;
      for (let y = t.y; y < t.y + t.h; y++, total++) if (h.cells[y * W + x] === CELL.wall) walls++;
    }
    if (walls < total) continue;
    const score = 1 + (s.dy === backDy ? 2 : 0) + (s.dy ? 0.5 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return best;
}

function roomOf(h: Hospital, t: Thing): Room {
  return h.rooms.find(r => t.x > r.x && t.x < r.x + r.w - 1 && t.y > r.y && t.y < r.y + r.h - 1) ?? h.rooms[0];
}

export interface Furnished {
  batch: Batch;
}

export function furnish(h: Hospital, models: Map<string, Model>, stalls: Stall[] = []): Furnished {
  const f = new Furnisher(models);
  const r = rng(11);
  for (const t of h.things) {
    const room = roomOf(h, t);
    const side = wallSide(h, t, room);
    const doorTop = room.door[1] === room.y;
    // перёд — от стены; без стены — к двери
    const fdx = side ? -side.dx : 0;
    const fdy = side ? -side.dy : doorTop ? -1 : 1;
    const yaw = Math.atan2(fdx, fdy);
    const alongZ = fdx === 0;
    // след в локальных осях предмета: w — поперёк взгляда, d — вдоль
    const fw = alongZ ? t.w : t.h;
    const fd = alongZ ? t.h : t.w;
    const cx = t.x + t.w / 2;
    const cz = t.y + t.h / 2;
    const at = frame(cx, cz, yaw);
    const back = (d: number) => frame(cx - fdx * (fd - d) * 0.5, cz - fdy * (fd - d) * 0.5, yaw);
    switch (t.kind) {
      case 'bed':
        if (room.type === 'ward') {
          f.place('kenney/bedSingle', cx, cz, yaw, { w: 0.95, d: 2.0, h: 1.0 }, { recolor: HOSPITAL_BED });
          ivStand(f, at.clone().multiply(new THREE.Matrix4().makeTranslation(0.62, 0, -0.75)));
        } else examCouch(f, at, Math.max(fd, 1.9));
        break;
      case 'chair':
        if (room.type === 'waiting') f.place('kenney/chairModernFrameCushion', cx, cz, yaw, { w: 0.78, d: 0.78, h: 1.05 }, { recolor: { carpet: 0x5f8f8a, carpetDarker: 0x4f7b76 } });
        else if (room.type === 'reception' || room.type === 'office') f.place('kenney/chairDesk', cx, cz, yaw, { w: 0.6, d: 0.6, h: 1.0 }, { recolor: OFFICE_CHAIR });
        else f.place('kenney/chair', cx, cz, yaw, { w: 0.5, d: 0.5, h: 0.95 });
        break;
      case 'desk':
        if (room.type === 'reception') {
          counter(f, at, fw - 0.05);
          for (let k = 0; k < Math.floor(fw / 1.5); k++) {
            const off = -fw / 2 + 0.75 + k * 1.5;
            f.place('kenney/computerScreen', cx + Math.cos(yaw) * off, cz - Math.sin(yaw) * off, yaw + Math.PI, { w: 0.55, d: 0.3, h: 0.45 }, { y: 0.76 });
          }
        } else {
          const top = f.place('kenney/desk', cx, cz, yaw, { w: fw * 0.95, d: 0.85, h: 0.8 });
          f.place('kenney/computerScreen', cx, cz, yaw + Math.PI, { w: 0.55, d: 0.25, h: 0.45 }, { y: top.top - 0.02 });
          f.place('kenney/computerKeyboard', cx + fdx * 0.2, cz + fdy * 0.2, yaw + Math.PI, { w: 0.45, d: 0.18, h: 0.05 }, { y: top.top - 0.02 });
        }
        break;
      case 'cabinet':
        if (room.type === 'staff' || room.type === 'xray') f.place('kaykit/cabinet_medium', cx, cz, yaw, { w: 0.95, d: 0.5, h: 1.3 }, { back: true });
        else f.place('kenney/bookcaseClosedDoors', cx, cz, yaw, { w: 0.95, d: 0.45, h: 2.0 }, { back: true, recolor: room.type === 'office' ? {} : WHITE_CABINET });
        break;
      case 'plant':
        if (r() < 0.5) f.place('kenney/pottedPlant', cx, cz, yaw, { w: 0.55, d: 0.55, h: 1.25 });
        else f.place('kaykit/cactus_medium_A', cx, cz, yaw, { w: 0.5, d: 0.5, h: 1.0 });
        break;
      case 'machine':
        if (room.type === 'ecg') ecgCart(f, at);
        else if (room.type === 'xray') console_(f, back(0.6));
        else analyzer(f, back(0.6));
        break;
      case 'sink':
        if (room.type === 'lab') f.place('kenney/kitchenSink', cx, cz, yaw, { w: 0.95, d: 0.65, h: 1.1 }, { back: true });
        else if (room.type === 'toilet') f.place('kenney/bathroomSinkSquare', cx, cz, yaw, { w: 0.6, d: 0.5, h: 1.0 }, { back: true });
        else f.place('kenney/bathroomSink', cx, cz, yaw, { w: 0.55, d: 0.5, h: 1.0 }, { back: true });
        break;
      case 'table':
        if (room.type === 'lab') {
          const top = f.place('kenney/kitchenCabinet', cx, cz, yaw, { w: 1.0, d: 0.65, h: 0.95 }, { back: true, recolor: WHITE_CABINET });
          const item = r();
          const on = back(0.4).clone().multiply(new THREE.Matrix4().makeTranslation(0, top.top, 0));
          if (item < 0.4) microscope(f, on);
          else if (item < 0.8) tubes(f, on);
        } else if (room.type === 'staff') f.place('kenney/table', cx, cz, yaw, { w: fw * 0.9, d: fd * 0.9, h: 0.8 });
        else f.place('kenney/sideTableDrawers', cx, cz, yaw, { w: 0.6, d: 0.5, h: 0.8 }, { recolor: WHITE_CABINET });
        break;
      case 'xray':
        xrayUnit(f, at);
        break;
    }
  }
  // кабинки туалетов: унитаз у боковой стены, перегородки между кабинками
  for (const st of stalls) {
    const cx = st.x + 0.5;
    const cz = st.y + 0.5;
    const yaw = Math.atan2(st.dx, 0);
    f.place('kenney/toilet', cx, cz, yaw, { w: 0.5, d: 0.75, h: 0.85 }, { back: true });
    const m = frame(cx, cz, yaw);
    for (const side of [-0.5, 0.5]) f.box(m, 0.04, 1.7, 0.95, side, 0.12, -0.02, 0x9fb7c4);
  }
  // ковёр в зале ожидания — не мешает проходу
  for (const room of h.rooms) {
    if (room.type === 'waiting' && room.w > 6 && room.h > 6)
      f.place('kenney/rugRectangle', room.x + room.w / 2, room.y + room.h / 2, 0, { w: room.w - 4.4, d: room.h - 4.4, h: 0.05 }, { recolor: RUG });
  }
  return { batch: f.batch };
}

// ---------------------------------------------------------------- полы

function floorKind(h: Hospital): FloorKind[] {
  const k: FloorKind[] = new Array(W * H).fill('corridor');
  for (const room of h.rooms) {
    for (let y = room.y + 1; y < room.y + room.h - 1; y++) for (let x = room.x + 1; x < room.x + room.w - 1; x++) k[y * W + x] = FLOOR_OF[room.type];
    k[room.door[1] * W + room.door[0]] = FLOOR_OF[room.type];
  }
  return k;
}

/** Пол — квадраты по 0,5 м; половинки стеновых клеток берут пол соседа. */
export function buildFloors(h: Hospital, anisotropy: number): THREE.Mesh[] {
  const kind = floorKind(h);
  const isWall = (x: number, y: number) => x < 0 || y < 0 || x >= W || y >= H || h.cells[y * W + x] === CELL.wall;
  const quads = new Map<FloorKind, number[]>();
  const add = (k: FloorKind, x: number, z: number, s: number) => {
    let a = quads.get(k);
    if (!a) quads.set(k, (a = []));
    a.push(x, z, s);
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!isWall(x, y)) {
        add(kind[y * W + x], x, y, 1);
        continue;
      }
      for (let sy = 0; sy < 2; sy++) {
        for (let sx = 0; sx < 2; sx++) {
          const nx = sx ? x + 1 : x - 1;
          const ny = sy ? y + 1 : y - 1;
          let k: FloorKind | null = null;
          if (!isWall(nx, y)) k = kind[y * W + nx];
          else if (!isWall(x, ny)) k = kind[ny * W + x];
          else if (!isWall(nx, ny)) k = kind[ny * W + nx];
          // наружная половинка наружной стены — не пол
          if (!k) {
            if (x === 0 || y === 0 || x === W - 1 || y === H - 1) continue;
            k = 'corridor';
          }
          add(k, x + sx * 0.5, y + sy * 0.5, 0.5);
        }
      }
    }
  }
  const meshes: THREE.Mesh[] = [];
  for (const [k, q] of quads) {
    const tex = makeFloor(k, anisotropy);
    const n = q.length / 3;
    const pos = new Float32Array(n * 18);
    const uv = new Float32Array(n * 12);
    const nor = new Float32Array(n * 18);
    for (let i = 0; i < n; i++) {
      const x = q[i * 3];
      const z = q[i * 3 + 1];
      const s = q[i * 3 + 2];
      const v = [x, z, x, z + s, x + s, z + s, x, z, x + s, z + s, x + s, z];
      for (let j = 0; j < 6; j++) {
        pos[i * 18 + j * 3] = v[j * 2];
        pos[i * 18 + j * 3 + 1] = 0;
        pos[i * 18 + j * 3 + 2] = v[j * 2 + 1];
        nor[i * 18 + j * 3 + 1] = 1;
        uv[i * 12 + j * 2] = v[j * 2] / tex.meters;
        uv[i * 12 + j * 2 + 1] = v[j * 2 + 1] / tex.meters;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const mat = new THREE.MeshStandardMaterial({ map: tex.texture, roughness: k === 'wood' ? 0.6 : 0.45, metalness: 0 });
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true;
    m.name = `пол ${k}`;
    meshes.push(m);
  }
  return meshes;
}

export function buildGround(anisotropy: number): THREE.Mesh[] {
  const grass = makeFloor('grass', anisotropy);
  const asphalt = makeFloor('asphalt', anisotropy);
  const out: THREE.Mesh[] = [];
  const plane = (x0: number, z0: number, x1: number, z1: number, tex: typeof grass, y: number) => {
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
    g.rotateX(-Math.PI / 2);
    g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / tex.meters, p.getZ(i) / tex.meters);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex.texture, roughness: 0.95 }));
    m.receiveShadow = true;
    out.push(m);
  };
  plane(-60, -50, W + 60, H + 60, grass, -0.02);
  // отмостка вокруг здания и дорожка ко входу
  plane(-1.5, -1.5, W + 1.5, H + 1.5, asphalt, -0.01);
  plane(26, H, 34, H + 60, asphalt, -0.005);
  return out;
}

// ---------------------------------------------------------------- стены

export type WallMode = 'full' | 'cut' | 'down';

export interface Walls {
  mesh: THREE.Mesh;
  uniforms: {
    uMode: { value: number };
    uFocus: { value: THREE.Vector2 };
    uRadius: { value: number };
    uToCam: { value: THREE.Vector2 };
  };
  setMode(m: WallMode): void;
}

const WALL_VERT_PARS = /* glsl */ `
attribute vec2 aCenter;
attribute vec2 aOut;
attribute float aKind;
attribute float aBase;
varying float vKind;
uniform float uMode;
uniform vec2 uFocus;
uniform float uRadius;
uniform vec2 uToCam;
varying float vH;
varying vec3 vObjN;
varying float vOut;
float wallCut() {
  if (uMode > 1.5) return 1.0;
  if (uMode < 0.5) return 0.0;
  float d = distance(aCenter, uFocus);
  float near = 1.0 - smoothstep(uRadius * 0.85, uRadius, d);
  // наружная стена, обращённая к камере, срезана всегда
  float front = step(0.3, dot(aOut, uToCam));
  return max(near, front);
}
`;
const WALL_VERT_BEGIN = /* glsl */ `
#include <begin_vertex>
vH = position.y;
vKind = aKind;
vObjN = normal;
vOut = dot(normal.xz, aOut);
float cutK = wallCut();
// куски выше среза (перемычки, стекло, верх наличников) уходят под пол, а не сплющиваются в полосу
float lowY = aBase > ${WALL_LOW.toFixed(2)} ? -0.05 : min(position.y, ${WALL_LOW.toFixed(2)});
transformed.y = mix(position.y, lowY, cutK);
`;

function wallMaterial(uniforms: Walls['uniforms']): { mat: THREE.MeshStandardMaterial; depth: THREE.MeshDepthMaterial } {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0 });
  mat.onBeforeCompile = s => {
    Object.assign(s.uniforms, uniforms);
    s.vertexShader = s.vertexShader.replace('#include <common>', `#include <common>\n${WALL_VERT_PARS}`).replace('#include <begin_vertex>', WALL_VERT_BEGIN);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vH;\nvarying vec3 vObjN;\nvarying float vOut;\nvarying float vKind;')
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        /* glsl */ `
        vec3 wc;
        if (vKind > 1.5) wc = vec3(0.45, 0.33, 0.24);
        else if (vKind > 0.5) wc = vec3(0.62, 0.80, 0.88);
        else if (vObjN.y > 0.5) wc = vec3(0.23, 0.27, 0.29);
        else if (vObjN.y < -0.5) wc = vec3(0.85);
        else if (vOut > 0.5) wc = vH < 0.45 ? vec3(0.46, 0.42, 0.38) : vec3(0.86, 0.80, 0.70);
        else if (vH < 0.95) wc = vec3(0.56, 0.73, 0.71);
        else if (vH < 1.05) wc = vec3(0.37, 0.56, 0.54);
        else wc = vec3(0.93, 0.94, 0.91);
        vec4 diffuseColor = vec4( pow(wc, vec3(2.2)), opacity );`,
      );
  };
  mat.customProgramCacheKey = () => 'walls';
  const depth = new THREE.MeshDepthMaterial();
  depth.onBeforeCompile = s => {
    Object.assign(s.uniforms, uniforms);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>\n${WALL_VERT_PARS}`)
      .replace('#include <begin_vertex>', WALL_VERT_BEGIN.replace('vObjN = normal;', '').replace('vOut = dot(normal.xz, aOut);', '').replace('vKind = aKind;', ''));
  };
  depth.customProgramCacheKey = () => 'walls-depth';
  return { mat, depth };
}

export function buildWalls(h: Hospital): Walls {
  const isWall = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && h.cells[y * W + x] === CELL.wall;
  const isDoor = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && h.cells[y * W + x] === CELL.door;
  const geos: THREE.BufferGeometry[] = [];
  /** Окно — на прямом участке наружной стены, где к ней не примыкает внутренняя, через клетку. */
  const windowAt = (x: number, y: number) => {
    if ((x === 0 || x === W - 1) && (y === 0 || y === H - 1)) return false;
    const alongX = y === 0 || y === H - 1;
    const inX = x === 0 ? 1 : x === W - 1 ? -1 : 0;
    const inY = y === 0 ? 1 : y === H - 1 ? -1 : 0;
    if (alongX) {
      if (!isWall(x - 1, y) || !isWall(x + 1, y) || isWall(x, y + inY) || isWall(x - 1, y + inY) || isWall(x + 1, y + inY)) return false;
      return x % 3 !== 0;
    }
    if (!isWall(x, y - 1) || !isWall(x, y + 1) || isWall(x + inX, y) || isWall(x + inX, y - 1) || isWall(x + inX, y + 1)) return false;
    return y % 3 !== 0;
  };
  // kind: 0 — стена, 1 — стекло окна, 2 — наличник двери
  const piece = (x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, cx: number, cz: number, ox: number, oz: number, kind = 0) => {
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    g.deleteAttribute('uv');
    const n = g.attributes.position.count;
    const c = new Float32Array(n * 2);
    const o = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      c[i * 2] = cx;
      c[i * 2 + 1] = cz;
      o[i * 2] = ox;
      o[i * 2 + 1] = oz;
    }
    g.setAttribute('aCenter', new THREE.BufferAttribute(c, 2));
    g.setAttribute('aOut', new THREE.BufferAttribute(o, 2));
    g.setAttribute('aKind', new THREE.BufferAttribute(new Float32Array(n).fill(kind), 1));
    g.setAttribute('aBase', new THREE.BufferAttribute(new Float32Array(n).fill(y0), 1));
    geos.push(g.toNonIndexed());
  };
  const t2 = WALL_T / 2;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const mx = x + 0.5;
      const mz = y + 0.5;
      // наружная сторона: у краёв плана
      let ox = x === 0 ? -1 : x === W - 1 ? 1 : 0;
      let oz = y === 0 ? -1 : y === H - 1 ? 1 : 0;
      const len = Math.hypot(ox, oz) || 1;
      ox /= len;
      oz /= len;
      const outer = x === 0 || y === 0 || x === W - 1 || y === H - 1;
      if (isWall(x, y) && outer && windowAt(x, y)) {
        // окно в наружной стене: низ, верх и стекло между ними — на всю клетку вдоль стены
        const alongX = y === 0 || y === H - 1;
        const [ax0, ax1, az0, az1] = alongX ? [x, x + 1, mz - t2, mz + t2] : [mx - t2, mx + t2, y, y + 1];
        piece(ax0, ax1, az0, az1, 0, WIN_LOW, mx, mz, ox, oz);
        piece(ax0, ax1, az0, az1, WIN_HIGH, WALL_H, mx, mz, ox, oz);
        const g = 0.025;
        const [gx0, gx1, gz0, gz1] = alongX ? [x, x + 1, mz - g, mz + g] : [mx - g, mx + g, y, y + 1];
        piece(gx0, gx1, gz0, gz1, WIN_LOW, WIN_HIGH, mx, mz, ox, oz, 1);
        // переплёт посередине
        if (alongX) piece(mx - 0.03, mx + 0.03, mz - t2 * 0.6, mz + t2 * 0.6, WIN_LOW, WIN_HIGH, mx, mz, ox, oz, 2);
        else piece(mx - t2 * 0.6, mx + t2 * 0.6, mz - 0.03, mz + 0.03, WIN_LOW, WIN_HIGH, mx, mz, ox, oz, 2);
      } else if (isWall(x, y)) {
        piece(mx - t2, mx + t2, mz - t2, mz + t2, 0, WALL_H, mx, mz, ox, oz);
        const e = isWall(x + 1, y) || isDoor(x + 1, y);
        const wv = isWall(x - 1, y) || isDoor(x - 1, y);
        const s = isWall(x, y + 1) || isDoor(x, y + 1);
        const nn = isWall(x, y - 1) || isDoor(x, y - 1);
        if (e) piece(mx + t2, x + 1, mz - t2, mz + t2, 0, WALL_H, mx, mz, ox, oz);
        if (wv) piece(x, mx - t2, mz - t2, mz + t2, 0, WALL_H, mx, mz, ox, oz);
        if (s) piece(mx - t2, mx + t2, mz + t2, y + 1, 0, WALL_H, mx, mz, ox, oz);
        if (nn) piece(mx - t2, mx + t2, y, mz - t2, 0, WALL_H, mx, mz, ox, oz);
      } else if (isDoor(x, y)) {
        // перемычка над дверью и наличники
        const horiz = isWall(x - 1, y) || isWall(x + 1, y) || isDoor(x - 1, y) || isDoor(x + 1, y);
        const f = 0.07;
        const ft = t2 + 0.025;
        if (horiz) {
          piece(x, x + 1, mz - t2, mz + t2, DOOR_H, WALL_H, mx, mz, ox, oz);
          piece(x, x + f, mz - ft, mz + ft, 0, DOOR_H, mx, mz, ox, oz, 2);
          piece(x + 1 - f, x + 1, mz - ft, mz + ft, 0, DOOR_H, mx, mz, ox, oz, 2);
          piece(x, x + 1, mz - ft, mz + ft, DOOR_H - f, DOOR_H, mx, mz, ox, oz, 2);
        } else {
          piece(mx - t2, mx + t2, y, y + 1, DOOR_H, WALL_H, mx, mz, ox, oz);
          piece(mx - ft, mx + ft, y, y + f, 0, DOOR_H, mx, mz, ox, oz, 2);
          piece(mx - ft, mx + ft, y + 1 - f, y + 1, 0, DOOR_H, mx, mz, ox, oz, 2);
          piece(mx - ft, mx + ft, y, y + 1, DOOR_H - f, DOOR_H, mx, mz, ox, oz, 2);
        }
      }
    }
  }
  const geo = mergeGeometries(geos, false)!;
  const uniforms: Walls['uniforms'] = {
    uMode: { value: 1 },
    uFocus: { value: new THREE.Vector2(W / 2, H / 2) },
    uRadius: { value: 14 },
    uToCam: { value: new THREE.Vector2(0, 1) },
  };
  const { mat, depth } = wallMaterial(uniforms);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.customDepthMaterial = depth;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'стены';
  return {
    mesh,
    uniforms,
    setMode(m) {
      uniforms.uMode.value = m === 'full' ? 0 : m === 'cut' ? 1 : 2;
    },
  };
}

/** Слитые сетки мебели: цветная, с атласом KayKit, светящиеся экраны. */
export function batchMeshes(b: Batch): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  if (b.colored.length) {
    const m = new THREE.Mesh(mergeGeometries(b.colored)!, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.05 }));
    m.name = 'мебель';
    out.push(m);
  }
  if (b.textured.length && b.map) {
    const m = new THREE.Mesh(mergeGeometries(b.textured)!, new THREE.MeshStandardMaterial({ map: b.map, roughness: 0.6 }));
    m.name = 'мебель KayKit';
    out.push(m);
  }
  if (b.glow.length) {
    const m = new THREE.Mesh(
      mergeGeometries(b.glow)!,
      new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0x3fa6b8, emissiveIntensity: 0.6, roughness: 0.3 }),
    );
    m.name = 'экраны';
    out.push(m);
  }
  for (const m of out) {
    m.castShadow = true;
    m.receiveShadow = true;
  }
  return out;
}
