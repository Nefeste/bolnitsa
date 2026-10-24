// Где человек и в какой позе (spec docs/specs/2026-10-shell-3d.md, «Где человек и что он делает»): человек из среза
// потока + раскладка → место: клетка, куда идти, поза (стоит, сидит, лежит), точка опоры и куда смотреть. Чистые
// функции без Three.js — их проверяют тесты (tools/test/place.test.ts).
import type { Id, ObjectKind } from '../content/types';
import type { StaffMember } from '../engine/hospital/staff';
import type { Doing } from '../engine/shift/slice';
import type { LieAnchor, SeatAnchor } from './furniture';
import { type Cell, inside, isLong, type Layout, yawOf } from './layout';

export type Pose = 'stand' | 'sit' | 'lie';

/** act — с человеком что-то делают, он хотя бы немного там стоит; wait — сидит, ждёт; go — идёт без остановок. */
export type LegKind = 'act' | 'wait' | 'go';

export interface Spot {
  /** одно и то же место — тот же ключ: человек не перестраивает путь */
  key: string;
  /** клетка, куда дойти (номер y·w + x): у стула — перед ним, у кровати — рядом */
  cell: number;
  pose: Pose;
  /** стоит — середина клетки; сидит — точка опоры таза на сиденье; лежит — середина постели */
  x: number;
  y: number;
  z: number;
  /** куда смотрит (стоит, сидит) или от изголовья к ногам (лежит); NaN — как шёл */
  yaw: number;
  kind: LegKind;
  /** сколько секунд хотя бы стоять у места `act` */
  dwell: number;
  /** предмет раскладки, на котором сидит или лежит */
  thing?: number;
}

/** Анкеры предметов (furniture.ts): куда садятся и куда ложатся. */
export interface Anchors {
  seats: (SeatAnchor | undefined)[];
  lies: (LieAnchor | undefined)[];
}

/** За ними работают — к ним поворачиваются лицом стоящие (как карта «Анамнеза», orient.ts: DESKS и WORK). */
const DESKS: ReadonlySet<ObjectKind> = new Set(['desk', 'table']);
const WORK: ReadonlySet<ObjectKind> = new Set(['desk', 'table', 'couch', 'bed', 'ecg', 'analyzer', 'xray', 'machine', 'sink', 'cabinet', 'or_table', 'anesthesia', 'us', 'ct', 'mri', 'monitor']);

/** Сколько секунд хотя бы стоят там, где с человеком что-то делают (как карта «Анамнеза», walkers.ts). */
export const DWELL: Partial<Record<Doing, number>> = { registration: 1, triage: 1.5, exam: 1.5, office: 0.5 };

/** Предмет в клетке: номер в раскладке или -1. */
export const thingAt = (l: Layout, x: number, y: number): number => (x < 0 || y < 0 || x >= l.w || y >= l.h ? -1 : l.occupied[y * l.w + x] - 1);

/** Куда смотреть стоя в клетке: к столу рядом, иначе к аппарату; нет — NaN. */
export function standYaw(l: Layout, x: number, y: number): number {
  let work = NaN;
  for (const [dx, dy] of [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ] as const) {
    const t = thingAt(l, x + dx, y + dy);
    if (t < 0) continue;
    const k = l.things[t].kind;
    if (DESKS.has(k)) return yawOf(dx, dy);
    if (Number.isNaN(work) && WORK.has(k)) work = yawOf(dx, dy);
  }
  return work;
}

/**
 * Клетка, откуда садятся или ложатся: свободная соседняя — для стула перед ним, для постели — сбоку. Только та, до
 * которой можно дойти от двери помещения (в коридоре — от входа): ряд аппаратов может отрезать угол комнаты.
 */
export function accessOf(l: Layout, t: number, taken: ReadonlySet<number> = new Set()): number {
  const th = l.things[t];
  const cands: Cell[] = [];
  if (th.kind === 'chair' || th.kind === 'bench' || (th.kind === 'couch' && !isLong(th.kind, th.type))) cands.push([th.cell[0] + th.face[0], th.cell[1] + th.face[1]]);
  for (const [x, y] of th.cells) {
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) cands.push([x + dx, y + dy]);
  }
  const main = l.region[th.room >= 0 ? doorInside(l, th.room) : l.plan.entrance[1] * l.w + l.plan.entrance[0]];
  const ok = (x: number, y: number, strict: boolean) => {
    if (x < 0 || y < 0 || x >= l.w || y >= l.h) return -1;
    const i = y * l.w + x;
    return l.walk[i] && (!main || l.region[i] === main) && (!strict || !taken.has(i)) ? i : -1;
  };
  for (const strict of [true, false]) {
    for (const [x, y] of cands) {
      const i = ok(x, y, strict);
      if (i >= 0) return i;
    }
  }
  return th.cell[1] * l.w + th.cell[0];
}

/** Место на предмете: сесть, если на нём сидят; лечь, если на нём лежат; иначе — стоять рядом. */
export function spotOn(l: Layout, a: Anchors, t: number, kind: LegKind, dwell: number, taken?: ReadonlySet<number>): Spot {
  const cell = accessOf(l, t, taken);
  // ключ — по клетке предмета, а не по номеру в раскладке: после стройки (новая раскладка) тот же стул — тот же ключ, и
  // сидящий на нём не встаёт (spec docs/specs/2026-10-build.md, «Отрисовка»)
  const th = l.things[t];
  const at = th.cell[1] * l.w + th.cell[0];
  const seat = a.seats[t];
  if (seat) return { key: `seat:${at}`, cell, pose: 'sit', x: seat.x, y: seat.y, z: seat.z, yaw: seat.yaw, kind, dwell, thing: t };
  const lie = a.lies[t];
  if (lie) return { key: `lie:${at}`, cell, pose: 'lie', x: lie.x, y: lie.y, z: lie.z, yaw: lie.yaw, kind, dwell, thing: t };
  return standAt(l, cell, kind, dwell);
}

/** Стоять в клетке `cell`. */
export function standAt(l: Layout, cell: number, kind: LegKind, dwell: number): Spot {
  const x = cell % l.w;
  const y = (cell / l.w) | 0;
  return { key: `cell:${cell}`, cell, pose: 'stand', x: x + 0.5, y: 0, z: y + 0.5, yaw: standYaw(l, x, y), kind, dwell };
}

/** Место у клетки `c` шаблона помещения: предмет в ней — на нём; свободно — стоять там. */
export function spotAtCell(l: Layout, a: Anchors, c: readonly [number, number], kind: LegKind, dwell: number, taken?: ReadonlySet<number>): Spot {
  const t = thingAt(l, c[0], c[1]);
  if (t >= 0 && (a.seats[t] || a.lies[t])) return spotOn(l, a, t, kind, dwell, taken);
  const i = c[1] * l.w + c[0];
  return standAt(l, l.walk[i] ? i : nearestWalk(l, i, taken), kind, dwell);
}

/** Ближайшая свободная клетка пола от `from` — не сквозь стены. */
export function nearestWalk(l: Layout, from: number, taken: ReadonlySet<number> = new Set()): number {
  const seen = new Set([from]);
  const queue = [from];
  const grid = l.plan.grid.cells;
  for (let head = 0; head < queue.length && head < 600; head++) {
    const i = queue[head];
    if (l.walk[i] && !taken.has(i)) return i;
    const x = i % l.w;
    const y = (i / l.w) | 0;
    for (const [nx, ny] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ]) {
      if (nx < 0 || ny < 0 || nx >= l.w || ny >= l.h) continue;
      const n = ny * l.w + nx;
      // стена (3) и улица (0) — не проход
      if (seen.has(n) || grid[n] === 3 || grid[n] === 0) continue;
      seen.add(n);
      queue.push(n);
    }
  }
  return from;
}

// из anamnez: src/state/clinicMap.ts @ 96b5137 (assignSeats)
/**
 * Места в зале и на скамьях: кто сел, тот сидит, пока не встанет, — иначе при каждом новом пришедшем очередь
 * пересаживалась бы. Новым — первые свободные места; мест нет — -1.
 */
export function assignSeats(prev: ReadonlyMap<string, number>, ids: readonly string[], count: number): Map<string, number> {
  const next = new Map<string, number>();
  const taken = new Set<number>();
  for (const id of ids) {
    const was = prev.get(id);
    if (was !== undefined && was >= 0 && !taken.has(was)) {
      next.set(id, was);
      taken.add(was);
    }
  }
  for (const id of ids) {
    if (next.has(id)) continue;
    let free = -1;
    for (let i = 0; i < count; i++) {
      if (!taken.has(i)) {
        free = i;
        break;
      }
    }
    next.set(id, free);
    if (free >= 0) taken.add(free);
  }
  return next;
}

/**
 * Места из `pool` (номера в списке мест) тем, кто ждёт в одном зале (spec docs/specs/2026-10-walk.md): кто сел, сидит, как
 * у `assignSeats`; новым — первые свободные, мест нет — -1. `taken` — занятые во всех залах.
 */
function seatIn(prev: ReadonlyMap<string, number>, ids: readonly string[], pool: readonly number[], taken: Set<number>, out: Map<string, number>) {
  const own = new Set(pool);
  for (const id of ids) {
    const was = prev.get(id);
    if (was !== undefined && was >= 0 && own.has(was) && !taken.has(was)) {
      out.set(id, was);
      taken.add(was);
    }
  }
  for (const id of ids) {
    if (out.has(id)) continue;
    const free = pool.find(i => !taken.has(i)) ?? -1;
    out.set(id, free);
    if (free >= 0) taken.add(free);
  }
}

/** Человек из среза для места: что делает, где (номер помещения плана), койка. */
export interface Who {
  key: string;
  doing: Doing;
  room: number;
  bed: number;
}

/**
 * Места больницы для людей из среза: стулья зон ожидания и скамьи коридора раздаются так, чтобы севший не
 * пересаживался; остальное — по помещению и шаблону. Один объект на раскладку.
 */
export class Places {
  /** стулья зон ожидания: предметы раскладки по порядку помещений, ближний к двери ряд — первым */
  readonly seats: number[] = [];
  /** стулья каждой зоны ожидания: номер помещения плана → номера в `seats` */
  private hallSeats = new Map<number, number[]>();
  /** скамьи коридора */
  readonly benches: number[] = [];
  private seatOf = new Map<string, number>();
  private benchOf = new Map<string, number>();
  private firstOf = new Map<Id, number>();

  constructor(
    private l: Layout,
    private a: Anchors,
  ) {
    l.plan.rooms.forEach((r, n) => {
      if (!this.firstOf.has(r.type) && r.door.length && l.plan.connected[r.id]) this.firstOf.set(r.type, n);
      for (const [x, y] of r.seats) {
        const t = thingAt(l, x, y);
        if (t < 0 || !a.seats[t]) continue;
        const list = this.hallSeats.get(n);
        if (list) list.push(this.seats.length);
        else this.hallSeats.set(n, [this.seats.length]);
        this.seats.push(t);
      }
    });
    l.things.forEach((t, i) => {
      if (t.room < 0 && t.kind === 'bench' && a.seats[i]) this.benches.push(i);
    });
  }

  /**
   * После стройки (spec docs/specs/2026-10-build.md, «Отрисовка»): кто сидел на стуле или скамье, которые остались на
   * месте, — сидит на них же; места сверяются по клетке предмета.
   */
  carry(prev: Places) {
    const cellOf = (l: Layout, t: number) => l.things[t].cell[1] * l.w + l.things[t].cell[0];
    const move = (from: readonly number[], fromL: Layout, to: readonly number[], had: Map<string, number>, out: Map<string, number>) => {
      const index = new Map(to.map((t, i) => [cellOf(this.l, t), i]));
      for (const [id, i] of had) {
        const j = i >= 0 && i < from.length ? index.get(cellOf(fromL, from[i])) : undefined;
        if (j !== undefined) out.set(id, j);
      }
    };
    move(prev.seats, prev.l, this.seats, prev.seatOf, this.seatOf);
    move(prev.benches, prev.l, this.benches, prev.benchOf, this.benchOf);
  }

  /** Первое помещение этого типа с дверью; нет — -1. */
  room(type: Id): number {
    return this.firstOf.get(type) ?? -1;
  }

  /**
   * Раздать стулья и скамьи тем, кто ждёт: `waiting` — в очереди к врачу (`room` — его зона ожидания, spec
   * docs/specs/2026-10-walk.md: стулья — в ней; зала нет — любой свободный; у двери кабинета стула нет), `benched` — ждёт
   * обследования или результатов.
   */
  sync(waiting: readonly { key: string; room: number }[], benched: readonly string[]) {
    const halls = new Map<number, string[]>();
    const any: string[] = [];
    for (const w of waiting) {
      if (this.hallSeats.has(w.room)) {
        const q = halls.get(w.room);
        if (q) q.push(w.key);
        else halls.set(w.room, [w.key]);
      } else if (w.room < 0) any.push(w.key);
    }
    const taken = new Set<number>();
    const seatOf = new Map<string, number>();
    for (const [room, ids] of halls) seatIn(this.seatOf, ids, this.hallSeats.get(room)!, taken, seatOf);
    if (any.length) seatIn(this.seatOf, any, this.seats.map((_, i) => i), taken, seatOf);
    this.seatOf = seatOf;
    this.benchOf = assignSeats(this.benchOf, benched, this.benches.length);
  }

  /** Место человека. `taken` — клетки, где уже кто-то стоит. */
  spot(w: Who, taken: ReadonlySet<number>): Spot {
    const { l, a } = this;
    const dwell = DWELL[w.doing] ?? 0;
    const room = w.room >= 0 ? l.plan.rooms[w.room] : undefined;
    const inRoom = (type: Id, kind: LegKind): Spot | undefined => {
      const n = this.room(type);
      const r = n >= 0 ? l.plan.rooms[n] : undefined;
      if (!r) return undefined;
      return r.patient ? spotAtCell(l, a, r.patient, kind, dwell, taken) : standAt(l, nearestWalk(l, doorInside(l, n), taken), kind, dwell);
    };
    switch (w.doing) {
      case 'registration':
        return inRoom('room.reception', 'act') ?? this.waitSpot(w.key, taken);
      case 'triage':
        return inRoom('room.triage', 'act') ?? this.waitSpot(w.key, taken);
      case 'waiting':
        // поток для ПК (spec docs/specs/2026-10-walk.md): следующие к врачу — у двери его кабинета, остальные — в своём зале
        if (room && room.type !== 'room.waiting') return this.doorSpot(w.room, taken);
        return this.waitSpot(w.key, taken, w.room);
      case 'office':
      case 'exam':
      case 'surgery': {
        if (!room) return this.waitSpot(w.key, taken);
        // у врача и на обследовании человек хотя бы немного побудет, даже если движок ушёл вперёд (spec
        // docs/specs/2026-10-owner-play.md: приём короче дороги на экране — иначе он не доходил до врача); на операцию — без
        // остановок
        const kind: LegKind = w.doing === 'surgery' ? 'go' : 'act';
        // анализы — забор крови в процедурной (как карта «Анамнеза»)
        if (room.type === 'room.lab') return inRoom('room.procedure', kind) ?? standAt(l, nearestWalk(l, doorInside(l, w.room), taken), kind, dwell);
        return room.patient ? spotAtCell(l, a, room.patient, kind, dwell, taken) : standAt(l, nearestWalk(l, doorInside(l, w.room), taken), kind, dwell);
      }
      case 'ward':
      case 'ambulance': {
        const bed = room && w.bed >= 0 ? room.beds[w.bed] : undefined;
        if (bed) return spotAtCell(l, a, bed, 'wait', 0, taken);
        // привезла скорая, а мест нет — у входа (у больницы ПК — у входа для скорой)
        const [ex, ey] = l.plan.entrances?.find(e => e.kind === 'ambulance')?.cells[0] ?? l.plan.entrance;
        return standAt(l, nearestWalk(l, ey * l.w + ex, taken), 'wait', 0);
      }
      case 'examQueue':
      case 'results':
        return this.benchSpot(w.key, taken);
    }
  }

  private waitSpot(key: string, taken: ReadonlySet<number>, hall = -1): Spot {
    const s = this.seatOf.get(key) ?? -1;
    if (s >= 0) return spotOn(this.l, this.a, this.seats[s], 'wait', 0, taken);
    // стульев не хватило — стоит в своей зоне ожидания, в первой или у регистратуры
    const n = hall >= 0 && this.l.plan.rooms[hall]?.type === 'room.waiting' ? hall : this.room('room.waiting');
    const from = n >= 0 ? doorInside(this.l, n) : this.l.plan.entrance[1] * this.l.w + this.l.plan.entrance[0];
    return standAt(this.l, nearestWalk(this.l, from, taken), 'wait', 0);
  }

  /**
   * У двери кабинета снаружи (spec docs/specs/2026-10-walk.md, геймдизайн §5: «ждут у двери кабинета»): стоит у стены
   * рядом с дверью, лицом к ней, — сбоку, чтобы не загораживать проход.
   */
  private doorSpot(room: number, taken: ReadonlySet<number>): Spot {
    const l = this.l;
    const r = l.plan.rooms[room];
    const [ox, oy] = l.out[room];
    const [dx, dy] = r.door.length ? r.door[Math.floor(r.door.length / 2)] : [r.x + Math.floor(r.w / 2), r.y + Math.floor(r.h / 2)];
    for (const k of [1, -1, 2, -2, 3, -3, 0]) {
      const x = dx + ox + (oy !== 0 ? k : 0);
      const y = dy + oy + (ox !== 0 ? k : 0);
      if (x < 0 || y < 0 || x >= l.w || y >= l.h || inside(r, x, y)) continue;
      const i = y * l.w + x;
      if (l.walk[i] && !taken.has(i) && l.plan.grid.cells[i] !== 4) return { ...standAt(l, i, 'wait', 0), yaw: yawOf(-ox, -oy) };
    }
    return standAt(l, nearestWalk(l, (dy + oy) * l.w + dx + ox, taken), 'wait', 0);
  }

  private benchSpot(key: string, taken: ReadonlySet<number>): Spot {
    const b = this.benchOf.get(key) ?? -1;
    if (b >= 0) return spotOn(this.l, this.a, this.benches[b], 'wait', 0, taken);
    return this.waitSpot(key, taken);
  }

  /**
   * Место на перерыве (spec docs/specs/2026-10-staff-shifts.md, часть 2): в ординаторской — свободный стул или диван, в
   * санузле — у раковины; все заняты или их нет — у двери изнутри. `used` — места других отдыхающих.
   */
  restSpot(room: number, kind: 'staff' | 'toilet', used: ReadonlySet<string>, taken: ReadonlySet<number>): Spot {
    const { l, a } = this;
    for (let t = 0; t < l.things.length; t++) {
      if (l.things[t].room !== room || (kind === 'staff' ? !a.seats[t] : l.things[t].kind !== 'sink')) continue;
      const s = spotOn(l, a, t, 'wait', 0, taken);
      if (!used.has(s.key)) return s;
    }
    return standAt(l, nearestWalk(l, doorInside(l, room), taken), 'wait', 0);
  }

  /** Место человека штата: его клетка в помещении; на стуле — сидит. */
  staffSpot(m: StaffMember, roleCell: (m: StaffMember) => readonly [number, number] | undefined, taken: ReadonlySet<number>): Spot | undefined {
    const c = roleCell(m);
    if (!c) return undefined;
    return spotAtCell(this.l, this.a, c, 'wait', 0, taken);
  }
}

/** Клетка сразу за дверью помещения изнутри. */
export function doorInside(l: Layout, room: number): number {
  const r = l.plan.rooms[room];
  const [ox, oy] = l.out[room];
  const [x, y] = r.door.length ? r.door[Math.floor(r.door.length / 2)] : [r.x + Math.floor(r.w / 2), r.y + Math.floor(r.h / 2)];
  const ix = x - ox;
  const iy = y - oy;
  return inside(r, ix, iy) ? iy * l.w + ix : y * l.w + x;
}
