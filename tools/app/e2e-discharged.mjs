// Сценарий в браузере, часть 11 — карта ушедшего (spec docs/specs/2026-10-discharged-card.md, «Проверки»). Готовая
// больница, зерно 11, поток 6 в час. ×12, пока нанятый врач не отпустит кого-нибудь домой; «Пациенты» → «Приняты»: строка
// «домой в … · диагноз · кто вёл»; «Открыть карту» — карта для чтения: шапка «… · отпустил домой в …», «Решение» —
// диагноз, лечение, где лечить, «Ход приёма»; часы идут. Щелчок по строке — карточка ушедшего: «Открыть карту» есть,
// «Взять случай» — нет, карта открывается и оттуда. Снимки — `e2e-discharged-*.jpg`.
import { join } from 'node:path';

/** @param {{ page: import('playwright-core').Page, port: number, out: string, ok: (m: string) => void, fail: (m: string) => void, q: string, shots: string }} x */
export async function dischargedPart({ page, port, out, ok, fail, q, shots }) {
  const until = (fn, a, ms = 30000) => page.waitForFunction(fn, a, { timeout: ms });
  /** Снимок: JPEG, в качестве `--shots` (для документов) или как есть. */
  const shot = async name => {
    if (shots) {
      await page.evaluate(x => window.__game.actions.setQuality(x), shots);
      await page.waitForTimeout(400);
    }
    const buf = await page.screenshot({ path: join(out, name), type: 'jpeg', quality: 72 });
    if (shots) await page.evaluate(x => window.__game.actions.setQuality(x), q);
    return Math.round(buf.length / 1024);
  };
  const flat = s => (s ?? '').replace(/\s+/g, ' ').trim();

  await page.goto(`http://127.0.0.1:${port}/index.html?q=${q}&lang=ru&hospital=preset&seed=11&flow=6,1`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  await until(() => !!window.__game.store.get().doctor?.state);

  // ---------------------------------------------------------------- «Приняты»: отпущенный домой
  await page.keyboard.press('Digit3');
  const home = () => window.__game.store.get().seenRows.find(r => r.text.startsWith('домой') && !r.text.endsWith('· вы')) ?? null;
  const row = await until(home, null, 240000).then(h => h.jsonValue());
  await page.keyboard.press('Tab');
  await page.click('#pf-seen');
  const sel = `#seen-list button.patrow[data-id="${row.id}"]`;
  await page.waitForSelector(sel);
  const text = flat(await page.textContent(sel));
  const label = flat(await page.textContent('#pf-seen'));
  if (/домой в \d\d:\d\d · .+ · .+навык \d/.test(text) && /^Приняты \(\d+\)$/.test(label)) ok(`«${label}»: «${text}»`);
  else fail(`строка «Приняты»: ${JSON.stringify({ label, text })}`);

  // «Открыть карту» — решение и ход приёма; часы идут
  const t0 = await page.evaluate(() => window.__game.t);
  await page.click(`#pat-open-${row.id}`);
  await page.waitForSelector('.dcard.read #dcard-decided', { timeout: 20000 });
  await page.waitForTimeout(1500);
  const v = await page.evaluate(() => ({
    lead: document.getElementById('dcard-lead')?.textContent ?? '',
    dx: document.getElementById('decided-dx')?.textContent ?? '',
    tx: document.getElementById('decided-tx')?.textContent ?? '',
    setting: document.getElementById('decided-setting')?.textContent ?? '',
    pairs: document.querySelectorAll('#dcard-course .pair').length,
    actions: document.querySelectorAll('#dcard .questions, #dcard #col-decide').length,
    t: window.__game.t,
  }));
  if (/отпустил домой в \d\d:\d\d/.test(v.lead) && v.dx && text.includes(v.dx) && v.setting === 'Дома' && v.pairs > 0 && v.actions === 0 && v.t > t0)
    ok(`карта отпущенного: «${flat(v.lead)}»; «${flat(v.dx)}», «${flat(v.tx)}», «${v.setting}»; «Ход приёма» — ${v.pairs}; часы идут`);
  else fail(`карта отпущенного: ${JSON.stringify({ ...v, t0 })}`);
  ok(`снимок: ${join(out, 'e2e-discharged-1-card.jpg')} (${await shot('e2e-discharged-1-card.jpg')} КБ)`);
  await page.keyboard.press('Escape');
  await until(() => !document.getElementById('dcard'));

  // ---------------------------------------------------------------- карточка ушедшего
  await page.click(sel);
  await page.waitForSelector('#card-view', { timeout: 10000 });
  const card = await page.evaluate(() => ({ take: !!document.getElementById('card-take'), title: document.getElementById('card-title')?.textContent ?? '' }));
  if (!card.take) ok(`карточка ушедшего «${card.title}»: «Открыть карту», без «Взять случай»`);
  else fail(`карточка ушедшего: ${JSON.stringify(card)}`);
  ok(`снимок: ${join(out, 'e2e-discharged-2-person.jpg')} (${await shot('e2e-discharged-2-person.jpg')} КБ)`);
  await page.click('#card-view');
  await page.waitForSelector('.dcard.read #dcard-decided', { timeout: 20000 })
    .then(() => ok('из карточки ушедшего — та же карта с решением'), () => fail('из карточки ушедшего карта не открылась'));
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
}
