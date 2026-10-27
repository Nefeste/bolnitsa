// Каталог стройки по отделениям (spec docs/specs/2026-10-catalog.md): каждый вид помещения — ровно в одной группе; группы
// — по порядку записи отделений, затем служба диагностики и общие; служба и общие — как в таблице геймдизайна §4.
import { describe, expect, test } from 'bun:test';
import { groupOf, grouped, groupOrder } from '../../src/app/groups';
import { db } from '../../src/content';

/** Таблица геймдизайна §4: помещения службы и общие. */
const SERVICE = ['room.ct', 'room.endoscopy', 'room.lab', 'room.mri', 'room.ultrasound', 'room.xray'];
const COMMON = ['room.procedure', 'room.reception', 'room.staff', 'room.toilet', 'room.waiting'];

describe('каталог стройки по отделениям', () => {
  test('группы: отделения по записи, затем служба и общие', () => {
    expect(groupOrder(db)).toEqual([...Object.keys(db.departments!), 'service', 'common']);
  });

  test('вид помещения — в отделении по записи, иначе служба (аппарат), иначе общие — как в таблице §4', () => {
    const types = Object.keys(db.rooms).sort();
    const by = (g: string) => types.filter(t => groupOf(db, t) === g);
    expect(by('service')).toEqual(SERVICE);
    expect(by('common')).toEqual(COMMON);
    for (const t of types) expect([t, groupOf(db, t)]).toEqual([t, db.rooms[t].department ?? (SERVICE.includes(t) ? 'service' : 'common')]);
  });

  test('строки по группам: каждая — ровно в одной, группы по порядку, пустых нет, порядок строк в группе тот же', () => {
    const rows = Object.keys(db.rooms).sort().map(id => ({ id }));
    const groups = grouped(db, rows);
    expect(groups.flatMap(g => g.rows.map(r => r.id)).sort()).toEqual(rows.map(r => r.id));
    const order = groupOrder(db);
    expect(groups.map(g => order.indexOf(g.group))).toEqual([...groups.map(g => order.indexOf(g.group))].sort((a, b) => a - b));
    for (const g of groups) {
      expect(g.rows.length).toBeGreaterThan(0);
      expect(g.rows.map(r => r.id)).toEqual([...g.rows.map(r => r.id)].sort());
    }
    // у неврологии своих видов нет — её группы нет
    expect(groups.some(g => g.group === 'dept.neurology')).toBe(false);
    // каталог сценария — только его помещения, и группы только с ними
    expect(grouped(db, [{ id: 'room.reception' }, { id: 'room.office' }, { id: 'room.waiting' }]).map(g => [g.group, g.rows.map(r => r.id)])).toEqual([
      ['dept.therapy', ['room.office']],
      ['common', ['room.reception', 'room.waiting']],
    ]);
  });
});
