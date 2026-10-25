// Люди Microsoft Rocketbox (spec docs/specs/2026-10-people.md, «Конвертер»; лицензия MIT — assets/LICENSES.md): FBX
// набора → assets/models/rocketbox/<вид>.glb и маска <вид>.mask.png. Исходники в git не лежат: их качает этот же скрипт с
// raw.githubusercontent.com на закреплённом коммите и сверяет SHA-256 с assets/models/rocketbox/sources.json.
//
//   node tools/app/people.mjs --fetch /путь/к/исходникам   # скачать недостающее, сверить суммы
//   node tools/app/people.mjs /путь/к/исходникам           # собрать виды
//
// Что делается с каждым видом:
// - сетка: одинаковые вершины слиты (FBXLoader отдаёт каждую грань тремя своими вершинами); упрощённая — около 800
//   треугольников, швы развёртки защищены (как в пробе spikes/realistic-people, src/rocketbox.ts, `lod`);
// - скелет: 23 кости тела с именами людей Quaternius; веса пальцев отданы кисти, лица — голове;
// - атлас 1024²: тело, голова, пряди, принадлежность (стетоскоп, шапочка с маской) — по 512²; цвет — WebP, маска — PNG:
//   R — одежда, которая красится цветом должности, A — непрозрачность прядей;
// - анимации набора: стоит, идёт, бежит, садится, встаёт; у ходьбы и бега корень — на месте, а скорость шага — в extras
//   корня; посадка и вставание — с движением таза назад и вперёд, без неподвижного начала и конца.
//
// Node 22: fetch ходит через HTTPS_PROXY только с NODE_USE_ENV_PROXY=1 — скрипт перезапускает себя с ним сам (как
// spikes/realistic-people/tools/fetch.mjs).
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTTextureWebP } from '@gltf-transform/extensions';
import { dedup, meshopt, resample } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

if ((process.env.HTTPS_PROXY || process.env.https_proxy) && process.env.NODE_USE_ENV_PROXY !== '1') {
  const r = spawnSync(process.execPath, ['--no-warnings', ...process.argv.slice(1)], { stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1' } });
  process.exit(r.status ?? 1);
}

const COMMIT = '0943055db6ec570bcef9f2c8b41c9e5467c808f9';
const RAW = `https://raw.githubusercontent.com/microsoft/Microsoft-Rocketbox/${COMMIT}/`;
const OUT = new URL('../../assets/models/rocketbox/', import.meta.url).pathname;
const SUMS = join(OUT, 'sources.json');

/**
 * Виды (spec «Части», часть 1): врачи, медсестра, хирург, пациент, пациентка. `tint` — ткань одежды, которая красится
 * цветом должности (маска R): белая или зелёная. `blank` — что закрасить на текстуре тела (точки исходника 2048²: x, y,
 * ширина, высота): на бейджах врачей красный круг с белым крестом и надписи «St. Hospital», «Your Name» (spec
 * «Конвертер», «эмблемы»); фото на бейдже остаётся.
 */
export const LOOKS = [
  { name: 'Medical_Male_03', folder: 'Professions', blank: [[1398, 1975, 26, 26], [1400, 1989, 65, 41]] },
  { name: 'Medical_Female_02', folder: 'Professions', blank: [[1165, 32, 26, 25], [1167, 47, 65, 41]] },
  { name: 'Medical_Female_01', folder: 'Professions', tint: 'white' },
  { name: 'Medical_Male_04', folder: 'Professions', tint: 'green' },
  { name: 'Male_Adult_08', folder: 'Adults' },
  { name: 'Female_Adult_09', folder: 'Adults' },
];

/**
 * Анимации: имя в игре → файл набора (`{s}` — m или f). `root` — движение корня: `fixed` — стоит на месте, `loop` —
 * петля шага, смещение вычитается, `keep` — как в наборе (таз уходит назад на стул), `after` — продолжение предыдущей:
 * начинается там, где она кончилась.
 */
const CLIPS = [
  { name: 'Idle', file: 'all_animations_max_motextr_static/{s}_idle_breathe_01.max.fbx', root: 'fixed' },
  { name: 'Walk', file: 'all_animations_max_motextr_xy/{s}_walk_neutral.max.fbx', root: 'loop' },
  { name: 'Run', file: 'all_animations_max_motextr_xy/{s}_run_neutral.max.fbx', root: 'loop' },
  { name: 'SitDown', file: 'all_animations_max_motextr_xyz/{s}_sit_down_chair_01.max.fbx', root: 'keep' },
  { name: 'StandUp', file: 'all_animations_max_motextr_xyz/{s}_sit_stand_up_chair_01.max.fbx', root: 'after' },
];

/** Кости тела: Biped → имя в игре (как у людей Quaternius; GLTFLoader убирает из имён точки — `UpperArmL`). */
const BONES = {
  Bip01: 'Root', Bip01_Pelvis: 'Hips', Bip01_Spine: 'Abdomen', Bip01_Spine1: 'Torso', Bip01_Spine2: 'Chest', Bip01_Neck: 'Neck', Bip01_Head: 'Head',
  Bip01_L_Clavicle: 'Shoulder.L', Bip01_L_UpperArm: 'UpperArm.L', Bip01_L_Forearm: 'LowerArm.L', Bip01_L_Hand: 'Hand.L',
  Bip01_R_Clavicle: 'Shoulder.R', Bip01_R_UpperArm: 'UpperArm.R', Bip01_R_Forearm: 'LowerArm.R', Bip01_R_Hand: 'Hand.R',
  Bip01_L_Thigh: 'UpperLeg.L', Bip01_L_Calf: 'LowerLeg.L', Bip01_L_Foot: 'Foot.L', Bip01_L_Toe0: 'Toes.L',
  Bip01_R_Thigh: 'UpperLeg.R', Bip01_R_Calf: 'LowerLeg.R', Bip01_R_Foot: 'Foot.R', Bip01_R_Toe0: 'Toes.R',
};
const ORDER = Object.keys(BONES);

/** Четверть атласа под часть вида (по имени материала после кода: m153_body → body). */
const QUADRANT = { body: 0, head: 1, opacity: 2 };
const PART = 512;
const ATLAS = PART * 2;
/** Сколько треугольников у упрощённой модели. */
const LOD_TRIS = 800;

const sha = buf => createHash('sha256').update(buf).digest('hex');

// ---------------------------------------------------------------- FBX без браузера

const manager = new THREE.LoadingManager();
// FBXLoader просит текстуры TGA по путям 3ds Max — подменяем пустыми: картинки читает readTga
manager.addHandler(/\.(tga|png|jpg)$/i, { path: '', setPath() { return this; }, load: () => new THREE.Texture() });
const fbxLoader = new FBXLoader(manager);

function fbx(src, path) {
  const b = readFileSync(join(src, path));
  const warn = console.warn;
  // «ShininessExponent map is not supported» на каждый файл — не к делу
  console.warn = () => {};
  try {
    return fbxLoader.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '');
  } finally {
    console.warn = warn;
  }
}

// из spikes/realistic-people: tools/prepare.mjs (readTga)
/** TGA → { w, h, ch, data } (строки сверху вниз, RGB или RGBA). */
function readTga(buf) {
  const idLen = buf[0];
  const cmapType = buf[1];
  const type = buf[2];
  const cmapLen = buf.readUInt16LE(5) * Math.ceil(buf[7] / 8);
  const w = buf.readUInt16LE(12);
  const h = buf.readUInt16LE(14);
  const bpp = buf[16];
  const desc = buf[17];
  if (cmapType !== 0 || (type !== 2 && type !== 10) || (bpp !== 24 && bpp !== 32)) throw new Error(`TGA: тип ${type}, ${bpp} бит — не поддержан`);
  const px = bpp / 8;
  const raw = Buffer.alloc(w * h * px);
  let p = 18 + idLen + cmapLen;
  if (type === 2) buf.copy(raw, 0, p, p + raw.length);
  else {
    for (let o = 0; o < raw.length; ) {
      const head = buf[p++];
      const n = (head & 0x7f) + 1;
      if (head & 0x80) {
        for (let k = 0; k < n; k++, o += px) buf.copy(raw, o, p, p + px);
        p += px;
      } else {
        buf.copy(raw, o, p, p + n * px);
        p += n * px;
        o += n * px;
      }
    }
  }
  const topDown = (desc & 0x20) !== 0;
  const data = Buffer.alloc(w * h * px);
  for (let y = 0; y < h; y++) {
    const sy = topDown ? y : h - 1 - y;
    for (let x = 0; x < w; x++) {
      const s = (sy * w + x) * px;
      const d = (y * w + x) * px;
      data[d] = raw[s + 2];
      data[d + 1] = raw[s + 1];
      data[d + 2] = raw[s];
      if (px === 4) data[d + 3] = raw[s + 3];
    }
  }
  return { w, h, ch: px, data };
}

// ---------------------------------------------------------------- исходники

/** Что качать: анимации обоих полов, лицензия набора, у каждого вида — FBX и цветные текстуры его материалов. */
function animFiles() {
  return CLIPS.flatMap(c => ['m', 'f'].map(s => `Assets/Animations/${c.file.replace('{s}', s)}`));
}
const fbxPath = l => `Assets/Avatars/${l.folder}/${l.name}/Export/${l.name}.fbx`;

/** Материалы вида: код (m153) и части (body, head, opacity, stetoskop…). */
function partsOf(root) {
  let sm = null;
  root.traverse(o => {
    if (o.isSkinnedMesh) sm = o;
  });
  if (!sm) throw new Error('нет SkinnedMesh');
  const mats = Array.isArray(sm.material) ? sm.material : [sm.material];
  const code = mats[0].name.split('_')[0];
  return { sm, mats, code, parts: mats.map(m => m.name.slice(code.length + 1)) };
}
const texPath = (l, code, part) => `Assets/Avatars/${l.folder}/${l.name}/Textures/${code}_${part}_color.tga`;

async function get(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      return Buffer.from(await r.arrayBuffer());
    } catch (e) {
      if (attempt >= 3) throw e;
      console.log(`  повтор ${attempt}: ${e.message}`);
    }
  }
}

async function fetchAll(src) {
  const sums = existsSync(SUMS) ? JSON.parse(readFileSync(SUMS, 'utf8')) : { commit: COMMIT, files: {}, looks: {} };
  let bad = 0;
  const one = async path => {
    const file = join(src, path);
    if (existsSync(file) && sums.files[path] === sha(readFileSync(file))) return;
    const buf = await get(RAW + path.split('/').map(encodeURIComponent).join('/'));
    const h = sha(buf);
    if (sums.files[path] && sums.files[path] !== h) {
      console.error(`✗ ${path}: SHA-256 ${h}, ожидалась ${sums.files[path]}`);
      bad++;
      return;
    }
    sums.files[path] = h;
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, buf);
    console.log(`  ${(buf.length / 1e6).toFixed(2).padStart(6)} МБ  ${path}`);
  };
  await one('LICENSE.md');
  for (const p of animFiles()) await one(p);
  for (const l of LOOKS) {
    await one(fbxPath(l));
    const { code, parts } = partsOf(fbx(src, fbxPath(l)));
    for (const part of parts) await one(texPath(l, code, part));
  }
  mkdirSync(OUT, { recursive: true });
  writeFileSync(SUMS, `${JSON.stringify(sums, null, 1)}\n`);
  if (bad) process.exit(1);
}

// ---------------------------------------------------------------- атлас и маска

/** Картинка части 512² (RGBA), уменьшенная фильтром Ланцоша; `blank` — прямоугольники, закрашенные цветом вокруг них. */
async function partImage(src, path, blank = []) {
  const t = readTga(readFileSync(join(src, path)));
  const rgba = Buffer.alloc(t.w * t.h * 4);
  for (let i = 0; i < t.w * t.h; i++) {
    rgba[i * 4] = t.data[i * t.ch];
    rgba[i * 4 + 1] = t.data[i * t.ch + 1];
    rgba[i * 4 + 2] = t.data[i * t.ch + 2];
    rgba[i * 4 + 3] = t.ch === 4 ? t.data[i * t.ch + 3] : 255;
  }
  if (blank.length) {
    // цвет — медиана рамок в точку шириной вокруг прямоугольников (фон бейджа), один на все
    const inside = (x, y) => blank.some(([x0, y0, w, h]) => x >= x0 && x < x0 + w && y >= y0 && y < y0 + h);
    const ring = [[], [], []];
    for (const [x0, y0, w, h] of blank) {
      for (let y = y0 - 1; y <= y0 + h; y++) {
        for (let x = x0 - 1; x <= x0 + w; x++) if (!inside(x, y)) for (let k = 0; k < 3; k++) ring[k].push(rgba[(y * t.w + x) * 4 + k]);
      }
    }
    const fill = ring.map(a => a.sort((p, q) => p - q)[a.length >> 1]);
    for (const [x0, y0, w, h] of blank) {
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) for (let k = 0; k < 3; k++) rgba[(y * t.w + x) * 4 + k] = fill[k];
    }
  }
  return sharp(rgba, { raw: { width: t.w, height: t.h, channels: 4 } }).resize(PART, PART, { kernel: 'lanczos3' }).raw().toBuffer();
}

/** Ткань одежды в цвете sRGB: белая — светлая и почти без цвета; зелёная — тон 100–200°. Кожа, волосы, обувь — нет. */
function isCloth(kind, r, g, b) {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const sat = mx ? (mx - mn) / mx : 0;
  if (kind === 'white') return mx > 95 && sat < 0.16;
  let h = 0;
  if (mx !== mn) {
    if (mx === r) h = ((g - b) / (mx - mn)) * 60;
    else if (mx === g) h = (2 + (b - r) / (mx - mn)) * 60;
    else h = (4 + (r - g) / (mx - mn)) * 60;
  }
  if (h < 0) h += 360;
  return mx > 40 && sat > 0.15 && h >= 100 && h <= 200;
}

/** Треугольники в развёртке → закрашенные точки картинки `size`² (стопы не красим: обувь — своего цвета). */
function rasterize(size, tris) {
  const out = new Uint8Array(size * size);
  for (const [a, b, c] of tris) {
    const xs = [a[0], b[0], c[0]].map(v => v * size);
    const ys = [a[1], b[1], c[1]].map(v => v * size);
    const x0 = Math.max(0, Math.floor(Math.min(...xs)) - 2);
    const x1 = Math.min(size - 1, Math.ceil(Math.max(...xs)) + 2);
    const y0 = Math.max(0, Math.floor(Math.min(...ys)) - 2);
    const y1 = Math.min(size - 1, Math.ceil(Math.max(...ys)) + 2);
    const d = (xs[1] - xs[0]) * (ys[2] - ys[0]) - (xs[2] - xs[0]) * (ys[1] - ys[0]);
    if (Math.abs(d) < 1e-9) continue;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        const u = ((xs[1] - px) * (ys[2] - py) - (xs[2] - px) * (ys[1] - py)) / d;
        const v = ((xs[2] - px) * (ys[0] - py) - (xs[0] - px) * (ys[2] - py)) / d;
        const w = 1 - u - v;
        // на 2 точки шире треугольника — без щелей на швах
        const m = -2 / Math.max(1, Math.abs(d) ** 0.5);
        if (u >= m && v >= m && w >= m) out[y * size + x] = 1;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- один вид

function convert(src, look) {
  const root = fbx(src, fbxPath(look));
  root.updateMatrixWorld(true);
  const { sm, mats, code, parts } = partsOf(root);
  const bones = new Map();
  root.traverse(o => {
    if (o.isBone) bones.set(o.name, o);
  });
  for (const b of ORDER) if (!bones.has(b)) throw new Error(`${look.name}: нет кости ${b}`);
  const sex = look.name.includes('Female') ? 'f' : 'm';

  // части → четверти атласа: тело, голова, пряди, остальное (стетоскоп, шапочка с маской) — в последнюю
  const quad = parts.map(p => QUADRANT[p] ?? 3);
  if (quad.filter(q => q === 3).length > 1) throw new Error(`${look.name}: больше одной принадлежности (${parts.join(', ')})`);

  // кость кожи → кость тела: пальцы — к кисти, лицо и глаза — к голове
  const skel = sm.skeleton.bones;
  const jointOf = skel.map(b => {
    let x = b;
    while (x && !(x.name in BONES)) x = x.parent;
    if (!x) throw new Error(`${look.name}: кость ${b.name} вне тела`);
    return ORDER.indexOf(x.name);
  });

  // вершины: в осях после привязки (Y вверх, сантиметры), развёртка — в четверть атласа, сверху вниз, как в glTF
  const g0 = sm.geometry;
  const n0 = g0.attributes.position.count;
  const bind = sm.bindMatrix;
  const nm = new THREE.Matrix3().getNormalMatrix(bind);
  const pos = new Float32Array(n0 * 3);
  const nrm = new Float32Array(n0 * 3);
  const uv = new Float32Array(n0 * 2);
  const ji = new Float32Array(n0 * 4);
  const jw = new Float32Array(n0 * 4);
  const part = new Float32Array(n0);
  const groupOf = new Int8Array(n0);
  for (const gr of g0.groups) for (let i = gr.start; i < gr.start + gr.count; i++) groupOf[i] = gr.materialIndex;
  const v = new THREE.Vector3();
  for (let i = 0; i < n0; i++) {
    v.fromBufferAttribute(g0.attributes.position, i).applyMatrix4(bind).toArray(pos, i * 3);
    v.fromBufferAttribute(g0.attributes.normal, i).applyMatrix3(nm).normalize().toArray(nrm, i * 3);
    const q = quad[groupOf[i]];
    uv[i * 2] = (g0.attributes.uv.getX(i) + (q % 2)) / 2;
    uv[i * 2 + 1] = (1 - g0.attributes.uv.getY(i) + Math.floor(q / 2)) / 2;
    // четыре влияния → кости тела: одинаковые сложены, вес нормирован
    const acc = new Map();
    for (let k = 0; k < 4; k++) {
      const w = g0.attributes.skinWeight.getComponent(i, k);
      if (w <= 0) continue;
      const j = jointOf[g0.attributes.skinIndex.getComponent(i, k)];
      acc.set(j, (acc.get(j) ?? 0) + w);
    }
    const top = [...acc].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 4);
    const sum = top.reduce((a, [, w]) => a + w, 0) || 1;
    top.forEach(([j, w], k) => {
      ji[i * 4 + k] = j;
      jw[i * 4 + k] = w / sum;
    });
    part[i] = groupOf[i];
  }
  const raw = new THREE.BufferGeometry();
  raw.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  raw.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  raw.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  raw.setAttribute('skinIndex', new THREE.BufferAttribute(ji, 4));
  raw.setAttribute('skinWeight', new THREE.BufferAttribute(jw, 4));
  raw.setAttribute('part', new THREE.BufferAttribute(part, 1));
  const geo = mergeVertices(raw, 1e-4);
  const n = geo.attributes.position.count;
  const idx = new Uint32Array(geo.index.array);
  if (n >= 65536) throw new Error(`${look.name}: ${n} вершин — больше 16 бит`);

  // упрощённая: каждая часть — отдельно и в своей доле; швы развёртки защищены, подошвы — на месте
  const P = geo.attributes.position.array;
  const U = geo.attributes.uv.array;
  const N = geo.attributes.normal.array;
  const PT = geo.attributes.part.array;
  let minY = Infinity;
  for (let i = 0; i < n; i++) minY = Math.min(minY, P[i * 3 + 1]);
  const flags = new Uint8Array(n);
  const seen = new Map();
  const attrs = new Float32Array(n * 5);
  for (let i = 0; i < n; i++) {
    const key = `${Math.round(P[i * 3] * 100)},${Math.round(P[i * 3 + 1] * 100)},${Math.round(P[i * 3 + 2] * 100)}`;
    const f = seen.get(key);
    if (f === undefined) seen.set(key, i);
    else flags[i] = flags[f] = 2; // Protect: в этой точке — другая развёртка (шов)
    if (P[i * 3 + 1] < minY + 2) flags[i] = 1; // Lock: подошва
    attrs.set([U[i * 2], U[i * 2 + 1], N[i * 3], N[i * 3 + 1], N[i * 3 + 2]], i * 5);
  }
  const lod = [];
  const total = idx.length / 3;
  for (let p = 0; p < mats.length; p++) {
    const tri = [];
    for (let t = 0; t < idx.length; t += 3) if (PT[idx[t]] === p) tri.push(idx[t], idx[t + 1], idx[t + 2]);
    if (!tri.length) continue;
    const want = Math.max(3, Math.round(((tri.length / 3) * LOD_TRIS) / total) * 3);
    const [res] = MeshoptSimplifier.simplifyWithAttributes(new Uint32Array(tri), P, 3, attrs, 5, [1, 1, 0.3, 0.3, 0.3], flags, want, 1, ['Permissive']);
    lod.push(...res);
  }

  // анимации: повороты костей тела — как в наборе (скелет у всех один, Biped), корень — по правилу клипа; высота таза —
  // в масштабе вида
  const rest = bones.get('Bip01').position.clone();
  const idleRoot = fbx(src, `Assets/Animations/${CLIPS[0].file.replace('{s}', sex)}`).animations[0].tracks.find(t => t.name === 'Bip01.position');
  const k = rest.y / idleRoot.values[1];
  const clips = [];
  const speeds = {};
  let last = null;
  for (const c of CLIPS) {
    const clip = fbx(src, `Assets/Animations/${c.file.replace('{s}', sex)}`).animations[0];
    const track = name => clip.tracks.find(t => t.name === name);
    const rootT = track('Bip01.position');
    const times = Array.from(rootT.times);
    const nk = times.length;
    const T = times[nk - 1] - times[0];
    const rp = Array.from(rootT.values);
    // посадка и вставание: без неподвижного начала и конца — таз ниже или выше на 1 см, с запасом в 6 кадров
    let a = 0;
    let b = nk - 1;
    if (c.root === 'keep' || c.root === 'after') {
      const y0 = rp[1];
      const y1 = rp[(nk - 1) * 3 + 1];
      while (a < nk - 1 && Math.abs(rp[a * 3 + 1] - y0) < 1) a++;
      while (b > 0 && Math.abs(rp[b * 3 + 1] - y1) < 1) b--;
      a = Math.max(0, a - 6);
      b = Math.min(nk - 1, b + 6);
    }
    const keys = [];
    for (let f = a; f <= b; f++) keys.push(f);
    const out = keys.map(f => times[f] - times[a]);
    const dx = rp[(nk - 1) * 3] - rp[0];
    const dz = rp[(nk - 1) * 3 + 2] - rp[2];
    if (c.root === 'loop') speeds[c.name] = (Math.hypot(dx, dz) * k) / T;
    const tr = [];
    for (const f of keys) {
      let x = rp[f * 3] - rp[0];
      let z = rp[f * 3 + 2] - rp[2];
      const y = rp[f * 3 + 1];
      if (c.root === 'fixed') x = z = 0;
      if (c.root === 'loop') {
        const s = (times[f] - times[0]) / T;
        x -= dx * s;
        z -= dz * s;
      }
      // вставание — оттуда, где посадка кончилась (смещение уже в масштабе вида)
      const ax = c.root === 'after' && last ? last[0] : 0;
      const az = c.root === 'after' && last ? last[2] : 0;
      tr.push(x * k + ax + rest.x, y * k, z * k + az + rest.z);
    }
    if (c.root === 'keep') last = [(rp[b * 3] - rp[0]) * k, 0, (rp[b * 3 + 2] - rp[2]) * k];
    const rot = {};
    for (const bip of ORDER) {
      const t = track(`${bip}.quaternion`);
      if (!t) continue;
      const q = [];
      for (const f of keys) q.push(t.values[f * 4], t.values[f * 4 + 1], t.values[f * 4 + 2], t.values[f * 4 + 3]);
      rot[bip] = q;
    }
    clips.push({ name: c.name, times: out, translation: tr, rotation: rot });
  }

  return { root, sm, mats, code, parts, quad, bones, sex, geo, idx, lod, clips, speeds, look };
}

// ---------------------------------------------------------------- атлас, маска, glb

async function images(src, c) {
  const { look, code, parts, quad, geo, idx } = c;
  const atlas = Buffer.alloc(ATLAS * ATLAS * 3, 0);
  const mask = Buffer.alloc(ATLAS * ATLAS * 4, 0);
  for (let i = 0; i < ATLAS * ATLAS; i++) mask[i * 4 + 3] = 255;
  let tintSum = 0;
  let tintN = 0;
  const imgs = new Map();
  for (let p = 0; p < parts.length; p++) {
    imgs.set(quad[p], { part: parts[p], img: await partImage(src, texPath(look, code, parts[p]), quad[p] === 0 ? look.blank : []) });
  }

  // стопы тела: из маски одежды вон
  let feet = null;
  if (look.tint) {
    const J = geo.attributes.skinIndex.array;
    const W = geo.attributes.skinWeight.array;
    const U = geo.attributes.uv.array;
    const PT = geo.attributes.part.array;
    const footJ = new Set(['Bip01_L_Foot', 'Bip01_L_Toe0', 'Bip01_R_Foot', 'Bip01_R_Toe0'].map(b => ORDER.indexOf(b)));
    const main = i => {
      let best = -1;
      let w = 0;
      for (let k = 0; k < 4; k++) if (W[i * 4 + k] > w) [best, w] = [J[i * 4 + k], W[i * 4 + k]];
      return best;
    };
    const tris = [];
    for (let t = 0; t < idx.length; t += 3) {
      const vs = [idx[t], idx[t + 1], idx[t + 2]];
      if (quad[PT[vs[0]]] !== 0 || !vs.some(i => footJ.has(main(i)))) continue;
      // в четверть тела: координата в атласе × 2
      tris.push(vs.map(i => [U[i * 2] * 2, U[i * 2 + 1] * 2]));
    }
    feet = rasterize(PART, tris);
  }

  for (const [q, { part, img }] of imgs) {
    const ox = (q % 2) * PART;
    const oy = Math.floor(q / 2) * PART;
    for (let y = 0; y < PART; y++) {
      for (let x = 0; x < PART; x++) {
        const s = (y * PART + x) * 4;
        const d = (oy + y) * ATLAS + ox + x;
        atlas[d * 3] = img[s];
        atlas[d * 3 + 1] = img[s + 1];
        atlas[d * 3 + 2] = img[s + 2];
        if (part === 'opacity') mask[d * 4 + 3] = img[s + 3];
        // ткань тела без ступней и шапочка из принадлежностей (у хирурга — в четверти 3; маска на лице белая — не ткань)
        const cloth = look.tint && ((q === 0 && !feet[y * PART + x]) || q === 3);
        if (cloth && isCloth(look.tint, img[s], img[s + 1], img[s + 2])) {
          mask[d * 4] = 255;
          // яркость ткани (линейная) — от неё цвет должности получает складки
          const lin = c8 => (c8 / 255) ** 2.2;
          tintSum += 0.2126 * lin(img[s]) + 0.7152 * lin(img[s + 1]) + 0.0722 * lin(img[s + 2]);
          tintN++;
        }
      }
    }
  }
  const webp = await sharp(atlas, { raw: { width: ATLAS, height: ATLAS, channels: 3 } }).webp({ quality: 85, effort: 6 }).toBuffer();
  // маска: края ткани — мягче на точку
  const png = await sharp(mask, { raw: { width: ATLAS, height: ATLAS, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
  return { webp, png, tintRef: tintN ? tintSum / tintN : 0, tinted: tintN };
}

function writeGlb(c, img) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene('scene');
  doc.createExtension(EXTTextureWebP).setRequired(true);
  const acc = (arr, type) => doc.createAccessor().setArray(arr).setType(type).setBuffer(buffer);
  const top = doc.createNode('rocketbox').setExtras({ look: c.look.name, speeds: c.speeds, tintRef: Math.round(img.tintRef * 1e4) / 1e4 });
  scene.addChild(top);

  const nodes = {};
  for (const bip of ORDER) {
    const b = c.bones.get(bip);
    nodes[bip] = doc.createNode(BONES[bip]).setTranslation(b.position.toArray()).setRotation(b.quaternion.toArray()).setScale(b.scale.toArray());
  }
  for (const bip of ORDER) {
    const parent = c.bones.get(bip).parent?.name;
    (parent in nodes ? nodes[parent] : top).addChild(nodes[bip]);
  }
  // обратные привязочные: у костей кожи — из FBX, у корня (не в коже) — обратная его мировой
  const ibm = new Float32Array(ORDER.length * 16);
  const skel = c.sm.skeleton;
  ORDER.forEach((bip, j) => {
    const i = skel.bones.findIndex(b => b.name === bip);
    const m = i >= 0 ? skel.boneInverses[i] : c.bones.get(bip).matrixWorld.clone().invert();
    m.toArray(ibm, j * 16);
  });
  const skin = doc.createSkin('skin').setSkeleton(nodes.Bip01).setInverseBindMatrices(acc(ibm, 'MAT4'));
  for (const bip of ORDER) skin.addJoint(nodes[bip]);

  const tex = doc.createTexture('atlas').setImage(new Uint8Array(img.webp)).setMimeType('image/webp');
  const mat = doc.createMaterial('atlas').setBaseColorTexture(tex).setMetallicFactor(0).setRoughnessFactor(0.85).setDoubleSided(true);
  const g = c.geo;
  const joints = new Uint8Array(g.attributes.skinIndex.array);
  const attrs = {
    POSITION: acc(new Float32Array(g.attributes.position.array), 'VEC3'),
    NORMAL: acc(new Float32Array(g.attributes.normal.array), 'VEC3'),
    TEXCOORD_0: acc(new Float32Array(g.attributes.uv.array), 'VEC2'),
    JOINTS_0: acc(joints, 'VEC4'),
    WEIGHTS_0: acc(new Float32Array(g.attributes.skinWeight.array), 'VEC4'),
  };
  const prim = idx => {
    const p = doc.createPrimitive().setIndices(acc(new Uint16Array(idx), 'SCALAR')).setMaterial(mat);
    for (const [k, a] of Object.entries(attrs)) p.setAttribute(k, a);
    return p;
  };
  top.addChild(doc.createNode('body').setMesh(doc.createMesh('body').addPrimitive(prim(c.idx))).setSkin(skin));
  top.addChild(doc.createNode('lod').setMesh(doc.createMesh('lod').addPrimitive(prim(c.lod))).setSkin(skin));

  for (const clip of c.clips) {
    const anim = doc.createAnimation(clip.name);
    const input = acc(new Float32Array(clip.times), 'SCALAR');
    const add = (node, path, values, type) => {
      const s = doc.createAnimationSampler().setInput(input).setOutput(acc(new Float32Array(values), type)).setInterpolation('LINEAR');
      anim.addSampler(s).addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath(path).setSampler(s));
    };
    add(nodes.Bip01, 'translation', clip.translation, 'VEC3');
    for (const [bip, q] of Object.entries(clip.rotation)) add(nodes[bip], 'rotation', q, 'VEC4');
  }
  return doc;
}

// ---------------------------------------------------------------- главное

const fetchMode = process.argv.includes('--fetch');
const SRC = process.argv.filter(a => !a.startsWith('--'))[2];
if (!SRC) throw new Error('Укажите папку с исходниками Rocketbox (её заполняет --fetch)');
if (fetchMode) {
  await fetchAll(SRC);
  process.exit(0);
}

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const sums = JSON.parse(readFileSync(SUMS, 'utf8'));
for (const [path, want] of Object.entries(sums.files)) {
  if (sha(readFileSync(join(SRC, path))) !== want) throw new Error(`${path}: не тот файл (SHA-256) — запустите с --fetch`);
}
sums.looks = {};
mkdirSync(OUT, { recursive: true });
let total = 0;
for (const look of LOOKS) {
  const t0 = performance.now();
  const c = convert(SRC, look);
  const img = await images(SRC, c);
  const doc = writeGlb(c, img);
  await doc.transform(dedup(), resample(), meshopt({ encoder: MeshoptEncoder, level: 'medium', quantizePosition: 16, quantizationVolume: 'scene' }));
  const glb = await io.writeBinary(doc);
  writeFileSync(join(OUT, `${look.name}.glb`), glb);
  writeFileSync(join(OUT, `${look.name}.mask.png`), img.png);
  sums.looks[look.name] = { glb: sha(glb), mask: sha(img.png) };
  total += glb.byteLength + img.png.length;
  console.log(
    `${look.name.padEnd(18)} ${String(c.geo.attributes.position.count).padStart(5)} вершин, ${String(c.idx.length / 3).padStart(5)} / ${String(c.lod.length / 3).padStart(4)} треуг.; ` +
      `glb ${Math.round(glb.byteLength / 1024)} КБ, маска ${Math.round(img.png.length / 1024)} КБ; одежда ${img.tinted} точек; ` +
      `шаг ${(c.speeds.Walk / 100).toFixed(2)} м/с, бег ${(c.speeds.Run / 100).toFixed(2)} м/с; ${Math.round(performance.now() - t0)} мс`,
  );
}
writeFileSync(join(OUT, 'index.json'), `${JSON.stringify({ looks: LOOKS.map(l => l.name) }, null, 1)}\n`);
writeFileSync(SUMS, `${JSON.stringify(sums, null, 1)}\n`);
console.log(`Всего: ${(total / 1048576).toFixed(2)} МБ`);
