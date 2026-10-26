// из spikes/render-3d: src/people.ts — изменено: экземпляры — из толпы crowd.ts (стоит, идёт, сидит, лежит), цвет одежды и
// кожи — на экземпляр (одна геометрия на вид, разные должности и пациенты), матрица лёжа.
//
// Люди на видеокарте: каждый вид — две InstancedMesh (полная и упрощённая), все экземпляры вида — один вызов отрисовки.
// Скелетная анимация считается в вершинном шейдере: матрицы суставов всех кадров всех видов лежат в одной текстуре
// (bake.ts); на экземпляр приходят номер кадра A, кадр B и доля между ними, цвет одежды и кожи. На CPU за кадр — матрица и
// три числа на человека.
//
// Люди Rocketbox (spec docs/specs/2026-10-people.md): у вида — свой материал с атласом и маской. Одежда по маске R —
// цвет должности (цвет экземпляра) × яркость ткани, складки остаются; пряди — срез по альфе маски, и в тенях тоже.
import * as THREE from 'three';
import { BAKE_FPS, BONE_TEX_W, CLIP_NAMES, type Look, type People } from './bake';
import type { Crowd, Walker } from './crowd';

const PARS = /* glsl */ `
attribute vec4 skinIndex;
attribute vec4 skinWeight;
attribute vec3 aAnim;
attribute vec2 aTint;
attribute vec3 aSkin;
uniform highp sampler2D uBones;
mat4 boneAt(int f, float j) {
  int b = (f * JOINT_STRIDE + int(j)) * 4;
  ivec2 p = ivec2(b % BONE_W, b / BONE_W);
  return mat4(texelFetch(uBones, p, 0), texelFetch(uBones, p + ivec2(1, 0), 0),
              texelFetch(uBones, p + ivec2(2, 0), 0), texelFetch(uBones, p + ivec2(3, 0), 0));
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
// одежда — цвет экземпляра (должность, зерно пациента), кожа — свой цвет экземпляра; остальное — цвет модели
const COLOR = /* glsl */ `
#if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
  vColor = vec4( color, 1.0 );
#endif
#ifdef USE_INSTANCING_COLOR
  vColor.rgb = mix( vColor.rgb, instanceColor.rgb, aTint.x );
#endif
  vColor.rgb = mix( vColor.rgb, aSkin, aTint.y );
`;

// атлас Rocketbox: цвет экземпляра — в vTint (одежда по маске), а не множителем всего цвета
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
  if (!depth) v = v.replace('#include <color_vertex>', look ? TINT_VERTEX : COLOR);
  shader.vertexShader = v;
  if (look && !depth) {
    shader.uniforms.uMask = { value: look.mask };
    shader.uniforms.uTintRef = { value: look.tintRef || 1 };
    shader.fragmentShader = `uniform sampler2D uMask;\nuniform float uTintRef;\nvarying vec3 vTint;\n${shader.fragmentShader}`.replace('#include <color_fragment>', TINT_FRAGMENT);
  }
}

/** Цвет экземпляра: одежда и кожа. */
export interface Paint {
  clothes: THREE.Color;
  skin: THREE.Color;
}

export class PeopleView {
  readonly group = new THREE.Group();
  private full: THREE.InstancedMesh[] = [];
  private far: THREE.InstancedMesh[] = [];
  private attrs: { full: Record<'anim' | 'skin', THREE.InstancedBufferAttribute>; far: Record<'anim' | 'skin', THREE.InstancedBufferAttribute> }[] = [];
  /** материал людей с цветом в вершинах; у видов с атласом — свои (`textured`) */
  readonly material: THREE.MeshStandardMaterial;
  /** сколько людей нарисовано полной и упрощённой моделью в последнем кадре */
  nearCount = 0;
  farCount = 0;

  constructor(
    private people: People,
    private max: number,
  ) {
    // у набора материалы двусторонние (волосы — тонкие пластины)
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, side: THREE.DoubleSide });
    mat.onBeforeCompile = s => inject(s, people.boneTexture, people.jointStride, false);
    mat.customProgramCacheKey = () => 'baked-skin';
    const depth = new THREE.MeshDepthMaterial({ side: THREE.DoubleSide });
    depth.onBeforeCompile = s => inject(s, people.boneTexture, people.jointStride, true);
    depth.customProgramCacheKey = () => 'baked-skin-depth';
    this.material = mat;
    for (const look of people.looks) {
      const [lookMat, lookDepth] = look.map ? this.textured(look) : [mat, depth];
      const make = (g: THREE.BufferGeometry) => {
        const geo = g.clone();
        const anim = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
        const skin = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
        anim.setUsage(THREE.DynamicDrawUsage);
        skin.setUsage(THREE.DynamicDrawUsage);
        geo.setAttribute('aAnim', anim);
        geo.setAttribute('aSkin', skin);
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
        return { m, anim, skin };
      };
      const f = make(look.geometry);
      const d = make(look.lod);
      this.full.push(f.m);
      this.far.push(d.m);
      this.attrs.push({ full: { anim: f.anim, skin: f.skin }, far: { anim: d.anim, skin: d.skin } });
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
      const c = paint(w);
      c.clothes.toArray(mesh.instanceColor!.array, k * 3);
      c.skin.toArray(at.skin.array as Float32Array, k * 3);
      const clip = look.clips[CLIP_NAMES[w.clip]];
      const t = Math.max(0, w.clipTime) * BAKE_FPS;
      let fa: number;
      let fb: number;
      let wt: number;
      if (w.loop) {
        const tt = t % (clip.frames - 1);
        fa = Math.floor(tt);
        fb = (fa + 1) % (clip.frames - 1);
        wt = tt - fa;
      } else {
        const tt = Math.min(t, clip.frames - 1);
        fa = Math.floor(tt);
        fb = Math.min(fa + 1, clip.frames - 1);
        wt = tt - fa;
      }
      const arr = at.anim.array as Float32Array;
      arr[k * 3] = clip.start + fa;
      arr[k * 3 + 1] = clip.start + fb;
      arr[k * 3 + 2] = wt;
    }
    let near = 0;
    let far = 0;
    for (let li = 0; li < L; li++) {
      for (const [mesh, at, n0] of [
        [this.full[li], this.attrs[li].full, nFull[li]],
        [this.far[li], this.attrs[li].far, nFar[li]],
      ] as [THREE.InstancedMesh, Record<'anim' | 'skin', THREE.InstancedBufferAttribute>, number][]) {
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
        for (const a of [at.anim, at.skin]) {
          a.clearUpdateRanges();
          a.addUpdateRange(0, n * 3);
          a.needsUpdate = true;
        }
      }
      near += Math.min(nFull[li], this.max);
      far += Math.min(nFar[li], this.max);
    }
    this.nearCount = near;
    this.farCount = far;
  }
}
