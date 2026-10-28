// Упакованный срез (spec docs/specs/2026-10-engine-speed.md, часть 5; docs/specs/2026-10-shell-3d.md, «Обмен между
// потоками»): Int32Array туда и обратно — то же, что срез объектами; строки — только у новых; номер человека не меняется,
// пока он в больнице; что делает — по правилам карты «Анамнеза»; детерминизм — тот же хэш, что без упаковки.
import { describe, expect, test } from 'bun:test';
import { db } from '../../src/content';
import { hospitalOf } from '../../src/engine/hospital/site';
import { siteOfPreset } from '../../src/engine/hospital/site-preset';
import { apply, newFlowShift } from '../../src/engine/shift/engine';
import { sliceOf } from '../../src/engine/shift/slice';
import { createSim } from '../../src/sim/host';
import { DOINGS, H, Handles, HEADER, NO_CASH, packSlice, peopleOf, STRIDE } from '../../src/sim/pack';
import { presetLayout } from './render-kit';
import { hash } from './scenario';

const { hospital, staff } = presetLayout(db, 'preset.city');
const flow = { perHour: 6, ambulancePerHour: 1 };

describe('упакованный срез', () => {
  test('туда и обратно — те же люди, что в срезе объектами; строки — один раз', () => {
    const s = newFlowShift(db, { seed: 3, season: 'winter', hospital, staff, flow });
    const rooms = new Map(hospital.rooms.map((r, i) => [r.id, i]));
    const team = new Map(staff.map((m, i) => [m.id, i]));
    const handles = new Handles();
    const seenNames = new Set<number>();
    const byId = new Map<string, number>();
    const doing = new Set<string>();
    for (let m = 0; m < 6 * 60; m += 2) {
      apply(db, s, { kind: 'advance', seconds: 120 });
      const slice = sliceOf(s);
      const { buf, names } = packSlice(s, slice, 0, handles, rooms, team, p => `имя ${p.seed}`);
      expect(buf.length).toBe(HEADER + slice.people.length * STRIDE);
      expect(buf[H.t]).toBe(s.t);
      expect(buf[H.count]).toBe(slice.people.length);
      expect(buf[H.cash]).toBe(NO_CASH);
      for (const r of names) {
        // строки — только у новых
        expect(seenNames.has(r.h)).toBe(false);
        seenNames.add(r.h);
        byId.set(r.id, r.h);
        expect(r.age).toBe(s.patients[r.id].patient.age);
        expect(r.sex).toBe(s.patients[r.id].patient.sex);
        // имя — для карточки на карте (spec docs/specs/2026-10-owner-play.md)
        expect(r.name).toBe(`имя ${s.patients[r.id].patient.seed}`);
      }
      const back = peopleOf(buf);
      slice.people.forEach((p, i) => {
        const v = back[i];
        // номер в срезе — тот же, пока человек в больнице
        expect(v.h).toBe(byId.get(p.id)!);
        expect(v.status).toBe(p.status);
        expect(v.triage).toBe(p.triage);
        expect(v.doing).toBe(p.doing);
        expect(v.room).toBe(p.room === undefined ? -1 : rooms.get(p.room)!);
        expect(v.by).toBe(p.by === undefined ? -1 : team.get(p.by)!);
        expect(v.bed).toBe(p.bed ?? -1);
        expect(v.kind).toBe(p.kind);
        expect(v.bench).toBe(p.bench);
        doing.add(p.doing);
      });
    }
    // за шесть часов люди и регистрируются, и ждут, и у врача, и на обследовании, и лежат
    for (const d of ['registration', 'waiting', 'office', 'ward']) expect(doing.has(d)).toBe(true);
    expect([...doing].every(d => DOINGS.includes(d as never))).toBe(true);
  }, 60_000);

  test('формат 4: скамья у двери кабинета — та же, что в срезе (spec docs/specs/2026-10-door-benches.md)', () => {
    // городская больница ПК: у дверей кабинетов нанятых врачей — скамьи
    const pc = siteOfPreset(db, db.presets['preset.city']);
    const h = hospitalOf(db, pc);
    const s = newFlowShift(db, { seed: 3, season: 'winter', hospital: h, staff, flow });
    const rooms = new Map(h.rooms.map((r, i) => [r.id, i]));
    const team = new Map(staff.map((m, i) => [m.id, i]));
    const handles = new Handles();
    let benched = 0;
    for (let m = 0; m < 4 * 60; m += 2) {
      apply(db, s, { kind: 'advance', seconds: 120 });
      const slice = sliceOf(s);
      const back = peopleOf(packSlice(s, slice, 0, handles, rooms, team).buf);
      slice.people.forEach((p, i) => {
        expect(back[i].bench).toBe(p.bench);
        if (p.bench !== undefined) benched++;
      });
    }
    expect(benched).toBeGreaterThan(0);
  }, 60_000);

  test('поток с упаковкой: тот же хэш состояния, что в основном потоке минутами', () => {
    const s = newFlowShift(db, { seed: 9, season: 'winter', hospital, staff, flow });
    const end = 12 * 3600;
    while (s.t < end) apply(db, s, { kind: 'advance', seconds: Math.min(60, end - s.t) });
    const sim = createSim(db);
    const first = sim.handle({ kind: 'start', seed: 9, season: 'winter', hospital, staff, flow });
    expect(first.kind === 'slice' && first.world?.staff.length).toBe(staff.length);
    let lag = 1;
    for (let i = 0; i < (4 * 3600) / 4; i++) sim.handle({ kind: 'tick', seconds: 4, budgetMs: 4 });
    for (let k = 0; lag > 0 && k < 100_000; k++) {
      const r = sim.handle({ kind: 'tick', seconds: 0, budgetMs: 4 });
      if (r.kind === 'slice') lag = r.lag;
    }
    const saved = sim.handle({ kind: 'save' });
    if (saved.kind !== 'state') throw new Error(saved.kind);
    expect(saved.state.t).toBe(s.t);
    expect(hash(saved.state)).toBe(hash(s));
  }, 120_000);
});
