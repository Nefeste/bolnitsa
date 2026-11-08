// Случай дня (spec docs/specs/2026-11-doctor-shift.md, часть 3): зерно дня — из даты и номера базы; подбор — трудная решаемая
// загадка, как в «Анамнезе» (мера `difficulty.ts` — его копия); смена дня — городская больница без потока, принимаете только
// вы, больной дня приходит в 08:00 — тот же, что подобрал подбор, и ждёт вас сколько нужно; приём закрыт — итог дня, один раз.
import { describe, expect, test } from 'bun:test';
import { db } from '../../src/content';
import { Rng } from '../../src/engine/core/rng';
import { doorRow, HARD_ROW } from '../../src/engine/med/difficulty';
import { complaintObservations } from '../../src/engine/med/exams';
import { startRational } from '../../src/engine/med/policy';
import { reviewBeliefs } from '../../src/engine/med/review';
import { hospitalOf } from '../../src/engine/hospital/site';
import { siteOfPreset } from '../../src/engine/hospital/site-preset';
import { presetStaff, withNightShift } from '../../src/engine/hospital/staff';
import { apply, newFlowShift } from '../../src/engine/shift/engine';
import type { ShiftState } from '../../src/engine/shift/types';
import { dailyRows, parseDaily, readDaily, recordDaily, writeDaily } from '../../src/app/daily';
import { dailyCandidates, dailyCaseSeed, dailyPatient } from '../../src/sim/daily';
import { dailyDays, dailySeed, dayOf, isDay, seasonOfDay } from '../../src/sim/days';
import { createSim } from '../../src/sim/host';
import { playOwn } from '../sim/doctor-player';

const H = 3600;
const rec = db.presets['preset.city'];

function dailyShift(day: string): { s: ShiftState; seed: number } {
  const site = siteOfPreset(db, rec);
  const seed = dailyCaseSeed(db, day);
  const s = newFlowShift(db, {
    seed: 1, season: seasonOfDay(day), hospital: hospitalOf(db, site), staff: withNightShift(db, site.rooms, presetStaff(db, rec)), flow: { perHour: 0 }, solo: true, daily: seed,
  });
  return { s, seed };
}

describe('случай дня: день и зерно', () => {
  test('день — по часам компьютера; последние 30 дней, сегодня первым; зерно — от даты и номера базы', () => {
    expect(dayOf(new Date(2026, 10, 8))).toBe('2026-11-08');
    const days = dailyDays(new Date(2026, 0, 2));
    expect(days.length).toBe(30);
    expect(days.slice(0, 3)).toEqual(['2026-01-02', '2026-01-01', '2025-12-31']);
    expect(days.every(isDay)).toBe(true);
    expect(isDay('2026-1-2')).toBe(false);
    expect(dailySeed('2026-11-08', 78)).toBe(dailySeed('2026-11-08', 78));
    expect(dailySeed('2026-11-08', 78)).not.toBe(dailySeed('2026-11-07', 78));
    expect(dailySeed('2026-11-08', 78)).not.toBe(dailySeed('2026-11-08', 79));
    expect(['2026-01-15', '2026-04-15', '2026-07-15', '2026-10-15'].map(seasonOfDay)).toEqual(['winter', 'spring', 'summer', 'autumn']);
  });

  test('подбор — трудная загадка: в ряду у двери пять и больше, правда — не первая; разумный врач со всеми обследованиями её решает', () => {
    const cands = dailyCandidates(db);
    const exams = Object.keys(db.exams).sort();
    for (const day of ['2026-11-08', '2026-07-03', '2026-01-15', '2026-03-29']) {
      const seed = dailyCaseSeed(db, day);
      expect(dailyCaseSeed(db, day)).toBe(seed);
      const patient = dailyPatient(db, seed, day);
      const door = reviewBeliefs(db, patient, cands, complaintObservations(patient));
      expect(doorRow(door)).toBeGreaterThanOrEqual(HARD_ROW);
      expect(door[0].id).not.toBe(patient.truth.conditions[0].id);
      expect(startRational(db, patient, Rng.seeded(seed).fork('visit').fork('review'), { candidates: [...cands], exams }).result().correct).toBe(true);
    }
  }, 120_000);
});

describe('случай дня: смена', () => {
  test('в 08:00 приходит больной дня — тот же, что подобран; других нет; он ждёт вас сколько нужно', () => {
    const day = '2026-11-08';
    const { s, seed } = dailyShift(day);
    expect(s.meta.solo).toBe(true);
    while (s.t < 8 * H + 5 * 60) apply(db, s, { kind: 'advance', seconds: 60 });
    const came = Object.values(s.patients);
    expect(came.length).toBe(1);
    const p = came[0];
    expect(p.daily).toBe(true);
    expect(p.kind).toBe('walkIn');
    const want = dailyPatient(db, seed, day);
    expect([p.patient.truth.conditions[0].id, p.patient.sex, p.patient.age, p.patient.complaints]).toEqual([want.truth.conditions[0].id, want.sex, want.age, want.complaints]);
    // полдня — никого больше, а он ждёт
    while (s.t < 16 * H) apply(db, s, { kind: 'advance', seconds: 600 });
    expect(Object.keys(s.patients)).toEqual([p.id]);
    expect(s.patients[p.id].status).toBe('waiting');
    expect(s.summary.left).toBe(0);
  }, 60_000);

  test('поток расчёта: смена дня — без потока и без конца в 20:00; приём закрыт — итог дня, один раз', () => {
    const day = '2026-07-03';
    const sim = createSim(db);
    const site = siteOfPreset(db, rec);
    const first = sim.handle({ kind: 'start', seed: 2, season: 'winter', hospital: hospitalOf(db, site), staff: withNightShift(db, site.rooms, presetStaff(db, rec)), flow: { perHour: 0 }, daily: day });
    expect(first.kind).toBe('slice');
    // снимок потока — то же состояние, что у него (в одном процессе — без копии)
    const saved = sim.handle({ kind: 'save' });
    if (saved.kind !== 'state') throw new Error(saved.kind);
    const s = saved.state;
    expect([s.meta.solo, s.meta.daily, s.meta.season]).toEqual([true, dailyCaseSeed(db, day), 'summer']);
    // врач ведёт свой приём, как разумный игрок, — до закрытия
    playOwn(db, s, 'rational', 18 * H);
    const p = Object.values(s.patients).find(x => x.daily)!;
    expect(p.closed).toBeDefined();
    const ends = [];
    for (let i = 0; i < 3; i++) {
      const out = sim.handle({ kind: 'tick', seconds: 60, budgetMs: 50 });
      if (out.kind === 'slice' && out.daily) ends.push(out.daily);
    }
    expect(ends).toEqual([{ id: p.id, verdict: p.closed!.verdict, grade: p.closed!.grades.overall }]);
  }, 120_000);
});

describe('случай дня: итоги дней', () => {
  const memory = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  };

  test('засчитывается первая попытка; переиграть можно — итог дня тот же', () => {
    const one = recordDaily({}, '2026-11-08', { verdict: 'partly', grade: 'B', base: 78 });
    expect(one.first).toBe(true);
    const two = recordDaily(one.records, '2026-11-08', { verdict: 'correct', grade: 'A', base: 78 });
    expect(two.first).toBe(false);
    expect(two.records['2026-11-08']).toEqual({ verdict: 'partly', grade: 'B', base: 78 });
  });

  test('хранятся последние 60 дней; чужое и испорченное — прочь; без хранилища — пусто', () => {
    let r = {};
    for (let i = 0; i < 70; i++) r = recordDaily(r, `2026-0${1 + Math.floor(i / 28)}-${String(1 + (i % 28)).padStart(2, '0')}`, { verdict: 'wrong', grade: 'D', base: 78 }).records;
    expect(Object.keys(r).length).toBe(60);
    expect(Object.keys(r).sort()[0]).toBe('2026-01-11');
    const store = memory();
    writeDaily({ '2026-11-08': { verdict: 'correct', grade: 'A', base: 78 } }, store);
    expect(readDaily(store)).toEqual({ '2026-11-08': { verdict: 'correct', grade: 'A', base: 78 } });
    expect(parseDaily('{"2026-11-08":{"verdict":"great","grade":"A","base":78},"x":{"verdict":"correct","grade":"A","base":1}}')).toEqual({});
    expect(parseDaily('not json')).toEqual({});
    expect(readDaily(undefined)).toEqual({});
  });

  test('список — последние 30 дней, сегодня первым, у сыгранных — итог', () => {
    const rows = dailyRows(new Date(2026, 10, 8), { '2026-11-07': { verdict: 'correct', grade: 'A', base: 78 } });
    expect(rows.length).toBe(30);
    expect(rows.slice(0, 2)).toEqual([{ day: '2026-11-08' }, { day: '2026-11-07', record: { verdict: 'correct', grade: 'A', base: 78 } }]);
  });
});
