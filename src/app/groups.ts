// Каталог стройки по отделениям (spec docs/specs/2026-10-catalog.md): группа вида помещения — его отделение по записи
// (`department`), иначе служба диагностики — помещение с аппаратом (`needsEquipment`), иначе общие. Так выходит таблица
// геймдизайна §4. Группы — по порядку записи отделений, затем служба и общие; в группе — строки как пришли. Чистые функции
// без DOM — их проверяют тесты (tools/test/groups.test.ts).
import type { ContentDb, Id } from '../content/types';

export type Group = Id | 'service' | 'common';

export function groupOf(db: ContentDb, type: Id): Group {
  const r = db.rooms[type];
  return r?.department ?? (r?.needsEquipment ? 'service' : 'common');
}

/** Порядок групп: отделения по записи, затем служба и общие. */
export const groupOrder = (db: ContentDb): Group[] => [...Object.keys(db.departments ?? {}), 'service', 'common'];

/** Строки каталога по группам: группы по порядку, пустых нет; в группе — порядок строк тот же. */
export function grouped<R extends { id: Id }>(db: ContentDb, rows: readonly R[]): { group: Group; rows: R[] }[] {
  const by = new Map<Group, R[]>();
  for (const r of rows) {
    const g = groupOf(db, r.id);
    const list = by.get(g);
    if (list) list.push(r);
    else by.set(g, [r]);
  }
  const order = groupOrder(db);
  // отделение не из записи (сохранение новее базы) — после записанных, до службы
  const extra = [...by.keys()].filter(g => !order.includes(g));
  return [...order.slice(0, -2), ...extra, ...order.slice(-2)].filter(g => by.has(g)).map(g => ({ group: g, rows: by.get(g)! }));
}
