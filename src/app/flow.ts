// Часть 3 «Люди и поток» в окне (spec docs/specs/2026-10-flow-ui.md): что сказать о пути пациента, о помещениях и о
// списке пациентов. Чистые функции без DOM и Three.js — их проверяют тесты (tools/test/flow-ui.test.ts); строки — из
// src/i18n, числа порогов — гипотезы геймдизайна (docs/08-game-design.md, §13).
import type { Id } from '../content/types';
import type { Plan } from '../engine/hospital/build';
import type { Problem } from '../engine/hospital/requirements';
import type { Journey, Step } from '../engine/shift/journey';
import type { Doing } from '../engine/shift/slice';
import type { Triage, VisitKind } from '../engine/shift/types';
import { clock, T } from '../i18n';

/** «Ждёт долго»: ждёт врача, своего врача, у кабинета, результатов или вашего ответа столько и дольше, игровых секунд. */
export const LONG_WAIT = 30 * 60;
/** «Недоволен»: в общей очереди прошла такая доля терпения. */
export const UNHAPPY = 2 / 3;
/** Слой «Очереди и загрузка»: самое долгое ожидание у помещения — зелёный меньше, красный от, игровых секунд. */
export const WAIT_OK = 15 * 60;
export const WAIT_BAD = 30 * 60;
/** Слой: палата и смотровая — жёлтые, когда занято столько коек. */
export const BEDS_HIGH = 3 / 4;

/** Длительность: «12 мин», «1 ч 05 мин». */
export function dur(sec: number): string {
  const m = Math.max(0, Math.round(sec / 60));
  return m < 60 ? T.flow.min(m) : T.flow.hm(Math.floor(m / 60), m % 60);
}

/** Что окно знает о пациенте из упакованного среза. */
export interface Seen {
  status: 'waiting' | 'inRoom' | 'away' | 'admitted';
  triage: Triage;
  doing: Doing;
  /** номер помещения в плане; -1 — нет */
  room: number;
  /** номер человека в штате; -1 — вы или никто */
  by: number;
  bed: number;
  kind: VisitKind;
  since: number;
  /** до какого часа ждёт в общей очереди; -1 — не в ней или не уходит */
  limit: number;
  ask?: { at: number; until: number };
  /** решение его врача ждёт главврача (spec docs/specs/2026-10-two-ways.md, F3) */
  approve?: { at: number; until: number };
}

export type Mood = 'ask' | 'approve' | 'unhappy' | 'long';

/** Ждёт: в очереди к врачу или своему врачу, у кабинета обследования, результатов. */
export const waits = (p: Pick<Seen, 'status' | 'doing'>) => p.status === 'waiting' || p.doing === 'examQueue' || p.doing === 'results';

/** Значок над человеком: врач просит вас посмотреть его; решение врача ждёт вашего ответа; терпение на исходе; ждёт долго. */
export function moodOf(p: Pick<Seen, 'status' | 'doing' | 'since' | 'limit' | 'ask' | 'approve'>, t: number): Mood | undefined {
  if (p.ask) return 'ask';
  if (p.approve) return 'approve';
  if (p.limit >= 0 && t - p.since >= (p.limit - p.since) * UNHAPPY) return 'unhappy';
  // ждёт каталку (spec docs/specs/2026-10-orderlies.md) — тоже ожидание
  if ((waits(p) || p.doing === 'ambulance' || p.doing === 'gurney') && p.status !== 'inRoom' && t - p.since >= LONG_WAIT) return 'long';
  return undefined;
}

// ---------------------------------------------------------------- вкладка «Пациенты»

export type Where = 'reg' | 'wait' | 'doctor' | 'exams' | 'ward';

export function whereOf(p: Pick<Seen, 'status' | 'doing'>): Where {
  if (p.doing === 'registration' || p.doing === 'triage') return 'reg';
  if (p.doing === 'ward' || p.doing === 'surgery' || p.doing === 'gurney') return 'ward';
  if (p.doing === 'exam' || p.doing === 'examQueue' || p.doing === 'results') return 'exams';
  if (p.status === 'inRoom') return 'doctor';
  return 'wait';
}

export interface PatientFilter {
  triage: Triage | 'all';
  where: Where | 'all';
  /** отделение (spec docs/specs/2026-10-departments.md, часть 2): `none` — не в отделении (`patientDept` в departments.ts) */
  dept: Id | 'all' | 'none';
  /** только ждущие `LONG_WAIT` и дольше */
  long: boolean;
  /**
   * какой список: «В больнице»; «Приняты» — приняты и ушли за сутки (spec docs/specs/2026-10-discharged-card.md); «Ушли» —
   * ушедшие, не дождавшись
   */
  list: 'present' | 'seen' | 'gone';
}

export const NO_FILTER: PatientFilter = { triage: 'all', where: 'all', dept: 'all', long: false, list: 'present' };

export interface PatientRow {
  /** человек на экране (`p:<номер>`); ушедший — `id:<номер в движке>` */
  key: string;
  id: string;
  title: string;
  /** что делает и сколько — или как ушёл */
  text: string;
  triage: Triage;
  mood?: Mood;
}

/** Строки списка: ждущие — сверху, дольше всех ждущий — первым; фильтры — срочность, место, отделение, долгое ожидание. */
export function patientRows(
  list: readonly (Pick<Seen, 'status' | 'triage' | 'doing' | 'since' | 'limit' | 'ask' | 'approve'> & { key: string; id: string; title: string; dept?: Id })[],
  t: number,
  f: PatientFilter,
): { rows: PatientRow[]; total: number } {
  const inDept = (d: Id | undefined) => f.dept === 'all' || (f.dept === 'none' ? d === undefined : d === f.dept);
  const picked = list.filter(
    p => (f.triage === 'all' || p.triage === f.triage) && (f.where === 'all' || whereOf(p) === f.where) && inDept(p.dept) && (!f.long || (waits(p) && t - p.since >= LONG_WAIT)),
  );
  const rank = (p: Pick<Seen, 'status' | 'doing'>) => (waits(p) ? 0 : 1);
  picked.sort((a, b) => rank(a) - rank(b) || a.since - b.since || (a.id < b.id ? -1 : 1));
  const rows = picked.map(p => {
    const mood = moodOf(p, t);
    // привезённый скорой лежит в смотровой: ждёт врача или врач у него; решение его врача ждёт вас (spec 2026-10-two-ways, F3)
    const doing = p.approve ? T.flow.approveShort
      : p.doing === 'ambulance' ? (p.status === 'waiting' ? T.flow.ambulanceWaits : T.flow.ambulanceSeen) : T.doing[p.doing];
    return { key: p.key, id: p.id, title: p.title, text: `${doing} — ${dur(t - p.since)}`, triage: p.triage, ...(mood ? { mood } : {}) };
  });
  return { rows, total: list.length };
}

// ---------------------------------------------------------------- путь пациента

export interface PathLine {
  /** часы: «10:03» */
  at: string;
  text: string;
  /** почему ждал — второй строкой */
  why?: string;
  kind: 'start' | 'wait' | 'do' | 'end';
  /** идёт сейчас */
  now?: boolean;
}

export interface PathCard {
  lines: PathLine[];
  /** «в больнице 1 ч 21 мин, из них ждал 43 мин (53 %)» */
  summary: string;
  /** ушёл, не дождавшись: почему — первой строкой карточки */
  left?: string;
}

/** Названия для пути: кто врач (родительный падеж должности — «у терапевта»), что за обследование. */
export interface PathNames {
  doctor(staffId: string): string;
  /** к кому направлен — должность в дательном падеже («к гастроэнтерологу»), и кто направил (spec 2026-10-specialists, часть 2) */
  dat(staffId: string): string;
  who(staffId: string): string;
  exam(id: Id): { name: string; kind: string };
  /** должность — для «… на перерыве» (spec docs/specs/2026-10-staff-shifts.md, часть 2б) */
  role(id: Id): string;
  /** помещение посреди фразы — «на каталке: смотровая приёмного → палата» (spec docs/specs/2026-10-orderlies.md) */
  room(id: string): string;
  /** когда следующая пересменка после часа `t` — до неё лежачего некому везти */
  nextShift(t: number): number;
}

const queueWhy = (x: Extract<Step, { k: 'queue' }>): string => {
  const why = x.why === 'busy' ? T.flow.busy(x.docs ?? 0, x.asks ?? 0, x.ahead) : x.why === 'none' ? T.flow.none : T.flow.you;
  // стоял у кабинета (spec docs/specs/2026-10-own-hall.md) или сел там на скамью (spec docs/specs/2026-10-door-benches.md)
  const full = x.full ? [x.bench ? T.flow.benchFull : T.flow.full] : [];
  const far = x.far !== undefined ? [x.bench ? T.flow.benchFar(x.far) : T.flow.far(x.far)] : [];
  return [why, ...full, ...far].join('; ');
};

/**
 * Лента пути: «час — что — сколько — почему». Шаги идут по времени; шаг, записанный вперёд (врач назначил обследование —
 * выйдет через пару минут), начинается не раньше конца прежнего. Сейчас — `now`: идущий шаг длится до него.
 */
export function pathCard(j: Journey, female: boolean, now: number, names: PathNames): PathCard {
  // скорая без места в смотровой — это о приезде: сначала лежал у входа
  const door = j.steps.some(x => x.k === 'queue' && x.door);
  const lines: PathLine[] = [{ at: clock(j.at), text: T.flow.arrived(female, j.kind), ...(door ? { why: T.flow.door } : {}), kind: 'start' }];
  const end = j.end?.t ?? now;
  let waited = 0;
  let prev = j.at;
  let doctor: string | undefined;
  let lastExam: Extract<Step, { k: 'exam' }> | undefined;
  const steps = j.steps;
  steps.forEach((x, i) => {
    const from = Math.max(x.t, prev);
    const next = Math.max(from, Math.min(steps[i + 1]?.t ?? end, end));
    const open = !j.end && i === steps.length - 1;
    const d = next - from;
    const mark = open ? { now: true as const } : {};
    switch (x.k) {
      case 'queue':
        if (d < 60 && !open) break;
        waited += d;
        lines.push({ at: clock(from), text: T.flow.queue(dur(d)), why: queueWhy(x), kind: 'wait', ...mark });
        break;
      case 'doctor':
        doctor = x.by;
        lines.push({ at: clock(from), text: x.by !== undefined ? T.flow.doctor(names.doctor(x.by), dur(d)) : T.flow.atYou(dur(d)), kind: 'do', ...mark });
        break;
      case 'exam': {
        lastExam = x;
        const e = names.exam(x.exam);
        const away = steps[i + 1]?.k === 'results';
        const stop = Math.min(next, now);
        const parts: string[] = [];
        // лежачего везут на каталке (spec docs/specs/2026-10-orderlies.md, «Что видно»): сначала он ждёт её
        const g = x.gurney;
        if (g && stop < g.pick) {
          waited += stop - from;
          parts.push(T.flow.gurneyWait(dur(stop - from)));
        } else {
          if (g && g.pick - from >= 60) {
            waited += g.pick - from;
            parts.push(T.flow.gurneyWait(dur(g.pick - from)));
          }
          if (stop < x.at) parts.push(g ? T.flow.wheeling : T.flow.goes);
          else {
            parts.push(g ? T.flow.wheeled(dur(x.at - g.pick)) : T.flow.walk(dur(x.at - x.t)));
            if (x.start > x.at) {
              const q = Math.min(x.start, stop) - x.at;
              waited += q;
              parts.push(T.flow.examQueue(dur(q)));
            }
            if (stop >= x.start) parts.push(T.flow.procedure(dur(Math.min(x.end, stop) - x.start)));
            if (!away && stop >= x.end) parts.push((g ? T.flow.wheeledBack : T.flow.back)(dur(Math.min(x.back, stop) - x.end)));
          }
        }
        if (e.kind === 'lab') parts.push(T.flow.ready(clock(x.ready)));
        const busy = x.start > x.at && stop >= x.at;
        // ждал, пока тот, кто делает, вернётся с перерыва (spec docs/specs/2026-10-staff-shifts.md, часть 2б); ждёт каталку —
        // кто за ним придёт и когда
        const who = g ? T.flow.carrier(!!g.nurse) : '';
        const why = busy
          ? x.rest ? T.flow.examRest(names.role(x.rest), clock(x.start)) : T.flow.roomBusy(clock(x.start))
          : g && stop < g.pick ? (g.busy ? T.flow.gurneyBusy(who, clock(g.pick)) : T.flow.gurneyComing(who, clock(g.pick)))
          : g?.busy && g.pick - from >= 60 ? T.flow.gurneyWas(who, !!g.nurse, clock(g.pick))
          : undefined;
        // назначил главврач (spec docs/specs/2026-10-two-ways.md, F2)
        const whyAll = [x.chief ? T.flow.chief : undefined, why].filter(Boolean).join('; ');
        lines.push({ at: clock(from), text: T.flow.exam(e.name, parts.join(', ')), ...(whyAll ? { why: whyAll } : {}), kind: 'do', ...(open && now < x.back ? mark : {}) });
        // вернулся к врачу — снова у него до следующего шага
        const back = away ? x.end : x.back;
        if (!away && next - back >= 60) {
          lines.push({
            at: clock(back), text: doctor !== undefined ? T.flow.doctor(names.doctor(doctor), dur(next - back)) : T.flow.atYou(dur(next - back)), kind: 'do',
            ...(open ? mark : {}),
          });
        }
        prev = Math.max(next, from);
        return;
      }
      case 'results': {
        waited += d;
        const imaging = lastExam !== undefined && names.exam(lastExam.exam).kind !== 'lab';
        lines.push({ at: clock(from), text: T.flow.results(dur(d)), why: imaging ? T.flow.report : T.flow.lab, kind: 'wait', ...mark });
        break;
      }
      case 'own': {
        // направлен к врачу (spec docs/specs/2026-10-specialists.md, часть 2): строка и без ожидания — к кому и кто направил
        const waits = d >= 60 || open;
        if (x.refer) {
          waited += d;
          const why = [x.from !== undefined ? T.flow.referBy(names.who(x.from)) : T.flow.referYou, ...(waits ? [T.flow.ownWhy] : [])].join('; ');
          lines.push({ at: clock(from), text: T.flow.referTo(female, names.dat(x.by), waits ? dur(d) : undefined), why, kind: 'wait', ...mark });
          break;
        }
        if (!waits) break;
        waited += d;
        lines.push({ at: clock(from), text: T.flow.own(dur(d)), why: T.flow.ownWhy, kind: 'wait', ...mark });
        break;
      }
      case 'ask': {
        waited += d;
        const late = !open && next >= x.until;
        lines.push({ at: clock(from), text: T.flow.ask(dur(d), clock(x.until)), ...(late ? { why: T.flow.askLate } : {}), kind: 'wait', ...mark });
        break;
      }
      // решение врача ждёт главврача (spec docs/specs/2026-10-two-ways.md, F3): чем кончилось — по следующему шагу или концу пути
      case 'approve': {
        waited += d;
        const nx = steps[i + 1];
        const why = open ? T.flow.approveWait
          : nx?.k === 'own' ? (nx.refer ? T.flow.approveReferTo(names.dat(nx.by)) : T.flow.approveExam)
          : nx?.k === 'queue' || (nx?.k === 'doctor' && nx.by === undefined) ? T.flow.approveTake
          : j.end?.chief === 'agreed' ? T.flow.approveAgreed
          : j.end?.chief === 'silent' ? T.flow.approveSilent
          : undefined;
        lines.push({ at: clock(from), text: T.flow.approve(dur(d), clock(x.until)), ...(why ? { why } : {}), kind: 'wait', ...mark });
        break;
      }
      // врач ушёл отдыхать (spec docs/specs/2026-10-staff-shifts.md, часть 2): ждёт его — почему и до какого часа
      case 'rest': {
        if (d < 60 && !open) break;
        waited += d;
        const until = clock(x.until);
        lines.push({ at: clock(from), text: T.flow.own(dur(d)), why: x.wc ? T.flow.restWc(until) : x.here ? T.flow.restHere(until) : T.flow.rest(until), kind: 'wait', ...mark });
        break;
      }
    }
    prev = next;
  });
  if (j.cut) lines.push({ at: clock(prev), text: T.flow.cut, kind: 'do' });
  let left: string | undefined;
  const e = j.end;
  if (e) {
    let text: string;
    let why: string | undefined;
    switch (e.how) {
      case 'home':
        text = T.flow.home(female);
        break;
      case 'stay':
        text = T.flow.stay(female, T.flow.stayIn[e.setting ?? 'admit'] ?? T.flow.stayIn.admit);
        break;
      case 'away':
        text = e.setting === 'ward' ? T.flow.ward(female) : T.flow.transfer(female);
        why = [...(e.full?.length ? [T.flow.placesFull(e.full.map(k => T.flow.places[k] ?? k).join(', '))] : []), ...(e.wanted ? [T.flow.wanted(T.flow.stayIn[e.wanted] ?? e.wanted)] : [])].join('; ') || undefined;
        break;
      case 'left': {
        // в ленте — коротко; почему — целиком первой строкой карточки
        const q = [...steps].reverse().find((x): x is Extract<Step, { k: 'queue' }> => x.k === 'queue');
        // ждал — с того, как сел в зале (spec 2026-10-walk): терпение тратится оттуда, а не у стойки и не в пути
        const all = T.flow.left(female, dur(q ? e.t - (q.sat ?? q.t) : e.t - j.at), dur(e.patience ?? 0));
        // почему — как считает планёрка (spec docs/specs/2026-10-why.md): к часу ухода в смене могло не остаться врача, который
        // принял бы его, а врач, к которому он записан, — уйти на перерыв
        const more = e.why === 'none' && q?.why === 'busy' ? [T.flow.leftNone(female)] : e.why === 'rest' ? [T.flow.leftRest(female)] : [];
        left = q ? `${all} — ${[queueWhy(q), ...more].join('; ')}` : all;
        text = T.flow.leftEnd(female);
        why = T.flow.patience(female, dur(e.patience ?? 0));
        break;
      }
      case 'unseen':
        text = T.flow.unseen;
        break;
      default:
        text = T.flow.lost;
    }
    lines.push({ at: clock(e.t), text, ...(why ? { why } : {}), kind: 'end' });
  }
  // на койку — на каталке (spec docs/specs/2026-10-orderlies.md, «Что видно»): сколько ждал её и почему, откуда и куда везли
  const b = j.bed;
  if (b) {
    const who = T.flow.carrier(!!b.nurse);
    const pick = b.pick ?? Number.POSITIVE_INFINITY;
    const stop = Math.min(now, pick);
    if (stop - b.t >= 60 || now < pick) {
      const why =
        // не срочного медсестра не везёт (решение владельца #99): ждёт санитара
        b.pick === undefined ? (b.orderly ? T.flow.gurneyNoOrderly : T.flow.gurneyNone)(clock(names.nextShift(now)))
        : now < pick ? (b.busy ? T.flow.gurneyBusy(who, clock(pick)) : T.flow.gurneyComing(who, clock(pick)))
        : b.none ? (b.orderly ? T.flow.gurneyNoOrderlyWas : T.flow.gurneyNoneWas)
        : b.busy ? T.flow.gurneyWas(who, !!b.nurse, clock(pick))
        : undefined;
      lines.push({ at: clock(b.t), text: T.flow.gurneyQueue(dur(stop - b.t)), ...(why ? { why } : {}), kind: 'wait', ...(now < pick ? { now: true as const } : {}) });
    }
    if (b.pick !== undefined && b.done !== undefined && now >= b.pick) {
      const d = now >= b.done ? dur(b.done - b.pick) : undefined;
      lines.push({ at: clock(b.pick), text: T.flow.gurneyRide(names.room(b.from), names.room(b.to), d), kind: 'do', ...(now < b.done ? { now: true as const } : {}) });
    }
  }
  const total = Math.max(0, end - j.at);
  const pct = total > 0 ? Math.round((100 * waited) / total) : 0;
  return { lines, summary: T.flow.inside(female, dur(total), dur(waited), pct), ...(left ? { left } : {}) };
}

// ---------------------------------------------------------------- каталка

/** Что с перевозкой сейчас (src/render/rides.ts): фаза, откуда и куда — номера помещений плана. */
export interface RideNow {
  phase: 'go' | 'load' | 'carry' | 'unload' | 'wait' | 'loadBack' | 'carryBack' | 'unloadBack' | 'home';
  from: string;
  to: string;
}

/**
 * Что делает тот, кто везёт каталку (spec docs/specs/2026-10-orderlies.md, «Что видно»): «идёт с каталкой за больным: …»,
 * «везёт на каталке: …, смотровая приёмного → палата», «ждёт у аппарата: …», «возвращается с каталкой на место».
 */
export function rideLine(r: RideNow & { who?: string }, room: (id: string) => string): string {
  const who = r.who ?? T.card.ride.someone;
  switch (r.phase) {
    case 'go':
      return T.card.ride.go(who);
    case 'load':
    case 'loadBack':
      return T.card.ride.load(who);
    case 'carry':
      return T.card.ride.carry(who, room(r.from), room(r.to));
    case 'carryBack':
      return T.card.ride.carry(who, room(r.to), room(r.from));
    case 'unload':
    case 'unloadBack':
      return T.card.ride.unload(who);
    case 'wait':
      return T.card.ride.wait(who, room(r.to));
    case 'home':
      return T.card.ride.home;
  }
}

/** Что делает фельдшер скорой: ввозит привезённого, ждёт с ним у входа, уходит к машине. */
export function medicLine(m: { who?: string; wait?: true; leaving?: true }): string {
  const who = m.who ?? T.card.ride.someone;
  return m.leaving ? T.card.medicLeaving : m.wait ? T.card.medicWaits(who) : T.card.medicBrings(who);
}

/** Что с тем, кого везут: перекладывают, везут откуда и куда, на обследовании у аппарата. */
export function wheelLine(r: RideNow, room: (id: string) => string): string {
  switch (r.phase) {
    case 'carry':
      return T.card.wheeled.carry(room(r.from), room(r.to));
    case 'carryBack':
      return T.card.wheeled.carry(room(r.to), room(r.from));
    case 'unload':
    case 'unloadBack':
      return T.card.wheeled.unload;
    case 'wait':
      return T.card.wheeled.wait(room(r.to));
    default:
      return T.card.wheeled.load;
  }
}

// ---------------------------------------------------------------- помещения

/** Нагрузка помещения сейчас: сколько его ждут и самое долгое ожидание; занято ли; койки; врач ждёт вашего ответа. */
export interface RoomLoad {
  queue: number;
  wait: number;
  busy: boolean;
  /** занято и всего коек — у палат, ПИТ, реанимации, боксов и смотровой */
  beds?: [number, number];
  ask: boolean;
}

/**
 * Нагрузка помещений плана по людям из среза: общую очередь к врачам ждут в первой зоне ожидания (`hall`), своего врача
 * — у его кабинета (`officeOf` — кабинет человека штата по номеру), обследования — у его кабинета.
 */
export function roomLoads(people: Iterable<Pick<Seen, 'status' | 'doing' | 'room' | 'by' | 'bed' | 'since' | 'ask'>>, plan: Plan, officeOf: (by: number) => number, hall: number, t: number, isBedRoom: (type: Id) => boolean): RoomLoad[] {
  const out: RoomLoad[] = plan.rooms.map(r => ({ queue: 0, wait: 0, busy: false, ask: false, ...(isBedRoom(r.type) && r.beds.length > 0 ? { beds: [0, r.beds.length] as [number, number] } : {}) }));
  const add = (room: number, since: number) => {
    const l = out[room];
    if (!l) return;
    l.queue++;
    l.wait = Math.max(l.wait, t - since);
  };
  for (const p of people) {
    const l = p.room >= 0 ? out[p.room] : undefined;
    if (p.ask && p.by >= 0) {
      const o = out[officeOf(p.by)];
      if (o) o.ask = true;
    }
    // койки: лежит в палате или привезён скорой и лежит в смотровой — и тогда, когда его положили, а каталки ещё нет
    if (l?.beds && (p.doing === 'ward' || ((p.doing === 'ambulance' || p.doing === 'gurney') && p.bed >= 0))) l.beds[0]++;
    if (p.doing === 'office' || p.doing === 'exam' || p.doing === 'surgery' || p.doing === 'registration' || p.doing === 'triage' || (p.doing === 'ambulance' && p.status === 'inRoom')) {
      if (l) l.busy = true;
      continue;
    }
    if (p.doing === 'examQueue' && p.room >= 0) add(p.room, p.since);
    else if (p.status !== 'waiting') continue;
    else if (p.by >= 0) add(officeOf(p.by), p.since);
    else if (p.doing === 'ambulance' && p.room >= 0) add(p.room, p.since);
    else if (hall >= 0) add(hall, p.since);
  }
  return out;
}

/** `rest` — помещение не в своей смене (spec docs/specs/2026-10-staff-shifts.md): спокойно, только в слое очередей */
export type ChipTone = 'ok' | 'busy' | 'queue' | 'bad' | 'off' | 'ask' | 'rest';
export type ChipIcon = 'ok' | 'busy' | 'queue' | 'bed' | 'staff' | 'closed' | 'down' | 'ask' | 'mine';

/** Значок состояния помещения (spec «Значки состояния помещений»): короткий текст; `long` — для слоя очередей. */
export interface RoomChip {
  tone: ChipTone;
  icon: ChipIcon;
  text: string;
  long?: string;
}

/** Состояние помещения: «не работает: причина», нет персонала, закрыто, врач ждёт ответа, очередь, койки, занято, работает. */
export function roomChip(load: RoomLoad, problem: { kind: Problem['kind'] | 'broken' | 'offShift'; text: string } | undefined, mine: boolean): RoomChip {
  if (problem?.kind === 'closed') return { tone: 'off', icon: 'closed', text: T.flow.room.closed };
  // не его смена (spec docs/specs/2026-10-staff-shifts.md): «закрыто до 08:00» — спокойно; а врач доводит приём или лежат
  // больные — видно их, как днём
  const off = problem?.kind === 'offShift';
  if (off && !load.busy && load.queue === 0 && !load.ask && !(load.beds && load.beds[0] > 0)) return { tone: 'rest', icon: 'closed', text: problem.text };
  const why = off ? undefined : problem;
  if (why?.kind === 'noStaff') return { tone: 'bad', icon: 'staff', text: why.text, long: T.problem.down(why.text) };
  if (why) return { tone: 'bad', icon: 'down', text: T.problem.down(why.text) };
  if (load.ask) return { tone: 'ask', icon: 'ask', text: T.flow.room.ask };
  if (load.queue > 0) {
    const tone: ChipTone = load.wait >= WAIT_BAD ? 'bad' : load.wait >= WAIT_OK ? 'queue' : 'busy';
    return { tone, icon: 'queue', text: T.flow.room.queue(load.queue), long: T.flow.roomWait(load.queue, dur(load.wait)) };
  }
  if (load.beds) return { tone: load.beds[0] >= load.beds[1] ? 'queue' : 'ok', icon: 'bed', text: T.flow.room.beds(load.beds[0], load.beds[1]) };
  if (load.busy) return { tone: 'busy', icon: 'busy', text: T.flow.room.busy };
  if (mine) return { tone: 'ok', icon: 'mine', text: T.flow.room.mine };
  return { tone: 'ok', icon: 'ok', text: T.flow.room.works };
}

/**
 * Значок виден и без слоя (spec docs/specs/2026-10-owner-play.md): то, что требует взгляда, — не работает, закрыто, просит
 * врач, долго ждут, койки заняты все, — и ваш кабинет. «Работает», «занято», «койки» и короткая очередь — в слое «Очереди
 * и загрузка»: над каждым помещением они лишние.
 */
export function chipShown(chip: RoomChip, layer: boolean): boolean {
  return layer || chip.tone === 'bad' || chip.tone === 'off' || chip.tone === 'ask' || chip.tone === 'queue' || chip.icon === 'mine';
}

/** Цвет пола в слое «Очереди и загрузка»: по ожиданию, по койкам, занято; не работает — серый; пусто — нет цвета. */
export function tintOf(load: RoomLoad, down: boolean): number | null {
  // насыщенные: кадр потом переводится в тон и затеняется, и полупрозрачный пол бледнеет
  const GREEN = 0x1fbf5a;
  const YELLOW = 0xffc400;
  const RED = 0xff2a12;
  if (down) return 0x6f7a80;
  if (load.queue > 0) return load.wait >= WAIT_BAD ? RED : load.wait >= WAIT_OK ? YELLOW : GREEN;
  if (load.beds && load.beds[0] > 0) return load.beds[0] >= load.beds[1] ? RED : load.beds[0] >= load.beds[1] * BEDS_HIGH ? YELLOW : GREEN;
  if (load.busy) return GREEN;
  return null;
}
