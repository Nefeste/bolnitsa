// Сцена 3D-вида (spec docs/specs/2026-10-shell-3d.md, «Больница на экране», «Свет, качество, камера»): участок, полы,
// стены со срезом, двери со створками, светильники, мебель, люди, значки срочности и выделение; свет по часам смены,
// пресеты качества, мягкое затенение, выбор человека и помещения мышью, снимки. Часть 3 (spec
// docs/specs/2026-10-flow-ui.md): значки над людьми — отдельным проходом поверх кадра (`over`), слой очередей — цвет пола.
import * as THREE from 'three';
import type { People } from './bake';
import type { Crowd, Walker } from './crowd';
import { buildDoors, type Doors } from './doors';
import { batchMeshes, type Furnished } from './furniture';
import { GpuTimer } from './gpu';
import { Highlight, type RoomRect } from './highlight';
import { Icons } from './icons';
import { buildLamps, type Lamps } from './lamps';
import { Columns } from './columns';
import { DoorStripes } from './stripes';
import { FloorTint } from './overlay';
import { type Layout, roomAt } from './layout';
import { type Paint, PeopleView } from './people';
import { YOU } from './population';
import { Post } from './post';
import { createRenderer, Daylight, gpuString, IsoCamera, PRESETS, type Quality } from './view';
import type { FloorKind, FloorTex } from './textures';
import { buildFloors, buildGround, buildRoof, buildWalls, type WallMode, type Walls } from './world';

export interface StageInit {
  host: HTMLElement;
  layout: Layout;
  furnished: Furnished;
  people: People;
  quality: Quality;
  /** сколько людей самое большее (размер буферов экземпляров) */
  capacity: number;
}

/** Цвет значка над головой: «красный» и «жёлтый» по сортировке. */
const MARK = { red: new THREE.Color(0xd8392b), yellow: new THREE.Color(0xe7b416) };
/** Метка вашей фигуры — синяя: не путается со срочностью (красный, жёлтый). */
const YOU_MARK = 0x2f7fe0;

export class Stage {
  readonly scene = new THREE.Scene();
  readonly cam: IsoCamera;
  readonly light: Daylight;
  renderer: THREE.WebGLRenderer;
  private post: Post | null = null;
  walls: Walls;
  /** крыша только для теней: солнце в помещения — через окна (spec 2026-10-aaa-polish, «Свет, часть 2») */
  private roof: THREE.Mesh;
  doors: Doors;
  lamps: Lamps;
  readonly view: PeopleView;
  private floors: THREE.Mesh[];
  /** слитые сетки мебели — пересобираются стройкой */
  private furniture: THREE.Mesh[];
  /** текстуры пола — одни на сцену: стройка пересобирает полы, а не рисует их заново; их же берут миниатюры каталога */
  readonly floorTex = new Map<FloorKind, FloorTex>();
  readonly aniso: number;
  private marks: THREE.InstancedMesh;
  /** выделение и наведение: рамки помещений, кольца у людей, вспышки стройки */
  readonly highlight = new Highlight();
  /** поверх готового кадра: значки над людьми (часть 3) */
  readonly over = new THREE.Scene();
  readonly icons: Icons;
  /** значок над человеком: номер в `ICONS` (icons.ts) или -1 — задаёт игра */
  iconOf: (w: Walker) => number = () => -1;
  /** слой «Очереди и загрузка»: цвет пола помещений */
  readonly tint = new FloorTint();
  /** отделения (spec docs/specs/2026-10-departments.md, часть 2): слой «Отделения» и полосы на полу у дверей */
  readonly deptTint = new FloorTint();
  readonly stripes = new DoorStripes();
  /** слой «Показатели» (spec docs/specs/2026-10-metrics-layer.md): столбики над помещениями */
  readonly columns = new Columns();
  /** метка вашей фигуры */
  private you: THREE.Mesh;
  quality: Quality;
  wallMode: WallMode = 'down';
  gpu: GpuTimer;
  gpuName: string;
  /** вызовов отрисовки и треугольников в последнем кадре */
  calls = 0;
  tris = 0;
  private hourShown = -1;
  private host: HTMLElement;

  constructor(private init: StageInit) {
    const { layout, furnished, people, host } = init;
    this.host = host;
    this.quality = init.quality;
    this.cam = new IsoCamera(layout.w, layout.h);
    this.cam.overview();
    this.light = new Daylight(this.scene, layout.w, layout.h);
    this.renderer = createRenderer(host, init.quality);
    this.gpu = new GpuTimer(this.renderer.getContext() as WebGL2RenderingContext);
    this.gpuName = gpuString(this.renderer);
    this.aniso = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    for (const m of buildGround(layout, this.aniso)) this.scene.add(m);
    this.lamps = buildLamps(layout);
    this.floors = buildFloors(layout, this.aniso, this.lamps.lightMap, this.floorTex);
    for (const m of this.floors) this.scene.add(m);
    this.walls = buildWalls(layout);
    this.scene.add(this.walls.mesh);
    this.roof = buildRoof(layout);
    this.scene.add(this.roof);
    this.doors = buildDoors(layout);
    this.scene.add(this.doors.mesh);
    this.scene.add(this.lamps.mesh);
    this.furniture = batchMeshes(furnished.batch);
    for (const m of this.furniture) this.scene.add(m);
    this.view = new PeopleView(people, init.capacity);
    this.scene.add(this.view.group);
    // атласы и маски людей (59 видов, spec docs/specs/2026-10-people.md) — на видеокарту при загрузке: иначе каждый уходит
    // туда в тот кадр, когда вид впервые виден, и первые минуты игры дёргаются
    for (const look of people.looks) for (const t of [look.map, look.mask]) if (t) this.renderer.initTexture(t);
    // значки срочности над головой и кольцо выделения у ног
    this.marks = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.13, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }), init.capacity);
    this.marks.count = 0;
    this.marks.frustumCulled = false;
    this.marks.setColorAt(0, MARK.red);
    this.scene.add(this.marks);
    this.scene.add(this.highlight.group);
    // туман: земля за участком растворяется в цвете фона, а не обрывается краем плоскости; границы — по камере в кадре
    this.scene.fog = new THREE.Fog(0x2a3236, 1, 1000);
    this.icons = new Icons(init.capacity);
    this.over.add(this.icons.mesh);
    this.tint.setLayout(layout);
    this.scene.add(this.tint.group);
    this.deptTint.setLayout(layout);
    this.scene.add(this.deptTint.group);
    this.stripes.setLayout(layout, this.lamps.lightMap);
    this.scene.add(this.stripes.group);
    this.columns.setLayout(layout);
    this.scene.add(this.columns.group);
    // ваша фигура (spec docs/specs/2026-10-doctor-mode.md): синяя стрелка остриём вниз над головой
    this.you = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.34, 4).rotateX(Math.PI), new THREE.MeshBasicMaterial({ color: YOU_MARK }));
    this.you.visible = false;
    this.scene.add(this.you);
    this.applyQuality(init.quality);
    this.walls.setMode(this.wallMode);
  }

  /**
   * Новая раскладка после стройки (spec docs/specs/2026-10-build.md, «Отрисовка»): полы, стены, двери, светильники и мебель
   * — заново; участок, свет, камера, люди и пресет — те же.
   */
  setLayout(layout: Layout, furnished: Furnished) {
    const drop = (o: THREE.Object3D) => {
      this.scene.remove(o);
      o.traverse(x => {
        const m = x as THREE.Mesh;
        if (!m.isMesh) return;
        m.geometry.dispose();
        for (const mat of Array.isArray(m.material) ? m.material : [m.material]) mat.dispose();
      });
    };
    for (const m of this.floors) drop(m);
    drop(this.walls.mesh);
    drop(this.roof);
    drop(this.doors.mesh);
    drop(this.lamps.mesh);
    this.lamps.lightMap.dispose();
    for (const m of this.furniture) drop(m);
    this.lamps = buildLamps(layout);
    this.floors = buildFloors(layout, this.aniso, this.lamps.lightMap, this.floorTex);
    for (const m of this.floors) this.scene.add(m);
    this.walls = buildWalls(layout);
    this.walls.setMode(this.wallMode);
    this.scene.add(this.walls.mesh);
    this.roof = buildRoof(layout);
    this.scene.add(this.roof);
    this.doors = buildDoors(layout);
    this.scene.add(this.doors.mesh);
    this.scene.add(this.lamps.mesh);
    this.furniture = batchMeshes(furnished.batch);
    for (const m of this.furniture) this.scene.add(m);
    this.tint.setLayout(layout);
    this.deptTint.setLayout(layout);
    this.stripes.setLayout(layout, this.lamps.lightMap);
    this.columns.setLayout(layout);
    // свет пола и светильники — по часу заново
    this.hourShown = -1;
  }

  /** Сменить пресет: разрешение, тени, отражения, затенение и сглаживание (своим буфером кадра). */
  applyQuality(q: Quality) {
    this.quality = q;
    const p = PRESETS[q];
    this.renderer.setPixelRatio(Math.max(0.5, (window.devicePixelRatio || 1) * p.scale));
    this.light.setShadowSize(p.shadowSize);
    this.light.setEnv(this.renderer, p.env);
    this.view.setShadows(p.peopleShadows);
    this.post?.dispose();
    this.post = p.ao > 0 || p.msaa > 0 ? new Post(this.renderer, this.scene, this.cam.camera, p.ao || 8, p.msaa) : null;
    if (this.post && p.ao === 0) this.post.intensity = 0;
    this.resize();
  }

  setWalls(m: WallMode) {
    this.wallMode = m;
    this.walls.setMode(m);
  }

  resize(w = this.host.clientWidth, h = this.host.clientHeight) {
    this.renderer.setSize(w, h, true);
    this.cam.aspect = w / Math.max(1, h);
    this.post?.setSize();
  }

  /**
   * Кадр: камера, срез стен, двери, светильники, люди, свет по часу смены — и отрисовка. `pick` — что выделить: выбранное и
   * наведённое помещение, человек под курсором (spec 2026-10-aaa-polish, «Выделение и наведение»).
   */
  frame(dt: number, hour: number, crowd: Crowd, paint: (w: Walker) => Paint, triageOf: (key: string) => string | undefined, selected?: string, pick?: { room: RoomRect | null; selRoom: RoomRect | null; under?: string }) {
    const cam = this.cam;
    cam.update(dt);
    this.columns.frame(dt);
    const u = this.walls.uniforms;
    u.uFocus.value.set(cam.target.x, cam.target.z);
    u.uRadius.value = Math.max(6, cam.half * 0.55);
    cam.toCam(u.uToCam.value);
    if (Math.abs(hour - this.hourShown) > 0.02) {
      this.hourShown = hour;
      this.light.setHour(hour);
      // полосы у дверей — в свете пола (stripes.ts)
      this.lamps.setHour(hour, [...this.floors.map(m => m.material as THREE.MeshStandardMaterial), this.stripes.material]);
      u.uNight.value = this.light.night;
    }
    const fog = this.scene.fog as THREE.Fog;
    fog.color.copy(this.light.background);
    fog.near = cam.distance + cam.half * 2.2;
    fog.far = cam.distance + cam.half * 6 + 40;
    this.lamps.update(u, cam.half);
    this.doors.update(dt, (x, z, r) => crowd.near(x, z, r), u);
    const cull = cam.half * Math.max(1, cam.aspect) * 1.25 + 3;
    this.view.update(crowd, paint, cam.target, cull, cam.half <= PRESETS[this.quality].fullHalf);
    this.updateMarks(crowd, triageOf);
    const feet = (key: string | undefined) => {
      const w = key ? crowd.walkers.get(key) : undefined;
      // у ног; у лежащего — на постели
      return w ? { x: w.x, y: w.lie > 0.5 ? w.y : 0, z: w.z } : null;
    };
    this.highlight.update(dt, pick?.selRoom ?? null, pick?.room ?? null, feet(selected), feet(pick?.under));
    this.icons.update(crowd, this.iconOf, cam.half);
    this.updateYou(crowd);
    this.draw();
  }

  private m4 = new THREE.Matrix4();
  private updateMarks(crowd: Crowd, triageOf: (key: string) => string | undefined) {
    let n = 0;
    const spin = (performance.now() / 600) % (Math.PI * 2);
    for (const w of crowd.walkers.values()) {
      if (w.staff) continue;
      const t = triageOf(w.key);
      if (t !== 'red' && t !== 'yellow') continue;
      const lying = w.lie > 0.5;
      // над головой: у сидящего голова ниже (люди набора — 1,6–1,76 м, сидя — около 1,2 м)
      const sitting = w.state === 'sit' || w.state === 'sitDown' || w.state === 'standUp';
      const h = lying ? w.y + 0.75 : sitting ? w.y + 1.5 : w.y + 2.0;
      this.m4.makeRotationY(spin).setPosition(w.x, h, w.z);
      this.marks.setMatrixAt(n, this.m4);
      this.marks.setColorAt(n, MARK[t]);
      n++;
    }
    this.marks.count = n;
    this.marks.instanceMatrix.needsUpdate = true;
    if (this.marks.instanceColor) this.marks.instanceColor.needsUpdate = true;
  }

  /** Метка над вашей фигурой: покачивается, чтобы её было видно и на общем плане. */
  private updateYou(crowd: Crowd) {
    const w = crowd.walkers.get(YOU);
    this.you.visible = !!w;
    if (!w) return;
    const sitting = w.state === 'sit' || w.state === 'sitDown' || w.state === 'standUp';
    const bob = Math.sin(performance.now() / 300) * 0.06;
    this.you.position.set(w.x, (sitting ? w.y + 1.65 : w.y + 2.15) + bob, w.z);
    this.you.rotation.y = (performance.now() / 900) % (Math.PI * 2);
  }

  private draw() {
    const r = this.renderer;
    const camera = this.cam.camera;
    // счёт вызовов и треугольников — за весь кадр (тени, сцена, затенение, сведение), а не за последний проход
    r.info.autoReset = false;
    r.info.reset();
    this.gpu.begin();
    if (this.post) {
      this.post.grade.copy(this.light.grade);
      this.post.vignette = this.light.vignette;
      this.post.setCamera(camera);
      this.post.render(camera);
    } else {
      r.setRenderTarget(null);
      r.render(this.scene, camera);
    }
    // значки над людьми — поверх: без затенения и перевода в тон, сквозь стены
    if (this.icons.mesh.count > 0) {
      r.autoClear = false;
      r.render(this.over, camera);
      r.autoClear = true;
    }
    this.gpu.end();
    this.calls = r.info.render.calls;
    this.tris = r.info.render.triangles;
  }

  /** Человек под курсором: ближайший к точке экрана, не дальше 30 точек. */
  pickPerson(clientX: number, clientY: number, crowd: Crowd): string | undefined {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector3();
    let best: string | undefined;
    let bestD = 30 * 30;
    for (const w of crowd.walkers.values()) {
      if (w.lie > 0.5) v.set(w.x, w.y + 0.3, w.z);
      else v.set(w.x, w.y + 0.9, w.z);
      v.project(this.cam.camera);
      if (v.z > 1) continue;
      const sx = rect.left + ((v.x + 1) / 2) * rect.width;
      const sy = rect.top + ((1 - v.y) / 2) * rect.height;
      const d = (sx - clientX) ** 2 + (sy - clientY) ** 2;
      if (d < bestD) {
        bestD = d;
        best = w.key;
      }
    }
    return best;
  }

  /** Помещение плана под курсором — по столбику слоя «Показатели»; слоя нет или мимо — -1. */
  pickColumn(clientX: number, clientY: number): number {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    return this.columns.pick(ndc, this.cam.camera);
  }

  /** Клетка пола под курсором и помещение в ней (-1 — коридор). */
  pickCell(clientX: number, clientY: number, layout: Layout): { x: number; z: number; room: number } | undefined {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.cam.camera);
    const hit = new THREE.Vector3();
    if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit)) return undefined;
    const x = Math.floor(hit.x);
    const z = Math.floor(hit.z);
    if (x < 0 || z < 0 || x >= layout.w || z >= layout.h) return undefined;
    return { x, z, room: roomAt(layout.plan, x, z) };
  }

  /** Точка на экране, где человек: для сценария в браузере. */
  screenOf(w: Walker): { x: number; y: number } | undefined {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector3(w.x, w.y + (w.lie > 0.5 ? 0.3 : 0.9), w.z).project(this.cam.camera);
    if (v.z > 1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1) return undefined;
    return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
  }

  /** Точка экрана над серединой клетки (x, y) пола: для сценария в браузере. */
  screenOfCell(x: number, y: number): { x: number; y: number } | undefined {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector3(x + 0.5, 0, y + 0.5).project(this.cam.camera);
    if (v.z > 1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1) return undefined;
    return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
  }

  /** Снимок `w`×`h`: холст на время получает этот размер, кадр читается сразу после отрисовки. */
  shot(w: number, h: number, crowd: Crowd, paint: (w: Walker) => Paint, triageOf: (key: string) => string | undefined, hour: number): string {
    const pr = this.renderer.getPixelRatio();
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(w, h, false);
    this.cam.aspect = w / h;
    this.post?.setSize();
    this.frame(0, hour, crowd, paint, triageOf);
    const url = this.renderer.domElement.toDataURL('image/png');
    this.renderer.setPixelRatio(pr);
    this.resize();
    return url;
  }
}
