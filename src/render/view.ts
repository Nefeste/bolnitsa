// из spikes/render-3d: src/view.ts — изменено: участок любого размера; пресеты — с мягким затенением и выборками;
// солнце идёт по часам смены; камера двигается и клавишами; камера летит к человеку из списка (spec 2026-10-flow-ui).
//
// Отрисовщик, свет и камера. Пресеты качества меняют тени, сглаживание, затенение и разрешение кадра; сглаживание
// задаётся при создании контекста WebGL, поэтому смена пресета пересоздаёт WebGLRenderer — геометрия и текстуры
// загружаются в видеокарту заново сами.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export type Quality = 'low' | 'medium' | 'high';
export const QUALITIES: Quality[] = ['low', 'medium', 'high'];

export interface Preset {
  /** доля разрешения экрана (с учётом devicePixelRatio) */
  scale: number;
  /** MSAA: выборок на точку; 0 — без сглаживания */
  msaa: number;
  shadowSize: number;
  peopleShadows: boolean;
  /** окружение для отражений PBR (RoomEnvironment) */
  env: boolean;
  /** мягкое затенение (GTAO): выборок; 0 — нет */
  ao: number;
  /** полные модели людей — только если камера ближе этого (половина высоты кадра, м); 0 — всегда упрощённые */
  fullHalf: number;
}

export const PRESETS: Record<Quality, Preset> = {
  low: { scale: 0.75, msaa: 0, shadowSize: 1024, peopleShadows: false, env: false, ao: 0, fullHalf: 0 },
  medium: { scale: 1, msaa: 4, shadowSize: 2048, peopleShadows: true, env: true, ao: 8, fullHalf: 9 },
  high: { scale: 1, msaa: 4, shadowSize: 4096, peopleShadows: true, env: true, ao: 16, fullHalf: 16 },
};

export function createRenderer(host: HTMLElement, q: Quality, preserve = false): THREE.WebGLRenderer {
  const p = PRESETS[q];
  // сглаживание — в своём буфере кадра (post.ts), у холста его нет: затенение работает с глубиной этого буфера
  const r = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false, preserveDrawingBuffer: preserve });
  r.setPixelRatio(Math.max(0.5, (window.devicePixelRatio || 1) * p.scale));
  r.setSize(host.clientWidth, host.clientHeight);
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFShadowMap;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 0.82;
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.domElement.style.display = 'block';
  host.appendChild(r.domElement);
  return r;
}

export function gpuString(r: THREE.WebGLRenderer): string {
  const gl = r.getContext();
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  return `WebGL2: ${name}`;
}

// ---------------------------------------------------------------- свет и время суток

/** Отражения окружения (RoomEnvironment): днём — доля, ночью — на столько меньше: окружение — комната при дневном свете. */
const ENV_DAY = 0.3;
const ENV_NIGHT_DROP = 0.75;

export class Daylight {
  readonly sun = new THREE.DirectionalLight(0xffffff, 3);
  readonly hemi = new THREE.HemisphereLight(0xdfe9f2, 0x8a7f70, 1.2);
  private envTex: THREE.Texture | null = null;
  private envOwner: THREE.WebGLRenderer | null = null;
  hour = 12;
  /** доля ночи 0–1 по последнему `setHour` — для окружения и проверок */
  night = 0;
  /** цвет фона по часу — его же берёт туман сцены (stage.ts): край земли растворяется в фоне */
  readonly background = new THREE.Color(0x2a3236);
  /**
   * Цвет кадра по часу — множитель в последнем проходе (post.ts; spec 2026-10-aaa-polish, «Свет, часть 2»): рассвет
   * холодный, полдень ровный, вечер тёплый, ночь чуть синее; и виньетка — ночью сильнее.
   */
  readonly grade = new THREE.Color(1, 1, 1);
  vignette = 0.2;

  constructor(
    private scene: THREE.Scene,
    private w: number,
    private h: number,
  ) {
    const s = this.sun;
    s.castShadow = true;
    const cam = s.shadow.camera;
    // одна карта теней на весь участок (каскады не нужны: камера не уходит к горизонту)
    const r = Math.max(w, h) * 0.75 + 4;
    cam.left = -r;
    cam.right = r;
    cam.top = r;
    cam.bottom = -r;
    cam.near = 1;
    cam.far = 220;
    s.shadow.bias = -0.0004;
    s.shadow.normalBias = 0.03;
    s.target.position.set(w / 2, 0, h / 2);
    scene.add(s, s.target, this.hemi);
  }

  /**
   * Окружение для отражений. Его текстура — результат отрисовки в конкретном контексте WebGL: после пересоздания
   * отрисовщика (смена пресета) её надо сделать заново, иначе отражения берутся из пустой текстуры и сцена темнеет.
   */
  setEnv(r: THREE.WebGLRenderer, on: boolean) {
    if (this.envOwner !== r && this.envTex) {
      this.envTex.dispose();
      this.envTex = null;
    }
    this.envOwner = r;
    if (on && !this.envTex) {
      const pm = new THREE.PMREMGenerator(r);
      this.envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
      pm.dispose();
    }
    if (!on && this.envTex) {
      this.envTex.dispose();
      this.envTex = null;
    }
    this.scene.environment = this.envTex;
    this.scene.environmentIntensity = ENV_DAY * (1 - this.night * ENV_NIGHT_DROP);
  }

  setShadowSize(n: number) {
    const s = this.sun.shadow;
    if (s.mapSize.x !== n) {
      s.mapSize.set(n, n);
      s.map?.dispose();
      s.map = null;
    }
  }

  /** Час 0–24: солнце с востока (+x) на запад, цвет и сила — по высоте; ночью — синий фон и внутренний свет. */
  setHour(hour: number) {
    this.hour = hour;
    const t = (hour - 6) / 14; // 0 — 6:00, 1 — 20:00
    const az = Math.PI * (0.15 + 0.7 * Math.min(1, Math.max(0, t)));
    const el = Math.max(0.05, Math.sin(Math.PI * Math.min(1, Math.max(0, t)))) * 1.05;
    const dist = 110;
    const dir = new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), -Math.sin(az) * Math.cos(el) * 0.6 - 0.35).normalize();
    this.sun.position.copy(this.sun.target.position).addScaledVector(dir, dist);
    const low = 1 - Math.min(1, el / 0.6);
    // сумерки — с 18:30 до 20:00 (зима; дневная смена кончается в 20:00): к вечеру видно свет светильников
    const night = hour >= 18.5 ? Math.min(1, (hour - 18.5) / 1.5) : hour < 6.5 ? 1 - Math.max(0, hour - 6) / 0.5 : 0;
    this.night = night;
    // ночью солнца нет — остаётся слабый холодный свет неба, чтобы читались силуэты вне помещений
    const warm = new THREE.Color(0xfff4e6).lerp(new THREE.Color(0xff8a3c), low).lerp(new THREE.Color(0x8fa6c8), night);
    this.sun.color.copy(warm);
    this.sun.intensity = (1.6 + 2.2 * (1 - low)) * (1 - night * 0.95);
    // вечером и ночью внутри горит свет: рассеянный свет гаснет заметно (spec 2026-10-aaa-polish, «Свет»: в 21:30 кадр
    // был таким же светлым, как днём), а помещения держат тёплые пятна светильников на полу (lamps.ts) — не темнота
    this.hemi.color.set(0xdfe9f2).lerp(new THREE.Color(0xffd6a8), low * 0.45).lerp(new THREE.Color(0xb8b0a0), night * 0.6);
    this.hemi.intensity = 0.75 - low * 0.12 - night * 0.42;
    this.hemi.groundColor.set(0x8a7f70).lerp(new THREE.Color(0x5c4a3a), night);
    this.scene.environmentIntensity = ENV_DAY * (1 - night * ENV_NIGHT_DROP);
    // фон — тёмный: за участком ничего нет (замечание владельца: не плоская зелень до горизонта)
    this.background.set(0x2a3236).lerp(new THREE.Color(0x3a3430), low * 0.5).lerp(new THREE.Color(0x141a24), night);
    this.scene.background = this.background;
    // тёплый вечер — пик в 18:00; холодный рассвет — до 9:00; ночью кадр чуть синее
    const evening = hour >= 15.5 ? Math.max(0, 1 - Math.abs(hour - 18) / 2.5) * (1 - night) : 0;
    const dawn = hour < 9 ? Math.min(1, (9 - hour) / 2) * (1 - night) : 0;
    this.grade.setRGB(1 + 0.06 * evening - 0.03 * dawn - 0.03 * night, 1 - 0.01 * evening - 0.01 * night, 1 - 0.08 * evening + 0.05 * dawn + 0.04 * night);
    this.vignette = 0.2 + 0.1 * night;
  }
}

// ---------------------------------------------------------------- камера

export type Projection = 'ortho' | 'persp';

/** Сколько секунд масштаб доходит до цели почти целиком (каждое мгновение — доля оставшегося пути). */
const ZOOM_RATE = 14;

/** Камера сверху под углом: точка взгляда на земле, поворот на 45° + k·90°, наклон 52°. */
export class IsoCamera {
  readonly target: THREE.Vector3;
  /** половина высоты видимой области, м; задана прямо — сразу, колесом — плавно к `halfTo` */
  private _half = 22;
  private halfTo = 22;
  /** точка земли, которая при плавном масштабе остаётся под курсором (нет — середина кадра) */
  private anchor: { x: number; z: number } | null = null;
  yaw = Math.PI / 4;
  private yawTo = Math.PI / 4;
  pitch = THREE.MathUtils.degToRad(52);
  // выбор пробы: перспектива с узким углом (spikes/render-3d/README.md, «Орто или перспектива»)
  projection: Projection = 'persp';
  readonly ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 500);
  readonly persp = new THREE.PerspectiveCamera(20, 1, 1, 700);
  aspect = 16 / 9;
  /** куда камера летит (вкладка «Пациенты»: клик — к человеку); сдвиг, масштаб, общий план — отменяют */
  private fly: { x: number; z: number; half: number } | null = null;

  constructor(
    private w: number,
    private h: number,
  ) {
    this.target = new THREE.Vector3(w / 2, 0, h / 2);
  }

  get camera(): THREE.PerspectiveCamera | THREE.OrthographicCamera {
    return this.projection === 'ortho' ? this.ortho : this.persp;
  }

  get half(): number {
    return this._half;
  }

  /** Масштаб сразу, без плавности (снимки, сценарий, бенч, общий план). */
  set half(v: number) {
    this._half = this.halfTo = v;
    this.anchor = null;
  }

  /** Наименьший и наибольший масштаб: крупный план человека и весь участок. */
  get halfRange(): [number, number] {
    return [3, Math.max(this.w, this.h) * 0.75];
  }

  /** Расстояние от камеры до точки взгляда (перспектива; орто стоит на 200 м). */
  get distance(): number {
    return this.projection === 'ortho' ? 200 : this._half / Math.tan(THREE.MathUtils.degToRad(this.persp.fov / 2));
  }

  rotate(steps: number) {
    this.yawTo += (steps * Math.PI) / 2;
  }

  setYawNow(y: number) {
    this.yaw = this.yawTo = y;
  }

  /** Вектор по земле от точки взгляда к камере. */
  toCam(out = new THREE.Vector2()): THREE.Vector2 {
    return out.set(Math.sin(this.yaw), Math.cos(this.yaw));
  }

  /** Сдвиг точки взгляда на dx, dy точек экрана (высота экрана — hPx). */
  pan(dxPx: number, dyPx: number, hPx: number) {
    this.fly = null;
    const k = (2 * this._half) / hPx;
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.target.addScaledVector(right, -dxPx * k);
    this.target.addScaledVector(fwd, (dyPx * k) / Math.sin(this.pitch));
    this.clampTarget();
  }

  private clampTarget() {
    this.target.x = THREE.MathUtils.clamp(this.target.x, -5, this.w + 5);
    this.target.z = THREE.MathUtils.clamp(this.target.z, -5, this.h + 5);
  }

  /**
   * Приблизить (k < 1) или отдалить в k раз — плавно, за несколько кадров; `anchor` — точка земли под курсором: она
   * остаётся на своём месте экрана, как в картах, — к ней и приближаются. Без неё — к середине кадра.
   */
  zoom(k: number, anchor?: { x: number; z: number } | null) {
    this.fly = null;
    const [lo, hi] = this.halfRange;
    this.halfTo = THREE.MathUtils.clamp(this.halfTo * k, lo, hi);
    this.anchor = anchor ?? null;
  }

  /** Точка земли (y = 0) под точкой экрана в долях −1…1; камера смотрит вниз, луч всегда встречает землю. */
  groundAt(ndcX: number, ndcY: number, out = new THREE.Vector3()): THREE.Vector3 | undefined {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), out) ?? undefined;
  }

  overview() {
    this.fly = null;
    this.target.set(this.w / 2, 0, this.h / 2);
    this.half = Math.max(this.h * 0.7, this.w * 0.4);
  }

  /** Плавно к точке (x, z) участка; ближе `half`, если камера дальше. */
  flyTo(x: number, z: number, half = 9) {
    this.fly = { x, z, half: Math.min(this._half, half) };
    this.anchor = null;
  }

  /**
   * «Следить» (spec docs/specs/2026-10-owner-play-2.md): точка взгляда плавно идёт за человеком в (x, z); масштаб колесом
   * — к нему, а не к курсору.
   */
  track(x: number, z: number, dt: number) {
    this.fly = null;
    this.anchor = null;
    const k = Math.min(1, dt * 6);
    this.target.x += (x - this.target.x) * k;
    this.target.z += (z - this.target.z) * k;
    this.clampTarget();
  }

  /** Летит ли камера сейчас. */
  get flying(): boolean {
    return this.fly !== null;
  }

  /** Меняется ли масштаб сейчас (колесо). */
  get zooming(): boolean {
    return Math.abs(this.halfTo - this._half) > 1e-4;
  }

  update(dt: number) {
    if (this.fly) {
      // за полсекунды почти долетает: каждое мгновение — доля оставшегося пути
      const k = Math.min(1, dt * 7);
      this.target.x += (this.fly.x - this.target.x) * k;
      this.target.z += (this.fly.z - this.target.z) * k;
      this.half += (this.fly.half - this.half) * k;
      if (Math.abs(this.fly.x - this.target.x) + Math.abs(this.fly.z - this.target.z) < 0.02 && Math.abs(this.fly.half - this.half) < 0.02) {
        this.target.x = this.fly.x;
        this.target.z = this.fly.z;
        this.half = this.fly.half;
        this.fly = null;
      }
    } else if (this.zooming) {
      // плавный масштаб колесом; точка под курсором стоит на месте: камера — подобие с центром в ней, поэтому точка
      // взгляда сдвигается к ней на ту же долю, на какую меняется масштаб (по земле и по экрану — одна геометрия)
      const h0 = this._half;
      this._half += (this.halfTo - this._half) * Math.min(1, dt * ZOOM_RATE);
      if (Math.abs(this.halfTo - this._half) < 0.005) this._half = this.halfTo;
      if (this.anchor) {
        const s = this._half / h0;
        this.target.x += (this.anchor.x - this.target.x) * (1 - s);
        this.target.z += (this.anchor.z - this.target.z) * (1 - s);
        this.clampTarget();
      }
      if (!this.zooming) this.anchor = null;
    }
    const d = this.yawTo - this.yaw;
    this.yaw += Math.abs(d) < 1e-3 ? d : d * Math.min(1, dt * 10);
    const dir = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    const a = this.aspect;
    const o = this.ortho;
    o.left = -this.half * a;
    o.right = this.half * a;
    o.top = this.half;
    o.bottom = -this.half;
    o.position.copy(this.target).addScaledVector(dir, 200);
    o.lookAt(this.target);
    o.updateProjectionMatrix();
    // перспектива с узким углом: расстояние, при котором видна та же высота
    const p = this.persp;
    p.aspect = a;
    const dist = this.half / Math.tan(THREE.MathUtils.degToRad(p.fov / 2));
    p.near = Math.max(1, dist - 90);
    p.far = dist + 160;
    p.position.copy(this.target).addScaledVector(dir, dist);
    p.lookAt(this.target);
    p.updateProjectionMatrix();
    p.updateMatrixWorld();
    o.updateMatrixWorld();
  }
}
