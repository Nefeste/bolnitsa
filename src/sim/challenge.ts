// Итог испытания (spec docs/specs/2026-11-challenges.md, часть 1): оценка от A до D — по итогу смены врача (`shiftResult`) или по
// числу испытания и его порогам (доля не принятых, принятые, касса); «Пройдено» — не ниже «B» и правило испытания: обследований
// без показаний у ваших приёмов — не больше N. Красные по шкале, позванные врачом за N минут, — для сведения: один врач не
// успеет к двум сразу, а больной со своим сроком важнее (`moreUrgent`). Считает расчётный поток: окно правды не видит. Конец —
// `challengeEndAt`: в час `to`, а в 08:00 — за секунду до планёрки, она начинает новые сутки.
import type { Challenge, ContentDb, Id } from '../content/types';
import { caseIncome } from '../engine/economy/economy';
import type { Site } from '../engine/hospital/site';
import { siteOfPlan } from '../engine/hospital/site-plan';
import { siteOfPreset } from '../engine/hospital/site-preset';
import { presetStaff, type StaffMember, withNightShift } from '../engine/hospital/staff';
import type { Grade } from '../engine/med/score';
import { challengeOf } from '../engine/shift/challenge';
import type { ShiftPatient, ShiftState } from '../engine/shift/types';
import { POINTS, shiftResult, type ShiftResult } from './shift';

const HOUR = 3600;

type Hospital = { site: Site; staff: StaffMember[] };

/**
 * Больница начала испытания — готовая из записи `sites/` или `presets/`, как её открывает окно, со сменами: ночная — там, где
 * у неё койки или смотровая (`withNightShift`), один раз и после роли. Ваш кабинет — ваш; «Кто вы» решает окно — `role`
 * (`startFor`: у «Управляющего» в вашем кабинете нанятый терапевт).
 */
export function challengeStart(db: ContentDb, c: Challenge, role?: (site: Site, staff: StaffMember[]) => Hospital): Hospital {
  const h = (() => {
    if (c.start.startsWith('site.')) {
      const p = siteOfPlan(db, db.sites![c.start]);
      if (!p.ok) throw new Error(`${c.start}: ${p.error.kind}`);
      return { site: p.site, staff: p.staff };
    }
    const rec = db.presets[c.start];
    return { site: siteOfPreset(db, rec), staff: presetStaff(db, rec) };
  })();
  const r = role ? role(h.site, h.staff) : h;
  return { site: r.site, staff: withNightShift(db, r.site.rooms, r.staff) };
}

/** Когда кончается испытание, секунды от 00:00 первых суток: в час `to`; в 08:00 — за секунду до планёрки. */
export const challengeEndAt = (c: Challenge): number => c.to * HOUR - (c.to % 24 === 8 ? 1 : 0);

export interface ChallengeEnd {
  id: Id;
  grade: Grade;
  passed: boolean;
  /** число итога: доля не принятых, % (до десятых); принятые; касса, ₽; балл смены врача */
  value: number;
  /** пришли за испытание — сами, по записи и скорая; приняты — врач позвал до конца */
  arrived: number;
  seen: number;
  /** итог смены врача — у испытания врача */
  shift?: ShiftResult;
  /** «Одна ночь»: красных по шкале привезли и сколько из них врач позвал в срок — для сведения */
  reds?: { inTime: number; total: number };
  /** «Только по показаниям»: обследований без показаний у ваших приёмов */
  unindicated?: number;
}

/** Все, кто пришёл с часа `from` до конца: и в больнице, и ушедшие — строкой журнала (`gone`). */
function arrivals(s: ShiftState, from: number, end: number): { arriveT: number; calledT?: number }[] {
  const inside = (t: number) => t >= from && t < end;
  return [...Object.values(s.patients).filter(p => inside(p.arriveT)), ...(s.gone ?? []).filter(r => inside(r.arriveT))];
}

/** Карты: и тех, кто в больнице, и ушедших — за сутки (`past`). */
const cards = (s: ShiftState): ShiftPatient[] => [...Object.values(s.patients), ...(s.past ?? []).map(x => x.p)];

/** Обследования без показаний у ваших закрытых приёмов — как их снимает экспертиза ОМС (`caseIncome`). */
export function unindicatedOf(db: ContentDb, s: ShiftState): number {
  return cards(s)
    .filter(p => p.closed && !p.closed.by)
    .reduce((n, p) => n + caseIncome(db, 'oms', p.closed!.diagnosis, p.done, p.indicated ?? [], p.closed!.grades.defensibility).unindicated.length, 0);
}

/**
 * Рентгеновских снимков за испытание (spec docs/specs/2026-11-technicians.md, часть 3): назначенных обследований кабинета рентгена у
 * всех карт — и тех, кто в больнице, и ушедших.
 */
export function xraysOf(db: ContentDb, s: ShiftState): number {
  return cards(s).reduce((n, p) => n + p.done.filter(e => db.exams[e]?.room === 'room.xray').length, 0);
}

/** Оценка по порогам: у доли не принятых — чем меньше, тем лучше, у остальных — чем больше. */
function byThresholds(value: number, g: Extract<Challenge['grade'], { a: number }>): Grade {
  const ok = (x: number) => (g.by === 'unseen' ? value <= x : value >= x);
  return ok(g.a) ? 'A' : ok(g.b) ? 'B' : ok(g.c) ? 'C' : 'D';
}

/** Итог испытания сейчас; смена без испытания — нет. */
export function challengeEnd(db: ContentDb, s: ShiftState): ChallengeEnd | undefined {
  const c = challengeOf(db, s);
  if (!c) return undefined;
  const end = challengeEndAt(c);
  const all = arrivals(s, c.from * HOUR, end);
  const seen = all.filter(p => p.calledT !== undefined && p.calledT < end).length;
  const out: ChallengeEnd = { id: c.id, grade: 'D', passed: false, value: 0, arrived: all.length, seen };
  if (c.grade.by === 'shift') {
    const r = shiftResult(s);
    if (r) {
      out.shift = r;
      out.grade = r.overall;
      out.value = r.points;
    }
  } else {
    out.value =
      c.grade.by === 'unseen' ? (all.length > 0 ? Math.round((1000 * (all.length - seen)) / all.length) / 10 : 0)
      : c.grade.by === 'seen' ? seen
        : c.grade.by === 'xrays' ? xraysOf(db, s)
          : (s.economy?.cash ?? 0);
    out.grade = byThresholds(out.value, c.grade);
  }
  let rules = true;
  if (c.reds !== undefined) {
    const reds = cards(s).filter(p => p.kind === 'ambulance' && p.scale?.triage === 'red' && p.arriveT >= c.from * HOUR && p.arriveT < end);
    const inTime = reds.filter(p => p.calledT !== undefined && p.calledT - p.arriveT <= c.reds! * 60).length;
    out.reds = { inTime, total: reds.length };
  }
  if (c.unindicated !== undefined) {
    out.unindicated = unindicatedOf(db, s);
    rules &&= out.unindicated <= c.unindicated;
  }
  out.passed = rules && POINTS[out.grade] >= POINTS.B;
  return out;
}
