// из spikes/render-3d: src/world.ts (полы, земля, стены с режимами «целые / срез / вниз», окна, наличники) — изменено:
// план движка вместо случайной больницы; материал пола — по типу помещения движка; участок движка вместо травы до
// горизонта; дверь — 2,1 м; второй набор координат пола — для карты света светильников (lamps.ts); дорожки от входов
// здания на участке и текстуры пола одни на сцену — стройка пересобирает полы (spec docs/specs/2026-10-build.md).
//
// Мир: x — столбец клетки, z — строка, y — вверх; клетка — 1 м. Стены режет вершинный шейдер: переключение режима и
// движение камеры ничего не перестраивают; тени считаются по срезанным стенам тем же шейдером.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Id } from '../content/types';
import { CELL } from '../engine/hospital/grid';
import type { Layout } from './layout';
import { type FloorKind, type FloorTex, makeFloor } from './textures';

/** Высота стены, м. */
export const WALL_H = 2.7;
/** Срезанная стена, м. */
export const WALL_LOW = 0.32;
export const WALL_T = 0.16;
/** Высота проёма двери, м (spec docs/specs/2026-10-shell-3d.md, «Масштаб и опора»). */
export const DOOR_H = 2.1;
const WIN_LOW = 0.9;
const WIN_HIGH = 2.15;

const FLOOR_OF: Record<Id, FloorKind> = {
  'room.reception': 'hall',
  'room.waiting': 'hall',
  'room.office': 'wood',
  'room.staff': 'wood',
  'room.triage': 'white',
  'room.procedure': 'white',
  'room.lab': 'white',
  'room.ecg': 'white',
  'room.ultrasound': 'white',
  'room.endoscopy': 'white',
  'room.emergency': 'white',
  'room.xray': 'grey',
  'room.ct': 'grey',
  'room.mri': 'grey',
  'room.ward': 'ward',
  'room.icu': 'ward',
  'room.ricu': 'ward',
  'room.box': 'ward',
  'room.toilet': 'toiletTile',
  'room.or': 'or',
};

/** Материал пола каждой клетки: коридор, помещение по типу; стены и улица — null. */
function floorKinds(l: Layout): (FloorKind | null)[] {
  const { w, h, plan } = l;
  const k: (FloorKind | null)[] = new Array(w * h).fill(null);
  for (let i = 0; i < w * h; i++) {
    const c = plan.grid.cells[i];
    if (c === CELL.corridor || c === CELL.door) k[i] = 'corridor';
  }
  for (const r of plan.rooms) {
    const kind = FLOOR_OF[r.type] ?? 'white';
    for (let y = r.y + 1; y < r.y + r.h - 1; y++) for (let x = r.x + 1; x < r.x + r.w - 1; x++) k[y * w + x] = kind;
    for (const [x, y] of r.door) k[y * w + x] = kind;
  }
  return k;
}

/**
 * Пол — квадраты по 0,5 м; половинки стеновых клеток берут пол соседа (как в пробе). Второй набор координат (`uv1`) —
 * доля участка: по нему ложится карта света светильников.
 */
export function buildFloors(l: Layout, anisotropy: number, lightMap: THREE.Texture | null, textures = new Map<FloorKind, FloorTex>()): THREE.Mesh[] {
  const { w, h, plan } = l;
  const kind = floorKinds(l);
  const isWall = (x: number, y: number) => x < 0 || y < 0 || x >= w || y >= h || plan.grid.cells[y * w + x] === CELL.wall;
  const quads = new Map<FloorKind, number[]>();
  const add = (k: FloorKind, x: number, z: number, s: number) => {
    let a = quads.get(k);
    if (!a) quads.set(k, (a = []));
    a.push(x, z, s);
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const own = kind[y * w + x];
      if (own) {
        add(own, x, y, 1);
        continue;
      }
      if (!isWall(x, y)) continue;
      for (let sy = 0; sy < 2; sy++) {
        for (let sx = 0; sx < 2; sx++) {
          const nx = sx ? x + 1 : x - 1;
          const ny = sy ? y + 1 : y - 1;
          const k = (!isWall(nx, y) && kind[y * w + nx]) || (!isWall(x, ny) && kind[ny * w + x]) || (!isWall(nx, ny) && kind[ny * w + nx]) || null;
          // наружная половинка наружной стены — не пол, а улица
          if (!k) continue;
          add(k, x + sx * 0.5, y + sy * 0.5, 0.5);
        }
      }
    }
  }
  const meshes: THREE.Mesh[] = [];
  for (const [k, q] of quads) {
    let tex = textures.get(k);
    if (!tex) textures.set(k, (tex = makeFloor(k, anisotropy)));
    const n = q.length / 3;
    const pos = new Float32Array(n * 18);
    const uv = new Float32Array(n * 12);
    const uv1 = new Float32Array(n * 12);
    const nor = new Float32Array(n * 18);
    for (let i = 0; i < n; i++) {
      const x = q[i * 3];
      const z = q[i * 3 + 1];
      const s = q[i * 3 + 2];
      const v = [x, z, x, z + s, x + s, z + s, x, z, x + s, z + s, x + s, z];
      for (let j = 0; j < 6; j++) {
        pos[i * 18 + j * 3] = v[j * 2];
        pos[i * 18 + j * 3 + 2] = v[j * 2 + 1];
        nor[i * 18 + j * 3 + 1] = 1;
        uv[i * 12 + j * 2] = v[j * 2] / tex.meters;
        uv[i * 12 + j * 2 + 1] = v[j * 2 + 1] / tex.meters;
        uv1[i * 12 + j * 2] = v[j * 2] / w;
        uv1[i * 12 + j * 2 + 1] = 1 - v[j * 2 + 1] / h;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2));
    const mat = new THREE.MeshStandardMaterial({ map: tex.texture, roughness: k === 'wood' ? 0.6 : 0.45, metalness: 0 });
    if (lightMap) {
      mat.lightMap = lightMap;
      mat.lightMapIntensity = 0;
    }
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true;
    m.name = `floor ${k}`;
    meshes.push(m);
  }
  return meshes;
}

/**
 * Участок движка: плитка вокруг здания, газон, дорога ко входу; за участком — тёмная земля и туман (замечание владельца:
 * не плоская зелень до горизонта).
 */
export function buildGround(l: Layout, anisotropy: number): THREE.Mesh[] {
  const { w, h, plan } = l;
  const out: THREE.Mesh[] = [];
  // карта участка: клетка — 8 точек
  const px = 8;
  const c = document.createElement('canvas');
  c.width = w * px;
  c.height = h * px;
  const g = c.getContext('2d')!;
  const near = (x: number, y: number, d: number) => {
    for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < w && ny < h && plan.grid.cells[ny * w + nx] !== CELL.outside) return true;
    }
    return false;
  };
  const [ex, ey] = plan.entrance;
  // дорожки: от входов здания больницы ПК — прямо наружу до края участка, шире входа на клетку с каждой стороны
  const paths = new Uint8Array(w * h);
  for (const e of plan.entrances ?? []) {
    const [ox, oy] = e.out;
    for (const [cx, cy] of e.cells) {
      for (let k = 1; ; k++) {
        const x0 = cx + ox * k;
        const y0 = cy + oy * k;
        if (x0 < 0 || y0 < 0 || x0 >= w || y0 >= h) break;
        for (let d = -1; d <= 1; d++) {
          const x = x0 + (ox === 0 ? d : 0);
          const y = y0 + (oy === 0 ? d : 0);
          if (x >= 0 && y >= 0 && x < w && y < h && plan.grid.cells[y * w + x] === CELL.outside) paths[y * w + x] = 1;
        }
      }
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const road = paths[y * w + x] === 1 || (ex === 0 && Math.abs(y - ey) <= 1 && x <= 1) || (ey === 0 && Math.abs(x - ex) <= 1 && y <= 1);
      g.fillStyle = road ? '#7b8082' : near(x, y, 1) ? '#a7acab' : (x + y) % 2 ? '#6f8a55' : '#6b8651';
      g.fillRect(x * px, y * px, px, px);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  const plot = new THREE.PlaneGeometry(w, h);
  plot.rotateX(-Math.PI / 2);
  plot.translate(w / 2, -0.012, h / 2);
  const pm = new THREE.Mesh(plot, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
  pm.receiveShadow = true;
  pm.name = 'plot';
  out.push(pm);
  // плитка двора поверх: текстура камня по клеткам у здания
  const paving = makeFloor('paving', anisotropy);
  const cells: number[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (plan.grid.cells[y * w + x] === CELL.outside && near(x, y, 1)) cells.push(x, y);
  if (cells.length) {
    const geos: THREE.BufferGeometry[] = [];
    for (let i = 0; i < cells.length; i += 2) {
      const q = new THREE.PlaneGeometry(1, 1);
      q.rotateX(-Math.PI / 2);
      q.translate(cells[i] + 0.5, -0.006, cells[i + 1] + 0.5);
      const uv = q.attributes.uv as THREE.BufferAttribute;
      const p = q.attributes.position as THREE.BufferAttribute;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, p.getX(k) / paving.meters, p.getZ(k) / paving.meters);
      geos.push(q);
    }
    const m = new THREE.Mesh(mergeGeometries(geos)!, new THREE.MeshStandardMaterial({ map: paving.texture, roughness: 0.9 }));
    m.receiveShadow = true;
    m.name = 'paving';
    out.push(m);
  }
  // за участком — тёмная земля
  const far = new THREE.PlaneGeometry(w + 400, h + 400);
  far.rotateX(-Math.PI / 2);
  far.translate(w / 2, -0.03, h / 2);
  const fm = new THREE.Mesh(far, new THREE.MeshStandardMaterial({ color: 0x23282b, roughness: 1 }));
  fm.receiveShadow = true;
  fm.name = 'ground';
  out.push(fm);
  return out;
}

// ---------------------------------------------------------------- стены

export type WallMode = 'full' | 'cut' | 'down';

export interface Walls {
  mesh: THREE.Mesh;
  uniforms: {
    uMode: { value: number };
    uFocus: { value: THREE.Vector2 };
    uRadius: { value: number };
    uToCam: { value: THREE.Vector2 };
  };
  setMode(m: WallMode): void;
}

/** Срез на CPU — тот же, что в шейдере: для створок дверей и светильников. */
export function cutAt(u: Walls['uniforms'], cx: number, cz: number, ox = 0, oz = 0): number {
  if (u.uMode.value > 1.5) return 1;
  if (u.uMode.value < 0.5) return 0;
  const d = Math.hypot(cx - u.uFocus.value.x, cz - u.uFocus.value.y);
  const r = u.uRadius.value;
  const t = Math.min(1, Math.max(0, (d - r * 0.85) / (r * 0.15)));
  const near = 1 - t * t * (3 - 2 * t);
  const front = ox * u.uToCam.value.x + oz * u.uToCam.value.y >= 0.3 ? 1 : 0;
  return Math.max(near, front);
}

// В шейдере: наружная стена, обращённая к камере, срезана всегда (front); куски выше среза (перемычки, стекло, верх
// наличников) уходят под пол, а не сплющиваются в полосу (lowY).
const WALL_VERT_PARS = /* glsl */ `
attribute vec2 aCenter;
attribute vec2 aOut;
attribute float aKind;
attribute float aBase;
varying float vKind;
uniform float uMode;
uniform vec2 uFocus;
uniform float uRadius;
uniform vec2 uToCam;
varying float vH;
varying vec3 vObjN;
varying float vOut;
float wallCut() {
  if (uMode > 1.5) return 1.0;
  if (uMode < 0.5) return 0.0;
  float d = distance(aCenter, uFocus);
  float near = 1.0 - smoothstep(uRadius * 0.85, uRadius, d);
  float front = step(0.3, dot(aOut, uToCam));
  return max(near, front);
}
`;
const WALL_VERT_BEGIN = /* glsl */ `
#include <begin_vertex>
vH = position.y;
vKind = aKind;
vObjN = normal;
vOut = dot(normal.xz, aOut);
float cutK = wallCut();
float lowY = aBase > ${WALL_LOW.toFixed(2)} ? -0.05 : min(position.y, ${WALL_LOW.toFixed(2)});
transformed.y = mix(position.y, lowY, cutK);
`;

function wallMaterial(uniforms: Walls['uniforms']): { mat: THREE.MeshStandardMaterial; depth: THREE.MeshDepthMaterial } {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0 });
  mat.onBeforeCompile = s => {
    Object.assign(s.uniforms, uniforms);
    s.vertexShader = s.vertexShader.replace('#include <common>', `#include <common>\n${WALL_VERT_PARS}`).replace('#include <begin_vertex>', WALL_VERT_BEGIN);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vH;\nvarying vec3 vObjN;\nvarying float vOut;\nvarying float vKind;')
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        /* glsl */ `
        vec3 wc;
        if (vKind > 1.5) wc = vec3(0.45, 0.33, 0.24);
        else if (vKind > 0.5) wc = vec3(0.62, 0.80, 0.88);
        else if (vObjN.y > 0.5) wc = vec3(0.23, 0.27, 0.29);
        else if (vObjN.y < -0.5) wc = vec3(0.85);
        else if (vOut > 0.5) wc = vH < 0.45 ? vec3(0.46, 0.42, 0.38) : vec3(0.86, 0.80, 0.70);
        else if (vH < 0.95) wc = vec3(0.56, 0.73, 0.71);
        else if (vH < 1.05) wc = vec3(0.37, 0.56, 0.54);
        else wc = vec3(0.93, 0.94, 0.91);
        vec4 diffuseColor = vec4( pow(wc, vec3(2.2)), opacity );`,
      );
  };
  mat.customProgramCacheKey = () => 'walls';
  const depth = new THREE.MeshDepthMaterial();
  depth.onBeforeCompile = s => {
    Object.assign(s.uniforms, uniforms);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>\n${WALL_VERT_PARS}`)
      .replace('#include <begin_vertex>', WALL_VERT_BEGIN.replace('vObjN = normal;', '').replace('vOut = dot(normal.xz, aOut);', '').replace('vKind = aKind;', ''));
  };
  depth.customProgramCacheKey = () => 'walls-depth';
  return { mat, depth };
}

/** Наружу от клетки стены: к улице рядом (нет — 0, 0). */
export function outward(l: Layout, x: number, y: number): [number, number] {
  const { w, h, plan } = l;
  const outside = (nx: number, ny: number) => nx < 0 || ny < 0 || nx >= w || ny >= h || plan.grid.cells[ny * w + nx] === CELL.outside;
  let ox = 0;
  let oz = 0;
  if (outside(x - 1, y)) ox -= 1;
  if (outside(x + 1, y)) ox += 1;
  if (outside(x, y - 1)) oz -= 1;
  if (outside(x, y + 1)) oz += 1;
  const len = Math.hypot(ox, oz) || 1;
  return [ox / len, oz / len];
}

export function buildWalls(l: Layout): Walls {
  const { w, h, plan } = l;
  const cell = (x: number, y: number) => (x >= 0 && y >= 0 && x < w && y < h ? plan.grid.cells[y * w + x] : CELL.outside);
  const isWall = (x: number, y: number) => cell(x, y) === CELL.wall;
  const isDoor = (x: number, y: number) => cell(x, y) === CELL.door;
  const geos: THREE.BufferGeometry[] = [];
  /** Окно — на прямом участке наружной стены (снаружи — улица, внутри — помещение или коридор), через клетку. */
  const windowAt = (x: number, y: number) => {
    const [ox, oz] = outward(l, x, y);
    if (ox !== 0 && oz !== 0) return false;
    if (ox === 0 && oz === 0) return false;
    const alongX = ox === 0;
    const ix = x - Math.sign(ox);
    const iy = y - Math.sign(oz);
    const inner = cell(ix, iy);
    if (inner !== CELL.floor && inner !== CELL.corridor) return false;
    if (alongX) {
      if (!isWall(x - 1, y) || !isWall(x + 1, y) || isWall(ix - 1, iy) || isWall(ix + 1, iy)) return false;
      return x % 3 !== 0;
    }
    if (!isWall(x, y - 1) || !isWall(x, y + 1) || isWall(ix, iy - 1) || isWall(ix, iy + 1)) return false;
    return y % 3 !== 0;
  };
  // kind: 0 — стена, 1 — стекло окна, 2 — наличник двери
  const piece = (x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, cx: number, cz: number, ox: number, oz: number, kind = 0) => {
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    g.deleteAttribute('uv');
    const n = g.attributes.position.count;
    const c = new Float32Array(n * 2);
    const o = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      c[i * 2] = cx;
      c[i * 2 + 1] = cz;
      o[i * 2] = ox;
      o[i * 2 + 1] = oz;
    }
    g.setAttribute('aCenter', new THREE.BufferAttribute(c, 2));
    g.setAttribute('aOut', new THREE.BufferAttribute(o, 2));
    g.setAttribute('aKind', new THREE.BufferAttribute(new Float32Array(n).fill(kind), 1));
    g.setAttribute('aBase', new THREE.BufferAttribute(new Float32Array(n).fill(y0), 1));
    geos.push(g.toNonIndexed());
  };
  const t2 = WALL_T / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const mx = x + 0.5;
      const mz = y + 0.5;
      const [ox, oz] = isWall(x, y) || isDoor(x, y) ? outward(l, x, y) : [0, 0];
      if (isWall(x, y) && windowAt(x, y)) {
        // окно в наружной стене: низ, верх и стекло между ними — на всю клетку вдоль стены
        const alongX = ox === 0;
        const [ax0, ax1, az0, az1] = alongX ? [x, x + 1, mz - t2, mz + t2] : [mx - t2, mx + t2, y, y + 1];
        piece(ax0, ax1, az0, az1, 0, WIN_LOW, mx, mz, ox, oz);
        piece(ax0, ax1, az0, az1, WIN_HIGH, WALL_H, mx, mz, ox, oz);
        const g = 0.025;
        const [gx0, gx1, gz0, gz1] = alongX ? [x, x + 1, mz - g, mz + g] : [mx - g, mx + g, y, y + 1];
        piece(gx0, gx1, gz0, gz1, WIN_LOW, WIN_HIGH, mx, mz, ox, oz, 1);
        if (alongX) piece(mx - 0.03, mx + 0.03, mz - t2 * 0.6, mz + t2 * 0.6, WIN_LOW, WIN_HIGH, mx, mz, ox, oz, 2);
        else piece(mx - t2 * 0.6, mx + t2 * 0.6, mz - 0.03, mz + 0.03, WIN_LOW, WIN_HIGH, mx, mz, ox, oz, 2);
      } else if (isWall(x, y)) {
        piece(mx - t2, mx + t2, mz - t2, mz + t2, 0, WALL_H, mx, mz, ox, oz);
        const e = isWall(x + 1, y) || isDoor(x + 1, y);
        const wv = isWall(x - 1, y) || isDoor(x - 1, y);
        const s = isWall(x, y + 1) || isDoor(x, y + 1);
        const nn = isWall(x, y - 1) || isDoor(x, y - 1);
        if (e) piece(mx + t2, x + 1, mz - t2, mz + t2, 0, WALL_H, mx, mz, ox, oz);
        if (wv) piece(x, mx - t2, mz - t2, mz + t2, 0, WALL_H, mx, mz, ox, oz);
        if (s) piece(mx - t2, mx + t2, mz + t2, y + 1, 0, WALL_H, mx, mz, ox, oz);
        if (nn) piece(mx - t2, mx + t2, y, mz - t2, 0, WALL_H, mx, mz, ox, oz);
      } else if (isDoor(x, y)) {
        // перемычка над дверью; наличники — по краям проёма (у широкой двери — только у крайних клеток)
        const horiz = isWall(x - 1, y) || isWall(x + 1, y) || isDoor(x - 1, y) || isDoor(x + 1, y);
        const f = 0.07;
        const ft = t2 + 0.025;
        if (horiz) {
          piece(x, x + 1, mz - t2, mz + t2, DOOR_H, WALL_H, mx, mz, ox, oz);
          if (!isDoor(x - 1, y)) piece(x, x + f, mz - ft, mz + ft, 0, DOOR_H, mx, mz, ox, oz, 2);
          if (!isDoor(x + 1, y)) piece(x + 1 - f, x + 1, mz - ft, mz + ft, 0, DOOR_H, mx, mz, ox, oz, 2);
          piece(x, x + 1, mz - ft, mz + ft, DOOR_H - f, DOOR_H, mx, mz, ox, oz, 2);
        } else {
          piece(mx - t2, mx + t2, y, y + 1, DOOR_H, WALL_H, mx, mz, ox, oz);
          if (!isDoor(x, y - 1)) piece(mx - ft, mx + ft, y, y + f, 0, DOOR_H, mx, mz, ox, oz, 2);
          if (!isDoor(x, y + 1)) piece(mx - ft, mx + ft, y + 1 - f, y + 1, 0, DOOR_H, mx, mz, ox, oz, 2);
          piece(mx - ft, mx + ft, y, y + 1, DOOR_H - f, DOOR_H, mx, mz, ox, oz, 2);
        }
      }
    }
  }
  const geo = mergeGeometries(geos, false)!;
  const uniforms: Walls['uniforms'] = {
    uMode: { value: 1 },
    uFocus: { value: new THREE.Vector2(w / 2, h / 2) },
    uRadius: { value: 14 },
    uToCam: { value: new THREE.Vector2(0, 1) },
  };
  const { mat, depth } = wallMaterial(uniforms);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.customDepthMaterial = depth;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'walls';
  return {
    mesh,
    uniforms,
    setMode(m) {
      uniforms.uMode.value = m === 'full' ? 0 : m === 'cut' ? 1 : 2;
    },
  };
}
