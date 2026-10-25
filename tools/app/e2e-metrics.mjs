// Сценарий в браузере, часть 25 — слой «Показатели» (spec docs/specs/2026-10-metrics-layer.md, часть 1, «Проверки»).
// Городская больница, поток числами: «Слои» → «Загрузка» — столбиков столько, сколько помещений, у помещения с людьми —
// выше, чем у пустого; «Выручка» и «Прибыль» ждут части 2; наведение на столбик — подпись с числами, щелчок — карточка
// его помещения; «Ожидание» — подпись о самом долгом ожидании; M — по кругу; показатель запоминается и после перезагрузки.
// Снимки — `e2e-metrics-*.jpg`.
import { join } from 'node:path';

/** @param {{ page: import('playwright-core').Page, port: number, out: string, ok: (m: string) => void, fail: (m: string) => void, q: string, shots: string }} x */
export async function metricsPart({ page, port, out, ok, fail, q, shots }) {
  const until = (fn, a, ms = 30000) => page.waitForFunction(fn, a, { timeout: ms });
  const flat = s => (s ?? '').replace(/[\s  ]+/g, ' ').trim();
  /** Снимок: JPEG, в качестве `--shots` (для документов) или как есть. */
  const shot = async name => {
    if (shots) {
      await page.evaluate(x => window.__game.showQuality(x), shots);
      await page.waitForTimeout(400);
    }
    const buf = await page.screenshot({ path: join(out, name), type: 'jpeg', quality: 72 });
    if (shots) await page.evaluate(x => window.__game.showQuality(x), q);
    return Math.round(buf.length / 1024);
  };
  const frames = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  /** Столбики: высоты, строки подписи, помещения плана. */
  const cols = () =>
    page.evaluate(() => {
      const g = window.__game;
      return { heights: g.stage.columns.heights, texts: [...g.metricText], rooms: g.layout.plan.rooms.map(r => ({ id: r.id, x: r.x + r.w / 2, y: r.y + r.h / 2 })) };
    });

  // ---------------------------------------------------------------- городская больница, люди пришли
  await page.goto(`http://127.0.0.1:${port}/index.html?q=${q}&lang=ru&hospital=preset&flow=6,1`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  // настройки прошлых частей не в счёт: слой выключен
  await page.evaluate(() => window.__game.actions.setMetric(null));
  await page.evaluate(() => window.__game.actions.setSpeed(12));
  await until(() => window.__game.lastSlice && window.__game.store.get().queue >= 6, null, 180000).catch(() => {});
  await page.evaluate(() => window.__game.actions.setSpeed(0));

  // ---------------------------------------------------------------- «Слои» → «Загрузка»
  await page.click('#layers');
  await page.waitForSelector('#metrics-menu', { timeout: 5000 });
  const disabled = await page.$$eval('#metrics-menu button', els => els.filter(e => e.disabled).map(e => e.id));
  if (JSON.stringify(disabled) === JSON.stringify(['metric-revenue', 'metric-profit'])) ok('«Выручка» и «Прибыль» — следующей частью: кнопки пока выключены');
  else fail(`выключенные показатели: ${JSON.stringify(disabled)}`);
  await page.click('#metric-load');
  await until(() => window.__game.store.get().layers.metric === 'load' && window.__game.stage.columns.heights.length > 0, null, 5000);
  // столбики растут плавно: кадров без видеокарты мало — подождать
  await page.waitForTimeout(2000);
  let c = await cols();
  const busy = c.heights.map((h, i) => ({ h, i, t: c.texts[i] })).filter(x => /ждут/.test(x.t)).sort((a, b) => b.h - a.h)[0];
  const empty = c.heights.map((h, i) => ({ h, i, t: c.texts[i] })).find(x => x.t === 'свободно');
  if (c.heights.length === c.rooms.length && busy && empty && busy.h > empty.h) {
    ok(`«Загрузка»: столбиков ${c.heights.length} — по числу помещений; «${busy.t}» — ${busy.h.toFixed(2)} м, пустое — ${empty.h.toFixed(2)} м`);
  } else fail(`«Загрузка»: ${JSON.stringify({ n: c.heights.length, rooms: c.rooms.length, busy, empty })}`);
  // долгая очередь — тоже столбик, а не плашка «не работает»: у каждого значка очереди — столбик с тем же числом ждущих
  const queues = await page.evaluate(() => window.__game.chips.dump().filter(x => x.icon === 'queue'));
  const plates = queues.filter(x => {
    const i = c.rooms.findIndex(r => r.id === x.room);
    return !(c.heights[i] > 0.3);
  });
  if (queues.length > 0 && plates.length === 0) ok(`очереди — столбиками: ${queues.map(x => `«${x.text}»`).join(', ')}`);
  else if (queues.length === 0) ok('значков очереди сейчас нет');
  else fail(`очередь без столбика: ${JSON.stringify(plates)}`);
  // числа над столбиками — у непустых
  const labels = await page.evaluate(() => window.__game.colLabels.dump());
  if (labels.length > 0 && labels.every(t => /^\d+(\/\d+)?$/.test(t))) ok(`числа над столбиками: ${labels.join(', ')}`);
  else fail(`числа над столбиками: ${JSON.stringify(labels)}`);
  await page.click('#layers');
  // камера — на помещение с людьми; снимок
  const room = c.rooms[busy?.i ?? 0];
  await page.evaluate(([x, z]) => {
    const g = window.__game;
    g.stage.cam.target.set(x, 0, z);
    g.stage.cam.half = 16;
  }, [room.x, room.y]);
  await frames();
  await page.waitForTimeout(400);
  console.log(`  (снимок ${await shot('e2e-metrics-1-load.jpg')} КБ)`);

  // ---------------------------------------------------------------- наведение и щелчок по столбику
  // точка на столбике, где рядом никого: людей игра выбирает раньше столбиков — и правильно; сначала столбики с числом
  const at = await page.evaluate(() => {
    const g = window.__game;
    const cam = g.stage.cam.camera;
    const rect = g.stage.renderer.domElement.getBoundingClientRect();
    const order = g.layout.plan.rooms.map((_, i) => i).sort((a, b) => (g.metricText[b]?.includes('ждут') ? 1 : 0) - (g.metricText[a]?.includes('ждут') ? 1 : 0));
    for (const i of order) {
      const t = g.stage.columns.top(i);
      if (!t) continue;
      for (const y of [t.y * 0.75, t.y * 0.5, t.y * 0.25]) {
        // Vector3 — тем же классом, что у цели камеры: three.js в странице не виден по имени
        const p = new g.stage.cam.target.constructor(t.x, y, t.z).project(cam);
        if (p.z > 1 || Math.abs(p.x) > 0.9 || Math.abs(p.y) > 0.9) continue;
        const sx = rect.left + ((p.x + 1) / 2) * rect.width;
        const sy = rect.top + ((1 - p.y) / 2) * rect.height;
        // и не под панелью окна: мышь должна попасть в холст
        if (document.elementFromPoint(sx, sy) !== g.stage.renderer.domElement) continue;
        if (!g.stage.pickPerson(sx, sy, g.crowd) && g.stage.pickColumn(sx, sy) === i) return { x: sx, y: sy, room: i };
      }
    }
    return null;
  });
  if (!at) fail('столбик не на экране');
  else {
    await page.mouse.move(at.x, at.y);
    const hover = await until(() => {
      const el = document.getElementById('hover');
      return el && el.style.display !== 'none' ? el.innerText : false;
    }, null, 5000).then(h => h.jsonValue(), () => '');
    // в подписи — строка столбика этого помещения: числа показателя, а не состояние помещения
    const want = await page.evaluate(i => window.__game.metricText[i], at.room);
    if (want && flat(hover).endsWith(flat(want))) ok(`наведение на столбик: «${flat(hover)}»`);
    else fail(`подпись над столбиком: «${hover}», ждали «${want}»`);
    await page.mouse.click(at.x, at.y);
    const card = await until(() => document.getElementById('card-title')?.textContent, null, 5000).then(h => h.jsonValue(), () => '');
    if (card) ok(`щелчок по столбику — карточка помещения: «${card}»`);
    else fail('карточка помещения не открылась');
  }

  // вся больница — снимок (камера едет к обзору плавно); карточку помещения закрыть
  await page.mouse.move(5, 5);
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__game.actions.overview());
  await page.waitForTimeout(2500);
  console.log(`  (снимок ${await shot('e2e-metrics-0-overview.jpg')} КБ)`);

  // ---------------------------------------------------------------- «Ожидание», M по кругу, запомнено
  await page.keyboard.press('KeyM');
  await until(() => window.__game.store.get().layers.metric === 'wait', null, 5000).catch(() => fail('M: не «Ожидание»'));
  await page.waitForTimeout(600);
  c = await cols();
  const longest = c.texts.find(t => /самое долгое/.test(t));
  if (longest) ok(`M — «Ожидание»: «${longest}» (снимок ${await shot('e2e-metrics-2-wait.jpg')} КБ)`);
  else fail(`«Ожидание»: ${JSON.stringify(c.texts.slice(0, 6))}`);
  await page.reload();
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  const kept = await page.evaluate(() => window.__game.store.get().layers.metric);
  if (kept === 'wait') ok('после перезагрузки — тот же показатель: «Ожидание» запомнено в настройках игрока');
  else fail(`после перезагрузки: ${kept}`);
  await page.keyboard.press('KeyM');
  const off = await until(() => window.__game.store.get().layers.metric === null && window.__game.stage.columns.heights.length === 0, null, 5000).then(() => true, () => false);
  if (off) ok('M ещё раз — слой выключен, столбиков нет');
  else fail('M: слой не выключился');
}
