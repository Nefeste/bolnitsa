// Слой «Пути пациентов» (spec docs/specs/2026-10-layers.md, часть 2; геймдизайн §3, «Слои карты»): переходы за сутки из
// потока расчёта (src/sim/legs.ts) — по клеткам плана тем же поиском пути, что ведёт людей, — в «тепло» коридоров, и список
// «куда ходят дальше всего» со временем в пути. Чистые функции без DOM и Three.js — их проверяет
// tools/test/paths-layer.test.ts; строки — из src/i18n.
import { T } from '../i18n';
import type { Layout } from '../render/layout';
import { AMBULANCE, type Leg, STREET } from '../sim/legs';

/** Строк в списке — не больше. */
export const MAX_LEGS = 6;

export const legKey = (l: Pick<Leg, 'from' | 'to'>) => `${l.from}>${l.to}`;

export interface LegRow {
  key: string;
  text: string;
  n: number;
  /** метров за сутки: сколько раз × длина пути клетками (клетка — 1 м); пути нет — 0 */
  m: number;
}

/**
 * Клетки концов переходов: у помещения — снаружи середины его двери, у входа и входа для скорой — середина их проёма (входа
 * для скорой нет — главный). `walk` — проходимые клетки поиска пути; клетка непроходима — ближайшая проходимая (`nearest`;
 * -1 — нет такой).
 */
export function endsOf(layout: Pick<Layout, 'plan' | 'w' | 'h' | 'doors'>, walk: Uint8Array, nearest: (cell: number) => number): Map<string, number> {
  const { plan, w, h } = layout;
  const at = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return -1;
    const c = y * w + x;
    return walk[c] ? c : nearest(c);
  };
  const ends = new Map<string, number>();
  for (const d of layout.doors) {
    const id = d.room >= 0 ? plan.rooms[d.room]?.id : undefined;
    if (id === undefined || ends.has(id) || d.cells.length === 0) continue;
    const [x, y] = d.cells[d.cells.length >> 1];
    ends.set(id, at(x + d.out[0], y + d.out[1]));
  }
  const entrance = (kind: 'main' | 'ambulance') => {
    const e = plan.entrances?.find(x => x.kind === kind) ?? plan.entrances?.find(x => x.kind === 'main');
    const [x, y] = e && e.cells.length ? e.cells[e.cells.length >> 1] : plan.entrance;
    return at(x, y);
  };
  ends.set(STREET, entrance('main'));
  ends.set(AMBULANCE, entrance('ambulance'));
  return ends;
}

/**
 * Тепло: сколько раз за сутки прошли через каждую клетку плана; `max` — больше всех. `door` — клетка у двери помещения или
 * у входа, снаружи (-1 — нет такой); `route` — путь клетками от клетки до клетки. Путь пары помещений ищется раз — для
 * всех переходов, и для списка тоже, — дальше берётся из `routes`; `only` — на полу только этот переход (строку выбрали).
 */
export function heatOf(
  legs: readonly Leg[], size: number, door: (room: string) => number, route: (a: number, b: number) => Int32Array | null, routes: Map<string, Int32Array | null>,
  only?: string,
): { heat: Float32Array; max: number } {
  const heat = new Float32Array(size);
  let max = 0;
  for (const l of legs) {
    const key = legKey(l);
    let cells = routes.get(key);
    if (cells === undefined) {
      const a = door(l.from);
      const b = door(l.to);
      cells = a >= 0 && b >= 0 ? route(a, b) : null;
      routes.set(key, cells);
    }
    if (!cells || (only !== undefined && key !== only)) continue;
    for (const c of cells) {
      heat[c] += l.n;
      if (heat[c] > max) max = heat[c];
    }
  }
  return { heat, max };
}

/** Цвет клетки по теплу 0–1: нет проходов — прозрачно; дальше — голубой, жёлтый, красный, гуще к частым. RGBA 0–255. */
export function heatColor(v: number): [number, number, number, number] {
  if (v <= 0) return [0, 0, 0, 0];
  const x = Math.min(1, v);
  // насыщенные, как у пола слоя очередей: кадр потом переводится в тон, и полупрозрачное бледнеет
  const a: [number, number, number] = x < 0.5 ? [0x2e, 0xc5, 0xe6] : [0xff, 0xc4, 0x00];
  const b: [number, number, number] = x < 0.5 ? [0xff, 0xc4, 0x00] : [0xff, 0x2a, 0x12];
  const k = x < 0.5 ? x / 0.5 : (x - 0.5) / 0.5;
  return [Math.round(a[0] + (b[0] - a[0]) * k), Math.round(a[1] + (b[1] - a[1]) * k), Math.round(a[2] + (b[2] - a[2]) * k), Math.round(110 + 120 * x)];
}

/** Тепло — в RGBA текстуры (клетка — тексел) и сколько клеток окрашено. Корень — чтобы и редкие переходы было видно. */
export function heatPixels(heat: Float32Array, max: number): { rgba: Uint8Array; lit: number } {
  const rgba = new Uint8Array(heat.length * 4);
  let lit = 0;
  if (max <= 0) return { rgba, lit };
  for (let i = 0; i < heat.length; i++) {
    if (heat[i] <= 0) continue;
    const c = heatColor(Math.sqrt(heat[i] / max));
    rgba.set(c, i * 4);
    lit++;
  }
  return { rgba, lit };
}

/** Длина пути перехода, м (шагов по клеткам); пути нет или он ещё не искался — undefined. */
export function lengthOf(routes: ReadonlyMap<string, Int32Array | null>, key: string): number | undefined {
  const cells = routes.get(key);
  return cells ? cells.length - 1 : undefined;
}

/**
 * Строки списка: где за сутки прошли больше всего метров — сколько раз × длина пути, — не больше `MAX_LEGS`; `more` — сколько
 * не вошло. Так наверху и частое, и далёкое: от этого зависит, где ставить кабинеты. Время в пути — среднее у тех, у кого
 * оно известно (к обследованию и обратно). `name` — помещение словами; входы — «Вход», «Вход для скорой», выход — «Выход»;
 * `length` — длина пути перехода, м (`lengthOf`).
 */
export function legRows(
  legs: readonly Leg[], name: (room: string) => string, length: (key: string) => number | undefined,
): { rows: LegRow[]; total: number; meters: number; more: number } {
  const t = T.flow.paths;
  const where = (room: string, to: boolean) => (room === STREET ? (to ? t.exit : t.entrance) : room === AMBULANCE ? t.ambulance : name(room));
  const all = legs.map(l => {
    const key = legKey(l);
    const len = length(key);
    return { l, key, len, m: len === undefined ? 0 : l.n * len };
  });
  all.sort((a, b) => b.m - a.m || b.l.n - a.l.n || a.key.localeCompare(b.key));
  const rows = all.slice(0, MAX_LEGS).map(({ l, key, len, m }) => ({
    key, n: l.n, m, text: t.row(where(l.from, false), where(l.to, true), l.n, len, l.walked > 0 ? t.walk(l.walk / l.walked) : undefined),
  }));
  return {
    rows,
    total: legs.reduce((n, l) => n + l.n, 0),
    meters: all.reduce((m, x) => m + x.m, 0),
    more: Math.max(0, all.length - MAX_LEGS),
  };
}
