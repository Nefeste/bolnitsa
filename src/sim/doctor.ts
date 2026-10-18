// Режим врача в потоке расчёта (spec docs/specs/2026-10-doctor-mode.md, «Поток расчёта: вид приёма — там, где движок») —
// своё; вид карты больного — части из src/state/session.ts «Анамнеза» @ 1f80da6 (buildCaseView, settingOptions, orOption,
// targetLines, decisionFor, seenAt, arrivedOf, outcomeKnown; обход — roundsView, fmtVital, replanChoices — spec
// docs/specs/2026-10-economy.md, «Обход»), изменено: строки — `T.case` и `T.round`, без портретов, «Похоже на» —
// по уровню из окна. Окно не видит правды о больном: оно получает отсюда готовый вид карты (caseView.ts) и состояние
// врача — списки больных словами. Чистые функции состояния смены и одна обёртка (`DoctorDesk`), которая помнит, что
// окно уже получило: смена от неё не меняется.
import type { BodySystem, ContentDb, Id, Setting } from '../content/types';
import { askMinutes } from '../engine/career/skills';
import { complaintObservations } from '../engine/med/exams';
import { evaluatePlan, primaryOf } from '../engine/med/plan';
import type { Grade } from '../engine/med/score';
import { complaintText } from '../engine/med/text';
import { type Block, doctorRoom, examWhere, type Problem } from '../engine/hospital/requirements';
import {
  atDoctor, bedsideEquipment, bedsideOf, boxBeds, brokenOf, colleaguesOf, forPlayer, freeBeds, freeBoxBeds, freeIcuBeds, freeRicuBeds, type HospitalCtx,
  hospitalCtx, icuBeds, isOut, moreUrgent, observationsOf, operationOf, type OrBlock, orBlock, reviewedCase, reviewFor, ricuBeds, targetPlace, wardBeds,
} from '../engine/shift/engine';
import { inBox, inIcu, inRicu, orQueueOf, stayEquipment } from '../engine/shift/engine';
import { KEEP } from '../engine/shift/journey';
import { minutesTo, targetStart, targetsFor } from '../engine/shift/targets';
import { type ClosedCase, type Command, type ConsultWhy, DAY, type Difficulty, type ShiftPatient, type ShiftState, type Triage } from '../engine/shift/types';
import { daysIn, stayNorm, vitalOn, WARD_VITALS, type WardState, wardState } from '../engine/shift/ward';
import { genitive, type Lang, lang as currentLang, named, setLang, T } from '../i18n';
import {
  type Arrival, type CaseTarget, type Decision, decisionOf, hhmm, makeCaseView, patientName, type SettingOption, useDb, type VisitView,
} from './caseView';
import { confidenceWord, suggestedTreatments, treatmentGroupsFor } from './caseView';
import { lowerFirst } from '../i18n/case';

/** Уровни медицины (геймдизайн §10) — от лёгкого к трудному; по умолчанию — «Студент» (spec «Сложность»). */
export const LEVELS: readonly Difficulty[] = ['trainee', 'student', 'resident', 'doctor'];
export const DEFAULT_LEVEL: Difficulty = 'student';

/** Почему поток не сделал «Взять» или действие в карте (spec «Как случай становится вашим»). */
export type Refusal = 'busy' | 'noOffice' | 'gone' | 'notHere' | 'unsorted' | 'notInOffice' | 'dayClosed' | 'coming';

/** Больной в окне врача — словами, без правды. */
export interface PatientRow {
  id: string;
  /** «Петров Иван, 45 лет, м» */
  who: string;
  sex: 'm' | 'f';
  age: number;
  /** главная жалоба словами пациента */
  complaint: string;
  triage: Triage;
  /** почему ваш: взят у врача, свой больной (группы «Свои больные»), вернулся с результатами */
  why?: 'taken' | 'own' | 'back' | 'yours';
  /** ждёт результатов: к какому часу всё будет готово (игровые секунды) */
  ready?: number;
  /** ваш, идёт к вам (spec 2026-10-owner-play-2): когда встретитесь, игровые секунды */
  coming?: number;
  /** ваш, на обследовании в другом кабинете: когда вернётся, игровые секунды */
  back?: number;
}

/** Ваш лежащий — для обхода (spec docs/specs/2026-10-economy.md, «Обход»; как карточка обхода «Анамнеза», `RoundCard`). */
export interface WardRow extends PatientRow {
  diagnosis: string;
  days: number;
  norm: number;
  state: WardState;
  /** как идёт — словами; реакция — на что и чем */
  stateText: string;
  /** динамика: температура и то, что выходило за норму, — по суткам за последние пять, «38,9 → 38,1 → 37,4 °C» */
  vitals: { label: string; values: string }[];
  /** назначенное сейчас — названиями; ничего — «не назначено» */
  treatments: string;
  /** где лежит: ПИТ, реанимация (под монитором, на ИВЛ), бокс; в палате — нет */
  unit?: string;
  /** операция: ждёт, идёт до…, после операции */
  op?: string;
  /** «В операционную»: у диагноза есть операция, её ещё не было — что за операция; нельзя — почему */
  operate?: { hint: string; disabled?: boolean };
  /** на столе — ни выписать, ни перевести; ждёт операции — только перевести (как движок) */
  canDischarge: boolean;
  canTransfer: boolean;
  /** на столе или ждёт операции — ни выписать, ни перевести с обхода (движок откажет) */
  busy: boolean;
  /** что случилось за сутки: фибрилляцию сняли разрядом под монитором */
  event?: string;
  /** лежащий у нанятого врача (spec docs/specs/2026-10-two-ways.md, F2): кто ведёт — должность и навык */
  by?: string;
}

/**
 * Блок обхода в карте вашего лежащего (spec «Обход», «Сменить лечение»): как идёт, динамика, что можно у его койки — по
 * группам, что база называет при диагнозе — сверху; назначенное сейчас отмечено.
 */
export interface RoundView {
  row: WardRow;
  current: Id[];
  suggested: Id[];
  groups: VisitView['treatmentGroups'];
}

/** Ваш закрытый сегодня приём — для разбора. */
export interface ClosedRow extends PatientRow {
  diagnosis: string;
  verdict: ClosedCase['verdict'];
  overall: Grade;
  at: number;
}

/** Просьба нанятого врача (spec 2026-10-consults) — словами. */
export interface AskRow {
  id: string;
  who: string;
  complaint: string;
  triage: Triage;
  /** кто просит: номер человека, должность, навык */
  by: string;
  role: string;
  skill: number;
  at: number;
  until: number;
  why: ConsultWhy[];
  /** что он думает: его диагноз и вторая группа — уверенность в процентах */
  lead: { name: string; p: number }[];
}

/** Нанятый врач, который сегодня принимает, — для «Направить к …». */
export interface ColleagueRow {
  id: string;
  role: string;
  skill: number;
}

/** Состояние врача для окна: где вы, кто у вас, кто ждёт, просьбы, «Свои больные». */
export interface DoctorState {
  /** ваш кабинет — номер помещения; нет — «Не принимаю» */
  office?: string;
  /** где ваша фигура: ваш кабинет или смотровая приёмного, где вы у привезённого скорой */
  at?: string;
  current?: PatientRow;
  /** ждут вас: взятые, вернувшиеся с результатами, свои больные — по порядку очереди */
  yours: PatientRow[];
  /** ждут врача — общая очередь, первые по срочности; `othersMore` — сколько ещё */
  others: PatientRow[];
  othersMore: number;
  away: PatientRow[];
  ward: WardRow[];
  /** лежащие у нанятых врачей (spec docs/specs/2026-10-two-ways.md, F2) — в «Обходе» после ваших */
  theirs: WardRow[];
  closed: ClosedRow[];
  asks: AskRow[];
  colleagues: ColleagueRow[];
  mine: BodySystem[];
  dayOpen: boolean;
}

/** Вид карты для окна: вид приёма «Анамнеза» и где больной сейчас. */
export interface CardView extends VisitView {
  id: string;
  /** у вас в кабинете и не закрыт — действия карты работают */
  active: boolean;
  /** не у вас — где: идёт к вам, ждёт вас, на обследованиях, закрыт, лежит, ушёл, у другого врача */
  where?: 'coming' | 'waiting' | 'away' | 'done' | 'admitted' | 'gone' | 'other';
  /** идёт к вам (spec 2026-10-owner-play-2): когда встретитесь, игровые секунды */
  coming?: number;
  /** ждёт вас и вы свободны — можно позвать */
  callable?: boolean;
  /** лежащий — блок обхода: как идёт, динамика, смена лечения (spec 2026-10-economy, «Обход»; чужой — 2026-10-two-ways) */
  round?: RoundView;
  /** больной нанятого врача (spec docs/specs/2026-10-two-ways.md, F1): кто ведёт и что думает или что решил */
  lead?: { by: string; text: string };
  /**
   * решение нанятого врача (spec docs/specs/2026-10-discharged-card.md): диагноз, лечение и где лечить — у закрытого им
   * приёма, кроме лежащего (у того — обход)
   */
  decided?: { diagnosis: { id: Id; name: string }; treatments: { id: Id; name: string }[]; setting: string };
  /** «Взять случай» сейчас можно */
  take?: true;
}

/** «Приняты» (spec docs/specs/2026-10-discharged-card.md): принят и ушёл — домой или в другую больницу; без правды о болезни. */
export interface SeenRow {
  id: string;
  name: string;
  sex: 'm' | 'f';
  age: number;
  triage: Triage;
  /** когда закрыт приём, игровые секунды */
  at: number;
  setting: Setting;
  /** диагноз врача, который вёл */
  diagnosis: string;
  /** кто вёл: должность и навык; нет — вы */
  by?: string;
}

/** «Приняты»: строки — новые сверху, не больше `SEEN`; `total` — всех за сутки. */
export interface SeenList {
  rows: SeenRow[];
  total: number;
}

/** Строк «Приняты» — не больше: новые сверху. */
export const SEEN = 50;

/** Сколько строк общей очереди показывать. */
export const OTHERS = 5;

// --- что в больнице ваше -----------------------------------------------------------------------------------------------

/** Ваш кабинет: отмеченный «Мой» (spec «Ваш кабинет») или, в больнице «Анамнеза», первый кабинет врача. */
export function officeOf(db: ContentDb, s: ShiftState): string | undefined {
  return s.hospital ? doctorRoom(hospitalCtx(db, s).plan) : undefined;
}

const female = (p: ShiftPatient) => p.patient.sex === 'f';
const minuteOfDay = (t: number) => Math.floor((t % DAY) / 60);
const closedDay = (p: ShiftPatient) => Math.floor(p.closed!.at / DAY) + 1;

/** Поток для ПК (spec 2026-10-owner-play-2): ваш пациент ещё идёт к вам — когда встретитесь; встретились — undefined. */
export function comingAt(s: ShiftState): number | undefined {
  return s.meet !== undefined && s.meet > s.t ? s.meet : undefined;
}

/** Карта ушедшего из состояния (spec 2026-10-discharged-card): сутки после ухода; новые — в конце списка. */
function pastOf(s: ShiftState, id: string): ShiftPatient | undefined {
  const past = s.past ?? [];
  for (let i = past.length - 1; i >= 0; i--) if (past[i].p.id === id) return past[i].p;
  return undefined;
}

/** Ваш больной: у вас, ждёт вас, на ваших обследованиях, ваш закрытый или лежащий. */
export function yoursOf(db: ContentDb, s: ShiftState, p: ShiftPatient): ShiftPatient['status'] | undefined {
  if (p.id === s.current) return 'inRoom';
  if (p.closed) return p.closed.by ? undefined : p.status;
  if (p.by) return undefined;
  if (p.status === 'away') return 'away';
  if (p.status === 'waiting' && (p.calledT !== undefined || forPlayer(db, s, p))) return 'waiting';
  return undefined;
}

function complaintOf(db: ContentDb, p: ShiftPatient): string {
  const first = complaintObservations(p.patient)[0];
  return first ? complaintText(db, first, p.patient.sex, p.patient.seed) : T.case.patient.checkup(female(p));
}

function rowOf(db: ContentDb, p: ShiftPatient, why?: PatientRow['why']): PatientRow {
  const pt = p.patient;
  return {
    id: p.id, who: T.doctor.who(patientName(pt), pt.sex, pt.age), sex: pt.sex, age: pt.age, complaint: complaintOf(db, p), triage: p.triage,
    ...(why ? { why } : {}), ...(p.status === 'away' && p.pending.length ? { ready: Math.max(...p.pending.map(x => x.readyAt)) } : {}),
  };
}

/** Состояние врача: дёшево, без вывода — его считают на каждый срез и шлют, если изменилось. */
export function doctorState(db: ContentDb, s: ShiftState): DoctorState {
  const office = officeOf(db, s);
  let current: PatientRow | undefined;
  const yours: { row: PatientRow; order: number }[] = [];
  const others: { id: string; order: number }[] = [];
  const away: PatientRow[] = [];
  const ward: WardRow[] = [];
  const theirs: WardRow[] = [];
  const closed: ClosedRow[] = [];
  const order = new Map(s.queue.map((id, i) => [id, i]));
  for (const p of Object.values(s.patients)) {
    if (p.id === s.current) {
      // идёт к вам или на обследовании в другом кабинете (spec 2026-10-owner-play-2): когда будет
      current = { ...rowOf(db, p), ...(comingAt(s) !== undefined ? { coming: s.meet } : {}), ...(isOut(s, p) ? { back: p.out!.back } : {}) };
      continue;
    }
    if (p.closed) {
      // лежащий у нанятого врача — в «Обходе» после ваших (spec 2026-10-two-ways, F2)
      if (p.closed.by) {
        if (p.status === 'admitted' && p.stay) theirs.push(wardRow(db, s, p));
        continue;
      }
      const c = p.closed;
      if (p.status === 'admitted' && p.stay) {
        ward.push(wardRow(db, s, p));
      } else if (closedDay(p) === s.day) {
        closed.push({ ...rowOf(db, p), diagnosis: db.conditions[c.diagnosis]?.name.ru ?? c.diagnosis, verdict: c.verdict, overall: c.grades.overall, at: c.at });
      }
      continue;
    }
    if (p.by) continue;
    if (p.status === 'away') away.push(rowOf(db, p));
    else if (p.status === 'waiting') {
      const i = order.get(p.id) ?? Number.MAX_SAFE_INTEGER;
      if (p.calledT !== undefined) yours.push({ row: rowOf(db, p, p.from ? 'taken' : 'back'), order: i });
      else if (forPlayer(db, s, p)) yours.push({ row: rowOf(db, p, 'own'), order: i });
      // строки словами — только первым (ниже): очередь бывает длинной
      else if (order.has(p.id)) others.push({ id: p.id, order: i });
    }
  }
  others.sort((a, b) => a.order - b.order);
  const shown = others.slice(0, OTHERS).map(x => rowOf(db, s.patients[x.id]));
  const staff = hospitalCtx(db, s).staff;
  const asks: AskRow[] = (s.consults ?? []).flatMap(c => {
    const p = s.patients[c.id];
    const m = staff.find(x => x.id === c.by);
    if (!p || !m) return [];
    const r = rowOf(db, p);
    return [{
      id: c.id, who: r.who, complaint: r.complaint, triage: p.triage, by: m.id, role: named(db.roles[m.role]?.name, m.role), skill: m.skill, at: c.at, until: c.until,
      why: [...c.why], lead: c.lead.map(x => ({ name: db.conditions[x.id]?.name.ru ?? x.id, p: Math.round(x.p * 100) })),
    }];
  });
  return {
    ...(office ? { office } : {}),
    ...(office || s.doctorAt ? { at: s.doctorAt ?? office } : {}),
    ...(current ? { current } : {}),
    yours: yours.sort((a, b) => a.order - b.order).map(x => x.row),
    others: shown,
    othersMore: others.length - shown.length,
    away: away.sort((a, b) => (a.ready ?? 0) - (b.ready ?? 0) || (a.id < b.id ? -1 : 1)),
    ward: ward.sort((a, b) => (a.id < b.id ? -1 : 1)),
    theirs: theirs.sort((a, b) => (a.by ?? '').localeCompare(b.by ?? '') || (a.id < b.id ? -1 : 1)),
    closed: closed.sort((a, b) => b.at - a.at),
    asks: asks.sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1)),
    colleagues: colleaguesOf(db, s).map(m => ({ id: m.id, role: named(db.roles[m.role]?.name, m.role), skill: m.skill })),
    mine: [...(s.meta.mine ?? [])],
    dayOpen: s.dayOpen,
  };
}

// --- обход (spec docs/specs/2026-10-economy.md, «Обход»; roundsView «Анамнеза») ------------------------------------------

/** Значение витального словами: «37,4», давление — «150/95». */
function fmtVital(db: ContentDb, f: Id, v: number): string {
  const spec = db.findings[f]!.value!;
  const main = v.toFixed(spec.decimals).replace('.', currentLang === 'en' ? '.' : ',');
  const dia = spec.derived?.dia;
  return dia ? `${main}/${Math.round(v * dia)}` : main;
}

/**
 * Ваш лежащий на обходе: сутки и обычный срок, как идёт, динамика витальных за последние пять суток (температура — всегда,
 * остальное — если выходило за норму), лечение, где лежит, операция, что можно: выписать, перевести, в операционную.
 */
export function wardRow(db: ContentDb, s: ShiftState, p: ShiftPatient): WardRow {
  const c = p.closed!;
  const stay = p.stay!;
  const t = T.round;
  const days = daysIn(stay, s.day);
  const state = wardState(stay, days);
  const from = Math.max(0, days - 5);
  const range = Array.from({ length: days - from + 1 }, (_, i) => from + i);
  const vitals = WARD_VITALS.flatMap(f => {
    const spec = db.findings[f]?.value;
    const series = range.map(d => vitalOn(db, p.patient, stay, f, d));
    if (!spec || series.some(v => v === undefined)) return [];
    const off = series.some(v => v! < spec.ref[0] || v! > spec.ref[1]);
    if (f !== 'vital.fever' && !off) return [];
    return [{ label: t.vital[f] ?? f, values: `${series.map(v => fmtVital(db, f, v!)).join(' → ')}\u00a0${spec.unit}` }];
  });
  const op = stay.op;
  const opName = op ? named(db.treatments[op.tx]?.name, op.tx) : '';
  const stage = op?.complicated ? db.conditions[primaryOf(p.patient).id]?.complication?.name.ru : undefined;
  const opLine = !op ? undefined
    : op.done ? `${t.opDone(opName)}${stage ? ` · ${t.opStage(stage)}` : ''}${op.complication ? ` · ${t.opComplication}` : ''}`
      : op.start !== undefined ? t.opOn(opName, hhmm(minuteOfDay(op.end ?? op.start))) : t.opWaiting(opName, orQueueOf(s).findIndex(x => x.id === p.id) + 1);
  const hasOr = hospitalCtx(db, s).plan.rooms.some(r => r.type === 'room.or');
  const dxOp = !op && hasOr ? operationOf(db, p, c.diagnosis) : undefined;
  const block = dxOp ? orBlock(db, s, dxOp) : null;
  const reaction = stay.reaction;
  const stateText = state === 'reaction' && reaction?.as
    ? t.harmAs(named(db.conditions[reaction.as]?.name, reaction.as), named(db.treatments[reaction.tx]?.name, reaction.tx))
    : state === 'reaction' && reaction
      ? t.reaction(named(db.treatments[reaction.tx]?.name, reaction.tx), named(db.risks[reaction.by]?.name ?? db.conditions[reaction.by]?.name, reaction.by))
      : T.case.ward.state[state];
  const unit = inRicu(db, s, p) ? (stay.plan.treatments.some(tx => db.treatments[tx]?.place === 'ricu') ? t.onVent : t.inRicu) : inIcu(db, s, p) ? t.inIcu : inBox(db, s, p) ? t.inBox : undefined;
  return {
    ...rowOf(db, p), diagnosis: named(db.conditions[c.diagnosis]?.name, c.diagnosis), days, norm: stayNorm(db, c.diagnosis), state, stateText, vitals,
    treatments: stay.plan.treatments.length > 0 ? stay.plan.treatments.map(tx => named(db.treatments[tx]?.name, tx)).join(', ') : t.noTreatment,
    ...(unit ? { unit } : {}), ...(opLine ? { op: opLine } : {}),
    ...(dxOp ? { operate: block ? { hint: orBlockText(db, block), disabled: true } : { hint: named(db.treatments[dxOp].name, dxOp) } } : {}),
    canDischarge: !op || op.done === true, canTransfer: !op || op.done === true || op.start === undefined, busy: !!op && !op.done,
    ...(stay.shock !== undefined && days === stay.shock + 1 ? { event: t.shock } : {}),
    ...(c.by ? { by: staffName(db, s, c.by) } : {}),
  };
}

/** Нанятый врач словами: «Терапевт, навык 3»; уволен — должность неизвестна. */
function staffName(db: ContentDb, s: ShiftState, id: string): string {
  const m = hospitalCtx(db, s).staff.find(x => x.id === id) ?? s.staff?.find(x => x.id === id);
  return m ? T.doctor.asks.by(named(db.roles[m.role]?.name, m.role), m.skill) : T.doctor.lead.someone;
}

/** Лечение и место словами: «амоксициллин · дома». */
function planText(db: ContentDb, plan: { treatments: readonly Id[]; setting: Setting }): string {
  const tx = plan.treatments.map(x => lowerFirst(named(db.treatments[x]?.name, x))).join(', ');
  return `${tx || T.round.noTreatment} · ${T.doctor.lead.where[plan.setting] ?? plan.setting}`;
}

/**
 * Кто ведёт больного нанятого врача и что о нём думает (spec docs/specs/2026-10-two-ways.md, F1): ищет диагноз; выбрал —
 * диагноз и уверенность, как подсказки вашего уровня медицины; решил — диагноз, лечение и место. Только то, что знает
 * врач: правды о больном здесь нет.
 */
function leadOf(db: ContentDb, s: ShiftState, p: ShiftPatient, level: Difficulty): CardView['lead'] {
  const by = p.closed ? p.closed.by : p.by;
  if (!by) return undefined;
  const t = T.doctor.lead;
  const who = staffName(db, s, by);
  const dx = (id: Id) => lowerFirst(named(db.conditions[id]?.name, id));
  const closed = p.closed;
  // принят и ушёл (spec 2026-10-discharged-card): чем кончилось и когда; диагноз и лечение — блоком решения в карте
  if (closed && p.status !== 'admitted' && !closed.stay) return { by: who, text: t.released(closed.plan.setting, hhmm(minuteOfDay(closed.at))) };
  if (closed) return { by: who, text: t.decided(dx(closed.diagnosis), planText(db, closed.plan)) };
  const ph = p.phase;
  if (!ph?.diagnosis) return { by: who, text: t.seeking };
  const c = ph.confidence;
  const conf = c === undefined || level === 'doctor' ? undefined : level === 'resident' ? confidenceWord(c) : T.case.patient.outOf10(Math.round(c * 10));
  return { by: who, text: t.thinks(dx(ph.diagnosis), conf) };
}

/** Блок обхода в карте: лечение по группам — что можно у его койки, с тем, что о нём известно (`replanChoices` «Анамнеза»). */
function roundOf(db: ContentDb, s: ShiftState, p: ShiftPatient): RoundView {
  const current = p.stay!.plan.treatments.filter(tx => db.treatments[tx]?.kind !== 'surgery');
  const groups = treatmentGroupsFor(observationsOf(p), stayEquipment(db, s, p), hospitalCtx(db, s).rooms);
  const all = new Set(groups.flatMap(g => g.items.map(x => x.id)));
  const suggested = [...suggestedTreatments(p.closed!.diagnosis, current)].filter(id => all.has(id)).sort();
  return { row: wardRow(db, s, p), current, suggested, groups };
}

// --- «Взять случай» -----------------------------------------------------------------------------------------------------

/**
 * Что значит «Взять случай» для этого больного (spec, таблица «Взять случай»): одна команда движка, открыть карту своего
 * или отказ с причиной.
 */
export function takeCommand(db: ContentDb, s: ShiftState, id: string): { cmd?: Command; open?: true; refused?: Refusal } {
  const p = s.patients[id];
  if (!p) return { refused: 'gone' };
  const yours = yoursOf(db, s, p);
  if (yours === 'inRoom' || yours === 'away' || yours === 'done' || yours === 'admitted') return { open: true };
  if (!s.dayOpen) return { refused: 'dayClosed' };
  if (!officeOf(db, s)) return { refused: 'noOffice' };
  if (s.consults?.some(c => c.id === id)) return { cmd: { kind: 'consult', id, answer: 'look' } };
  if (p.by && !p.closed && (p.status === 'inRoom' || p.status === 'waiting' || p.status === 'away')) return { cmd: { kind: 'takeOver', id } };
  if (!p.by && !p.closed && p.status === 'waiting') {
    if (p.kind === 'ambulance' && !p.sorted) return { refused: 'unsorted' };
    if (s.current) return yours === 'waiting' ? { open: true } : { refused: 'busy' };
    return { cmd: { kind: 'call', id } };
  }
  return { refused: 'notHere' };
}

// --- вид карты (из session.ts «Анамнеза») -------------------------------------------------------------------------------

/** Итог и разбор закрытого случая: разбор пересчитывается той же ветвью зерна (`reviewFor`); один на язык и исход. */
const decisions = new Map<string, Decision>();

/** «Домой» — исход в итогах дня, когда он стал ясен; перевод — сразу. */
function outcomeKnown(s: ShiftState, p: ShiftPatient): boolean {
  const c = p.closed!;
  const lastClosed = s.dayOpen ? s.day - 1 : s.day;
  return c.plan.setting !== 'home' || lastClosed >= closedDay(p) + c.outcome.day;
}

function decisionFor(db: ContentDb, s: ShiftState, p: ShiftPatient, arrived: Arrival[], known: boolean): Decision {
  const c = reviewedCase(db, s, p) ?? p.closed!;
  // исход лежащего меняется при выписке — ключ с ним; строки — на языке окна
  const key = `${s.meta.seed}:${p.id}:${known}:${c.outcome.kind}:${currentLang}`;
  const cached = decisions.get(key);
  if (cached) return cached;
  const ev = evaluatePlan(db, p.patient, c.plan, observationsOf(p), { bedside: c.bedside ?? [] });
  const review = reviewFor(db, s.meta, p, c.diagnosis);
  const d = decisionOf({
    patient: p.patient, arrived, diagnosis: c.diagnosis, verdict: c.verdict, confidence: c.confidence, plan: c.plan, ev, outcome: c.outcome,
    score: { ...c.grades, notes: c.notes }, review, ...(c.targets ? { targets: c.targets } : {}), ...(c.arrest ? { arrest: true } : {}),
  });
  const out = known ? d : { ...d, outcome: T.case.patient.outcomeLater };
  if (decisions.size > 200) decisions.clear();
  decisions.set(key, out);
  return out;
}

/** Ваш пациент на час `t`: результаты, готовые к нему, — уже пришли, по порядку, как их отдаст движок. */
function seenAt(p: ShiftPatient, t: number): ShiftPatient {
  const ready = p.pending.filter(x => x.readyAt <= t).sort((a, b) => a.readyAt - b.readyAt || (a.exam < b.exam ? -1 : 1));
  if (ready.length === 0) return p;
  return {
    ...p,
    pending: p.pending.filter(x => x.readyAt > t),
    results: [...p.results, ...ready.map(x => ({ exam: x.exam, obs: x.obs, at: x.readyAt, step: p.step, ...(x.repeat ? { repeat: x.repeat } : {}) }))],
  };
}

/** Пришедшие результаты; `until` — только готовые к этому времени. */
const arrivedOf = (p: ShiftPatient, until = Infinity): Arrival[] =>
  p.results.filter(r => r.at <= until).map(r => ({ exam: r.exam, step: r.step, at: minuteOfDay(r.at), obs: r.obs, ...(r.repeat ? { repeat: r.repeat } : {}) }));

/** Причина «не работает» словами — как в карточке помещения (game.ts). */
function problemWords(db: ContentDb, p: Problem): string {
  switch (p.kind) {
    case 'closed':
      return T.problem.closed;
    case 'leaving':
      return T.problem.leaving;
    case 'noDoor':
      return T.problem.noDoor;
    case 'singleDoor':
      return T.problem.singleDoor;
    case 'noPath':
      return T.problem.noPath;
    case 'noObject':
      return T.problem.noObject(T.objects[p.object as keyof typeof T.objects] ?? p.object, p.have, p.need);
    case 'noEquipment':
      return T.problem.noEquipment;
    case 'noStaff':
      return T.problem.noStaff(genitive(db.roles[p.role], p.role));
    case 'noPlace':
      return T.problem.noPlace;
  }
}

/** Почему обследование здесь не сделать (sandboxView.ts «Анамнеза», examBlockText). */
function examBlockText(db: ContentDb, b: Block): string {
  const t = T.case.examBlock;
  const room = db.rooms[b.room];
  if (b.kind === 'noRoom') return t.none(room ? genitive(room) : b.room);
  if (b.kind === 'down') return t.down(named(room?.name, b.room), problemWords(db, b.problem));
  if (b.kind === 'broken') return t.broken(named(db.equipment[b.equipment[0]]?.name, b.equipment[0]));
  return t.none(db.equipment[b.equipment[0]] ? genitive(db.equipment[b.equipment[0]]) : b.equipment[0]);
}

const blocked = new WeakMap<HospitalCtx, Map<string, Record<Id, string>>>();

/** Обследования, которых в этой больнице не сделать, и почему — один раз на больницу, сломанное и язык. */
function unavailableOf(db: ContentDb, s: ShiftState): Record<Id, string> {
  const ctx = hospitalCtx(db, s);
  const key = `${(s.broken ?? []).join(',')}|${currentLang}`;
  let byKey = blocked.get(ctx);
  if (!byKey) blocked.set(ctx, (byKey = new Map()));
  let out = byKey.get(key);
  if (!out) {
    out = {};
    const broken = brokenOf(s);
    for (const id of Object.keys(db.exams)) {
      const w = examWhere(db, ctx.plan, ctx.working, ctx.staffed, id, broken);
      if ('block' in w) out[id] = examBlockText(db, w.block);
    }
    byKey.set(key, out);
  }
  return out;
}

function orBlockText(db: ContentDb, b: OrBlock): string {
  const t = T.case.ward;
  if (b.kind === 'noEquipment') return t.noOpEquipment(db.equipment[b.equipment] ? genitive(db.equipment[b.equipment]) : b.equipment);
  if (b.kind === 'down') return `${t.orDown}: ${problemWords(db, b.problem)}`;
  return t.orDown;
}

/** «В операционную»: операция диагноза и свободные койки; нельзя — почему. */
function orOption(db: ContentDb, s: ShiftState, p: ShiftPatient, diagnosis: Id | undefined, free: number, all: number): SettingOption {
  const t = T.case.ward;
  const op = diagnosis ? operationOf(db, p, diagnosis) : undefined;
  const block = op ? orBlock(db, s, op) : null;
  const why = !diagnosis ? t.noDiagnosis : !op ? t.noOperation : block ? orBlockText(db, block) : free === 0 ? t.noBeds : undefined;
  return why ? { key: 'surgery', title: t.operate, hint: why, disabled: true } : { key: 'surgery', title: t.operate, hint: t.opHint(named(db.treatments[op!].name), free, all) };
}

/** Где лечить в больнице со своими палатами: домой, в палату, ПИТ, ОРИТ, бокс, операционная, в другую больницу, скорая. */
function settingOptions(db: ContentDb, s: ShiftState, p: ShiftPatient): SettingOption[] {
  const all = wardBeds(db, s).length;
  const free = freeBeds(db, s).length;
  const t = T.case.ward;
  const setting = T.case.patient.setting;
  const rooms = hospitalCtx(db, s).plan.rooms;
  const hasOr = rooms.some(r => r.type === 'room.or');
  const hasIcu = rooms.some(r => db.rooms[r.type]?.icu && !db.rooms[r.type].vent);
  const icuAll = icuBeds(db, s).length;
  const icuFree = freeIcuBeds(db, s).length;
  const hasRicu = rooms.some(r => db.rooms[r.type]?.vent);
  const ricuAll = ricuBeds(db, s).length;
  const ricuFree = freeRicuBeds(db, s).length;
  const boxAll = boxBeds(db, s).length;
  const boxFree = freeBoxBeds(db, s).length;
  const hasBox = rooms.some(r => db.rooms[r.type]?.box);
  return [
    { key: 'home', title: setting.home },
    ...(all > 0 ? [{ key: 'admit' as const, title: t.admit, hint: free > 0 ? t.freeBeds(free, all) : t.noBeds, disabled: free === 0 }] : []),
    ...(hasIcu ? [{ key: 'icu' as const, title: t.icu, hint: icuFree > 0 ? t.freeIcuBeds(icuFree, icuAll) : t.noBeds, disabled: icuFree === 0 }] : []),
    ...(hasRicu ? [{ key: 'ricu' as const, title: t.ricu, hint: ricuFree > 0 ? t.freeRicuBeds(ricuFree, ricuAll) : t.noBeds, disabled: ricuFree === 0 }] : []),
    ...(hasBox ? [{ key: 'box' as const, title: t.box, hint: boxFree > 0 ? t.freeBoxBeds(boxFree, boxAll) : t.noBeds, disabled: boxFree === 0 }] : []),
    ...(hasOr ? [orOption(db, s, p, p.draft.diagnosis, free, all)] : []),
    { key: 'ward' as Setting, title: t.refer },
    { key: 'ambulance' as Setting, title: setting.ambulance },
  ];
}

/** Сроки пациента — справка из рекомендации, не таймер; сделано — через сколько минут. */
function targetLines(db: ContentDb, s: ShiftState, p: ShiftPatient): CaseTarget[] {
  const t = T.case.patient;
  return targetsFor(db, p, targetPlace(db, s, p)).map(target => {
    const done = minutesTo(db, p, target);
    const start = targetStart(db, p, target) ?? p.arriveT;
    if (done !== undefined) return { text: t.targetDone(target.name.ru, done, target.minutes, target.texts.after?.ru), done: true };
    return { text: t.target(target.name.ru, target.minutes, Math.round((s.t - start) / 60), target.texts.from?.ru), done: false };
  });
}

/**
 * Вид карты больного `id` (buildCaseView «Анамнеза»): ваш у вас в кабинете — на конец вашего действия (больница ещё
 * доживает его минуты); остальные — какие есть. Больного нет в состоянии — `null`.
 */
export function cardView(db: ContentDb, s: ShiftState, id: string, level: Difficulty, version: number): CardView | null {
  // ушедший из состояния — его карта сутки (spec 2026-10-discharged-card): для чтения, такая, каким он ушёл
  const here = s.patients[id];
  const p = here ?? pastOf(s, id);
  if (!p) return null;
  const mine = p.id === s.current;
  // ваш, но ещё идёт к вам (spec 2026-10-owner-play-2): карта — для чтения, приём — когда войдёт
  const coming = mine ? comingAt(s) : undefined;
  const now = mine && s.until !== undefined ? s.until : s.t;
  const seen = mine && s.until !== undefined ? seenAt(p, s.until) : p;
  const watching = p.by !== undefined && !p.closed;
  // в больнице, приём не закрыт и не у нанятого врача: что можно у постели и сколько минут — для действий карты
  const live = here !== undefined && !p.closed && !watching;
  const arrived = arrivedOf(seen, watching ? s.t : Infinity);
  const asking = watching ? p.results.filter(r => r.at > s.t).map(r => ({ exam: r.exam, readyAt: minuteOfDay(r.at) })) : [];
  const prev = p.returnOf ? s.patients[p.returnOf] : undefined;
  const bedside: Record<Id, number> = {};
  if (live) {
    for (const [eid, e] of Object.entries(db.exams)) if (e.bedside && bedsideOf(db, s, p, eid)) bedside[eid] = e.bedside.time.procedure;
  }
  const unavailable: Record<Id, string> = Object.fromEntries(Object.entries(unavailableOf(db, s)).filter(([eid]) => bedside[eid] === undefined));
  const minutes: Record<Id, number> = {};
  if (live) {
    for (const [eid, e] of Object.entries(db.exams)) {
      const m = askMinutes(db, s.meta.skills, e, e.time.procedure);
      if (m !== e.time.procedure) minutes[eid] = m + (e.time.report ?? 0) + (e.time.turnaround ?? 0);
    }
  }
  if (mine && p.out !== undefined && p.out.back > now) {
    const why = T.case.patient.awayExam(hhmm(minuteOfDay(p.out.back)));
    for (const eid of Object.keys(db.exams)) if (!unavailable[eid] && !p.done.includes(eid) && atDoctor(db, s, p, eid)) unavailable[eid] = why;
  }
  const ricu = ricuBeds(db, s).length > 0 ? (freeRicuBeds(db, s).length > 0 ? ('free' as const) : ('full' as const)) : undefined;
  const view = makeCaseView({
    version,
    patient: p.patient,
    clock: minuteOfDay(now),
    minutesSpent: Math.round(p.spent.seconds / 60),
    money: p.spent.money,
    step: p.step,
    arrived,
    pending: [...asking, ...seen.pending.map(x => ({ exam: x.exam, readyAt: minuteOfDay(x.readyAt), ...(x.repeat ? { repeat: x.repeat } : {}) }))],
    ...(mine && p.out && p.out.back > now ? { away: { exam: p.out.exam, back: minuteOfDay(p.out.back) } } : {}),
    meanwhile: [],
    done: p.done,
    draft: p.draft,
    decision: p.closed && !p.closed.by ? decisionFor(db, s, p, arrived, outcomeKnown(s, p)) : undefined,
    canSendAway: mine && p.status === 'inRoom' && seen.pending.length > 0,
    canStepOut: mine && p.status === 'inRoom' && seen.pending.length === 0 && moreUrgent(db, s, p),
    returnNote: p.returnReason && prev?.closed ? T.case.patient.returnNote(p.returnReason, closedDay(prev), female(p)) : undefined,
    difficulty: level,
    unavailable,
    ...(Object.keys(bedside).length > 0 ? { bedside } : {}),
    ...(Object.keys(minutes).length > 0 ? { minutes } : {}),
    bedsideEquipment: bedsideEquipment(db, s, p),
    rooms: hospitalCtx(db, s).rooms,
    ...(ricu ? { ricu } : {}),
    // сроки идут, пока он в больнице; ушедшему — нет
    ...(p.by || !here ? {} : { targets: targetLines(db, s, p) }),
    ...(p.departments ? { departments: p.departments } : {}),
    ...(wardBeds(db, s).length > 0 || hospitalCtx(db, s).plan.rooms.some(r => db.rooms[r.type]?.icu || db.rooms[r.type]?.box) ? { settings: settingOptions(db, s, p) } : {}),
  });
  const yours = yoursOf(db, s, p);
  const where: CardView['where'] = mine && !p.closed ? (coming !== undefined ? 'coming' : undefined)
    : yours === 'waiting' ? 'waiting' : yours === 'away' ? 'away' : p.status === 'admitted' ? 'admitted' : p.closed ? 'done'
      : !here || p.status === 'left' || p.status === 'unseen' ? 'gone' : 'other';
  // лежащий — блок обхода (spec 2026-10-economy); у нанятого врача — тоже: главврач меняет лечение (spec 2026-10-two-ways, F2)
  const round = p.status === 'admitted' && p.stay && p.closed ? roundOf(db, s, p) : undefined;
  // больной нанятого врача (spec 2026-10-two-ways, F1): кто ведёт и что думает; можно ли взять
  const lead = leadOf(db, s, p, level);
  // решение нанятого врача (spec 2026-10-discharged-card): диагноз, лечение, где лечить; у лежащего — обход
  const c = p.closed;
  const decided: CardView['decided'] = c?.by && !round
    ? {
      diagnosis: { id: c.diagnosis, name: named(db.conditions[c.diagnosis]?.name, c.diagnosis) },
      treatments: c.plan.treatments.map(tx => ({ id: tx, name: named(db.treatments[tx]?.name, tx) })),
      setting: T.case.patient.setting[c.plan.setting] ?? c.plan.setting,
    }
    : undefined;
  const take = !mine && !p.closed && yours === undefined && takeCommand(db, s, id).cmd !== undefined;
  return {
    ...view, id, active: mine && !p.closed && coming === undefined, ...(where ? { where } : {}), ...(coming !== undefined ? { coming } : {}), ...(where === 'waiting' && !s.current ? { callable: true } : {}), ...(round ? { round } : {}),
    ...(lead ? { lead } : {}), ...(decided ? { decided } : {}), ...(take ? { take: true as const } : {}),
  };
}

/**
 * «Приняты» (spec 2026-10-discharged-card): приняты и ушли за сутки — домой или в другую больницу. Нанятыми врачами — из
 * карт ушедших; вами и теми, кого ждут обратно, — из состояния (они остаются в нём неделю).
 */
export function seenList(db: ContentDb, s: ShiftState): SeenList {
  const from = s.t - KEEP;
  const all: ShiftPatient[] = [];
  for (const x of s.past ?? []) if (x.p.closed && x.t > from) all.push(x.p);
  for (const p of Object.values(s.patients)) if (p.closed && p.status === 'done' && !p.closed.stay && p.closed.at > from) all.push(p);
  all.sort((a, b) => b.closed!.at - a.closed!.at || (a.id < b.id ? 1 : -1));
  const rows = all.slice(0, SEEN).map(p => {
    const c = p.closed!;
    return {
      id: p.id, name: patientName(p.patient), sex: p.patient.sex, age: p.patient.age, triage: p.triage, at: c.at, setting: c.plan.setting,
      diagnosis: named(db.conditions[c.diagnosis]?.name, c.diagnosis), ...(c.by ? { by: staffName(db, s, c.by) } : {}),
    };
  });
  return { rows, total: all.length };
}

/** Подпись «Приняты»: закрыли приём (вы или нанятый врач), кто-то ушёл из состояния, сменились сутки или язык. */
function seenKey(s: ShiftState): string {
  let n = s.summary.seen;
  for (const c of Object.values(s.summary.colleagues ?? {})) n += c.seen;
  return `${s.day}:${n}:${s.past?.length ?? 0}:${s.past?.at(-1)?.p.id ?? ''}:${currentLang}`;
}

/**
 * Подпись того, от чего зависит вид карты: изменилась — карту пересчитать. Ваш приём — и по минутам (часы в шапке); карта
 * для чтения — только по событиям (spec 2026-10-owner-play-2: часы идут, вид стоит ~10 мс): ответ или результат нанятого
 * врача пришёл — его время настало.
 */
function cardKey(s: ShiftState, id: string): string {
  const p = s.patients[id];
  // ушедший — карта такая, каким ушёл (spec 2026-10-discharged-card); сутки — навык врача, который вёл
  if (!p) return pastOf(s, id) ? `past|${s.day}` : 'gone';
  const live = s.current === id && comingAt(s) === undefined && !p.closed;
  return [
    p.step, p.results.length, p.pending.length, p.status, p.closed ? `${p.closed.at}:${p.closed.outcome.kind}` : '', s.current ?? '', s.until ?? '', p.out?.back ?? '', s.meet ?? '',
    JSON.stringify(p.draft), live ? Math.floor(s.t / 60) : p.results.filter(r => r.at <= s.t).length, s.day, s.dayOpen, p.by ?? '', (s.consults ?? []).length,
    // что думает нанятый врач (spec 2026-10-two-ways, F1)
    p.phase?.diagnosis ?? '', p.phase?.confidence ?? '',
    // обход (spec 2026-10-economy): сменили лечение, операция пошла
    p.stay ? `${p.stay.replans}:${p.stay.op?.start ?? ''}:${p.stay.op?.done ?? ''}` : '',
  ].join('|');
}

/**
 * Режим врача в потоке расчёта: что окно уже получило — состояние врача и вид открытой карты; язык и уровень окна.
 * Состояния смены не меняет.
 */
export class DoctorDesk {
  /** чью карту показывать */
  focus: string | null = null;
  level: Difficulty = DEFAULT_LEVEL;
  private sent = '';
  private cardSent = '';
  private seenSent = '';
  private version = 0;

  constructor(private db: ContentDb) {
    useDb(db);
  }

  /** Окно сказало, чью карту показать, на каком языке и уровне; всё отправить заново. */
  view(open: string | null, lang: Lang, level: Difficulty) {
    this.focus = open;
    this.level = LEVELS.includes(level) ? level : DEFAULT_LEVEL;
    if (lang !== currentLang) setLang(lang);
    this.sent = '';
    this.cardSent = '';
    this.seenSent = '';
  }

  /** Новая смена или сохранение — окну всё заново. */
  reset() {
    this.focus = null;
    this.sent = '';
    this.cardSent = '';
    this.seenSent = '';
  }

  /** Что добавить к срезу: состояние врача, вид карты и «Приняты» — если изменились. */
  out(s: ShiftState): { doctor?: DoctorState; card?: CardView | null; seen?: SeenList } {
    const out: { doctor?: DoctorState; card?: CardView | null; seen?: SeenList } = {};
    const state = doctorState(this.db, s);
    const json = JSON.stringify(state);
    if (json !== this.sent) {
      this.sent = json;
      out.doctor = state;
    }
    const key = this.focus === null ? 'none' : `${this.focus}|${this.level}|${currentLang}|${cardKey(s, this.focus)}`;
    if (key !== this.cardSent) {
      this.cardSent = key;
      out.card = this.focus === null ? null : cardView(this.db, s, this.focus, this.level, ++this.version);
    }
    const seen = seenKey(s);
    if (seen !== this.seenSent) {
      this.seenSent = seen;
      out.seen = seenList(this.db, s);
    }
    return out;
  }
}
