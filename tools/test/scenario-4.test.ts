// Сценарий 4 «Сердце и мозг» (spec docs/specs/2026-11-scenario-4.md, часть 1; решение владельца #219, вариант 1): сроки и
// тромболизисы по всей больнице — в итогах суток потока для ПК, у ваших приёмов и у нанятых врачей; цели сценария ПК
// «срок у N больных» и «тромболизис вовремя» считают их, а глава «Анамнеза» — по-прежнему только ваши.
import { describe, expect, test } from 'bun:test';
import { db } from '../../src/content';
import type { Mission } from '../../src/content/types';
import { missionProgress } from '../../src/engine/campaign/campaign';
import { hospitalOf } from '../../src/engine/hospital/site';
import { siteOfPreset } from '../../src/engine/hospital/site-preset';
import { presetStaff, withNightShift } from '../../src/engine/hospital/staff';
import { apply, isOut, newFlowShift } from '../../src/engine/shift/engine';
import type { DaySummary, Flow, ShiftState } from '../../src/engine/shift/types';

const AUTO: Flow = { perHour: 0, auto: true };
const H = 3600;
const rec = db.presets['preset.city'];

function city(seed: number): ShiftState {
  const site = siteOfPreset(db, rec);
  const s = newFlowShift(db, { seed, season: 'winter', hospital: hospitalOf(db, site), staff: withNightShift(db, site.rooms, presetStaff(db, rec)), flow: AUTO, economy: { cash: 5_000_000 } });
  apply(db, s, { kind: 'site', cmd: { kind: 'done' } });
  return s;
}

function run(s: ShiftState, until: number) {
  while (s.t < until) apply(db, s, { kind: 'advance', seconds: Math.min(600, until - s.t) });
}

describe('сроки по всей больнице в итогах суток', () => {
  test('нанятые врачи закрывают приёмы со сроками — они в итогах суток; ваших среди них нет — «ваши» пусты', () => {
    let all = 0;
    for (const seed of [1, 2, 3]) {
      const s = city(seed);
      run(s, 56 * H + 60);
      for (const d of s.history) {
        expect(d.targets).toBeUndefined();
        for (const [id, x] of Object.entries(d.allTargets ?? {})) {
          expect(db.targets[id]).toBeDefined();
          expect(x.onTime).toBeLessThanOrEqual(x.total);
          // оценки по порядку закрытия — по одной на приём со сроком
          expect(d.allSeq?.[id]?.length).toBe(x.total);
          all += x.total;
        }
      }
    }
    expect(all).toBeGreaterThan(0);
  }, 120_000);
});

describe('цели сроков: сценарий ПК — по всей больнице, глава «Анамнеза» — по вашим', () => {
  const day = (i: number, x: Partial<DaySummary>): DaySummary => ({ ...city(1).summary, day: i + 1, ...x });
  const history = [day(0, { allSeq: { 'target.ecg_chest_pain': 'AB' }, targetSeq: { 'target.ecg_chest_pain': 'B' } }), day(1, { allSeq: { 'target.ecg_chest_pain': 'AA' }, allLysis: { good: 2, bad: 1 }, lysis: { good: 1, bad: 0 } })];
  const view = (chapter: string) => ({ campaign: { chapter, since: 0, done: {}, letters: [] }, history });
  const deadline: Mission = { id: 'd', main: true, text: { ru: '' }, kind: 'deadline', target: 'target.ecg_chest_pain', count: 3 };
  const lysis: Mission = { id: 'l', main: false, text: { ru: '' }, kind: 'thrombolysis', count: 2 };

  test('сценарий ПК: «срок у N больных» — оценки «A» всех приёмов; тромболизисы — всех', () => {
    expect(missionProgress(db, view('scenario.surgery'), deadline)).toMatchObject({ value: 3, target: 3, done: true });
    expect(missionProgress(db, view('scenario.surgery'), lysis)).toMatchObject({ value: 2, done: true });
  });

  test('глава «Анамнеза»: только ваши приёмы, как прежде', () => {
    const chapter = Object.keys(db.chapters)[0];
    expect(missionProgress(db, view(chapter), deadline)).toMatchObject({ value: 0, done: false });
    expect(missionProgress(db, view(chapter), lysis)).toMatchObject({ value: 1, done: false });
  });
});

describe('маршруты для срочного (решение владельца #219, вариант 1)', () => {
  const ROUTES = ['route.ecg_chest_pain', 'route.stroke_ct'];
  const cards = (s: ShiftState) => [...Object.values(s.patients), ...(s.past ?? []).map(x => x.p)];

  test('команда: включает только известные маршруты, пусто — выключает все', () => {
    const s = city(1);
    apply(db, s, { kind: 'routes', on: [...ROUTES, 'route.nope'] });
    expect(s.meta.routes).toEqual(ROUTES);
    apply(db, s, { kind: 'routes', on: [] });
    expect(s.meta.routes).toBeUndefined();
  });

  test('с маршрутами: медсестра снимает ЭКГ при боли в груди в первые минуты, везёт на КТ при признаках инсульта; пока он на КТ, его не зовут', () => {
    let ecg = 0;
    let ct = 0;
    let called = 0;
    for (const seed of [1, 2, 3]) {
      const s = city(seed);
      apply(db, s, { kind: 'routes', on: ROUTES });
      const back = new Map<string, number>();
      while (s.t < 32 * H) {
        apply(db, s, { kind: 'advance', seconds: 300 });
        // на КТ по маршруту — не позван, пока его не привезут назад
        for (const p of Object.values(s.patients)) {
          if (!isOut(s, p) || !p.routed?.includes('route.stroke_ct') || p.status !== 'waiting') continue;
          expect(p.calledT).toBeUndefined();
          back.set(p.id, p.out!.back);
        }
      }
      // привезли назад — зовут: не раньше, чем вернули
      for (const p of cards(s)) {
        const at = back.get(p.id);
        if (at === undefined || p.calledT === undefined) continue;
        expect(p.calledT).toBeGreaterThanOrEqual(at);
        called++;
      }
      for (const p of cards(s)) {
        if (p.routed?.includes('route.ecg_chest_pain')) {
          ecg++;
          // ЭКГ у постели — результат в первые минуты после приезда (место в смотровой — сразу или когда освободилось)
          const r = p.results.find(x => x.exam === 'exam.ecg')!;
          expect(r).toBeDefined();
          expect(db.targets['target.ecg_chest_pain'].complaints.some(f => p.patient.complaints.includes(f))).toBe(true);
        }
        if (p.routed?.includes('route.stroke_ct')) {
          ct++;
          expect(p.done).toContain('exam.ct_head');
        }
      }
      const day = s.history[0].routes ?? {};
      expect((day['route.ecg_chest_pain']?.n ?? 0) + (day['route.stroke_ct']?.n ?? 0)).toBeGreaterThan(0);
    }
    expect(ecg).toBeGreaterThan(0);
    expect(ct).toBeGreaterThan(0);
    expect(called).toBeGreaterThan(0);
  }, 180_000);

  test('без маршрутов — никого по маршруту и строки маршрутов в итогах нет', () => {
    const s = city(1);
    run(s, 32 * H + 60);
    expect(cards(s).some(p => p.routed !== undefined)).toBe(false);
    expect(s.history[0].routes).toBeUndefined();
  }, 120_000);
});
