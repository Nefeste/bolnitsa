// Стройка в окне (spec docs/specs/2026-10-build.md, «Экран и управление»): инструменты, призраки и команды движку.
// Проверки — те же чистые функции движка (src/engine/hospital/site.ts) над той больницей, что прислал поток расчёта:
// призрак говорит то же, что скажет движок. Команда уходит в поток (`site`), ответ — извещением и новой больницей.
import type { Cell, ContentDb, Id, ObjectKind, Rot } from '../content/types';
import {
  autoRot, cellsOf, checkDoor, checkItem, checkRoom, demolishRefund, DOOR_PRICE, FACE, isInterior, priceOf, refundOf, rulesOf, sideOf, type Site,
  type SiteCommand, type SiteError, type SiteResult, targetAt,
} from '../engine/hospital/site';
import { money, named, T } from '../i18n';
import { GHOST_BAD, GHOST_OK } from '../render/ghost';
import { type Thing, yawOf } from '../render/layout';
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
      return T.site.notHere('');
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

  /** Для панелей. */
  hud(): BuildHud {
    return {
      on: this.on, ...(this.tool ? { tool: this.tool } : {}), ...(this.roomType ? { roomType: this.roomType } : {}), ...(this.item ? { item: this.item } : {}),
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
      case 'demolish': {
        const t = targetAt(site, x, y);
        if (t?.kind === 'item') this.g.command({ kind: 'remove', room: t.room, id: t.id });
        else if (t?.kind === 'door') this.g.command({ kind: 'undoor', room: t.room });
        else if (t?.kind === 'room') this.g.command({ kind: 'demolish', room: t.room });
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
    else this.result = { ok: true, text: T.build.spentOk(money(n.cost ?? 0)) };
    // новое помещение — сразу выбрано: «Обставить», дверь, люди
    if (n.ok && n.cmd === 'room' && n.room) this.g.selectRoomId(n.room);
  }

  /** Больница новая — призрак проверяется заново. */
  refresh() {
    if (this.moving && !this.site?.rooms.find(r => r.id === this.moving!.room)?.items.some(i => i.id === this.moving!.id)) {
      this.moving = undefined;
      this.item = undefined;
    }
    this.update();
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
        gh.room(r, c.ok);
        this.ghost = c.ok ? { ok: true, text: T.build.ghostRoom(name, r.w, r.h, money(c.cost)) } : { ok: false, text: T.build.ghostBad(`${name} ${r.w} × ${r.h}`, whyText(db, site, c.error)) };
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
        gh.item(thing, spec.ok);
        this.ghost = spec.ok
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
        gh.door(d.cells, FACE[d.side], d.ok);
        const two = this.tool === 'door2';
        this.ghost = d.ok ? { ok: true, text: T.build.ghostDoor(two, money(d.cost)) } : { ok: false, text: T.build.ghostBad(T.build.ghostDoor(two, money(DOOR_PRICE[two ? 2 : 1])), whyText(db, site, d.why ?? { kind: 'unknown' })) };
        break;
      }
      case 'demolish': {
        const t = hover ? targetAt(site, hover[0], hover[1]) : undefined;
        if (!t) {
          this.ghost = { ok: true, text: T.build.hintDemolish };
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
