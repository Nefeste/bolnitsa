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
import { noteMood } from './mood';
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
    topped(db, s, m, c);
  }
  return c;
}

/**
 * Дошёл до предела — отметка настроения за эту смену (spec docs/specs/2026-10-staff-mood.md). Усталость до перерыва только
 * растёт, а перерыв начинается досчитанной: предел виден при первом же досчёте после него, а не успел до конца смены — в
 * пересменку (`shiftEnded`).
 */
function topped(db: ContentDb, s: ShiftState, m: StaffMember, c: Crew) {
  if (c.f >= MAX) noteMood(db, s, m, 'limit', shiftStartOf(db, s.t));
}

/**
 * Пересменка (spec docs/specs/2026-10-staff-mood.md): у кого смена кончилась сейчас — дошёл ли до предела к её концу; отметка
 * настроения — начало той смены. Позвать дважды в один час — то же.
 */
export function shiftEnded(db: ContentDb, s: ShiftState) {
  if (!s.flow || !db.economy.staff.mood || !s.staff) return;
  for (const m of s.staff) {
    if (m.shift === undefined || !onDuty(db, m, s.t - 1) || onDuty(db, m, s.t)) continue;
    const l = levelOf(db, s, m, s.t - 1);
    if (l !== undefined && l >= MAX) noteMood(db, s, m, 'limit', shiftStartOf(db, s.t - 1));
  }
}

/**
 * Принял больного (`case`), записал обследование (`exam`, часть 2б) или перевозку на каталке (`ride`, spec
 * docs/specs/2026-10-orderlies.md): усталость — на столько очков больше. Ушедший со сменой не устаёт.
 */
export function worked(db: ContentDb, s: ShiftState, m: StaffMember, what: 'case' | 'exam' | 'ride' = 'case') {
  const f = numbersOf(db, s, m);
  if (!f || !onDuty(db, m, s.t)) return;
  const c = settle(db, s, m, f);
  c.f = Math.min(MAX, c.f + f[what] * POINT);
  topped(db, s, m, c);
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
  return r && !r.planned && r.until > s.t ? r.until - s.t : 0;
}

/**
 * С какого часа человек `m` на месте, если нужен в `t` на `dur` секунд (часть 2б): работа задела его перерыв — когда
 * вернётся; везёт лежачего на каталке (медсестра, когда санитаров в смене нет, spec docs/specs/2026-10-orderlies.md) — когда
 * вернётся с перевозки; иначе — `t`. Нет человека — `t`.
 */
export function backAt(s: ShiftState, m: StaffMember | undefined, t: number, dur = 0): number {
  if (!m) return t;
  let at = t;
  // миг — секунда: нужен ровно в час, когда ушёл, — уже нет
  for (const x of s.rides ?? []) if (x.by === m.id && at < x.home && Math.max(at + dur, at + 1) > x.go) at = x.home;
  const r = s.crew?.[m.id]?.rest;
  return r && at < r.until && Math.max(at + dur, at + 1) > r.from ? r.until : at;
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
export function startRest(db: ContentDb, s: ShiftState, plan: Plan, working: ReadonlySet<string>, m: StaffMember, kind: 'toilet' | 'rest', from = s.t): Rest | undefined {
  const f = numbersOf(db, s, m);
  if (!f || !onDuty(db, m, s.t)) return undefined;
  const c = settle(db, s, m, f);
  if (c.rest) return undefined;
  // отложенный (часть 2б): уйдёт в `from`, когда кончит записанных к нему; усталость падает тогда же (`beginRest`)
  const later = from > s.t ? { planned: true as const } : {};
  if (kind === 'toilet') {
    const room = nearest(plan, working, 'room.toilet', m.room);
    if (!room) {
      c.wc = s.t + toiletGap(s, f, m, s.t);
      return undefined;
    }
    const go = walkPc(plan, m.room, room);
    const there = f.wc * MIN;
    c.rest = { kind: 'toilet', room, from, at: from + go, back: from + go + there, until: from + 2 * go + there, ...later };
    c.wc = c.rest.until + toiletGap(s, f, m, c.rest.until);
    return c.rest;
  }
  const room = nearest(plan, working, 'room.staff', m.room);
  const go = room ? walkPc(plan, m.room, room) : 0;
  const there = (room ? 1 : 2) * f.rest * MIN;
  c.rest = room
    ? { kind: 'staff', room, from, at: from + go, back: from + go + there, until: from + 2 * go + there, ...later }
    : { kind: 'here', ...(m.room ? { room: m.room } : {}), from, at: from, back: from + there, until: from + there, ...later };
  // настроение (spec 2026-10-staff-mood): отдыхал на месте — ординаторской нет
  if (!room) noteMood(db, s, m, 'here', shiftStartOf(db, from));
  if (!c.rest.planned) relieve(f, c);
  return c.rest;
}

/** Ушёл на перерыв: усталость на `relief` меньше и до конца перерыва не растёт; в туалет — растёт, как шла. */
function relieve(f: Fatigue, c: Crew) {
  if (!c.rest || c.rest.kind === 'toilet') return;
  c.f = Math.max(0, c.f - f.relief * POINT);
  c.at = c.rest.until;
}

/** Отложенный перерыв начался (часть 2б): он ушёл — усталость досчитана до этой минуты и падает. */
export function beginRest(db: ContentDb, s: ShiftState, m: StaffMember) {
  const f = numbersOf(db, s, m);
  const r = s.crew?.[m.id]?.rest;
  if (!f || !r?.planned || s.t < r.from) return;
  const c = s.crew![m.id];
  if (s.t > c.at) {
    c.f = Math.min(MAX, c.f + rateOf(f, m) * (s.t - c.at));
    c.at = s.t;
    topped(db, s, m, c);
  }
  delete r.planned;
  relieve(f, c);
}

/** Для окна: усталость в очках и перерыв, если он ещё идёт. */
export interface CrewView {
  id: string;
  f: number;
  rest?: Rest;
}

/**
 * Для окна (spec 2026-10-staff-shifts, часть 2): усталость и перерыв каждого из `list` (врачи в смене), кто устаёт. В движке
 * усталость падает на `relief`, как только врач ушёл на перерыв; игрок видит, как она падает, пока он отдыхает.
 */
export function crewOf(db: ContentDb, s: ShiftState, list: readonly StaffMember[]): CrewView[] {
  const relief = db.economy.staff.fatigue?.relief ?? 0;
  return list.flatMap(m => {
    const l = levelOf(db, s, m);
    if (l === undefined) return [];
    const r = s.crew?.[m.id]?.rest;
    // отложенный перерыв (часть 2б) — ещё работает
    const on = r !== undefined && !r.planned && r.until > s.t;
    const left = on && r.kind !== 'toilet' ? Math.round((relief * (r.until - s.t)) / Math.max(1, r.until - r.from)) : 0;
    return [{ id: m.id, f: Math.min(100, pointsOf(l) + left), ...(on ? { rest: { ...r } } : {}) }];
  });
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
