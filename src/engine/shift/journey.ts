// Путь пациента по больнице (spec docs/specs/2026-10-flow-ui.md, «Путь пациента в движке») — своё «Больницы», только в
// потоке для ПК. Что с человеком было и почему он ждал: для карточки главврача, значков над людьми и слоя очередей.
// Движок зовёт эти функции одной строкой там, где человек переходит из состояния в состояние; здесь — запись и уборка
// старого. Время — часы событий движка (`s.t`), случайности нет: те же зерно и команды — тот же путь при любом шаге
// времени. Причина ожидания — то, что движок знает в момент, когда ожидание началось; правды о болезни здесь нет.
import type { Id, Setting } from '../../content/types';
import type { Doing } from './slice';
import { DAY, type LeftWhy, type ShiftPatient, type ShiftState, type VisitKind } from './types';

/** Почему ждёт врача в общей очереди: все нанятые врачи заняты; ни один не принимает; ждёт вас. */
export type QueueWhy = 'busy' | 'none' | 'you';

/** Шаг пути: что началось в момент `t` (игровые секунды) — до следующего шага, до конца пути или до сейчас. */
export type Step =
  /**
   * ждёт врача в общей очереди: почему, сколько впереди; сколько нанятых врачей принимало и сколько из них ждало вашего
   * ответа; `door` — скорая без места в смотровой, ждёт у входа; стоял у кабинета, терпения вдвое меньше (spec
   * 2026-10-own-hall): `full` — в своём зале мест не было, `far` — зала не дальше стольких метров от двери кабинета нет;
   * `bench` — при этом сел на скамейку у двери, и терпение как есть (spec 2026-10-door-benches); `sat` — пришедший сам сел в
   * зале ожидания или встал у двери (spec 2026-10-walk): до того его оформляли и он шёл, терпение — с этого часа
   */
  | { t: number; k: 'queue'; why: QueueWhy; ahead: number; docs?: number; asks?: number; door?: true; full?: true; far?: number; bench?: true; sat?: number }
  /** у врача: нанятого (`by` — номер в штате, `room` — его кабинет) или у вас */
  | { t: number; k: 'doctor'; by?: string; room?: string }
  /**
   * на обследование в другой кабинет: вышел `t`, дошёл `at`, начали `start` (раньше — очередь: кабинет был занят), кончили
   * `end`, у врача снова — к `back`; результат — к `ready`; `rest` — ждал, пока с перерыва вернётся тот, кто делает (его
   * должность, spec 2026-10-staff-shifts, часть 2б). `gurney` — лежачего везли на каталке (spec
   * docs/specs/2026-10-orderlies.md): с `t` ждал её, в `pick` за ним пришли, к `at` переложили к аппарату, к `back` он снова на
   * своём месте; `busy` — тот, кто вёз, сначала довозил других; `nurse` — везла медсестра: санитара в смене не было
   */
  | { t: number; k: 'exam'; exam: Id; room: string; at: number; start: number; end: number; back: number; ready: number; rest?: Id; gurney?: Gurney; chief?: true }
  /** ждёт результатов: врач отпустил его и позвал другого; с конца последней процедуры; результаты — к `ready` */
  | { t: number; k: 'results'; ready: number }
  /**
   * ждёт своего врача: вернулся с результатами, а врач занят; `refer` — направлен к другому нанятому врачу: вами или, когда
   * есть `from`, нанятым терапевтом `from` по второй гипотезе (spec 2026-10-specialists, часть 2)
   */
  | { t: number; k: 'own'; by: string; refer?: true; from?: string }
  /** нанятый врач просит вас посмотреть его — ждёт ответа до `until` (spec 2026-10-consults) */
  | { t: number; k: 'ask'; by: string; until: number }
  /** решение нанятого врача `by` ждёт главврача у двери кабинета — до `until` (spec 2026-10-two-ways, F3) */
  | { t: number; k: 'approve'; by: string; until: number }
  /**
   * ждёт своего врача, а тот ушёл на перерыв до `until` (spec 2026-10-staff-shifts, часть 2): `wc` — в туалет, `here` —
   * отдыхает в кабинете, ординаторской нет; `round` — на утреннем обходе (spec docs/specs/2026-10-staff-motion.md, часть 2)
   */
  | { t: number; k: 'rest'; by: string; until: number; wc?: true; here?: true; round?: true };

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
  /** решение врача ждало главврача (spec 2026-10-two-ways, F3): тот согласился или не ответил до срока */
  chief?: 'agreed' | 'silent';
  /** ушёл, не дождавшись: сколько был готов ждать, игровых секунд */
  patience?: number;
  /**
   * ушёл, не дождавшись: почему — по последнему ожиданию и тому, кто принимал в час ухода (spec docs/specs/2026-10-why.md);
   * так его считает планёрка
   */
  why?: LeftWhy;
}

/** Каталка на обследование (spec docs/specs/2026-10-orderlies.md): за ним пришли в `pick`; `busy` — тот, кто везёт, сначала довозил других; `nurse` — везла медсестра. */
export interface Gurney {
  pick: number;
  busy?: true;
  nurse?: true;
}

/**
 * Лежачего везут на койку после решения (spec docs/specs/2026-10-orderlies.md, «Что видно»): каталку ждёт с `t`, откуда и куда
 * (номера помещений плана). Записали перевозку — за ним придут в `pick`, повезут в `off`, на койке он в `done`; `busy` — тот,
 * кто везёт, сначала довезёт других; `none` — сначала везти было некому; `orderly` — не срочного везёт только санитар, а его
 * в смене не было (решение владельца #99); `nurse` — везёт медсестра. Не записали — везти некому, ждёт.
 */
export interface BedRide {
  t: number;
  from: string;
  to: string;
  pick?: number;
  off?: number;
  done?: number;
  busy?: true;
  none?: true;
  orderly?: true;
  nurse?: true;
}

export interface Journey {
  kind: VisitKind;
  /** когда пришёл */
  at: number;
  steps: Step[];
  end?: End;
  /** шагов набралось `MAX_STEPS` — дальше не пишутся */
  cut?: true;
  /** на койку — на каталке: пишется и после конца пути (он кончился решением положить) */
  bed?: BedRide;
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
const WAITS: ReadonlySet<Step['k']> = new Set(['queue', 'own', 'results', 'ask', 'rest', 'approve']);

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
  // ожидание без длины — не шаг; направление к другому врачу (spec 2026-10-specialists, часть 2) — шаг и без ожидания
  if (last && last.t >= step.t && WAITS.has(last.k) && !(last.k === 'own' && last.refer)) j.steps.pop();
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
 * 2026-10-own-hall) и сел ли на скамейку у двери (spec 2026-10-door-benches). Здесь же раз в игровой час — уборка старых
 * путей.
 */
export function arrived(s: ShiftState, p: ShiftPatient, docs: () => number, mine: () => boolean, stood: { full?: true; far?: number; bench?: true }) {
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
    ...(stood.bench && p.patience > 0 ? { bench: true as const } : {}),
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
 * начнут и кончат, когда вернётся и будет результат — из `p.out` и только что назначенного. Лежачего везут на каталке
 * (`gurney`, spec docs/specs/2026-10-orderlies.md): `leave` — с какого часа ждёт её, `at` — когда переложили к аппарату.
 */
export function examOut(s: ShiftState, p: ShiftPatient, leave: number, at: number, rest?: Id, gurney?: Gurney) {
  const out = p.out;
  const x = p.pending[p.pending.length - 1];
  if (!out || !x) return;
  const j = journeyOf(s, p);
  if (!j) return;
  push(j, {
    t: leave, k: 'exam', exam: out.exam, room: out.room, at, start: Math.max(at, x.start ?? at), end: out.until, back: out.back, ready: x.readyAt, ...(rest ? { rest } : {}),
    ...(gurney ? { gurney } : {}),
  });
}

/**
 * Лежачего везут на койку (spec docs/specs/2026-10-orderlies.md): записали перевозку (`startRide`) — кто когда придёт,
 * повезёт и довезёт; везти некому (`carry`) — только откуда, куда и с какого часа ждёт, и `orderly`, если некому потому, что
 * не срочного медсестра не везёт. Путь к этому часу уже кончился решением положить — перевозка пишется рядом с ним.
 */
export function bedRide(
  s: ShiftState, p: ShiftPatient, r: { since: number; from: string; to: string; go?: number; pick?: number; off?: number; done?: number }, nurse = false, orderly = false,
) {
  const j = s.journeys?.of[p.id];
  if (!j) return;
  // ждал, что везти некому, а теперь везут: почему ждал — тоже
  const none = j.bed !== undefined && j.bed.pick === undefined;
  const only = orderly || (none && j.bed!.orderly === true);
  j.bed = {
    t: r.since, from: r.from, to: r.to,
    ...(r.pick !== undefined && r.off !== undefined && r.done !== undefined ? { pick: r.pick, off: r.off, done: r.done } : {}),
    ...(r.go !== undefined && r.go > r.since && !none ? { busy: true as const } : {}), ...(none ? { none: true as const } : {}),
    ...(only ? { orderly: true as const } : {}), ...(nurse ? { nurse: true as const } : {}),
  };
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

/**
 * Ждёт своего врача: результаты пришли, а врач занят (`results`); `refer` — направлен к другому (`handOver`): вами или
 * нанятым врачом `from`.
 */
export function own(s: ShiftState, p: ShiftPatient, refer = false, from?: string) {
  if (p.by === undefined) return;
  const j = journeyOf(s, p);
  if (!j) return;
  push(j, { t: s.t, k: 'own', by: p.by, ...(refer ? { refer: true as const } : {}), ...(from !== undefined ? { from } : {}) });
}

/** Снова в общей очереди и ждёт вас: ваш больной вернулся с результатами, вы забрали его, «подождите» (`enqueue`). */
export function queued(s: ShiftState, p: ShiftPatient) {
  const j = journeyOf(s, p);
  if (!j) return;
  push(j, { t: s.t, k: 'queue', why: 'you', ahead: Math.max(0, s.queue.indexOf(p.id)) });
}

/**
 * Нанятый врач `by` ушёл отдыхать до `until` (`callIn`) или на утренний обход (`round`, spec docs/specs/2026-10-staff-motion.md,
 * часть 2): у всех, кто ждёт именно его, — вернувшихся к нему с результатами и записанных к нему в очереди, — шаг пути.
 */
export function rested(s: ShiftState, by: string, kind: 'staff' | 'toilet' | 'here' | 'round', until: number) {
  if (!book(s)) return;
  const flag = kind === 'toilet' ? { wc: true as const } : kind === 'here' ? { here: true as const } : kind === 'round' ? { round: true as const } : {};
  for (const p of Object.values(s.patients)) {
    if (p.status !== 'waiting' || (p.by ?? p.doc) !== by) continue;
    const j = journeyOf(s, p);
    if (j) push(j, { t: s.t, k: 'rest', by, until, ...flag });
  }
}

/** Нанятый врач `by` просит вас посмотреть больного — ждёт ответа до `until` (`openConsult`). */
export function asked(s: ShiftState, p: ShiftPatient, by: string, until: number) {
  const j = journeyOf(s, p);
  if (!j) return;
  push(j, { t: s.t, k: 'ask', by, until });
}

/** Решение нанятого врача `by` ждёт главврача — до `until` (`openApproval`, spec 2026-10-two-ways, F3). */
export function approve(s: ShiftState, p: ShiftPatient, by: string, until: number) {
  const j = journeyOf(s, p);
  if (!j) return;
  push(j, { t: s.t, k: 'approve', by, until });
}

/** Решение, которое ждало главврача, в силе (`settleApproval`): путь кончился им — главврач согласился или промолчал. */
export function approved(s: ShiftState, p: ShiftPatient, how: 'agreed' | 'silent') {
  const end = s.journeys?.of[p.id]?.end;
  if (end) end.chief = how;
}

/** Обследование назначил главврач (spec 2026-10-two-ways, F2): врач только что отправил на него — шаг пути помечен. */
export function chief(s: ShiftState, p: ShiftPatient, exam: Id) {
  const steps = s.journeys?.of[p.id]?.steps;
  const last = steps?.[steps.length - 1];
  if (last?.k === 'exam' && last.exam === exam) last.chief = true;
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
 * Для «почему ушёл» (spec docs/specs/2026-10-why.md): последнее ожидание пути — шаг, после которого он ушёл, — и последнее
 * ожидание в общей очереди (терпение есть только там). Пути нет — пусто.
 */
export function lastWaits(s: ShiftState, p: ShiftPatient): { wait?: Step; queue?: Extract<Step, { k: 'queue' }> } {
  const steps = s.journeys?.of[p.id]?.steps;
  if (!steps) return {};
  const last = steps[steps.length - 1];
  const queue = lastOf(steps, 'queue');
  return { ...(last && WAITS.has(last.k) ? { wait: last } : {}), ...(queue ? { queue } : {}) };
}

/** Ушёл, не дождавшись (`evict` уже записал конец): почему — в конец пути, как его посчитала планёрка. */
export function leftWhy(s: ShiftState, p: ShiftPatient, why: LeftWhy) {
  const end = s.journeys?.of[p.id]?.end;
  if (end?.how === 'left') end.why = why;
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
  if (doing === 'ward' || doing === 'surgery' || doing === 'gurney') return { since: now(j.end?.t ?? last.t) };
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
