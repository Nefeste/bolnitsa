// Техники и поломки в работе (spec docs/specs/2026-11-technicians.md, часть 1): поломка — в свою минуту, а не с утра; без техника
// сломанное чинит сервис к утру за 2 % цены; техник чинит за минуты своего навыка за 1 % и сбрасывает износ; в свободное время
// обходит аппараты; износ поднимает шанс поломки; без смен — поломки с утра на сутки, как прежде.
import { describe, expect, test } from 'bun:test';
import { db } from '../../src/content';
import { hospitalOf } from '../../src/engine/hospital/site';
import { siteOfPlan } from '../../src/engine/hospital/site-plan';
import { siteOfPreset } from '../../src/engine/hospital/site-preset';
import { presetStaff, withNightShift } from '../../src/engine/hospital/staff';
import { apply, breakAt, brokenOf, hospitalCtx, newFlowShift } from '../../src/engine/shift/engine';
import { devicesOf, repairMinutes, repairOf, TECHNICIAN, wearPct } from '../../src/engine/shift/repair';
import type { ShiftState } from '../../src/engine/shift/types';
import { repairsView } from '../../src/sim/repairs';

const H = 3600;
const rec = db.presets['preset.city'];
const r = db.economy.staff.repair!;

function city(shifts = true): ShiftState {
  const site = siteOfPreset(db, rec);
  const staff = shifts ? withNightShift(db, site.rooms, presetStaff(db, rec)) : presetStaff(db, rec);
  const s = newFlowShift(db, { seed: 7, season: 'winter', hospital: hospitalOf(db, site), staff, flow: { perHour: 0, auto: true }, economy: { cash: 5_000_000 } });
  return s;
}

function run(s: ShiftState, until: number) {
  while (s.t < until) apply(db, s, { kind: 'advance', seconds: Math.min(300, until - s.t) });
}

/** Рентгеновский аппарат городской больницы — «помещение:место». */
const xrayOf = (s: ShiftState) => devicesOf(db, hospitalCtx(db, s).plan).find(d => d.eq.id.startsWith('eq.xray'))!;

describe('износ и шанс', () => {
  test('шанс растёт на 100 % за `wear` суток без обслуживания, до `max`', () => {
    expect([wearPct(r, 0), wearPct(r, r.wear), wearPct(r, 2 * r.wear), wearPct(r, 10 * r.wear)]).toEqual([100, 200, 300, 300]);
    expect(repairMinutes(r, 1)).toBe(r.minutes[0]);
    expect(repairMinutes(r, 5)).toBe(r.minutes[4]);
  });
});

describe('поломка в работе без техника', () => {
  test('встаёт в свою минуту, а не с утра; стоит до утра; сервис — 2 % цены в итогах суток', () => {
    const s = city();
    apply(db, s, { kind: 'site', cmd: { kind: 'done' } });
    expect(repairOf(db, s)).toBeDefined();
    const x = xrayOf(s);
    breakAt(db, s, x.key, 10 * H);
    run(s, 10 * H - 60);
    expect(brokenOf(s).has(x.key)).toBe(false);
    run(s, 10 * H + 60);
    expect(brokenOf(s).has(x.key)).toBe(true);
    run(s, 32 * H - 60);
    expect(brokenOf(s).has(x.key)).toBe(true);
    run(s, 32 * H + 60);
    expect(brokenOf(s).has(x.key)).toBe(false);
    expect(s.history[0].economy!.ledger.expenses.repairs ?? 0).toBeGreaterThanOrEqual(Math.round((x.eq.price * 2) / 100));
  });

  test('без смен — поломки с утра на сутки, как прежде: износа нет', () => {
    const s = city(false);
    apply(db, s, { kind: 'site', cmd: { kind: 'done' } });
    expect(repairOf(db, s)).toBeUndefined();
    run(s, 33 * H);
    expect(s.wear).toBeUndefined();
  });
});

describe('техник', () => {
  const s = city();
  const staffRoom = s.hospital!.site!.rooms.find(x => x.type === 'room.staff')!.id;
  const hired = apply(db, s, { kind: 'site', cmd: { kind: 'hire', room: staffRoom, role: TECHNICIAN, shift: 'day' } });
  apply(db, s, { kind: 'site', cmd: { kind: 'done' } });
  const tech = s.staff!.find(m => m.role === TECHNICIAN)!;
  const x = xrayOf(s);

  test('нанимается на место в ординаторской; в готовых больницах его нет — выбор игрока', () => {
    expect(hired.some(n => n.kind === 'site' && n.ok)).toBe(true);
    expect(tech.room).toBe(staffRoom);
    for (const id of Object.keys(db.sites ?? {})) {
      const p = siteOfPlan(db, db.sites![id]);
      expect(p.ok && p.staff.some(m => m.role === TECHNICIAN)).toBe(false);
    }
    expect(presetStaff(db, rec).some(m => m.role === TECHNICIAN)).toBe(false);
  });

  test('сломалось — идёт и чинит за минуты своего навыка; детали — 1 % цены; износ — с нуля', () => {
    breakAt(db, s, x.key, 10 * H);
    run(s, 10 * H + 1);
    const f = s.fixing?.[x.key];
    expect(f).toEqual({ by: tech.id, kind: 'repair', since: 10 * H, reach: expect.any(Number), done: expect.any(Number) });
    expect(f!.done - 10 * H).toBeGreaterThanOrEqual(repairMinutes(r, tech.skill) * 60);
    const before = s.economy!.ledger?.expenses.repairs ?? 0;
    run(s, f!.done + 1);
    expect(brokenOf(s).has(x.key)).toBe(false);
    expect(s.wear?.[x.key]).toBe(0);
    expect((s.economy!.ledger?.expenses.repairs ?? 0) - before).toBe(Math.round((x.eq.price * r.parts) / 100));
  });

  test('в свободное время обходит аппараты: ко второму вечеру износ у всех — с нуля', () => {
    run(s, 32 * H + 1);
    const devices = devicesOf(db, hospitalCtx(db, s).plan);
    expect(devices.every(d => (s.wear?.[d.key] ?? 0) >= 1)).toBe(true);
    run(s, 44 * H);
    const fresh = devices.filter(d => (s.wear?.[d.key] ?? 0) === 0).length;
    expect(fresh).toBeGreaterThanOrEqual(devices.length - 1);
  });
});

describe('для окна (часть 2)', () => {
  test('час поломки, путь техника и счёт суток: сломалось, починил техник, ждало сервиса', () => {
    const s = city();
    const staffRoom = s.hospital!.site!.rooms.find(x => x.type === 'room.staff')!.id;
    apply(db, s, { kind: 'site', cmd: { kind: 'hire', room: staffRoom, role: TECHNICIAN, shift: 'day' } });
    apply(db, s, { kind: 'site', cmd: { kind: 'done' } });
    const tech = s.staff!.find(m => m.role === TECHNICIAN)!;
    const devices = devicesOf(db, hospitalCtx(db, s).plan);
    const x = xrayOf(s);
    const other = devices.find(d => d.key !== x.key && d.room !== x.room)!;
    breakAt(db, s, x.key, 10 * H);
    breakAt(db, s, other.key, 10 * H + 60);
    run(s, 10 * H + 120);
    expect(s.brokeAt).toEqual({ [x.key]: 10 * H, [other.key]: 10 * H + 60 });
    const f = s.fixing![x.key];
    expect(f.by).toBe(tech.id);
    expect(f.since).toBe(10 * H);
    expect(f.reach! >= f.since! && f.reach! < f.done).toBe(true);
    // вид для окна: сломан с часа, техник у первого, второй ждёт
    const v = repairsView(db, s)!;
    expect(v.find(d => d.key === x.key)).toMatchObject({ broken: { since: 10 * H }, job: { by: tech.id, kind: 'repair', since: 10 * H, reach: f.reach, done: f.done } });
    expect(v.find(d => d.key === other.key)).toMatchObject({ broken: { since: 10 * H + 60 } });
    // техник чинит первый, потом второй — если успеет до утра; что не успел — сервис к утру
    run(s, 32 * H + 1);
    const day = s.history[0].repairs!;
    expect(day.broke).toBe(2);
    expect(day.tech + day.service).toBe(2);
    expect(day.tech).toBeGreaterThanOrEqual(1);
    expect(s.brokeAt?.[x.key]).toBeUndefined();
  });

  test('без поломок в работе (без смен) окну аппаратов не шлют', () => {
    const s = city(false);
    apply(db, s, { kind: 'site', cmd: { kind: 'done' } });
    expect(repairsView(db, s)).toBeUndefined();
  });
});

describe('техник занят', () => {
  test('посреди ремонта уволить и отправить учиться нельзя; на обходе уволить можно — обход брошен', () => {
    const s = city();
    const staffRoom = s.hospital!.site!.rooms.find(x => x.type === 'room.staff')!.id;
    apply(db, s, { kind: 'site', cmd: { kind: 'hire', room: staffRoom, role: TECHNICIAN, shift: 'day' } });
    apply(db, s, { kind: 'site', cmd: { kind: 'done' } });
    const tech = s.staff!.find(m => m.role === TECHNICIAN)!;
    const x = xrayOf(s);
    breakAt(db, s, x.key, 10 * H);
    run(s, 10 * H + 1);
    expect(s.fixing?.[x.key]?.kind).toBe('repair');
    const busy = (n: ReturnType<typeof apply>) => n.some(x => x.kind === 'site' && !x.ok && x.error?.kind === 'busy');
    expect(busy(apply(db, s, { kind: 'site', cmd: { kind: 'dismiss', id: tech.id } }))).toBe(true);
    expect(busy(apply(db, s, { kind: 'site', cmd: { kind: 'study', id: tech.id } }))).toBe(true);
    // второе утро: износ у всех — сутки, техник — в обходе
    run(s, 32 * H + 1);
    const job = Object.entries(s.fixing ?? {}).find(([, f]) => f.by === tech.id);
    expect(job?.[1].kind).toBe('maintain');
    const fired = apply(db, s, { kind: 'site', cmd: { kind: 'dismiss', id: tech.id } });
    expect(fired.some(n => n.kind === 'site' && n.ok)).toBe(true);
    expect(s.fixing?.[job![0]]).toBeUndefined();
    run(s, 34 * H);
    expect(s.wear?.[job![0]]).toBeGreaterThanOrEqual(1);
  });
});
