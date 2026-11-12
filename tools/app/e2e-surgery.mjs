// Сценарий в браузере, часть 40 — сценарий 3 «Хирургия» (spec docs/specs/2026-11-scenario-3.md, «Часть 2: как сделано» и
// часть 3). Экран начала: в «Кампании» третья карточка — «Сценарий 3. Хирургия». В игре: больница сценария 2 со свободной
// землёй, касса 700 000 ₽, ваш кабинет — первый, часы стоят; письма «в начале» — наставница, Ян Новак и заведующая
// хирургией Амара Оби. Во «Целях» — порядок стройки из трёх шагов: операционная, палата для оперированных, санитар в
// операционной; основные цели. Операционная — командами окна, бригада и санитар только на день, третья палата «С персоналом»;
// шаги сделаны. Через две минуты игры — первый заданный, по скорой: в «Ждут вас»; «Позвать» — в карте подсказка «Аппендицит
// и время»; «Решение» — аппендицит, «В операционную», «Завершить приём»; его оперируют. «До утра»: к вечеру — подсказка «ночь
// без бригады» и письмо заведующей хирургией; планёрка — «Письма» и строка «Операции». Снимки — `e2e-surgery-*.jpg`.
import { join } from 'node:path';

const SC = 'scenario.surgery';

/** @param {{ page: import('playwright-core').Page, port: number, out: string, ok: (m: string) => void, fail: (m: string) => void, q: string, shots: string }} x */
export async function surgeryPart({ page, port, out, ok, fail, q, shots }) {
  const until = (fn, a, ms = 30000) => page.waitForFunction(fn, a, { timeout: ms });
  const flat = s => s.replace(/\s+/g, ' ').trim();
  const dom = id => id.replace(/\./g, '_');
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

  // ---------------------------------------------------------------- экран начала: третья карточка «Кампании»
  await page.goto(`http://127.0.0.1:${port}/index.html?q=${q}&lang=ru&seed=5&backdrop=0`);
  await page.waitForSelector('#start-scenario-surgery', { timeout: 60000 });
  const cards = await page.$$eval('#start [id^="start-scenario-"]', els => els.map(e => e.id));
  const cardText = flat(await page.innerText('#start-scenario-surgery'));
  // за ним — сценарий 4 (spec docs/specs/2026-11-scenario-4.md, часть 2б)
  if (cards.join() === 'start-scenario-ambulatory,start-scenario-emergency,start-scenario-surgery,start-scenario-vascular' && cardText.startsWith('Сценарий 3. Хирургия')) {
    ok(`экран начала: третья карточка «Кампании» — «${cardText.slice(0, 140)}» (снимок ${await shot('e2e-surgery-1-start.jpg')} КБ)`);
  } else fail(`экран начала: карточки ${JSON.stringify(cards)}, «${cardText}»`);
  await page.click('#start-scenario-surgery');
  await page.waitForSelector('#start-scenario #difficulty', { timeout: 10000 });
  await page.click('#start-go');
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  await until(x => window.__game.scenario.view?.id === x, SC);
  const begin = await page.evaluate(() => {
    const g = window.__game;
    const rec = g.db.sites['site.emergency'];
    return { cash: g.store.get().economy?.cash, rooms: g.hospital.site.rooms.length, want: rec.rooms.length, mine: g.hospital.site.mine, first: g.hospital.site.rooms[0]?.id, paused: g.speed === 0, w: g.hospital.site.w };
  });
  if (begin.cash === 700000 && begin.rooms === begin.want && begin.mine === begin.first && begin.paused) {
    ok(`сценарий начат: больница сценария 2 — ${begin.rooms} помещений, участок ${begin.w} клеток в ширину, ваш кабинет — первый, касса 700 000 ₽, часы стоят`);
  } else fail(`начало сценария 3: ${JSON.stringify(begin)}`);

  // ---------------------------------------------------------------- письма «в начале»
  await letter('hello');
  await letter('budget');
  const surgeon = await letter('surgeon');
  if (/Амара Оби/.test(surgeon?.text ?? '') && /ущемлённую грыжу/.test(surgeon?.text ?? '')) ok('письмо заведующей хирургией — Амара Оби, о сроках аппендицита и ущемлённой грыжи');
  else fail(`письмо заведующей хирургией: ${JSON.stringify(surgeon)}`);

  // ---------------------------------------------------------------- «Цели»: три шага порядка стройки и основные цели
  const goalsNow = async () => {
    await page.click('#tab-goals');
    await page.waitForSelector('#goals', { timeout: 5000 });
    const guide = await page.$$eval('#guide-list li', els => els.map(e => ({ room: e.dataset.room, cls: e.className, text: (e.textContent ?? '').replace(/\s+/g, ' ').trim() })));
    const goals = await page.$$eval('#goals ul.goals li', els => els.map(e => ({ id: e.id, ok: e.classList.contains('ok') })));
    await page.click('#tab-goals');
    return { guide, goals };
  };
  const g0 = await goalsNow();
  const [s1, s2, s3] = g0.guide;
  if (
    g0.guide.length === 3 && s1.room === 'room.or' && s1.cls === 'next' && s2.room === 'room.ward' && s2.text.includes('Палата для оперированных')
    && s3.room === 'room.or' && s3.text.includes('Санитар в операционной') && ['goal-or', 'goal-operations', 'goal-ontime'].every(id => g0.goals.some(x => x.id === id && !x.ok))
  ) ok(`«Цели» — порядок стройки: «${s1.text.slice(1, 40)}…», «${s2.text.slice(1, 40)}…», «${s3.text.slice(1, 40)}…»; основные цели не выполнены`);
  else fail(`«Цели» сценария 3: ${JSON.stringify(g0)}`);

  // ---------------------------------------------------------------- операционная: бригада и санитар только на день; третья палата
  await site({ kind: 'ready', type: 'room.or', size: 'M', x: 55, y: 6, rot: 0, staff: false });
  const or = await until(() => window.__game.hospital.site.rooms.find(r => r.type === 'room.or')?.id ?? null, null, 15000).then(h => h.jsonValue());
  for (const role of ['role.surgeon', 'role.anesthetist', 'role.or_nurse', 'role.orderly']) await site({ kind: 'hire', room: or, role, shift: 'day' });
  await site({ kind: 'ready', type: 'room.ward', size: 'M', x: 64, y: 6, rot: 0, staff: true });
  await site({ kind: 'done' });
  await until(() => window.__game.scenario.view?.guide?.every(x => x.done) === true, null, 15000).catch(() => {});
  const g1 = await goalsNow();
  if (g1.guide.every(x => x.cls === 'done')) ok('операционная с бригадой на день и санитаром, третья палата — все три шага порядка стройки сделаны');
  else fail(`шаги после стройки: ${JSON.stringify(g1.guide)}`);

  // ---------------------------------------------------------------- первый заданный по скорой — ваш
  const callable = () => {
    const b = [...document.querySelectorAll('#dock .dlists li button')].find(x => x.textContent === 'Позвать' && !x.disabled);
    return b ? (b.closest('li')?.id ?? null) : null;
  };
  await page.evaluate(() => window.__game.actions.setSpeed(3));
  const row = await until(callable, null, 300000).then(h => h.jsonValue(), () => null);
  if (!row) {
    fail('после операционной заданный больной не пришёл');
    return;
  }
  const first = await page.evaluate(id => window.__game.store.get().doctor?.state?.yours.find(r => `dr-${r.id}` === id) ?? null, row);
  if (first) ok(`после операционной — первый заданный в «Ждут вас»: ${first.who}, «${first.complaint}»`);
  else fail(`первый заданный — не в «Ждут вас»: ${row}`);
  await page.locator(`#${row} button`, { hasText: 'Позвать' }).click();
  await page.waitForSelector('#dcard #dcard-steps', { timeout: 180000 });
  const version = () => page.evaluate(() => window.__game.store.get().doctor?.card?.version ?? 0);
  const fresher = v => until(prev => (window.__game.store.get().doctor?.card?.version ?? 0) > prev, v);
  // подсказка о болезни заданного — после первого вопроса, осмотра или обследования
  const q1 = await page.$('#stepbody-talk button.q:not([disabled])');
  if (q1) {
    const v0 = await version();
    await q1.click();
    await fresher(v0);
  }
  const tip = await until(() => {
    const el = document.getElementById('dcard-tip');
    return el ? { id: el.dataset.tip, text: el.innerText.replace(/\s+/g, ' ') } : null;
  }, null, 10000).then(h => h.jsonValue(), () => null);
  if (tip?.id === 'appendicitis' && /Аппендицит и время/.test(tip.text)) ok(`в карте — подсказка «Аппендицит и время» (снимок ${await shot('e2e-surgery-2-tip.jpg')} КБ)`);
  else fail(`подсказка в карте заданного: ${JSON.stringify(tip)}`);
  if (await page.$('#tip-ok')) await page.click('#tip-ok');

  // ---------------------------------------------------------------- «Решение»: аппендицит, «В операционную», «Завершить приём»
  await page.click('#step-decide');
  let v = await version();
  await page.selectOption('#dx-select', 'cond.appendicitis');
  await fresher(v);
  const op = await page.$('#set-surgery');
  const opOk = op ? !(await op.isDisabled()) : false;
  if (opOk) {
    // переключатель держит движок: щелчок — команда, отметка — с новым видом карты
    await page.click('#set-surgery');
    const set = await until(() => window.__game.store.get().doctor?.card?.draft.setting === 'surgery', null, 15000).then(() => true, () => false);
    if (set) ok('«Решение»: аппендицит — «В операционную» можно: стол, бригада и свободная койка есть');
    else fail('«В операционную» не выбралось');
  } else fail(`«В операционную» нельзя: ${await page.evaluate(() => document.querySelector('label[for="set-surgery"]')?.getAttribute('title') ?? '')}`);
  v = await version();
  await page.click('#dcard-finish');
  await fresher(v);
  await page.keyboard.press('Escape');
  await until(() => !document.getElementById('dcard'), null, 10000).catch(() => {});

  // ---------------------------------------------------------------- «До утра»: операция, к вечеру — «ночь без бригады»
  const t0 = Date.now();
  let hint = '';
  await page.click('#speed-ff');
  for (;;) {
    const h = await page.evaluate(() => ({
      open: window.__game.store.get().economy?.open ?? false, ff: window.__game.ff, speed: window.__game.speed, card: window.__game.doctor.open,
      letter: document.getElementById('letter')?.dataset.letter ?? '', hint: document.getElementById('hint')?.dataset.key ?? '',
    }));
    if (h.hint === 'nightOr') hint = h.hint;
    if (h.open || Date.now() - t0 > 300000) break;
    if (h.letter) await page.click('#letter-ok');
    else if (h.card) await page.keyboard.press('Escape');
    else if (!h.ff && h.speed === 0) await page.click('#speed-ff');
    await page.waitForTimeout(200);
  }
  const letters = await page.evaluate(() => (window.__game.scenario.view?.letters ?? []).map(l => l.id));
  if (letters.includes('night')) ok(`«До утра»: к вечеру — письмо заведующей хирургией «ночь без бригады»${hint ? ' и подсказка «Нанять на ночь» в карточке операционной' : ''}`);
  else fail(`«До утра»: письма ${JSON.stringify(letters)}, подсказка «${hint}»`);

  // ---------------------------------------------------------------- планёрка: «Письма» и «Операции»
  await page.waitForSelector('#meeting', { timeout: 10000 });
  const meet = flat(await page.innerText('#meet-letters', { timeout: 10000 }).catch(() => ''));
  const line = flat(await page.innerText('#meet-surgery').catch(() => ''));
  if (/Первые сутки с операционной позади/.test(meet) && /Операционная работает/.test(meet)) ok(`планёрка, «Письма»: «${meet.slice(0, 120)}…»`);
  else fail(`планёрка, «Письма»: «${meet.slice(0, 300)}»`);
  if (/^операции: \d+, срочные — в срок [1-9]/.test(line)) ok(`планёрка: «${line}» (снимок ${await shot('e2e-surgery-3-meeting.jpg')} КБ)`);
  else fail(`планёрка, строка «Операции»: «${line}»`);
  await page.evaluate(() => window.__game.actions.money({ kind: 'close' }));
  await until(() => !window.__game.store.get().economy?.open, null, 10000);
}
