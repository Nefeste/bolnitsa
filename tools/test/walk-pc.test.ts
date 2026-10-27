// Ходьба в движке (spec docs/specs/2026-10-walk.md, «Проверки»): в потоке для ПК каждый переход пациента стоит дороги по
// коридорам со скоростью людей на экране; приём начинается, когда пациент дошёл; терпение тратится с того, как он сел в
// зале; записывают к врачу, к которому раньше попадёшь; первые в очереди ждут у двери кабинета; нанятый врач зовёт только
// оформленного и измеренного. Детерминизм при любом шаге часов и отпечатки «Анамнеза» проверяют journey.test.ts,
// sim.test.ts и золотые тесты.
import { describe, expect, test } from 'bun:test';
import { db } from '../../src/content';
import type { Id } from '../../src/content/types';
import { doctorRoom } from '../../src/engine/hospital/requirements';
import { emptySite, hospitalOf } from '../../src/engine/hospital/site';
import { siteOfPreset } from '../../src/engine/hospital/site-preset';
import { presetStaff } from '../../src/engine/hospital/staff';
import { metersFromEntrance } from '../../src/engine/hospital/walk';
import { apply, colleaguesOf, hospitalCtx, newFlowShift } from '../../src/engine/shift/engine';
import { sliceOf } from '../../src/engine/shift/slice';
import { REGISTRATION, type ShiftPatient, type ShiftState, TRIAGE } from '../../src/engine/shift/types';
import { AT_DOOR, hallNear, patientSpeed, readyAt, slowOf, toDoctor, walkPc } from '../../src/engine/shift/walking';
import { FLOW, liveTo, site } from './site-kit';

const rec = db.presets['preset.city'];
const hospital = hospitalOf(db, siteOfPreset(db, rec));
const staff = presetStaff(db, rec);
/** Готовая больница: терапевт в дальнем кабинете, одна зона ожидания у входа. */
const city = (seed: number) => newFlowShift(db, { seed, season: 'winter', hospital, staff, flow: FLOW });
const roomOf = (s: ShiftState, type: string) => hospitalCtx(db, s).plan.rooms.find(r => r.type === type)!.id;

/**
 * Районная больница симулятора экономики (tools/sim/economy.ts): ряд прототипа у северной стены, средний ряд — ваш кабинет,
 * кабинет второго терапевта, доврачебный, вторая зона ожидания, рентген; у каждого из двух нанятых терапевтов — своя.
 */
const DISTRICT: [Id, number, number, number, number, 'top' | 'bottom'][] = [
  ['room.reception', 6, 6, 6, 7, 'bottom'], ['room.waiting', 11, 6, 9, 7, 'bottom'], ['room.office', 19, 6, 8, 7, 'bottom'], ['room.staff', 26, 6, 6, 7, 'bottom'],
  ['room.procedure', 31, 6, 6, 7, 'bottom'], ['room.lab', 36, 6, 6, 7, 'bottom'], ['room.toilet', 41, 6, 6, 7, 'bottom'], ['room.ecg', 46, 6, 6, 7, 'bottom'],
  ['room.office', 6, 15, 8, 7, 'top'], ['room.office', 13, 15, 8, 7, 'top'], ['room.triage', 20, 15, 6, 7, 'top'], ['room.waiting', 25, 15, 6, 7, 'top'],
  ['room.xray', 30, 15, 8, 7, 'top'],
];

function district(seed: number, perHour: number): ShiftState {
  const s = newFlowShift(db, { seed, season: 'winter', hospital: hospitalOf(db, emptySite()), staff: [], flow: { perHour, ambulancePerHour: 0 } });
  for (const [type, x, y, w, h, side] of DISTRICT) {
    const id = site(db, s, { kind: 'room', type, x, y, w, h }).room!;
    site(db, s, { kind: 'furnish', room: id });
    const mid = x + Math.floor(w / 2);
    site(db, s, { kind: 'door', room: id, cells: type === 'room.xray' ? [[mid - 1, side === 'top' ? y : y + h - 1], [mid, side === 'top' ? y : y + h - 1]] : [[mid, side === 'top' ? y : y + h - 1]] });
    for (const role of db.rooms[type].staff) site(db, s, { kind: 'hire', room: id, role });
  }
  site(db, s, { kind: 'done' });
  return s;
}

describe('ходьба в движке', () => {
  test('дорога каждого перехода — расстояние по плану, делённое на скорость; терпение — с того, как встал на место', () => {
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
    // вход → регистратура → медсестра → к двери кабинета его врача: зал — в 63 м от него, своего зала нет, стоит (spec
    // 2026-10-own-hall)
    const hall = roomOf(s, 'room.waiting');
    expect(Math.round(walkPc(plan, hall, 'r28') / 60)).toBe(13);
    expect([p!.stands, p!.hall, p!.next]).toEqual(['far', undefined, 'r28']);
    // своим шагом: пожилые и «жёлтые» — медленным (spec docs/specs/2026-10-people.md, «Медленный шаг»)
    const slow = slowOf(p!);
    expect(p!.regAt).toBe(p!.arriveT + Math.round(metersFromEntrance(plan, reception)! / patientSpeed(p!)));
    expect(p!.triAt).toBe(p!.regAt! + REGISTRATION + walkPc(plan, reception, triage, slow));
    expect(p!.seatAt).toBe(p!.triAt! + TRIAGE + walkPc(plan, triage, 'r28', slow));
    expect(p!.nextAt).toBe(p!.seatAt);
    expect(readyAt(p!)).toBe(p!.triAt! + TRIAGE);
    // терпение — с того, как встал у двери
    const patience = s.events.find(e => e.event.kind === 'patience' && e.event.id === p!.id);
    expect(patience?.t).toBe(p!.seatAt! + p!.patience);
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
    // у двери стоящие (spec 2026-10-own-hall) к врачу не идут — дорогу проходят те, кого позвали в пути
    expect(walked).toBeGreaterThan(2);
    expect(sliced).toBeGreaterThan(0);
  }, 60_000);

  test('вы зовёте — он идёт к вашему кабинету часами игры, приём — когда дойдёт (spec 2026-10-owner-play-2)', () => {
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
    // дорога не проживается разом: часы те же, встреча — когда дойдёт
    expect(s.t).toBe(t0);
    expect(s.meet).toBeGreaterThanOrEqual(t0 + walk);
    if (walk > 0) expect(p.walk).toEqual({ to: office, at: t0 + walk });
    // теперь он ваш: нанятый врач его не позовёт
    expect(p.doc).toBeUndefined();
  });

  test('запись — к терапевту, к которому раньше попадёшь; первые в очереди — у двери его кабинета; две зоны ожидания делят пациентов', () => {
    const s = district(1, 12);
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
    // каждому из двух нанятых терапевтов записывали
    const list = colleaguesOf(db, s);
    expect(list.length).toBe(2);
    const docs = new Map(list.map(m => [m.id, 0]));
    for (const p of Object.values(s.patients)) if (p.doc && docs.has(p.doc)) docs.set(p.doc, docs.get(p.doc)! + 1);
    expect(Math.min(...docs.values())).toBeGreaterThan(0);
    // две зоны ожидания делят пациентов: у каждого терапевта своя — ближайшая к его кабинету
    const ctx = hospitalCtx(db, s);
    const halls = ctx.plan.rooms.filter(r => r.type === 'room.waiting').map(r => r.id).sort();
    expect(list.map(m => hallNear(ctx.plan, ctx.working, m.room)).sort()).toEqual(halls);
    const used = new Set(Object.values(s.patients).flatMap(p => (p.hall ? [p.hall] : [])));
    expect([...used].sort()).toEqual(halls);
  }, 60_000);
});
