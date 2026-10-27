// Где человек и в какой позе (spec docs/specs/2026-10-shell-3d.md, «Где человек и что он делает»): человек из среза
// потока + раскладка → место: клетка, куда идти, поза (стоит, сидит, лежит), точка опоры и куда смотреть. Чистые
// функции без Three.js — их проверяют тесты (tools/test/place.test.ts).
import type { Id, ObjectKind } from '../content/types';
import type { StaffMember } from '../engine/hospital/staff';
import type { Doing } from '../engine/shift/slice';
import { doorBenches } from '../engine/shift/walking';
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
  /** лежит на кровати — под одеялом */
  bed?: true;
  /**
   * за работой (spec docs/specs/2026-10-staff-motion.md, часть 1): `desk` — сидит за столом, руки на столе, петля работы, а не
   * отдыха; `stand` — стоит на посту, изредка берёт бумаги; `bed` — у койки на обходе, бумаги в руках, когда дошёл
   */
  work?: 'desk' | 'stand' | 'bed';
}

/** Анкеры предметов (furniture.ts): куда садятся и куда ложатся. */
export interface Anchors {
  seats: (SeatAnchor | undefined)[];
  lies: (LieAnchor | undefined)[];
}

/** За ними работают — к ним поворачиваются лицом стоящие (как карта «Анамнеза», orient.ts: DESKS и WORK). */
const DESKS: ReadonlySet<ObjectKind> = new Set(['desk', 'table']);
const WORK: ReadonlySet<ObjectKind> = new Set(['desk', 'table', 'couch', 'bed', 'ecg', 'analyzer', 'xray', 'machine', 'sink', 'cabinet', 'or_table', 'anesthesia', 'us', 'ct', 'mri', 'monitor']);

/** За чем работают сидя (spec docs/specs/2026-10-staff-motion.md, часть 1): стол или монитор перед стулом. */
const DESK_AHEAD: ReadonlySet<ObjectKind> = new Set(['desk', 'table', 'monitor']);

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
  if (lie) return { key: `lie:${at}`, cell, pose: 'lie', x: lie.x, y: lie.y, z: lie.z, yaw: lie.yaw, kind, dwell, thing: t, ...(lie.bed ? { bed: true as const } : {}) };
  return standAt(l, cell, kind, dwell);
}

/** Стоять в клетке `cell`. */
export function standAt(l: Layout, cell: number, kind: LegKind, dwell: number): Spot {
  const x = cell % l.w;
  const y = (cell / l.w) | 0;
  return { key: `cell:${cell}`, cell, pose: 'stand', x: x + 0.5, y: 0, z: y + 0.5, yaw: standYaw(l, x, y), kind, dwell };
}

/** Стул места `s` смотрит на стол или монитор — в соседней клетке, куда сидящий повёрнут (spec 2026-10-staff-motion). */
export function deskAhead(l: Layout, s: Spot): boolean {
  if (s.pose !== 'sit' || s.thing === undefined) return false;
  const dx = Math.round(Math.sin(s.yaw));
  const dz = Math.round(Math.cos(s.yaw));
  return l.things[s.thing].cells.some(([x, y]) => {
    const t = thingAt(l, x + dx, y + dz);
    return t >= 0 && t !== s.thing && DESK_AHEAD.has(l.things[t].kind);
  });
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

// по образцу anamnez: src/state/clinicMap.ts @ 96b5137 (assignSeats)
/**
 * Места из `pool` (номера в списке мест) тем, кто ждёт в одном зале (spec docs/specs/2026-10-walk.md) или на скамьях
 * коридора: кто сел, тот сидит, пока не встанет, — иначе при каждом новом пришедшем очередь пересаживалась бы; новым —
 * первые свободные, мест нет — -1. `taken` — занятые где угодно.
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
 * пересаживался; остальное — по помещению и шаблону. Один объект на раскладку. `doorSteps` — скамья у двери кабинета не
 * дальше стольких шагов от клетки перед дверью (`inflow.bench`, spec docs/specs/2026-10-door-benches.md); нет — у дверей
 * стоят.
 */
export class Places {
  /** стулья зон ожидания: предметы раскладки по порядку помещений, ближний к двери ряд — первым */
  readonly seats: number[] = [];
  /** стулья каждой зоны ожидания: номер помещения плана → номера в `seats` */
  private hallSeats = new Map<number, number[]>();
  /** скамьи коридора */
  readonly benches: number[] = [];
  /** скамья коридора по клетке (y·w + x) — номер в `benches` */
  private benchAt = new Map<number, number>();
  /** скамьи у двери кабинета: номер помещения плана → номера в `benches`, ближние к двери — первыми */
  private nearDoor = new Map<number, number[]>();
  private seatOf = new Map<string, number>();
  private benchOf = new Map<string, number>();
  /** ждёт у двери кабинета на скамье: номер в `benches` */
  private doorOf = new Map<string, number>();
  private firstOf = new Map<Id, number>();

  constructor(
    private l: Layout,
    private a: Anchors,
    private doorSteps?: number,
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
      if (t.room < 0 && t.kind === 'bench' && a.seats[i]) {
        this.benchAt.set(t.cell[1] * l.w + t.cell[0], this.benches.length);
        this.benches.push(i);
      }
    });
  }

  /** Скамьи у двери кабинета `room` (номер помещения плана) — по тому же правилу, что в движке. */
  private benchesBy(room: number): number[] {
    let list = this.nearDoor.get(room);
    if (!list) {
      const r = this.l.plan.rooms[room];
      list = r && this.doorSteps !== undefined ? doorBenches(this.l.plan, r.id, this.doorSteps).flatMap(c => this.benchAt.get(c) ?? []) : [];
      this.nearDoor.set(room, list);
    }
    return list;
  }

  /** На какой скамье у двери ждёт (номер в `benches`); -1 — стоит или ждёт не у двери. */
  doorSeat(key: string): number {
    return this.doorOf.get(key) ?? -1;
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
    move(prev.benches, prev.l, this.benches, prev.doorOf, this.doorOf);
  }

  /** Первое помещение этого типа с дверью; нет — -1. */
  room(type: Id): number {
    return this.firstOf.get(type) ?? -1;
  }

  /**
   * Раздать стулья и скамьи тем, кто ждёт: `waiting` — в очереди к врачу (`room` — его зона ожидания, spec
   * docs/specs/2026-10-walk.md: стулья — в ней; зала нет — любой свободный); у двери кабинета — скамьи у неё (spec
   * docs/specs/2026-10-door-benches.md): `bench` — клетка скамьи, на которую его посадил движок, остальным — свободные у
   * этой двери, кто сел, тот сидит; `benched` — ждёт обследования или результатов, на остальных скамьях коридора.
   */
  sync(waiting: readonly { key: string; room: number; bench?: number }[], benched: readonly string[]) {
    const halls = new Map<number, string[]>();
    const any: string[] = [];
    const doors: { key: string; room: number; bench?: number }[] = [];
    for (const w of waiting) {
      if (this.hallSeats.has(w.room)) {
        const q = halls.get(w.room);
        if (q) q.push(w.key);
        else halls.set(w.room, [w.key]);
      } else if (w.room < 0) any.push(w.key);
      else if (this.l.plan.rooms[w.room]?.type !== 'room.waiting') doors.push(w);
    }
    const taken = new Set<number>();
    const seatOf = new Map<string, number>();
    for (const [room, ids] of halls) seatIn(this.seatOf, ids, this.hallSeats.get(room)!, taken, seatOf);
    if (any.length) seatIn(this.seatOf, any, this.seats.map((_, i) => i), taken, seatOf);
    this.seatOf = seatOf;
    const used = new Set<number>();
    const doorOf = new Map<string, number>();
    for (const w of doors) {
      const b = w.bench !== undefined ? this.benchAt.get(w.bench) : undefined;
      if (b === undefined || used.has(b)) continue;
      doorOf.set(w.key, b);
      used.add(b);
    }
    for (const w of doors) {
      if (doorOf.has(w.key)) continue;
      const near = this.benchesBy(w.room);
      const was = this.doorOf.get(w.key);
      const b = was !== undefined && near.includes(was) && !used.has(was) ? was : near.find(x => !used.has(x));
      if (b === undefined) continue;
      doorOf.set(w.key, b);
      used.add(b);
    }
    this.doorOf = doorOf;
    const benchOf = new Map<string, number>();
    seatIn(this.benchOf, benched, this.benches.map((_, i) => i), used, benchOf);
    this.benchOf = benchOf;
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
      case 'waiting': {
        // поток для ПК (spec docs/specs/2026-10-walk.md): следующие к врачу — у двери его кабинета, остальные — в своём зале;
        // у двери — на скамье, если досталась (spec docs/specs/2026-10-door-benches.md)
        if (!room || room.type === 'room.waiting') return this.waitSpot(w.key, taken, w.room);
        const b = this.doorOf.get(w.key);
        return b !== undefined ? spotOn(l, a, this.benches[b], 'wait', 0, taken) : this.doorSpot(w.room, taken);
      }
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
      case 'gurney': {
        // ждёт каталку (spec docs/specs/2026-10-orderlies.md): привезённый скорой — на своём месте в смотровой, кого кладут в
        // ПИТ или реанимацию от врача — у двери кабинета
        const bed = room && w.bed >= 0 ? room.beds[w.bed] : undefined;
        if (bed) return spotAtCell(l, a, bed, 'wait', 0, taken);
        return room ? this.doorSpot(w.room, taken) : this.waitSpot(w.key, taken);
      }
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

  /**
   * Место человека штата: его клетка в помещении; на стуле — сидит, а перед столом или монитором — за работой; стоит — на
   * посту (spec docs/specs/2026-10-staff-motion.md, часть 1: изредка бумаги в руках).
   */
  staffSpot(m: StaffMember, roleCell: (m: StaffMember) => readonly [number, number] | undefined, taken: ReadonlySet<number>): Spot | undefined {
    const c = roleCell(m);
    if (!c) return undefined;
    const s = spotAtCell(this.l, this.a, c, 'wait', 0, taken);
    if (s.pose === 'stand') return { ...s, work: 'stand' };
    return deskAhead(this.l, s) ? { ...s, work: 'desk' } : s;
  }
}

const DIRS: readonly Cell[] = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
];

/**
 * Где встать у койки на обходе (spec docs/specs/2026-10-staff-motion.md, часть 1, п. 4): свободная клетка пола рядом с
 * кроватью лежащего `s`, ближе всего к изголовью, — лицом к лежащему; `dwell` — сколько стоять при ×1. Нет такой — нет места.
 */
export function bedSide(l: Layout, s: Spot, dwell: number, taken: ReadonlySet<number>): Spot | undefined {
  if (s.thing === undefined) return undefined;
  const th = l.things[s.thing];
  // изголовье — от середины постели против `yaw` (от изголовья к ногам)
  const hx = s.x - Math.sin(s.yaw) * 0.6;
  const hz = s.z - Math.cos(s.yaw) * 0.6;
  const own = new Set(th.cells.map(([x, y]) => y * l.w + x));
  let best: { c: number; d: number } | undefined;
  for (const [x, y] of th.cells) {
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= l.w || ny >= l.h) continue;
      const c = ny * l.w + nx;
      // не в двери: там ходят
      if (own.has(c) || !l.walk[c] || taken.has(c) || l.plan.grid.cells[c] === 4) continue;
      const d = (nx + 0.5 - hx) ** 2 + (ny + 0.5 - hz) ** 2;
      if (!best || d < best.d) best = { c, d };
    }
  }
  if (!best) return undefined;
  const x = (best.c % l.w) + 0.5;
  const z = ((best.c / l.w) | 0) + 0.5;
  // лицом к груди лежащего: между изголовьем и серединой постели
  const yaw = Math.atan2((hx + s.x) / 2 - x, (hz + s.z) / 2 - z);
  return { key: `bedside:${best.c}`, cell: best.c, pose: 'stand', x, y: 0, z, yaw, kind: 'act', dwell, work: 'bed' };
}

/**
 * Где встать тому, кто везёт каталку, у места `s` (spec docs/specs/2026-10-orderlies.md, «Что видно»): каталка — перед ним, её
 * середина в `ahead` м. Клетка рядом с местом, откуда каталка встанет вдоль кровати (стола, аппарата) — рядом с ней, — или к
 * стоящему; не упрётся в стену и, по возможности, в предметы. Чем ближе к месту, тем лучше. Нет такой клетки — у самого места,
 * лицом как шёл. `taken` — клетки, где стоят другие.
 */
export function gurneyStop(l: Layout, s: Spot, taken: ReadonlySet<number> = new Set()): Spot {
  const free = (x: number, y: number) => x >= 0 && y >= 0 && x < l.w && y < l.h && l.walk[y * l.w + x] === 1;
  const solid = (x: number, y: number) => x < 0 || y < 0 || x >= l.w || y >= l.h || l.plan.grid.cells[y * l.w + x] === 3 || l.plan.grid.cells[y * l.w + x] === 0;
  // к чему подвезти: клетки кровати (стола, аппарата) или клетка, где человек стоит
  const target = new Set<number>(s.thing !== undefined && s.pose === 'lie' ? l.things[s.thing].cells.map(([x, y]) => y * l.w + x) : [s.cell]);
  const near = (x: number, y: number) => {
    if (target.has(y * l.w + x)) return s.pose !== 'lie';
    return DIRS.some(([dx, dy]) => target.has((y + dy) * l.w + x + dx));
  };
  // вдоль кровати: ось от изголовья к ногам — по клеткам
  const ax = Math.round(Math.sin(s.yaw));
  const az = Math.round(Math.cos(s.yaw));
  const sx = s.cell % l.w;
  const sy = (s.cell / l.w) | 0;
  const home = l.region[s.cell];
  let best: { cell: number; d: Cell; score: number } | undefined;
  for (let y = sy - 3; y <= sy + 3; y++) {
    for (let x = sx - 3; x <= sx + 3; x++) {
      const far = Math.abs(x - sx) + Math.abs(y - sy);
      if (far > 3 || !free(x, y) || target.has(y * l.w + x)) continue;
      const c = y * l.w + x;
      if (home && l.region[c] !== home) continue;
      for (const d of DIRS) {
        const [x1, y1] = [x + d[0], y + d[1]];
        const [x2, y2] = [x + 2 * d[0], y + 2 * d[1]];
        if (!free(x1, y1) && !(s.pose !== 'lie' && target.has(y1 * l.w + x1))) continue;
        if (solid(x2, y2)) continue;
        const along = s.pose === 'lie' && !Number.isNaN(s.yaw) && Math.abs(d[0]) === Math.abs(ax) && Math.abs(d[1]) === Math.abs(az);
        const score = (near(x1, y1) ? 0 : 4) + (along || s.pose !== 'lie' ? 0 : 2) + (free(x2, y2) ? 0 : 1) + (taken.has(c) ? 3 : 0) + far * 0.5;
        if (!best || score < best.score) best = { cell: c, d, score };
      }
    }
  }
  if (!best) return { ...standAt(l, s.cell, 'go', 0), key: `gurney:${s.cell}`, yaw: NaN };
  return { ...standAt(l, best.cell, 'go', 0), key: `gurney:${best.cell}:${best.d[0]},${best.d[1]}`, yaw: yawOf(best.d[0], best.d[1]) };
}

/**
 * Куда смотрит санитар на своём месте (spec docs/specs/2026-10-orderlies.md, «Каталка стоит у места санитара»): так, чтобы его
 * каталка перед ним не упиралась в стену и предметы; нет такого — как есть.
 */
export function gurneyYaw(l: Layout, cell: number, yaw: number): number {
  const x = cell % l.w;
  const y = (cell / l.w) | 0;
  const free = (cx: number, cy: number) => cx >= 0 && cy >= 0 && cx < l.w && cy < l.h && l.walk[cy * l.w + cx] === 1;
  let best: { d: Cell; score: number } | undefined;
  for (const d of DIRS) {
    if (!free(x + d[0], y + d[1])) continue;
    const score = (free(x + 2 * d[0], y + 2 * d[1]) ? 0 : 1) + (Math.abs(yawOf(d[0], d[1]) - yaw) < 0.01 ? 0 : 0.5);
    if (!best || score < best.score) best = { d, score };
  }
  return best ? yawOf(best.d[0], best.d[1]) : yaw;
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
