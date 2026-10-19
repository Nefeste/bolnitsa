// из spikes/render-3d: src/stats.ts (из spikes/map-render) — изменено: `since`, выборка бенча с отметки по счёту
// замеров (из копии «Фармзавода», ниже).
/** Сводка по выборке времён, мс. */
export interface Summary {
  mean: number;
  p95: number;
  max: number;
}

// из pharma: src/app/stats.ts @ b9696c0 (since)
/**
 * Замеры, пришедшие после отметки: `list` — последние замеры (старые обрезаются), `total` — сколько их пришло всего,
 * `mark` — `total` в начале прогона. Отметка длиной массива ломается, когда массив обрезан; счёт — нет. Обрезанное
 * раньше начала прогона не нужно, а пришедших за прогон больше, чем держит память, — не будет: остаются последние.
 */
export function since(list: readonly number[], total: number, mark: number): number[] {
  const n = Math.min(total - mark, list.length);
  return n > 0 ? list.slice(list.length - n) : [];
}

export function summarize(xs: number[]): Summary {
  if (!xs.length) return { mean: 0, p95: 0, max: 0 };
  const s = [...xs].sort((a, b) => a - b);
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  const p95 = s[Math.min(s.length - 1, Math.floor(s.length * 0.95))];
  const r = (v: number) => Math.round(v * 100) / 100;
  return { mean: r(mean), p95: r(p95), max: r(s[s.length - 1]) };
}

/** Окно замеров: интервал между кадрами, время счёта людей и время рисования на CPU. */
export class Window {
  interval: number[] = [];
  sim: number[] = [];
  draw: number[] = [];
  reset() {
    this.interval = [];
    this.sim = [];
    this.draw = [];
  }
}
