// Подписи помещений на среднем плане (spec docs/specs/2026-10-aaa-polish.md, «Подписи помещений на среднем плане»; аудит ААА,
// §2 и §10): у середины помещения — его название, тише подписей стройки: серый текст на стекле значков, без состояния и рамки.
// Только на среднем плане: ближе помещение видно и так, дальше подписей больше, чем места. Одним холстом поверх 3D-вида, а не
// элементом DOM на каждое помещение — на большой больнице их сотня. Подпись, что шире своего помещения на экране или налезает
// на соседнюю или на значок состояния, не рисуется; первыми — большие помещения. Чистые функции проверяет
// tools/test/tags.test.ts, холст — сценарий в браузере.
import * as THREE from 'three';
import type { Stage } from '../render/stage';

/**
 * Масштаб, при котором подписи видны (`half` — половина высоты кадра, м; камера — src/render/view.ts, от 3 до ¾ участка):
 * ближе `in0` и дальше `out0` их нет, от `in0` до `in1` и от `out1` до `out0` — проявляются и гаснут. Общий план городской
 * больницы (Home) — 31 м: подписи на нём целиком, полупрозрачные читаются как сбой; мелким помещениям места не хватает и так.
 */
export const TAG_ZOOM = { in0: 5, in1: 7, out1: 34, out0: 42 } as const;

/** Насколько видны подписи при этом масштабе: 0…1. */
export function fadeOf(half: number): number {
  const { in0, in1, out1, out0 } = TAG_ZOOM;
  if (!(half > in0 && half < out0)) return 0;
  if (half < in1) return (half - in0) / (in1 - in0);
  if (half > out1) return (out0 - half) / (out0 - out1);
  return 1;
}

/** Прямоугольник на экране: середина и размер, точки CSS. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TagCand {
  id: string;
  text: string;
  box: Box;
  /** ширина помещения на экране — подпись шире не рисуется */
  room: number;
  /** площадь помещения на плане — большие первыми */
  area: number;
}

/** Зазор между подписями и до значков, точек. */
export const TAG_GAP = 3;

const overlap = (a: Box, b: Box, gap: number) => Math.abs(a.x - b.x) * 2 < a.w + b.w + gap * 2 && Math.abs(a.y - b.y) * 2 < a.h + b.h + gap * 2;

/** Какие подписи рисовать: по убыванию площади помещения — каждая, если не шире его на экране и ни на что не налезает. */
export function placeTags<T extends TagCand>(cands: readonly T[], obstacles: readonly Box[], gap = TAG_GAP): T[] {
  const out: T[] = [];
  const sorted = [...cands].sort((a, b) => b.area - a.area || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const c of sorted) {
    if (c.box.w > c.room) continue;
    if (obstacles.some(o => overlap(c.box, o, gap))) continue;
    if (out.some(o => overlap(c.box, o.box, gap))) continue;
    out.push(c);
  }
  return out;
}

/** Помещение для подписи: прямоугольник на плане (клетки = метры) и название. */
export interface TagRow {
  id: string;
  x: number;
  z: number;
  w: number;
  h: number;
  text: string;
}

/**
 * Высота точки подписи над полом, м, — та же, что у значков состояния и подписей стройки: значок встаёт над подписью
 * (chips.ts, `lift`), и они не налезают друг на друга при любом масштабе.
 */
export const TAG_Y = 0.4;

/** Точка плана на высоте `y` на экране: точки CSS; `z` > 1 — за камерой. */
export type Project = (x: number, z: number, y?: number) => { x: number; y: number; z: number };

/**
 * Кандидаты в подписи: помещения, чья середина на экране (с полями `margin`), — табличка на середине, ширина помещения на
 * экране по углам пола. `size` — размер таблички с этим текстом, точки CSS.
 */
export function candsOf(rows: readonly TagRow[], project: Project, size: (text: string) => { w: number; h: number }, view: { left: number; top: number; right: number; bottom: number }, margin = 50): TagCand[] {
  const out: TagCand[] = [];
  for (const r of rows) {
    const mid = project(r.x + r.w / 2, r.z + r.h / 2, TAG_Y);
    if (mid.z > 1 || mid.x < view.left - margin || mid.x > view.right + margin || mid.y < view.top - margin || mid.y > view.bottom + margin) continue;
    const xs = [project(r.x, r.z), project(r.x + r.w, r.z), project(r.x, r.z + r.h), project(r.x + r.w, r.z + r.h)].map(p => p.x);
    const { w, h } = size(r.text);
    out.push({ id: r.id, text: r.text, box: { x: mid.x, y: mid.y, w, h }, room: Math.max(...xs) - Math.min(...xs), area: r.w * r.h });
  }
  return out;
}

/** Стиль табличек — из токенов страницы (app/index.html, `:root`): цвета и размеры только оттуда. */
interface Look {
  /** размер текста игрока (`--ui-k`) и точек холста на точку CSS */
  k: number;
  dpr: number;
  fs: number;
  family: string;
  glass: string;
  text: string;
  radius: number;
}

function lookOf(k: number, dpr: number): Look {
  const css = getComputedStyle(document.documentElement);
  const token = (name: string) => css.getPropertyValue(name).trim();
  return {
    k, dpr, fs: parseFloat(token('--fs-small')) || 12, family: getComputedStyle(document.body).fontFamily, glass: token('--glass-tag'),
    text: token('--muted'), radius: parseFloat(token('--r-m')) || 4,
  };
}

export class RoomTags {
  private canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private rows: TagRow[] = [];
  /** табличка с текстом — по тексту, в точках холста; новый размер текста, шрифт или цвет — заново */
  private plates = new Map<string, HTMLCanvasElement>();
  private plateKey = '';
  private v = new THREE.Vector3();
  private key = '';
  /** нарисованные в последний раз — для сценария в браузере */
  shown: { id: string; text: string; box: Box }[] = [];
  alpha = 0;
  /** высота таблички, точки CSS: на столько значок состояния встаёт над подписью (chips.ts, `lift`) */
  height = 20;

  constructor(private stage: Stage) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'roomtags';
    // под панелями, как подписи стройки и значки помещений
    document.body.insertBefore(this.canvas, document.getElementById('ui'));
    this.g = this.canvas.getContext('2d')!;
    // шрифт игры приходит не сразу: таблички, нарисованные запасным, — заново
    void document.fonts?.ready.then(() => {
      this.plates.clear();
      this.key = '';
    });
  }

  set(rows: TagRow[]) {
    this.rows = rows;
    this.key = '';
  }

  /** Табличка: стекло значков, серый текст, скругление и поля — как у подписей стройки. */
  private plate(text: string, look: Look): HTMLCanvasElement {
    const key = `${look.dpr}|${look.k}|${look.fs}|${look.family}|${look.glass}|${look.text}`;
    if (key !== this.plateKey) {
      this.plates.clear();
      this.plateKey = key;
    }
    let c = this.plates.get(text);
    if (c) return c;
    const { k, dpr } = look;
    const px = look.fs * k * dpr;
    const font = `${px}px ${look.family}`;
    c = document.createElement('canvas');
    const g = c.getContext('2d')!;
    g.font = font;
    const padX = Math.round(6 * k * dpr);
    const padY = Math.round(2 * k * dpr);
    const h = Math.ceil(px * 1.3) + padY * 2;
    c.width = Math.ceil(g.measureText(text).width) + padX * 2;
    c.height = h;
    // размер холста сбрасывает его состояние — шрифт заново
    g.font = font;
    g.fillStyle = look.glass;
    g.beginPath();
    g.roundRect(0, 0, c.width, c.height, look.radius * dpr);
    g.fill();
    g.fillStyle = look.text;
    g.textBaseline = 'middle';
    g.fillText(text, padX, h / 2 + px * 0.04);
    this.plates.set(text, c);
    return c;
  }

  /**
   * Каждый кадр: `on` — подписи нужны (вне стройки и слоёв со своими подписями, по настройке игрока); `obstacles` — значки
   * состояния на экране; `k` — размер текста игрока. Холст рисуется заново, только если сдвинулась камера, сменились
   * помещения, значки или размер текста.
   */
  frame(on: boolean, obstacles: readonly Box[], k: number) {
    const cam = this.stage.cam;
    const alpha = on ? fadeOf(cam.half) : 0;
    const rect = this.stage.renderer.domElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const W = Math.round(window.innerWidth * dpr);
    const H = Math.round(window.innerHeight * dpr);
    const camera = cam.camera;
    camera.updateMatrixWorld();
    const key =
      alpha === 0
        ? 'off'
        : [
            alpha.toFixed(3), k, W, H, rect.left, rect.top, rect.width, rect.height,
            ...camera.matrixWorld.elements.map(e => e.toFixed(3)),
            ...camera.projectionMatrix.elements.map(e => e.toFixed(4)),
            ...obstacles.map(o => `${Math.round(o.x)},${Math.round(o.y)},${Math.round(o.w)},${Math.round(o.h)}`),
          ].join('|');
    if (key === this.key) return;
    this.key = key;
    this.alpha = alpha;
    if (this.canvas.width !== W || this.canvas.height !== H) {
      this.canvas.width = W;
      this.canvas.height = H;
    }
    this.g.clearRect(0, 0, W, H);
    this.shown = [];
    if (alpha === 0) return;
    const look = lookOf(k, dpr);
    const project: Project = (x, z, y = 0) => {
      this.v.set(x, y, z).project(camera);
      return { x: rect.left + ((this.v.x + 1) / 2) * rect.width, y: rect.top + ((1 - this.v.y) / 2) * rect.height, z: this.v.z };
    };
    const size = (text: string) => {
      const p = this.plate(text, look);
      this.height = p.height / dpr;
      return { w: p.width / dpr, h: p.height / dpr };
    };
    this.g.globalAlpha = alpha;
    for (const t of placeTags(candsOf(this.rows, project, size, rect), obstacles)) {
      this.g.drawImage(this.plate(t.text, look), Math.round((t.box.x - t.box.w / 2) * dpr), Math.round((t.box.y - t.box.h / 2) * dpr));
      this.shown.push({ id: t.id, text: t.text, box: t.box });
    }
    this.g.globalAlpha = 1;
  }
}
