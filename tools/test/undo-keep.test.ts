// Отмена стройки и перестройка (spec docs/specs/2026-10-build.md, «Снос и отмена»): отмена действия, которое помещение
// перестраивало, снова открывает его перестройку, как раньше. Отмена найма, увольнения, зарплаты, смены, резерва, «Моего
// кабинета», скамьи в коридоре и отметки отделения (`WorksStep.keep`) оставляет перестройку, какая есть: помещение, в котором
// наняли или уволили, не закрывается, а то, что перестраивают, не открывается.
import { describe, expect, test } from 'bun:test';
import { db } from '../../src/content';
import { DOCTOR } from '../../src/engine/hospital/requirements';
import { hospitalOf } from '../../src/engine/hospital/site';
import { siteOfPreset } from '../../src/engine/hospital/site-preset';
import { presetStaff, withNightShift } from '../../src/engine/hospital/staff';
import { newFlowShift } from '../../src/engine/shift/engine';
import { startCash } from '../../src/engine/shift/money';
import type { ShiftState } from '../../src/engine/shift/types';
import { FLOW, site } from './site-kit';

const rec = db.presets['preset.city'];
const citySite = siteOfPreset(db, rec);
const city = (): ShiftState =>
  newFlowShift(db, {
    seed: 1, season: 'winter', hospital: hospitalOf(db, citySite), staff: withNightShift(db, citySite.rooms, presetStaff(db, rec)), flow: FLOW,
    economy: { cash: startCash(db, 'preset') },
  });
const editing = (s: ShiftState) => s.hospital!.site!.editing;
/** Перестройка помещения: убрали растение — оно перестраивается. */
const rebuild = (s: ShiftState): string => {
  const r = s.hospital!.site!.rooms.find(x => x.items.some(i => i.kind === 'plant'))!;
  site(db, s, { kind: 'remove', room: r.id, id: r.items.find(i => i.kind === 'plant')!.id });
  expect(editing(s)).toBe(r.id);
  return r.id;
};
/** Первый из штата, с кем действие вышло. */
const first = (s: ShiftState, act: (id: string) => boolean) => s.staff!.find(m => act(m.id))!;

describe('отмена и перестройка', () => {
  test('увольнение и найм: отмена не закрывает помещение, где уволили или наняли', () => {
    const s = city();
    const m = first(s, id => site(db, s, { kind: 'dismiss', id }, false).ok);
    expect(editing(s)).toBeUndefined();
    site(db, s, { kind: 'undo' });
    expect([s.staff!.some(x => x.id === m.id), editing(s)]).toEqual([true, undefined]);
    // ночная смена кабинета пуста — нанять туда врача и отменить
    const office = s.hospital!.site!.rooms.find(r => r.type === 'room.office' && r.id !== s.hospital!.site!.mine && !s.staff!.some(x => x.room === r.id && x.shift === 'night'))!;
    site(db, s, { kind: 'hire', room: office.id, role: DOCTOR, shift: 'night' });
    expect(editing(s)).toBeUndefined();
    site(db, s, { kind: 'undo' });
    expect([s.staff!.some(x => x.room === office.id && x.shift === 'night'), editing(s)]).toEqual([false, undefined]);
  });

  test('зарплата, смена, резерв, «Мой кабинет», скамья, отметка отделения: отмена не трогает перестройку другого помещения', () => {
    const s = city();
    const room = rebuild(s);
    const acts: [string, () => boolean][] = [
      ['raise', () => !!first(s, id => site(db, s, { kind: 'raise', id }, false).ok)],
      ['reshift', () => !!first(s, id => site(db, s, { kind: 'reshift', id }, false).ok)],
      ['reserve', () => site(db, s, { kind: 'reserve', role: 'role.nurse' }, false).ok],
      // ваш кабинет — другой кабинет врача, не тот, что уже ваш
      ['office', () => site(db, s, { kind: 'office', room: s.hospital!.site!.rooms.find(r => r.type === 'room.office' && r.id !== s.hospital!.site!.mine)!.id }, false).ok],
      // скамья у двери эндокринолога (spec docs/specs/2026-10-door-benches.md): убрать и поставить
      ['undecor', () => site(db, s, { kind: 'undecor', x: 45, y: 7 }, false).ok],
      ['dept', () => site(db, s, { kind: 'dept', room: s.hospital!.site!.rooms.find(r => r.type === 'room.ward')!.id, dept: 'dept.surgery' }, false).ok],
    ];
    for (const [kind, act] of acts) {
      expect([kind, act()]).toEqual([kind, true]);
      expect([kind, editing(s)]).toEqual([kind, room]);
      expect([kind, site(db, s, { kind: 'undo' }, false).ok]).toEqual([kind, true]);
      expect([kind, editing(s)]).toEqual([kind, room]);
    }
  });

  test('отмена перестройки — помещение снова перестраивается, как раньше', () => {
    const s = city();
    const room = rebuild(s);
    site(db, s, { kind: 'done' });
    expect(editing(s)).toBeUndefined();
    site(db, s, { kind: 'undo' });
    expect(editing(s)).toBe(room);
  });
});
