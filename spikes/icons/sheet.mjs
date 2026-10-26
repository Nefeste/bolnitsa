// Лист сравнения значков (docs/reports/2026-10-icons.md): одни и те же места игры — верхняя полоса, левые инструменты,
// кнопки карты, строки окна врача и значки медицины — в четырёх наборах-кандидатах, со шрифтом и цветами игры
// (app/index.html). Значки — файлы наборов из files/ (fetch.sh), как есть: только размер и цвет — currentColor; у Carbon на
// 16 точках — его файл этого размера, где он есть, иначе сетка 32.
//   node spikes/icons/sheet.mjs [files] [out]   → out/sheet.png
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const files = resolve(process.argv[2] ?? join(here, 'files'));
const out = resolve(process.argv[3] ?? join(root, 'docs/reports/2026-10-icons'));
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

/** Наборы: где лежат значки, лицензия, как рисованы. Carbon — свои файлы на 16 и 20 точек, у прочих — один на все размеры. */
const SETS = [
  { key: 'lucide', name: 'Lucide 1.61', license: 'ISC', style: 'линия 2 px', dir: 'lucide/package/icons' },
  { key: 'tabler', name: 'Tabler 3.49', license: 'MIT', style: 'линия 2 px', dir: 'tabler/package/icons/outline' },
  { key: 'phosphor', name: 'Phosphor 2.1', license: 'MIT', style: 'заливка, «regular»', dir: 'phosphor/package/assets/regular' },
  { key: 'carbon', name: 'Carbon 11.91 (IBM)', license: 'Apache 2.0', style: 'заливка, сетка 32, частые — и 16', dir: 'carbon/package/svg' },
];

/** Что где в игре: подпись и имя файла в каждом наборе. Сейчас в игре — символ Юникода из третьего столбца. */
const ICONS = [
  ['close', 'Закрыть', '✕', { lucide: 'x', tabler: 'x', phosphor: 'x', carbon: 'close' }],
  ['done', 'Готово, верно', '✓', { lucide: 'check', tabler: 'check', phosphor: 'check', carbon: 'checkmark' }],
  ['wrong', 'Неверно', '✗', { lucide: 'circle-x', tabler: 'circle-x', phosphor: 'x-circle', carbon: 'misuse' }],
  ['open', 'Раскрыть', '▸', { lucide: 'chevron-right', tabler: 'chevron-right', phosphor: 'caret-right', carbon: 'chevron--right' }],
  ['fold', 'Свернуть', '▾', { lucide: 'chevron-down', tabler: 'chevron-down', phosphor: 'caret-down', carbon: 'chevron--down' }],
  ['up', 'Выше', '↑', { lucide: 'arrow-up', tabler: 'arrow-up', phosphor: 'arrow-up', carbon: 'arrow--up' }],
  ['down', 'Ниже', '↓', { lucide: 'arrow-down', tabler: 'arrow-down', phosphor: 'arrow-down', carbon: 'arrow--down' }],
  ['back', 'Назад', '←', { lucide: 'arrow-left', tabler: 'arrow-left', phosphor: 'arrow-left', carbon: 'arrow--left' }],
  ['menu', 'Игра (меню)', '☰', { lucide: 'menu', tabler: 'menu-2', phosphor: 'list', carbon: 'menu' }],
  ['build', 'Стройка', '🏗', { lucide: 'hammer', tabler: 'hammer', phosphor: 'hammer', carbon: 'tools' }],
  ['layers', 'Слои', '▦', { lucide: 'layers', tabler: 'stack-2', phosphor: 'stack', carbon: 'layers' }],
  ['settings', 'Настройки', '⚙', { lucide: 'settings', tabler: 'settings', phosphor: 'gear', carbon: 'settings' }],
  ['bell', 'Извещения', '🔔', { lucide: 'bell', tabler: 'bell', phosphor: 'bell', carbon: 'notification' }],
  ['undo', 'Отменить', '↶', { lucide: 'undo-2', tabler: 'arrow-back-up', phosphor: 'arrow-u-up-left', carbon: 'undo' }],
  ['warn', 'Внимание', '⚠', { lucide: 'triangle-alert', tabler: 'alert-triangle', phosphor: 'warning', carbon: 'warning--alt' }],
  ['morning', 'До утра', '⏭', { lucide: 'skip-forward', tabler: 'player-skip-forward', phosphor: 'skip-forward', carbon: 'skip--forward' }],
  ['pause', 'Пауза', '❚❚', { lucide: 'pause', tabler: 'player-pause', phosphor: 'pause', carbon: 'pause' }],
  ['play', 'Ход', '▶', { lucide: 'play', tabler: 'player-play', phosphor: 'play', carbon: 'play' }],
  ['todo', 'Не выполнено', '○', { lucide: 'circle-dashed', tabler: 'circle-dashed', phosphor: 'circle-dashed', carbon: 'circle-dash' }],
  // медицина и больница — для каталога, карточек и карты больного
  ['doctor', 'Врач', '', { lucide: 'stethoscope', tabler: 'stethoscope', phosphor: 'stethoscope', carbon: 'stethoscope' }],
  ['hospital', 'Больница', '', { lucide: 'hospital', tabler: 'building-hospital', phosphor: 'hospital', carbon: 'hospital' }],
  ['bed', 'Койка', '', { lucide: 'bed-single', tabler: 'bed', phosphor: 'bed', carbon: 'hospital-bed' }],
  ['pill', 'Лечение', '', { lucide: 'pill', tabler: 'pill', phosphor: 'pill', carbon: 'medication' }],
  ['person', 'Пациент', '', { lucide: 'user', tabler: 'user', phosphor: 'user', carbon: 'user' }],
  ['money', 'Касса', '', { lucide: 'banknote', tabler: 'cash', phosphor: 'money', carbon: 'money' }],
  ['clock', 'Время', '', { lucide: 'clock', tabler: 'clock', phosphor: 'clock', carbon: 'time' }],
  ['pulse', 'Состояние', '', { lucide: 'heart-pulse', tabler: 'heartbeat', phosphor: 'heartbeat', carbon: 'activity' }],
];

/** Файл значка набора — разметка SVG без комментариев, размер `px`, цвет — текущий цвет текста. */
function svg(set, name, px) {
  const base = join(files, set.dir);
  const pick = set.key === 'carbon' ? [join(base, px <= 16 ? '16' : '20', `${name}.svg`), join(base, '32', `${name}.svg`)] : [join(base, `${name}.svg`)];
  const path = pick.find(p => existsSync(p));
  if (!path) throw new Error(`${set.key}: нет значка ${name}`);
  let s = readFileSync(path, 'utf8').replace(/<!--[\s\S]*?-->/g, '').replace(/<\?xml[^>]*>/g, '').trim();
  s = s.replace(/<svg\b([^>]*)>/, (_, a) => {
    const attrs = a.replace(/\s(width|height|class)="[^"]*"/g, '');
    const fill = set.key === 'carbon' && !/fill=/.test(attrs) ? ' fill="currentColor"' : '';
    return `<svg${attrs} width="${px}" height="${px}"${fill} aria-hidden="true">`;
  });
  return s;
}

const ic = (set, key, px = 16) => svg(set, ICONS.find(x => x[0] === key)[3][set.key], px);

function column(set) {
  const btn = (key, text, on = false) => `<button class="${on ? 'on' : ''}">${ic(set, key)}${text ? `<span>${text}</span>` : ''}</button>`;
  const grid = ICONS.map(([key, label, now]) => `<div class="cell"><span class="i20">${ic(set, key, 20)}</span><small>${label}${now ? ` <em>${now}</em>` : ''}</small></div>`).join('');
  return `<section class="panel col">
    <h2>${set.name}</h2><p class="muted">${set.license} · ${set.style}</p>
    <div class="row">${btn('pause', 'Пауза', true)}<button>×1</button><button>×3</button>${btn('morning', 'До утра')}</div>
    <div class="row">${btn('menu', 'Игра')}${btn('build', 'Стройка')}${btn('layers', 'Слои')}</div>
    <div class="row">${btn('settings', '')}${btn('bell', '')}${btn('undo', 'Отменить')}${btn('close', '')}</div>
    <div class="line ok">${ic(set, 'done')}<span>Цель выполнена: открыть лабораторию</span></div>
    <div class="line todo">${ic(set, 'todo')}<span>Принять 100 пациентов — 34 из 100</span></div>
    <div class="line bad">${ic(set, 'wrong')}<span>Неверно: на самом деле — цистит</span></div>
    <div class="line warn">${ic(set, 'warn')}<span>Нет санитара в смене</span></div>
    <div class="line">${ic(set, 'open')}<span>Лежат у нанятых врачей</span> ${ic(set, 'up')}${ic(set, 'down')}${ic(set, 'back')}</div>
    <div class="grid">${grid}</div>
  </section>`;
}

const font = pathToFileURL(join(root, 'assets/fonts/IBMPlexSans[wdth,wght].ttf')).href;
const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><style>
@font-face { font-family: "IBM Plex Sans"; src: url("${font}") format("truetype"); font-weight: 100 700; }
:root { --panel: rgba(22, 30, 34, 0.94); --panel-2: rgba(36, 48, 54, 0.92); --line: rgba(255,255,255,.14); --text: #e9eef0; --muted: #9fb0b6; --accent: #2fb5c9; --red: #d8392b; --yellow: #e7b416; --green: #4caf6e; }
html, body { margin: 0; background: #2a3236; color: var(--text); font: 13px/1.35 "IBM Plex Sans", sans-serif; }
main { display: grid; grid-template-columns: repeat(4, 330px); gap: 12px; padding: 12px; }
.panel { background: var(--panel); border: 1px solid var(--line); border-radius: 6px; padding: 10px 12px; }
h2 { margin: 0; font-size: 15px; } .muted { color: var(--muted); margin: 2px 0 8px; font-size: 12px; }
.row { display: flex; gap: 6px; flex-wrap: wrap; margin: 0 0 8px; }
button { font: inherit; color: var(--text); background: var(--panel-2); border: 1px solid var(--line); border-radius: 4px; padding: 3px 9px; display: inline-flex; align-items: center; gap: 6px; }
button.on { background: var(--accent); color: #0b1a1e; border-color: var(--accent); }
.line { display: flex; align-items: center; gap: 6px; margin: 4px 0; } .line svg { flex: none; }
.ok { color: #8fe3b4; } .bad { color: #ff9b86; } .warn { color: var(--yellow); } .todo { color: var(--muted); }
.ok span, .bad span, .warn span, .todo span { color: var(--text); }
.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px 6px; margin-top: 10px; border-top: 1px solid var(--line); padding-top: 10px; }
.cell { display: flex; flex-direction: column; align-items: center; gap: 3px; text-align: center; }
.cell small { color: var(--muted); font-size: 11px; line-height: 1.2; } .cell em { font-style: normal; color: var(--text); }
</style></head><body><main>${SETS.map(column).join('')}</main></body></html>`;

mkdirSync(out, { recursive: true });
// страница — рядом с файлами наборов (не в git): в ней значки наборов целиком; в отчёт — только снимок
const page = join(files, 'sheet.html');
writeFileSync(page, html);
const browser = await chromium.launch();
const p = await browser.newPage({ viewport: { width: 1380, height: 400 }, deviceScaleFactor: 1 });
await p.goto(pathToFileURL(page).href);
await p.evaluate(() => document.fonts.ready);
await p.screenshot({ path: join(out, 'sheet.png'), fullPage: true });
await browser.close();
console.log(`${join(out, 'sheet.png')}`);
