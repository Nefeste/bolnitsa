// Каталка на экране (spec docs/specs/2026-10-orderlies.md, «Что видно»): по часам перевозки из движка — что делает тот, кто
// везёт, где больной, куда встать с каталкой у кровати; в городской больнице со сменами санитар идёт за привезённым с
// пустой каталкой, перекладывает, везёт его лёжа и возвращается на место; привезённого ввозит фельдшер скорой и уходит.
import { describe, expect, test } from 'bun:test';
import { withNightShift } from '../../src/engine/hospital/staff';
import { GAME_PER_REAL } from '../../src/engine/shift/walking';
import type { Ride } from '../../src/engine/shift/types';
import { CATALOG, EXTRA_MODELS } from '../../src/render/catalog';
import { Crowd, GURNEY_AHEAD, GURNEY_TOP } from '../../src/render/crowd';
import { furnish } from '../../src/render/furniture';
import { Paths } from '../../src/render/path';
import { gurneyStop, gurneyYaw, Places, spotOn } from '../../src/render/place';
import { Population } from '../../src/render/population';
import { carrierGoal, ridePhase, riderAt, ridesNow } from '../../src/render/rides';
import { createSim } from '../../src/sim/host';
import { H } from '../../src/sim/pack';
import { buildDb } from '../content/load';
import { bakedPeople, furnitureModels, presetLayout } from './render-kit';

const { db } = buildDb();
const MIN = 60;

/** Перевозка на койку: вышел в 10:00, у больного в 10:05, переложил к 10:07, довёз к 10:15, переложил к 10:17, на месте к 10:22. */
const bed: Ride = { id: 'p1', by: 's1', why: 'bed', since: 600 * MIN, from: 'r1', to: 'r2', go: 600 * MIN, pick: 605 * MIN, off: 607 * MIN, drop: 615 * MIN, done: 617 * MIN, home: 622 * MIN };
/** На КТ и назад: у аппарата с 10:17 до 10:30, назад переложил к 10:32, довёз к 10:40, переложил к 10:42, на месте к 10:47. */
const ct: Ride = { ...bed, why: 'exam', to: 'r3', exam: { start: 618 * MIN, end: 630 * MIN, off: 632 * MIN, drop: 640 * MIN, done: 642 * MIN }, home: 647 * MIN };

describe('каталка на экране — по часам перевозки', () => {
  test('фазы: идёт, перекладывает, везёт, перекладывает, возвращается; к аппарату — ждёт, назад', () => {
    const at = (r: Ride, m: number) => ridePhase(r, m * MIN);
    expect([599, 600, 606, 610, 616, 618, 621, 622].map(m => at(bed, m))).toEqual([undefined, 'go', 'load', 'carry', 'unload', 'home', 'home', undefined]);
    expect([616, 620, 631, 635, 641, 645, 647].map(m => at(ct, m))).toEqual(['unload', 'wait', 'loadBack', 'carryBack', 'unloadBack', 'home', undefined]);
  });

  test('где больной и куда идёт тот, кто везёт', () => {
    expect(riderAt('go', true)).toBe('slice');
    expect(riderAt('load', true)).toBe('gurney');
    expect(riderAt('carry', true)).toBe('gurney');
    expect(riderAt('unload', true)).toBe('to');
    // у аппарата: ложится на него — там; аппарат стоя — ждёт на каталке
    expect(riderAt('wait', true)).toBe('to');
    expect(riderAt('wait', false)).toBe('gurney');
    expect(riderAt('unloadBack', true)).toBe('from');
    expect(riderAt('home', true)).toBe('slice');
    expect(carrierGoal(bed, 'go')).toEqual({ at: 'from', due: bed.pick });
    expect(carrierGoal(bed, 'carry')).toEqual({ at: 'to', due: bed.drop });
    expect(carrierGoal(ct, 'wait')).toEqual({ at: 'to', due: ct.done });
    expect(carrierGoal(ct, 'carryBack')).toEqual({ at: 'from', due: ct.exam!.drop });
    expect(carrierGoal(bed, 'home')).toEqual({ at: 'post', due: bed.home });
  });

  test('у каждого — одна перевозка за раз: ранняя из идущих', () => {
    const next: Ride = { ...bed, id: 'p2', go: 622 * MIN, pick: 627 * MIN, off: 629 * MIN, drop: 635 * MIN, done: 637 * MIN, home: 642 * MIN };
    expect(ridesNow([next, bed], 610 * MIN).get('s1')).toMatchObject({ r: { id: 'p1' }, ph: 'carry' });
    expect(ridesNow([next, bed], 625 * MIN).get('s1')).toMatchObject({ r: { id: 'p2' }, ph: 'go' });
    expect(ridesNow([next, bed], 650 * MIN).size).toBe(0);
  });
});

describe('куда встать с каталкой', () => {
  test('у каждой койки смотровой и палаты: каталка перед ним вдоль койки, ни в стене, ни в предмете', async () => {
    const { layout } = presetLayout(db, 'preset.city');
    const names = [...new Set([...Object.values(CATALOG).flatMap(e => ('model' in e ? [e.model] : [])), ...EXTRA_MODELS])];
    const fur = furnish(layout, await furnitureModels(names));
    const cellAt = (x: number, z: number) => Math.floor(z) * layout.w + Math.floor(x);
    let beds = 0;
    let along = 0;
    for (let t = 0; t < layout.things.length; t++) {
      const room = layout.plan.rooms[layout.things[t].room];
      if (!fur.lies[t] || !room || (room.type !== 'room.emergency' && !room.type.startsWith('room.ward'))) continue;
      beds++;
      const s = spotOn(layout, fur, t, 'wait', 0);
      const stop = gurneyStop(layout, s);
      expect(layout.walk[stop.cell]).toBe(1);
      expect(Number.isNaN(stop.yaw)).toBe(false);
      // середина каталки и её концы — на полу, не в стене и не в предмете
      const dx = Math.sin(stop.yaw);
      const dz = Math.cos(stop.yaw);
      for (const k of [0.5, GURNEY_AHEAD, GURNEY_AHEAD + 0.6]) {
        const c = cellAt(stop.x + dx * k, stop.z + dz * k);
        expect(layout.plan.grid.cells[c]).not.toBe(3);
      }
      expect(layout.walk[cellAt(stop.x + dx * GURNEY_AHEAD, stop.z + dz * GURNEY_AHEAD)]).toBe(1);
      // вдоль койки — каталка рядом с ней; у изголовья стена или тумба — подъезжает к койке сбоку
      if (Math.abs(Math.abs(Math.sin(stop.yaw)) - Math.abs(Math.sin(s.yaw))) < 0.01) along++;
    }
    expect(beds).toBeGreaterThan(8);
    expect(along / beds).toBeGreaterThanOrEqual(0.5);
  });

  test('место санитара: лицом туда, где его каталка не упрётся в стену', () => {
    const { layout } = presetLayout(db, 'preset.city');
    let n = 0;
    for (const r of layout.plan.rooms) {
      const c = r.staff['role.orderly'];
      if (!c) continue;
      n++;
      const cell = c[1] * layout.w + c[0];
      const yaw = gurneyYaw(layout, cell, Number.NaN);
      const x = c[0] + 0.5 + Math.sin(yaw) * GURNEY_AHEAD;
      const z = c[1] + 0.5 + Math.cos(yaw) * GURNEY_AHEAD;
      expect(layout.walk[Math.floor(z) * layout.w + Math.floor(x)]).toBe(1);
    }
    expect(n).toBeGreaterThan(1);
  });
});

describe('перевозка в городской больнице', () => {
  test('санитар идёт за больным с пустой каталкой, везёт его лёжа, довозит и возвращается; фельдшер ввозит привезённого и уходит', async () => {
    const { hospital, staff: base, layout } = presetLayout(db, 'preset.city');
    const staff = withNightShift(db, hospital.rooms, base);
    const names = [...new Set([...Object.values(CATALOG).flatMap(e => ('model' in e ? [e.model] : [])), ...EXTRA_MODELS])];
    const fur = furnish(layout, await furnitureModels(names));
    const walk = layout.walk.slice();
    for (const [x, y] of fur.decor) walk[y * layout.w + x] = 0;
    const open = new Uint8Array(layout.w * layout.h);
    for (let i = 0; i < open.length; i++) open[i] = layout.plan.grid.cells[i] === 1 || layout.plan.grid.cells[i] === 2 || layout.plan.grid.cells[i] === 4 ? 1 : 0;
    const people = await bakedPeople();
    const crowd = new Crowd(layout, new Paths(layout.w, layout.h, walk, open), people.looks);
    crowd.speed = 3;
    crowd.rate = 3 * GAME_PER_REAL;
    const pop = new Population(db, layout, new Places(layout, fur), crowd, people.looks, staff, hospital.rooms);
    pop.setTime(8 * 3600);
    pop.placeStaff();
    const sim = createSim(db);
    const first = sim.handle({ kind: 'start', seed: 3, season: 'winter', hospital, staff, flow: { perHour: 6, ambulancePerHour: 4 } });
    if (first.kind !== 'slice') throw new Error(first.kind);
    let medics = 0;
    let medicLeft = 0;
    const seen = new Set<string>();
    const phases = new Map<string, Set<string>>();
    let carried = 0;
    let gurneyNear = 0;
    let placed = 0;
    let ride: Ride | undefined;
    // ×3 при 60 к/с: секунда игры на кадр; три часа
    for (let f = 0; f < 3 * 3600; f++) {
      const r = sim.handle({ kind: 'tick', seconds: 1, budgetMs: 50 });
      if (r.kind !== 'slice') throw new Error(r.kind === 'error' ? r.message : r.kind);
      crowd.t = r.buf[H.t];
      if (r.rides) pop.setRides(r.rides);
      ride ??= r.rides?.find(x => x.why === 'bed');
      pop.sync(r.buf, r.names);
      crowd.update(1 / 60);
      for (const [key, w] of crowd.walkers) {
        if (!key.startsWith('m:')) continue;
        if (!seen.has(key)) {
          seen.add(key);
          medics++;
        }
        if (w.leaving && !seen.has(`${key}:left`)) {
          seen.add(`${key}:left`);
          medicLeft++;
        }
      }
      if (!ride) continue;
      const t = r.buf[H.t];
      const ph = ridePhase(ride, t);
      if (ph) {
        const p = phases.get(ride.id) ?? new Set();
        p.add(ph);
        phases.set(ride.id, p);
      }
      const pk = pop.walkerKey(ride.id);
      const pw = pk ? crowd.walkers.get(pk) : undefined;
      const cw = crowd.walkers.get(`s:${ride.by}`);
      if (!pw || !cw) continue;
      if (ph === 'carry') {
        // везут: больной лежит на каталке перед тем, кто везёт; каталка — там же
        expect(pw.carry).toBe(cw.key);
        if (pw.t > 1) {
          expect(Math.hypot(pw.x - (cw.x + Math.sin(cw.heading) * GURNEY_AHEAD), pw.z - (cw.z + Math.cos(cw.heading) * GURNEY_AHEAD))).toBeLessThan(0.05);
          expect(pw.y).toBeCloseTo(GURNEY_TOP, 5);
          carried++;
        }
        if (pop.gurneys().some(g => Math.hypot(g.x - pw.x, g.z - pw.z) < 0.05)) gurneyNear++;
      }
      if (ph === 'home' || (ph === undefined && t >= ride.home)) {
        // довезли: лежит на койке, с каталки сняли
        expect(pw.carry).toBeUndefined();
        if (pw.state === 'lie' && pw.at?.pose === 'lie') placed++;
      }
      if (t >= ride.home + 600) break;
    }
    expect(ride).toBeDefined();
    // санитар в той же смотровой — идти до больного в движке нечего: сразу перекладывает
    expect([...(phases.get(ride!.id) ?? [])].filter(x => x !== 'go')).toEqual(['load', 'carry', 'unload', 'home']);
    expect(carried).toBeGreaterThan(30);
    expect(gurneyNear).toBeGreaterThan(30);
    expect(placed).toBeGreaterThan(0);
    // фельдшеры скорой: ввезли привезённых; кого довезли до места в смотровой — ушли
    expect(medics).toBeGreaterThan(2);
    expect(medicLeft).toBeGreaterThan(0);
  }, 240_000);
});
