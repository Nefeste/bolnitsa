// Стройка в окне (spec docs/specs/2026-10-build.md, «Экран и управление»): инструменты, призраки и команды движку.
// Проверки — те же чистые функции движка (src/engine/hospital/site.ts) над той больницей, что прислал поток расчёта:
// призрак говорит то же, что скажет движок. Команда уходит в поток (`site`), ответ — извещением и новой больницей.
import type { Cell, ContentDb, Id, ObjectKind, RoomSizeId, Rot } from '../content/types';
import { DOCTOR, standInOf } from '../engine/hospital/requirements';
import {
  autoRot, cellsOf, checkBench, checkDoor, checkItem, checkReady, checkRoom, demolishRefund, DOOR_PRICE, FACE, isInterior, priceOf, type ReadyDraft, readyCorner,
  readyTurn, refundOf, rulesOf, sideOf, type Site, type SiteCommand, type SiteError, type SiteResult, targetAt,
} from '../engine/hospital/site';
import { nightHospital, payOf, salaryOf, type Shift } from '../engine/hospital/staff';
import { money, named, T } from '../i18n';
import { GHOST_BAD, GHOST_DOOR, GHOST_OK } from '../render/ghost';
import { type Thing, yawOf } from '../render/layout';
import { objectTurns } from '../render/orient';
import type { WallMode } from '../render/world';
import type { BuildHud, Tool } from '../ui/store';
import type { Game } from './game';

/** Название предмета: в помещении — своё (стойка регистратуры, пульт), аппарат — по каталогу. */
export function objectName(db: ContentDb, kind: ObjectKind, roomType: Id | '', eq?: Id): string {
  if (eq) return named(db.equipment[eq]?.name, eq);
  return T.objectsIn[`${kind}@${roomType}`] ?? T.objects[kind as keyof typeof T.objects] ?? kind;
}

/** Строка призрака начинается с заглавной: «Растение — 300 ₽». */
const upper = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** Должность посреди строки — со строчной: «· терапевт — 5 000 ₽ в сутки». */
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** Почему нельзя — словами. */
export function whyText(db: ContentDb, site: Site | undefined, e: SiteError): string {
  const room = (id?: string) => {
    const r = id ? site?.rooms.find(x => x.id === id) : undefined;
    return r ? named(db.rooms[r.type]?.name, r.type) : (id ?? '');
  };
  switch (e.kind) {
    case 'outside':
      return T.site.outside;
    case 'small':
      return T.site.small(e.min[0], e.min[1]);
    case 'large':
      return T.site.large(e.max);
    case 'overlap':
      return e.what === 'entrance' ? T.site.overlapEntrance : e.what === 'door' ? T.site.overlapDoor : e.what === 'decor' ? T.site.overlapDecor : T.site.overlapRoom(room(e.room));
    case 'noCorridor':
      return T.site.noCorridor;
    case 'cutsOff':
      return e.ambulance ? T.site.cutsOffAmbulance : T.site.cutsOff(room(e.room));
    case 'notInRoom':
      return T.site.notInRoom;
    case 'notHere':
      return T.site.notHere;
    case 'occupied':
      return T.site.occupied(T.objects[e.item as keyof typeof T.objects] ?? e.item);
    case 'doorway':
      return T.site.doorway;
    case 'blocks':
      return T.site.blocks;
    case 'badWall':
      return T.site.badWall;
    case 'shared':
      return T.site.shared;
    case 'notCorridor':
      return T.site.notCorridor;
    case 'corridorOnly':
      return T.site.corridorOnly;
    case 'notEmpty':
      return T.site.notEmpty;
    case 'noFit':
      return T.site.noFit;
    case 'nothing':
      return T.site.nothing;
    case 'inUse':
      return T.site.inUse;
    case 'busy':
      return T.site.busy;
    case 'mode':
      return T.site.mode;
    // касса (spec docs/specs/2026-10-economy.md): трата увела бы кассу ниже предела минуса
    case 'money':
      return T.money.short(money(e.need));
    case 'doorTo':
      return T.site.doorTo;
    default:
      return T.site.unknown;
  }
}

/** Прямоугольник по двум углам — клетки включительно. */
const rectOf = (a: Cell, b: Cell) => ({ x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(a[0] - b[0]) + 1, h: Math.abs(a[1] - b[1]) + 1 });

export class Builder {
  on = false;
  tool?: Tool;
  roomType?: Id;
  /** готовое помещение (spec docs/specs/2026-10-ready-rooms.md): тип и образец */
  ready?: { type: Id; size: RoomSizeId };
  /** «С персоналом»: готовое — с людьми на всех должностях */
  withStaff = true;
  item?: { kind: ObjectKind; eq?: Id };
  /** переставляют: помещение и номер предмета */
  moving?: { room: string; id: number };
  rot: Rot = 0;
  /** R нажата: поворот — свой, не по правилам */
  turned = false;
  drag?: Cell;
  hover?: Cell;
  ghost?: { ok: boolean; text: string };
  result?: { ok: boolean; text: string };
  private walls?: WallMode;

  constructor(private g: Game) {}

  private get db() {
    return this.g.db;
  }

  private get site(): Site | undefined {
    return this.g.hospital?.site;
  }

  /** Касса (spec docs/specs/2026-10-economy.md): чего не хватит на трату `cost` до предела минуса; хватает — 0. */
  private short(cost: number): number {
    const { cash, limit } = this.g.money.hud;
    return cash === undefined || cost <= 0 ? 0 : Math.max(0, cost - (cash + limit));
  }

  /** Для панелей. */
  hud(): BuildHud {
    return {
      on: this.on, ...(this.tool ? { tool: this.tool } : {}), ...(this.roomType ? { roomType: this.roomType } : {}), ...(this.ready ? { ready: this.ready } : {}),
      withStaff: this.withStaff, ...(this.item ? { item: this.item } : {}),
      moving: !!this.moving, ...(this.ghost ? { ghost: this.ghost } : {}), ...(this.result ? { result: this.result } : {}),
      spent: this.g.works.spent, undo: this.g.works.undo,
    };
  }

  toggle() {
    if (!this.site) return;
    this.on = !this.on;
    this.reset();
    this.tool = undefined;
    this.result = undefined;
    if (this.on) {
      // стены — вниз: план виден целиком
      this.walls = this.g.stage.wallMode;
      this.g.actions.setWalls('down');
    } else {
      this.g.command({ kind: 'done' });
      if (this.walls) this.g.actions.setWalls(this.walls);
    }
    this.update();
  }

  private reset() {
    this.item = undefined;
    this.moving = undefined;
    this.drag = undefined;
    this.turned = false;
  }

  setTool(t: Tool | undefined) {
    if (!this.on) this.toggle();
    this.reset();
    this.tool = t;
    if (t !== 'room') this.roomType = undefined;
    if (t !== 'ready') this.ready = undefined;
    this.update();
  }

  /** Готовое помещение: тип и образец; без образца — первый по каталогу. Поворот снова выбирает призрак. */
  pickReady(id: Id, size?: RoomSizeId) {
    const sizes = this.db.rooms[id]?.sizes ?? [];
    const z = sizes.find(x => x.id === size) ?? sizes[0];
    if (!z) return;
    this.setTool('ready');
    this.ready = { type: id, size: z.id };
    this.update();
  }

  toggleStaff() {
    this.withStaff = !this.withStaff;
    this.update();
  }

  pickRoomType(id: Id) {
    this.setTool('room');
    this.roomType = id;
    this.update();
  }

  pickItem(kind: ObjectKind, eq?: Id) {
    this.setTool('item');
    this.item = { kind, ...(eq ? { eq } : {}) };
    this.update();
  }

  /** Esc и ПКМ: призрак, затем инструмент, затем стройка. Отдаёт, отменилось ли что-то. */
  cancel(): boolean {
    if (!this.on) return false;
    if (this.drag) this.drag = undefined;
    else if (this.moving || this.item) {
      this.moving = undefined;
      this.item = undefined;
      this.turned = false;
    } else if (this.ready) {
      this.ready = undefined;
      this.turned = false;
    } else if (this.tool) {
      this.tool = undefined;
      this.roomType = undefined;
    } else this.toggle();
    this.update();
    return true;
  }

  rotate() {
    if (!this.on) return;
    this.rot = ((this.rot + 1) % 4) as Rot;
    this.turned = true;
    this.update();
  }

  move(cell: Cell | undefined) {
    this.hover = cell;
    this.update();
  }

  /** ЛКМ нажата. */
  down(cell: Cell | undefined) {
    if (!this.on || !cell) return;
    const site = this.site!;
    const [x, y] = cell;
    switch (this.tool) {
      case 'ready': {
        const g = this.readyAt(cell);
        // денег не хватает — движок ответит «не хватает N ₽», как у всей стройки
        if (this.ready && g?.ok && g.draft) {
          const { rect } = g.draft;
          this.g.command({ kind: 'ready', type: this.ready.type, size: this.ready.size, x: rect.x, y: rect.y, rot: g.rot, ...(this.withStaff ? { staff: true } : {}) });
        }
        break;
      }
      case 'room':
        if (this.roomType) this.drag = cell;
        break;
      case 'item': {
        if (this.item) {
          const spec = this.itemSpec(cell);
          if (!spec) break;
          if (this.moving) this.g.command({ kind: 'move', room: this.moving.room, id: this.moving.id, x, y, rot: spec.rot });
          else if (spec.room) this.g.command({ kind: 'item', room: spec.room, item: { kind: this.item.kind, ...(this.item.eq ? { eq: this.item.eq } : {}), x, y, rot: spec.rot } });
          if (this.moving) {
            this.moving = undefined;
            this.item = undefined;
            this.turned = false;
          }
          break;
        }
        // взять поставленный — переставить; иначе выбрать помещение
        const t = targetAt(site, x, y);
        if (t?.kind === 'item') {
          const it = site.rooms.find(r => r.id === t.room)!.items.find(i => i.id === t.id)!;
          if (!it.leaving) {
            this.moving = { room: t.room, id: t.id };
            this.item = { kind: it.kind, ...(it.eq ? { eq: it.eq } : {}) };
            this.rot = it.rot;
            this.turned = true;
          }
        } else this.g.selectRoomAt(cell);
        break;
      }
      case 'door':
      case 'door2': {
        const d = this.doorAt(cell);
        if (d?.ok) this.g.command({ kind: 'door', room: d.room, cells: d.cells });
        else if (!d) this.g.selectRoomAt(cell);
        break;
      }
      case 'bench':
        // скамья в коридоре (spec docs/specs/2026-10-door-benches.md); денег не хватает — ответит движок
        if (checkBench(this.db, site, x, y).ok) this.g.command({ kind: 'bench', x, y });
        break;
      case 'demolish': {
        const t = targetAt(site, x, y);
        if (t?.kind === 'item') this.g.command({ kind: 'remove', room: t.room, id: t.id });
        else if (t?.kind === 'door') this.g.command({ kind: 'undoor', room: t.room });
        else if (t?.kind === 'room') this.g.command({ kind: 'demolish', room: t.room });
        else if (t?.kind === 'decor') this.g.command({ kind: 'undecor', x: t.x, y: t.y });
        break;
      }
      default:
        this.g.selectRoomAt(cell);
    }
    this.update();
  }

  /** ЛКМ отпущена: протянутое помещение — построить. */
  up(cell: Cell | undefined) {
    if (!this.on || !this.drag) return;
    const end = cell ?? this.hover ?? this.drag;
    const r = rectOf(this.drag, end);
    this.drag = undefined;
    if (this.roomType && (r.w > 1 || r.h > 1) && checkRoom(this.db, this.site!, this.roomType, r).ok) this.g.command({ kind: 'room', type: this.roomType, ...r });
    this.update();
  }

  /** Ответ движка. */
  onResult(n: SiteResult) {
    if (n.cmd === 'done') return;
    if (!n.ok) this.result = { ok: false, text: T.build.failed(whyText(this.db, this.site, n.error ?? { kind: 'unknown' })) };
    else if (n.later) this.result = { ok: true, text: T.build.later };
    else if (n.cmd === 'undo') this.result = { ok: true, text: T.build.undone };
    else if (n.cmd === 'hire') this.result = { ok: true, text: T.build.hired };
    else if ((n.cost ?? 0) < 0) this.result = { ok: true, text: T.build.backOk(money(-(n.cost ?? 0))) };
    else if (n.hired !== undefined) this.result = { ok: true, text: T.build.spentHired(money(n.cost ?? 0), n.hired) };
    else this.result = { ok: true, text: T.build.spentOk(money(n.cost ?? 0)) };
    // новое помещение — сразу выбрано: протянутому — «Обставить», дверь, люди; готовому — работает ли и почему нет
    if (n.ok && (n.cmd === 'room' || n.cmd === 'ready') && n.room) this.g.selectRoomId(n.room);
  }

  /** Больница новая — призрак проверяется заново. */
  refresh() {
    if (this.moving && !this.site?.rooms.find(r => r.id === this.moving!.room)?.items.some(i => i.id === this.moving!.id)) {
      this.moving = undefined;
      this.item = undefined;
    }
    this.update();
  }

  /**
   * Готовое помещение с серединой в клетке `cell` (spec docs/specs/2026-10-ready-rooms.md): поворот — свой после R, иначе
   * тот, с которым можно поставить (`readyTurn`); образец, можно ли и цена — те же функции, что у движка.
   */
  private readyAt(cell: Cell): { rot: Rot; ok: boolean; why?: SiteError; cost: number; draft?: ReadyDraft } | undefined {
    const site = this.site;
    if (!site || !this.ready) return undefined;
    const { type, size } = this.ready;
    const rot = this.turned ? this.rot : readyTurn(this.db, site, type, size, cell, this.rot);
    if (!this.turned) this.rot = rot;
    const at = readyCorner(this.db, type, size, rot, cell);
    if (!at) return undefined;
    const c = checkReady(this.db, site, type, size, at[0], at[1], rot);
    return c.ok ? { rot, ok: true, cost: c.cost, draft: c.draft } : { rot, ok: false, why: c.error, cost: 0, ...(c.draft ? { draft: c.draft } : {}) };
  }

  /**
   * «С персоналом»: кто встанет на должности готового `type` и сколько им в сутки — резерв раньше новых, как в движке; в
   * больнице, что работает ночью, — и ночная смена помещения, что работает ночью (spec docs/specs/2026-10-staff-shifts.md).
   */
  private staffText(type: Id): string {
    const db = this.db;
    if (!this.withStaff) return '';
    const free = this.g.staff.filter(m => m.room === undefined);
    const who: string[] = [];
    let salary = 0;
    const shifts: Shift[] = db.rooms[type]?.night && nightHospital(db, [...(this.site?.rooms ?? []), { type }]) ? ['day', 'night'] : ['day'];
    for (const shift of shifts) {
      for (const post of db.rooms[type]?.staff ?? []) {
        const role = post === DOCTOR ? standInOf(db, DOCTOR) : post;
        if (!role || !db.roles[role]?.hire) continue;
        const i = free.findIndex(m => m.role === role);
        salary += payOf(db, i >= 0 ? free.splice(i, 1)[0].salary : salaryOf(db, role, 3), shift);
        const name = lower(named(db.roles[role]?.name, role));
        who.push(shift === 'night' ? `${name} (${T.card.shifts.night})` : name);
      }
    }
    return who.length ? T.build.ghostStaff(who.join(', '), money(salary)) : '';
  }

  /** Куда и как ставится предмет под курсором: помещение, поворот, клетки, можно ли. */
  private itemSpec(cell: Cell): { room?: string; type: Id | ''; rot: Rot; cells: Cell[]; ok: boolean; why?: SiteError; cost: number } | undefined {
    const site = this.site;
    if (!site || !this.item) return undefined;
    const [x, y] = cell;
    const room = this.moving ? site.rooms.find(r => r.id === this.moving!.room) : site.rooms.find(r => isInterior(r, x, y));
    const type = room?.type ?? '';
    const rot = this.turned || !room ? this.rot : autoRot(this.db, site, room.id, this.item.kind, x, y);
    if (!this.turned) this.rot = rot;
    const cells = cellsOf({ kind: this.item.kind, x, y, rot }, type);
    if (!room) return { type, rot, cells, ok: false, why: { kind: 'notInRoom' }, cost: 0 };
    const c = checkItem(this.db, site, room.id, { kind: this.item.kind, ...(this.item.eq ? { eq: this.item.eq } : {}), x, y, rot }, this.moving?.id);
    return c.ok ? { room: room.id, type, rot, cells, ok: true, cost: c.cost } : { room: room.id, type, rot, cells, ok: false, why: c.error, cost: 0 };
  }

  /** Дверь под курсором: стена помещения (выбранного — раньше), одна или две клетки вдоль неё. */
  private doorAt(cell: Cell): { room: string; cells: Cell[]; side: number; ok: boolean; why?: SiteError; cost: number } | undefined {
    const site = this.site!;
    const [x, y] = cell;
    const walls = site.rooms.filter(r => sideOf(r, x, y) >= 0);
    const sel = this.g.selectedRoom;
    const room = walls.find(r => r.id === sel) ?? walls[0];
    if (!room) return undefined;
    const side = sideOf(room, x, y);
    const two = this.tool === 'door2';
    // над такой же дверью — «нечего менять», а не она же, сдвинутая на клетку
    if (room.door?.length === (two ? 2 : 1) && room.door.some(c => c[0] === x && c[1] === y))
      return { room: room.id, cells: room.door, side, ok: false, why: { kind: 'nothing' }, cost: 0 };
    const along: Cell = side % 2 === 0 ? [1, 0] : [0, 1];
    const tries: Cell[][] = two
      ? [
          [cell, [x + along[0], y + along[1]]],
          [[x - along[0], y - along[1]], cell],
        ]
      : [[cell]];
    let first: { cells: Cell[]; c: ReturnType<typeof checkDoor> } | undefined;
    for (const cells of tries) {
      const c = checkDoor(this.db, site, room.id, cells);
      first ??= { cells, c };
      if (c.ok) return { room: room.id, cells, side, ok: true, cost: c.cost };
    }
    return { room: room.id, cells: first!.cells, side, ok: false, ...(first!.c.ok ? {} : { why: first!.c.error }), cost: 0 };
  }

  /** Призрак и строка под инструментами — по инструменту и клетке под курсором. */
  update() {
    const gh = this.g.ghosts;
    const site = this.site;
    gh.clear();
    this.ghost = undefined;
    if (!this.on || !site) return;
    const db = this.db;
    const hover = this.hover;
    switch (this.tool) {
      case 'ready': {
        if (!this.ready) {
          this.ghost = { ok: true, text: T.build.hintReady };
          break;
        }
        const { type, size } = this.ready;
        const name = `${named(db.rooms[type]?.name, type)} ${size}`;
        const g = hover ? this.readyAt(hover) : undefined;
        if (!g?.draft) {
          this.ghost = { ok: true, text: T.build.hintReady };
          break;
        }
        const d = g.draft;
        const need = g.ok ? this.short(g.cost) : 0;
        const ok = g.ok && need === 0;
        gh.room(d.rect, ok, d.door);
        gh.door(d.door, FACE[g.rot], ok, GHOST_DOOR);
        gh.furniture(
          `${type}|${size}|${g.rot}`,
          d.items.map((it): Thing => {
            const [fx, fy] = FACE[it.rot];
            return { kind: it.kind, room: -1, type, cell: [it.x, it.y], cells: cellsOf(it, type), face: [fx, fy], yaw: yawOf(fx, fy), ...(it.eq ? { equipment: it.eq } : {}) };
          }),
          [d.rect.x, d.rect.y],
          ok,
        );
        const what = T.build.ghostReady(named(db.rooms[type]?.name, type), size, d.rect.w, d.rect.h, money(g.ok ? g.cost : 0));
        const staff = this.staffText(type);
        this.ghost = need > 0 ? { ok: false, text: T.build.ghostBad(what, T.money.short(money(need))) }
          : g.ok ? { ok: true, text: staff ? `${what} · ${staff}` : what } : { ok: false, text: T.build.ghostBad(name, whyText(db, site, g.why ?? { kind: 'unknown' })) };
        break;
      }
      case 'room': {
        if (!this.roomType) {
          this.ghost = { ok: true, text: T.build.hintNoRoom };
          break;
        }
        const name = named(db.rooms[this.roomType]?.name, this.roomType);
        const z = rulesOf(db, this.roomType)!.smallest;
        if (!this.drag || !hover) {
          if (hover) gh.cells([hover], GHOST_OK);
          this.ghost = { ok: true, text: T.build.hintRoom(name, z.w, z.h) };
          break;
        }
        const r = rectOf(this.drag, hover);
        const c = checkRoom(db, site, this.roomType, r);
        const need = c.ok ? this.short(c.cost) : 0;
        gh.room(r, c.ok && need === 0);
        this.ghost = c.ok && need > 0 ? { ok: false, text: T.build.ghostBad(T.build.ghostRoom(name, r.w, r.h, money(c.cost)), T.money.short(money(need))) }
          : c.ok ? { ok: true, text: T.build.ghostRoom(name, r.w, r.h, money(c.cost)) } : { ok: false, text: T.build.ghostBad(`${name} ${r.w} × ${r.h}`, whyText(db, site, c.error)) };
        break;
      }
      case 'item': {
        if (!this.item) {
          this.ghost = { ok: true, text: T.build.hintItem };
          const t = hover ? targetAt(site, hover[0], hover[1]) : undefined;
          if (t?.kind === 'item') {
            const r = site.rooms.find(x => x.id === t.room)!;
            gh.cells(cellsOf(r.items.find(i => i.id === t.id)!, r.type), GHOST_OK);
          }
          break;
        }
        if (!hover) break;
        const spec = this.itemSpec(hover)!;
        const name = upper(objectName(db, this.item.kind, spec.type, this.item.eq));
        const [fx, fy] = FACE[spec.rot];
        const thing: Thing = {
          kind: this.item.kind, room: -1, type: spec.type, cell: hover, cells: spec.cells, face: [fx, fy], yaw: yawOf(fx, fy), ...(this.item.eq ? { equipment: this.item.eq } : {}),
        };
        const need = spec.ok && !this.moving ? this.short(spec.cost) : 0;
        gh.item(thing, spec.ok && need === 0);
        this.ghost = need > 0 ? { ok: false, text: T.build.ghostBad(T.build.ghostItem(name, money(spec.cost)), T.money.short(money(need))) }
          : spec.ok
          ? { ok: true, text: this.moving ? T.build.ghostMove(name) : T.build.ghostItem(name, money(spec.cost || priceOf(db, this.item.kind, this.item.eq))) }
          : { ok: false, text: T.build.ghostBad(name, whyText(db, site, spec.why!)) };
        break;
      }
      case 'door':
      case 'door2': {
        const d = hover ? this.doorAt(hover) : undefined;
        if (!d) {
          this.ghost = { ok: true, text: T.build.hintDoor };
          break;
        }
        const need = d.ok ? this.short(d.cost) : 0;
        gh.door(d.cells, FACE[d.side], d.ok && need === 0);
        const two = this.tool === 'door2';
        this.ghost = need > 0 ? { ok: false, text: T.build.ghostBad(T.build.ghostDoor(two, money(d.cost)), T.money.short(money(need))) }
          : d.ok ? { ok: true, text: T.build.ghostDoor(two, money(d.cost)) } : { ok: false, text: T.build.ghostBad(T.build.ghostDoor(two, money(DOOR_PRICE[two ? 2 : 1])), whyText(db, site, d.why ?? { kind: 'unknown' })) };
        break;
      }
      case 'bench': {
        if (!hover) {
          this.ghost = { ok: true, text: T.build.hintBench };
          break;
        }
        const c = checkBench(db, site, hover[0], hover[1]);
        const need = c.ok ? this.short(c.cost) : 0;
        // спиной к стене, как скамьи коридора на карте
        const [fx, fy] = FACE[objectTurns(this.g.plan.grid, [{ kind: 'bench', x: hover[0], y: hover[1] }])[0]];
        gh.item({ kind: 'bench', room: -1, type: '', cell: hover, cells: [hover], face: [fx, fy], yaw: yawOf(fx, fy) }, c.ok && need === 0);
        const what = T.build.ghostItem(upper(T.objects.bench), money(priceOf(db, 'bench')));
        this.ghost = need > 0 ? { ok: false, text: T.build.ghostBad(what, T.money.short(money(need))) }
          : c.ok ? { ok: true, text: `${what} · ${T.build.benchHint}` } : { ok: false, text: T.build.ghostBad(upper(T.objects.bench), whyText(db, site, c.error)) };
        break;
      }
      case 'demolish': {
        const t = hover ? targetAt(site, hover[0], hover[1]) : undefined;
        if (!t) {
          this.ghost = { ok: true, text: T.build.hintDemolish };
          break;
        }
        // скамья или растение коридора (spec docs/specs/2026-10-door-benches.md)
        if (t.kind === 'decor') {
          const d = site.decor.find(o => o.x === t.x && o.y === t.y)!;
          gh.cells([[t.x, t.y]], GHOST_BAD);
          this.ghost = { ok: true, text: T.build.ghostDemolish(T.build.decorWhat[d.kind] ?? objectName(db, d.kind, ''), money(refundOf(db, priceOf(db, d.kind)))) };
          break;
        }
        const r = site.rooms.find(x => x.id === t.room)!;
        if (t.kind === 'item') {
          const it = r.items.find(i => i.id === t.id)!;
          gh.cells(cellsOf(it, r.type), GHOST_BAD);
          this.ghost = { ok: true, text: T.build.ghostDemolish(objectName(db, it.kind, r.type, it.eq), money(refundOf(db, priceOf(db, it.kind, it.eq)))) };
        } else if (t.kind === 'door') {
          gh.cells(r.door ?? [], GHOST_BAD);
          this.ghost = { ok: true, text: T.build.ghostDemolish(T.build.doorWhat, money(refundOf(db, DOOR_PRICE[r.door?.length ?? 1] ?? 0))) };
        } else {
          const cells: Cell[] = [];
          for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) cells.push([x, y]);
          gh.cells(cells, GHOST_BAD);
          this.ghost = { ok: true, text: T.build.ghostDemolish(named(db.rooms[r.type]?.name, r.type), money(demolishRefund(db, r))) };
        }
        break;
      }
      default:
        if (hover) gh.cells([hover], GHOST_OK);
    }
  }
}

/** Команда стройки в движок — через поток расчёта. */
export type SiteSend = (cmd: SiteCommand) => void;
