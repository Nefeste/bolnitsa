// Поток расчёта (spec docs/specs/2026-10-engine-speed.md, «Поток расчёта»): разбирает сообщения `ToSim` и отвечает
// `FromSim`. Без привязки к виду потока: Web Worker окна Electron, `worker_threads` Node/Bun в тестах — у каждого своя
// тонкая обёртка (`self.onmessage` или `parentPort.on('message')`). Движок однопоточный и детерминированный: тот же
// порядок сообщений даёт то же состояние, что и в основном потоке.
import type { ContentDb } from '../content/types';
import { apply, catchUp, newFlowShift } from '../engine/shift/engine';
import { sliceOf } from '../engine/shift/slice';
import type { Notice, ShiftState } from '../engine/shift/types';
import type { FromSim, ToSim } from './protocol';

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
  const slice = (notices: Notice[]): FromSim => ({ kind: 'slice', slice: sliceOf(s!), notices, lag: owed + (s!.until !== undefined ? s!.until - s!.t : 0) });
  return {
    handle(msg) {
      try {
        switch (msg.kind) {
          case 'start':
            s = newFlowShift(db, { seed: msg.seed, season: msg.season, hospital: msg.hospital, staff: msg.staff, flow: msg.flow });
            owed = 0;
            return slice([]);
          case 'load':
            s = msg.state;
            owed = 0;
            return slice([]);
          case 'command':
            if (!s) return { kind: 'error', message: 'нет смены' };
            // команда сначала доживает прошедшее время — как в игре: состояние то же, что без отставания; извещения этого
            // времени — тоже в ответ: по ним автопауза («Просят посмотреть», spec 2026-10-consults)
            const before = owed > 0 ? apply(db, s, { kind: 'advance', seconds: owed }) : [];
            owed = 0;
            return slice([...before, ...apply(db, s, msg.cmd)]);
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
