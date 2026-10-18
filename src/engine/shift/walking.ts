// Дорога пациента в потоке для ПК (spec docs/specs/2026-10-walk.md) — своё «Больницы», в сменах «Анамнеза» не зовётся.
// Где он ждёт, когда дойдёт от входа до регистратуры и до зоны ожидания, сколько ему идти к врачу. Время — дорога по
// клеткам плана, делённая на скорость, с какой люди идут на экране (`WALK_SPEED_PC`): движок и окно видят одну дорогу.
// Случайности нет: та же больница — те же числа.
import type { Plan } from '../hospital/build';
import { metersBetween, metersFromEntrance } from '../hospital/walk';
import { REGISTRATION, type ShiftPatient, TRIAGE } from './types';

/** Игровых секунд в настоящую секунду при ×1 — «спокойный» темп, решение владельца 17.10.2026. */
export const GAME_PER_REAL = 20;
/** Метров в настоящую секунду идут люди на экране при ×1. */
export const SCREEN_WALK = 1.6;
/** Метров в игровую секунду: с этой скоростью движок считает дорогу, и с ней же люди идут на экране. */
export const WALK_SPEED_PC = SCREEN_WALK / GAME_PER_REAL;

const secs = (m: number | undefined): number => Math.round((m ?? 0) / WALK_SPEED_PC);

/** Сколько первых в очереди к врачу ждут у двери его кабинета (spec 2026-10-walk) — игровая оценка, подобрана симулятором. */
export const AT_DOOR = 2;

/**
 * Сколько игровых секунд регистратура кладёт на каждого, кто уже ждёт врача или у него, когда решает, к кому записать
 * (spec 2026-10-walk): терапевт навыка 3 принимает около трёх в час (content/hospital/inflow.yaml) — игровая оценка.
 */
export const PER_QUEUED = 20 * 60;

/** Секунд пешком от двери `from` до двери `to` в потоке для ПК. */
export const walkPc = (plan: Plan, from: string | undefined, to: string | undefined): number => (from && to ? secs(metersBetween(plan, from, to)) : 0);

/** Работающее помещение этого вида — первое по плану. */
const first = (plan: Plan, working: ReadonlySet<string>, type: string): string | undefined => plan.rooms.find(r => r.type === type && working.has(r.id))?.id;

/** Секунд пешком от регистратуры до кабинета `office`; регистратуры нет — 0. */
export const fromDesk = (plan: Plan, working: ReadonlySet<string>, office: string | undefined): number => walkPc(plan, first(plan, working, 'room.reception'), office);

/** Зона ожидания у кабинета `office` (spec 2026-10-walk, «Своя зона ожидания»): ближайшая работающая по коридорам. */
export function hallNear(plan: Plan, working: ReadonlySet<string>, office: string | undefined): string | undefined {
  let best: string | undefined;
  let d = Number.POSITIVE_INFINITY;
  for (const r of plan.rooms) {
    if (r.type !== 'room.waiting' || !working.has(r.id)) continue;
    const m = office ? (metersBetween(plan, r.id, office) ?? Number.POSITIVE_INFINITY) : 0;
    if (best === undefined || m < d) {
      best = r.id;
      d = m;
    }
  }
  return best;
}

/**
 * Пришёл в больницу в `t` (spec 2026-10-walk, «Дорога в движке»): идёт от входа к регистратуре (`regAt` — дошёл),
 * оформляется, к медсестре доврачебного кабинета, если она есть (`triAt` — дошёл до неё), и в свою зону ожидания
 * (`seatAt` — сел; `leg` — откуда и когда пошёл к ней). Нет регистратуры или зала — сразу на месте.
 */
export function route(plan: Plan, working: ReadonlySet<string>, hall: string | undefined, nurse: boolean, t: number): { regAt: number; triAt?: number; seatAt: number; leg?: Leg } {
  const reception = first(plan, working, 'room.reception');
  if (!reception || !hall) return { regAt: t, seatAt: t };
  const regAt = t + secs(metersFromEntrance(plan, reception));
  const triage = nurse ? first(plan, working, 'room.triage') : undefined;
  if (!triage) {
    const leave = regAt + REGISTRATION;
    return { regAt, seatAt: leave + walkPc(plan, reception, hall), leg: { from: reception, at: leave } };
  }
  const triAt = regAt + REGISTRATION + walkPc(plan, reception, triage);
  const leave = triAt + TRIAGE;
  return { regAt, triAt, seatAt: leave + walkPc(plan, triage, hall), leg: { from: triage, at: leave } };
}

/**
 * С какого часа пришедшего может позвать нанятый врач (spec 2026-10-walk): когда его оформили и, если в больнице есть
 * медсестра доврачебного кабинета, измерили. Врач не ждёт у себя того, кто ещё стоит у стойки, — зовёт готового.
 */
export const readyAt = (p: ShiftPatient): number => (p.regAt === undefined ? 0 : p.triAt !== undefined ? p.triAt + TRIAGE : p.regAt + REGISTRATION);

/** Откуда и с какого часа пациент идёт туда, где ждёт: в зал или к двери кабинета. */
export interface Leg {
  from: string;
  at: number;
}

/** Где пациент ждёт — у двери кабинета или в зале — и к какому часу туда дойдёт. */
export const waitsAt = (p: ShiftPatient): { at: string | undefined; t: number | undefined } =>
  p.next !== undefined ? { at: p.next, t: p.nextAt } : { at: p.hall, t: p.seatAt };

/**
 * Перевели к другому врачу (spec 2026-10-walk): из кабинета прежнего `from` с `t` — в зону ожидания у кабинета нового.
 */
export function moveTo(plan: Plan, working: ReadonlySet<string>, p: ShiftPatient, from: string | undefined, office: string | undefined, t: number) {
  p.hall = hallNear(plan, working, office);
  delete p.next;
  delete p.nextAt;
  if (!from || !p.hall) {
    delete p.leg;
    p.seatAt = t;
    return;
  }
  p.leg = { from, at: t };
  p.seatAt = t + walkPc(plan, from, p.hall);
}

/**
 * Он следующий к врачу в кабинете `office` (геймдизайн §5: «ждут у двери кабинета, и врач зовёт следующего, заканчивая
 * с прежним»): с `t` — или как дойдёт до зала — идёт из зала к двери кабинета и ждёт там. Тогда дорога из дальнего зала
 * приходится на чужой приём, а не на время врача.
 */
export function toDoor(plan: Plan, p: ShiftPatient, office: string, t: number) {
  if (p.next === office) return;
  const was = waitsAt(p);
  const fresh = p.next === undefined;
  p.next = office;
  // ещё у стойки или у медсестры — оттуда прямо к двери
  if (fresh && p.leg && t < p.leg.at) {
    p.nextAt = p.leg.at + walkPc(plan, p.leg.from, office);
    return;
  }
  const at = Math.max(t, was.t ?? t);
  if (was.at) p.leg = { from: was.at, at };
  p.nextAt = at + walkPc(plan, was.at, office);
}

/**
 * Сколько секунд пациенту идти к врачу в `room` из того места, где его застал вызов (spec 2026-10-walk): ждёт в зале или
 * у двери — оттуда; ещё у стойки или у прежнего врача — когда отпустят, оттуда; в пути — дойти, куда шёл, и оттуда или
 * вернуться назад, что ближе. Пути нет — 0.
 */
export function toDoctor(plan: Plan, p: ShiftPatient, room: string, t: number): number {
  const { at, t: there } = waitsAt(p);
  if (!at) return 0;
  if (there === undefined || t >= there || !p.leg) return walkPc(plan, at, room);
  if (t < p.leg.at) return p.leg.at - t + walkPc(plan, p.leg.from, room);
  return Math.min(there - t + walkPc(plan, at, room), t - p.leg.at + walkPc(plan, p.leg.from, room));
}
