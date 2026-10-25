// Настроение нанятых (spec docs/specs/2026-10-staff-mood.md, часть 1): 0–100, новый — 70; раз в сутки, на планёрке в 08:00,
// по прошедшим суткам — зарплата против рынка, предел усталости, отдых на месте без ординаторской, нет санузла, ночные подряд;
// и каждое утро — к 70 на десятую часть расстояния (не меньше 1): у постоянной причины — равновесие, ночные — 50. Ниже 30 три утра подряд — «собирается уйти», двое суток на ответ; не поднялось выше 30 — уходит сам после
// своей смены. «Поднять зарплату» и «В другую смену» — прибавка сразу; уволить — с выплатой за три смены; отмена стройки
// возвращает и выплату, и настроение. Те же зерно и команды — то же при любом шаге часов. Без смен настроения нет.
import { describe, expect, test } from 'bun:test';
import { db } from '../../src/content';
import { hospitalOf } from '../../src/engine/hospital/site';
import { siteOfPreset } from '../../src/engine/hospital/site-preset';
import { presetStaff, type StaffMember, wageOf, withNightShift } from '../../src/engine/hospital/staff';
import { POINT, worked } from '../../src/engine/shift/crew';
import { apply, newFlowShift } from '../../src/engine/shift/engine';
import { cashNow } from '../../src/engine/shift/money';
import { marketOf, moodsOf, raisedOf } from '../../src/engine/shift/mood';
import type { Notice, ShiftState, StaffNews } from '../../src/engine/shift/types';
import { hash, site } from './site-kit';

const H = 3600;
const DAY = 86400;
const M = db.economy.staff.mood!;
const rec = db.presets['preset.city'];
const citySite = siteOfPreset(db, rec);
const cityHospital = hospitalOf(db, citySite);
const legacy = presetStaff(db, rec);
const shifts = withNightShift(db, citySite.rooms, legacy);
/** Городская со сменами; `perHour` — пришедших сами в час (0 — больных нет: устают только за часы); с кассой — `cash`. */
const city = (seed: number, perHour = 0, staff: StaffMember[] = shifts, cash?: number) =>
  newFlowShift(db, {
    seed, season: 'winter', hospital: cityHospital, staff, flow: { perHour, ambulancePerHour: perHour > 0 ? 1 : 0 }, ...(cash !== undefined ? { economy: { cash } } : {}),
  });
/** Час `hour` текущих суток больницы (сутки — с 00:00). */
const at = (s: ShiftState, hour: number) => (s.day - 1) * DAY + hour * H;
/** Прожить до `t` шагом `step`; извещения — по порядку. */
function run(s: ShiftState, t: number, step = 600): Notice[] {
  const out: Notice[] = [];
  while (s.t < t) out.push(...apply(db, s, { kind: 'advance', seconds: Math.min(step, t - s.t) }));
  return out;
}
/** До следующей планёрки, 08:00, включительно: её новости о персонале. */
function morning(s: ShiftState, step = 600): StaffNews | undefined {
  const next = s.day * DAY + 8 * H;
  const n = run(s, next, step).find(x => x.kind === 'morning');
  expect(n).toBeDefined();
  return n!.kind === 'morning' ? n!.staff : undefined;
}
const v = (s: ShiftState, id: string) => s.moods?.[id]?.v ?? M.start;
const member = (s: ShiftState, id: string) => s.staff!.find(m => m.id === id)!;
/** Зарплата — долей рынка его навыка, %, до 50 ₽. */
const pay = (s: ShiftState, id: string, pct: number) => {
  s.staff = s.staff!.map(m => (m.id === id ? { ...m, salary: Math.round((marketOf(db, m) * pct) / 100 / 50) * 50 } : m));
};
const nightIn = (s: ShiftState) => s.staff!.filter(m => m.shift === 'night' && m.room !== undefined);
const dayIn = (s: ShiftState) => s.staff!.filter(m => m.shift === 'day' && m.room !== undefined);
/** Дневной и ночной на одном месте: помещение, где есть оба одной должности. */
function pair(s: ShiftState): [StaffMember, StaffMember] {
  for (const n of nightIn(s)) {
    const d = dayIn(s).find(x => x.room === n.room && x.role === n.role);
    if (d) return [d, n];
  }
  throw new Error('нет пары');
}

describe('настроение персонала', () => {
  test('числа — в economy.yaml: гипотезы части 3а', () => {
    expect(M).toEqual({ start: 70, drift: 10, market: 10, below: -5, above: 3, limit: -5, here: -3, toilet: -3, nights: [3, -2], quit: 30, days: 3, respond: 2, raise: 10, moved: 5, step: 10, severance: 3 });
  });

  test('без смен настроения нет: ни записей, ни новостей на планёрке', () => {
    const s = city(1, 0, legacy);
    expect(morning(s)).toBeUndefined();
    expect(morning(s)).toBeUndefined();
    expect(s.moods).toBeUndefined();
    expect(moodsOf(db, s)).toEqual([]);
  }, 60_000);

  test('без причин — 70; ночные: с третьей подряд — −2 в сутки и тяга к 70 — до равновесия 50; окно видит всех со сменой', () => {
    const s = city(2);
    // новый — 70, ещё до первой планёрки
    expect(moodsOf(db, s)).toEqual(s.staff!.map(m => ({ id: m.id, v: M.start })));
    const n = nightIn(s)[0];
    const d = dayIn(s)[0];
    // третья ночная: −2; дальше −2 и +1 тяги, пока до 70 меньше 20
    for (const want of [70, 70, 68, 67]) {
      expect(morning(s)).toBeUndefined();
      expect(v(s, d.id)).toBe(M.start);
      expect(s.moods![d.id].why).toBeUndefined();
      expect(v(s, n.id)).toBe(want);
    }
    expect(s.moods![n.id]).toMatchObject({ v: 67, d: -1, why: ['nights'], nights: 4 });
    expect(moodsOf(db, s).find(x => x.id === n.id)).toEqual({ id: n.id, v: 67, d: -1, why: ['nights'] });
    // равновесие: в 20 от 70 тяга — 2, как ночные; ниже 30 ночные сами не опускают
    for (let i = 0; i < 18; i++) morning(s);
    expect(s.moods![n.id]).toMatchObject({ v: 50, why: ['nights'] });
    expect(s.moods![n.id].d).toBeUndefined();
    morning(s);
    expect(v(s, n.id)).toBe(50);
  }, 120_000);

  test('зарплата ниже рынка на 10 % и больше — −5, выше — +3; без причин — назад к 70', () => {
    const s = city(3);
    const [a, b] = dayIn(s);
    pay(s, a.id, 85);
    pay(s, b.id, 120);
    morning(s);
    expect(s.moods![a.id]).toMatchObject({ v: 65, d: -5, why: ['below'] });
    expect(s.moods![b.id]).toMatchObject({ v: 73, d: 3, why: ['above'] });
    // зарплату вернули к рынку — причин нет: тянется к 70 (до 70 меньше 20 — по 1), причина видна, пока не дотянется
    pay(s, a.id, 100);
    pay(s, b.id, 100);
    morning(s);
    expect(s.moods![a.id]).toMatchObject({ v: 66, d: 1, why: ['below'] });
    expect(s.moods![b.id]).toMatchObject({ v: 72, d: -1, why: ['above'] });
    for (let i = 0; i < 4; i++) morning(s);
    expect(s.moods![a.id].v).toBe(70);
    expect(s.moods![a.id].why).toBeUndefined();
    expect(s.moods![b.id].v).toBe(70);
  }, 120_000);

  test('нет санузла — −3 тем, кто работает; в резерве — нет', () => {
    const s = city(4);
    const toilet = citySite.rooms.find(r => r.type === 'room.toilet')!.id;
    site(db, s, { kind: 'demolish', room: toilet });
    const d = dayIn(s)[0];
    // в резерв — без помещения
    s.staff = s.staff!.map(m => (m.id === d.id ? (({ room: _, ...x }) => x)(m) : m));
    morning(s);
    expect(v(s, d.id)).toBe(M.start);
    for (const m of s.staff!.filter(x => x.room !== undefined)) expect(s.moods![m.id]).toMatchObject({ v: 67, why: ['toilet'] });
  }, 120_000);

  test('ординаторской нет — отдыхал на месте: −3 тому, кто отдыхал', () => {
    const s = city(5);
    const staffRoom = citySite.rooms.find(r => r.type === 'room.staff')!.id;
    site(db, s, { kind: 'demolish', room: staffRoom });
    const rested = new Set<string>();
    while (s.t < s.day * DAY + 8 * H - 600) {
      run(s, s.t + 600);
      for (const [id, c] of Object.entries(s.crew ?? {})) if (c.rest?.kind === 'here') rested.add(id);
    }
    morning(s);
    expect(rested.size).toBeGreaterThan(0);
    for (const m of s.staff!) {
      if (rested.has(m.id)) expect(s.moods![m.id]).toMatchObject({ v: 67, why: ['here'] });
      else expect(v(s, m.id)).toBe(M.start);
    }
  }, 120_000);

  test('дошёл до предела усталости — −5: и замеченный по ходу смены, и к её концу', () => {
    const s = city(6);
    const [n1, n2] = nightIn(s).filter(m => s.staff!.some(x => x.shift === 'night' && x.room === m.room));
    run(s, at(s, 27));
    // по ходу: ещё один принятый — и предел
    worked(db, s, n1);
    s.crew![n1.id].f = 100 * POINT - POINT;
    worked(db, s, n1);
    // смена, что началась в 20:00 первых суток
    expect(s.moods![n1.id].limit).toBe(at(s, 20));
    // к концу смены: за минуту до 08:00 — на пределе, отдыхать не успел
    run(s, s.day * DAY + 8 * H - 60);
    s.crew![n2.id] = { f: 100 * POINT, at: s.t };
    morning(s);
    expect(s.moods![n1.id]).toMatchObject({ v: 65, why: ['limit'] });
    expect(s.moods![n2.id]).toMatchObject({ v: 65, why: ['limit'] });
    // отметка прочитана: следующие сутки — без неё, только тяга к 70
    morning(s);
    expect(s.moods![n1.id].v).toBe(66);
  }, 120_000);

  test('ниже 30 три утра — «собирается уйти», двое суток; не ответили — ночной уходит в 08:00, дневной в 20:00; отмена не вернёт', () => {
    const s = city(7);
    const [d, n] = pair(s);
    const other = dayIn(s).find(x => x.id !== d.id && x.room !== d.room)!;
    for (const m of [d, n]) {
      pay(s, m.id, 80);
      (s.moods ??= {})[m.id] = { v: 31 };
    }
    // шаг отмены со снимком штата, где они есть
    site(db, s, { kind: 'raise', id: other.id });
    // −5 ниже рынка и тяга: 31 − 5 + 3 = 29
    const low = morning(s);
    expect(low?.low).toEqual(expect.arrayContaining([d.id, n.id]));
    expect(s.moods![d.id]).toMatchObject({ v: 29, low: 1 });
    expect(morning(s)?.low).toBeUndefined();
    const quit = morning(s);
    expect(s.moods![d.id]).toMatchObject({ v: 27, low: 3, quit: s.day + 2 });
    // ночной: третья ночная подряд — ещё −2
    expect(s.moods![n.id]).toMatchObject({ v: 25, low: 3, quit: s.day + 2, why: ['below', 'nights'] });
    expect(quit?.quit).toEqual(expect.arrayContaining([{ id: d.id, until: s.day + 2 }, { id: n.id, until: s.day + 2 }]));
    expect(morning(s)?.quit).toBeUndefined();
    expect(member(s, d.id)).toBeDefined();
    const gone = morning(s);
    // не ответили: ночной ушёл сейчас — с причинами, для строки планёрки; дневной отработает смену
    expect(gone?.leave).toEqual(expect.arrayContaining([
      { id: n.id, role: n.role, sex: n.sex, seed: n.seed, why: ['below', 'nights'] },
      { id: d.id, role: d.role, sex: d.sex, seed: d.seed, why: ['below'] },
    ]));
    expect(s.staff!.some(m => m.id === n.id)).toBe(false);
    expect(s.moods![n.id]).toBeUndefined();
    expect(s.moods![d.id].go).toBe(at(s, 20));
    expect(moodsOf(db, s).find(x => x.id === d.id)?.go).toBe(at(s, 20));
    // уходящему поднимать зарплату поздно
    expect(site(db, s, { kind: 'raise', id: d.id }, false)).toMatchObject({ ok: false, error: { kind: 'leaving' } });
    run(s, at(s, 20) - 60);
    expect(member(s, d.id)).toBeDefined();
    run(s, at(s, 20) + 60);
    expect(s.staff!.some(m => m.id === d.id)).toBe(false);
    // отмена старого шага — штат без ушедших
    for (const step of s.works!.undo) expect(step.staff.some(m => m.id === d.id || m.id === n.id)).toBe(false);
    site(db, s, { kind: 'undo' });
    expect(member(s, other.id).salary).toBe(other.salary);
    expect(s.staff!.some(m => m.id === d.id || m.id === n.id)).toBe(false);
  }, 180_000);

  test('«Поднять зарплату»: до рынка, потом на 10 %; +10 сразу; выше 30 — остаётся; отмена — как было', () => {
    const s = city(8);
    const p = dayIn(s)[1];
    pay(s, p.id, 80);
    // два утра ниже 30 уже было: 18 − 5 + 5 = 18 — третье
    (s.moods ??= {})[p.id] = { v: 18, low: 2 };
    morning(s);
    expect(s.moods![p.id]).toMatchObject({ v: 18, low: 3, quit: s.day + 2 });
    const until = s.moods![p.id].quit;
    // до рынка: +10 — 28, ещё не выше 30
    site(db, s, { kind: 'raise', id: p.id });
    expect(member(s, p.id).salary).toBe(marketOf(db, p));
    // стрелка окна — с настроения до планёрки: 18 → 18 на планёрке, +10 сейчас
    expect(s.moods![p.id]).toMatchObject({ v: 28, d: 10, quit: until });
    // ещё раз: на 10 % выше рынка — 39, «собирается уйти» снято сразу
    const salary = raisedOf(db, member(s, p.id));
    expect(salary).toBe(Math.ceil((marketOf(db, p) * 110) / 100 / 50) * 50);
    expect(salary * 100).toBeGreaterThanOrEqual(marketOf(db, p) * 110);
    site(db, s, { kind: 'raise', id: p.id });
    expect(member(s, p.id).salary).toBe(salary);
    expect(s.moods![p.id].v).toBe(38);
    expect(s.moods![p.id].quit).toBeUndefined();
    // отмена — зарплата, настроение и «собирается уйти» как были; снова — остаётся
    site(db, s, { kind: 'undo' });
    expect(member(s, p.id).salary).toBe(marketOf(db, p));
    expect(s.moods![p.id]).toMatchObject({ v: 28, d: 10, low: 3, quit: until });
    site(db, s, { kind: 'raise', id: p.id });
    // утром — выше рынка: +3 и тяга +3; ухода нет
    const news = morning(s);
    expect(news?.leave).toBeUndefined();
    expect(s.moods![p.id]).toMatchObject({ v: 44, d: 6, why: ['above'] });
    morning(s);
    morning(s);
    expect(member(s, p.id)).toBeDefined();
  }, 180_000);

  test('«В другую смену»: меняется с тем, кто на его месте в той смене; собиравшемуся уйти — +5; ночные — сначала', () => {
    const s = city(9);
    const [d, n] = pair(s);
    (s.moods ??= {})[n.id] = { v: 20, low: 3, quit: s.day + 2, nights: 5 };
    site(db, s, { kind: 'reshift', id: n.id });
    expect(member(s, n.id).shift).toBe('day');
    expect(member(s, d.id).shift).toBe('night');
    expect(s.moods![n.id]).toMatchObject({ v: 25, quit: s.day + 2 });
    morning(s);
    expect(s.moods![n.id].nights).toBeUndefined();
    expect(s.moods![d.id].nights).toBe(1);
    // тот, кто не собирался уйти, — без прибавки; места в той смене нет — просто в другую
    const solo = dayIn(s).find(m => !s.staff!.some(x => x !== m && x.room === m.room && x.role === m.role))!;
    const before = v(s, solo.id);
    site(db, s, { kind: 'reshift', id: solo.id });
    expect(member(s, solo.id).shift).toBe('night');
    expect(v(s, solo.id)).toBe(before);
    // отмена — назад в дневную
    site(db, s, { kind: 'undo' });
    expect(member(s, solo.id).shift).toBe('day');
    // без смены — нечего
    const t = city(9, 0, legacy);
    expect(site(db, t, { kind: 'reshift', id: legacy[0].id }, false)).toMatchObject({ ok: false, error: { kind: 'nothing' } });
  }, 180_000);

  test('уволить — выплата за три смены из кассы, и ниже предела; отмена — выплата и настроение назад', () => {
    const s = city(10, 0, shifts, 50_000);
    const n = nightIn(s)[0];
    (s.moods ??= {})[n.id] = { v: 44, nights: 2 };
    const cash = cashNow(s)!;
    const r = site(db, s, { kind: 'dismiss', id: n.id });
    const paid = M.severance * wageOf(db, n);
    expect(r.cost).toBe(paid);
    expect(cashNow(s)).toBe(cash - paid);
    // отдельной статьёй кассы суток: зарплаты — за работу
    expect(s.economy!.ledger!.expenses.severance).toBe(paid);
    expect(s.moods![n.id]).toBeUndefined();
    const u = site(db, s, { kind: 'undo' });
    expect(u.cost).toBe(-paid);
    expect(cashNow(s)).toBe(cash);
    expect(s.economy!.ledger!.expenses.severance).toBe(0);
    expect(s.moods![n.id]).toEqual({ v: 44, nights: 2 });
    // касса ниже предела минуса — уволить всё равно можно
    s.economy!.cash = -db.money!.overdraft - 100_000;
    expect(site(db, s, { kind: 'dismiss', id: n.id }).ok).toBe(true);
  }, 60_000);

  test('те же зерно и команды — то же настроение, штат и касса при любом шаге часов', () => {
    const play = (step: number) => {
      const s = city(11, 3, shifts, 500_000);
      const [d, n] = pair(s);
      for (const m of [d, n]) {
        pay(s, m.id, 80);
        (s.moods ??= {})[m.id] = { v: 31 };
      }
      const notices = run(s, 6 * DAY + 21 * H, step);
      return { moods: s.moods, staff: s.staff, cash: cashNow(s), news: notices.flatMap(x => (x.kind === 'morning' && x.staff ? [x.staff] : [])) };
    };
    const a = play(60);
    const b = play(3 * H);
    expect(a.news.some(x => x.leave)).toBe(true);
    expect(hash(b)).toBe(hash(a));
  }, 300_000);
});
