// Сидя или стоя — по своему залу (spec docs/specs/2026-10-own-hall.md; решение владельца 18.10.2026): свой зал — зона
// ожидания не дальше `inflow.hall` м от двери кабинета врача, к которому записан пришедший. В нём есть место — сидит, терпение
// как есть; своего зала нет или он полон — стоит у двери кабинета, ждать готов вдвое меньше; вернулся с результатами — снова
// у двери. Без числа — как прежде, по местам всей больницы. Те же зерно и команды — то же при любом шаге часов.
import { describe, expect, test } from 'bun:test';
import { db } from '../../src/content';
import type { ContentDb } from '../../src/content/types';
import { hospitalOf } from '../../src/engine/hospital/site';
import { siteOfPlan } from '../../src/engine/hospital/site-plan';
import { siteOfPreset } from '../../src/engine/hospital/site-preset';
import { presetStaff } from '../../src/engine/hospital/staff';
import { metersBetween } from '../../src/engine/hospital/walk';
import { apply, hospitalCtx, newFlowShift } from '../../src/engine/shift/engine';
import { sliceOf } from '../../src/engine/shift/slice';
import type { ShiftPatient, ShiftState } from '../../src/engine/shift/types';
import { hallNear } from '../../src/engine/shift/walking';
import { FLOW, hash, liveTo } from './site-kit';

const rec = db.presets['preset.city'];
const cityHospital = hospitalOf(db, siteOfPreset(db, rec));
const cityStaff = presetStaff(db, rec);
/** Городская больница: один зал у входа, кабинеты нанятых терапевтов — в 37–63 м от него. */
const city = (base: ContentDb, seed: number, flow = FLOW) => newFlowShift(base, { seed, season: 'winter', hospital: cityHospital, staff: cityStaff, flow });
const poly = (seed: number, perHour: number) => {
  const plan = siteOfPlan(db, db.sites!['site.polyclinic']);
  if (!plan.ok) throw new Error('поликлиника не строится');
  // без отметки «ваш» — терапевт во всех кабинетах
  return newFlowShift(db, { seed, season: 'winter', hospital: hospitalOf(db, plan.site), staff: plan.staff, flow: { perHour, ambulancePerHour: 0 } });
};
/** Та же база без числа `hall`: по местам всей больницы, как до этой задачи. */
const off: ContentDb = { ...db, inflow: { ...db.inflow!, hall: undefined } };
const walkIns = (s: ShiftState) => Object.values(s.patients).filter(p => p.kind === 'walkIn' && p.regAt !== undefined);
const officeOf = (s: ShiftState, p: ShiftPatient) => hospitalCtx(db, s).staff.find(m => m.id === p.doc)?.room;

describe('сидя или стоя — по своему залу', () => {
  test('число — 10 м, как в правилах планировки', () => {
    expect(db.inflow?.hall).toBe(10);
  });

  test('поликлиника: зал у кабинета и в нём есть место — сидит там, терпение как есть', () => {
    const s = poly(1, 6);
    const plan = hospitalCtx(db, s).plan;
    const seen = new Set<string>();
    let seated = 0;
    // каждого — в минуту прихода, пока его не позвал другой врач
    while (s.t < 12 * 3600) {
      apply(db, s, { kind: 'advance', seconds: 60 });
      for (const p of walkIns(s)) {
        if (seen.has(p.id) || p.doc === undefined) continue;
        seen.add(p.id);
        if (p.stands) continue;
        const office = officeOf(s, p)!;
        expect(p.hall).toBe(hallNear(plan, hospitalCtx(db, s).working, office));
        expect(metersBetween(plan, p.hall!, office)).toBeLessThanOrEqual(10);
        expect(p.next === undefined || p.next === office).toBe(true);
        seated++;
      }
    }
    expect(seated).toBeGreaterThan(5);
  }, 60_000);

  test('городская: зала ближе 10 м от кабинета терапевта нет — стоит у его двери, терпения вдвое меньше', () => {
    const s = city(db, 3);
    const was = city(off, 3);
    liveTo(db, s, 10);
    liveTo(off, was, 10);
    const far = walkIns(s).filter(p => p.stands === 'far');
    expect(far.length).toBeGreaterThan(3);
    for (const p of far) {
      expect(p.hall).toBeUndefined();
      // у двери: пока не позвали — `next` — кабинет его врача
      if (p.status === 'waiting' && p.next !== undefined) expect(officeOf(s, p)).toBe(p.next);
      // тот же человек без правила — терпения вдвое больше (пришёл в неполную больницу); сел у двери на скамью (spec
      // 2026-10-door-benches) — столько же
      const q = was.patients[p.id];
      const bench = s.journeys?.of[p.id]?.steps.some(x => x.k === 'queue' && x.bench);
      if (q && !q.stands && q.patience > 0) expect(p.patience).toBe(bench ? q.patience : Math.round(q.patience / 2));
    }
    // в срезе — у двери кабинета: место ожидания — кабинет, а не зал
    const slice = sliceOf(s);
    const waiting = far.filter(p => p.status === 'waiting' && p.next !== undefined && p.seatAt !== undefined && p.seatAt <= s.t);
    for (const p of waiting) expect(slice.people.find(x => x.id === p.id)).toMatchObject({ doing: 'waiting', room: p.next });
  }, 60_000);

  test('поликлиника под нагрузкой: свой зал полон — стоит у двери кабинета («full»)', () => {
    const s = poly(2, 40);
    liveTo(db, s, 11);
    const full = walkIns(s).filter(p => p.stands === 'full');
    expect(full.length).toBeGreaterThan(3);
    for (const p of full) expect(p.hall).toBeUndefined();
    // в пути пациента — почему стоял
    const steps = full.flatMap(p => s.journeys?.of[p.id]?.steps ?? []);
    expect(steps.some(x => x.k === 'queue' && x.full)).toBe(true);
  }, 60_000);

  test('вернулся с результатами к своему врачу — стоял, и снова у двери его кабинета', () => {
    const s = city(db, 4, { perHour: 12, ambulancePerHour: 0 });
    let back: ShiftPatient | undefined;
    const away = new Set<string>();
    while (!back && s.t < 16 * 3600) {
      apply(db, s, { kind: 'advance', seconds: 60 });
      for (const p of Object.values(s.patients)) {
        if (p.stands !== 'far' || p.closed) continue;
        if (p.status === 'away') away.add(p.id);
        else if (away.has(p.id) && p.status === 'waiting' && p.by !== undefined) back = p;
      }
    }
    expect(back).toBeDefined();
    const room = hospitalCtx(db, s).staff.find(m => m.id === back!.by)!.room;
    expect(back!.hall).toBeUndefined();
    expect(back!.next).toBe(room);
  }, 120_000);

  test('без числа — как прежде: садятся в ближайший зал, стоят — только когда полна вся больница', () => {
    const s = city(off, 3);
    liveTo(off, s, 10);
    const all = walkIns(s);
    expect(all.length).toBeGreaterThan(5);
    for (const p of all) {
      expect(p.hall).toBeDefined();
      if (p.stands) expect(p.stands).toBe('full');
    }
  }, 60_000);

  test('при шаге 60 и 13 с — те же стоящие и то же состояние', () => {
    const a = city(db, 5);
    const b = city(db, 5);
    liveTo(db, a, 12);
    liveTo(db, b, 12, 13);
    expect(walkIns(a).filter(p => p.stands).length).toBeGreaterThan(3);
    expect(hash(b)).toBe(hash(a));
  }, 120_000);
});
