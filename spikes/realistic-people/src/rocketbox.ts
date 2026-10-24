// Люди Microsoft Rocketbox (MIT): FBX с одним скелетом на 81 кость, у лиц — 175 форм (*_facial.fbx). Загрузка без запросов
// к текстурам из FBX (они TGA по путям 3ds Max) — материалы ставим свои из PNG, которые сделал tools/prepare.mjs. Поза —
// кадр анимации покоя из той же библиотеки (только повороты костей: длины костей у каждого свои). Рост — по таблице игры
// (src/render/cast.ts), чтобы сравнивать вид, а не размер. Упрощение — meshoptimizer, как у людей игры.
import * as THREE from 'three';
import { MeshoptSimplifier } from 'three/addons/libs/meshopt_simplifier.module.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { statureOf } from '../../../src/render/cast';
import { ms, tex } from './probe';

const RB = 'assets/rocketbox/Assets/';
const PREP = 'assets/prepared/';

export interface AvatarSpec {
  id: string;
  folder: 'Professions' | 'Adults';
  /** префикс материалов и текстур в наборе */
  code: string;
  sex: 'm' | 'f';
  age: 'adult' | 'old';
  role: string;
  /** скачан ли *_facial.fbx (формы лица) */
  facial: boolean;
}

export const AVATARS: AvatarSpec[] = [
  { id: 'Medical_Male_03', folder: 'Professions', code: 'm153', sex: 'm', age: 'adult', role: 'врач', facial: true },
  { id: 'Medical_Female_02', folder: 'Professions', code: 'f153', sex: 'f', age: 'adult', role: 'врач', facial: false },
  { id: 'Medical_Female_01', folder: 'Professions', code: 'f152', sex: 'f', age: 'adult', role: 'медсестра', facial: true },
  { id: 'Medical_Male_04', folder: 'Professions', code: 'm162', sex: 'm', age: 'adult', role: 'хирург', facial: false },
  { id: 'Male_Adult_14', folder: 'Adults', code: 'm012', sex: 'm', age: 'old', role: 'пациент', facial: false },
  { id: 'Female_Adult_09', folder: 'Adults', code: 'f009', sex: 'f', age: 'adult', role: 'пациентка', facial: true },
];

export const avatarSpec = (id: string) => AVATARS.find(a => a.id === id)!;

// ---------------------------------------------------------------- загрузка FBX

const manager = new THREE.LoadingManager();
// FBXLoader просит TGA по путям из файла — подменяем пустой текстурой, запросов нет
const stub = {
  path: '',
  setPath(p: string) {
    this.path = p;
    return this;
  },
  load: () => new THREE.Texture(),
};
manager.addHandler(/\.tga$/i, stub as unknown as THREE.Loader);
const fbxLoader = new FBXLoader(manager);

export interface FbxLoad {
  root: THREE.Group;
  bytes: number;
  fetchMs: number;
  parseMs: number;
}

async function loadFbx(url: string): Promise<FbxLoad> {
  const t0 = performance.now();
  const buf = await (await fetch(url)).arrayBuffer();
  const fetchMs = ms(t0);
  const t1 = performance.now();
  const root = fbxLoader.parse(buf, '');
  return { root, bytes: buf.byteLength, fetchMs, parseMs: ms(t1) };
}

const idleCache = new Map<string, Promise<THREE.AnimationClip>>();
/** Кадр покоя: анимация «стоит» из библиотеки Rocketbox; берём только повороты костей. */
function idleClip(sex: 'm' | 'f'): Promise<THREE.AnimationClip> {
  let p = idleCache.get(sex);
  if (!p) {
    p = loadFbx(`${RB}Animations/all_animations_max_motextr_static/${sex}_idle_neutral_01.max.fbx`).then(({ root }) => {
      const clip = root.animations[0];
      // кости скелета (Bip01…), без служебных узлов 3ds Max (шаги, выделение движения)
      clip.tracks = clip.tracks.filter(t => t.name.endsWith('.quaternion') && t.name.startsWith('Bip01') && !t.name.startsWith('Bip01_Footsteps'));
      return clip;
    });
    idleCache.set(sex, p);
  }
  return p;
}

let prepared: Record<string, { w: number; h: number; png: number; png512: number }> | null = null;
async function preparedIndex() {
  prepared ??= await (await fetch(`${PREP}index.json`)).json();
  return prepared!;
}

// ---------------------------------------------------------------- материалы

export type Quality = 'map' | 'portrait';

export interface TexUse {
  name: string;
  w: number;
  h: number;
}

/** Материал части тела: цвет (512² на карте, 2048² на портрете), на портрете — нормали и карта блеска. */
async function materialFor(spec: AvatarSpec, matName: string, q: Quality, used: TexUse[]): Promise<THREE.Material> {
  const idx = await preparedIndex();
  const part = matName.slice(spec.code.length + 1);
  const base = `${spec.code}_${part}`;
  const file = (n: string) => (idx[n] ? n : null);
  const color = file(`${base}_color`);
  const normal = q === 'portrait' ? file(`${base}_normal`) : null;
  const spec_ = q === 'portrait' ? file(`${base}_specular`) : null;
  const url = (n: string) => `${PREP}${n}${q === 'map' ? '@512' : ''}.png`;
  const use = (n: string) => {
    const s = idx[n];
    const k = q === 'map' ? Math.max(1, s.w / 512) : 1;
    used.push({ name: n, w: s.w / k, h: s.h / k });
  };
  const opacity = part === 'opacity';
  const skin = part === 'head';
  const m = new THREE.MeshPhysicalMaterial({
    roughness: opacity ? 0.75 : skin ? 0.52 : 0.82,
    metalness: 0,
    specularIntensity: skin ? 0.7 : 0.4,
    side: opacity ? THREE.DoubleSide : THREE.FrontSide,
    alphaTest: opacity ? 0.45 : 0,
    alphaToCoverage: opacity,
  });
  m.name = matName;
  if (color) {
    m.map = await tex(url(color), true);
    use(color);
  }
  if (normal) {
    m.normalMap = await tex(url(normal), false);
    use(normal);
  }
  if (spec_) {
    // карта блеска набора — сила отражения: тёмное (ткань, волосы) блестит меньше, кожа и глаза — больше
    m.specularColorMap = await tex(url(spec_), true);
    use(spec_);
  }
  return m;
}

// ---------------------------------------------------------------- человек

export interface Avatar {
  spec: AvatarSpec;
  /** корень: ступни на полу в начале координат, лицом к +Z, рост — по таблице игры */
  root: THREE.Group;
  mesh: THREE.SkinnedMesh;
  /** сетка после слияния одинаковых вершин (FBXLoader отдаёт каждую грань тремя своими вершинами) */
  geometry: THREE.BufferGeometry;
  tris: number;
  verts: number;
  bones: number;
  morphs: number;
  textures: TexUse[];
  load: { fbxBytes: number; fetchMs: number; parseMs: number; totalMs: number };
}

export async function loadAvatar(spec: AvatarSpec, q: Quality, facial = false, idleTime = 0.6): Promise<Avatar> {
  const t0 = performance.now();
  const url = `${RB}Avatars/${spec.folder}/${spec.id}/Export/${spec.id}${facial ? '_facial' : ''}.fbx`;
  const [fbx, clip] = await Promise.all([loadFbx(url), idleClip(spec.sex)]);
  const { root } = fbx;
  let mesh: THREE.SkinnedMesh | null = null;
  let bones = 0;
  root.traverse(o => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) mesh = o as THREE.SkinnedMesh;
    if ((o as THREE.Bone).isBone) bones++;
  });
  if (!mesh) throw new Error(`${spec.id}: нет SkinnedMesh`);
  const sm = mesh as THREE.SkinnedMesh;
  const g0 = sm.geometry;
  g0.deleteAttribute('color');
  // словарь форм лица — до замены сетки: mergeVertices не переносит имена форм
  const dict = sm.morphTargetDictionary ? { ...sm.morphTargetDictionary } : undefined;
  const geometry = mergeVertices(g0, 1e-5);
  sm.geometry = geometry;
  if (dict) {
    sm.morphTargetDictionary = dict;
    sm.morphTargetInfluences = new Array(Object.keys(dict).length).fill(0);
  }
  g0.dispose();
  const mats = Array.isArray(sm.material) ? sm.material : [sm.material];
  const textures: TexUse[] = [];
  sm.material = await Promise.all(mats.map(m => materialFor(spec, m.name, q, textures)));
  sm.castShadow = true;
  sm.receiveShadow = true;
  sm.frustumCulled = false;

  // поза покоя
  const mixer = new THREE.AnimationMixer(root);
  mixer.clipAction(clip).play();
  mixer.setTime(idleTime);
  root.updateMatrixWorld(true);

  // лицом к +Z: взгляд — от кости головы к середине глаз
  const pos = (n: string) => root.getObjectByName(n)!.getWorldPosition(new THREE.Vector3());
  const head = pos('Bip01_Head');
  const eyes = pos('Bip01_LEye').add(pos('Bip01_REye')).multiplyScalar(0.5);
  const fwd = eyes.sub(head).setY(0).normalize();
  root.rotation.y = -Math.atan2(fwd.x, fwd.z);
  root.updateMatrixWorld(true);

  // рост по таблице игры: по вершинам в позе (SkinnedMesh.computeBoundingBox учитывает кости)
  sm.computeBoundingBox();
  const box = sm.boundingBox!.clone().applyMatrix4(sm.matrixWorld);
  const s = statureOf(spec) / (box.max.y - box.min.y);
  root.scale.setScalar(s);
  root.position.set(-((box.min.x + box.max.x) / 2) * s, -box.min.y * s, -((box.min.z + box.max.z) / 2) * s);
  // корень — в группе, чтобы ставить человека снаружи, не трогая выравнивания
  const holder = new THREE.Group();
  holder.add(root);
  holder.updateMatrixWorld(true);

  const tris = geometry.index!.count / 3;
  return {
    spec,
    root: holder,
    mesh: sm,
    geometry,
    tris,
    verts: geometry.attributes.position.count,
    bones,
    morphs: geometry.morphAttributes.position?.length ?? 0,
    textures,
    load: { fbxBytes: fbx.bytes, fetchMs: fbx.fetchMs, parseMs: fbx.parseMs, totalMs: ms(t0) },
  };
}

/**
 * Нормали для форм лица. FBXLoader берёт из FBX только сдвиги вершин (нормали форм в three не читаются), и без них свет на
 * лице не меняется с выражением. Сдвиг нормали формы = нормаль сетки со сдвигом − нормаль сетки без него (обе посчитаны
 * одинаково по треугольникам); прибавляется к нормалям из файла — швы развёртки при вычитании сокращаются.
 */
export function addMorphNormals(g: THREE.BufferGeometry): number {
  const t0 = performance.now();
  const morphs = g.morphAttributes.position;
  if (!morphs?.length) return 0;
  const work = new THREE.BufferGeometry();
  const base = new Float32Array(g.attributes.position.array);
  const pos = new THREE.BufferAttribute(new Float32Array(base), 3);
  work.setAttribute('position', pos);
  work.setIndex(g.index);
  work.computeVertexNormals();
  const n0 = new Float32Array(work.attributes.normal.array);
  const normals: THREE.BufferAttribute[] = [];
  for (const m of morphs) {
    const d = m.array as Float32Array;
    const p = pos.array as Float32Array;
    for (let i = 0; i < p.length; i++) p[i] = base[i] + d[i];
    pos.needsUpdate = true;
    work.computeVertexNormals();
    const n1 = work.attributes.normal.array as Float32Array;
    const dn = new Float32Array(n1.length);
    for (let i = 0; i < dn.length; i++) dn[i] = n1[i] - n0[i];
    normals.push(new THREE.BufferAttribute(dn, 3));
  }
  g.morphAttributes.normal = normals;
  return ms(t0);
}

/** Копия человека (свои кости, та же поза) с другой сеткой — для упрощённых. */
export function cloneWith(a: Avatar, geometry: THREE.BufferGeometry): THREE.Group {
  const c = SkeletonUtils.clone(a.root) as THREE.Group;
  c.traverse(o => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) {
      const m = o as THREE.SkinnedMesh;
      m.geometry = geometry;
      m.castShadow = true;
      m.frustumCulled = false;
    }
  });
  return c;
}

// ---------------------------------------------------------------- упрощение

export interface Lod {
  geometry: THREE.BufferGeometry;
  tris: number;
  ms: number;
}

/**
 * Упрощённая сетка ~`target` треугольников: каждая группа материала — отдельно и в своей доле. Ошибка считается и по
 * развёртке и нормалям (simplifyWithAttributes); вершины на швах развёртки защищены (Protect), остальные швы (нормали)
 * можно схлопывать (Permissive) — так пряди волос и мелкие части доходят до цели без «грубого» упрощения, которое рвёт
 * развёртку. Сравнение способов — в README («Упрощение»).
 */
export function lod(g: THREE.BufferGeometry, target: number): Lod {
  const t0 = performance.now();
  const pos = new Float32Array(g.attributes.position.array);
  const uv = g.attributes.uv.array as ArrayLike<number>;
  const nrm = g.attributes.normal.array as ArrayLike<number>;
  const n = g.attributes.position.count;
  // шов развёртки: в одной точке — вершины с разными координатами текстуры
  const first = new Map<string, number>();
  const flags = new Uint8Array(n);
  const attrs = new Float32Array(n * 5);
  for (let v = 0; v < n; v++) {
    const k = `${Math.round(pos[v * 3] * 1e3)},${Math.round(pos[v * 3 + 1] * 1e3)},${Math.round(pos[v * 3 + 2] * 1e3)}`;
    const f = first.get(k);
    if (f === undefined) first.set(k, v);
    else if (Math.abs(uv[f * 2] - uv[v * 2]) > 1e-4 || Math.abs(uv[f * 2 + 1] - uv[v * 2 + 1]) > 1e-4) flags[v] = flags[f] = 2;
    attrs.set([uv[v * 2], uv[v * 2 + 1], nrm[v * 3], nrm[v * 3 + 1], nrm[v * 3 + 2]], v * 5);
  }
  const idx = g.index!.array as Uint32Array;
  const total = idx.length / 3;
  const out: number[] = [];
  const groups: { start: number; count: number; materialIndex: number }[] = [];
  const src = g.groups.length ? g.groups : [{ start: 0, count: idx.length, materialIndex: 0 }];
  for (const gr of src) {
    const part = new Uint32Array(idx.subarray(gr.start, gr.start + gr.count));
    const want = Math.max(3, Math.round(((gr.count / 3) * target) / total) * 3);
    const [res] = MeshoptSimplifier.simplifyWithAttributes(part, pos, 3, attrs, 5, [1, 1, 0.3, 0.3, 0.3], flags, want, 1, ['Permissive']);
    groups.push({ start: out.length, count: res.length, materialIndex: gr.materialIndex ?? 0 });
    for (const i of res) out.push(i);
  }
  const lg = new THREE.BufferGeometry();
  for (const [k, a] of Object.entries(g.attributes)) lg.setAttribute(k, a);
  lg.setIndex(new THREE.BufferAttribute(new Uint32Array(out), 1));
  for (const gr of groups) lg.addGroup(gr.start, gr.count, gr.materialIndex);
  return { geometry: lg, tris: out.length / 3, ms: ms(t0) };
}

export const simplifierReady = MeshoptSimplifier.ready;
