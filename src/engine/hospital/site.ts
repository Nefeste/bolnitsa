// Стройка мышью для ПК (spec docs/specs/2026-10-build.md) — своё, не копия «Анамнеза». Больница — участок, внутренность
// здания, два входа и помещения, нарисованные прямоугольником, с дверью и предметами, поставленными по одному. Чистые
// функции без состояния смены: проверки для призраков (можно ли и почему нет, цена), действия стройки (новая больница —
// новый объект) и план больницы — тот же `Plan`, что строит `build.ts` для больниц «Анамнеза», поэтому смена движка,
// требования и отрисовка работают с ним как с прежним. Чего помещению не хватает и где в нём стоят люди — из каталога
// (`content/hospital/rooms/`), а не списком.
//
// Мир: x — столбец, y — строка, клетка — 1 м. Помещение — прямоугольник со стенами; стены соседей и стена корпуса —
// общие. Коридор — всё внутри здания, что не помещение.
import type { Cell, ContentDb, Id, ObjectKind, RoomSize, RoomSizeId, Rot } from '../../content/types';
import type { Decor, HospitalState, PlacedRoom, Plan, RoomInstance } from './build';
import { CELL } from './grid';
import { OFFICE, type Problem } from './requirements';
import type { Shift, StaffMember } from './staff';

// --- состояние ------------------------------------------------------------------------------------------------------

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SiteItem {
  /** номер предмета в больнице: не меняется и не повторяется */
  id: number;
  /** вид: мебель или рисунок аппарата (`equipment.sprite`) */
  kind: ObjectKind;
  /** аппарат каталога; нет — мебель */
  eq?: Id;
  /** клетка; у длинного — изголовье */
  x: number;
  y: number;
  /** куда смотрит перёд: 0 — на юг (+y), 1 — на запад, 2 — на север, 3 — на восток; у длинного — от изголовья к ногам */
  rot: Rot;
  /** длинный предмет в одну клетку — только из готовой больницы (одна койка реанимации на шесть коек) */
  short?: true;
  /** уберут, когда освободится */
  leaving?: true;
}

export interface SiteRoom {
  /** r1, r2… — не меняется, пока помещение стоит, и не повторяется */
  id: string;
  type: Id;
  /** прямоугольник со стенами */
  x: number;
  y: number;
  w: number;
  h: number;
  /** клетки двери: одна или две подряд на одной стене; нет — двери нет */
  door?: Cell[];
  items: SiteItem[];
  /** снесут, когда освободится */
  leaving?: true;
}

export interface Site {
  /** участок, клеток */
  w: number;
  h: number;
  /** внутренность здания — прямоугольники клеток, где может быть пол; вокруг них — стены корпуса */
  inside: Rect[];
  /** входы — клетки на стене корпуса: главный и для скорой (нет — скорая у главного) */
  main: Cell[];
  ambulance: Cell[];
  rooms: SiteRoom[];
  /** предметы коридора: скамьи готовой больницы */
  decor: Decor[];
  /** номер следующего помещения и предмета */
  next: number;
  nextItem: number;
  /** помещение, которое сейчас перестраивают: закрыто (spec «Стройка в любой момент») */
  editing?: string;
  /** ваш кабинет; нет — все кабинеты врача — нанятым врачам, пока нет режима врача (spec «Персонал») */
  mine?: string;
}

/** Счётчики стройки в состоянии смены: потрачено и отмена (spec «Снос и отмена»). */
export interface Works {
  /** потрачено на стройку, ₽: снос — минус половина, отмена — минус цена действия */
  spent: number;
  undo: WorksStep[];
}

/** Снимок до действия стройки: больница, штат, счётчик; `room` — помещение, которое действие меняло. */
export interface WorksStep {
  site: Site;
  staff: StaffMember[];
  nextStaff?: number;
  spent: number;
  room?: string;
}

// --- числа (гипотезы; spec «Деньги», «Помещение») ---------------------------------------------------------------

/** Наибольшая сторона помещения, клеток. */
export const MAX_SIDE = 20;
/** Сколько действий помнит отмена (геймдизайн §3). */
export const SITE_UNDO = 50;
/** Мебель, ₽. Аппараты — по каталогу. */
export const FURNITURE: Partial<Record<ObjectKind, number>> = {
  chair: 400, plant: 300, bench: 800, cabinet: 1000, table: 1200, desk: 1500, sink: 1200, couch: 2500, bed: 12000, machine: 1200,
};
/** Дверь в клетку и в две, ₽. */
export const DOOR_PRICE: Record<number, number> = { 1: 2000, 2: 4000 };
/** Аппарат ближе стольких клеток от койки — этой койки (ПИТ, реанимация). */
export const BED_REACH = 2;
/** Раз в столько игровых секунд движок убирает освободившееся (spec «Стройка в любой момент»). */
export const FREE_CHECK = 5 * 60;

// --- геометрия --------------------------------------------------------------------------------------------------------

/** Куда смотрит перёд при повороте 0–3: юг, запад, север, восток (как четверти карты «Анамнеза», orient.ts). */
export const FACE: readonly Cell[] = [
  [0, 1],
  [-1, 0],
  [0, -1],
  [1, 0],
];
/** Стороны по порядку: север, восток, юг, запад — порядок поиска стены и стола в правилах поворота. */
const DIRS: readonly Cell[] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];
const N4: readonly Cell[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Размер образца на участке при повороте — как `dims` в build.ts. */
export function dimsOf(z: { w: number; h: number }, rot: Rot): [number, number] {
  return rot % 2 === 0 ? [z.w, z.h] : [z.h, z.w];
}

/** Клетка образца (x, y) → клетка повёрнутого образца с углом в (0, 0) — как `turn` в build.ts. */
export function turnOf(z: { w: number; h: number }, rot: Rot, x: number, y: number): Cell {
  if (rot === 0) return [x, y];
  if (rot === 1) return [z.h - 1 - y, x];
  if (rot === 2) return [z.w - 1 - x, z.h - 1 - y];
  return [y, z.w - 1 - x];
}

const key = (x: number, y: number) => `${x},${y}`;

/** Клетка внутри помещения (не стена). */
export const isInterior = (r: Pick<SiteRoom, 'x' | 'y' | 'w' | 'h'>, x: number, y: number) => x > r.x && y > r.y && x < r.x + r.w - 1 && y < r.y + r.h - 1;
/** Клетка на стене помещения. */
const onBorder = (r: Rect, x: number, y: number) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h && !isInterior(r, x, y);
const isCorner = (r: Rect, x: number, y: number) => (x === r.x || x === r.x + r.w - 1) && (y === r.y || y === r.y + r.h - 1);

/** Сторона стены, на которой клетка: 0 — нижняя, 1 — левая, 2 — верхняя, 3 — правая (как поворот помещения «Анамнеза»); угол или не стена — -1. */
export function sideOf(r: Rect, x: number, y: number): number {
  if (!onBorder(r, x, y) || isCorner(r, x, y)) return -1;
  if (y === r.y + r.h - 1) return 0;
  if (x === r.x) return 1;
  if (y === r.y) return 2;
  return 3;
}

/** Наружу через стену стороны `side`. */
export const outOfSide = (side: number): Cell => FACE[side & 3];

/** Длинные предметы — две клетки (кушетка ординаторской — кресло, одна; как в отрисовке 2а). */
const LONG: ReadonlySet<ObjectKind> = new Set(['bed', 'couch', 'xray', 'ct', 'mri', 'or_table']);
export function isLongItem(kind: ObjectKind, roomType: Id): boolean {
  return kind === 'couch' ? roomType !== 'room.staff' : LONG.has(kind);
}
/** На них лежит пациент — стол аппарата (рентген, КТ, МРТ, операционный). */
const LIE_EQ: ReadonlySet<ObjectKind> = new Set(['xray', 'ct', 'mri', 'or_table']);
const WORK_SURFACE: ReadonlySet<ObjectKind> = new Set(['desk', 'table']);

/** Клетки предмета: своя и, у длинного, следующая по направлению поворота. */
export function cellsOf(it: { kind: ObjectKind; x: number; y: number; rot: Rot; short?: true }, roomType: Id): Cell[] {
  if (!it.short && isLongItem(it.kind, roomType)) {
    const [dx, dy] = FACE[it.rot];
    return [
      [it.x, it.y],
      [it.x + dx, it.y + dy],
    ];
  }
  return [[it.x, it.y]];
}

// --- каталог: что помещению нужно ---------------------------------------------------------------------------------------

/** Место человека в образце: на чём он (стул, кушетка; `slot` — на аппарате) и у чего стоит или сидит. */
export interface Post {
  on?: ObjectKind | 'slot';
  near?: ObjectKind | 'slot';
}

export interface RoomRules {
  smallest: RoomSize;
  /** меньшая и большая сторона наименьшего размера: помещение должно их вместить в любом повороте */
  min: [number, number];
  /** нужная мебель: что стоит на местах людей наименьшего образца и стол у места; стулья ожидания; кровать */
  needs: { kind: ObjectKind; n: number }[];
  /** где лежат — нужна двойная дверь: в образцах есть кровать или пациент лежит на столе аппарата */
  gurney: boolean;
  /** мебель образцов — каталог помещения; аппараты, которые сюда ставят */
  kinds: ObjectKind[];
  equipment: Id[];
  /** аппараты у койки: монитор (ПИТ), монитор и аппарат ИВЛ (реанимация) */
  bedEquipment: Id[];
  /** места должностей и пациента по наименьшему образцу */
  posts: Record<Id, Post>;
  patient?: Post;
}

const rulesCache = new WeakMap<ContentDb, Map<Id, RoomRules>>();

/** Правила помещения из каталога — один раз на базу. */
export function rulesOf(db: ContentDb, type: Id): RoomRules | undefined {
  let byType = rulesCache.get(db);
  if (!byType) rulesCache.set(db, (byType = new Map()));
  const known = byType.get(type);
  if (known) return known;
  const t = db.rooms[type];
  if (!t || t.sizes.length === 0) return undefined;
  const z = t.sizes.reduce((a, b) => (b.w * b.h < a.w * a.h ? b : a));
  const at = (x: number, y: number) => z.objects.findIndex(o => o.x === x && o.y === y);
  const isSlot = (x: number, y: number) => z.slots.some(s => s[0] === x && s[1] === y);
  const used = new Set<number>();
  const postOf = (c: Cell): Post => {
    const [x, y] = c;
    if (isSlot(x, y)) return { on: 'slot' };
    const i = at(x, y);
    const post: Post = i >= 0 ? { on: z.objects[i].kind } : {};
    if (i >= 0) used.add(i);
    // у чего: стол рядом (за ним работают), иначе любой предмет, иначе аппарат
    let near: ObjectKind | 'slot' | undefined;
    for (const [dx, dy] of DIRS) {
      const j = at(x + dx, y + dy);
      if (j >= 0 && WORK_SURFACE.has(z.objects[j].kind)) {
        used.add(j);
        near = z.objects[j].kind;
        break;
      }
    }
    if (!near) {
      for (const [dx, dy] of DIRS) {
        const j = at(x + dx, y + dy);
        if (j >= 0 && j !== i) {
          near = z.objects[j].kind;
          break;
        }
        if (isSlot(x + dx, y + dy)) {
          near = 'slot';
          break;
        }
      }
    }
    if (near) post.near = near;
    return post;
  };
  const posts: Record<Id, Post> = {};
  for (const [role, c] of Object.entries(z.staff)) posts[role] = postOf(c);
  const patient = z.patient ? postOf(z.patient) : undefined;
  const need: Partial<Record<ObjectKind, number>> = {};
  for (const i of used) need[z.objects[i].kind] = (need[z.objects[i].kind] ?? 0) + 1;
  if (t.seats) need.chair = Math.max(need.chair ?? 0, 1);
  const beds = t.beds || t.emergency || t.icu || t.box;
  if (beds) need.bed = Math.max(need.bed ?? 0, 1);
  // мест людей нет — самый частый предмет образца (санузел — раковина, ординаторская — стол)
  if (Object.keys(need).length === 0 && z.slots.length === 0 && z.objects.length > 0) {
    const count = new Map<ObjectKind, number>();
    for (const o of z.objects) count.set(o.kind, (count.get(o.kind) ?? 0) + 1);
    let best: ObjectKind = z.objects[0].kind;
    for (const [k, n] of count) if (n > (count.get(best) ?? 0)) best = k;
    need[best] = 1;
  }
  const kinds = [...new Set(t.sizes.flatMap(s => s.objects.map(o => o.kind)))];
  const gurney = t.sizes.some(s => s.objects.some(o => o.kind === 'bed') || (s.patient !== undefined && s.slots.some(q => q[0] === s.patient![0] && q[1] === s.patient![1])));
  const fromSlots = [...new Set(t.sizes.flatMap(s => Object.keys(s.slotsOf ?? {})))].sort();
  const rules: RoomRules = {
    smallest: z,
    min: [Math.min(z.w, z.h), Math.max(z.w, z.h)],
    needs: (Object.entries(need) as [ObjectKind, number][]).map(([kind, n]) => ({ kind, n })),
    gurney,
    kinds,
    equipment: t.equipment,
    bedEquipment: t.icu ? (fromSlots.length ? fromSlots : t.equipment) : [],
    posts,
    ...(patient ? { patient } : {}),
  };
  byType.set(type, rules);
  return rules;
}

/** Цена предмета: мебель — таблица, аппарат — каталог. */
export function priceOf(db: ContentDb, kind: ObjectKind, eq?: Id): number {
  return eq ? (db.equipment[eq]?.price ?? 0) : (FURNITURE[kind] ?? 0);
}

/** Цена помещения: цена наименьшего размера, пересчитанная на площадь, до сотни. */
export function roomPrice(db: ContentDb, type: Id, w: number, h: number): number {
  const r = rulesOf(db, type);
  if (!r) return 0;
  return Math.round((r.smallest.cost * w * h) / (r.smallest.w * r.smallest.h) / 100) * 100;
}

/**
 * Содержание помещения в сутки (spec docs/specs/2026-10-economy.md): содержание наименьшего размера, пересчитанное на площадь,
 * как цена; до рубля.
 */
export function roomUpkeep(db: ContentDb, type: Id, w: number, h: number): number {
  const r = rulesOf(db, type);
  if (!r) return 0;
  return Math.round((r.smallest.upkeep * w * h) / (r.smallest.w * r.smallest.h));
}

/** Половина цены — при сносе (`economy.refund`). */
export const refundOf = (db: ContentDb, price: number) => Math.floor((price * db.economy.refund) / 100);

/** Что вернётся за снос помещения: половина помещения, мебели, аппаратов и двери. */
export function demolishRefund(db: ContentDb, room: SiteRoom): number {
  const items = room.items.reduce((n, i) => n + priceOf(db, i.kind, i.eq), 0);
  const door = room.door ? (DOOR_PRICE[room.door.length] ?? 0) : 0;
  return refundOf(db, roomPrice(db, room.type, room.w, room.h)) + refundOf(db, items) + refundOf(db, door);
}

// --- участок ---------------------------------------------------------------------------------------------------------

/** Участок пустого начала и здание на нём (spec «Участок и здание»). */
export const EMPTY_LOT = { w: 60, h: 40, building: { x: 6, y: 6, w: 48, h: 28 } as Rect };

/** Пустое здание: стены корпуса, главный вход посередине южной стены, вход скорой — в восточной, ближе к югу. */
export function emptySite(): Site {
  const { w, h, building: b } = EMPTY_LOT;
  const mid = b.x + Math.floor(b.w / 2) - 1;
  const east = b.x + b.w - 1;
  const south = b.y + b.h - 1;
  return {
    w, h,
    inside: [{ x: b.x + 1, y: b.y + 1, w: b.w - 2, h: b.h - 2 }],
    main: [
      [mid, south],
      [mid + 1, south],
    ],
    ambulance: [
      [east, south - 7],
      [east, south - 6],
    ],
    rooms: [], decor: [], next: 1, nextItem: 1,
  };
}

/** Карта клеток участка — для проверок и плана; одна на больницу. */
export interface SiteMap {
  w: number;
  h: number;
  /** CELL: улица, пол, коридор, стена, дверь */
  cells: Uint8Array;
  inside: Uint8Array;
  /** стены корпуса: снаружи здания, рядом (с углами) с внутренностью */
  outline: Uint8Array;
  /** номер помещения в списке + 1 — у пола; у стены — первого, чья она */
  room: Int32Array;
  /** сколько помещений держат клетку стеной */
  walls: Uint8Array;
  /** где строить помещение нельзя: входы и клетки за ними, двери и клетки у них, предметы коридора — что мешает */
  keep: Map<number, { what: 'entrance' | 'door' | 'decor'; room?: string }>;
  /** от главного входа по коридору и дверям */
  reach: Uint8Array;
}

const maps = new WeakMap<Site, SiteMap>();

export function mapOf(site: Site): SiteMap {
  let m = maps.get(site);
  if (!m) maps.set(site, (m = buildMap(site, site.rooms)));
  return m;
}

function buildMap(site: Site, rooms: readonly SiteRoom[]): SiteMap {
  const { w, h } = site;
  const n = w * h;
  const inside = new Uint8Array(n);
  for (const r of site.inside) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (x >= 0 && y >= 0 && x < w && y < h) inside[y * w + x] = 1;
  const outline = new Uint8Array(n);
  const cells = new Uint8Array(n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (inside[i]) {
        cells[i] = CELL.corridor;
        continue;
      }
      for (let dy = -1; dy <= 1 && !outline[i]; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < w && ny < h && inside[ny * w + nx]) {
            outline[i] = 1;
            break;
          }
        }
      }
      if (outline[i]) cells[i] = CELL.wall;
    }
  }
  const room = new Int32Array(n);
  const walls = new Uint8Array(n);
  rooms.forEach((r, k) => {
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const i = y * w + x;
        if (isInterior(r, x, y)) {
          cells[i] = CELL.floor;
          room[i] = k + 1;
        } else {
          if (cells[i] !== CELL.floor) cells[i] = CELL.wall;
          walls[i]++;
          if (!room[i]) room[i] = k + 1;
        }
      }
    }
  });
  const keep: SiteMap['keep'] = new Map();
  const mark = (x: number, y: number, v: { what: 'entrance' | 'door' | 'decor'; room?: string }) => {
    if (x >= 0 && y >= 0 && x < w && y < h && !keep.has(y * w + x)) keep.set(y * w + x, v);
  };
  for (const r of rooms) {
    if (!r.door) continue;
    const side = sideOf(r, r.door[0][0], r.door[0][1]);
    const [ox, oy] = outOfSide(side);
    for (const [x, y] of r.door) {
      cells[y * w + x] = CELL.door;
      mark(x, y, { what: 'door', room: r.id });
      mark(x + ox, y + oy, { what: 'door', room: r.id });
    }
  }
  for (const [x, y] of [...site.main, ...site.ambulance]) {
    cells[y * w + x] = CELL.door;
    mark(x, y, { what: 'entrance' });
    for (const [dx, dy] of N4) if (inside[(y + dy) * w + (x + dx)]) mark(x + dx, y + dy, { what: 'entrance' });
  }
  for (const d of site.decor) mark(d.x, d.y, { what: 'decor' });
  const reach = reachOf(w, h, cells, site.main);
  return { w, h, cells, inside, outline, room, walls, keep, reach };
}

/** От главного входа — по коридору и дверям (полы помещений — тупики, в них не заходим). */
function reachOf(w: number, h: number, cells: Uint8Array, from: readonly Cell[]): Uint8Array {
  const seen = new Uint8Array(w * h);
  const queue: number[] = [];
  for (const [x, y] of from) {
    const i = y * w + x;
    if (!seen[i]) {
      seen[i] = 1;
      queue.push(i);
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    const x = i % w;
    const y = (i - x) / w;
    for (const [dx, dy] of N4) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      const c = cells[j];
      if (seen[j] || (c !== CELL.corridor && c !== CELL.door)) continue;
      seen[j] = 1;
      queue.push(j);
    }
  }
  return seen;
}

/** Клетки коридора: внутри здания и не в помещении — номера y·w + x по возрастанию. */
export function corridorOf(site: Site): number[] {
  const m = mapOf(site);
  const out: number[] = [];
  for (let i = 0; i < m.cells.length; i++) if (m.cells[i] === CELL.corridor) out.push(i);
  return out;
}

// --- проверки ------------------------------------------------------------------------------------------------------

/** Почему нельзя — слово для призрака и для извещения (строки — в src/i18n). */
export type SiteError =
  | { kind: 'unknown' }
  | { kind: 'mode' }
  | { kind: 'outside' }
  | { kind: 'small'; min: [number, number] }
  | { kind: 'large'; max: number }
  | { kind: 'overlap'; room?: string; what?: 'entrance' | 'door' | 'decor' }
  | { kind: 'noCorridor' }
  | { kind: 'cutsOff'; room?: string; ambulance?: true }
  | { kind: 'notInRoom' }
  | { kind: 'notHere' }
  | { kind: 'occupied'; item: ObjectKind }
  | { kind: 'doorway' }
  | { kind: 'blocks' }
  | { kind: 'badWall' }
  | { kind: 'shared' }
  | { kind: 'notCorridor' }
  | { kind: 'notEmpty' }
  | { kind: 'noFit' }
  | { kind: 'nothing' }
  | { kind: 'inUse' }
  | { kind: 'busy' }
  /** готовое помещение (spec docs/specs/2026-10-ready-rooms.md): дверь образца — не в коридор от главного входа */
  | { kind: 'doorTo' }
  /** касса ПК (spec docs/specs/2026-10-economy.md): действие увело бы кассу ниже предела — не хватает `need` ₽ */
  | { kind: 'money'; need: number };

export type Check = { ok: true; cost: number } | { ok: false; error: SiteError };
const fail = (error: SiteError): { ok: false; error: SiteError } => ({ ok: false, error });

/** Можно ли поставить помещение типа `type` прямоугольником `r`, и цена. */
export function checkRoom(db: ContentDb, site: Site, type: Id, r: Rect): Check {
  const rules = rulesOf(db, type);
  if (!rules) return fail({ kind: 'unknown' });
  const lo = Math.min(r.w, r.h);
  const hi = Math.max(r.w, r.h);
  if (lo < rules.min[0] || hi < rules.min[1]) return fail({ kind: 'small', min: [rules.smallest.w, rules.smallest.h] });
  if (r.w > MAX_SIDE || r.h > MAX_SIDE) return fail({ kind: 'large', max: MAX_SIDE });
  const m = mapOf(site);
  if (r.x < 0 || r.y < 0 || r.x + r.w > m.w || r.y + r.h > m.h) return fail({ kind: 'outside' });
  // за стенами: пол — внутри здания, стена — внутри или на стене корпуса
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      const i = y * m.w + x;
      if (isInterior(r, x, y) ? !m.inside[i] : !m.inside[i] && !m.outline[i]) return fail({ kind: 'outside' });
    }
  }
  // мешает: чужой пол под чем угодно, чужая стена под полом; входы, двери соседей и клетки у них, скамьи
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      const i = y * m.w + x;
      const own = m.room[i];
      if (own && (m.cells[i] === CELL.floor || isInterior(r, x, y) || m.cells[i] === CELL.door)) return fail({ kind: 'overlap', room: site.rooms[own - 1].id });
      const k = m.keep.get(i);
      if (k) return fail({ kind: 'overlap', what: k.what, ...(k.room ? { room: k.room } : {}) });
    }
  }
  // после постройки: дверь есть куда поставить, и ничего не отрезано от главного входа
  const after = buildMap(site, [...site.rooms, { id: '', type, ...r, items: [] }]);
  if (!doorPlaces(after, r).length) return fail({ kind: 'noCorridor' });
  for (const other of site.rooms) {
    if (!other.door) continue;
    const before = other.door.some(([x, y]) => m.reach[y * m.w + x]);
    const now = other.door.some(([x, y]) => after.reach[y * m.w + x]);
    if (before && !now) return fail({ kind: 'cutsOff', room: other.id });
  }
  const amb = (mm: SiteMap) => site.ambulance.some(([x, y]) => mm.reach[y * m.w + x]);
  if (site.ambulance.length && amb(m) && !amb(after)) return fail({ kind: 'cutsOff', ambulance: true });
  return { ok: true, cost: roomPrice(db, type, r.w, r.h) };
}

/** Клетки стены, где могла бы стоять дверь: не угол, стена только этого помещения, снаружи — коридор от входа. */
function doorPlaces(m: SiteMap, r: Rect): Cell[] {
  const out: Cell[] = [];
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      const side = sideOf(r, x, y);
      if (side < 0 || m.walls[y * m.w + x] !== 1) continue;
      const [ox, oy] = outOfSide(side);
      const nx = x + ox;
      const ny = y + oy;
      if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h) continue;
      const j = ny * m.w + nx;
      if (m.cells[j] === CELL.corridor && m.reach[j]) out.push([x, y]);
    }
  }
  return out;
}

/** Клетки, занятые предметами помещения (кроме `except`): клетка → предмет. */
function itemCells(room: SiteRoom, except?: number): Map<string, SiteItem> {
  const out = new Map<string, SiteItem>();
  for (const it of room.items) {
    if (it.id === except) continue;
    for (const [x, y] of cellsOf(it, room.type)) out.set(key(x, y), it);
  }
  return out;
}

/** Клетки сразу за дверью внутри помещения. */
export function doorInner(room: SiteRoom): Cell[] {
  if (!room.door?.length) return [];
  const side = sideOf(room, room.door[0][0], room.door[0][1]);
  const [ox, oy] = outOfSide(side);
  return room.door.map(([x, y]) => [x - ox, y - oy] as Cell);
}

/** Куски свободного пола помещения (4 соседа): номер куска в клетке; занятые и стены — нет. */
function pieces(room: SiteRoom, taken: ReadonlySet<string>): { of: Map<string, number>; size: number[] } {
  const of = new Map<string, number>();
  const size: number[] = [];
  for (let y = room.y + 1; y < room.y + room.h - 1; y++) {
    for (let x = room.x + 1; x < room.x + room.w - 1; x++) {
      const k0 = key(x, y);
      if (taken.has(k0) || of.has(k0)) continue;
      const n = size.length;
      of.set(k0, n);
      const queue: Cell[] = [[x, y]];
      for (let head = 0; head < queue.length; head++) {
        const [cx, cy] = queue[head];
        for (const [dx, dy] of N4) {
          const nx = cx + dx;
          const ny = cy + dy;
          const k = key(nx, ny);
          if (of.has(k) || taken.has(k) || !isInterior(room, nx, ny)) continue;
          of.set(k, n);
          queue.push([nx, ny]);
        }
      }
      size.push(queue.length);
    }
  }
  return { of, size };
}

/** Кусок пола, который важен: за дверью; двери нет — самый большой (при равных — первый сверху слева). */
function mainPiece(room: SiteRoom, p: { of: Map<string, number>; size: number[] }): number {
  for (const [x, y] of doorInner(room)) {
    const n = p.of.get(key(x, y));
    if (n !== undefined) return n;
  }
  let best = -1;
  p.size.forEach((n, i) => {
    if (best < 0 || n > p.size[best]) best = i;
  });
  return best;
}

/** Предметы, к которым подходят: на них сидят и лежат, за ними работают, аппараты. */
const USED: ReadonlySet<ObjectKind> = new Set(['chair', 'bench', 'couch', 'bed', 'desk', 'table']);

/**
 * Перекроет ли предмет проход (как `splits` отрисовки 2а): клетки `cells` поверх занятых `taken` делят на части пол за
 * дверью (двери нет — самый большой кусок), или к предмету, которым пользуются, от двери не подойти. Отдельные куски,
 * что были и прежде (ряд над стульями в образце зоны ожидания), не в счёт.
 */
function blocked(room: SiteRoom, taken: ReadonlySet<string>, cells: readonly Cell[], used: boolean): boolean {
  const before = pieces(room, taken);
  const main = mainPiece(room, before);
  if (main < 0) return false;
  const add = new Set(cells.map(([x, y]) => key(x, y)));
  const rest = [...before.of].filter(([k, n]) => n === main && !add.has(k)).map(([k]) => k);
  if (rest.length > 1) {
    const inMain = new Set(rest);
    const reach = new Set([rest[0]]);
    const queue = [rest[0]];
    for (let head = 0; head < queue.length; head++) {
      const [x, y] = queue[head].split(',').map(Number);
      for (const [dx, dy] of N4) {
        const k = key(x + dx, y + dy);
        if (reach.has(k) || !inMain.has(k)) continue;
        reach.add(k);
        queue.push(k);
      }
    }
    if (reach.size < rest.length) return true;
  }
  if (!used) return false;
  // подойти: хоть одна соседняя клетка — в том куске
  const inMain = new Set(rest);
  return !cells.some(([x, y]) => N4.some(([dx, dy]) => inMain.has(key(x + dx, y + dy))));
}

/** Что ставят: мебель из каталога помещения или аппарат каталога. */
export interface ItemSpec {
  kind: ObjectKind;
  eq?: Id;
  x: number;
  y: number;
  rot: Rot;
}

/** Можно ли поставить предмет в помещение (`moving` — переставляют этот предмет), и цена. */
export function checkItem(db: ContentDb, site: Site, roomId: string, it: ItemSpec, moving?: number): Check {
  const room = site.rooms.find(r => r.id === roomId);
  if (!room) return fail({ kind: 'notInRoom' });
  const rules = rulesOf(db, room.type);
  if (!rules) return fail({ kind: 'unknown' });
  if (it.eq ? !rules.equipment.includes(it.eq) || db.equipment[it.eq]?.sprite !== it.kind : !rules.kinds.includes(it.kind)) return fail({ kind: 'notHere' });
  const cells = cellsOf(it, room.type);
  if (cells.some(([x, y]) => !isInterior(room, x, y))) return fail({ kind: 'notInRoom' });
  const taken = itemCells(room, moving);
  for (const [x, y] of cells) {
    const other = taken.get(key(x, y));
    if (other) return fail({ kind: 'occupied', item: other.kind });
  }
  const inner = new Set(doorInner(room).map(([x, y]) => key(x, y)));
  if (cells.some(([x, y]) => inner.has(key(x, y)))) return fail({ kind: 'doorway' });
  if (blocked(room, new Set(taken.keys()), cells, it.eq !== undefined || USED.has(it.kind))) return fail({ kind: 'blocks' });
  return { ok: true, cost: moving !== undefined ? 0 : priceOf(db, it.kind, it.eq) };
}

/** Можно ли поставить дверь в клетки `cells` стены помещения, и цена (дверь заменяет прежнюю: та — за полцены). */
export function checkDoor(db: ContentDb, site: Site, roomId: string, cells: Cell[]): Check {
  const room = site.rooms.find(r => r.id === roomId);
  if (!room) return fail({ kind: 'unknown' });
  if (cells.length < 1 || cells.length > 2) return fail({ kind: 'badWall' });
  const side = sideOf(room, cells[0][0], cells[0][1]);
  if (side < 0) return fail({ kind: 'badWall' });
  if (cells.length === 2) {
    const [a, b] = cells;
    if (sideOf(room, b[0], b[1]) !== side || Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) !== 1) return fail({ kind: 'badWall' });
  }
  if (room.door && room.door.length === cells.length && room.door.every(([x, y]) => cells.some(c => c[0] === x && c[1] === y))) return fail({ kind: 'nothing' });
  const m = mapOf(site);
  const [ox, oy] = outOfSide(side);
  const taken = itemCells(room);
  for (const [x, y] of cells) {
    if (m.walls[y * m.w + x] !== 1) return fail({ kind: 'shared' });
    const nx = x + ox;
    const ny = y + oy;
    if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h || m.cells[ny * m.w + nx] !== CELL.corridor) return fail({ kind: 'notCorridor' });
    if (taken.has(key(x - ox, y - oy))) return fail({ kind: 'doorway' });
  }
  const old = room.door ? refundOf(db, DOOR_PRICE[room.door.length] ?? 0) : 0;
  return { ok: true, cost: (DOOR_PRICE[cells.length] ?? 0) - old };
}

// --- «Обставить» ----------------------------------------------------------------------------------------------------

/** Предмет без номера — из образца. */
export type ItemDraft = Omit<SiteItem, 'id'>;

/**
 * Предметы образца S/M/L, подогнанного к помещению: самый большой образец, который помещается дверной стороной к двери
 * (нет двери — к коридору от входа; нигде — любой стороной); вдоль стены — к двери или посередине. Аппараты — `equipment`
 * по местам образца, нет — первые по каталогу без улучшения. Длинный предмет без второй клетки — короткий, если
 * `short`, иначе его нет.
 */
export function templateItems(
  db: ContentDb,
  site: Site,
  room: SiteRoom,
  opts: { size?: RoomSizeId; rot?: Rot; at?: Cell; equipment?: (Id | null)[]; short?: boolean } = {},
): { size: RoomSizeId; rot: Rot; items: ItemDraft[] } | undefined {
  const t = db.rooms[room.type];
  if (!t) return undefined;
  const m = mapOf(site);
  // стороны: с дверью; без двери — выходящие в коридор от входа, больше клеток — раньше
  const front = (side: number) => {
    let n = 0;
    for (let y = room.y; y < room.y + room.h; y++) for (let x = room.x; x < room.x + room.w; x++) {
      if (sideOf(room, x, y) !== side || m.walls[y * m.w + x] !== 1) continue;
      const [ox, oy] = outOfSide(side);
      const j = (y + oy) * m.w + (x + ox);
      if (m.cells[j] === CELL.corridor && m.reach[j]) n++;
    }
    return n;
  };
  const doorSide = room.door ? sideOf(room, room.door[0][0], room.door[0][1]) : -1;
  const order = [0, 2, 1, 3];
  const sides: number[] = opts.rot !== undefined ? [opts.rot] : doorSide >= 0 ? [doorSide, ...order.filter(s => s !== doorSide)] : [...order].sort((a, b) => front(b) - front(a) || order.indexOf(a) - order.indexOf(b));
  const sizes = opts.size ? t.sizes.filter(z => z.id === opts.size) : [...t.sizes].sort((a, b) => b.w * b.h - a.w * a.h);
  for (const side of sides) {
    const rot = side as Rot;
    for (const z of sizes) {
      const [tw, th] = dimsOf(z, rot);
      if (tw > room.w || th > room.h) continue;
      return { size: z.id, rot, items: placeTemplate(db, room, z, rot, opts.at ?? anchorOf(room, z, rot), opts.equipment, opts.short === true) };
    }
  }
  return undefined;
}

/** Угол образца в помещении: дверная стена — на стене помещения той же стороны; вдоль — к двери или посередине. */
function anchorOf(room: SiteRoom, z: RoomSize, rot: Rot): Cell {
  const [tw, th] = dimsOf(z, rot);
  const along = rot % 2 === 0;
  const free = along ? room.w - tw : room.h - th;
  let off = Math.floor(free / 2);
  if (room.door?.length) {
    // первая клетка двери образца — на первой клетке двери помещения, если влезает
    const [dx, dy] = turnOf(z, rot, z.door.x, z.h - 1);
    const want = along ? Math.min(...room.door.map(c => c[0])) - room.x - dx : Math.min(...room.door.map(c => c[1])) - room.y - dy;
    off = Math.max(0, Math.min(free, want));
  }
  const x = along ? room.x + off : rot === 1 ? room.x : room.x + room.w - tw;
  const y = !along ? room.y + off : rot === 2 ? room.y : room.y + room.h - th;
  return [x, y];
}

function placeTemplate(db: ContentDb, room: SiteRoom, z: RoomSize, rot: Rot, at: Cell, equipment: (Id | null)[] | undefined, short: boolean): ItemDraft[] {
  const to = (c: readonly [number, number]): Cell => {
    const [x, y] = turnOf(z, rot, c[0], c[1]);
    return [at[0] + x, at[1] + y];
  };
  const eqs = equipment ?? defaultEquipment(db, room.type, z);
  const drafts: { kind: ObjectKind; eq?: Id; cell: Cell }[] = [];
  for (const o of z.objects) drafts.push({ kind: o.kind, cell: to([o.x, o.y]) });
  z.slots.forEach((s, i) => {
    const id = eqs[i];
    if (id && db.equipment[id]) drafts.push({ kind: db.equipment[id].sprite, eq: id, cell: to(s) });
  });
  const inside = (x: number, y: number) => isInterior(room, x, y);
  const people = [...Object.values(z.staff).map(c => to(c)), ...(z.patient ? [to(z.patient)] : [])];
  const reserved = new Set(people.map(([x, y]) => key(x, y)));
  const taken = new Set(drafts.filter(d => inside(d.cell[0], d.cell[1])).map(d => key(d.cell[0], d.cell[1])));
  // клетки у двери изнутри: у настоящей двери — её, иначе — двери образца
  const out = FACE[rot];
  const inner = room.door?.length ? doorInner(room) : Array.from({ length: z.door.width }, (_, k) => to([z.door.x + k, z.h - 2]));
  const innerSet = new Set(inner.map(([x, y]) => key(x, y)));
  const items: ItemDraft[] = [];
  // повороты — по стенам образца: в помещении больше образца предметы смотрят так же, как в нём
  const [tw, th] = dimsOf(z, rot);
  const facing = turnsOf({ x: at[0], y: at[1], w: tw, h: th }, drafts.map(d => ({ kind: d.kind, x: d.cell[0], y: d.cell[1] })), people);
  drafts.forEach((d, i) => {
    const [x, y] = d.cell;
    if (!inside(x, y) || innerSet.has(key(x, y))) return;
    const base: ItemDraft = { kind: d.kind, ...(d.eq ? { eq: d.eq } : {}), x, y, rot: facing[i] };
    if (!isLongItem(d.kind, room.type)) {
      items.push(base);
      return;
    }
    // вторая клетка длинного: к двери, от двери, поперёк (как отрисовка 2а); не на чужое место и не отрезая проход
    const dirs: Cell[] = [out, [-out[0], -out[1]], [out[1], out[0]], [-out[1], -out[0]]];
    for (const [dx, dy] of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      const k = key(nx, ny);
      if (!inside(nx, ny) || taken.has(k) || reserved.has(k) || innerSet.has(k)) continue;
      if (blocked(room, taken, [[nx, ny]], false)) continue;
      taken.add(k);
      items.push({ ...base, rot: FACE.findIndex(f => f[0] === dx && f[1] === dy) as Rot });
      return;
    }
    if (short) items.push({ ...base, short: true });
  });
  return items;
}

/** Аппараты по местам образца: у коек реанимации — по `slotsOf`; со своим местом; остальные — первые без улучшения. */
function defaultEquipment(db: ContentDb, type: Id, z: RoomSize): (Id | null)[] {
  const out: (Id | null)[] = z.slots.map(() => null);
  if (z.slotsOf) {
    for (const [eq, idx] of Object.entries(z.slotsOf)) for (const i of idx) out[i] = eq;
    return out;
  }
  const list = db.rooms[type].equipment.filter(id => !db.equipment[id].upgradeOf);
  for (const id of list) {
    const own = db.equipment[id].slot;
    if (own !== undefined && own < out.length && out[own] === null) out[own] = id;
  }
  const rest = list.filter(id => db.equipment[id].slot === undefined);
  let k = 0;
  for (let i = 0; i < out.length && rest.length; i++) if (out[i] === null) out[i] = rest[k++ % rest.length];
  return out;
}

/**
 * Куда повёрнуты предметы — правила карты «Анамнеза» (src/render/orient.ts, `objectTurns`) в помещении: стул у стола —
 * к столу, в ряду стульев — спиной к ближней стене поперёк ряда, один — спиной к ближней стене; стол — к тому, кто за
 * ним работает (`users`), иначе к стулу рядом; остальное — спиной к стене вплотную; стены рядом нет — 0.
 */
export function turnsOf(room: Rect, objects: readonly { kind: ObjectKind; x: number; y: number }[], users: readonly Cell[] = []): Rot[] {
  const at = new Map(objects.map(o => [key(o.x, o.y), o.kind]));
  const people = new Set(users.map(([x, y]) => key(x, y)));
  const wallDist = (x: number, y: number, i: number) => (i === 0 ? y - room.y : i === 1 ? room.x + room.w - 1 - x : i === 2 ? room.y + room.h - 1 - y : x - room.x);
  const nearWall = (x: number, y: number, sides: readonly number[]): Rot => {
    let best = sides[0];
    for (const i of sides) if (wallDist(x, y, i) < wallDist(x, y, best)) best = i;
    return best as Rot;
  };
  return objects.map(({ kind, x, y }) => {
    const side = (test: (k: ObjectKind | undefined, cx: number, cy: number) => boolean) => DIRS.findIndex(([dx, dy]) => test(at.get(key(x + dx, y + dy)), x + dx, y + dy));
    const faceTo = (i: number) => ((i + 2) % 4) as Rot;
    if (kind === 'chair') {
      const desk = side(k => k !== undefined && WORK_SURFACE.has(k));
      if (desk >= 0) return faceTo(desk);
      const row = side(k => k === 'chair');
      if (row === 1 || row === 3) return nearWall(x, y, [0, 2]);
      if (row === 0 || row === 2) return nearWall(x, y, [3, 1]);
      return nearWall(x, y, [0, 1, 2, 3]);
    }
    if (WORK_SURFACE.has(kind)) {
      const user = side((_k, cx, cy) => people.has(key(cx, cy)));
      if (user >= 0) return faceTo(user);
      const chair = side(k => k === 'chair');
      if (chair >= 0) return faceTo(chair);
    }
    const wall = DIRS.findIndex((_, i) => wallDist(x, y, i) === 1);
    return (wall < 0 ? 0 : wall) as Rot;
  });
}

/** Поворот нового предмета по правилам карты — для призрака; R поворачивает дальше. */
export function autoRot(db: ContentDb, site: Site, roomId: string, kind: ObjectKind, x: number, y: number): Rot {
  const room = site.rooms.find(r => r.id === roomId);
  if (!room) return 0;
  const plan = planOfSite(db, site);
  const placed = plan.rooms.find(r => r.id === roomId);
  const users = placed ? Object.values(placed.staff) : [];
  const objects = [...room.items.filter(i => !i.leaving).map(i => ({ kind: i.kind, x: i.x, y: i.y })), { kind, x, y }];
  return turnsOf(room, objects, users)[objects.length - 1];
}

// --- действия -------------------------------------------------------------------------------------------------------

export type Done = { ok: true; site: Site; cost: number; room?: string } | { ok: false; error: SiteError };

const withRoom = (site: Site, room: SiteRoom): Site => ({ ...site, rooms: site.rooms.map(r => (r.id === room.id ? room : r)) });

/** Новое помещение — пустое, без двери; его перестраивают. */
export function addRoom(db: ContentDb, site: Site, type: Id, r: Rect): Done {
  const c = checkRoom(db, site, type, r);
  if (!c.ok) return c;
  const id = `r${site.next}`;
  const room: SiteRoom = { id, type, x: r.x, y: r.y, w: r.w, h: r.h, items: [] };
  return { ok: true, site: { ...site, rooms: [...site.rooms, room], next: site.next + 1, editing: id }, cost: c.cost, room: id };
}

export function addItem(db: ContentDb, site: Site, roomId: string, it: ItemSpec): Done {
  const c = checkItem(db, site, roomId, it);
  if (!c.ok) return c;
  const room = site.rooms.find(r => r.id === roomId)!;
  const item: SiteItem = { id: site.nextItem, kind: it.kind, ...(it.eq ? { eq: it.eq } : {}), x: it.x, y: it.y, rot: it.rot };
  return { ok: true, site: { ...withRoom(site, { ...room, items: [...room.items, item] }), nextItem: site.nextItem + 1, editing: roomId }, cost: c.cost, room: roomId };
}

export function moveItem(db: ContentDb, site: Site, roomId: string, id: number, to: { x: number; y: number; rot: Rot }): Done {
  const room = site.rooms.find(r => r.id === roomId);
  const it = room?.items.find(i => i.id === id);
  if (!room || !it || it.leaving) return fail({ kind: 'nothing' });
  if (it.x === to.x && it.y === to.y && it.rot === to.rot) return fail({ kind: 'nothing' });
  const c = checkItem(db, site, roomId, { kind: it.kind, ...(it.eq ? { eq: it.eq } : {}), x: to.x, y: to.y, rot: to.rot }, id);
  if (!c.ok) return c;
  const moved: SiteItem = { ...it, x: to.x, y: to.y, rot: to.rot };
  delete moved.short;
  return { ok: true, site: { ...withRoom(site, { ...room, items: room.items.map(i => (i.id === id ? moved : i)) }), editing: roomId }, cost: 0, room: roomId };
}

/** Убрать предмет: половина цены назад; `later` — занятый: уберут, когда освободится. */
export function removeItem(db: ContentDb, site: Site, roomId: string, id: number, later = false): Done {
  const room = site.rooms.find(r => r.id === roomId);
  const it = room?.items.find(i => i.id === id);
  if (!room || !it || it.leaving) return fail({ kind: 'nothing' });
  const items = later ? room.items.map(i => (i.id === id ? { ...i, leaving: true as const } : i)) : room.items.filter(i => i.id !== id);
  return { ok: true, site: { ...withRoom(site, { ...room, items }), editing: roomId }, cost: -refundOf(db, priceOf(db, it.kind, it.eq)), room: roomId };
}

export function setDoor(db: ContentDb, site: Site, roomId: string, cells: Cell[]): Done {
  const c = checkDoor(db, site, roomId, cells);
  if (!c.ok) return c;
  const room = site.rooms.find(r => r.id === roomId)!;
  const door = cells.map(([x, y]) => [x, y] as Cell).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  return { ok: true, site: { ...withRoom(site, { ...room, door }), editing: roomId }, cost: c.cost, room: roomId };
}

export function removeDoor(db: ContentDb, site: Site, roomId: string): Done {
  const room = site.rooms.find(r => r.id === roomId);
  if (!room?.door) return fail({ kind: 'nothing' });
  const next: SiteRoom = { ...room };
  delete next.door;
  return { ok: true, site: { ...withRoom(site, next), editing: roomId }, cost: -refundOf(db, DOOR_PRICE[room.door.length] ?? 0), room: roomId };
}

/** Цена и предметы «Обставить» — только пустое помещение. */
export function furnishOf(db: ContentDb, site: Site, roomId: string): { ok: true; cost: number; items: ItemDraft[]; size: RoomSizeId } | { ok: false; error: SiteError } {
  const room = site.rooms.find(r => r.id === roomId);
  if (!room) return fail({ kind: 'unknown' });
  if (room.items.length > 0) return fail({ kind: 'notEmpty' });
  const t = templateItems(db, site, room);
  if (!t || t.items.length === 0) return fail({ kind: 'noFit' });
  return { ok: true, cost: t.items.reduce((n, i) => n + priceOf(db, i.kind, i.eq), 0), items: t.items, size: t.size };
}

export function furnish(db: ContentDb, site: Site, roomId: string): Done {
  const f = furnishOf(db, site, roomId);
  if (!f.ok) return f;
  const room = site.rooms.find(r => r.id === roomId)!;
  let n = site.nextItem;
  const items = f.items.map(d => ({ id: n++, ...d }));
  return { ok: true, site: { ...withRoom(site, { ...room, items }), nextItem: n, editing: roomId }, cost: f.cost, room: roomId };
}

// --- готовое помещение (spec docs/specs/2026-10-ready-rooms.md) -------------------------------------------------------

/** Готовое помещение до постройки: прямоугольник образца, клетки двери, предметы без номеров. */
export interface ReadyDraft {
  rect: Rect;
  door: Cell[];
  items: ItemDraft[];
}

export type ReadyCheck = { ok: true; cost: number; draft: ReadyDraft } | { ok: false; error: SiteError; draft?: ReadyDraft };

/**
 * Образец `size` типа `type` целиком с углом в (x, y) и поворотом `rot` — без проверок: размер образца, дверь там, где у
 * него (на его «нижней» стене; где лежат — двойная, иначе как у образца, не шире двух клеток — посередине его проёма;
 * вторая клетка — следующая вдоль стены), все предметы и аппараты на своих местах (длинный без второй клетки — короткий,
 * как в готовой больнице).
 * Нет такого образца — нет.
 */
export function readyDraft(db: ContentDb, site: Site, type: Id, size: RoomSizeId, x: number, y: number, rot: Rot): ReadyDraft | undefined {
  const z = db.rooms[type]?.sizes.find(s => s.id === size);
  const rules = rulesOf(db, type);
  if (!z || !rules) return undefined;
  const [w, h] = dimsOf(z, rot);
  const rect = { x, y, w, h };
  const width = rules.gurney ? 2 : Math.min(2, z.door.width);
  // вторая клетка двойной — правее, у угла — левее; у образца шире двери — посередине его проёма
  const from = width > z.door.width ? (z.door.x + 1 > z.w - 2 ? z.door.x - 1 : z.door.x) : z.door.x + Math.floor((z.door.width - width) / 2);
  const door = Array.from({ length: width }, (_, k): Cell => {
    const [dx, dy] = turnOf(z, rot, from + k, z.h - 1);
    return [x + dx, y + dy];
  }).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const t = templateItems(db, site, { id: '', type, ...rect, door, items: [] }, { size, rot, at: [x, y], short: true });
  return { rect, door, items: t?.items ?? [] };
}

/**
 * Можно ли поставить готовое помещение, и цена — как у собранного руками: помещение по площади, дверь, предметы. Проверки —
 * те же, что у протянутого помещения, и одна своя: дверь выходит в коридор, до которого дойти от главного входа
 * (`doorTo` — на стене корпуса, в общей стене, в отрезанном коридоре). Не вышло — с образцом: призрак рисует его красным.
 */
export function checkReady(db: ContentDb, site: Site, type: Id, size: RoomSizeId, x: number, y: number, rot: Rot): ReadyCheck {
  const draft = readyDraft(db, site, type, size, x, y, rot);
  if (!draft) return fail({ kind: 'unknown' });
  const c = checkRoom(db, site, type, draft.rect);
  if (!c.ok) return { ok: false, error: c.error, draft };
  const after = buildMap(site, [...site.rooms, { id: '', type, ...draft.rect, door: draft.door, items: [] }]);
  const [ox, oy] = outOfSide(sideOf(draft.rect, draft.door[0][0], draft.door[0][1]));
  for (const [x0, y0] of draft.door) {
    // клетка перед дверью — коридор, до которого дойти от главного входа; стена двери — только этого помещения
    const fx = x0 + ox;
    const fy = y0 + oy;
    const j = fy * after.w + fx;
    const front = fx >= 0 && fy >= 0 && fx < after.w && fy < after.h;
    if (after.walls[y0 * after.w + x0] !== 1 || !front || after.cells[j] !== CELL.corridor || !after.reach[j]) return { ok: false, error: { kind: 'doorTo' }, draft };
  }
  const items = draft.items.reduce((n, i) => n + priceOf(db, i.kind, i.eq), 0);
  return { ok: true, cost: c.cost + (DOOR_PRICE[draft.door.length] ?? 0) + items, draft };
}

/** Пустой участок — для цены готового в каталоге: образец от участка не зависит. */
const BLANK = emptySite();

/** Цена готового помещения в каталоге: от места и поворота не зависит. Нет такого образца — 0. */
export function readyCost(db: ContentDb, type: Id, size: RoomSizeId): number {
  const d = readyDraft(db, BLANK, type, size, 0, 0, 0);
  if (!d) return 0;
  return roomPrice(db, type, d.rect.w, d.rect.h) + (DOOR_PRICE[d.door.length] ?? 0) + d.items.reduce((n, i) => n + priceOf(db, i.kind, i.eq), 0);
}

/** Угол готового помещения, середина которого — в клетке `c` (курсор призрака). Нет такого образца — нет. */
export function readyCorner(db: ContentDb, type: Id, size: RoomSizeId, rot: Rot, c: Cell): Cell | undefined {
  const z = db.rooms[type]?.sizes.find(s => s.id === size);
  if (!z) return undefined;
  const [w, h] = dimsOf(z, rot);
  return [c[0] - Math.floor((w - 1) / 2), c[1] - Math.floor((h - 1) / 2)];
}

/**
 * Поворот призрака с серединой в `c`, пока игрок не нажал R (spec docs/specs/2026-10-ready-rooms.md, «Что делает
 * инструмент»): прежний `rot`, если так можно поставить, иначе первый следующий по R, с которым можно; нигде — прежний.
 */
export function readyTurn(db: ContentDb, site: Site, type: Id, size: RoomSizeId, c: Cell, rot: Rot): Rot {
  for (let k = 0; k < 4; k++) {
    const r = ((rot + k) % 4) as Rot;
    const at = readyCorner(db, type, size, r, c);
    if (at && checkReady(db, site, type, size, at[0], at[1], r).ok) return r;
  }
  return rot;
}

/** Поставить готовое помещение: стены, дверь и обстановка разом. Его не перестраивают — то, что перестраивали, открыто. */
export function addReady(db: ContentDb, site: Site, type: Id, size: RoomSizeId, x: number, y: number, rot: Rot): Done {
  const c = checkReady(db, site, type, size, x, y, rot);
  if (!c.ok) return fail(c.error);
  const id = `r${site.next}`;
  let n = site.nextItem;
  const items = c.draft.items.map(d => ({ id: n++, ...d }));
  const next: Site = { ...site, rooms: [...site.rooms, { id, type, ...c.draft.rect, door: c.draft.door, items }], next: site.next + 1, nextItem: n };
  delete next.editing;
  return { ok: true, site: next, cost: c.cost, room: id };
}

/**
 * Снести помещение: половина цены всего назад. `later` — занятое: снесут, когда освободится (до тех пор закрыто). Дверь,
 * которая была в стене корпуса (готовая больница), остаётся проходом в коридор.
 */
export function demolish(db: ContentDb, site: Site, roomId: string, later = false): Done {
  const room = site.rooms.find(r => r.id === roomId);
  if (!room || room.leaving) return fail({ kind: 'nothing' });
  const cost = -demolishRefund(db, room);
  if (later) return { ok: true, site: withRoom(site, { ...room, leaving: true }), cost, room: roomId };
  return { ok: true, site: removeRoom(site, room), cost };
}

/** Помещение — прочь; дверь в стене корпуса становится коридором. */
export function removeRoom(site: Site, room: SiteRoom): Site {
  const m = mapOf(site);
  const openings: Rect[] = (room.door ?? []).filter(([x, y]) => !m.inside[y * m.w + x]).map(([x, y]) => ({ x, y, w: 1, h: 1 }));
  const next: Site = { ...site, rooms: site.rooms.filter(r => r.id !== room.id), ...(openings.length ? { inside: [...site.inside, ...openings] } : {}) };
  if (next.editing === room.id) delete next.editing;
  // ваш кабинет снесли — вы «не принимаете», пока не отметите другой (spec 2026-10-doctor-mode, «Неудачные случаи»)
  if (next.mine === room.id) delete next.mine;
  return next;
}

/**
 * Ваш кабинет (spec docs/specs/2026-10-doctor-mode.md, «Ваш кабинет: „Мой кабинет“»): отметить кабинет врача `room` или,
 * без `room`, снять отметку («Не принимаю»). Помещение на перестройку не закрывается, цены нет. Кто из нанятых встаёт на
 * освободившееся место — решает команда смены (shift/site.ts): здесь только участок.
 */
export function setOffice(db: ContentDb, site: Site, room?: string): Done {
  if (room === undefined) {
    if (site.mine === undefined) return fail({ kind: 'nothing' });
    const next = { ...site };
    delete next.mine;
    return { ok: true, site: next, cost: 0 };
  }
  const r = site.rooms.find(x => x.id === room);
  if (!r || r.leaving) return fail({ kind: 'unknown' });
  if (r.type !== OFFICE || !db.rooms[r.type]) return fail({ kind: 'notHere' });
  if (site.mine === room) return fail({ kind: 'nothing' });
  return { ok: true, site: { ...site, mine: room }, cost: 0, room };
}

/** Что под курсором для сноса: предмет, дверь, помещение — в этом порядке. */
export type Target = { kind: 'item'; room: string; id: number } | { kind: 'door'; room: string } | { kind: 'room'; room: string };

export function targetAt(site: Site, x: number, y: number): Target | undefined {
  for (const r of site.rooms) {
    if (!isInterior(r, x, y)) continue;
    const it = r.items.find(i => cellsOf(i, r.type).some(c => c[0] === x && c[1] === y));
    if (it) return { kind: 'item', room: r.id, id: it.id };
  }
  for (const r of site.rooms) if (r.door?.some(c => c[0] === x && c[1] === y)) return { kind: 'door', room: r.id };
  for (const r of site.rooms) if (isInterior(r, x, y)) return { kind: 'room', room: r.id };
  for (const r of site.rooms) if (onBorder(r, x, y)) return { kind: 'room', room: r.id };
  return undefined;
}

// --- план -----------------------------------------------------------------------------------------------------------

/** Койки помещения по порядку: убираемые — в конце (новых на них не кладут, пока есть другие); дальше — по номеру. */
export function bedOrder(room: SiteRoom): SiteItem[] {
  return room.items.filter(i => i.kind === 'bed').sort((a, b) => Number(!!a.leaving) - Number(!!b.leaving) || a.id - b.id);
}

const plans = new WeakMap<ContentDb, WeakMap<Site, Plan>>();

/** План больницы ПК — один на больницу и базу. */
export function planOfSite(db: ContentDb, site: Site): Plan {
  let bySite = plans.get(db);
  if (!bySite) plans.set(db, (bySite = new WeakMap()));
  let p = bySite.get(site);
  if (!p) bySite.set(site, (p = sitePlan(db, site)));
  return p;
}

/** План: сетка, помещения с местами людей, стульями, койками, аппаратами и причинами, предметы, связность от входа. */
function sitePlan(db: ContentDb, site: Site): Plan {
  const m = mapOf(site);
  const grid = { w: m.w, h: m.h, cells: m.cells.slice() };
  const rooms: PlacedRoom[] = [];
  const objects: Plan['objects'] = [];
  for (const r of site.rooms) {
    const rules = rulesOf(db, r.type);
    if (!rules) continue;
    const live = r.items.filter(i => !i.leaving);
    for (const it of r.items) objects.push({ kind: it.kind, x: it.x, y: it.y });
    const spots = spotsOf(db, r, rules, live);
    const doorSide = r.door?.length ? sideOf(r, r.door[0][0], r.door[0][1]) : 0;
    const d0 = r.door?.[0] ?? [r.x + Math.floor(r.w / 2), r.y + r.h - 1];
    const dist = (it: SiteItem) => Math.abs(it.x - d0[0]) + Math.abs(it.y - d0[1]);
    const seats = db.rooms[r.type].seats ? live.filter(i => i.kind === 'chair').sort((a, b) => dist(a) - dist(b) || a.y - b.y || a.x - b.x).map(i => [i.x, i.y] as Cell) : [];
    const kind = db.rooms[r.type];
    const beds = kind.beds || kind.emergency || kind.icu || kind.box ? bedOrder(r).map(i => [i.x, i.y] as Cell) : [];
    const machines = live.filter(i => i.eq).sort((a, b) => a.id - b.id);
    const issues: Problem[] = [];
    if (site.editing === r.id) issues.push({ kind: 'closed' });
    if (r.leaving) issues.push({ kind: 'leaving' });
    if (rules.gurney && r.door?.length === 1) issues.push({ kind: 'singleDoor' });
    for (const need of rules.needs) {
      const have = live.filter(i => i.kind === need.kind && !i.eq).length;
      if (have < need.n) issues.push({ kind: 'noObject', object: need.kind, need: need.n, have });
    }
    rooms.push({
      id: r.id, type: r.type, size: rules.smallest.id, rot: doorSide as PlacedRoom['rot'], x: r.x, y: r.y, w: r.w, h: r.h,
      door: r.door ? r.door.map(([x, y]) => [x, y] as Cell) : [], staff: spots.staff, ...(spots.patient ? { patient: spots.patient } : {}), seats, beds,
      slots: machines.map(i => [i.x, i.y] as Cell), equipment: machines.map(i => i.eq!),
      items: r.items, issues,
      ...(r.type === 'room.staff' ? { places: live.filter(i => i.kind === 'desk').length } : {}),
      ...(rules.bedEquipment.length ? { slotsOf: bedSlots(r, rules, machines) } : {}),
    });
  }
  for (const d of site.decor) objects.push(d);
  const reach = m.reach;
  const connected: Record<string, boolean> = {};
  for (const r of rooms) connected[r.id] = r.door.length > 0 && r.door.every(([x, y]) => reach[y * m.w + x] === 1);
  const entrances: NonNullable<Plan['entrances']> = [];
  const outward = (cells: readonly Cell[]): Cell => {
    const [x, y] = cells[0];
    for (const [dx, dy] of N4) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h || (!m.inside[ny * m.w + nx] && !m.outline[ny * m.w + nx])) return [dx, dy];
    }
    for (const [dx, dy] of N4) if (m.inside[(y - dy) * m.w + (x - dx)]) return [dx, dy];
    return [0, 1];
  };
  if (site.main.length) entrances.push({ kind: 'main', cells: site.main.map(([x, y]) => [x, y] as Cell), out: outward(site.main) });
  if (site.ambulance.length) entrances.push({ kind: 'ambulance', cells: site.ambulance.map(([x, y]) => [x, y] as Cell), out: outward(site.ambulance) });
  return { grid, rooms, objects, entrance: site.main[0], connected, mine: site.mine ?? null, entrances };
}

/** Аппараты коек ПИТ и реанимации: каждой койке — ближайший свободный аппарат каждого вида не дальше BED_REACH; нет — -1. */
function bedSlots(r: SiteRoom, rules: RoomRules, machines: SiteItem[]): Record<Id, number[]> {
  const beds = bedOrder(r);
  const out: Record<Id, number[]> = {};
  for (const eq of rules.bedEquipment) {
    const used = new Set<number>();
    out[eq] = beds.map(bed => {
      const cells = cellsOf(bed, r.type);
      let best = -1;
      let bestD = BED_REACH + 1;
      machines.forEach((it, i) => {
        if (it.eq !== eq || used.has(i)) return;
        const d = Math.min(...cells.map(([x, y]) => Math.abs(x - it.x) + Math.abs(y - it.y)));
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      if (best >= 0) used.add(best);
      return best;
    });
  }
  return out;
}

/**
 * Где стоят люди помещения — по предметам (spec «Где стоят люди»): сидящий по образцу — на стуле у стола (первым — дальний
 * от двери), стоящий — у предмета, у которого стоит в образце; пациент — на столе аппарата, на кушетке, на стуле у стола
 * ближе к двери или у стола со стороны двери; стоят — на полу, до которого дойти от двери. Только для отрисовки: движку
 * нужно число мест.
 */
function spotsOf(db: ContentDb, r: SiteRoom, rules: RoomRules, live: SiteItem[]): { staff: Record<Id, Cell>; patient?: Cell } {
  const occ = new Map<string, SiteItem>();
  for (const it of live) for (const [x, y] of cellsOf(it, r.type)) occ.set(key(x, y), it);
  const inner = new Set(doorInner(r).map(([x, y]) => key(x, y)));
  const taken = new Set<string>();
  const d0 = r.door?.[0] ?? [r.x + Math.floor(r.w / 2), r.y + r.h - 1];
  const dist = (x: number, y: number) => Math.abs(x - d0[0]) + Math.abs(y - d0[1]);
  // стоят только там, куда дойти от двери: на куске пола за ней (ряд за сплошным рядом предметов — не место)
  const floor = pieces(r, new Set(occ.keys()));
  const main = mainPiece(r, floor);
  const free = (x: number, y: number) =>
    isInterior(r, x, y) && !occ.has(key(x, y)) && !taken.has(key(x, y)) && !inner.has(key(x, y)) && (main < 0 || floor.of.get(key(x, y)) === main);
  const byKind = (k: ObjectKind | 'slot') => live.filter(i => (k === 'slot' ? i.eq !== undefined : i.kind === k && !i.eq)).sort((a, b) => a.id - b.id);
  const atDesk = (it: SiteItem) => N4.some(([dx, dy]) => {
    const o = occ.get(key(it.x + dx, it.y + dy));
    return o !== undefined && WORK_SURFACE.has(o.kind);
  });
  const nextTo = (items: SiteItem[], prefer: (x: number, y: number) => number): Cell | undefined => {
    let best: Cell | undefined;
    let bestV = Infinity;
    for (const it of items) {
      for (const [cx, cy] of cellsOf(it, r.type)) {
        for (const [dx, dy] of DIRS) {
          const x = cx + dx;
          const y = cy + dy;
          if (!free(x, y)) continue;
          const v = prefer(x, y);
          if (v < bestV) {
            bestV = v;
            best = [x, y];
          }
        }
      }
      if (best) return best;
    }
    return best;
  };
  const center = (): Cell | undefined => {
    let best: Cell | undefined;
    let bestV = Infinity;
    const cx = r.x + (r.w - 1) / 2;
    const cy = r.y + (r.h - 1) / 2;
    for (let y = r.y + 1; y < r.y + r.h - 1; y++) {
      for (let x = r.x + 1; x < r.x + r.w - 1; x++) {
        if (!free(x, y)) continue;
        const v = Math.abs(x - cx) + Math.abs(y - cy);
        if (v < bestV) {
          bestV = v;
          best = [x, y];
        }
      }
    }
    return best;
  };
  const chairs = (far: boolean) => byKind('chair').filter(c => !taken.has(key(c.x, c.y))).sort((a, b) => Number(atDesk(b)) - Number(atDesk(a)) || (far ? dist(b.x, b.y) - dist(a.x, a.y) : dist(a.x, a.y) - dist(b.x, b.y)) || a.id - b.id);
  const staff: Record<Id, Cell> = {};
  for (const role of db.rooms[r.type].staff) {
    const post = rules.posts[role] ?? {};
    let cell: Cell | undefined;
    if (post.on === 'chair') {
      const c = chairs(true)[0];
      if (c) cell = [c.x, c.y];
    }
    if (!cell && post.near) cell = nextTo(byKind(post.near), (x, y) => -dist(x, y));
    cell ??= center();
    if (cell) {
      staff[role] = cell;
      taken.add(key(cell[0], cell[1]));
    }
  }
  let patient: Cell | undefined;
  const p = rules.patient;
  if (p) {
    if (p.on === 'slot') {
      const it = live.find(i => i.eq && LIE_EQ.has(i.kind)) ?? byKind('slot')[0];
      if (it) patient = [it.x, it.y];
    } else if (p.on === 'chair') {
      const c = chairs(false)[0];
      if (c) patient = [c.x, c.y];
    } else if (p.on) {
      const it = byKind(p.on)[0];
      if (it) patient = [it.x, it.y];
    }
    if (!patient && p.near) patient = nextTo(byKind(p.near), (x, y) => dist(x, y));
    patient ??= center();
  }
  return { staff, ...(patient ? { patient } : {}) };
}

// --- больница для движка ----------------------------------------------------------------------------------------------

/**
 * `HospitalState` больницы ПК: поля «Анамнеза» выведены из `site` — для кода, который ищет помещение по номеру (тип —
 * для палат, ПИТ, бокса и найма), коридор и вход; план — из `site` (`planOf` в build.ts).
 */
export function hospitalOf(db: ContentDb, site: Site): HospitalState {
  const rooms: RoomInstance[] = site.rooms.map(r => {
    const rules = rulesOf(db, r.type);
    const side = r.door?.length ? sideOf(r, r.door[0][0], r.door[0][1]) : 0;
    return {
      id: r.id, type: r.type, size: rules?.smallest.id ?? 'S', x: r.x, y: r.y, rot: (side < 0 ? 0 : side) as Rot, door: 0,
      equipment: r.items.filter(i => i.eq && !i.leaving).sort((a, b) => a.id - b.id).map(i => i.eq!),
    };
  });
  return { w: site.w, h: site.h, entrance: site.main[0], corridor: corridorOf(site), rooms, decor: site.decor, next: site.next, site };
}

/** Что заняло бы место ушедших — помещения и предметы, которых нет в `to`, а в `from` есть: «r3» и «r3:17». */
export function removedBetween(from: Site, to: Site): { rooms: Set<string>; items: Set<string> } {
  const rooms = new Set<string>();
  const items = new Set<string>();
  for (const r of from.rooms) {
    const t = to.rooms.find(x => x.id === r.id);
    if (!t) {
      rooms.add(r.id);
      for (const i of r.items) items.add(`${r.id}:${i.id}`);
      continue;
    }
    for (const i of r.items) if (!t.items.some(x => x.id === i.id)) items.add(`${r.id}:${i.id}`);
  }
  return { rooms, items };
}

// --- команды движка ---------------------------------------------------------------------------------------------------

/** Команда стройки ПК — внутри команды движка `{ kind: 'site', cmd }` (spec «Движок»). */
export type SiteCommand =
  | { kind: 'room'; type: Id; x: number; y: number; w: number; h: number }
  | { kind: 'item'; room: string; item: ItemSpec }
  | { kind: 'move'; room: string; id: number; x: number; y: number; rot: Rot }
  | { kind: 'remove'; room: string; id: number }
  | { kind: 'door'; room: string; cells: Cell[] }
  | { kind: 'undoor'; room: string }
  | { kind: 'furnish'; room: string }
  /** готовое помещение (spec docs/specs/2026-10-ready-rooms.md): образец целиком; `staff` — и люди на все должности */
  | { kind: 'ready'; type: Id; size: RoomSizeId; x: number; y: number; rot: Rot; staff?: boolean }
  | { kind: 'demolish'; room: string }
  /**
   * на должность помещения (`role` — должность образца: в кабинет врача встаёт терапевт); `as` — кто именно встаёт на место
   * врача: терапевт или специалист (spec docs/specs/2026-10-specialists.md); `shift` — на дневную или ночную смену (spec
   * docs/specs/2026-10-staff-shifts.md), нет — на дневную
   */
  | { kind: 'hire'; room: string; role: Id; as?: Id; shift?: Shift }
  | { kind: 'dismiss'; id: string }
  | { kind: 'undo' }
  /** стройка закончена: перестраиваемое помещение открыто */
  | { kind: 'done' }
  /** ваш кабинет — «Мой кабинет»; без `room` — «Не принимаю» (spec 2026-10-doctor-mode) */
  | { kind: 'office'; room?: string };

/** Что вышло: извещение движка `{ kind: 'site', … }`. */
export interface SiteResult {
  cmd: SiteCommand['kind'];
  ok: boolean;
  /** сколько стоило: снос и отмена — минус */
  cost?: number;
  error?: SiteError;
  /** занято — сделают, когда освободится */
  later?: true;
  room?: string;
  /** готовое помещение «С персоналом»: сколько встало на должности */
  hired?: number;
}
