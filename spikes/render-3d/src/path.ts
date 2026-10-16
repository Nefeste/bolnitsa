// из spikes/map-render: src/path.ts
// Простой A* по сетке для пробы: 4 соседа, манхэттенская оценка, двоичная куча на массивах.
// Буферы общие и переиспользуются — поиск не создаёт мусора, кроме самого пути.
import { CELL, H, type Hospital, W } from './hospital';

const N = W * H;
const g = new Float32Array(N);
const came = new Int32Array(N);
const seen = new Uint32Array(N);
const closed = new Uint32Array(N);
let stamp = 0;
const heap = new Int32Array(N * 4);
const heapF = new Float32Array(N * 4);
let size = 0;

function push(i: number, f: number) {
  let k = size++;
  heap[k] = i;
  heapF[k] = f;
  while (k > 0) {
    const p = (k - 1) >> 1;
    if (heapF[p] <= heapF[k]) break;
    swap(k, p);
    k = p;
  }
}

function pop(): number {
  const top = heap[0];
  size--;
  heap[0] = heap[size];
  heapF[0] = heapF[size];
  let k = 0;
  for (;;) {
    const l = 2 * k + 1;
    const r = l + 1;
    let m = k;
    if (l < size && heapF[l] < heapF[m]) m = l;
    if (r < size && heapF[r] < heapF[m]) m = r;
    if (m === k) break;
    swap(k, m);
    k = m;
  }
  return top;
}

function swap(a: number, b: number) {
  const i = heap[a];
  heap[a] = heap[b];
  heap[b] = i;
  const f = heapF[a];
  heapF[a] = heapF[b];
  heapF[b] = f;
}

export function walkable(h: Hospital, i: number): boolean {
  const c = h.cells[i];
  return (c === CELL.floor || c === CELL.door) && !h.blocked[i];
}

/** Путь клетками от from до to включительно; нет пути — null. */
export function findPath(h: Hospital, from: number, to: number): Int32Array | null {
  stamp++;
  size = 0;
  const tx = to % W;
  const ty = (to / W) | 0;
  g[from] = 0;
  seen[from] = stamp;
  came[from] = -1;
  push(from, 0);
  while (size > 0) {
    const cur = pop();
    if (cur === to) break;
    if (closed[cur] === stamp) continue;
    closed[cur] = stamp;
    const cx = cur % W;
    const cy = (cur / W) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = d === 0 ? cx + 1 : d === 1 ? cx - 1 : cx;
      const ny = d === 2 ? cy + 1 : d === 3 ? cy - 1 : cy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const ni = ny * W + nx;
      if (closed[ni] === stamp || !walkable(h, ni)) continue;
      const ng = g[cur] + 1;
      if (seen[ni] === stamp && ng >= g[ni]) continue;
      seen[ni] = stamp;
      g[ni] = ng;
      came[ni] = cur;
      push(ni, ng + Math.abs(nx - tx) + Math.abs(ny - ty));
    }
  }
  if (seen[to] !== stamp) return null;
  let n = 0;
  for (let i = to; i !== -1; i = came[i]) n++;
  const out = new Int32Array(n);
  for (let i = to, k = n - 1; i !== -1; i = came[i], k--) out[k] = i;
  return out;
}
