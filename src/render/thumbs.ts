// Миниатюры каталога стройки (spec docs/specs/2026-10-catalog.md, «Миниатюры»): образец готового помещения — пол, стены,
// дверь и мебель теми же функциями, что у карты (`buildFloors`, `buildWalls`, `buildDoors`, `batchMeshes`), сверху под
// углом карты, ортогональной камерой, в ровном дневном свете без теней. Кадр — тем же отрисовщиком в свой буфер с MSAA,
// затем перевод в тон и цвет экрана тем же шейдером, что у последнего прохода карты (post.ts), и чтение без ожидания
// видеокарты (`readRenderTargetPixelsAsync`); PNG собирается из этих байтов (png.ts), без холста 2D: холст игры не
// трогается, кадр карты не ждёт.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { OutputShader } from 'three/addons/shaders/OutputShader.js';
import { buildDoors } from './doors';
import { pngOf } from './png';
import { batchMeshes, type Furnished } from './furniture';
import type { Layout } from './layout';
import type { FloorKind, FloorTex } from './textures';
import { buildFloors, buildWalls } from './world';

/** Миниатюра, точек картинки; в строке каталога — вдвое меньше (на экранах с плотностью 2 — во всю чёткость). */
export const THUMB = { w: 160, h: 100 };

/** Фон миниатюры — фон карты (view.ts, `Daylight.background` днём): пол помещения на нём читается так же, как на карте. */
const BACK = 0x2a3236;
/** Угол камеры — как у карты (view.ts, `IsoCamera`): поворот и наклон. */
const YAW = Math.PI / 4;
const PITCH = THREE.MathUtils.degToRad(52);
/** Поле вокруг помещения — доля его размера в кадре. */
const MARGIN = 1.02;
/** Пол коридора вокруг образца в кадр не идёт: помещение — на фоне, как вырезанное. */
const CORRIDOR = 'floor corridor';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Миниатюры одним отрисовщиком: свои буферы и материалы — на все миниатюры, сцена — на одну. Текстуры пола — те же, что у
 * карты (`Stage.floorTex`, с её фильтрацией): второй раз в видеокарту они не грузятся.
 */
export class Thumbs {
  private msaa: THREE.WebGLRenderTarget;
  private out: THREE.WebGLRenderTarget;
  private quad: FullScreenQuad;
  private material: THREE.RawShaderMaterial;
  /** материалы — одни на все миниатюры (`share`) */
  private mats = new Map<string, THREE.Material>();
  private pixels = new Uint8Array(THUMB.w * THUMB.h * 4);

  constructor(
    private renderer: THREE.WebGLRenderer,
    private floorTex: Map<FloorKind, FloorTex>,
    private aniso: number,
  ) {
    this.msaa = new THREE.WebGLRenderTarget(THUMB.w, THUMB.h, { type: THREE.HalfFloatType, samples: 4 });
    this.out = new THREE.WebGLRenderTarget(THUMB.w, THUMB.h, { type: THREE.UnsignedByteType });
    // тон и цвет экрана — как у карты (post.ts): ACES и sRGB, выдержка отрисовщика
    this.material = new THREE.RawShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(OutputShader.uniforms),
      vertexShader: OutputShader.vertexShader,
      fragmentShader: OutputShader.fragmentShader,
      defines: { SRGB_TRANSFER: '', ACES_FILMIC_TONE_MAPPING: '' },
    });
    this.quad = new FullScreenQuad(this.material);
  }

  /**
   * Миниатюра помещения `rect` раскладки `layout` с мебелью `furnished` — PNG адресом `blob:`. Сцена собирается, рисуется и
   * освобождается здесь же (кроме материалов — они общие); ждём сборки новых шейдеров и чтения кадра, не останавливая кадр
   * карты. `ms` — сколько окно было занято: сборка сцены и кадр миниатюры (для замера).
   */
  async draw(layout: Layout, furnished: Furnished, rect: Rect): Promise<{ url: string; ms: { build: number; frame: number } }> {
    const r = this.renderer;
    const t0 = performance.now();
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(BACK);
    const floors = buildFloors(layout, this.aniso, null, this.floorTex);
    const walls = buildWalls(layout);
    walls.setMode('down');
    const doors = buildDoors(layout);
    const furniture = batchMeshes(furnished.batch);
    for (const m of floors.filter(f => f.name === CORRIDOR)) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    const meshes: THREE.Mesh[] = [...floors.filter(f => f.name !== CORRIDOR), walls.mesh, doors.mesh, ...furniture];
    for (const m of meshes) {
      m.castShadow = false;
      m.receiveShadow = false;
      this.share(m);
      scene.add(m);
    }
    // ровный дневной свет: небо и солнце полудня (view.ts, `Daylight`), без теней и окружения — одинаково при любом качестве
    scene.add(new THREE.HemisphereLight(0xdfe9f2, 0x8a7f70, 1.9));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    const cx = rect.x + rect.w / 2;
    const cz = rect.y + rect.h / 2;
    sun.position.set(cx + 6, 20, cz + 10);
    sun.target.position.set(cx, 0, cz);
    scene.add(sun, sun.target);
    const cam = frameOf(rect);
    // шейдеры новых материалов (первая миниатюра, новый пол или аппарат) собираются, пока карта рисует свои кадры, — где
    // видеокарта умеет собирать их в фоне; буфер миниатюры — на время сборки: от него зависят тон и цвет в программе
    let compiled: Promise<unknown> | undefined;
    if (r.extensions.has('KHR_parallel_shader_compile')) {
      const before = r.getRenderTarget();
      r.setRenderTarget(this.msaa);
      compiled = r.compileAsync(scene, cam);
      r.setRenderTarget(before);
    }
    const build = performance.now() - t0;
    if (compiled) await compiled;
    const t1 = performance.now();
    const clear = r.getClearColor(new THREE.Color());
    const alpha = r.getClearAlpha();
    const was = r.getRenderTarget();
    r.setRenderTarget(this.msaa);
    r.render(scene, cam);
    this.material.uniforms.tDiffuse.value = this.msaa.texture;
    this.material.uniforms.toneMappingExposure.value = r.toneMappingExposure;
    r.setRenderTarget(this.out);
    this.quad.render(r);
    const read = r.readRenderTargetPixelsAsync(this.out, 0, 0, THUMB.w, THUMB.h, this.pixels);
    r.setRenderTarget(was);
    r.setClearColor(clear, alpha);
    const frame = performance.now() - t1;
    // сцена больше не нужна: сетки — свои; материалы, текстуры пола и атлас моделей — общие, их не трогаем
    for (const m of meshes) {
      m.geometry.dispose();
      m.customDepthMaterial?.dispose();
      if ((m as THREE.InstancedMesh).isInstancedMesh) (m as THREE.InstancedMesh).dispose();
    }
    const png = await pngOf((await read) as Uint8Array, THUMB.w, THUMB.h);
    return { url: URL.createObjectURL(new Blob([png], { type: 'image/png' })), ms: { build, frame } };
  }

  /**
   * Материал сетки — один на все миниатюры (по имени сетки и её текстуре). Программа шейдера, собранная для сцены миниатюр
   * (свой свет, без тумана, в свой буфер), живёт, пока жив хоть один её материал: освобождай мы материалы, каждая
   * миниатюра собирала бы шейдеры заново — на программном WebGL это сотни миллисекунд.
   */
  private share(m: THREE.Mesh) {
    const mat = m.material as THREE.MeshStandardMaterial;
    const key = `${m.name}|${mat.map?.uuid ?? ''}`;
    const had = this.mats.get(key);
    if (!had) {
      this.mats.set(key, mat);
      return;
    }
    // новый ещё не рисовался — программы у него нет, освобождать нечего, кроме него самого
    mat.dispose();
    m.material = had;
  }

  dispose() {
    for (const m of this.mats.values()) m.dispose();
    this.msaa.dispose();
    this.out.dispose();
    this.material.dispose();
    this.quad.dispose();
  }
}

/**
 * Камера над помещением: под углом карты, ортогональная, кадр — по углам помещения на полу и по верху опущенных стен, с
 * полем вокруг.
 */
export function frameOf(rect: Rect): THREE.OrthographicCamera {
  const dir = new THREE.Vector3(Math.sin(YAW) * Math.cos(PITCH), Math.sin(PITCH), Math.cos(YAW) * Math.cos(PITCH));
  const target = new THREE.Vector3(rect.x + rect.w / 2, 0, rect.y + rect.h / 2);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  cam.position.copy(target).addScaledVector(dir, 60);
  cam.lookAt(target);
  cam.updateMatrixWorld();
  // углы помещения в осях камеры: вправо и вверх по кадру
  const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
  const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
  let sx = 0;
  let sy = 0;
  const p = new THREE.Vector3();
  for (const x of [rect.x, rect.x + rect.w]) {
    for (const z of [rect.y, rect.y + rect.h]) {
      for (const y of [0, 0.6]) {
        p.set(x, y, z).sub(target);
        sx = Math.max(sx, Math.abs(p.dot(right)));
        sy = Math.max(sy, Math.abs(p.dot(up)));
      }
    }
  }
  const aspect = THUMB.w / THUMB.h;
  const half = Math.max(sy, sx / aspect) * MARGIN;
  cam.left = -half * aspect;
  cam.right = half * aspect;
  cam.top = half;
  cam.bottom = -half;
  cam.updateProjectionMatrix();
  return cam;
}
