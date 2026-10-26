// Живая сцена за экраном начала (spec docs/specs/2026-10-aaa-polish.md, «Экран начала на живой сцене»; аудит, «Первые
// минуты»): готовая городская больница идёт сама за полупрозрачной панелью, камера медленно обходит её по кругу над
// помещениями. Здесь — путь облёта, чистый (его проверяет tools/test/backdrop.test.ts); сцену запускает main.tsx, камеру
// ведёт кадр игры (`Game.onFrame`).

/** Точка земли участка, м. */
export interface Pt {
  x: number;
  z: number;
}

/** Помещение плана: угол и размер, м (клетка — метр). */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Облёт: точки замкнутого пути и длина пути до каждой; длина всего круга, м. */
export interface Tour {
  pts: Pt[];
  cum: number[];
  length: number;
}

/** Скорость облёта по земле, м/с: кадр шириной около 45 м камера проходит за полминуты. */
export const TOUR_SPEED = 1.4;
/** Половина высоты кадра облёта, м: видно помещение и людей в нём, но не одного человека. */
export const TOUR_HALF = 13;
/**
 * Круг облёта — эллипс в этой доле от середины здания до его края: кадр (около 46 × 33 м по земле) с круга захватывает и
 * помещения у стен, и середину, а за край участка выходит только углами.
 */
export const TOUR_INSET = 0.45;

/**
 * Круг облёта над помещениями: эллипс около середины их общего прямоугольника, `n` точек, первая — на западе (там вход,
 * регистратура и приёмное у готовых больниц). Помещений нет — пути нет.
 */
export function ringOf(rooms: readonly Rect[], inset = TOUR_INSET, n = 96): Pt[] {
  if (rooms.length === 0) return [];
  const x0 = Math.min(...rooms.map(r => r.x));
  const x1 = Math.max(...rooms.map(r => r.x + r.w));
  const z0 = Math.min(...rooms.map(r => r.y));
  const z1 = Math.max(...rooms.map(r => r.y + r.h));
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const rx = ((x1 - x0) / 2) * inset;
  const rz = ((z1 - z0) / 2) * inset;
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.PI + (2 * Math.PI * i) / n;
    pts.push({ x: cx + rx * Math.cos(a), z: cz + rz * Math.sin(a) });
  }
  return pts;
}

/** Замкнутый путь через точки по порядку (за последней — снова первая) и длины до каждой. Одна точка — стоянка. */
export function tourOf(points: readonly Pt[]): Tour {
  if (points.length === 0) return { pts: [{ x: 0, z: 0 }], cum: [0], length: 0 };
  const pts = [...points.map(p => ({ ...p })), { ...points[0] }];
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  return { pts, cum, length: cum[cum.length - 1] };
}

/** Точка облёта, пройдя `s` м от начала по кругу (больше длины — следующий круг). */
export function tourAt(t: Tour, s: number): Pt {
  if (t.length <= 0) return { ...t.pts[0] };
  const d = ((s % t.length) + t.length) % t.length;
  // отрезок, на который приходится путь `d`: двоичный поиск по длинам
  let lo = 0;
  let hi = t.cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (t.cum[mid] <= d) lo = mid;
    else hi = mid;
  }
  const span = t.cum[hi] - t.cum[lo];
  const k = span > 0 ? (d - t.cum[lo]) / span : 0;
  return { x: t.pts[lo].x + (t.pts[hi].x - t.pts[lo].x) * k, z: t.pts[lo].z + (t.pts[hi].z - t.pts[lo].z) * k };
}
