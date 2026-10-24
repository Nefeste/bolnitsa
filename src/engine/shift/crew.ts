// Усталость и перерывы нанятых врачей в смене (spec docs/specs/2026-10-staff-shifts.md, часть 2; геймдизайн §7) — своё
// «Больницы», только в потоке для ПК и только у нанятых со сменой: без смен (сохранения до 0.9.0, смены «Анамнеза») врачи
// не устают. Усталость растёт сама за часы в смене и за каждого принятого; на перерыв и в туалет врач уходит, когда свободен.
// Числа — `economy.yaml`, `staff.fatigue`. Усталость — целые доли очка, поэтому досчитанная по частям она та же, что сразу:
// те же зерно и команды — та же усталость при любом шаге часов. Случайный здесь только час туалета — из ветви зерна смены.
import type { ContentDb } from '../../content/types';
import { Rng } from '../core/rng';
import type { Plan } from '../hospital/build';
import { onDuty, shiftStartOf, type StaffMember } from '../hospital/staff';
import { metersBetween } from '../hospital/walk';
import type { Crew, Rest, ShiftState } from './types';
import { walkPc } from './walking';

/** Долей в очке усталости: за час в смене прибавляется `hour` очков — `hour` · 100 долей в секунду. */
export const POINT = 360_000;
/** Предел усталости — 100 очков. */
const MAX = 100 * POINT;
const MIN = 60;

type Fatigue = NonNullable<ContentDb['economy']['staff']['fatigue']>;

/** Числа усталости, если этот человек устаёт: поток для ПК, у него смена, в базе есть усталость. */
function numbersOf(db: ContentDb, s: ShiftState, m: StaffMember): Fatigue | undefined {
  return s.flow && m.shift !== undefined ? db.economy.staff.fatigue : undefined;
}

/** Долей усталости в секунду: в ночную смену — быстрее. */
const rateOf = (f: Fatigue, m: StaffMember): number => f.hour * (m.shift === 'night' ? f.night : 100);

/** Запись этой смены; с прошлой смены — не в счёт: пришёл отдохнувшим. */
function current(s: ShiftState, m: StaffMember, start: number): Crew | undefined {
  const c = s.crew?.[m.id];
  return c && c.at >= start ? c : undefined;
}

/** Через сколько секунд после `t` в туалет: от `toilet[0]` до `toilet[1]` часов — из ветви зерна смены, по человеку и часу. */
function toiletGap(s: ShiftState, f: Fatigue, m: StaffMember, t: number): number {
  return Rng.seeded(s.meta.seed).fork(`wc:${m.id}:${t}`).range(f.toilet[0] * 60, f.toilet[1] * 60) * MIN;
}

/** Усталость нанятого `m` в `t`, долями очка (от 0 до 100 · `POINT`), ничего не меняя; не устаёт или не в смене — нет. */
export function levelOf(db: ContentDb, s: ShiftState, m: StaffMember, t = s.t): number | undefined {
  const f = numbersOf(db, s, m);
  if (!f || !onDuty(db, m, t)) return undefined;
  const start = shiftStartOf(db, t);
  const c = current(s, m, start);
  const from = c ? c.at : start;
  const base = c ? c.f : 0;
  return t <= from ? base : Math.min(MAX, base + rateOf(f, m) * (t - from));
}

/** Усталость в очках, 0–100: столько видит игрок. */
export const pointsOf = (level: number): number => Math.floor(level / POINT);

/** Запись усталости сейчас: досчитана до `s.t` (на перерыве — та, что после него); новая смена — с нуля. */
function settle(db: ContentDb, s: ShiftState, m: StaffMember, f: Fatigue): Crew {
  const start = shiftStartOf(db, s.t);
  let c = current(s, m, start);
  if (!c) c = (s.crew ??= {})[m.id] = { f: 0, at: start, wc: start + toiletGap(s, f, m, start) };
  if (c.rest && c.rest.until <= s.t) delete c.rest;
  if (s.t > c.at) {
    c.f = Math.min(MAX, c.f + rateOf(f, m) * (s.t - c.at));
    c.at = s.t;
  }
  return c;
}

/** Принял больного: усталость — на `case` очков больше. Ушедший со сменой не устаёт. */
export function worked(db: ContentDb, s: ShiftState, m: StaffMember) {
  const f = numbersOf(db, s, m);
  if (!f || !onDuty(db, m, s.t)) return;
  const c = settle(db, s, m, f);
  c.f = Math.min(MAX, c.f + f.case * POINT);
}

/** Сколько времени у врача займёт работа, % (`speedOf`): с усталостью не ниже `slow` — на `slower` % дольше. */
export function slowedOf(db: ContentDb, s: ShiftState, m: StaffMember, pct: number): number {
  const f = numbersOf(db, s, m);
  const l = f ? levelOf(db, s, m) : undefined;
  return f && l !== undefined && l >= f.slow * POINT ? Math.round((pct * f.slower) / 100) : pct;
}

/** Усталость, с которой врач ставит диагноз при меньшей уверенности, — очки; не устал так — нет. */
export function tiredOf(db: ContentDb, s: ShiftState, m: StaffMember): number | undefined {
  const f = numbersOf(db, s, m);
  const l = f ? levelOf(db, s, m) : undefined;
  return f && l !== undefined && l >= f.tired * POINT ? pointsOf(l) : undefined;
}

/** Порог диагноза (доля 0–1) с усталостью: устал не меньше `tired` — на `blur` п. п. ниже. */
export function blurredOf(db: ContentDb, s: ShiftState, m: StaffMember, threshold: number): number {
  const blur = tiredOf(db, s, m) !== undefined ? db.economy.staff.fatigue!.blur : 0;
  return blur > 0 ? (Math.round(threshold * 100) - blur) / 100 : threshold;
}

/** Сколько секунд ещё отдыхать врачу `id`: не отдыхает — 0. */
export function restLeft(s: ShiftState, id: string | undefined): number {
  const r = id !== undefined ? s.crew?.[id]?.rest : undefined;
  return r && r.until > s.t ? r.until - s.t : 0;
}

/**
 * Что врачу пора: в туалет (`wc`) и насколько устал (`tired`: 0 — нет, 1 — не меньше `slow`, 2 — на пределе). Не устаёт,
 * не в смене или уже отдыхает — нет.
 */
export function dueOf(db: ContentDb, s: ShiftState, m: StaffMember): { wc: boolean; tired: 0 | 1 | 2 } | undefined {
  const f = numbersOf(db, s, m);
  if (!f || !onDuty(db, m, s.t)) return undefined;
  const c = settle(db, s, m, f);
  if (c.rest) return undefined;
  return { wc: c.wc !== undefined && s.t >= c.wc, tired: c.f >= MAX ? 2 : c.f >= f.slow * POINT ? 1 : 0 };
}

/**
 * Когда свободному врачу станет пора отдыхать, если звать его так никто и не будет: в туалет или на перерыв — усталость
 * дойдёт до `slow`. Пора уже, не устаёт или к тому часу смена кончится — нет.
 */
export function wakeOf(db: ContentDb, s: ShiftState, m: StaffMember): number | undefined {
  const f = numbersOf(db, s, m);
  if (!f || !onDuty(db, m, s.t)) return undefined;
  const c = current(s, m, shiftStartOf(db, s.t));
  if (!c || c.rest) return undefined;
  const need = f.slow * POINT - c.f;
  const t = Math.min(c.wc ?? Number.POSITIVE_INFINITY, need > 0 ? c.at + Math.ceil(need / rateOf(f, m)) : Number.POSITIVE_INFINITY);
  return Number.isFinite(t) && t > s.t && onDuty(db, m, t) ? t : undefined;
}

/** Ближайшее работающее помещение этого вида, до двери которого дойти из `from`. */
function nearest(plan: Plan, working: ReadonlySet<string>, type: string, from: string | undefined): string | undefined {
  let best: string | undefined;
  let d = Number.POSITIVE_INFINITY;
  for (const r of plan.rooms) {
    if (r.type !== type || !working.has(r.id)) continue;
    const m = from ? metersBetween(plan, from, r.id) : 0;
    if (m !== undefined && m < d) {
      best = r.id;
      d = m;
    }
  }
  return best;
}

/**
 * Уйти сейчас: в туалет — в ближайший санузел на `wc` минут (санузла нет — не ходит, следующий раз — через `toilet` часов);
 * на перерыв — в ближайшую ординаторскую на `rest` минут, усталость меньше на `relief`; ординаторской нет — отдыхает в
 * своём кабинете вдвое дольше. Туда и назад — пешком, как ходят люди (`walkPc`); пока отдыхает, не устаёт. Ушёл — его
 * перерыв, нет — ничего.
 */
export function startRest(db: ContentDb, s: ShiftState, plan: Plan, working: ReadonlySet<string>, m: StaffMember, kind: 'toilet' | 'rest'): Rest | undefined {
  const f = numbersOf(db, s, m);
  if (!f || !onDuty(db, m, s.t)) return undefined;
  const c = settle(db, s, m, f);
  if (c.rest) return undefined;
  if (kind === 'toilet') {
    const room = nearest(plan, working, 'room.toilet', m.room);
    if (!room) {
      c.wc = s.t + toiletGap(s, f, m, s.t);
      return undefined;
    }
    const go = walkPc(plan, m.room, room);
    const there = f.wc * MIN;
    c.rest = { kind: 'toilet', room, from: s.t, at: s.t + go, back: s.t + go + there, until: s.t + 2 * go + there };
    c.wc = c.rest.until + toiletGap(s, f, m, c.rest.until);
    return c.rest;
  }
  const room = nearest(plan, working, 'room.staff', m.room);
  const go = room ? walkPc(plan, m.room, room) : 0;
  const there = (room ? 1 : 2) * f.rest * MIN;
  c.rest = room
    ? { kind: 'staff', room, from: s.t, at: s.t + go, back: s.t + go + there, until: s.t + 2 * go + there }
    : { kind: 'here', ...(m.room ? { room: m.room } : {}), from: s.t, at: s.t, back: s.t + there, until: s.t + there };
  c.f = Math.max(0, c.f - f.relief * POINT);
  c.at = c.rest.until;
  return c.rest;
}

/**
 * Пересменка: записи тех, кого больше нет в смене или в штате, — долой, кроме тех, кто ещё не вернулся с перерыва; записи
 * прошлой смены тех, кто снова в смене, — тоже: пришли отдохнувшими.
 */
export function dropCrew(db: ContentDb, s: ShiftState) {
  if (!s.crew) return;
  const start = shiftStartOf(db, s.t);
  for (const id of Object.keys(s.crew)) {
    const c = s.crew[id];
    const m = s.staff?.find(x => x.id === id);
    if ((m && onDuty(db, m, s.t) && c.at >= start) || (c.rest && c.rest.until > s.t)) continue;
    delete s.crew[id];
  }
  if (Object.keys(s.crew).length === 0) delete s.crew;
}
