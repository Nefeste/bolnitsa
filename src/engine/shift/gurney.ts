// Санитары и каталки (spec docs/specs/2026-10-orderlies.md; решения владельца 24.10.2026, #88–#90) — своё «Больницы»,
// только в потоке для ПК, со штатом по сменам и когда в базе есть каталка (`staff.gurney`): в сменах «Анамнеза» и в
// сохранениях до смен (0.9.0) лежачий на месте сразу, как прежде.
// Перевозка записывается сразу на того, кто раньше будет у больного: санитара смены — с его места или после уже
// записанных за ним перевозок; в смене ни одного санитара — медсестру того помещения, откуда везут, иначе ближайшую
// медсестру смены. Время известно сразу: дойти, переложить на каталку, довезти, переложить, вернуться на место; с каталкой
// идут той же скоростью, что пешком, и той же дорогой, что видит окно (`walkPc`). Случайности нет: та же больница и те же
// записи — те же часы. События перевозки ставит движок (`engine.ts`), здесь — кто и когда.
import type { ContentDb } from '../../content/types';
import type { Plan } from '../hospital/build';
import { onDuty, ORDERLY, type StaffMember } from '../hospital/staff';
import type { Ride, RideWhy, ShiftPatient, ShiftState } from './types';
import { CLINICAL } from './rounds';
import { walkPc } from './walking';

const NURSE = 'role.nurse';
const MIN = 60;

type Gurney = NonNullable<ContentDb['economy']['staff']['gurney']>;

const shifted = new WeakMap<readonly StaffMember[], boolean>();

/** Есть ли в штате люди со сменой — один раз на штат. */
function hasShifts(staff: readonly StaffMember[]): boolean {
  let x = shifted.get(staff);
  if (x === undefined) shifted.set(staff, (x = staff.some(m => m.shift !== undefined)));
  return x;
}

/** Числа каталки, если лежачих везут: поток для ПК, в штате есть смены (как у усталости) и в базе есть каталка. */
export function gurneyOf(db: ContentDb, s: ShiftState): Gurney | undefined {
  return s.flow && s.staff && hasShifts(s.staff) ? db.economy.staff.gurney : undefined;
}

/**
 * Лежачий ли (spec «Как будет», 1): привезённый скорой, пока он в смотровой приёмного, — да; остальных везут, только когда
 * кладут в ПИТ или реанимацию и на операцию — это решает тот, кто везёт.
 */
export const lying = (p: ShiftPatient): boolean => p.kind === 'ambulance' && p.bay !== undefined;

/**
 * Кто может везти (spec «Как будет», 3): санитары смены; ни одного — медсестра помещения `from`, откуда везут; её нет в
 * смене — ближайшая медсестра смены. Медсестра везёт только срочного (`urgent`; решение владельца #99): остальных —
 * только санитар. `staff` — кто сейчас в смене.
 */
export function carriersOf(plan: Plan, staff: readonly StaffMember[], from: string, urgent: boolean): StaffMember[] {
  const orderlies = staff.filter(m => m.role === ORDERLY && m.room !== undefined);
  if (orderlies.length > 0) return orderlies;
  if (!urgent) return [];
  // клиническая медсестра на месте медсестры делает всё, что она (spec 2026-10-staff-motion, часть 2б; решение владельца #183)
  const nurses = staff.filter(m => (m.role === NURSE || m.role === CLINICAL) && m.room !== undefined);
  const here = nurses.find(m => m.room === from);
  if (here) return [here];
  let best: StaffMember | undefined;
  let d = Number.POSITIVE_INFINITY;
  for (const m of nurses) {
    const x = walkPc(plan, m.room, from);
    if (x < d) {
      best = m;
      d = x;
    }
  }
  return best ? [best] : [];
}

/** До какого часа у человека записаны перевозки: вернётся на место после последней; нет — нет. */
export function ridesUntil(s: ShiftState, id: string): number | undefined {
  let t: number | undefined;
  for (const r of s.rides ?? []) if (r.by === id && (t === undefined || r.home > t)) t = r.home;
  return t;
}

/**
 * С какого часа человек свободен для новой перевозки: после записанных за ним перевозок, перерыва (на пределе он уходит
 * отдыхать после записанных, и новых пишут после перерыва) и, у медсестры, после записанных к ней заборов.
 */
function freeAt(s: ShiftState, m: StaffMember): number {
  let t = Math.max(s.t, ridesUntil(s, m.id) ?? 0);
  const c = s.crew?.[m.id];
  if (c?.busy !== undefined && c.busy > t) t = c.busy;
  if (c?.rest && c.rest.until > t) t = c.rest.until;
  return t;
}

/** Обследование в другом кабинете (spec «Как будет», 4): процедура `seconds` секунд, кабинет свободен с `ready`. */
export interface ExamLeg {
  seconds: number;
  ready: number;
}

/**
 * Перевозка больного `id` из помещения `from` в `to` — на того, кто раньше будет у больного (при равном — кто раньше в
 * штате), ничего не меняя: `after` — раньше этого часа больного не взять (он ещё на другом обследовании); `since` — с какого
 * часа он ждёт каталку (нет — сейчас); `urgent` — срочный: без санитара его везёт медсестра (`carriersOf`). Обследование
 * (`exam`) — туда и назад: тот, кто везёт, ждёт у аппарата. Везти некому — нет.
 */
export function planRide(
  db: ContentDb,
  s: ShiftState,
  plan: Plan,
  staff: readonly StaffMember[],
  id: string,
  why: RideWhy,
  from: string,
  to: string,
  opts: { exam?: ExamLeg; after?: number; since?: number; urgent?: boolean } = {},
): Ride | undefined {
  const g = gurneyOf(db, s);
  if (!g) return undefined;
  let best: Ride | undefined;
  for (const m of carriersOf(plan, staff, from, opts.urgent ?? false)) {
    const free = freeAt(s, m);
    // к тому часу его смена кончится — он ушёл
    if (!onDuty(db, m, free)) continue;
    const walk = walkPc(plan, m.room, from);
    const pick = Math.max(free + walk, opts.after ?? 0);
    if (best && pick >= best.pick) continue;
    const go = pick - walk;
    const off = pick + g.load * MIN;
    const drop = off + walkPc(plan, from, to);
    const done = drop + g.unload * MIN;
    if (!opts.exam) {
      best = { id, by: m.id, why, since: opts.since ?? s.t, from, to, go, pick, off, drop, done, home: done + walkPc(plan, to, m.room) };
      continue;
    }
    // у аппарата: начнут, когда переложили и аппарат свободен; кончили — назад тем же путём
    const start = Math.max(done, opts.exam.ready);
    const end = start + opts.exam.seconds;
    const back = end + g.load * MIN;
    const there = back + walkPc(plan, to, from);
    const placed = there + g.unload * MIN;
    best = {
      id, by: m.id, why, since: opts.since ?? s.t, from, to, go, pick, off, drop, done,
      exam: { start, end, off: back, drop: there, done: placed }, home: placed + walkPc(plan, from, m.room),
    };
  }
  return best;
}

/** Записать перевозку (`planRide`): теперь она за ним. */
export function book(s: ShiftState, ride: Ride) {
  (s.rides ??= []).push(ride);
}

/** Перевозка больного `id`, что ещё идёт (не вернулся тот, кто вёз), — последняя записанная; нет — нет. */
export function rideOf(s: ShiftState, id: string, why?: RideWhy): Ride | undefined {
  const list = s.rides ?? [];
  for (let i = list.length - 1; i >= 0; i--) if (list[i].id === id && (why === undefined || list[i].why === why)) return list[i];
  return undefined;
}

/**
 * Откуда лежачего `id` повезут на койку, пока его не увезли (spec «Как будет», 3: ждёт там, где лежит): перевозка записана,
 * а переложить на каталку ещё не успели, — или везти некому. Нет — на койку его не ждут везти.
 */
export function pickupOf(s: ShiftState, id: string): string | undefined {
  const r = rideOf(s, id, 'bed');
  if (r) return s.t < r.off ? r.from : undefined;
  return s.rideWait?.find(w => w.id === id && w.why === 'bed')?.from;
}

/** Тот, кто вёз, вернулся на место: перевозка кончилась — долой. */
export function rideHome(s: ShiftState, id: string, by: string) {
  if (!s.rides) return;
  const i = s.rides.findIndex(r => r.id === id && r.by === by && r.home <= s.t);
  if (i >= 0) s.rides.splice(i, 1);
  if (s.rides.length === 0) delete s.rides;
}
