// «Главврач утверждает» (spec docs/specs/2026-10-two-ways.md, F3): о чём нанятые врачи в потоке для ПК спрашивают главврача
// — галочки игрока, — и придёт ли решение врача на утверждение. Правило — чистая функция того, что врач знает: уверенности
// вывода в болезнях (`posterior`, только по открытому) и его плана; правды о больном оно не видит. Срок ответа — как у
// просьб (`consults.yaml`, `wait`).
import type { ContentDb, Id, Setting } from '../../content/types';
import { type Belief, contextOf, posterior, type Prior } from '../med/infer';
import { STAYS } from '../med/plan';
import { decisionLimit } from '../med/policy';
import type { Observation, Patient } from '../med/types';
import { groupsOf } from './consult';
import type { ApproveWhy, AskRule, ShiftState } from './types';

/** Все галочки — по порядку настройки. */
export const ASK_RULES: readonly AskRule[] = ['unsure', 'long', 'below90', 'every', 'admit', 'discharge'];

/** Галочки по умолчанию — как прежде: «не уверен» и «долгий случай» (решение владельца 24.10.2026, #65). */
export const DEFAULT_ASKS: readonly AskRule[] = ['unsure', 'long'];

/** Галочка «ниже 90 %»: уверенность в группе диагноза, доля. */
export const BELOW = 0.9;

/** О чём нанятые врачи спрашивают сейчас. */
export const asksOf = (s: ShiftState): readonly AskRule[] => s.meta.asks ?? DEFAULT_ASKS;

/** Галочки решений приёма: без них решение на утверждение не приходит, и вывод считать незачем. */
const DECISION_RULES: readonly AskRule[] = ['below90', 'every', 'admit'];

/** Спрашивают ли о решениях приёма — по галочкам; или главврач назначил обследование (`chief`). */
export const asksDecisions = (rules: readonly AskRule[], chief: boolean): boolean => chief || rules.some(r => DECISION_RULES.includes(r));

/** Что врач знает, решив. */
export interface ApproveInput {
  rules: readonly AskRule[];
  /** главврач назначил ему обследование — следующее решение к нему */
  chief: boolean;
  /** диагноз и место из плана врача */
  dx: Id;
  setting: Setting;
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

export interface ApproveAsk {
  why: ApproveWhy[];
  /** что он думает: его диагноз и самая вероятная болезнь второй группы — с уверенностью во всей группе каждого */
  lead: Belief[];
}

/**
 * Придёт ли решение врача на утверждение и почему; нет — undefined. Решать некогда — идёт срок на лечение или место (подъём
 * ST, сепсис, судороги: `decisionLimit`) — врач не ждёт, как и с просьбой. Иначе — по галочкам: каждое решение;
 * уверенность в группе его диагноза ниже 90 % (`BELOW`); госпитализация — палата, ПИТ, реанимация, бокс, операционная.
 */
export function approveFor(db: ContentDb, x: ApproveInput): ApproveAsk | undefined {
  if (!asksDecisions(x.rules, x.chief)) return undefined;
  let beliefs: Belief[] | undefined;
  const lead = () => groupsOf(db, x.dx, (beliefs ??= posterior(db, x.candidates, x.obs, contextOf(db, x.patient, x.obs, x.prior)))).lead;
  const why: ApproveWhy[] = [];
  if (x.chief) why.push('exam');
  if (x.rules.includes('every')) why.push('every');
  else if (x.rules.includes('below90') && lead()[0].p < BELOW) why.push('below90');
  if (x.rules.includes('admit') && STAYS.includes(x.setting)) why.push('admit');
  if (why.length === 0) return undefined;
  if (decisionLimit(db, x.obs, x.patient.complaints, x.minutes, () => 0, x.patient) !== undefined) return undefined;
  return { why, lead: lead() };
}
