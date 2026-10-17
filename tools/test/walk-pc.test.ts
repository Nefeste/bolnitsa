// Ходьба в движке (spec docs/specs/2026-10-walk.md, «Проверки»): в потоке для ПК каждый переход пациента стоит дороги по
// коридорам со скоростью людей на экране; приём начинается, когда пациент дошёл; терпение тратится с того, как он сел в
// зале; записывают к врачу с самой короткой очередью; первые в очереди ждут у двери кабинета; нанятый врач зовёт только
// оформленного и измеренного. Детерминизм при любом шаге часов и отпечатки «Анамнеза» проверяют journey.test.ts,
// sim.test.ts и золотые тесты.
import { describe, expect, test } from 'bun:test';
import { db } from '../../src/content';
import { doctorRoom } from '../../src/engine/hospital/requirements';
import { hospitalOf } from '../../src/engine/hospital/site';
import { siteOfPreset } from '../../src/engine/hospital/site-preset';
import { presetStaff } from '../../src/engine/hospital/staff';
import { metersFromEntrance } from '../../src/engine/hospital/walk';
import { apply, colleaguesOf, hospitalCtx, newFlowShift } from '../../src/engine/shift/engine';
import { sliceOf } from '../../src/engine/shift/slice';
import { REGISTRATION, type ShiftPatient, type ShiftState, TRIAGE } from '../../src/engine/shift/types';
import { AT_DOOR, readyAt, toDoctor, WALK_SPEED_PC, walkPc } from '../../src/engine/shift/walking';
import { hospitalFor } from '../bench/hospital';
import { FLOW, liveTo } from './site-kit';

const rec = db.presets['preset.city'];
const hospital = hospitalOf(db, siteOfPreset(db, rec));
const staff = presetStaff(db, rec);
/** Готовая больница: терапевт в дальнем кабинете, одна зона ожидания у входа. */
const city = (seed: number) => newFlowShift(db, { seed, season: 'winter', hospital, staff, flow: FLOW });
const roomOf = (s: ShiftState, type: string) => hospitalCtx(db, s).plan.rooms.find(r => r.type === type)!.id;

describe('ходьба в движке', () => {
  test('дорога каждого перехода — расстояние по плану, делённое на скорость; терпение — с того, как сел в зале', () => {
    const s = city(1);
    let p: ShiftPatient | undefined;
    while (!p && s.t < 12 * 3600) {
      apply(db, s, { kind: 'advance', seconds: 60 });
      p = Object.values(s.patients).find(x => x.kind === 'walkIn' && x.regAt !== undefined);
    }
    expect(p).toBeDefined();
    const plan = hospitalCtx(db, s).plan;
    const reception = roomOf(s, 'room.reception');
    const triage = roomOf(s, 'room.triage');
    // вход → регистратура → медсестра → зал у кабинета его врача
    expect(p!.hall).toBe(roomOf(s, 'room.waiting'));
    expect(p!.regAt).toBe(p!.arriveT + Math.round(metersFromEntrance(plan, reception)! / WALK_SPEED_PC));
    expect(p!.triAt).toBe(p!.regAt! + REGISTRATION + walkPc(plan, reception, triage));
    expect(p!.seatAt).toBe(p!.triAt! + TRIAGE + walkPc(plan, triage, p!.hall));
    expect(readyAt(p!)).toBe(p!.triAt! + TRIAGE);
    // терпение — с того, как сел
    const patience = s.events.find(e => e.event.kind === 'patience' && e.event.id === p!.id);
    expect(patience?.t).toBe(p!.seatAt! + p!.patience);
    // 63 м от зала до дальнего кабинета терапевта — 13 минут пешком
    expect(Math.round(walkPc(plan, p!.hall, 'r28') / 60)).toBe(13);
  });

  test('нанятый врач зовёт оформленного и измеренного; приём — когда дошёл; в срезе — к какому часу дойдёт', () => {
    const s = city(1);
    const called = new Set<string>();
    let walked = 0;
    let sliced = 0;
    while (s.t < 12 * 3600) {
      apply(db, s, { kind: 'advance', seconds: 60 });
      const slice = sliceOf(s);
      for (const p of Object.values(s.patients)) {
        if (!p.by || p.calledT === undefined || p.regAt === undefined || called.has(p.id)) continue;
        called.add(p.id);
        expect(p.calledT).toBeGreaterThanOrEqual(readyAt(p));
        if (!p.walk) continue;
        walked++;
        // первый шаг врача — не раньше, чем пациент дошёл
        const step = s.events.find(e => e.event.kind === 'colleague' && e.event.id === p.id);
        if (step && step.t > s.t) expect(step.t).toBe(Math.max(p.calledT + 60, p.walk.at));
        const x = slice.people.find(y => y.id === p.id);
        if (x && p.walk.at > s.t && p.status === 'inRoom' && !p.out) {
          expect(x).toMatchObject({ doing: 'office', arrive: p.walk.at });
          sliced++;
        }
      }
    }
    expect(called.size).toBeGreaterThan(10);
    expect(walked).toBeGreaterThan(5);
    expect(sliced).toBeGreaterThan(0);
  }, 60_000);

  test('вы зовёте — часы идут, пока он дойдёт до вашего кабинета', () => {
    const s = city(5);
    liveTo(db, s, 10);
    const free = () => s.queue.find(id => !s.patients[id].by && s.patients[id].calledT === undefined && s.patients[id].kind !== 'ambulance');
    for (let i = 0; i < 120 && !free(); i++) apply(db, s, { kind: 'advance', seconds: 60 });
    const id = free()!;
    expect(id).toBeDefined();
    const p = s.patients[id];
    const plan = hospitalCtx(db, s).plan;
    const office = doctorRoom(plan)!;
    const walk = toDoctor(plan, p, office, s.t);
    const t0 = s.t;
    apply(db, s, { kind: 'call', id });
    expect(s.current).toBe(id);
    expect(s.t).toBeGreaterThanOrEqual(t0 + walk);
    if (walk > 0) expect(p.walk).toEqual({ to: office, at: t0 + walk });
    // теперь он ваш: нанятый врач его не позовёт
    expect(p.doc).toBeUndefined();
  });

  test('запись — к терапевту с самой короткой очередью; первые в очереди — у двери его кабинета; две зоны ожидания делят пациентов', () => {
    const l = hospitalFor(db, 3, 100);
    const s = newFlowShift(db, { seed: 1, season: 'winter', hospital: l.hospital, staff: l.staff, flow: { perHour: 24, ambulancePerHour: 0 } });
    let doors = 0;
    while (s.t < 12 * 3600) {
      apply(db, s, { kind: 'advance', seconds: 60 });
      for (const m of colleaguesOf(db, s)) {
        // свои, вернувшиеся с результатами, — у двери первыми; здесь — врачи без них
        if (Object.values(s.patients).some(p => p.status === 'waiting' && p.by === m.id)) continue;
        for (const id of s.queue.filter(x => s.patients[x].doc === m.id).slice(0, AT_DOOR)) {
          expect(s.patients[id].next).toBe(m.room);
          doors++;
        }
      }
    }
    expect(doors).toBeGreaterThan(20);
    // каждому из трёх терапевтов записывали
    const docs = new Map<string, number>();
    for (const m of colleaguesOf(db, s)) docs.set(m.id, 0);
    for (const p of Object.values(s.patients)) if (p.doc && docs.has(p.doc)) docs.set(p.doc, docs.get(p.doc)! + 1);
    const n = [...docs.values()];
    expect(n.length).toBe(3);
    expect(Math.min(...n)).toBeGreaterThan(0);
    // две зоны ожидания делят пациентов: каждый ждёт в ближайшей к кабинету своего врача
    const plan = hospitalCtx(db, s).plan;
    const halls = plan.rooms.filter(r => r.type === 'room.waiting').map(r => r.id);
    expect(halls.length).toBe(2);
    const used = new Set(Object.values(s.patients).flatMap(p => (p.hall ? [p.hall] : [])));
    expect([...used].sort()).toEqual([...halls].sort());
  }, 60_000);
});
