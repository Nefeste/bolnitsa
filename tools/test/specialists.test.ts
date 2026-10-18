// Специалисты в потоке (spec docs/specs/2026-10-specialists.md): у каждого работающего специалиста своя запись — записанный
// болен болезнью его профиля, его ведёт специалист, терапевт его не берёт; уволили — записи нет; инфекционист без бокса —
// без записи; наняли днём — запись с этой минуты; без потока от больницы записи нет; найм с должностью.
import { describe, expect, test } from 'bun:test';
import { db } from '../../src/content';
import type { Id, RoomSizeId, Rot } from '../../src/content/types';
import { emptySite, hospitalOf } from '../../src/engine/hospital/site';
import { siteOfPreset } from '../../src/engine/hospital/site-preset';
import { presetStaff } from '../../src/engine/hospital/staff';
import { apply, capacityOf, newFlowShift } from '../../src/engine/shift/engine';
import { startCash } from '../../src/engine/shift/money';
import type { Flow, ShiftState } from '../../src/engine/shift/types';
import { hash, site } from './site-kit';

const AUTO: Flow = { perHour: 0, auto: true };
const rec = db.presets['preset.city'];
const SPECIALISTS = ['role.gastroenterologist', 'role.endocrinologist', 'role.infectionist'];
/** Городская больница: терапевт и три специалиста, стационар, бокс. */
const city = (seed = 1, flow: Flow = AUTO) =>
  newFlowShift(db, { seed, season: 'winter', hospital: hospitalOf(db, siteOfPreset(db, rec)), staff: presetStaff(db, rec), flow, economy: { cash: startCash(db, 'preset') } });
/** Пустое здание с кассой, поток от больницы. */
const empty = (seed = 1) => newFlowShift(db, { seed, season: 'winter', hospital: hospitalOf(db, emptySite()), staff: [], flow: AUTO, economy: { cash: startCash(db, 'empty') } });
const READY = (type: Id, size: RoomSizeId, x: number, y: number, staff = true) => ({ kind: 'ready' as const, type, size, x, y, rot: 0 as Rot, staff });

interface Seen { to: string; truth: Id; by?: string }
/** Прожить до игровой секунды `end` шагом до 10 минут и запомнить каждого записанного: к кому, чем болен, кто его вёл. */
function liveUntil(s: ShiftState, end: number, seen: Map<string, Seen>): Map<string, Seen> {
  while (s.t < end) {
    apply(db, s, { kind: 'advance', seconds: Math.min(600, end - s.t) });
    for (const p of Object.values(s.patients)) {
      if (p.kind !== 'appointment') continue;
      const was = seen.get(p.id);
      seen.set(p.id, { to: p.to!, truth: p.patient.truth.conditions[0].id, ...((p.by ?? was?.by) ? { by: p.by ?? was?.by } : {}) });
    }
  }
  return seen;
}
/** До часа `hour` этих суток. */
const live = (s: ShiftState, hour: number, seen = new Map<string, Seen>()) => liveUntil(s, (s.day - 1) * 86400 + hour * 3600, seen);
/** Уволить, когда врач освободится: занятого не увольняют. */
function dismiss(s: ShiftState, id: string, seen: Map<string, Seen>) {
  for (let i = 0; i < 180; i++) {
    if (site(db, s, { kind: 'dismiss', id }, false).ok) return;
    liveUntil(s, s.t + 60, seen);
  }
  throw new Error(`${id} так и не освободился`);
}
const roleOf = (s: ShiftState, id: string | undefined) => s.staff?.find(m => m.id === id)?.role;

describe('запись к специалисту', () => {
  test('у каждого специалиста городской своя запись: болезнь — из его профиля, ведёт — он, терапевт их не берёт', () => {
    const s = city(1);
    expect(capacityOf(db, s).booked.map(id => roleOf(s, id)).sort()).toEqual([...SPECIALISTS].sort());
    const seen = live(s, 20);
    const by = new Map<Id, number>();
    for (const [id, x] of seen) {
      const role = roleOf(s, x.to)!;
      expect(`${id}: ${role}`).toBe(`${id}: ${SPECIALISTS.find(r => r === role)}`);
      expect(db.roles[role].profile).toContain(x.truth);
      // ведёт тот, к кому записан: терапевт записанных не берёт, пока специалист принимает
      if (x.by !== undefined) expect(`${id}: ${x.by}`).toBe(`${id}: ${x.to}`);
      by.set(role, (by.get(role) ?? 0) + 1);
    }
    // за день к каждому записались, и пришедших сами от этого не меньше: у терапевта — свои
    for (const role of SPECIALISTS) expect(by.get(role) ?? 0).toBeGreaterThan(8);
    expect(Object.values(s.summary.colleagues ?? {}).length).toBe(4);
  }, 120_000);

  test('без потока от больницы записи нет: авто-бенч и снимки идут на числах', () => {
    const s = city(1, { perHour: 6, ambulancePerHour: 1 });
    expect(live(s, 14).size).toBe(0);
  }, 120_000);

  test('уволили специалиста — к нему больше не записываются, и наутро тоже', () => {
    const s = city(2);
    const gastro = s.staff!.find(m => m.role === 'role.gastroenterologist')!.id;
    // днём он занят своими записанными — занятого не увольняют; вечером, когда приём кончился, — можно
    const seen = live(s, 22);
    dismiss(s, gastro, seen);
    const arrived = [...seen.keys()].filter(id => seen.get(id)!.to === gastro);
    expect(arrived.length).toBeGreaterThan(8);
    expect(capacityOf(db, s).booked).not.toContain(gastro);
    expect(s.events.some(e => e.event.kind === 'flow' && e.event.stream === 'book' && e.event.to === gastro)).toBe(false);
    liveUntil(s, (s.day - 1) * 86400 + 86400 + 20 * 3600, seen);
    expect([...seen.keys()].filter(id => seen.get(id)!.to === gastro).sort()).toEqual(arrived.sort());
    // другие специалисты наутро принимают своих
    expect([...seen.values()].filter(x => roleOf(s, x.to) === 'role.endocrinologist').length).toBeGreaterThan(arrived.length);
  }, 120_000);

  test('свой кабинет: инфекционист без бокса — без записи; гастроэнтеролог, нанятый днём, — с этой минуты', () => {
    const s = empty(3);
    // стены соседей общие: следующее начинается на последней клетке прежнего
    for (const r of [READY('room.reception', 'S', 6, 6), READY('room.waiting', 'M', 11, 6), READY('room.staff', 'M', 19, 6), READY('room.office', 'M', 27, 6)]) site(db, s, r);
    const a = site(db, s, READY('room.office', 'M', 34, 6, false)).room!;
    const b = site(db, s, READY('room.office', 'M', 41, 6, false)).room!;
    site(db, s, { kind: 'done' });
    // инфекционист: больных инфекционного отделения больница без бокса не принимает — записи нет
    site(db, s, { kind: 'hire', room: a, role: 'role.doctor', as: 'role.infectionist' });
    const infect = s.staff!.find(m => m.role === 'role.infectionist')!;
    expect(infect.room).toBe(a);
    expect(capacityOf(db, s).booked).toEqual([]);
    const seen = live(s, 11);
    expect(seen.size).toBe(0);
    // днём — гастроэнтеролог: запись к нему с этой минуты
    site(db, s, { kind: 'hire', room: b, role: 'role.doctor', as: 'role.gastroenterologist' });
    const gastro = s.staff!.find(m => m.role === 'role.gastroenterologist')!;
    expect(capacityOf(db, s).booked).toEqual([gastro.id]);
    expect(s.events.some(e => e.event.kind === 'flow' && e.event.stream === 'book' && e.event.to === gastro.id)).toBe(true);
    live(s, 18, seen);
    const to = [...seen.values()].map(x => roleOf(s, x.to));
    expect(to.length).toBeGreaterThan(5);
    expect(new Set(to)).toEqual(new Set(['role.gastroenterologist']));
  }, 120_000);

  test('найм с должностью: на место врача — терапевт или специалист; другая должность — нельзя', () => {
    const s = empty(4);
    const office = site(db, s, READY('room.office', 'M', 27, 6, false)).room!;
    const no = site(db, s, { kind: 'hire', room: office, role: 'role.doctor', as: 'role.nurse' }, false);
    expect(no.ok ? 'ok' : no.error?.kind).toBe('notHere');
    site(db, s, { kind: 'hire', room: office, role: 'role.doctor', as: 'role.endocrinologist' });
    expect(s.staff!.map(m => [m.role, m.room])).toEqual([['role.endocrinologist', office]]);
    // место занято — сначала «Уволить»
    const twice = site(db, s, { kind: 'hire', room: office, role: 'role.doctor', as: 'role.therapist' }, false);
    expect(twice.ok ? 'ok' : twice.error?.kind).toBe('nothing');
    // уволенный уходит из больницы; без `as` — терапевт, как прежде
    site(db, s, { kind: 'dismiss', id: s.staff![0].id });
    site(db, s, { kind: 'hire', room: office, role: 'role.doctor' });
    expect(s.staff!.filter(m => m.room === office).map(m => m.role)).toEqual(['role.therapist']);
  });

  test('детерминизм: то же зерно — те же записанные', () => {
    const run = () => [...live(city(5), 13).entries()];
    expect(hash(run())).toBe(hash(run()));
  }, 120_000);
});
