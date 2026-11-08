// Смена врача (spec docs/specs/2026-11-doctor-shift.md, часть 1): принимаете только вы (`meta.solo`, копия «Анамнеза»),
// больница готовая — стройки и найма нет, ожидание результатов в кабинете — время приёма, итог смены по категориям
// (`src/sim/shift.ts`, копия `single.ts` «Анамнеза») и «виртуальный врач» на нём.
import { describe, expect, test } from 'bun:test';
import { whyText } from '../../src/app/build';
import { db } from '../../src/content';
import { hospitalOf } from '../../src/engine/hospital/site';
import { siteOfPlan } from '../../src/engine/hospital/site-plan';
import { siteOfPreset } from '../../src/engine/hospital/site-preset';
import { presetStaff, withNightShift } from '../../src/engine/hospital/staff';
import { apply, capacityOf, colleaguesOf, current, newFlowShift } from '../../src/engine/shift/engine';
import type { Flow, ShiftPatient, ShiftState } from '../../src/engine/shift/types';
import { T } from '../../src/i18n';
import { ownCases, SHIFT_CATEGORIES, shiftResult, SPEED_MINUTES } from '../../src/sim/shift';
import { playOwn } from '../sim/doctor-player';
import { hash, liveTo } from './site-kit';

const AUTO: Flow = { perHour: 0, auto: true };
const H = 3600;
const rec = db.presets['preset.city'];

function city(seed: number, solo?: boolean): ShiftState {
  const site = siteOfPreset(db, rec);
  return newFlowShift(db, { seed, season: 'winter', hospital: hospitalOf(db, site), staff: withNightShift(db, site.rooms, presetStaff(db, rec)), flow: AUTO, ...(solo !== undefined ? { solo } : {}) });
}

function poly(seed: number): ShiftState {
  const p = siteOfPlan(db, db.sites!['site.polyclinic']);
  if (!p.ok) throw new Error(p.error.kind);
  return newFlowShift(db, { seed, season: 'winter', hospital: hospitalOf(db, p.site), staff: withNightShift(db, p.site.rooms, p.staff), flow: AUTO, solo: true });
}

/** Все, кто был в состоянии: и ушедшие — из карт `s.past`. */
const everyone = (s: ShiftState): ShiftPatient[] => [...Object.values(s.patients), ...(s.past ?? []).map(x => x.p)];

describe('смена врача: принимаете только вы', () => {
  test('нанятые врачи кабинетов не принимают ни новых, ни записанных; поток — на ваш один кабинет, скорая — та же', () => {
    const s = city(3, true);
    const was = city(3);
    expect(s.meta.solo).toBe(true);
    expect(colleaguesOf(db, s)).toEqual([]);
    expect(colleaguesOf(db, was).length).toBeGreaterThan(1);
    // поток от больницы (`capacityOf`): нанятых нет — ваш кабинет; к специалистам не записываются; места смотровой те же
    expect(capacityOf(db, s)).toEqual({ offices: 1, bays: capacityOf(db, was).bays, booked: [] });
    liveTo(db, s, 14);
    liveTo(db, was, 14);
    expect(everyone(s).some(p => p.by !== undefined)).toBe(false);
    expect((s.gone ?? []).some(g => g.by !== undefined)).toBe(false);
    expect(s.summary.arrivedBy?.appointment ?? 0).toBe(0);
    expect(s.summary.arrived).toBeGreaterThan(5);
    // без смены врача — как прежде: нанятые принимают, к специалистам записываются
    expect((was.gone ?? []).some(g => g.by !== undefined)).toBe(true);
    expect(was.summary.arrivedBy?.appointment ?? 0).toBeGreaterThan(0);
  });

  test('без смены врача — тот же день до байта: `solo: false` поля не ставит', () => {
    const a = city(5);
    const b = city(5, false);
    expect(b.meta.solo).toBeUndefined();
    liveTo(db, a, 11);
    liveTo(db, b, 11);
    expect(hash(b)).toBe(hash(a));
  });

  test('больница готовая: стройка, найм, «Мой кабинет» и отмена отказаны, закрыть стройку можно', () => {
    const s = city(3, true);
    const office = s.hospital!.site!.rooms.find(r => r.type === 'room.office')!.id;
    for (const cmd of [
      { kind: 'hire', room: office, role: 'role.doctor', shift: 'day' },
      { kind: 'room', type: 'room.office', x: 60, y: 30, w: 8, h: 7 },
      { kind: 'office', room: office },
      { kind: 'undo' },
    ] as const) {
      const out = apply(db, s, { kind: 'site', cmd: cmd as never });
      expect(out).toEqual([{ kind: 'site', cmd: cmd.kind, ok: false, error: { kind: 'shift' } }]);
    }
    expect(apply(db, s, { kind: 'site', cmd: { kind: 'done' } })).toEqual([]);
    // отказ — своими словами, а не «нельзя»
    expect(whyText(db, s.hospital!.site, { kind: 'shift' })).toBe(T.site.shift);
    expect(T.site.shift).not.toBe(T.site.unknown);
  });
});

describe('смена врача: ожидание результатов у себя в кабинете — время приёма', () => {
  test('«Ждать» — до следующего действия в `spent`, как в «Анамнезе»; отпустили ждать — время без него не в счёт', () => {
    const s = poly(1);
    apply(db, s, { kind: 'site', cmd: { kind: 'done' } });
    for (let i = 0; i < 600 && s.queue.length === 0; i++) apply(db, s, { kind: 'advance', seconds: 60 });
    apply(db, s, { kind: 'call', id: s.queue[0] });
    while (s.meet !== undefined) apply(db, s, { kind: 'advance', seconds: 30 });
    const p = current(s)!;
    apply(db, s, { kind: 'exam', exam: 'exam.cbc' });
    expect(p.pending.length).toBeGreaterThan(0);
    const spent = p.spent.seconds;
    apply(db, s, { kind: 'waitResults' });
    const from = s.t;
    expect(p.waitIn).toBe(from);
    while (p.pending.length > 0) apply(db, s, { kind: 'advance', seconds: 60 });
    const waited = s.t - from;
    expect(waited).toBeGreaterThan(0);
    // пока ждали, в `spent` ещё нет: окно покажет минуты приёма, когда он продолжится
    expect(p.spent.seconds).toBe(spent);
    apply(db, s, { kind: 'diagnose', id: 'cond.arvi' });
    expect(p.waitIn).toBeUndefined();
    expect(p.spent.seconds).toBe(spent + waited);
  });
});

describe('смена врача: итог', () => {
  test('по вашим приёмам — они остаются в состоянии; пришедшие — за сутки; никого не приняли — итога нет', () => {
    const s = poly(2);
    apply(db, s, { kind: 'site', cmd: { kind: 'done' } });
    expect(shiftResult(s)).toBeUndefined();
    playOwn(db, s, 'rational', 12 * H);
    const cases = ownCases(s);
    const r = shiftResult(s)!;
    expect(Object.keys(r.grades)).toEqual([...SHIFT_CATEGORIES]);
    expect(r.seen).toBe(cases.length);
    expect(cases.every(p => p.closed && !p.closed.by)).toBe(true);
    expect(r.arrived).toBe(s.summary.arrived);
    expect(r.minutes).toBe(Math.round(cases.reduce((a, p) => a + p.spent.seconds, 0) / cases.length / 60));
    expect(r.grades.speed).toBe(r.minutes <= SPEED_MINUTES[0] ? 'A' : r.minutes <= SPEED_MINUTES[1] ? 'B' : r.minutes <= SPEED_MINUTES[2] ? 'C' : 'D');
    expect(r.points).toBeGreaterThanOrEqual(0);
    expect(r.points).toBeLessThanOrEqual(3);
  }, 60_000);

  test('общая — не выше точности и не больше чем на ступень выше худшей категории', () => {
    const s = poly(2);
    apply(db, s, { kind: 'site', cmd: { kind: 'done' } });
    playOwn(db, s, 'rational', 14 * H);
    const cases = ownCases(s);
    expect(cases.length).toBeGreaterThan(3);
    for (const p of cases) Object.assign(p.closed!, { verdict: 'wrong' });
    expect([shiftResult(s)!.correct, shiftResult(s)!.grades.accuracy, shiftResult(s)!.overall]).toEqual([0, 'D', 'D']);
    for (const p of cases) {
      Object.assign(p.closed!, { verdict: 'correct' });
      Object.assign(p.closed!.grades, { defensibility: 'A', thrift: 'A', safety: 'A' });
      p.spent.seconds = 90 * 60;
    }
    const slow = shiftResult(s)!;
    expect([slow.correct, slow.grades.accuracy, slow.grades.speed, slow.overall]).toEqual([100, 'A', 'D', 'C']);
    for (const p of cases) p.spent.seconds = 20 * 60;
    expect(shiftResult(s)!.overall).toBe('A');
  }, 60_000);

  test('виртуальный врач в поликлинике: разумный — A, ждущий результаты в кабинете — B, ленивый — C, «всем один диагноз» — D', () => {
    const grade = (player: 'rational' | 'patient' | 'lazy' | 'one') => {
      const s = poly(1);
      apply(db, s, { kind: 'site', cmd: { kind: 'done' } });
      playOwn(db, s, player, 20 * H);
      return shiftResult(s)?.overall;
    };
    expect([grade('rational'), grade('patient'), grade('lazy'), grade('one')]).toEqual(['A', 'B', 'C', 'D']);
  }, 120_000);
});
