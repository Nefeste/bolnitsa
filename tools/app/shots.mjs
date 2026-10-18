// Снимки игры для отчётов (docs/reports/2026-10-aaa-audit.md, «до» и «после»): Chromium без окна (Playwright, браузер из
// PLAYWRIGHT_BROWSERS_PATH, программный WebGL) открывает dist/ и снимает одни и те же места: начало игры, готовая
// больница днём — общий и крупный план, ночь, стройка, карта пациента, планёрка, карточка со слоем «Очереди и загрузка».
// JPEG не больше 200 КБ: качество снижается, пока не уложится. Кадров в секунду без видеокарты не меряет — только вид.
//   node tools/app/shots.mjs [--out docs/reports/2026-10-aaa] [--prefix before] [--q high] [--only 1,3] [--port 8094]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { findChromium } from './e2e-lib.mjs';
import { serve } from './serve.mjs';

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const out = arg('out', new URL('./out/', import.meta.url).pathname);
const prefix = arg('prefix', 'shot');
const q = arg('q', 'high');
const only = arg('only', '').split(',').filter(Boolean);
const port = Number(arg('port', '8094'));
/** Предел размера снимка, КБ (docs/reports: до 200 КБ каждый). */
const LIMIT = 200;
mkdirSync(out, { recursive: true });

const server = await serve(port);
const browser = await chromium.launch({ executablePath: findChromium(), headless: true, args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => {
  if (m.type() === 'error') errors.push(m.text());
});

const url = params => `http://127.0.0.1:${port}/index.html?q=${q}&lang=ru${params ? `&${params}` : ''}`;
const frames = (n = 4) =>
  page.evaluate(
    k =>
      new Promise(r => {
        let i = 0;
        const f = () => (++i >= k ? r() : requestAnimationFrame(f));
        requestAnimationFrame(f);
      }),
    n,
  );
const ready = flag => page.waitForFunction(f => window[f] === true, flag, { timeout: 300000 });
const look = async (x, z, half) => {
  await page.evaluate(
    ([cx, cz, h]) => {
      const c = window.__game.stage.cam;
      c.target.set(cx, 0, cz);
      c.half = h;
    },
    [x, z, half],
  );
  await frames(4);
};
/** Середина первой зоны ожидания. */
const hall = () =>
  page.evaluate(() => {
    const r = window.__game.plan.rooms.find(x => x.type === 'room.waiting');
    return r ? [r.x + r.w / 2, r.y + r.h / 2] : [window.__game.layout.w / 2, window.__game.layout.h / 2];
  });
/** JPEG не больше LIMIT КБ. */
const shot = async name => {
  await frames(3);
  for (const quality of [78, 68, 58, 48, 40]) {
    const buf = await page.screenshot({ path: join(out, `${prefix}-${name}.jpg`), type: 'jpeg', quality });
    const kb = Math.round(buf.length / 1024);
    if (kb <= LIMIT) {
      console.log(`✓ ${prefix}-${name}.jpg — ${kb} КБ (качество ${quality}), ${await page.evaluate(() => document.getElementById('clock')?.textContent ?? '')}`);
      return;
    }
  }
  console.log(`✗ ${prefix}-${name}.jpg больше ${LIMIT} КБ`);
};
const run = n => !only.length || only.includes(String(n));

try {
  // 1. начало игры: первое, что видит игрок
  if (run(1)) {
    await page.goto(url(''));
    await page.waitForSelector('#start', { timeout: 60000 });
    await page.waitForTimeout(300);
    await shot('1-start');
  }
  // 2–3. готовая больница днём: общий план и зал ожидания крупно
  if (run(2) || run(3)) {
    await page.goto(url('hospital=preset&flow=6,1&start=11'));
    await ready('__started');
    await page.evaluate(() => window.__game.actions.doctor({ kind: 'fold', folded: true }));
    await page.evaluate(() => window.__game.stage.cam.overview());
    await frames(4);
    if (run(2)) await shot('2-day-overview');
    const [hx, hz] = await hall();
    await look(hx + 2, hz + 1, 9);
    if (run(3)) await shot('3-day-close');
  }
  // 4. ночь: тот же зал
  if (run(4)) {
    await page.goto(url('hospital=preset&flow=6,1&start=21.5'));
    await ready('__started');
    await page.evaluate(() => window.__game.actions.doctor({ kind: 'fold', folded: true }));
    const [hx, hz] = await hall();
    await look(hx + 2, hz + 1, 9);
    await shot('4-night-close');
    await page.evaluate(() => window.__game.stage.cam.overview());
    await frames(4);
    await shot('4-night-overview');
  }
  // 5. стройка: пустое здание, помещение протяжкой — призрак с ценой
  if (run(5)) {
    await page.goto(url('hospital=empty'));
    await ready('__ready');
    await page.keyboard.press('KeyB');
    await page.click('#tool-room');
    await page.click('#rt-reception');
    await look(10, 10, 9);
    const at = (x, y) => page.evaluate(([cx, cy]) => window.__game.stage.screenOfCell(cx, cy), [x, y]);
    const a = await at(6, 6);
    const b = await at(11, 12);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 6 });
    await frames(3);
    await shot('5-build-ghost');
    await page.mouse.up();
    await page.waitForFunction(() => window.__game.hospital.site.rooms.length === 1, null, { timeout: 30000 });
    await page.click('#card-furnish').catch(() => {});
    await page.waitForTimeout(600);
    await frames(3);
    await shot('5-build-room');
  }
  // 6. карта пациента: зерно 11 — терапевт просит посмотреть к 09:08
  if (run(6)) {
    await page.goto(url('hospital=preset&flow=6,1&seed=11&start=9.25'));
    await ready('__started');
    await page.waitForFunction(() => (window.__game.store.get().doctor?.state?.asks.length ?? 0) > 0, null, { timeout: 120000 });
    const id = await page.evaluate(() => window.__game.store.get().doctor.state.asks[0].id);
    await page.click(`#ask-look-${id}`);
    await page.waitForSelector('#dcard', { timeout: 30000 });
    await page.waitForTimeout(400);
    await shot('6-doctor-card');
  }
  // 7. планёрка в 08:00 вторых суток
  if (run(7)) {
    await page.goto(url('hospital=preset&flow=6,1&start=32'));
    await ready('__started');
    await page.waitForFunction(() => window.__game.store.get().economy?.open === true, null, { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(400);
    await shot('7-meeting');
  }
  // 8. карточка пациента с путём, вкладка «Пациенты», слой «Очереди и загрузка»
  if (run(8)) {
    await page.goto(url('hospital=preset&flow=6,1&start=13'));
    await ready('__started');
    await page.evaluate(() => window.__game.actions.doctor({ kind: 'fold', folded: true }));
    await page.keyboard.press('KeyL');
    await page.keyboard.press('Tab');
    await page.waitForSelector('#patients', { timeout: 10000 });
    await page.click('#pf-w-wait').catch(() => {});
    await page.waitForTimeout(300);
    await page.click('#patients .patrow').catch(() => {});
    await page.waitForFunction(() => !window.__game.stage.cam.flying, null, { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(500);
    await shot('8-card-layers');
  }
  if (errors.length) console.log(`ошибки в консоли: ${errors.length}\n  ${errors.slice(0, 5).join('\n  ')}`);
} catch (e) {
  console.error(`✗ ${e?.stack ?? e}`);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
