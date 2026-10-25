// Сценарий в браузере, часть 20 — «Главврач утверждает» (spec docs/specs/2026-10-two-ways.md, часть 2: F3 и «Ещё
// обследование» F2). Готовая больница, зерно 11, поток 6 в час. Вкладка «Просят посмотреть»: галочки по умолчанию — «не
// уверен» и «долгий случай»; «каждое решение» — галочкой. ×12 до первого решения: строка «… — N из 10 · … · …», счётчик в
// названии вкладки, над больным — значок, в его карточке — «ждёт вашего решения по плану врача — до …». «Карта» — решение
// врача, срок и бланк: отметили обследование — назначит врач, строка ушла, в пути — «вы назначили ещё обследование», а
// потом «назначил главврач». Enter — «Согласен» на верхнем решении. «Ни о чём» — галочки сняты. Снимки — `e2e-approve-*.jpg`.
import { join } from 'node:path';

/** @param {{ page: import('playwright-core').Page, port: number, out: string, ok: (m: string) => void, fail: (m: string) => void, q: string, shots: string }} x */
export async function approvePart({ page, port, out, ok, fail, q, shots }) {
  const until = (fn, a, ms = 30000) => page.waitForFunction(fn, a, { timeout: ms });
  const flat = s => (s ?? '').replace(/\s+/g, ' ').trim();
  const shot = async name => {
    if (shots) {
      await page.evaluate(x => window.__game.actions.setQuality(x), shots);
      await page.waitForTimeout(400);
    }
    const buf = await page.screenshot({ path: join(out, name), type: 'jpeg', quality: 72 });
    if (shots) await page.evaluate(x => window.__game.actions.setQuality(x), q);
    return Math.round(buf.length / 1024);
  };
  const speed = x => page.evaluate(v => window.__game.actions.setSpeed(v), x);
  const decisions = () => page.evaluate(() => (window.__game.doctor.hud.state?.decisions ?? []).map(d => d.id));

  await page.goto(`http://127.0.0.1:${port}/index.html?q=${q}&lang=ru&hospital=preset&seed=11&flow=6,1`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  await until(() => !!window.__game.store.get().doctor?.state);
  await page.evaluate(() => window.__game.actions.doctor({ kind: 'autopause', on: false }));

  // ---------------------------------------------------------------- галочки
  await page.evaluate(() => window.__game.actions.setTab('asks'));
  await page.waitForSelector('#ask-rules', { timeout: 10000 });
  const line = await page.$eval('#rules-list', e => e.textContent ?? '');
  // галочки — под «Изменить»: внизу вкладки строкой — что отмечено
  await page.click('#rules-edit');
  await page.waitForSelector('#rule-every', { timeout: 5000 });
  const rules = () => page.$$eval('#ask-rules input[type=checkbox]', els => Object.fromEntries(els.map(e => [e.id.slice(5), e.checked])));
  const def = await rules();
  if (line === 'не уверен, долгий случай: 4 ч без диагноза' && def.unsure && def.long && !def.below90 && !def.every && !def.admit && !def.discharge && !def.never) ok(`«О чём спрашивать главврача»: по умолчанию — «${line}»`);
  else fail(`галочки по умолчанию: ${JSON.stringify({ line, ...def })}`);
  await page.click('#rule-every');
  await until(() => window.__game.doctor.hud.state.rules.includes('every'));
  ok('«каждое решение» — отмечено, движок спрашивает');

  // ---------------------------------------------------------------- первое решение на утверждении
  await speed(12);
  await until(() => document.querySelectorAll('#decisions li').length > 0, null, 240000);
  await speed(0);
  const [id] = await decisions();
  const row = await page.evaluate(x => ({
    text: document.getElementById(`dec-text-${x}`)?.textContent ?? '',
    all: (document.getElementById(`dec-${x}`)?.textContent ?? '').replace(/\s+/g, ' ').trim(),
    tab: document.getElementById('tab-asks')?.textContent ?? '',
  }), id);
  if (/ — \d+ из 10 · .+ · /.test(row.text) && /каждое решение · ждёт ответа до \d\d:\d\d/.test(row.all) && /Просят посмотреть \(\d+\)/.test(row.tab)) ok(`«Решения врачей»: «${flat(row.all).slice(0, 140)}»; вкладка — «${row.tab}»`);
  else fail(`строка решения: ${JSON.stringify(row)}`);
  // на карте: над больным — значок, в карточке — что ждёт
  await page.evaluate(x => window.__game.actions.find(x), id);
  await until(() => !!document.querySelector('#card'), null, 10000);
  await page.waitForTimeout(600);
  const map = await page.evaluate(() => ({ card: (document.getElementById('card')?.textContent ?? '').replace(/\s+/g, ' '), icons: window.__game.stage.icons.shown.approve }));
  if (/ждёт вашего решения по плану врача — до \d\d:\d\d/.test(map.card) && map.icons > 0) ok(`на карте: значок над ждущими решения (${map.icons}), в карточке — «ждёт вашего решения по плану врача»`);
  else fail(`на карте: ${JSON.stringify({ ...map, card: map.card.slice(0, 300) })}`);
  if (/решение врача ждёт вашего ответа/.test(map.card)) ok('в пути: «решение врача ждёт вашего ответа — … (до …)»');
  else fail(`путь: ${map.card.slice(0, 400)}`);
  await page.keyboard.press('Escape');

  // ---------------------------------------------------------------- «Карта»: решение, срок и бланк «Ещё обследование»
  await page.evaluate(() => window.__game.actions.setTab('asks'));
  await page.click(`#dec-view-${id}`);
  await page.waitForSelector('.dcard.read.order #dcard-approve', { timeout: 20000 });
  const card = await page.evaluate(() => ({
    lead: document.getElementById('dcard-lead')?.textContent ?? '',
    banner: document.getElementById('dcard-approve')?.textContent ?? '',
    course: document.querySelectorAll('#dcard-course .pair').length,
    form: !!document.querySelector('#dcard #col-exam'),
  }));
  if (/решил: /.test(card.lead) && /ждёт вашего ответа до \d\d:\d\d/.test(card.banner) && card.form && card.course > 0) ok(`карта: «${flat(card.lead)}»; «${flat(card.banner).slice(0, 90)}»; рядом — «Ход приёма» и бланк`);
  else fail(`карта решения: ${JSON.stringify(card)}`);
  // в бланке — анализ или снимок, которого ещё нет: назначит его врач
  await page.click('#col-exam .tabs button:nth-child(2)').catch(() => {});
  const tabs = await page.$$('#col-exam button');
  for (const b of tabs) if (flat(await b.textContent()) === 'Назначить') await b.click();
  const box = await page.waitForSelector('#col-exam #or-lab input[type=checkbox]:not([disabled]), #col-exam input[type=checkbox]:not([disabled])', { timeout: 10000 });
  const exam = await box.getAttribute('data-exam');
  await box.check();
  ok(`снимок: ${join(out, 'e2e-approve-1-card.jpg')} (${await shot('e2e-approve-1-card.jpg')} КБ)`);
  await page.click('#order-send');
  await until(x => !(window.__game.doctor.hud.state?.decisions ?? []).some(d => d.id === x), id, 20000).catch(() => {});
  await until(x => (document.querySelector(`#dcard [data-exam="${x}"]`)?.textContent ?? '').includes('назначено вами'), exam, 20000).catch(() => {});
  const after = await page.evaluate(x => ({ gone: !(window.__game.doctor.hud.state?.decisions ?? []).some(d => d.id === x.id), mark: document.querySelector(`#dcard [data-exam="${x.exam}"]`)?.textContent ?? '' }), { id, exam });
  if (after.gone && after.mark.includes('назначено вами — сделает врач')) ok(`«Ещё обследование»: ${exam} — «назначено вами — сделает врач», решение снято со списка`);
  else fail(`«Ещё обследование»: ${JSON.stringify({ exam, ...after })}`);
  await page.keyboard.press('Escape');
  await until(() => !document.getElementById('dcard'));

  // ---------------------------------------------------------------- врач позвал его первым и сделал назначенное
  await page.evaluate(x => window.__game.actions.find(x), id);
  await until(() => !!document.querySelector('#card #path'), null, 10000).catch(() => {});
  await speed(3);
  let path = '';
  for (let i = 0; i < 240; i++) {
    path = await page.evaluate(() => (document.getElementById('path')?.textContent ?? '').replace(/\s+/g, ' '));
    if (path.includes('вы назначили ещё обследование') && (path.includes('назначил главврач') || path.includes('решение врача ждёт вашего ответа — ') && path.lastIndexOf('решение врача ждёт') > path.indexOf('вы назначили'))) break;
    await page.waitForTimeout(500);
  }
  await speed(0);
  if (path.includes('вы назначили ещё обследование')) ok(`путь: «решение врача ждёт вашего ответа» — «вы назначили ещё обследование»${path.includes('назначил главврач') ? ', дальше — «назначил главврач»' : ''}`);
  else fail(`путь после «Ещё обследование»: ${path.slice(0, 500)}`);
  ok(`снимок: ${join(out, 'e2e-approve-2-path.jpg')} (${await shot('e2e-approve-2-path.jpg')} КБ)`);
  await page.keyboard.press('Escape');

  // ---------------------------------------------------------------- Enter — «Согласен» на верхнем
  await page.evaluate(() => window.__game.actions.setTab('asks'));
  await speed(12);
  await until(() => (window.__game.doctor.hud.state?.decisions ?? []).length > 0, null, 240000);
  await speed(0);
  const [top] = await decisions();
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
  await page.keyboard.press('Enter');
  await until(x => !(window.__game.doctor.hud.state?.decisions ?? []).some(d => d.id === x), top, 20000).catch(() => {});
  if (!(await decisions()).includes(top)) ok('Enter — «Согласен» на верхнем решении: строка ушла');
  else fail('Enter не ответил на верхнее решение');
  ok(`снимок: ${join(out, 'e2e-approve-3-list.jpg')} (${await shot('e2e-approve-3-list.jpg')} КБ)`);

  // ---------------------------------------------------------------- «ни о чём»
  await page.click('#rule-never');
  await until(() => window.__game.doctor.hud.state.rules.length === 0);
  const none = await rules();
  if (Object.entries(none).every(([k, v]) => (k === 'never' ? v : !v))) ok('«ни о чём» — галочки сняты');
  else fail(`«ни о чём»: ${JSON.stringify(none)}`);
  await page.click('#rule-never');
  await until(() => window.__game.doctor.hud.state.rules.join() === 'unsure,long');
  ok('снова по умолчанию — «не уверен» и «долгий случай»');
}
