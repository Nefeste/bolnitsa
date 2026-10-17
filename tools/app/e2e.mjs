// Сценарий в браузере (spec docs/specs/2026-10-shell-3d.md, «Тесты»): Chromium без окна (Playwright, браузер из
// PLAYWRIGHT_BROWSERS_PATH) открывает dist/ — страница грузится, больница видна, люди есть, клик по человеку открывает
// карточку, скорость меняется клавишами, стены переключаются, ошибок в консоли нет. Снимок — tools/app/out/e2e.png.
//   node tools/app/e2e.mjs [--q low|medium|high] [--headed]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { findChromium } from './e2e-lib.mjs';
import { serve } from './serve.mjs';

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};

const out = new URL('./out/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const port = 8093;
const server = await serve(port);
const browser = await chromium.launch({
  executablePath: findChromium(),
  headless: !process.argv.includes('--headed'),
  args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
const requests = [];
page.on('console', m => {
  if (m.type() === 'error') errors.push(m.text());
  if (m.type() === 'error' || m.type() === 'warning') console.log(`  ${m.type()}: ${m.text().slice(0, 300)}`);
});
page.on('pageerror', e => errors.push(e.message));
page.on('request', r => {
  const u = r.url();
  if (!u.startsWith(`http://127.0.0.1:${port}/`) && !u.startsWith('data:') && !u.startsWith('blob:')) requests.push(u);
});
const fail = msg => {
  console.error(`✗ ${msg}`);
  process.exitCode = 1;
};
const ok = msg => console.log(`✓ ${msg}`);
try {
  await page.goto(`http://127.0.0.1:${port}/index.html?q=${arg('q', 'low')}&lang=ru`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  ok('страница загрузилась, первый кадр нарисован');
  // дать потоку расчёта и людям пожить: ×4 на несколько секунд
  await page.keyboard.press('Digit3');
  await page.waitForTimeout(6000);
  const s = await page.evaluate(() => {
    const g = window.__game;
    return {
      rooms: g.layout.plan.rooms.length,
      things: g.layout.things.length,
      people: g.crowd.walkers.size,
      staff: g.staff.length,
      calls: g.stage.calls,
      tris: g.stage.tris,
      t: g.t,
      speed: g.speed,
      clock: document.getElementById('clock')?.textContent ?? '',
    };
  });
  console.log(`  ${JSON.stringify(s)}`);
  if (s.rooms > 10 && s.things > 100) ok(`больница движка: помещений — ${s.rooms}, предметов — ${s.things}`);
  else fail('больница не построилась');
  if (s.people > s.staff) ok(`люди: ${s.people} (штат ${s.staff})`);
  else fail('пациентов нет');
  if (s.calls > 10 && s.tris > 10000) ok(`кадр: ${s.calls} вызовов, ${s.tris} треугольников`);
  else fail('кадр пустой');
  if (s.speed === 4 && s.t > 8 * 3600) ok(`часы идут: ${s.clock}, ×${s.speed}`);
  else fail('часы не идут');
  // больница видна: в середине кадра не один цвет фона
  const shot = await page.screenshot({ path: join(out, 'e2e.png') });
  ok(`снимок: ${join(out, 'e2e.png')} (${Math.round(shot.length / 1024)} КБ)`);
  const varied = await page.evaluate(async () => {
    // кадр WebGL читается сразу после отрисовки: снимок самой игры, уменьшенный
    const g = window.__game;
    const url = g.stage.shot(320, 180, g.crowd, g.pop.paint, k => g.pop.triageOf(k), 12);
    const img = new Image();
    img.src = url;
    await img.decode();
    const t = document.createElement('canvas');
    t.width = 64;
    t.height = 36;
    const c2 = t.getContext('2d');
    c2.drawImage(img, 0, 0, 64, 36);
    const d = c2.getImageData(0, 0, 64, 36).data;
    const colors = new Set();
    for (let i = 0; i < d.length; i += 4) colors.add(`${d[i] >> 4},${d[i + 1] >> 4},${d[i + 2] >> 4}`);
    return colors.size;
  });
  if (varied > 40) ok(`больница видна: ${varied} оттенков в кадре`);
  else fail(`кадр почти однотонный: ${varied} оттенков`);
  // пауза — пробелом
  await page.keyboard.press('Space');
  const paused = await page.evaluate(() => window.__game.speed);
  if (paused === 0) ok('пробел — пауза');
  else fail('пробел не ставит паузу');
  await page.keyboard.press('Digit1');
  // клик по человеку — карточка
  const target = await page.evaluate(() => {
    const g = window.__game;
    for (const w of g.crowd.walkers.values()) {
      if (w.staff) continue;
      const p = g.stage.screenOf(w);
      if (p && p.x > 200 && p.x < 1080 && p.y > 150 && p.y < 600) return { ...p, key: w.key };
    }
    for (const w of g.crowd.walkers.values()) {
      const p = g.stage.screenOf(w);
      if (p && p.x > 200 && p.x < 1080 && p.y > 150 && p.y < 600) return { ...p, key: w.key };
    }
    return null;
  });
  if (target) {
    await page.mouse.click(target.x, target.y);
    await page.waitForTimeout(400);
    const title = await page.evaluate(() => document.getElementById('card-title')?.textContent ?? '');
    if (title) ok(`клик по человеку — карточка: «${title}»`);
    else fail('клик по человеку не открыл карточку');
  } else fail('не нашёл человека в кадре');
  // стены вниз и обратно
  await page.click('#walls-down');
  const mode = await page.evaluate(() => window.__game.stage.walls.uniforms.uMode.value);
  if (mode === 2) ok('стены — вниз');
  else fail('стены не переключились');
  await page.click('#walls-cut');
  if (errors.length) fail(`ошибки в консоли: ${errors.length}\n    ${errors.slice(0, 5).join('\n    ')}`);
  else ok('ошибок в консоли нет');
  if (requests.length) fail(`запросы наружу: ${requests.join(', ')}`);
  else ok('запросов наружу нет');
} catch (e) {
  fail(String(e?.stack ?? e));
} finally {
  await browser.close();
  server.close();
}
