// Дополнения плана для 3D: в map-render туалет — это только раковины у стены, и в 3D большие
// пустые комнаты выглядят складом. Здесь вдоль боковых стен туалетов ставятся кабинки с
// унитазами; их клетки становятся непроходимыми, места для людей пересчитываются. Раскладка
// помещений, дверей и прочей мебели — та же, что в map-render (зерно 1).
import { CELL, type Hospital, W } from './hospital';

export interface Stall {
  x: number;
  y: number;
  /** куда смотрит унитаз: dx — вдоль x (±1) */
  dx: number;
}

export function addStalls(h: Hospital): Stall[] {
  const out: Stall[] = [];
  for (const room of h.rooms) {
    if (room.type !== 'toilet') continue;
    const doorTop = room.door[1] === room.y;
    const ix0 = room.x + 1;
    const ix1 = room.x + room.w - 2;
    const iy0 = room.y + 1;
    const iy1 = room.y + room.h - 2;
    // ряд у стены с раковинами оставляем, у двери — две клетки прохода
    const ys: number[] = [];
    for (let y = iy0; y <= iy1; y++) {
      if (doorTop ? y > iy1 - 1 || y < iy0 + 2 : y < iy0 + 1 || y > iy1 - 2) continue;
      ys.push(y);
    }
    for (const [x, dx] of [
      [ix0, 1],
      [ix1, -1],
    ] as [number, number][]) {
      if (ix1 - ix0 < 3) continue;
      for (const y of ys) {
        const i = y * W + x;
        if (h.blocked[i] || h.cells[i] !== CELL.floor) continue;
        if (Math.abs(x - room.door[0]) <= 1) continue;
        h.blocked[i] = 1;
        out.push({ x, y, dx });
      }
    }
  }
  // места, куда ходят люди, — без новых занятых клеток
  h.spots = h.spots.map(s => s.filter(c => !h.blocked[c]));
  return out;
}
