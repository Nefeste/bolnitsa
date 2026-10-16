// Авто-бенч в Chromium без окна (Playwright): каждая реализация — в своей чистой вкладке.
//   node tools/bench.mjs [--secs 20] [--capped] [--headed] [--out results/имя.json]
// --capped — с вертикальной синхронизацией (не больше частоты экрана); по умолчанию без неё,
// чтобы видеть запас. Браузер: CHROMIUM_PATH или первый найденный в PLAYWRIGHT_BROWSERS_PATH.
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

const secs = Number(arg('secs', 20));
const warm = Number(arg('warm', 2));
const counts = arg('counts', '50,100,200,400');
const kinds = arg('renderers', 'pixi,ck').split(',');
const capped = flag('capped');
// --query "hide=static" — добавить к адресу страницы (отладка: разложить кадр по слоям)
const extra = arg('query', '');
const port = 8091;
const server = await serve(port);
const args = ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'];
if (!capped) args.push('--disable-frame-rate-limit', '--disable-gpu-vsync');
const executablePath = findChromium();
const browser = await chromium.launch({ executablePath, headless: !flag('headed'), args });
const version = browser.version();
const out = { browser: version, executablePath, args, capped, query: extra, runs: [], pages: [] };
for (const k of kinds) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', m => {
    const t = m.text();
    if (t.startsWith('[бенч]') || m.type() === 'error') console.log(`  ${k}: ${t.slice(0, 300)}`);
  });
  page.on('pageerror', e => console.log(`  ${k}: pageerror ${e.message}`));
  const url = `http://127.0.0.1:${port}/index.html?r=${k}&bench=1&secs=${secs}&warm=${warm}&counts=${counts}${extra ? `&${extra}` : ''}`;
  console.log(`→ ${url}`);
  await page.goto(url);
  const total = (secs + warm) * counts.split(',').length * 1000 + 60000;
  await page.waitForFunction(() => window.__benchResult || window.__benchError, null, { timeout: total, polling: 1000 });
  const err = await page.evaluate(() => window.__benchError);
  if (err) throw new Error(err);
  const res = await page.evaluate(() => window.__benchResult);
  out.pages.push({ renderer: k, startup: res.startup, viewport: res.viewport, cores: res.cores, chromium: res.chromium });
  out.runs.push(...res.runs);
  await page.close();
}
await browser.close();
server.close();
mkdirSync('results', { recursive: true });
const file = arg('out', `results/bench-headless-${capped ? 'vsync' : 'uncapped'}.json`);
writeFileSync(file, `${JSON.stringify(out, null, 2)}\n`);
console.log(`\nChromium ${version}${capped ? ', vsync' : ', без vsync'}`);
console.log('реализация  людей  к/с    кадр ср/p95, мс    люди, мс   рисование CPU ср/p95, мс');
for (const r of out.runs) {
  console.log(`${r.renderer.padEnd(10)} ${String(r.people).padStart(5)} ${String(r.fps).padStart(6)}   ${`${r.frameMs.mean} / ${r.frameMs.p95}`.padEnd(18)} ${String(r.simMs.mean).padEnd(9)}  ${r.drawCpuMs.mean} / ${r.drawCpuMs.p95}`);
}
console.log(`→ ${file}`);
