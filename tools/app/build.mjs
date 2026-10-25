// из spikes/render-3d: build.mjs — изменено: страница и поток расчёта, медицинская база рядом, версия из package.json.
// Сборка страницы игры в dist/ (spec docs/specs/2026-10-shell-3d.md, «Сборка страницы»): esbuild — страница
// (src/app/main.tsx → app.js) и поток расчёта (src/sim/worker.ts → sim.js), index.html, модели и собранная медицинская
// база (content.json). Сеть не нужна ни при запуске, ни при работе: всё лежит локально.
import { build } from 'esbuild';
import { cpSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../..', import.meta.url).pathname;
const out = join(root, 'dist');
const bundle = join(root, 'src/content/generated/bundle.json');
if (!existsSync(bundle)) throw new Error('Нет src/content/generated/bundle.json — сначала npm run content');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const dev = process.argv.includes('--dev');

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const common = {
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'chrome130',
  minify: !dev,
  sourcemap: dev ? 'inline' : false,
  logLevel: 'info',
  define: { __VERSION__: JSON.stringify(version), 'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production') },
};
await build({ ...common, entryPoints: [join(root, 'src/app/main.tsx')], outfile: join(out, 'app.js'), jsx: 'automatic' });
await build({ ...common, entryPoints: [join(root, 'src/sim/worker.ts')], outfile: join(out, 'sim.js') });
copyFileSync(join(root, 'app/index.html'), join(out, 'index.html'));
copyFileSync(bundle, join(out, 'content.json'));
cpSync(join(root, 'assets/models'), join(out, 'assets/models'), { recursive: true });
// шрифт игры (решение владельца #107): файлы IBM Plex Sans и текст лицензии OFL — рядом, в каждой копии
cpSync(join(root, 'assets/fonts'), join(out, 'assets/fonts'), { recursive: true });
copyFileSync(join(root, 'assets/LICENSES.md'), join(out, 'LICENSES.md'));
console.log(`dist/ — версия ${version}`);
