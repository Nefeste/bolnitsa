// из spikes/render-3d: tools/assets.mjs (+ бег у людей, свои списки моделей, SHA-256 исходников в sources.json)
// Готовит модели игры из исходных наборов CC0 (assets/LICENSES.md): берёт только нужные файлы, у людей оставляет пять
// анимаций, сжимает геометрию и анимацию (EXT_meshopt_compression) и пишет .glb в assets/models/. Исходники в git не
// лежат — откуда их взять, сказано в assets/LICENSES.md; путь к папке с ними — первый аргумент:
//
//   node tools/app/assets.mjs /путь/к/исходникам
//
// В папке ожидаются (как после git clone, см. LICENSES.md):
//   kfk/assets/kenney_furniture-kit/Models/GLTF format/*.glb
//   KayKit-Furniture-Bits-1.0/addons/kaykit_furniture_bits/Assets/gltf/*.gltf
//   uacp/public/resources/Ultimate Animated Character Pack - Nov 2019/glTF/*.gltf
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
/**
 * Ultimate Animated Character Pack (Quaternius, ноябрь 2019): врачи — персонал (цвет халата — по должности), костюмы —
 * регистратура, обычная одежда — пациенты, «классика» — пожилые пациенты.
 */
export const PEOPLE = [
  'Doctor_Male_Young', 'Doctor_Female_Young', 'Doctor_Male_Old', 'Doctor_Female_Old', 'Suit_Male', 'Suit_Female',
  'Casual_Male', 'Casual_Female', 'Casual2_Male', 'Casual2_Female', 'Casual3_Male', 'Casual3_Female', 'Casual_Bald',
  'OldClassy_Male', 'OldClassy_Female',
];
const CLIPS = new Set(['Idle', 'Walk', 'Run', 'SitDown', 'StandUp']);

const KENNEY_DIR = 'kfk/assets/kenney_furniture-kit/Models/GLTF format';
const KAYKIT_DIR = 'KayKit-Furniture-Bits-1.0/addons/kaykit_furniture_bits/Assets/gltf';
const PEOPLE_DIR = 'uacp/public/resources/Ultimate Animated Character Pack - Nov 2019/glTF';

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

rmSync(OUT, { recursive: true, force: true });
let total = 0;
const report = [];
const sources = {};
const sha = p => createHash('sha256').update(readFileSync(p)).digest('hex');

async function one(src, dst, people = false) {
  const doc = await io.read(src);
  if (people) for (const a of doc.getRoot().listAnimations()) if (!CLIPS.has(a.getName())) a.dispose();
  // у людей волосы лежат вплотную к голове: 14 бит на координату дают «пятна» (z-fighting) — берём 16
  await doc.transform(prune(), dedup(), resample(), meshopt({ encoder: MeshoptEncoder, level: 'medium', quantizePosition: people ? 16 : 14 }));
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
for (const n of PEOPLE) await one(join(SRC, PEOPLE_DIR, `${n}.gltf`), `people/${n}.glb`, true);

writeFileSync(join(OUT, 'index.json'), `${JSON.stringify({ kenney: KENNEY, kaykit: KAYKIT, people: PEOPLE }, null, 1)}\n`);
writeFileSync(join(OUT, 'sources.json'), `${JSON.stringify(sources, null, 1)}\n`);
console.log(report.join('\n'));
console.log(`Всего: ${(total / 1048576).toFixed(2)} МБ`);
