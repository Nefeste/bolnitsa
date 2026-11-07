// Направление к специалисту (spec docs/specs/2026-10-specialists.md, часть 2; решение владельца #112, «вариант 2»):
// нанятый терапевт не уверен, его ведущая гипотеза — ни в чьём профиле, а вторая — в профиле специалиста, который сейчас
// принимает, — направляет к нему, а не просит вас; специалист ведёт направленного с поправкой профиля `consults.refer`; без
// этого числа не направляют; при любом шаге часов — то же. Вы — «Направить к …» из своего кабинета: к специалисту, со всем,
// что узнано; к терапевту, пока идёт к вам и пока ждёт результатов — нельзя. В сменах «Анамнеза» направления нет.
import { describe, expect, test } from 'bun:test';
import { db } from '../../src/content';
import type { ContentDb, Id } from '../../src/content/types';
import { hospitalOf } from '../../src/engine/hospital/site';
import { siteOfPreset } from '../../src/engine/hospital/site-preset';
import { PROFILE_PRIOR, presetStaff, type StaffMember, withNightShift } from '../../src/engine/hospital/staff';
import { apply, atDoctor, colleaguesOf, examsHere, isOut, newFlowShift, newShift } from '../../src/engine/shift/engine';
import { startCash } from '../../src/engine/shift/money';
import { priorOf, referTo } from '../../src/engine/shift/refer';
import type { ShiftPatient, ShiftState } from '../../src/engine/shift/types';
import { FLOW, hash, liveTo } from './site-kit';

const rec = db.presets['preset.city'];
const site = siteOfPreset(db, rec);
const staff = presetStaff(db, rec);
/** Городская больница: терапевт и три специалиста, ночная смена; поток от больницы — с записью, как в игре. */
const city = (seed: number, base: ContentDb = db) =>
  newFlowShift(base, {
    seed, season: 'winter', hospital: hospitalOf(base, site), staff: withNightShift(base, site.rooms, presetStaff(base, rec)), flow: { perHour: 0, auto: true },
    economy: { cash: startCash(base, 'preset') },
  });
/** База без числа направления: нанятые не направляют. */
const noRefer = (): ContentDb => {
  const { refer: _, ...rest } = db.consults!;
  return { ...db, consults: rest };
};
const member = (role: Id): StaffMember => staff.find(m => m.role === role)!;
const profiled = (id: Id) => Object.values(db.roles).some(r => r.profile?.includes(id));
const END = 20 * 3600;

/**
 * Двое суток до 20:00, на просьбы — сразу «пусть решает сам»: первый, кого терапевт направил сам, и о ком просили. Направляет
 * он редко: у города один терапевт, и с 0.64.1 привезённых скорой зовут по срочности наравне с прочими (spec
 * docs/specs/2026-11-scenario-2.md, «Замер»), — днём он больше в смотровой.
 */
const SENT_END = 44 * 3600;
function firstSent(base: ContentDb, seed: number): { s: ShiftState; p?: ShiftPatient; asked: Set<string> } {
  const s = city(seed, base);
  const asked = new Set<string>();
  while (s.t < SENT_END) {
    for (const n of apply(base, s, { kind: 'advance', seconds: 60 })) if (n.kind === 'consult') asked.add(n.id);
    for (const c of [...(s.consults ?? [])]) apply(base, s, { kind: 'consult', id: c.id, answer: 'self' });
    const p = Object.values(s.patients).find(x => x.ref !== undefined);
    if (p) return { s, p, asked };
  }
  return { s, asked };
}

/** Зёрна по порядку — первое, где терапевт направил сам: на нём и проверки (одно и то же для обоих тестов). */
const SEEDS = [5, 10, 11, 1, 2, 3, 4, 6, 7, 8, 9, 12];
let sentSeed: number | undefined;
function seedSent(): number {
  sentSeed ??= SEEDS.find(seed => firstSent(db, seed).p !== undefined);
  if (sentSeed === undefined) throw new Error('ни на одном зерне терапевт не направил сам');
  return sentSeed;
}

describe('поправка профиля и к кому направить — чистые функции', () => {
  const gastro = member('role.gastroenterologist');
  const endo = member('role.endocrinologist');
  const therapist = member('role.therapist');
  const ids = db.roles['role.gastroenterologist'].profile!;

  test('записан — ×PROFILE_PRIOR; направлен — ×consults.refer; к другому, к терапевту или без числа — нет', () => {
    expect(priorOf(db, { to: gastro.id }, gastro)).toEqual({ ids, x: PROFILE_PRIOR });
    expect(priorOf(db, { ref: gastro.id }, gastro)).toEqual({ ids, x: db.consults!.refer! });
    expect(priorOf(db, {}, gastro)).toBeUndefined();
    expect(priorOf(db, { ref: endo.id }, gastro)).toBeUndefined();
    expect(priorOf(db, { ref: therapist.id }, therapist)).toBeUndefined();
    expect(priorOf(noRefer(), { ref: gastro.id }, gastro)).toBeUndefined();
    // число направления — не больше записанных: направляют по подозрению, а записываются с болезнью профиля
    expect(db.consults!.refer!).toBeGreaterThanOrEqual(1);
    expect(db.consults!.refer!).toBeLessThanOrEqual(PROFILE_PRIOR);
  });

  test('ведущая ни в чьём профиле, вторая — в профиле работающего: к нему; ведущая из профиля, обе мимо или одна — нет', () => {
    const none = Object.keys(db.conditions).find(id => db.conditions[id].presenting && !profiled(id))!;
    const g = ids[0];
    const e = db.roles['role.endocrinologist'].profile![0];
    const list = [gastro, endo];
    expect(referTo(db, list, [{ id: none, p: 0.5 }, { id: g, p: 0.3 }])).toBe(gastro);
    expect(referTo(db, list, [{ id: none, p: 0.5 }, { id: e, p: 0.3 }])).toBe(endo);
    expect(referTo(db, list, [{ id: e, p: 0.5 }, { id: g, p: 0.3 }])).toBeUndefined();
    expect(referTo(db, list, [{ id: none, p: 0.5 }, { id: none, p: 0.3 }])).toBeUndefined();
    expect(referTo(db, list, [{ id: none, p: 0.9 }])).toBeUndefined();
    // специалиста с этим профилем сейчас нет — некуда
    expect(referTo(db, [endo], [{ id: none, p: 0.5 }, { id: g, p: 0.3 }])).toBeUndefined();
  });
});

describe('нанятый терапевт направляет сам', () => {
  test('не уверен, вторая гипотеза — из профиля работающего: направил к нему, а не просил; специалист ведёт и закрывает', () => {
    const { s, p, asked } = firstSent(db, seedSent());
    expect(p).toBeDefined();
    const to = s.staff!.find(m => m.id === p!.ref)!;
    expect(db.roles[to.role].profile).toBeDefined();
    expect(p!.by).toBe(to.id);
    // не просил: ни просьбы, ни отметки
    expect(asked.has(p!.id)).toBe(false);
    expect(p!.asked).toBeUndefined();
    // в пути — «направлен», и кем: терапевтом; в итогах его дня — направленный
    const steps = s.journeys!.of[p!.id].steps;
    const own = steps[steps.length - 1];
    expect(own).toMatchObject({ k: 'own', by: to.id, refer: true });
    const from = s.staff!.find(m => m.id === (own as { from?: string }).from)!;
    expect(db.roles[from.role].profile).toBeUndefined();
    expect(s.summary.colleagues![from.id].sent).toBe(1);
    // специалист позвал его и закрыл случай
    const id = p!.id;
    while (!p!.closed && s.t < SENT_END + 3 * 3600) apply(db, s, { kind: 'advance', seconds: 60 });
    expect(p!.closed?.by ?? s.gone?.find(r => r.id === id)?.by).toBe(to.id);
  }, 120_000);

  test('без числа `consults.refer` — не направляют: тот же больной — просьба посмотреть', () => {
    const seed = seedSent();
    const { p: sent } = firstSent(db, seed);
    const { p, asked } = firstSent(noRefer(), seed);
    expect(p).toBeUndefined();
    expect(asked.has(sent!.id)).toBe(true);
  }, 120_000);

  test('при любом шаге часов — те же направленные, к тем же, в тот же час', () => {
    const run = (step: number) => {
      const s = city(5);
      while (s.t < END) apply(db, s, { kind: 'advance', seconds: Math.min(step, END - s.t) });
      const sent = Object.values(s.patients).filter(p => p.ref !== undefined).map(p => ({ id: p.id, ref: p.ref, own: s.journeys!.of[p.id].steps.find(x => x.k === 'own') }));
      return { sent, colleagues: s.summary.colleagues };
    };
    const a = run(60);
    expect(a.sent.length).toBeGreaterThan(0);
    expect(hash(run(900))).toBe(hash(a));
  }, 120_000);
});

describe('«Направить к …» из вашего кабинета', () => {
  /** Городская с потоком тестов: первый пришедший сам, кого никто не звал, — в 10:00 или позже. */
  function free(s: ShiftState): ShiftPatient {
    liveTo(db, s, 10);
    const pick = () => s.queue.find(id => !s.patients[id].by && s.patients[id].calledT === undefined && s.patients[id].kind !== 'ambulance');
    for (let i = 0; i < 240 && !pick(); i++) apply(db, s, { kind: 'advance', seconds: 60 });
    return s.patients[pick()!];
  }
  /** Часы идут, пока `ok`. */
  function wait(s: ShiftState, ok: () => boolean) {
    for (let i = 0; i < 2000 && !ok(); i++) apply(db, s, { kind: 'advance', seconds: 15 });
    expect(ok()).toBe(true);
  }

  test('к специалисту, со всем, что узнано; пока идёт к вам, к терапевту и с анализом в пути — нельзя', () => {
    const s = newFlowShift(db, { seed: 7, season: 'winter', hospital: hospitalOf(db, site), staff, flow: FLOW });
    const p = free(s);
    const gastro = colleaguesOf(db, s).find(m => m.role === 'role.gastroenterologist')!;
    const therapist = colleaguesOf(db, s).find(m => m.role === 'role.therapist')!;
    apply(db, s, { kind: 'call', id: p.id });
    // идёт к вам — приём не начат
    apply(db, s, { kind: 'refer', to: gastro.id });
    expect([s.current, p.by]).toEqual([p.id, undefined]);
    wait(s, () => s.meet === undefined);
    // вопрос и анализ: пока анализ в пути — нельзя
    const q = Object.values(db.exams).find(e => e.kind === 'ask' && atDoctor(db, s, p, e.id))!;
    apply(db, s, { kind: 'exam', exam: q.id });
    const lab = examsHere(db, s).find(id => db.exams[id].kind === 'lab' && !p.done.includes(id))!;
    apply(db, s, { kind: 'exam', exam: lab });
    expect(p.pending.length).toBeGreaterThan(0);
    apply(db, s, { kind: 'refer', to: gastro.id });
    expect([s.current, p.by]).toEqual([p.id, undefined]);
    wait(s, () => p.pending.length === 0 && !isOut(s, p));
    // к терапевту — нельзя: направляют к специалисту
    apply(db, s, { kind: 'refer', to: therapist.id });
    expect([s.current, p.by]).toEqual([p.id, undefined]);
    const done = [...p.done];
    apply(db, s, { kind: 'refer', to: gastro.id });
    expect([s.current, p.by, p.ref]).toEqual([undefined, gastro.id, gastro.id]);
    // ждёт специалиста или он уже позвал: свободный зовёт направленного сразу
    expect(['waiting', 'inRoom']).toContain(p.status);
    expect(p.done).toEqual(done);
    expect(done).toContain(q.id);
    expect(done).toContain(lab);
    // в пути — направлен вами: без `from`; дальше — у специалиста
    const steps = s.journeys!.of[p.id].steps;
    const own = [...steps].reverse().find(x => x.k === 'own')!;
    expect(own).toEqual({ t: own.t, k: 'own', by: gastro.id, refer: true });
    // специалист позвал его и закрыл случай
    const id = p.id;
    wait(s, () => p.closed !== undefined || s.gone?.some(r => r.id === id) === true);
    expect(p.closed?.by ?? s.gone?.find(r => r.id === id)?.by).toBe(gastro.id);
  }, 120_000);
});

test('смены «Анамнеза» — без направления', () => {
  const s = newShift(db, { seed: 5, season: 'winter' });
  for (let i = 0; i < 48 && s.dayOpen; i++) apply(db, s, { kind: 'advance', seconds: 600 });
  expect(Object.values(s.patients).some(p => p.ref !== undefined)).toBe(false);
  expect(apply(db, s, { kind: 'refer', to: 'x' })).toEqual([]);
});
