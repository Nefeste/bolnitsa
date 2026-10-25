// Перевозка на каталке на экране (spec docs/specs/2026-10-orderlies.md, «Что видно»): по часам перевозки из движка — что
// сейчас делает тот, кто везёт, куда он идёт и где больной. Чистые функции без Three.js — их проверяют тесты
// (tools/test/rides.test.ts); людей ведёт население (population.ts).
import type { Ride } from '../engine/shift/types';

/**
 * Что сейчас с перевозкой: идёт за больным (`go`), перекладывает его на каталку (`load`), везёт (`carry`), перекладывает туда
 * (`unload`); к аппарату — ждёт у него (`wait`), перекладывает назад на каталку (`loadBack`), везёт назад (`carryBack`),
 * перекладывает на место (`unloadBack`); возвращается на своё место (`home`). Нет — ещё не вышел или уже вернулся.
 */
export type RidePhase = 'go' | 'load' | 'carry' | 'unload' | 'wait' | 'loadBack' | 'carryBack' | 'unloadBack' | 'home';

export function ridePhase(r: Ride, t: number): RidePhase | undefined {
  if (t < r.go || t >= r.home) return undefined;
  if (t < r.pick) return 'go';
  if (t < r.off) return 'load';
  if (t < r.drop) return 'carry';
  if (t < r.done) return 'unload';
  const e = r.exam;
  if (e && t < e.done) {
    if (t < e.end) return 'wait';
    if (t < e.off) return 'loadBack';
    if (t < e.drop) return 'carryBack';
    return 'unloadBack';
  }
  return 'home';
}

/**
 * Где больной в эту фазу: на каталке; там, куда довезли (`to`: койка, стол, аппарат — у аппарата, только если на нём лежат,
 * иначе ждёт на каталке); там, откуда взяли (`from`, назад с обследования); где говорит срез (`slice`) — за ним ещё идут или
 * его уже довезли. Перекладывают сразу, как пришли: место в движке свободно позже, к концу перекладывания.
 */
export function riderAt(ph: RidePhase, lieAtMachine: boolean): 'gurney' | 'to' | 'from' | 'slice' {
  switch (ph) {
    case 'go':
    case 'home':
      return 'slice';
    case 'load':
    case 'carry':
    case 'loadBack':
    case 'carryBack':
      return 'gurney';
    case 'unload':
      return 'to';
    case 'wait':
      return lieAtMachine ? 'to' : 'gurney';
    case 'unloadBack':
      return 'from';
  }
}

/**
 * Куда идёт тот, кто везёт, или где стоит: у места больного (`from`), у места, куда везут (`to`), на своём месте (`post`), — и
 * к какому часу движка там быть: опоздал (на ×12 кадр длиннее) — догоняет, но не бегом.
 */
export function carrierGoal(r: Ride, ph: RidePhase): { at: 'from' | 'to' | 'post'; due: number } {
  switch (ph) {
    case 'go':
    case 'load':
      return { at: 'from', due: r.pick };
    case 'carry':
    case 'unload':
      return { at: 'to', due: r.drop };
    case 'wait':
    case 'loadBack':
      return { at: 'to', due: r.done };
    case 'carryBack':
    case 'unloadBack':
      return { at: 'from', due: r.exam!.drop };
    case 'home':
      return { at: 'post', due: r.home };
  }
}

/** Перевозка этого человека сейчас: у каждого одна за раз — ранняя из идущих; нет — никого не везёт. */
export function ridesNow(rides: readonly Ride[], t: number): Map<string, { r: Ride; ph: RidePhase }> {
  const now = new Map<string, { r: Ride; ph: RidePhase }>();
  for (const r of rides) {
    const ph = ridePhase(r, t);
    if (!ph) continue;
    const cur = now.get(r.by);
    if (!cur || r.go < cur.r.go) now.set(r.by, { r, ph });
  }
  return now;
}
