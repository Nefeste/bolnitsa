// Сценарий в браузере, часть 36 — сценарий 2 «Приёмное» (spec docs/specs/2026-11-scenario-2.md, «Часть 2б: как сделано»).
// Экран начала: в «Кампании» вторая карточка — «Сценарий 2. Приёмное». В игре: готовая амбулатория, касса 600 000 ₽, ваш
// кабинет — первый, часы стоят; письма «в начале» — наставница с «Без обучения» и Ян Новак; галочки «Пусть сортирует
// медсестра» нет, пока нет смотровой. Смотровая — первый шаг порядка стройки, командой окна, «С персоналом»; галочка видна и
// снята — сортируете вы. Через две минуты — первый заданный, по скорой: автопауза, письмо «лист передачи», в листе —
// подсказка наставницы «Лист передачи» со статьёй; «Понятно», «Красный» — он ваш, в «Ждут вас». «До утра» — каждого
// привезённого сортирует лист; к вечеру — письмо «ночь»: врача на ночь нет. Планёрка: «Письма» — после первых суток, строка
// «Сортировка». Снимки — `e2e-emergency-*.jpg`.
import { join } from 'node:path';

const SC = 'scenario.emergency';

/** @param {{ page: import('playwright-core').Page, port: number, out: string, ok: (m: string) => void, fail: (m: string) => void, q: string, shots: string }} x */
export async function emergencyPart({ page, port, out, ok, fail, q, shots }) {
  const until = (fn, a, ms = 30000) => page.waitForFunction(fn, a, { timeout: ms });
  const flat = s => (s ?? '').replace(/[\s  ]+/g, ' ').trim();
  const shot = async name => {
    if (shots) {
      await page.evaluate(x => window.__game.showQuality(x), shots);
      await page.waitForTimeout(400);
    }
    const buf = await page.screenshot({ path: join(out, name), type: 'jpeg', quality: 72 });
    if (shots) await page.evaluate(x => window.__game.showQuality(x), q);
    return Math.round(buf.length / 1024);
  };
  /** Команда стройки — тем же путём, что инструменты окна. */
  const site = cmd => page.evaluate(c => window.__game.client.command({ kind: 'site', cmd: c }), cmd);
  const card = () =>
    page.evaluate(() => {
      const el = document.getElementById('letter');
      return el ? { id: el.dataset.letter, text: el.innerText.replace(/\s+/g, ' '), off: !!document.getElementById('letter-off') } : null;
    });
  /** Ждать письмо `id` в карточке и прочитать его «Понятно». */
  const letter = async id => {
    const got = await until(x => document.getElementById('letter')?.dataset.letter === x, id, 30000).then(() => true, () => false);
    const c = await card();
    if (got) ok(`письмо «${id}»: «${c.text.slice(0, 110)}…»`);
    else fail(`письмо «${id}» не пришло; в карточке: ${JSON.stringify(c)}; пришли: ${JSON.stringify(await page.evaluate(() => window.__game.scenario.view?.letters))}`);
    if (got) {
      await page.click('#letter-ok');
      await until(x => document.getElementById('letter')?.dataset.letter !== x, id, 5000).catch(() => fail(`письмо «${id}» не закрылось`));
    }
    return c;
  };
  const handover = () => page.evaluate(() => window.__game.store.get().doctor?.state?.handover ?? []);

  // ---------------------------------------------------------------- экран начала: вторая карточка «Кампании»
  await page.goto(`http://127.0.0.1:${port}/index.html?q=${q}&lang=ru&seed=5&backdrop=0`);
  await page.waitForSelector('#start-scenario-emergency', { timeout: 60000 });
  const cards = await page.$$eval('#start [id^="start-scenario-"]', els => els.map(e => e.id));
  const cardText = flat(await page.innerText('#start-scenario-emergency'));
  if (cards[0] === 'start-scenario-ambulatory' && cards[1] === 'start-scenario-emergency' && cardText.startsWith('Сценарий 2. Приёмное')) {
    ok(`экран начала: вторая карточка «Кампании» — «${cardText.slice(0, 140)}»`);
  } else fail(`экран начала: карточки ${JSON.stringify(cards)}, «${cardText}»`);
  await page.click('#start-scenario-emergency');
  await page.waitForSelector('#start-scenario #difficulty', { timeout: 10000 });
  await page.click('#start-go');
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  await until(x => window.__game.scenario.view?.id === x, SC);
  const begin = await page.evaluate(() => {
    const g = window.__game;
    return { cash: g.store.get().economy?.cash, rooms: g.hospital.site.rooms.length, first: g.hospital.site.rooms[0]?.id, mine: g.hospital.site.mine, paused: g.speed === 0 };
  });
  if (begin.cash === 600000 && begin.rooms === 10 && begin.mine === begin.first && begin.paused) ok('сценарий начат: готовая амбулатория — 10 помещений, ваш кабинет — первый, касса 600 000 ₽, часы стоят');
  else fail(`начало сценария 2: ${JSON.stringify(begin)}`);

  // ---------------------------------------------------------------- письма «в начале»; галочки нет, пока нет смотровой
  const hello = await letter('hello');
  if (!hello?.off) fail('первое письмо — без «Без обучения»');
  await letter('budget');
  if (!(await page.$('#dock-nurse-sorts'))) ok('смотровой нет — нет и галочки «Пусть сортирует медсестра»');
  else fail('галочка «Пусть сортирует медсестра» — без смотровой');

  // ---------------------------------------------------------------- смотровая — первый шаг порядка стройки
  await site({ kind: 'ready', type: 'room.emergency', size: 'M', x: 42, y: 27, rot: 2, staff: true });
  await site({ kind: 'done' });
  await until(() => !!document.querySelector('#dock-nurse-sorts'), null, 15000);
  const sorts = await page.evaluate(() => ({ checked: document.getElementById('dock-nurse-sorts')?.checked, sorts: window.__game.store.get().doctor?.state?.sorts }));
  if (sorts.checked === false && sorts.sorts === true) ok('смотровая работает — галочка «Пусть сортирует медсестра» видна и снята: сортируете вы');
  else fail(`галочка после смотровой: ${JSON.stringify(sorts)}`);

  // ---------------------------------------------------------------- первый заданный по скорой: автопауза, письмо, лист
  await page.evaluate(() => window.__game.actions.setSpeed(3));
  await until(() => (window.__game.store.get().doctor?.state?.handover.length ?? 0) > 0, null, 120000);
  await letter('sheet');
  const first = (await handover())[0];
  const stopped = await page.evaluate(() => window.__game.speed === 0);
  if (stopped) ok(`привезли первого — ${first.who}: автопауза`);
  else fail('привезли первого, а часы идут');
  await page.click(`#dock-sheet-${first.id}`);
  await page.waitForSelector('#dsheet', { timeout: 10000 });
  const tip = await until(() => {
    const el = document.getElementById('dsheet-tip');
    return el ? { id: el.dataset.tip, text: el.innerText.replace(/\s+/g, ' '), see: [...el.querySelectorAll('.tipsee button')].map(b => b.dataset.enc) } : null;
  }, null, 10000).then(h => h.jsonValue(), () => null);
  if (tip?.id === 'handover' && tip.text.includes('Лист передачи') && tip.see.includes('room.emergency')) {
    ok(`в листе — подсказка наставницы «Лист передачи» со статьёй «${tip.see.join(', ')}» (снимок ${await shot('e2e-emergency-sheet.jpg')} КБ)`);
  } else fail(`подсказка в листе: ${JSON.stringify(tip)}`);
  await page.click('#dsheet #tip-ok');
  await until(() => !document.getElementById('dsheet-tip'), null, 5000).then(() => ok('«Понятно» — подсказка закрыта, лист открыт'), () => fail('подсказка в листе не закрылась'));
  await page.click('#dsheet-red');
  await until(id => (window.__game.store.get().doctor?.state?.yours ?? []).some(r => r.id === id), first.id, 15000).then(
    () => ok(`«Красный» — ${first.who} в «Ждут вас»: заданного больного зовёте вы`),
    () => fail(`после «Красный» заданный не в «Ждут вас»: ${JSON.stringify(first)}`),
  );
  if (await page.$('#dsheet')) await page.keyboard.press('Escape');

  // ---------------------------------------------------------------- «До утра»: сортировка каждого привезённого, письмо «ночь»
  const t0 = Date.now();
  let sorted = 0;
  await page.click('#speed-ff');
  for (;;) {
    const h = await page.evaluate(() => ({
      open: window.__game.store.get().economy?.open ?? false, ff: window.__game.ff, speed: window.__game.speed, card: window.__game.doctor.open,
      letter: document.getElementById('letter')?.dataset.letter ?? '', rows: (window.__game.store.get().doctor?.state?.handover ?? []).map(r => r.id),
    }));
    if (h.open || Date.now() - t0 > 300000) break;
    if (h.letter) await page.click('#letter-ok');
    else if (h.rows.length > 0) {
      if (!(await page.$('#dsheet'))) await page.click(`#dock-sheet-${h.rows[0]}`);
      await page.click('#dsheet-yellow').catch(() => {});
      sorted++;
    } else if (h.card) await page.keyboard.press('Escape');
    else if (!h.ff && h.speed === 0) await page.click('#speed-ff');
    await page.waitForTimeout(200);
  }
  const letters = await page.evaluate(() => (window.__game.scenario.view?.letters ?? []).map(l => l.id));
  if (letters.includes('night')) ok(`«До утра»: привезённых по листу — ${sorted}; к вечеру — письмо «ночь»: врача на ночь нет`);
  else fail(`«До утра»: письма ${JSON.stringify(letters)}, отсортировано ${sorted}`);

  // ---------------------------------------------------------------- планёрка: «Письма» и сортировка
  await page.waitForSelector('#meeting', { timeout: 10000 });
  const meet = flat(await page.innerText('#meet-letters', { timeout: 10000 }).catch(() => ''));
  const sortLine = flat(await page.innerText('#meet-sorting').catch(() => ''));
  if (/Первые сутки с приёмным позади/.test(meet)) ok(`планёрка, «Письма»: «${meet.slice(0, 120)}…»`);
  else fail(`планёрка, «Письма»: «${meet.slice(0, 300)}»`);
  if (/^сортировка привезённых: верно \d+ из \d+/.test(sortLine)) ok(`планёрка: «${sortLine.slice(0, 200)}» (снимок ${await shot('e2e-emergency-meeting.jpg')} КБ)`);
  else fail(`планёрка, строка сортировки: «${sortLine}»`);
  await page.evaluate(() => window.__game.actions.money({ kind: 'close' }));
  await until(() => !window.__game.store.get().economy?.open, null, 10000);
}
