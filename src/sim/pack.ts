// Упакованный срез (spec docs/specs/2026-10-engine-speed.md, часть 5; docs/specs/2026-10-shell-3d.md, «Обмен между
// потоками»): Int32Array, который поток расчёта передаёт потоку отрисовки без копии (`transferList`). Строки — номера
// пациентов, пол, возраст, жалоба — уходят отдельной таблицей и только у новых: у каждого человека в больнице свой номер
// в срезе (`handle`), он не меняется, пока человек в больнице. Формат 2 (spec docs/specs/2026-10-flow-ui.md): у человека —
// с какого момента он делает то, что делает, до какого часа ждёт в общей очереди и просьба нанятого врача о нём. Имя —
// в строке, его даёт поток расчёта (spec docs/specs/2026-10-owner-play.md): окно не знает словарей имён. Формат 4 (spec
// docs/specs/2026-10-door-benches.md): скамья, на которой он ждёт у двери кабинета. Формат 5 (spec
// docs/specs/2026-10-two-ways.md, F3): решение его врача ждёт главврача — с какого часа и до какого.
import type { Patient } from '../engine/med/types';
import type { Doing, PersonSlice, ShiftSlice } from '../engine/shift/slice';
import type { ShiftState, Triage, VisitKind } from '../engine/shift/types';

/** Заголовок: чисел (с частью 5б — касса за сутки и репутация, spec docs/specs/2026-10-economy.md). */
export const HEADER = 14;
/** На человека: чисел (формат 3, spec docs/specs/2026-10-walk.md: когда дойдёт; формат 4 — скамья у двери; 5 — утверждение). */
export const STRIDE = 16;
export const FORMAT = 5;

/** Поля заголовка. */
export const H = { format: 0, t: 1, day: 2, dayOpen: 3, count: 4, arrived: 5, seen: 6, left: 7, cash: 8, lag: 9, queue: 10, reserved: 11, today: 12, reputation: 13 } as const;
/** Поля человека. */
export const P = { handle: 0, status: 1, triage: 2, room: 3, by: 4, doing: 5, bed: 6, flags: 7, since: 8, limit: 9, askAt: 10, askUntil: 11, arrive: 12, bench: 13, approveAt: 14, approveUntil: 15 } as const;
/** Нет времени: срока терпения, просьбы. */
export const NO_TIME = -1;
/** Кассы нет — в этом режиме движка нет экономики. */
export const NO_CASH = -2147483648;

export const STATUSES: PersonSlice['status'][] = ['waiting', 'inRoom', 'away', 'admitted'];
export const TRIAGES: Triage[] = ['green', 'yellow', 'red'];
export const DOINGS: Doing[] = ['registration', 'triage', 'waiting', 'office', 'exam', 'examQueue', 'results', 'ward', 'surgery', 'ambulance', 'gurney'];
export const KINDS: VisitKind[] = ['appointment', 'walkIn', 'return', 'ambulance'];

/** Новый человек в срезе: строки — один раз. */
export interface NameRow {
  /** номер в срезе */
  h: number;
  /** номер пациента в движке */
  id: string;
  sex: 'm' | 'f';
  age: number;
  /** главная жалоба — признак базы; нет — молчит (привезла скорая без сознания) */
  complaint?: string;
  /** зерно пациента — облик на экране */
  seed: number;
  /** имя, как в карте пациента; нет — тесты без имён */
  name?: string;
  /** записан к специалисту — его должность (spec docs/specs/2026-10-specialists.md) */
  to?: string;
}

/** Номера в срезе: свой у каждого, пока он в больнице. */
export class Handles {
  private byId = new Map<string, number>();
  private next = 1;

  /** Номер человека; `fresh` — он новый. */
  of(id: string): { h: number; fresh: boolean } {
    const h = this.byId.get(id);
    if (h !== undefined) return { h, fresh: false };
    const n = this.next++;
    this.byId.set(id, n);
    return { h: n, fresh: true };
  }

  /** Забыть ушедших: тех, кого нет среди `present`. */
  keep(present: Set<string>) {
    for (const id of this.byId.keys()) if (!present.has(id)) this.byId.delete(id);
  }

  reset() {
    this.byId.clear();
    this.next = 1;
  }
}

/**
 * Упаковать срез. `rooms` и `staff` — номера помещений и людей штата в списках больницы (сообщение `world`); `nameOf` —
 * имя пациента для строки нового. Отдаёт массив и строки новых.
 */
export function packSlice(
  s: ShiftState,
  slice: ShiftSlice,
  lag: number,
  handles: Handles,
  rooms: Map<string, number>,
  staff: Map<string, number>,
  nameOf?: (p: Patient) => string,
): { buf: Int32Array; names: NameRow[] } {
  const n = slice.people.length;
  const buf = new Int32Array(HEADER + n * STRIDE);
  buf[H.format] = FORMAT;
  buf[H.t] = slice.t;
  buf[H.day] = slice.day;
  buf[H.dayOpen] = slice.dayOpen ? 1 : 0;
  buf[H.count] = n;
  buf[H.arrived] = slice.arrived;
  buf[H.seen] = slice.seen;
  buf[H.left] = slice.left;
  buf[H.cash] = slice.cash ?? NO_CASH;
  buf[H.lag] = Math.min(2147483647, Math.round(lag));
  buf[H.queue] = slice.queue;
  // касса ПК (spec docs/specs/2026-10-economy.md): изменение с 08:00 и репутация; кассы нет — NO_CASH
  buf[H.today] = slice.today ?? NO_CASH;
  buf[H.reputation] = slice.reputation ?? NO_CASH;
  const names: NameRow[] = [];
  const present = new Set<string>();
  slice.people.forEach((p, i) => {
    present.add(p.id);
    const { h, fresh } = handles.of(p.id);
    if (fresh) {
      const pt = s.patients[p.id]?.patient;
      const to = s.patients[p.id]?.to;
      const role = to !== undefined ? s.staff?.find(m => m.id === to)?.role : undefined;
      names.push({
        h, id: p.id, sex: pt?.sex ?? 'm', age: pt?.age ?? 40, ...(pt?.complaints[0] ? { complaint: pt.complaints[0] } : {}), seed: pt?.seed ?? 0,
        ...(pt && nameOf ? { name: nameOf(pt) } : {}), ...(role ? { to: role } : {}),
      });
    }
    const o = HEADER + i * STRIDE;
    buf[o + P.handle] = h;
    buf[o + P.status] = STATUSES.indexOf(p.status);
    buf[o + P.triage] = TRIAGES.indexOf(p.triage);
    buf[o + P.room] = p.room !== undefined ? (rooms.get(p.room) ?? -1) : -1;
    buf[o + P.by] = p.by !== undefined ? (staff.get(p.by) ?? -1) : -1;
    buf[o + P.doing] = DOINGS.indexOf(p.doing);
    buf[o + P.bed] = p.bed ?? -1;
    buf[o + P.flags] = KINDS.indexOf(p.kind);
    // часть 3 (spec docs/specs/2026-10-flow-ui.md): время текущего занятия, терпение, просьба врача
    buf[o + P.since] = p.since ?? slice.t;
    buf[o + P.limit] = p.limit ?? NO_TIME;
    buf[o + P.askAt] = p.asks ? p.asks.at : NO_TIME;
    buf[o + P.askUntil] = p.asks ? p.asks.until : NO_TIME;
    // поток для ПК (spec 2026-10-walk): идёт — к какому часу дойдёт
    buf[o + P.arrive] = p.arrive ?? NO_TIME;
    // у двери на скамье (spec docs/specs/2026-10-door-benches.md): её клетка; нет — -1
    buf[o + P.bench] = p.bench ?? -1;
    // решение его врача ждёт главврача (spec docs/specs/2026-10-two-ways.md, F3)
    buf[o + P.approveAt] = p.approve ? p.approve.at : NO_TIME;
    buf[o + P.approveUntil] = p.approve ? p.approve.until : NO_TIME;
  });
  handles.keep(present);
  return { buf, names };
}

/** Человек из упакованного среза — для панелей и тестов (кадр отрисовки читает числа прямо). */
export interface PersonView {
  h: number;
  status: PersonSlice['status'];
  triage: Triage;
  /** номер помещения в списке больницы; -1 — нет */
  room: number;
  /** номер человека штата; -1 — вы или никто */
  by: number;
  doing: Doing;
  bed: number;
  kind: VisitKind;
  /** с какого момента делает то, что делает (игровые секунды) */
  since: number;
  /** до какого часа ждёт в общей очереди; NO_TIME — не уходит или не в ней */
  limit: number;
  /** нанятый врач просит вас посмотреть его: с какого часа и до какого ждёт ответа */
  ask?: { at: number; until: number };
  /** идёт туда, где делает то, что делает, — дойдёт к этому часу (spec 2026-10-walk) */
  arrive?: number;
  /** ждёт у двери кабинета на скамье: её клетка (spec docs/specs/2026-10-door-benches.md) */
  bench?: number;
  /** решение его врача ждёт главврача: с какого часа и до какого (spec docs/specs/2026-10-two-ways.md, F3) */
  approve?: { at: number; until: number };
}

export function personAt(buf: Int32Array, i: number): PersonView {
  const o = HEADER + i * STRIDE;
  return {
    h: buf[o + P.handle],
    status: STATUSES[buf[o + P.status]],
    triage: TRIAGES[buf[o + P.triage]],
    room: buf[o + P.room],
    by: buf[o + P.by],
    doing: DOINGS[buf[o + P.doing]],
    bed: buf[o + P.bed],
    kind: KINDS[buf[o + P.flags]],
    since: buf[o + P.since],
    limit: buf[o + P.limit],
    ...(buf[o + P.askUntil] !== NO_TIME ? { ask: { at: buf[o + P.askAt], until: buf[o + P.askUntil] } } : {}),
    ...(buf[o + P.arrive] !== NO_TIME ? { arrive: buf[o + P.arrive] } : {}),
    ...(buf[o + P.bench] >= 0 ? { bench: buf[o + P.bench] } : {}),
    ...(buf[o + P.approveUntil] !== NO_TIME ? { approve: { at: buf[o + P.approveAt], until: buf[o + P.approveUntil] } } : {}),
  };
}

export function peopleOf(buf: Int32Array): PersonView[] {
  return Array.from({ length: buf[H.count] }, (_, i) => personAt(buf, i));
}
