// Значки окна — Carbon (IBM), Apache 2.0 (решение владельца #139; docs/reports/2026-10-icons.md): из пакета @carbon/icons
// закреплённой версии — только те, что нужны игре, разметкой SVG в src/ui/icons.gen.ts и текст лицензии рядом с моделями.
// На 16 точках — рисунок набора этого размера, где он есть, иначе сетка 32 (как на листе сравнения). Повторяемо до байта.
//
//   node tools/app/icons.mjs --fetch /путь/к/пакету   # пакет с npm (npm pack, без установки и скриптов), сверить SHA-256
//   node tools/app/icons.mjs /путь/к/пакету           # → src/ui/icons.gen.ts и assets/licenses/carbon-icons.txt
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PACKAGE = '@carbon/icons@11.91.0';
const TARBALL = 'carbon-icons-11.91.0.tgz';
/** SHA-256 архива пакета с npm (npm pack, 26.10.2026) */
const SHA256 = '77260d43016148438bb6ae2553e708573b5a81f47d3bbb03faa6e71e2103d804';
const ROOT = new URL('../../', import.meta.url).pathname;
const OUT = join(ROOT, 'src/ui/icons.gen.ts');
const LICENSE = join(ROOT, 'assets/licenses/carbon-icons.txt');

/**
 * Значки игры: имя в окне → имя в наборе. Что где — src/ui/icons.tsx; лист сравнения и отчёт — docs/reports/2026-10-icons.md.
 */
const ICONS = {
  close: 'close',
  done: 'checkmark',
  wrong: 'misuse',
  open: 'chevron--right',
  fold: 'chevron--down',
  up: 'arrow--up',
  down: 'arrow--down',
  back: 'arrow--left',
  menu: 'menu',
  build: 'tools',
  ready: 'catalog',
  room: 'floorplan',
  item: 'cube',
  demolish: 'trash-can',
  layers: 'layers',
  settings: 'settings',
  undo: 'undo',
  warn: 'warning--alt',
  morning: 'skip--forward',
  pause: 'pause',
  todo: 'circle-dash',
};

/**
 * Свои значки — чего в наборе нет: дверь, двойная дверь, скамья (инструменты стройки). Нарисованы кодом в рисунке Carbon:
 * сетка 32, заливка, линии в 2 точки, скругления 2 — рядом с ним не выделяются.
 */
const OWN = {
  door: '<path d="M24,2H8A2,2,0,0,0,6,4V28H3v2H29V28H26V4A2,2,0,0,0,24,2Zm0,26H8V4H24Z"/><path d="M19 15H21V18H19z"/>',
  door2: '<path d="M26,2H6A2,2,0,0,0,4,4V28H2v2H30V28H28V4A2,2,0,0,0,26,2ZM6,4h9V28H6Zm20,24H17V4h9Z"/><path d="M11 15H13V18H11z"/><path d="M19 15H21V18H19z"/>',
  bench: '<path d="M5 8H27V10H5z"/><path d="M3 14H29V17H3z"/><path d="M6 17H8V25H6z"/><path d="M24 17H26V25H24z"/>',
};

const [flag, dirArg] = process.argv[2] === '--fetch' ? ['fetch', process.argv[3]] : ['build', process.argv[2]];
if (!dirArg) {
  console.error('node tools/app/icons.mjs [--fetch] /путь/к/пакету');
  process.exit(2);
}
const dir = dirArg;
const sha = file => createHash('sha256').update(readFileSync(file)).digest('hex');

if (flag === 'fetch') {
  mkdirSync(dir, { recursive: true });
  const tgz = join(dir, TARBALL);
  if (!existsSync(tgz)) {
    const r = spawnSync('npm', ['pack', '--silent', PACKAGE], { cwd: dir, stdio: ['ignore', 'inherit', 'inherit'] });
    if (r.status !== 0) process.exit(r.status ?? 1);
  }
  const got = sha(tgz);
  if (got !== SHA256) {
    console.error(`${TARBALL}: SHA-256 ${got}, ожидается ${SHA256}`);
    process.exit(1);
  }
  const x = spawnSync('tar', ['-xzf', TARBALL], { cwd: dir, stdio: 'inherit' });
  if (x.status !== 0) process.exit(x.status ?? 1);
  console.log(`${PACKAGE}: ${TARBALL}, SHA-256 сходится; распакован в ${join(dir, 'package')}`);
  process.exit(0);
}

const pkg = join(dir, 'package');
const version = JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8')).version;
if (`@carbon/icons@${version}` !== PACKAGE) {
  console.error(`${pkg}: версия ${version}, ожидается ${PACKAGE}`);
  process.exit(1);
}

/** Содержимое SVG без обёртки: пути, без невидимых (opacity 0 — «внутренний» путь залитых), пробелы схлопнуты. */
function body(file) {
  const svg = readFileSync(file, 'utf8');
  const inner = svg.replace(/^[\s\S]*?<svg\b[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  const parts = inner.match(/<[a-z]+\b[^>]*\/>/g) ?? [];
  if (parts.join('') !== inner.replace(/>\s+</g, '><').trim()) throw new Error(`${file}: не только пустые элементы — разбери вручную`);
  return parts
    .filter(p => !/\bopacity="0"/.test(p))
    .map(p => p.replace(/\s+/g, ' ').replace(/\s*(\/?>)$/, '$1'))
    .join('');
}

const rows = [];
for (const [key, name] of Object.entries(ICONS)) {
  const at16 = join(pkg, 'svg', '16', `${name}.svg`);
  const at32 = join(pkg, 'svg', '32', `${name}.svg`);
  const [file, size] = existsSync(at16) ? [at16, 16] : [at32, 32];
  if (!existsSync(file)) throw new Error(`нет значка ${name}`);
  rows.push(`  ${key}: { size: ${size}, body: ${JSON.stringify(body(file))} },`);
}
for (const [key, svg] of Object.entries(OWN)) rows.push(`  ${key}: { size: 32, body: ${JSON.stringify(svg)}, own: true },`);
const src = `// Сделано tools/app/icons.mjs из ${PACKAGE} (IBM, Apache 2.0 — assets/LICENSES.md); руками не править.
// Изменено против пакета: из файлов SVG взяты только пути, невидимые (opacity 0) убраны, пробелы схлопнуты.
// Значок — размер сетки набора (16 или 32) и разметка его путей; \`own\` — свой, нарисованный в рисунке набора (его в наборе нет).
export const ICONS = {
${rows.join('\n')}
} as const;
`;
writeFileSync(OUT, src);
mkdirSync(join(ROOT, 'assets/licenses'), { recursive: true });
writeFileSync(LICENSE, readFileSync(join(pkg, 'LICENSE')));
const at16 = rows.filter(r => r.includes('size: 16')).length;
const own = Object.keys(OWN).length;
console.log(`${OUT}: значков набора ${rows.length - own} (на сетке 16 — ${at16}, на 32 — ${rows.length - own - at16}), своих ${own}; ${LICENSE}`);
// проверка: все ли svg набора на месте (на случай другого пакета)
if (!readdirSync(join(pkg, 'svg')).includes('32')) throw new Error('в пакете нет svg/32');
