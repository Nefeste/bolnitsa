// Срез смены для отрисовки (spec docs/specs/2026-10-engine-speed.md, «Поток расчёта»; docs/specs/2026-10-shell-3d.md,
// «Обмен между потоками»): то, что поток расчёта отдаёт потоку отрисовки каждый кадр, — кто где и что делает. Плоские
// числа и короткие строки: поток упаковывает их в Int32Array (src/sim/pack.ts). Чистая функция состояния: ничего не
// меняет. Часть 3 (spec docs/specs/2026-10-flow-ui.md): с какого момента человек делает то, что делает, и до какого часа
// готов ждать — из пути пациента (journey.ts); у кабинета обследования ждут, только если там очередь.
import { examQueued, phaseOf } from './journey';
import { REGISTRATION, type ShiftPatient, type ShiftState, TRIAGE, type Triage, type VisitKind } from './types';
import { cashNow, dayNet } from './money';
import { waitsAt } from './walking';

/**
 * Что человек делает — то, что движок знает и без отрисовки, по правилам карты «Анамнеза» (`src/state/clinicMap.ts`
 * там): только что пришёл — у регистратора, потом у медсестры доврачебного кабинета; ждёт в зоне ожидания; у врача;
 * на обследовании в другом кабинете; ждёт обследования или результатов; лежит; на операции; привезла скорая.
 */
export type Doing = 'registration' | 'triage' | 'waiting' | 'office' | 'exam' | 'examQueue' | 'results' | 'ward' | 'surgery' | 'ambulance';

/** Где человек сейчас: номер помещения плана (`r12`); нет — в зоне ожидания, в пути или у входа. */
export interface PersonSlice {
  id: string;
  status: 'waiting' | 'inRoom' | 'away' | 'admitted';
  triage: Triage;
  room?: string;
  /** нанятый врач просит вас посмотреть его (spec 2026-10-consults): с какого часа, до какого ждёт ответа, почему */
  asks?: Pick<import('./types').Consult, 'at' | 'until' | 'why' | 'lead'>;
  /** кто ведёт: номер человека из штата; нет — вы или никто */
  by?: string;
  doing: Doing;
  /** койка: лежит в палате (номер койки в помещении) или на месте в смотровой приёмного */
  bed?: number;
  kind: VisitKind;
  /**
   * путь пациента (spec 2026-10-flow-ui): с какого момента идёт то, что он делает сейчас (ждёт, у врача, у кабинета…), и до
   * какого часа ждёт в общей очереди, пока не кончится терпение
   */
  since?: number;
  limit?: number;
  /** поток для ПК (spec 2026-10-walk): идёт туда, где делает то, что делает, — дойдёт к этому часу */
  arrive?: number;
}

export interface ShiftSlice {
  t: number;
  day: number;
  dayOpen: boolean;
  /** все, кто сейчас в больнице, — по номеру */
  people: PersonSlice[];
  /** сколько пришло, принято (вами и нанятыми врачами) и ушло за день — для полосы сверху */
  arrived: number;
  seen: number;
  left: number;
  /** касса, ₽; нет — экономики в этом режиме нет («Смена» движка). С частью 5б (spec 2026-10-economy) — касса сейчас */
  cash?: number;
  /** касса ПК (spec 2026-10-economy): изменение с планёрки 08:00, ₽, и репутация 0–100 */
  today?: number;
  reputation?: number;
  /** ждут врача */
  queue: number;
}

const ROOM_OF_STAFF = new WeakMap<object, Map<string, string>>();

/**
 * Что делает пациент и где; `rooms` — кабинет нанятого врача по номеру человека; `yours` — ваш кабинет (spec
 * 2026-10-doctor-mode): у вашего больного на приёме — он.
 */
function doingOf(s: ShiftState, p: ShiftPatient, rooms: Map<string, string> | undefined, yours?: string): { doing: Doing; room?: string; bed?: number; arrive?: number } {
  const office = p.by ? rooms?.get(p.by) : yours;
  if (p.kind === 'ambulance' && (p.status === 'waiting' || p.status === 'inRoom')) {
    return { doing: 'ambulance', ...(p.bay ? { room: p.bay.room, bed: p.bay.bed } : {}) };
  }
  if (p.status === 'inRoom') {
    // ушёл от врача на обследование: в том кабинете — до `until`, потом идёт назад; у кабинета очередь — ждёт её
    // (spec 2026-10-flow-ui), а не стоит у аппарата вместе с тем, кого обследуют
    if (p.out && p.out.until > s.t) return { doing: examQueued(s, p, p.out.until) ? 'examQueue' : 'exam', room: p.out.room };
    // поток для ПК (spec 2026-10-walk): позвали — идёт, приём начнётся, когда дойдёт
    const going = p.walk && p.walk.to === office && p.walk.at > s.t ? { arrive: p.walk.at } : {};
    return { doing: 'office', ...(office ? { room: office } : {}), ...going };
  }
  if (p.status === 'waiting' && p.regAt !== undefined) {
    // поток для ПК (spec 2026-10-walk): от входа — к регистратуре, к медсестре, в свою зону ожидания; следующий к врачу —
    // у двери его кабинета
    if (p.step === 0 && s.t < p.regAt + REGISTRATION) return { doing: 'registration', ...(p.regAt > s.t ? { arrive: p.regAt } : {}) };
    if (p.step === 0 && p.triAt !== undefined && s.t < p.triAt + TRIAGE) return { doing: 'triage', ...(p.triAt > s.t ? { arrive: p.triAt } : {}) };
    const w = waitsAt(p);
    return { doing: 'waiting', ...(w.at ? { room: w.at } : {}), ...(w.t !== undefined && w.t > s.t ? { arrive: w.t } : {}) };
  }
  if (p.status === 'waiting') {
    // только что пришедший — у регистратора и у медсестры; вернувшийся с обследований — сразу в зал
    const since = s.t - p.arriveT;
    if (p.step === 0 && since < REGISTRATION) return { doing: 'registration' };
    if (p.step === 0 && p.triaged !== false && since < REGISTRATION + TRIAGE) return { doing: 'triage' };
    return { doing: 'waiting' };
  }
  if (p.status === 'away') {
    // во время процедуры — в её кабинете; до неё — ждёт её (идёт туда сразу, если очереди нет); после — ждёт результатов
    let next: { room: string; start: number; end: number } | undefined;
    for (const x of p.pending) {
      if (!x.room || x.start === undefined) continue;
      const end = x.end ?? x.readyAt;
      if (s.t >= x.start && s.t < end) return { doing: 'exam', room: x.room };
      if (x.start > s.t && (!next || x.start < next.start)) next = { room: x.room, start: x.start, end };
    }
    if (!next) return { doing: 'results' };
    return { doing: examQueued(s, p, next.end) === false ? 'exam' : 'examQueue', room: next.room };
  }
  // лежит; идёт операция — на операционном столе
  const op = p.stay?.op;
  if (op && !op.done && op.start !== undefined && op.start <= s.t && op.room) return { doing: 'surgery', room: op.room };
  return { doing: 'ward', ...(p.stay ? { room: p.stay.room, bed: p.stay.bed } : {}) };
}

/** `office` — ваш кабинет (номер помещения плана, spec 2026-10-doctor-mode): туда идёт ваш больной на приёме. */
export function sliceOf(s: ShiftState, office?: string): ShiftSlice {
  // кабинет нанятого врача — по штату; карта одна на штат
  let rooms = s.staff ? ROOM_OF_STAFF.get(s.staff) : undefined;
  if (s.staff && !rooms) {
    rooms = new Map(s.staff.filter(m => m.room !== undefined).map(m => [m.id, m.room!]));
    ROOM_OF_STAFF.set(s.staff, rooms);
  }
  const people: PersonSlice[] = [];
  for (const p of Object.values(s.patients)) {
    if (p.status !== 'waiting' && p.status !== 'inRoom' && p.status !== 'away' && p.status !== 'admitted') continue;
    const d = doingOf(s, p, rooms, office);
    const ph = phaseOf(s, p, d.doing);
    people.push({
      id: p.id, status: p.status, triage: p.triage, ...(d.room ? { room: d.room } : {}), ...(p.by ? { by: p.by } : {}), doing: d.doing,
      ...(d.bed !== undefined ? { bed: d.bed } : {}), kind: p.kind, since: ph.since, ...(ph.limit !== undefined ? { limit: ph.limit } : {}),
      ...(d.arrive !== undefined ? { arrive: d.arrive } : {}),
    });
  }
  // «Просят посмотреть» (spec 2026-10-consults): у кого нанятый врач ждёт вашего ответа
  for (const c of s.consults ?? []) {
    const x = people.find(q => q.id === c.id);
    if (x) x.asks = { at: c.at, until: c.until, why: [...c.why], lead: c.lead.map(b => ({ ...b })) };
  }
  people.sort((a, b) => (a.id < b.id ? -1 : 1));
  // приняты — и вами, и нанятыми врачами: в итогах дня их приёмы — в своих строках (`colleagues`)
  let seen = s.summary.seen;
  for (const c of Object.values(s.summary.colleagues ?? {})) seen += c.seen;
  return {
    t: s.t, day: s.day, dayOpen: s.dayOpen, people, arrived: s.summary.arrived, seen, left: s.summary.left,
    ...(s.economy ? { cash: cashNow(s)!, today: dayNet(s), reputation: s.economy.reputation ?? 50 } : {}), queue: s.queue.length,
  };
}
