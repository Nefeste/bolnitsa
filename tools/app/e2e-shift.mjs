// Сценарий в браузере, часть 39 — смена врача, часть 2 (spec docs/specs/2026-11-doctor-shift.md). Экран начала: «Для врача» →
// «Смена врача» — второй шаг: поликлиника и городская, у них «смен здесь ещё не было», уровень — только поток и терпение;
// «Начать смену» — поликлиника с ключом `solo`: ни стройки (кнопки нет, B — ничего), ни кассы, ни ряда ролей; в движке
// `meta.solo`, кассы нет. Один ваш приём — «До конца смены» — в 20:00 часы встали, «Итог смены»: пять категорий, «Принято»,
// «Лучший результат»; экран начала после «В меню» — у поликлиники лучший итог; «Новая смена» — та же больница, зерно новое.

/** @param {{ page: import('playwright-core').Page, port: number, out: string, ok: (m: string) => void, fail: (m: string) => void, q: string }} x */
export async function shiftPart({ page, port, out, ok, fail, q }) {
  const until = (fn, a, ms = 30000) => page.waitForFunction(fn, a, { timeout: ms });
  const state = () => page.evaluate(() => window.__game.client.save());
  const hud = () => page.evaluate(() => window.__game.store.get());
  const shot = async name => {
    const buf = await page.screenshot({ path: `${out}/${name}`, type: 'jpeg', quality: 72 });
    return Math.round(buf.length / 1024);
  };

  // ---------------------------------------------------------------- экран начала: «Для врача», второй шаг
  await page.goto(`http://127.0.0.1:${port}/index.html?q=${q}&lang=ru&seed=5&backdrop=0`);
  await page.waitForSelector('#start-shift', { timeout: 60000 });
  const head = await page.$$eval('#start h2', els => els.map(e => e.textContent));
  if (head.includes('Для врача')) ok(`экран начала: раздел «Для врача» — «${await page.textContent('#start-shift b')}»`);
  else fail(`экран начала: разделы ${JSON.stringify(head)}`);
  await page.click('#start-shift');
  await page.waitForSelector('#start-shift-step', { timeout: 10000 });
  const step = await page.evaluate(() => ({
    poly: document.querySelector('#shift-poly span')?.textContent ?? '',
    city: document.querySelector('#shift-preset span')?.textContent ?? '',
    numbers: document.getElementById('manage-numbers')?.textContent ?? '',
  }));
  if (step.poly.includes('смен здесь ещё не было') && step.city.includes('смен здесь ещё не было') && step.numbers === 'поток ×1 · терпение ×1')
    ok(`второй шаг: поликлиника и городская — «смен здесь ещё не было»; уровень — «${step.numbers}» (снимок ${await shot('e2e-shift-1-start.jpg')} КБ)`);
  else fail(`второй шаг: ${JSON.stringify(step)}`);

  // ---------------------------------------------------------------- смена в поликлинике
  await Promise.all([page.waitForURL(/solo=1/, { timeout: 30000 }), page.click('#shift-go')]);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  const keys = new URL(page.url()).searchParams;
  if (keys.get('hospital') === 'poly' && keys.get('solo') === '1' && keys.get('seed') === '5') ok('«Начать смену»: поликлиника, ключ `solo`, зерно из адреса');
  else fail(`адрес смены: ${page.url()}`);
  const s0 = await state();
  const ui = await page.evaluate(() => ({
    build: !!document.getElementById('build'),
    cash: !!document.getElementById('cash'),
    ff: document.getElementById('speed-ff')?.textContent?.trim() ?? '',
    roles: !!document.getElementById('dock-roles'),
  }));
  await page.keyboard.press('KeyB');
  const built = await page.evaluate(() => window.__game.builder.on);
  if (s0.meta.solo === true && s0.economy === undefined && !ui.build && !ui.cash && !ui.roles && !built && ui.ff === 'До конца смены')
    ok('в смене: в движке `meta.solo`, кассы нет; ни кнопки стройки, ни кассы, ни ряда ролей, B — ничего; «До конца смены»');
  else fail(`смена: ${JSON.stringify({ solo: s0.meta.solo, economy: !!s0.economy, ...ui, built })}`);

  // ---------------------------------------------------------------- один ваш приём
  await page.evaluate(() => window.__game.actions.doctor({ kind: 'autopause', on: false }));
  await page.evaluate(() => window.__game.actions.setSpeed(12));
  let id;
  for (let i = 0; i < 120 && !id; i++) {
    const s = await state();
    id = s.queue.find(x => s.patients[x] && s.patients[x].kind !== 'ambulance');
    if (!id) await page.waitForTimeout(500);
  }
  await page.evaluate(() => window.__game.actions.setSpeed(0));
  if (id) {
    await page.evaluate(x => window.__game.client.doctor({ kind: 'take', id: x }), id);
    await page.evaluate(() => window.__game.actions.setSpeed(3));
    // дошёл до кабинета — приём начался
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
    const s1 = await state();
    if (s1.patients[id]?.closed && !s1.patients[id].closed.by) ok(`ваш приём закрыт: ${id}`);
    else fail(`приём ${id} не закрыт`);
  } else fail('за час никто не пришёл');

  // ---------------------------------------------------------------- «До конца смены» — 20:00, «Итог смены»
  await page.click('#speed-ff');
  for (let i = 0; i < 40 && !(await page.$('#shift-summary')); i++) {
    // остановилось на событии автопаузы — дальше
    if (!(await page.evaluate(() => window.__game.store.get().ff))) await page.click('#speed-ff').catch(() => {});
    await page.waitForTimeout(3000);
  }
  const sum = await page.waitForSelector('#shift-summary', { timeout: 300000 }).then(() => true, () => false);
  const end = await page.evaluate(() => ({
    t: window.__game.t,
    speed: window.__game.store.get().speed,
    title: document.getElementById('shift-title')?.textContent ?? '',
    overall: document.getElementById('shift-overall')?.textContent ?? '',
    grades: [...document.querySelectorAll('#shift-grades dd')].map(e => e.textContent),
    seen: document.getElementById('shift-seen')?.textContent ?? '',
    best: document.getElementById('shift-best')?.textContent ?? '',
  }));
  if (sum && end.t === 72000 && end.speed === 0 && end.title === 'Итог смены · Поликлиника' && end.grades.length === 5 && end.seen.startsWith('Принято: ') && end.best.startsWith('Лучший результат'))
    ok(`20:00 — часы встали, «${end.title}»: «${end.overall}», ${end.grades.join(' ')}, «${end.seen}», «${end.best}» (снимок ${await shot('e2e-shift-2-summary.jpg')} КБ)`);
  else fail(`итог смены: ${JSON.stringify({ sum, ...end })}`);
  // скорость после конца смены не включить
  await page.evaluate(() => window.__game.actions.setSpeed(3));
  if ((await hud()).speed === 0 && (await page.evaluate(() => window.__game.t)) === 72000) ok('после 20:00 часы не идут');
  else fail('после конца смены часы пошли');
  const rec = await page.evaluate(() => JSON.parse(localStorage.getItem('bolnitsa.records') ?? '{}'));
  if (rec['poly:normal']?.grade && rec['poly:normal'].seen >= 1) ok(`рекорд записан: поликлиника, «Обычно» — ${rec['poly:normal'].grade}, балл ${rec['poly:normal'].points}`);
  else fail(`рекорд: ${JSON.stringify(rec)}`);

  // ---------------------------------------------------------------- «Новая смена» — та же больница, зерно новое
  await Promise.all([page.waitForURL(u => new URL(u).searchParams.get('seed') !== '5', { timeout: 30000 }), page.click('#shift-again')]);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  const again = new URL(page.url()).searchParams;
  const s2 = await state();
  if (again.get('hospital') === 'poly' && again.get('solo') === '1' && again.get('seed') !== '5' && s2.meta.solo === true && s2.meta.seed === Number(again.get('seed')))
    ok(`«Новая смена»: снова поликлиника, зерно новое — ${again.get('seed')}`);
  else fail(`«Новая смена»: ${page.url()}`);

  // ---------------------------------------------------------------- «В меню» — у поликлиники лучший итог
  await Promise.all([page.waitForURL(u => !new URL(u).searchParams.has('solo'), { timeout: 30000 }), page.evaluate(() => window.__game.actions.newGame())]);
  await page.waitForSelector('#start-shift', { timeout: 60000 });
  await page.click('#start-shift');
  await page.waitForSelector('#shift-poly', { timeout: 10000 });
  const card = await page.textContent('#shift-poly span');
  if (card.includes(`лучший: ${rec['poly:normal']?.grade}`)) ok(`экран начала: у поликлиники — «${card}»`);
  else fail(`карточка поликлиники: «${card}»`);

  // ---------------------------------------------------------------- городская на «Трудно»: уровень — в движке, рекорд — свой
  await page.click('#shift-preset');
  await page.click('#manage-hard');
  const hardCard = await page.textContent('#shift-poly span');
  await Promise.all([page.waitForURL(/solo=1/, { timeout: 30000 }), page.click('#shift-go')]);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  const k3 = new URL(page.url()).searchParams;
  const s3 = await state();
  if (hardCard.includes('смен здесь ещё не было') && k3.get('hospital') === 'preset' && k3.get('manage') === 'hard' && s3.meta.solo === true && s3.meta.manage === 'hard' && s3.economy === undefined)
    ok('городская на «Трудно»: у поликлиники на этом уровне смен не было; в движке `meta.solo` и «Трудно», кассы нет');
  else fail(`городская на «Трудно»: ${JSON.stringify({ hardCard, url: page.url(), solo: s3.meta.solo, manage: s3.meta.manage })}`);
}
