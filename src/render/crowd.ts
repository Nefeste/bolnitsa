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
import { SLOW_PACE, WALK_SPEED_PC } from '../engine/shift/walking';
import type { ClipName, Look } from './bake';
import type { Layout } from './layout';
import type { Paths } from './path';
import type { Spot } from './place';

/** Анимации по номерам — как CLIP_NAMES в bake.ts (здесь без Three.js; тест сверяет списки). */
export const CLIPS: readonly ClipName[] = ['Idle', 'Walk', 'Run', 'SitDown', 'StandUp', 'Sit', 'WalkSlow', 'SitWork', 'SitLook', 'Papers'];
/** Номера анимаций — как CLIP_NAMES в bake.ts. */
export const IDLE = 0;
export const WALK = 1;
export const RUN = 2;
export const SITDOWN = 3;
export const STANDUP = 4;
export const SIT = 5;
/** медленный шаг (spec docs/specs/2026-10-people.md, «Медленный шаг»): пожилые и «жёлтые» */
export const WALK_SLOW = 6;
/** за работой и в ожидании (spec docs/specs/2026-10-staff-motion.md, часть 1): петля за столом, оглядывается сидя, бумаги */
export const SIT_WORK = 7;
export const SIT_LOOK = 8;
export const PAPERS = 9;

/**
 * Жесты поверх покоя (spec docs/specs/2026-10-staff-motion.md, часть 1): первый — через `GESTURE_FIRST` секунд на экране, как
 * человек сел или встал на пост (при ×1 ждущий сидит в зале меньше минуты на экране), дальше — раз в `GESTURE`; от и до, срок —
 * от ключа человека и номера жеста: соседи не в такт.
 */
export const GESTURE_FIRST: readonly [number, number] = [2, 15];
export const GESTURE: readonly [number, number] = [20, 40];

/** Сколько секунд одна анимация переходит в другую (смешивание поз, people.ts): без рывка. */
export const FADE = 0.25;

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

/** `slide` — лёжа перекладывают: с каталки на кровать, стол, аппарат (spec docs/specs/2026-10-orderlies.md) */
type State = 'idle' | 'walk' | 'sitDown' | 'sit' | 'standUp' | 'lieDown' | 'lie' | 'getUp' | 'slide' | 'gone';

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
  /** переход из прежней анимации: какой, на какой её секунде, петля ли; сколько секунд ещё смешивать (0 — нет) */
  fromClip: number;
  fromTime: number;
  fromLoop: boolean;
  fade: number;
  /** уходит: дошёл до выхода — исчезает */
  leaving: boolean;
  /**
   * идёт медленным шагом — пожилой или «жёлтый» (spec docs/specs/2026-10-people.md, «Медленный шаг»; решение владельца
   * #132): обычная скорость — `SLOW_PACE` %, анимация — медленного шага; движок считает его дорогу так же
   */
  slow?: boolean;
  /** сколько секунд ждёт встречного в двери */
  yield: number;
  /** скорость в последнем кадре, м/с — для бенча и проверок */
  v: number;
  /** темп покоя, 0,85–1,15 по ключу: стоящие и ждущие не дышат в такт (spec 2026-10-aaa-polish, «Жизнь») */
  idle: number;
  /**
   * жест поверх покоя (spec docs/specs/2026-10-staff-motion.md, часть 1): играет ли сейчас разовый клип (`clip`), через
   * сколько секунд на экране следующий и сколько их было — от номера и ключа срок следующего
   */
  once: boolean;
  gap: number;
  gestures: number;
  /**
   * везут на каталке (spec docs/specs/2026-10-orderlies.md): ключ того, кто везёт; лежит на ней перед ним, пока не отпустят
   * (`release`); перекладывают на неё — `t` и (fx, fy, fz), как у других переходов
   */
  carry?: string;
  /** уходит через вход для скорой: фельдшер — к машине (spec docs/specs/2026-10-orderlies.md) */
  out?: 'ambulance';
  /** везёт каталку — пустую или с больным (санитар, медсестра, фельдшер скорой): каталка за каталкой (`convoy`) */
  gurney?: boolean;
  /** впереди по тому же проходу каталка: идти не быстрее её, м/с; нет — как обычно */
  follow?: number;
}

/** Хэш FNV-1a ключа: перемешивает все знаки. */
function hashOf(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

/** Темп покоя по ключу: ровный разброс 0,85–1,15, один и тот же у одного человека. */
export function idleRate(key: string): number {
  return 0.85 + (hashOf(key) % 31) / 100;
}

/**
 * Через сколько секунд на экране жест номер `n` после прежнего (spec docs/specs/2026-10-staff-motion.md, часть 1): первый
 * (`n` = 0) — `GESTURE_FIRST`, следующие — `GESTURE`; срок идёт, только пока человек сидит или стоит на месте.
 */
export function gestureGap(key: string, n: number): number {
  const k = (hashOf(`${key}#${n}`) % 1000) / 1000;
  const [lo, hi] = n === 0 ? GESTURE_FIRST : GESTURE;
  return lo + k * (hi - lo);
}

/** С какой доли петли начинает человек: соседи за столами поворачивают голову не разом. */
export function loopPhase(key: string): number {
  return (hashOf(`${key}@`) % 1000) / 1000;
}

/** Каталка (spec docs/specs/2026-10-orderlies.md): верх матраса — на этой высоте лежит пациент, м. */
export const GURNEY_TOP = 0.66;
/** На сколько середина каталки впереди ступней того, кто её везёт, м. */
export const GURNEY_AHEAD = 1.3;
/**
 * Каталка за каталкой (замечание владельца 30.10.2026: на живой заставке две каталки ехали одна сквозь другую по одному
 * пути): тот, кто везёт, держится не ближе этого по пути от того, кто везёт впереди, м — перед ним его каталка (длина 2 м,
 * середина — в `GURNEY_AHEAD`, передний край — в 2,3 м) и зазор 0,8 м.
 */
export const FOLLOW = GURNEY_AHEAD + 1.8;
/** Тот же проход для каталок: тот, кто везёт впереди, не дальше этого от пути заднего, м (каталка шириной 0,65 м). */
const LANE = 0.8;
/** На углу путь длиннее прямой: передний край каталки заднего — не ближе этого к тому, кто везёт впереди, м. */
const CLEAR = 0.7;

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
  /** длительности анимаций по виду и номеру, с — разовые клипы кончаются по ним */
  private dur: number[][];
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
    this.dur = looks.map(k => CLIPS.map(c => k.clips[c].duration));
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

  /**
   * Новый человек: персонал — сразу на месте, пациент — входит с улицы (привезённый скорой — у входа для скорой).
   * Персонал на пересменке (`enter`, spec docs/specs/2026-10-staff-shifts.md) тоже входит с улицы.
   */
  add(key: string, look: number, spot: Spot, staff: boolean, ambulance = false, due = NaN, enter = false): Walker {
    const from = ambulance ? this.ambulance : this.exit;
    const w: Walker = {
      key, look, staff, x: from.x, y: 0, z: from.z, heading: 0, lie: 0, lat: KEEP_RIGHT, state: 'idle', pts: null, cum: null, seg: 0, due,
      at: undefined, goals: [], dwell: 0, t: 0, fx: 0, fz: 0, fy: 0, clip: IDLE, clipTime: (key.length * 0.37) % 3, loop: true, leaving: false,
      fromClip: IDLE, fromTime: 0, fromLoop: true, fade: 0, yield: 0, v: 0, idle: idleRate(key), once: false, gap: gestureGap(key, 0), gestures: 0,
    };
    this.walkers.set(key, w);
    if (staff && !enter) this.settle(w, spot);
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
      // сидит — петля сидя, с секунды по ключу: соседи на скамье дышат не в такт; за столом — петля работы с доли по ключу
      if (spot.work === 'desk') {
        this.setClip(w, SIT_WORK, true);
        w.clipTime = loopPhase(w.key) * this.dur[w.look][SIT_WORK];
      } else {
        this.setClip(w, SIT, true);
        w.clipTime = (w.key.length * 0.71) % 5;
      }
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
    // на месте сразу — без перехода из прежней позы
    w.fade = 0;
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
  leave(w: Walker, ambulance = false) {
    if (w.leaving) return;
    w.leaving = true;
    if (ambulance) w.out = 'ambulance';
    // к выходу — обычным шагом: срока у движка нет
    w.due = NaN;
    w.goals = w.goals.filter(g => g.kind === 'act' && g.key !== w.at?.key).slice(-1);
    w.dwell = 0;
    if (w.state === 'walk') this.startWalk(w, w.goals[0] ?? null);
  }

  /**
   * Передумал уходить (spec 2026-10-staff-shifts: ушедший со сменой снова в больнице) — к месту: идёт — поворачивает туда,
   * стоит на месте — остаётся.
   */
  stay(w: Walker, spot: Spot) {
    w.leaving = false;
    w.due = NaN;
    w.goals = [spot];
    if (w.state === 'walk') this.startWalk(w, spot);
  }

  /**
   * Везут на каталке (spec docs/specs/2026-10-orderlies.md): перекладывают на неё — с кровати или стоя (тогда и ложится), — и
   * дальше он лежит на ней перед тем, кто везёт (`by` — его ключ), где бы тот ни был, пока не отпустят (`release`). `at` — уже
   * лежит на ней (привезла скорая).
   */
  carry(w: Walker, by: string, at = false) {
    w.carry = by;
    w.goals = [];
    w.pts = null;
    w.cum = null;
    w.at = undefined;
    w.leaving = false;
    w.fx = w.x;
    w.fz = w.z;
    w.fy = w.y;
    w.t = at ? LIE_TIME : 0;
    if (at) w.lie = 1;
    w.state = 'lie';
    this.setClip(w, IDLE, true);
  }

  /** Довезли: с каталки — на место (на койку, на стол, на место в смотровой); лёжа — перекладывают, стоя — встаёт сразу. */
  release(w: Walker, spot: Spot) {
    delete w.carry;
    if (spot.pose !== 'lie') {
      this.settle(w, spot);
      return;
    }
    w.at = spot;
    w.goals = [];
    w.pts = null;
    w.cum = null;
    w.fx = w.x;
    w.fz = w.z;
    w.fy = w.y;
    w.t = 0;
    w.lie = 1;
    w.state = 'slide';
    this.setClip(w, IDLE, true);
  }

  remove(key: string) {
    this.walkers.delete(key);
  }

  private seatRoot(look: Look, s: Spot) {
    const sz = look.seat.z;
    return { x: s.x - Math.sin(s.yaw) * sz, z: s.z - Math.cos(s.yaw) * sz, y: s.y - look.seat.y };
  }

  private setClip(w: Walker, c: number, loop: boolean) {
    if (w.clip !== c) {
      // переход: последняя поза прежней анимации смешивается с новой `FADE` секунд (people.ts)
      w.fromClip = w.clip;
      w.fromTime = w.clipTime;
      w.fromLoop = w.loop;
      w.fade = FADE;
      w.clipTime = 0;
      w.once = false;
    }
    w.clip = c;
    w.loop = loop;
  }

  /** Разовый клип (жест), потом — снова петля покоя (`gesture`). */
  private play(w: Walker, c: number) {
    this.setClip(w, c, false);
    w.once = true;
  }

  /** Петля покоя на месте: сидя за столом — работа, сидя — покой сидя, иначе — стоя. */
  private restClip(w: Walker): number {
    if (w.state !== 'sit') return IDLE;
    return w.at?.work === 'desk' ? SIT_WORK : SIT;
  }

  /**
   * Жесты поверх покоя (spec docs/specs/2026-10-staff-motion.md, часть 1): сидящий на стуле или скамье (ждёт, отдыхает)
   * оглядывается, стоящий на посту берёт бумаги — в свой срок (`gestureGap`); доиграл — снова петля покоя. Лежащие, сидящие
   * за столом и те, кому идти дальше, — без жестов; в паузе часы стоят (dt = 0).
   */
  private gesture(w: Walker, dt: number) {
    if (w.once) {
      if (w.clipTime >= this.dur[w.look][w.clip]) this.setClip(w, this.restClip(w), true);
      return;
    }
    const sit = w.state === 'sit' && w.clip === SIT && w.at?.work === undefined;
    const papers = w.state === 'idle' && w.staff && w.clip === IDLE && w.at?.work === 'stand' && w.goals.length === 0 && !w.leaving;
    if (!sit && !papers) return;
    w.gap -= dt;
    if (w.gap > 0) return;
    this.play(w, sit ? SIT_LOOK : PAPERS);
    w.gap = gestureGap(w.key, ++w.gestures);
  }

  /**
   * Обход (spec docs/specs/2026-10-staff-motion.md, часть 1): остановки подряд — у каждой стоит её `dwell` (секунд при ×1),
   * у койки берёт бумаги; последняя — где останется.
   */
  route(w: Walker, spots: readonly Spot[]) {
    w.due = NaN;
    w.goals = [...spots];
    if (w.state === 'walk') this.startWalk(w, w.goals[0]);
  }

  /** Путь от того места, где человек сейчас, к цели (`null` — к выходу). */
  private startWalk(w: Walker, goal: Spot | null) {
    const l = this.l;
    const fromCell = Math.max(0, Math.min(l.h - 1, Math.floor(w.z))) * l.w + Math.max(0, Math.min(l.w - 1, Math.floor(w.x)));
    const outside = fromCell >= 0 && l.plan.grid.cells[fromCell] === 0;
    // с улицы — через ближний вход
    const near = (e: { x: number; z: number }) => (e.x - w.x) ** 2 + (e.z - w.z) ** 2;
    const start = outside ? (near(this.ambulance) < near(this.exit) ? this.ambulance.cell : this.exit.cell) : fromCell;
    const exit = w.out === 'ambulance' ? this.ambulance : this.exit;
    const to = goal ? goal.cell : exit.cell;
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
      pts[(n - 1) * 2] = exit.x;
      pts[(n - 1) * 2 + 1] = exit.z;
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
    this.convoy();
    // кого везут на каталке — после того, кто везёт: лежит там, где каталка в этом кадре, а не в прошлом
    for (const w of this.walkers.values()) if (w.carry === undefined) this.step(w, dt, v);
    for (const w of this.walkers.values()) if (w.carry !== undefined) this.step(w, dt, v);
    this.separate(dt);
    for (const [k, w] of this.walkers) if (w.state === 'gone') this.walkers.delete(k);
  }

  /**
   * Каталки друг за другом: кто везёт каталку и идёт, а впереди на его пути (поперёк — не дальше `LANE`) в ту же сторону идёт
   * другой с каталкой, — ближе `FOLLOW` по пути стоит, на метр дальше — идёт не быстрее его. Счёт по пути, а не по взгляду: за
   * углом передний уже повернул, а задний ещё смотрит прямо, и по взгляду не видел бы его. Вышли из одной точки разом — первым
   * идёт тот, чей ключ меньше. Встречные и поперечные не ждут друг друга: расходятся по сторонам прохода (`separate`).
   */
  private convoy() {
    const carts: Walker[] = [];
    for (const w of this.walkers.values()) {
      w.follow = undefined;
      if (w.gurney && w.state === 'walk' && w.pts) carts.push(w);
    }
    if (carts.length < 2) return;
    const lead = new Map<Walker, { b: Walker; gap: number }>();
    for (const a of carts) {
      for (const b of carts) {
        if (a === b) continue;
        const gap = this.onPath(a, b, FOLLOW + 1);
        if (Number.isNaN(gap) || gap < -0.05 || (gap <= 0.05 && a.key < b.key)) continue;
        if (gap < (lead.get(a)?.gap ?? Number.POSITIVE_INFINITY)) lead.set(a, { b, gap });
      }
    }
    for (const [a, { b, gap }] of lead) {
      // каждый видит другого впереди (пути разные, а сошлись рядом) — ждёт тот, чей ключ больше: иначе стояли бы оба
      if (lead.get(b)?.b === a && a.key < b.key) continue;
      // передний край своей каталки (середина — в GURNEY_AHEAD, длина 2 м): на углу срезает к переднему
      const near = Math.hypot(a.x + Math.sin(a.heading) * (GURNEY_AHEAD + 1) - b.x, a.z + Math.cos(a.heading) * (GURNEY_AHEAD + 1) - b.z) < CLEAR;
      a.follow = gap < FOLLOW || near ? 0 : b.v;
    }
  }

  /**
   * Где `b` на пути `a`: сколько метров `a` идти по пути до точки, ближайшей к `b`, если `b` от пути не дальше `LANE` и идёт в
   * ту же сторону (его отрезок — в пределах 60° от отрезка `a` там или следующего: на углу); позади `a` — меньше нуля; не на
   * пути до `reach` — NaN.
   */
  private onPath(a: Walker, b: Walker, reach: number): number {
    const pts = a.pts!;
    const cum = a.cum!;
    const last = pts.length / 2 - 1;
    const dir = this.dirOf(b);
    if (last < 1 || !dir) return Number.NaN;
    const k0 = Math.min(last - 1, Math.floor(a.seg));
    const f0 = a.seg - k0;
    // где `a` на своём пути — без сдвига вправо
    const px = pts[k0 * 2] + (pts[k0 * 2 + 2] - pts[k0 * 2]) * f0;
    const pz = pts[k0 * 2 + 1] + (pts[k0 * 2 + 3] - pts[k0 * 2 + 1]) * f0;
    const walked = cum[k0] + (cum[k0 + 1] - cum[k0]) * f0;
    for (let k = k0; k < last; k++) {
      const sx = k === k0 ? px : pts[k * 2];
      const sz = k === k0 ? pz : pts[k * 2 + 1];
      const s0 = k === k0 ? 0 : cum[k] - walked;
      if (s0 > reach) break;
      const ex = pts[k * 2 + 2];
      const ez = pts[k * 2 + 3];
      const len = Math.hypot(ex - sx, ez - sz);
      if (len < 1e-6) continue;
      const ux = (ex - sx) / len;
      const uz = (ez - sz) / len;
      let t = (b.x - sx) * ux + (b.z - sz) * uz;
      // позади — только у первого отрезка: дальше точка позади отрезка — это конец предыдущего
      t = Math.min(len, k === k0 ? t : Math.max(0, t));
      if (Math.hypot(b.x - sx - ux * t, b.z - sz - uz * t) > LANE) continue;
      // в ту же сторону: по этому отрезку или (на углу) по следующему
      let same = dir[0] * ux + dir[1] * uz >= 0.5;
      if (!same && k + 1 < last) {
        const nx = pts[k * 2 + 4] - ex;
        const nz = pts[k * 2 + 5] - ez;
        const nl = Math.hypot(nx, nz);
        same = nl > 1e-6 && (dir[0] * nx + dir[1] * nz) / nl >= 0.5;
      }
      return same && s0 + t <= reach ? s0 + t : Number.NaN;
    }
    return Number.NaN;
  }

  /** Куда идёт по пути сейчас: единичный вектор его отрезка; пути нет или он точка — `undefined`. */
  private dirOf(w: Walker): [number, number] | undefined {
    const pts = w.pts;
    if (!pts || pts.length < 4) return undefined;
    const last = pts.length / 2 - 1;
    for (let k = Math.min(last - 1, Math.floor(w.seg)); k < last; k++) {
      const dx = pts[k * 2 + 2] - pts[k * 2];
      const dz = pts[k * 2 + 3] - pts[k * 2 + 1];
      const d = Math.hypot(dx, dz);
      if (d > 1e-6) return [dx / d, dz / d];
    }
    return undefined;
  }

  /**
   * Вошёл с каталкой с улицы (фельдшер скорой): если у его начала пути — ближе `FOLLOW` — уже идёт другой с каталкой, он
   * начинает дальше по улице, за ним, а не в нём: две машины разом — и каталки не появляются одна в другой.
   */
  queue(w: Walker) {
    for (let i = 0; i < 8 && w.state === 'walk' && w.pts && w.pts.length >= 4; i++) {
      const pts = w.pts;
      const len = Math.hypot(pts[2] - pts[0], pts[3] - pts[1]);
      if (len < 1e-6) return;
      let near = false;
      for (const o of this.walkers.values()) if (o !== w && o.gurney && o.state === 'walk' && Math.hypot(o.x - w.x, o.z - w.z) < FOLLOW) near = true;
      if (!near) return;
      // назад — против первого отрезка пути (от входа на улицу)
      w.x -= ((pts[2] - pts[0]) / len) * FOLLOW;
      w.z -= ((pts[3] - pts[1]) / len) * FOLLOW;
      this.startWalk(w, w.goals[0] ?? null);
    }
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
    // перемотка: сесть, встать и постоять у стойки — во столько же раз быстрее, во сколько идёт игра; покой — в своём
    // темпе, не в такт с соседями
    const fast = Math.max(1, this.speed);
    // на каталке — перед тем, кто везёт, лёжа: сперва перекладывают (стоявший ложится); ушёл с карты — остаётся, где был
    if (w.carry !== undefined) {
      const c = this.walkers.get(w.carry);
      if (v > 0) w.t += dt * fast;
      const k = ease(Math.min(1, w.t / LIE_TIME));
      if (c) {
        const tx = c.x + Math.sin(c.heading) * GURNEY_AHEAD;
        const tz = c.z + Math.cos(c.heading) * GURNEY_AHEAD;
        w.x = w.fx + (tx - w.fx) * k;
        w.z = w.fz + (tz - w.fz) * k;
        w.y = w.fy + (GURNEY_TOP - w.fy) * k;
        w.heading = k < 1 ? turnTo(w.heading, c.heading, dt * fast * 8) : c.heading;
      }
      w.lie = Math.max(w.lie, k);
      w.v = 0;
      return;
    }
    const look = this.looks[w.look];
    // шаг и бег — со скоростью вида (bake.ts, lockFeet: при ней опорная ступня стоит на месте): ступня не скользит
    w.clipTime +=
      dt * (w.clip === WALK || w.clip === RUN || w.clip === WALK_SLOW ? Math.max(0.2, w.v / (w.clip === RUN ? look.run : w.clip === WALK_SLOW ? look.walkSlow : look.walk)) : w.clip === SITDOWN || w.clip === STANDUP ? fast : w.idle);
    if (w.fade > 0) w.fade = Math.max(0, w.fade - dt * fast);
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
          this.gesture(w, dt);
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
          // петля сидя начинается с последней позы посадки (tools/app/people.mjs, `seated`); за столом — петля работы
          this.setClip(w, this.restClip(w), true);
        }
        return;
      }
      case 'slide': {
        const spot = w.at!;
        if (v > 0) w.t += dt * fast;
        const k = ease(Math.min(1, w.t / LIE_TIME));
        w.heading = turnTo(w.heading, spot.yaw, dt * fast * 8);
        w.x = w.fx + (spot.x - w.fx) * k;
        w.z = w.fz + (spot.z - w.fz) * k;
        w.y = w.fy + (spot.y - w.fy) * k;
        if (w.t >= LIE_TIME) {
          w.state = 'lie';
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
        // медленным шагом — своя обычная скорость, к ней и доли `PACE`
        const base = w.slow ? (v * SLOW_PACE) / 100 : v;
        let speed = base;
        // к сроку движка: к последней цели — так, чтобы дойти к `due`; опаздывает — быстрее, но не бегом
        if (w.goals.length <= 1 && !Number.isNaN(w.due)) {
          const left = (w.due - this.t) / this.rate;
          const want = left > 0 ? this.rest(w) / left : Number.POSITIVE_INFINITY;
          speed = Math.max(PACE[0] * base, Math.min(PACE[1] * base, want));
        }
        // каталка впереди (`convoy`) — не быстрее её
        if (w.follow !== undefined) speed = Math.min(speed, w.follow);
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
        this.setClip(w, speed / fast > RUN_FROM ? RUN : speed > 0 ? (w.slow ? WALK_SLOW : WALK) : IDLE, true);
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
          // у койки на обходе — бумаги в руках (spec docs/specs/2026-10-staff-motion.md, часть 1)
          if (goal.work === 'bed') this.play(w, PAPERS);
          else this.setClip(w, IDLE, true);
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
      if (w.state === 'sit' || w.state === 'lie' || w.state === 'slide') continue;
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
      else if (w.state === 'lie' || w.state === 'lieDown' || w.state === 'slide') lying++;
    }
    return { walking, sitting, lying };
  }
}
