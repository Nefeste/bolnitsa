// Игра в окне (spec docs/specs/2026-10-shell-3d.md; стройка — docs/specs/2026-10-build.md): база и модели, больница —
// пустое здание или готовая больница движка, поток расчёта, 3D-вид, толпа по срезу, часы и скорости, ввод, стройка,
// панели. Всё, что знает игра, — здесь; панели только читают хранилище и просят. Люди и поток (spec
// docs/specs/2026-10-flow-ui.md): значки над людьми и помещениями, вкладка «Пациенты», путь выбранного, слой очередей.
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { MeshoptSimplifier } from 'three/addons/libs/meshopt_simplifier.module.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { Cell, ContentDb, Id, Season } from '../content/types';
import { type HospitalState, type Plan, planOf } from '../engine/hospital/build';
import { type Block, DOCTOR, doctorRoom, openBlocks, type Problem, problemsOf, standInOf, standInsOf, type Staffing, workingRooms } from '../engine/hospital/requirements';
import { demolishRefund, emptySite, furnishOf, hospitalOf, priceOf, readyCost, rulesOf, type Site, type SiteCommand, type SiteResult } from '../engine/hospital/site';
import { siteOfPlan } from '../engine/hospital/site-plan';
import { siteOfPreset } from '../engine/hospital/site-preset';
import { dutyOf, onDuty, payOf, presetStaff, salaryOf, type Shift, shiftAt, type StaffMember, staffingOf, withNightShift } from '../engine/hospital/staff';
import type { CrewView } from '../engine/shift/crew';
import type { Notice } from '../engine/shift/types';
import { clock, genitive, type Lang, money, named, setLang, T } from '../i18n';
import type { Walker } from '../render/crowd';
import { ICONS } from '../render/icons';
import { bakeLook, lodOf, packPeople, type People } from '../render/bake';
import { CATALOG, EXTRA_MODELS } from '../render/catalog';
import { Crowd } from '../render/crowd';
import { furnish, type Furnished } from '../render/furniture';
import { Ghosts } from '../render/ghost';
import type { RoomRect } from '../render/highlight';
import { type Layout, layoutOf } from '../render/layout';
import { type Index, type Model, modelOf } from '../render/models';
import { Paths } from '../render/path';
import { Places } from '../render/place';
import { type PersonInfo, Population, YOU } from '../render/population';
import { Stage } from '../render/stage';
import type { Quality } from '../render/view';
import type { WallMode } from '../render/world';
import type { SeenList } from '../sim/doctor';
import { H, KINDS } from '../sim/pack';
import { type Slice, SimClient } from '../sim/client';
import type { PathView, World } from '../sim/protocol';
import type { Actions, Hud, RoomCard, Speed, Store, Tab } from '../ui/store';
import { Builder, objectName, whyText } from './build';
import { Chips } from './chips';
import { Doctor } from './doctor';
import { chipShown, dur, moodOf, pathCard, type PatientRow, patientRows, roomChip, roomLoads, tintOf } from './flow';
import { type HintKey, hintOf } from './hints';
import { HoverLabel } from './hover';
import { Labels } from './labels';
import { Money } from './money';
import { startCash } from '../engine/shift/money';
import { GAME_PER_REAL } from '../engine/shift/walking';
import type { Flow } from '../engine/shift/types';
import type { SaveFile, SaveMeta } from '../sim/packing';
import { type Disk, listSlots, nextManual, pageDisk, removeSlot, type ShellSaves, writeAuto, writeSlot } from './saves';

/**
 * Больница и поток части 2а — вопросы к гейм-дизайну в спецификации, «Вопросы к гейм-дизайну». С частью 5б поток игры — от
 * больницы (`AUTO`, spec docs/specs/2026-10-economy.md); числа сцены — для авто-бенча и снимков (та же толпа, что прежде) и
 * для сценария в браузере (`?flow=6,1`).
 */
export const SCENE = { preset: 'preset.city', poly: 'site.polyclinic', seed: 1, season: 'winter' as Season, flow: { perHour: 6, ambulancePerHour: 1 } };
/** Поток от больницы (spec docs/specs/2026-10-economy.md): кабинеты, места смотровой, репутация. */
export const AUTO: Flow = { perHour: 0, auto: true };

/**
 * С чего начать (spec docs/specs/2026-10-build.md, «Начало игры»): пустое здание, готовая больница 2а или поликлиника из
 * готовых помещений (spec docs/specs/2026-10-real-hospital.md).
 */
export type Start = 'empty' | 'preset' | 'poly';

/**
 * Больница начала и её люди: поликлиника — по записи базы, той же функцией, что команда стройки `ready`. Со сменами (spec
 * docs/specs/2026-10-staff-shifts.md): все — дневная смена; городская работает и ночью — и с ночной сменой.
 */
function hospitalAt(db: ContentDb, start: Start): { site: Site; staff: StaffMember[] } {
  if (start === 'empty') return { site: emptySite(), staff: [] };
  if (start === 'poly') {
    const p = siteOfPlan(db, db.sites![SCENE.poly]);
    // сборка базы проверяет, что план строится и всё в нём работает (tools/content/load.ts, checkSites)
    if (!p.ok) throw new Error(`${SCENE.poly}: room ${p.room} — ${p.error.kind}`);
    return { site: p.site, staff: withNightShift(db, p.site.rooms, p.staff) };
  }
  const rec = db.presets[SCENE.preset];
  const site = siteOfPreset(db, rec);
  return { site, staff: withNightShift(db, site.rooms, presetStaff(db, rec)) };
}

/**
 * Игровых секунд в секунду на ×1 — «спокойный» темп, решение владельца 17.10.2026 (spec docs/specs/2026-10-walk.md): приём
 * на экране — около 23 секунд, люди идут 1,6 м/с, и движок считает их дорогу с той же скоростью. Число — у движка
 * (`src/engine/shift/walking.ts`): скорость пешком в движке выводится из него.
 */
export { GAME_PER_REAL };

/** Мост к оболочке Electron (electron/preload.cjs); в браузере его нет. */
export interface ShellBridge {
  save(json: string): Promise<string>;
  saveShot(name: string, dataUrl: string): Promise<string>;
  metrics(): Promise<{ workingSetMB: number; privateMB: number; byType: Record<string, number> }>;
  info(): Promise<Record<string, unknown>>;
  firstFrame(ms: number): void;
  relaunch(args: string[]): void;
  args(): Promise<string[]>;
  /** сохранения в папке игры (spec docs/specs/2026-10-saves.md) */
  saves: ShellSaves;
  /** окно закрывают: сохраниться и позвать `closeNow` */
  onClosing(cb: () => void): void;
  closeNow(): void;
}

/** Вид окна в сохранении (spec docs/specs/2026-10-saves.md): камера, уровень медицины, автопауза. */
export interface SavedView {
  camera?: { x: number; z: number; half: number; yaw: number; projection: 'persp' | 'ortho' };
  level?: string;
  autopause?: boolean;
}

/** Где лежат сохранения: папка игры в Electron, хранилище страницы в браузере. */
export function diskOf(): Disk {
  return window.shell?.saves ?? pageDisk();
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

/**
 * Открыть игру заново (spec docs/specs/2026-10-saves.md): загрузить сохранение (`load`) или новая игра — экран начала.
 * Качество и язык остаются; с чего начинать, зерно и поток — нет.
 */
function reopen(extra: Record<string, string>) {
  const q = new URLSearchParams(location.search);
  for (const k of ['load', 'hospital', 'seed', 'flow', 'start']) q.delete(k);
  for (const [k, v] of Object.entries(extra)) q.set(k, v);
  location.search = q.toString();
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
  /** режим врача (spec docs/specs/2026-10-doctor-mode.md): карта пациента, окно врача, фигура */
  readonly doctor = new Doctor(this);
  /** касса и планёрка (spec docs/specs/2026-10-economy.md) */
  readonly money = new Money(this);
  /** поток: от больницы или числа (авто-бенч, снимки, `?flow=`) */
  flow: Flow = AUTO;
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
  /** подпись под курсором (spec docs/specs/2026-10-aaa-polish.md, «Выделение и наведение») */
  private hoverLabel!: HoverLabel;
  /** под курсором: человек или помещение (номер в плане; -1 — нет) — для подсветки и подписи */
  private under: { key?: string; room: number } = { room: -1 };
  /** состояние каждого помещения словами — и когда значок над ним скрыт — для подписи под курсором */
  private roomState: string[] = [];
  /** подсказки первых минут (spec 2026-10-aaa-polish): закрытые игроком; смотрел ли он уже карточку или вкладку */
  private seenHints = new Set<HintKey>();
  private looked = false;
  /** часть 3: значки помещений, чей путь показан и он сам, ушедшие не дождавшись, причины «не работает», сломанное */
  chips!: Chips;
  private watching: string | null = null;
  private path: PathView | undefined;
  private left: { id: string; t: number }[] = [];
  /** «Приняты» (spec docs/specs/2026-10-discharged-card.md): приняты и ушли за сутки — как прислал поток расчёта */
  private seen: SeenList = { rows: [], total: 0 };
  private problems: ({ kind: Problem['kind'] | 'broken' | 'offShift'; text: string } | undefined)[] = [];
  private broken = new Set<string>();
  /** усталость и перерывы врачей в смене — как прислал поток расчёта (spec docs/specs/2026-10-staff-shifts.md, часть 2) */
  private crew = new Map<string, CrewView>();
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
  /** смена часов среза (spec docs/specs/2026-10-staff-shifts.md): сменилась — кто на месте и что работает, заново */
  private shift: Shift = 'day';
  /** кто на месте в любую смену: помещение, где в этой смене никого, а в другой есть, — «закрыто до …», а не поломка */
  private full: Staffing = () => false;
  lastSlice: Slice | null = null;
  selected: string | undefined;
  /** «Следить» (spec docs/specs/2026-10-owner-play-2.md): за кем идёт камера — ключ человека на карте */
  private following: string | undefined;
  /** сохранения (spec docs/specs/2026-10-saves.md): где лежат, что открыли при старте, запись по очереди */
  readonly disk: Disk = diskOf();
  private loaded: SaveFile | undefined;
  private saving: Promise<unknown> = Promise.resolve();
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
  /** `loaded` — открыть сохранение (spec docs/specs/2026-10-saves.md): больница, поток и вид — из него, часы на паузе. */
  static async create(host: HTMLElement, store: Store, version: string, quality: Quality, start: Start = 'preset', flow: Flow = AUTO, loaded?: SaveFile): Promise<Game> {
    const t0 = performance.now();
    store.set({ status: T.app.loading, version });
    const db = (await (await fetch('./content.json')).json()) as ContentDb;
    const g = new Game(db, store, host, version);
    g.start = start;
    g.flow = loaded?.state.flow ?? flow;
    g.loaded = loaded;
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
    // больница ПК (spec docs/specs/2026-10-build.md): пустое здание, готовая больница 2а в том же виде или поликлиника;
    // сохранение — его больница
    const saved = this.loaded?.state;
    // часы сохранения — до первого среза: кто в смене, тот и на местах (spec docs/specs/2026-10-staff-shifts.md)
    if (saved) this.t = saved.t;
    if (saved?.hospital) {
      this.staff = saved.staff ?? [];
      this.hospital = saved.hospital;
    } else {
      const { site, staff } = hospitalAt(db, this.start);
      this.staff = staff;
      this.hospital = hospitalOf(db, site);
    }
    this.setWorld(true, quality);
    this.load.scene = Math.round(performance.now() - ts);

    this.client = new SimClient('./sim.js');
    this.client.onSlice = s => this.onSlice(s);
    this.client.onError = m => store.set({ error: m });
    // зерно смены — из адреса (`?seed=`; сценарий в браузере берёт смену, где просьба приходит рано), иначе — сцены
    const seed = Number(new URLSearchParams(location.search).get('seed')) || SCENE.seed;
    // касса (spec docs/specs/2026-10-economy.md): пустое здание — бюджет песочницы, готовая больница и поликлиника — его доля
    if (saved) this.client.load(saved);
    else this.client.start({ kind: 'start', seed, season: SCENE.season, hospital: this.hospital, staff: this.staff, flow: this.flow, economy: { cash: startCash(this.db, this.start) } });
    this.applyView(this.loaded?.view);
    this.doctor.start();
    this.money.start();
    // пустое здание — часы стоят, пока игрок не пустит их; сохранение — тоже: осмотреться
    if (this.start === 'empty' || saved) this.speed = 0;
    this.loaded = undefined;
    void this.refreshSaves();
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
      this.pop.setTime(this.t);
      this.pop.placeStaff();
      this.stage = new Stage({ host: this.host, layout, furnished, people: this.people, quality, capacity: 600 });
      this.ghosts = new Ghosts(this.models);
      this.stage.scene.add(this.ghosts.group);
      this.labels = new Labels(this.stage);
      this.chips = new Chips(this.stage);
      this.hoverLabel = new HoverLabel();
      this.stage.iconOf = w => this.iconOf(w);
    } else {
      places.carry(this.places);
      this.stage.setLayout(layout, furnished);
      this.crowd.relayout(layout, paths);
      this.pop.relayout(layout, places, this.staff, hospital.rooms);
      this.doctor.relayout();
    }
    this.layout = layout;
    this.furnished = furnished;
    this.places = places;
    this.plan = plan;
    this.onDuty();
    this.builder.refresh();
  }

  /**
   * Кто на месте и что работает — по смене часов (spec docs/specs/2026-10-staff-shifts.md): ночью помещение без ночной смены
   * не работает, и подписи говорят почему. Потом — слова о больнице.
   */
  private onDuty() {
    this.shift = shiftAt(this.db, this.t);
    this.staffed = staffingOf(this.db, this.plan, dutyOf(this.db, this.staff, this.t));
    this.full = staffingOf(this.db, this.plan, this.staff);
    this.working = workingRooms(this.db, this.plan, this.staffed);
    this.texts();
  }

  /**
   * Не поломка, а не его смена (spec docs/specs/2026-10-staff-shifts.md): в помещении нет людей этой смены, а людей другой
   * смены хватило бы — «закрыто до» начала следующей смены.
   */
  private offShift(p: Problem | undefined, r: Plan['rooms'][number]): string | undefined {
    if (p?.kind !== 'noStaff' || problemsOf(this.db, this.plan, r, this.full).some(x => x.kind === 'noStaff')) return undefined;
    return T.problem.offShift(clock(this.nextShift()));
  }

  /** Когда начнётся другая смена — час суток в секундах. */
  private nextShift(): number {
    const day = this.db.economy.staff.shifts?.day ?? [8, 20];
    return (this.shift === 'day' ? day[1] : day[0]) * 3600;
  }

  /** Больницу не открыть только потому, что сейчас не та смена: людей другой смены в этом помещении хватило бы. */
  private offShiftBlock(b: Block): boolean {
    const { db, plan } = this;
    return b.kind === 'down' && b.problem.kind === 'noStaff' && plan.rooms.some(r => r.type === b.room && !problemsOf(db, plan, r, this.full).some(x => x.kind === 'noStaff'));
  }

  /**
   * Строки «Персонала»: должность, место, смена и в смене ли сейчас (spec docs/specs/2026-10-staff-shifts.md); у врачей в
   * смене — усталость и перерыв (там же, часть 2).
   */
  private staffRows() {
    const { db, plan } = this;
    return this.staff.map(m => {
      const c = this.crew.get(m.id);
      const rest = c?.rest ? (c.rest.kind === 'toilet' ? T.card.wcShort : T.card.restShort(clock(c.rest.until))) : undefined;
      const room = m.room ? named(db.rooms[plan.rooms.find(r => r.id === m.room)?.type ?? '']?.name, m.room) : T.card.reserve(1);
      return {
        key: `s:${m.id}`,
        text: [named(db.roles[m.role]?.name, m.role), room, T.card.shifts[m.shift ?? 'both'], ...(c ? [T.card.fatigueShort(c.f)] : []), ...(rest ? [rest] : [])].join(' · '),
        ...(onDuty(db, m, this.t) ? { on: true as const } : {}),
      };
    });
  }

  /** Слова о больнице — со стройкой и с языком: подписи помещений, список штата, «закрыта», типы помещений. */
  private texts() {
    const { db, plan } = this;
    // часть 3: первая причина «не работает» каждого помещения; сломанный с утра аппарат — если целого в помещении нет
    this.problems = plan.rooms.map(r => {
      const why = problemsOf(db, plan, r, this.staffed)[0];
      const off = this.offShift(why, r);
      if (off) return { kind: 'offShift' as const, text: off };
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
        const off = this.offShift(why[0], r);
        return {
          id: r.id, x: r.x + r.w / 2, z: r.y + r.h / 2, name: named(db.rooms[r.type]?.name, r.type), state: off ?? (why.length ? T.problem.down(this.problemText(why[0])) : T.problem.works), ok: why.length === 0,
          ...(off ? { rest: true } : {}),
        };
      }),
    );
    this.store.set({
      staffList: this.staffRows(),
      closed: this.closedText(),
      night: this.nightText(),
      roomTypes: Object.values(db.rooms)
        .map(t => {
          const r = rulesOf(db, t.id)!;
          return { id: t.id, name: named(t.name, t.id), min: T.build.from(r.smallest.w, r.smallest.h), price: T.build.perM2(money(r.smallest.cost / (r.smallest.w * r.smallest.h))) };
        })
        .sort((a, b) => a.name.localeCompare(b.name, document.documentElement.lang || undefined)),
      // готовые помещения (spec docs/specs/2026-10-ready-rooms.md): образцы и цена готового целиком
      readyTypes: Object.values(db.rooms)
        .filter(t => t.sizes.length > 0)
        .map(t => {
          const sizes = t.sizes.map(z => ({ id: z.id, text: T.build.readySize(z.id, z.w, z.h, money(readyCost(db, t.id, z.id))) }));
          const low = Math.min(...t.sizes.map(z => readyCost(db, t.id, z.id)));
          return { id: t.id, name: named(t.name, t.id), sizes, price: sizes.length === 1 ? sizes[0].text : T.build.readyFrom(money(low)) };
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
    // не та смена (spec docs/specs/2026-10-staff-shifts.md): регистратура или кабинет врача ночью без ночной смены — не
    // поломка; об этом — спокойная строка (`nightText`)
    if (this.offShiftBlock(b)) return undefined;
    const gen = genitive(db.rooms[b.room], b.room);
    if (b.kind === 'down') return T.problem.roomDown(named(db.rooms[b.room]?.name, b.room), this.problemText(b.problem));
    return T.problem.noRoom(gen);
  }

  /**
   * Пришедших сами не примут, потому что сейчас не смена регистратуры или врача (spec docs/specs/2026-10-staff-shifts.md), а
   * часы приёма идут: игрок продлил их в ночь — сказать спокойно, до какого часа. Вне часов приёма — молчать: так и задумано.
   */
  private nightText(): string | undefined {
    const { db, plan } = this;
    if (!this.hospital.site) return undefined;
    const b = openBlocks(db, plan, this.working, this.staffed)[0];
    if (!b || !this.offShiftBlock(b)) return undefined;
    const [open, close] = this.money.hud.hours;
    const h = Math.floor((this.t % 86400) / 3600);
    return h >= open && h < close ? T.problem.nightClosed(clock(this.nextShift())) : undefined;
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
    // скорость до автопауз этого среза — к ней вернёт «Продолжить» планёрки (spec 2026-10-economy); «До утра» — ×1
    const was: Speed = this.ff ? 1 : this.speed;
    this.lastSlice = s;
    this.t = s.buf[H.t];
    this.day = s.buf[H.day];
    // новая больница — раньше людей: номера помещений в срезе — по её списку
    if (s.broken) this.broken = new Set(s.broken);
    if (s.world) this.applyWorld(s.world);
    // пересменка (spec docs/specs/2026-10-staff-shifts.md): что работает — по новой смене; сломанные аппараты (в 08:00, при
    // загрузке) — причины «не работает» заново, сцена та же
    if (shiftAt(this.db, this.t) !== this.shift) this.onDuty();
    else if (s.broken) this.texts();
    if (s.path && s.path.id === this.watching) this.path = s.path;
    if (s.seen) this.seen = s.seen;
    // смены (spec docs/specs/2026-10-staff-shifts.md): кто не в смене, а доводит приёмы, — ещё на месте
    if (s.late) this.pop.setLate(s.late);
    // усталость и перерывы (spec docs/specs/2026-10-staff-shifts.md, часть 2): люди идут отдыхать и назад, «Персонал» — заново
    if (s.crew) {
      this.crew = new Map(s.crew.map(c => [c.id, c]));
      this.pop.setCrew(s.crew);
      this.store.set({ staffList: this.staffRows() });
    }
    this.pop.sync(s.buf, s.names);
    for (const n of s.notices) {
      if (n.kind === 'site' && n.cmd === 'office') this.doctor.onOffice(n);
      else if (n.kind === 'site') {
        this.builder.onResult(n);
        this.flashOf(n);
      } else this.notice(n);
    }
    if (this.ff && this.ffStop(s.notices)) this.setSpeed(0);
    // режим врача: состояние, карта, автопауза — после «До утра», чтобы автопауза её остановила
    this.doctor.onSlice(s);
    // касса и планёрка (spec docs/specs/2026-10-economy.md): автопауза планёрки — тоже после «До утра»
    this.money.onSlice(s, was);
    if (s.doctor || s.card !== undefined || s.refused) this.hud();
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
      : n.kind === 'resultsReady' ? this.doctor.resultsText(n.id)
      : n.kind === 'arrest' ? T.notices.arrest
      : n.kind === 'consult' ? this.doctor.consultText(n)
      : n.kind === 'morning' ? T.notices.morning
      : n.kind === 'worse' ? this.doctor.worseText(n.id)
      : n.kind === 'reached' ? this.doctor.reachedText(n.id)
      : T.notices.shiftEnd;
    this.notices.unshift({ t: this.t, text });
    if (this.notices.length > 60) this.notices.length = 60;
    // утро — сохранение само (spec docs/specs/2026-10-saves.md): три последних утра
    if (n.kind === 'morning') void this.save('auto');
  }

  // ---------------------------------------------------------------- сохранения (spec docs/specs/2026-10-saves.md)

  /** Вид окна в сохранение: камера, уровень медицины, автопауза. */
  private viewOf(): SavedView {
    const c = this.stage.cam;
    return { camera: { x: c.target.x, z: c.target.z, half: c.half, yaw: c.yaw, projection: c.projection }, level: this.doctor.hud.level, autopause: this.doctor.hud.autopause };
  }

  /** Вид из сохранения; чего нет или не то — остаётся как есть. */
  private applyView(v: unknown) {
    const view = (v ?? {}) as SavedView;
    const c = view.camera;
    if (c && [c.x, c.z, c.half, c.yaw].every(Number.isFinite)) {
      this.stage.cam.target.set(c.x, 0, c.z);
      this.stage.cam.half = c.half;
      this.stage.cam.setYawNow(c.yaw);
      if (c.projection === 'persp' || c.projection === 'ortho') this.actions.setProjection(c.projection);
    }
    if (typeof view.autopause === 'boolean') this.doctor.hud.autopause = view.autopause;
    if (typeof view.level === 'string') this.doctor.restoreLevel(view.level);
  }

  /**
   * Сохранить: поток сжимает снимок с шапкой и видом, окно кладёт байты в ячейку — утреннюю (сдвигом), «при выходе» или
   * новую свою. Записи — строго по очереди; не вышло — строка в извещениях, игра идёт дальше.
   */
  save(kind: SaveMeta['kind']): Promise<SaveMeta | null> {
    const run = async () => {
      const { bytes, meta } = await this.client.pack({ kind, savedAt: new Date().toISOString(), version: this.version, start: this.start }, this.viewOf());
      if (kind === 'auto') await writeAuto(this.disk, bytes, meta);
      else await writeSlot(this.disk, kind === 'exit' ? 'exit' : await nextManual(this.disk), bytes, meta);
      await this.refreshSaves();
      this.notices.unshift({ t: this.t, text: kind === 'auto' ? T.saves.autoSaved(meta.day) : T.saves.saved(meta.day, clock(meta.t)) });
      this.hud();
      return meta;
    };
    const p = this.saving.then(run, run).catch(e => {
      this.notices.unshift({ t: this.t, text: T.saves.failed(e instanceof Error ? e.message : String(e)) });
      this.hud();
      return null;
    });
    this.saving = p;
    return p;
  }

  /** Список сохранений — для меню игры. */
  private async refreshSaves() {
    const rows = await listSlots(this.disk).catch(() => []);
    this.store.set({ menu: { ...this.store.get().menu, rows } });
  }

  /**
   * «До утра» (spec docs/specs/2026-10-economy.md) — до планёрки в 08:00; останавливается на событиях автопаузы (геймдизайн
   * §2): «красный», просьба нанятого врача, ваш лежащий стал хуже, планёрка. Скорая — не повод: её ведут нанятые врачи.
   */
  private ffStop(notices: Notice[]): boolean {
    if (this.t >= this.ffUntil) return true;
    return notices.some(n => (n.kind === 'arrived' && n.triage === 'red') || n.kind === 'consult' || n.kind === 'morning' || n.kind === 'worse' || n.kind === 'reached');
  }

  // ---------------------------------------------------------------- кадр

  private loop = (ts: number) => {
    requestAnimationFrame(this.loop);
    const dt = this.last ? Math.min(0.1, (ts - this.last) / 1000) : 0;
    if (this.last) this.push(this.frames.interval, ts - this.last);
    this.last = ts;
    this.onFrame?.(ts);
    if (!this.manual) {
      // «до утра»: столько, сколько поток успевает, — новый кусок, только когда прежний почти досчитан; последний — ровно до
      // 08:00, чтобы планёрка открылась в 08:00 (spec 2026-10-economy)
      const lag = this.lastSlice?.lag ?? 0;
      const game = this.ff ? (!this.client.busy && lag < 300 ? Math.max(0, Math.min(600, this.ffUntil - this.t - lag)) : 0) : this.speed * GAME_PER_REAL * dt;
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
    // люди идут с той скоростью, с какой их дорогу считает движок (spec 2026-10-walk): «До утра» — как на ×12
    this.crowd.speed = this.ff ? 12 : this.speed;
    this.crowd.rate = this.crowd.speed * GAME_PER_REAL;
    this.crowd.t = this.t;
    this.crowd.update(this.speed === 0 && !this.ff ? 0 : dt);
    // «Следить» (spec 2026-10-owner-play-2): камера — за человеком; ушёл с карты — остаётся, где он был
    if (this.following !== undefined) {
      const w = this.crowd.walkers.get(this.following);
      if (w) this.stage.cam.track(w.x, w.z, dt);
      else this.unfollow();
    }
    const b = performance.now();
    this.pickUnder();
    this.stage.frame(dt, (this.t % 86400) / 3600, this.crowd, this.pop.paint, k => this.pop.triageOf(k), this.ringKey(), this.pickOf());
    this.labels.visible = this.builder.on;
    this.labels.frame();
    this.chips.visible = !this.builder.on;
    this.chips.frame();
    this.hoverLabel.frame(this.mouse.x, this.mouse.y);
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
    // открыл карточку или вкладку — «щёлкните по человеку» больше не нужно (spec 2026-10-aaa-polish)
    if (this.selected || this.roomSel || this.store.get().tab) this.looked = true;
    this.store.set({
      build: this.builder.hud(),
      room,
      hint: this.hintNow(),
      t: this.t, day: this.day, speed: this.speed, ff: this.ff,
      ...(s ? { arrived: s.buf[H.arrived], seen: s.buf[H.seen], left: s.buf[H.left], queue: s.buf[H.queue], lag: s.lag / 60, cash: s.buf[H.cash] === -2147483648 ? undefined : s.buf[H.cash] } : {}),
      notices: [...this.notices],
      ...flow,
      fps: Math.round(1000 / (mean || 1)),
      cpuMs: cpu,
      gpuMs: gs.length ? gs.reduce((x, y) => x + y, 0) / gs.length : null,
      people: this.crowd.walkers.size,
      selected: this.selected && sel ? { key: this.selected, info: sel } : undefined,
      following: this.following !== undefined && this.following === this.ringKey(),
      doctor: { ...this.doctor.hud },
      economy: this.money.view(),
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
      kind: 'patient', id, ...(r.name ? { name: r.name } : {}), sex: r.sex, age: r.age, ...(r.complaint ? { complaint: r.complaint } : {}), triage: last?.triage ?? 'green', doing: last?.doing ?? 'waiting',
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
    role: (id: Id) => named(this.db.roles[id]?.name, id),
  };

  /** 10 раз в секунду: значки и цвет пола помещений, вкладка «Пациенты», «Приняты», «Ушли», путь выбранного. */
  private flowHud(): Pick<Hud, 'patients' | 'patientsAll' | 'gone' | 'seenRows' | 'seenAll' | 'path'> {
    const { db, plan, t } = this;
    const hud = this.store.get();
    const people = [...this.pop.patients()];
    const loads = roomLoads(people.map(([, p]) => p), plan, by => this.office[by] ?? -1, this.hall, t, type => !!(db.rooms[type]?.beds || db.rooms[type]?.emergency));
    const mine = doctorRoom(plan);
    this.chips.detailed = hud.layers.queues;
    const chips = plan.rooms.map((r, i) => roomChip(loads[i], this.problems[i], r.id === mine));
    // состояние словами — и у помещений без значка: его показывает подпись под курсором
    this.roomState = chips.map(c => c.long ?? c.text);
    this.chips.set(plan.rooms.flatMap((r, i) => (chipShown(chips[i], hud.layers.queues) ? [{ id: r.id, x: r.x + r.w / 2, z: r.y + r.h / 2, chip: chips[i] }] : [])));
    this.stage.tint.group.visible = hud.layers.queues;
    if (hud.layers.queues) this.stage.tint.set(loads.map((l, i) => tintOf(l, this.problems[i] !== undefined)));
    let patients: PatientRow[] = [];
    let patientsAll = 0;
    if (hud.tab === 'patients') {
      // записан к специалисту — так и в строке (spec docs/specs/2026-10-specialists.md)
      const title = (p: (typeof people)[number][1]) => {
        const who = T.card.patient(p.row.sex, p.row.age, p.row.name);
        return p.row.to ? `${who} · ${T.card.booked(this.names().dat(p.row.to))}` : who;
      };
      const list = people.map(([key, p]) => ({ ...p, key, id: p.row.id, title: title(p) }));
      ({ rows: patients, total: patientsAll } = patientRows(list, t, hud.patientFilter));
    }
    // ушёл, когда кончилось терпение: час — его срок из среза (извещение при промотке приходит позже), ждал — до него
    const gone: PatientRow[] = this.left.map(x => {
      const r = this.pop.rows.get(x.id);
      const last = this.pop.lastOf(x.id);
      const f = r?.sex === 'f';
      const text = last && last.limit >= 0 ? T.flow.goneRow(f, clock(last.limit), dur(last.limit - last.since)) : T.flow.goneAt(f, clock(x.t));
      return { key: `id:${x.id}`, id: x.id, title: r ? T.card.patient(r.sex, r.age, r.name) : x.id, text, triage: last?.triage ?? 'green' };
    });
    // приняты и ушли (spec docs/specs/2026-10-discharged-card.md): куда и когда, диагноз, кто вёл; карта — у каждого
    const seenRows: PatientRow[] = this.seen.rows.map(x => ({
      key: `id:${x.id}`, id: x.id, title: T.card.patient(x.sex, x.age, x.name), triage: x.triage,
      text: T.flow.seenRow(T.flow.seenWhere[x.setting] ?? T.flow.seenDone, clock(x.at), x.diagnosis, x.by ?? T.flow.seenYou),
    }));
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
    return { patients, patientsAll, gone, seenRows, seenAll: this.seen.total, path };
  }

  /** Панели — заново сейчас, а не через 100 мс (режим врача: ответ потока, открыть и закрыть карту). */
  refresh() {
    this.hud();
  }

  // ---------------------------------------------------------------- выделение, наведение, подсказки (spec docs/specs/2026-10-aaa-polish.md)

  /**
   * Что под курсором — каждый кадр: человек ближе 30 точек, иначе помещение. В стройке — только помещение, при протяжке
   * и сдвиге камеры — ничего; карта пациента и планёрка закрывают карту. Курсор над человеком — «рука»: по нему можно щёлкнуть.
   */
  private pickUnder() {
    const m = this.mouse;
    const modal = this.doctor.holding || this.money.open;
    if (!m.inside || m.drag || modal || this.builder.drag) this.under = { room: -1 };
    else {
      const key = this.builder.on ? undefined : this.stage.pickPerson(m.x, m.y, this.crowd);
      if (key) this.under = { key, room: -1 };
      else {
        const cell = this.stage.pickCell(m.x, m.y, this.layout);
        this.under = { room: cell && cell.room >= 0 ? cell.room : -1 };
      }
    }
    this.stage.renderer.domElement.style.cursor = this.under.key ? 'pointer' : '';
    this.hoverText();
  }

  /** Подпись под курсором: человек — кто и что делает; ваша фигура — «Вы — врач»; помещение — название и состояние. */
  private hoverText() {
    const u = this.under;
    const { db } = this;
    if (u.key === YOU) return this.hoverLabel.set(T.doctor.title, this.doctor.hud.state?.current ? T.doctor.openCard : undefined);
    if (u.key) {
      const info = this.pop.info(u.key);
      if (!info) return this.hoverLabel.set();
      if (info.kind === 'staff') return this.hoverLabel.set(named(db.roles[info.role]?.name, info.role), info.room ? this.names().room(info.room) : undefined);
      const what = info.door ? (info.walking ? T.card.toDoor : T.card.atDoor) : info.walking ? T.going[info.doing] : T.doing[info.doing];
      return this.hoverLabel.set(T.card.patient(info.sex, info.age, info.name), what);
    }
    const r = this.layout.plan.rooms[u.room];
    if (r) return this.hoverLabel.set(named(db.rooms[r.type]?.name, r.type), this.roomState[u.room]);
    this.hoverLabel.set();
  }

  /** Подпись под курсором словами — для сценария в браузере. */
  get hoverLabelText(): string {
    return this.hoverLabel.text;
  }

  /** Что подсветить на карте: выбранное и наведённое помещение, человек под курсором (кольцо выбранного — `ringKey`). */
  private pickOf(): { room: RoomRect | null; selRoom: RoomRect | null; under?: string } {
    const rooms = this.layout.plan.rooms;
    const rect = (r: (typeof rooms)[number] | undefined): RoomRect | null => (r ? { x: r.x, y: r.y, w: r.w, h: r.h } : null);
    return { selRoom: rect(this.roomSel ? rooms.find(r => r.id === this.roomSel) : undefined), room: rect(rooms[this.under.room]), under: this.under.key };
  }

  /** Отклик стройки: пол помещения вспыхивает — после удачи белым, после отказа красным; «Готово» — не действие. */
  private flashOf(n: SiteResult) {
    if (!n.room || n.cmd === 'done') return;
    const r = this.layout.plan.rooms.find(x => x.id === n.room);
    if (r) this.stage.highlight.flash({ x: r.x, y: r.y, w: r.w, h: r.h }, n.ok);
  }

  /** Подсказка первых минут — по тому, что движок знает о больнице (`openBlocks`), часам, пришедшим и просьбам. */
  private hintNow(): Hud['hint'] {
    const { db, plan } = this;
    if (!this.hospital.site || this.doctor.open || this.money.open) return undefined;
    const first = openBlocks(db, plan, this.working, this.staffed)[0];
    // ночью без ночной смены больница закрыта для пришедших сами — так и задумано, «Нанять» не подсказываем
    const block = first && !this.offShiftBlock(first) ? first : undefined;
    const b = this.builder;
    const key = hintOf(
      {
        ...(block ? { block } : {}), buildOn: b.on, drawing: (b.tool === 'room' && !!b.roomType) || (b.tool === 'ready' && !!b.ready), paused: this.speed === 0 && !this.ff,
        arrived: this.lastSlice?.buf[H.arrived] ?? 0, asks: this.doctor.hud.state?.asks.length ?? 0, looked: this.looked,
      },
      this.seenHints,
    );
    if (!key) return undefined;
    const h = T.hints;
    const name = block ? named(db.rooms[block.room]?.name, block.room) : '';
    const text = key === 'furnish' ? h.furnish(name) : key === 'door' ? h.door(name) : key === 'hire' ? h.hire(name) : key === 'machine' ? h.machine(name) : h[key];
    return { key, text };
  }

  // ---------------------------------------------------------------- действия панелей

  setSpeed(s: Speed) {
    this.speed = s;
    this.ff = false;
  }

  readonly actions: Actions = {
    setSpeed: s => {
      // ваш пациент перед вами, его карта открыта — часы стоят (spec 2026-10-owner-play-2); чужая карта — нет; планёрка —
      // «Продолжить» (spec 2026-10-economy)
      if (this.doctor.holding || this.money.open) return;
      this.doctor.manualSpeed();
      this.setSpeed(s);
      this.hud();
    },
    untilMorning: () => {
      if (this.doctor.holding || this.money.open) return;
      this.doctor.manualSpeed();
      // до планёрки в 08:00 (геймдизайн §2, «До утра»; spec 2026-10-economy) — как можно быстрее, до первого события автопаузы
      const day = Math.floor(this.t / 86400) * 86400;
      this.ffUntil = this.t % 86400 < 8 * 3600 ? day + 8 * 3600 : day + 86400 + 8 * 3600;
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
    overview: () => {
      this.following = undefined;
      this.stage.cam.overview();
    },
    rotate: k => this.stage.cam.rotate(k),
    select: key => {
      // выбрали другого — камера его отпускает (spec 2026-10-owner-play-2)
      if (key !== this.selected) this.following = undefined;
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
      this.doctor.relang();
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
    pickReady: (id, size) => {
      this.builder.pickReady(id, size);
      this.hud();
    },
    toggleReadyStaff: () => {
      this.builder.toggleStaff();
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
    hire: (room, role, as, shift) => this.command({ kind: 'hire', room, role, ...(as ? { as } : {}), ...(shift ? { shift } : {}) }),
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
    // «Найти» из панели врача (spec docs/specs/2026-10-owner-play.md): в больнице — к нему; идёт к выходу — к нему; ушёл —
    // карточка с путём
    find: id => this.actions.focus(this.pop.keyOf(id) ?? this.pop.walkerKey(id) ?? `id:${id}`),
    // «Следить» (spec docs/specs/2026-10-owner-play-2.md): камера держит выбранного в середине кадра; ещё раз — отпустить
    follow: () => {
      const key = this.ringKey();
      this.following = !key || this.following === key ? undefined : key;
      // издалека не разглядеть — ближе, плавно
      const half = this.stage.cam.half;
      if (this.following && half > 14) this.stage.cam.zoom(12 / half);
      this.hud();
    },
    toggleLayers: () => {
      const l = this.store.get().layers;
      this.store.set({ layers: { ...l, open: !l.open } });
    },
    // меню игры (spec docs/specs/2026-10-saves.md): сохранить, загрузить, удалить, новая игра
    toggleMenu: () => {
      const m = this.store.get().menu;
      this.store.set({ menu: { ...m, open: !m.open } });
      if (!m.open) void this.refreshSaves();
    },
    saveGame: () => void this.save('manual'),
    loadGame: slot => reopen({ load: slot }),
    deleteGame: slot => void removeSlot(this.disk, slot).then(() => this.refreshSaves()),
    newGame: () => reopen({}),
    toggleQueues: () => {
      const l = this.store.get().layers;
      this.store.set({ layers: { ...l, queues: !l.queues } });
      this.hud();
    },
    doctor: a => this.doctor.dispatch(a),
    money: a => this.money.dispatch(a),
    // подсказки первых минут и панель вида (spec docs/specs/2026-10-aaa-polish.md)
    dismissHint: () => {
      const h = this.store.get().hint;
      if (h) this.seenHints.add(h.key);
      this.hud();
    },
    toggleView: () => this.store.set({ viewOpen: !this.store.get().viewOpen }),
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
    // на место врача — терапевт или специалист (spec docs/specs/2026-10-specialists.md): терапевт первым
    const doctors = [...new Set([standInOf(db, DOCTOR), ...standInsOf(db, DOCTOR)].filter((x): x is Id => x !== undefined))];
    // смены (spec docs/specs/2026-10-staff-shifts.md): место — на две смены, у каждой свой человек; кто без смены (сохранение
    // до смен), тот на обеих — одной строкой; ночью зарплата дороже
    const posts = t.staff.flatMap((role): NonNullable<RoomCard['posts']> => {
      const hire = role === DOCTOR ? (standInOf(db, DOCTOR) ?? role) : role;
      const name = named(db.roles[hire]?.name, hire);
      if (role === DOCTOR && mine) return [{ role, name, salary: money(salaryOf(db, hire, 3)), you: true }];
      const all = here.filter(x => post(x) === role);
      const both = all.find(x => x.shift === undefined);
      return (both ? (['both'] as const) : (['day', 'night'] as const)).map(shift => {
        const m = shift === 'both' ? both : all.find(x => x.shift === shift);
        const pay = (x: Id) => money(payOf(db, salaryOf(db, x, 3), shift === 'both' ? undefined : shift));
        return {
          role, shift, name, salary: pay(hire),
          ...(m ? { who: `${named(db.roles[m.role]?.name, m.role)} · ${m.skill}`, staffId: m.id } : {}),
          ...(role === DOCTOR && doctors.length > 1
            ? { options: doctors.map(x => ({ role: x, name: named(db.roles[x]?.name, x), salary: pay(x), hint: named(db.roles[x]?.texts.hint) })) }
            : {}),
        };
      });
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
    if (this.doctor.close()) return;
    if (this.money.open) return this.money.dispatch({ kind: 'close' });
    if (this.builder.cancel()) this.hud();
    else if (this.store.get().menu.open) this.actions.toggleMenu();
    else if (this.following) this.unfollow();
    else this.actions.select(undefined);
  }

  /** Отпустить камеру (spec 2026-10-owner-play-2): сдвиг мышью или клавишами, Esc, общий план. */
  private unfollow() {
    if (this.following === undefined) return;
    this.following = undefined;
    this.hud();
  }

  // ---------------------------------------------------------------- ввод

  private bindInput() {
    const el = this.stage.renderer.domElement;
    el.addEventListener(
      'wheel',
      e => {
        e.preventDefault();
        // масштаб — плавно и к точке земли под курсором, как в картах (spec 2026-10-aaa-polish, «Камера»)
        const rect = el.getBoundingClientRect();
        const g = this.stage.cam.groundAt(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
        this.stage.cam.zoom(Math.exp(e.deltaY * 0.0012), g ? { x: g.x, z: g.z } : null);
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
        // ваша фигура — карта больного у вас в кабинете (spec 2026-10-doctor-mode)
        const yours = key === YOU ? this.doctor.hud.state?.current?.id : undefined;
        if (yours) this.actions.doctor({ kind: 'open', id: yours });
        else if (key && key !== YOU) this.actions.select(key);
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
      if (dx || dy) this.unfollow();
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
      // ваш пациент перед вами: клавиши игры молчат, Esc — закрыть карту (spec 2026-10-doctor-mode); чужая карта — нет
      if (this.doctor.holding && k !== 'Escape') return;
      if (k === 'Space') {
        e.preventDefault();
        this.actions.setSpeed(this.speed === 0 && !this.ff ? 1 : 0);
      } else if (k === 'Digit1') this.actions.setSpeed(1);
      else if (k === 'Digit2') this.actions.setSpeed(3);
      else if (k === 'Digit3') this.actions.setSpeed(12);
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
    if (dx || dy) {
      this.unfollow();
      this.stage.cam.pan(dx, dy, h);
    }
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
      dat: (id: string | undefined) => (id ? T.card.dat(named(db.roles[id]?.dat, ''), named(db.roles[id]?.name, id)) : '—'),
    };
  }

  /** Часы для снимков и сценария: «08:05». */
  clockText() {
    return clock(this.t);
  }
}

