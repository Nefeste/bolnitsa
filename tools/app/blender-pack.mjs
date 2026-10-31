// Сжатие моделей Blender (docs/specs/2026-11-blender-2.md, «Как собирается»): тот же шаг, что у моделей CC0
// (tools/app/assets.mjs) — EXT_meshopt_compression с теми же настройками. Берёт то, что выгрузил blender/build.py в
// blender/.out/, и пишет в assets/models/blender/; картинки и образцы запечённого света копирует как есть. Шаг
// детерминирован: те же входные файлы — те же выходные до байта.
//
//   python blender/build.py [имена]  &&  node tools/app/blender-pack.mjs
//
// Материалы не сливаются (`dedup` без MATERIAL): по имени материала игра перекрашивает вещь и зажигает экран.
import { NodeIO, PropertyType } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const RAW = new URL('../../blender/.out/', import.meta.url).pathname;
const OUT = new URL('../../assets/models/blender/', import.meta.url).pathname;
if (!existsSync(RAW)) throw new Error('нет blender/.out/: сначала python blender/build.py');

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

mkdirSync(OUT, { recursive: true });
const report = [];
for (const name of readdirSync(RAW).sort()) {
  const src = join(RAW, name);
  const dst = join(OUT, name);
  if (!name.endsWith('.glb')) {
    copyFileSync(src, dst);
    report.push(`${name.padEnd(28)} как есть`);
    continue;
  }
  const doc = await io.read(src);
  await doc.transform(
    prune(),
    dedup({ propertyTypes: [PropertyType.ACCESSOR, PropertyType.MESH, PropertyType.TEXTURE] }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium', quantizePosition: 14 }),
  );
  const bin = await io.writeBinary(doc);
  writeFileSync(dst, bin);
  report.push(`${name.padEnd(28)} ${String(Math.round(statSync(src).size / 1024)).padStart(5)} КБ → ${String(Math.round(bin.byteLength / 1024)).padStart(4)} КБ`);
}
console.log(report.join('\n'));
