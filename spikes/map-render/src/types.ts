import type { Crowd } from './crowd';
import type { Hospital } from './hospital';

/** Камера в точках CSS: экран = мир × s + (tx, ty). */
export interface Camera {
  s: number;
  tx: number;
  ty: number;
}

export interface MapRenderer {
  readonly name: 'pixi' | 'ck';
  readonly canvas: HTMLCanvasElement;
  /** какая видеокарта и какой API — для отчёта */
  readonly gpu: string;
  setCrowd(crowd: Crowd): void;
  draw(crowd: Crowd, cam: Camera): void;
  resize(w: number, h: number, dpr: number): void;
  destroy(): void;
}

export type RendererFactory = (hospital: Hospital, atlas: HTMLCanvasElement, w: number, h: number, dpr: number) => Promise<MapRenderer>;

export function gpuString(gl: WebGLRenderingContext | WebGL2RenderingContext | null): string {
  if (!gl) return 'нет WebGL';
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const r = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  return `${gl instanceof WebGL2RenderingContext ? 'WebGL2' : 'WebGL1'}: ${r}`;
}

/** Отладка: ?hide=static или ?hide=people — не рисовать слой (разложить стоимость кадра). */
export const HIDE = new URLSearchParams(location.search).get('hide') ?? '';
/**
 * Неподвижный слой: 'vector' — фигуры каждый кадр (по умолчанию), 'bitmap' — один раз
 * растрирован в картинку вдвое плотнее мира и рисуется одной текстурой (?static=bitmap).
 */
export const STATIC_MODE = new URLSearchParams(location.search).get('static') === 'bitmap' ? 'bitmap' : 'vector';
/** Во сколько раз картинка пола плотнее точек мира. */
export const BITMAP_SCALE = 2;
