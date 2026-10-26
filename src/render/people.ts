// из spikes/render-3d: src/people.ts — изменено: экземпляры — из толпы crowd.ts (стоит, идёт, сидит, лежит), цвет одежды —
// на экземпляр (одна геометрия на вид, разные должности), матрица лёжа, люди Rocketbox.
//
// Люди на видеокарте: каждый вид — две InstancedMesh (полная и упрощённая), все экземпляры вида — один вызов отрисовки.
// Скелетная анимация считается в вершинном шейдере: матрицы суставов всех кадров всех видов лежат в одной текстуре
// (bake.ts); на экземпляр приходят номер кадра A, кадр B и доля между ними, цвет одежды. На CPU за кадр — матрица и три
// числа на человека.
//
// У вида — свой материал с атласом и маской (spec docs/specs/2026-10-people.md). Одежда по маске R — цвет должности (цвет
// экземпляра) × яркость ткани, складки остаются; кожа и волосы по маске G — оттенок человека (часть 2б): волосы — свой цвет
// на яркости волос вида, кожа — светлее или темнее; пряди — срез по альфе атласа, и в тенях тоже.
import * as THREE from 'three';
import { BONE_TEX_W, type Clip, CLIP_NAMES, type Look, type People } from './bake';
import type { Tone } from './cast';
import { type Crowd, FADE, type Walker } from './crowd';

// матрица сустава в текстуре — три её верхние строки подряд (bake.ts, packPeople); нижняя — 0 0 0 1
const PARS = /* glsl */ `
attribute vec4 skinIndex;
attribute vec4 skinWeight;
attribute vec3 aAnim;
attribute vec4 aTone;
uniform highp sampler2D uBones;
mat4 boneAt(int f, float j) {
  int b = (f * JOINT_STRIDE + int(j)) * 3;
  ivec2 p = ivec2(b % BONE_W, b / BONE_W);
  vec4 r0 = texelFetch(uBones, p, 0);
  vec4 r1 = texelFetch(uBones, p + ivec2(1, 0), 0);
  vec4 r2 = texelFetch(uBones, p + ivec2(2, 0), 0);
  return mat4(r0.x, r1.x, r2.x, 0.0, r0.y, r1.y, r2.y, 0.0, r0.z, r1.z, r2.z, 0.0, r0.w, r1.w, r2.w, 1.0);
}
mat4 skinAt(int f) {
  return boneAt(f, skinIndex.x) * skinWeight.x + boneAt(f, skinIndex.y) * skinWeight.y
       + boneAt(f, skinIndex.z) * skinWeight.z + boneAt(f, skinIndex.w) * skinWeight.w;
}
`;
const BASE = /* glsl */ `
mat4 skinM = skinAt(int(aAnim.x));
if (aAnim.z > 0.001) skinM = skinM * (1.0 - aAnim.z) + skinAt(int(aAnim.y)) * aAnim.z;
`;
// цвет экземпляра — в vTint (одежда по маске), а не множителем всего цвета; оттенок человека — в vTone (волосы sRGB, кожа)
const TINT_VERTEX = /* glsl */ `
#ifdef USE_INSTANCING_COLOR
  vTint = instanceColor.rgb;
#else
  vTint = vec3( 1.0 );
#endif
vTone = aTone;
`;
// Волосы (spec, часть 2б): яркость точки в sRGB сдвинута и растянута от средней у вида (uHair) к яркости нового цвета —
// растяжение не больше ×2,5 и не меньше ×0,5, — и цвет взят новый: пряди и тени между ними остаются. Кожа — множитель,
// у тёмной — чуть теплее.
const TINT_FRAGMENT = /* glsl */ `
vec2 mk = texture2D( uMask, vMapUv ).rg;
const vec3 LUMA = vec3( 0.2126, 0.7152, 0.0722 );
float lum = dot( diffuseColor.rgb, LUMA );
diffuseColor.rgb = mix( diffuseColor.rgb, vTint * min( lum / uTintRef, 1.6 ), mk.r );
float hairW = clamp( mk.g * 2.0 - 1.0, 0.0, 1.0 );
float skinW = 1.0 - abs( mk.g * 2.0 - 1.0 );
if ( vTone.r >= 0.0 && hairW > 0.0 && uHair > 0.0 ) {
  float l = dot( pow( max( diffuseColor.rgb, vec3( 0.0 ) ), vec3( 1.0 / 2.2 ) ), LUMA );
  float tau = max( dot( vTone.rgb, LUMA ), 0.01 );
  float l2 = max( 0.02, tau + ( l - uHair ) * clamp( tau / uHair, 0.5, 2.5 ) );
  vec3 hair = pow( min( vTone.rgb * ( l2 / tau ), vec3( 1.0 ) ), vec3( 2.2 ) );
  diffuseColor.rgb = mix( diffuseColor.rgb, hair, hairW );
}
diffuseColor.rgb *= mix( vec3( 1.0 ), pow( vec3( vTone.a ), vec3( 1.0, 1.08, 1.15 ) ), skinW );
`;

function inject(shader: THREE.WebGLProgramParametersWithUniforms, bones: THREE.Texture, stride: number, depth: boolean, look?: Look) {
  shader.uniforms.uBones = { value: bones };
  let v = `#define JOINT_STRIDE ${stride}\n#define BONE_W ${BONE_TEX_W}\n${shader.vertexShader}`
    .replace('#include <skinning_pars_vertex>', look && !depth ? `${PARS}varying vec3 vTint;\nvarying vec4 vTone;\n` : PARS)
    .replace('#include <skinbase_vertex>', BASE)
    .replace('#include <skinnormal_vertex>', 'objectNormal = normalize(mat3(skinM) * objectNormal);')
    .replace('#include <skinning_vertex>', 'transformed = (skinM * vec4(transformed, 1.0)).xyz;');
  if (!depth) v = v.replace('#include <color_vertex>', TINT_VERTEX);
  shader.vertexShader = v;
  if (look && !depth) {
    shader.uniforms.uMask = { value: look.mask };
    shader.uniforms.uTintRef = { value: look.tintRef || 1 };
    shader.uniforms.uHair = { value: look.hair };
    shader.fragmentShader = `uniform sampler2D uMask;\nuniform float uTintRef;\nuniform float uHair;\nvarying vec3 vTint;\nvarying vec4 vTone;\n${shader.fragmentShader}`.replace('#include <color_fragment>', TINT_FRAGMENT);
  }
}

/** Кадры анимации на секунде `time`: A, B (номера в общей текстуре) и доля между ними; петля — по кругу, иначе — до конца. */
function frameOf(clip: Clip, time: number, loop: boolean): [number, number, number] {
  const t = Math.max(0, time) * clip.fps;
  if (loop) {
    const tt = t % (clip.frames - 1);
    const fa = Math.floor(tt);
    return [clip.start + fa, clip.start + ((fa + 1) % (clip.frames - 1)), tt - fa];
  }
  const tt = Math.min(t, clip.frames - 1);
  const fa = Math.floor(tt);
  return [clip.start + fa, clip.start + Math.min(fa + 1, clip.frames - 1), tt - fa];
}

/**
 * Одеяло (spec docs/specs/2026-10-people.md, часть 2б): ширина; полоса над телом с плоским верхом и скат к краю постели; свес
 * за край, м; цвета одеяла и отвёрнутой простыни.
 */
const BLANKET = { width: 0.96, flat: 0.17, edge: 0.44, hang: 0.12, color: 0x8ea5b7, sheet: 0xf1f3f2 };
/** Доли длины одеяла от ног: носки, ноги, живот — где какая высота (лёжа длина одеяла — около 0,7 роста). */
const PARTS = [0.13, 0.5];

/**
 * Одеяло кодом: поперёк — плоский верх над телом и скат к краю постели, за краем — свес; вдоль — от ног (+z) до груди (−z),
 * длина 1 м. Высота над постелью — 1 у вершин верха: шейдер поднимает её до высоты носков, ног или живота человека (атрибут
 * `aPart` — доли этих трёх частей у вершины, `aLift` — их высоты у экземпляра), свес не трогает. У груди — полоса простыни,
 * отвёрнутой поверх, и край одеяла чуть ниже живота. Края открыты: материал с двух сторон.
 */
function blanketGeometry(): THREE.BufferGeometry {
  const across: [number, number][] = [];
  const W = BLANKET.width / 2;
  for (let i = 0; i <= 20; i++) {
    const x = -W + (2 * W * i) / 20;
    const ax = Math.abs(x);
    const t = Math.min(1, Math.max(0, (ax - BLANKET.flat) / (BLANKET.edge - BLANKET.flat)));
    // плоский верх, плавный скат до 12 % у края постели, за краем — свес вниз (в метрах, без подъёма)
    const y = ax <= BLANKET.edge ? 1 - 0.88 * t * t * (3 - 2 * t) : -BLANKET.hang * Math.min(1, (ax - BLANKET.edge) / (W - BLANKET.edge));
    across.push([x, y]);
  }
  // вдоль: от ног (+0,5) к груди (−0,5); у груди край пониже и полоса простыни 11 см — с резкой границей (кольцо дважды)
  const along: [number, number, number][] = [];
  for (let k = 0; k <= 12; k++) along.push([0.5 - (0.89 * k) / 12, 0, 1]);
  along.push([-0.39, 1, 1], [-0.5, 1, 0.82]);
  const smooth = (e0: number, e1: number, v: number) => {
    const t = Math.min(1, Math.max(0, (v - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  };
  const pos: number[] = [];
  const col: number[] = [];
  const part: number[] = [];
  const blanket = new THREE.Color(BLANKET.color);
  const sheet = new THREE.Color(BLANKET.sheet);
  for (const [z, white, k] of along) {
    const f = 0.5 - z;
    const legs = smooth(PARTS[0] - 0.05, PARTS[0] + 0.05, f);
    const belly = smooth(PARTS[1] - 0.06, PARTS[1] + 0.06, f);
    for (const [x, y] of across) {
      pos.push(x, y > 0 ? y * k : y, z);
      const c = white ? sheet : blanket;
      col.push(c.r, c.g, c.b);
      part.push(1 - legs, legs - belly, belly);
    }
  }
  const idx: number[] = [];
  const n = across.length;
  for (let a = 0; a + 1 < along.length; a++) {
    if (along[a][0] === along[a + 1][0]) continue;
    for (let i = 0; i + 1 < n; i++) {
      const p = a * n + i;
      idx.push(p, p + n, p + 1, p + 1, p + n, p + n + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Вершина одеяла — на высоту своей части у этого человека; нормаль — вслед за растяжением по высоте. */
const BLANKET_PARS = /* glsl */ `
attribute vec3 aPart;
attribute vec3 aLift;
`;
const BLANKET_NORMAL = /* glsl */ `
vec3 objectNormal = vec3( normal );
float lift = dot( aPart, aLift );
objectNormal = normalize( objectNormal * vec3( lift, 1.0, lift ) );
`;
const BLANKET_BEGIN = /* glsl */ `
vec3 transformed = vec3( position );
float liftB = dot( aPart, aLift );
if ( transformed.y > 0.0 ) transformed.y *= liftB;
`;

function liftShader(shader: THREE.WebGLProgramParametersWithUniforms) {
  shader.vertexShader = `${BLANKET_PARS}${shader.vertexShader}`.replace('#include <begin_vertex>', BLANKET_BEGIN);
  if (shader.vertexShader.includes('#include <beginnormal_vertex>')) shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', BLANKET_NORMAL);
}

/**
 * Цвет экземпляра: одежда (красится по маске там, где у вида ткань в цвет должности) и оттенок человека (cast.ts, `toneOf`):
 * волосы — цвет sRGB, r < 0 — «как у вида»; кожа — множитель яркости.
 */
export interface Paint {
  clothes: THREE.Color;
  tone: [number, number, number, number];
}

/** Оттенок в числах экземпляра. */
export function toneVec(t: Tone): Paint['tone'] {
  if (t.hair === null) return [-1, 0, 0, t.skin];
  return [((t.hair >> 16) & 255) / 255, ((t.hair >> 8) & 255) / 255, (t.hair & 255) / 255, t.skin];
}

export class PeopleView {
  readonly group = new THREE.Group();
  private full: THREE.InstancedMesh[] = [];
  private far: THREE.InstancedMesh[] = [];
  private attrs: { full: THREE.InstancedBufferAttribute; far: THREE.InstancedBufferAttribute }[] = [];
  private tones: { full: THREE.InstancedBufferAttribute; far: THREE.InstancedBufferAttribute }[] = [];
  /** одеяла лежащих на кроватях (часть 2б): одно на всех, экземпляр — на человека */
  private blankets: THREE.InstancedMesh;
  /** высоты носков, ног и живота над постелью у каждого укрытого */
  private lift: THREE.InstancedBufferAttribute;
  /** сколько людей нарисовано полной и упрощённой моделью в последнем кадре; сколько под одеялом */
  nearCount = 0;
  farCount = 0;
  blanketCount = 0;

  constructor(
    private people: People,
    private max: number,
  ) {
    for (const look of people.looks) {
      const [lookMat, lookDepth] = this.textured(look);
      const make = (g: THREE.BufferGeometry) => {
        const geo = g.clone();
        const anim = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
        anim.setUsage(THREE.DynamicDrawUsage);
        geo.setAttribute('aAnim', anim);
        const tone = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
        tone.setUsage(THREE.DynamicDrawUsage);
        geo.setAttribute('aTone', tone);
        const m = new THREE.InstancedMesh(geo, lookMat, max);
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        m.setColorAt(0, new THREE.Color(1, 1, 1));
        m.instanceColor!.setUsage(THREE.DynamicDrawUsage);
        m.customDepthMaterial = lookDepth;
        m.frustumCulled = false;
        m.castShadow = true;
        // тень на людей не ложится (spec 2026-10-aaa-polish, «Свет, часть 2»): под крышей для теней (world.ts) помещения в
        // тени, и белый халат врача стал бы серым — люди читаются первыми, свою тень на пол они отбрасывают
        m.receiveShadow = false;
        m.count = 0;
        this.group.add(m);
        return { m, anim, tone };
      };
      const f = make(look.geometry);
      const d = make(look.lod);
      this.full.push(f.m);
      this.far.push(d.m);
      this.attrs.push({ full: f.anim, far: d.anim });
      this.tones.push({ full: f.tone, far: d.tone });
    }
    const cloth = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, side: THREE.DoubleSide });
    cloth.onBeforeCompile = liftShader;
    cloth.customProgramCacheKey = () => 'blanket';
    const geo = blanketGeometry();
    this.lift = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.lift.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aLift', this.lift);
    this.blankets = new THREE.InstancedMesh(geo, cloth, max);
    const depth = new THREE.MeshDepthMaterial({ side: THREE.DoubleSide });
    depth.onBeforeCompile = liftShader;
    depth.customProgramCacheKey = () => 'blanket-depth';
    this.blankets.customDepthMaterial = depth;
    this.blankets.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.blankets.frustumCulled = false;
    this.blankets.castShadow = true;
    this.blankets.receiveShadow = true;
    this.blankets.count = 0;
    this.group.add(this.blankets);
  }

  /** Материал вида с атласом и маской и материал его тени (срез прядей по альфе атласа). */
  private textured(look: Look): [THREE.MeshStandardMaterial, THREE.MeshDepthMaterial] {
    const { boneTexture, jointStride } = this.people;
    // пряди — пластины с двух сторон, срез по альфе атласа
    const mat = new THREE.MeshStandardMaterial({ ...(look.map ? { map: look.map } : {}), roughness: 0.82, metalness: 0, side: THREE.DoubleSide, alphaTest: 0.5 });
    mat.onBeforeCompile = s => inject(s, boneTexture, jointStride, false, look);
    mat.customProgramCacheKey = () => 'baked-skin-atlas';
    const depth = new THREE.MeshDepthMaterial({ side: THREE.DoubleSide, ...(look.map ? { map: look.map } : {}), alphaTest: 0.5 });
    depth.onBeforeCompile = s => inject(s, boneTexture, jointStride, true);
    depth.customProgramCacheKey = () => 'baked-skin-atlas-depth';
    return [mat, depth];
  }

  setShadows(on: boolean) {
    for (const m of [...this.full, ...this.far, this.blankets]) m.castShadow = on;
  }

  private m4 = new THREE.Matrix4();
  private tmp = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private one = new THREE.Vector3(1, 1, 1);
  private up = new THREE.Vector3(0, 1, 0);

  /** Матрица человека: стоит — у ступней, повёрнут по ходу; лежит — на спине, головой к изголовью (bake.ts, `lie`). */
  matrixOf(w: Walker, out: THREE.Matrix4): THREE.Matrix4 {
    const look = this.people.looks[w.look];
    this.q.setFromAxisAngle(this.up, w.heading);
    out.compose(this.p.set(w.x, w.y, w.z), this.q, this.one);
    if (w.lie > 0) {
      const k = w.lie;
      out.multiply(this.tmp.makeTranslation(0, look.lie.back * k, look.lie.mid * k));
      out.multiply(this.tmp.makeRotationX((-Math.PI / 2) * k));
    }
    return out;
  }

  /**
   * Одеяло лежащего на кровати: от груди (чуть ниже подмышек) до ног и на палец дальше; высоты носков, ног и живота — этого
   * вида (bake.ts, `lie`), с запасом на ткань — в `lift`.
   */
  blanketOf(w: Walker, out: THREE.Matrix4, lift: Float32Array, k: number): THREE.Matrix4 {
    const look = this.people.looks[w.look];
    const h = look.height;
    const from = h / 2 - 0.7 * h;
    const to = h / 2 + 0.04;
    lift[k * 3] = look.lie.toes + 0.02;
    lift[k * 3 + 1] = look.lie.legs + 0.02;
    lift[k * 3 + 2] = look.lie.belly + 0.03;
    this.q.setFromAxisAngle(this.up, w.heading);
    out.compose(this.p.set(w.x, w.y, w.z), this.q, this.one);
    out.multiply(this.tmp.makeTranslation(0, 0, (from + to) / 2));
    return out.multiply(this.tmp.makeScale(1, 1, to - from));
  }

  /**
   * Переписать экземпляры из толпы. Люди дальше `cull` (м, по земле от точки взгляда) не рисуются совсем; `full` —
   * рисовать полной моделью (камера близко), иначе — упрощённой.
   */
  update(crowd: Crowd, paint: (w: Walker) => Paint, focus: THREE.Vector3, cull: number, full: boolean) {
    const L = this.people.looks.length;
    const nFull = new Array(L).fill(0);
    const nFar = new Array(L).fill(0);
    const cull2 = cull * cull;
    let nb = 0;
    for (const w of crowd.walkers.values()) {
      const li = w.look;
      const look = this.people.looks[li];
      const dx = w.x - focus.x;
      const dz = w.z - focus.z;
      if (dx * dx + dz * dz > cull2) continue;
      if (w.state === 'lie' && w.at?.bed && nb < this.max) {
        this.blanketOf(w, this.m4, this.lift.array as Float32Array, nb).toArray(this.blankets.instanceMatrix.array, nb * 16);
        nb++;
      }
      const mesh = full ? this.full[li] : this.far[li];
      const at = full ? this.attrs[li].full : this.attrs[li].far;
      const k = full ? nFull[li]++ : nFar[li]++;
      if (k >= this.max) continue;
      this.matrixOf(w, this.m4).toArray(mesh.instanceMatrix.array, k * 16);
      const p = paint(w);
      p.clothes.toArray(mesh.instanceColor!.array, k * 3);
      (full ? this.tones[li].full : this.tones[li].far).array.set(p.tone, k * 4);
      const cur = frameOf(look.clips[CLIP_NAMES[w.clip]], w.clipTime, w.loop);
      let [fa, fb, wt] = cur;
      if (w.fade > 0) {
        // переход (crowd.ts, `setClip`): ближайшая поза прежней анимации → ближайшая поза новой, по доле прошедшего
        const old = frameOf(look.clips[CLIP_NAMES[w.fromClip]], w.fromTime, w.fromLoop);
        fa = old[2] < 0.5 ? old[0] : old[1];
        fb = cur[2] < 0.5 ? cur[0] : cur[1];
        wt = 1 - w.fade / FADE;
      }
      const arr = at.array as Float32Array;
      arr[k * 3] = fa;
      arr[k * 3 + 1] = fb;
      arr[k * 3 + 2] = wt;
    }
    let near = 0;
    let far = 0;
    for (let li = 0; li < L; li++) {
      for (const [mesh, at, tone, n0] of [
        [this.full[li], this.attrs[li].full, this.tones[li].full, nFull[li]],
        [this.far[li], this.attrs[li].far, this.tones[li].far, nFar[li]],
      ] as [THREE.InstancedMesh, THREE.InstancedBufferAttribute, THREE.InstancedBufferAttribute, number][]) {
        const n = Math.min(n0, this.max);
        mesh.count = n;
        mesh.visible = n > 0;
        if (!n) continue;
        mesh.instanceMatrix.clearUpdateRanges();
        mesh.instanceMatrix.addUpdateRange(0, n * 16);
        mesh.instanceMatrix.needsUpdate = true;
        mesh.instanceColor!.clearUpdateRanges();
        mesh.instanceColor!.addUpdateRange(0, n * 3);
        mesh.instanceColor!.needsUpdate = true;
        at.clearUpdateRanges();
        at.addUpdateRange(0, n * 3);
        at.needsUpdate = true;
        tone.clearUpdateRanges();
        tone.addUpdateRange(0, n * 4);
        tone.needsUpdate = true;
      }
      near += Math.min(nFull[li], this.max);
      far += Math.min(nFar[li], this.max);
    }
    this.nearCount = near;
    this.farCount = far;
    this.blanketCount = nb;
    this.blankets.count = nb;
    this.blankets.visible = nb > 0;
    if (nb) {
      this.blankets.instanceMatrix.clearUpdateRanges();
      this.blankets.instanceMatrix.addUpdateRange(0, nb * 16);
      this.blankets.instanceMatrix.needsUpdate = true;
      this.lift.clearUpdateRanges();
      this.lift.addUpdateRange(0, nb * 3);
      this.lift.needsUpdate = true;
    }
  }
}
