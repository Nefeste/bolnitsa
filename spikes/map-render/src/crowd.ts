// Люди: каждый идёт по A* в случайное помещение, стоит там 1–4 с и идёт дальше. Позиции —
// в клетках (центр клетки — x + 0.5). Счёт — на CPU, одинаковый для обеих реализаций.
import { type Hospital, W } from './hospital';
import { findPath } from './path';
import { rng } from './rng';

/** Видов фигурок в атласе: 0 — врач, 1 — медсестра, дальше — пациенты в своей одежде. */
export const LOOKS = 8;

export class Crowd {
  readonly n: number;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly look: Uint8Array;
  private paths: (Int32Array | null)[];
  private seg: Float32Array;
  private speed: Float32Array;
  private dwell: Float32Array;
  private rand: () => number;
  /** поисков пути и их суммарное время с последнего сброса */
  searches = 0;
  searchMs = 0;

  constructor(
    private h: Hospital,
    n: number,
    seed = 7,
  ) {
    this.n = n;
    this.rand = rng(seed);
    this.x = new Float32Array(n);
    this.y = new Float32Array(n);
    this.look = new Uint8Array(n);
    this.paths = new Array(n).fill(null);
    this.seg = new Float32Array(n);
    this.speed = new Float32Array(n);
    this.dwell = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const c = this.randomSpot();
      this.x[i] = c % W;
      this.y[i] = (c / W) | 0;
      this.look[i] = i % 10 === 0 ? 0 : i % 10 === 1 ? 1 : 2 + Math.floor(this.rand() * (LOOKS - 2));
      // 1,5–2,5 клетки в секунду: идущий по больнице человек
      this.speed[i] = 1.5 + this.rand();
      this.dwell[i] = this.rand() * 2;
    }
  }

  private randomSpot(): number {
    for (;;) {
      const room = this.h.spots[Math.floor(this.rand() * this.h.spots.length)];
      if (room.length) return room[Math.floor(this.rand() * room.length)];
    }
  }

  /** Сдвинуть всех на dt секунд. */
  update(dt: number) {
    for (let i = 0; i < this.n; i++) {
      const p = this.paths[i];
      if (!p) {
        this.dwell[i] -= dt;
        if (this.dwell[i] > 0) continue;
        const from = Math.round(this.y[i]) * W + Math.round(this.x[i]);
        const t0 = performance.now();
        const path = findPath(this.h, from, this.randomSpot());
        this.searchMs += performance.now() - t0;
        this.searches++;
        if (!path || path.length < 2) {
          this.dwell[i] = 0.5;
          continue;
        }
        this.paths[i] = path;
        this.seg[i] = 0;
        continue;
      }
      let s = this.seg[i] + this.speed[i] * dt;
      const last = p.length - 1;
      if (s >= last) {
        s = last;
        this.paths[i] = null;
        this.dwell[i] = 1 + this.rand() * 3;
      }
      this.seg[i] = s;
      const k = Math.min(last - 1, Math.floor(s));
      const f = s - k;
      const a = p[k];
      const b = p[k + 1];
      const ax = a % W;
      const ay = (a / W) | 0;
      this.x[i] = ax + ((b % W) - ax) * f;
      this.y[i] = ay + (((b / W) | 0) - ay) * f;
    }
  }
}
