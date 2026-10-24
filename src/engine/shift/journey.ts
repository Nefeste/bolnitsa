// Путь пациента по больнице (spec docs/specs/2026-10-flow-ui.md, «Путь пациента в движке») — своё «Больницы», только в
// потоке для ПК. Что с человеком было и почему он ждал: для карточки главврача, значков над людьми и слоя очередей.
// Движок зовёт эти функции одной строкой там, где человек переходит из состояния в состояние; здесь — запись и уборка
// старого. Время — часы событий движка (`s.t`), случайности нет: те же зерно и команды — тот же путь при любом шаге
// времени. Причина ожидания — то, что движок знает в момент, когда ожидание началось; правды о болезни здесь нет.
import type { Id, Setting } from '../../content/types';
import type { Doing } from './slice';
import { DAY, type ShiftPatient, type ShiftState, type VisitKind } from './types';

/** Почему ждёт врача в общей очереди: все нанятые врачи заняты; ни один не принимает; ждёт вас. */
export type QueueWhy = 'busy' | 'none' | 'you';

/** Шаг пути: что началось в момент `t` (игровые секунды) — до следующего шага, до конца пути или до сейчас. */
export type Step =
  /**
   * ждёт врача в общей очереди: почему, сколько впереди; сколько нанятых врачей принимало и сколько из них ждало вашего
   * ответа; `door` — скорая без места в смотровой, ждёт у входа; стоял у кабинета, терпения вдвое меньше (spec
   * 2026-10-own-hall): `full` — в своём зале мест не было, `far` — зала не дальше стольких метров от двери кабинета нет;
   * `sat` — пришедший сам сел в зале ожидания или встал у двери (spec 2026-10-walk): до того его оформляли и он шёл,
   * терпение — с этого часа
   */
  | { t: number; k: 'queue'; why: QueueWhy; ahead: number; docs?: number; asks?: number; door?: true; full?: true; far?: number; sat?: number }
  /** у врача: нанятого (`by` — номер в штате, `room` — его кабинет) или у вас */
  | { t: number; k: 'doctor'; by?: string; room?: string }
  /**
   * на обследование в другой кабинет: вышел `t`, дошёл `at`, начали `start` (раньше — очередь: кабинет был занят), кончили
   * `end`, у врача снова — к `back`; результат — к `ready`
   */
  | { t: number; k: 'exam'; exam: Id; room: string; at: number; start: number; end: number; back: number; ready: number }
  /** ждёт результатов: врач отпустил его и позвал другого; с конца последней процедуры; результаты — к `ready` */
  | { t: number; k: 'results'; ready: number }
  /** ждёт своего врача: вернулся с результатами, а врач занят; `refer` — направлен к другому нанятому врачу */
  | { t: number; k: 'own'; by: string; refer?: true }
  /** нанятый врач просит вас посмотреть его — ждёт ответа до `until` (spec 2026-10-consults) */
  | { t: number; k: 'ask'; by: string; until: number }
  /**
   * ждёт своего врача, а тот ушёл на перерыв до `until` (spec 2026-10-staff-shifts, часть 2): `wc` — в туалет, `here` —
   * отдыхает в кабинете, ординаторской нет
   */
  | { t: number; k: 'rest'; by: string; until: number; wc?: true; here?: true };

/** Свои места для лежащих: палаты, ПИТ, реанимация, боксы. */
export type Place = 'ward' | 'icu' | 'ricu' | 'box';

/** Чем кончился путь. */
export interface End {
  t: number;
  /** домой; лёг в своей больнице; отправлен в другую; ушёл, не дождавшись; не успели принять до конца дня; пропал */
  how: 'home' | 'stay' | 'away' | 'left' | 'unseen' | 'gone';
  /** место из решения врача */
  setting?: Setting;
  /** врач выбрал это место, а свободного не было — отправили туда, где есть (`closePatient`) */
  wanted?: Setting;
  /**
   * отправлен в другую больницу, а такие места в своей есть, но все заняты: нанятый врач знает свободные койки и сразу
   * выбирает перевод — поэтому причина перевода видна так, а не по `wanted`
   */
  full?: Place[];
  /** лёг: помещение */
  room?: string;
  /** ушёл, не дождавшись: сколько был готов ждать, игровых секунд */
  patience?: number;
}

export interface Journey {
  kind: VisitKind;
  /** когда пришёл */
  at: number;
  steps: Step[];
  end?: End;
  /** шагов набралось `MAX_STEPS` — дальше не пишутся */
  cut?: true;
}

/** Пути потока для ПК по номеру пациента, в порядке прихода; `sweep` — когда убирать старые. */
export interface Journeys {
  sweep: number;
  of: Record<string, Journey>;
}

/** Законченный путь хранится сутки после ухода (лежащего — пока лежит): планёрка отчитывается за сутки. */
export const KEEP = DAY;
/** Законченных путей — не больше: запас на поток бенчмарка (до 420 человек в час). */
export const MAX_DONE = 600;
/** Шагов в пути — не больше: обычно их 3–10. */
export const MAX_STEPS = 40;
/** Старое убирается раз в игровой час — при приходе следующего пациента. */
export const SWEEP = 3600;

/** Ожидания: такое без минуты (позвали в ту же секунду) — не ожидание, его заменяет следующий шаг. */
const WAITS: ReadonlySet<Step['k']> = new Set(['queue', 'own', 'results', 'ask', 'rest']);

/** Пути смены; только в потоке для ПК — в режимах «Анамнеза» поля нет. */
function book(s: ShiftState): Journeys | undefined {
  if (!s.flow) return undefined;
  return (s.journeys ??= { sweep: s.t + SWEEP, of: {} });
}

/** Путь пациента; нет — с его прихода (сохранение до части 3 или пришедший раньше записи). */
function journeyOf(s: ShiftState, p: ShiftPatient): Journey | undefined {
  const b = book(s);
  if (!b) return undefined;
  return (b.of[p.id] ??= { kind: p.kind, at: p.arriveT, steps: [] });
}

function push(j: Journey, step: Step) {
  if (j.end) return;
  const last = j.steps[j.steps.length - 1];
  if (last && last.t >= step.t && WAITS.has(last.k)) j.steps.pop();
  if (j.steps.length >= MAX_STEPS) {
    j.cut = true;
    return;
  }
  j.steps.push(step);
}

function finish(j: Journey, end: End) {
  if (j.end) return;
  const last = j.steps[j.steps.length - 1];
  if (last && last.t >= end.t && WAITS.has(last.k) && end.how !== 'left') j.steps.pop();
  j.end = end;
}

/**
 * Пришёл (`flowArrive` — после того, как свободный врач мог позвать его сразу). Не позвали — ждёт врача в общей очереди:
 * `docs` — сколько нанятых врачей принимает, `mine` — он «свой» (ждёт вас), `stood` — стоит у кабинета и почему (spec
 * 2026-10-own-hall). Здесь же раз в игровой час — уборка старых путей.
 */
export function arrived(s: ShiftState, p: ShiftPatient, docs: () => number, mine: () => boolean, stood: { full?: true; far?: number }) {
  const j = journeyOf(s, p);
  if (!j) return;
  sweep(s);
  if (p.status !== 'waiting' || p.by !== undefined) return;
  const n = docs();
  const why: QueueWhy = mine() ? 'you' : n > 0 ? 'busy' : 'none';
  const asks = s.consults?.length ?? 0;
  push(j, {
    t: s.t, k: 'queue', why, ahead: Math.max(0, s.queue.indexOf(p.id)), ...(n > 0 ? { docs: n } : {}), ...(why === 'busy' && asks > 0 ? { asks } : {}),
    ...(p.kind === 'ambulance' && !p.bay ? { door: true as const } : {}),
    ...(stood.full && p.patience > 0 ? { full: true as const } : {}), ...(stood.far !== undefined && p.patience > 0 ? { far: stood.far } : {}),
    ...(p.seatAt !== undefined && p.seatAt > s.t ? { sat: p.seatAt } : {}),
  });
}

/** Позвали к врачу: нанятый (`p.by`) — в его кабинет `room`; нет — к вам. */
export function called(s: ShiftState, p: ShiftPatient, room?: string) {
  const j = journeyOf(s, p);
  if (!j) return;
  push(j, { t: s.t, k: 'doctor', ...(p.by !== undefined ? { by: p.by } : {}), ...(room !== undefined ? { room } : {}) });
}

/**
 * Ушёл на обследование в другой кабинет (`orderExam`, сразу после `goOut`): выйдет в `leave`, дойдёт к `at`; где, когда
 * начнут и кончат, когда вернётся и будет результат — из `p.out` и только что назначенного.
 */
export function examOut(s: ShiftState, p: ShiftPatient, leave: number, at: number) {
  const out = p.out;
  const x = p.pending[p.pending.length - 1];
  if (!out || !x) return;
  const j = journeyOf(s, p);
  if (!j) return;
  push(j, { t: leave, k: 'exam', exam: out.exam, room: out.room, at, start: Math.max(at, x.start ?? at), end: out.until, back: out.back, ready: x.readyAt });
}

/** Врач отпустил ждать результатов и зовёт другого: ждёт с конца последней процедуры до готовности всех результатов. */
export function away(s: ShiftState, p: ShiftPatient) {
  if (p.pending.length === 0) return;
  const j = journeyOf(s, p);
  if (!j) return;
  let from = s.t;
  let ready = 0;
  for (const x of p.pending) {
    if (x.end !== undefined && x.end > from) from = x.end;
    if (x.readyAt > ready) ready = x.readyAt;
  }
  push(j, { t: from, k: 'results', ready });
}

/** Ждёт своего врача: результаты пришли, а врач занят (`results`); `refer` — направлен к другому (`answerConsult`). */
export function own(s: ShiftState, p: ShiftPatient, refer = false) {
  if (p.by === undefined) return;
  const j = journeyOf(s, p);
  if (!j) return;
  push(j, { t: s.t, k: 'own', by: p.by, ...(refer ? { refer: true as const } : {}) });
}

/** Снова в общей очереди и ждёт вас: ваш больной вернулся с результатами, вы забрали его, «подождите» (`enqueue`). */
export function queued(s: ShiftState, p: ShiftPatient) {
  const j = journeyOf(s, p);
  if (!j) return;
  push(j, { t: s.t, k: 'queue', why: 'you', ahead: Math.max(0, s.queue.indexOf(p.id)) });
}

/**
 * Нанятый врач `by` ушёл отдыхать до `until` (`callIn`): у всех, кто ждёт именно его, — вернувшихся к нему с результатами и
 * записанных к нему в очереди, — шаг пути.
 */
export function rested(s: ShiftState, by: string, kind: 'staff' | 'toilet' | 'here', until: number) {
  if (!book(s)) return;
  for (const p of Object.values(s.patients)) {
    if (p.status !== 'waiting' || (p.by ?? p.doc) !== by) continue;
    const j = journeyOf(s, p);
    if (j) push(j, { t: s.t, k: 'rest', by, until, ...(kind === 'toilet' ? { wc: true as const } : kind === 'here' ? { here: true as const } : {}) });
  }
}

/** Нанятый врач `by` просит вас посмотреть больного — ждёт ответа до `until` (`openConsult`). */
export function asked(s: ShiftState, p: ShiftPatient, by: string, until: number) {
  const j = journeyOf(s, p);
  if (!j) return;
  push(j, { t: s.t, k: 'ask', by, until });
}

/**
 * Приём закрыт (`closePatient`): домой, лёг, отправлен в другую больницу; `wanted` — место, которое выбрал врач; `places` —
 * сколько своих мест каждого вида и сколько свободно (считается только для отправленных в другую больницу).
 */
export function closed(s: ShiftState, p: ShiftPatient, wanted: Setting, places: () => Record<Place, [number, number]>) {
  const c = p.closed;
  if (!c) return;
  const j = journeyOf(s, p);
  if (!j) return;
  const setting = c.plan.setting;
  const how: End['how'] = p.status === 'admitted' ? 'stay' : setting === 'home' ? 'home' : 'away';
  const full = how === 'away' ? (Object.entries(places()) as [Place, [number, number]][]).filter(([, [all, free]]) => all > 0 && free === 0).map(([k]) => k) : [];
  finish(j, {
    t: s.t, how, setting, ...(wanted !== setting ? { wanted } : {}), ...(full.length > 0 ? { full } : {}),
    ...(p.status === 'admitted' && p.stay ? { room: p.stay.room } : {}),
  });
}

/** Ушёл из состояния (`evict`): не дождавшись — с терпением; не успели принять до конца дня. Принятого записал `closed`. */
export function gone(s: ShiftState, p: ShiftPatient) {
  const j = s.journeys?.of[p.id];
  if (!j || j.end) return;
  if (p.status === 'left') finish(j, { t: s.t, how: 'left', patience: p.patience });
  else if (p.status === 'unseen') finish(j, { t: s.t, how: 'unseen' });
}

/**
 * Уборка раз в игровой час: законченный путь — через сутки после ухода (лежащего — пока лежит), законченных — не больше
 * `MAX_DONE` (старые по приходу — первыми). Путь, чей пациент пропал из состояния незаконченным, закрывается сейчас.
 */
function sweep(s: ShiftState) {
  const b = s.journeys!;
  if (s.t < b.sweep) return;
  b.sweep = s.t + SWEEP;
  const done: string[] = [];
  for (const id of Object.keys(b.of)) {
    const j = b.of[id];
    const p = s.patients[id];
    if (!j.end) {
      if (p) continue;
      j.end = { t: s.t, how: 'gone' };
    }
    if (p?.status === 'admitted') continue;
    if (j.end.t <= s.t - KEEP) delete b.of[id];
    else done.push(id);
  }
  for (let i = 0; i < done.length - MAX_DONE; i++) delete b.of[done[i]];
}

/**
 * Для среза: ждёт ли он очереди у кабинета обследования, которое кончится в `end`, — дошёл, а там ещё обследуют другого.
 * false — очереди нет: идёт туда или уже там; undefined — пути нет (сохранение до части 3).
 */
export function examQueued(s: ShiftState, p: ShiftPatient, end: number): boolean | undefined {
  const steps = s.journeys?.of[p.id]?.steps;
  if (!steps) return undefined;
  for (let i = steps.length - 1; i >= 0; i--) {
    const x = steps[i];
    if (x.k === 'exam' && x.end === end) return x.start > x.at && s.t < x.start;
  }
  return undefined;
}

function lastOf<K extends Step['k']>(steps: readonly Step[], k: K): Extract<Step, { k: K }> | undefined {
  for (let i = steps.length - 1; i >= 0; i--) if (steps[i].k === k) return steps[i] as Extract<Step, { k: K }>;
  return undefined;
}

/**
 * Для среза: с какого момента идёт то, что человек делает сейчас (`doing`), и до какого часа он готов ждать в общей
 * очереди, пока не кончится терпение. Пути нет — с прихода.
 */
export function phaseOf(s: ShiftState, p: ShiftPatient, doing: Doing): { since: number; limit?: number } {
  const j = s.journeys?.of[p.id];
  const last = j?.steps[j.steps.length - 1];
  if (!j || !last) return { since: p.arriveT };
  // шаг, записанный вперёд (врач назначил обследование — выйдет через пару минут), ещё не начался: до него — прежний
  const now = (t: number) => Math.min(t, s.t);
  if (doing === 'ward' || doing === 'surgery') return { since: now(j.end?.t ?? last.t) };
  if (doing === 'exam' || doing === 'examQueue') {
    const x = lastOf(j.steps, 'exam');
    // на процедуре — с её начала; ждёт у кабинета — с того, как дошёл; идёт туда — с выхода
    if (x) return { since: now(s.t >= x.start ? x.start : s.t >= x.at ? x.at : x.t) };
  }
  if (doing === 'results') {
    const r = lastOf(j.steps, 'results');
    if (r) return { since: now(r.t) };
  }
  if (last.k === 'exam') {
    // вернулся с обследования к врачу; ещё не вышел — у врача с тех пор, как позвали
    if (s.t >= last.back) return { since: last.back };
    return { since: now(lastOf(j.steps, 'doctor')?.t ?? last.t) };
  }
  const limit = last.k === 'queue' && p.status === 'waiting' && p.by === undefined && p.patience > 0 ? (last.sat ?? last.t) + p.patience : undefined;
  return { since: now(last.t), ...(limit !== undefined ? { limit } : {}) };
}
