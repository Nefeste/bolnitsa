// Снимки пробы: Chromium без окна (Playwright, браузер — как у сценария игры: CHROMIUM_PATH или PLAYWRIGHT_BROWSERS_PATH)
// открывает каждый вид, ждёт готовности, снимает JPEG в results/ и пишет числа в results/stats.json. Ошибки в консоли и
// запросы мимо локального сервера — провал.
//
//   node spikes/realistic-people/tools/shots.mjs [--only map,lod,...] [--port 8095] [--quality 82]
import { chromium } from 'playwright-core';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { findChromium } from '../../../tools/app/e2e-lib.mjs';
import { serve } from './serve.mjs';

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const results = new URL('../results/', import.meta.url).pathname;
const port = Number(arg('port', '8095'));
const quality = Number(arg('quality', '82'));
const only = arg('only', '')?.split(',').filter(Boolean);

/** Вид → файл снимка и размер окна. Карточки: три по 360 точек и поля. */
const VIEWS = [
  { view: 'map', file: '1-map.jpg', w: 1600, h: 900 },
  { view: 'lod', file: '2-lod.jpg', w: 1600, h: 900 },
  { view: 'portrait', file: '3-portrait.jpg', w: 1170, h: 540 },
  { view: 'expression', file: '4-expression.jpg', w: 1170, h: 540 },
  { view: 'makehuman', file: '5-makehuman.jpg', w: 1170, h: 540 },
  { view: 'sliders', file: '6-sliders.jpg', w: 760, h: 850 },
  // отладка: формы лица по одной (только по --only shapes, снимок — в dist/, не в results/)
  { view: 'shapes', file: '../dist/shapes.jpg', w: 1500, h: 760, debug: true, query: arg('query', '') },
];

/** Ползунки для снимка 6: имя → значение (пример «своего» лица: мужчина за пятьдесят, широкое лицо). */
const SLIDER_SHOT = { gender: 0.85, age: 52, weight: 0.35, noseWidth: 0.6, jaw: 0.55, chin: 0.4, cheekbones: 0.5, eyes: -0.3, lips: -0.2, faceFat: 0.3 };

const server = await serve(port);
const browser = await chromium.launch({
  executablePath: findChromium(),
  headless: true,
  args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
});
const statsPath = join(results, 'stats.json');
const all = existsSync(statsPath) ? JSON.parse(readFileSync(statsPath, 'utf8')) : {};
let failed = false;
for (const v of VIEWS) {
  if ((only?.length && !only.includes(v.view)) || (v.debug && !only?.includes(v.view))) continue;
  const page = await browser.newPage({ viewport: { width: v.w, height: v.h } });
  const errors = [];
  const outside = [];
  page.on('console', m => {
    if (m.type() === 'error') errors.push(m.text());
    if (m.type() === 'error' || m.type() === 'warning') console.log(`  ${m.type()}: ${m.text().slice(0, 200)}`);
  });
  page.on('pageerror', e => errors.push(e.message));
  page.on('response', r => r.status() >= 400 && console.log(`  ${r.status()} ${r.url()}`));
  page.on('request', r => {
    const u = r.url();
    if (!u.startsWith(`http://127.0.0.1:${port}/`) && !u.startsWith('data:') && !u.startsWith('blob:')) outside.push(u);
  });
  const t0 = Date.now();
  await page.goto(`http://127.0.0.1:${port}/?view=${v.view}${v.query ? `&${v.query}` : ''}`);
  await page.waitForFunction(() => window.__probe?.ready, null, { timeout: 15 * 60_000, polling: 500 });
  const err = await page.evaluate(() => window.__probe.error);
  if (err) {
    console.error(`✗ ${v.view}: ${err}`);
    failed = true;
    await page.close();
    continue;
  }
  if (v.view === 'sliders') {
    for (const [name, value] of Object.entries(SLIDER_SHOT)) await page.locator(`input[name=${name}]`).fill(String(value));
    await page.evaluate(() => document.activeElement?.blur());
    await page.waitForFunction(() => window.__probe.stats.idle === true, null, { timeout: 5 * 60_000, polling: 250 });
  }
  const stats = await page.evaluate(() => window.__probe.stats);
  stats.pageMs = Date.now() - t0;
  stats.consoleErrors = errors;
  stats.outsideRequests = outside;
  if (!v.debug) all[v.view] = stats;
  await page.screenshot({ path: join(results, v.file), type: 'jpeg', quality });
  console.log(`${errors.length || outside.length ? '✗' : '✓'} ${v.view} → results/${v.file} (${((Date.now() - t0) / 1000).toFixed(1)} с)`);
  if (errors.length || outside.length) failed = true;
  await page.close();
}
writeFileSync(statsPath, `${JSON.stringify(all, null, 1)}\n`);
await browser.close();
server.close();
process.exitCode = failed ? 1 : 0;
