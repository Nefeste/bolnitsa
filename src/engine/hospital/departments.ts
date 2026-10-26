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
  if (!db.departments) return undefined;
  if (room.dept !== undefined) return room.dept;
  for (const m of staff) {
    if (m.room !== room.id) continue;
    const d = db.roles[m.role]?.department;
    if (d !== undefined) return d;
  }
  return db.rooms[room.type]?.department;
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
