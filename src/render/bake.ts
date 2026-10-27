// из spikes/render-3d: src/assets.ts (люди: запекание анимаций) — изменено: рост и пол — по позе «стоит» после скелета, а
// не по связанной позе в сжатых координатах; точки опоры сидя и лёжа; бег; люди Rocketbox вместо частей Quaternius.
//
// Люди на видеокарте (spec docs/specs/2026-10-shell-3d.md, «Масштаб и опора»). Анимации проигрываются один раз и
// запекаются: матрицы суставов на каждый кадр (CLIP_FPS: 30 к/с, покой — 15) всех видов лежат в одной текстуре — по три
// верхние строки матрицы (нижняя всегда 0 0 0 1), числа в половинной точности: у 59 видов 8,6 МБ вместо 24 (spec
// docs/specs/2026-10-people.md, «Часть 2»). Вершинный шейдер (people.ts) смешивает кадры A и B. Чистый Three.js без DOM:
// в игре запекают потоки запекания (bake-worker.ts), то же запекание проверяют тесты в Bun (tools/test/people.test.ts) —
// по тем же числам, что уходят на видеокарту.
//
// Люди Rocketbox (spec docs/specs/2026-10-people.md; tools/app/people.mjs): сетка с атласом, упрощённая — своя сетка из
// того же файла. Анимации набора сняты на одном скелете, а пропорции у видов свои: в шаге и беге ступня поправляется так,
// чтобы стояла на полу (lockFeet), сидя — посадка под сиденье SEAT (seatTo); нет опоры — скорость по смещению корня из
// extras.
//
// Почему опора — по позе после скелета. Модели сжаты (EXT_meshopt_compression, координаты — 16-битные целые): вершины
// лежат в пределах −1…1, а переход к настоящим размерам спрятан в обратных связанных матрицах. Поза из анимации живёт в
// других координатах, чем связанная поза. Проба мерила рост и пол по связанной позе — и люди выходили выше и висели над
// полом. Здесь рост и пол меряются по кадру анимации «стоит» после скелета.
import * as THREE from 'three';
import { SEAT } from './catalog';
import { type LookSpec, lookSpec, statureOf } from './cast';

/** Анимации вида; `Sit` — петля сидя, продолжает последнюю позу посадки (spec docs/specs/2026-10-people.md, «Анимации»). */
// медленный шаг (spec docs/specs/2026-10-people.md, «Медленный шаг»; решение владельца #132) — последним: номера прежних те же
export type ClipName = 'Idle' | 'Walk' | 'Run' | 'SitDown' | 'StandUp' | 'Sit' | 'WalkSlow';
export const CLIP_NAMES: ClipName[] = ['Idle', 'Walk', 'Run', 'SitDown', 'StandUp', 'Sit', 'WalkSlow'];
/** Кадров в секунду при запекании анимаций: шаг и бег, посадка и вставание. */
export const BAKE_FPS = 30;
/**
 * Кадров в секунду по анимациям: покой стоя и сидя — медленные, им хватает 15 (шейдер смешивает соседние кадры), и кадров
 * запекания — на треть меньше: загрузка быстрее, текстура костей меньше.
 */
export const CLIP_FPS: Record<ClipName, number> = { Idle: 15, Walk: BAKE_FPS, Run: BAKE_FPS, SitDown: BAKE_FPS, StandUp: BAKE_FPS, Sit: 15, WalkSlow: BAKE_FPS };
/** Ширина текстуры костей в текселях (кратна 3: строки матрицы — 3 текселя подряд, в одной строке текстуры). */
export const BONE_TEX_W = 1026;

export interface Clip {
  /** первый кадр в общей текстуре */
  start: number;
  frames: number;
  duration: number;
  /** кадров в секунду (CLIP_FPS) */
  fps: number;
}


export interface Look {
  name: string;
  /** женская модель (cast.ts) */
  female: boolean;
  /** кто вид в игре — строка таблицы cast.ts */
  spec: LookSpec;
  /**
   * атлас (в альфе — непрозрачность прядей) и маска: R — одежда, которая красится цветом должности, G — кожа (½) и волосы
   * (1), их красит оттенок человека; в тестах без картинок — нет
   */
  map?: THREE.Texture;
  mask?: THREE.Texture;
  /** линейная яркость ткани, которую красим: цвет должности × (яркость точки / эта) — складки остаются */
  tintRef: number;
  /** средняя яркость волос вида (sRGB): новый цвет волос — вокруг неё; 0 — волос в маске нет (шапка, лысина) */
  hair: number;
  /** скорость шага и бега при ×1 проигрывания, м/с: ступня не скользит */
  walk: number;
  run: number;
  /** медленный шаг, м/с при ×1: при ней опорная ступня стоит на месте */
  walkSlow: number;
  geometry: THREE.BufferGeometry;
  /** упрощённая геометрия для дальнего плана — те же вершины, меньше треугольников */
  lod: THREE.BufferGeometry;
  clips: Record<ClipName, Clip>;
  joints: number;
  tris: number;
  lodTris: number;
  /** рост в позе «стоит», м (cast.ts, STATURE) */
  height: number;
  /** во сколько раз рост больше головы: у людей обычных пропорций — 7–8 */
  headRatio: number;
  /** ширина плеч и таза сидя против стоя: около 1 — сустав не «схлопывается» */
  collapse: { shoulders: number; hips: number };
  /**
   * точка опоры сидя (последний кадр SitDown), м, в осях человека: z — вперёд от корня, y — над полом. Человек садится
   * так, чтобы она пришлась на посадочную точку сиденья (catalog.ts)
   */
  seat: { y: number; z: number };
  /** лёжа на спине (поза «стоит», повёрнутая на 90°): на сколько корень над поверхностью и где середина тела */
  lie: { back: number; mid: number; belly: number; legs: number; toes: number };
  /** подошвы обуви — вершины костей стопы ниже 12 см в позе «стоит», левая и правая: по ним опора шага (lockFeet) и её проверка */
  soles: number[][];
}

export interface People {
  looks: Look[];
  boneTexture: THREE.DataTexture;
  /** шаг суставов в текстуре (максимум по видам) */
  jointStride: number;
  totalFrames: number;
  /** то, что лежит в текстуре (половинная точность) — для проверок на CPU (frameData, skinnedY) */
  data: Uint16Array;
}

/** Все атрибуты — в Float32 (после meshopt они целые нормированные), без чередования. */
export function toFloat(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  for (const [name, a] of Object.entries(g.attributes)) {
    const arr = new Float32Array(a.count * a.itemSize);
    const src = a.array;
    if ((a as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute) {
      for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) arr[i * a.itemSize + k] = a.getComponent(i, k);
    } else if (a.normalized) {
      // как THREE.MathUtils.denormalize, без вызова на каждое число
      const [k, signed] =
        src instanceof Int16Array ? [1 / 32767, true] : src instanceof Uint16Array ? [1 / 65535, false] : src instanceof Int8Array ? [1 / 127, true] : src instanceof Uint8Array ? [1 / 255, false] : [1, false];
      for (let i = 0; i < arr.length; i++) arr[i] = signed ? Math.max(src[i] * k, -1) : src[i] * k;
    } else arr.set(src);
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
export function subset(g: THREE.BufferGeometry, start: number, count: number): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  for (const [name, a] of Object.entries(g.attributes)) out.setAttribute(name, a);
  const src = g.index!.array as Uint32Array;
  out.setIndex(new THREE.BufferAttribute(src.slice(start, start + count), 1));
  return out;
}

export interface RawLook {
  name: string;
  female: boolean;
  geometry: THREE.BufferGeometry;
  /** упрощённая — своя сетка из того же файла */
  lod: THREE.BufferGeometry;
  map?: THREE.Texture;
  /** маска атласа (Rocketbox) — отдельным файлом рядом с glb; ставит тот, кто грузит */
  mask?: THREE.Texture;
  tintRef: number;
  hair: number;
  walk: number;
  run: number;
  /** медленный шаг, м/с при ×1: при ней опорная ступня стоит на месте */
  walkSlow: number;
  /** матрицы суставов по кадрам: [кадр][сустав] — 16 чисел, уже с приведением к росту и полу */
  frames: Float32Array[];
  clips: Record<ClipName, { first: number; frames: number; duration: number; fps: number }>;
  joints: number;
  height: number;
  headRatio: number;
  collapse: { shoulders: number; hips: number };
  seat: { y: number; z: number };
  lie: { back: number; mid: number; belly: number; legs: number; toes: number };
  soles: number[][];
}

/** Позиции вершин в позе кадра `frame` (матрицы суставов `m`, 16 чисел на сустав) — то же, что делает шейдер. */
export function skinPositions(g: THREE.BufferGeometry, m: Float32Array, out = new Float32Array(g.attributes.position.count * 3)): Float32Array {
  const pos = g.attributes.position.array as Float32Array;
  const si = g.attributes.skinIndex.array as ArrayLike<number>;
  const sw = g.attributes.skinWeight.array as ArrayLike<number>;
  const n = g.attributes.position.count;
  for (let v = 0; v < n; v++) {
    const x = pos[v * 3];
    const y = pos[v * 3 + 1];
    const z = pos[v * 3 + 2];
    let ox = 0;
    let oy = 0;
    let oz = 0;
    for (let k = 0; k < 4; k++) {
      const w = sw[v * 4 + k];
      if (w === 0) continue;
      const o = si[v * 4 + k] * 16;
      ox += w * (m[o] * x + m[o + 4] * y + m[o + 8] * z + m[o + 12]);
      oy += w * (m[o + 1] * x + m[o + 5] * y + m[o + 9] * z + m[o + 13]);
      oz += w * (m[o + 2] * x + m[o + 6] * y + m[o + 10] * z + m[o + 14]);
    }
    out[v * 3] = ox;
    out[v * 3 + 1] = oy;
    out[v * 3 + 2] = oz;
  }
  return out;
}

/** Позиции вершин `verts` в позе кадра `m`: по три числа подряд в порядке списка. */
function skinVertices(g: THREE.BufferGeometry, m: Float32Array, verts: number[]): Float32Array {
  const pos = g.attributes.position.array as Float32Array;
  const si = g.attributes.skinIndex.array as ArrayLike<number>;
  const sw = g.attributes.skinWeight.array as ArrayLike<number>;
  const out = new Float32Array(verts.length * 3);
  for (let i = 0; i < verts.length; i++) {
    const v = verts[i];
    const x = pos[v * 3];
    const y = pos[v * 3 + 1];
    const z = pos[v * 3 + 2];
    let ox = 0;
    let oy = 0;
    let oz = 0;
    for (let k = 0; k < 4; k++) {
      const w = sw[v * 4 + k];
      if (w === 0) continue;
      const o = si[v * 4 + k] * 16;
      ox += w * (m[o] * x + m[o + 4] * y + m[o + 8] * z + m[o + 12]);
      oy += w * (m[o + 1] * x + m[o + 5] * y + m[o + 9] * z + m[o + 13]);
      oz += w * (m[o + 2] * x + m[o + 6] * y + m[o + 10] * z + m[o + 14]);
    }
    out[i * 3] = ox;
    out[i * 3 + 1] = oy;
    out[i * 3 + 2] = oz;
  }
  return out;
}

/** Матрицы суставов кадра: мировая матрица кости × обратная связанная, слева — приведение `norm`. */
function frameMatrices(skeleton: THREE.Skeleton, norm: THREE.Matrix4): Float32Array {
  const joints = skeleton.bones.length;
  const arr = new Float32Array(joints * 16);
  const tmp = new THREE.Matrix4();
  for (let j = 0; j < joints; j++) {
    tmp.multiplyMatrices(skeleton.bones[j].matrixWorld, skeleton.boneInverses[j]).premultiply(norm);
    tmp.toArray(arr, j * 16);
  }
  return arr;
}

/** Вершины тела по главной кости: `re` — имена костей. */
function bodyVertices(g: THREE.BufferGeometry, bones: THREE.Bone[], re: RegExp): number[] {
  const want = new Set(bones.map((b, i) => (re.test(b.name) ? i : -1)).filter(i => i >= 0));
  const si = g.attributes.skinIndex.array as ArrayLike<number>;
  const sw = g.attributes.skinWeight.array as ArrayLike<number>;
  const out: number[] = [];
  for (let v = 0; v < g.attributes.position.count; v++) {
    let best = 0;
    let joint = -1;
    for (let k = 0; k < 4; k++) {
      if (sw[v * 4 + k] > best) {
        best = sw[v * 4 + k];
        joint = si[v * 4 + k];
      }
    }
    if (want.has(joint)) out.push(v);
  }
  return out;
}

/**
 * Тело и упрощённая (tools/app/people.mjs) — свои сетки одного скелета, развёртка — в атлас. Атрибуты — в осях после
 * привязки; скорость шага и бега — из extras корня (единицы набора в секунду).
 */
function texturedParts(root: THREE.Object3D, body: THREE.SkinnedMesh, lodMesh: THREE.SkinnedMesh) {
  const keep = ['position', 'normal', 'uv', 'skinIndex', 'skinWeight'];
  const own = (sm: THREE.SkinnedMesh) => {
    const g = toFloat(sm.geometry);
    g.applyMatrix4(sm.bindMatrix);
    for (const k of Object.keys(g.attributes)) if (!keep.includes(k)) g.deleteAttribute(k);
    return g;
  };
  const extras = (root.getObjectByName('rocketbox')?.userData ?? {}) as { speeds?: { Walk?: number; Run?: number; WalkSlow?: number }; tintRef?: number; hair?: number };
  const map = (body.material as THREE.MeshStandardMaterial).map ?? undefined;
  return { geometry: own(body), lod: own(lodMesh), map, tintRef: extras.tintRef ?? 0, hair: extras.hair ?? 0, speeds: extras.speeds ?? {} };
}

/** Один вид: сетка с атласом; анимации → матрицы суставов на каждый кадр с частотой CLIP_FPS, приведённые к росту и полу. */
export function bakeLook(gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] }, name: string): RawLook {
  const root = gltf.scene;
  root.updateMatrixWorld(true);
  const skinned: THREE.SkinnedMesh[] = [];
  root.traverse(o => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned.push(o as THREE.SkinnedMesh);
  });
  if (!skinned.length) throw new Error(`${name}: no SkinnedMesh`);
  const skeleton = skinned[0].skeleton;
  const joints = skeleton.bones.length;
  const spec = lookSpec(name);
  if (!spec) throw new Error(`${name}: not in cast.ts LOOKS`);
  const female = spec.sex === 'f';
  const body = skinned.find(s => s.name === 'body');
  const lodMesh = skinned.find(s => s.name === 'lod');
  if (!body || !lodMesh) throw new Error(`${name}: no body or lod mesh`);
  const textured = texturedParts(root, body, lodMesh);
  const geometry = textured.geometry;

  const mixer = new THREE.AnimationMixer(root);
  const clipOf = (cn: ClipName) => {
    const clip = gltf.animations.find(a => a.name === cn);
    if (!clip) throw new Error(`${name}: no animation ${cn}`);
    return clip;
  };
  let playing: THREE.AnimationAction | undefined;
  // кости — от верхней кости скелета: выше неё в сцене ничего не движется
  const top = skeleton.bones.find(b => !(b.parent as THREE.Bone | null)?.isBone)!;
  const pose = (cn: ClipName, t: number) => {
    const clip = clipOf(cn);
    if (playing?.getClip() !== clip) {
      mixer.stopAllAction();
      playing = mixer.clipAction(clip);
      // LoopOnce + clampWhenFinished: последний кадр SitDown — сидя, а не снова первый
      playing.setLoop(THREE.LoopOnce, 1);
      playing.clampWhenFinished = true;
    }
    playing.reset().play();
    mixer.setTime(t);
    top.updateMatrixWorld(true);
  };

  // рост и пол — по первому кадру «стоит» после скелета
  pose('Idle', 0);
  const raw = skinPositions(geometry, frameMatrices(skeleton, new THREE.Matrix4()));
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 1; i < raw.length; i += 3) {
    minY = Math.min(minY, raw[i]);
    maxY = Math.max(maxY, raw[i]);
  }
  const height = statureOf(spec);
  const s = height / (maxY - minY);
  const norm = new THREE.Matrix4().makeScale(s, s, s).multiply(new THREE.Matrix4().makeTranslation(0, -minY, 0));

  const frames: Float32Array[] = [];
  const clips = {} as RawLook['clips'];
  // ступни: ноги вида длиннее или короче, чем у скелета анимации, и сидя ступня уходит под пол или висит — в каждом кадре
  // посадки, вставания и петли сидя человек поднят или опущен так, чтобы ступня стояла на полу; нижняя точка ступни — среди
  // вершин подошвы (ниже 12 см стоя), верх ботинка не в счёт
  const feet = bodyVertices(geometry, skeleton.bones, /^(Foot|Toes)[LR]$/).filter(v => (raw[v * 3 + 1] - minY) * s < 0.12);
  for (const cn of CLIP_NAMES) {
    const clip = clipOf(cn);
    const fps = CLIP_FPS[cn];
    const n = Math.max(2, Math.round(clip.duration * fps) + 1);
    clips[cn] = { first: frames.length, frames: n, duration: clip.duration, fps };
    for (let f = 0; f < n; f++) {
      pose(cn, Math.min(clip.duration, f / fps));
      const m = frameMatrices(skeleton, norm);
      if (feet.length && (cn === 'SitDown' || cn === 'StandUp' || cn === 'Sit')) plant(geometry, m, feet);
      frames.push(m);
    }
  }

  // сидя: самая нижняя точка таза и бёдер в последнем кадре SitDown и середина этой нижней полосы по глубине
  const sitFrame = frames[clips.SitDown.first + clips.SitDown.frames - 1];
  const pelvis = bodyVertices(geometry, skeleton.bones, /^(Hips|UpperLeg[LR])$/);
  const seatOf = (frame = sitFrame) => {
    const p = skinVertices(geometry, frame, pelvis);
    // полы халата — на тех же костях и свисают ниже бёдер: опора — не ниже колена без 12 см
    const knee = Math.min(jointY(skeleton, frame, 'LowerLegL'), jointY(skeleton, frame, 'LowerLegR')) - 0.12;
    let low = Infinity;
    for (let i = 0; i < pelvis.length; i++) if (p[i * 3 + 1] > knee) low = Math.min(low, p[i * 3 + 1]);
    let zs = 0;
    let zn = 0;
    for (let i = 0; i < pelvis.length; i++) {
      if (p[i * 3 + 1] > knee && p[i * 3 + 1] <= low + 0.04) {
        zs += p[i * 3 + 2];
        zn++;
      }
    }
    return { y: low, z: zn ? zs / zn : 0 };
  };
  // опора сидя выше сиденья SEAT — посадка опускается, колени сгибаются сильнее (seatTo); опускание сгибает колени, бёдра
  // поднимаются, и нижняя точка уходит вверх — насколько опустить, подбирается на последнем кадре посадки
  const legs = legsOf(skeleton);
  let lift = 0;
  for (let i = 0; i < 8; i++) {
    const m = sitFrame.slice();
    lower(m, legs, lift);
    const r = SEAT - seatOf(m).y;
    if (r > -0.001) break;
    lift += r;
  }
  if (lift < 0) {
    const hips = skeleton.bones.findIndex(b => b.name === 'Hips');
    seatTo(frames, clips, legs, hips, new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().copy(skeleton.boneInverses[hips]).invert()), lift);
  }
  const seat = seatOf();

  // лёжа на спине — поза «стоит», повёрнутая вокруг X: на постель ложится спина (затылок большой головы чуть уходит в
  // подушку — так и лежат)
  const idle = skinPositions(geometry, frames[clips.Idle.first]);
  let back = Infinity;
  for (const v of bodyVertices(geometry, skeleton.bones, /^(Torso|Abdomen|Hips)$/)) back = Math.min(back, idle[v * 3 + 2]);
  // высота лежащего над постелью — живот, ноги, носки (стопа лёжа смотрит вверх): по ней одеяло (spec
  // docs/specs/2026-10-people.md, часть 2б)
  const above = (re: RegExp) => Math.max(0, ...bodyVertices(geometry, skeleton.bones, re).map(v => idle[v * 3 + 2] - back));
  const lie = { back: -back, mid: height / 2, belly: above(/^(Torso|Abdomen|Hips|Chest)$/), legs: above(/^(UpperLeg|LowerLeg)[LR]$/), toes: above(/^(Foot|Toes)[LR]$/) };

  const jointAt = (f: Float32Array, n: string) => {
    const j = skeleton.bones.findIndex(b => b.name === n);
    // положение сустава: матрица кадра × связанное положение кости
    const bind = new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().copy(skeleton.boneInverses[j]).invert());
    return bind.applyMatrix4(new THREE.Matrix4().fromArray(f, j * 16));
  };
  // голова — от подбородка до макушки в позе «стоит», по вершинам кости Head: подбородок — самая низкая из них впереди
  // сустава головы больше чем на 7 см (хвост волос и капюшон — позади, шея — ближе); пряди и шапочка — тоже на кости
  // головы: они не в счёт (четверти атласа 2 и 3, tools/app/people.mjs). Плечи и таз — расстояние между левым и правым
  // суставом стоя и сидя
  const neckless = jointAt(frames[clips.Idle.first], 'Head').z + 0.07;
  let chin = Infinity;
  let crown = -Infinity;
  const uv = geometry.attributes.uv.array as ArrayLike<number>;
  for (const v of bodyVertices(geometry, skeleton.bones, /^Head$/)) {
    if (uv[v * 2 + 1] >= 0.5) continue;
    crown = Math.max(crown, idle[v * 3 + 1]);
    if (idle[v * 3 + 2] > neckless) chin = Math.min(chin, idle[v * 3 + 1]);
  }
  const headRatio = height / (crown - chin);
  const width = (f: Float32Array, a: string, b: string) => jointAt(f, a).distanceTo(jointAt(f, b));
  const stand = frames[clips.Idle.first];
  const collapse = {
    shoulders: width(sitFrame, 'UpperArmL', 'UpperArmR') / width(stand, 'UpperArmL', 'UpperArmR'),
    hips: width(sitFrame, 'UpperLegL', 'UpperLegR') / width(stand, 'UpperLegL', 'UpperLegR'),
  };

  // шаг и бег: опорная ступня стоит на полу (lockFeet); нет опоры в клипе — скорость по смещению корня
  if (!textured.speeds.Walk || !textured.speeds.Run || !textured.speeds.WalkSlow) throw new Error(`${name}: no walk, run or slow walk speed`);
  const soles = (['L', 'R'] as const).map(side => bodyVertices(geometry, skeleton.bones, new RegExp(`^(Foot|Toes)${side}$`)).filter(v => idle[v * 3 + 1] < 0.12));
  const walk = lockFeet(geometry, frames, clips.Walk, legs, soles) ?? textured.speeds.Walk * s;
  const run = lockFeet(geometry, frames, clips.Run, legs, soles) ?? textured.speeds.Run * s;
  const walkSlow = lockFeet(geometry, frames, clips.WalkSlow, legs, soles) ?? textured.speeds.WalkSlow * s;
  return { name, female, geometry, lod: textured.lod, map: textured.map, tintRef: textured.tintRef, hair: textured.hair, walk, run, walkSlow, frames, clips, joints, height, headRatio, collapse, seat, lie, soles };
}

/**
 * Сидя — на сиденье высоты SEAT (catalog.ts). Опора сидя при ступнях на полу у видов разная: голени разной длины, 0,36–0,45
 * м. Сиденье — у нижних; выше него опора — и человек на стуле уходил бы ступнями под пол: посадка, петля сидя и вставание
 * опускаются на `lift` (< 0) — в посадке и вставании по доле пути таза вниз, — а ступни остаются на полу: ноги
 * дотягиваются (reach), колени сгибаются сильнее, как у высокого на низком стуле. Опора ниже сиденья — на 2 см у самых
 * коротконогих — поднимает корень (crowd.ts, `seatRoot`): ступни чуть не достают пола.
 */
function seatTo(frames: Float32Array[], clips: RawLook['clips'], legs: Leg[], hips: number, bind: THREE.Vector3, lift: number) {
  const shift = (m: Float32Array, k: number) => lower(m, legs, k * lift);
  // доля пути таза от «стоит» (кадр `stand`) к «сидит» (кадр `sit`)
  const ramp = (c: { first: number; frames: number }, stand: number, sit: number) => {
    const ys = Array.from({ length: c.frames }, (_, f) => jointOf(frames[c.first + f], hips, bind).y);
    const span = ys[stand] - ys[sit] || 1;
    ys.forEach((y, f) => shift(frames[c.first + f], Math.max(0, Math.min(1, (ys[stand] - y) / span))));
  };
  ramp(clips.SitDown, 0, clips.SitDown.frames - 1);
  ramp(clips.StandUp, clips.StandUp.frames - 1, 0);
  for (let f = 0; f < clips.Sit.frames; f++) shift(frames[clips.Sit.first + f], 1);
}

/** Поднять кадр `m` на `d` (опустить — d < 0), ступни оставить на месте: ноги дотягиваются (reach). */
function lower(m: Float32Array, legs: Leg[], d: number) {
  if (Math.abs(d) < 1e-6) return;
  for (let o = 0; o < m.length; o += 16) m[o + 13] += d;
  for (const leg of legs) reach(m, leg, -d, 0);
}

/** Касание: нижняя точка подошвы не выше пола (или своего низа, если стопа под пол не уходит) больше чем на столько, м. */
export const CONTACT = 0.01;

/** Нога: суставы бедра и колена, стопа и всё ниже неё (стопа — первой), их места в связанной позе. */
interface Leg {
  hip: number;
  knee: number;
  foot: number[];
  bind: [THREE.Vector3, THREE.Vector3, THREE.Vector3];
}

function legsOf(skeleton: THREE.Skeleton): Leg[] {
  const bind = (j: number) => new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().copy(skeleton.boneInverses[j]).invert());
  return (['L', 'R'] as const).map(side => {
    const j = (n: string) => {
      const i = skeleton.bones.findIndex(b => b.name === `${n}${side}`);
      if (i < 0) throw new Error(`no bone ${n}${side}`);
      return i;
    };
    const [hip, knee, ankle] = [j('UpperLeg'), j('LowerLeg'), j('Foot')];
    const below = (b: THREE.Object3D) => {
      for (let o = b.parent; o; o = o.parent) if (o === skeleton.bones[ankle]) return true;
      return false;
    };
    const foot = [ankle, ...skeleton.bones.flatMap((b, i) => (below(b) ? [i] : []))];
    return { hip, knee, foot, bind: [bind(hip), bind(knee), bind(ankle)] };
  });
}

/** Опоры одной стопы в петле: в каждом кадре — нижняя вершина подошвы, её высота и сдвиг вдоль хода к следующему кадру. */
export interface Stance {
  /** высота нижней точки подошвы по кадрам, м */
  low: number[];
  /** на сколько нижняя вершина кадра f уходит вдоль хода к кадру f + 1, м (назад — меньше нуля) */
  step: number[];
  /** опоры: номера кадров подряд по кругу петли */
  runs: number[][];
}

/**
 * Опоры стопы в петле из `n` кадров (последний кадр клипа — снова первый, его нет): касание (CONTACT) три кадра и дольше,
 * и стопа в нём уходит назад — касание носком в полёте шага уходит вперёд, это не опора. `at(f)` — позиции вершин кадра.
 */
export function stanceOf(n: number, sole: number[], at: (f: number) => Float32Array): Stance {
  const pos = Array.from({ length: n }, (_, f) => at(f));
  const lowV: number[] = [];
  const low: number[] = [];
  for (const p of pos) {
    let y = Infinity;
    let v0 = sole[0];
    for (const v of sole) if (p[v * 3 + 1] < y) [y, v0] = [p[v * 3 + 1], v];
    lowV.push(v0);
    low.push(y);
  }
  const step = pos.map((p, f) => pos[(f + 1) % n][lowV[f] * 3 + 2] - p[lowV[f] * 3 + 2]);
  const top = Math.max(0, Math.min(...low)) + CONTACT;
  const on = low.map(y => y <= top);
  const runs: number[][] = [];
  for (let f = 0; f < n; f++) {
    if (!on[f] || on[(f + n - 1) % n]) continue;
    const run = [f];
    for (let k = (f + 1) % n; on[k] && k !== f; k = (k + 1) % n) run.push(k);
    if (run.length >= 3 && run.slice(0, -1).reduce((sum, k) => sum + step[k], 0) < 0) runs.push(run);
  }
  return { low, step, runs };
}

/** Сдвиг опорной точки в мире за опору при скорости хода `v`, м/с: от начала опоры по кадрам. */
export function drift(st: Stance, run: number[], v: number): number[] {
  const d = [0];
  for (let i = 0; i < run.length - 1; i++) d.push(d[i] + st.step[run[i]] + v / BAKE_FPS);
  return d;
}

/**
 * Ступня стоит (spec docs/specs/2026-10-people.md, «Анимации»). Анимации набора сняты на другом скелете: у вида с другими
 * пропорциями опорная ступня уходит назад не с той скоростью, с какой человек идёт, у левой и правой — по-разному, и при
 * любой скорости хода одна из них скользила бы до 5 см за шаг. Скорость хода — та, при которой хуже всего скользящая опора
 * скользит меньше всего; остаток снимает нога: в каждом кадре опоры стопа сдвигается вдоль хода так, чтобы опорная точка в
 * мире стояла на месте, ушедшая под пол — поднимается на пол, бедро и голень дотягиваются до неё (reach); в полёте сдвиг
 * плавно переходит от конца одной опоры к началу следующей, а стопа идёт не ниже CONTACT над полом. Меняет кадры клипа на
 * месте; нет опоры — undefined.
 */
function lockFeet(g: THREE.BufferGeometry, frames: Float32Array[], clip: { first: number; frames: number }, legs: Leg[], soles: number[][]): number | undefined {
  const n = clip.frames - 1;
  // только вершины подошв: номера в своём списке
  const verts = soles.flat();
  const pos = Array.from({ length: n }, (_, f) => skinVertices(g, frames[clip.first + f], verts));
  let k = 0;
  const st = soles.map(sole => stanceOf(n, sole.map(() => k++), f => pos[f]));
  if (!st.some(s => s.runs.length)) return undefined;
  const worst = (v: number) => {
    let w = 0;
    for (const s of st) {
      for (const run of s.runs) {
        const d = drift(s, run, v);
        w = Math.max(w, Math.max(...d) - Math.min(...d));
      }
    }
    return w;
  };
  // скорость — с шагом 1 мм/с, от 0,3 до 6 м/с: размах сдвига за опору выпуклый по скорости (наибольшее из линейных минус
  // наименьшее), наибольший по опорам — тоже, и наименьший ищется делением отрезка на три
  let lo = 300;
  let hi = 6000;
  while (hi - lo > 2) {
    const a = lo + Math.floor((hi - lo) / 3);
    const b = hi - Math.floor((hi - lo) / 3);
    const wa = worst(a / 1000);
    const wb = worst(b / 1000);
    if (wa < wb) hi = b - 1;
    else if (wa > wb) lo = a + 1;
    else [lo, hi] = [a, b];
  }
  let speed = lo / 1000;
  for (let i = lo + 1; i <= hi; i++) if (worst(i / 1000) < worst(speed)) speed = i / 1000;
  st.forEach((s, side) => {
    const dz = new Array<number>(n).fill(0);
    const on = new Array<boolean>(n).fill(false);
    for (const run of s.runs) {
      const d = drift(s, run, speed);
      const mid = (Math.max(...d) + Math.min(...d)) / 2;
      run.forEach((f, i) => {
        dz[f] = mid - d[i];
        on[f] = true;
      });
    }
    // полёт: от конца прежней опоры к началу следующей, плавно
    if (!s.runs.length) return;
    for (let f = 0; f < n; f++) {
      if (on[f]) continue;
      let a = f;
      while (!on[a]) a = (a + n - 1) % n;
      let b = f;
      while (!on[b]) b = (b + 1) % n;
      const t = ((f - a + n) % n) / ((b - a + n) % n || n);
      const k = t * t * (3 - 2 * t);
      dz[f] = dz[a] + (dz[b] - dz[a]) * k;
    }
    // в опоре ушедшая под пол стопа — на полу, в полёте — не ниже CONTACT: носок не чиркает по полу
    for (let f = 0; f < n; f++) reach(frames[clip.first + f], legs[side], Math.max(0, (on[f] ? 0 : CONTACT) - s.low[f]), dz[f]);
  });
  // петля: последний кадр — снова первый
  frames[clip.first + n] = frames[clip.first].slice();
  return speed;
}

const mJ = new THREE.Matrix4();
/** Сустав в кадре: матрица кадра × место в связанной позе. */
const jointOf = (m: Float32Array, j: number, bind: THREE.Vector3) => bind.clone().applyMatrix4(mJ.fromArray(m, j * 16));
/** Поворот `q` вокруг точки `p`. */
const about = (p: THREE.Vector3, q: THREE.Quaternion) =>
  new THREE.Matrix4().makeTranslation(p.x, p.y, p.z).multiply(new THREE.Matrix4().makeRotationFromQuaternion(q)).multiply(new THREE.Matrix4().makeTranslation(-p.x, -p.y, -p.z));
/** Применить к суставу `j` кадра перемещение `w` в мире. */
const move = (m: Float32Array, j: number, w: THREE.Matrix4) => mJ.fromArray(m, j * 16).premultiply(w).toArray(m, j * 16);

/**
 * Дотянуть ногу кадра `m` до стопы, сдвинутой на `dy` вверх и `dz` вдоль хода (две кости): колено остаётся в своей
 * плоскости, бедро поворачивается вокруг тазобедренного сустава, голень — вокруг нового колена, стопа и пальцы
 * переносятся без поворота. Не дотянуться — нога прямая, стопа — докуда достаёт.
 */
function reach(m: Float32Array, leg: Leg, dy: number, dz: number) {
  if (Math.abs(dy) < 1e-6 && Math.abs(dz) < 1e-6) return;
  const H = jointOf(m, leg.hip, leg.bind[0]);
  const K = jointOf(m, leg.knee, leg.bind[1]);
  const A = jointOf(m, leg.foot[0], leg.bind[2]);
  const a = H.distanceTo(K);
  const b = K.distanceTo(A);
  const T = A.clone().add(new THREE.Vector3(0, dy, dz));
  const u = T.clone().sub(H);
  const d = Math.min(a + b - 1e-5, Math.max(Math.abs(a - b) + 1e-5, u.length()));
  u.normalize();
  T.copy(H).addScaledVector(u, d);
  // плоскость колена: его отступ от линии «бедро — стопа»; нога прямая — колено вперёд
  const w = K.clone().sub(H);
  w.addScaledVector(u, -w.dot(u));
  if (w.lengthSq() < 1e-12) w.set(0, 0, 1).addScaledVector(u, -u.z);
  w.normalize();
  const cos = (a * a + d * d - b * b) / (2 * a * d);
  const K2 = H.clone().addScaledVector(u, a * cos).addScaledVector(w, a * Math.sqrt(Math.max(0, 1 - cos * cos)));
  const thigh = about(H, new THREE.Quaternion().setFromUnitVectors(K.clone().sub(H).normalize(), K2.clone().sub(H).normalize()));
  const A1 = A.clone().applyMatrix4(thigh);
  const shin = about(K2, new THREE.Quaternion().setFromUnitVectors(A1.sub(K2).normalize(), T.clone().sub(K2).normalize())).multiply(thigh);
  move(m, leg.hip, thigh);
  move(m, leg.knee, shin);
  const foot = new THREE.Matrix4().makeTranslation(T.x - A.x, T.y - A.y, T.z - A.z);
  for (const j of leg.foot) move(m, j, foot);
}

/** Поднять или опустить кадр `m` так, чтобы нижняя из вершин `feet` была на полу. */
function plant(g: THREE.BufferGeometry, m: Float32Array, feet: number[]) {
  const pos = g.attributes.position.array as Float32Array;
  const si = g.attributes.skinIndex.array as ArrayLike<number>;
  const sw = g.attributes.skinWeight.array as ArrayLike<number>;
  let low = Infinity;
  for (const v of feet) {
    let y = 0;
    for (let k = 0; k < 4; k++) {
      const w = sw[v * 4 + k];
      if (w === 0) continue;
      const o = si[v * 4 + k] * 16;
      y += w * (m[o + 1] * pos[v * 3] + m[o + 5] * pos[v * 3 + 1] + m[o + 9] * pos[v * 3 + 2] + m[o + 13]);
    }
    low = Math.min(low, y);
  }
  // сдвиг по высоте — в перенос каждой матрицы сустава (строка y четвёртого столбца)
  for (let o = 0; o < m.length; o += 16) m[o + 13] -= low;
}

/** Высота сустава в кадре (матрицы кадра × связанное положение кости). */
function jointY(skeleton: THREE.Skeleton, f: Float32Array, name: string): number {
  const j = skeleton.bones.findIndex(b => b.name === name);
  const bind = new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().copy(skeleton.boneInverses[j]).invert());
  return bind.applyMatrix4(new THREE.Matrix4().fromArray(f, j * 16)).y;
}

/** Сетка вида для передачи между потоками: атрибуты и индексы — свои буферы, уходят без копии. */
export interface WireGeometry {
  attributes: Record<string, { array: Float32Array; itemSize: number }>;
  index: Uint32Array;
}

/**
 * Запечённый вид для передачи из потока запекания (bake-worker.ts) в окно (spec docs/specs/2026-10-people.md,
 * «Производительность»): сетки, все кадры подряд одним массивом и атлас — картинкой ImageBitmap, без копии (toWire).
 */
export interface WireLook extends Omit<RawLook, 'geometry' | 'lod' | 'map' | 'mask' | 'frames'> {
  geometry: WireGeometry;
  lod: WireGeometry;
  /** матрицы суставов всех кадров подряд: на кадр — 16 чисел на сустав */
  frames: Float32Array;
  map?: { image: ImageBitmap; flipY: boolean; colorSpace: string; wrapS: THREE.Wrapping; wrapT: THREE.Wrapping; magFilter: THREE.MagnificationTextureFilter; minFilter: THREE.MinificationTextureFilter };
}

/** Вид — в передачу между потоками: что уходит без копии — в `transfer`. */
export function toWire(r: RawLook): { look: WireLook; transfer: Transferable[] } {
  const transfer: Transferable[] = [];
  const geo = (g: THREE.BufferGeometry): WireGeometry => {
    const attributes: WireGeometry['attributes'] = {};
    for (const [name, a] of Object.entries(g.attributes)) {
      const array = a.array as Float32Array;
      attributes[name] = { array, itemSize: a.itemSize };
      transfer.push(array.buffer);
    }
    const index = g.index!.array as Uint32Array;
    transfer.push(index.buffer);
    return { attributes, index };
  };
  const size = r.joints * 16;
  const frames = new Float32Array(r.frames.length * size);
  r.frames.forEach((m, f) => frames.set(m, f * size));
  transfer.push(frames.buffer);
  const { geometry, lod, map, mask: _mask, frames: _frames, ...rest } = r;
  const look: WireLook = { ...rest, geometry: geo(geometry), lod: geo(lod), frames };
  const image = map?.image as ImageBitmap | undefined;
  if (map && image) {
    look.map = { image, flipY: map.flipY, colorSpace: map.colorSpace, wrapS: map.wrapS, wrapT: map.wrapT, magFilter: map.magFilter, minFilter: map.minFilter };
    transfer.push(image);
  }
  return { look, transfer };
}

/** Вид из передачи — снова с сетками, кадрами и атласом Three.js. */
export function fromWire(w: WireLook): RawLook {
  const geo = (x: WireGeometry) => {
    const g = new THREE.BufferGeometry();
    for (const [name, a] of Object.entries(x.attributes)) g.setAttribute(name, new THREE.BufferAttribute(a.array, a.itemSize));
    g.setIndex(new THREE.BufferAttribute(x.index, 1));
    return g;
  };
  const size = w.joints * 16;
  const frames = Array.from({ length: w.frames.length / size }, (_, f) => w.frames.subarray(f * size, (f + 1) * size));
  const { geometry, lod, map: m, frames: _frames, ...rest } = w;
  let map: THREE.Texture | undefined;
  if (m) {
    map = new THREE.Texture(m.image);
    map.flipY = m.flipY;
    map.colorSpace = m.colorSpace;
    map.wrapS = m.wrapS;
    map.wrapT = m.wrapT;
    map.magFilter = m.magFilter;
    map.minFilter = m.minFilter;
    map.needsUpdate = true;
  }
  return { ...rest, geometry: geo(geometry), lod: geo(lod), frames, ...(map ? { map } : {}) };
}

/** Все виды людей: запечённые матрицы — в одну текстуру. */
export function packPeople(raws: RawLook[]): People {
  const stride = Math.max(...raws.map(r => r.joints));
  const totalFrames = raws.reduce((a, r) => a + r.frames.length, 0);
  const texels = totalFrames * stride * 3;
  const h = Math.ceil(texels / BONE_TEX_W);
  const data = new Uint16Array(BONE_TEX_W * h * 4);
  const half = THREE.DataUtils.toHalfFloat;
  const looks: Look[] = [];
  let frame0 = 0;
  raws.forEach(r => {
    // матрица по столбцам (Three.js) → три её строки подряд: (m00 m01 m02 m03), (m10 …), (m20 …)
    for (let f = 0; f < r.frames.length; f++) {
      const m = r.frames[f];
      for (let j = 0; j < r.joints; j++) {
        const o = ((frame0 + f) * stride + j) * 12;
        for (let row = 0; row < 3; row++) for (let col = 0; col < 4; col++) data[o + row * 4 + col] = half(m[j * 16 + col * 4 + row]);
      }
    }
    const clips = {} as Record<ClipName, Clip>;
    for (const cn of CLIP_NAMES) clips[cn] = { start: frame0 + r.clips[cn].first, frames: r.clips[cn].frames, duration: r.clips[cn].duration, fps: r.clips[cn].fps };
    const lod = r.lod;
    looks.push({
      name: r.name, female: r.female, spec: lookSpec(r.name)!, geometry: r.geometry, lod, clips, joints: r.joints, tris: r.geometry.index!.count / 3, lodTris: lod.index!.count / 3,
      height: r.height, headRatio: r.headRatio, collapse: r.collapse, seat: r.seat, lie: r.lie, soles: r.soles,
      map: r.map, mask: r.mask, tintRef: r.tintRef, hair: r.hair, walk: r.walk, run: r.run, walkSlow: r.walkSlow,
    });
    frame0 += r.frames.length;
  });
  const tex = new THREE.DataTexture(data, BONE_TEX_W, h, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return { looks, boneTexture: tex, jointStride: stride, totalFrames, data };
}

/** Матрицы кадра `frame` (номер в общей текстуре) вида `look` — для проверок на CPU. */
export function frameData(p: People, look: Look, frame: number): Float32Array {
  const out = new Float32Array(look.joints * 16);
  const num = THREE.DataUtils.fromHalfFloat;
  for (let j = 0; j < look.joints; j++) {
    const o = (frame * p.jointStride + j) * 12;
    for (let row = 0; row < 3; row++) for (let col = 0; col < 4; col++) out[j * 16 + col * 4 + row] = num(p.data[o + row * 4 + col]);
    out[j * 16 + 15] = 1;
  }
  return out;
}

/** Нижняя и верхняя точка вида в кадре: по всем вершинам, которые рисует геометрия `g` (полная или упрощённая). */
export function skinnedY(p: People, look: Look, frame: number, g: THREE.BufferGeometry = look.geometry): { min: number; max: number } {
  // упрощённая — со своими вершинами
  const pos = skinPositions(g, frameData(p, look, frame));
  const idx = g.index!.array as ArrayLike<number>;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < idx.length; i++) {
    const y = pos[idx[i] * 3 + 1];
    if (y < min) min = y;
    if (y > max) max = y;
  }
  return { min, max };
}
