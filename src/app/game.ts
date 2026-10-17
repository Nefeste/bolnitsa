// Игра в окне (spec docs/specs/2026-10-shell-3d.md; стройка — docs/specs/2026-10-build.md): база и модели, больница —
// пустое здание или готовая больница движка, поток расчёта, 3D-вид, толпа по срезу, часы и скорости, ввод, стройка,
// панели. Всё, что знает игра, — здесь; панели только читают хранилище и просят. Люди и поток (spec
// docs/specs/2026-10-flow-ui.md): значки над людьми и помещениями, вкладка «Пациенты», путь выбранного, слой очередей.
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { MeshoptSimplifier } from 'three/addons/libs/meshopt_simplifier.module.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { Cell, ContentDb, Id, Season } from '../content/types';
import { type HospitalState, type Plan, planOf } from '../engine/hospital/build';
import { DOCTOR, doctorRoom, openBlocks, type Problem, problemsOf, standInOf, type Staffing, workingRooms } from '../engine/hospital/requirements';
import { demolishRefund, emptySite, furnishOf, hospitalOf, priceOf, rulesOf, type SiteCommand } from '../engine/hospital/site';
import { siteOfPreset } from '../engine/hospital/site-preset';
import { presetStaff, salaryOf, type StaffMember, staffingOf } from '../engine/hospital/staff';
import type { Notice } from '../engine/shift/types';
import { clock, genitive, type Lang, money, named, setLang, T } from '../i18n';
import type { Walker } from '../render/crowd';
import { ICONS } from '../render/icons';
import { bakeLook, lodOf, packPeople, type People } from '../render/bake';
import { CATALOG, EXTRA_MODELS } from '../render/catalog';
import { Crowd } from '../render/crowd';
import { furnish, type Furnished } from '../render/furniture';
import { Ghosts } from '../render/ghost';
import { type Layout, layoutOf } from '../render/layout';
import { type Index, type Model, modelOf } from '../render/models';
import { Paths } from '../render/path';
import { Places } from '../render/place';
import { type PersonInfo, Population } from '../render/population';
import { Stage } from '../render/stage';
import type { Quality } from '../render/view';
import type { WallMode } from '../render/world';
import { H, KINDS } from '../sim/pack';
import { type Slice, SimClient } from '../sim/client';
import type { PathView, World } from '../sim/protocol';
import type { Actions, Hud, RoomCard, Speed, Store, Tab } from '../ui/store';
import { Builder, objectName, whyText } from './build';
import { Chips } from './chips';
import { dur, moodOf, pathCard, type PatientRow, patientRows, roomChip, roomLoads, tintOf } from './flow';
import { Labels } from './labels';

/** Больница и поток части 2а — вопросы к гейм-дизайну в спецификации, «Вопросы к гейм-дизайну». */
export const SCENE = { preset: 'preset.city', seed: 1, season: 'winter' as Season, flow: { perHour: 6, ambulancePerHour: 1 } };

/** С чего начать (spec docs/specs/2026-10-build.md, «Начало игры»): пустое здание или готовая больница 2а. */
export type Start = 'empty' | 'preset';

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
  /** больница из потока расчёта (у больницы ПК — с `site`), её план и что работает */
  hospital!: HospitalState;
  plan!: Plan;
  places!: Places;
  ghosts!: Ghosts;
  readonly builder = new Builder(this);
  /** стройка: потрачено и сколько действий можно отменить */
  works = { spent: 0, undo: 0 };
  start: Start = 'preset';
  private models = new Map<string, Model>();
  private staffed!: Staffing;
  private working = new Set<string>();
  /** выбранное помещение — по номеру в больнице: план после стройки другой */
  private roomSel: string | undefined;
  /** первый `world` из потока — та же больница, что окно отправило: сцену не пересобирать */
  private fresh = true;
  private labels!: Labels;
  /** часть 3: значки помещений, чей путь показан и он сам, ушедшие не дождавшись, причины «не работает», сломанное */
  chips!: Chips;
  private watching: string | null = null;
  private path: PathView | undefined;
  private left: { id: string; t: number }[] = [];
  private problems: ({ kind: Problem['kind'] | 'broken'; text: string } | undefined)[] = [];
  private broken = new Set<string>();
  /** первая зона ожидания (общая очередь к врачам) и кабинет человека штата — номера в плане */
  private hall = -1;
  private office: number[] = [];
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
  private mouse = { x: 0, y: 0, inside: false, drag: null as null | { x: number; y: number; moved: number; button: number }, keys: new Set<string>() };

  constructor(
    readonly db: ContentDb,
    readonly store: Store,
    readonly host: HTMLElement,
    readonly version: string,
  ) {}

  /** База, модели, больница, поток — и первый кадр. */
  static async create(host: HTMLElement, store: Store, version: string, quality: Quality, start: Start = 'preset'): Promise<Game> {
    const t0 = performance.now();
    store.set({ status: T.app.loading, version });
    const db = (await (await fetch('./content.json')).json()) as ContentDb;
    const g = new Game(db, store, host, version);
    g.start = start;
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
    const models = this.models;
    await Promise.all(names.map(async n => models.set(n, modelOf(await loadGltf(`${base}/${n}.glb`), n))));
    this.load.furniture = Math.round(performance.now() - tf);
    const tp = performance.now();
    await MeshoptSimplifier.ready;
    const raws = await Promise.all(index.people.map(async n => bakeLook(await loadGltf(`${base}/people/${n}.glb`), n)));
    this.people = packPeople(raws, raws.map(r => lodOf(r, 0.25, MeshoptSimplifier)));
    this.load.people = Math.round(performance.now() - tp);

    store.set({ status: T.app.loadingWorld });
    const ts = performance.now();
    // больница ПК (spec docs/specs/2026-10-build.md): пустое здание или готовая больница 2а в том же виде
    const rec = db.presets[SCENE.preset];
    const site = this.start === 'empty' ? emptySite() : siteOfPreset(db, rec);
    this.staff = this.start === 'empty' ? [] : presetStaff(db, rec);
    this.hospital = hospitalOf(db, site);
    this.setWorld(true, quality);
    this.load.scene = Math.round(performance.now() - ts);

    this.client = new SimClient('./sim.js');
    this.client.onSlice = s => this.onSlice(s);
    this.client.onError = m => store.set({ error: m });
    this.client.start({ kind: 'start', seed: SCENE.seed, season: SCENE.season, hospital: this.hospital, staff: this.staff, flow: SCENE.flow });
    // пустое здание — часы стоят, пока игрок не пустит их
    if (this.start === 'empty') this.speed = 0;
    this.bindInput();
    window.addEventListener('resize', () => this.stage.resize());
    store.set({ ready: true, status: '', quality, walls: this.stage.wallMode, speed: this.speed });
    requestAnimationFrame(this.loop);
  }

  /**
   * Больница (новая или после стройки) — на экран: план, раскладка, мебель, пути, места; сцена, толпа и население —
   * впервые или заново (люди остаются и идут к новым местам). Что работает, подписи, список штата, карточка.
   */
  private setWorld(first: boolean, quality: Quality = 'medium') {
    const { db, hospital } = this;
    const plan = planOf(db, hospital);
    const staffCells: [number, number][] = [];
    for (const m of this.staff) {
      const r = plan.rooms.find(x => x.id === m.room);
      const c = r?.staff[db.roles[m.role]?.stands ?? m.role] ?? r?.staff[m.role];
      if (c) staffCells.push([c[0], c[1]]);
    }
    const layout = layoutOf(db, plan, hospital.decor, staffCells);
    const furnished = furnish(layout, this.models);
    const walk = layout.walk.slice();
    for (const [x, y] of furnished.decor) walk[y * layout.w + x] = 0;
    const open = new Uint8Array(walk.length);
    for (let i = 0; i < open.length; i++) open[i] = plan.grid.cells[i] === 1 || plan.grid.cells[i] === 2 || plan.grid.cells[i] === 4 ? 1 : 0;
    const paths = new Paths(layout.w, layout.h, walk, open);
    const places = new Places(layout, furnished);
    if (first) {
      this.crowd = new Crowd(layout, paths, this.people.looks);
      this.layout = layout;
      this.pop = new Population(db, layout, places, this.crowd, this.people.looks, this.staff, hospital.rooms);
      this.pop.placeStaff();
      this.stage = new Stage({ host: this.host, layout, furnished, people: this.people, quality, capacity: 600 });
      this.ghosts = new Ghosts(this.models);
      this.stage.scene.add(this.ghosts.group);
      this.labels = new Labels(this.stage);
      this.chips = new Chips(this.stage);
      this.stage.iconOf = w => this.iconOf(w);
    } else {
      places.carry(this.places);
      this.stage.setLayout(layout, furnished);
      this.crowd.relayout(layout, paths);
      this.pop.relayout(layout, places, this.staff, hospital.rooms);
    }
    this.layout = layout;
    this.furnished = furnished;
    this.places = places;
    this.plan = plan;
    this.staffed = staffingOf(db, plan, this.staff);
    this.working = workingRooms(db, plan, this.staffed);
    this.texts();
    this.builder.refresh();
  }

  /** Слова о больнице — со стройкой и с языком: подписи помещений, список штата, «закрыта», типы помещений. */
  private texts() {
    const { db, plan } = this;
    // часть 3: первая причина «не работает» каждого помещения; сломанный с утра аппарат — если целого в помещении нет
    this.problems = plan.rooms.map(r => {
      const why = problemsOf(db, plan, r, this.staffed)[0];
      if (why) return { kind: why.kind, text: this.problemText(why) };
      const slots = r.equipment.flatMap((id, slot) => (id ? [slot] : []));
      if (db.rooms[r.type]?.needsEquipment && slots.length > 0 && slots.every(slot => this.broken.has(`${r.id}:${slot}`))) return { kind: 'broken' as const, text: T.flow.room.broken };
      return undefined;
    });
    this.hall = plan.rooms.findIndex(r => r.type === 'room.waiting' && r.door.length > 0);
    this.office = this.staff.map(m => plan.rooms.findIndex(r => r.id === m.room));
    this.labels.set(
      plan.rooms.map(r => {
        const why = problemsOf(db, plan, r, this.staffed);
        return { id: r.id, x: r.x + r.w / 2, z: r.y + r.h / 2, name: named(db.rooms[r.type]?.name, r.type), state: why.length ? T.problem.down(this.problemText(why[0])) : T.problem.works, ok: why.length === 0 };
      }),
    );
    this.store.set({
      staffList: this.staff.map(m => ({ key: `s:${m.id}`, text: `${named(db.roles[m.role]?.name, m.role)} · ${m.room ? named(db.rooms[plan.rooms.find(r => r.id === m.room)?.type ?? '']?.name, m.room) : T.card.reserve(1)}` })),
      closed: this.closedText(),
      roomTypes: Object.values(db.rooms)
        .map(t => {
          const r = rulesOf(db, t.id)!;
          return { id: t.id, name: named(t.name, t.id), min: T.build.from(r.smallest.w, r.smallest.h), price: T.build.perM2(money(r.smallest.cost / (r.smallest.w * r.smallest.h))) };
        })
        .sort((a, b) => a.name.localeCompare(b.name, document.documentElement.lang || undefined)),
    });
  }

  /** Больница ПК закрыта — почему: первое, без чего не открыть приём (`openBlocks`). */
  private closedText(): string | undefined {
    const { db, plan } = this;
    if (!this.hospital.site) return undefined;
    const b = openBlocks(db, plan, this.working, this.staffed)[0];
    if (!b) return undefined;
    const gen = genitive(db.rooms[b.room], b.room);
    if (b.kind === 'down') return T.problem.roomDown(named(db.rooms[b.room]?.name, b.room), this.problemText(b.problem));
    return T.problem.noRoom(gen);
  }

  /** Причина «не работает» словами. */
  problemText(p: Problem): string {
    const { db } = this;
    switch (p.kind) {
      case 'closed':
        return T.problem.closed;
      case 'leaving':
        return T.problem.leaving;
      case 'noDoor':
        return T.problem.noDoor;
      case 'singleDoor':
        return T.problem.singleDoor;
      case 'noPath':
        return T.problem.noPath;
      case 'noObject':
        return T.problem.noObject(T.objects[p.object as keyof typeof T.objects] ?? p.object, p.have, p.need);
      case 'noEquipment':
        return T.problem.noEquipment;
      case 'noStaff':
        return T.problem.noStaff(genitive(db.roles[p.role], p.role));
      case 'noPlace':
        return T.problem.noPlace;
    }
  }

  /** Команда стройки — в поток расчёта. */
  command(cmd: SiteCommand) {
    this.client.command({ kind: 'site', cmd });
  }

  /** Новая больница из потока (стройка, найм, убрали освободившееся). */
  private applyWorld(w: World) {
    if (w.works) this.works = w.works;
    this.broken = new Set(w.broken ?? []);
    this.hospital = w.hospital;
    this.staff = w.staff;
    if (this.fresh) {
      // та же больница, что окно отправило в `start`: сцена уже есть
      this.fresh = false;
      return;
    }
    this.setWorld(false);
  }

  // ---------------------------------------------------------------- поток расчёта

  private onSlice(s: Slice) {
    this.lastSlice = s;
    this.t = s.buf[H.t];
    this.day = s.buf[H.day];
    // новая больница — раньше людей: номера помещений в срезе — по её списку
    if (s.world) this.applyWorld(s.world);
    if (s.path && s.path.id === this.watching) this.path = s.path;
    this.pop.sync(s.buf, s.names);
    for (const n of s.notices) {
      if (n.kind === 'site') this.builder.onResult(n);
      else this.notice(n);
    }
    if (this.ff && this.ffStop(s.notices)) this.setSpeed(0);
  }

  private notice(n: Exclude<Notice, { kind: 'site' }>) {
    // ушёл, не дождавшись (часть 3): к выходу — со значком, в «Ушли» — с путём
    if (n.kind === 'left') {
      this.pop.markLeft(n.id);
      this.left.unshift({ id: n.id, t: this.t });
      if (this.left.length > 50) this.left.length = 50;
    }
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
    // стройка: клетка под курсором — и когда камера едет, а мышь стоит
    if (this.builder.on && this.mouse.inside) {
      const cell = this.cellAt(this.mouse.x, this.mouse.y);
      const h = this.builder.hover;
      if (cell?.[0] !== h?.[0] || cell?.[1] !== h?.[1]) this.builder.move(cell);
    }
    const a = performance.now();
    this.crowd.speed = this.ff ? 4 : this.speed;
    this.crowd.update(this.speed === 0 && !this.ff ? 0 : dt);
    const b = performance.now();
    this.stage.frame(dt, (this.t % 86400) / 3600, this.crowd, this.pop.paint, k => this.pop.triageOf(k), this.ringKey());
    this.labels.visible = this.builder.on;
    this.labels.frame();
    this.chips.visible = !this.builder.on;
    this.chips.frame();
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
    const sel = this.selectedInfo();
    const flow = this.flowHud();
    const room = this.roomSel ? this.roomCard(this.roomSel) : undefined;
    if (this.roomSel && !room) this.roomSel = undefined;
    this.store.set({
      build: this.builder.hud(),
      room,
      t: this.t, day: this.day, speed: this.speed, ff: this.ff,
      ...(s ? { arrived: s.buf[H.arrived], seen: s.buf[H.seen], left: s.buf[H.left], queue: s.buf[H.queue], lag: s.lag / 60, cash: s.buf[H.cash] === -2147483648 ? undefined : s.buf[H.cash] } : {}),
      notices: [...this.notices],
      ...flow,
      fps: Math.round(1000 / (mean || 1)),
      cpuMs: cpu,
      gpuMs: gs.length ? gs.reduce((x, y) => x + y, 0) / gs.length : null,
      people: this.crowd.walkers.size,
      selected: this.selected && sel ? { key: this.selected, info: sel } : undefined,
    });
  }

  // ---------------------------------------------------------------- люди и поток (spec docs/specs/2026-10-flow-ui.md)

  /** Значок над человеком: ушёл, не дождавшись, — «недоволен» до выхода; иначе — по срезу (`moodOf`). */
  private iconOf(w: Walker): number {
    if (w.staff) return -1;
    if (this.pop.leavingAngry(w.key)) return ICONS.indexOf('unhappy');
    const p = this.pop.now(w.key);
    const m = p ? moodOf(p, this.t) : undefined;
    return m ? ICONS.indexOf(m) : -1;
  }

  /** Кольцо выделения: у выбранного на карте; у ушедшего — пока он идёт к выходу. */
  private ringKey(): string | undefined {
    const sel = this.selected;
    return sel?.startsWith('id:') ? this.pop.walkerKey(sel.slice(3)) : sel;
  }

  /** Что показать о выбранном. Выбранный пациент ушёл с карты — карточка остаётся, с его путём (`id:<номер в движке>`). */
  private selectedInfo(): PersonInfo | undefined {
    const sel = this.selected;
    if (!sel) return undefined;
    if (sel.startsWith('id:')) return this.goneInfo(sel.slice(3));
    const info = this.pop.info(sel);
    if (info) return info;
    const id = this.pop.idOf(sel);
    this.selected = id ? `id:${id}` : undefined;
    return id ? this.goneInfo(id) : undefined;
  }

  private goneInfo(id: string): PersonInfo | undefined {
    const r = this.pop.rows.get(id);
    if (!r) return undefined;
    const last = this.pop.lastOf(id);
    return {
      kind: 'patient', id, sex: r.sex, age: r.age, ...(r.complaint ? { complaint: r.complaint } : {}), triage: last?.triage ?? 'green', doing: last?.doing ?? 'waiting',
      visit: KINDS[Number(last?.kind ?? 1)] ?? 'walkIn', gone: true,
    };
  }

  /** Названия для пути: кто врач — должность в родительном падеже («у терапевта»), что за обследование. */
  private readonly pathNames = {
    doctor: (staffId: string) => {
      const m = this.staff.find(x => x.id === staffId);
      return m ? genitive(this.db.roles[m.role], m.role) : T.flow.doctorAny;
    },
    exam: (id: Id) => ({ name: named(this.db.exams[id]?.name, id), kind: this.db.exams[id]?.kind ?? 'lab' }),
  };

  /** 10 раз в секунду: значки и цвет пола помещений, вкладка «Пациенты», «Ушли», путь выбранного. */
  private flowHud(): Pick<Hud, 'patients' | 'patientsAll' | 'gone' | 'path'> {
    const { db, plan, t } = this;
    const hud = this.store.get();
    const people = [...this.pop.patients()];
    const loads = roomLoads(people.map(([, p]) => p), plan, by => this.office[by] ?? -1, this.hall, t, type => !!(db.rooms[type]?.beds || db.rooms[type]?.emergency));
    const mine = doctorRoom(plan);
    this.chips.detailed = hud.layers.queues;
    this.chips.set(plan.rooms.map((r, i) => ({ id: r.id, x: r.x + r.w / 2, z: r.y + r.h / 2, chip: roomChip(loads[i], this.problems[i], r.id === mine) })));
    this.stage.tint.group.visible = hud.layers.queues;
    if (hud.layers.queues) this.stage.tint.set(loads.map((l, i) => tintOf(l, this.problems[i] !== undefined)));
    let patients: PatientRow[] = [];
    let patientsAll = 0;
    if (hud.tab === 'patients') {
      const list = people.map(([key, p]) => ({ ...p, key, id: p.row.id, title: T.card.patient(p.row.sex, p.row.age) }));
      ({ rows: patients, total: patientsAll } = patientRows(list, t, hud.patientFilter));
    }
    // ушёл, когда кончилось терпение: час — его срок из среза (извещение при промотке приходит позже), ждал — до него
    const gone: PatientRow[] = this.left.map(x => {
      const r = this.pop.rows.get(x.id);
      const last = this.pop.lastOf(x.id);
      const f = r?.sex === 'f';
      const text = last && last.limit >= 0 ? T.flow.goneRow(f, clock(last.limit), dur(last.limit - last.since)) : T.flow.goneAt(f, clock(x.t));
      return { key: `id:${x.id}`, id: x.id, title: r ? T.card.patient(r.sex, r.age) : x.id, text, triage: last?.triage ?? 'green' };
    });
    // путь выбранного пациента: поток расчёта кладёт его в срез, когда он изменился
    const sel = this.selected;
    const id = sel?.startsWith('id:') ? sel.slice(3) : sel?.startsWith('p:') ? this.pop.idOf(sel) : undefined;
    if ((id ?? null) !== this.watching) {
      this.watching = id ?? null;
      this.path = undefined;
      this.client.watch(this.watching);
    }
    let path: Hud['path'];
    if (id && this.path?.id === id) path = this.path.journey ? pathCard(this.path.journey, this.pop.rows.get(id)?.sex === 'f', t, this.pathNames) : { none: true };
    return { patients, patientsAll, gone, path };
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
      this.roomSel = undefined;
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
      this.texts();
    },
    // стройка (spec docs/specs/2026-10-build.md)
    toggleBuild: () => {
      this.builder.toggle();
      this.hud();
    },
    setTool: t => {
      this.builder.setTool(t);
      this.hud();
    },
    pickRoomType: id => {
      this.builder.pickRoomType(id);
      this.hud();
    },
    pickItem: (kind, eq) => {
      this.builder.pickItem(kind, eq);
      this.hud();
    },
    undo: () => this.command({ kind: 'undo' }),
    done: () => {
      if (this.builder.on) this.builder.toggle();
      this.hud();
    },
    furnish: room => this.command({ kind: 'furnish', room }),
    demolish: room => this.command({ kind: 'demolish', room }),
    hire: (room, role) => this.command({ kind: 'hire', room, role }),
    dismiss: id => this.command({ kind: 'dismiss', id }),
    // начало выбирают до игры (main.tsx)
    startGame: () => {},
    // часть 3 (spec docs/specs/2026-10-flow-ui.md)
    filterPatients: patch => {
      this.store.set({ patientFilter: { ...this.store.get().patientFilter, ...patch } });
      this.hud();
    },
    focus: key => {
      // к человеку на карте — камера летит; ушедший ещё идёт к выходу — к нему
      const walker = key.startsWith('id:') ? this.pop.walkerKey(key.slice(3)) : key;
      const w = walker ? this.crowd.walkers.get(walker) : undefined;
      if (w) this.stage.cam.flyTo(w.x, w.z);
      this.actions.select(key);
    },
    toggleLayers: () => {
      const l = this.store.get().layers;
      this.store.set({ layers: { ...l, open: !l.open } });
    },
    toggleQueues: () => {
      const l = this.store.get().layers;
      this.store.set({ layers: { ...l, queues: !l.queues } });
      this.hud();
    },
  };

  /** Карточка помещения по клику на пол. */
  private selectRoom(room: number) {
    this.selectRoomId(this.layout.plan.rooms[room]?.id);
  }

  /** Выбрать помещение (номер в больнице): карточка, в стройке — каталог предметов. */
  selectRoomId(id: string | undefined) {
    this.selected = undefined;
    this.roomSel = id;
    this.hud();
  }

  /** Помещение в клетке — выбрать; коридор — снять выбор. */
  selectRoomAt(cell: Cell) {
    const r = this.plan.rooms.find(x => cell[0] > x.x && cell[1] > x.y && cell[0] < x.x + x.w - 1 && cell[1] < x.y + x.h - 1);
    this.selectRoomId(r?.id);
  }

  get selectedRoom(): string | undefined {
    return this.roomSel;
  }

  /**
   * Карточка помещения: кто работает, сколько людей; у больницы ПК — размер, работает ли и почему нет, нужное с
   * отметками, должности с «Нанять» и «Уволить», «Обставить», «Снести», каталог предметов.
   */
  private roomCard(id: string): RoomCard | undefined {
    const { db, plan } = this;
    const n = plan.rooms.findIndex(r => r.id === id);
    if (n < 0) return undefined;
    const r = plan.rooms[n];
    const here = this.staff.filter(m => m.room === r.id);
    let people = 0;
    for (const w of this.crowd.walkers.values()) if (Math.floor(w.x) > r.x && Math.floor(w.x) < r.x + r.w - 1 && Math.floor(w.z) > r.y && Math.floor(w.z) < r.y + r.h - 1) people++;
    const base: RoomCard = { room: n, name: named(db.rooms[r.type]?.name, r.type), id: r.id, staff: here.map(m => named(db.roles[m.role]?.name, m.role)), people };
    const site = this.hospital.site;
    const room = site?.rooms.find(x => x.id === id);
    const rules = rulesOf(db, r.type);
    if (!site || !room || !rules) return base;
    const t = db.rooms[r.type];
    const why = problemsOf(db, plan, r, this.staffed);
    const live = room.items.filter(i => !i.leaving);
    const needs = rules.needs.map(x => ({ name: objectName(db, x.kind, r.type), need: x.n, have: live.filter(i => i.kind === x.kind && !i.eq).length }));
    if (t.needsEquipment) needs.push({ name: T.objects.machine, need: 1, have: live.filter(i => i.eq).length });
    const post = (m: StaffMember) => db.roles[m.role]?.stands ?? m.role;
    const mine = doctorRoom(plan) === r.id;
    const posts = t.staff.map(role => {
      const m = here.find(x => post(x) === role);
      const hire = role === DOCTOR ? (standInOf(db, DOCTOR) ?? role) : role;
      return {
        role, name: named(db.roles[hire]?.name, hire), salary: money(salaryOf(db, hire, 3)), ...(role === DOCTOR && mine ? { you: true } : {}),
        ...(m ? { who: `${named(db.roles[m.role]?.name, m.role)} · ${m.skill}`, staffId: m.id } : {}),
      };
    });
    const f = furnishOf(db, site, id);
    return {
      ...base, size: `${r.w} × ${r.h}`, ok: why.length === 0, state: why.length ? T.problem.down(this.problemText(why[0])) : T.problem.works,
      problems: why.map(p => this.problemText(p)), needs, posts,
      furnish: f.ok ? { ok: true, text: T.card.furnish(money(f.cost)) } : { ok: false, text: whyText(db, site, f.error) },
      demolish: T.card.demolish(money(demolishRefund(db, room))),
      catalog: [
        ...rules.kinds.map(k => ({ kind: k, name: objectName(db, k, r.type), price: money(priceOf(db, k)) })),
        ...rules.equipment.map(eq => ({ kind: db.equipment[eq].sprite, eq, name: named(db.equipment[eq].name, eq), price: money(priceOf(db, db.equipment[eq].sprite, eq)) })),
      ],
    };
  }

  /** Клетка участка под точкой экрана. */
  private cellAt(x: number, y: number): Cell | undefined {
    const c = this.stage.pickCell(x, y, this.layout);
    return c ? [c.x, c.z] : undefined;
  }

  /** Esc и ПКМ без протяжки: в стройке — призрак, инструмент, стройка; иначе — снять выбор. */
  private cancel() {
    if (this.builder.cancel()) this.hud();
    else this.actions.select(undefined);
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
        this.mouse.drag = { x: e.clientX, y: e.clientY, moved: 0, button: e.button };
        el.setPointerCapture(e.pointerId);
      } else if (e.button === 0) {
        // стройка: поставить, протянуть, взять
        if (this.builder.on) {
          el.setPointerCapture(e.pointerId);
          this.builder.down(this.cellAt(e.clientX, e.clientY));
          this.hud();
          return;
        }
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
      const dx = e.clientX - this.mouse.drag.x;
      const dy = e.clientY - this.mouse.drag.y;
      this.stage.cam.pan(dx, dy, el.clientHeight);
      this.mouse.drag = { x: e.clientX, y: e.clientY, moved: this.mouse.drag.moved + Math.abs(dx) + Math.abs(dy), button: this.mouse.drag.button };
    });
    el.addEventListener('pointerup', e => {
      if (e.button === 0 && this.builder.on) {
        this.builder.up(this.cellAt(e.clientX, e.clientY));
        this.hud();
      }
      const d = this.mouse.drag;
      if (!d || d.button !== e.button) return;
      this.mouse.drag = null;
      // ПКМ без протяжки — отменить (геймдизайн §12); с протяжкой — сдвиг камеры
      if (e.button === 2 && d.moved < 5) this.cancel();
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
      else if (k === 'Escape') this.cancel();
      // часть 3: L — слой «Очереди и загрузка», Tab — вкладка «Пациенты» (геймдизайн §12)
      else if (k === 'KeyL') this.actions.toggleQueues();
      else if (k === 'Tab') {
        e.preventDefault();
        this.actions.setTab(this.store.get().tab === 'patients' ? null : 'patients');
      }
      // стройка (геймдизайн §12): B — стройка, R — повернуть, Ctrl+Z — отменить
      else if (k === 'KeyB') this.actions.toggleBuild();
      else if (k === 'KeyR' && this.builder.on) {
        this.builder.rotate();
        this.hud();
      } else if (k === 'KeyZ' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (this.hospital.site) this.actions.undo();
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

