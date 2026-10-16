// Люди на видеокарте: каждый вид (врач, пациент в своей одежде…) — две InstancedMesh (полная и
// упрощённая), все экземпляры вида рисуются одним вызовом. Скелетная анимация считается в
// вершинном шейдере: матрицы суставов всех кадров всех видов лежат в одной текстуре
// (assets.ts, «запекание»); на экземпляр приходят только номер кадра A, кадр B и доля между ними.
// На CPU за кадр — позиция, поворот и номер кадра на человека; на видеокарте — всё остальное.
import * as THREE from 'three';
import { BAKE_FPS, BONE_TEX_W, type ClipName, type People } from './assets';
import type { Crowd3D } from './crowd';

const PARS = /* glsl */ `
attribute vec4 skinIndex;
attribute vec4 skinWeight;
attribute vec3 aAnim;
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

function inject(shader: THREE.WebGLProgramParametersWithUniforms, bones: THREE.Texture, stride: number) {
  shader.uniforms.uBones = { value: bones };
  shader.vertexShader = `#define JOINT_STRIDE ${stride}\n#define BONE_W ${BONE_TEX_W}\n${shader.vertexShader}`
    .replace('#include <skinning_pars_vertex>', PARS)
    .replace('#include <skinbase_vertex>', BASE)
    .replace('#include <skinnormal_vertex>', 'objectNormal = normalize(mat3(skinM) * objectNormal);')
    .replace('#include <skinning_vertex>', 'transformed = (skinM * vec4(transformed, 1.0)).xyz;');
}

export class PeopleView {
  readonly group = new THREE.Group();
  private full: THREE.InstancedMesh[] = [];
  private far: THREE.InstancedMesh[] = [];
  private anim: { full: THREE.InstancedBufferAttribute; far: THREE.InstancedBufferAttribute }[] = [];
  private max: number;
  readonly material: THREE.MeshStandardMaterial;
  /** сколько людей нарисовано полной и упрощённой моделью в последнем кадре */
  nearCount = 0;
  farCount = 0;

  constructor(
    private people: People,
    max: number,
  ) {
    this.max = max;
    // у набора материалы двусторонние (волосы — тонкие пластины)
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, side: THREE.DoubleSide });
    mat.onBeforeCompile = s => inject(s, people.boneTexture, people.jointStride);
    mat.customProgramCacheKey = () => 'baked-skin';
    const depth = new THREE.MeshDepthMaterial({ side: THREE.DoubleSide });
    depth.onBeforeCompile = s => inject(s, people.boneTexture, people.jointStride);
    depth.customProgramCacheKey = () => 'baked-skin-depth';
    this.material = mat;
    for (const look of people.looks) {
      const make = (g: THREE.BufferGeometry) => {
        const geo = g.clone();
        const a = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
        a.setUsage(THREE.DynamicDrawUsage);
        geo.setAttribute('aAnim', a);
        const m = new THREE.InstancedMesh(geo, mat, max);
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        m.customDepthMaterial = depth;
        m.frustumCulled = false;
        m.castShadow = true;
        m.receiveShadow = true;
        m.count = 0;
        this.group.add(m);
        return { m, a };
      };
      const f = make(look.geometry);
      const d = make(look.lod);
      this.full.push(f.m);
      this.far.push(d.m);
      this.anim.push({ full: f.a, far: d.a });
    }
  }

  setShadows(on: boolean) {
    for (const m of [...this.full, ...this.far]) m.castShadow = on;
  }

  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3(1, 1, 1);
  private up = new THREE.Vector3(0, 1, 0);

  /**
   * Переписать экземпляры из толпы. Люди дальше cull (м, по земле от точки взгляда) не рисуются
   * совсем; full — рисовать полной моделью (камера близко), иначе — упрощённой.
   */
  update(crowd: Crowd3D, focus: THREE.Vector3, cull: number, full: boolean) {
    const L = this.people.looks.length;
    const nFull = new Array(L).fill(0);
    const nFar = new Array(L).fill(0);
    const cull2 = cull * cull;
    for (let i = 0; i < crowd.n; i++) {
      const li = crowd.look[i];
      const look = this.people.looks[li];
      const dx = crowd.x[i] - focus.x;
      const dz = crowd.z[i] - focus.z;
      if (dx * dx + dz * dz > cull2) continue;
      const near = full;
      const mesh = near ? this.full[li] : this.far[li];
      const attr = near ? this.anim[li].full : this.anim[li].far;
      const k = near ? nFull[li]++ : nFar[li]++;
      this.p.set(crowd.x[i], crowd.y[i], crowd.z[i]);
      this.q.setFromAxisAngle(this.up, crowd.heading[i]);
      this.m4.compose(this.p, this.q, this.s);
      this.m4.toArray(mesh.instanceMatrix.array, k * 16);
      const clip = look.clips[CLIPS[crowd.clip[i]]];
      const t = Math.max(0, crowd.clipTime[i]) * BAKE_FPS;
      let fa: number;
      let fb: number;
      let w: number;
      if (crowd.loop[i]) {
        const tt = t % (clip.frames - 1);
        fa = Math.floor(tt);
        fb = (fa + 1) % (clip.frames - 1);
        w = tt - fa;
      } else {
        const tt = Math.min(t, clip.frames - 1);
        fa = Math.floor(tt);
        fb = Math.min(fa + 1, clip.frames - 1);
        w = tt - fa;
      }
      const arr = attr.array as Float32Array;
      arr[k * 3] = clip.start + fa;
      arr[k * 3 + 1] = clip.start + fb;
      arr[k * 3 + 2] = w;
    }
    let near = 0;
    let far = 0;
    for (let li = 0; li < L; li++) {
      for (const [mesh, attr, n] of [
        [this.full[li], this.anim[li].full, nFull[li]],
        [this.far[li], this.anim[li].far, nFar[li]],
      ] as [THREE.InstancedMesh, THREE.InstancedBufferAttribute, number][]) {
        mesh.count = n;
        mesh.visible = n > 0;
        if (n) {
          mesh.instanceMatrix.clearUpdateRanges();
          mesh.instanceMatrix.addUpdateRange(0, n * 16);
          mesh.instanceMatrix.needsUpdate = true;
          attr.clearUpdateRanges();
          attr.addUpdateRange(0, n * 3);
          attr.needsUpdate = true;
        }
      }
      near += nFull[li];
      far += nFar[li];
    }
    this.nearCount = near;
    this.farCount = far;
  }

  get capacity() {
    return this.max;
  }
}

/** Номера анимаций в толпе (crowd.clip). */
export const CLIPS: ClipName[] = ['Idle', 'Walk', 'SitDown', 'StandUp'];
