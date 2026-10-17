// Готовая больница в виде больницы ПК (spec docs/specs/2026-10-build.md, «Участок и здание») — своё. Запись каталога
// (`content/hospital/presets/`) строится движком «Анамнеза» теми же командами, что прежде (`presetHospital`), и
// переводится: помещения — прямоугольники с дверью, их мебель и аппараты — предметы образцов на тех же клетках, штат —
// тот же (номера помещений те же). Внутренность здания — коридоры и полы помещений: стены помещений готовой больницы —
// стены корпуса. Одинарная дверь помещения, где лежат, становится двойной — в ПК-версии каталка в одинарную не проходит.
import type { Cell, ContentDb, Preset } from '../../content/types';
import { planOf, presetHospital } from './build';
import { doctorRoom } from './requirements';
import { checkDoor, type Rect, rulesOf, sideOf, type Site, type SiteItem, type SiteRoom, templateItems } from './site';

/** Клетки коридора → прямоугольники по строкам: подряд идущие клетки строки — один. */
function runs(w: number, cells: readonly number[]): Rect[] {
  const out: Rect[] = [];
  const sorted = [...cells].sort((a, b) => a - b);
  for (const i of sorted) {
    const x = i % w;
    const y = (i - x) / w;
    const last = out[out.length - 1];
    if (last && last.y === y && last.x + last.w === x) last.w++;
    else out.push({ x, y, w: 1, h: 1 });
  }
  return out;
}

export function siteOfPreset(db: ContentDb, p: Preset): Site {
  const { hospital } = presetHospital(db, p);
  const plan = planOf(db, hospital);
  const inside: Rect[] = [...runs(hospital.w, hospital.corridor), ...plan.rooms.map(r => ({ x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 2 }))];
  const shellRooms: SiteRoom[] = plan.rooms.map(r => ({ id: r.id, type: r.type, x: r.x, y: r.y, w: r.w, h: r.h, ...(r.door.length ? { door: r.door.map(([x, y]) => [x, y] as Cell) } : {}), items: [] }));
  const shell: Site = {
    w: hospital.w, h: hospital.h, inside, main: [[hospital.entrance[0], hospital.entrance[1]]], ambulance: [], rooms: shellRooms, decor: hospital.decor.map(d => ({ ...d })),
    next: hospital.next, nextItem: 1, ...(doctorRoom(plan) ? { mine: doctorRoom(plan) } : {}),
  };
  // одинарная дверь, где лежат, — двойная: соседняя клетка стены, если дверь туда встаёт
  const rooms = shellRooms.map(room => {
    if (!room.door || room.door.length !== 1 || !rulesOf(db, room.type)?.gurney) return room;
    const [x, y] = room.door[0];
    const along: Cell = sideOf(room, x, y) % 2 === 0 ? [1, 0] : [0, 1];
    for (const k of [1, -1]) {
      const next: Cell = [x + along[0] * k, y + along[1] * k];
      if (checkDoor(db, shell, room.id, [room.door[0], next]).ok) return { ...room, door: [room.door[0], next].sort((a, b) => a[1] - b[1] || a[0] - b[0]) };
    }
    return room;
  });
  const doors: Site = { ...shell, rooms };
  let n = 1;
  const furnished = rooms.map(room => {
    const inst = hospital.rooms.find(r => r.id === room.id)!;
    const t = templateItems(db, doors, room, { size: inst.size, rot: inst.rot, at: [inst.x, inst.y], equipment: inst.equipment, short: true });
    const items: SiteItem[] = (t?.items ?? []).map(d => ({ id: n++, ...d }));
    return { ...room, items };
  });
  return { ...doors, rooms: furnished, nextItem: n };
}
