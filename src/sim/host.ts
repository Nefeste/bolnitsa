// Поток расчёта (spec docs/specs/2026-10-engine-speed.md, «Поток расчёта»; docs/specs/2026-10-shell-3d.md): разбирает
// сообщения `ToSim` и отвечает `FromSim`. Без привязки к виду потока: Web Worker окна Electron (src/sim/worker.ts),
// `worker_threads` Node/Bun в тестах — у каждого своя тонкая обёртка. Движок однопоточный и детерминированный: тот же
// порядок сообщений даёт то же состояние, что и в основном потоке. Срез упаковывается (pack.ts).
import type { ContentDb } from '../content/types';
import { apply, catchUp, newFlowShift, prepareFinish } from '../engine/shift/engine';
import { sliceOf } from '../engine/shift/slice';
import type { Command, Notice, ShiftState } from '../engine/shift/types';
import { DoctorDesk, officeOf, takeCommand } from './doctor';
import { Handles, packSlice } from './pack';
import type { DoctorOut, FromSim, ToSim, World } from './protocol';

/** Счёт до `ms` от сейчас; одно событие — всегда (как `budget` в session.ts «Анамнеза»). */
function budget(ms: number): () => boolean {
  const end = performance.now() + ms;
  let first = true;
  return () => {
    if (first) {
      first = false;
      return true;
    }
    return performance.now() <= end;
  };
}

export interface SimHost {
  handle(msg: ToSim): FromSim;
}

export function createSim(db: ContentDb): SimHost {
  let s: ShiftState | undefined;
  /** игровые секунды, которые часы игры уже прошли, а движок ещё не начал */
  let owed = 0;
  const handles = new Handles();
  // номера помещений и штата в срезе — по спискам больницы; меняются вместе с ними
  let shown: { hospital: unknown; staff: unknown } = { hospital: undefined, staff: undefined };
  let rooms = new Map<string, number>();
  let staff = new Map<string, number>();
  // режим врача (spec docs/specs/2026-10-doctor-mode.md): что окно уже получило — состояние врача и вид карты
  const desk = new DoctorDesk(db);
  const slice = (notices: Notice[], refused?: DoctorOut['refused']): FromSim => {
    let world: World | undefined;
    if (s!.hospital !== shown.hospital || s!.staff !== shown.staff) {
      shown = { hospital: s!.hospital, staff: s!.staff };
      rooms = new Map((s!.hospital?.rooms ?? []).map((r, i) => [r.id, i]));
      staff = new Map((s!.staff ?? []).map((m, i) => [m.id, i]));
      if (s!.hospital) world = { hospital: s!.hospital, staff: s!.staff ?? [], ...(s!.works ? { works: { spent: s!.works.spent, undo: s!.works.undo.length } } : {}) };
    }
    const lag = owed + (s!.until !== undefined ? s!.until - s!.t : 0);
    const { buf, names } = packSlice(s!, sliceOf(s!, officeOf(db, s!)), lag, handles, rooms, staff);
    return { kind: 'slice', buf, names, notices, lag, ...(world ? { world } : {}), ...desk.out(s!), ...(refused ? { refused } : {}) };
  };
  const fresh = () => {
    owed = 0;
    handles.reset();
    shown = { hospital: undefined, staff: undefined };
    desk.reset();
  };
  /** Дожить время, которое часы игры уже прошли: команда видит больницу такой, как игрок. */
  const settle = (): Notice[] => {
    const before = owed > 0 ? apply(db, s!, { kind: 'advance', seconds: owed }) : [];
    owed = 0;
    return before;
  };
  /** Команда сначала доживает прошедшее время — как в игре; извещения этого времени — тоже в ответ. */
  const run = (cmd: Command): Notice[] => [...settle(), ...apply(db, s!, cmd)];
  return {
    handle(msg) {
      try {
        switch (msg.kind) {
          case 'start':
            s = newFlowShift(db, { seed: msg.seed, season: msg.season, hospital: msg.hospital, staff: msg.staff, flow: msg.flow, ...(msg.economy ? { economy: msg.economy } : {}) });
            fresh();
            return slice([]);
          case 'load':
            s = msg.state;
            fresh();
            return slice([]);
          case 'command':
            if (!s) return { kind: 'error', message: 'нет смены' };
            // команда сначала доживает прошедшее время — как в игре: состояние то же, что без отставания; извещения этого
            // времени — тоже в ответ: по ним автопауза («Просят посмотреть», spec 2026-10-consults)
            return slice(run(msg.cmd));
          case 'doctor': {
            if (!s) return { kind: 'error', message: 'нет смены' };
            const act = msg.act;
            if (act.kind === 'view') {
              desk.view(act.open, act.lang, act.level);
              return slice([]);
            }
            // сначала — прожитое часами игры: решать, что значит «Взять», и действовать — по больнице на этот час
            const before = settle();
            if (act.kind === 'take') {
              // «Взять случай» — одна команда движка по состоянию больного (doctor.ts, takeCommand)
              const t = takeCommand(db, s, act.id);
              if (t.refused) return slice(before, { act: 'take', id: act.id, why: t.refused });
              const notices = t.cmd ? [...before, ...apply(db, s, t.cmd)] : before;
              if (!t.cmd || s.current === act.id) desk.focus = act.id;
              return slice(notices);
            }
            // действие в карте — только с тем, кто у вас в кабинете: окно и поток могли разойтись на кадр
            if (s.current !== act.id) return slice(before, { act: 'case', id: act.id, why: 'notInOffice' });
            return slice([...before, ...apply(db, s, act.cmd)]);
          }
          case 'tick': {
            if (!s) return { kind: 'error', message: 'нет смены' };
            owed += msg.seconds;
            const more = budget(msg.budgetMs);
            const notices: Notice[] = [];
            if (s.until !== undefined) notices.push(...catchUp(db, s, more));
            if (s.until === undefined && owed > 0) {
              const seconds = owed;
              owed = 0;
              notices.push(...apply(db, s, { kind: 'advance', seconds }, more));
            }
            // карта открыта, часы стоят: разбор вашего приёма — заранее, в свободном бюджете кадра (spec 2026-10-doctor-mode)
            if (s.until === undefined && owed === 0 && desk.focus !== null && desk.focus === s.current && more()) prepareFinish(db, s, more);
            return slice(notices);
          }
          case 'save':
            if (!s) return { kind: 'error', message: 'нет смены' };
            // сохранение — всё прожитое: недожитое время сначала доживается
            if (s.until !== undefined) catchUp(db, s);
            return { kind: 'state', state: s };
        }
      } catch (e) {
        return { kind: 'error', message: e instanceof Error ? e.message : String(e) };
      }
    },
  };
}
