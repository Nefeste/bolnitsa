// Экспертиза страховой по видам и акт раз в неделю (spec docs/specs/2026-11-scenario-6.md, часть 1а) — своё «Больницы», поток для ПК
// с кассой. Что снято за закрытый случай, делится на виды тем же счётом, что у `caseIncome` (экспертиза «Анамнеза»; её файл не
// тронут): обоснованность ниже A, диагноз без подтверждения, обследования без показаний; итоги суток — `DaySummary.audit`. Раз в
// `ACT_DAYS` суток планёрка получает акт — те же итоги за неделю (`weekAudit`). Деньги снимаются, как прежде, в день закрытия;
// акт — объяснение. Чистые функции.
import type { ContentDb, Id } from '../../content/types';
import type { CaseIncome, Payer } from '../economy/economy';
import type { Grade } from '../med/score';
import { scaledInt } from './manage';
import type { AuditDay, AuditWeek, DaySummary, ShiftPatient, ShiftState } from './types';

/** Акт страховой — раз в столько суток: на планёрке после седьмых, четырнадцатых… */
export const ACT_DAYS = 7;

const emptyAudit = (): AuditDay => ({ rub: { weak: 0, unconfirmed: 0, unindicated: 0 }, unconfirmed: {}, weak: {}, unindicated: {}, who: {} });

/**
 * Снятое за случай по видам, ₽, — как его посчитала `caseIncome`: обследования без показаний — по цене плательщика; у ОМС — за
 * обоснованность (доля тарифа обращения) и за диагноз без подтверждения (доля того, что осталось). Оплата уровня «Управления»
 * (`pay`) — на каждый вид, остаток округления — виду, где снято больше; вместе — `x.cut`.
 */
export function cutParts(db: ContentDb, payer: Payer, diagnosis: Id, x: CaseIncome, pay: number): AuditDay['rub'] {
  const t = db.economy.tariffs;
  const price = payer === 'oms' ? t.omsExam : payer === 'dms' ? t.dms.price : t.self.price;
  const exams = x.unindicated.reduce((a, id) => a + Math.round(((db.exams[id]?.cost ?? 0) * price) / 100), 0);
  let weak = 0;
  let unconfirmed = 0;
  if (payer === 'oms') {
    const full = Math.round((t.oms[db.conditions[diagnosis]?.severity ?? 'minor'] * x.level) / 100);
    const quality = Math.round((full * x.quality) / 100);
    const visit = Math.round((full * x.quality * (x.unconfirmed ? t.omsUnconfirmed : 100)) / 10000);
    weak = full - quality;
    unconfirmed = quality - visit;
  }
  const rub = { weak: scaledInt(weak, pay), unconfirmed: scaledInt(unconfirmed, pay), unindicated: scaledInt(exams, pay) };
  const rest = x.cut - rub.weak - rub.unconfirmed - rub.unindicated;
  if (rest !== 0) {
    const k = (['weak', 'unconfirmed', 'unindicated'] as const).reduce((a, b) => (rub[b] > rub[a] ? b : a));
    rub[k] += rest;
  }
  return rub;
}

/** Записать снятое за закрытый случай в итоги суток: по видам, по диагнозу, оценке и обследованию, по врачу. Ничего не сняли — ничего. */
export function recordAudit(db: ContentDb, s: ShiftState, p: ShiftPatient, payer: Payer, diagnosis: Id, defensibility: Grade, x: CaseIncome, pay: number) {
  if (x.cut <= 0) return;
  const a = (s.summary.audit ??= emptyAudit());
  const rub = cutParts(db, payer, diagnosis, x, pay);
  a.rub.weak += rub.weak;
  a.rub.unconfirmed += rub.unconfirmed;
  a.rub.unindicated += rub.unindicated;
  if (x.unconfirmed) a.unconfirmed[diagnosis] = (a.unconfirmed[diagnosis] ?? 0) + 1;
  if (x.quality < 100) a.weak[defensibility] = (a.weak[defensibility] ?? 0) + 1;
  for (const id of x.unindicated) a.unindicated[id] = (a.unindicated[id] ?? 0) + 1;
  const who = p.by ?? '';
  a.who[who] = (a.who[who] ?? 0) + 1;
}

const add = <K extends string>(to: Partial<Record<K, number>>, from: Partial<Record<K, number>>) => {
  for (const [k, n] of Object.entries(from) as [K, number][]) to[k] = (to[k] ?? 0) + n;
};

/**
 * Акт страховой за `ACT_DAYS` суток, что кончились сутками `day`: их экспертиза вместе — только на планёрке после седьмых,
 * четырнадцатых… суток; ничего не сняли и по правилу ничего не назначали — акта нет.
 */
export function weekAudit(history: readonly DaySummary[], day: number): AuditWeek | undefined {
  if (day < ACT_DAYS || day % ACT_DAYS !== 0) return undefined;
  const from = day - ACT_DAYS + 1;
  const days = history.filter(h => h.day >= from && h.day <= day);
  const act: AuditWeek = { ...emptyAudit(), from, to: day, cut: 0, confirms: 0 };
  for (const h of days) {
    act.confirms += h.confirms ?? 0;
    const a = h.audit;
    if (!a) continue;
    act.rub.weak += a.rub.weak;
    act.rub.unconfirmed += a.rub.unconfirmed;
    act.rub.unindicated += a.rub.unindicated;
    add(act.unconfirmed, a.unconfirmed);
    add(act.weak, a.weak);
    add(act.unindicated, a.unindicated);
    add(act.who, a.who);
  }
  act.cut = act.rub.weak + act.rub.unconfirmed + act.rub.unindicated;
  return act.cut > 0 || act.confirms > 0 ? act : undefined;
}
