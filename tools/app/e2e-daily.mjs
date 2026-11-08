// Сценарий в браузере, часть 41 — случай дня (spec docs/specs/2026-11-doctor-shift.md, часть 3). Экран начала: «Для врача» →
// «Случай дня» — второй шаг: 30 дней, сегодня первым, «не сыгран»; строка дня — городская больница с ключом `daily`: в движке
// `meta.solo` и `meta.daily`, кассы нет, ни кнопки стройки, ни «Сохранить» в меню игры; больной дня приходит в 08:00, один.
// Ваш приём — «Итог дня»: итог этой попытки, «Засчитано — первая попытка»; итог записан в хранилище страницы; «Разбор» — карта
// больного; «Сыграть снова» — тот же день, тот же больной; приём снова — засчитана первая попытка; «В меню» — у дня итог.

/** @param {{ page: import('playwright-core').Page, port: number, out: string, ok: (m: string) => void, fail: (m: string) => void, q: string }} x */
export async function dailyPart({ page, port, out, ok, fail, q }) {
  const until = (fn, a, ms = 30000) => page.waitForFunction(fn, a, { timeout: ms });
  const state = () => page.evaluate(() => window.__game.client.save());
  const shot = async name => {
    const buf = await page.screenshot({ path: `${out}/${name}`, type: 'jpeg', quality: 72 });
    return Math.round(buf.length / 1024);
  };
  /** Ваш приём больного дня: позвать, дождаться в кабинете, диагноз, домой, «Завершить приём»; карта закрыта. */
  const play = async () => {
    await page.evaluate(() => window.__game.actions.doctor({ kind: 'autopause', on: false }));
    await page.evaluate(() => window.__game.actions.setSpeed(3));
    let id;
    for (let i = 0; i < 120 && !id; i++) {
      const s = await state();
      id = s.queue.find(x => s.patients[x]?.daily && s.patients[x].status === 'waiting');
      if (!id) await page.waitForTimeout(500);
    }
    if (!id) return { id: null, came: [] };
    const came = Object.keys((await state()).patients);
    await page.evaluate(() => window.__game.actions.setSpeed(0));
    await page.evaluate(x => window.__game.client.doctor({ kind: 'take', id: x }), id);
    await page.evaluate(() => window.__game.actions.setSpeed(3));
    for (let i = 0; i < 120; i++) {
      const s = await state();
      if (s.current === id && (s.meet === undefined || s.meet <= s.t)) break;
      await page.waitForTimeout(500);
    }
    for (const cmd of [{ kind: 'diagnose', id: 'cond.arvi' }, { kind: 'setting', setting: 'home' }, { kind: 'finish' }]) {
      await page.evaluate(([x, c]) => window.__game.client.doctor({ kind: 'case', id: x, cmd: c }), [id, cmd]);
    }
    await page.waitForTimeout(500);
    if (await page.$('#dcard-close')) await page.click('#dcard-close');
    return { id, came };
  };

  // ---------------------------------------------------------------- экран начала: «Для врача» → «Случай дня»
  await page.goto(`http://127.0.0.1:${port}/index.html?q=${q}&lang=ru&seed=5&backdrop=0`);
  await page.waitForSelector('#start-daily', { timeout: 60000 });
  await page.click('#start-daily');
  await page.waitForSelector('#start-daily-step', { timeout: 10000 });
  const rows = await page.$$eval('#start-daily-step button[id^="daily-"]', els => els.map(e => ({ id: e.id, text: (e.textContent ?? '').replace(/\s+/g, ' ').trim() })));
  const today = rows[0]?.id.slice('daily-'.length) ?? '';
  if (rows.length === 30 && rows[0].text.startsWith('Сегодня, ') && rows[1].text.startsWith('Вчера, ') && rows.every(r => r.text.endsWith('не сыгран')))
    ok(`«Случай дня» — 30 дней, сегодня первым: «${rows[0].text}» (снимок ${await shot('e2e-daily-1-days.jpg')} КБ)`);
  else fail(`список дней: ${JSON.stringify(rows.slice(0, 3))} из ${rows.length}`);

  // ---------------------------------------------------------------- день: городская больница, только вы, без сохранений
  await Promise.all([page.waitForURL(/daily=/, { timeout: 30000 }), page.click(`#daily-${today}`)]);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  const keys = new URL(page.url()).searchParams;
  const s0 = await state();
  const ui = await page.evaluate(() => ({ build: !!document.getElementById('build'), cash: !!document.getElementById('cash'), ff: !!document.getElementById('speed-ff') }));
  await page.click('#game-menu-open');
  const save = !!(await page.$('#save-new'));
  await page.click('#game-menu-close');
  if (keys.get('daily') === today && keys.get('hospital') === 'preset' && s0.meta.solo === true && typeof s0.meta.daily === 'number' && s0.economy === undefined && !ui.build && !ui.cash && !ui.ff && !save)
    ok(`день ${today}: городская больница, в движке \`meta.solo\` и \`meta.daily\`, кассы нет; ни стройки, ни кассы, ни перемотки, ни «Сохранить»`);
  else fail(`день: ${JSON.stringify({ url: page.url(), solo: s0.meta.solo, daily: s0.meta.daily, economy: !!s0.economy, ...ui, save })}`);

  // ---------------------------------------------------------------- больной дня и ваш приём — «Итог дня»
  const first = await play();
  if (first.id && first.came.length === 1) ok(`в 08:00 — больной дня, один: ${first.id}`);
  else fail(`больной дня: ${JSON.stringify(first)}`);
  const sum = await page.waitForSelector('#daily-summary', { timeout: 60000 }).then(() => true, () => false);
  const end = await page.evaluate(() => ({
    title: document.getElementById('daily-title')?.textContent ?? '',
    grade: document.getElementById('daily-grade')?.textContent ?? '',
    counted: document.getElementById('daily-counted')?.textContent ?? '',
    speed: window.__game.store.get().speed,
  }));
  const rec = await page.evaluate(d => JSON.parse(localStorage.getItem('bolnitsa.daily') ?? '{}')[d] ?? null, today);
  if (sum && end.title.startsWith('Случай дня · ') && end.grade.startsWith('Итог: ') && end.counted === 'Засчитано — первая попытка.' && end.speed === 0 && rec?.grade)
    ok(`приём закрыт — «${end.title}»: «${end.grade}», «${end.counted}»; итог записан — ${rec.grade} (снимок ${await shot('e2e-daily-2-summary.jpg')} КБ)`);
  else fail(`итог дня: ${JSON.stringify({ sum, ...end, rec })}`);
  // «Разбор» — карта больного дня
  await page.click('#daily-review');
  const card = await until(id => window.__game.store.get().doctor?.card?.id === id, first.id, 15000).then(() => true, () => false);
  if (card) ok('«Разбор» — карта больного дня');
  else fail('«Разбор» не открыл карту');
  if (await page.$('#dcard-close')) await page.click('#dcard-close');

  // ---------------------------------------------------------------- «Сыграть снова» — тот же больной; засчитана первая попытка
  await until(() => !!document.getElementById('daily-again'), null, 10000).catch(() => {});
  await Promise.all([page.waitForURL(u => new URL(u).searchParams.get('seed') !== '5', { timeout: 30000 }), page.click('#daily-again')]);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  const s1 = await state();
  if (new URL(page.url()).searchParams.get('daily') === today && s1.meta.daily === s0.meta.daily) ok('«Сыграть снова» — тот же день, тот же больной');
  else fail(`снова: ${JSON.stringify({ url: page.url(), was: s0.meta.daily, now: s1.meta.daily })}`);
  await play();
  await page.waitForSelector('#daily-summary', { timeout: 60000 }).catch(() => {});
  const again = await page.evaluate(() => document.getElementById('daily-counted')?.textContent ?? '');
  if (again.startsWith('Засчитана первая попытка: ')) ok(`снова — «${again}»`);
  else fail(`снова, итог: «${again}»`);

  // ---------------------------------------------------------------- «В меню» — у дня итог
  await Promise.all([page.waitForURL(u => !new URL(u).searchParams.has('daily'), { timeout: 30000 }), page.click('#daily-menu')]);
  await page.waitForSelector('#start-daily', { timeout: 60000 });
  await page.click('#start-daily');
  await page.waitForSelector('#start-daily-step', { timeout: 10000 });
  const row = await page.evaluate(d => (document.getElementById(`daily-${d}`)?.textContent ?? '').replace(/\s+/g, ' ').trim(), today);
  if (/сыгран: [ABCD], /.test(row)) ok(`«В меню» — у сегодняшнего дня итог: «${row}»`);
  else fail(`строка дня после игры: «${row}»`);
}
