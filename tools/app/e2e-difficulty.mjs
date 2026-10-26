// Сценарий в браузере, часть 27 — сложность (spec docs/specs/2026-10-difficulty.md, часть 2, «Проверки»; решения владельца
// #135–#137). Второй шаг экрана начала: «Управление» — «Обычно», мягкий режим выключен; под кнопками — что меняет уровень и
// его числа с кассой начала этой больницы. «Спокойно» и мягкий режим — ключи адреса `manage=calm&soft=1`, игра на этом
// уровне: в движке `meta.manage` и `meta.soft`, касса начала — как на экране начала, предел минуса — 500 000, зарплата в
// карточке помещения — по уровню. «Настройки»: тот же выбор; «Трудно» — с этой минуты: движок, предел минуса, зарплата в
// карточке; мягкий режим снят. Строка сохранения — уровень. Сценарий 1 — свой второй шаг: часть 24. Снимки —
// `e2e-difficulty-*.jpg`.
import { join } from 'node:path';

/** @param {{ page: import('playwright-core').Page, port: number, out: string, ok: (m: string) => void, fail: (m: string) => void, q: string, shots: string }} x */
export async function difficultyPart({ page, port, out, ok, fail, q, shots }) {
  const until = (fn, a, ms = 30000) => page.waitForFunction(fn, a, { timeout: ms });
  const flat = s => (s ?? '').replace(/\s+/g, ' ').trim();
  /** «1 381 ₽» → 1381. */
  const rub = s => Number((s.match(/(\d[\d\s]*)\s?₽/)?.[1] ?? '').replace(/[^\d]/g, ''));
  /** Снимок: JPEG, в качестве `--shots` (для документов) или как есть; на экране начала игры ещё нет. */
  const shot = async name => {
    const game = await page.evaluate(() => !!window.__game);
    if (shots && game) {
      await page.evaluate(x => window.__game.showQuality(x), shots);
      await page.waitForTimeout(400);
    }
    const buf = await page.screenshot({ path: join(out, name), type: 'jpeg', quality: 72 });
    if (shots && game) await page.evaluate(x => window.__game.showQuality(x), q);
    return Math.round(buf.length / 1024);
  };
  /** Кнопки уровня и галочка: какой уровень нажат, отмечен ли мягкий режим. */
  const choice = () =>
    page.evaluate(() => ({
      on: ['calm', 'normal', 'hard'].filter(m => document.getElementById(`manage-${m}`)?.classList.contains('on')),
      soft: /** @type {HTMLInputElement | null} */ (document.getElementById('soft'))?.checked ?? null,
      line: document.getElementById('manage-line')?.textContent ?? '',
      numbers: document.getElementById('manage-numbers')?.textContent ?? '',
    }));
  /** Снимок движка из потока расчёта. */
  const state = () => page.evaluate(() => window.__game.client.save());
  /** Ждать снимок, где `pred` верно: раз в 250 мс, не чаще — поток расчёта и так занят. */
  const stateWhen = async (pred, ms = 10000) => {
    for (const end = Date.now() + ms; ; ) {
      const s = await state();
      if (pred(s) || Date.now() > end) return s;
      await page.waitForTimeout(250);
    }
  };
  /** Цена найма ночного регистратора в карточке регистратуры, ₽. */
  const hirePrice = async () => {
    await page.waitForSelector('#hire-registrar-night', { timeout: 10000 });
    return rub(flat(await page.textContent('#hire-registrar-night')));
  };

  // ---------------------------------------------------------------- экран начала: второй шаг
  // без живой сцены (spec docs/specs/2026-10-aaa-polish.md): её проверяет часть 7, здесь страницу открывают заново выбором
  await page.goto(`http://127.0.0.1:${port}/index.html?q=${q}&lang=ru&seed=5&flow=6,1&backdrop=0`);
  await page.waitForSelector('#start-preset', { timeout: 60000 });
  await page.click('#start-preset');
  await page.waitForSelector('#start-roles #difficulty', { timeout: 10000 });
  const a = await choice();
  const heads = await page.$$eval('#start-roles h2', els => els.map(e => e.textContent ?? ''));
  if (JSON.stringify(a.on) === '["normal"]' && a.soft === false && heads[0] === 'Сложность' && heads.includes('Кто вы') && /^поток ×1 · терпение ×1 · зарплаты ×1 · поломки ×1 · в минус — до 300 000 ₽ · касса /.test(flat(a.numbers))) {
    ok(`второй шаг: «Сложность» над «Кто вы»; по умолчанию «Обычно», мягкий режим выключен; «${flat(a.numbers)}»`);
  } else fail(`второй шаг по умолчанию: ${JSON.stringify({ a, heads })}`);
  await page.click('#manage-calm');
  await page.click('#soft');
  const b = await choice();
  const calmCash = rub(flat(b.numbers).split('касса ')[1] ?? '');
  if (JSON.stringify(b.on) === '["calm"]' && b.soft === true && b.line.startsWith('Больных меньше') && /^поток ×0,8 · терпение ×1,5 · зарплаты ×0,85 · поломки ×0,5 · в минус — до 500 000 ₽ · касса /.test(flat(b.numbers)) && calmCash > rub(flat(a.numbers).split('касса ')[1] ?? '')) {
    ok(`«Спокойно» и мягкий режим: «${b.line}» — «${flat(b.numbers)}» (снимок ${await shot('e2e-difficulty-1-start.jpg')} КБ)`);
  } else fail(`«Спокойно» на втором шаге: ${JSON.stringify(b)}`);

  // ---------------------------------------------------------------- игра на «Спокойно»
  await page.click('#start-role-manager');
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  const url = new URL(page.url());
  const s1 = await state();
  const hud1 = await page.evaluate(() => ({ manage: window.__game.store.get().manage, soft: window.__game.store.get().soft, limit: window.__game.money.hud.limit, cash: document.getElementById('cash')?.getAttribute('title') ?? '' }));
  if (url.searchParams.get('manage') === 'calm' && url.searchParams.get('soft') === '1' && url.searchParams.get('role') === 'manager' && s1.meta.manage === 'calm' && s1.meta.soft === true && s1.economy.cash === calmCash) {
    ok(`игра открылась с ключами «manage=calm&soft=1»: в движке «Спокойно» и мягкий режим, касса начала ${calmCash.toLocaleString('ru-RU')} ₽ — как на экране начала`);
  } else fail(`начало на «Спокойно»: ${JSON.stringify({ url: url.search, meta: s1.meta, cash: s1.economy?.cash, calmCash })}`);
  if (hud1.manage === 'calm' && hud1.soft && hud1.limit === 500000 && hud1.cash.replace(/\s/g, ' ').includes('500 000')) ok(`предел минуса уровня — 500 000 ₽: «${hud1.cash}»`);
  else fail(`предел минуса на «Спокойно»: ${JSON.stringify(hud1)}`);
  const reg = await page.evaluate(() => window.__game.plan.rooms.find(r => r.type === 'room.reception').id);
  await page.evaluate(id => window.__game.selectRoomId(id), reg);
  const calm = await hirePrice();
  // окно платит, как движок: проценты уровня — к зарплате «Обычно»
  const pct = await page.evaluate(() => window.__game.salaryPct);
  if (pct === 85 && calm > 0) ok(`зарплаты — ×0,85: ночной регистратор в карточке регистратуры — ${calm.toLocaleString('ru-RU')} ₽`);
  else fail(`зарплаты на «Спокойно»: ${JSON.stringify({ pct, calm })}`);

  // ---------------------------------------------------------------- «Настройки»: «Трудно» с этой минуты, мягкий режим снят
  // часы — на паузе: минута смены уровня и есть минута движка
  await page.evaluate(() => window.__game.actions.setSpeed(0));
  await page.click('#game-menu-open');
  await page.click('#settings-open');
  await page.waitForSelector('#settings #difficulty', { timeout: 5000 });
  const c = await choice();
  if (JSON.stringify(c.on) === '["calm"]' && c.soft === true && !c.numbers) ok('«Настройки»: та же сложность — «Спокойно» и мягкий режим');
  else fail(`«Настройки», сложность: ${JSON.stringify(c)}`);
  await page.click('#manage-hard');
  await until(() => window.__game.money.hud.limit === 150000);
  const s2 = await stateWhen(s => s.meta.manage === 'hard');
  await page.click('#soft');
  const s3 = await stateWhen(s => s.meta.soft === undefined);
  const d = await choice();
  ok(`снимок «Настроек»: ${join(out, 'e2e-difficulty-2-settings.jpg')} (${await shot('e2e-difficulty-2-settings.jpg')} КБ)`);
  const accrued = s2.economy.accrued;
  if (JSON.stringify(d.on) === '["hard"]' && d.soft === false && s3.meta.manage === 'hard' && accrued === s2.t) ok('«Трудно» — сразу в движке, зарплаты до этой минуты записаны по «Спокойно»; мягкий режим снят');
  else fail(`смена уровня: ${JSON.stringify({ d, meta: s3.meta, accrued, t: s2.t })}`);
  await page.click('#settings-close');
  await page.evaluate(id => window.__game.selectRoomId(id), reg);
  await until(x => {
    const t = document.getElementById('hire-registrar-night')?.textContent ?? '';
    return Number((t.match(/(\d[\d\s]*)\s?₽/)?.[1] ?? '').replace(/[^\d]/g, '')) !== x;
  }, calm, 10000).catch(() => {});
  const hard = await hirePrice();
  const k = hard / calm;
  if (Math.abs(k - 115 / 85) < 0.01) ok(`зарплаты в карточке — по новому уровню: ${calm.toLocaleString('ru-RU')} → ${hard.toLocaleString('ru-RU')} ₽ (×${k.toFixed(3)}, как 1,15 / 0,85)`);
  else fail(`зарплата в карточке после смены уровня: ${calm} → ${hard}`);

  // ---------------------------------------------------------------- строка сохранения
  await page.click('#game-menu-open');
  await page.waitForSelector('#game-menu');
  const before = await page.evaluate(() => window.__game.store.get().menu.rows.map(r => r.slot));
  await page.click('#save-new');
  await until(x => window.__game.store.get().menu.rows.some(r => r.meta?.kind === 'manual' && !x.includes(r.slot)), before);
  const row = await page.evaluate(x => window.__game.store.get().menu.rows.find(r => r.meta?.kind === 'manual' && !x.includes(r.slot)), before);
  await page.waitForSelector(`#save-${row.slot}`);
  const rowText = flat(await page.textContent(`#save-${row.slot}`));
  if (row.meta.manage === 'hard' && row.meta.soft === undefined && rowText.includes('Городская больница · Трудно ·')) ok(`строка сохранения — с уровнем: «${rowText}»`);
  else fail(`строка сохранения: ${JSON.stringify({ meta: row.meta, rowText })}`);
  await page.click(`#save-remove-${row.slot}`);
  await until(x => !document.getElementById(`save-${x}`), row.slot, 10000).catch(() => fail('сохранение части не удалилось'));
}
