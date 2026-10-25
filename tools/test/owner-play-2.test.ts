// Игра владельца 18.10 (spec docs/specs/2026-10-owner-play-2.md): «Позвать», «Взять случай», «Посмотреть» не проживают
// дорогу — пациент идёт к вам часами игры, приём — когда встретитесь; в этот час и когда он вернулся с обследования в
// другом кабинете — извещение «вошёл к вам». «Ждать» времени не проживает. Смены «Анамнеза» — как были.
import { describe, expect, test } from 'bun:test';
import { db } from '../../src/content';
import { doctorRoom } from '../../src/engine/hospital/requirements';
import { hospitalOf } from '../../src/engine/hospital/site';
import { siteOfPreset } from '../../src/engine/hospital/site-preset';
import { presetStaff } from '../../src/engine/hospital/staff';
import { apply, atDoctor, hospitalCtx, isOut, newFlowShift, newSandbox } from '../../src/engine/shift/engine';
import type { Notice, ShiftPatient, ShiftState } from '../../src/engine/shift/types';
import { sliceOf } from '../../src/engine/shift/slice';
import { toDoctor } from '../../src/engine/shift/walking';
import { FLOW, hash, liveTo } from './site-kit';

const rec = db.presets['preset.city'];
const hospital = hospitalOf(db, siteOfPreset(db, rec));
const staff = presetStaff(db, rec);
const city = (seed: number) => newFlowShift(db, { seed, season: 'winter', hospital, staff, flow: FLOW });

/** Первый пришедший сам, кого никто не звал, — в 10:00 или позже. */
function free(s: ShiftState): ShiftPatient {
  liveTo(db, s, 10);
  const pick = () => s.queue.find(id => !s.patients[id].by && s.patients[id].calledT === undefined && s.patients[id].kind !== 'ambulance');
  for (let i = 0; i < 240 && !pick(); i++) apply(db, s, { kind: 'advance', seconds: 60 });
  return s.patients[pick()!];
}

/** Часы идут по `step` секунд, пока не придёт извещение `kind` о нём; извещения — все, что пришли. */
function until(s: ShiftState, id: string, kind: Notice['kind'], step = 5): Notice[] {
  const all: Notice[] = [];
  for (let i = 0; i < (6 * 3600) / step; i++) {
    const out = apply(db, s, { kind: 'advance', seconds: step });
    all.push(...out);
    if (out.some(n => n.kind === kind && 'id' in n && n.id === id)) return all;
  }
  throw new Error(`нет извещения ${kind} о ${id}`);
}

describe('«Позвать» — часами игры (spec 2026-10-owner-play-2)', () => {
  test('часы не двигаются, пациент ваш и идёт; до встречи приём не начат; в час встречи — «вошёл к вам»', () => {
    const s = city(7);
    const p = free(s);
    const plan = hospitalCtx(db, s).plan;
    const walk = toDoctor(plan, p, doctorRoom(plan)!, s.t);
    const t0 = s.t;
    const spent = p.spent.seconds;
    expect(apply(db, s, { kind: 'call', id: p.id })).toEqual([]);
    expect([s.t, s.current, s.until]).toEqual([t0, p.id, undefined]);
    expect(s.meet).toBe(t0 + Math.max(60, walk));
    // дорога — в счёт приёма, как прежде
    expect(p.spent.seconds - spent).toBe(s.meet! - t0);
    // до встречи — ни вопроса, ни диагноза, ни «Завершить»
    const done = p.done.length;
    const q = Object.values(db.exams).find(e => e.kind === 'ask' && atDoctor(db, s, p, e.id))!;
    apply(db, s, { kind: 'exam', exam: q.id });
    apply(db, s, { kind: 'finish' });
    expect([p.done.length, p.closed, s.current]).toEqual([done, undefined, p.id]);
    // в час встречи — извещение, и приём идёт
    const notices = until(s, p.id, 'reached');
    expect(notices.filter(n => n.kind === 'reached')).toEqual([{ kind: 'reached', id: p.id }]);
    expect(s.meet).toBeUndefined();
    expect(s.t - (t0 + Math.max(60, walk))).toBeLessThan(5);
    apply(db, s, { kind: 'exam', exam: q.id });
    expect(p.done).toContain(q.id);
  }, 60_000);

  test('«Взять случай» у нанятого врача — тоже: идёт из его кабинета, приём — когда войдёт', () => {
    const s = city(8);
    liveTo(db, s, 10);
    let p: ShiftPatient | undefined;
    for (let i = 0; i < 240 && !p; i++) {
      apply(db, s, { kind: 'advance', seconds: 60 });
      p = Object.values(s.patients).find(x => x.status === 'inRoom' && x.by !== undefined && !x.closed && !isOut(s, x));
    }
    expect(p).toBeDefined();
    const t0 = s.t;
    apply(db, s, { kind: 'takeOver', id: p!.id });
    expect([s.t, s.current, p!.by]).toEqual([t0, p!.id, undefined]);
    expect(s.meet).toBeGreaterThan(t0);
    until(s, p!.id, 'reached');
    expect(s.meet).toBeUndefined();
  }, 60_000);

  test('ушёл на обследование в другой кабинет — вернулся: «вошёл к вам»; «Ждать» времени не проживает', () => {
    const s = city(9);
    const p = free(s);
    apply(db, s, { kind: 'call', id: p.id });
    until(s, p.id, 'reached');
    // снимок или кровь — там, где их делают: пациент идёт туда сам
    const out = Object.values(db.exams).find(e => !p.done.includes(e.id) && atDoctor(db, s, p, e.id) === false);
    expect(out).toBeDefined();
    apply(db, s, { kind: 'exam', exam: out!.id });
    expect(isOut(s, p)).toBe(true);
    const back = p.out!.back;
    const t = s.t;
    const step = p.step;
    apply(db, s, { kind: 'waitResults' });
    expect([s.t, s.until, p.step]).toEqual([t, undefined, step + 1]);
    until(s, p.id, 'reached');
    expect(s.t - back).toBeLessThan(5);
    expect(isOut(s, p)).toBe(false);
  }, 60_000);

  test('с обследования назад — к часу возвращения: срез говорит его фигуре, к какому часу дойти (замечание 25.10.2026)', () => {
    const s = city(9);
    const p = free(s);
    apply(db, s, { kind: 'call', id: p.id });
    until(s, p.id, 'reached');
    const out = Object.values(db.exams).find(e => !p.done.includes(e.id) && atDoctor(db, s, p, e.id) === false)!;
    apply(db, s, { kind: 'exam', exam: out.id });
    const { until: done, back } = p.out!;
    const office = doctorRoom(hospitalCtx(db, s).plan);
    const person = () => sliceOf(s, office).people.find(x => x.id === p.id)!;
    // там — до конца обследования; потом идёт назад, и у среза — час, когда он войдёт к вам
    while (s.t < done) apply(db, s, { kind: 'advance', seconds: 5 });
    expect(s.t).toBeLessThan(back);
    expect(person()).toMatchObject({ doing: 'office', room: office, arrive: back });
    until(s, p.id, 'reached');
    expect(person().arrive).toBeUndefined();
  }, 60_000);

  test('детерминизм: те же команды в те же секунды — то же состояние', () => {
    const run = () => {
      const s = city(10);
      const p = free(s);
      apply(db, s, { kind: 'call', id: p.id });
      until(s, p.id, 'reached');
      liveTo(db, s, 14);
      return hash(s);
    };
    expect(run()).toBe(run());
  }, 60_000);
});

describe('смены «Анамнеза» — как были', () => {
  test('в песочнице «Позвать» проживает дорогу разом, встречи и «вошёл к вам» нет', () => {
    const s = newSandbox(db, { seed: 31, season: 'winter', start: 'clinic', budget: db.economy.sandbox.budgets.generous });
    apply(db, s, { kind: 'nextDay' });
    delete s.broken;
    for (let i = 0; i < 60 && !s.queue.some(id => !s.patients[id].by); i++) apply(db, s, { kind: 'advance', seconds: 5 * 60 });
    const p = s.patients[s.queue.find(id => !s.patients[id].by)!];
    const t0 = s.t;
    const notices = apply(db, s, { kind: 'call', id: p.id });
    expect(s.t).toBeGreaterThanOrEqual(t0 + 60);
    expect(s.meet).toBeUndefined();
    expect(notices.some(n => n.kind === 'reached')).toBe(false);
  }, 60_000);
});
