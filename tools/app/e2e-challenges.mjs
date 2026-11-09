// Сценарий в браузере, часть 42 — испытания (spec docs/specs/2026-11-challenges.md, часть 2). Экран начала: «Испытания» → второй
// шаг — шесть испытаний, у каждого «ещё не играли»; «Кто вы» — «Главврач». «Сто пациентов» — амбулатория сценария 1 с ключами
// `challenge` и `role`: в движке `meta.challenge`, поток сами 10 в час и касса 500 000 ₽; стройка есть, «Сложности» в «Настройках»
// нет. «До утра» — не дальше 20:00: «Итог испытания» — оценка, «Приняты — врач позвал до конца: N из 100», «Пройдено» или нет,
// лучший результат; рекорд
// — в хранилище страницы. «Ещё раз» — то же испытание с новым зерном и той же ролью; «В меню» — у испытания лучший итог. «Одна
// ночь» — сразу 20:00, вы один, сортируете вы, ни стройки, ни кассы, «До конца испытания». «Только по показаниям» — вверху
// «Без показаний: 0 из 2».

/** @param {{ page: import('playwright-core').Page, port: number, out: string, ok: (m: string) => void, fail: (m: string) => void, q: string }} x */
export async function challengesPart({ page, port, out, ok, fail, q }) {
  const state = () => page.evaluate(() => window.__game.client.save());
  const shot = async name => {
    const buf = await page.screenshot({ path: `${out}/${name}`, type: 'jpeg', quality: 72 });
    return Math.round(buf.length / 1024);
  };
  const step = async () => {
    await page.goto(`http://127.0.0.1:${port}/index.html?q=${q}&lang=ru&seed=4&backdrop=0`);
    await page.waitForSelector('#start-challenges', { timeout: 60000 });
    await page.click('#start-challenges');
    await page.waitForSelector('#start-challenges-step', { timeout: 10000 });
  };
  const rowText = id => page.evaluate(x => (document.getElementById(x)?.textContent ?? '').replace(/\s+/g, ' ').trim(), id);

  // ---------------------------------------------------------------- экран начала: «Испытания», шесть, «ещё не играли»
  await step();
  const rows = await page.$$eval('#start-challenges-step button[id^="challenge-"]', els => els.map(e => ({ id: e.id, text: (e.textContent ?? '').replace(/\s+/g, ' ').trim() })));
  const ids = rows.map(r => r.id);
  if (JSON.stringify(ids) === JSON.stringify(['challenge-flu', 'challenge-hundred', 'challenge-night', 'challenge-debt', 'challenge-indicated', 'challenge-xray']) && rows.every(r => r.text.endsWith('ещё не играли')))
    ok(`«Испытания» — шесть, по порядку, у каждого «ещё не играли»: «${rows[0].text.slice(0, 60)}…» (снимок ${await shot('e2e-challenges-1-list.jpg')} КБ)`);
  else fail(`список испытаний: ${JSON.stringify(rows)}`);

  // ---------------------------------------------------------------- «Сто пациентов» за «Главврача»
  await page.click('#start-challenge-role-chief');
  await Promise.all([page.waitForURL(/challenge=/, { timeout: 30000 }), page.click('#challenge-hundred')]);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  const keys = new URL(page.url()).searchParams;
  const s0 = await state();
  const ui = await page.evaluate(() => ({ build: !!document.getElementById('build'), cash: !!document.getElementById('cash') }));
  // «Настройки» — из меню игры (spec docs/specs/2026-10-settings.md)
  await page.click('#game-menu-open');
  await page.click('#settings-open');
  await page.waitForSelector('#settings', { timeout: 5000 }).catch(() => {});
  const subs = await page.$$eval('#settings h3.sub', els => els.map(e => e.textContent ?? ''));
  if (await page.$('#settings-close')) await page.click('#settings-close');
  if (
    keys.get('challenge') === 'challenge.hundred' && keys.get('role') === 'chief' && s0.meta.challenge === 'challenge.hundred' && s0.flow.perHour === 10 &&
    (s0.economy?.cash ?? 0) === 500000 && ui.build && ui.cash && !subs.some(x => x.includes('Сложность'))
  )
    ok('«Сто пациентов» — амбулатория: в движке `meta.challenge`, сами 10 в час, касса 500 000 ₽; стройка и касса есть, «Сложности» в «Настройках» нет');
  else fail(`испытание: ${JSON.stringify({ url: page.url(), challenge: s0.meta.challenge, flow: s0.flow, cash: s0.economy?.cash, ...ui, subs })}`);

  // «До утра» — не дальше конца испытания: в 20:00 — «Итог испытания»
  await page.evaluate(() => window.__game.actions.doctor({ kind: 'autopause', on: false }));
  for (let i = 0; i < 40 && !(await page.$('#challenge-summary')); i++) {
    await page.evaluate(() => window.__game.actions.untilMorning());
    await page.waitForTimeout(3000);
  }
  const sum = await page.waitForSelector('#challenge-summary', { timeout: 60000 }).then(() => true, () => false);
  const end = await page.evaluate(() => ({
    title: document.getElementById('challenge-title')?.textContent ?? '',
    grade: document.getElementById('challenge-grade')?.textContent ?? '',
    value: document.getElementById('challenge-value')?.textContent ?? '',
    passed: document.getElementById('challenge-passed')?.textContent ?? '',
    best: document.getElementById('challenge-best')?.textContent ?? '',
    t: window.__game.t,
    speed: window.__game.store.get().speed,
  }));
  const rec = await page.evaluate(() => JSON.parse(localStorage.getItem('bolnitsa.challenges') ?? '{}')['challenge.hundred'] ?? null);
  if (
    sum && end.title === 'Итог испытания · Сто пациентов' && /^Итог: [ABCD]$/.test(end.grade) && /^Приняты — врач позвал до конца: \d+ из 100$/.test(end.value) && /^(Пройдено\.|Не пройдено)/.test(end.passed) &&
    end.best === 'Лучший результат этого испытания.' && end.t <= 20 * 3600 && end.speed === 0 && rec?.grade
  )
    ok(`20:00 — «${end.title}»: «${end.grade}», «${end.value}», «${end.passed}»; рекорд записан — ${rec.grade} (снимок ${await shot('e2e-challenges-2-summary.jpg')} КБ)`);
  else fail(`итог испытания: ${JSON.stringify({ sum, ...end, rec })}`);

  // ---------------------------------------------------------------- «Ещё раз» — то же испытание, новое зерно, та же роль
  await Promise.all([page.waitForURL(u => new URL(u).searchParams.get('seed') !== '4', { timeout: 30000 }), page.click('#challenge-again')]);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  const again = new URL(page.url()).searchParams;
  const s1 = await state();
  if (again.get('challenge') === 'challenge.hundred' && again.get('role') === 'chief' && s1.meta.challenge === 'challenge.hundred' && s1.meta.seed !== s0.meta.seed) ok('«Ещё раз» — то же испытание и роль, зерно — новое');
  else fail(`ещё раз: ${JSON.stringify({ url: page.url(), was: s0.meta.seed, now: s1.meta.seed })}`);

  // ---------------------------------------------------------------- «В меню» — у испытания лучший итог
  await step();
  const row = await rowText('challenge-hundred');
  if (/лучший: [ABCD], приняты \d+ — (пройдено|не пройдено)$/.test(row)) ok(`у «Ста пациентов» — лучший итог: «${row.slice(-40)}»`);
  else fail(`строка испытания после игры: «${row}»`);

  // ---------------------------------------------------------------- «Одна ночь»: сразу 20:00, вы один, сортируете вы
  await Promise.all([page.waitForURL(/challenge=challenge\.night/, { timeout: 30000 }), page.click('#challenge-night')]);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  const n0 = await state();
  const nui = await page.evaluate(() => ({ build: !!document.getElementById('build'), cash: !!document.getElementById('cash'), ff: document.getElementById('speed-ff')?.textContent?.trim() ?? '' }));
  if (n0.t === 20 * 3600 && n0.meta.solo === true && n0.meta.sorts === true && n0.economy === undefined && !nui.build && !nui.cash && nui.ff === 'До конца испытания')
    ok('«Одна ночь» — часы сразу в 20:00, вы один и сортируете вы; ни стройки, ни кассы, «До конца испытания»');
  else fail(`одна ночь: ${JSON.stringify({ t: n0.t, solo: n0.meta.solo, sorts: n0.meta.sorts, economy: !!n0.economy, ...nui })}`);

  // ---------------------------------------------------------------- «Только по показаниям»: вверху — «Без показаний: 0 из 2»
  await step();
  await Promise.all([page.waitForURL(/challenge=challenge\.indicated/, { timeout: 30000 }), page.click('#challenge-indicated')]);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  const audit = await page.waitForSelector('#audit', { timeout: 30000 }).then(e => e.textContent(), () => '');
  if (audit === 'Без показаний: 0 из 2') ok(`«Только по показаниям» — вверху «${audit}» (снимок ${await shot('e2e-challenges-3-audit.jpg')} КБ)`);
  else fail(`строка «Без показаний»: «${audit}»`);

  // ---------------------------------------------------------------- «Рентген сломался» (spec docs/specs/2026-11-technicians.md, часть 3)
  // за «Главврача»: в 09:00 рентген встаёт; в 20:00 — «Итог испытания» со снимками за смену
  await step();
  await page.click('#start-challenge-role-chief');
  await Promise.all([page.waitForURL(/challenge=challenge\.xray/, { timeout: 30000 }), page.click('#challenge-xray')]);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  await page.evaluate(() => window.__game.actions.doctor({ kind: 'autopause', on: false }));
  await page.keyboard.press('Digit3');
  await page.waitForFunction(() => window.__game.t >= 9 * 3600 + 120, null, { timeout: 60000 }).catch(() => {});
  await page.evaluate(() => window.__game.setSpeed(0));
  const x9 = await page.evaluate(() => window.__game.repairs.filter(d => d.eq.startsWith('eq.xray')).map(d => ({ broken: !!d.broken, since: d.broken?.since })));
  if (x9.length > 0 && x9.every(d => d.broken && d.since === 9 * 3600)) ok(`«Рентген сломался»: в 09:00 рентген встал (${x9.length} апп.)`);
  else fail(`«Рентген сломался» в 09:00: ${JSON.stringify(x9)}`);
  for (let i = 0; i < 40 && !(await page.$('#challenge-summary')); i++) {
    await page.evaluate(() => window.__game.actions.untilMorning());
    await page.waitForTimeout(3000);
  }
  await page.waitForSelector('#challenge-summary', { timeout: 60000 }).catch(() => {});
  const xv = await page.evaluate(() => ({ title: document.getElementById('challenge-title')?.textContent ?? '', value: document.getElementById('challenge-value')?.textContent ?? '' }));
  if (xv.title === 'Итог испытания · Рентген сломался' && /^Рентгеновских снимков за смену: \d+$/.test(xv.value)) ok(`20:00 — «${xv.title}»: «${xv.value}»`);
  else fail(`итог «Рентген сломался»: ${JSON.stringify(xv)}`);
}
