// Поток расчёта (spec docs/specs/2026-10-engine-speed.md, «Поток расчёта»; docs/specs/2026-10-shell-3d.md): разбирает
// сообщения `ToSim` и отвечает `FromSim`. Без привязки к виду потока: Web Worker окна Electron (src/sim/worker.ts),
// `worker_threads` Node/Bun в тестах — у каждого своя тонкая обёртка. Движок однопоточный и детерминированный: тот же
// порядок сообщений даёт то же состояние, что и в основном потоке. Срез упаковывается (pack.ts). Путь пациента, которого
// показывает окно (`watch`, spec docs/specs/2026-10-flow-ui.md), — в срезе, когда он изменился.
import type { ContentDb } from '../content/types';
import { apply, catchUp, newFlowShift } from '../engine/shift/engine';
import { sliceOf } from '../engine/shift/slice';
import type { Notice, ShiftState } from '../engine/shift/types';
import { Handles, packSlice } from './pack';
import type { FromSim, PathView, ToSim, World } from './protocol';

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
  let shown: { hospital: unknown; staff: unknown; broken?: unknown } = { hospital: undefined, staff: undefined };
  /** чей путь показывает окно и каким он был отправлен */
  let watch: string | null = null;
  let sentPath: string | undefined;
  let rooms = new Map<string, number>();
  let staff = new Map<string, number>();
  const slice = (notices: Notice[]): FromSim => {
    let world: World | undefined;
    if (s!.hospital !== shown.hospital || s!.staff !== shown.staff || s!.broken !== shown.broken) {
      shown = { hospital: s!.hospital, staff: s!.staff, broken: s!.broken };
      rooms = new Map((s!.hospital?.rooms ?? []).map((r, i) => [r.id, i]));
      staff = new Map((s!.staff ?? []).map((m, i) => [m.id, i]));
      if (s!.hospital) world = { hospital: s!.hospital, staff: s!.staff ?? [], ...(s!.works ? { works: { spent: s!.works.spent, undo: s!.works.undo.length } } : {}), ...(s!.broken?.length ? { broken: [...s!.broken] } : {}) };
    }
    // путь, который показывает окно: шагов стало больше, путь кончился, его убрали — заново
    let path: PathView | undefined;
    if (watch !== null) {
      const j = s!.journeys?.of[watch] ?? null;
      const sig = j ? `${j.steps.length}:${j.end?.t ?? ''}:${j.steps[j.steps.length - 1]?.t ?? ''}` : '';
      if (sig !== sentPath) {
        sentPath = sig;
        path = { id: watch, journey: j ? structuredClone(j) : null };
      }
    }
    const lag = owed + (s!.until !== undefined ? s!.until - s!.t : 0);
    const { buf, names } = packSlice(s!, sliceOf(s!), lag, handles, rooms, staff);
    return { kind: 'slice', buf, names, notices, lag, ...(world ? { world } : {}), ...(path ? { path } : {}) };
  };
  const fresh = () => {
    owed = 0;
    handles.reset();
    shown = { hospital: undefined, staff: undefined };
    sentPath = undefined;
  };
  return {
    handle(msg) {
      try {
        switch (msg.kind) {
          case 'start':
            s = newFlowShift(db, { seed: msg.seed, season: msg.season, hospital: msg.hospital, staff: msg.staff, flow: msg.flow });
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
          case 'watch':
            watch = msg.id;
            sentPath = undefined;
            if (!s) return { kind: 'error', message: 'нет смены' };
            return slice([]);
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
