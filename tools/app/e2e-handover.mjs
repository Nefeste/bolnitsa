// Сценарий в браузере, часть 35 — лист передачи (spec docs/specs/2026-11-scenario-2.md, «Часть 2а: лист передачи в окне»).
// Готовая городская больница, скорая — две машины в час. Галочка «Пусть сортирует медсестра» стоит; сняли — сортируете вы.
// Привезли — автопауза, окно врача раскрыто, строка в «Привезла скорая»; «Лист передачи» — окно со строкой заголовка, повод,
// что измерил фельдшер, баллы NEWS2 на «Студенте»; часы стоят и клавиши скорости молчат, пока лист открыт; «Красный» —
// привезённый ушёл из списка. Потом «До утра» без автопаузы: ночью сортировать некому — планёрка со строками «Сортировка» и
// «Ночь». Поставили галочку — ждущих сортирует медсестра, список пуст. Снимок — `e2e-handover-sheet.jpg`.
import { join } from 'node:path';
import { headOk, windowHead } from './e2e-lib.mjs';

/** @param {{ page: import('playwright-core').Page, port: number, out: string, ok: (m: string) => void, fail: (m: string) => void, q: string, shots: string }} x */
export async function handoverPart({ page, port, out, ok, fail, q, shots }) {
  const until = (fn, a, ms = 30000) => page.waitForFunction(fn, a, { timeout: ms });
  const flat = s => (s ?? '').replace(/\s+/g, ' ').trim();
  const text = async sel => flat(await page.$eval(sel, e => e.textContent ?? '').catch(() => ''));
  const shot = async name => {
    if (shots) {
      await page.evaluate(x => window.__game.showQuality(x), shots);
      await page.waitForTimeout(400);
    }
    const buf = await page.screenshot({ path: join(out, name), type: 'jpeg', quality: 72 });
    if (shots) await page.evaluate(x => window.__game.showQuality(x), q);
    return Math.round(buf.length / 1024);
  };
  const handover = () => page.evaluate(() => window.__game.store.get().doctor?.state?.handover ?? []);

  await page.goto(`http://127.0.0.1:${port}/index.html?q=${q}&lang=ru&hospital=preset&seed=2&flow=6,2`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  await until(() => !!window.__game.store.get().doctor?.state);

  // ---------------------------------------------------------------- галочка: стоит — сортирует медсестра; сняли — вы
  await until(() => !!document.querySelector('#dock-nurse-sorts'));
  const on = await page.$eval('#dock-nurse-sorts', e => e.checked);
  if (on && (await handover()).length === 0) ok(`«${await text('#dock-nurse')}» — стоит: привезённых сортирует медсестра, списка нет`);
  else fail(`галочка «Пусть сортирует медсестра»: стоит ${on}, ждут сортировки ${(await handover()).length}`);
  await page.click('#dock-nurse-sorts');
  await until(() => window.__game.store.get().doctor?.state?.sorts === true);
  ok('сняли галочку — сортируете вы (`sorts` в движке)');

  // ---------------------------------------------------------------- привезли: автопауза, строка в «Привезла скорая»
  await page.evaluate(() => window.__game.actions.setSpeed(12));
  const t0 = Date.now();
  await until(() => (window.__game.store.get().doctor?.state?.handover.length ?? 0) > 0, null, 180000);
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => ({ speed: window.__game.speed, folded: window.__game.store.get().doctor?.folded ?? true }));
  const rows = await handover();
  const first = rows[0];
  if (after.speed === 0 && !after.folded) ok(`привезла скорая — автопауза, окно врача раскрыто (${Math.round((Date.now() - t0) / 1000)} с)`);
  else fail(`привезла скорая: скорость ${after.speed}, окно врача свёрнуто ${after.folded}`);
  const line = await text(`#dh-${first.id}`);
  if (line.includes(flat(first.who)) && (line.includes('в смотровой') || line.includes('у входа'))) ok(`«${await text('#dock-handover')}» — строка: «${line.slice(0, 120)}»`);
  else fail(`строка привезённого: «${line}»`);

  // ---------------------------------------------------------------- лист передачи: окно, повод, измерения, баллы
  await page.evaluate(() => window.__game.actions.setSpeed(3));
  await page.click(`#dock-sheet-${first.id}`);
  await page.waitForSelector('#dsheet', { timeout: 10000 });
  const head = await windowHead(page, '#dsheet');
  if (headOk(head, 'card', 'dsheet-close', true)) ok(`строка заголовка листа: значок «card», «${head.title.slice(0, 80)}», крестик последним`);
  else fail(`строка заголовка листа: ${JSON.stringify(head)}`);
  const measured = await page.$$eval('#dsheet-measured li', els => els.map(e => (e.textContent ?? '').trim()));
  const reason = await text('#dsheet-reason');
  const news2 = await text('#dsheet-news2');
  if (reason.startsWith('Повод:') && measured.length > 0 && news2.includes('NEWS2')) ok(`лист: «${reason}»; фельдшер измерил ${measured.length}: «${measured.slice(0, 3).join('», «')}»; «${news2}»`);
  else fail(`лист: повод «${reason}», измерения ${JSON.stringify(measured)}, баллы «${news2}»`);
  // часы стоят, пока лист открыт: и с кнопками скорости, и с клавишами
  const clock0 = await page.evaluate(() => window.__game.t);
  await page.evaluate(() => window.__game.actions.setSpeed(12));
  await page.keyboard.press('Space');
  await page.keyboard.press('Digit3');
  await page.waitForTimeout(1500);
  const held = await page.evaluate(() => ({ t: window.__game.t, speed: window.__game.speed }));
  if (held.t === clock0 && held.speed === 0) ok('часы стоят, пока лист открыт: кнопки и клавиши скорости молчат');
  else fail(`лист открыт, а часы: было ${clock0}, стало ${held.t}, скорость ${held.speed}`);
  ok(`снимок листа: ${join(out, 'e2e-handover-sheet.jpg')} (${await shot('e2e-handover-sheet.jpg')} КБ)`);

  // ---------------------------------------------------------------- «Красный»: из списка ушёл; следующий — его лист
  const left = rows.length - 1;
  await page.click('#dsheet-red');
  await until(id => !(window.__game.store.get().doctor?.state?.handover ?? []).some(r => r.id === id), first.id);
  const sheet = await page.evaluate(() => window.__game.store.get().doctor?.sheet);
  if (left === 0 ? sheet === undefined && !(await page.$('#dsheet')) : sheet !== undefined) ok(`«Красный» — ${first.who} отсортирован, ушёл из списка; ${left === 0 ? 'ждущих нет — лист закрыт' : 'следующий — его лист'}`);
  else fail(`после «Красный»: лист ${sheet}, ждали ещё ${left}`);
  if (sheet !== undefined) await page.keyboard.press('Escape');
  await until(() => !document.querySelector('#dsheet'));
  // часы пошли — с той скоростью, что была до автопаузы
  await page.waitForTimeout(500);
  const resumed = await page.evaluate(() => window.__game.speed);
  if (resumed > 0) ok(`лист закрыт — часы идут (×${resumed})`);
  else fail(`лист закрыт, а часы стоят: скорость ${resumed}`);

  // ---------------------------------------------------------------- «До утра» без автопаузы: строки «Сортировка» и «Ночь»
  await page.evaluate(() => window.__game.actions.doctor({ kind: 'autopause', on: false }));
  const t1 = Date.now();
  await page.click('#speed-ff');
  for (;;) {
    const h = await page.evaluate(() => ({ open: window.__game.store.get().economy?.open ?? false, ff: window.__game.ff, speed: window.__game.speed, card: window.__game.doctor.open }));
    if (h.open || Date.now() - t1 > 240000) break;
    if (h.card) await page.keyboard.press('Escape');
    else if (!h.ff && h.speed === 0) await page.click('#speed-ff');
    await page.waitForTimeout(200);
  }
  await page.waitForSelector('#meeting', { timeout: 10000 });
  const sorting = await text('#meet-sorting');
  const night = await text('#meet-night');
  if (/сортировка привезённых: верно \d+ из \d+/.test(sorting)) ok(`планёрка: «${sorting.slice(0, 200)}»`);
  else fail(`планёрка, строка сортировки: «${sorting}»`);
  // ночью сортировать было некому: привезённых врач не звал до утра
  if (/^ночь: скорая привезла \d+, дольше всех ждал врача — /.test(night) && night.includes('врач не позвал до утра')) ok(`планёрка: «${night}»`);
  else fail(`планёрка, строка ночи: «${night}»`);
  await page.click('#meeting-close');
  await until(() => !window.__game.store.get().economy?.open);

  // ---------------------------------------------------------------- поставили галочку: ждущих сортирует медсестра
  const waiting = (await handover()).length;
  await page.click('#dock-nurse-sorts');
  await until(() => window.__game.store.get().doctor?.state?.sorts === undefined && (window.__game.store.get().doctor?.state?.handover.length ?? 1) === 0);
  ok(`поставили галочку — ждавших ${waiting} сортирует медсестра, список пуст`);
}
