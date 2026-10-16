// из spikes/map-render: src/hospital.ts (план и мебель; 2D-рисование staticShapes не перенесено)
// План больницы для пробы: 60×40 клеток, клетка — 1×1 м (как в «Анамнезе», его ADR 0014).
// Стены — клетки сетки, помещения — прямоугольники со стенами по краю, двери — в стене к
// коридору. Мебель простыми формами, занятые ею клетки непроходимы. Всё из зерна — сцена
// одна и та же для обеих реализаций и на любой машине.
import { rng } from './rng';

export const W = 60;
export const H = 40;
/** Сторона клетки в точках мира (до камеры). */
export const CELL_PX = 16;

export const CELL = { out: 0, floor: 1, wall: 2, door: 3 } as const;

export type RoomType = 'reception' | 'waiting' | 'office' | 'procedure' | 'lab' | 'xray' | 'ward' | 'ecg' | 'staff' | 'toilet';

/** Пол помещений — светлые оттенки по назначению (цвета плана «Анамнеза», metrics.ts). */
export const ROOM_TINT: Record<RoomType, number> = {
  reception: 0xfaf1e4, waiting: 0xfaf6e8, office: 0xe7f3f2, procedure: 0xf8ecec, lab: 0xf1ecf8,
  xray: 0xe9eced, ward: 0xeceff9, ecg: 0xeef5e6, staff: 0xf3f0ea, toilet: 0xe8eff5,
};
export const CORRIDOR = 0xf6f3ed;
export const SEAM = 0xe9e2d4;
export const WALL = 0x46555a;
export const LEAF = 0x5e6d72;
export const BACKGROUND = 0xdde4e3;

export interface Room {
  type: RoomType;
  /** прямоугольник вместе со стенами */
  x: number;
  y: number;
  w: number;
  h: number;
  door: [number, number];
}

export type ObjectKind = 'bed' | 'chair' | 'desk' | 'cabinet' | 'plant' | 'machine' | 'sink' | 'table' | 'xray';

export interface Thing {
  kind: ObjectKind;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Прямоугольник рисунка в точках мира и его цвет. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  color: number;
}

export interface Disc {
  x: number;
  y: number;
  r: number;
  color: number;
}

export interface Hospital {
  cells: Uint8Array;
  /** клетка занята мебелью */
  blocked: Uint8Array;
  rooms: Room[];
  things: Thing[];
  /** проходимые клетки каждого помещения — куда можно послать человека */
  spots: number[][];
  entrance: [number, number];
}

const TYPES: RoomType[] = ['reception', 'waiting', 'office', 'office', 'procedure', 'lab', 'xray', 'ward', 'ward', 'ecg', 'staff', 'toilet'];

export function makeHospital(seed = 1): Hospital {
  const r = rng(seed);
  const cells = new Uint8Array(W * H).fill(CELL.floor);
  const blocked = new Uint8Array(W * H);
  const rooms: Room[] = [];
  const set = (x: number, y: number, v: number) => {
    cells[y * W + x] = v;
  };
  // наружная стена
  for (let x = 0; x < W; x++) {
    set(x, 0, CELL.wall);
    set(x, H - 1, CELL.wall);
  }
  for (let y = 0; y < H; y++) {
    set(0, y, CELL.wall);
    set(W - 1, y, CELL.wall);
  }
  // Полосы помещений между коридорами: строки 11–12 и 26–27 — коридоры, столбцы 29–30 — коридор.
  // door: 'bottom' | 'top' — в какой стене дверь к коридору.
  const bands: { y0: number; y1: number; door: 'top' | 'bottom' }[] = [
    { y0: 0, y1: 10, door: 'bottom' },
    { y0: 13, y1: 19, door: 'top' },
    { y0: 19, y1: 25, door: 'bottom' },
    { y0: 28, y1: 39, door: 'top' },
  ];
  const halves: [number, number][] = [
    [0, 28],
    [31, 59],
  ];
  for (const band of bands) {
    for (const [x0, x1] of halves) {
      // границы помещений: соседние делят стену
      const cuts = [x0];
      let x = x0;
      while (x1 - x > 12) {
        x += 5 + Math.floor(r() * 5);
        cuts.push(x);
      }
      cuts.push(x1);
      for (let i = 0; i + 1 < cuts.length; i++) {
        const room: Room = { type: TYPES[Math.floor(r() * TYPES.length)], x: cuts[i], y: band.y0, w: cuts[i + 1] - cuts[i] + 1, h: band.y1 - band.y0 + 1, door: [0, 0] };
        rooms.push(room);
        for (let yy = room.y; yy < room.y + room.h; yy++) {
          for (let xx = room.x; xx < room.x + room.w; xx++) {
            const edge = yy === room.y || yy === room.y + room.h - 1 || xx === room.x || xx === room.x + room.w - 1;
            set(xx, yy, edge ? CELL.wall : CELL.floor);
          }
        }
        const dx = room.x + 1 + Math.floor(r() * (room.w - 2));
        const dy = band.door === 'top' ? room.y : room.y + room.h - 1;
        room.door = [dx, dy];
      }
    }
  }
  for (const room of rooms) set(room.door[0], room.door[1], CELL.door);
  // вертикальный коридор и вход снизу
  for (let y = 1; y < H - 1; y++) {
    set(29, y, CELL.floor);
    set(30, y, CELL.floor);
  }
  const entrance: [number, number] = [29, H - 1];
  set(29, H - 1, CELL.door);
  set(30, H - 1, CELL.door);

  const things: Thing[] = [];
  for (const room of rooms) furnish(room, things, r);
  for (const t of things) for (let y = t.y; y < t.y + t.h; y++) for (let x = t.x; x < t.x + t.w; x++) blocked[y * W + x] = 1;

  const spots = rooms.map(room => {
    const out: number[] = [];
    for (let y = room.y + 1; y < room.y + room.h - 1; y++) for (let x = room.x + 1; x < room.x + room.w - 1; x++) if (!blocked[y * W + x]) out.push(y * W + x);
    return out;
  });
  return { cells, blocked, rooms, things, spots, entrance };
}

/** Мебель вдоль стен, кроме стены с дверью и клеток рядом с дверью; середина помещения свободна. */
function furnish(room: Room, out: Thing[], r: () => number) {
  const ix0 = room.x + 1;
  const iy0 = room.y + 1;
  const ix1 = room.x + room.w - 2;
  const iy1 = room.y + room.h - 2;
  const doorTop = room.door[1] === room.y;
  const backY = doorTop ? iy1 : iy0; // стена напротив двери
  const nearDoor = (x: number, y: number) => Math.abs(x - room.door[0]) <= 1 && Math.abs(y - room.door[1]) <= 2;
  const busy = new Set<number>();
  const put = (kind: ObjectKind, x: number, y: number, w = 1, h = 1) => {
    if (x < ix0 || y < iy0 || x + w - 1 > ix1 || y + h - 1 > iy1) return;
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (busy.has(yy * W + xx) || nearDoor(xx, yy)) return;
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) busy.add(yy * W + xx);
    out.push({ kind, x, y, w, h });
  };
  const deep = iy1 - iy0 + 1;
  const bedY = doorTop ? iy1 - 1 : iy0;
  switch (room.type) {
    case 'ward':
      for (let x = ix0; x <= ix1; x += 2) {
        put('bed', x, bedY, 1, 2);
        if (deep >= 7) put('bed', x, doorTop ? iy0 + 2 : iy1 - 1, 1, 2);
      }
      put('sink', ix1, doorTop ? iy0 : iy1);
      break;
    case 'waiting':
      for (let x = ix0; x <= ix1; x++) put('chair', x, backY);
      for (let y = iy0; y <= iy1; y++) {
        put('chair', ix0, y);
        put('chair', ix1, y);
      }
      put('plant', ix0, doorTop ? iy0 : iy1);
      break;
    case 'reception':
      put('desk', ix0 + 1, backY + (doorTop ? -1 : 1), Math.min(4, ix1 - ix0 - 1), 1);
      for (let x = ix0 + 1; x <= ix0 + 3; x++) put('chair', x, backY);
      put('cabinet', ix0, backY);
      put('cabinet', ix1, backY);
      break;
    case 'office': {
      const cx = Math.floor((ix0 + ix1) / 2);
      put('desk', cx - 1, backY + (doorTop ? -1 : 1), 2, 1);
      put('chair', cx, backY);
      put('chair', cx - 1, backY + (doorTop ? -2 : 2));
      put('cabinet', ix0, backY);
      put('plant', ix1, backY);
      put('bed', ix1, doorTop ? iy0 : iy1 - 1, 1, 2);
      break;
    }
    case 'procedure':
      put('bed', Math.floor((ix0 + ix1) / 2), bedY, 1, 2);
      put('cabinet', ix0, backY);
      put('sink', ix1, backY);
      put('table', ix0, doorTop ? iy0 : iy1);
      break;
    case 'lab':
      for (let x = ix0; x <= ix1; x++) put('table', x, backY);
      put('machine', ix0, backY + (doorTop ? -1 : 1));
      put('machine', ix1, backY + (doorTop ? -1 : 1));
      put('sink', ix1, doorTop ? iy0 : iy1);
      break;
    case 'xray':
      put('xray', Math.floor((ix0 + ix1) / 2) - 1, backY + (doorTop ? -2 : 1), 2, 2);
      put('machine', ix0, backY);
      put('cabinet', ix1, backY);
      break;
    case 'ecg':
      put('bed', ix0 + 1, bedY, 1, 2);
      put('machine', ix0 + 2, backY);
      put('chair', ix1, backY);
      put('cabinet', ix1, doorTop ? iy0 : iy1);
      break;
    case 'staff':
      put('table', Math.floor((ix0 + ix1) / 2) - 1, Math.floor((iy0 + iy1) / 2), 2, 1);
      put('chair', Math.floor((ix0 + ix1) / 2) - 1, Math.floor((iy0 + iy1) / 2) - 1);
      put('chair', Math.floor((ix0 + ix1) / 2), Math.floor((iy0 + iy1) / 2) + 1);
      put('cabinet', ix0, backY);
      put('plant', ix1, backY);
      break;
    case 'toilet':
      for (let x = ix0; x <= ix1; x += 2) put('sink', x, backY);
      break;
  }
  if (r() < 0.5) put('plant', ix0, doorTop ? iy0 : iy1);
}

