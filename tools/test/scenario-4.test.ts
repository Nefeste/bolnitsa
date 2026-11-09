// Сценарий 4 «Сердце и мозг» (spec docs/specs/2026-11-scenario-4.md, часть 1; решение владельца #219, вариант 1): сроки и
// тромболизисы по всей больнице — в итогах суток потока для ПК, у ваших приёмов и у нанятых врачей; цели сценария ПК
// «срок у N больных» и «тромболизис вовремя» считают их, а глава «Анамнеза» — по-прежнему только ваши; маршруты для срочного
// в смотровой приёмного; начало — ваша больница из сценария 3 со свободной землёй у входа скорой.
import { describe, expect, test } from 'bun:test';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { db } from '../../src/content';
import type { Mission } from '../../src/content/types';
import { missionProgress } from '../../src/engine/campaign/campaign';
import { addReady, hospitalOf, widerLot } from '../../src/engine/hospital/site';
import { siteOfPlan } from '../../src/engine/hospital/site-plan';
import { siteOfPreset } from '../../src/engine/hospital/site-preset';
import { presetStaff, withNightShift } from '../../src/engine/hospital/staff';
import { apply, hospitalCtx, isOut, newFlowShift } from '../../src/engine/shift/engine';
import type { DaySummary, Flow, ShiftState } from '../../src/engine/shift/types';
import { buildDb, CONTENT_DIR } from '../content/load';

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

describe('сценарий 4: начало — ваша больница из сценария 3 со свободной землёй у входа скорой', () => {
  const built = (() => {
    const p = siteOfPlan(db, db.sites!['site.surgery']);
    if (!p.ok) throw new Error(`site.surgery: ${p.error.kind}`);
    return p;
  })();

  test('больница начала сценария 3 — первой (с её основой, амбулаторией сценария 2); операционная и палата для оперированных — на местах симулятора экономики', () => {
    const em = db.sites!['site.emergency'];
    const p = db.sites!['site.surgery'];
    expect(p.rooms.slice(0, em.rooms.length)).toEqual(em.rooms);
    expect(p.rooms.slice(0, db.sites!['site.ambulatory'].rooms.length)).toEqual(db.sites!['site.ambulatory'].rooms);
    expect(p.benches).toEqual(em.benches);
    expect(p.rooms.slice(em.rooms.length).map(r => [r.type, r.size, r.x, r.y, r.rot])).toEqual([
      ['room.or', 'M', 55, 6, 0],
      ['room.ward', 'M', 64, 6, 0],
    ]);
    const lot = widerLot(20);
    expect([built.site.w, built.site.h]).toEqual([lot.w, lot.h]);
    // в операционной — бригада и санитар, как в конце сценария 3
    const or = built.site.rooms.find(r => r.type === 'room.or')!;
    expect(built.staff.filter(m => m.room === or.id).map(m => m.role).sort()).toEqual(['role.anesthetist', 'role.or_nurse', 'role.orderly', 'role.surgeon']);
  });

  test('свободная земля у входа скорой: кабинет КТ рядом со смотровой приёмного и палата интенсивной терапии встают', () => {
    const ct = addReady(db, built.site, 'room.ct', 'M', 52, 26, 2);
    expect(ct.ok).toBe(true);
    if (!ct.ok) return;
    expect(addReady(db, ct.site, 'room.icu', 'M', 62, 26, 2).ok).toBe(true);
  });

  test('в игре — как готовая больница: ночная смена и у операционной; все помещения работают', () => {
    const staff = withNightShift(db, built.site.rooms, built.staff);
    const or = built.site.rooms.find(r => r.type === 'room.or')!;
    expect(staff.some(m => m.room === or.id && m.shift === 'night' && m.role === 'role.surgeon')).toBe(true);
    const s = newFlowShift(db, { seed: 4, season: 'winter', hospital: hospitalOf(db, built.site), staff, flow: AUTO, economy: { cash: 300_000 } });
    expect(hospitalCtx(db, s, 10 * H).working.size).toBe(built.site.rooms.length);
  });

  test('сборка базы: основы по кругу и корпус уже, чем у основы, — ошибки', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bolnitsa-content-'));
    try {
      cpSync(CONTENT_DIR, dir, { recursive: true });
      const amb = join(dir, 'hospital/sites/ambulatory.yaml');
      const text = readFileSync(amb, 'utf8');
      if (!text.includes('id: site.ambulatory\n')) throw new Error('в записи нет id');
      writeFileSync(amb, text.replace('id: site.ambulatory\n', 'id: site.ambulatory\nbase: site.surgery\n'));
      const sur = join(dir, 'hospital/sites/surgery.yaml');
      writeFileSync(sur, readFileSync(sur, 'utf8').replace('wider: 20\n', 'wider: 10\n'));
      const errors = buildDb(dir).errors;
      expect(errors.filter(e => e.includes('основы по кругу')).sort()).toEqual([
        'site.ambulatory: основы по кругу — site.emergency → site.surgery → site.ambulatory',
        'site.emergency: основы по кругу — site.surgery → site.ambulatory → site.emergency',
        'site.surgery: основы по кругу — site.ambulatory → site.emergency → site.surgery',
      ]);
      // у амбулатории своего расширения нет, а у её новой основы — есть
      expect(errors.filter(e => e.includes('корпус уже')).sort()).toEqual([
        'site.ambulatory: корпус уже, чем у основы site.surgery (шире на 0, а у основы — на 10)',
        'site.surgery: корпус уже, чем у основы site.emergency (шире на 10, а у основы — на 20)',
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);
});
