// Люди в 3D: как в spikes/map-render (src/crowd.ts) — каждый идёт по A* в случайное помещение и
// стоит там, — плюс поворот по ходу, анимация (стоит / идёт / садится / сидит / встаёт) и стулья:
// часть людей идёт к свободному стулу, садится, сидит 8–28 с и встаёт. Мир: x — столбец клетки,
// z — строка, 1 клетка = 1 м, центр клетки — +0,5. Счёт на CPU; рисование — people.ts.
import { CELL, type Hospital, W } from './hospital';
import { findPath, walkable } from './path';
import { rng } from './rng';

/** Номера анимаций — как CLIPS в people.ts. */
export const IDLE = 0;
export const WALK = 1;
export const SITDOWN = 2;
export const STANDUP = 3;

const S_STAND = 0;
const S_WALK = 1;
const S_SITDOWN = 2;
const S_SIT = 3;
const S_STANDUP = 4;

export interface Seat {
  cell: number;
  /** клетка перед стулом, откуда садятся */
  from: number;
  /** куда смотрит сидящий (радианы, как heading) */
  yaw: number;
}

/** Куда смотрит предмет у стены: от стены в комнату. Радианы вокруг Y; 0 — на +Z. */
export function yawTo(dx: number, dz: number): number {
  return Math.atan2(dx, dz);
}

export function findSeats(h: Hospital): Seat[] {
  const seats: Seat[] = [];
  for (const t of h.things) {
    if (t.kind !== 'chair') continue;
    const c = t.y * W + t.x;
    // садятся с проходимой соседней клетки; предпочтение — напротив стены
    const dirs: [number, number][] = [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ];
    let best: Seat | null = null;
    let bestScore = -1;
    for (const [dx, dy] of dirs) {
      const nx = t.x + dx;
      const ny = t.y + dy;
      const ni = ny * W + nx;
      if (!walkable(h, ni)) continue;
      const bx = t.x - dx;
      const by = t.y - dy;
      const back = h.cells[by * W + bx];
      const score = (back === CELL.wall ? 2 : 0) + (h.blocked[by * W + bx] ? 1 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = { cell: c, from: ni, yaw: yawTo(dx, dy) };
      }
    }
    if (best) seats.push(best);
  }
  return seats;
}

function dist(a: number, b: number): number {
  return Math.abs((a % W) - (b % W)) + Math.abs(((a / W) | 0) - ((b / W) | 0));
}

export class Crowd3D {
  readonly n: number;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly z: Float32Array;
  readonly heading: Float32Array;
  readonly look: Uint8Array;
  readonly clip: Uint8Array;
  readonly clipTime: Float32Array;
  readonly loop: Uint8Array;
  private state: Uint8Array;
  private timer: Float32Array;
  private paths: (Int32Array | null)[];
  private seg: Float32Array;
  private speed: Float32Array;
  private seatOf: Int32Array;
  private wantSeat: Int32Array;
  private rand: () => number;
  private seatTaken: Uint8Array;
  searches = 0;
  searchMs = 0;
  /** длительности анимаций SitDown и StandUp, с (из моделей) */
  sitDur = 1.5;
  standDur = 1.5;
  /** высота сиденья, м: на сколько поднять человека на стуле */
  seatLift = 0;
  /** анимация SitDown сама уводит тело назад на sitBack м — корень ставим на столько впереди стула */
  sitBack = 0;

  constructor(
    private h: Hospital,
    private seats: Seat[],
    n: number,
    looks: { doctors: number[]; staff: number[]; patients: number[] },
    seed = 7,
  ) {
    this.n = n;
    this.rand = rng(seed);
    this.x = new Float32Array(n);
    this.y = new Float32Array(n);
    this.z = new Float32Array(n);
    this.heading = new Float32Array(n);
    this.look = new Uint8Array(n);
    this.clip = new Uint8Array(n);
    this.clipTime = new Float32Array(n);
    this.loop = new Uint8Array(n).fill(1);
    this.state = new Uint8Array(n);
    this.timer = new Float32Array(n);
    this.paths = new Array(n).fill(null);
    this.seg = new Float32Array(n);
    this.speed = new Float32Array(n);
    this.seatOf = new Int32Array(n).fill(-1);
    this.wantSeat = new Int32Array(n).fill(-1);
    this.seatTaken = new Uint8Array(seats.length);
    const pick = (a: number[]) => a[Math.floor(this.rand() * a.length)];
    for (let i = 0; i < n; i++) {
      const c = this.randomSpot();
      this.x[i] = (c % W) + 0.5;
      this.z[i] = ((c / W) | 0) + 0.5;
      // каждый десятый — врач, каждый двадцатый — санитар (рабочая одежда), остальные — пациенты
      this.look[i] = i % 10 === 0 ? pick(looks.doctors) : i % 20 === 1 ? pick(looks.staff) : pick(looks.patients);
      this.speed[i] = 1.0 + this.rand() * 0.5;
      this.heading[i] = this.rand() * Math.PI * 2;
      this.timer[i] = this.rand() * 2;
      this.clipTime[i] = this.rand() * 3;
      // треть людей уже сидит на стульях — в залах ожидания с первого кадра кто-то есть
      if (this.rand() < 0.3) {
        const s = this.freeSeat();
        if (s >= 0) {
          const seat = seats[s];
          this.seatTaken[s] = 1;
          this.seatOf[i] = s;
          this.x[i] = (seat.cell % W) + 0.5;
          this.z[i] = ((seat.cell / W) | 0) + 0.5;
          this.heading[i] = seat.yaw;
          this.pendingSeat.push(i);
          this.state[i] = S_SIT;
          this.clip[i] = SITDOWN;
          this.loop[i] = 0;
          this.clipTime[i] = 100;
          this.timer[i] = 3 + this.rand() * 25;
        }
      }
    }
  }

  private pendingSeat: number[] = [];

  /** Посадка по модели: подъём на сиденье и сдвиг анимации SitDown (после загрузки людей). */
  setSeating(lift: number, back: number) {
    this.seatLift = lift;
    this.sitBack = back;
    for (const i of this.pendingSeat) {
      const seat = this.seats[this.seatOf[i]];
      this.x[i] = (seat.cell % W) + 0.5 + Math.sin(seat.yaw) * back;
      this.z[i] = ((seat.cell / W) | 0) + 0.5 + Math.cos(seat.yaw) * back;
      this.y[i] = lift;
    }
    this.pendingSeat = [];
  }

  private randomSpot(): number {
    for (;;) {
      const room = this.h.spots[Math.floor(this.rand() * this.h.spots.length)];
      if (room.length) return room[Math.floor(this.rand() * room.length)];
    }
  }

  /** Свободный стул: из нескольких случайных — ближайший к клетке near (−1 — любой). */
  private freeSeat(near = -1): number {
    if (!this.seats.length) return -1;
    let best = -1;
    let bestD = Infinity;
    for (let k = 0; k < 6; k++) {
      const s = Math.floor(this.rand() * this.seats.length);
      if (this.seatTaken[s]) continue;
      const d = near < 0 ? 0 : dist(near, this.seats[s].cell);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best;
  }

  /** Куда идти: из трёх случайных клеток — ближайшая (люди чаще ходят недалеко). */
  private nearSpot(from: number): number {
    let best = this.randomSpot();
    let bestD = dist(from, best);
    for (let k = 0; k < 2; k++) {
      const c = this.randomSpot();
      const d = dist(from, c);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }

  private setClip(i: number, c: number, loop: boolean) {
    if (this.clip[i] !== c) this.clipTime[i] = 0;
    this.clip[i] = c;
    this.loop[i] = loop ? 1 : 0;
  }

  private turn(i: number, target: number, dt: number) {
    let d = target - this.heading[i];
    d = Math.atan2(Math.sin(d), Math.cos(d));
    const max = 8 * dt;
    this.heading[i] += Math.max(-max, Math.min(max, d));
  }

  update(dt: number) {
    for (let i = 0; i < this.n; i++) {
      this.clipTime[i] += dt * (this.clip[i] === WALK ? this.speed[i] / 1.25 : 1);
      const st = this.state[i];
      if (st === S_STAND) {
        this.setClip(i, IDLE, true);
        this.timer[i] -= dt;
        if (this.timer[i] > 0) continue;
        // куда дальше: к свободному стулу (35 %) или в случайное помещение
        const from = Math.floor(this.z[i]) * W + Math.floor(this.x[i]);
        let to = -1;
        this.wantSeat[i] = -1;
        if (this.rand() < 0.5) {
          const s = this.freeSeat(from);
          if (s >= 0) {
            this.seatTaken[s] = 1;
            this.wantSeat[i] = s;
            to = this.seats[s].from;
          }
        }
        if (to < 0) to = this.rand() < 0.6 ? this.nearSpot(from) : this.randomSpot();
        const t0 = performance.now();
        const path = findPath(this.h, from, to);
        this.searchMs += performance.now() - t0;
        this.searches++;
        if (!path || path.length < 2) {
          if (this.wantSeat[i] >= 0) this.seatTaken[this.wantSeat[i]] = 0;
          this.wantSeat[i] = -1;
          this.timer[i] = 0.5;
          continue;
        }
        this.paths[i] = path;
        this.seg[i] = 0;
        this.state[i] = S_WALK;
        this.setClip(i, WALK, true);
        continue;
      }
      if (st === S_WALK) {
        const p = this.paths[i]!;
        let s = this.seg[i] + this.speed[i] * dt;
        const last = p.length - 1;
        let done = false;
        if (s >= last) {
          s = last;
          done = true;
        }
        this.seg[i] = s;
        const k = Math.min(last - 1, Math.floor(s));
        const f = s - k;
        const a = p[k];
        const b = p[k + 1];
        const ax = (a % W) + 0.5;
        const az = ((a / W) | 0) + 0.5;
        const bx = (b % W) + 0.5;
        const bz = ((b / W) | 0) + 0.5;
        this.x[i] = ax + (bx - ax) * f;
        this.z[i] = az + (bz - az) * f;
        this.turn(i, Math.atan2(bx - ax, bz - az), dt);
        if (done) {
          this.paths[i] = null;
          const seat = this.wantSeat[i];
          if (seat >= 0) {
            this.seatOf[i] = seat;
            this.state[i] = S_SITDOWN;
            this.timer[i] = 0;
            this.setClip(i, SITDOWN, false);
          } else {
            this.state[i] = S_STAND;
            this.timer[i] = 4 + this.rand() * 12;
          }
        }
        continue;
      }
      const seat = this.seats[this.seatOf[i]];
      const sx = (seat.cell % W) + 0.5 + Math.sin(seat.yaw) * this.sitBack;
      const sz = ((seat.cell / W) | 0) + 0.5 + Math.cos(seat.yaw) * this.sitBack;
      const fx = (seat.from % W) + 0.5;
      const fz = ((seat.from / W) | 0) + 0.5;
      if (st === S_SITDOWN) {
        // повернуться спиной к стулу и сесть, отступая на него
        this.timer[i] += dt;
        this.turn(i, seat.yaw, dt * 2);
        const k = Math.min(1, this.timer[i] / (this.sitDur * 0.7));
        const e = k * k * (3 - 2 * k);
        this.x[i] = fx + (sx - fx) * e;
        this.z[i] = fz + (sz - fz) * e;
        this.y[i] = this.seatLift * e;
        if (this.timer[i] >= this.sitDur) {
          this.state[i] = S_SIT;
          this.timer[i] = 8 + this.rand() * 20;
        }
        continue;
      }
      if (st === S_SIT) {
        this.timer[i] -= dt;
        if (this.timer[i] <= 0) {
          this.state[i] = S_STANDUP;
          this.timer[i] = 0;
          this.setClip(i, STANDUP, false);
        }
        continue;
      }
      if (st === S_STANDUP) {
        this.timer[i] += dt;
        const k = Math.max(0, Math.min(1, (this.timer[i] - this.standDur * 0.3) / (this.standDur * 0.7)));
        const e = k * k * (3 - 2 * k);
        this.x[i] = sx + (fx - sx) * e;
        this.z[i] = sz + (fz - sz) * e;
        this.y[i] = this.seatLift * (1 - e);
        if (this.timer[i] >= this.standDur) {
          this.seatTaken[this.seatOf[i]] = 0;
          this.seatOf[i] = -1;
          this.y[i] = 0;
          this.state[i] = S_STAND;
          this.timer[i] = 0.2 + this.rand();
        }
      }
    }
  }

  /** Сколько сейчас сидят (для подписи). */
  sitting(): number {
    let k = 0;
    for (let i = 0; i < this.n; i++) if (this.state[i] === S_SIT || this.state[i] === S_SITDOWN) k++;
    return k;
  }
}
