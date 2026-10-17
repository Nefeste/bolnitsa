// Игра в окне (spec docs/specs/2026-10-shell-3d.md): база и модели, больница пресета движка, поток расчёта, 3D-вид,
// толпа по срезу, часы и скорости, ввод, панели. Всё, что знает игра, — здесь; панели только читают хранилище и просят.
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { MeshoptSimplifier } from 'three/addons/libs/meshopt_simplifier.module.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { ContentDb, Season } from '../content/types';
import { planOf, presetHospital } from '../engine/hospital/build';
import { presetStaff, type StaffMember } from '../engine/hospital/staff';
import type { Notice } from '../engine/shift/types';
import { clock, type Lang, named, setLang, T } from '../i18n';
import { bakeLook, lodOf, packPeople, type People } from '../render/bake';
import { CATALOG, EXTRA_MODELS } from '../render/catalog';
import { Crowd } from '../render/crowd';
import { furnish, type Furnished } from '../render/furniture';
import { type Layout, layoutOf } from '../render/layout';
import { type Index, type Model, modelOf } from '../render/models';
import { Paths } from '../render/path';
import { Places } from '../render/place';
import { Population } from '../render/population';
import { Stage } from '../render/stage';
import type { Quality } from '../render/view';
import type { WallMode } from '../render/world';
import { H } from '../sim/pack';
import { type Slice, SimClient } from '../sim/client';
import type { Actions, Speed, Store, Tab } from '../ui/store';

/** Больница и поток части 2а — вопросы к гейм-дизайну в спецификации, «Вопросы к гейм-дизайну». */
export const SCENE = { preset: 'preset.city', seed: 1, season: 'winter' as Season, flow: { perHour: 6, ambulancePerHour: 1 } };

/** Игровых секунд в секунду на ×1: минута за секунду (геймдизайн §2). */
export const GAME_PER_REAL = 60;

/** Мост к оболочке Electron (electron/preload.cjs); в браузере его нет. */
export interface ShellBridge {
  save(json: string): Promise<string>;
  saveShot(name: string, dataUrl: string): Promise<string>;
  metrics(): Promise<{ workingSetMB: number; privateMB: number; byType: Record<string, number> }>;
  info(): Promise<Record<string, unknown>>;
  firstFrame(ms: number): void;
  relaunch(args: string[]): void;
  args(): Promise<string[]>;
}

declare global {
  interface Window {
    shell?: ShellBridge;
    __game?: Game;
    __ready?: boolean;
    __benchResult?: unknown;
    __benchError?: string;
    __shots?: { name: string; dataUrl: string }[];
  }
}

export interface LoadTimes {
  content: number;
  furniture: number;
  people: number;
  scene: number;
  total: number;
}

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

async function loadGltf(url: string) {
  return loader.loadAsync(url);
}

export class Game {
  stage!: Stage;
  crowd!: Crowd;
  pop!: Population;
  layout!: Layout;
  furnished!: Furnished;
  people!: People;
  client!: SimClient;
  staff: StaffMember[] = [];
  speed: Speed = 1;
  /** промотка «до утра» (заглушка части 2а): до 20:00 или до первого срочного */
  ff = false;
  ffUntil = 0;
  /** часы смены из последнего среза */
  t = 8 * 3600;
  day = 0;
  lastSlice: Slice | null = null;
  selected: string | undefined;
  readonly load: LoadTimes = { content: 0, furniture: 0, people: 0, scene: 0, total: 0 };
  firstFrameMs = 0;
  private last = 0;
  private hudAt = 0;
  private notices: { t: number; text: string }[] = [];
  /** часы игры, которые бенч и снимки двигают сами */
  manual = false;
  /** последние кадры: интервал, CPU кадра (толпа + отрисовка) — для полосы отладки и бенча */
  readonly frames: { interval: number[]; sim: number[]; draw: number[] } = { interval: [], sim: [], draw: [] };
  onFrame: ((ts: number) => void) | null = null;
  private mouse = { x: 0, y: 0, inside: false, drag: null as null | { x: number; y: number }, keys: new Set<string>() };

  constructor(
    readonly db: ContentDb,
    readonly store: Store,
    readonly host: HTMLElement,
    readonly version: string,
  ) {}

  /** База, модели, больница, поток — и первый кадр. */
  static async create(host: HTMLElement, store: Store, version: string, quality: Quality): Promise<Game> {
    const t0 = performance.now();
    store.set({ status: T.app.loading, version });
    const db = (await (await fetch('./content.json')).json()) as ContentDb;
    const g = new Game(db, store, host, version);
    g.load.content = Math.round(performance.now() - t0);
    await g.build(quality);
    g.load.total = Math.round(performance.now() - t0);
    return g;
  }

  private async build(quality: Quality) {
    const { db, store } = this;
    store.set({ status: T.app.loadingModels });
    const base = './assets/models';
    const index = (await (await fetch(`${base}/index.json`)).json()) as Index;
    const tf = performance.now();
    const names = [...new Set([...Object.values(CATALOG).flatMap(e => ('model' in e ? [e.model] : [])), ...EXTRA_MODELS])];
    const models = new Map<string, Model>();
    await Promise.all(names.map(async n => models.set(n, modelOf(await loadGltf(`${base}/${n}.glb`), n))));
    this.load.furniture = Math.round(performance.now() - tf);
    const tp = performance.now();
    await MeshoptSimplifier.ready;
    const raws = await Promise.all(index.people.map(async n => bakeLook(await loadGltf(`${base}/people/${n}.glb`), n)));
    this.people = packPeople(raws, raws.map(r => lodOf(r, 0.25, MeshoptSimplifier)));
    this.load.people = Math.round(performance.now() - tp);

    store.set({ status: T.app.loadingWorld });
    const ts = performance.now();
    const rec = db.presets[SCENE.preset];
    const { hospital } = presetHospital(db, rec);
    this.staff = presetStaff(db, rec);
    const plan = planOf(db, hospital);
    const staffCells: [number, number][] = [];
    for (const m of this.staff) {
      const r = plan.rooms.find(x => x.id === m.room);
      const c = r?.staff[db.roles[m.role]?.stands ?? m.role] ?? r?.staff[m.role];
      if (c) staffCells.push([c[0], c[1]]);
    }
    this.layout = layoutOf(db, plan, hospital.decor, staffCells);
    this.furnished = furnish(this.layout, models);
    const walk = this.layout.walk.slice();
    for (const [x, y] of this.furnished.decor) walk[y * this.layout.w + x] = 0;
    const open = new Uint8Array(walk.length);
    for (let i = 0; i < open.length; i++) open[i] = plan.grid.cells[i] === 1 || plan.grid.cells[i] === 2 || plan.grid.cells[i] === 4 ? 1 : 0;
    const paths = new Paths(this.layout.w, this.layout.h, walk, open);
    const places = new Places(this.layout, this.furnished);
    this.crowd = new Crowd(this.layout, paths, this.people.looks);
    this.pop = new Population(db, this.layout, places, this.crowd, this.people.looks, this.staff, hospital.rooms);
    this.pop.placeStaff();
    this.stage = new Stage({ host: this.host, layout: this.layout, furnished: this.furnished, people: this.people, quality, capacity: 600 });
    this.load.scene = Math.round(performance.now() - ts);

    this.client = new SimClient('./sim.js');
    this.client.onSlice = s => this.onSlice(s);
    this.client.onError = m => store.set({ error: m });
    this.client.start({ kind: 'start', seed: SCENE.seed, season: SCENE.season, hospital, staff: this.staff, flow: SCENE.flow });
    this.bindInput();
    window.addEventListener('resize', () => this.stage.resize());
    store.set({
      ready: true, status: '', quality, walls: this.stage.wallMode,
      staffList: this.staff.map((m, i) => ({ key: `s:${i}`, text: `${named(db.roles[m.role]?.name, m.role)} · ${named(db.rooms[plan.rooms.find(r => r.id === m.room)?.type ?? '']?.name, m.room ?? '')}` })),
    });
    requestAnimationFrame(this.loop);
  }

  // ---------------------------------------------------------------- поток расчёта

  private onSlice(s: Slice) {
    this.lastSlice = s;
    this.t = s.buf[H.t];
    this.day = s.buf[H.day];
    this.pop.sync(s.buf, s.names);
    for (const n of s.notices) this.notice(n);
    if (this.ff && this.ffStop(s.notices)) this.setSpeed(0);
  }

  private notice(n: Notice) {
    const text =
      n.kind === 'arrived' ? (n.triage === 'red' ? T.notices.arrivedRed : T.notices.arrived)
      : n.kind === 'left' ? T.notices.left
      : n.kind === 'ambulance' ? T.notices.ambulance
      : n.kind === 'resultsReady' ? T.notices.resultsReady
      : n.kind === 'arrest' ? T.notices.arrest
      : T.notices.shiftEnd;
    this.notices.unshift({ t: this.t, text });
    if (this.notices.length > 60) this.notices.length = 60;
  }

  /** «До утра» останавливается на срочном: «красный», скорая; и в 20:00. */
  private ffStop(notices: Notice[]): boolean {
    if (this.t >= this.ffUntil) return true;
    return notices.some(n => n.kind === 'ambulance' || (n.kind === 'arrived' && n.triage === 'red'));
  }

  // ---------------------------------------------------------------- кадр

  private loop = (ts: number) => {
    requestAnimationFrame(this.loop);
    const dt = this.last ? Math.min(0.1, (ts - this.last) / 1000) : 0;
    if (this.last) this.push(this.frames.interval, ts - this.last);
    this.last = ts;
    this.onFrame?.(ts);
    if (!this.manual) {
      // «до утра»: столько, сколько поток успевает, — новый кусок, только когда прежний почти досчитан
      const lag = this.lastSlice?.lag ?? 0;
      const game = this.ff ? (!this.client.busy && lag < 300 ? 600 : 0) : this.speed * GAME_PER_REAL * dt;
      this.client.frame(game, this.ff ? 14 : 10);
    }
    this.edgePan(dt);
    const a = performance.now();
    this.crowd.speed = this.ff ? 4 : this.speed;
    this.crowd.update(this.speed === 0 && !this.ff ? 0 : dt);
    const b = performance.now();
    this.stage.frame(dt, (this.t % 86400) / 3600, this.crowd, this.pop.paint, k => this.pop.triageOf(k), this.selected);
    const c = performance.now();
    this.push(this.frames.sim, b - a);
    this.push(this.frames.draw, c - b);
    if (!this.firstFrameMs) {
      this.firstFrameMs = Math.round(c);
      window.shell?.firstFrame(this.firstFrameMs);
      window.__ready = true;
    }
    if (ts - this.hudAt > 100) {
      this.hudAt = ts;
      this.hud();
    }
  };

  private push(a: number[], v: number) {
    a.push(v);
    if (a.length > 600) a.splice(0, a.length - 300);
  }

  /** Полоса сверху и вкладки — 10 раз в секунду. */
  private hud() {
    const s = this.lastSlice;
    const iv = this.frames.interval.slice(-30);
    const mean = iv.reduce((x, y) => x + y, 0) / Math.max(1, iv.length);
    const cpu = this.frames.sim.slice(-30).reduce((x, y) => x + y, 0) / 30 + this.frames.draw.slice(-30).reduce((x, y) => x + y, 0) / 30;
    const gs = this.stage.gpu.samples.slice(-30);
    const patients: { key: string; text: string; triage: string }[] = [];
    if (s && this.store.get().tab === 'patients') {
      for (const w of this.crowd.walkers.values()) {
        if (w.staff || w.leaving) continue;
        const info = this.pop.info(w.key);
        if (!info || info.kind !== 'patient') continue;
        patients.push({ key: w.key, text: `${T.card.patient(info.sex, info.age)} — ${T.doing[info.doing]}`, triage: info.triage });
      }
    }
    const sel = this.selected ? this.pop.info(this.selected) : undefined;
    this.store.set({
      t: this.t, day: this.day, speed: this.speed, ff: this.ff,
      ...(s ? { arrived: s.buf[H.arrived], seen: s.buf[H.seen], left: s.buf[H.left], queue: s.buf[H.queue], lag: s.lag / 60, cash: s.buf[H.cash] === -2147483648 ? undefined : s.buf[H.cash] } : {}),
      notices: [...this.notices],
      patients,
      fps: Math.round(1000 / (mean || 1)),
      cpuMs: cpu,
      gpuMs: gs.length ? gs.reduce((x, y) => x + y, 0) / gs.length : null,
      people: this.crowd.walkers.size,
      selected: this.selected && sel ? { key: this.selected, info: sel } : undefined,
    });
  }

  // ---------------------------------------------------------------- действия панелей

  setSpeed(s: Speed) {
    this.speed = s;
    this.ff = false;
  }

  readonly actions: Actions = {
    setSpeed: s => {
      this.setSpeed(s);
      this.hud();
    },
    untilMorning: () => {
      // заглушка: промотка как можно быстрее — до 20:00 или до первого срочного (геймдизайн §2, «До утра»)
      const day = Math.floor(this.t / 86400) * 86400;
      this.ffUntil = this.t % 86400 < 20 * 3600 ? day + 20 * 3600 : day + 86400 + 8 * 3600;
      this.ff = true;
      this.hud();
    },
    setWalls: (m: WallMode) => {
      this.stage.setWalls(m);
      this.store.set({ walls: m });
    },
    setQuality: (q: Quality) => {
      this.stage.applyQuality(q);
      this.store.set({ quality: q });
    },
    setProjection: p => {
      this.stage.cam.projection = p;
      this.store.set({ projection: p });
    },
    overview: () => this.stage.cam.overview(),
    rotate: k => this.stage.cam.rotate(k),
    select: key => {
      this.selected = key;
      this.store.set({ room: undefined });
      this.hud();
    },
    setTab: (t: Tab | null) => {
      this.store.set({ tab: t });
      this.hud();
    },
    toggleDebug: () => this.store.set({ debug: !this.store.get().debug }),
    bench: uncapped => {
      if (uncapped && window.shell) window.shell.relaunch(['--bench', '--uncapped']);
      else void import('./bench').then(m => m.runBench(this, {}));
    },
    setLang: (l: Lang) => {
      setLang(l);
      document.documentElement.lang = l;
      document.title = T.app.title;
      this.store.set({ lang: l });
    },
  };

  /** Карточка помещения по клику на пол. */
  private selectRoom(room: number) {
    const r = this.layout.plan.rooms[room];
    if (!r) return;
    const staff = this.staff.filter(m => m.room === r.id).map(m => named(this.db.roles[m.role]?.name, m.role));
    let people = 0;
    for (const w of this.crowd.walkers.values()) if (Math.floor(w.x) > r.x && Math.floor(w.x) < r.x + r.w - 1 && Math.floor(w.z) > r.y && Math.floor(w.z) < r.y + r.h - 1) people++;
    this.selected = undefined;
    this.store.set({ selected: undefined, room: { room, name: named(this.db.rooms[r.type]?.name, r.type), id: r.id, staff, people } });
  }

  // ---------------------------------------------------------------- ввод

  private bindInput() {
    const el = this.stage.renderer.domElement;
    el.addEventListener(
      'wheel',
      e => {
        e.preventDefault();
        this.stage.cam.zoom(Math.exp(e.deltaY * 0.0012));
      },
      { passive: false },
    );
    el.addEventListener('pointerdown', e => {
      if (e.button === 2 || e.button === 1) {
        this.mouse.drag = { x: e.clientX, y: e.clientY };
        el.setPointerCapture(e.pointerId);
      } else if (e.button === 0) {
        const key = this.stage.pickPerson(e.clientX, e.clientY, this.crowd);
        if (key) this.actions.select(key);
        else {
          const cell = this.stage.pickCell(e.clientX, e.clientY, this.layout);
          if (cell && cell.room >= 0) this.selectRoom(cell.room);
          else this.actions.select(undefined);
        }
      }
    });
    el.addEventListener('pointermove', e => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.mouse.inside = true;
      if (!this.mouse.drag) return;
      this.stage.cam.pan(e.clientX - this.mouse.drag.x, e.clientY - this.mouse.drag.y, el.clientHeight);
      this.mouse.drag = { x: e.clientX, y: e.clientY };
    });
    el.addEventListener('pointerup', () => {
      this.mouse.drag = null;
    });
    el.addEventListener('pointerleave', () => {
      this.mouse.inside = false;
    });
    el.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('blur', () => {
      this.mouse.inside = false;
      this.mouse.keys.clear();
    });
    window.addEventListener('keydown', e => {
      if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return;
      const k = e.code;
      if (k === 'Space') {
        e.preventDefault();
        this.actions.setSpeed(this.speed === 0 && !this.ff ? 1 : 0);
      } else if (k === 'Digit1') this.actions.setSpeed(1);
      else if (k === 'Digit2') this.actions.setSpeed(2);
      else if (k === 'Digit3') this.actions.setSpeed(4);
      else if (k === 'Digit4') this.actions.untilMorning();
      else if (k === 'KeyQ') this.stage.cam.rotate(-1);
      else if (k === 'KeyE') this.stage.cam.rotate(1);
      else if (k === 'Escape') {
        this.actions.select(undefined);
        this.store.set({ room: undefined });
      } else if (k === 'Backquote') this.actions.toggleDebug();
      else this.mouse.keys.add(k);
    });
    window.addEventListener('keyup', e => this.mouse.keys.delete(e.code));
  }

  /** Сдвиг краями окна (курсор ближе 10 точек к краю) и клавишами WASD и стрелками. */
  private edgePan(dt: number) {
    if (this.mouse.drag) return;
    const el = this.stage.renderer.domElement;
    const w = el.clientWidth;
    const h = el.clientHeight;
    const v = 700 * dt;
    let dx = 0;
    let dy = 0;
    const keys = this.mouse.keys;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) dx += v;
    if (keys.has('KeyD') || keys.has('ArrowRight')) dx -= v;
    if (keys.has('KeyW') || keys.has('ArrowUp')) dy += v;
    if (keys.has('KeyS') || keys.has('ArrowDown')) dy -= v;
    if (this.mouse.inside && !dx && !dy) {
      const m = 10;
      if (this.mouse.x < m) dx = v;
      else if (this.mouse.x > w - m) dx = -v;
      if (this.mouse.y < m) dy = v;
      else if (this.mouse.y > h - m) dy = -v;
    }
    if (dx || dy) this.stage.cam.pan(dx, dy, h);
  }

  /** Названия из базы — для панелей. */
  names() {
    const { db } = this;
    return {
      room: (id: string | undefined) => {
        const r = id ? this.layout?.plan.rooms.find(x => x.id === id) : undefined;
        return r ? named(db.rooms[r.type]?.name, r.type) : (id ?? '—');
      },
      role: (id: string | undefined) => (id ? named(db.roles[id]?.name, id) : '—'),
      finding: (id: string | undefined) => (id ? named(db.findings[id]?.name, id) : '—'),
    };
  }

  /** Часы для снимков и сценария: «08:05». */
  clockText() {
    return clock(this.t);
  }
}

