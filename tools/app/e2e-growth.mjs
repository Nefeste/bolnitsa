// Сценарий в браузере, часть 18 — рост, учёба и болезнь персонала (spec docs/specs/2026-10-staff-mood.md, разделы 3–5,
// «Проверки»). Городская больница; медсестре — 19 смен с последней ступени, другому — учёба, что кончается к первой планёрке
// (снимок движка); «До утра» — на планёрке «Персонал»: медсестра выросла до навыка 4, «Поднять зарплату» прямо в строке;
// второй вернулся с учёбы; кто болеет — строкой. Сцена при этом не пересобирается. Карточка выросшей — «Навык 4 — до навыка 5:
// 20 смен»; третьему — «Отправить учиться»: в карточке «на учёбе — вернётся утром дня 5», во вкладке «Персонал» — «учится».
// Снимок — `e2e-growth-1-meeting.jpg`.
import { join } from 'node:path';

/** @param {{ page: import('playwright-core').Page, port: number, out: string, ok: (m: string) => void, fail: (m: string) => void, q: string, shots: string }} x */
export async function growthPart({ page, port, out, ok, fail, q, shots }) {
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

  // ---------------------------------------------------------------- снимок движка: медсестре — 19 смен, другому — учёба
  const who = await page.evaluate(async () => {
    const g = window.__game;
    const s = await g.client.save();
    const working = s.staff.filter(m => m.shift === 'day' && m.room !== undefined && m.skill < 5);
    const nurse = working.find(m => m.role === 'role.nurse');
    const back = working.find(m => m !== nurse && m.role !== 'role.nurse');
    nurse.days = 19;
    back.away = { why: 'study', until: 32 * 3600 };
    g.client.load(s);
    return { nurse: nurse.id, salary: nurse.salary, back: back.id, backSkill: back.skill };
  });
  await until(id => window.__game.staff.find(m => m.id === id)?.away?.why === 'study', who.back);
  ok(`медсестра ${who.nurse}: 19 смен с последней ступени; ${who.back} — на учёбе до первой планёрки`);

  // ---------------------------------------------------------------- «До утра»: планёрка, «Персонал»; сцена та же
  const layout = await page.evaluate(() => {
    window.__layoutBefore = window.__game.layout;
    return true;
  });
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
  if (/выросл?а? до навыка 4 — зарплата прежняя, ниже рынка: поднимите/.test(staffText)) ok(`планёрка, «Персонал»: «${staffText.slice(0, 200)}» (${Math.round((Date.now() - t0) / 1000)} с)`);
  else fail(`планёрка без «вырос»: «${staffText}»`);
  if (/вернул(ся|ась) с учёбы — навык \d/.test(staffText)) ok('вернувшийся с учёбы — строкой планёрки');
  else fail(`нет «вернулся с учёбы»: «${staffText}»`);
  const sick = (staffText.match(/болеет — сегодня на смену не выйдет/g) ?? []).length;
  ok(`болеют сегодня: ${sick} (по зерну)`);
  const same = await page.evaluate(() => window.__game.layout === window.__layoutBefore);
  if (layout && same) ok('рост, учёба и болезнь — без пересборки сцены');
  else fail('сцена пересобрана из-за перемен в штате');
  ok(`снимок планёрки: ${join(out, 'e2e-growth-1-meeting.jpg')} (${await shot('e2e-growth-1-meeting.jpg')} КБ)`);

  // ---------------------------------------------------------------- «Поднять зарплату» в строке планёрки
  const btn = `#meet-raise-${who.nurse}`;
  await page.waitForSelector(btn, { timeout: 10000 });
  const label = await text(btn);
  await page.click(btn);
  await until(([id, was]) => (window.__game.staff.find(m => m.id === id)?.salary ?? was) > was, [who.nurse, who.salary]);
  const raised = await page.evaluate(([id, sel]) => ({ salary: window.__game.staff.find(m => m.id === id)?.salary, button: document.querySelector(sel)?.textContent ?? '' }), [who.nurse, btn]);
  if (raised.button === 'Зарплата поднята') ok(`«${label}» на планёрке — зарплата ${raised.salary}`);
  else fail(`«Поднять зарплату» на планёрке: ${JSON.stringify(raised)}`);
  await page.click('#meeting-close');
  await until(() => !window.__game.store.get().economy?.open);
  await page.evaluate(() => window.__game.setSpeed(0));

  // ---------------------------------------------------------------- карточка выросшей: навык и до следующего
  await page.evaluate(id => window.__game.actions.select(`s:${id}`), who.nurse);
  await page.waitForSelector('#card-mood', { timeout: 10000 });
  const card = flat(await page.textContent('#card'));
  if (/Навык\s*4 — до навыка 5: 20 смен/.test(card)) ok(`карточка: «${card.match(/Навык\s*4[^Н]*/)?.[0] ?? ''}»`);
  else fail(`карточка выросшей: «${card.slice(0, 300)}»`);
  await page.keyboard.press('Escape');

  // ---------------------------------------------------------------- «Отправить учиться»
  const student = await page.evaluate(([a, b]) => window.__game.staff.find(m => m.shift === 'day' && m.room !== undefined && m.skill < 5 && !m.away && m.id !== a && m.id !== b)?.id, [who.nurse, who.back]);
  await page.evaluate(id => window.__game.actions.select(`s:${id}`), student);
  await page.waitForSelector('#card-study', { timeout: 10000 });
  const studyLabel = await text('#card-study');
  await page.click('#card-study');
  await until(id => window.__game.staff.find(m => m.id === id)?.away?.why === 'study', student);
  await until(() => /на учёбе — вернётся утром дня \d+/.test(document.getElementById('card')?.textContent ?? ''));
  const studyCard = flat(await page.textContent('#card'));
  ok(`«${studyLabel}» — «${studyCard.match(/на учёбе — вернётся утром дня \d+/)?.[0]}»`);
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__game.actions.setTab('staff'));
  await page.waitForSelector('#staff-on-duty');
  const rows = await page.$$eval('#right .tabbody li', els => els.map(e => (e.textContent ?? '').replace(/\s+/g, ' ').trim()));
  const row = rows.find(x => x.includes('учится')) ?? '';
  if (row && rows.some(x => x.includes('навык 4'))) ok(`«Персонал»: «${row}»`);
  else fail(`«Персонал»: ${JSON.stringify(rows.slice(0, 6))}`);
  await page.evaluate(() => window.__game.actions.setTab(null));
}
