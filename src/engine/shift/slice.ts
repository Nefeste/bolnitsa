// Срез смены для отрисовки (spec docs/specs/2026-10-engine-speed.md, «Поток расчёта»): то, что поток расчёта отдаёт потоку
// отрисовки каждый кадр, — кто где и в каком состоянии. Плоские числа и короткие строки: дёшево клонировать
// (structured clone) и легко положить в общий буфер, если понадобится. Чистая функция состояния: ничего не меняет.
import type { ShiftState, Triage } from './types';

/** Где человек сейчас: номер помещения плана (`r12`); нет — в зоне ожидания, в пути или у входа. */
export interface PersonSlice {
  id: string;
  status: 'waiting' | 'inRoom' | 'away' | 'admitted';
  triage: Triage;
  room?: string;
  /** кто ведёт: номер человека из штата; нет — вы или никто */
  by?: string;
}

export interface ShiftSlice {
  t: number;
  day: number;
  dayOpen: boolean;
  /** все, кто сейчас в больнице, — по номеру */
  people: PersonSlice[];
  /** сколько пришло, принято и ушло за день — для полосы сверху */
  arrived: number;
  seen: number;
  left: number;
}

const ROOM_OF_STAFF = new WeakMap<object, Map<string, string>>();

export function sliceOf(s: ShiftState): ShiftSlice {
  // кабинет нанятого врача — по штату; карта одна на штат
  let rooms = s.staff ? ROOM_OF_STAFF.get(s.staff) : undefined;
  if (s.staff && !rooms) {
    rooms = new Map(s.staff.filter(m => m.room !== undefined).map(m => [m.id, m.room!]));
    ROOM_OF_STAFF.set(s.staff, rooms);
  }
  const people: PersonSlice[] = [];
  for (const p of Object.values(s.patients)) {
    if (p.status !== 'waiting' && p.status !== 'inRoom' && p.status !== 'away' && p.status !== 'admitted') continue;
    const out = p.out && p.out.back > s.t ? p.out.room : undefined;
    const room = out ?? p.bay?.room ?? (p.status === 'admitted' ? p.stay?.room : p.status === 'inRoom' && p.by ? rooms?.get(p.by) : undefined);
    people.push({ id: p.id, status: p.status, triage: p.triage, ...(room ? { room } : {}), ...(p.by ? { by: p.by } : {}) });
  }
  people.sort((a, b) => (a.id < b.id ? -1 : 1));
  return { t: s.t, day: s.day, dayOpen: s.dayOpen, people, arrived: s.summary.arrived, seen: s.summary.seen, left: s.summary.left };
}
