// из spikes/render-3d: tools/assets.mjs (+ свои списки моделей, SHA-256 исходников в sources.json; без людей — они из
// tools/app/people.mjs)
// Готовит мебель игры из исходных наборов CC0 (assets/LICENSES.md): берёт только нужные файлы, сжимает геометрию
// (EXT_meshopt_compression) и пишет .glb в assets/models/. Исходники в git не лежат — откуда их взять, сказано в
// assets/LICENSES.md; путь к папке с ними — первый аргумент:
//
//   node tools/app/assets.mjs /путь/к/исходникам
//
// В папке ожидаются (как после git clone, см. LICENSES.md):
//   kfk/assets/kenney_furniture-kit/Models/GLTF format/*.glb
//   KayKit-Furniture-Bits-1.0/addons/kaykit_furniture_bits/Assets/gltf/*.gltf
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, resample } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = process.argv[2];
if (!SRC) throw new Error('Укажите папку с исходными наборами (см. assets/LICENSES.md)');
const OUT = new URL('../../assets/models/', import.meta.url).pathname;

/** Kenney Furniture Kit 2.0 — какие модели берём (где они в игре — src/render/catalog.ts). */
export const KENNEY = [
  'chair', 'chairDesk', 'chairModernFrameCushion', 'benchCushion', 'loungeChair', 'desk', 'computerScreen', 'computerKeyboard',
  'bookcaseClosedDoors', 'sideTableDrawers', 'table', 'kitchenCabinet', 'kitchenSink', 'bathroomSink', 'bathroomSinkSquare', 'toilet',
  'pottedPlant', 'rugRectangle',
];
/** KayKit Furniture Bits 1.0. */
export const KAYKIT = ['cabinet_medium'];

const KENNEY_DIR = 'kfk/assets/kenney_furniture-kit/Models/GLTF format';
const KAYKIT_DIR = 'KayKit-Furniture-Bits-1.0/addons/kaykit_furniture_bits/Assets/gltf';

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

// только свои папки: люди Rocketbox (rocketbox/) — от tools/app/people.mjs
for (const d of ['kenney', 'kaykit']) rmSync(join(OUT, d), { recursive: true, force: true });
let total = 0;
const report = [];
const sources = {};
const sha = p => createHash('sha256').update(readFileSync(p)).digest('hex');

async function one(src, dst) {
  const doc = await io.read(src);
  await doc.transform(prune(), dedup(), resample(), meshopt({ encoder: MeshoptEncoder, level: 'medium', quantizePosition: 14 }));
  const bin = await io.writeBinary(doc);
  mkdirSync(join(OUT, dst.split('/')[0]), { recursive: true });
  writeFileSync(join(OUT, dst), bin);
  const before = statSync(src).size;
  total += bin.byteLength;
  sources[dst] = { source: src.slice(SRC.length).replace(/^\/+/, ''), sha256: sha(src), out: createHash('sha256').update(bin).digest('hex') };
  report.push(`${dst.padEnd(42)} ${String(Math.round(before / 1024)).padStart(6)} КБ → ${String(Math.round(bin.byteLength / 1024)).padStart(5)} КБ`);
}

for (const n of KENNEY) await one(join(SRC, KENNEY_DIR, `${n}.glb`), `kenney/${n}.glb`);
for (const n of KAYKIT) await one(join(SRC, KAYKIT_DIR, `${n}.gltf`), `kaykit/${n}.glb`);

writeFileSync(join(OUT, 'index.json'), `${JSON.stringify({ kenney: KENNEY, kaykit: KAYKIT }, null, 1)}\n`);
writeFileSync(join(OUT, 'sources.json'), `${JSON.stringify(sources, null, 1)}\n`);
console.log(report.join('\n'));
console.log(`Всего: ${(total / 1048576).toFixed(2)} МБ`);
