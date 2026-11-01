// Сценарий в браузере, часть 14 — энциклопедия (spec docs/specs/2026-10-encyclopedia.md, «Проверки»). Экран начала —
// «Энциклопедия»: окно, оговорка, поиск «пневм» — пневмония, статья по блокам, ссылка — статья признака, «Назад», Esc
// закрывает только окно. Поликлиника с экрана начала (база — та же, что прочитала энциклопедия): карточка лаборатории,
// курсор над названием и F1 — статья помещения; Esc закрывает окно, карточка остаётся; F1 над планом — окно и снова F1 —
// закрыто; часы идут, пока окно открыто. Карта для чтения больного нанятого врача: жалоба — «Что это?» — «Подробнее в
// энциклопедии» — статья признака поверх карты; Esc — окно, карта остаётся. По-английски — разделы по-английски. Снимки —
// `e2e-enc-*.jpg`.
import { join } from 'node:path';
import { headOk, windowHead } from './e2e-lib.mjs';

/** @param {{ page: import('playwright-core').Page, port: number, out: string, ok: (m: string) => void, fail: (m: string) => void, q: string, shots: string }} x */
export async function encyclopediaPart({ page, port, out, ok, fail, q }) {
  const until = (fn, a, ms = 30000) => page.waitForFunction(fn, a, { timeout: ms });
  const flat = s => (s ?? '').replace(/\s+/g, ' ').trim();
  const shot = async name => Math.round((await page.screenshot({ path: join(out, name), type: 'jpeg', quality: 72 })).length / 1024);
  const title = () => page.evaluate(() => (document.getElementById('enc-title')?.textContent ?? '').trim());
  const open = () => page.evaluate(() => !!document.getElementById('enc'));

  // ---------------------------------------------------------------- экран начала: «Энциклопедия»
  // экран начала без живой сцены (spec docs/specs/2026-10-aaa-polish.md): её проверяет часть 7; здесь уходят со страницы, пока
  // она грузится, и загрузчик моделей пишет в консоль об оборванной загрузке
  await page.goto(`http://127.0.0.1:${port}/index.html?q=${q}&lang=ru&backdrop=0`);
  await page.waitForSelector('#start-enc', { timeout: 60000 });
  await page.click('#start-enc');
  await page.waitForSelector('#enc #enc-sec-conditions', { timeout: 30000 });
  const head = await page.evaluate(() => ({
    note: (document.querySelector('#enc .enc-note')?.textContent ?? '').trim(),
    sections: [...document.querySelectorAll('.enc-sections button')].map(b => (b.textContent ?? '').replace(/\s+/g, ' ').trim()),
  }));
  if (/не замена врачу/.test(head.note) && head.sections.length === 7 && !head.sections.some(s => /Подсказки/.test(s))) ok(`экран начала → «Энциклопедия»: ${head.sections.join(', ')}; оговорка «${head.note}»`);
  else fail(`энциклопедия на экране начала: ${JSON.stringify(head)}`);
  await page.fill('#enc-search', 'пневм');
  await page.waitForSelector('#enc-item-cond-pneumonia_cap', { timeout: 10000 });
  const item = flat(await page.textContent('#enc-item-cond-pneumonia_cap'));
  await page.click('#enc-item-cond-pneumonia_cap');
  await until(() => !!document.getElementById('enc-title'));
  const pneumonia = await title();
  const blocks = await page.$$eval('#enc-article .enc-block', els => els.map(e => e.id.replace('enc-b-', '')));
  if (item.startsWith(pneumonia) && ['signs', 'confirm', 'similar', 'treatment', 'where', 'sources'].every(b => blocks.includes(b))) ok(`поиск «пневм» — «${pneumonia}»: ${blocks.join(', ')}`);
  else fail(`статья пневмонии: ${JSON.stringify({ item, pneumonia, blocks })}`);
  const link = await page.$('#enc-b-signs .enc-ref');
  const linked = link ? flat(await link.textContent()) : '';
  await link?.click();
  await until(x => (document.getElementById('enc-title')?.textContent ?? '').trim() !== x, pneumonia);
  const finding = await title();
  await page.click('#enc-back');
  await until(x => (document.getElementById('enc-title')?.textContent ?? '').trim() === x, pneumonia);
  if (finding && linked.startsWith(finding)) ok(`ссылка из «Признаков» — «${finding}», «Назад» — снова «${pneumonia}»`);
  else fail(`ссылка и «Назад»: ${JSON.stringify({ linked, finding })}`);
  ok(`снимок: ${join(out, 'e2e-enc-1-start.jpg')} (${await shot('e2e-enc-1-start.jpg')} КБ)`);
  await page.keyboard.press('Escape');
  await until(() => !document.getElementById('enc'));
  if (await page.$('#start')) ok('Esc — окно закрыто, экран начала на месте');
  else fail('Esc на экране начала закрыл не только окно');

  // ---------------------------------------------------------------- поликлиника: F1 над названием в карточке
  await page.click('#start-poly');
  // второй шаг — роль (spec docs/specs/2026-10-two-ways.md, F4)
  await page.click('#start-role-doctor');
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  const lab = await page.evaluate(() => {
    const g = window.__game;
    return { id: g.plan.rooms.find(r => r.type === 'room.lab').id, name: g.db.rooms['room.lab'].name.ru };
  });
  await page.evaluate(id => window.__game.selectRoomId(id), lab.id);
  await page.waitForSelector('#card-title[data-enc="room.lab"]', { timeout: 10000 });
  await page.hover('#card-title');
  await page.keyboard.press('F1');
  await page.waitForSelector('#enc #enc-title', { timeout: 10000 });
  const roomTitle = await title();
  const t0 = await page.evaluate(() => window.__game.t);
  await page.keyboard.press('Digit3');
  await page.waitForTimeout(1500);
  const t1 = await page.evaluate(() => window.__game.t);
  await page.keyboard.press('Escape');
  await until(() => !document.getElementById('enc'));
  const cardStays = !!(await page.$('#card-title[data-enc="room.lab"]'));
  if (roomTitle === lab.name && cardStays && t1 > t0) ok(`карточка лаборатории, курсор над названием, F1 — «${roomTitle}»; часы идут (${Math.round(t1 - t0)} с игры); Esc — окно закрыто, карточка на месте`);
  else fail(`F1 над помещением: ${JSON.stringify({ roomTitle, lab, cardStays, t: [t0, t1] })}`);
  // пауза — и карточку закрыть её «✕»: за секунды ×3 игра могла открыть своё, и второй Esc закрыл бы его
  await page.keyboard.press('Space');
  await page.click('#card .close');
  await until(() => !document.getElementById('card'));
  // F1 над планом — окно там, где закрыли; снова F1 — закрыто
  const box = await page.$eval('#view', e => {
    const r = e.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height * 0.6 };
  });
  await page.mouse.move(box.x, box.y);
  await page.keyboard.press('F1');
  await page.waitForSelector('#enc #enc-title', { timeout: 10000 });
  const again = await title();
  // строка заголовка (docs/specs/2026-10-clinical-style.md, часть 2): книга, «Энциклопедия», поиск, «Назад», крестик
  const wh = await windowHead(page, '#enc');
  if (headOk(wh, 'book', 'enc-close', true) && wh.title === 'Энциклопедия') ok(`энциклопедия: строка заголовка — значок «${wh.icon}», «${wh.title}», поиск и «Назад», крестик последним`);
  else fail(`строка заголовка энциклопедии: ${JSON.stringify(wh)}`);
  await page.keyboard.press('F1');
  await until(() => !document.getElementById('enc'));
  if (again === lab.name) ok(`F1 над планом — окно на «${again}», где закрыли; снова F1 — закрыто`);
  else fail(`F1 над планом: «${again}»`);

  // ---------------------------------------------------------------- карта для чтения: «Что это?» — «Подробнее»
  const atDoctor = () => {
    const g = window.__game;
    for (const w of g.crowd.walkers.values()) {
      if (w.staff || w.leaving) continue;
      const info = g.pop.info(w.key);
      if (info?.kind === 'patient' && info.by && info.doing === 'office' && !info.walking) return info.id;
    }
    return null;
  };
  await page.keyboard.press('Digit3');
  await until(atDoctor, null, 180000);
  await page.keyboard.press('Space');
  const id = await page.evaluate(atDoctor);
  await page.keyboard.press('Tab');
  await until(x => !!document.getElementById(`pat-open-${x}`), id);
  await page.click(`#pat-open-${id}`);
  await page.waitForSelector('.dcard.read', { timeout: 20000 });
  const said = await page.$('.dcard .said[data-enc]');
  if (!said) fail('в карте для чтения нет жалобы со статьёй');
  else {
    const complaint = await said.getAttribute('data-enc');
    await said.click();
    await page.waitForSelector('#term #term-more', { timeout: 10000 });
    // «Что это?» — значок справки и название; закрывается своими кнопками, крестика нет
    const term = await windowHead(page, '#term');
    if (headOk(term, 'info', 'term-title', false)) ok(`«Что это?»: строка заголовка — значок «${term.icon}», «${term.title}»`);
    else fail(`строка заголовка «Что это?»: ${JSON.stringify(term)}`);
    await page.click('#term-more');
    await page.waitForSelector('#enc #enc-title', { timeout: 10000 });
    const name = await page.evaluate(f => window.__game.db.findings[f]?.name.ru, complaint);
    const got = await title();
    const termGone = !(await page.$('#term'));
    ok(`снимок: ${join(out, 'e2e-enc-2-card.jpg')} (${await shot('e2e-enc-2-card.jpg')} КБ)`);
    await page.keyboard.press('Escape');
    await until(() => !document.getElementById('enc'));
    const cardStays2 = !!(await page.$('.dcard.read'));
    if (got === name && termGone && cardStays2) ok(`карта для чтения: жалоба — «Что это?» — «Подробнее в энциклопедии» — «${got}»; Esc — окно закрыто, карта на месте`);
    else fail(`«Подробнее в энциклопедии»: ${JSON.stringify({ complaint, name, got, termGone, cardStays2 })}`);
    await page.keyboard.press('Escape');
    await until(() => !document.querySelector('.dcard'));
  }

  // ---------------------------------------------------------------- по-английски
  await page.evaluate(() => window.__game.actions.setLang('en'));
  await page.mouse.move(box.x, box.y);
  await page.keyboard.press('F1');
  await page.waitForSelector('#enc #enc-sec-conditions', { timeout: 10000 });
  const en = await page.evaluate(() => [...document.querySelectorAll('.enc-sections button span')].map(e => e.textContent));
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__game.actions.setLang('ru'));
  if (en[0] === 'Diseases' && en.includes('Hospital')) ok(`по-английски: ${en.join(', ')}`);
  else fail(`разделы по-английски: ${JSON.stringify(en)}`);
}
