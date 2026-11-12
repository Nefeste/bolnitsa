// Сценарий в браузере, часть 45 — сценарий 4 «Сердце и мозг» (spec docs/specs/2026-11-scenario-4.md, «Часть 2б: как сделано»
// и часть 3). Экран начала: в «Кампании» четвёртая карточка — «Сценарий 4. Сердце и мозг». В игре: больница сценария 3 со
// свободной землёй у входа скорой, касса 2 500 000 ₽, ваш кабинет — первый, часы стоят; письма «в начале» — наставница, Ян
// Новак и заведующая неврологией Ада Рейес. Во «Целях» — порядок стройки из двух шагов (кабинет КТ, ПИТ) и основные цели.
// Кабинет КТ у смотровой и ПИТ «С персоналом» — командами окна; шаги сделаны. Через две минуты игры — первый заданный, с
// инфарктом, по скорой: лежит в смотровой, маршруты выключены — подсказка «маршруты» и письмо заведующей. Галочки «Маршруты
// для срочного» в карточке смотровой — медсестра снимает ЭКГ: подъём ST — срочная строка, автопауза, подсказка и письмо о
// просьбе медсестры, больной — первым в «Ждут вас». «Позвать» — в карте ЭКГ уже есть, подсказка «Инфаркт и минуты». «До утра» —
// планёрка: «Письма» и строка «Сроки» с маршрутами. Снимки — `e2e-vascular-*.jpg`.
import { join } from 'node:path';

const SC = 'scenario.vascular';

/** @param {{ page: import('playwright-core').Page, port: number, out: string, ok: (m: string) => void, fail: (m: string) => void, q: string, shots: string }} x */
export async function vascularPart({ page, port, out, ok, fail, q, shots }) {
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
  /** Команда стройки — тем же путём, что инструменты окна. */
  const site = cmd => page.evaluate(c => window.__game.client.command({ kind: 'site', cmd: c }), cmd);
  const card = () =>
    page.evaluate(() => {
      const el = document.getElementById('letter');
      return el ? { id: el.dataset.letter, text: el.innerText.replace(/\s+/g, ' ') } : null;
    });
  /** Ждать письмо `id` в карточке и прочитать его «Понятно». */
  const letter = async (id, ms = 30000) => {
    const got = await until(x => document.getElementById('letter')?.dataset.letter === x, id, ms).then(() => true, () => false);
    const c = await card();
    if (got) ok(`письмо «${id}»: «${c.text.slice(0, 110)}…»`);
    else fail(`письмо «${id}» не пришло; в карточке: ${JSON.stringify(c)}; пришли: ${JSON.stringify(await page.evaluate(() => window.__game.scenario.view?.letters))}`);
    if (got) {
      await page.click('#letter-ok');
      await until(x => document.getElementById('letter')?.dataset.letter !== x, id, 5000).catch(() => fail(`письмо «${id}» не закрылось`));
    }
    return c;
  };
  const hhmm = t => new Date(t * 1000).toISOString().slice(11, 16);

  // ---------------------------------------------------------------- экран начала: четвёртая карточка «Кампании»
  await page.goto(`http://127.0.0.1:${port}/index.html?q=${q}&lang=ru&seed=5&backdrop=0`);
  await page.waitForSelector('#start-scenario-vascular', { timeout: 60000 });
  const cards = await page.$$eval('#start [id^="start-scenario-"]', els => els.map(e => e.id));
  const cardText = flat(await page.innerText('#start-scenario-vascular'));
  if (cards.at(-1) === 'start-scenario-vascular' && cards.length === 4 && cardText.startsWith('Сценарий 4. Сердце и мозг')) {
    ok(`экран начала: четвёртая карточка «Кампании» — «${cardText.slice(0, 150)}» (снимок ${await shot('e2e-vascular-1-start.jpg')} КБ)`);
  } else fail(`экран начала: карточки ${JSON.stringify(cards)}, «${cardText}»`);
  await page.click('#start-scenario-vascular');
  await page.waitForSelector('#start-scenario #difficulty', { timeout: 10000 });
  await page.click('#start-go');
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  await until(x => window.__game.scenario.view?.id === x, SC);
  const begin = await page.evaluate(() => {
    const g = window.__game;
    const rec = g.db.sites['site.surgery'];
    return { cash: g.store.get().economy?.cash, rooms: g.hospital.site.rooms.length, want: rec.rooms.length, mine: g.hospital.site.mine, first: g.hospital.site.rooms[0]?.id, paused: g.speed === 0 };
  });
  if (begin.cash === 2500000 && begin.rooms === begin.want && begin.mine === begin.first && begin.paused) {
    ok(`сценарий начат: больница сценария 3 — ${begin.rooms} помещений, ваш кабинет — первый, касса 2 500 000 ₽, часы стоят`);
  } else fail(`начало сценария 4: ${JSON.stringify(begin)}`);

  // ---------------------------------------------------------------- письма «в начале»
  await letter('hello');
  await letter('budget');
  const minutes = await letter('minutes');
  if (/Ада Рейес/.test(minutes?.text ?? '') && /40 минут/.test(minutes?.text ?? '')) ok('письмо заведующей неврологией — Ада Рейес, о минутах: ЭКГ за 10, КТ за 40');
  else fail(`письмо заведующей неврологией: ${JSON.stringify(minutes)}`);

  // ---------------------------------------------------------------- «Цели»: два шага порядка стройки и основные цели
  const goalsNow = async () => {
    await page.click('#tab-goals');
    await page.waitForSelector('#goals', { timeout: 5000 });
    const guide = await page.$$eval('#guide-list li', els => els.map(e => ({ room: e.dataset.room, cls: e.className, text: (e.textContent ?? '').replace(/\s+/g, ' ').trim() })));
    const goals = await page.$$eval('#goals ul.goals li', els => els.map(e => ({ id: e.id, ok: e.classList.contains('ok') })));
    await page.click('#tab-goals');
    return { guide, goals };
  };
  const g0 = await goalsNow();
  if (
    g0.guide.length === 2 && g0.guide[0].room === 'room.ct' && g0.guide[0].cls === 'next' && g0.guide[1].room === 'room.icu'
    && ['goal-ctRoom', 'goal-icu', 'goal-ecg', 'goal-ct'].every(id => g0.goals.some(x => x.id === id && !x.ok))
  ) ok(`«Цели» — порядок стройки: «${g0.guide[0].text.slice(1, 60)}…», «${g0.guide[1].text.slice(1, 50)}…»; основные цели не выполнены`);
  else fail(`«Цели» сценария 4: ${JSON.stringify(g0)}`);

  // ---------------------------------------------------------------- кабинет КТ у смотровой и ПИТ «С персоналом»
  await site({ kind: 'ready', type: 'room.ct', size: 'M', x: 52, y: 26, rot: 2, staff: true });
  await site({ kind: 'ready', type: 'room.icu', size: 'M', x: 62, y: 26, rot: 2, staff: true });
  await site({ kind: 'done' });
  await until(() => window.__game.scenario.view?.guide?.every(x => x.done) === true, null, 15000).catch(() => {});
  const g1 = await goalsNow();
  if (g1.guide.every(x => x.cls === 'done')) ok('кабинет КТ у смотровой приёмного и ПИТ «С персоналом» — оба шага порядка стройки сделаны');
  else fail(`шаги после стройки: ${JSON.stringify(g1.guide)}`);

  // ---------------------------------------------------------------- первый заданный по скорой лежит, маршруты выключены
  await page.evaluate(() => window.__game.actions.setSpeed(3));
  const routesHint = await until(() => document.getElementById('hint')?.dataset.key === 'routes' || document.getElementById('letter')?.dataset.letter === 'routes', null, 300000).then(() => true, () => false);
  await page.evaluate(() => window.__game.setSpeed(0));
  const lying = await page.evaluate(() => (window.__game.doctor.hud.state?.yours ?? []).find(r => r.why === 'yours') ?? null);
  if (routesHint && lying) ok(`после КТ — первый заданный по скорой в «Ждут вас»: ${lying.who}, «${lying.complaint}»; маршруты выключены — подсказка «маршруты»`);
  else fail(`подсказки «маршруты» нет: ${JSON.stringify(lying)}, подсказка «${await page.evaluate(() => document.getElementById('hint')?.dataset.key ?? '')}»`);
  await letter('routes');

  // ---------------------------------------------------------------- галочки в карточке смотровой — медсестра снимает ЭКГ
  const er = await page.evaluate(() => window.__game.hospital.site.rooms.find(r => r.type === 'room.emergency')?.id ?? null);
  await page.evaluate(id => window.__game.selectRoomId(id), er);
  await page.waitForSelector('#card-routes', { timeout: 10000 }).catch(() => {});
  for (const id of ['route.ecg_chest_pain', 'route.stroke_ct']) {
    await page.click(`#card-routes input[data-route="${id}"]`);
    await until(x => (window.__game.doctor.hud.state?.routes ?? []).includes(x), id, 10000).catch(() => {});
  }
  const on = await page.evaluate(() => window.__game.doctor.hud.state?.routes ?? []);
  if (on.length === 2) ok(`карточка смотровой: маршруты включены (снимок ${await shot('e2e-vascular-2-routes.jpg')} КБ)`);
  else fail(`маршруты не включились: ${JSON.stringify(on)}`);
  await page.keyboard.press('Escape');

  // ---------------------------------------------------------------- подъём ST: срочная строка, автопауза, «Ждут вас» первым
  await page.evaluate(() => window.__game.actions.setSpeed(1));
  const alerted = await until(() => window.__game.notices.some(n => n.text.startsWith('Медсестра смотровой:')), null, 120000).then(() => true, () => false);
  const toast = await page.evaluate(() => window.__game.notices.find(n => n.text.startsWith('Медсестра смотровой:')) ?? null);
  const paused = await until(() => window.__game.speed === 0, null, 10000).then(() => true, () => false);
  const top = await page.evaluate(() => (window.__game.doctor.hud.state?.yours ?? [])[0] ?? null);
  if (alerted && toast?.tone === 'urgent' && toast.text.includes('подъём сегмента ST на ЭКГ') && paused && top?.why === 'alert' && top.id === lying?.id) {
    ok(`подъём ST по ЭКГ медсестры: «${toast.text}»; часы стоят; «Ждут вас» — первым, срок тромболизиса до ${hhmm(top.alert.until)}`);
  } else fail(`просьба медсестры: строка ${JSON.stringify(toast)}, пауза ${paused}, первый ${JSON.stringify(top)}`);
  await letter('alert');
  const rowCls = await page.evaluate(id => document.getElementById(`dr-${id}`)?.className ?? '', top?.id ?? '');
  if (rowCls.includes('alert')) ok(`строка в «Ждут вас» — просьба медсестры (снимок ${await shot('e2e-vascular-3-alert.jpg')} КБ)`);
  else fail(`строка в «Ждут вас»: «${rowCls}»`);

  // ---------------------------------------------------------------- «Позвать»: в карте ЭКГ уже есть, подсказка «Инфаркт и минуты»
  await page.locator(`#dr-${top?.id} button`, { hasText: 'Позвать' }).click();
  await page.waitForSelector('#dcard #dcard-steps', { timeout: 180000 });
  const done = await page.evaluate(() => window.__game.store.get().doctor?.card?.done ?? []);
  if (done.includes('exam.ecg')) ok('в карте ЭКГ уже снята — медсестрой по маршруту');
  else fail(`в карте нет ЭКГ: ${JSON.stringify(done)}`);
  const version = () => page.evaluate(() => window.__game.store.get().doctor?.card?.version ?? 0);
  const q1 = await page.$('#stepbody-talk button.q:not([disabled])');
  if (q1) {
    const v0 = await version();
    await q1.click();
    await until(prev => (window.__game.store.get().doctor?.card?.version ?? 0) > prev, v0);
  }
  const tip = await until(() => {
    const el = document.getElementById('dcard-tip');
    return el ? { id: el.dataset.tip, text: el.innerText.replace(/\s+/g, ' ') } : null;
  }, null, 10000).then(h => h.jsonValue(), () => null);
  if (tip?.id === 'stemi' && /Инфаркт и минуты/.test(tip.text)) ok(`в карте — подсказка «Инфаркт и минуты» (снимок ${await shot('e2e-vascular-4-tip.jpg')} КБ)`);
  else fail(`подсказка в карте заданного: ${JSON.stringify(tip)}`);
  if (await page.$('#tip-ok')) await page.click('#tip-ok');
  // «Решение»: инфаркт — и закрыть приём
  await page.click('#step-decide');
  let v = await version();
  await page.selectOption('#dx-select', 'cond.acs');
  await until(prev => (window.__game.store.get().doctor?.card?.version ?? 0) > prev, v);
  v = await version();
  await page.click('#dcard-finish');
  await until(prev => (window.__game.store.get().doctor?.card?.version ?? 0) > prev, v).catch(() => {});
  await page.keyboard.press('Escape');
  await until(() => !document.getElementById('dcard'), null, 10000).catch(() => {});

  // ---------------------------------------------------------------- «До утра»: планёрка — «Письма» и «Сроки»
  const t0 = Date.now();
  await page.click('#speed-ff');
  for (;;) {
    const h = await page.evaluate(() => ({
      open: window.__game.store.get().economy?.open ?? false, ff: window.__game.ff, speed: window.__game.speed, card: window.__game.doctor.open,
      letter: document.getElementById('letter')?.dataset.letter ?? '',
    }));
    if (h.open || Date.now() - t0 > 300000) break;
    if (h.letter) await page.click('#letter-ok');
    else if (h.card) await page.keyboard.press('Escape');
    else if (!h.ff && h.speed === 0) await page.click('#speed-ff');
    await page.waitForTimeout(200);
  }
  await page.waitForSelector('#meeting', { timeout: 10000 });
  const meet = flat(await page.innerText('#meet-letters', { timeout: 10000 }).catch(() => ''));
  const line = flat(await page.innerText('#meet-deadlines').catch(() => ''));
  if (/Первые сутки позади/.test(meet)) ok(`планёрка, «Письма»: «${meet.slice(0, 120)}…»`);
  else fail(`планёрка, «Письма»: «${meet.slice(0, 300)}»`);
  if (line.startsWith('Сроки:') && /по маршрутам: ЭКГ — [1-9]/.test(line)) ok(`планёрка: «${line.slice(0, 220)}» (снимок ${await shot('e2e-vascular-5-meeting.jpg')} КБ)`);
  else fail(`планёрка, строка «Сроки»: «${line}»`);
  await page.evaluate(() => window.__game.actions.money({ kind: 'close' }));
  await until(() => !window.__game.store.get().economy?.open, null, 10000);
}
