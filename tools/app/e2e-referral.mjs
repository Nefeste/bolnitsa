// Сценарий в браузере, часть 26 — направление к специалисту (spec docs/specs/2026-10-specialists.md, часть 2; решение
// владельца #112): готовая городская больница, зерно 11, поток 6 в час, как в части 22. Просьба терапевта — «Посмотреть»:
// вошёл — своя карта; в «Решении» — «Направить к …»: специалисты, которые сейчас принимают; выбран гастроэнтеролог — карта
// закрылась, больной ушёл к нему: в «Пациентах» и в карточке — «направлен к гастроэнтерологу», в пути — та же строка и «вы
// направили». Снимок — `e2e-referral-1.jpg`.
import { join } from 'node:path';

/** @param {{ page: import('playwright-core').Page, port: number, out: string, ok: (m: string) => void, fail: (m: string) => void, q: string, shots: string }} x */
export async function referralPart({ page, port, out, ok, fail, q, shots }) {
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

  await page.goto(`http://127.0.0.1:${port}/index.html?q=${q}&lang=ru&hospital=preset&seed=11&flow=6,1`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  await until(() => !!window.__game.store.get().doctor?.state);
  // просьба терапевта — «Посмотреть»: идёт к вам, вошёл — своя карта
  await page.keyboard.press('Digit3');
  await until(() => (window.__game.store.get().doctor?.state?.asks.length ?? 0) > 0, null, 180000);
  const ask = await page.evaluate(() => window.__game.store.get().doctor.state.asks[0]);
  await page.click(`#ask-look-${ask.id}`);
  await page.waitForSelector('#dcard #dcard-steps', { timeout: 60000 });
  await until(() => window.__game.store.get().doctor?.card?.active === true);

  // «Решение»: «Направить к …» — специалисты, которые сейчас принимают; терапевта в списке нет
  await page.click('#step-decide');
  await page.waitForSelector('#dcard-refer', { timeout: 10000 });
  const refer = await page.evaluate(() => {
    const el = /** @type {HTMLSelectElement} */ (document.getElementById('dcard-refer'));
    return { disabled: el.disabled, title: el.title, options: [...el.options].map(o => ({ value: o.value, text: o.textContent ?? '' })) };
  });
  const gastro = refer.options.find(o => o.text.startsWith('Гастроэнтеролог'));
  if (!refer.disabled && gastro && refer.options[0].text === 'Направить к …' && !refer.options.some(o => o.text.startsWith('Терапевт')) && refer.title.includes('профиля')) {
    ok(`«Решение»: «${refer.options[0].text}» — ${refer.options.slice(1).map(o => `«${o.text}»`).join(', ')}`);
  } else fail(`«Направить к …»: ${JSON.stringify(refer)}`);
  if (!gastro) return;
  await page.selectOption('#dcard-refer', gastro.value);
  // карта закрылась: больной ушёл к специалисту
  const closed = await until(() => !document.getElementById('dcard'), null, 10000).then(() => true, () => false);
  // «идёт к вам» после «Посмотреть» больше не так: строка окна врача — к кому направлен
  const said = await page.evaluate(() => window.__game.store.get().doctor?.said?.text ?? '');
  if (closed && /направлена? к гастроэнтерологу/.test(said)) ok(`направили — карта закрылась; в окне врача — «${said}»`);
  else fail(`после «Направить к …»: карта закрыта — ${closed}, строка окна врача — «${said}»`);

  // «Пациенты» и карточка: «направлен к гастроэнтерологу»
  await page.keyboard.press('Space');
  await page.keyboard.press('Tab');
  await until(() => !!document.getElementById('patients'));
  const sent = /направлена? к гастроэнтерологу/;
  const row = await until(
    re => [...document.querySelectorAll('#patients .patrow')].map(e => e.textContent ?? '').find(x => new RegExp(re).test(x)) ?? false,
    sent.source,
    15000,
  ).then(h => h.jsonValue(), () => '');
  if (row) ok(`«Пациенты»: «${row}»`);
  else fail('«Пациенты»: строки «направлен к гастроэнтерологу» нет');
  if (!row) return;
  await page.locator('#patients .patrow', { hasText: sent }).first().click();
  await until(re => new RegExp(re).test(document.getElementById('card')?.textContent ?? ''), sent.source);
  const card = (await page.textContent('#card')) ?? '';
  if (/Визит[^·]*· направлена? к гастроэнтерологу/.test(card) || sent.test(card)) ok(`карточка: «${sent.exec(card)?.[0]}» в строке визита`);
  else fail(`карточка: «${card.slice(0, 200)}»`);
  await until(() => document.querySelectorAll('#path .plines li').length >= 2);
  const path = (await page.textContent('#path')) ?? '';
  const kb = await shot('e2e-referral-1.jpg');
  if (sent.test(path) && path.includes('вы направили')) ok(`путь: «${/направлена? к гастроэнтерологу[^·]*?(вы направили)/.exec(path)?.[0] ?? sent.exec(path)?.[0]}» (снимок ${kb} КБ)`);
  else fail(`путь без направления: «${path.slice(0, 300)}»`);
}
