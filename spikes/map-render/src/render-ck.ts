// Карта на CanvasKit (Skia в WASM поверх WebGL) — так «Анамнез» рисует карту в веб-сборке
// (docs/02-architecture.md §6 «Анамнеза»): неподвижный слой записан в SkPicture и
// проигрывается каждый кадр, люди — drawAtlas: одна текстура, одно обращение на всех.
import CanvasKitInit, { type CanvasKit, type MallocObj, type Paint, type SkPicture, type Surface } from 'canvaskit-wasm';
import type { Crowd } from './crowd';
import { BACKGROUND, CELL_PX, H, type Hospital, staticShapes, W } from './hospital';
import { SPR, SPR_SCALE } from './sprites';
import { BITMAP_SCALE, type Camera, gpuString, HIDE, STATIC_MODE, type MapRenderer, type RendererFactory } from './types';

let loading: Promise<CanvasKit> | null = null;
/** Сколько грузился и запускался WASM (мс) — один раз на страницу. */
export let ckLoadMs = 0;

function loadCanvasKit(): Promise<CanvasKit> {
  if (!loading) {
    const t0 = performance.now();
    // canvaskit.wasm лежит рядом со страницей (build.mjs копирует его в dist/)
    loading = CanvasKitInit({ locateFile: (file: string) => `./${file}` }).then(ck => {
      ckLoadMs = performance.now() - t0;
      return ck;
    });
  }
  return loading;
}

const rgb = (ck: CanvasKit, c: number) => ck.Color((c >> 16) & 255, (c >> 8) & 255, c & 255, 1);

export const createCanvasKit: RendererFactory = async (hospital: Hospital, atlasCanvas, w, h, dpr) => {
  const ck = await loadCanvasKit();
  const canvas = document.createElement('canvas');
  let dprNow = dpr;
  const size = (nw: number, nh: number, ndpr: number) => {
    canvas.style.width = `${nw}px`;
    canvas.style.height = `${nh}px`;
    canvas.width = Math.round(nw * ndpr);
    canvas.height = Math.round(nh * ndpr);
    dprNow = ndpr;
  };
  size(w, h, dpr);
  const makeSurface = (): Surface => {
    // Skia сглаживает края сама, MSAA холста не нужен
    const s = ck.MakeWebGLCanvasSurface(canvas, ck.ColorSpace.SRGB, { antialias: 0 });
    if (!s) throw new Error('CanvasKit: не удалось создать WebGL-поверхность');
    return s;
  };
  let surface = makeSurface();

  // Неподвижный слой — запись SkPicture.
  const paints = new Map<number, Paint>();
  const paintOf = (c: number) => {
    let p = paints.get(c);
    if (!p) {
      p = new ck.Paint();
      p.setColor(rgb(ck, c));
      p.setAntiAlias(true);
      paints.set(c, p);
    }
    return p;
  };
  const rec = new ck.PictureRecorder();
  const rc = rec.beginRecording(ck.LTRBRect(0, 0, W * CELL_PX, H * CELL_PX));
  const { rects, discs } = staticShapes(hospital);
  for (const r of rects) rc.drawRect(ck.XYWHRect(r.x, r.y, r.w, r.h), paintOf(r.color));
  for (const d of discs) rc.drawCircle(d.x, d.y, d.r, paintOf(d.color));
  const picture: SkPicture = rec.finishRecordingAsPicture();
  rec.delete();
  // ?static=bitmap: пол один раз растрируется на CPU в картинку и рисуется одной текстурой
  let floorImage: ReturnType<CanvasKit['MakeImageFromCanvasImageSource']> | null = null;
  if (STATIC_MODE === 'bitmap') {
    const raster = ck.MakeSurface(W * CELL_PX * BITMAP_SCALE, H * CELL_PX * BITMAP_SCALE);
    if (!raster) throw new Error('CanvasKit: нет растровой поверхности');
    raster.getCanvas().scale(BITMAP_SCALE, BITMAP_SCALE);
    raster.getCanvas().drawPicture(picture);
    floorImage = raster.makeImageSnapshot();
    raster.delete();
  }
  const floorDst = ck.LTRBRect(0, 0, W * CELL_PX, H * CELL_PX);
  const floorSrc = ck.LTRBRect(0, 0, W * CELL_PX * BITMAP_SCALE, H * CELL_PX * BITMAP_SCALE);

  const atlas = ck.MakeImageFromCanvasImageSource(atlasCanvas);
  const spritePaint = new ck.Paint();
  const bg = rgb(ck, BACKGROUND);
  let n = 0;
  let src: MallocObj | null = null;
  let xf: MallocObj | null = null;
  const sampling = { filter: ck.FilterMode.Linear, mipmap: ck.MipmapMode.None };

  const glCtx = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGL2RenderingContext | null;

  const self: MapRenderer = {
    name: 'ck',
    canvas,
    gpu: `CanvasKit ${surface.reportBackendTypeIsGPU() ? 'GPU' : 'CPU'}, пол: ${STATIC_MODE} — ${gpuString(glCtx)}`,
    setCrowd(crowd: Crowd) {
      if (src) ck.Free(src);
      if (xf) ck.Free(xf);
      n = crowd.n;
      // Буферы в памяти WASM: на кадр — без копирования массивов
      src = ck.Malloc(Float32Array, n * 4);
      xf = ck.Malloc(Float32Array, n * 4);
      const s = src.toTypedArray() as Float32Array;
      for (let i = 0; i < n; i++) {
        const l = crowd.look[i] * SPR;
        s.set([l, 0, l + SPR, SPR], i * 4);
      }
    },
    draw(crowd: Crowd, cam: Camera) {
      const c = surface.getCanvas();
      c.clear(bg);
      c.save();
      c.scale(dprNow, dprNow);
      c.translate(cam.tx, cam.ty);
      c.scale(cam.s, cam.s);
      if (HIDE !== 'static') {
        if (floorImage) c.drawImageRectOptions(floorImage, floorSrc, floorDst, ck.FilterMode.Linear, ck.MipmapMode.None, null);
        else c.drawPicture(picture);
      }
      if (xf && src && n > 0 && HIDE !== 'people') {
        const x = xf.toTypedArray() as Float32Array;
        const half = (SPR * SPR_SCALE) / 2;
        for (let i = 0; i < n; i++) {
          const k = i * 4;
          x[k] = SPR_SCALE;
          x[k + 1] = 0;
          x[k + 2] = (crowd.x[i] + 0.5) * CELL_PX - half;
          x[k + 3] = (crowd.y[i] + 0.5) * CELL_PX - half;
        }
        c.drawAtlas(atlas, src, xf, spritePaint, null, null, sampling);
      }
      c.restore();
      surface.flush();
    },
    resize(nw: number, nh: number, ndpr: number) {
      surface.delete();
      size(nw, nh, ndpr);
      surface = makeSurface();
    },
    destroy() {
      if (src) ck.Free(src);
      if (xf) ck.Free(xf);
      src = xf = null;
      picture.delete();
      floorImage?.delete();
      atlas.delete();
      spritePaint.delete();
      for (const p of paints.values()) p.delete();
      surface.delete();
      canvas.remove();
    },
  };
  return self;
};
