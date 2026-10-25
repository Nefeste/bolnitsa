// Усталость и перерывы нанятых врачей (spec docs/specs/2026-10-staff-shifts.md, часть 2): усталость 0–100 растёт за часы в
// смене и за каждого принятого, ночью быстрее; с 70 врач работает дольше, с 90 ставит диагноз при меньшей уверенности;
// звать некого, а усталость не ниже 70, — идёт в ординаторскую на 20 минут, усталость падает на 50; на пределе — после
// приёма, даже если ждут; в туалет — раз в 4–5 часов на 5 минут; туда и назад — пешком. Часть 2б — так же те, кто делает
// обследования: отдыхают после записанных, обследование ждёт их возвращения. Без смен никто не устаёт.
import { describe, expect, test } from 'bun:test';
import { db } from '../../src/content';
import { hospitalOf } from '../../src/engine/hospital/site';
import { siteOfPlan } from '../../src/engine/hospital/site-plan';
import { siteOfPreset } from '../../src/engine/hospital/site-preset';
import { doctorOf, presetStaff, shiftStartOf, type StaffMember, speedOf, withNightShift } from '../../src/engine/hospital/staff';
import { backAt, blurredOf, levelOf, POINT, pointsOf, slowedOf, startRest, tiredOf } from '../../src/engine/shift/crew';
import { apply, colleaguesOf, hospitalCtx, newFlowShift } from '../../src/engine/shift/engine';
import { walkPc } from '../../src/engine/shift/walking';
import type { Rest, ShiftState } from '../../src/engine/shift/types';
import { hash, liveTo } from './site-kit';

const H = 3600;
const MIN = 60;
const F = db.economy.staff.fatigue!;
const rec = db.presets['preset.city'];
const citySite = siteOfPreset(db, rec);
const cityHospital = hospitalOf(db, citySite);
const legacy = presetStaff(db, rec);
const shifts = withNightShift(db, citySite.rooms, legacy);
/** Городская со сменами; `perHour` — пришедших сами в час (0 — врачам некого звать). */
const city = (seed: number, perHour = 6, staff: StaffMember[] = shifts) =>
  newFlowShift(db, { seed, season: 'winter', hospital: cityHospital, staff, flow: { perHour, ambulancePerHour: perHour > 0 ? 1 : 0 } });
/** Поликлиника: поток от больницы или `perHour` пришедших сами в час — больше, чем её врачи успевают принять. */
const poly = (seed: number, perHour?: number) => {
  const p = siteOfPlan(db, db.sites!['site.polyclinic']);
  if (!p.ok) throw new Error('поликлиника не строится');
  return newFlowShift(db, {
    seed, season: 'winter', hospital: hospitalOf(db, p.site), staff: withNightShift(db, p.site.rooms, p.staff),
    flow: perHour !== undefined ? { perHour } : { perHour: 0, auto: true }, economy: { cash: 2_000_000 },
  });
};
const at = (s: ShiftState, hour: number) => (s.day - 1) * 86400 + hour * H;
/** Перерывы, что были за время прогона: по номеру человека, без повторов. */
function watch(s: ShiftState, hour: number, step = 60): Record<string, Rest[]> {
  const seen: Record<string, Rest[]> = {};
  const end = (s.day - 1) * 86400 + hour * H;
  while (s.t < end) {
    apply(db, s, { kind: 'advance', seconds: Math.min(step, end - s.t) });
    for (const [id, c] of Object.entries(s.crew ?? {})) {
      const list = (seen[id] ??= []);
      if (c.rest && !list.some(r => r.from === c.rest!.from)) list.push({ ...c.rest });
    }
  }
  return seen;
}

describe('усталость и перерывы', () => {
  test('числа — в economy.yaml: гипотезы части 2', () => {
    expect(F).toEqual({ hour: 5, case: 2, exam: 1, ride: 1, night: 150, slow: 70, slower: 115, tired: 90, blur: 5, rest: 20, relief: 50, toilet: [4, 5], wc: 5 });
    expect(shiftStartOf(db, 9 * H)).toBe(8 * H);
    expect(shiftStartOf(db, 21 * H)).toBe(20 * H);
    expect(shiftStartOf(db, 86400 + 3 * H)).toBe(20 * H);
    expect(shiftStartOf(db, 86400 + 8 * H)).toBe(86400 + 8 * H);
  });

  test('без смен врачи не устают: записей нет', () => {
    const s = city(1, 6, legacy);
    liveTo(db, s, 16);
    expect(s.crew).toBeUndefined();
    for (const m of colleaguesOf(db, s)) expect(levelOf(db, s, m)).toBeUndefined();
  }, 60_000);

  test('звать некого: усталость — только за часы, ночью в полтора раза быстрее; с 70 — в ординаторскую на 20 минут', () => {
    const s = city(2, 0);
    liveTo(db, s, 13);
    const day = colleaguesOf(db, s)[0];
    // пять часов дневной смены — 25 очков
    expect(levelOf(db, s, day)).toBe(5 * F.hour * POINT);
    liveTo(db, s, 24);
    const m = colleaguesOf(db, s).find(x => x.shift === 'night')!;
    expect(m).toBeDefined();
    // ночью — в полтора раза быстрее
    expect(levelOf(db, s, m)).toBe(4 * H * F.hour * F.night);
    const rests = watch(s, 32);
    const r = rests[m.id].find(x => x.kind === 'staff')!;
    // 70 очков ночью — через 9 ч 20 мин после 20:00 (если тогда в туалете — когда вернётся)
    expect(r.from).toBeGreaterThanOrEqual(at(s, 20) - 86400 + Math.ceil((F.slow * POINT) / (F.hour * F.night)));
    expect(r.from).toBeLessThan(at(s, 8));
    const plan = hospitalCtx(db, s).plan;
    const staffRoom = citySite.rooms.find(x => x.type === 'room.staff')!.id;
    const go = walkPc(plan, m.room, staffRoom);
    expect(r).toEqual({ kind: 'staff', room: staffRoom, from: r.from, at: r.from + go, back: r.from + go + F.rest * MIN, until: r.from + 2 * go + F.rest * MIN });
  }, 120_000);

  test('перерыв: усталость на 50 меньше; пока отдыхает, не растёт, потом снова растёт', () => {
    const s = city(3, 0);
    liveTo(db, s, 21);
    const m = colleaguesOf(db, s).find(x => x.shift === 'night')!;
    let before: number | undefined;
    let rest: Rest | undefined;
    const during: number[] = [];
    const after: [number, number][] = [];
    while (s.t < at(s, 31)) {
      const was = levelOf(db, s, m)!;
      apply(db, s, { kind: 'advance', seconds: 60 });
      const c = s.crew?.[m.id];
      const l = levelOf(db, s, m)!;
      if (c?.rest?.kind === 'staff' && s.t < c.rest.until) {
        if (!rest) {
          rest = { ...c.rest };
          before = was;
        }
        during.push(l);
      } else if (rest && !c?.rest) after.push([s.t, l]);
    }
    expect(rest).toBeDefined();
    // ушёл с усталостью не ниже 70 — вернулся на 50 меньше; пока отдыхал, не росла
    expect(before!).toBeGreaterThanOrEqual(F.slow * POINT - 60 * F.hour * F.night);
    expect(during[0]).toBeLessThanOrEqual(before! + 60 * F.hour * F.night - F.relief * POINT);
    expect(new Set(during).size).toBe(1);
    // потом снова растёт: ночью — 7,5 очка в час, за минуту — 1/8 очка
    expect(after.length).toBeGreaterThan(10);
    for (let i = 1; i < after.length; i++) if (after[i][0] - after[i - 1][0] === 60) expect(after[i][1] - after[i - 1][1]).toBe(60 * F.hour * F.night);
    expect(s.summary.colleagues?.[m.id]?.rests).toBeGreaterThan(0);
  }, 120_000);

  test('в туалет — раз в 3–4 часа, на 5 минут, в ближайший санузел и назад пешком', () => {
    const s = city(4, 0);
    const day = colleaguesOf(db, s);
    const rests = watch(s, 20);
    const plan = hospitalCtx(db, s).plan;
    const toilet = citySite.rooms.find(x => x.type === 'room.toilet')!.id;
    expect(day.length).toBeGreaterThan(0);
    for (const m of day) {
      const wc = rests[m.id].filter(x => x.kind === 'toilet');
      expect(wc.length).toBeGreaterThanOrEqual(2);
      const go = walkPc(plan, m.room, toilet);
      let prev = at(s, 8);
      for (const r of wc) {
        expect(r.room).toBe(toilet);
        expect(r.until - r.from).toBe(2 * go + F.wc * MIN);
        expect(r.at - r.from).toBe(go);
        expect(r.from - prev).toBeGreaterThanOrEqual(F.toilet[0] * H);
        prev = r.until;
      }
      // первый — не позже чем через 4 часа после начала смены
      expect(wc[0].from - at(s, 8)).toBeLessThanOrEqual(F.toilet[1] * H);
    }
  }, 120_000);

  test('на перерыве и в туалете врач никого не зовёт; ждущих его — в пути пациента «врач на перерыве»', () => {
    const s = poly(5);
    let checked = 0;
    let marked = 0;
    const end = at(s, 19);
    while (s.t < end) {
      apply(db, s, { kind: 'advance', seconds: 60 });
      for (const [id, c] of Object.entries(s.crew ?? {})) {
        if (!c.rest || c.rest.until <= s.t) continue;
        // у отдыхающего нет больного в кабинете
        expect(Object.values(s.patients).some(p => p.status === 'inRoom' && p.by === id)).toBe(false);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
    for (const j of Object.values(s.journeys!.of)) for (const x of j.steps) if (x.k === 'rest') marked++;
    expect(marked).toBeGreaterThan(0);
  }, 120_000);

  test('на пределе — на перерыв после приёма, даже если ждут; с 70 — дольше, с 90 — порог ниже', () => {
    const s = poly(6, 14);
    const tired = new Set<string>();
    const seen = new Set<string>();
    const end = at(s, 19);
    let limit = 0;
    let waiting = 0;
    while (s.t < end) {
      apply(db, s, { kind: 'advance', seconds: 60 });
      for (const m of colleaguesOf(db, s)) {
        const l = levelOf(db, s, m);
        if (l === undefined) continue;
        const pts = pointsOf(l);
        // медленнее и порог ниже — ровно с этих чисел
        expect(slowedOf(db, s, m, speedOf(db, m))).toBe(pts >= F.slow ? Math.round((speedOf(db, m) * F.slower) / 100) : speedOf(db, m));
        const th = doctorOf(db, m).threshold;
        expect(blurredOf(db, s, m, th)).toBeCloseTo(pts >= F.tired ? th - F.blur / 100 : th, 10);
        expect(tiredOf(db, s, m)).toBe(pts >= F.tired ? pts : undefined);
        if (pts >= F.tired) tired.add(m.id);
        // перерыв только что начался: усталость до него — та, что после, и ещё `relief`
        const c = s.crew?.[m.id];
        const r = c?.rest;
        if (!c || !r || r.kind !== 'staff' || seen.has(`${m.id}:${r.from}`)) continue;
        seen.add(`${m.id}:${r.from}`);
        if (c.f + F.relief * POINT < 100 * POINT) continue;
        limit++;
        if (s.queue.some(x => s.patients[x].doc === m.id)) waiting++;
      }
    }
    // поликлиника с очередью весь день: врачи доходят до 90 и до предела — и уходят, хотя их ждут
    expect(tired.size).toBeGreaterThan(0);
    expect(limit).toBeGreaterThan(0);
    expect(waiting).toBeGreaterThan(0);
    // выбравший диагноз уставшим — в карте и в итогах дня
    const day = Object.values(s.summary.colleagues ?? {}).reduce((n, c) => n + (c.tired ?? 0), 0);
    expect(day).toBeGreaterThan(0);
    for (const x of s.past ?? []) if (x.p.closed?.tired !== undefined) expect(x.p.closed.tired).toBeGreaterThanOrEqual(F.tired);
  }, 120_000);

  test('нет ординаторской — отдыхает в кабинете вдвое дольше; нет санузла — в туалет не ходит', () => {
    const s = city(7, 0);
    liveTo(db, s, 9);
    const ctx = hospitalCtx(db, s);
    const m = colleaguesOf(db, s)[0];
    const working = new Set([...ctx.working].filter(id => !citySite.rooms.some(r => r.id === id && (r.type === 'room.staff' || r.type === 'room.toilet'))));
    expect(startRest(db, s, ctx.plan, working, m, 'toilet')).toBeUndefined();
    const r = startRest(db, s, ctx.plan, working, m, 'rest')!;
    expect(r).toEqual({ kind: 'here', room: m.room!, from: s.t, at: s.t, back: s.t + 2 * F.rest * MIN, until: s.t + 2 * F.rest * MIN });
    // второй раз, пока отдыхает, — нет
    expect(startRest(db, s, ctx.plan, ctx.working, m, 'rest')).toBeUndefined();
  }, 60_000);

  test('пересменка: ушедшие со сменой — без записей, пришедшие — с нуля', () => {
    const s = city(8);
    liveTo(db, s, 19);
    const day = colleaguesOf(db, s).map(m => m.id);
    expect(day.every(id => s.crew?.[id] !== undefined)).toBe(true);
    liveTo(db, s, 21);
    // запись остаётся только у того, кто ещё не вернулся с перерыва, начатого до 20:00
    for (const id of day) if (s.crew?.[id]) expect(s.crew[id].rest!.until).toBeGreaterThan(at(s, 20));
    const night = colleaguesOf(db, s)[0];
    expect(night.shift).toBe('night');
    const n = pointsOf(levelOf(db, s, night)!);
    expect(n).toBeGreaterThanOrEqual(Math.floor((F.hour * F.night) / 100));
    expect(n).toBeLessThan(30);
    // утром дневной врач снова отдохнувший
    liveTo(db, s, 33);
    const m = colleaguesOf(db, s).find(x => x.id === day[0])!;
    const d = pointsOf(levelOf(db, s, m)!);
    expect(d).toBeGreaterThanOrEqual(F.hour);
    expect(d).toBeLessThan(25);
  }, 120_000);

  // часть 2б: устают и отдыхают те, кто делает обследования — лаборант, медсестра процедурного и ЭКГ, рентгенолаборант, врач
  // УЗИ, эндоскопист
  test('обследования: кто делает — отдыхает, не бросив записанных; записанных при нём начинают, когда он вернётся', () => {
    const s = poly(11, 14);
    const p = siteOfPlan(db, db.sites!['site.polyclinic']);
    if (!p.ok) throw new Error('поликлиника не строится');
    const rests: Record<string, Rest[]> = {};
    const end = at(s, 19);
    while (s.t < end) {
      apply(db, s, { kind: 'advance', seconds: 60 });
      for (const [id, c] of Object.entries(s.crew ?? {})) {
        const list = (rests[id] ??= []);
        if (c.rest && !c.rest.planned && !list.some(r => r.from === c.rest!.from)) list.push({ ...c.rest });
      }
    }
    const exams: { room: string; at: number; start: number; end: number; rest?: string }[] = [];
    for (const j of Object.values(s.journeys!.of)) for (const x of j.steps) if (x.k === 'exam') exams.push({ room: x.room, at: x.at, start: x.start, end: x.end, ...(x.rest ? { rest: x.rest } : {}) });
    const doerOf = (room: string) => {
      const type = p.site.rooms.find(r => r.id === room)!.type;
      return s.staff!.find(m => m.room === room && m.shift === 'day' && m.role === db.rooms[type].staff[0]);
    };
    let checked = 0;
    for (const r of p.site.rooms.filter(x => ['room.xray', 'room.procedure', 'room.ecg', 'room.lab'].includes(x.type))) {
      const m = doerOf(r.id);
      expect(m).toBeDefined();
      for (const rest of rests[m!.id] ?? []) {
        // в кабинете, пока его нет, никого не обследуют: начатое — до его ухода, новое — после возвращения
        for (const x of exams.filter(e => e.room === r.id)) {
          expect(x.end <= rest.from || x.start >= rest.until).toBe(true);
          // кто ждал у кабинета, пока тот вернётся, — путь знает почему
          if (x.start === rest.until && x.start > x.at) expect(x.rest).toBe(m!.role);
        }
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(exams.some(x => x.rest !== undefined)).toBe(true);
    // устают и отдыхают не только врачи
    const tired = Object.keys(rests).filter(id => rests[id].length > 0);
    expect(tired.some(id => !colleaguesOf(db, s).some(m => m.id === id) && s.staff!.find(m => m.id === id)?.role !== 'role.therapist')).toBe(true);
  }, 180_000);

  test('нужен в час перерыва — с его конца; работа, задевшая перерыв, — тоже с его конца', () => {
    const s = poly(12);
    const m = s.staff![0];
    (s.crew ??= {})[m.id] = { f: 0, at: s.t, rest: { kind: 'staff', room: 'r1', from: 1000, at: 1100, back: 2000, until: 2100, planned: true } };
    expect(backAt(s, m, 900)).toBe(900);
    expect(backAt(s, m, 999)).toBe(999);
    expect(backAt(s, m, 1000)).toBe(2100);
    expect(backAt(s, m, 2099)).toBe(2100);
    expect(backAt(s, m, 2100)).toBe(2100);
    expect(backAt(s, m, 900, 100)).toBe(900);
    expect(backAt(s, m, 900, 101)).toBe(2100);
    expect(backAt(s, undefined, 1500)).toBe(1500);
  });

  test('при шаге 60, 7 и 1 с — то же состояние', () => {
    const a = poly(9);
    const b = poly(9);
    liveTo(db, a, 18);
    liveTo(db, b, 18, 7);
    expect(Object.keys(a.crew ?? {}).length).toBeGreaterThan(0);
    expect(hash(b)).toBe(hash(a));
    const c = poly(9);
    liveTo(db, c, 15, 60);
    liveTo(db, c, 18, 1);
    expect(hash(c)).toBe(hash(a));
  }, 300_000);
});
