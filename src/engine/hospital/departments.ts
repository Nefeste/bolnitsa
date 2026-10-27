// Отделение помещения больницы ПК (spec docs/specs/2026-10-departments.md, часть 1; решения владельца #140, #142): отметка
// инструмента «Отделение» в плане больницы, иначе — по тем, кто в помещении работает, иначе — по виду помещения. Только
// поток для ПК: в сменах «Анамнеза» плана больницы нет. Ход смены от отделений помещений не зависит — их показывает окно;
// направление по жалобе (часть 4) — к демо.
import type { ContentDb, Id } from '../../content/types';
import type { Site, SiteRoom } from './site';
import type { StaffMember } from './staff';

/**
 * Отделение помещения: отметка инструмента, иначе — отделение первого по списку персонала, кто в нём работает (кабинет
 * инфекциониста — инфекционное), иначе — по виду помещения. Нет — помещение общее или служба: регистратура, ожидание,
 * диагностика. Без записи отделений (база тестов) отделений нет.
 */
export function deptOf(db: ContentDb, room: SiteRoom, staff: readonly StaffMember[]): Id | undefined {
  return deptWhy(db, room, staff)?.dept;
}

/**
 * Отделение помещения и откуда оно (часть 2: карточка помещения говорит почему): `mark` — отметка инструмента, `staff` —
 * по должности `role` того, кто работает, `type` — по виду помещения.
 */
export function deptWhy(db: ContentDb, room: SiteRoom, staff: readonly StaffMember[]): { dept: Id; by: 'mark' | 'staff' | 'type'; role?: Id } | undefined {
  if (!db.departments) return undefined;
  if (room.dept !== undefined) return { dept: room.dept, by: 'mark' };
  for (const m of staff) {
    if (m.room !== room.id) continue;
    const d = db.roles[m.role]?.department;
    if (d !== undefined) return { dept: d, by: 'staff', role: m.role };
  }
  const d = db.rooms[room.type]?.department;
  return d === undefined ? undefined : { dept: d, by: 'type' };
}

/** Отделения помещений больницы: номер помещения → отделение; общих и служб здесь нет. */
export function deptsOf(db: ContentDb, site: Site, staff: readonly StaffMember[]): Record<string, Id> {
  const out: Record<string, Id> = {};
  for (const r of site.rooms) {
    const d = deptOf(db, r, staff);
    if (d !== undefined) out[r.id] = d;
  }
  return out;
}

/** В какие отделения инструмент «Отделение» переводит палату или кабинет — по порядку записи. */
export const paintsOf = (db: ContentDb): Id[] => Object.values(db.departments ?? {}).filter(d => d.paint).map(d => d.id);

/**
 * Больница изменилась только отметками отделений (часть 2): те же помещения на тех же местах, с теми же дверями и вещами,
 * те же предметы коридора. Окно тогда не пересобирает сцену — только полосы, слой и подписи.
 */
export function onlyDeptsChanged(a: Site, b: Site): boolean {
  if (a === b) return true;
  if (a.rooms.length !== b.rooms.length || a.decor !== b.decor || a.editing !== b.editing || a.mine !== b.mine) return false;
  return a.rooms.every((r, i) => {
    const q = b.rooms[i];
    if (r === q) return true;
    return r.id === q.id && r.type === q.type && r.x === q.x && r.y === q.y && r.w === q.w && r.h === q.h && r.door === q.door && r.items === q.items && r.leaving === q.leaving;
  });
}
