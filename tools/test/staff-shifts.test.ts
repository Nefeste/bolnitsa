// Смены персонала (spec docs/specs/2026-10-staff-shifts.md, часть 1): дневная 08:00–20:00 и ночная 20:00–08:00; кого
// нет в смене, того нет в больнице; пересменка — событием в 08:00 и 20:00: врач доводит начатые приёмы, новых не зовёт,
// ждущих его — к тем, кто в смене; зарплата за смену, ночная на четверть дороже; готовая больница, где лежат и куда везёт
// скорая, — с ночной сменой, поликлиника — без; люди без смены (сохранения до смен) — круглые сутки, как прежде.
import { describe, expect, test } from 'bun:test';
import { db } from '../../src/content';
import { hospitalOf } from '../../src/engine/hospital/site';
import { siteOfPlan } from '../../src/engine/hospital/site-plan';
import { siteOfPreset } from '../../src/engine/hospital/site-preset';
import { dutyOf, ORDERLY, presetStaff, shiftAt, type StaffMember, wageOf, wagesOf, withNightShift, withOrderlies } from '../../src/engine/hospital/staff';
import { apply, colleaguesOf, hospitalCtx, newFlowShift } from '../../src/engine/shift/engine';
import type { ShiftState } from '../../src/engine/shift/types';
import { buildProto, emptyShift, FLOW, hash, liveTo, site } from './site-kit';

const H = 3600;
const rec = db.presets['preset.city'];
const citySite = siteOfPreset(db, rec);
const cityHospital = hospitalOf(db, citySite);
/** Штат городской, как до смен: без смены — круглые сутки. */
const legacy = presetStaff(db, rec);
/** Штат городской со сменами — как её начинает игра (src/app/game.ts). */
const shifts = withNightShift(db, citySite.rooms, legacy);
const city = (seed: number, staff: StaffMember[] = shifts, economy = false) =>
  newFlowShift(db, { seed, season: 'winter', hospital: cityHospital, staff, flow: FLOW, ...(economy ? { economy: { cash: 1_000_000 } } : {}) });
const roomOf = (type: string) => citySite.rooms.find(r => r.type === type)!.id;
const at = (s: ShiftState, hour: number) => (s.day - 1) * 86400 + hour * H;

describe('смены персонала', () => {
  test('дневная — с 08:00 до 20:00, ночная — остальное; без смены — в обеих', () => {
    expect(db.economy.staff.shifts).toEqual({ day: [8, 20], night: 125 });
    expect(shiftAt(db, 8 * H - 1)).toBe('night');
    expect(shiftAt(db, 8 * H)).toBe('day');
    expect(shiftAt(db, 20 * H - 1)).toBe('day');
    expect(shiftAt(db, 20 * H)).toBe('night');
    expect(shiftAt(db, 86400 + 9 * H)).toBe('day');
    // без людей со сменой «кто в смене» — сам штат: больница та же
    expect(dutyOf(db, legacy, 21 * H)).toBe(legacy);
    const day = dutyOf(db, shifts, 10 * H);
    expect(dutyOf(db, shifts, 11 * H)).toBe(day);
    expect(day.every(m => m.shift === 'day')).toBe(true);
    expect(dutyOf(db, shifts, 21 * H).every(m => m.shift === 'night')).toBe(true);
  });

  test('городская: все — дневная смена; ночная — в помещениях, что работают ночью, и ночной терапевт', () => {
    // и санитары (spec docs/specs/2026-10-orderlies.md): по одному в смотровой приёмного и операционной, в каждую смену
    const day = withOrderlies(db, citySite.rooms, legacy);
    expect(shifts.filter(m => m.shift === 'day').length).toBe(day.length);
    const night = shifts.filter(m => m.shift === 'night');
    const type = (m: StaffMember) => citySite.rooms.find(r => r.id === m.room)!.type;
    for (const m of night) expect(db.rooms[type(m)].night || db.roles[m.role]?.stands === 'role.doctor').toBe(true);
    // копия дневного: та же должность, навык, место; другой человек
    for (const m of night.filter(x => db.rooms[type(x)].night)) expect(day.some(d => d.room === m.room && d.role === m.role && d.skill === m.skill)).toBe(true);
    const posts = citySite.rooms.filter(r => db.rooms[r.type].staff.includes(ORDERLY)).map(r => r.id).sort();
    expect(posts.length).toBeGreaterThan(0);
    for (const shift of ['day', 'night'] as const) expect(shifts.filter(m => m.role === ORDERLY && m.shift === shift).map(m => m.room).sort()).toEqual(posts);
    expect(legacy.some(m => m.role === ORDERLY)).toBe(false);
    expect(night.filter(m => db.roles[m.role]?.stands === 'role.doctor').length).toBe(1);
    // номера — после номеров готовой больницы, не повторяются
    expect(new Set(shifts.map(m => m.id)).size).toBe(shifts.length);
    // в помещениях, что ночью закрыты, — никого ночью
    expect(night.some(m => type(m) === 'room.reception' || type(m) === 'room.triage')).toBe(false);
  });

  test('поликлиника ночью закрыта: ночной смены нет', () => {
    const p = siteOfPlan(db, db.sites!['site.polyclinic']);
    if (!p.ok) throw new Error('поликлиника не строится');
    const staff = withNightShift(db, p.site.rooms, p.staff);
    expect(staff.length).toBe(p.staff.length);
    expect(staff.every(m => m.shift === 'day')).toBe(true);
    expect(wagesOf(db, staff)).toBe(wagesOf(db, p.staff));
  });

  test('зарплата — за смену, ночная на четверть дороже; касса суток — по сменам', () => {
    const nurse = shifts.find(m => m.shift === 'night' && m.role === 'role.nurse')!;
    expect(wageOf(db, nurse)).toBe(Math.round(nurse.salary * 1.25));
    expect(wageOf(db, { ...nurse, shift: 'day' })).toBe(nurse.salary);
    expect(wageOf(db, { ...nurse, shift: undefined })).toBe(nurse.salary);
    const s = city(1, shifts, true);
    liveTo(db, s, 32);
    const paid = s.history[0].economy!.ledger.expenses.salaries;
    expect(Math.abs(paid - wagesOf(db, shifts))).toBeLessThanOrEqual(2);
    expect(wagesOf(db, shifts)).toBeGreaterThan(wagesOf(db, legacy));
  }, 60_000);

  test('ночью без ночной смены помещение не работает, с ней — работает', () => {
    const dayOnly = shifts.filter(m => m.shift === 'day');
    const er = roomOf('room.emergency');
    const a = city(2, dayOnly);
    const b = city(2);
    liveTo(db, a, 10);
    liveTo(db, b, 10);
    expect(hospitalCtx(db, a).working.has(er)).toBe(true);
    liveTo(db, a, 21);
    liveTo(db, b, 21);
    expect(hospitalCtx(db, a).working.has(er)).toBe(false);
    expect(hospitalCtx(db, b).working.has(er)).toBe(true);
    // ночью принимает только ночной терапевт
    expect(colleaguesOf(db, b).map(m => m.shift)).toEqual(['night']);
    expect(colleaguesOf(db, a)).toEqual([]);
    // утром — снова дневная смена
    liveTo(db, a, 33);
    expect(hospitalCtx(db, a).working.has(er)).toBe(true);
  }, 120_000);

  test('пересменка в 20:00: врач доводит начатые приёмы и новых не зовёт; ждущих его — к ночному врачу', () => {
    const s = city(3);
    liveTo(db, s, 20);
    const t20 = at(s, 20);
    const day = new Set(shifts.filter(m => m.shift === 'day').map(m => m.id));
    const night = shifts.find(m => m.shift === 'night' && db.roles[m.role]?.stands === 'role.doctor')!;
    // в очереди нет никого, записанного к ушедшему врачу
    for (const x of s.queue) expect(s.patients[x].doc === undefined || !day.has(s.patients[x].doc!)).toBe(true);
    const started = Object.values(s.patients).filter(p => p.by !== undefined && day.has(p.by) && (p.status === 'inRoom' || p.status === 'away' || p.status === 'waiting'));
    expect(started.length).toBeGreaterThan(0);
    const ids = new Set(started.map(p => p.id));
    // медленный шаг (0.42.0): пожилые и «жёлтые» дольше ходят на обследования, и к 20:00 у дневного врача открыто пять
    // приёмов, а не один; последний он закрывает в 23:10 — смотрим в полночь
    liveTo(db, s, 24);
    // после 20:00 дневные врачи не позвали ни одного нового: кого позвали — позвал ночной
    const called = Object.values(s.patients).filter(p => p.calledT !== undefined && p.calledT >= t20 && p.by !== undefined);
    expect(called.length).toBeGreaterThan(0);
    for (const p of called) expect(p.by).toBe(night.id);
    // начатые приёмы доведены — их вёл тот же врач
    for (const p of Object.values(s.patients)) if (ids.has(p.id)) expect(p.closed !== undefined || p.status === 'admitted' || !day.has(p.by!)).toBe(true);
    for (const id of ids) expect(s.patients[id]?.by === undefined || day.has(s.patients[id].by!)).toBe(true);
  }, 120_000);

  test('люди без смены — круглые сутки, как прежде: пересменок нет', () => {
    const s = city(4, legacy);
    expect(s.events.some(e => e.event.kind === 'duty')).toBe(false);
    liveTo(db, s, 22);
    const ctx = hospitalCtx(db, s);
    expect(ctx.staff).toBe(ctx.all);
    expect(colleaguesOf(db, s).length).toBe(legacy.filter(m => db.roles[m.role]?.stands === 'role.doctor').length);
  }, 60_000);

  test('со сменами — пересменки в 20:00 и 08:00, и так каждые сутки', () => {
    const s = city(5);
    expect(s.events.filter(e => e.event.kind === 'duty').map(e => e.t)).toEqual([20 * H, 32 * H]);
    liveTo(db, s, 33);
    expect(s.events.filter(e => e.event.kind === 'duty').map(e => e.t)).toEqual([44 * H, 56 * H]);
  }, 60_000);

  test('найм на смену: место — на две смены, у каждой свой человек', () => {
    const s = emptyShift(db, 6);
    const ids = buildProto(db, s);
    const lab = ids[5];
    const tech = s.staff!.find(m => m.room === lab)!;
    expect(tech.shift).toBe('day');
    // та же смена — место занято
    expect(site(db, s, { kind: 'hire', room: lab, role: 'role.lab_tech', shift: 'day' }, false)).toMatchObject({ ok: false, error: { kind: 'nothing' } });
    site(db, s, { kind: 'hire', room: lab, role: 'role.lab_tech', shift: 'night' });
    const both = s.staff!.filter(m => m.room === lab);
    expect(both.map(m => m.shift).sort()).toEqual(['day', 'night']);
    expect(site(db, s, { kind: 'hire', room: lab, role: 'role.lab_tech', shift: 'night' }, false)).toMatchObject({ ok: false, error: { kind: 'nothing' } });
    // нанят первый со сменой — пересменки этих суток назначены
    expect(s.events.some(e => e.event.kind === 'duty')).toBe(true);
    // ночью лаборатория работает, приёмная — нет: ночью там никого
    liveTo(db, s, 21);
    const ctx = hospitalCtx(db, s);
    expect(ctx.working.has(lab)).toBe(true);
    expect(ctx.working.has(ids[0])).toBe(false);
  }, 60_000);

  test('человек без смены занимает место в обеих: нанять на ночь туда нельзя', () => {
    const s = city(7, legacy);
    const lab = roomOf('room.lab');
    expect(site(db, s, { kind: 'hire', room: lab, role: 'role.lab_tech', shift: 'night' }, false)).toMatchObject({ ok: false, error: { kind: 'nothing' } });
  });

  test('«Мой кабинет» в кабинете с дневным и ночным врачом: оба — в ваш прежний', () => {
    const s = city(8);
    const night = shifts.find(m => m.shift === 'night' && db.roles[m.role]?.stands === 'role.doctor')!;
    const was = s.hospital!.site!.mine;
    site(db, s, { kind: 'office', room: night.room! });
    const moved = s.staff!.filter(m => m.room === was && db.roles[m.role]?.stands === 'role.doctor');
    expect(moved.map(m => m.shift).sort()).toEqual(['day', 'night']);
  });

  test('пересменка не заводит второго потока: записанные к специалисту и пришедшие сами — по одному на каждого', () => {
    const s = newFlowShift(db, { seed: 10, season: 'winter', hospital: cityHospital, staff: shifts, flow: { perHour: 0, auto: true }, economy: { cash: 1_000_000 } });
    const streams = () => {
      const n = new Map<string, number>();
      for (const e of s.events) if (e.event.kind === 'flow' && e.event.stream !== 'ret') n.set(`${e.event.stream}:${e.event.to ?? ''}`, (n.get(`${e.event.stream}:${e.event.to ?? ''}`) ?? 0) + 1);
      return [...n.values()];
    };
    const booked = shifts.filter(m => m.shift === 'day' && db.roles[m.role]?.profile).length;
    expect(booked).toBeGreaterThan(0);
    for (const h of [10, 21, 33, 45, 57]) {
      liveTo(db, s, h);
      expect(streams().every(k => k === 1)).toBe(true);
    }
    // днём — поток к каждому специалисту, ночью их нет
    liveTo(db, s, 58);
    expect(s.events.filter(e => e.event.kind === 'flow' && e.event.stream === 'book').length).toBeGreaterThan(0);
  }, 120_000);

  test('при шаге 60 и 13 с — то же состояние', () => {
    const a = city(9);
    const b = city(9);
    liveTo(db, a, 23);
    liveTo(db, b, 23, 13);
    expect(hash(b)).toBe(hash(a));
  }, 120_000);
});
