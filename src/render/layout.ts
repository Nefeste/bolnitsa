// Раскладка больницы для 3D-вида (spec docs/specs/2026-10-shell-3d.md, «Больница на экране»): план движка (`planOf`) →
// предметы со следом и поворотом, двери, клетки, где может пройти человек. Чистые функции без Three.js и DOM — их
// проверяют тесты (tools/test/layout.test.ts) на всех шаблонах помещений.
//
// В движке «Анамнеза» предмет — одна клетка. В 3D кровать, кушетка, стол рентгена, КТ, МРТ и операционный стол длиной
// около двух метров занимают две: свою и соседнюю свободную — по направлению к двери помещения (так в шаблонах «Анамнеза»
// у койки тумбочка и монитор стоят у изголовья), иначе в обратную сторону. Куда повёрнуты остальные — по правилам карты
// «Анамнеза» (orient.ts). У помещений больницы ПК (spec docs/specs/2026-10-build.md) клетки и поворот каждого предмета
// знает движок — они берутся как есть; входов два.
import type { ContentDb, Id, ObjectKind } from '../content/types';
import { type Plan, type PlacedRoom, sizeOf, turn } from '../engine/hospital/build';
import { CELL, walkable } from '../engine/hospital/grid';
import { cellsOf, FACE } from '../engine/hospital/site';
import { objectTurns, type Turn } from './orient';

export type Cell = [number, number];

/**
 * Растение стоит у стены и не мешает пройти: в шаблонах «Анамнеза» оно бывает в конце ряда стульев, и ряд иначе
 * отрезал бы проход между рядами.
 */
export const passable = (kind: ObjectKind) => kind === 'plant';

/** Длинные предметы: две клетки. Кушетка в ординаторской — кресло отдыха, одна клетка (catalog.ts). */
export function isLong(kind: ObjectKind, roomType: Id | ''): boolean {
  if (kind === 'couch') return roomType !== 'room.staff';
  return kind === 'bed' || kind === 'xray' || kind === 'ct' || kind === 'mri' || kind === 'or_table';
}

export interface Thing {
  kind: ObjectKind;
  /** номер помещения в `plan.rooms`; -1 — предмет коридора */
  room: number;
  /** тип помещения; '' — коридор */
  type: Id | '';
  /** клетка движка */
  cell: Cell;
  /** все клетки следа: у длинных — две */
  cells: Cell[];
  /** куда смотрит перёд (по клеткам): у длинных — от изголовья к ногам */
  face: Cell;
  /** поворот вокруг вертикали, радианы: 0 — перёд на +z (вниз по плану) */
  yaw: number;
  /** аппарат с места шаблона */
  equipment?: Id;
  /** предмет больницы ПК: клетки и поворот — из движка; номер предмета */
  item?: number;
  /** уберут, когда освободится */
  leaving?: true;
}

export interface Door {
  /** номер помещения; -1 — вход с улицы */
  room: number;
  /** клетки проёма — подряд вдоль стены */
  cells: Cell[];
  /** наружу (из помещения в коридор; у входа — на улицу) */
  out: Cell;
}

export interface Layout {
  plan: Plan;
  w: number;
  h: number;
  things: Thing[];
  /** номер предмета + 1 в клетке; 0 — свободно */
  occupied: Int32Array;
  /** человек может пройти: пол, коридор, дверь — и мебели нет */
  walk: Uint8Array;
  /** связные куски проходимых клеток: номер куска (с 1); 0 — не пройти */
  region: Int32Array;
  doors: Door[];
  /** у каждого помещения — направление наружу через дверь */
  out: Cell[];
}

const OUT_OF: Cell[] = [
  [0, 1],
  [-1, 0],
  [0, -1],
  [1, 0],
];

/** Направление «наружу через дверь» у помещения с поворотом `rot`: дверь в шаблоне — внизу. */
export const outOf = (rot: number): Cell => OUT_OF[rot & 3];

/** Поворот модели, перёд которой (+z модели) смотрит по клеткам на (dx, dy): y плана — это z мира. */
export const yawOf = (dx: number, dy: number) => Math.atan2(dx, dy);

/** Четверть оборота карты «Анамнеза» → куда смотрит перёд по клеткам. */
const FACE_OF: Record<Turn, Cell> = { 0: [0, 1], 1: [-1, 0], 2: [0, -1], 3: [1, 0] };

const key = (x: number, y: number) => `${x},${y}`;

/** Внутренние клетки помещения (без стен). */
export function inside(r: Pick<PlacedRoom, 'x' | 'y' | 'w' | 'h'>, x: number, y: number): boolean {
  return x > r.x && y > r.y && x < r.x + r.w - 1 && y < r.y + r.h - 1;
}

/** Помещение, внутри которого клетка; -1 — коридор, улица или стена. */
export function roomAt(plan: Plan, x: number, y: number): number {
  return plan.rooms.findIndex(r => inside(r, x, y));
}

/**
 * Раскладка: предметы шаблонов помещений и аппараты на их местах (по шаблонам, а не по `plan.objects`, чтобы знать
 * помещение и аппарат), предметы коридора, двери; затем вторая клетка у длинных и проходимость.
 */
export function layoutOf(db: ContentDb, plan: Plan, decor: readonly { kind: ObjectKind; x: number; y: number }[], staffCells: Cell[] = []): Layout {
  const { w, h } = plan.grid;
  const things: Thing[] = [];
  const out: Cell[] = [];
  plan.rooms.forEach((r, n) => {
    out.push(outOf(r.rot));
    if (r.items) {
      for (const it of r.items) {
        const [fx, fy] = FACE[it.rot];
        things.push({
          kind: it.kind, room: n, type: r.type, cell: [it.x, it.y], cells: cellsOf(it, r.type).map(([x, y]): Cell => [x, y]), face: [fx, fy], yaw: yawOf(fx, fy),
          ...(it.eq ? { equipment: it.eq } : {}), item: it.id, ...(it.leaving ? { leaving: true as const } : {}),
        });
      }
      return;
    }
    const z = sizeOf(db, r.type, r.size);
    if (!z) return;
    const at = (c: readonly [number, number]): Cell => {
      const [x, y] = turn(z, r.rot, c[0], c[1]);
      return [r.x + x, r.y + y];
    };
    for (const o of z.objects) {
      const c = at([o.x, o.y]);
      things.push({ kind: o.kind, room: n, type: r.type, cell: c, cells: [c], face: [0, 1], yaw: 0 });
    }
    r.equipment.forEach((id, i) => {
      const c = r.slots[i];
      if (!id || !c) return;
      things.push({ kind: db.equipment[id].sprite, room: n, type: r.type, cell: [c[0], c[1]], cells: [[c[0], c[1]]], face: [0, 1], yaw: 0, equipment: id });
    });
  });
  for (const d of decor) things.push({ kind: d.kind, room: -1, type: '', cell: [d.x, d.y], cells: [[d.x, d.y]], face: [0, 1], yaw: 0 });

  // куда повёрнуты: правила карты «Анамнеза» (стул — к столу, стол — к тому, кто за ним, остальное — спиной к стене)
  const turns = objectTurns(plan.grid, things.map(t => ({ kind: t.kind, x: t.cell[0], y: t.cell[1] })), staffCells);
  things.forEach((t, i) => {
    if (t.item !== undefined) return;
    t.face = FACE_OF[turns[i]];
    t.yaw = yawOf(t.face[0], t.face[1]);
  });

  // занятые клетки: предметы, места персонала и пациента — длинные на них не встают; клетки у двери изнутри — тоже,
  // но у широкой двери длинному можно занять одну, если рядом остаётся свободная
  const taken = new Set(things.map(t => key(t.cell[0], t.cell[1])));
  const reserved = new Set<string>();
  const doorInner = new Map<string, string[]>();
  plan.rooms.forEach((r, n) => {
    for (const c of Object.values(r.staff)) reserved.add(key(c[0], c[1]));
    if (r.patient) reserved.add(key(r.patient[0], r.patient[1]));
    const o = out[n];
    const inner = r.door.map(([x, y]) => key(x - o[0], y - o[1]));
    for (const k of inner) doorInner.set(k, inner);
  });
  const free = (k: string) => !taken.has(k) && !reserved.has(k);
  const solid = new Set(things.filter(t => !passable(t.kind)).map(t => key(t.cell[0], t.cell[1])));
  for (const t of things) {
    if (!isLong(t.kind, t.type) || t.room < 0 || t.item !== undefined) continue;
    const r = plan.rooms[t.room];
    const o = out[t.room];
    const dirs: Cell[] = [o, [-o[0], -o[1]], [o[1], o[0]], [-o[1], -o[0]]];
    for (const [dx, dy] of dirs) {
      const x = t.cell[0] + dx;
      const y = t.cell[1] + dy;
      const k = key(x, y);
      if (!inside(r, x, y) || !free(k)) continue;
      const inner = doorInner.get(k);
      if (inner && inner.filter(c => c !== k && free(c)).length === 0) continue;
      // вторая клетка не должна отрезать часть помещения от двери
      if (inner && splits(r, out[t.room], solid, k)) continue;
      solid.add(k);
      t.cells = [t.cell, [x, y]];
      t.face = [dx, dy];
      t.yaw = yawOf(dx, dy);
      taken.add(k);
      break;
    }
  }

  const occupied = new Int32Array(w * h);
  const blocks = new Uint8Array(w * h);
  things.forEach((t, i) => {
    for (const [x, y] of t.cells) {
      occupied[y * w + x] = i + 1;
      if (!passable(t.kind)) blocks[y * w + x] = 1;
    }
  });
  const walk = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) walk[y * w + x] = walkable(plan.grid, x, y) && !blocks[y * w + x] ? 1 : 0;
  const region = regions(w, h, walk);

  const doors: Door[] = plan.rooms.flatMap((r, n) => (r.door.length ? [{ room: n, cells: r.door.map(([x, y]): Cell => [x, y]), out: out[n] }] : []));
  // входы: у больницы ПК — главный и для скорой, на стене корпуса; у готовой больницы «Анамнеза» — в краю участка
  if (plan.entrances?.length) for (const e of plan.entrances) doors.push({ room: -1, cells: e.cells.map(([x, y]): Cell => [x, y]), out: [e.out[0], e.out[1]] });
  else {
    const [ex, ey] = plan.entrance;
    const eo: Cell = ex === 0 ? [-1, 0] : ey === 0 ? [0, -1] : ex === w - 1 ? [1, 0] : [0, 1];
    doors.push({ room: -1, cells: [[ex, ey]], out: eo });
  }
  return { plan, w, h, things, occupied, walk, region, doors, out };
}

/** Займёт ли клетка `k` проход: часть свободных клеток помещения перестанет быть достижимой от двери. */
function splits(r: PlacedRoom, o: Cell, solid: ReadonlySet<string>, k: string): boolean {
  const cells: string[] = [];
  for (let y = r.y + 1; y < r.y + r.h - 1; y++) for (let x = r.x + 1; x < r.x + r.w - 1; x++) if (!solid.has(key(x, y))) cells.push(key(x, y));
  const reach = (block: string | null) => {
    const seen = new Set<string>();
    const queue = r.door.map(([x, y]) => key(x - o[0], y - o[1])).filter(c => c !== block && !solid.has(c));
    for (const c of queue) seen.add(c);
    for (let head = 0; head < queue.length; head++) {
      const [x, y] = queue[head].split(',').map(Number);
      for (const [nx, ny] of [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ]) {
        const n = key(nx, ny);
        if (seen.has(n) || n === block || solid.has(n) || !inside(r, nx, ny)) continue;
        seen.add(n);
        queue.push(n);
      }
    }
    return seen;
  };
  const before = reach(null);
  const after = reach(k);
  return cells.some(c => c !== k && before.has(c) && !after.has(c));
}

/** Связные куски проходимых клеток (поиск в ширину): номер куска с 1, непроходимые — 0. */
export function regions(w: number, h: number, walk: Uint8Array): Int32Array {
  const out = new Int32Array(w * h);
  let n = 0;
  const queue = new Int32Array(w * h);
  for (let s = 0; s < w * h; s++) {
    if (!walk[s] || out[s]) continue;
    n++;
    let head = 0;
    let tail = 0;
    queue[tail++] = s;
    out[s] = n;
    while (head < tail) {
      const i = queue[head++];
      const x = i % w;
      const y = (i - x) / w;
      if (x > 0 && walk[i - 1] && !out[i - 1]) (out[i - 1] = n), (queue[tail++] = i - 1);
      if (x < w - 1 && walk[i + 1] && !out[i + 1]) (out[i + 1] = n), (queue[tail++] = i + 1);
      if (y > 0 && walk[i - w] && !out[i - w]) (out[i - w] = n), (queue[tail++] = i - w);
      if (y < h - 1 && walk[i + w] && !out[i + w]) (out[i + w] = n), (queue[tail++] = i + w);
    }
  }
  return out;
}

/** Клетка стены: для окон и наружной стороны. */
export const isWall = (plan: Plan, x: number, y: number) => x >= 0 && y >= 0 && x < plan.grid.w && y < plan.grid.h && plan.grid.cells[y * plan.grid.w + x] === CELL.wall;
