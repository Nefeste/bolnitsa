// Медленный шаг (spec docs/specs/2026-10-people.md, «Медленный шаг»; решение владельца #132): пожилые от 65 лет и «жёлтые»
// идут на 0,8 обычной скорости — движок считает их дорогу дольше, срез помечает их, окно ведёт их медленным шагом. В сменах
// «Анамнеза» шага нет: их отпечатки проверяют золотые тесты.
import { describe, expect, test } from 'bun:test';
import { db } from '../../src/content';
import { hospitalOf } from '../../src/engine/hospital/site';
import { siteOfPreset } from '../../src/engine/hospital/site-preset';
import { presetStaff } from '../../src/engine/hospital/staff';
import { metersBetween, metersFromEntrance } from '../../src/engine/hospital/walk';
import { apply, hospitalCtx, newFlowShift } from '../../src/engine/shift/engine';
import { sliceOf } from '../../src/engine/shift/slice';
import { REGISTRATION, type ShiftPatient, type ShiftState } from '../../src/engine/shift/types';
import { patientSpeed, SLOW_AGE, SLOW_PACE, SLOW_SPEED_PC, slowOf, slowWalker, WALK_SPEED_PC } from '../../src/engine/shift/walking';
import { Handles, packSlice, peopleOf } from '../../src/sim/pack';
import { FLOW } from './site-kit';

const rec = db.presets['preset.city'];
const hospital = hospitalOf(db, siteOfPreset(db, rec));
const staff = presetStaff(db, rec);
const city = (seed: number) => newFlowShift(db, { seed, season: 'winter', hospital, staff, flow: FLOW });

/** Прожить до часа `hour`; все, кто приходил, — с их состоянием в минуту прихода. */
function live(s: ShiftState, hour: number): ShiftPatient[] {
  const seen = new Map<string, ShiftPatient>();
  while (s.t < hour * 3600) {
    apply(db, s, { kind: 'advance', seconds: 60 });
    for (const p of Object.values(s.patients)) if (!seen.has(p.id) && p.regAt !== undefined) seen.set(p.id, structuredClone(p));
  }
  return [...seen.values()];
}

describe('медленный шаг', () => {
  test('кто идёт медленно: от 65 лет или «жёлтый»; скорость — 0,8 обычной', () => {
    expect(SLOW_AGE).toBe(65);
    expect(SLOW_PACE).toBe(80);
    expect(slowWalker(65, 'green')).toBe(true);
    expect(slowWalker(64, 'green')).toBe(false);
    expect(slowWalker(30, 'yellow')).toBe(true);
    expect(slowWalker(30, 'red')).toBe(false);
    expect(SLOW_SPEED_PC).toBeCloseTo(WALK_SPEED_PC * 0.8, 12);
  });

  test('дорога от входа к регистратуре: медленным шагом — дольше, по своей скорости', () => {
    const s = city(1);
    const came = live(s, 12);
    const plan = hospitalCtx(db, s).plan;
    const reception = plan.rooms.find(r => r.type === 'room.reception')!.id;
    const m = metersFromEntrance(plan, reception)!;
    const slow = came.filter(slowOf);
    const fast = came.filter(p => !slowOf(p));
    expect(slow.length).toBeGreaterThan(3);
    expect(fast.length).toBeGreaterThan(3);
    for (const p of came) {
      if (p.kind !== 'walkIn') continue;
      expect(p.regAt! - p.arriveT).toBe(Math.round(m / patientSpeed(p)));
    }
    // те же метры медленным шагом — на четверть дольше (с точностью до округления секунд)
    expect(Math.abs(Math.round(m / SLOW_SPEED_PC) - Math.round((m / WALK_SPEED_PC) * 1.25))).toBeLessThanOrEqual(1);
    // зал — после регистрации и дороги от неё; медленным шагом — по своей скорости
    for (const p of slow) {
      if (p.kind !== 'walkIn' || p.triAt !== undefined || !p.leg || p.hall === undefined) continue;
      expect(p.seatAt! - (p.regAt! + REGISTRATION)).toBe(Math.round((metersBetween(plan, reception, p.hall) ?? 0) / SLOW_SPEED_PC));
    }
  }, 60_000);

  test('срез помечает идущих медленно; у обычных пометки нет', () => {
    const s = city(2);
    live(s, 10);
    const slice = sliceOf(s);
    const rooms = new Map(hospital.rooms.map((r, i) => [r.id, i]));
    const team = new Map(staff.map((m, i) => [m.id, i]));
    const { buf } = packSlice(s, slice, 0, new Handles(), rooms, team);
    const back = peopleOf(buf);
    let marked = 0;
    slice.people.forEach((x, i) => {
      const want = slowOf(s.patients[x.id]);
      expect(back[i].slow === true).toBe(want);
      if (want) marked++;
    });
    expect(marked).toBeGreaterThan(0);
    expect(marked).toBeLessThan(slice.people.length);
  }, 60_000);
});
