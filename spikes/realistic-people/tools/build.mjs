// Сборка страницы пробы: src/main.ts → dist/app.js (esbuild из node_modules корня репозитория). Люди игры рисуются кодом
// самой игры (src/render/bake.ts, people.ts, view.ts, post.ts) — сборка берёт его оттуда, без копий.
//
//   node spikes/realistic-people/tools/build.mjs
import { build } from 'esbuild';

const root = new URL('../', import.meta.url).pathname;
await build({
  entryPoints: [`${root}src/main.ts`],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'chrome130',
  minify: false,
  sourcemap: false,
  outfile: `${root}dist/app.js`,
  logLevel: 'info',
});
