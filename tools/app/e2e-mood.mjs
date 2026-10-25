// Сценарий в браузере, часть 17 — настроение персонала (spec docs/specs/2026-10-staff-mood.md, «Проверки»). Городская
// больница; медсестре — зарплата ниже рынка и настроение 29 два утра подряд (снимок движка, как после двух плохих суток);
// «До утра» — планёрка открывается сама, в разделе «Персонал» — «собирается уйти»; карточка медсестры — настроение и
// причина, «собирается уйти — ответьте до …»; «Поднять зарплату» — до рынка, настроение выше 30, уходить раздумала;
// «В другую смену» — меняется сменами с тем, кто на её месте в другой смене; «Уволить» в карточке помещения — с выплатой.
// Снимки — `e2e-mood-1-meeting.jpg`, `e2e-mood-2-card.jpg`.
import { join } from 'node:path';

/** @param {{ page: import('playwright-core').Page, port: number, out: string, ok: (m: string) => void, fail: (m: string) => void, q: string, shots: string }} x */
export async function moodPart({ page, port, out, ok, fail, q, shots }) {
  const until = (fn, a, ms = 30000) => page.waitForFunction(fn, a, { timeout: ms });
  const flat = s => (s ?? '').replace(/\s+/g, ' ').trim();
  const text = async sel => flat(await page.textContent(sel).catch(() => ''));
  const shot = async name => {
    if (shots) {
      await page.evaluate(x => window.__game.actions.setQuality(x), shots);
      await page.waitForTimeout(400);
    }
    const buf = await page.screenshot({ path: join(out, name), type: 'jpeg', quality: 72 });
    if (shots) await page.evaluate(x => window.__game.actions.setQuality(x), q);
    return Math.round(buf.length / 1024);
  };

  await page.goto(`http://127.0.0.1:${port}/index.html?q=${q}&lang=ru&hospital=preset&seed=3&flow=6,1`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  await until(() => window.__game.store.get().economy?.cash !== undefined);

  // ---------------------------------------------------------------- снимок движка: два плохих утра у дневной медсестры
  const who = await page.evaluate(async () => {
    const g = window.__game;
    const s = await g.client.save();
    const nurse = s.staff.find(m => m.shift === 'day' && m.room !== undefined && m.role === 'role.nurse');
    const market = nurse.salary;
    nurse.salary = Math.round((market * 0.8) / 50) * 50;
    s.moods = { ...(s.moods ?? {}), [nurse.id]: { v: 29, low: 2, why: ['below'] } };
    g.client.load(s);
    return { id: nurse.id, market, salary: nurse.salary, room: nurse.room };
  });
  await until(id => window.__game.staff.find(m => m.id === id)?.salary < 2000000 && window.__game.moods.get(id)?.v === 29, who.id);
  ok(`медсестра ${who.id}: зарплата ${who.salary} при рынке ${who.market}, настроение 29 два утра подряд`);

  // ---------------------------------------------------------------- «До утра»: планёрка сама, «собирается уйти»
  const t0 = Date.now();
  await page.click('#speed-ff');
  for (;;) {
    const h = await page.evaluate(() => ({ open: window.__game.store.get().economy?.open ?? false, ff: window.__game.ff, speed: window.__game.speed, card: window.__game.doctor.open }));
    if (h.open || Date.now() - t0 > 240000) break;
    if (h.card) await page.keyboard.press('Escape');
    else if (!h.ff && h.speed === 0) await page.click('#speed-ff');
    await page.waitForTimeout(200);
  }
  const staffText = await text('#meet-staff');
  if (/собирается уйти: ответьте до утра дня 4/.test(staffText) && staffText.startsWith('Персонал')) ok(`планёрка, «Персонал»: «${staffText.slice(0, 160)}» (${Math.round((Date.now() - t0) / 1000)} с)`);
  else fail(`планёрка без «собирается уйти»: «${staffText}»`);
  ok(`снимок планёрки: ${join(out, 'e2e-mood-1-meeting.jpg')} (${await shot('e2e-mood-1-meeting.jpg')} КБ)`);
  const journal = await page.evaluate(() => window.__game.store.get().notices.slice(0, 6).map(n => n.text));
  if (journal.some(x => x.startsWith('собирается уйти: Медсестра'))) ok(`журнал: «${journal.find(x => x.startsWith('собирается уйти'))}»`);
  else fail(`журнал: ${JSON.stringify(journal)}`);
  await page.click('#meeting-close');
  await until(() => !window.__game.store.get().economy?.open);
  await page.evaluate(() => window.__game.setSpeed(0));

  // ---------------------------------------------------------------- карточка: настроение, причина, «собирается уйти»
  await page.evaluate(id => window.__game.actions.select(`s:${id}`), who.id);
  await page.waitForSelector('#card-mood', { timeout: 10000 });
  const card = await page.evaluate(() => ({
    mood: Number(document.getElementById('card-mood')?.dataset.value),
    text: (document.getElementById('card-mood')?.textContent ?? '').replace(/\s+/g, ' '),
    quit: document.getElementById('card-quit')?.textContent ?? '',
    raise: document.getElementById('card-raise')?.textContent ?? '',
    all: (document.getElementById('card')?.textContent ?? '').replace(/\s+/g, ' '),
  }));
  // 29 − 6 «сильно ниже рынка» (на две ступени навыка) + 4 тяги к 70
  if (card.mood === 27 && card.text.includes('зарплата сильно ниже рынка') && card.quit.includes('собирается уйти') && /Имя/.test(card.all)) ok(`карточка: «${card.text.slice(0, 120)}»`);
  else fail(`карточка: ${JSON.stringify(card)}`);
  ok(`снимок карточки: ${join(out, 'e2e-mood-2-card.jpg')} (${await shot('e2e-mood-2-card.jpg')} КБ)`);

  // ---------------------------------------------------------------- «Поднять зарплату»: до рынка, +10, остаётся
  await page.click('#card-raise');
  await until(id => window.__game.moods.get(id)?.v === 37, who.id);
  await until(() => !document.getElementById('card-quit') && !!document.getElementById('card-mood-said'));
  const after = await page.evaluate(id => ({ salary: window.__game.staff.find(m => m.id === id)?.salary, said: document.getElementById('card-mood-said')?.textContent ?? '', quit: window.__game.moods.get(id)?.quit }), who.id);
  if (after.salary === who.market && after.quit === undefined && after.said === 'Зарплата поднята') ok(`«${card.raise}» — зарплата ${after.salary}, настроение 37, «собирается уйти» снято`);
  else fail(`«Поднять зарплату»: ${JSON.stringify(after)}`);
  await page.evaluate(() => window.__game.actions.setTab('staff'));
  await page.waitForSelector('#staff-on-duty');
  const row = await page.$$eval('#right .tabbody li', els => els.map(e => (e.textContent ?? '').replace(/\s+/g, ' ').trim()).find(x => x.includes('настроение 37')) ?? '');
  // стрелка — с настроения до планёрки: 29 → 37
  if (row.startsWith('Медсестра') && row.includes('настроение 37 ↑8')) ok(`«Персонал»: «${row}»`);
  else fail(`«Персонал»: «${row}»`);
  await page.evaluate(() => window.__game.actions.setTab(null));

  // ---------------------------------------------------------------- «В другую смену»: меняется с ночной на её месте
  const pair = await page.evaluate(id => {
    const g = window.__game;
    const m = g.staff.find(x => x.id === id);
    const other = g.staff.find(x => x.id !== id && x.room === m.room && x.role === m.role && x.shift === 'night');
    return other ? { other: other.id } : null;
  }, who.id);
  const hint = await page.getAttribute('#card-reshift', 'title').catch(() => '');
  await page.click('#card-reshift');
  await until(id => window.__game.staff.find(m => m.id === id)?.shift === 'night', who.id);
  const swapped = pair ? await page.evaluate(o => window.__game.staff.find(m => m.id === o)?.shift, pair.other) : 'day';
  if (swapped === 'day' && (!pair || /поменяется с: Медсестра/.test(hint ?? ''))) ok(`«В ночную смену» — поменялись сменами${pair ? ` с ${pair.other}` : ''}: «${hint}»`);
  else fail(`«В другую смену»: ${JSON.stringify({ pair, swapped, hint })}`);
  await page.keyboard.press('Escape');

  // ---------------------------------------------------------------- «Уволить» в карточке помещения — с выплатой
  await page.evaluate(r => window.__game.selectRoomId(r), who.room);
  await page.waitForSelector('#card [id^="dismiss-"]', { timeout: 10000 });
  const fire = await page.getAttribute('#card [id^="dismiss-"]', 'title');
  if (/^Уволить — выплата за три смены: [\d\s]+₽$/.test(fire ?? '')) ok(`«Уволить»: «${fire}»`);
  else fail(`подсказка «Уволить»: «${fire}»`);
  await page.keyboard.press('Escape');
}
