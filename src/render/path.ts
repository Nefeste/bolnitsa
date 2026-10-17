// из spikes/render-3d: src/path.ts (из spikes/map-render) — изменено: сетка любого размера, проходимость — массив
// раскладки (мебель непроходима), старт может быть и на непроходимой клетке (человек встаёт со стула).
// A* по клеткам: 4 соседа, манхэттенская оценка, двоичная куча на массивах. Буферы переиспользуются — поиск не создаёт
// мусора, кроме самого пути.
export class Paths {
  private g: Float32Array;
  private came: Int32Array;
  private seen: Uint32Array;
  private closed: Uint32Array;
  private stamp = 0;
  private heap: Int32Array;
  private heapF: Float32Array;
  private size = 0;
  /** сколько поисков и сколько они заняли, мс — для бенча */
  searches = 0;

  constructor(
    readonly w: number,
    readonly h: number,
    /** 1 — можно пройти */
    readonly walk: Uint8Array,
    /** 1 — пол, коридор или дверь, даже под мебелью: через неё ищется ближайшая свободная клетка, но не через стены */
    readonly open: Uint8Array = walk,
  ) {
    const n = w * h;
    this.g = new Float32Array(n);
    this.came = new Int32Array(n);
    this.seen = new Uint32Array(n);
    this.closed = new Uint32Array(n);
    this.heap = new Int32Array(n * 4);
    this.heapF = new Float32Array(n * 4);
  }

  private push(i: number, f: number) {
    let k = this.size++;
    this.heap[k] = i;
    this.heapF[k] = f;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (this.heapF[p] <= this.heapF[k]) break;
      this.swap(k, p);
      k = p;
    }
  }

  private pop(): number {
    const top = this.heap[0];
    this.size--;
    this.heap[0] = this.heap[this.size];
    this.heapF[0] = this.heapF[this.size];
    let k = 0;
    for (;;) {
      const l = 2 * k + 1;
      const r = l + 1;
      let m = k;
      if (l < this.size && this.heapF[l] < this.heapF[m]) m = l;
      if (r < this.size && this.heapF[r] < this.heapF[m]) m = r;
      if (m === k) break;
      this.swap(k, m);
      k = m;
    }
    return top;
  }

  private swap(a: number, b: number) {
    const i = this.heap[a];
    this.heap[a] = this.heap[b];
    this.heap[b] = i;
    const f = this.heapF[a];
    this.heapF[a] = this.heapF[b];
    this.heapF[b] = f;
  }

  /** Путь клетками (номер y·w + x) от `from` до `to` включительно; нет пути — null. */
  find(from: number, to: number): Int32Array | null {
    const { w, h, walk, g, came, seen, closed } = this;
    this.searches++;
    if (from === to) return Int32Array.of(from);
    const stamp = ++this.stamp;
    this.size = 0;
    const tx = to % w;
    const ty = (to / w) | 0;
    g[from] = 0;
    seen[from] = stamp;
    came[from] = -1;
    this.push(from, 0);
    while (this.size > 0) {
      const cur = this.pop();
      if (cur === to) break;
      if (closed[cur] === stamp) continue;
      closed[cur] = stamp;
      const cx = cur % w;
      const cy = (cur / w) | 0;
      for (let d = 0; d < 4; d++) {
        const nx = d === 0 ? cx + 1 : d === 1 ? cx - 1 : cx;
        const ny = d === 2 ? cy + 1 : d === 3 ? cy - 1 : cy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        if (closed[ni] === stamp || (!walk[ni] && ni !== to)) continue;
        const ng = g[cur] + 1;
        if (seen[ni] === stamp && ng >= g[ni]) continue;
        seen[ni] = stamp;
        g[ni] = ng;
        came[ni] = cur;
        this.push(ni, ng + Math.abs(nx - tx) + Math.abs(ny - ty));
      }
    }
    if (seen[to] !== stamp) return null;
    let n = 0;
    for (let i = to; i !== -1; i = came[i]) n++;
    const out = new Int32Array(n);
    for (let i = to, k = n - 1; i !== -1; i = came[i], k--) out[k] = i;
    return out;
  }

  /** Ближайшая проходимая клетка от `from` (поиск в ширину по полу, не сквозь стены), кроме занятых `taken`; нет — -1. */
  nearest(from: number, taken: ReadonlySet<number> = new Set(), limit = 400): number {
    const { w, h, walk, open } = this;
    const queue = [from];
    const seen = new Set([from]);
    for (let head = 0; head < queue.length && head < limit; head++) {
      const i = queue[head];
      if (walk[i] && !taken.has(i)) return i;
      const x = i % w;
      const y = (i / w) | 0;
      for (const [nx, ny] of [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ]) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const n = ny * w + nx;
        if (seen.has(n) || !open[n]) continue;
        seen.add(n);
        queue.push(n);
      }
    }
    return -1;
  }
}
