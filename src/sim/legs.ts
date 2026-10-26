// Переходы пациентов за сутки (spec docs/specs/2026-10-layers.md, часть 2): из путей движка (`s.journeys` — пути тех, кто в
// больнице, и ушедших за сутки) — откуда куда ходили, сколько раз и сколько шли. Окно прокладывает их по клеткам и красит
// коридоры: слой «Пути пациентов». Движок эти функции не зовёт — поток расчёта шлёт переходы окну, пока слой включён.
import type { Journey } from '../engine/shift/journey';
import type { ShiftState } from '../engine/shift/types';

/** Вход с улицы и выход — главный; `AMBULANCE` — вход для скорой. */
export const STREET = '';
export const AMBULANCE = '*';

/**
 * Переход: из помещения в помещение (номер помещения в больнице; `STREET` и `AMBULANCE` — входы), сколько раз; `walk` —
 * сумма времени в пути тех переходов, у которых оно известно (к обследованию и обратно), `walked` — их число, игровых секунд.
 */
export interface Leg {
  from: string;
  to: string;
  n: number;
  walk: number;
  walked: number;
}

/**
 * Переходы одного пути: пришёл — через регистратуру к первому врачу (скорая — от своего входа); к обследованию и обратно; к
 * другому врачу (направили); домой — к выходу, лёг — на койку. Ушедший, не дождавшись, и не принятый — без перехода к
 * выходу: где он ждал, путь не пишет. В пути к обследованию — от выхода до прихода (лежачего — с часа, когда за ним пришли с
 * каталкой: до того он ждал её), обратно — от конца до возвращения; обследование в том же кабинете — не переход.
 */
export function journeyLegs(j: Journey, mine: string | undefined, reception: string | undefined, add: (from: string, to: string, walk?: number) => void) {
  let doc: string | undefined;
  for (const st of j.steps) {
    if (st.k === 'doctor') {
      // у вас — ваш кабинет; у нанятого — его кабинет
      const room = st.room ?? (st.by === undefined ? mine : undefined);
      if (room === undefined || room === doc) continue;
      if (doc !== undefined) add(doc, room);
      else if (j.kind === 'ambulance') add(AMBULANCE, room);
      else if (reception !== undefined) {
        add(STREET, reception);
        add(reception, room);
      } else add(STREET, room);
      doc = room;
    } else if (st.k === 'exam' && doc !== undefined && st.room !== doc) {
      add(doc, st.room, st.at - (st.gurney?.pick ?? st.t));
      if (st.back > st.end) add(st.room, doc, st.back - st.end);
    }
  }
  if (!j.end || doc === undefined) return;
  if (j.end.how === 'home' || j.end.how === 'away') add(doc, STREET);
  else if (j.end.how === 'stay') {
    if (j.bed) add(j.bed.from, j.bed.to);
    else if (j.end.room !== undefined && j.end.room !== doc) add(doc, j.end.room);
  }
}

/** Переходы всех путей за сутки — по парам помещений, порядок — как встретились; не поток для ПК — пусто. */
export function legsOf(s: ShiftState, mine: string | undefined): Leg[] {
  const of = s.journeys?.of;
  if (!of) return [];
  const reception = s.hospital?.rooms.find(r => r.type === 'room.reception')?.id;
  const legs = new Map<string, Leg>();
  const add = (from: string, to: string, walk?: number) => {
    const key = `${from}>${to}`;
    let l = legs.get(key);
    if (!l) {
      l = { from, to, n: 0, walk: 0, walked: 0 };
      legs.set(key, l);
    }
    l.n++;
    if (walk !== undefined && walk > 0) {
      l.walk += walk;
      l.walked++;
    }
  };
  for (const j of Object.values(of)) journeyLegs(j, mine, reception, add);
  return [...legs.values()];
}
