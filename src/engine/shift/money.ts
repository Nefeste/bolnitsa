// Касса больницы ПК (spec docs/specs/2026-10-economy.md, «Касса») — своё «Больницы». Доходы, проверка страховой, зарплаты,
// содержание, расходники, койко-дни, ремонт, процент и репутация — код и числа «Анамнеза» (src/engine/economy/economy.ts,
// content/hospital/economy.yaml); здесь — то, что меняет ПК: касса живая (касса на планёрке плюс касса суток), зарплаты и
// содержание пишутся в кассу суток по часам (нанимают и строят в любой момент), стройка оплачивается сразу и не ниже
// предела минуса, ниже предела на планёрке банк предлагает кредит (content/hospital/money.yaml); зарплата — по сменам (spec
// docs/specs/2026-10-staff-shifts.md). Чистые функции состояния смены; в сменах «Анамнеза» движок их не зовёт.
import type { ContentDb } from '../../content/types';
import { emptyLedger, expensesOf, incomeOf, type Ledger, upkeepOf } from '../economy/economy';
import type { HospitalState } from '../hospital/build';
import { wagesOf } from '../hospital/staff';
import { roomUpkeep, type Site } from '../hospital/site';
import { DAY, type ShiftState, SHIFT_START } from './types';

type Economy = NonNullable<ShiftState['economy']>;

/**
 * С чего начинается касса (spec «Начало»): пустое здание — бюджет песочницы «обычный» «Анамнеза»; готовая больница —
 * городская или поликлиника (spec 2026-10-real-hospital) — уже построена: его доля, как у готовой амбулатории песочницы.
 */
export function startCash(db: ContentDb, start: 'empty' | 'preset' | 'poly'): number {
  const sb = db.economy.sandbox;
  return start === 'empty' ? sb.budgets.normal : Math.floor((sb.budgets.normal * sb.clinicShare) / 100);
}

/** Касса потока для ПК в начале: касса, репутация «Анамнеза», пустая касса суток; зарплаты и содержание — с минуты `t`. */
export function openEconomy(db: ContentDb, cash: number, t: number): Economy {
  return { cash, reputation: db.economy.reputation.start, ledger: emptyLedger(), accrued: t };
}

function ledgerOf(e: Economy): Ledger {
  e.ledger ??= emptyLedger();
  return e.ledger;
}

/** Касса сейчас: на последней планёрке плюс доходы и минус расходы суток, уже записанные. Кассы нет — undefined. */
export function cashNow(s: ShiftState): number | undefined {
  const e = s.economy;
  if (!e) return undefined;
  return e.ledger ? e.cash + incomeOf(e.ledger) - expensesOf(e.ledger) : e.cash;
}

/** Сколько касса изменилась с планёрки: доходы минус расходы суток. */
export function dayNet(s: ShiftState): number {
  const l = s.economy?.ledger;
  return l ? incomeOf(l) - expensesOf(l) : 0;
}

const upkeeps = new WeakMap<Site, { equipment: number; rooms: number }>();

/**
 * Содержание больницы в сутки, ₽: у больницы ПК — помещения по площади (как цена, часть 2б), аппараты, клетки коридора; у
 * больницы «Анамнеза» — как там. Участок не меняется на месте (действие стройки — новый участок): одно на участок.
 */
export function upkeepPerDay(db: ContentDb, h: HospitalState): { equipment: number; rooms: number } {
  const site = h.site;
  if (!site) return upkeepOf(db, h);
  let out = upkeeps.get(site);
  if (!out) {
    let rooms = h.corridor.length * db.economy.corridor.upkeep;
    let equipment = 0;
    for (const r of site.rooms) {
      rooms += roomUpkeep(db, r.type, r.w, r.h);
      for (const i of r.items) if (i.eq && !i.leaving) equipment += db.equipment[i.eq]?.upkeep ?? 0;
    }
    out = { equipment, rooms };
    upkeeps.set(site, out);
  }
  return out;
}

/**
 * Зарплаты и содержание — в кассу суток по часам (spec «Почему по часам»): сколько стоили штат (и резерв) и больница с
 * прошлой записи до этой минуты. Движок зовёт это перед каждой командой стройки, при отложенном сносе и на планёрке — до
 * того, как штат или больница станут другими. Только + − × ÷ и округление (ADR студии 0004).
 */
export function accrue(db: ContentDb, s: ShiftState) {
  const e = s.economy;
  if (!s.flow || !e || !s.hospital) return;
  // касса без отметки (поставлена в состояние снаружи) — с начала текущих суток больницы
  const from = e.accrued ?? SHIFT_START + (s.day - 1) * DAY;
  e.accrued = s.t;
  const dt = s.t - from;
  if (dt <= 0) return;
  const l = ledgerOf(e);
  const up = upkeepPerDay(db, s.hospital);
  // смены (spec 2026-10-staff-shifts): зарплата — за смену, ночная дороже; без смены — за сутки, как прежде
  l.expenses.salaries += Math.round((wagesOf(db, s.staff ?? []) * dt) / DAY);
  l.expenses.equipment += Math.round((up.equipment * dt) / DAY);
  l.expenses.rooms += Math.round((up.rooms * dt) / DAY);
}

/**
 * Чего не хватает на трату `cost` (стройка), ₽: касса сейчас минус трата не должна уйти ниже предела (`money.yaml`,
 * `overdraft`). Хватает, трата не положительна или кассы нет — 0.
 */
export function shortOf(db: ContentDb, s: ShiftState, cost: number): number {
  const now = cashNow(s);
  const limit = db.money?.overdraft;
  if (now === undefined || limit === undefined || cost <= 0) return 0;
  return Math.max(0, cost - (now + limit));
}

/** Стройка оплачена: в кассу суток (снос и отмена — минус). */
export function payWorks(s: ShiftState, cost: number) {
  const e = s.economy;
  if (!e || cost === 0) return;
  const l = ledgerOf(e);
  l.expenses.works = (l.expenses.works ?? 0) + cost;
}

/** Выплата уволенному (spec docs/specs/2026-10-staff-mood.md) — в кассу суток отдельной статьёй; отмена увольнения — минус. */
export function paySeverance(s: ShiftState, amount: number) {
  const e = s.economy;
  if (!e || amount === 0) return;
  const l = ledgerOf(e);
  l.expenses.severance = (l.expenses.severance ?? 0) + amount;
}

/** Учёба персонала (spec docs/specs/2026-10-staff-mood.md, раздел 4) — в кассу суток отдельной статьёй. */
export function payStudy(s: ShiftState, amount: number) {
  const e = s.economy;
  if (!e || amount === 0) return;
  const l = ledgerOf(e);
  l.expenses.study = (l.expenses.study ?? 0) + amount;
}

/**
 * Смена, за которую не платят (spec docs/specs/2026-10-staff-mood.md, раздел 5: болеет): зарплаты идут в кассу по часам за
 * всех, поэтому её зарплата — назад из зарплат кассы суток.
 */
export function unpaidShift(s: ShiftState, amount: number) {
  const e = s.economy;
  if (!e || amount === 0) return;
  ledgerOf(e).expenses.salaries -= amount;
}

/** Выплата по кредиту на планёрке — в кассу суток; вернули — кредита нет. */
export function repay(s: ShiftState) {
  const e = s.economy;
  if (!e?.loan) return;
  const pay = Math.min(e.loan.perDay, e.loan.left);
  const l = ledgerOf(e);
  l.expenses.loan = (l.expenses.loan ?? 0) + pay;
  const left = e.loan.left - pay;
  if (left > 0) e.loan = { left, perDay: e.loan.perDay };
  else delete e.loan;
}

/**
 * Предложение банка после планёрки (spec «Предел минуса и кредит»): касса ниже предела, кредита нет — до нуля кассы, вверх до
 * шага; иначе — нет.
 */
export function offerOf(db: ContentDb, s: ShiftState): number | undefined {
  const e = s.economy;
  const m = db.money;
  if (!e || !m || e.loan || e.cash >= -m.overdraft) return undefined;
  return Math.ceil(-e.cash / m.loan.step) * m.loan.step;
}

/**
 * Взять кредит, который банк предложил на планёрке: касса — плюс сумма; вернуть сумму с надбавкой равными долями на
 * планёрках. Предложения нет или кредит уже есть — ничего не меняется.
 */
export function takeLoan(db: ContentDb, s: ShiftState) {
  const e = s.economy;
  const m = db.money;
  if (!s.flow || !e || !m || e.loan || !e.offer) return;
  const total = Math.round((e.offer * (100 + m.loan.fee)) / 100);
  e.cash += e.offer;
  e.loan = { left: total, perDay: Math.ceil(total / m.loan.days) };
  delete e.offer;
}
