// из spikes/render-3d: src/people.ts — изменено: экземпляры — из толпы crowd.ts (стоит, идёт, сидит, лежит), цвет одежды —
// на экземпляр (одна геометрия на вид, разные должности), матрица лёжа, люди Rocketbox.
//
// Люди на видеокарте: каждый вид — две InstancedMesh (полная и упрощённая), все экземпляры вида — один вызов отрисовки.
// Скелетная анимация считается в вершинном шейдере: матрицы суставов всех кадров всех видов лежат в одной текстуре
// (bake.ts); на экземпляр приходят номер кадра A, кадр B и доля между ними, цвет одежды. На CPU за кадр — матрица и три
// числа на человека.
//
// У вида — свой материал с атласом и маской (spec docs/specs/2026-10-people.md). Одежда по маске R — цвет должности (цвет
// экземпляра) × яркость ткани, складки остаются; пряди — срез по альфе маски, и в тенях тоже.
import * as THREE from 'three';
import { BONE_TEX_W, type Clip, CLIP_NAMES, type Look, type People } from './bake';
import { type Crowd, FADE, type Walker } from './crowd';

// матрица сустава в текстуре — три её верхние строки подряд (bake.ts, packPeople); нижняя — 0 0 0 1
const PARS = /* glsl */ `
attribute vec4 skinIndex;
attribute vec4 skinWeight;
attribute vec3 aAnim;
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
// цвет экземпляра — в vTint (одежда по маске), а не множителем всего цвета
const TINT_VERTEX = /* glsl */ `
#ifdef USE_INSTANCING_COLOR
  vTint = instanceColor.rgb;
#else
  vTint = vec3( 1.0 );
#endif
`;
const TINT_FRAGMENT = /* glsl */ `
vec4 mk = texture2D( uMask, vMapUv );
if ( mk.a < 0.5 ) discard;
float lum = dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
diffuseColor.rgb = mix( diffuseColor.rgb, vTint * min( lum / uTintRef, 1.6 ), mk.r );
`;

function inject(shader: THREE.WebGLProgramParametersWithUniforms, bones: THREE.Texture, stride: number, depth: boolean, look?: Look) {
  shader.uniforms.uBones = { value: bones };
  let v = `#define JOINT_STRIDE ${stride}\n#define BONE_W ${BONE_TEX_W}\n${shader.vertexShader}`
    .replace('#include <skinning_pars_vertex>', look && !depth ? `${PARS}varying vec3 vTint;\n` : PARS)
    .replace('#include <skinbase_vertex>', BASE)
    .replace('#include <skinnormal_vertex>', 'objectNormal = normalize(mat3(skinM) * objectNormal);')
    .replace('#include <skinning_vertex>', 'transformed = (skinM * vec4(transformed, 1.0)).xyz;');
  if (!depth) v = v.replace('#include <color_vertex>', TINT_VERTEX);
  shader.vertexShader = v;
  if (look && !depth) {
    shader.uniforms.uMask = { value: look.mask };
    shader.uniforms.uTintRef = { value: look.tintRef || 1 };
    shader.fragmentShader = `uniform sampler2D uMask;\nuniform float uTintRef;\nvarying vec3 vTint;\n${shader.fragmentShader}`.replace('#include <color_fragment>', TINT_FRAGMENT);
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

/** Цвет экземпляра: одежда (красится по маске там, где у вида ткань в цвет должности). */
export interface Paint {
  clothes: THREE.Color;
}

export class PeopleView {
  readonly group = new THREE.Group();
  private full: THREE.InstancedMesh[] = [];
  private far: THREE.InstancedMesh[] = [];
  private attrs: { full: THREE.InstancedBufferAttribute; far: THREE.InstancedBufferAttribute }[] = [];
  /** сколько людей нарисовано полной и упрощённой моделью в последнем кадре */
  nearCount = 0;
  farCount = 0;

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
        return { m, anim };
      };
      const f = make(look.geometry);
      const d = make(look.lod);
      this.full.push(f.m);
      this.far.push(d.m);
      this.attrs.push({ full: f.anim, far: d.anim });
    }
  }

  /** Материал вида с атласом и маской и материал его тени (срез прядей по альфе маски). */
  private textured(look: Look): [THREE.MeshStandardMaterial, THREE.MeshDepthMaterial] {
    const { boneTexture, jointStride } = this.people;
    // пряди — пластины с двух сторон
    const mat = new THREE.MeshStandardMaterial({ map: look.map, roughness: 0.82, metalness: 0, side: THREE.DoubleSide });
    mat.onBeforeCompile = s => inject(s, boneTexture, jointStride, false, look);
    mat.customProgramCacheKey = () => 'baked-skin-atlas';
    const depth = new THREE.MeshDepthMaterial({ side: THREE.DoubleSide, map: look.mask, alphaTest: 0.5 });
    depth.onBeforeCompile = s => inject(s, boneTexture, jointStride, true);
    depth.customProgramCacheKey = () => 'baked-skin-atlas-depth';
    return [mat, depth];
  }

  setShadows(on: boolean) {
    for (const m of [...this.full, ...this.far]) m.castShadow = on;
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
   * Переписать экземпляры из толпы. Люди дальше `cull` (м, по земле от точки взгляда) не рисуются совсем; `full` —
   * рисовать полной моделью (камера близко), иначе — упрощённой.
   */
  update(crowd: Crowd, paint: (w: Walker) => Paint, focus: THREE.Vector3, cull: number, full: boolean) {
    const L = this.people.looks.length;
    const nFull = new Array(L).fill(0);
    const nFar = new Array(L).fill(0);
    const cull2 = cull * cull;
    for (const w of crowd.walkers.values()) {
      const li = w.look;
      const look = this.people.looks[li];
      const dx = w.x - focus.x;
      const dz = w.z - focus.z;
      if (dx * dx + dz * dz > cull2) continue;
      const mesh = full ? this.full[li] : this.far[li];
      const at = full ? this.attrs[li].full : this.attrs[li].far;
      const k = full ? nFull[li]++ : nFar[li]++;
      if (k >= this.max) continue;
      this.matrixOf(w, this.m4).toArray(mesh.instanceMatrix.array, k * 16);
      paint(w).clothes.toArray(mesh.instanceColor!.array, k * 3);
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
      for (const [mesh, at, n0] of [
        [this.full[li], this.attrs[li].full, nFull[li]],
        [this.far[li], this.attrs[li].far, nFar[li]],
      ] as [THREE.InstancedMesh, THREE.InstancedBufferAttribute, number][]) {
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
      }
      near += Math.min(nFull[li], this.max);
      far += Math.min(nFar[li], this.max);
    }
    this.nearCount = near;
    this.farCount = far;
  }
}
