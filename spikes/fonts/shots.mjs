// Три сцены игры в каждой гарнитуре-кандидате: шрифт подменяется стилем страницы (@font-face из files/), игра не
// меняется. Одна сессия: сцена на паузе — снимок в каждой гарнитуре, затем следующая сцена. Перед запуском — `npm run
// build` в корне и `fetch.py`. Запуск из корня: node spikes/fonts/shots.mjs → spikes/fonts/shots/*.png
import { readFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { findChromium } from '../../tools/app/e2e-lib.mjs';
import { serve } from '../../tools/app/serve.mjs';

const here = new URL('.', import.meta.url).pathname;
const out = `${here}shots`;
mkdirSync(out, { recursive: true });
const FONTS = [
  { key: 'plex', file: 'ibmplexsans/IBMPlexSans[wdth,wght].ttf', italic: 'ibmplexsans/IBMPlexSans-Italic[wdth,wght].ttf', weight: '100 700' },
  { key: 'golos', file: 'golostext/GolosText[wght].ttf', weight: '400 900' },
  { key: 'manrope', file: 'manrope/Manrope[wght].ttf', weight: '200 800' },
  { key: 'inter', file: 'inter/Inter[opsz,wght].ttf', italic: 'inter/Inter-Italic[opsz,wght].ttf', weight: '100 900' },
];
const port = Number(process.env.PORT ?? 8199);
const server = await serve(port);
const browser = await chromium.launch({ executablePath: findChromium(), args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
// шрифты — с того же адреса, что страница: CSP игры пускает только свои файлы
await page.route('**/__fonts/**', route => {
  const name = decodeURIComponent(new URL(route.request().url()).pathname.replace('/__fonts/', ''));
  route.fulfill({ body: readFileSync(`${here}files/${name}`), contentType: 'font/ttf' });
});
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const url = file => `/__fonts/${encodeURIComponent(file)}`;
const use = async f => {
  await page.evaluate(({ key, upright, italic, weight }) => {
    let el = document.getElementById('cand-font');
    if (!el) {
      el = document.createElement('style');
      el.id = 'cand-font';
      document.head.appendChild(el);
    }
    const face = (src, style) => `@font-face { font-family: "cand-${key}"; src: url("${src}") format("truetype"); font-weight: ${weight}; font-style: ${style}; font-display: block; }`;
    el.textContent = `${face(upright, 'normal')}\n${italic ? face(italic, 'italic') : ''}
html, body, button, input, select, textarea { font-family: "cand-${key}", system-ui, sans-serif !important; }`;
  }, { key: f.key, upright: url(f.file), italic: f.italic ? url(f.italic) : '', weight: f.weight });
  await page.evaluate(key => Promise.all([document.fonts.load(`13px "cand-${key}"`), document.fonts.load(`italic 13px "cand-${key}"`)]).then(() => document.fonts.ready), f.key);
  await page.waitForTimeout(400);
};
const shoot = async scene => {
  for (const f of FONTS) {
    await use(f);
    await page.screenshot({ path: `${out}/${scene}-${f.key}.png` });
    console.log(`${scene}-${f.key}.png`);
  }
};
try {
  // готовая больница, тот же поток, что в сценарии режима врача; 09:30 — на паузе
  await page.goto(`http://127.0.0.1:${port}/index.html?q=medium&lang=ru&hospital=preset&seed=11&flow=6,1&start=9.5`);
  await page.waitForFunction(() => window.__started === true, null, { timeout: 240000 });
  await page.evaluate(() => window.__game.setSpeed(0));
  // сцена 1: «Пациенты», выбранный больной — верхняя полоса и список
  await page.click('#tab-patients');
  await page.waitForSelector('.patrow');
  await page.click('.patrow');
  await page.waitForTimeout(1500);
  await shoot('1-patients');
  // сцена 2: карта принятого и отпущенного больного — решение, итог, ход приёма; курсив — жалобы и диагноз
  await page.click('#pf-seen');
  await page.waitForSelector('#seen-list .patrow');
  const id = await page.$eval('#seen-list .patrow', b => b.dataset.id);
  await page.click(`#pat-open-${id}`);
  await page.waitForSelector('#dcard');
  await page.waitForTimeout(800);
  await shoot('2-card');
  await page.keyboard.press('Escape');
  await page.click('#pf-present');
  // сцена 3: планёрка — «До утра»; остановки на событиях автопаузы — дальше
  await page.click('#speed-ff');
  const t0 = Date.now();
  for (;;) {
    const h = await page.evaluate(() => ({ open: window.__game.store.get().economy?.open ?? false, ff: window.__game.ff, speed: window.__game.speed, card: window.__game.doctor.open }));
    if (h.open || Date.now() - t0 > 400000) break;
    if (h.card) await page.keyboard.press('Escape');
    else if (!h.ff && h.speed === 0) await page.click('#speed-ff');
    await page.waitForTimeout(250);
  }
  await page.waitForSelector('#meeting');
  await page.waitForTimeout(800);
  await shoot('3-meeting');
  console.log(`ошибок на странице: ${errors.length}`);
} finally {
  await browser.close();
  server.close();
}
