// Рост навыка, наставник, учёба и болезнь нанятых (spec docs/specs/2026-10-staff-mood.md, разделы 3–5): на планёрке кто
// отработал сутки — на смену ближе к навыку, ступень — за 20 смен, с наставником навыка 5 той же должности в той же смене —
// за 14; зарплата сама не растёт — рынок выше, настроение падает. «Отправить учиться» — трое суток его нет, цена — пять его
// смен; вернулся — навык +1 и настроение +20. Болеет — раз в 60 смен в среднем: на смену не выходит, денег за неё нет. Отмена
// стройки рост, учёбу и болезнь не откатывает. Без смен ничего этого нет.
import { describe, expect, test } from 'bun:test';
import { db as base } from '../../src/content';
import type { ContentDb } from '../../src/content/types';
import { hospitalOf } from '../../src/engine/hospital/site';
import { siteOfPreset } from '../../src/engine/hospital/site-preset';
import { dutyOf, presetStaff, type StaffMember, wageOf, withNightShift } from '../../src/engine/hospital/staff';
import { apply, newFlowShift } from '../../src/engine/shift/engine';
import { mentorOf, stepsLeft, tenure } from '../../src/engine/shift/growth';
import { cashNow } from '../../src/engine/shift/money';
import type { Notice, ShiftState, StaffNews } from '../../src/engine/shift/types';
import { hash, site } from './site-kit';

const H = 3600;
const DAY = 86400;
const G = base.economy.staff.growth!;
/** База с другим числом болезни: `sick` — раз в столько смен; огромное — никто не болеет. */
const withSick = (sick: number): ContentDb => ({ ...base, economy: { ...base.economy, staff: { ...base.economy.staff, growth: { ...G, sick } } } });
const db = withSick(1e9);
const rec = base.presets['preset.city'];
const citySite = siteOfPreset(base, rec);
const cityHospital = hospitalOf(base, citySite);
const legacy = presetStaff(base, rec);
const shifts = withNightShift(base, citySite.rooms, legacy);
const city = (d: ContentDb, seed: number, staff: StaffMember[] = shifts, cash?: number) =>
  newFlowShift(d, { seed, season: 'winter', hospital: cityHospital, staff, flow: { perHour: 0, ambulancePerHour: 0 }, ...(cash !== undefined ? { economy: { cash } } : {}) });
function run(d: ContentDb, s: ShiftState, t: number, step = 600): Notice[] {
  const out: Notice[] = [];
  while (s.t < t) out.push(...apply(d, s, { kind: 'advance', seconds: Math.min(step, t - s.t) }));
  return out;
}
function morning(d: ContentDb, s: ShiftState): StaffNews | undefined {
  const n = run(d, s, s.day * DAY + 8 * H).find(x => x.kind === 'morning');
  expect(n).toBeDefined();
  return n!.kind === 'morning' ? n!.staff : undefined;
}
const member = (s: ShiftState, id: string) => s.staff!.find(m => m.id === id)!;
const set = (s: ShiftState, id: string, patch: Partial<StaffMember>) => {
  s.staff = s.staff!.map(m => (m.id === id ? { ...m, ...patch } : m));
};
/** Медсестра дневной смены с местом, у которой в её смене нет другой медсестры с навыком 5. */
const nurse = (s: ShiftState) => s.staff!.find(m => m.role === 'role.nurse' && m.shift === 'day' && m.room !== undefined)!;

describe('рост, учёба, болезнь', () => {
  test('числа — в economy.yaml: гипотезы частей 3–5', () => {
    expect(G).toEqual({ mentor: 150, studyDays: 3, studyCost: 5, studyMood: 20, sick: 60 });
    expect(base.economy.staff.growthDays).toBe(20);
  });

  test('стаж в начале: у людей со сменой — от 0 до 19 смен с последней ступени, из зерна; новые и без смен — с нуля', () => {
    const s = city(db, 9);
    const days = s.staff!.map(m => m.days);
    expect(Math.min(...days)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...days)).toBeLessThan(base.economy.staff.growthDays);
    // разный: растут не в одно утро
    expect(new Set(days).size).toBeGreaterThan(8);
    expect(city(db, 9).staff).toEqual(s.staff);
    expect(tenure(db, 9, legacy)).toEqual(legacy);
    // нанятый — с нуля
    const room = s.staff!.find(m => m.role === 'role.registrar' && m.shift === 'day')!.room!;
    site(db, s, { kind: 'dismiss', id: s.staff!.find(m => m.room === room && m.role === 'role.registrar' && m.shift === 'day')!.id });
    site(db, s, { kind: 'hire', room, role: 'role.registrar', shift: 'day' });
    expect(s.staff!.at(-1)!.days).toBe(0);
  }, 60_000);

  test('без смен — ни роста, ни болезни', () => {
    const d = withSick(2);
    const s = city(d, 1, legacy);
    morning(d, s);
    morning(d, s);
    expect(s.staff).toEqual(legacy);
  }, 60_000);

  test('ступень — за 20 отработанных смен; зарплата та же — рынок выше, настроение падает; в резерве не растёт', () => {
    const s = city(db, 2);
    const n = nurse(s);
    const reserve = s.staff!.find(m => m.id !== n.id && m.shift === 'day' && m.room !== undefined)!;
    set(s, n.id, { days: 18 });
    set(s, reserve.id, { days: 18, room: undefined });
    expect(stepsLeft(db, s.staff!, member(s, n.id))).toBe(2);
    expect(morning(db, s)?.grew?.some(g => g.id === n.id) ?? false).toBe(false);
    expect(member(s, n.id)).toMatchObject({ skill: 3, days: 19 });
    const news = morning(db, s);
    expect(news?.grew).toContainEqual({ id: n.id, skill: 4 });
    expect(member(s, n.id)).toMatchObject({ skill: 4, days: 0, salary: n.salary });
    expect(stepsLeft(db, s.staff!, member(s, n.id))).toBe(20);
    // зарплата — навыка 3, а навык уже 4: на ступень ниже рынка — в тот же день «зарплата ниже рынка», −3
    expect(s.moods![n.id]).toMatchObject({ v: 67, why: ['below'] });
    expect(member(s, reserve.id)).toMatchObject({ skill: 3, days: 18 });
  }, 60_000);

  test('наставник — навык 5 той же должности в той же смене: ступень за 14 смен; в другой смене — не наставник', () => {
    const s = city(db, 3);
    const n = nurse(s);
    const other = s.staff!.find(m => m.id !== n.id && m.role === n.role && m.room !== undefined)!;
    set(s, other.id, { skill: 5, shift: 'night' });
    set(s, n.id, { days: 13 });
    expect(mentorOf(s.staff!, member(s, n.id))).toBeUndefined();
    expect(stepsLeft(db, s.staff!, member(s, n.id))).toBe(7);
    set(s, other.id, { shift: 'day' });
    expect(mentorOf(s.staff!, member(s, n.id))?.id).toBe(other.id);
    expect(stepsLeft(db, s.staff!, member(s, n.id))).toBe(1);
    expect(morning(db, s)?.grew).toContainEqual({ id: n.id, skill: 4 });
    // навык 5 не растёт
    expect(member(s, other.id)).toMatchObject({ skill: 5 });
    expect(stepsLeft(db, s.staff!, member(s, other.id))).toBeUndefined();
  }, 60_000);

  test('«Отправить учиться»: трое суток его нет, пять смен из кассы; вернулся — навык +1, настроение +20; отмены нет', () => {
    const s = city(db, 4, shifts, 500_000);
    const n = nurse(s);
    run(db, s, 14 * H);
    // касса — по эту минуту: любая команда стройки сперва дописывает зарплаты и содержание; отменять пока нечего
    expect(site(db, s, { kind: 'undo' }, false)).toMatchObject({ ok: false, error: { kind: 'nothing' } });
    const cash = cashNow(s)!;
    const r = site(db, s, { kind: 'study', id: n.id });
    expect(r.cost).toBe(G.studyCost * wageOf(db, n));
    expect(cashNow(s)).toBe(cash - r.cost!);
    expect(s.economy!.ledger!.expenses.study).toBe(r.cost);
    // с 14:00 первых суток — до планёрки не раньше чем через трое суток: 08:00 пятых
    expect(member(s, n.id).away).toEqual({ why: 'study', until: 4 * DAY + 8 * H });
    expect(dutyOf(db, s.staff!, s.t).some(m => m.id === n.id)).toBe(false);
    // уже учится — нечего
    expect(site(db, s, { kind: 'study', id: n.id }, false)).toMatchObject({ ok: false, error: { kind: 'nothing' } });
    // в отмене стройки её нет
    expect(site(db, s, { kind: 'undo' }, false)).toMatchObject({ ok: false, error: { kind: 'nothing' } });
    // пока учится, не работает — и не растёт от смен
    const days = member(s, n.id).days;
    for (let i = 0; i < 3; i++) {
      expect(morning(db, s)?.back).toBeUndefined();
      expect(member(s, n.id).days).toBe(days);
    }
    const back = morning(db, s);
    expect(back?.back).toEqual([{ id: n.id, skill: 4 }]);
    expect(member(s, n.id).away).toBeUndefined();
    expect(member(s, n.id)).toMatchObject({ skill: 4, days: 0 });
    // настроение: тяга к 70 и +20 после планёрки
    expect(s.moods![n.id].v).toBe(90);
    expect(dutyOf(db, s.staff!, s.t).some(m => m.id === n.id)).toBe(true);
    // навык 5 — учиться нечему; касса ниже предела — ждёт денег
    set(s, n.id, { skill: 5 });
    expect(site(db, s, { kind: 'study', id: n.id }, false)).toMatchObject({ ok: false, error: { kind: 'nothing' } });
    const other = s.staff!.find(m => m.id !== n.id && m.shift === 'day' && m.room !== undefined && m.skill < 5)!;
    s.economy!.cash = -db.money!.overdraft;
    expect(site(db, s, { kind: 'study', id: other.id }, false)).toMatchObject({ ok: false, error: { kind: 'money' } });
  }, 120_000);

  test('болезнь: на смену не выходит до следующей планёрки, зарплата за неё — назад; раз в 60 смен в среднем', () => {
    const d = withSick(2);
    const s = city(d, 5, shifts, 500_000);
    const news = morning(d, s);
    const sick = news?.sick ?? [];
    // половина тех, кто работает
    const working = s.staff!.filter(m => m.room !== undefined).length;
    expect(sick.length).toBeGreaterThan(working / 4);
    expect(sick.length).toBeLessThan((working * 3) / 4);
    for (const id of sick) expect(member(s, id).away).toEqual({ why: 'sick', until: 2 * DAY + 8 * H });
    expect(dutyOf(d, s.staff!, s.t).some(m => sick.includes(m.id))).toBe(false);
    const refund = sick.reduce((n, id) => n + wageOf(d, member(s, id)), 0);
    expect(s.economy!.ledger!.expenses.salaries).toBe(-refund);
    // к следующей планёрке поправились; заболели другие — из ветви зерна по человеку и суткам
    const next = morning(d, s)?.sick ?? [];
    for (const id of sick.filter(x => !next.includes(x))) expect(member(s, id).away).toBeUndefined();
    // по-настоящему — раз в 60: городская, 30 суток
    const d60 = withSick(60);
    const t = city(d60, 6);
    let count = 0;
    let shiftsWorked = 0;
    for (let i = 0; i < 30; i++) {
      shiftsWorked += t.staff!.filter(m => m.room !== undefined && !m.away).length;
      count += morning(d60, t)?.sick?.length ?? 0;
    }
    expect(count).toBeGreaterThan(shiftsWorked / 60 / 2);
    expect(count).toBeLessThan((shiftsWorked / 60) * 2);
  }, 180_000);

  test('отмена стройки не откатывает рост и отлучки, а место, смену и зарплату — возвращает', () => {
    const s = city(db, 7);
    const n = nurse(s);
    const other = s.staff!.find(m => m.id !== n.id && m.shift === 'day' && m.room !== undefined)!;
    site(db, s, { kind: 'raise', id: other.id });
    set(s, n.id, { days: 19 });
    morning(db, s);
    expect(member(s, n.id).skill).toBe(4);
    site(db, s, { kind: 'undo' });
    expect(member(s, n.id)).toMatchObject({ skill: 4, days: 0 });
    expect(member(s, other.id).salary).toBe(other.salary);
  }, 60_000);

  test('те же зерно и команды — то же при любом шаге часов', () => {
    const play = (step: number) => {
      const d = withSick(10);
      const s = city(d, 8, shifts, 500_000);
      const n = nurse(s);
      set(s, n.id, { days: 17 });
      run(d, s, 10 * H, step);
      site(d, s, { kind: 'study', id: s.staff!.find(m => m.id !== n.id && m.shift === 'day' && m.room !== undefined)!.id });
      const notices = run(d, s, 5 * DAY + 9 * H, step);
      return { staff: s.staff, moods: s.moods, cash: cashNow(s), news: notices.flatMap(x => (x.kind === 'morning' && x.staff ? [x.staff] : [])) };
    };
    const a = play(60);
    expect(a.news.some(x => x.sick) && a.news.some(x => x.grew) && a.news.some(x => x.back)).toBe(true);
    expect(hash(play(7200))).toBe(hash(a));
  }, 300_000);
});
