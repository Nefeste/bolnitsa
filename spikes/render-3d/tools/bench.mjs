// из spikes/map-render: tools/bench.mjs (переделан под одну реализацию, пресеты и снимки)
// Авто-бенч в Chromium без окна (Playwright): пресеты качества × числа людей, потом снимки
// 1920×1080 из четырёх точек. Итог — JSON и PNG в results/.
//   node tools/bench.mjs [--secs 15] [--warm 3] [--capped] [--counts 50,200] [--qualities low,high]
//                        [--out results/имя] [--shots-only] [--query "walls=down"] [--size 1280x720]
// --capped — с вертикальной синхронизацией; без него — без неё (видно запас).
// --shots-only — без замера: только снимки (адрес ?shot=1), для проверки вида.
// Браузер: CHROMIUM_PATH или первый найденный в PLAYWRIGHT_BROWSERS_PATH.
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { serve } from './serve.mjs';

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const flag = k => process.argv.includes(`--${k}`);

function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers';
  for (const d of readdirSync(base).filter(d => /^chromium-\d+$/.test(d)).sort().reverse()) {
    const p = join(base, d, 'chrome-linux', 'chrome');
    if (existsSync(p)) return p;
  }
  throw new Error('Chromium не найден: задайте CHROMIUM_PATH');
}

const secs = Number(arg('secs', 15));
const warm = Number(arg('warm', 3));
const counts = arg('counts', '50,100,200,400');
const qualities = arg('qualities', 'low,medium,high');
const capped = flag('capped');
const shotsOnly = flag('shots-only');
const extra = arg('query', '');
const [vw, vh] = arg('size', '1280x720').split('x').map(Number);
const port = 8092;
const server = await serve(port);
const args = ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'];
if (!capped) args.push('--disable-frame-rate-limit', '--disable-gpu-vsync');
const executablePath = findChromium();
const browser = await chromium.launch({ executablePath, headless: !flag('headed'), args });
const version = browser.version();
const page = await browser.newPage({ viewport: { width: vw, height: vh } });
const errors = [];
page.on('console', m => {
  const t = m.text();
  if (t.startsWith('[бенч]') || m.type() === 'error' || m.type() === 'warning') console.log(`  ${m.type()}: ${t.slice(0, 400)}`);
  if (m.type() === 'error') errors.push(t);
});
page.on('pageerror', e => {
  console.log(`  pageerror ${e.message}`);
  errors.push(e.message);
});
const mode = shotsOnly ? 'shot=1' : `bench=1&secs=${secs}&warm=${warm}&counts=${counts}&qualities=${qualities}`;
const url = `http://127.0.0.1:${port}/index.html?${mode}${extra ? `&${extra}` : ''}`;
console.log(`→ ${url}`);
const tStart = Date.now();
await page.goto(url);
const total = shotsOnly ? 180000 : (secs + warm) * counts.split(',').length * qualities.split(',').length * 1000 + 600000;
// раз в 20 с — строка состояния страницы (видно, на чём бенч, если он завис)
const ticker = setInterval(() => {
  page
    .evaluate(() => document.getElementById('status')?.textContent ?? '')
    .then(t => t && console.log(`  … ${t}`))
    .catch(() => {});
}, 20000);
if (shotsOnly) await page.waitForFunction(() => window.__shotsDone || window.__benchError, null, { timeout: total, polling: 500 });
else await page.waitForFunction(() => window.__benchResult || window.__benchError, null, { timeout: total, polling: 1000 });
clearInterval(ticker);
const err = await page.evaluate(() => window.__benchError);
if (err) throw new Error(err);
const shots = await page.evaluate(() => window.__shots ?? []);
const res = shotsOnly ? null : await page.evaluate(() => window.__benchResult);
await browser.close();
server.close();
mkdirSync('results', { recursive: true });
const base = arg('out', `results/bench-headless-${capped ? 'vsync' : 'uncapped'}`);
for (const s of shots) {
  const name = `${base}-${s.name.replace(/^(bench|shot)-[^-]*(-\d{4}-\d\d-\d\dT[\d-]+)?-/, '')}`;
  writeFileSync(name, Buffer.from(s.dataUrl.split(',')[1], 'base64'));
  console.log(`снимок → ${name}`);
}
if (res) {
  res.headless = { browser: version, args, capped, query: extra, wallMs: Date.now() - tStart, consoleErrors: errors };
  writeFileSync(`${base}.json`, `${JSON.stringify(res, null, 2)}\n`);
  console.log(`\nChromium ${version}${capped ? ', vsync' : ', без vsync'}`);
  console.log('качество  людей  к/с    кадр ср/p95, мс    CPU ср/p95, мс   вызовов  треуг.');
  for (const r of res.runs) {
    console.log(`${r.quality.padEnd(8)} ${String(r.people).padStart(5)} ${String(r.fps).padStart(6)}   ${`${r.frameMs.mean} / ${r.frameMs.p95}`.padEnd(18)} ${`${r.cpuMs.mean} / ${r.cpuMs.p95}`.padEnd(16)} ${String(r.drawCalls).padStart(6)}  ${r.triangles}`);
  }
  console.log(`→ ${base}.json`);
}
console.log(`ошибок в консоли: ${errors.length}`);
