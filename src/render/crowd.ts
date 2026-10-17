// Люди на отрисовке (spec docs/specs/2026-10-shell-3d.md, «Где человек и что он делает»): срез потока говорит, где
// человек должен быть, — здесь он туда идёт, садится, ложится, встаёт. Чистая математика без Three.js: её проверяют
// тесты (tools/test/crowd.test.ts); рисует people.ts.
//
// Как карта «Анамнеза» (src/render/map/walkers.ts там): места — остановки маршрута: у регистратуры и медсестры человек
// хотя бы немного стоит, место ожидания, до которого он не дошёл, заменяется следующим; в кабинет врача зовут — туда идут
// сразу. Новый путь начинается там, где человек сейчас.
//
// Ходьба в движке (spec docs/specs/2026-10-walk.md): движок считает дорогу с той же скоростью, с какой люди идут здесь
// (`WALK_SPEED_PC`), и говорит, к какому часу человек дойдёт (`due`). Человек идёт так, чтобы дойти к этому часу: быстрее
// или медленнее обычного шага, но не бежит (`PACE`). Скорость игры ускоряет всё, как перемотка: при ×3 люди идут, садятся
// и встают втрое быстрее.
//
// Расталкивание — только здесь, движок не трогается: идущие держатся правой стороны прохода и раздвигаются, если ближе
// SPACE; встречные в двери пропускают друг друга.
import { WALK_SPEED_PC } from '../engine/shift/walking';
import type { Look } from './bake';
import type { Layout } from './layout';
import type { Paths } from './path';
import type { Spot } from './place';

/** Номера анимаций — как CLIP_NAMES в bake.ts. */
export const IDLE = 0;
export const WALK = 1;
export const RUN = 2;
export const SITDOWN = 3;
export const STANDUP = 4;

/** Шаг к сроку движка — не медленнее и не быстрее этих долей обычного (spec 2026-10-walk). */
export const PACE: readonly [number, number] = [0.7, 1.5];
/** Быстрее (м/с при ×1) — бег вместо шага: при `PACE` люди не бегают. */
export const RUN_FROM = 2.5;
/** Ближе этого идущие расходятся, м. */
export const SPACE = 0.55;
/** Держаться правой стороны прохода, м от середины клетки. */
export const KEEP_RIGHT = 0.2;
/** Сколько секунд ложатся и встают с постели. */
const LIE_TIME = 0.7;

type State = 'idle' | 'walk' | 'sitDown' | 'sit' | 'standUp' | 'lieDown' | 'lie' | 'getUp' | 'gone';

export interface Walker {
  key: string;
  look: number;
  staff: boolean;
  /** корень (ступни) стоя; лёжа — середина постели */
  x: number;
  y: number;
  z: number;
  heading: number;
  /** 0 — стоит, 1 — лежит */
  lie: number;
  /** сдвиг вправо от середины прохода, м */
  lat: number;
  state: State;
  /** точки пути по полу (x, z подряд), пройдено от начала до каждой, м, и сколько пройдено (номер точки с долей) */
  pts: Float32Array | null;
  cum: Float32Array | null;
  seg: number;
  /** к какому часу игры дойти до последней цели (из среза, spec 2026-10-walk); NaN — когда дойдёт */
  due: number;
  /** место, где стоит, сидит или лежит сейчас; цели впереди */
  at: Spot | undefined;
  goals: Spot[];
  /** сколько ещё стоять у места `act` */
  dwell: number;
  /** таймер перехода (сесть, встать, лечь) */
  t: number;
  /** откуда начался переход */
  fx: number;
  fz: number;
  fy: number;
  clip: number;
  clipTime: number;
  loop: boolean;
  /** уходит: дошёл до выхода — исчезает */
  leaving: boolean;
  /** сколько секунд ждёт встречного в двери */
  yield: number;
  /** скорость в последнем кадре, м/с — для бенча и проверок */
  v: number;
}

const ease = (k: number) => k * k * (3 - 2 * k);

function turnTo(a: number, target: number, max: number): number {
  let d = target - a;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return a + Math.max(-max, Math.min(max, d));
}

/** Точка на улице за входом (3 м) и клетка входа: главный или для скорой (нет его — главный). */
function exitOf(l: Layout, kind: 'main' | 'ambulance'): { x: number; z: number; cell: number } {
  const e = l.plan.entrances?.find(x => x.kind === kind) ?? l.plan.entrances?.find(x => x.kind === 'main');
  const cells = e?.cells ?? [l.plan.entrance];
  const out = e?.out ?? l.doors.find(d => d.room === -1)!.out;
  const cx = cells.reduce((n, c) => n + c[0] + 0.5, 0) / cells.length;
  const cz = cells.reduce((n, c) => n + c[1] + 0.5, 0) / cells.length;
  return { x: cx + out[0] * 3, z: cz + out[1] * 3, cell: cells[0][1] * l.w + cells[0][0] };
}

export class Crowd {
  readonly walkers = new Map<string, Walker>();
  /** скорость игры: 1, 3, 12 (0 — пауза: люди стоят) */
  speed = 1;
  /** игровых секунд в настоящую секунду сейчас (0 — пауза) и часы игры из последнего среза — для `due` */
  rate = 0;
  t = 0;
  /** длительности анимаций SitDown и StandUp по виду, с */
  private sitDur: number[];
  private standDur: number[];
  /** куда выйти из больницы: точка на улице за главным входом */
  exit: { x: number; z: number; cell: number };
  /** откуда входит привезённый скорой: за входом для скорой (у больницы ПК; иначе — главный) */
  ambulance: { x: number; z: number; cell: number };

  constructor(
    private l: Layout,
    private paths: Paths,
    private looks: Look[],
  ) {
    this.sitDur = looks.map(k => k.clips.SitDown.duration);
    this.standDur = looks.map(k => k.clips.StandUp.duration);
    this.exit = exitOf(l, 'main');
    this.ambulance = exitOf(l, 'ambulance');
  }

  /**
   * Новая раскладка после стройки (spec docs/specs/2026-10-build.md, «Отрисовка»): люди остаются где были; кто шёл —
   * идёт заново по новым клеткам; места раздаст население (population.ts, `relayout`).
   */
  relayout(l: Layout, paths: Paths) {
    this.l = l;
    this.paths = paths;
    this.exit = exitOf(l, 'main');
    this.ambulance = exitOf(l, 'ambulance');
    for (const w of this.walkers.values()) if (w.state === 'walk') this.startWalk(w, w.goals[0] ?? null);
  }

  /** Новый человек: персонал — сразу на месте, пациент — входит с улицы (привезённый скорой — у входа для скорой). */
  add(key: string, look: number, spot: Spot, staff: boolean, ambulance = false, due = NaN): Walker {
    const from = ambulance ? this.ambulance : this.exit;
    const w: Walker = {
      key, look, staff, x: from.x, y: 0, z: from.z, heading: 0, lie: 0, lat: KEEP_RIGHT, state: 'idle', pts: null, cum: null, seg: 0, due,
      at: undefined, goals: [], dwell: 0, t: 0, fx: 0, fz: 0, fy: 0, clip: IDLE, clipTime: (key.length * 0.37) % 3, loop: true, leaving: false,
      yield: 0, v: 0,
    };
    this.walkers.set(key, w);
    if (staff) this.settle(w, spot);
    else {
      w.goals = [spot];
      this.startWalk(w, spot);
    }
    return w;
  }

  /** Сразу на месте, без пути (персонал в начале смены, снимки бенча). */
  settle(w: Walker, spot: Spot) {
    w.at = spot;
    w.goals = [];
    w.pts = null;
    w.cum = null;
    const look = this.looks[w.look];
    if (spot.pose === 'sit') {
      const r = this.seatRoot(look, spot);
      w.x = r.x;
      w.z = r.z;
      w.y = r.y;
      w.heading = spot.yaw;
      w.state = 'sit';
      this.setClip(w, SITDOWN, false);
      w.clipTime = 1e3;
      w.lie = 0;
    } else if (spot.pose === 'lie') {
      w.x = spot.x;
      w.z = spot.z;
      w.y = spot.y;
      w.heading = spot.yaw;
      w.lie = 1;
      w.state = 'lie';
      this.setClip(w, IDLE, true);
    } else {
      w.x = spot.x;
      w.z = spot.z;
      w.y = 0;
      if (!Number.isNaN(spot.yaw)) w.heading = spot.yaw;
      w.state = 'idle';
      w.lie = 0;
      this.setClip(w, IDLE, true);
    }
  }

  /**
   * Новое место из среза. `direct` — идти сразу, без остановок (позвали к врачу). Место, до которого не дошёл, — если
   * это ожидание — заменяется; место, где с ним что-то делают, он проходит. `due` — к какому часу игры туда дойти.
   */
  retarget(w: Walker, spot: Spot, direct = false, due = NaN) {
    const last = w.goals.length ? w.goals[w.goals.length - 1] : w.at;
    w.due = due;
    if (last?.key === spot.key) return;
    // остановки, где с ним что-то делают, остаются — но не больше двух: на ×12 смена уходит вперёд
    let keep = direct ? [] : w.goals.filter(g => g.kind === 'act').slice(-2);
    if (keep.length && keep[keep.length - 1].key === spot.key) keep = keep.slice(0, -1);
    w.goals = [...keep, spot];
    if (direct && w.at?.kind === 'act') w.dwell = 0;
    if (w.state === 'walk') this.startWalk(w, w.goals[0]);
  }

  /**
   * Человека больше нет в срезе: уходит к выходу. Остановку, где с ним что-то делают и до которой он ещё не дошёл (кабинет
   * врача), он сначала проходит (spec docs/specs/2026-10-owner-play.md): приём в движке короче дороги на экране, и без
   * неё человек уходил домой, не дойдя до врача. Персонал и лежащие исчезают сразу, если выход не нужен.
   */
  leave(w: Walker) {
    if (w.leaving) return;
    w.leaving = true;
    // к выходу — обычным шагом: срока у движка нет
    w.due = NaN;
    w.goals = w.goals.filter(g => g.kind === 'act' && g.key !== w.at?.key).slice(-1);
    w.dwell = 0;
    if (w.state === 'walk') this.startWalk(w, w.goals[0] ?? null);
  }

  remove(key: string) {
    this.walkers.delete(key);
  }

  private seatRoot(look: Look, s: Spot) {
    const sz = look.seat.z;
    return { x: s.x - Math.sin(s.yaw) * sz, z: s.z - Math.cos(s.yaw) * sz, y: s.y - look.seat.y };
  }

  private setClip(w: Walker, c: number, loop: boolean) {
    if (w.clip !== c) w.clipTime = 0;
    w.clip = c;
    w.loop = loop;
  }

  /** Путь от того места, где человек сейчас, к цели (`null` — к выходу). */
  private startWalk(w: Walker, goal: Spot | null) {
    const l = this.l;
    const fromCell = Math.max(0, Math.min(l.h - 1, Math.floor(w.z))) * l.w + Math.max(0, Math.min(l.w - 1, Math.floor(w.x)));
    const outside = fromCell >= 0 && l.plan.grid.cells[fromCell] === 0;
    // с улицы — через ближний вход
    const near = (e: { x: number; z: number }) => (e.x - w.x) ** 2 + (e.z - w.z) ** 2;
    const start = outside ? (near(this.ambulance) < near(this.exit) ? this.ambulance.cell : this.exit.cell) : fromCell;
    const to = goal ? goal.cell : this.exit.cell;
    const cells = this.paths.find(start, to) ?? Int32Array.of(start, to);
    const n = cells.length + 1 + (goal ? 0 : 1);
    const pts = new Float32Array(n * 2);
    pts[0] = w.x;
    pts[1] = w.z;
    for (let i = 0; i < cells.length; i++) {
      pts[(i + 1) * 2] = (cells[i] % l.w) + 0.5;
      pts[(i + 1) * 2 + 1] = ((cells[i] / l.w) | 0) + 0.5;
    }
    if (!goal) {
      pts[(n - 1) * 2] = this.exit.x;
      pts[(n - 1) * 2 + 1] = this.exit.z;
    }
    // первая точка пути — где он стоит; если он уже у середины первой клетки — без лишнего шага назад
    const cum = new Float32Array(n);
    for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(pts[i * 2] - pts[i * 2 - 2], pts[i * 2 + 1] - pts[i * 2 - 1]);
    w.pts = pts;
    w.cum = cum;
    w.seg = 0;
    w.state = 'walk';
    w.lie = 0;
  }

  /** Шаг на `dt` секунд настоящего времени. */
  update(dt: number) {
    // обычный шаг на экране: та скорость, с какой дорогу считает движок, в настоящих секундах
    const v = this.rate > 0 ? WALK_SPEED_PC * this.rate : 0;
    for (const w of this.walkers.values()) this.step(w, dt, v);
    this.separate(dt);
    for (const [k, w] of this.walkers) if (w.state === 'gone') this.walkers.delete(k);
  }

  /** Сколько метров ещё идти по пути. */
  private rest(w: Walker): number {
    const cum = w.cum!;
    const last = cum.length - 1;
    const k = Math.min(last, Math.floor(w.seg));
    const f = w.seg - k;
    return cum[last] - (k < last ? cum[k] + (cum[k + 1] - cum[k]) * f : cum[last]);
  }

  private step(w: Walker, dt: number, v: number) {
    const look = this.looks[w.look];
    // перемотка: сесть, встать и постоять у стойки — во столько же раз быстрее, во сколько идёт игра
    const fast = Math.max(1, this.speed);
    w.clipTime += dt * (w.clip === WALK || w.clip === RUN ? Math.max(0.2, w.v / (w.clip === RUN ? 3.2 : 1.25)) : w.clip === SITDOWN || w.clip === STANDUP ? fast : 1);
    w.v = 0;
    switch (w.state) {
      case 'idle':
      case 'sit':
      case 'lie': {
        w.dwell -= dt * fast;
        const next = w.goals[0];
        const go = (next && next.key !== w.at?.key) || w.leaving;
        if (!go || w.dwell > 0 || v === 0) {
          if (next && next.key === w.at?.key) w.goals.shift();
          return;
        }
        if (w.state === 'sit') {
          w.state = 'standUp';
          w.t = 0;
          w.fx = w.x;
          w.fz = w.z;
          w.fy = w.y;
          this.setClip(w, STANDUP, false);
          return;
        }
        if (w.state === 'lie') {
          w.state = 'getUp';
          w.t = 0;
          w.fx = w.x;
          w.fz = w.z;
          w.fy = w.y;
          return;
        }
        // уходит — сперва оставшаяся остановка, потом к выходу
        this.startWalk(w, next ?? null);
        return;
      }
      case 'standUp': {
        w.t += dt * fast;
        const dur = this.standDur[w.look];
        const cell = w.at?.cell ?? 0;
        const tx = (cell % this.l.w) + 0.5;
        const tz = ((cell / this.l.w) | 0) + 0.5;
        const k = ease(Math.max(0, Math.min(1, (w.t - dur * 0.3) / (dur * 0.7))));
        w.x = w.fx + (tx - w.fx) * k;
        w.z = w.fz + (tz - w.fz) * k;
        w.y = w.fy * (1 - k);
        if (w.t >= dur) {
          w.y = 0;
          this.afterRise(w);
        }
        return;
      }
      case 'getUp': {
        w.t += dt * fast;
        const cell = w.at?.cell ?? 0;
        const tx = (cell % this.l.w) + 0.5;
        const tz = ((cell / this.l.w) | 0) + 0.5;
        const k = ease(Math.min(1, w.t / LIE_TIME));
        w.lie = 1 - k;
        w.x = w.fx + (tx - w.fx) * k;
        w.z = w.fz + (tz - w.fz) * k;
        w.y = w.fy * (1 - k);
        if (w.t >= LIE_TIME) {
          w.lie = 0;
          w.y = 0;
          this.afterRise(w);
        }
        return;
      }
      case 'sitDown': {
        const spot = w.at!;
        w.t += dt * fast;
        const dur = this.sitDur[w.look];
        const r = this.seatRoot(look, spot);
        w.heading = turnTo(w.heading, spot.yaw, dt * fast * 10);
        const k = ease(Math.min(1, w.t / (dur * 0.7)));
        w.x = w.fx + (r.x - w.fx) * k;
        w.z = w.fz + (r.z - w.fz) * k;
        w.y = r.y * k;
        if (w.t >= dur) {
          w.state = 'sit';
          w.heading = spot.yaw;
        }
        return;
      }
      case 'lieDown': {
        const spot = w.at!;
        w.t += dt * fast;
        const k = ease(Math.min(1, w.t / LIE_TIME));
        w.heading = turnTo(w.heading, spot.yaw, dt * fast * 8);
        w.lie = k;
        w.x = w.fx + (spot.x - w.fx) * k;
        w.z = w.fz + (spot.z - w.fz) * k;
        w.y = spot.y * k;
        if (w.t >= LIE_TIME) {
          w.state = 'lie';
          w.heading = spot.yaw;
          this.setClip(w, IDLE, true);
        }
        return;
      }
      case 'walk': {
        if (v === 0) {
          this.setClip(w, IDLE, true);
          return;
        }
        const pts = w.pts!;
        const last = pts.length / 2 - 1;
        let speed = v;
        // к сроку движка: к последней цели — так, чтобы дойти к `due`; опаздывает — быстрее, но не бегом
        if (w.goals.length <= 1 && !Number.isNaN(w.due)) {
          const left = (w.due - this.t) / this.rate;
          const want = left > 0 ? this.rest(w) / left : Number.POSITIVE_INFINITY;
          speed = Math.max(PACE[0] * v, Math.min(PACE[1] * v, want));
        }
        if (w.yield > 0) {
          w.yield -= dt * fast;
          speed = 0;
        }
        // пройти `speed · dt` метров по пути: на ×12 шаг кадра длиннее короткого отрезка — счёт по пройденным метрам
        let s = last;
        let done = true;
        if (last > 0) {
          const cum = w.cum!;
          const k0 = Math.min(last - 1, Math.floor(w.seg));
          const walked = cum[k0] + (cum[k0 + 1] - cum[k0]) * (w.seg - k0) + speed * dt;
          done = walked >= cum[last];
          if (!done) {
            let k = k0;
            while (k < last - 1 && cum[k + 1] <= walked) k++;
            const span = cum[k + 1] - cum[k];
            s = k + (span > 0 ? Math.min(1, (walked - cum[k]) / span) : 1);
          }
        }
        w.seg = s;
        const k = Math.min(Math.max(0, last - 1), Math.floor(s));
        const f = last > 0 ? s - k : 1;
        const ax = pts[k * 2];
        const az = pts[k * 2 + 1];
        const bx = last > 0 ? pts[k * 2 + 2] : ax;
        const bz = last > 0 ? pts[k * 2 + 3] : az;
        const dx = bx - ax;
        const dz = bz - az;
        if (dx !== 0 || dz !== 0) w.heading = turnTo(w.heading, Math.atan2(dx, dz), dt * fast * 9);
        // правая сторона прохода: вправо от того, куда смотрит; у конца пути — к середине клетки
        const toEnd = (last - s) * 1;
        const latK = Math.min(1, toEnd, s);
        const rx = -Math.cos(w.heading);
        const rz = Math.sin(w.heading);
        w.x = ax + dx * f + rx * w.lat * latK;
        w.z = az + dz * f + rz * w.lat * latK;
        w.y = 0;
        w.v = speed;
        this.setClip(w, speed / fast > RUN_FROM ? RUN : speed > 0 ? WALK : IDLE, true);
        if (!done) return;
        w.pts = null;
        w.cum = null;
        if (w.leaving && w.goals.length === 0) {
          w.state = 'gone';
          return;
        }
        const goal = w.goals.shift();
        if (!goal) {
          w.state = 'idle';
          this.setClip(w, IDLE, true);
          return;
        }
        w.at = goal;
        w.dwell = goal.dwell;
        w.fx = w.x;
        w.fz = w.z;
        w.fy = 0;
        w.t = 0;
        if (goal.pose === 'sit') {
          w.state = 'sitDown';
          this.setClip(w, SITDOWN, false);
        } else if (goal.pose === 'lie') {
          w.state = 'lieDown';
          this.setClip(w, IDLE, true);
        } else {
          w.state = 'idle';
          if (!Number.isNaN(goal.yaw)) w.heading = goal.yaw;
          this.setClip(w, IDLE, true);
        }
      }
    }
  }

  /** Встал со стула или с постели: к следующей цели, к выходу или стоит рядом. */
  private afterRise(w: Walker) {
    w.at = undefined;
    if (w.leaving || w.goals.length) this.startWalk(w, w.goals[0] ?? null);
    else {
      w.state = 'idle';
      this.setClip(w, IDLE, true);
    }
  }

  /**
   * Расталкивание: идущие ближе SPACE раздвигаются поперёк хода (сдвиг вправо меняется, не дальше 0,35 м от середины);
   * стоящие рядом раздвигаются чуть-чуть; встречные в двери — один ждёт.
   */
  private separate(dt: number) {
    const l = this.l;
    const list = [...this.walkers.values()].filter(w => w.state === 'walk' || w.state === 'idle');
    const cellOf = (w: Walker) => Math.floor(w.z) * l.w + Math.floor(w.x);
    const buckets = new Map<number, Walker[]>();
    for (const w of list) {
      const c = cellOf(w);
      let b = buckets.get(c);
      if (!b) buckets.set(c, (b = []));
      b.push(w);
    }
    for (const a of list) {
      const ax = Math.floor(a.x);
      const az = Math.floor(a.z);
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const b2 = buckets.get((az + dz) * l.w + ax + dx);
          if (!b2) continue;
          for (const b of b2) {
            if (b === a || a.key > b.key) continue;
            const ddx = b.x - a.x;
            const ddz = b.z - a.z;
            const d = Math.hypot(ddx, ddz);
            if (d >= SPACE || d === 0) continue;
            const push = (SPACE - d) * 0.5;
            for (const [p, sgn] of [
              [a, -1],
              [b, 1],
            ] as const) {
              if (p.state === 'walk') {
                // поперёк хода: правая сторона — +lat
                const rx = -Math.cos(p.heading);
                const rz = Math.sin(p.heading);
                const side = ((ddx * rx + ddz * rz) / d) * sgn;
                p.lat = Math.max(-0.35, Math.min(0.35, p.lat + (side >= 0 ? 1 : -1) * push * Math.min(1, dt * 12)));
              } else if (!p.staff && p.at?.pose === 'stand') {
                p.x += (sgn * ddx * push * Math.min(1, dt * 4)) / d;
                p.z += (sgn * ddz * push * Math.min(1, dt * 4)) / d;
              }
            }
            // встречные в двери: тот, кто позже по ключу, ждёт
            if (a.state === 'walk' && b.state === 'walk' && d < 0.9) {
              const facing = Math.cos(a.heading - b.heading) < -0.5;
              const door = l.plan.grid.cells[cellOf(a)] === 4 || l.plan.grid.cells[cellOf(b)] === 4;
              if (facing && door) {
                const w = a.key > b.key ? a : b;
                if (w.yield <= 0) w.yield = 0.6;
              }
            }
          }
        }
      }
    }
    // сдвиг возвращается к правой стороне
    for (const w of list) if (w.state === 'walk') w.lat += (KEEP_RIGHT - w.lat) * Math.min(1, dt * 1.5);
  }

  /** Где сейчас человек — для двери: рядом ли кто-то с клеткой (x, z). */
  near(x: number, z: number, r: number): boolean {
    const r2 = r * r;
    for (const w of this.walkers.values()) {
      if (w.state === 'sit' || w.state === 'lie') continue;
      const dx = w.x - x;
      const dz = w.z - z;
      if (dx * dx + dz * dz < r2) return true;
    }
    return false;
  }

  /** Всех — сразу на их места (бенч и снимки после промотки): ушедшие исчезают, идущие оказываются у цели. */
  settleAll() {
    for (const [k, w] of [...this.walkers]) {
      if (w.leaving) {
        this.walkers.delete(k);
        continue;
      }
      const goal = w.goals[w.goals.length - 1] ?? w.at;
      if (goal) this.settle(w, goal);
    }
  }

  /** Сколько сидят и лежат — для полосы и бенча. */
  count(): { walking: number; sitting: number; lying: number } {
    let walking = 0;
    let sitting = 0;
    let lying = 0;
    for (const w of this.walkers.values()) {
      if (w.state === 'walk') walking++;
      else if (w.state === 'sit' || w.state === 'sitDown') sitting++;
      else if (w.state === 'lie' || w.state === 'lieDown') lying++;
    }
    return { walking, sitting, lying };
  }
}
