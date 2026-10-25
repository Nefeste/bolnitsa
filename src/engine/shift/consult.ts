// «Просят посмотреть» (spec docs/specs/2026-10-consults.md): нанятый врач в потоке для ПК выбрал диагноз, но не уверился — и
// зовёт вас, а не решает сам. Правило — чистая функция того, что врач знает: уверенности вывода в болезнях (`posterior`,
// только по открытому) и его навыка. Правды о больном оно не видит. Пороги — content/hospital/consults.yaml. Долгий случай
// (spec docs/specs/2026-10-economy.md): `long` часов без диагноза — просит с причиной «долго» (`askLong`).
import type { ContentDb, Id } from '../../content/types';
import { type Belief, contextOf, posterior, type Prior } from '../med/infer';
import { decisionLimit } from '../med/policy';
import type { Observation, Patient } from '../med/types';
import type { ConsultWhy } from './types';

/** Что врач знает, выбрав диагноз. */
export interface AskInput {
  /** навык 1–5 */
  skill: number;
  /** его диагноз */
  dx: Id;
  /** уверенность в его диагнозе, если она уже посчитана (шаг разумного врача): уверенному считать нечего */
  confidence?: number;
  /** болезни, из которых он выбирает, — всё, с чем приходят в отделения больного */
  candidates: readonly Id[];
  /** жалобы и пришедшие результаты */
  obs: readonly Observation[];
  patient: Patient;
  /** минут от прихода */
  minutes: number;
  /** специалист на записанном к нему: болезни профиля вероятнее */
  prior?: Prior;
}

export interface Ask {
  why: ConsultWhy[];
  /** что он думает: его диагноз и самая вероятная болезнь второй группы — с уверенностью во всей группе каждого */
  lead: Belief[];
}

/**
 * Попросит ли врач посмотреть и почему; нет — undefined. Решать некогда — идёт срок на лечение или место (подъём ST,
 * сепсис, судороги: `decisionLimit`) — не просит. Иначе — по уверенности вывода в болезнях (`askWhy`).
 */
export function askFor(db: ContentDb, x: AskInput): Ask | undefined {
  const c = db.consults;
  if (!c) return undefined;
  // уверен в самом диагнозе — тем более в его группе, а другой группе остаётся меньше доли `close` от неё: правило ответит
  // «нет», и вывод можно не считать (запас 1e-9 — на округление суммы уверенностей)
  if (x.confidence !== undefined && x.confidence * 100 >= c.unsure[skillAt(x.skill)] && x.confidence * (100 + c.close) > 100 + 1e-9) return undefined;
  if (decisionLimit(db, x.obs, x.patient.complaints, x.minutes, () => 0, x.patient) !== undefined) return undefined;
  return askWhy(db, x.skill, x.dx, posterior(db, x.candidates, x.obs, contextOf(db, x.patient, x.obs, x.prior)));
}

/** Номер порога навыка 1–5. */
const skillAt = (skill: number) => Math.min(5, Math.max(1, skill)) - 1;

/**
 * Попросит ли врач навыка `skill` с диагнозом `dx` при уверенностях `beliefs` (по убыванию, как у `posterior`).
 * Уверенность — по группам болезней: болезни одной группы лечат одинаково (ОРВИ, COVID-19 и острый бронхит, `group`), и
 * выбор между ними помощи не просит.
 * - `unsure`: уверенность в группе его диагноза ниже порога его навыка (`unsure`, %);
 * - `close`: другая группа — не меньше доли `close` от его группы: две гипотезы рядом.
 */
export function askWhy(db: ContentDb, skill: number, dx: Id, beliefs: readonly Belief[]): Ask | undefined {
  const c = db.consults;
  if (!c) return undefined;
  const { p1, p2, other, lead } = groupsOf(db, dx, beliefs);
  const why: ConsultWhy[] = [];
  if (p1 * 100 < c.unsure[skillAt(skill)]) why.push('unsure');
  if (other !== undefined && p2 * 100 >= c.close * p1) why.push('close');
  if (why.length === 0) return undefined;
  return { why, lead };
}

/**
 * Долгий случай (spec docs/specs/2026-10-economy.md, решение владельца 17.10.2026): врач `long` часов ведёт больного без
 * диагноза — просит посмотреть с причиной «долго»; что он думает — его ведущая болезнь и вторая группа по тому, что знает.
 */
export function askLong(db: ContentDb, x: Pick<AskInput, 'candidates' | 'obs' | 'patient' | 'prior'>): Ask {
  const beliefs = posterior(db, x.candidates, x.obs, contextOf(db, x.patient, x.obs, x.prior));
  return { why: ['long'], lead: groupsOf(db, beliefs[0].id, beliefs).lead };
}

/**
 * Уверенность по группам болезней: в группе диагноза `dx` (`p1`), самая вероятная другая группа (`other`, `p2`) и что врач
 * думает — его диагноз и лучшая болезнь второй группы с уверенностью во всей группе каждого.
 */
export function groupsOf(db: ContentDb, dx: Id, beliefs: readonly Belief[]): { p1: number; p2: number; other?: Id; lead: Belief[] } {
  const group = (id: Id) => db.conditions[id]?.group ?? id;
  // уверенность в группе — сумма по её болезням; лучшая болезнь группы — первая: уверенности идут по убыванию
  const mass = new Map<Id, number>();
  const best = new Map<Id, Id>();
  for (const b of beliefs) {
    const g = group(b.id);
    mass.set(g, (mass.get(g) ?? 0) + b.p);
    if (!best.has(g)) best.set(g, b.id);
  }
  const mine = group(dx);
  const p1 = mass.get(mine) ?? 0;
  let other: Id | undefined;
  let p2 = 0;
  for (const [g, p] of mass) {
    if (g !== mine && p > p2) {
      other = g;
      p2 = p;
    }
  }
  return { p1, p2, ...(other !== undefined ? { other } : {}), lead: [{ id: dx, p: p1 }, ...(other !== undefined ? [{ id: best.get(other)!, p: p2 }] : [])] };
}
