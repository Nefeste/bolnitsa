// из spikes/render-3d: src/world.ts (Batch, Furnisher, оборудование кодом) — изменено: предметы — из раскладки движка и
// таблицы catalog.ts; размер по месту — отдельно по ширине, глубине и высоте; посадочные и «лёжа» точки; кровать с
// бортами, КТ, МРТ, операционный стол, наркозный аппарат, аппарат ИВЛ, монитор, УЗИ, эндоскопическая стойка — кодом;
// один предмет отдельно — для призрака стройки (`furnishThing`, spec docs/specs/2026-10-build.md).
//
// Все предметы больницы сливаются в несколько больших сеток по материалу: несколько вызовов отрисовки на всю больницу,
// сколько бы предметов в ней ни было. Мир: x — столбец клетки, z — строка, y — вверх; клетка — 1 м. У предмета перёд —
// +z его осей; у длинных — от изголовья к ногам. Без DOM: раскладку и точки опоры проверяют тесты в Bun.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Appear } from './appear';
import { BLENDER_CODE, BLENDER_KIT, type Code, entryOf, type Fit, type Recolor, WHITE_FURNITURE } from './catalog';
import type { Layout, Thing } from './layout';
import { type Model, seatOf } from './models';

// ---------------------------------------------------------------- сборщик слитых сеток

/** Копит геометрию в мировых координатах; в конце — одна сетка на материал. */
export class Batch {
  colored: THREE.BufferGeometry[] = [];
  textured: THREE.BufferGeometry[] = [];
  glow: THREE.BufferGeometry[] = [];
  map: THREE.Texture | null = null;
  tris = 0;
  items = 0;
  /**
   * Появление мебели (appear.ts): чья геометрия кладётся сейчас — номер вещи, -1 — ничья (не растёт: призрак стройки);
   * вещи — ключ, по которому окно узнаёт новые после стройки, и середина на полу.
   */
  owner = -1;
  owners: { key: string; x: number; z: number }[] = [];

  /** Дальше — геометрия этой вещи. */
  own(key: string, x: number, z: number) {
    this.owner = this.owners.length;
    this.owners.push({ key, x, z });
  }

  /** Номер вещи у каждой вершины — шейдер появления по нему находит её середину и время. */
  private ownerOf(g: THREE.BufferGeometry) {
    g.setAttribute('owner', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(this.owner), 1));
  }

  addColored(g: THREE.BufferGeometry, color: THREE.Color | number, m: THREE.Matrix4, glow = false) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', g.attributes.position.clone());
    if (g.attributes.normal) geo.setAttribute('normal', g.attributes.normal.clone());
    // затенение, запечённое в цвет вершин (модели Blender, docs/reports/2026-11-blender-pilot.md): множитель цвета части
    const shade = g.attributes.color;
    if (shade) geo.setAttribute('shade', shade.clone());
    if (g.index) geo.setIndex(g.index.clone());
    let out = geo.index ? geo.toNonIndexed() : geo;
    if (!out.attributes.normal) out.computeVertexNormals();
    out.applyMatrix4(m);
    const c = color instanceof THREE.Color ? color : new THREE.Color(color);
    const n = out.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) c.toArray(col, i * 3);
    const sh = out.attributes.shade;
    if (sh) {
      for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) col[i * 3 + k] *= sh.getComponent(i, k);
      out.deleteAttribute('shade');
    }
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.ownerOf(out);
    out = stripTo(out, ['position', 'normal', 'color', 'owner']);
    (glow ? this.glow : this.colored).push(out);
    this.tris += n / 3;
  }

  addTextured(g: THREE.BufferGeometry, map: THREE.Texture, m: THREE.Matrix4) {
    this.map = map;
    let out = (g.index ? g.toNonIndexed() : g.clone()) as THREE.BufferGeometry;
    out.applyMatrix4(m);
    this.ownerOf(out);
    out = stripTo(out, ['position', 'normal', 'uv', 'owner']);
    this.textured.push(out);
    this.tris += out.attributes.position.count / 3;
  }
}

function stripTo(g: THREE.BufferGeometry, keep: string[]): THREE.BufferGeometry {
  for (const k of Object.keys(g.attributes)) if (!keep.includes(k)) g.deleteAttribute(k);
  return g;
}

// ---------------------------------------------------------------- точки опоры

/** Куда садится человек: точка опоры таза (мир) и куда он смотрит. */
export interface SeatAnchor {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

/** Куда ложится человек: середина верха постели (мир), `yaw` — от изголовья к ногам. */
export interface LieAnchor {
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** постель — кровать: лежащего укрывает одеяло (people.ts) */
  bed?: true;
}

/** Высота верха постели у моделей кодом, м. */
export const LIE_TOP: Partial<Record<Code, number>> = { bed: 0.56, examCouch: 0.66, xray: 0.78, ct: 0.82, mri: 0.82, orTable: 0.9 };

/** Сдвиг места модели кодом вдоль её z, м: анализатор и пульт стоят ближе к стене; их модели Blender — так же. */
export const CODE_SHIFT: Partial<Record<Code, number>> = { analyzer: -0.18, console: -0.18 };

/** Что стоит на лабораторном столе: 0 — микроскоп, 1 — штатив с пробирками — через клетку. */
export const benchItem = (t: Thing) => (t.cell[0] + t.cell[1]) % 2;

/**
 * Каких частей модели Blender у этой вещи нет: стойки капельницы — вне палаты и бокса (пилот); второго предмета лабораторного
 * стола — микроскоп (`microscope*`) или штатив (`rack*`), как у модели кодом (группа 1).
 */
function skipOf(code: Code, t: Thing): (node: string) => boolean {
  if (code === 'bed') {
    const iv = t.type === 'room.ward' || t.type === 'room.box';
    return node => !iv && (node === 'iv' || node === 'iv_bag');
  }
  if (code === 'labBench') {
    const rack = benchItem(t) === 1;
    return node => (rack ? node.startsWith('microscope') : node.startsWith('rack'));
  }
  return () => false;
}

// ---------------------------------------------------------------- предметы

export class Furnisher {
  readonly batch = new Batch();
  constructor(private models: Map<string, Model>) {}

  /** Загружена ли модель (модели Blender части 2 — по умолчанию, с `?models=code` их нет). */
  has(name: string): boolean {
    return this.models.has(name);
  }

  /**
   * Поставить модель: середина места (cx, cz), поворот yaw (перёд на +z при 0), вписать в место `fit` — по ширине,
   * глубине и высоте отдельно; `seat` — высота сиденья: высота модели — такая, чтобы сиденье пришлось на неё; `back` —
   * прижать к задней кромке места; `y` — поставить на высоту. Отдаёт матрицу и верх модели.
   */
  place(name: string, cx: number, cz: number, yaw: number, fit: Fit, opts: { recolor?: Recolor; back?: boolean; y?: number; seat?: number; depth?: number } = {}) {
    // модель Blender части 2 вместо модели набора — если её загрузили (docs/specs/2026-11-blender-2.md): то же место
    const swap = BLENDER_KIT[name];
    const blender = swap !== undefined && this.models.has(swap);
    const model = this.models.get(blender ? swap : name);
    if (!model) throw new Error(`no model ${name}`);
    const size = model.box.getSize(new THREE.Vector3());
    const center = model.box.getCenter(new THREE.Vector3());
    let sx = fit.w / size.x;
    let sz = fit.d / size.z;
    let sy = fit.h > 0 ? fit.h / size.y : Math.min(sx, sz);
    const seat = opts.seat !== undefined ? seatOf(model) : null;
    if (seat && opts.seat !== undefined) sy = opts.seat / (seat.y - model.box.min.y);
    // модель Blender — в настоящий размер: она собрана в размер места (blender/sizes.json), сиденье — на SEAT, а на столе
    // может стоять монитор выше места
    if (blender) sx = sy = sz = 1;
    const room = opts.depth ?? 1;
    const back = opts.back ? -(room - fit.d) / 2 : 0;
    const m = new THREE.Matrix4()
      .makeTranslation(cx, opts.y ?? 0, cz)
      .multiply(new THREE.Matrix4().makeRotationY(yaw))
      .multiply(new THREE.Matrix4().makeTranslation(0, 0, back))
      .multiply(new THREE.Matrix4().makeScale(sx, sy, sz))
      .multiply(new THREE.Matrix4().makeTranslation(-center.x, -model.box.min.y, -center.z));
    for (const p of model.parts) {
      if (p.map) this.batch.addTextured(p.geometry, p.map, m);
      else {
        const rc = opts.recolor?.[p.mat];
        this.batch.addColored(p.geometry, rc !== undefined ? new THREE.Color(rc) : p.color, m, p.mat === 'screen');
      }
    }
    this.batch.items++;
    let anchor: SeatAnchor | undefined;
    if (seat) {
      const v = new THREE.Vector3(seat.x, seat.y, seat.z).applyMatrix4(m);
      anchor = { x: v.x, y: v.y, z: v.z, yaw };
    }
    return { top: (opts.y ?? 0) + size.y * sy, matrix: m, seat: anchor, blender };
  }

  /**
   * Модель Blender в настоящий размер (docs/reports/2026-11-blender-pilot.md): середина места — начало её осей, низ — пол;
   * `m` — матрица места предмета (`thingFrame`). Части по имени узла можно пропустить (`skip`): стойка капельницы — только
   * в палате. Материал «screen» светится, как у моделей CC0.
   */
  placeAt(name: string, m: THREE.Matrix4, skip: (node: string) => boolean = () => false) {
    const model = this.models.get(name);
    if (!model) throw new Error(`no model ${name}`);
    for (const p of model.parts) if (!skip(p.node)) this.batch.addColored(p.geometry, p.color, m, p.mat === 'screen');
    this.batch.items++;
  }

  /** Коробка кодом в осях предмета (перёд на +z), м: `y` — низ коробки. */
  box(base: THREE.Matrix4, w: number, h: number, d: number, x: number, y: number, z: number, color: number, glow = false) {
    const g = new THREE.BoxGeometry(w, h, d);
    const m = base.clone().multiply(new THREE.Matrix4().makeTranslation(x, y + h / 2, z));
    this.batch.addColored(g, color, m, glow);
  }

  /** Цилиндр кодом: `y` — низ; `rotX` — наклон оси. */
  cyl(base: THREE.Matrix4, r0: number, r1: number, h: number, x: number, y: number, z: number, color: number, seg = 12, rotX = 0, rotZ = 0) {
    const g = new THREE.CylinderGeometry(r1, r0, h, seg);
    const m = base
      .clone()
      .multiply(new THREE.Matrix4().makeTranslation(x, y, z))
      .multiply(new THREE.Matrix4().makeRotationX(rotX))
      .multiply(new THREE.Matrix4().makeRotationZ(rotZ))
      .multiply(new THREE.Matrix4().makeTranslation(0, h / 2, 0));
    this.batch.addColored(g, color, m);
  }

  /** Кольцо (тор) кодом: ось — вдоль z предмета. */
  ring(base: THREE.Matrix4, r: number, tube: number, x: number, y: number, z: number, color: number) {
    const g = new THREE.TorusGeometry(r, tube, 10, 28);
    this.batch.addColored(g, color, base.clone().multiply(new THREE.Matrix4().makeTranslation(x, y, z)));
  }
}

export function frame(cx: number, cz: number, yaw: number, y = 0): THREE.Matrix4 {
  return new THREE.Matrix4().makeTranslation(cx, y, cz).multiply(new THREE.Matrix4().makeRotationY(yaw));
}

// ---------------------------------------------------------------- оборудование кодом

const STEEL = 0xc9d1d5;
const STEEL_D = 0x7d8a90;
const WHITE = 0xf1f3f3;
const MINT = 0x8fc9b9;
const SCREEN = 0x1d3b45;
const DARK = 0x39434a;
const SHEET = 0xf7f7f2;
const BLANKET = 0x7fa9c9;
const TEAL = 0x2f7f86;
const MATTRESS = 0xe4eef2;
const BOARD = 0xd8dee2;
const PANEL = 0xe6eaeb;
const PAD = 0x6fa9c9;
const HEAD = 0xdfe3e3;
const DEFIB = 0xd9a43a;
const BAG = 0xe8f4f6;
// регистратура, лаборатория, процедурная, санузел (модели Blender группы 1, docs/specs/2026-11-blender-2.md, — те же цвета)
const FRONT = 0x5f8f8a;
const WOOD_TOP = 0xc9a77c;
const BEIGE = 0xe7e2d8;
const LIGHT = 0xd7dcdc;
const LIGHT2 = 0xe3e7e7;
const SLATE = 0x9ab0b8;
const TRAY = 0x9fc3d6;
const LENS = 0xe8e8e8;
const RACK = 0xe0e4e4;
const TUBE_R = 0xc94a4a;
const TUBE_B = 0x5a8fd0;
const TUBE_Y = 0xe2c044;
const TUBE_G = 0x7bbf6a;
const CUBICLE = 0x9fb7c4;
const CUBICLE_DOOR = 0xb5c9d3;
/** Палитра больницы — её же берут модели Blender (blender/sizes.json, tools/app/blender-sizes.ts): стиль один. */
export const PALETTE = {
  STEEL, STEEL_D, WHITE, MINT, SCREEN, DARK, SHEET, BLANKET, TEAL, MATTRESS, BOARD, PANEL, PAD, HEAD, DEFIB, BAG,
  FRONT, WOOD_TOP, BEIGE, LIGHT, LIGHT2, SLATE, TRAY, LENS, RACK, TUBE_R, TUBE_B, TUBE_Y, TUBE_G, CUBICLE, CUBICLE_DOOR,
};
/**
 * Кабинка санузла (`decorate`): унитаз у дальней стены клетки, стенки по бокам, дверца спереди — в осях клетки (перёд на +z,
 * середина клетки — 0), м. Её же собирает модель Blender `toilet` (docs/specs/2026-11-blender-2.md, группа 1).
 */
export const TOILET = {
  fit: { w: 0.42, d: 0.62, h: 0.8 },
  side: { x: 0.5, t: 0.04, h: 1.75, d: 0.95, y: 0.12, z: -0.02 },
  door: { w: 0.92, h: 1.6, t: 0.04, y: 0.12, z: 0.47 },
} as const;
/** Где у кровати палаты стойка капельницы, в осях кровати: сбоку у изголовья, м. */
export const IV_AT: readonly [number, number] = [0.62, -0.78];

function wheels(f: Furnisher, m: THREE.Matrix4, hw: number, hl: number, r = 0.05) {
  for (const sx of [-hw, hw]) for (const sz of [-hl, hl]) f.cyl(m, r, r, 0.04, sx, 0, sz, DARK, 8, 0, Math.PI / 2);
}

/** Функциональная кровать: колёса, рама, изголовье и изножье, матрас, подушка, одеяло, борта у изголовья. */
function bed(f: Furnisher, m: THREE.Matrix4, iv: boolean) {
  const top = LIE_TOP.bed!;
  wheels(f, m, 0.38, 0.88);
  f.box(m, 0.86, 0.1, 1.86, 0, 0.18, 0, STEEL_D);
  for (const sx of [-0.4, 0.4]) for (const sz of [-0.88, 0.88]) f.box(m, 0.04, 0.22, 0.04, sx, 0.05, sz, STEEL);
  f.box(m, 0.92, 0.14, 1.94, 0, 0.28, 0, STEEL);
  f.box(m, 0.88, top - 0.42, 1.9, 0, 0.42, 0, MATTRESS);
  f.box(m, 0.96, 0.95, 0.05, 0, 0.12, -0.98, BOARD); // изголовье
  f.box(m, 0.96, 0.75, 0.05, 0, 0.12, 0.98, BOARD); // изножье
  f.box(m, 0.6, 0.09, 0.32, 0, top, -0.72, SHEET); // подушка
  f.box(m, 0.9, 0.06, 1.15, 0, top - 0.02, 0.36, BLANKET); // одеяло
  for (const sx of [-0.47, 0.47]) {
    f.box(m, 0.025, 0.025, 0.85, sx, top + 0.12, -0.45, STEEL);
    f.box(m, 0.025, 0.14, 0.025, sx, top - 0.02, -0.82, STEEL);
    f.box(m, 0.025, 0.14, 0.025, sx, top - 0.02, -0.08, STEEL);
  }
  if (iv) ivStand(f, m.clone().multiply(new THREE.Matrix4().makeTranslation(IV_AT[0], 0, IV_AT[1])));
}

function ivStand(f: Furnisher, m: THREE.Matrix4) {
  f.cyl(m, 0.18, 0.18, 0.03, 0, 0, 0, STEEL_D, 5);
  f.cyl(m, 0.012, 0.012, 1.85, 0, 0.03, 0, STEEL, 6);
  f.box(m, 0.36, 0.015, 0.015, 0, 1.86, 0, STEEL);
  f.box(m, 0.09, 0.16, 0.04, 0.14, 1.66, 0, BAG);
}

/** Смотровая кушетка: рама, мягкий верх, приподнятое изголовье, бумажная простыня; длина — 1,9 м по z. */
function examCouch(f: Furnisher, m: THREE.Matrix4) {
  const top = LIE_TOP.examCouch!;
  for (const sx of [-0.28, 0.28]) for (const sz of [-0.85, 0.85]) f.box(m, 0.05, top - 0.12, 0.05, sx, 0, sz, STEEL_D);
  f.box(m, 0.66, 0.05, 1.86, 0, top - 0.12, 0, STEEL);
  f.box(m, 0.64, 0.08, 1.4, 0, top - 0.08, 0.22, MINT);
  const head = m.clone().multiply(new THREE.Matrix4().makeTranslation(0, top - 0.06, -0.62)).multiply(new THREE.Matrix4().makeRotationX(-0.35));
  f.box(head, 0.64, 0.08, 0.55, 0, -0.04, -0.02, MINT);
  f.box(m, 0.56, 0.015, 1.2, 0, top, 0.26, SHEET);
}

/** Рентген: стол пациента вдоль z, колонна с трубкой сбоку, стойка-детектор у изголовья. */
function xray(f: Furnisher, m: THREE.Matrix4) {
  const top = LIE_TOP.xray!;
  f.box(m, 0.5, top - 0.08, 0.6, 0, 0, 0, STEEL_D);
  f.box(m, 0.82, 0.08, 2.0, 0, top - 0.08, 0, PANEL);
  f.box(m, 0.72, 0.03, 1.7, 0, top - 0.005, 0.1, PAD);
  f.box(m, 0.22, 2.2, 0.22, -0.7, 0, 0.1, WHITE);
  f.box(m, 0.8, 0.16, 0.18, -0.35, 1.9, 0.1, WHITE);
  f.box(m, 0.38, 0.3, 0.38, 0, 1.62, 0.1, HEAD);
  f.cyl(m, 0.13, 0.17, 0.12, 0, 1.5, 0.1, DARK, 14);
  f.box(m, 0.62, 1.45, 0.12, 0.0, 0.35, -1.0, PANEL);
}

/** КТ: кольцо гентри у изголовья, стол уходит в отверстие. */
function ct(f: Furnisher, m: THREE.Matrix4) {
  const top = LIE_TOP.ct!;
  f.box(m, 1.9, 0.25, 0.75, 0, 0, -0.55, 0xdde3e6);
  f.ring(m, 0.62, 0.3, 0, 1.0, -0.55, 0xeef2f3);
  f.box(m, 1.6, 0.55, 0.62, 0, 0.18, -0.55, 0xeef2f3);
  f.box(m, 0.06, 0.12, 0.66, 0.92, 1.0, -0.55, TEAL);
  f.box(m, 0.5, top - 0.1, 1.1, 0, 0, 0.45, 0xc9d1d5);
  f.box(m, 0.6, 0.1, 2.0, 0, top - 0.1, 0.0, 0xe6eaeb);
  f.box(m, 0.52, 0.03, 1.7, 0, top, 0.1, 0x6fa9c9);
}

/** МРТ: большой магнит с тоннелем у изголовья, стол-каталка. */
function mri(f: Furnisher, m: THREE.Matrix4) {
  const top = LIE_TOP.mri!;
  f.box(m, 1.95, 1.95, 1.3, 0, 0, -0.45, 0xeef2f3);
  f.box(m, 1.6, 0.2, 0.06, 0, 1.6, 0.21, TEAL);
  f.cyl(m, 0.36, 0.36, 0.08, 0, top + 0.18, 0.2, 0x2c3a40, 24, Math.PI / 2);
  f.box(m, 0.5, top - 0.1, 1.0, 0, 0, 0.5, 0xc9d1d5);
  f.box(m, 0.6, 0.1, 1.9, 0, top - 0.1, 0.1, 0xe6eaeb);
  f.box(m, 0.52, 0.03, 1.6, 0, top, 0.2, 0x6fa9c9);
}

/** Операционный стол на колонне и лампа над ним. */
function orTable(f: Furnisher, m: THREE.Matrix4) {
  const top = LIE_TOP.orTable!;
  f.box(m, 0.55, 0.06, 0.8, 0, 0, 0, STEEL_D);
  f.box(m, 0.26, top - 0.16, 0.36, 0, 0.06, 0, STEEL);
  f.box(m, 0.58, 0.1, 1.95, 0, top - 0.1, 0, 0x3f7f7a);
  f.box(m, 0.56, 0.03, 1.9, 0, top, 0, 0x5aa39b);
  // лампа: стойка у ног, плечо, диск над столом
  f.cyl(m, 0.04, 0.04, 2.25, 0.62, 0, 0.75, STEEL, 8);
  f.box(m, 0.62, 0.05, 0.05, 0.31, 2.2, 0.75, STEEL);
  f.box(m, 0.05, 0.05, 0.75, 0.0, 2.2, 0.38, STEEL);
  f.cyl(m, 0.35, 0.28, 0.12, 0, 2.05, 0, 0xf2f4f4, 20);
  f.cyl(m, 0.26, 0.26, 0.02, 0, 2.03, 0, 0xfff8d8, 20);
}

/** Наркозный аппарат: тележка, баллоны, мех, монитор. */
function anesthesia(f: Furnisher, m: THREE.Matrix4) {
  wheels(f, m, 0.25, 0.2);
  f.box(m, 0.6, 0.95, 0.5, 0, 0.05, -0.05, 0xe7ecec);
  f.box(m, 0.62, 0.04, 0.52, 0, 1.0, -0.05, 0xc9d0d2);
  f.cyl(m, 0.06, 0.06, 0.55, -0.22, 0.05, -0.32, 0x4f8a5a, 10);
  f.cyl(m, 0.06, 0.06, 0.55, -0.08, 0.05, -0.32, 0x5a7fbf, 10);
  f.cyl(m, 0.07, 0.07, 0.22, 0.18, 1.04, 0.05, 0xd8e6ea, 10);
  f.box(m, 0.42, 0.3, 0.05, 0, 1.25, -0.22, DARK);
  f.box(m, 0.38, 0.26, 0.01, 0, 1.27, -0.19, SCREEN, true);
}

/** Аппарат ИВЛ: высокая тележка с экраном и шлангами. */
function ventilator(f: Furnisher, m: THREE.Matrix4) {
  wheels(f, m, 0.18, 0.18);
  f.box(m, 0.36, 0.05, 0.36, 0, 0.05, 0, STEEL_D);
  f.cyl(m, 0.025, 0.025, 0.9, 0, 0.1, 0, STEEL, 8);
  f.box(m, 0.42, 0.32, 0.3, 0, 0.95, 0, 0xe7ecec);
  f.box(m, 0.34, 0.24, 0.02, 0, 1.3, 0.05, DARK);
  f.box(m, 0.3, 0.2, 0.01, 0, 1.32, 0.065, SCREEN, true);
  f.cyl(m, 0.025, 0.025, 0.5, 0.12, 0.95, 0.12, 0xd8e6ea, 8, 0.8);
}

/** Монитор с дефибриллятором на стойке. */
function monitor(f: Furnisher, m: THREE.Matrix4) {
  f.cyl(m, 0.2, 0.2, 0.03, 0, 0, 0, STEEL_D, 5);
  f.cyl(m, 0.02, 0.02, 1.25, 0, 0.03, 0, STEEL, 8);
  f.box(m, 0.36, 0.06, 0.28, 0, 0.9, 0.02, STEEL);
  f.box(m, 0.32, 0.12, 0.22, 0, 0.96, 0.02, DEFIB); // дефибриллятор
  f.box(m, 0.4, 0.3, 0.08, 0, 1.28, 0.02, DARK);
  f.box(m, 0.36, 0.25, 0.01, 0, 1.305, 0.065, SCREEN, true);
}

function ecgCart(f: Furnisher, m: THREE.Matrix4) {
  for (const sx of [-0.2, 0.2]) for (const sz of [-0.15, 0.15]) f.cyl(m, 0.035, 0.035, 0.05, sx, 0, sz, DARK, 8);
  f.box(m, 0.5, 0.06, 0.4, 0, 0.05, 0, STEEL_D);
  f.box(m, 0.05, 0.75, 0.05, 0, 0.1, -0.12, STEEL);
  f.box(m, 0.48, 0.2, 0.38, 0, 0.82, 0, WHITE);
  f.box(m, 0.42, 0.3, 0.05, 0, 1.02, -0.12, DARK);
  f.box(m, 0.36, 0.24, 0.01, 0, 1.05, -0.09, SCREEN, true);
}

function analyzer(f: Furnisher, m: THREE.Matrix4) {
  f.box(m, 0.8, 0.85, 0.6, 0, 0, 0, WHITE);
  f.box(m, 0.82, 0.05, 0.62, 0, 0.85, 0, LIGHT);
  f.box(m, 0.36, 0.24, 0.02, -0.12, 0.55, 0.305, SCREEN, true);
  f.box(m, 0.8, 0.05, 0.02, 0, 0.35, 0.305, TEAL);
  f.box(m, 0.3, 0.3, 0.4, 0.15, 0.9, -0.05, LIGHT2);
  f.box(m, 0.2, 0.06, 0.25, 0.15, 1.2, -0.05, SLATE);
}

/** УЗИ: тележка с пультом и экраном. */
function us(f: Furnisher, m: THREE.Matrix4) {
  wheels(f, m, 0.2, 0.2, 0.04);
  f.box(m, 0.48, 0.55, 0.45, 0, 0.05, 0, 0xe7ecec);
  f.box(m, 0.55, 0.06, 0.4, 0, 0.82, 0.05, 0xd5dbdc);
  f.box(m, 0.4, 0.02, 0.22, 0, 0.88, 0.08, DARK);
  f.box(m, 0.08, 0.25, 0.06, 0, 0.6, -0.12, STEEL);
  f.box(m, 0.46, 0.34, 0.05, 0, 1.0, -0.12, DARK);
  f.box(m, 0.42, 0.3, 0.01, 0, 1.02, -0.09, SCREEN, true);
}

/** Эндоскопическая стойка: тележка, блоки, экран наверху. */
function endoscope(f: Furnisher, m: THREE.Matrix4) {
  wheels(f, m, 0.22, 0.2, 0.04);
  f.box(m, 0.5, 0.05, 0.45, 0, 0.05, 0, STEEL_D);
  for (const y of [0.15, 0.45, 0.75]) f.box(m, 0.46, 0.22, 0.4, 0, y, 0, y === 0.45 ? DARK : 0xe7ecec);
  f.box(m, 0.5, 0.36, 0.06, 0, 1.25, -0.08, DARK);
  f.box(m, 0.46, 0.32, 0.01, 0, 1.27, -0.045, SCREEN, true);
  f.cyl(m, 0.012, 0.012, 0.7, 0.22, 0.95, 0.15, 0x222222, 6, 0.4);
}

/**
 * Стойка регистратуры: длина — вдоль x; регистратор — на +z (стол повёрнут к тому, кто за ним, layout.ts): к нему рабочий
 * стол и монитор, высокая панель с полкой — к посетителю (−z).
 */
function counter(f: Furnisher, m: THREE.Matrix4, models: Furnisher) {
  const len = 1.5;
  f.box(m, len, 1.0, 0.12, 0, 0, -0.32, FRONT);
  f.box(m, len, 0.05, 0.3, 0, 1.0, -0.3, WOOD_TOP);
  f.box(m, len, 0.66, 0.55, 0, 0, 0.05, BEIGE);
  f.box(m, len, 0.04, 0.6, 0, 0.66, 0.05, WOOD_TOP);
  screenOn(models, m, 0, 0.7, 0.05);
}

/**
 * Монитор и клавиатура на столе: экран смотрит на +z стола — к сидящему за ним (стол повёрнут к нему, layout.ts); экран
 * модели набора смотрит на свой −z, поэтому она повёрнута; клавиатура — между ним и экраном.
 */
function screenOn(f: Furnisher, m: THREE.Matrix4, x: number, y: number, z: number) {
  const at = m.clone().multiply(new THREE.Matrix4().makeTranslation(x, y, z));
  const p = new THREE.Vector3().setFromMatrixPosition(at);
  const yaw = Math.atan2(at.elements[8], at.elements[10]);
  f.place('kenney/computerScreen', p.x, p.z, yaw + Math.PI, { w: 0.5, d: 0.16, h: 0.4 }, { y: p.y });
  const k = at.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, 0.18));
  const kp = new THREE.Vector3().setFromMatrixPosition(k);
  f.place('kenney/computerKeyboard', kp.x, kp.z, yaw + Math.PI, { w: 0.42, d: 0.15, h: 0.03 }, { y: kp.y });
}

/** Пульт рентгена, КТ, МРТ: стол с двумя мониторами. */
function console_(f: Furnisher, m: THREE.Matrix4) {
  f.box(m, 0.92, 0.66, 0.55, 0, 0, 0, 0xd9dedf);
  f.box(m, 0.94, 0.04, 0.6, 0, 0.66, 0, 0x7e8b91);
  for (const x of [-0.22, 0.22]) {
    f.box(m, 0.4, 0.28, 0.04, x, 0.72, -0.14, DARK);
    f.box(m, 0.36, 0.24, 0.01, x, 0.74, -0.115, SCREEN, true);
  }
  f.box(m, 0.4, 0.02, 0.14, 0, 0.7, 0.08, DARK);
}

/** Столик для инструментов на колёсах. */
function instrumentTable(f: Furnisher, m: THREE.Matrix4) {
  wheels(f, m, 0.3, 0.2, 0.035);
  for (const sx of [-0.3, 0.3]) for (const sz of [-0.2, 0.2]) f.box(m, 0.025, 0.85, 0.025, sx, 0.04, sz, STEEL);
  f.box(m, 0.68, 0.03, 0.46, 0, 0.88, 0, STEEL);
  f.box(m, 0.68, 0.02, 0.46, 0, 0.35, 0, STEEL_D);
  f.box(m, 0.5, 0.02, 0.32, 0, 0.91, 0, 0x2f6f8f);
  for (let i = 0; i < 5; i++) f.box(m, 0.02, 0.01, 0.18, -0.16 + i * 0.08, 0.93, 0, 0xdde3e6);
}

/** Лабораторный стол: тумба, на ней микроскоп или штатив с пробирками. */
function labBench(f: Furnisher, m: THREE.Matrix4, cx: number, cz: number, yaw: number, item: number) {
  const top = f.place('kenney/kitchenCabinet', cx, cz, yaw, { w: 0.98, d: 0.62, h: 0.9 }, { back: true, recolor: WHITE_FURNITURE });
  const on = m.clone().multiply(new THREE.Matrix4().makeTranslation(0, top.top, -0.15));
  if (item === 0) {
    f.box(on, 0.16, 0.03, 0.2, 0, 0, 0, DARK);
    f.box(on, 0.04, 0.26, 0.04, 0, 0.03, -0.07, DARK);
    f.cyl(on, 0.025, 0.025, 0.14, 0, 0.2, 0, LENS, 8, 0.5);
  } else {
    f.box(on, 0.24, 0.05, 0.1, 0, 0, 0, RACK);
    [TUBE_R, TUBE_B, TUBE_Y, TUBE_G, TUBE_R].forEach((c, i) => f.cyl(on, 0.012, 0.012, 0.12, -0.08 + i * 0.04, 0.03, 0, c, 6));
  }
}

/** Процедурный столик: белый, с лотком и подлокотником для забора крови. */
function procedureTable(f: Furnisher, m: THREE.Matrix4) {
  for (const sx of [-0.35, 0.35]) for (const sz of [-0.22, 0.22]) f.box(m, 0.04, 0.68, 0.04, sx, 0, sz, STEEL);
  f.box(m, 0.8, 0.04, 0.52, 0, 0.68, 0, WHITE);
  f.box(m, 0.3, 0.03, 0.2, -0.18, 0.72, -0.05, TRAY);
  f.box(m, 0.14, 0.06, 0.4, 0.22, 0.72, 0.02, MINT);
}

// ---------------------------------------------------------------- расстановка

export interface Furnished {
  batch: Batch;
  /** по номеру предмета раскладки: куда садятся и куда ложатся */
  seats: (SeatAnchor | undefined)[];
  lies: (LieAnchor | undefined)[];
  /** клетки, занятые декором (кабинки туалетов) — человеку туда не пройти */
  decor: [number, number][];
}

/** Середина места предмета и матрица его осей (перёд на +z, у длинных — от изголовья к ногам). */
export function thingFrame(t: Thing): { cx: number; cz: number; m: THREE.Matrix4 } {
  let cx = 0;
  let cz = 0;
  for (const [x, y] of t.cells) {
    cx += x + 0.5;
    cz += y + 0.5;
  }
  cx /= t.cells.length;
  cz /= t.cells.length;
  return { cx, cz, m: frame(cx, cz, t.yaw) };
}

function lieAt(t: Thing, code: Code, cx: number, cz: number): LieAnchor {
  // середина постели — чуть к ногам от середины места: у изголовья подушка, у КТ и МРТ — тоннель
  const shift = code === 'ct' || code === 'mri' ? 0.25 : 0.05;
  return { x: cx + Math.sin(t.yaw) * shift, y: LIE_TOP[code]!, z: cz + Math.cos(t.yaw) * shift, yaw: t.yaw, ...(code === 'bed' ? { bed: true as const } : {}) };
}

/**
 * Ключ вещи — для появления (appear.ts): та же вещь на том же месте после пересборки сцены — тот же ключ; переставленная,
 * повёрнутая или новая — новый. Без номера предмета и «уберут»: они меняются, а вещь та же.
 */
export function thingKey(t: Thing): string {
  return `${t.kind}|${t.type}|${t.equipment ?? ''}|${t.cells.map(([x, y]) => `${x},${y}`).join(';')}|${Math.round(t.yaw * 100)}`;
}

export function furnish(layout: Layout, models: Map<string, Model>): Furnished {
  const f = new Furnisher(models);
  const seats: (SeatAnchor | undefined)[] = [];
  const lies: (LieAnchor | undefined)[] = [];
  layout.things.forEach((t, i) => {
    const { cx, cz } = thingFrame(t);
    f.batch.own(thingKey(t), cx, cz);
    placeThing(f, t, i, seats, lies);
  });
  const decor = decorate(f, layout);
  return { batch: f.batch, seats, lies, decor };
}

/** Один предмет — для призрака стройки (spec docs/specs/2026-10-build.md, «Экран и управление»). */
export function furnishThing(t: Thing, models: Map<string, Model>): Batch {
  const f = new Furnisher(models);
  placeThing(f, t, 0, [], []);
  return f.batch;
}

function placeThing(f: Furnisher, t: Thing, i: number, seats: (SeatAnchor | undefined)[], lies: (LieAnchor | undefined)[]) {
  const e = entryOf(t.kind, t.type, t.equipment);
  const { cx, cz, m } = thingFrame(t);
  if (!e) return;
  if ('model' in e) {
    const r = f.place(e.model, cx, cz, t.yaw, e.fit, { recolor: e.recolor, back: e.back, seat: e.seat });
    seats[i] = r.seat;
    // у стола Blender монитор и клавиатура — свои части
    if (e.computer && !r.blender) screenOn(f, m, 0, r.top - 0.01, -0.08);
    return;
  }
  if (LIE_TOP[e.code] !== undefined) lies[i] = lieAt(t, e.code, cx, cz);
  // длинный предмет, которому не нашлось второй клетки (одна койка в шаблоне реанимации: вторая клетка разрезала бы
  // помещение), — укорочен до своей клетки, а не налезает на соседние
  if (LIE_TOP[e.code] !== undefined && t.cells.length === 1) m.multiply(new THREE.Matrix4().makeScale(1, 1, 0.5));
  // модель Blender вместо модели кодом — если её загрузили (часть 2 — по умолчанию, docs/specs/2026-11-blender-2.md): то же
  // место, та же высота постели и тот же сдвиг места
  const glb = BLENDER_CODE[e.code];
  if (glb !== undefined && f.has(glb)) {
    const at = CODE_SHIFT[e.code] !== undefined ? m.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, CODE_SHIFT[e.code]!)) : m;
    f.placeAt(glb, at, skipOf(e.code, t));
    return;
  }
  switch (e.code) {
    case 'bed':
      bed(f, m, t.type === 'room.ward' || t.type === 'room.box');
      break;
    case 'examCouch':
      examCouch(f, m);
      break;
    case 'xray':
      xray(f, m);
      break;
    case 'ct':
      ct(f, m);
      break;
    case 'mri':
      mri(f, m);
      break;
    case 'orTable':
      orTable(f, m);
      break;
    case 'anesthesia':
      anesthesia(f, m);
      break;
    case 'ventilator':
      ventilator(f, m);
      break;
    case 'monitor':
      monitor(f, m);
      break;
    case 'ecg':
      ecgCart(f, m);
      break;
    case 'analyzer':
      analyzer(f, m.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, CODE_SHIFT.analyzer!)));
      break;
    case 'us':
      us(f, m);
      break;
    case 'endoscope':
      endoscope(f, m);
      break;
    case 'counter':
      counter(f, m, f);
      break;
    case 'console':
      console_(f, m.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, CODE_SHIFT.console!)));
      break;
    case 'instrumentTable':
      instrumentTable(f, m);
      break;
    case 'labBench':
      labBench(f, m, cx, cz, t.yaw, benchItem(t));
      break;
    case 'procedureTable':
      procedureTable(f, m);
      break;
  }
  f.batch.items++;
}

/**
 * Кабинки санузлов раскладки (`decorate`): клетки у дальней от двери стены — до трёх посередине ряда, проход у стен — и
 * поворот: дверца к двери помещения. Их же ставит в образец запекание света (tools/app/blender-sizes.ts).
 */
export function toiletSpots(layout: Layout): { room: number; cell: [number, number]; yaw: number }[] {
  const out: { room: number; cell: [number, number]; yaw: number }[] = [];
  layout.plan.rooms.forEach((r, n) => {
    if (r.type !== 'room.toilet') return;
    const [ox, oy] = layout.out[n];
    // дальняя от двери стена — «назад»
    const backward: [number, number] = [-ox, -oy];
    const yaw = Math.atan2(ox, oy);
    // ряд клеток у дальней стены
    const cells: [number, number][] = [];
    for (let y = r.y + 1; y < r.y + r.h - 1; y++) {
      for (let x = r.x + 1; x < r.x + r.w - 1; x++) {
        const nx = x + backward[0];
        const ny = y + backward[1];
        if (!(nx > r.x && ny > r.y && nx < r.x + r.w - 1 && ny < r.y + r.h - 1)) cells.push([x, y]);
      }
    }
    for (const cell of cells.slice(1, cells.length - 1).slice(0, 3)) out.push({ room: n, cell, yaw });
  });
  return out;
}

/**
 * Декор, которого нет в шаблонах движка: кабинки с унитазами у дальней стены санузла (в шаблоне санузла предметов нет, и
 * пустое помещение выглядит складом) и ковёр в зоне ожидания между рядами стульев.
 */
function decorate(f: Furnisher, layout: Layout): [number, number][] {
  const blocked: [number, number][] = [];
  const { plan } = layout;
  for (const { cell: [x, y], yaw } of toiletSpots(layout)) {
    const cx = x + 0.5;
    const cz = y + 0.5;
    f.batch.own(`toilet|${x},${y}|${Math.round(yaw * 100)}`, cx, cz);
    const m = frame(cx, cz, yaw);
    // кабинка Blender (группа 1) — унитаз, стенки и дверца одной моделью в осях клетки
    const glb = BLENDER_KIT['kenney/toilet'];
    if (f.has(glb)) f.placeAt(glb, m);
    else {
      f.place('kenney/toilet', cx, cz, yaw, TOILET.fit, { back: true });
      const { side: s, door: d } = TOILET;
      for (const sx of [-s.x, s.x]) f.box(m, s.t, s.h, s.d, sx, s.y, s.z, CUBICLE);
      f.box(m, d.w, d.h, d.t, 0, d.y, d.z, CUBICLE_DOOR);
    }
    blocked.push([x, y]);
  }
  plan.rooms.forEach((r, n) => {
    const [ox] = layout.out[n];
    if (r.type === 'room.waiting' && r.seats.length >= 4) {
      // ковёр между рядами: середина зоны стульев
      let x0 = Infinity;
      let x1 = -Infinity;
      let y0 = Infinity;
      let y1 = -Infinity;
      for (const [x, y] of r.seats) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x + 1);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y + 1);
      }
      const along = ox === 0;
      const w = along ? x1 - x0 : y1 - y0;
      const d = along ? y1 - y0 : x1 - x0;
      f.batch.own(`rug|${x0},${y0},${x1},${y1}`, (x0 + x1) / 2, (y0 + y1) / 2);
      f.place('kenney/rugRectangle', (x0 + x1) / 2, (y0 + y1) / 2, along ? 0 : Math.PI / 2, { w: w - 0.2, d: Math.max(0.8, d - 2.2), h: 0.012 }, {
        recolor: { carpet: 0x7aa6a0, carpetDarker: 0x5f8f8a, _defaultMat: 0x7aa6a0 },
      });
    }
  });
  return blocked;
}

/**
 * Слитые сетки мебели: цветная, с атласом KayKit, светящиеся экраны. `appear` — новые вещи растут из пола (appear.ts): материал
 * и глубина тени — с его шейдером; без него (миниатюры каталога) — как есть.
 */
export function batchMeshes(b: Batch, appear?: Appear): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  const mat = <M extends THREE.Material>(m: M, key: string) => (appear ? appear.patch(m, key) : m);
  if (b.colored.length) {
    const m = new THREE.Mesh(mergeGeometries(b.colored)!, mat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.04 }), 'furniture'));
    m.name = 'furniture';
    out.push(m);
  }
  if (b.textured.length && b.map) {
    const m = new THREE.Mesh(mergeGeometries(b.textured)!, mat(new THREE.MeshStandardMaterial({ map: b.map, roughness: 0.6 }), 'atlas'));
    m.name = 'furniture-atlas';
    out.push(m);
  }
  if (b.glow.length) {
    const m = new THREE.Mesh(
      mergeGeometries(b.glow)!,
      mat(new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0x3fa6b8, emissiveIntensity: 0.6, roughness: 0.3 }), 'screens'),
    );
    m.name = 'screens';
    out.push(m);
  }
  for (const m of out) {
    m.castShadow = true;
    m.receiveShadow = true;
    // тень растёт вместе с вещью
    if (appear) m.customDepthMaterial = appear.patch(new THREE.MeshDepthMaterial(), 'depth');
  }
  return out;
}
