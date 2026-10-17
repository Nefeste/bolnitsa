// Планёрка ПК (spec docs/specs/2026-10-economy.md, «Планёрка», «Обход») — своё «Больницы», поток для ПК. Узкие места суток:
// что движок видел за 24 часа — больше всего ждали врача и дольше всего, очередь у кабинетов обследований, скорая у входа,
// палаты; и «стало хуже» — ваши лежащие, перешедшие в 08:00 в «хуже» или «реакция на лечение». Пишется там, где это
// случается (постановка в очередь, назначение, приезд скорой, поступление, уход), — один максимум, без списков.
import { hospitalDay } from './day';
import type { DayLoad, ShiftPatient, ShiftState } from './types';
import { daysIn, wardState } from './ward';

const MIN = 60;

function loadOf(s: ShiftState): DayLoad {
  return (s.summary.load ??= { queue: 0, wait: 0 });
}

/** Встал в общую очередь к врачам: больше всего ждали сразу. */
export function queued(s: ShiftState) {
  const l = loadOf(s);
  if (s.queue.length > l.queue) l.queue = s.queue.length;
}

/** Ушёл, не дождавшись: ждал врача с прихода до сейчас. */
export function left(s: ShiftState, p: ShiftPatient) {
  const l = loadOf(s);
  const wait = Math.round((s.t - p.arriveT) / MIN);
  if (wait > l.wait) l.wait = wait;
}

/**
 * Назначено обследование в кабинете с очередью: больной пришёл к кабинету в `at`, процедура началась в `start`. Впереди —
 * обследования этого кабинета, что идут или ждут к его приходу.
 */
export function examWait(s: ShiftState, room: string, at: number, start: number) {
  const l = loadOf(s);
  const r = ((l.rooms ??= {})[room] ??= { queue: 0, wait: 0, n: 0 });
  r.n++;
  const wait = Math.round((start - at) / MIN);
  if (wait > r.wait) r.wait = wait;
  if (start <= at) return;
  let ahead = 0;
  for (const p of Object.values(s.patients)) {
    for (const x of p.pending) if (x.room === room && x.start !== undefined && x.end !== undefined && x.end > at && x.start < start) ahead++;
  }
  if (ahead > r.queue) r.queue = ahead;
}

/** Привезла скорая, а места в смотровой нет: сколько ждут у входа сразу. */
export function atDoor(s: ShiftState) {
  let n = 0;
  for (const p of Object.values(s.patients)) if (p.kind === 'ambulance' && !p.bay && p.status === 'waiting') n++;
  const l = loadOf(s);
  if (n > (l.door ?? 0)) l.door = n;
}

/** Положили в стационар: сколько лежит сразу. */
export function lying(s: ShiftState) {
  let n = 0;
  for (const p of Object.values(s.patients)) if (p.status === 'admitted') n++;
  const l = loadOf(s);
  if (n > (l.beds?.peak ?? 0)) l.beds = { peak: n, of: l.beds?.of ?? 0 };
}

/**
 * К планёрке (до смены суток): дольше всего ждали врача — у пришедших за сутки и вызванных — до вызова, у ждущих — до
 * сейчас (ушедших записал `left`); коек в стационаре сейчас — `beds`. Узких мест не было — итог без них.
 */
export function closeLoad(s: ShiftState, beds: number) {
  const l = loadOf(s);
  let wait = l.wait;
  for (const p of [...Object.values(s.patients), ...(s.gone ?? [])]) {
    if (p.calledT !== undefined) {
      if (hospitalDay(p.arriveT) === s.day) wait = Math.max(wait, Math.round((p.calledT - p.arriveT) / MIN));
    } else if ('status' in p && p.status === 'waiting') wait = Math.max(wait, Math.round((s.t - p.arriveT) / MIN));
  }
  l.wait = wait;
  if (beds > 0 || l.beds) l.beds = { peak: l.beds?.peak ?? 0, of: beds };
}

/**
 * «Стало хуже» (spec «Обход», решение владельца 4): ваши лежащие — приём закрыли вы, — у которых в эти сутки «хуже» или
 * «реакция на лечение», а вчера было другое. По номеру.
 */
export function turnedWorse(s: ShiftState): string[] {
  const out: string[] = [];
  for (const p of Object.values(s.patients)) {
    if (p.status !== 'admitted' || !p.stay || !p.closed || p.closed.by !== undefined) continue;
    const days = daysIn(p.stay, s.day);
    const now = wardState(p.stay, days);
    if (now !== 'worse' && now !== 'reaction') continue;
    if (days === 0 || wardState(p.stay, days - 1) !== now) out.push(p.id);
  }
  return out.sort();
}
