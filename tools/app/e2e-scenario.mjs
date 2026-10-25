// Сценарий в браузере, часть 24 — сценарий 1 «Амбулатория» (spec docs/specs/2026-10-scenario-1.md, часть 2, «Проверки»).
// Экран начала: «Кампания» — «Сценарий 1. Амбулатория» первой, под ней «Песочница». В игре: касса сценария, письмо наставницы с
// «Без обучения», следующее — без него; в каталоге стройки — только помещения сценария, прочее движок не строит. Стройка
// командами окна: регистратура без двери — письмо о двери, без мебели — об обстановке, без людей — о найме, каждое один раз;
// первый кабинет врача — ваш. Больница открыта, часы стоят — письмо «пустите часы»; пришёл первый — «щёлкните по нему»; ждёт
// вас — «Позвать». Первые трое у вас — ОРВИ, фарингит и цистит. «Без обучения» во вкладке «Цели» — писем к состояниям больше
// нет. «До утра» — на планёрке раздел «Письма» и выполненная цель; закрыли планёрку — её письма прочитаны. Часть 2в (решения
// владельца #114, #115): в каталоге стройки — порядок стройки, шаги с номером, у следующего — «зачем»; «Порядок стройки»
// выключается и включается; во «Целях» — построенное с галочкой, следующий шаг — санузел; строки «Кто вы» в окне врача нет.
// Снимки — `e2e-scenario-*.jpg`.
import { join } from 'node:path';

const SC = 'scenario.ambulatory';
/** Помещения амбулатории — как в site-kit тестов движка: тип, прямоугольник со стенами; двери — посередине нижней стены. */
const ROOMS = [
  ['room.reception', 6, 6, 6, 7],
  ['room.waiting', 11, 6, 9, 7],
  ['room.office', 19, 6, 8, 7],
  ['room.staff', 26, 6, 6, 7],
  ['room.procedure', 31, 6, 6, 7],
  ['room.lab', 36, 6, 6, 7],
];

/** @param {{ page: import('playwright-core').Page, port: number, out: string, ok: (m: string) => void, fail: (m: string) => void, q: string, shots: string }} x */
export async function scenarioPart({ page, port, out, ok, fail, q, shots }) {
  const until = (fn, a, ms = 30000) => page.waitForFunction(fn, a, { timeout: ms });
  const flat = s => (s ?? '').replace(/[\s  ]+/g, ' ').trim();
  /** Снимок: JPEG, в качестве `--shots` (для документов) или как есть. */
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
  /** Снимок движка из потока расчёта. */
  const state = () => page.evaluate(() => window.__game.client.save());
  /** Номер помещения этого типа в больнице окна; ещё нет — ждём. */
  const roomId = type =>
    until(t => window.__game.hospital.site.rooms.find(r => r.type === t)?.id, type, 10000).then(h => h.jsonValue());
  /** Письмо в карточке: номер, текст, есть ли «Без обучения». */
  const card = () =>
    page.evaluate(() => {
      const el = document.getElementById('letter');
      return el ? { id: el.dataset.letter, text: el.innerText.replace(/\s+/g, ' '), off: !!document.getElementById('letter-off') } : null;
    });
  /** Ждать письмо `id` в карточке, проверить, снять (`name`) и прочитать кнопкой `how` («Понятно» или ✕ «Пропустить»). */
  const letter = async (id, how = '#letter-ok', name = '') => {
    const got = await until(x => document.getElementById('letter')?.dataset.letter === x, id, 30000).then(() => true, () => false);
    const c = await card();
    if (got) ok(`письмо «${id}»: «${c.text.slice(0, 100)}…»${name ? ` (снимок ${await shot(name)} КБ)` : ''}`);
    else fail(`письмо «${id}» не пришло; в карточке: ${JSON.stringify(c)}; пришли: ${JSON.stringify(await page.evaluate(() => window.__game.scenario.view?.letters))}`);
    if (got) {
      await page.click(how);
      await until(x => document.getElementById('letter')?.dataset.letter !== x, id, 5000).catch(() => fail(`письмо «${id}» не закрылось`));
    }
    return c;
  };

  // ---------------------------------------------------------------- экран начала
  await page.goto(`http://127.0.0.1:${port}/index.html?q=${q}&lang=ru&seed=5&flow=6,1`);
  await page.waitForSelector('#start-scenario-ambulatory', { timeout: 60000 });
  const heads = await page.$$eval('#start h2', els => els.map(e => e.textContent ?? ''));
  const cardText = flat(await page.innerText('#start-scenario-ambulatory'));
  if (heads[0] === 'Кампания' && heads.includes('Песочница') && cardText.startsWith('Сценарий 1. Амбулатория')) {
    ok(`экран начала: «Кампания» — «${cardText}», под ней «Песочница» (снимок ${await shot('e2e-scenario-1-start.jpg')} КБ)`);
  } else fail(`экран начала: ${JSON.stringify({ heads, cardText })}`);
  await page.click('#start-scenario-ambulatory');
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  await until(x => window.__game.scenario.view?.id === x, SC);
  const cash = await until(() => window.__game.store.get().economy?.cash).then(h => h.jsonValue());
  const paused = await page.evaluate(() => window.__game.speed === 0);
  if (cash === 600000 && paused) ok('сценарий начат: пустое здание, касса сценария 600 000 ₽, часы стоят');
  else fail(`начало сценария: касса ${cash}, часы стоят — ${paused}`);

  // ---------------------------------------------------------------- письма «в начале»
  const hello = await letter('hello');
  if (hello?.off && /Мира Холм/.test(hello.text)) ok('первое письмо — от наставницы, с «Без обучения»');
  else fail(`первое письмо: ${JSON.stringify(hello)}`);
  const budget = await letter('budget');
  if (budget && !budget.off) ok('второе письмо — без «Без обучения»');
  else fail(`второе письмо: ${JSON.stringify(budget)}`);

  // ---------------------------------------------------------------- каталог стройки и отказ
  const catalog = await page.evaluate(() => window.__game.store.get().roomTypes.map(r => r.id).sort());
  const list = await page.evaluate(x => [...window.__game.db.scenarios[x].build].sort(), SC);
  if (JSON.stringify(catalog) === JSON.stringify(list)) ok(`каталог стройки — помещения сценария: ${catalog.length}`);
  else fail(`каталог стройки: ${JSON.stringify(catalog)} — ждали ${JSON.stringify(list)}`);
  await site({ kind: 'room', type: 'room.emergency', x: 6, y: 20, w: 9, h: 6 });
  await page.waitForTimeout(300);
  if (!(await state()).hospital.site.rooms.some(r => r.type === 'room.emergency')) ok('смотровую приёмного — не из списка — движок не строит');
  else fail('смотровая приёмного построена в сценарии');

  // ---------------------------------------------------------------- порядок стройки (решение владельца #114)
  const order = await page.evaluate(x => window.__game.db.scenarios[x].guide.map(g => g.room), SC);
  /** Готовые помещения в каталоге: тип, номер шага, «зачем» у следующего. */
  const readyRows = () =>
    page.$$eval('#ready-types > li', els =>
      els.map(e => ({ id: e.querySelector('button')?.id ?? '', step: e.querySelector('.gstep')?.textContent ?? '', why: e.querySelector('.gwhy')?.textContent ?? '' })),
    );
  await page.click('#build');
  await page.waitForSelector('#tool-ready', { timeout: 5000 });
  await page.click('#tool-ready');
  await page.waitForSelector('#ready-types', { timeout: 5000 });
  let rows = await readyRows();
  const head = rows.slice(0, order.length).map(r => r.id.replace('ready-', 'room.'));
  if (JSON.stringify(head) === JSON.stringify(order) && rows[0].step === '1' && /^дальше: без неё никто не войдёт/.test(rows[0].why) && rows.filter(r => r.why).length === 1) {
    ok(`каталог стройки по порядку: ${rows.map(r => `${r.step} ${r.id.slice(6)}`).join(', ')}; у первого — «${rows[0].why}» (снимок ${await shot('e2e-scenario-1b-guide.jpg')} КБ)`);
  } else fail(`порядок в каталоге: ${JSON.stringify(rows)}`);
  await page.click('#guide-toggle');
  await until(() => window.__game.scenario.view?.guideOff === true, null, 5000).catch(() => {});
  rows = await readyRows();
  const names = await page.$$eval('#ready-types > li button span', els => els.map(e => e.textContent ?? ''));
  const sorted = [...names].sort((a, b) => a.localeCompare(b, 'ru'));
  if (rows.every(r => !r.step && !r.why) && JSON.stringify(names) === JSON.stringify(sorted)) ok('«Порядок стройки» выключен — каталог по алфавиту, без номеров');
  else fail(`порядок выключен: ${JSON.stringify({ rows, names })}`);
  await page.click('#guide-toggle');
  await until(() => window.__game.scenario.view && !window.__game.scenario.view.guideOff, null, 5000).catch(() => fail('«Порядок стройки» не включился'));
  await page.click('#build');

  // ---------------------------------------------------------------- стройка по подсказкам: письма к состояниям
  const [rt, rx, ry, rw, rh] = ROOMS[0];
  await site({ kind: 'room', type: rt, x: rx, y: ry, w: rw, h: rh });
  const reception = await roomId(rt);
  // первым помещению не хватает двери, затем — мебели, затем — людей
  await letter('door', '#letter-skip');
  await site({ kind: 'door', room: reception, cells: [[rx + Math.floor(rw / 2), ry + rh - 1]] });
  await letter('furnish');
  await site({ kind: 'furnish', room: reception });
  await letter('hire');
  for (const role of await page.evaluate(t => window.__game.db.rooms[t].staff, rt)) await site({ kind: 'hire', room: reception, role });
  for (const [type, x, y, w, h] of ROOMS.slice(1)) {
    await site({ kind: 'room', type, x, y, w, h });
    const id = await roomId(type);
    await site({ kind: 'furnish', room: id });
    await site({ kind: 'door', room: id, cells: [[x + Math.floor(w / 2), y + h - 1]] });
    // кабинет врача — ваш: в него не нанимают
    if (type !== 'room.office') for (const role of await page.evaluate(t => window.__game.db.rooms[t].staff, type)) await site({ kind: 'hire', room: id, role });
  }
  await site({ kind: 'done' });
  const office = await roomId('room.office');
  const mine = await until(x => window.__game.hospital.site.mine === x, office, 10000).then(() => true, () => false);
  if (mine) ok('первый кабинет врача — ваш («Мой кабинет» сам)');
  else fail(`свой кабинет: ${await page.evaluate(() => window.__game.hospital.site.mine)}`);
  // письмо о двери — один раз: зал ожидания без двери его не вернул
  const doors = await page.evaluate(() => window.__game.scenario.view.letters.filter(l => l.id === 'door').length);
  if (doors === 1) ok('письмо к состоянию — одно: второе помещение без двери его не вернуло');
  else fail(`писем «door»: ${doors}`);
  // больница открыта, часы стоят
  await letter('run', '#letter-ok', 'e2e-scenario-2-letter.jpg');

  // ---------------------------------------------------------------- первые пришедшие: письма и заданные больные
  await page.evaluate(() => window.__game.actions.setSpeed(12));
  // пришёл первый — письмо о его пути; ждёт вас — «Позвать»
  await letter('look');
  await letter('call');
  // первые трое у вас — заданные: ждём, пока придут (движок — снимком из потока расчёта)
  let st = await state();
  for (let i = 0; i < 120 && (st.campaign?.taught ?? 0) < 3; i++) {
    await page.waitForTimeout(1000);
    st = await state();
  }
  const taught = [...Object.values(st.patients), ...(st.past ?? []).map(x => x.p)]
    .filter(p => p.taught)
    .sort((a, b) => a.arriveT - b.arriveT)
    .map(p => p.patient.truth.conditions[0].id);
  const want = await page.evaluate(x => window.__game.db.scenarios[x].tutorial.map(t => t.condition), SC);
  if (JSON.stringify(taught) === JSON.stringify(want) && st.campaign.taught === 3) ok(`первые трое у вас — заданные: ${taught.join(', ')}`);
  else fail(`заданные больные: ${JSON.stringify({ taught, want, n: st.campaign?.taught })}`);

  // ---------------------------------------------------------------- «Цели» и «Без обучения»
  await page.evaluate(() => window.__game.actions.setSpeed(0));
  await page.click('#tab-goals');
  await page.waitForSelector('#goals', { timeout: 5000 });
  // порядок стройки во «Целях»: построенное — с галочкой, следующий шаг — санузел (его в амбулатории сценария ещё нет)
  const guide = await page.$$eval('#guide-list li', els => els.map(e => ({ room: e.dataset.room, cls: e.className, step: e.querySelector('.gstep')?.textContent ?? '' })));
  const built = guide.filter(g => g.cls === 'done').map(g => g.room);
  const next = guide.find(g => g.cls === 'next');
  if (built.length === ROOMS.length && ROOMS.every(([t]) => built.includes(t)) && next?.room === 'room.toilet' && next.step === '5') {
    ok(`«Цели» — порядок стройки: построено ${built.length} из ${guide.length}, дальше — шаг ${next.step}, санузел`);
  } else fail(`порядок стройки во «Целях»: ${JSON.stringify(guide)}`);
  // роль в сценарии — «Врач», без смены (решение владельца #115)
  const roles = await page.evaluate(() => ({ row: !!document.getElementById('dock-roles'), role: window.__game.doctor.hud.role }));
  if (!roles.row && roles.role === 'doctor') ok('роль в сценарии — «Врач»: строки «Кто вы» в окне врача нет');
  else fail(`роль в сценарии: ${JSON.stringify(roles)}`);
  const goals = await page.$$eval('#goals ul.goals li', els => els.map(e => ({ id: e.id, ok: e.classList.contains('ok'), text: e.textContent ?? '' })));
  if (goals.length === 5 && goals.find(g => g.id === 'goal-lab')?.ok && goals.find(g => g.id === 'goal-seen')?.text.includes('из 100')) {
    ok(`«Цели»: ${goals.length}, «Открыть лабораторию» — выполнена, «Принять 100…» — «${flat(goals.find(g => g.id === 'goal-seen').text).slice(-24)}» (снимок ${await shot('e2e-scenario-3-goals.jpg')} КБ)`);
  } else fail(`«Цели»: ${JSON.stringify(goals)}`);
  await page.click('#goals-tutorial');
  await until(() => window.__game.scenario.view?.off === true, null, 5000).catch(() => {});
  // письмо к состоянию, которого ещё не было, при «Без обучения» не приходит
  await page.evaluate(() => window.__game.client.command({ kind: 'mark', what: 'hint', id: 'asks' }));
  await page.waitForTimeout(400);
  const off = await page.evaluate(() => ({ off: window.__game.scenario.view.off, asks: window.__game.scenario.view.letters.some(l => l.id === 'asks') }));
  if (off.off && !off.asks) ok('«Без обучения»: писем к состояниям больше нет');
  else fail(`«Без обучения»: ${JSON.stringify(off)}`);
  await page.click('#tab-goals');

  // ---------------------------------------------------------------- планёрка: «Письма»
  // «До утра»: заданные ждут вас и уходят, не дождавшись, — автопаузу окна врача снять; карта, открытая автопаузой, — Esc
  await page.evaluate(() => window.__game.actions.doctor({ kind: 'autopause', on: false }));
  const t0 = Date.now();
  await page.click('#speed-ff');
  for (;;) {
    const h = await page.evaluate(() => ({ open: window.__game.store.get().economy?.open ?? false, ff: window.__game.ff, speed: window.__game.speed, card: window.__game.doctor.open }));
    if (h.open || Date.now() - t0 > 240000) break;
    if (h.card) await page.keyboard.press('Escape');
    else if (!h.ff && h.speed === 0) await page.click('#speed-ff');
    await page.waitForTimeout(200);
  }
  const meet = flat(await page.innerText('#meet-letters', { timeout: 10000 }).catch(() => ''));
  if (/Цель выполнена: Открыть лабораторию/.test(meet) && /Первые сутки позади/.test(meet) && /Лаборатория работает/.test(meet)) {
    ok(`планёрка, «Письма»: выполненная цель, письма «после первых суток» и о лаборатории (снимок ${await shot('e2e-scenario-4-meeting.jpg')} КБ)`);
  } else fail(`планёрка, «Письма»: «${meet.slice(0, 300)}»`);
  await page.evaluate(() => window.__game.actions.money({ kind: 'close' }));
  await until(() => {
    const v = window.__game.scenario.view;
    return v && ['firstDay', 'labDone'].every(id => v.letters.find(l => l.id === id)?.read);
  }, null, 10000).then(() => ok('закрыли планёрку — её письма прочитаны, карточкой не вернутся'), () => fail('письма планёрки не прочитаны'));
}
