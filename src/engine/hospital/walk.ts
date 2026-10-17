// из anamnez: src/engine/hospital/walk.ts @ 96503ac, изменено: скорость — параметром, дорога от главного входа (spec 2026-10-walk)
// Дорога по больнице (FR-HOS-4, spec 2026-10-walk-breakdowns, 0.5.9): сколько шагов от двери одного помещения до двери
// другого по полу, коридорам и дверям — поиском в ширину по клеткам сетки (клетка — 1 × 1 м, ADR 0014). Пешком — метр в
// секунду: так ходят пожилые и больные (игровая оценка; здоровые взрослые — быстрее). Один план — одни расстояния, они
// запоминаются.
import type { Plan } from './build';
import { walkable } from './grid';

/** Метров в секунду — пациент идёт на обследование и врач — к лежащему в смотровой. */
export const WALK_SPEED = 1;

const cache = new WeakMap<Plan, Map<string, number | null>>();

/** Шагов (метров) от двери помещения `from` до двери `to`; не дойти или нет двери — undefined; то же помещение — 0. */
export function metersBetween(plan: Plan, from: string, to: string): number | undefined {
  if (from === to) return 0;
  let known = cache.get(plan);
  if (!known) {
    known = new Map();
    cache.set(plan, known);
  }
  const key = from < to ? `${from}|${to}` : `${to}|${from}`;
  const hit = known.get(key);
  if (hit !== undefined) return hit ?? undefined;
  const a = plan.rooms.find(r => r.id === from);
  const b = plan.rooms.find(r => r.id === to);
  const d = a && b && a.door.length > 0 && b.door.length > 0 ? search(plan, a.door, b.door) : undefined;
  known.set(key, d ?? null);
  return d;
}

/**
 * Шагов (метров) от главного входа до двери помещения `to` (spec 2026-10-walk: пришедший идёт к регистратуре); не дойти —
 * undefined.
 */
export function metersFromEntrance(plan: Plan, to: string): number | undefined {
  let known = cache.get(plan);
  if (!known) {
    known = new Map();
    cache.set(plan, known);
  }
  const key = `>${to}`;
  const hit = known.get(key);
  if (hit !== undefined) return hit ?? undefined;
  const b = plan.rooms.find(r => r.id === to);
  const from = plan.entrances?.find(e => e.kind === 'main')?.cells ?? [plan.entrance];
  const d = b && b.door.length > 0 ? search(plan, from, b.door) : undefined;
  known.set(key, d ?? null);
  return d;
}

/** Секунд пешком между дверями со скоростью `speed`; не дойти — 0: такого помещения в работе и не бывает. */
export function walkSeconds(plan: Plan, from: string | undefined, to: string | undefined, speed = WALK_SPEED): number {
  if (!from || !to) return 0;
  return Math.round((metersBetween(plan, from, to) ?? 0) / speed);
}

/** Поиск в ширину от любой клетки двери `starts` до любой клетки двери `goals`. */
function search(plan: Plan, starts: readonly [number, number][], goals: readonly [number, number][]): number | undefined {
  const { w, h } = plan.grid;
  const goal = new Set(goals.map(([x, y]) => y * w + x));
  const dist = new Int32Array(w * h).fill(-1);
  const queue: number[] = [];
  for (const [x, y] of starts) {
    const i = y * w + x;
    if (dist[i] === 0) continue;
    dist[i] = 0;
    queue.push(i);
  }
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    if (goal.has(i)) return dist[i];
    const x = i % w;
    const y = (i - x) / w;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const n = ny * w + nx;
      if (dist[n] >= 0 || !walkable(plan.grid, nx, ny)) continue;
      dist[n] = dist[i] + 1;
      queue.push(n);
    }
  }
  return undefined;
}
