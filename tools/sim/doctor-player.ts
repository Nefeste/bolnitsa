// «Виртуальный врач» смены врача (spec docs/specs/2026-11-doctor-shift.md, часть 1): ведёт ваши приёмы в потоке для ПК
// командами карты, как «Смена» «Анамнеза» (`tools/sim/shift.ts` там), — для пробы порогов итога (`tools/bench/solo.ts --play`)
// и теста (`tools/test/solo.test.ts`). Стратегии:
// - rational — обследования разумного врача; анализы и снимки назначает и отпускает ждать, пока принимает следующего;
// - patient — те же обследования, но ждёт результаты у себя в кабинете;
// - lazy, shotgun — стратегии разбора: мало обследований и всё подряд;
// - one — всем один диагноз (ОРВИ) и домой, без обследований.
import type { ContentDb, Id } from '../../src/content/types';
import { Rng } from '../../src/engine/core/rng';
import { type DoctorResult, runDoctor } from '../../src/engine/med/policy';
import { apply, candidatesOf, current } from '../../src/engine/shift/engine';
import type { Command, ShiftPatient, ShiftState } from '../../src/engine/shift/types';

export type Player = 'rational' | 'patient' | 'lazy' | 'shotgun' | 'one';
export const PLAYERS: readonly Player[] = ['rational', 'patient', 'lazy', 'shotgun', 'one'];

const ONE: Id = 'cond.arvi';

/** Результат не сразу — анализ, снимок, функциональное: разумный отпускает ждать (как `tools/sim/shift.ts` «Анамнеза»). */
function delayed(db: ContentDb, id: Id): boolean {
  const e = db.exams[id];
  return e.kind === 'imaging' || e.kind === 'functional' || (e.time.turnaround ?? 0) + (e.time.report ?? 0) > 0;
}

/** Ведёт ваши приёмы до часа `end`: зовёт первого из очереди, обследует по плану стратегии, ставит диагноз, лечит, отпускает. */
export function playOwn(db: ContentDb, s: ShiftState, player: Player, end: number): void {
  const exams = Object.keys(db.exams).sort();
  const plans = new Map<string, DoctorResult>();
  const step = (cmd: Command) => apply(db, s, cmd);
  // ушёл на обследование — до `out.back` (поле остаётся и после возвращения)
  const busy = (p: ShiftPatient) => p.pending.length > 0 || (p.out !== undefined && p.out.back > s.t);
  const wait = (p: ShiftPatient) => {
    step({ kind: 'waitResults' });
    while (busy(p) && s.t < end) step({ kind: 'advance', seconds: 60 });
  };
  for (let guard = 0; guard < 100_000 && s.t < end; guard++) {
    // идёт к вам или вы к нему — приём, когда встретитесь
    if (s.meet !== undefined) {
      step({ kind: 'advance', seconds: 30 });
      continue;
    }
    const p = current(s);
    if (!p) {
      const id = s.queue.find(x => s.patients[x]?.status === 'waiting' && !s.patients[x].by && (s.patients[x].kind !== 'ambulance' || s.patients[x].sorted));
      step(id ? { kind: 'call', id } : { kind: 'advance', seconds: 60 });
      continue;
    }
    let plan = plans.get(p.id);
    if (!plan) {
      const strategy = player === 'lazy' ? 'lazy' : player === 'shotgun' ? 'shotgun' : 'rational';
      plan = runDoctor(db, p.patient, strategy, Rng.seeded(s.meta.seed).fork(`sim:${p.id}`), { candidates: candidatesOf(db, p.departments ?? s.meta.department), exams });
      plans.set(p.id, plan);
      if (player !== 'one') {
        const todo = plan.exams.filter(e => !p.done.includes(e));
        for (const e of todo.filter(x => !delayed(db, x))) step({ kind: 'exam', exam: e });
        for (const e of todo.filter(x => delayed(db, x))) step({ kind: 'exam', exam: e });
        if (busy(p)) {
          if (player !== 'patient' && s.queue.length > 0) {
            step({ kind: 'sendAway' });
            continue;
          }
          wait(p);
        }
      }
    } else if (busy(p)) wait(p);
    if (s.t >= end) break;
    step({ kind: 'diagnose', id: player === 'one' ? ONE : plan.diagnosis });
    if (player !== 'one') for (const tx of plan.plan.treatments) step({ kind: 'toggleTreatment', id: tx });
    step({ kind: 'setting', setting: player === 'one' ? 'home' : plan.plan.setting });
    step({ kind: 'finish' });
  }
}
