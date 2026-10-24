// Человек MakeHuman в сцене: тело (группа «body» базовой сетки, без граней, целиком закрытых одеждой) и прокси — глаза,
// брови, ресницы, волосы, одежда, — подогнанные по .mhclo к телу с целями. Кожа — смесь четырёх текстур CC0 (женская и
// мужская, по две ближайших к возрасту), волосы и брови можно «сединить» (свой шейдер). Всё на Three.js r186.
import * as THREE from 'three';
import { tex, texTotals } from '../probe';
import { type Clo, fitProxy, type Obj, parseMhclo, parseObj } from './formats';
import type { Human, Params } from './human';
import { MhMesh } from './mesh';

const SYS = 'assets/mh-system/';
const DATA = 'assets/makehuman/makehuman/data/';

/** Кожа по полу и возрасту (опорные возрасты — 25, 50, 75 лет). */
const SKINS = {
  f: ['young_caucasian_female/young_lightskinned_female_diffuse', 'middleage_caucasian_female/middleage_lightskinned_female_diffuse', 'old_caucasian_female/old_lightskinned_female_diffuse'],
  m: ['young_caucasian_male/young_lightskinned_male_diffuse', 'middleage_caucasian_male/middleage_lightskinned_male_diffuse', 'old_caucasian_male/old_lightskinned_male_diffuse'],
};
const SKIN_AGES = [25, 50, 75];

export interface Look {
  hair: string | null;
  brows: string;
  clothes: string;
  /** 0 — свой цвет волос, 1 — седые */
  grey: number;
}

interface ProxyAsset {
  clo: Clo;
  obj: Obj;
  dir: string;
}

const assets = new Map<string, Promise<ProxyAsset>>();
function proxyAsset(dir: string, name: string): Promise<ProxyAsset> {
  const key = `${dir}${name}`;
  let p = assets.get(key);
  if (!p) {
    p = (async () => {
      const [clo, obj] = await Promise.all([
        fetch(`${dir}${name}.mhclo`).then(r => r.text()).then(parseMhclo),
        fetch(`${dir}${name}.obj`).then(r => r.text()).then(parseObj),
      ]);
      if (obj.v.length / 3 !== clo.refs.length / 3) throw new Error(`${name}: в .obj ${obj.v.length / 3} вершин, в .mhclo — ${clo.refs.length / 3}`);
      return { clo, obj, dir };
    })();
    assets.set(key, p);
  }
  return p;
}

const sysDir = (kind: string, name: string) => `${SYS}${kind}/${name}/`;

/** Седина: тёмные пряди светлеют к серому, светлые — к белому (по яркости исходного цвета). */
function greyable(m: THREE.MeshStandardMaterial, grey: { value: number }) {
  m.onBeforeCompile = s => {
    s.uniforms.uGrey = grey;
    s.fragmentShader = `uniform float uGrey;\n${s.fragmentShader}`.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
       float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
       diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.50, 0.49, 0.47) * (0.3 + 5.0 * lum), uGrey);`,
    );
  };
  m.customProgramCacheKey = () => 'greyable';
}

/** Кожа: четыре текстуры — женская и мужская пары по возрасту; uAge — доля между парой, uSex — 0 жен., 1 муж. */
function skinMaterial(maps: THREE.Texture[], u: { age: { value: number }; sex: { value: number } }) {
  // лёгкий «пушок» (sheen) по краям — кожа без него выглядит пластмассой; текстуры MakeHuman — только цвет, без нормалей
  const m = new THREE.MeshPhysicalMaterial({ map: maps[0], roughness: 0.58, metalness: 0, specularIntensity: 0.4, sheen: 0.12, sheenRoughness: 0.6, sheenColor: new THREE.Color(0xffc4b4) });
  const extra = { mapFb: { value: maps[1] }, mapMa: { value: maps[2] }, mapMb: { value: maps[3] } };
  m.onBeforeCompile = s => {
    Object.assign(s.uniforms, extra, { uAge: u.age, uSex: u.sex });
    s.fragmentShader = `uniform sampler2D mapFb;\nuniform sampler2D mapMa;\nuniform sampler2D mapMb;\nuniform float uAge;\nuniform float uSex;\n${s.fragmentShader}`.replace(
      '#include <map_fragment>',
      `vec4 skinF = mix(texture2D(map, vMapUv), texture2D(mapFb, vMapUv), uAge);
       vec4 skinM = mix(texture2D(mapMa, vMapUv), texture2D(mapMb, vMapUv), uAge);
       diffuseColor *= mix(skinF, skinM, uSex);`,
    );
  };
  m.customProgramCacheKey = () => 'skin4';
  return { m, extra };
}

interface Part {
  asset: ProxyAsset;
  mesh: MhMesh;
  obj3d: THREE.Mesh;
  out: Float32Array;
}

export class Character {
  readonly group = new THREE.Group();
  private bodies = new Map<string, { mesh: MhMesh; obj3d: THREE.Mesh }>();
  private parts = new Map<string, Part>();
  private skinU = { age: { value: 0 }, sex: { value: 0 } };
  private skinMaps: THREE.Texture[] = [];
  private skin!: ReturnType<typeof skinMaterial>;
  private grey = { value: 0 };
  look!: Look;
  /** сколько треугольников рисуется (тело и прокси) */
  tris = 0;
  /** время последнего пересчёта: цели, подгонка прокси, нормали (мс) */
  lastUpdateMs = 0;

  private constructor(private human: Human) {}

  /** Персонаж со всеми вещами, которые могут понадобиться (`looks` — наборы, между которыми переключаемся). */
  static async create(human: Human, looks: Look[]): Promise<Character> {
    const c = new Character(human);
    const allSkins = [...SKINS.f, ...SKINS.m];
    const skinTex = new Map(await Promise.all(allSkins.map(async s => [s, await tex(`${SYS}skins/${s}.png`, true)] as const)));
    c.skinMaps = [skinTex.get(SKINS.f[0])!, skinTex.get(SKINS.f[1])!, skinTex.get(SKINS.m[0])!, skinTex.get(SKINS.m[1])!];
    c.skin = skinMaterial(c.skinMaps, c.skinU);
    (c.skin.m.userData as { all: Map<string, THREE.Texture> }).all = skinTex;

    const eyes = await proxyAsset(`${DATA}eyes/high-poly/`, 'high-poly');
    // у сетки глаз есть роговица — круг текстуры с нулевой альфой; без среза по альфе она закрывает радужку белым
    const eyeMat = new THREE.MeshPhysicalMaterial({ map: await tex(`${DATA}eyes/materials/brown_eye.png`, true), alphaTest: 0.5, roughness: 0.12, specularIntensity: 1, clearcoat: 0.6, clearcoatRoughness: 0.05 });
    c.addPart('eyes', eyes, eyeMat);
    const lashes = await proxyAsset(sysDir('eyelashes', 'eyelashes01'), 'eyelashes01');
    c.addPart('eyelashes01', lashes, c.fiber(await tex(`${lashes.dir}eyelashes01.png`, true), false, true));
    for (const look of looks) {
      if (!c.parts.has(look.brows)) {
        const a = await proxyAsset(sysDir('eyebrows', look.brows), look.brows);
        c.addPart(look.brows, a, c.fiber(await tex(`${a.dir}${look.brows}.png`, true), true, true));
      }
      if (look.hair && !c.parts.has(look.hair)) {
        const a = await proxyAsset(sysDir('hair', look.hair), look.hair);
        const m = c.fiber(await tex(`${a.dir}${look.hair}_diffuse.png`, true), true, false);
        m.roughness = 0.5;
        if (look.hair === 'short02') m.normalMap = await tex(`${a.dir}short02_normal.png`, false);
        c.addPart(look.hair, a, m);
      }
      if (!c.parts.has(look.clothes)) {
        const a = await proxyAsset(sysDir('clothes', look.clothes), look.clothes);
        const m = new THREE.MeshStandardMaterial({
          map: await tex(`${a.dir}${look.clothes}_diffuse.png`, true),
          normalMap: await tex(`${a.dir}${look.clothes}_normal.png`, false),
          roughness: 0.85,
          alphaTest: 0.3,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
        });
        c.addPart(look.clothes, a, m);
        // тело под этой одеждой — без граней, все вершины которых одежда закрывает
        const hide = a.clo.hide;
        const obj = human.obj;
        const bodyGroup = obj.groups.indexOf('body');
        const mesh = new MhMesh(obj, f => {
          if (obj.fGroup[f] !== bodyGroup) return false;
          const s = obj.fStart[f];
          for (let k = 0; k < obj.fSize[f]; k++) if (!hide.has(obj.fv[s + k])) return true;
          return false;
        });
        const o = new THREE.Mesh(mesh.geometry, c.skin.m);
        o.castShadow = o.receiveShadow = true;
        c.bodies.set(look.clothes, { mesh, obj3d: o });
        c.group.add(o);
      }
    }
    return c;
  }

  /**
   * Материал прядей, обе стороны. Волосы — срез по альфе со сглаживанием MSAA (alphaToCoverage): их много слоёв, сортировка
   * не нужна. Брови и ресницы — полупрозрачные (тонкие волоски срез по альфе превращает в жёсткую черту), рисуются поверх кожи.
   */
  private fiber(map: THREE.Texture, greyable_: boolean, blend: boolean): THREE.MeshStandardMaterial {
    const m = new THREE.MeshStandardMaterial({
      map,
      side: THREE.DoubleSide,
      roughness: 0.75,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      ...(blend ? { transparent: true, depthWrite: false, alphaTest: 0.02 } : { alphaTest: 0.35, alphaToCoverage: true }),
    });
    if (greyable_) greyable(m, this.grey);
    return m;
  }

  private addPart(key: string, asset: ProxyAsset, mat: THREE.Material) {
    const mesh = new MhMesh(asset.obj);
    const obj3d = new THREE.Mesh(mesh.geometry, mat);
    obj3d.castShadow = obj3d.receiveShadow = true;
    obj3d.renderOrder = asset.clo.zDepth;
    this.group.add(obj3d);
    this.parts.set(key, { asset, mesh, obj3d, out: new Float32Array(asset.obj.v.length) });
  }

  setLook(look: Look) {
    this.look = look;
    for (const [k, p] of this.parts) p.obj3d.visible = k === 'eyes' || k === 'eyelashes01' || k === look.brows || k === look.hair || k === look.clothes;
    for (const [k, b] of this.bodies) b.obj3d.visible = k === look.clothes;
    this.grey.value = look.grey;
  }

  /** Последний пересчёт по частям (мс): цели, тело (положения и нормали), прокси (подгонка, положения и нормали). */
  readonly timing = { targets: 0, body: 0, proxies: 0 };

  /** Ползунки → тело и все видимые прокси. */
  update(p: Params) {
    const t0 = performance.now();
    this.human.apply(p);
    const t1 = performance.now();
    const pos = this.human.pos;
    let tris = 0;
    for (const b of this.bodies.values()) {
      if (!b.obj3d.visible) continue;
      b.mesh.update(pos);
      tris += b.mesh.tris;
    }
    const t2 = performance.now();
    for (const part of this.parts.values()) {
      if (!part.obj3d.visible) continue;
      fitProxy(part.asset.clo, pos, part.out);
      part.mesh.update(part.out);
      tris += part.mesh.tris;
    }
    this.timing.targets = t1 - t0;
    this.timing.body = t2 - t1;
    this.timing.proxies = performance.now() - t2;
    this.tris = tris;
    // кожа: пара текстур по возрасту внутри пола, доля между ними; пол — доля между женской и мужской парой
    const a = Math.min(SKIN_AGES[2], Math.max(SKIN_AGES[0], p.age));
    const k = a <= SKIN_AGES[1] ? 0 : 1;
    const t = (a - SKIN_AGES[k]) / (SKIN_AGES[k + 1] - SKIN_AGES[k]);
    const all = (this.skin.m.userData as { all: Map<string, THREE.Texture> }).all;
    this.skin.m.map = all.get(SKINS.f[k])!;
    this.skin.extra.mapFb.value = all.get(SKINS.f[k + 1])!;
    this.skin.extra.mapMa.value = all.get(SKINS.m[k])!;
    this.skin.extra.mapMb.value = all.get(SKINS.m[k + 1])!;
    this.skinU.age.value = t;
    this.skinU.sex.value = p.gender;
    this.lastUpdateMs = performance.now() - t0;
  }

  /** Точки для кадра: середина глаз и макушка (м). */
  landmarks(): { eyes: THREE.Vector3; top: number } {
    const eyes = this.parts.get('eyes')!;
    const g = eyes.mesh.geometry;
    g.computeBoundingBox();
    const c = g.boundingBox!.getCenter(new THREE.Vector3());
    let top = -Infinity;
    for (const b of this.bodies.values()) {
      if (!b.obj3d.visible) continue;
      top = Math.max(top, b.mesh.geometry.boundingBox!.max.y);
    }
    return { eyes: c, top };
  }

  static texStats() {
    return { count: texTotals.count, rgbaMB: +(texTotals.bytes / 1e6).toFixed(1) };
  }
}
