// Ось «Управление» (spec docs/specs/2026-10-difficulty.md; решения владельца 26.10.2026, #135–#137, #151): «Обычно» — как
// было, до байта; у «Спокойно» и «Трудно» — множители к потоку, терпению, зарплатам, оплате случаев и поломкам, свой предел
// минуса и касса начала; уровень меняют командой в любой момент — с этой минуты; в сменах «Анамнеза» уровня нет.
import { describe, expect, test } from 'bun:test';
import type { ContentDb, Manage, ManageLevel } from '../../src/content/types';
import { emptySite, hospitalOf } from '../../src/engine/hospital/site';
import { siteOfPreset } from '../../src/engine/hospital/site-preset';
import { presetStaff } from '../../src/engine/hospital/staff';
import { apply, breakdowns, newFlowShift } from '../../src/engine/shift/engine';
import { levelOf, manageOf } from '../../src/engine/shift/manage';
import { incomeOf } from '../../src/engine/economy/economy';
import { accrue, offerOf, shortOf, startCash } from '../../src/engine/shift/money';
import type { Flow, ShiftState } from '../../src/engine/shift/types';
import { buildDb, difficultyErrors } from '../content/load';
import { hash } from './site-kit';

const { db } = buildDb();
const HOUR = 3600;
const AUTO: Flow = { perHour: 0, auto: true };
const rec = db.presets['preset.city'];
const cityHospital = hospitalOf(db, siteOfPreset(db, rec));
const cityStaff = presetStaff(db, rec);

/** Готовая городская больница с кассой начала своего уровня. */
function city(o: { seed?: number; manage?: Manage; dbx?: ContentDb } = {}): ShiftState {
  const d = o.dbx ?? db;
  return newFlowShift(d, {
    seed: o.seed ?? 1, season: 'winter', hospital: cityHospital, staff: cityStaff, flow: AUTO,
    economy: { cash: startCash(d, 'preset', o.manage) }, ...(o.manage ? { manage: o.manage } : {}),
  });
}

/** Прожить до часа `hour` от полуночи первых суток шагом `step`. */
function live(s: ShiftState, hour: number, step = 60, d: ContentDb = db) {
  while (s.t < hour * HOUR) apply(d, s, { kind: 'advance', seconds: Math.min(step, hour * HOUR - s.t) });
}

/** База, где «Спокойно» меняет одно число (остальные — как у «Обычно»): так видно, что делает каждый множитель. */
function only(k: 'inflow' | 'patience' | 'salary' | 'pay' | 'breakdown', pct: number): ContentDb {
  const calm: ManageLevel = { inflow: 100, patience: 100, salary: 100, pay: 100, breakdown: 100, overdraft: db.money!.overdraft, budget: 'normal', [k]: pct };
  return { ...db, manage: { ...db.manage!, calm } };
}

describe('ось «Управление»', () => {
  test('числа уровней — как в геймдизайне §10; «Обычно» — числа базы; сборка ловит уровень не в ту сторону', () => {
    expect(db.manage).toEqual({
      calm: { inflow: 80, patience: 150, salary: 85, pay: 110, breakdown: 50, overdraft: 500000, budget: 'generous' },
      hard: { inflow: 120, patience: 75, salary: 115, pay: 90, breakdown: 150, overdraft: 150000, budget: 'modest' },
    });
    const normal = { inflow: 100, patience: 100, salary: 100, pay: 100, breakdown: 100, overdraft: db.money!.overdraft, budget: 'normal' as const };
    expect(levelOf(db, 'normal')).toEqual(normal);
    expect(levelOf(db, undefined)).toEqual(normal);
    const b = db.economy.sandbox.budgets;
    expect([startCash(db, 'empty', 'calm'), startCash(db, 'empty'), startCash(db, 'empty', 'hard')]).toEqual([2500000, 1200000, 600000]);
    expect(startCash(db, 'preset', 'hard')).toBe(Math.floor((b.modest * db.economy.sandbox.clinicShare) / 100));
    expect(difficultyErrors(db.manage!, db.money!.overdraft, b)).toEqual([]);
    const wrong = difficultyErrors({ ...db.manage!, calm: { ...db.manage!.calm, inflow: 120 } }, db.money!.overdraft, b);
    expect(wrong.some(e => e.includes('calm.inflow 120'))).toBe(true);
    // оплата случаев: на «Трудно» дороже «Обычно» — не в ту сторону
    const pay = difficultyErrors({ ...db.manage!, hard: { ...db.manage!.hard, pay: 110 } }, db.money!.overdraft, b);
    expect(pay.some(e => e.includes('hard.pay 110'))).toBe(true);
    const same = difficultyErrors({ ...db.manage!, hard: normal }, db.money!.overdraft, b);
    expect(same.some(e => e.includes('hard — те же числа'))).toBe(true);
  });

  test('«Обычно» — до байта как без уровня, и командой «Обычно» ничего не меняется', () => {
    const a = city();
    const b = city({ manage: 'normal' });
    expect('manage' in b.meta).toBe(false);
    live(a, 11);
    live(b, 11);
    apply(db, b, { kind: 'manage', level: 'normal' });
    live(a, 13);
    live(b, 13);
    // команда — в журнале команд; остальное — то же
    expect(b.journal.some(c => c.kind === 'manage')).toBe(true);
    expect(hash({ ...b, journal: a.journal })).toBe(hash(a));
  }, 60_000);

  test('поток: «Трудно» — больше пришедших, «Спокойно» — меньше; множитель решает', () => {
    const arrived = (o: { manage?: Manage; dbx?: ContentDb }) => {
      let n = 0;
      for (const seed of [1, 2, 3]) {
        const s = city({ seed, ...o });
        live(s, 14, 60, o.dbx);
        n += s.summary.arrived;
      }
      return n;
    };
    const normal = arrived({});
    const calm = arrived({ manage: 'calm' });
    const hard = arrived({ manage: 'hard' });
    expect(calm).toBeLessThan(normal);
    expect(hard).toBeGreaterThan(normal);
    // только поток, втрое — больше вдвое с лишним; десятая — меньше вдвое
    expect(arrived({ manage: 'calm', dbx: only('inflow', 300) })).toBeGreaterThan(2 * normal);
    expect(arrived({ manage: 'calm', dbx: only('inflow', 10) })).toBeLessThan(normal / 2);
  }, 120_000);

  // «Почему?» у цифр планёрки (spec docs/specs/2026-10-why.md): прогноз потока на сутки — с тем же множителем, что сам поток
  test('прогноз потока на планёрке — на множитель уровня, как сам поток', () => {
    for (const manage of ['calm', 'normal', 'hard'] as const) {
      const s = city({ seed: 2, manage });
      live(s, 32, 600);
      const f = s.history[0].inflow!;
      const k = levelOf(db, manage).inflow;
      // место смотровой — скорых в сутки по базе на множитель; кабинет — 2,5 в час × 12 часов с поправкой репутации
      expect([manage, f.perBay]).toEqual([manage, Math.round((db.inflow!.ambulance * k) / 10) / 10]);
      expect([manage, Math.abs(f.perOffice - (2.5 * 12 * f.pct * k) / 10000) <= 0.5]).toEqual([manage, true]);
    }
  }, 60_000);

  test('терпение: те же пришедшие — каждый во столько раз терпеливее', () => {
    const dbx = only('patience', 150);
    const a = city();
    const b = city({ manage: 'calm', dbx });
    // первые полчаса приёма: никто ещё не ушёл, не дождавшись, — люди те же
    live(a, 8.5);
    live(b, 8.5, 60, dbx);
    const ids = Object.keys(a.patients).filter(id => a.patients[id].patience > 0);
    expect(ids.length).toBeGreaterThan(3);
    expect(Object.keys(b.patients).sort()).toEqual(Object.keys(a.patients).sort());
    for (const id of ids) expect(Math.abs(b.patients[id].patience - 1.5 * a.patients[id].patience)).toBeLessThanOrEqual(1);
  }, 60_000);

  test('зарплаты: платят по уровню, а у людей — те же зарплаты «Обычно», по ним судят о рынке', () => {
    const dbx = only('salary', 85);
    const a = city();
    const b = city({ manage: 'calm', dbx });
    live(a, 14);
    live(b, 14, 60, dbx);
    // зарплаты касса пишет при событиях суток (стройка, пересменка, планёрка) — здесь по эту минуту
    accrue(db, a);
    accrue(dbx, b);
    expect(b.staff!.map(m => m.salary)).toEqual(a.staff!.map(m => m.salary));
    const pa = a.economy!.ledger!.expenses.salaries;
    const pb = b.economy!.ledger!.expenses.salaries;
    expect(pa).toBeGreaterThan(0);
    expect(Math.abs(pb / pa - 0.85)).toBeLessThan(0.005);
    // поток и люди те же: от зарплат не меняются
    expect(b.summary.arrived).toBe(a.summary.arrived);
  }, 60_000);

  // решение владельца #151, вариант 2: деньги тоже идут за уровнем — оплата закрытого приёма и случая стационара
  test('оплата случаев: те же больные и решения — каждый случай на множитель уровня, по помещениям — та же сумма', () => {
    const dbx = only('pay', 110);
    const a = city();
    const b = city({ manage: 'calm', dbx });
    // до 10:00 вторых суток: первые сутки целиком и обход 09:00, где выписывают лежащих
    live(a, 34, 600);
    live(b, 34, 600, dbx);
    expect(b.history[0].arrived).toBe(a.history[0].arrived);
    const la = a.history[0].economy!.ledger;
    const lb = b.history[0].economy!.ledger;
    expect(la.cases.oms + la.cases.dms + la.cases.self).toBeGreaterThan(20);
    for (const payer of ['oms', 'dms', 'self'] as const) {
      expect([payer, lb.cases[payer]]).toEqual([payer, la.cases[payer]]);
      // каждый случай — до рубля
      expect([payer, Math.abs(lb.income[payer] - 1.1 * la.income[payer]) <= la.cases[payer]]).toEqual([payer, true]);
    }
    // стационар: на обходе вторых суток выписаны те же, каждый случай — на множитель
    const wa = a.economy!.ledger!.ward!;
    const wb = b.economy!.ledger!.ward!;
    expect(wa.cases).toBeGreaterThan(0);
    expect(wb.cases).toBe(wa.cases);
    expect(Math.abs(wb.income - 1.1 * wa.income)).toBeLessThanOrEqual(wa.cases);
    // по помещениям — та же сумма, что в кассе суток, до рубля
    const rooms = (r: Record<string, { income: number }>) => Object.values(r).reduce((x, y) => x + y.income, 0);
    expect(rooms(b.history[0].rooms!)).toBe(incomeOf(lb));
    expect(rooms(b.summary.rooms!)).toBe(incomeOf(b.economy!.ledger!));
    // меньше 100 % — меньше денег на тот же множитель (как у «Трудно»)
    const less = only('pay', 90);
    const hard = city({ manage: 'calm', dbx: less });
    live(hard, 32, 600, less);
    const lh = hard.history[0].economy!.ledger;
    expect(Math.abs(incomeOf(lh) - 0.9 * incomeOf(la))).toBeLessThanOrEqual(la.cases.oms + la.cases.dms + la.cases.self + (la.ward?.cases ?? 0));
  }, 120_000);

  test('поломки: тот же жребий утра, доля — на множитель уровня', () => {
    const count = (d: ContentDb, manage?: Manage) => {
      const s = city({ manage, dbx: d });
      let n = 0;
      for (let day = 1; day <= 120; day++) {
        s.day = day;
        n += breakdowns(d, s).length;
      }
      return n;
    };
    const normal = count(db);
    expect(normal).toBeGreaterThan(5);
    expect(count(only('breakdown', 0), 'calm')).toBe(0);
    expect(count(only('breakdown', 300), 'calm')).toBeGreaterThan(2 * normal);
    expect(count(db, 'calm')).toBeLessThan(normal);
    expect(count(db, 'hard')).toBeGreaterThan(normal);
  });

  test('предел минуса: стройка из кассы и кредит банка — по уровню', () => {
    const at = (manage: Manage | undefined, cash: number) =>
      newFlowShift(db, { seed: 1, season: 'winter', hospital: hospitalOf(db, emptySite()), staff: [], flow: AUTO, economy: { cash }, ...(manage ? { manage } : {}) });
    expect([shortOf(db, at('calm', 0), 400000), shortOf(db, at(undefined, 0), 400000), shortOf(db, at('hard', 0), 400000)]).toEqual([0, 100000, 250000]);
    expect([offerOf(db, at('calm', -200000)), offerOf(db, at(undefined, -200000)), offerOf(db, at('hard', -200000))]).toEqual([undefined, undefined, 200000]);
  });

  test('смена уровня в игре — с этой минуты: зарплаты до неё — по прежнему, дальше — по новому', () => {
    const a = city();
    live(a, 12);
    const b = structuredClone(a);
    apply(db, b, { kind: 'manage', level: 'hard' });
    expect(b.meta.manage).toBe('hard');
    expect(b.economy!.accrued).toBe(12 * HOUR);
    // записанное до смены — то же, что без неё
    accrue(db, a);
    const before = b.economy!.ledger!.expenses.salaries;
    expect(a.economy!.ledger!.expenses.salaries).toBe(before);
    const arrivedBefore = a.summary.arrived;
    live(a, 16);
    live(b, 16);
    accrue(db, a);
    accrue(db, b);
    const da = a.economy!.ledger!.expenses.salaries - before;
    const dbb = b.economy!.ledger!.expenses.salaries - before;
    expect(Math.abs(dbb / da - 1.15)).toBeLessThan(0.01);
    expect(b.summary.arrived - arrivedBefore).toBeGreaterThan(a.summary.arrived - arrivedBefore);
    // и назад: «Обычно» — поля нет
    apply(db, b, { kind: 'manage', level: 'normal' });
    expect('manage' in b.meta).toBe(false);
  }, 60_000);

  test('тот же ход при шаге часов в 1 и 15 минут; мягкий режим — с начала', () => {
    const a = city({ manage: 'hard' });
    const b = city({ manage: 'hard' });
    live(a, 12, 60);
    live(b, 12, 900);
    expect(hash(b)).toBe(hash(a));
    const s = newFlowShift(db, { seed: 1, season: 'winter', hospital: cityHospital, staff: cityStaff, flow: AUTO, economy: { cash: 0 }, soft: true });
    expect(s.meta.soft).toBe(true);
  }, 60_000);

  test('в сменах «Анамнеза» уровня нет: числа — «Обычно», команда ничего не меняет', () => {
    const s = city({ manage: 'hard' });
    const anamnez = { ...s, flow: undefined } as ShiftState;
    expect(manageOf(db, anamnez).inflow).toBe(100);
    expect(manageOf(db, s).inflow).toBe(120);
    const copy = structuredClone(anamnez);
    apply(db, copy, { kind: 'manage', level: 'calm' });
    expect(copy.meta.manage).toBe('hard');
  });
});
