// Сценарий в браузере, часть 34 — подписи помещений на среднем плане (spec docs/specs/2026-10-aaa-polish.md, «Подписи помещений
// на среднем плане», «Проверки»). Готовая больница: у зала ожидания на среднем плане — названия помещений одним холстом,
// а не элементами DOM, ни одна не налезает на другую и на значок состояния; вплотную — их нет; на общем плане (Home) — есть;
// в стройке — только подписи стройки; «Подписи помещений» в «Настройках» выключает их и запоминается после перезагрузки;
// крупный текст — таблички крупнее. Снимок — `e2e-tags-1-medium.jpg`.
import { join } from 'node:path';

/** @param {{ page: import('playwright-core').Page, port: number, out: string, ok: (m: string) => void, fail: (m: string) => void, q: string, shots: string }} x */
export async function tagsPart({ page, port, out, ok, fail, q, shots }) {
  const shot = async name => {
    if (shots) {
      await page.evaluate(x => window.__game.showQuality(x), shots);
      await page.waitForTimeout(400);
    }
    const buf = await page.screenshot({ path: join(out, name), type: 'jpeg', quality: 72 });
    if (shots) await page.evaluate(x => window.__game.showQuality(x), q);
    return Math.round(buf.length / 1024);
  };
  /** Несколько кадров: холст рисуется в кадре игры. */
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
  /** Камера — на середину зала ожидания, `half` — половина высоты кадра, м. */
  const look = async half => {
    await page.evaluate(h => {
      const g = window.__game;
      const r = g.plan.rooms.find(x => x.type === 'room.waiting');
      g.stage.cam.target.set(r.x + r.w / 2, 0, r.y + r.h / 2);
      g.stage.cam.half = h;
    }, half);
    await frames(4);
  };
  /** Что нарисовано: подписи, их прозрачность; значки состояния; подписи стройки в DOM. */
  const tags = () =>
    page.evaluate(() => {
      const g = window.__game;
      const over = (a, b) => Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.y - b.y) * 2 < a.h + b.h;
      const shown = g.tags.shown;
      let clash = 0;
      for (let i = 0; i < shown.length; i++) for (let j = i + 1; j < shown.length; j++) if (over(shown[i].box, shown[j].box)) clash++;
      const chipClash = shown.filter(t => g.chips.boxes.some(c => over(t.box, c))).length;
      const canvas = document.querySelector('canvas.roomtags');
      return {
        names: shown.map(t => t.text), alpha: g.tags.alpha, clash, chipClash, h: shown[0]?.box.h ?? 0,
        canvas: !!canvas && canvas.width > 0, labels: getComputedStyle(document.querySelector('.labels')).display, dom: document.querySelectorAll('.roomtag').length,
      };
    });

  await page.goto(`http://127.0.0.1:${port}/index.html?q=${q}&lang=ru&hospital=preset&flow=6,1&start=11`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  await page.evaluate(() => window.__game.actions.doctor({ kind: 'fold', folded: true }));

  // ---------------------------------------------------------------- средний план: подписи у зала ожидания
  await look(14);
  const mid = await tags();
  if (mid.canvas && mid.alpha === 1 && mid.names.includes('Зона ожидания') && mid.names.length >= 5 && mid.clash === 0 && mid.chipClash === 0 && mid.labels === 'none' && mid.dom === 0) {
    ok(`средний план: ${mid.names.length} подписей одним холстом — ${mid.names.slice(0, 8).join(', ')}…; не налезают ни друг на друга, ни на значки состояния; DOM подписей нет (снимок ${await shot('e2e-tags-1-medium.jpg')} КБ)`);
  } else fail(`подписи на среднем плане: ${JSON.stringify(mid)}`);

  // ---------------------------------------------------------------- вплотную — нет, на общем плане — есть
  await look(4);
  const near = await tags();
  if (near.alpha === 0 && near.names.length === 0) ok('вплотную (4 м) подписей нет');
  else fail(`вплотную: ${JSON.stringify(near)}`);
  await page.keyboard.press('Home');
  await frames(4);
  const far = await tags();
  if (far.alpha === 1 && far.names.length > 0 && far.clash === 0) ok(`общий план (Home): ${far.names.length} подписей больших помещений — ${far.names.slice(0, 6).join(', ')}…`);
  else fail(`общий план: ${JSON.stringify(far)}`);

  // ---------------------------------------------------------------- в стройке — подписи стройки, этих нет
  await look(14);
  await page.keyboard.press('KeyB');
  await page.waitForSelector('#tool-ready', { timeout: 10000 });
  await frames(4);
  const build = await tags();
  if (build.names.length === 0 && build.labels === 'block') ok('в стройке — подписи стройки с состоянием, подписей среднего плана нет');
  else fail(`в стройке: ${JSON.stringify(build)}`);
  await page.keyboard.press('KeyB');
  await frames(4);

  // ---------------------------------------------------------------- «Настройки»: выключить, перезагрузить, включить
  const settings = async () => {
    await page.click('#game-menu-open');
    await page.click('#settings-open');
    await page.waitForSelector('#settings #names', { timeout: 5000 });
  };
  await settings();
  await page.click('#names');
  await frames(4);
  const off = await tags();
  if (off.names.length === 0 && off.alpha === 0) ok('«Подписи помещений» сняты в «Настройках» — подписей нет сразу');
  else fail(`подписи выключены: ${JSON.stringify(off)}`);
  await page.goto(`http://127.0.0.1:${port}/index.html?q=${q}&lang=ru&hospital=preset&flow=6,1&start=11`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  await page.evaluate(() => window.__game.actions.doctor({ kind: 'fold', folded: true }));
  await look(14);
  const kept = await tags();
  await settings();
  const box = await page.isChecked('#names');
  if (kept.names.length === 0 && !box) ok('после перезагрузки — по-прежнему без подписей, галочка снята');
  else fail(`после перезагрузки: ${JSON.stringify({ kept, box })}`);
  await page.click('#names');
  // крупный текст — таблички крупнее; потом снова обычный
  await page.click('#text-2');
  await page.keyboard.press('Escape');
  await look(14);
  const big = await tags();
  await settings();
  await page.click('#text-0');
  await page.keyboard.press('Escape');
  await look(14);
  const normal = await tags();
  if (big.names.length > 0 && normal.names.length > 0 && Math.abs(big.h / normal.h - 1.3) < 0.15) ok(`галочка снова стоит — подписи вернулись; крупный текст — таблички ×${(big.h / normal.h).toFixed(2)} (${normal.h} → ${big.h} точек)`);
  else fail(`подписи снова и размер текста: ${JSON.stringify({ big, normal })}`);
}
