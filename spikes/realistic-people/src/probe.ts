// Общее для всех видов пробы: флаг готовности и числа для tools/shots.mjs, загрузка текстур с замером времени.
import * as THREE from 'three';

export interface ProbeState {
  ready: boolean;
  error?: string;
  stats: Record<string, unknown>;
}

declare global {
  interface Window {
    __probe: ProbeState;
  }
}

window.__probe = { ready: false, stats: {} };
export const stats = window.__probe.stats;

export function done() {
  window.__probe.ready = true;
}

export function fail(e: unknown) {
  const msg = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
  window.__probe.error = msg;
  window.__probe.ready = true;
  const app = document.getElementById('app')!;
  app.innerHTML = '';
  const pre = document.createElement('div');
  pre.className = 'err';
  pre.textContent = msg;
  app.appendChild(pre);
}

/** Дождаться n кадров браузера (тени, окружение и программы шейдеров успевают собраться). */
export function frames(n = 2): Promise<void> {
  return new Promise(resolve => {
    let k = 0;
    const f = () => (++k >= n ? resolve() : requestAnimationFrame(f));
    requestAnimationFrame(f);
  });
}

export const ms = (t0: number) => Math.round(performance.now() - t0);

const texLoader = new THREE.TextureLoader();
const texCache = new Map<string, Promise<THREE.Texture>>();
/** Сколько всего ушло на загрузку и разбор текстур (мс) и байт файлов — для отчёта. */
export const texTotals = { ms: 0, bytes: 0, count: 0 };

/** Текстура из файла: цвет — sRGB, данные (нормали, блеск) — линейные. */
export function tex(url: string, color = true, anisotropy = 8): Promise<THREE.Texture> {
  const key = `${url}|${color}`;
  let p = texCache.get(key);
  if (!p) {
    const t0 = performance.now();
    p = texLoader.loadAsync(url).then(t => {
      t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = anisotropy;
      texTotals.ms += performance.now() - t0;
      texTotals.count++;
      const img = t.image as HTMLImageElement;
      texTotals.bytes += img.naturalWidth * img.naturalHeight * 4;
      return t;
    });
    texCache.set(key, p);
  }
  return p;
}

/** Память видеокарты под текстуру без сжатия: RGBA8 и мипмапы (+1/3). */
export const gpuBytes = (w: number, h: number) => Math.round(w * h * 4 * (4 / 3));

/** Холст WebGL заданного размера в элементе; `scale` — во сколько раз больше точек, чем на экране (сглаживание). */
export function renderer(host: HTMLElement, w: number, h: number, scale = 1, antialias = true): THREE.WebGLRenderer {
  const r = new THREE.WebGLRenderer({ antialias, powerPreference: 'high-performance', preserveDrawingBuffer: true });
  r.setPixelRatio(scale);
  r.setSize(w, h);
  r.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(r.domElement);
  return r;
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', parent?: HTMLElement, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent?.appendChild(e);
  return e;
}
