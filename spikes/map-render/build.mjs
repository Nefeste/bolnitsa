// Сборка страницы пробы в dist/: один app.js (esbuild), index.html и canvaskit.wasm рядом.
// Сеть не нужна ни при запуске, ни при работе: всё лежит локально.
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });
await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'chrome130',
  minify: true,
  sourcemap: false,
  outfile: 'dist/app.js',
  // в canvaskit.js есть ветка для Node с require('fs'/'path') — в браузере она не выполняется
  external: ['fs', 'path'],
  logLevel: 'info',
});
copyFileSync('index.html', 'dist/index.html');
copyFileSync('node_modules/canvaskit-wasm/bin/canvaskit.wasm', 'dist/canvaskit.wasm');
