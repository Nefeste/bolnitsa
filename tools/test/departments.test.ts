// Отделения помещений (spec docs/specs/2026-10-departments.md, часть 1; решения владельца #140, #142): по виду помещения, по
// тем, кто в нём работает, и по отметке инструмента «Отделение»; отметка — в плане больницы, в отмене стройки и в
// сохранении; переводят только палату и кабинет; ход смены от отделений не зависит; в «Смене» «Анамнеза» команды нет.
import { describe, expect, test } from 'bun:test';
import { db } from '../../src/content';
import { deptsOf, paintsOf } from '../../src/engine/hospital/departments';
import { hospitalOf } from '../../src/engine/hospital/site';
import { siteOfPreset } from '../../src/engine/hospital/site-preset';
import { presetStaff, withNightShift } from '../../src/engine/hospital/staff';
import { apply, newFlowShift, newSingle } from '../../src/engine/shift/engine';
import { SAVE_SCHEMA } from '../../src/engine/shift/migrate';
import { cashNow, startCash } from '../../src/engine/shift/money';
import type { ShiftState } from '../../src/engine/shift/types';
import { pack, unpack } from '../../src/sim/packing';
import { FLOW, hash, liveTo, site } from './site-kit';

const rec = db.presets['preset.city'];
const citySite = siteOfPreset(db, rec);
/** Готовая городская со сменами и кассой — как её начинает игра: терапевт и три специалиста, стационар, бокс. */
const city = (seed = 1): ShiftState =>
  newFlowShift(db, {
    seed, season: 'winter', hospital: hospitalOf(db, citySite), staff: withNightShift(db, citySite.rooms, presetStaff(db, rec)), flow: FLOW,
    economy: { cash: startCash(db, 'preset') },
  });
const depts = (s: ShiftState) => deptsOf(db, s.hospital!.site!, s.staff ?? []);
const roomsOf = (s: ShiftState, type: string) => s.hospital!.site!.rooms.filter(r => r.type === type).map(r => r.id);
/** Кабинет, где работает инфекционист. */
const infectOffice = (s: ShiftState) => s.hospital!.site!.rooms.find(r => s.staff!.some(m => m.room === r.id && m.role === 'role.infectionist'))!.id;

/** По виду помещения; кабинет — по тем, кто в нём работает. Нет — общее или служба. */
const BY_TYPE: Record<string, string> = {
  'room.office': 'dept.therapy', 'room.ward': 'dept.therapy', 'room.ecg': 'dept.therapy', 'room.emergency': 'dept.emergency',
  'room.triage': 'dept.emergency', 'room.or': 'dept.surgery', 'room.box': 'dept.infectious', 'room.icu': 'dept.icu', 'room.ricu': 'dept.icu',
};

describe('отделения помещений', () => {
  test('запись: шесть отделений таблицы §4, травму берёт хирургия; инструмент переводит в четыре, и только палату и кабинет', () => {
    expect(Object.keys(db.departments!)).toEqual(['dept.emergency', 'dept.therapy', 'dept.surgery', 'dept.neurology', 'dept.infectious', 'dept.icu']);
    expect(paintsOf(db)).toEqual(['dept.therapy', 'dept.surgery', 'dept.neurology', 'dept.infectious']);
    expect(Object.values(db.departments!).filter(d => d.takes).map(d => [d.id, d.takes])).toEqual([['dept.surgery', ['dept.trauma']]]);
    // у каждой болезни отделение — из записи или то, которое берёт хирургия
    const taken = new Set(Object.values(db.departments!).flatMap(d => d.takes ?? []));
    for (const c of Object.values(db.conditions)) expect([c.id, db.departments![c.department] !== undefined || taken.has(c.department)]).toEqual([c.id, true]);
    expect(Object.values(db.conditions).some(c => c.department === 'dept.trauma')).toBe(true);
    expect(Object.values(db.rooms).filter(r => r.paint).map(r => r.id).sort()).toEqual(['room.office', 'room.ward']);
    expect(Object.fromEntries(Object.values(db.rooms).filter(r => r.department).map(r => [r.id, r.department]))).toEqual(BY_TYPE);
    // кабинет специалиста — в отделении его болезней
    expect(Object.fromEntries(Object.values(db.roles).filter(r => r.department).map(r => [r.id, r.department]))).toEqual({
      'role.endocrinologist': 'dept.therapy', 'role.gastroenterologist': 'dept.therapy', 'role.infectionist': 'dept.infectious',
      'role.surgeon': 'dept.surgery', 'role.therapist': 'dept.therapy',
    });
  });

  test('готовая городская: по виду помещения, кабинет инфекциониста — инфекционное; у регистратуры, ожидания и диагностики отделения нет', () => {
    const s = city();
    const got = depts(s);
    const infect = infectOffice(s);
    for (const r of s.hospital!.site!.rooms) expect([r.id, r.type, got[r.id]]).toEqual([r.id, r.type, r.id === infect ? 'dept.infectious' : BY_TYPE[r.type]]);
    const none = new Set(s.hospital!.site!.rooms.filter(r => got[r.id] === undefined).map(r => r.type));
    for (const type of ['room.reception', 'room.waiting', 'room.lab', 'room.xray']) expect([type, none.has(type)]).toEqual([type, true]);
    // уволили инфекциониста — кабинет снова по виду, терапия
    const m = s.staff!.find(x => x.role === 'role.infectionist')!;
    site(db, s, { kind: 'dismiss', id: m.id });
    expect(depts(s)[infect]).toBe('dept.therapy');
  });

  test('инструмент «Отделение»: палата — в хирургию бесплатно, отмена возвращает; отметка сильнее того, кто работает, снятая — нет', () => {
    const s = city();
    const ward = roomsOf(s, 'room.ward')[0];
    const cash = cashNow(s);
    const n = site(db, s, { kind: 'dept', room: ward, dept: 'dept.surgery' });
    expect([n.cost, n.room]).toEqual([0, ward]);
    expect(cashNow(s)).toBe(cash);
    expect(s.hospital!.site!.rooms.find(r => r.id === ward)!.dept).toBe('dept.surgery');
    expect(depts(s)[ward]).toBe('dept.surgery');
    // другие палаты — как были
    for (const id of roomsOf(s, 'room.ward').slice(1)) expect(depts(s)[id]).toBe('dept.therapy');
    site(db, s, { kind: 'undo' });
    expect(depts(s)[ward]).toBe('dept.therapy');
    expect(s.hospital!.site!.rooms.find(r => r.id === ward)!.dept).toBeUndefined();
    // кабинет инфекциониста: отметка — терапия; сняли — снова по нему
    const office = infectOffice(s);
    site(db, s, { kind: 'dept', room: office, dept: 'dept.therapy' });
    expect(depts(s)[office]).toBe('dept.therapy');
    site(db, s, { kind: 'dept', room: office });
    expect(depts(s)[office]).toBe('dept.infectious');
    expect('dept' in s.hospital!.site!.rooms.find(r => r.id === office)!).toBe(false);
  });

  test('отметка и её отмена не закрывают помещение на перестройку: перестраивается то же, что до них', () => {
    const s = city();
    const ward = roomsOf(s, 'room.ward')[0];
    site(db, s, { kind: 'dept', room: ward, dept: 'dept.surgery' });
    expect(s.hospital!.site!.editing).toBeUndefined();
    site(db, s, { kind: 'undo' });
    expect(s.hospital!.site!.editing).toBeUndefined();
    // перестраивают другое помещение (убрали растение) — отметка и отмена его не трогают
    const r = s.hospital!.site!.rooms.find(x => x.id !== ward && x.items.some(i => i.kind === 'plant'))!;
    site(db, s, { kind: 'remove', room: r.id, id: r.items.find(i => i.kind === 'plant')!.id });
    expect(s.hospital!.site!.editing).toBe(r.id);
    site(db, s, { kind: 'dept', room: ward, dept: 'dept.surgery' });
    site(db, s, { kind: 'undo' });
    expect([s.hospital!.site!.editing, depts(s)[ward]]).toEqual([r.id, 'dept.therapy']);
    // отмена самой перестройки — как раньше: помещение снова перестраивается
    site(db, s, { kind: 'undo' });
    expect(s.hospital!.site!.editing).toBe(r.id);
  });

  test('куда нельзя: смотровая приёмного и операционная — по виду, реанимация и чужое — не из тех, куда переводят; та же отметка — ничего', () => {
    const s = city();
    const ward = roomsOf(s, 'room.ward')[0];
    const undo = s.works?.undo.length ?? 0;
    const error = (room: string, dept?: string) => site(db, s, { kind: 'dept', room, ...(dept ? { dept } : {}) }, false).error;
    expect(error(roomsOf(s, 'room.emergency')[0], 'dept.surgery')).toEqual({ kind: 'notHere' });
    expect(error(roomsOf(s, 'room.or')[0], 'dept.neurology')).toEqual({ kind: 'notHere' });
    expect(error(ward, 'dept.icu')).toEqual({ kind: 'unknown' });
    expect(error(ward, 'dept.cardiology')).toEqual({ kind: 'unknown' });
    expect(error('r999', 'dept.surgery')).toEqual({ kind: 'unknown' });
    // снять нечего
    expect(error(ward)).toEqual({ kind: 'nothing' });
    expect(s.works?.undo.length ?? 0).toBe(undo);
    // травма — отделение болезней, не помещений: её больных берёт хирургия
    expect(error(ward, 'dept.trauma')).toEqual({ kind: 'unknown' });
    site(db, s, { kind: 'dept', room: ward, dept: 'dept.neurology' });
    expect(error(ward, 'dept.neurology')).toEqual({ kind: 'nothing' });
    expect(s.works!.undo.length).toBe(undo + 1);
    // «Смена» «Анамнеза»: плана больницы ПК нет — ничего не меняется
    const a = newSingle(db, { seed: 1, season: 'winter', venue: 'preset.city' });
    const h = a.hospital;
    expect(apply(db, a, { kind: 'site', cmd: { kind: 'dept', room: 'r1', dept: 'dept.surgery' } })).toEqual([{ kind: 'site', cmd: 'dept', ok: false, error: { kind: 'mode' } }]);
    expect(a.hospital).toBe(h);
  });

  test('ход смены от отделений не зависит: тот же день с палатами хирургии и без; отметка — в сохранении', async () => {
    const day = (marks: boolean) => {
      const s = city(2);
      if (marks) for (const id of roomsOf(s, 'room.ward')) site(db, s, { kind: 'dept', room: id, dept: 'dept.surgery' });
      liveTo(db, s, 16);
      return s;
    };
    const plain = day(false);
    const marked = day(true);
    const flow = (s: ShiftState) => hash({ summary: s.summary, patients: s.patients, past: s.past, queue: s.queue, economy: s.economy });
    expect(flow(marked)).toBe(flow(plain));
    expect(roomsOf(marked, 'room.ward').map(id => depts(marked)[id])).toEqual(roomsOf(marked, 'room.ward').map(() => 'dept.surgery'));
    // сохранили и загрузили — отметки те же
    const meta = { kind: 'manual' as const, savedAt: '2026-10-26T12:00:00Z', version: 'test', start: 'preset', day: marked.day, t: marked.t };
    const back = await unpack(await pack({ schema: SAVE_SCHEMA, meta, state: marked }));
    expect(deptsOf(db, back.state.hospital!.site!, back.state.staff!)).toEqual(depts(marked));
  }, 120_000);
});
