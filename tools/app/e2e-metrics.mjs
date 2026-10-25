// Сценарий в браузере, часть 25 — слой «Показатели» (spec docs/specs/2026-10-metrics-layer.md, «Проверки»). Городская
// больница, поток числами: «Слои» → «Загрузка» — столбиков столько, сколько помещений, у помещения с людьми — выше, чем у
// пустого; наведение на столбик — подпись с числами, щелчок — карточка его помещения; «Ожидание» — подпись о самом долгом
// ожидании; M — по кругу; показатель запоминается и после перезагрузки. Часть 2 — деньги по помещениям: «Выручка» — у
// кабинетов, за что; «Прибыль» — плюс и минус, служебные — свои расходы серым, «работает на всю больницу»; «До утра» — на
// ползунке прошедшие сутки; в карточке помещения — график по суткам. Снимки — `e2e-metrics-*.jpg`.
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
  const buttons = await page.$$eval('#metrics-menu button', els => els.map(e => ({ id: e.id, off: e.disabled })));
  if (buttons.length === 4 && buttons.every(b => !b.off)) ok(`все четыре показателя включаются: ${buttons.map(b => b.id.replace('metric-', '')).join(', ')}`);
  else fail(`показатели в меню: ${JSON.stringify(buttons)}`);
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

  // ---------------------------------------------------------------- часть 2: «Выручка» — деньги за сутки по помещениям
  await page.keyboard.press('KeyM');
  await until(() => window.__game.store.get().layers.metric === 'revenue', null, 5000).catch(() => fail('M: не «Выручка»'));
  await page.evaluate(() => window.__game.actions.setSpeed(12));
  await until(() => Object.values(window.__game.roomsMoney.now).filter(r => r.income > 0).length >= 2, null, 180000).catch(() => {});
  await page.evaluate(() => window.__game.actions.setSpeed(0));
  await page.waitForTimeout(1200);
  c = await cols();
  const revenue = c.texts.map((t, i) => ({ t, h: c.heights[i] })).filter(x => /^выручка /.test(x.t)).sort((a, b) => b.h - a.h);
  const money = await page.evaluate(() => window.__game.colLabels.dump());
  if (revenue.length >= 2 && revenue[0].h > revenue[revenue.length - 1].h - 1e-6 && money.some(t => /тыс\.|₽/.test(t))) {
    ok(`M — «Выручка»: ${revenue.length} помещений с выручкой, больше всех — «${revenue[0].t}»; числа — ${money.slice(0, 4).join(', ')} (снимок ${await shot('e2e-metrics-3-revenue.jpg')} КБ)`);
  } else fail(`«Выручка»: ${JSON.stringify({ revenue: revenue.slice(0, 3), money: money.slice(0, 4) })}`);

  // ---------------------------------------------------------------- «Прибыль»: плюс и минус; служебные — расходы серым
  await page.keyboard.press('KeyM');
  await until(() => window.__game.store.get().layers.metric === 'profit', null, 5000).catch(() => fail('M: не «Прибыль»'));
  await page.waitForTimeout(800);
  c = await cols();
  const profit = c.texts.filter(t => /^прибыль [+−]?/.test(t));
  const service = c.texts.filter(t => /работает на всю больницу/.test(t));
  if (profit.length > 0 && service.length > 0) ok(`M — «Прибыль»: «${profit[0]}»; служебных — ${service.length}, «${service[0]}» (снимок ${await shot('e2e-metrics-4-profit.jpg')} КБ)`);
  else fail(`«Прибыль»: ${JSON.stringify(c.texts.slice(0, 8))}`);

  // ---------------------------------------------------------------- «До утра»: прошедшие сутки на ползунке
  const t0 = Date.now();
  await page.click('#speed-ff');
  for (;;) {
    const h = await page.evaluate(() => ({ open: window.__game.store.get().economy?.open ?? false, ff: window.__game.ff, speed: window.__game.speed, card: window.__game.doctor.open }));
    if (h.open || Date.now() - t0 > 300000) break;
    if (h.card) await page.keyboard.press('Escape');
    else if (!h.ff && h.speed === 0) await page.click('#speed-ff');
    await page.waitForTimeout(200);
  }
  await page.click('#meeting-close').catch(() => {});
  await until(() => !window.__game.store.get().economy?.open, null, 10000).catch(() => {});
  await page.evaluate(() => window.__game.actions.setSpeed(0));
  await until(() => window.__game.store.get().layers.days.length > 0, null, 20000).catch(() => {});
  await page.click('#layers');
  await page.waitForSelector('#metric-day', { timeout: 5000 });
  const day = await page.evaluate(() => {
    const el = document.getElementById('metric-day');
    const days = window.__game.store.get().layers.days;
    // ползунок — на прошедшие сутки: значение «0» — самые старые из присланных
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '0');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return days[0];
  });
  const label = await until(x => document.getElementById('metric-day-label')?.textContent === `день ${x}` && window.__game.store.get().layers.day === x, day, 5000).then(
    () => `день ${day}`,
    () => '',
  );
  await page.waitForTimeout(800);
  c = await cols();
  if (label && c.texts.some(t => /^прибыль /.test(t))) ok(`ползунок по суткам: «${label}» — столбики по итогу тех суток, «${c.texts.find(t => /^прибыль /.test(t))}»`);
  else fail(`ползунок по суткам: ${JSON.stringify({ day, label, texts: c.texts.slice(0, 4) })}`);
  await page.click('#layers');

  // ---------------------------------------------------------------- карточка помещения: деньги по суткам графиком
  const office = await page.evaluate(() => {
    const g = window.__game;
    const i = g.layout.plan.rooms.findIndex(r => r.type === 'room.office' && r.id !== g.hospital.site?.mine);
    return g.layout.plan.rooms[i]?.id;
  });
  await page.evaluate(id => window.__game.selectRoomId(id), office);
  await page.waitForSelector('#room-money svg', { timeout: 10000 }).catch(() => {});
  const chart = await page.evaluate(() => ({
    bars: document.querySelectorAll('#room-money svg rect').length,
    tips: [...document.querySelectorAll('#room-money svg title')].map(t => t.textContent),
    label: document.querySelector('#room-money .label')?.textContent ?? '',
  }));
  if (chart.bars >= 4 && chart.tips.some(t => /выручка/.test(t ?? ''))) ok(`карточка кабинета — «${chart.label}»: ${chart.bars / 2} суток, «${chart.tips[0]}» (снимок ${await shot('e2e-metrics-5-chart.jpg')} КБ)`);
  else fail(`график в карточке: ${JSON.stringify(chart)}`);
  await page.keyboard.press('Escape');

  await page.keyboard.press('KeyM');
  const off = await until(() => window.__game.store.get().layers.metric === null && window.__game.stage.columns.heights.length === 0, null, 5000).then(() => true, () => false);
  if (off) ok('M после «Прибыли» — слой выключен, столбиков нет');
  else fail('M: слой не выключился');
}
