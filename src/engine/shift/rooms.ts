// Деньги по помещениям (spec docs/specs/2026-10-metrics-layer.md, часть 2) — своё «Больницы», только поток для ПК в больнице
// ПК. Каждое движение кассы суток пишется и помещению, к которому оно относится, в час события: обращение — кабинету врача,
// оплаченное обследование — помещению, где его сделали, стационар — палате, операция — операционной; зарплаты людей на местах
// помещения в их смену и содержание помещения с его аппаратами — по часам, как касса. Что не относится ни к одному
// помещению — общее (`COMMON`). Поэтому сумма по помещениям вместе с общим равна кассе суток при любом шаге часов. Чистые
// функции состояния смены.
import type { ContentDb, Id } from '../../content/types';
import type { Payer } from '../economy/economy';
import { roomUpkeep, type Site } from '../hospital/site';
import { type StaffMember, wageOf } from '../hospital/staff';
import { DAY, type RoomDay, type ShiftPatient, type ShiftState } from './types';

/** Общее: коридор, стройка, кредит, проценты, выплаты уволенным, учёба, люди в резерве и остаток округлений. */
export const COMMON = '';

const pc = (s: ShiftState): boolean => s.flow !== undefined && s.hospital?.site !== undefined;

function dayOf(s: ShiftState, room: string): RoomDay {
  return ((s.summary.rooms ??= {})[room] ??= { income: 0, expenses: 0 });
}

/** Доход помещению `room`, ₽, и за что он: приём, обследование, случай стационара. */
export function roomIncome(s: ShiftState, room: string, rub: number, what?: 'visits' | 'exams' | 'stays') {
  if (!pc(s)) return;
  const d = dayOf(s, room);
  d.income += rub;
  if (what) d[what] = (d[what] ?? 0) + 1;
}

/** Расход помещения `room`, ₽; минус — назад (смену заболевшего не оплатили). */
export function roomExpense(s: ShiftState, room: string, rub: number) {
  if (!pc(s) || rub === 0) return;
  dayOf(s, room).expenses += rub;
}

/** Где шёл приём: у нанятого врача — его кабинет; у привезённого скорой — смотровая, где он лежит; ваш — ваш кабинет. */
export function caseRoom(s: ShiftState, p: ShiftPatient): string {
  if (p.by !== undefined) return s.staff?.find(m => m.id === p.by)?.room ?? COMMON;
  if (p.bay) return p.bay.room;
  return s.hospital?.site?.mine ?? COMMON;
}

const rates = new WeakMap<readonly StaffMember[], WeakMap<Site, Map<string, number>>>();

/**
 * Расход в сутки по помещениям, ₽: содержание помещения (как цена, по площади) и его аппаратов и зарплата людей на его местах
 * в их смену (`wageOf`); общее — клетки коридора и люди без места (резерв). Сумма — то, что касса пишет по часам
 * (`upkeepPerDay` и `wagesOf`). Одно на штат и участок: оба меняются только новым объектом.
 */
function ratesOf(db: ContentDb, staff: readonly StaffMember[], site: Site, corridor: number): Map<string, number> {
  let bySite = rates.get(staff);
  if (!bySite) rates.set(staff, (bySite = new WeakMap()));
  let m = bySite.get(site);
  if (m) return m;
  m = new Map();
  for (const r of site.rooms) {
    let v = roomUpkeep(db, r.type, r.w, r.h);
    for (const i of r.items) if (i.eq && !i.leaving) v += db.equipment[i.eq]?.upkeep ?? 0;
    m.set(r.id, v);
  }
  let common = corridor * db.economy.corridor.upkeep;
  for (const p of staff) {
    if (p.room !== undefined && m.has(p.room)) m.set(p.room, m.get(p.room)! + wageOf(db, p));
    else common += wageOf(db, p);
  }
  m.set(COMMON, common);
  bySite.set(site, m);
  return m;
}

/**
 * Касса суток записала `total` ₽ зарплат и содержания за `dt` секунд (`accrue`): помещениям — их доли, округлённые так же,
 * общему — остаток, чтобы сумма сошлась с кассой до рубля.
 */
export function accrueRooms(db: ContentDb, s: ShiftState, dt: number, total: number) {
  const site = s.hospital?.site;
  if (!pc(s) || !site || dt <= 0) return;
  let left = total;
  for (const [room, rate] of ratesOf(db, s.staff ?? [], site, s.hospital!.corridor.length)) {
    if (room === COMMON) continue;
    const v = Math.round((rate * dt) / DAY);
    if (v === 0) continue;
    dayOf(s, room).expenses += v;
    left -= v;
  }
  roomExpense(s, COMMON, left);
}

/**
 * Закрытый приём заплатил `paid` ₽ (`caseIncome` в src/engine/economy/economy.ts): оплаченные обследования — помещениям, где
 * их сделали (`examRooms`; нет — кабинету врача), по той же цене, что там; обращение — остаток — кабинету врача (`caseRoom`).
 * Не оплаченные обследования (`unindicated`) — по одному на каждое такое среди сделанных, как там.
 */
export function caseIncomeRooms(db: ContentDb, s: ShiftState, p: ShiftPatient, payer: Payer, paid: number, unindicated: readonly Id[]) {
  if (!pc(s)) return;
  const t = db.economy.tariffs;
  const price = payer === 'oms' ? t.omsExam : payer === 'dms' ? t.dms.price : t.self.price;
  const cut = [...unindicated];
  const office = caseRoom(s, p);
  let exams = 0;
  for (const id of p.done) {
    const sum = Math.round(((db.exams[id]?.cost ?? 0) * price) / 100);
    if (sum === 0) continue;
    const i = cut.indexOf(id);
    if (i >= 0) {
      cut.splice(i, 1);
      continue;
    }
    roomIncome(s, p.examRooms?.[id] ?? office, sum, 'exams');
    exams += sum;
  }
  roomIncome(s, office, paid - exams, 'visits');
}
