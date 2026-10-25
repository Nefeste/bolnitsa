// Сценарий в браузере, часть 21 — роли и итог главврача (spec docs/specs/2026-10-two-ways.md, часть 3: F4 и F5; решения
// владельца #66 и #67). Экран начала: «Городская больница» → «Кто вы» → «Управляющий»: окно врача свёрнуто, галочек нет,
// автопаузы нет, в бывшем кабинете игрока — нанятый терапевт, подсказка — «Вы — управляющий». В окне врача — «Врач»: свой
// кабинет, галочки по умолчанию; «Главврач» — «Не принимаю», «ниже 90 %» и «выписка». Затем «Главврач» с адреса: подсказка о
// решениях, ответ Enter, «До утра» — на планёрке «Главврач» (сколько пришло, что ответили, сколько ошибок прошло) и «Ошибки
// нанятых врачей» строками с «Картой»; в карте закрытого случая — «Итог: …». Снимки — `e2e-roles-*.jpg`.
import { join } from 'node:path';

/** @param {{ page: import('playwright-core').Page, port: number, out: string, ok: (m: string) => void, fail: (m: string) => void, q: string, shots: string }} x */
export async function rolesPart({ page, port, out, ok, fail, q, shots }) {
  const until = (fn, a, ms = 30000) => page.waitForFunction(fn, a, { timeout: ms });
  const flat = s => (s ?? '').replace(/\s+/g, ' ').trim();
  const shot = async name => {
    if (shots) {
      await page.evaluate(x => window.__game.showQuality(x), shots);
      await page.waitForTimeout(400);
    }
    const buf = await page.screenshot({ path: join(out, name), type: 'jpeg', quality: 72 });
    if (shots) await page.evaluate(x => window.__game.showQuality(x), q);
    return Math.round(buf.length / 1024);
  };
  /** Что ставит роль — как видит окно: роль, галочки движка, свой кабинет, автопауза, окно врача, бывший кабинет игрока. */
  const state = () =>
    page.evaluate(() => {
      const g = window.__game;
      const st = g.doctor.hud.state;
      const first = g.hospital.site.rooms.find(r => r.type === 'room.office')?.id;
      return {
        role: g.doctor.hud.role, rules: st?.rules ?? null, office: st?.office ?? null, mine: g.hospital.site.mine ?? null, first,
        therapist: g.staff.some(m => m.room === first && m.role === 'role.therapist'), autopause: g.doctor.hud.autopause, folded: g.doctor.hud.folded,
        said: g.doctor.hud.said?.text ?? '',
      };
    });
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  // ---------------------------------------------------------------- экран начала: «Кто вы» — «Управляющий»
  await page.goto(`http://127.0.0.1:${port}/index.html?q=${q}&lang=ru&seed=11&flow=6,1`);
  await page.waitForSelector('#start-preset', { timeout: 60000 });
  await page.click('#start-preset');
  await page.waitForSelector('#start-role-manager', { timeout: 10000 });
  const lines = await page.$$eval('#start-roles button[id^="start-role-"] span', els => els.map(e => e.textContent ?? ''));
  ok(`«Кто вы»: ${lines.map(l => `«${l.slice(0, 60)}…»`).join(' · ')} (снимок ${await shot('e2e-roles-1-start.jpg')} КБ)`);
  await page.click('#start-role-manager');
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  await until(() => !!window.__game.store.get().doctor?.state && window.__game.doctor.hud.state.rules.length === 0);
  const m = await state();
  if (m.role === 'manager' && same(m.rules, []) && m.office === null && m.mine === null && m.therapist && !m.autopause && m.folded) {
    ok('«Управляющий»: «ни о чём», без своего кабинета — в нём нанятый терапевт, автопаузы нет, окно врача свёрнуто');
  } else fail(`«Управляющий»: ${JSON.stringify(m)}`);
  const fold = flat(await page.textContent('#dock-unfold').catch(() => ''));
  if (fold.startsWith('▸ Вы — управляющий')) ok(`окно врача свёрнуто: «${fold}»`);
  else fail(`свёрнутое окно врача: «${fold}»`);
  // «Управляющему» — что делать (часы идут — подсказка после «пробела»)
  await page.evaluate(() => window.__game.actions.setSpeed(1));
  const hint = await until(() => document.getElementById('hint')?.dataset.key === 'manage' && document.getElementById('hint-text')?.textContent, null, 10000)
    .then(h => h.jsonValue(), () => '');
  if (/управляющий/.test(hint)) ok(`подсказка по роли: «${hint}»`);
  else fail(`подсказка «Управляющему»: «${hint}»`);
  // ---------------------------------------------------------------- окно врача: «Врач» и «Главврач»
  await page.click('#dock-unfold');
  await page.click('#role-doctor');
  await until(() => !!window.__game.doctor.hud.state.office && window.__game.doctor.hud.state.rules.length === 2);
  const d = await state();
  if (d.role === 'doctor' && same(d.rules, ['unsure', 'long']) && d.office === d.first && d.autopause && !d.folded && /ваш кабинет/.test(d.said)) {
    ok(`«Врач» в окне врача: «${d.said}», галочки по умолчанию, автопауза`);
  } else fail(`«Врач»: ${JSON.stringify(d)}`);
  if ((await page.getAttribute('#role-doctor', 'class'))?.includes('on')) ok('выбранная роль подсвечена');
  else fail('роль не подсвечена');
  // «Главврач» — «Не принимаю»; терапевт, ушедший в резерв, когда кабинет стал вашим, возвращается в него
  await page.click('#role-chief');
  await until(x => {
    const g = window.__game;
    return !g.doctor.hud.state.office && g.doctor.hud.state.rules.includes('below90') && g.staff.some(m => m.room === x && m.role === 'role.therapist');
  }, d.first, 10000).catch(() => {});
  const c = await state();
  if (c.role === 'chief' && same(c.rules, ['unsure', 'long', 'below90', 'discharge']) && c.office === null && c.therapist && c.autopause && /не принимаете/.test(c.said)) {
    ok(`«Главврач»: «${c.said}», в бывшем вашем кабинете — терапевт из резерва, спрашивают о «ниже 90 %» и выписке`);
  } else fail(`«Главврач»: ${JSON.stringify(c)}`);

  // снова «Управляющий»: ни о чём, без автопаузы, окно врача свёрнуто
  await page.click('#role-manager');
  await until(() => window.__game.doctor.hud.state.rules.length === 0 && window.__game.doctor.hud.folded);
  const mm = await state();
  if (mm.role === 'manager' && mm.office === null && mm.therapist && !mm.autopause) ok('снова «Управляющий»: ни о чём, без автопаузы, окно врача свёрнуто');
  else fail(`снова «Управляющий»: ${JSON.stringify(mm)}`);
  // критерий приёмки (spec «Часть 3»): ×12 три игровых часа — ни карты пациента, ни вкладки просьб, часы не встают
  await page.evaluate(() => {
    const g = window.__game;
    window.__medicine = { card: 0, asks: 0, stops: 0 };
    window.__watch = setInterval(() => {
      const m = window.__medicine;
      if (g.doctor.open) m.card++;
      if (g.store.get().tab === 'asks') m.asks++;
      if (g.speed === 0 && !g.ff) m.stops++;
    }, 100);
    g.actions.setSpeed(12);
  });
  await until(() => window.__game.t >= 11 * 3600, null, 180000);
  const med = await page.evaluate(() => {
    clearInterval(window.__watch);
    window.__game.actions.setSpeed(0);
    return { ...window.__medicine, seen: window.__game.store.get().seen, decisions: window.__game.doctor.hud.state.decisions.length, asks: window.__game.doctor.hud.state.asks.length };
  });
  if (med.card === 0 && med.asks === 0 && med.stops === 0 && med.decisions === 0 && med.seen > 0) ok(`«Управляющий», 08:00–11:00 на ×12: приняты ${med.seen}, ни карты, ни просьб, ни решений, часы не вставали`);
  else fail(`«Управляющий» и медицина: ${JSON.stringify(med)}`);

  // ---------------------------------------------------------------- «Главврач» с адреса: решения и планёрка
  await page.goto(`http://127.0.0.1:${port}/index.html?q=${q}&lang=ru&hospital=preset&role=chief&seed=11&flow=6,1`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  await until(() => !!window.__game.store.get().doctor?.state && window.__game.doctor.hud.state.rules.includes('below90'));
  const h = await state();
  if (h.role === 'chief' && h.mine === null && h.therapist && (await page.getAttribute('#role-chief', 'class'))?.includes('on')) ok('«Главврач» с адреса: своего кабинета нет, в нём — нанятый терапевт');
  else fail(`«Главврач» с адреса: ${JSON.stringify(h)}`);
  await page.evaluate(() => window.__game.actions.setSpeed(1));
  const ch = await until(() => document.getElementById('hint')?.dataset.key === 'decisions' && document.getElementById('hint-text')?.textContent, null, 10000)
    .then(x => x.jsonValue(), () => '');
  if (/Решения нанятых врачей/.test(ch)) ok(`подсказка по роли: «${ch.slice(0, 90)}…»`);
  else fail(`подсказка «Главврачу»: «${ch}»`);
  // ×12 до первого решения; Enter — «Согласен»
  await page.evaluate(() => window.__game.actions.doctor({ kind: 'autopause', on: false }));
  await page.evaluate(() => window.__game.actions.setTab('asks'));
  await page.evaluate(() => window.__game.actions.setSpeed(12));
  await until(() => document.querySelectorAll('#decisions li').length > 0, null, 240000);
  await page.evaluate(() => window.__game.actions.setSpeed(0));
  const first = await page.evaluate(() => window.__game.doctor.hud.state.decisions[0].id);
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
  await page.keyboard.press('Enter');
  await until(x => !window.__game.doctor.hud.state.decisions.some(r => r.id === x), first, 10000)
    .then(() => ok('Enter — «Согласен» на верхнем решении'), () => fail('Enter не ответил на решение'));

  // «До утра» — планёрка 08:00 вторых суток
  const t0 = Date.now();
  await page.click('#speed-ff');
  for (;;) {
    const s = await page.evaluate(() => ({ open: window.__game.store.get().economy?.open ?? false, ff: window.__game.ff, speed: window.__game.speed, card: window.__game.doctor.open }));
    if (s.open || Date.now() - t0 > 300000) break;
    if (s.card) await page.keyboard.press('Escape');
    else if (!s.ff && s.speed === 0) await page.click('#speed-ff');
    await page.waitForTimeout(200);
  }
  await page.waitForSelector('#meeting #meet-chief', { timeout: 10000 }).catch(() => {});
  const meet = await page.evaluate(() => ({
    chief: (document.getElementById('meet-chief')?.textContent ?? '').replace(/\s+/g, ' ').trim(),
    errors: [...document.querySelectorAll('#meet-errors li[id^="meet-err-"]')].map(e => ({ id: e.id.slice(9), text: (e.textContent ?? '').replace(/\s+/g, ' ').trim() })),
    summary: window.__game.store.get().economy?.meeting?.summary.chief,
  }));
  const ch2 = meet.summary;
  if (ch2 && /на утверждение пришло \d+ решени/.test(meet.chief) && /вы согласились — \d+, ответа не было — \d+, изменили — \d+/.test(meet.chief) && ch2.asked > 0) {
    ok(`планёрка, «Главврач»: «${meet.chief.slice(0, 200)}»`);
  } else fail(`итог главврача: ${JSON.stringify(meet)}`);
  if (meet.errors.length > 0 && meet.errors.every(e => / — (неверно|почти|верно)/.test(e.text) && e.text.includes('Карта'))) {
    ok(`«Ошибки нанятых врачей»: ${meet.errors.length}, первая — «${meet.errors[0].text.slice(0, 160)}»`);
  } else fail(`ошибки врачей: ${JSON.stringify(meet.errors.slice(0, 3))}`);
  ok(`снимок планёрки: ${join(out, 'e2e-roles-2-meeting.jpg')} (${await shot('e2e-roles-2-meeting.jpg')} КБ)`);

  // «Карта» — карта закрытого случая с «Итог: …»; закрыли — снова планёрка
  if (meet.errors.length > 0) {
    await page.click(`#meet-err-open-${meet.errors[0].id}`);
    await page.waitForSelector('#dcard #dcard-verdict', { timeout: 20000 }).catch(() => {});
    const v = flat(await page.textContent('#dcard-verdict').catch(() => ''));
    if (/^Итог: (Неверно|Почти: та же тактика|Верно)/.test(v) && (!/^Итог: (Неверно|Почти)/.test(v) || v.includes('на самом деле'))) ok(`карта ошибки: «${v.slice(0, 160)}»`);
    else fail(`«Итог» в карте: «${v}»`);
    ok(`снимок: ${join(out, 'e2e-roles-3-verdict.jpg')} (${await shot('e2e-roles-3-verdict.jpg')} КБ)`);
    await page.keyboard.press('Escape');
    await page.waitForSelector('#meeting', { timeout: 10000 }).then(() => ok('карта закрыта — снова планёрка'), () => fail('после карты планёрки нет'));
  }
  await page.click('#meeting-close');
}
