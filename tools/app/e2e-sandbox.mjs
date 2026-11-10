// Сценарий в браузере, часть 46 — песочница, часть 2 (spec docs/specs/2026-11-sandbox.md, «Проверки»): экран начала — «Пустое
// здание» и участок L; на участке 90 × 60 — пустое здание у южного края. «Корпус»: протянуть пристройку у северной стены —
// новые клетки и касса, Ctrl+Z — как было; «Снести» — двор в пустом здании. «Вход»: вход скорой — на восточную стену. У
// сценария «Корпуса» и «Входа» нет. Снимок — `e2e-sandbox-1.jpg`.
import { join } from 'node:path';

/** @param {{ page: import('playwright-core').Page, port: number, out: string, ok: (m: string) => void, fail: (m: string) => void, q: string, shots: string }} x */
export async function sandboxPart({ page, port, out, ok, fail, q, shots }) {
  const until = (fn, a, ms = 30000) => page.waitForFunction(fn, a, { timeout: ms });
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
  const look = async (x, y, half = 14) => {
    await page.evaluate(([cx, cy, h]) => {
      const g = window.__game;
      g.stage.cam.target.set(cx, 0, cy);
      g.stage.cam.half = h;
    }, [x, y, half]);
    await frames();
  };
  const at = (x, y) => page.evaluate(([cx, cy]) => window.__game.stage.screenOfCell(cx, cy), [x, y]);
  const settled = () => until(() => (document.getElementById('ghost')?.textContent ?? '') === (window.__game.builder.ghost?.text ?? ''));
  const ghost = async () => {
    await settled();
    return page.$eval('#ghost', el => ({ ok: el.classList.contains('ok'), text: el.textContent ?? '' })).catch(() => ({ ok: false, text: '' }));
  };
  const hover = async (x, y) => {
    const p = await at(x, y);
    await page.mouse.move(p.x, p.y);
    await until(([cx, cy]) => {
      const h = window.__game.builder.hover;
      return !!h && h[0] === cx && h[1] === cy;
    }, [x, y]);
    await settled();
    return p;
  };
  /** клеток внутри здания — по карте плана окна */
  const inside = () => page.evaluate(() => {
    const s = window.__game.hospital.site;
    const set = new Set();
    for (const r of s.inside) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) set.add(y * s.w + x);
    return set.size;
  });
  const cash = () => page.evaluate(() => window.__game.money.hud.cash);

  // ---------------------------------------------------------------- экран начала: «Пустое здание» и участок L
  await page.goto(`http://127.0.0.1:${port}/index.html?q=${q}&lang=ru&backdrop=0`);
  await page.waitForSelector('#start-empty', { timeout: 120000 });
  await page.click('#start-empty');
  await page.waitForSelector('#start-lots');
  const lots = await page.$$eval('#start-lots button', els => els.map(e => `${e.id}:${e.className}`));
  if (lots.length === 3 && lots.some(x => x.startsWith('start-lot-M:') && x.includes(' on'))) ok(`второй шаг «Пустого здания»: участки ${lots.map(x => x.split(':')[0].slice(-1)).join(', ')}, выбран M`);
  else fail(`участки на втором шаге: ${JSON.stringify(lots)}`);
  await page.click('#start-lot-L');
  const hint = await page.$eval('#start-lot-hint', el => el.textContent ?? '');
  if (hint.includes('90 × 60')) ok(`участок L: «${hint}»`);
  else fail(`подпись участка L: «${hint}»`);
  await page.click('#start-roles button[id^="start-role-"]');
  await page.waitForURL(/lot=L/, { timeout: 30000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  const lot = await page.evaluate(() => ({ w: window.__game.hospital.site.w, h: window.__game.hospital.site.h, url: location.search }));
  if (lot.w === 90 && lot.h === 60) ok(`игра на участке ${lot.w} × ${lot.h} (${lot.url})`);
  else fail(`участок игры: ${JSON.stringify(lot)}`);

  // ---------------------------------------------------------------- «Корпус»: пристройка у северной стены
  await page.keyboard.press('KeyB');
  await page.click('#tool-shell');
  const tools = await page.$$eval('#shell-modes button', els => els.map(e => `${e.id}:${e.className}`));
  if (tools.some(x => x.startsWith('shell-add:') && x.includes(' on'))) ok(`«Корпус»: режимы ${tools.map(x => x.split(':')[0]).join(', ')}, «Пристроить» выбран`);
  else fail(`режимы «Корпуса»: ${JSON.stringify(tools)}`);
  await look(20, 22, 12);
  const c0 = await cash();
  const n0 = await inside();
  const a = await hover(10, 18);
  await page.mouse.down();
  await hover(29, 25);
  const g = await ghost();
  if (g.ok && /^Корпус 20 × 9: новых клеток 180 — /.test(g.text)) ok(`призрак пристройки: «${g.text}»`);
  else fail(`призрак пристройки: ${JSON.stringify(g)}`);
  await page.mouse.up();
  await until(k => {
    const s = window.__game.hospital.site;
    let n = 0;
    const set = new Set();
    for (const r of s.inside) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) set.add(y * s.w + x);
    n = set.size;
    return n === k + 180;
  }, n0);
  await until(c => window.__game.money.hud.cash === c - 72000, c0).catch(() => {});
  const c1 = await cash();
  if (c1 === c0 - 72000) ok(`пристройка стоит: клеток здания ${n0} → ${n0 + 180}, касса ${c0} → ${c1}`);
  else fail(`касса после пристройки: ${c0} → ${c1}`);
  // общий план: здание и пристройка над ним; призрак — убран (курсор ушёл с участка)
  await page.mouse.move(5, 700);
  await look(30, 34, 30);
  await page.waitForTimeout(300);
    ok(`снимок пристройки: ${join(out, 'e2e-sandbox-1.jpg')} (${await shot('e2e-sandbox-1.jpg')} КБ)`);
  await page.keyboard.press('Control+KeyZ');
  await until(k => {
    const s = window.__game.hospital.site;
    const set = new Set();
    for (const r of s.inside) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) set.add(y * s.w + x);
    return set.size === k;
  }, n0);
  if ((await cash()) === c0) ok('Ctrl+Z — пристройки нет, касса — как была');
  else fail(`касса после отмены: ${await cash()}, было ${c0}`);
  void a;

  // ---------------------------------------------------------------- «Снести»: двор в пустом здании
  await page.click('#shell-remove');
  await look(22, 37, 10);
  await hover(20, 35);
  await page.mouse.down();
  await hover(23, 38);
  const r = await ghost();
  if (r.ok && r.text === 'Снести клеток корпуса: 16 — бесплатно, денег не вернётся') ok(`призрак сноса: «${r.text}»`);
  else fail(`призрак сноса: ${JSON.stringify(r)}`);
  await page.mouse.up();
  await until(k => {
    const s = window.__game.hospital.site;
    const set = new Set();
    for (const x of s.inside) for (let y = x.y; y < x.y + x.h; y++) for (let c = x.x; c < x.x + x.w; c++) set.add(y * s.w + c);
    return set.size === k - 16;
  }, n0);
  ok(`двор снесён: клеток здания ${n0 - 16}`);

  // ---------------------------------------------------------------- «Вход»: скорая — на восточную стену
  await page.click('#tool-entrance');
  await page.click('#entrance-amb');
  await look(52, 31, 8);
  const e = await hover(53, 30);
  const eg = await ghost();
  if (eg.ok && /^Вход скорой сюда — /.test(eg.text)) ok(`призрак входа: «${eg.text}»`);
  else fail(`призрак входа: ${JSON.stringify(eg)}`);
  await page.mouse.click(e.x, e.y);
  await until(() => JSON.stringify(window.__game.hospital.site.ambulance) === '[[53,30],[53,31]]');
  ok('вход скорой — на восточной стене: 53, 30–31');
  await page.keyboard.press('KeyB');

  // ---------------------------------------------------------------- сценарий: «Корпуса» и «Входа» нет
  await page.goto(`http://127.0.0.1:${port}/index.html?q=${q}&lang=ru&scenario=scenario.ambulatory&backdrop=0`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  await page.keyboard.press('KeyB');
  await page.waitForSelector('#tool-room');
  const has = await page.$$eval('#tool-shell, #tool-entrance', els => els.length);
  if (has === 0) ok('у сценария в стройке нет «Корпуса» и «Входа»');
  else fail(`у сценария «Корпус» или «Вход»: ${has}`);
  await page.keyboard.press('KeyB');
}
