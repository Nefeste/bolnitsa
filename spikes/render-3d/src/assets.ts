// Загрузка моделей CC0 (assets/models, сжаты meshopt — tools/assets.mjs) и подготовка к рисованию:
// - мебель раскладывается на «части» — геометрия в координатах модели и цвет материала; потом
//   все предметы сцены сливаются в несколько больших сеток (world.ts);
// - люди: части тела сливаются в одну геометрию с цветом в вершинах, а анимации заранее
//   «запекаются» в текстуру матриц костей (people.ts рисует всех одного вида одним вызовом).
import * as THREE from 'three';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { MeshoptSimplifier } from 'three/addons/libs/meshopt_simplifier.module.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export interface Part {
  geometry: THREE.BufferGeometry;
  /** имя материала из модели — по нему перекрашиваем (например, одеяло на кровати) */
  mat: string;
  color: THREE.Color;
  /** текстура-атлас (у наборов KayKit) или null */
  map: THREE.Texture | null;
}

export interface Model {
  name: string;
  parts: Part[];
  box: THREE.Box3;
}

export interface Index {
  kenney: string[];
  kaykit: string[];
  people: string[];
}

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

/** Все атрибуты — в Float32 (после meshopt они целые нормированные), без чередования. */
function toFloat(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  for (const [name, a] of Object.entries(g.attributes)) {
    const arr = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) arr[i * a.itemSize + k] = a.getComponent(i, k);
    out.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize));
  }
  if (g.index) out.setIndex(new THREE.BufferAttribute(new Uint32Array(g.index.array), 1));
  else {
    const n = g.attributes.position.count;
    const idx = new Uint32Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    out.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  return out;
}

/** Кусок индексной геометрии (группа материала) — отдельной геометрией. */
function subset(g: THREE.BufferGeometry, start: number, count: number): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  for (const [name, a] of Object.entries(g.attributes)) out.setAttribute(name, a);
  const src = g.index!.array as Uint32Array;
  out.setIndex(new THREE.BufferAttribute(src.slice(start, start + count), 1));
  return out;
}

export async function loadModel(url: string, name: string): Promise<Model> {
  const gltf = await loader.loadAsync(url);
  gltf.scene.updateMatrixWorld(true);
  const parts: Part[] = [];
  gltf.scene.traverse(o => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const base = toFloat(mesh.geometry);
    base.applyMatrix4(mesh.matrixWorld);
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const groups = mesh.geometry.groups.length ? mesh.geometry.groups : [{ start: 0, count: base.index!.count, materialIndex: 0 }];
    for (const gr of groups) {
      const m = mats[gr.materialIndex ?? 0] as THREE.MeshStandardMaterial;
      parts.push({ geometry: subset(base, gr.start, gr.count), mat: m.name, color: m.color.clone(), map: m.map ?? null });
    }
  });
  const box = new THREE.Box3().setFromObject(gltf.scene);
  return { name, parts, box };
}

// ---------------------------------------------------------------- люди

export type ClipName = 'Idle' | 'Walk' | 'SitDown' | 'StandUp';
export const CLIP_NAMES: ClipName[] = ['Idle', 'Walk', 'SitDown', 'StandUp'];
/** Кадров в секунду при запекании анимаций. */
export const BAKE_FPS = 30;
/** Ширина текстуры костей в текселях (кратна 4: матрица — 4 текселя подряд). */
export const BONE_TEX_W = 1024;

export interface Clip {
  /** первый кадр в общей текстуре */
  start: number;
  frames: number;
  duration: number;
}

export interface Look {
  name: string;
  geometry: THREE.BufferGeometry;
  /** упрощённая геометрия для дальнего плана */
  lod: THREE.BufferGeometry;
  clips: Record<ClipName, Clip>;
  joints: number;
  tris: number;
  lodTris: number;
  /** куда смещается тело за анимацию SitDown (м, в осях персонажа: z — вперёд, y — вверх) */
  sitShift: { z: number; y: number };
}

/** Цвет кожи у набора — чёрный «силуэт»; для больницы красим в живые тона по виду. */
const SKIN_TONES = [0xe8b896, 0xd9a07a, 0xf1c9a5, 0xc68863, 0xa86f4c, 0xeac0a0];

interface RawLook {
  name: string;
  geometry: THREE.BufferGeometry;
  /** матрицы суставов по кадрам: [кадр][сустав] — 16 чисел */
  frames: Float32Array[];
  clips: Record<ClipName, { first: number; frames: number; duration: number }>;
  joints: number;
  sitShift: { z: number; y: number };
}

/**
 * Один персонаж: части тела → одна геометрия (позиция, нормаль, цвет, индексы и веса костей),
 * анимации → матрицы суставов на каждый кадр с частотой BAKE_FPS. Высота приводится к росту.
 */
async function bakeLook(url: string, name: string, skin: number): Promise<RawLook> {
  const gltf = await loader.loadAsync(url);
  const root = gltf.scene;
  root.updateMatrixWorld(true);
  const skinned: THREE.SkinnedMesh[] = [];
  root.traverse(o => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned.push(o as THREE.SkinnedMesh);
  });
  if (!skinned.length) throw new Error(`${name}: нет SkinnedMesh`);
  const skeleton = skinned[0].skeleton;
  const joints = skeleton.bones.length;

  // Кожа набора — чёрная, и под редкими прядями волос её не видно; в живом тоне кожи макушка
  // просвечивает пятнами. Поэтому кожу выше глаз (материал Face) красим в цвет волос.
  let faceTop = -Infinity;
  let hair: THREE.Color | null = null;
  for (const sm of skinned) {
    const mats = Array.isArray(sm.material) ? sm.material : [sm.material];
    const pos = sm.geometry.attributes.position;
    const groups = sm.geometry.groups.length ? sm.geometry.groups : [{ start: 0, count: sm.geometry.index!.count, materialIndex: 0 }];
    for (const gr of groups) {
      const m = mats[gr.materialIndex ?? 0] as THREE.MeshStandardMaterial;
      if (m.name === 'Hair') hair = m.color.clone();
      if (m.name !== 'Face') continue;
      const v = new THREE.Vector3();
      for (let k = gr.start; k < gr.start + gr.count; k++) {
        v.fromBufferAttribute(pos, sm.geometry.index!.getX(k)).applyMatrix4(sm.bindMatrix);
        faceTop = Math.max(faceTop, v.y);
      }
    }
  }

  const geoms: THREE.BufferGeometry[] = [];
  for (const sm of skinned) {
    if (sm.skeleton !== skeleton) throw new Error(`${name}: части с разными скелетами`);
    const base = toFloat(sm.geometry);
    // позиции в «связанной» позе: bindMatrix переводит вершины в пространство скелета
    base.applyMatrix4(sm.bindMatrix);
    const mats = Array.isArray(sm.material) ? sm.material : [sm.material];
    const groups = sm.geometry.groups.length ? sm.geometry.groups : [{ start: 0, count: base.index!.count, materialIndex: 0 }];
    for (const gr of groups) {
      const m = mats[gr.materialIndex ?? 0] as THREE.MeshStandardMaterial;
      const g = subset(base, gr.start, gr.count);
      const c = m.name === 'Skin' ? new THREE.Color(skin) : m.color.clone();
      const n = g.attributes.position.count;
      const col = new Float32Array(n * 3);
      const py = g.attributes.position;
      const scalp = m.name === 'Skin' && hair && faceTop > -Infinity;
      for (let i = 0; i < n; i++) (scalp && py.getY(i) > faceTop ? hair! : c).toArray(col, i * 3);
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color', 'skinIndex', 'skinWeight'].includes(k)) g.deleteAttribute(k);
      geoms.push(g);
    }
  }
  const merged = mergeGeometries(geoms, false);
  if (!merged) throw new Error(`${name}: не удалось слить части`);
  // в merged индексы частей сдвинуты; вершины не сварены — так проще и для простых цветов
  const geometry = compact(merged);

  // рост: самая высокая точка связанной позы → 1,7 м, ступни на полу
  geometry.computeBoundingBox();
  const bb = geometry.boundingBox!;
  const s = 1.55 / (bb.max.y - bb.min.y);
  const norm = new THREE.Matrix4().makeScale(s, s, s).multiply(new THREE.Matrix4().makeTranslation(0, -bb.min.y, 0));
  const normInv = new THREE.Matrix4().copy(norm).invert();
  geometry.applyMatrix4(norm);

  // запекание: мировая матрица кости × обратная связанная; для вершины, уже приведённой norm:
  // world = norm · boneMatrix · norm⁻¹ · p
  const mixer = new THREE.AnimationMixer(root);
  const frames: Float32Array[] = [];
  const clips = {} as RawLook['clips'];
  const tmp = new THREE.Matrix4();
  const body = skeleton.bones.find(b => b.name === 'Body') ?? skeleton.bones.find(b => b.name === 'Hips') ?? skeleton.bones[0];
  const bodyPos: THREE.Vector3[] = [];
  for (const cn of CLIP_NAMES) {
    const clip = gltf.animations.find(a => a.name === cn);
    if (!clip) throw new Error(`${name}: нет анимации ${cn}`);
    mixer.stopAllAction();
    const action = mixer.clipAction(clip);
    // LoopOnce + clampWhenFinished: последний кадр SitDown — сидя, а не снова первый кадр
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.reset().play();
    const n = Math.max(2, Math.round(clip.duration * BAKE_FPS) + 1);
    clips[cn] = { first: frames.length, frames: n, duration: clip.duration };
    for (let f = 0; f < n; f++) {
      mixer.setTime(Math.min(clip.duration, f / BAKE_FPS));
      root.updateMatrixWorld(true);
      const arr = new Float32Array(joints * 16);
      for (let j = 0; j < joints; j++) {
        tmp.multiplyMatrices(skeleton.bones[j].matrixWorld, skeleton.boneInverses[j]);
        tmp.premultiply(norm).multiply(normInv);
        tmp.toArray(arr, j * 16);
      }
      frames.push(arr);
      if (cn === 'SitDown' && (f === 0 || f === n - 1)) bodyPos.push(new THREE.Vector3().setFromMatrixPosition(body.matrixWorld).applyMatrix4(norm));
    }
  }
  const sitShift = { z: bodyPos[1].z - bodyPos[0].z, y: bodyPos[1].y - bodyPos[0].y };
  return { name, geometry, frames, clips, joints, sitShift };
}

/** Убрать неиспользуемые вершины не нужно — mergeGeometries уже даёт плотные массивы. */
function compact(g: THREE.BufferGeometry): THREE.BufferGeometry {
  g.computeBoundingSphere();
  return g;
}

/** Упрощённая копия для дальнего плана: те же вершины, меньше треугольников (meshoptimizer). */
function simplify(g: THREE.BufferGeometry, ratio: number): THREE.BufferGeometry {
  const pos = g.attributes.position.array as Float32Array;
  const idx = new Uint32Array(g.index!.array);
  const target = Math.floor((idx.length * ratio) / 3) * 3;
  let [out] = MeshoptSimplifier.simplify(idx, pos, 3, target, 0.05, []);
  if (out.length > target * 1.5) [out] = MeshoptSimplifier.simplifySloppy(idx, pos, 3, null, target, 0.05);
  const lod = new THREE.BufferGeometry();
  for (const [k, a] of Object.entries(g.attributes)) lod.setAttribute(k, a);
  lod.setIndex(new THREE.BufferAttribute(out, 1));
  lod.boundingSphere = g.boundingSphere;
  return lod;
}

export interface People {
  looks: Look[];
  boneTexture: THREE.DataTexture;
  /** шаг суставов в текстуре (максимум по видам) */
  jointStride: number;
  totalFrames: number;
}

export async function loadPeople(base: string, names: string[], lodRatio = 0.25): Promise<People> {
  await MeshoptSimplifier.ready;
  const raws = await Promise.all(names.map((n, i) => bakeLook(`${base}/${n}.glb`, n, SKIN_TONES[i % SKIN_TONES.length])));
  const stride = Math.max(...raws.map(r => r.joints));
  const totalFrames = raws.reduce((a, r) => a + r.frames.length, 0);
  const texels = totalFrames * stride * 4;
  const h = Math.ceil(texels / BONE_TEX_W);
  const data = new Float32Array(BONE_TEX_W * h * 4);
  const looks: Look[] = [];
  let frame0 = 0;
  for (const r of raws) {
    for (let f = 0; f < r.frames.length; f++) data.set(r.frames[f], (frame0 + f) * stride * 16);
    const clips = {} as Record<ClipName, Clip>;
    for (const cn of CLIP_NAMES) clips[cn] = { start: frame0 + r.clips[cn].first, frames: r.clips[cn].frames, duration: r.clips[cn].duration };
    const lod = simplify(r.geometry, lodRatio);
    looks.push({ name: r.name, geometry: r.geometry, lod, clips, joints: r.joints, tris: r.geometry.index!.count / 3, lodTris: lod.index!.count / 3, sitShift: r.sitShift });
    frame0 += r.frames.length;
  }
  const tex = new THREE.DataTexture(data, BONE_TEX_W, h, THREE.RGBAFormat, THREE.FloatType);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return { looks, boneTexture: tex, jointStride: stride, totalFrames };
}
