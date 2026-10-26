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

/** Куртка фельдшеров (у мужчины и женщины одна развёртка): надпись на спине, нашивка на груди, нашивка на рукаве в два куска. */
const PARAMEDIC = [[840, 599, 352, 59], [1133, 1001, 84, 111], [1706, 1058, 86, 90], [1708, 1148, 82, 17]];

/**
 * Взрослый в обычной одежде; у кого на одежде или коже надпись или знак — что убрать: метка на часах (Female_Adult_08), знак
 * у подола (Male_Adult_06), надпись на футболке и иероглифы на предплечье (Male_Adult_09), буква на вороте сзади
 * (Male_Adult_16), логотип с надписью на полосе куртки (Male_Adult_17).
 */
function adult(sex, n) {
  const name = `${sex}_Adult_${String(n).padStart(2, '0')}`;
  const fix = {
    Female_Adult_08: { blank: { body: [[1074, 1680, 20, 42]] } },
    Male_Adult_06: { blank: { body: [[1230, 1659, 29, 33]] } },
    // надпись идёт наискось — ступенями, копией чёрной футболки рядом; иероглифы — кожей выше по руке
    Male_Adult_09: {
      clone: {
        body: [
          [1010, 1328, 40, 47, 32, 25],
          [1031, 1302, 40, 46, 32, 25],
          [1051, 1275, 40, 47, 32, 25],
          [1071, 1248, 41, 47, 32, 25],
          [1092, 1222, 40, 46, 32, 25],
          [190, 1522, 64, 168, 0, -175],
        ],
      },
    },
    Male_Adult_16: { blank: { body: [[1008, 869, 29, 22]] } },
    // полоса идёт наискось: левая половина — копией полосы левее, правая — правее
    Male_Adult_17: { clone: { body: [[1075, 1020, 34, 40, -40, 7], [1109, 1020, 34, 40, 40, -7]] } },
  }[name];
  return { name, folder: 'Adults', ...fix };
}

/**
 * Виды (spec «Части»): медики, регистратура, пациенты, спецодежда. `tint` — ткань одежды, которая красится цветом
 * должности (маска R): белая или зелёная. Эмблемы, надписи и логотипы убираются с текстур (spec «Конвертер», «эмблемы»),
 * по частям вида (body, tools…; точки исходной текстуры части: x, y, ширина, высота):
 * - `blank` — закрасить: пересекающиеся прямоугольники — одно пятно, его цвет — медиана рамки в точку вокруг пятна (фон
 *   бейджа, нашивки, ярлыка); у бейджей врачей фото остаётся;
 * - `clone` — заменить точками той же текстуры со сдвигом (последние два числа — сдвиг по x и y): надпись на полосе или на
 *   коже — копией соседнего чистого места вдоль полосы, так складки и полосы остаются.
 * Мельче 4 точек атласа (надписи на подошвах, сбоку кроссовок, на крошечных ярлыках) в атласе не читаются и остаются.
 */
export const LOOKS = [
  // часть 1
  { name: 'Medical_Male_03', folder: 'Professions', blank: { body: [[1398, 1975, 26, 26], [1400, 1989, 65, 41]] } },
  { name: 'Medical_Female_02', folder: 'Professions', blank: { body: [[1165, 32, 26, 25], [1167, 47, 65, 41]] } },
  { name: 'Medical_Female_01', folder: 'Professions', tint: 'white' },
  { name: 'Medical_Male_04', folder: 'Professions', tint: 'green' },
  { name: 'Male_Adult_08', folder: 'Adults' },
  { name: 'Female_Adult_09', folder: 'Adults' },
  // часть 2 (решение владельца #109): медики, регистратура, пациенты — 38 предложенных и 16 из запаса
  { name: 'Medical_Male_01', folder: 'Professions', blank: { body: [[1098, 1874, 26, 26], [1100, 1889, 65, 41]] } },
  // хирург без шапочки и маски — медбрат и санитар (spec «Состав»): голова под шапочкой в наборе цела, волосы — на её текстуре
  { name: 'Medical_Male_04_Scrubs', from: 'Medical_Male_04', folder: 'Professions', tint: 'green', drop: ['protection'] },
  { name: 'Medical_Male_05', folder: 'Professions' },
  // фельдшеры: «PARAMEDIC» на спине (буквы — с белой нашивки), нашивки на груди и рукаве (низ рукавной — на белой полосе)
  { name: 'Medical_Female_03', folder: 'Professions', blank: { body: PARAMEDIC } },
  { name: 'Medical_Male_02', folder: 'Professions', blank: { body: PARAMEDIC } },
  ...['Business_Female_01', 'Business_Female_02', 'Business_Female_03', 'Business_Female_04'].map(name => ({ name, folder: 'Professions' })),
  ...['Business_Male_01', 'Business_Male_02', 'Business_Male_03', 'Business_Male_04', 'Business_Male_05', 'Business_Male_06', 'Business_Male_07'].map(name => ({ name, folder: 'Professions' })),
  ...[1, 2, 3, 4, 5, 7, 8, 11, 12, 13, 14, 15, 17].map(n => adult('Female', n)),
  ...[1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 16, 17, 18, 20].map(n => adult('Male', n)),
  { name: 'Delivery_Male_01', folder: 'Professions' },
  { name: 'Wood_Male_01', folder: 'Professions' },
  // ярлыки на груди и кармане
  { name: 'Gardener_Male_01', folder: 'Professions', blank: { body: [[1726, 264, 20, 38], [1300, 1160, 21, 39]] } },
  // каски и спецодежда — только пациентам подходящих профессий (решение владельца #109): ярлыки на комбинезонах; на поясе
  // с инструментами — «RocketBUILD» на складном метре (копией его же полос), «COOLTOOL» на ручках, наклейка на молотке и
  // знак на кожаной бирке
  { name: 'Construction_Female_01', folder: 'Professions', blank: { body: [[1735, 255, 20, 39]] } },
  {
    name: 'Construction_Male_01',
    folder: 'Professions',
    blank: { tools: [[448, 449, 53, 21], [770, 331, 11, 18]] },
    clone: { tools: [[136, 776, 46, 58, -50, 0], [182, 776, 46, 58, -96, 0], [228, 776, 46, 58, 46, 0], [83, 933, 60, 14, 60, 0], [83, 970, 60, 12, 60, 0]] },
  },
  { name: 'Construction_Male_02', folder: 'Professions', blank: { body: [[1726, 264, 20, 38], [1317, 1160, 20, 39]] } },
  { name: 'Chef_Female_01', folder: 'Professions' },
];

/**
 * Анимации: имя в игре → файл набора (`{s}` — m или f). `root` — движение корня: `fixed` — стоит на месте, `loop` —
 * петля шага, смещение вычитается, `keep` — как в наборе (таз уходит назад на стул), `after` — продолжение посадки:
 * начинается там, где она кончилась, `seated` — петля сидя (spec, «Анимации», часть 2): таз там, где посадка кончилась, а
 * петля начинается с кадра, ближайшего к последней позе посадки, — переход без рывка.
 */
/** Длина петли сидя, с: от и до — выбирается кадр, где поза ближе всего к первой (шов петли). */
const SEATED = [3, 8];

const CLIPS = [
  { name: 'Idle', file: 'all_animations_max_motextr_static/{s}_idle_breathe_01.max.fbx', root: 'fixed' },
  { name: 'Walk', file: 'all_animations_max_motextr_xy/{s}_walk_neutral.max.fbx', root: 'loop' },
  { name: 'Run', file: 'all_animations_max_motextr_xy/{s}_run_neutral.max.fbx', root: 'loop' },
  { name: 'SitDown', file: 'all_animations_max_motextr_xyz/{s}_sit_down_chair_01.max.fbx', root: 'keep' },
  { name: 'StandUp', file: 'all_animations_max_motextr_xyz/{s}_sit_stand_up_chair_01.max.fbx', root: 'after' },
  { name: 'Sit', file: 'all_animations_max_motextr_static/{s}_sit_chair_idle_neutral_01.max.fbx', root: 'seated' },
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
/** Папка вида в наборе: у варианта (`from`) — папка того вида, из которого он сделан. */
const srcOf = l => l.from ?? l.name;
const fbxPath = l => `Assets/Avatars/${l.folder}/${srcOf(l)}/Export/${srcOf(l)}.fbx`;

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
/**
 * Текстура цвета части: `<код>_<часть>_color.tga`; нет такой — цветовая текстура, на которую ссылается FBX и в имени
 * которой есть все слова части, с наименьшим числом лишних слов: у Medical_Female_03 тело — `f154_body_color_blue.tga`,
 * у очков Business_Female_02 — `f015_glasses_opacity_color.tga`, у головы «A_head» Chef_Female_01 — `f110_head_color_a.tga`.
 */
function texPath(src, l, code, part) {
  const base = `${code}_${part}_color`;
  const names = [...new Set([...readFileSync(join(src, fbxPath(l))).toString('latin1').matchAll(/textures\\([A-Za-z0-9_]+\.tga)/gi)].map(m => m[1]))];
  const words = n => n.toLowerCase().replace(/\.tga$/, '').split('_');
  const want = part.toLowerCase().split('_');
  const own = names.filter(n => words(n)[0] === code.toLowerCase() && words(n).includes('color') && want.every(w => words(n).includes(w)));
  const extra = n => words(n).filter(w => w !== code.toLowerCase() && w !== 'color' && !want.includes(w)).length;
  const file = names.some(n => n.toLowerCase() === `${base}.tga`.toLowerCase())
    ? `${base}.tga`
    : (own.sort((a, b) => extra(a) - extra(b) || (a < b ? -1 : 1))[0] ?? `${base}.tga`);
  return `Assets/Avatars/${l.folder}/${srcOf(l)}/Textures/${file}`;
}

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
    for (const part of parts) await one(texPath(src, l, code, part));
  }
  mkdirSync(OUT, { recursive: true });
  writeFileSync(SUMS, `${JSON.stringify(sums, null, 1)}\n`);
  if (bad) process.exit(1);
}

// ---------------------------------------------------------------- атлас и маска

/**
 * Картинка части 512² (RGBA), уменьшенная фильтром Ланцоша. `clone` — прямоугольники, заменённые точками той же картинки со
 * сдвигом; `blank` — закрашенные цветом вокруг них (таблица LOOKS).
 */
async function partImage(src, path, { blank = [], clone = [] } = {}, height = PART) {
  const t = readTga(readFileSync(join(src, path)));
  const rgba = Buffer.alloc(t.w * t.h * 4);
  for (let i = 0; i < t.w * t.h; i++) {
    rgba[i * 4] = t.data[i * t.ch];
    rgba[i * 4 + 1] = t.data[i * t.ch + 1];
    rgba[i * 4 + 2] = t.data[i * t.ch + 2];
    rgba[i * 4 + 3] = t.ch === 4 ? t.data[i * t.ch + 3] : 255;
  }
  if (clone.length) {
    // копия — из исходной картинки: пересекающиеся прямоугольники с одним сдвигом дают одно и то же
    const from = Buffer.from(rgba);
    for (const [x0, y0, w, h, dx, dy] of clone) {
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) for (let k = 0; k < 3; k++) rgba[(y * t.w + x) * 4 + k] = from[((y + dy) * t.w + x + dx) * 4 + k];
    }
  }
  if (blank.length) {
    // пятна — пересекающиеся прямоугольники; цвет пятна — медиана рамок в точку шириной вокруг его прямоугольников (фон
    // бейджа), точки внутри любого прямоугольника — не рамка
    const inside = (x, y) => blank.some(([x0, y0, w, h]) => x >= x0 && x < x0 + w && y >= y0 && y < y0 + h);
    const meet = (a, b) => a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
    const spot = blank.map((_, i) => i);
    const root = i => (spot[i] === i ? i : (spot[i] = root(spot[i])));
    for (let i = 0; i < blank.length; i++) for (let j = 0; j < i; j++) if (meet(blank[i], blank[j])) spot[root(i)] = root(j);
    const fills = new Map();
    for (let i = 0; i < blank.length; i++) {
      const r = root(i);
      if (fills.has(r)) continue;
      const ring = [[], [], []];
      for (let j = 0; j < blank.length; j++) {
        if (root(j) !== r) continue;
        const [x0, y0, w, h] = blank[j];
        for (let y = y0 - 1; y <= y0 + h; y++) {
          for (let x = x0 - 1; x <= x0 + w; x++) if (!inside(x, y)) for (let k = 0; k < 3; k++) ring[k].push(rgba[(y * t.w + x) * 4 + k]);
        }
      }
      fills.set(r, ring.map(a => a.sort((p, q) => p - q)[a.length >> 1]));
    }
    blank.forEach(([x0, y0, w, h], i) => {
      const fill = fills.get(root(i));
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) for (let k = 0; k < 3; k++) rgba[(y * t.w + x) * 4 + k] = fill[k];
    });
  }
  // вся картинка — в свою четверть или половину, даже не квадратная (пряди 2048 × 1024, стетоскоп, каска): развёртка ждёт её
  // целиком, а по умолчанию sharp обрезал бы края
  return sharp(rgba, { raw: { width: t.w, height: t.h, channels: 4 } }).resize(PART, height, { kernel: 'lanczos3', fit: 'fill' }).raw().toBuffer();
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

  // части → четверти атласа: тело, голова, пряди, остальное (стетоскоп, шапочка с маской) — в последнюю; две
  // принадлежности (каска и пояс с инструментами) — по половине последней, верхняя и нижняя (`half`). Варианту (`drop`)
  // часть не нужна: её треугольников нет в сетке, картинки — в атласе
  const dropped = parts.map(p => look.drop?.includes(p) ?? false);
  // голова бывает «A_head» (Chef_Female_01) — тоже в свою четверть, а не к принадлежностям
  const quad = parts.map(p => QUADRANT[p] ?? (p.endsWith('_head') ? QUADRANT.head : 3));
  const extras = parts.flatMap((_, p) => (quad[p] === 3 && !dropped[p] ? [p] : []));
  if (extras.length > 2) throw new Error(`${look.name}: больше двух принадлежностей (${parts.join(', ')})`);
  const half = parts.map((_, p) => (extras.length === 2 ? extras.indexOf(p) : -1));

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
    const h = half[groupOf[i]];
    uv[i * 2] = (g0.attributes.uv.getX(i) + (q % 2)) / 2;
    uv[i * 2 + 1] = h < 0 ? (1 - g0.attributes.uv.getY(i) + Math.floor(q / 2)) / 2 : ((1 - g0.attributes.uv.getY(i) + h) / 2 + Math.floor(q / 2)) / 2;
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
  // FBXLoader отдаёт каждую грань тремя своими вершинами: без вершин части, которой у варианта нет, грани остальных целы
  const kept = [];
  for (let i = 0; i < n0; i++) if (!dropped[groupOf[i]]) kept.push(i);
  const pick = (a, size) => (kept.length === n0 ? a : Float32Array.from({ length: kept.length * size }, (_, j) => a[kept[(j / size) | 0] * size + (j % size)]));
  const raw = new THREE.BufferGeometry();
  raw.setAttribute('position', new THREE.BufferAttribute(pick(pos, 3), 3));
  raw.setAttribute('normal', new THREE.BufferAttribute(pick(nrm, 3), 3));
  raw.setAttribute('uv', new THREE.BufferAttribute(pick(uv, 2), 2));
  raw.setAttribute('skinIndex', new THREE.BufferAttribute(pick(ji, 4), 4));
  raw.setAttribute('skinWeight', new THREE.BufferAttribute(pick(jw, 4), 4));
  raw.setAttribute('part', new THREE.BufferAttribute(pick(part, 1), 1));
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
  /** последняя поза посадки: высота таза и повороты костей — от неё петля сидя */
  let sitEnd = null;
  /** петля сидя: с какого кадра из скольких, насколько далека её первая поза от последней позы посадки, разница таза, см */
  let seated = null;
  for (const c of CLIPS) {
    const clip = fbx(src, `Assets/Animations/${c.file.replace('{s}', sex)}`).animations[0];
    const track = name => clip.tracks.find(t => t.name === name);
    const rootT = track('Bip01.position');
    const times = Array.from(rootT.times);
    const nk = times.length;
    const T = times[nk - 1] - times[0];
    const rp = Array.from(rootT.values);
    const step0 = T / (nk - 1);
    // посадка и вставание: без неподвижного начала и конца — таз ниже или выше на 1 см, с запасом в 6 кадров
    let a = 0;
    let b = nk - 1;
    // петля сидя — с кадра, ближайшего к последней позе посадки (сумма 1 − |cos| половин углов по костям тела), и до кадра
    // через 3–8 с, ближайшего к первому: в наборе петля — 33–36 с, столько кадров текстуре костей не нужно
    let from = 0;
    if (c.root === 'seated') {
      const quat = (f, bip) => {
        const t = track(`${bip}.quaternion`);
        return t ? Array.from(t.values.slice(f * 4, f * 4 + 4)) : null;
      };
      const gap = (f, pose) => ORDER.reduce((sum, bip) => {
        const a = quat(f, bip);
        const q = pose(bip);
        return a && q ? sum + 1 - Math.abs(a[0] * q[0] + a[1] * q[1] + a[2] * q[2] + a[3] * q[3]) : sum;
      }, 0);
      const toSit = f => gap(f, bip => sitEnd?.rot[bip]);
      for (let f = 1; f < nk; f++) if (toSit(f) < toSit(from)) from = f;
      const lo = Math.round(SEATED[0] / step0);
      const hi = Math.round(SEATED[1] / step0);
      if (from + hi >= nk) from = Math.max(0, nk - 1 - hi);
      let end = from + lo;
      for (let e = from + lo; e <= from + hi; e++) if (gap(e, bip => quat(from, bip)) < gap(end, bip => quat(from, bip))) end = e;
      a = from;
      b = end;
      seated = { from, end, of: nk, gap: toSit(from), seam: gap(end, bip => quat(from, bip)), y: sitEnd ? Math.round((rp[from * 3 + 1] * k - sitEnd.y) * 10) / 10 : 0 };
    }
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
      if (c.root === 'seated') {
        // таз — там, где посадка кончилась, и на той же высоте; дальше — как дышит петля
        tr.push((rp[f * 3] - rp[from * 3]) * k + (last?.[0] ?? 0) + rest.x, (y - rp[from * 3 + 1]) * k + (sitEnd?.y ?? y * k), (rp[f * 3 + 2] - rp[from * 3 + 2]) * k + (last?.[2] ?? 0) + rest.z);
        continue;
      }
      tr.push(x * k + ax + rest.x, y * k, z * k + az + rest.z);
    }
    if (c.root === 'keep') {
      last = [(rp[b * 3] - rp[0]) * k, 0, (rp[b * 3 + 2] - rp[2]) * k];
      const end = {};
      for (const bip of ORDER) {
        const t = track(`${bip}.quaternion`);
        if (t) end[bip] = Array.from(t.values.slice(b * 4, b * 4 + 4));
      }
      sitEnd = { y: rp[b * 3 + 1] * k, rot: end };
    }
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

  return { root, sm, mats, code, parts, quad, half, bones, sex, geo, idx, lod, clips, speeds, look, seated };
}

// ---------------------------------------------------------------- атлас, маска, glb

async function images(src, c) {
  const { look, code, parts, quad, half, geo, idx } = c;
  const atlas = Buffer.alloc(ATLAS * ATLAS * 3, 0);
  const mask = Buffer.alloc(ATLAS * ATLAS * 4, 0);
  for (let i = 0; i < ATLAS * ATLAS; i++) mask[i * 4 + 3] = 255;
  let tintSum = 0;
  let tintN = 0;
  const imgs = [];
  for (let p = 0; p < parts.length; p++) {
    if (look.drop?.includes(parts[p])) continue;
    // половина четверти (две принадлежности) — картинка вдвое ниже
    const h = half[p];
    const fix = { blank: look.blank?.[parts[p]], clone: look.clone?.[parts[p]] };
    imgs.push({ q: quad[p], h, part: parts[p], img: await partImage(src, texPath(src, look, code, parts[p]), fix, h < 0 ? PART : PART / 2) });
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

  for (const { q, h, part, img } of imgs) {
    const ox = (q % 2) * PART;
    const oy = Math.floor(q / 2) * PART + (h < 0 ? 0 : (h * PART) / 2);
    for (let y = 0; y < (h < 0 ? PART : PART / 2); y++) {
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
      `шаг ${(c.speeds.Walk / 100).toFixed(2)} м/с, бег ${(c.speeds.Run / 100).toFixed(2)} м/с; ` +
      `сидя — кадры ${c.seated.from}–${c.seated.end} из ${c.seated.of}, от посадки ${c.seated.gap.toFixed(3)}, шов ${c.seated.seam.toFixed(3)}, таз ${c.seated.y} см; ${Math.round(performance.now() - t0)} мс`,
  );
}
writeFileSync(join(OUT, 'index.json'), `${JSON.stringify({ looks: LOOKS.map(l => l.name) }, null, 1)}\n`);
writeFileSync(SUMS, `${JSON.stringify(sums, null, 1)}\n`);
console.log(`Всего: ${(total / 1048576).toFixed(2)} МБ`);
