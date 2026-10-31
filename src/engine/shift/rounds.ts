// Утренний обход (spec docs/specs/2026-10-staff-motion.md, часть 2; решения владельца 27.10.2026, #166, и 31.10.2026, #181) —
// своё «Больницы», только в потоке для ПК. В час обхода (`rounds` в day.yaml) нанятый врач с лежащими допринимает текущего
// и идёт по палатам к своим лежащим; у каждой койки — `round.bed` минут, решение — у койки (`roundStop` в engine.ts).
// Клиническая медсестра в это же время обходит все койки своего помещения, и врач идёт туда только к тем, кому нужно
// решение. Здесь — кого кто обходит и путь с часами: пешком, как ходят люди (`walkPc`), без случайности.
import type { ContentDb } from '../../content/types';
import type { Plan } from '../hospital/build';
import type { StaffMember } from '../hospital/staff';
import type { Round, RoundStop, ShiftPatient, ShiftState } from './types';
import { walkPc } from './walking';
import { daysIn, wardState } from './ward';

/** Клиническая медсестра (часть 2б): обходит койки своего помещения, врач идёт только к отмеченным ею. */
export const CLINICAL = 'role.clinical_nurse';

const MIN = 60;

/** Сколько секунд ещё до возвращения врача `id` с обхода; не на обходе — 0. Клиническая медсестра — не врач: не в счёт. */
export function roundLeft(s: ShiftState, id: string | undefined): number {
  const r = id !== undefined ? s.rounds?.on.find(x => x.by === id && !x.nurse && x.until > s.t) : undefined;
  return r ? r.until - s.t : 0;
}

/** Минут у койки на обходе; нет числа — обход мгновенный, как до части 2. */
export const roundMinutes = (db: ContentDb): number | undefined => db.economy.staff.round?.bed;

/**
 * Кому на обходе нужно решение врача: лежит сутки и больше, операции не ждёт, и можно выписывать, стало хуже или реакция на
 * лечение (`wardState`). Остальным — «лучше» или «так же»: их врач только смотрит.
 */
export function needsDecision(p: ShiftPatient, day: number): boolean {
  const stay = p.stay;
  if (!stay || (stay.op && !stay.op.done)) return false;
  const days = daysIn(stay, day);
  if (days < 1) return false;
  const w = wardState(stay, days);
  return w === 'ready' || w === 'worse' || w === 'reaction';
}

/**
 * Кого обойдёт каждый нанятый врач в смене (`docs`): своих лежащих (`closed.by`; ваши — в вашем списке «Обход»). Лежащих
 * того, кого в смене нет, — тот, кто замещает его пост (резерв, `covers`), иначе врач той же должности, у кого своих меньше;
 * никого — их сегодня не обходят. В помещении, где обходит клиническая медсестра (`watched`), — только тех, кому нужно
 * решение. Лежащие — по порядку поступления; номера людей и больных — строки, порядок устойчивый.
 */
export function roundsDue(
  docs: readonly StaffMember[],
  all: readonly StaffMember[],
  lying: readonly ShiftPatient[],
  watched: ReadonlySet<string>,
  day: number,
): Record<string, string[]> {
  const due: Record<string, string[]> = {};
  const on = new Map(docs.map(m => [m.id, m] as const));
  const count = (id: string) => due[id]?.length ?? 0;
  const leadOf = (by: string): StaffMember | undefined => {
    const lead = on.get(by);
    if (lead) return lead;
    const cover = docs.find(m => m.covers === by);
    if (cover) return cover;
    const role = all.find(m => m.id === by)?.role;
    let best: StaffMember | undefined;
    for (const m of docs) if ((role === undefined || m.role === role) && (!best || count(m.id) < count(best.id))) best = m;
    return best;
  };
  for (const p of lying) {
    const by = p.closed?.by;
    if (by === undefined || !p.stay) continue;
    if (watched.has(p.stay.room) && !needsDecision(p, day)) continue;
    const lead = leadOf(by);
    if (lead) (due[lead.id] ??= []).push(p.id);
  }
  return due;
}

/**
 * Обход `by` из `home` (кабинет врача или пост медсестры) с часа `t`: к ближней палате с его койками, от неё — к ближней из
 * оставшихся, назад на место; в помещении — по номеру койки, у каждой `minutes` минут. Помещения — номера плана; ближе —
 * по шагам `walkPc`, равные — по номеру помещения.
 */
export function roundOf(plan: Plan, by: string, home: string | undefined, beds: readonly ShiftPatient[], t: number, minutes: number, nurse = false): Round {
  const left = new Map<string, ShiftPatient[]>();
  for (const p of beds) {
    const room = p.stay!.room;
    const list = left.get(room);
    if (list) list.push(p);
    else left.set(room, [p]);
  }
  const stops: RoundStop[] = [];
  let at = home;
  let now = t;
  while (left.size > 0) {
    let best: string | undefined;
    let d = Number.POSITIVE_INFINITY;
    for (const room of left.keys()) {
      const w = walkPc(plan, at, room);
      if (w < d || (w === d && best !== undefined && room < best)) {
        d = w;
        best = room;
      }
    }
    now += d;
    const here = left.get(best!)!.sort((a, b) => a.stay!.bed - b.stay!.bed || (a.id < b.id ? -1 : 1));
    for (const p of here) {
      stops.push({ id: p.id, room: best!, bed: p.stay!.bed, at: now, end: now + minutes * MIN });
      now += minutes * MIN;
    }
    left.delete(best!);
    at = best;
  }
  const until = now + walkPc(plan, at, home);
  return { by, ...(nurse ? { nurse: true as const } : {}), from: t, until, stops };
}
