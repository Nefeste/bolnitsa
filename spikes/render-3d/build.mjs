// Сборка страницы пробы в dist/: один app.js (esbuild), index.html и модели assets/models.
// Сеть не нужна ни при запуске, ни при работе: всё лежит локально.
import { build } from 'esbuild';
import { cpSync, copyFileSync, mkdirSync, rmSync } from 'node:fs';

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
  logLevel: 'info',
});
copyFileSync('index.html', 'dist/index.html');
cpSync('assets/models', 'dist/assets/models', { recursive: true });
