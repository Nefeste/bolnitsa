// Сценарий в браузере, часть 5 — касса, планёрка, обход (spec docs/specs/2026-10-economy.md, «Тесты»). Пустое здание: касса
// 1 200 000 ₽ в верхней полосе; помещение мышью — призрак с ценой, касса минус цена; снос — половина назад, Ctrl+Z — снова
// минус; часы приёма во вкладке «Отчёты» — команда движка. Готовая больница, поток от больницы: «До утра» — до 08:00 (на
// событиях автопаузы — снова), планёрка с автопаузой: сутки в цифрах, касса по статьям, репутация, подсказка; «Продолжить» —
// часы идут; «почему?» у пришедших и ушедших (spec docs/specs/2026-10-why.md) — числа итога суток. Затем ваш лежащий: позвать
// из очереди, диагноз, «В палату», «Завершить приём» — строка «Обхода» с динамикой; «Сменить лечение» — карта с блоком обхода,
// новое лечение в листе назначений; «Выписать» — строки нет. «Кто ушёл» с экрана планёрки — «Пациенты» → «Ушли», часы стоят.
// Снимки — `e2e-economy-*.jpg` (JPEG: для документов).
import { join } from 'node:path';

/** @param {{ page: import('playwright-core').Page, port: number, out: string, ok: (m: string) => void, fail: (m: string) => void, q: string, shots: string }} x */
export async function economyPart({ page, port, out, ok, fail, q, shots }) {
  const until = (fn, a, ms = 30000) => page.waitForFunction(fn, a, { timeout: ms });
  const eco = () => page.evaluate(() => {
    const e = window.__game.store.get().economy;
    return { cash: e?.cash, today: e?.today, reputation: e?.reputation, open: e?.open ?? false, hours: e?.hours, meeting: !!e?.meeting };
  });
  /** Текст элемента, как его видно, одной строкой; пробелы внутри чисел («1 200 000») — обычные. */
  const text = sel => page.innerText(sel, { timeout: 5000 }).then(t => (t ?? '').replace(/[\s  ]+/g, ' ').trim(), () => '');
  /** Первое число в тексте: «−12 300 ₽» → −12300. */
  const num = s => {
    const m = s.match(/([−-]?)\s?(\d[\d ]*)/);
    return m ? (m[1] ? -1 : 1) * Number(m[2].replace(/ /g, '')) : NaN;
  };
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
  const at = (x, y) => page.evaluate(([cx, cy]) => window.__game.stage.screenOfCell(cx, cy), [x, y]);
  const look = async (x, y, half = 10) => {
    await page.evaluate(([cx, cy, h]) => {
      const g = window.__game;
      g.stage.cam.target.set(cx, 0, cy);
      g.stage.cam.half = h;
    }, [x, y, half]);
    await page.waitForTimeout(200);
  };
  /** Камера на клетки: ближе всего, чтобы все были в кадре и не под панелями (стройка слева, вкладки справа). */
  const fit = async (cells, cx, cy) => {
    for (let half = 8; half <= 24; half += 1) {
      await look(cx, cy, half);
      const pts = await Promise.all(cells.map(([x, y]) => at(x, y)));
      if (pts.every(p => p && p.x > 320 && p.x < 980 && p.y > 210 && p.y < 690)) return pts;
    }
    return Promise.all(cells.map(([x, y]) => at(x, y)));
  };

  // ---------------------------------------------------------------- пустое здание: стройка из кассы
  await page.goto(`http://127.0.0.1:${port}/index.html?q=${q}&lang=ru&hospital=empty`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  await until(() => window.__game.store.get().economy?.cash !== undefined);
  const START = 1_200_000;
  const e0 = await eco();
  const top0 = await text('#cash');
  if (e0.cash === START && num(await text('#cash-now')) === START && e0.reputation === 50) ok(`касса пустого здания: «${top0}», репутация ${e0.reputation}`);
  else fail(`касса пустого здания: ${JSON.stringify(e0)}, «${top0}»`);

  await page.keyboard.press('KeyB');
  await page.click('#tool-room');
  await page.click('#rt-reception');
  const [a, b] = await fit([[6, 6], [11, 12]], 9, 9.5);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.waitForTimeout(200);
  const ghost = await text('#ghost');
  const price = num(ghost.split('—').at(-1) ?? '');
  ok(`снимок стройки: ${join(out, 'e2e-economy-0-build.jpg')} (${await shot('e2e-economy-0-build.jpg')} КБ)`);
  await page.mouse.up();
  await until(() => window.__game.hospital.site.rooms.length === 1);
  const built = await until(c => window.__game.store.get().economy?.cash === c, START - price).then(() => true, () => false);
  const today = await text('#cash-today');
  if (price > 0 && built && num(today) === -price) ok(`помещение мышью: призрак «${ghost}» — касса ${START} → ${START - price}, «${today}»`);
  else fail(`стройка из кассы: призрак «${ghost}», цена ${price}, касса ${JSON.stringify(await eco())}, «${today}»`);
  // снос — половина цены назад; Ctrl+Z — снова как было
  await until(() => !!document.getElementById('card-demolish'));
  await page.click('#card-demolish');
  await until(() => window.__game.hospital.site.rooms.length === 0);
  const half = await until(c => window.__game.store.get().economy?.cash === c, START - price + Math.floor(price / 2)).then(() => true, () => false);
  await page.keyboard.press('Control+KeyZ');
  await until(() => window.__game.hospital.site.rooms.length === 1);
  const back = await until(c => window.__game.store.get().economy?.cash === c, START - price).then(() => true, () => false);
  if (half && back) ok(`снос — плюс ${Math.floor(price / 2)} (половина), Ctrl+Z — снова минус цена`);
  else fail(`снос и отмена: ${JSON.stringify(await eco())}`);
  await page.keyboard.press('KeyB');

  // часы приёма — во вкладке «Отчёты»: команда движка
  await page.click('#tab-reports');
  await page.waitForSelector('#hours-close', { timeout: 10000 });
  await page.selectOption('#hours-close', '18');
  await until(() => window.__game.store.get().economy?.hours?.[1] === 18);
  const hours = await page.evaluate(async () => (await window.__game.client.save()).flow?.hours);
  if (hours?.[0] === 8 && hours?.[1] === 18) ok(`часы приёма во вкладке «Отчёты»: ${hours.join('–')} — в движке`);
  else fail(`часы приёма: в движке ${JSON.stringify(hours)}`);

  // ---------------------------------------------------------------- готовая больница: «До утра» и планёрка
  await page.goto(`http://127.0.0.1:${port}/index.html?q=${q}&lang=ru&hospital=preset`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  await until(() => window.__game.store.get().economy?.cash !== undefined && !!window.__game.store.get().doctor?.state);
  const p0 = await eco();
  const t0 = Date.now();
  let stops = 0;
  await page.click('#speed-ff');
  for (;;) {
    const h = await page.evaluate(() => ({ open: window.__game.store.get().economy?.open ?? false, ff: window.__game.ff, speed: window.__game.speed, card: window.__game.doctor.open, t: window.__game.t }));
    if (h.open || Date.now() - t0 > 240000) break;
    if (h.card) await page.keyboard.press('Escape');
    // «До утра» остановилось на событии автопаузы («красный», просьба врача, вашему лежащему хуже) — дальше
    else if (!h.ff && h.speed === 0) {
      stops++;
      await page.click('#speed-ff');
    }
    await page.waitForTimeout(200);
  }
  const m = await page.evaluate(() => ({ t: window.__game.t, speed: window.__game.speed, e: window.__game.store.get().economy }));
  const secs = Math.round((Date.now() - t0) / 1000);
  if (m.e?.open && m.t === 32 * 3600 && m.speed === 0 && (await page.$('#meeting'))) ok(`«До утра» — планёрка в 08:00 вторых суток, автопауза (${secs} с, остановок на событиях — ${stops})`);
  else fail(`планёрка: открыта ${m.e?.open}, часы ${m.t}, скорость ${m.speed} (${secs} с)`);
  const cashText = await text('#meet-cash');
  const rep = await text('#meet-rep');
  const cashAt = num((await text('#meet-cashat')).split(':').at(-1) ?? '');
  const net = await text('#meet-net');
  const day = await text('#meet-day');
  if (cashText.includes('Доходы') && cashText.includes('Расходы') && cashText.includes('зарплаты') && cashAt === m.e.cash && m.e.today === 0) ok(`касса суток: «${net}», в кассе на 08:00 — ${cashAt} (было ${p0.cash})`);
  else fail(`касса на планёрке: «${cashText.slice(0, 200)}», на 08:00 ${cashAt}, в полосе ${m.e?.cash}`);
  if (/\d+ → \d+/.test(rep) && num(await text('#reputation-now')) === m.e.reputation) ok(`репутация: «${rep.slice(0, 160)}»`);
  else fail(`репутация: «${rep}», в полосе ${m.e?.reputation}`);
  ok(`сутки: «${day}»; подсказка: «${(await text('#meet-tip')).slice(0, 120)}»`);
  // «Почему?» у цифр планёрки (spec docs/specs/2026-10-why.md): кто пришёл и от чего поток; почему ушли — числа из итога суток
  const sum = await page.evaluate(() => window.__game.store.get().economy.meeting.summary);
  await page.click('#meeting #meet-why-arrived');
  const why = await text('#meeting #meet-why-arrived-box');
  const kinds = [['walkIn', 'сами'], ['appointment', 'по записи'], ['ambulance', 'скорая'], ['return', 'повторно']].filter(([k]) => (sum.arrivedBy?.[k] ?? 0) > 0);
  const total = kinds.reduce((n, [k]) => n + sum.arrivedBy[k], 0);
  const f = sum.inflow;
  if (total === sum.arrived && kinds.every(([k, w]) => why.includes(`${w} — ${sum.arrivedBy[k]}`)) && f && why.includes(`около ${Math.round(f.walk)}`) && why.includes(`около ${Math.round(f.amb)}`))
    ok(`«почему?» у пришедших: «${why.slice(0, 260)}»`);
  else fail(`«почему?» у пришедших: «${why}», итог ${JSON.stringify({ arrived: sum.arrived, by: sum.arrivedBy, inflow: f })}`);
  if (sum.left > 0) {
    await page.click('#meeting #meet-why-left');
    const gone = await text('#meeting #meet-why-left-box');
    const rows = await page.$$eval('#meeting #meet-why-left-box li', els => els.map(e => e.id));
    const n = Object.values(sum.leftBy?.why ?? {}).reduce((a, b) => a + b, 0);
    if (n === sum.left && rows.length === Object.values(sum.leftBy.why).filter(x => x > 0).length && gone.includes('Кто ушёл')) ok(`«почему?» у ушедших (${sum.left}): «${gone.slice(0, 260)}»`);
    else fail(`«почему?» у ушедших: «${gone}», итог ${JSON.stringify(sum.leftBy)}, ушли ${sum.left}`);
  } else ok('ушедших за сутки нет — «почему?» у них не показан');
  // открытый разбор — кнопка «почему?» подсвечена (класс `on`, aria-expanded), у обеих
  const marks = await page.$$eval('#meeting button.why', els => els.map(e => `${e.id}:${e.className}:${e.getAttribute('aria-expanded')}`));
  if (marks.length > 0 && marks.every(m => m.endsWith(':why on:true'))) ok(`кнопки «почему?» открытых разборов подсвечены: ${marks.join(', ')}`);
  else fail(`кнопки «почему?»: ${marks.join(', ')}`);
  // рамка кнопки «почему?» загорается переходом (0,12 с); на паузе кадров мало — дать ему кончиться до снимка
  await page.waitForTimeout(500);
  ok(`снимок планёрки: ${join(out, 'e2e-economy-1-meeting.jpg')} (${await shot('e2e-economy-1-meeting.jpg')} КБ)`);
  await page.click('#meeting-close');
  await until(() => !window.__game.store.get().economy?.open && window.__game.speed === 1);
  ok('«Продолжить» — планёрка закрыта, часы идут ×1');
  // утро — сохранение само (spec docs/specs/2026-10-saves.md): ячейка «утро» второго дня в меню игры
  const auto = await until(() => window.__game.store.get().menu.rows.find(r => r.meta?.kind === 'auto' && r.meta.day === 2) ?? null, null, 30000)
    .then(h => h.jsonValue(), () => null);
  if (auto?.slot === 'auto-1') ok(`утреннее сохранение: ячейка ${auto.slot}, день ${auto.meta.day}, ${Math.floor((auto.meta.t % 86400) / 3600)}:00`);
  else fail(`утреннего сохранения нет: ${JSON.stringify(await page.evaluate(() => window.__game.store.get().menu.rows))}`);

  // ---------------------------------------------------------------- ваш лежащий: «Обход»
  const card = () => page.evaluate(() => window.__game.store.get().doctor?.card ?? null);
  const fresher = v => until(prev => (window.__game.store.get().doctor?.card?.version ?? 0) > prev, v);
  await page.keyboard.press('Digit3');
  const who = await until(() => {
    const st = window.__game.store.get().doctor?.state;
    return st && !st.current ? (st.yours[0] ?? st.others[0])?.id ?? null : null;
  }, null, 120000).then(h => h.jsonValue());
  await page.evaluate(id => window.__game.actions.doctor({ kind: 'take', id }), who);
  // идёт к вам — карта, когда войдёт (spec docs/specs/2026-10-owner-play-2.md)
  await page.waitForSelector('#dcard:not(.read)', { timeout: 60000 });
  let v = (await card()).version;
  // своя карта — шагами (решение владельца #104): диагноз и место — в шаге «Решение»
  await page.click('#step-decide');
  // диагноз — первый из «Похоже на» (уровень «Студент»), нет подсказок — первый в списке
  const dx = (await card()).hints[0]?.id ?? (await page.$eval('#dx-select option:nth-child(2)', o => o.value));
  await page.selectOption('#dx-select', dx);
  await fresher(v);
  v = (await card()).version;
  await page.click('#set-admit');
  await fresher(v);
  const draft = (await card()).draft;
  await page.click('#dcard-finish');
  await page.waitForSelector('#review', { timeout: 30000 });
  await page.click('#dcard-done');
  await until(() => !document.getElementById('dcard'));
  const row = await until(id => !!document.getElementById(`dw-${id}`), who).then(() => true, () => false);
  const rowText = await text(`#dw-${who}`);
  if (draft.setting === 'admit' && row && rowText.includes('Лечение')) ok(`ваш лежащий в «Обходе»: «${rowText.slice(0, 160)}»`);
  else fail(`«Обход»: черновик ${JSON.stringify(draft)}, строка ${row}, «${rowText}»`);
  // «Сменить лечение» — карта с блоком обхода; добавить лечение из листа назначений. Карта лежащего часы не держит
  // (spec 2026-10-owner-play-2) — пауза, чтобы вид карты менялся только от действий
  await page.evaluate(() => window.__game.actions.setSpeed(0));
  await page.click(`#ward-replan-${who}`);
  await page.waitForSelector('#dcard-round', { timeout: 20000 });
  const r0 = (await card()).round;
  // лечение «при этом диагнозе», которого ещё нет; нет такого — из всего лечения
  const free = '#dcard-round input[type=checkbox]:not(:checked):not([disabled])';
  if (!(await page.$(free))) await page.click('#dcard-round-all');
  const box = await page.$(free);
  const txId = await box?.evaluate(el => el.closest('label')?.id ?? '');
  await box?.click();
  await page.evaluate(() => document.getElementById('dcard-round')?.scrollTo(0, 0));
  await page.waitForTimeout(150);
  ok(`снимок обхода: ${join(out, 'e2e-economy-2-round.jpg')} (${await shot('e2e-economy-2-round.jpg')} КБ)`);
  v = (await card()).version;
  await page.click('#dcard-replan');
  await fresher(v);
  const r1 = (await card()).round;
  const replans = await page.evaluate(async id => (await window.__game.client.save()).patients[id]?.stay?.replans, who);
  if (txId && r1 && r1.current.length === r0.current.length + 1 && replans === 1) ok(`«Сменить лечение»: ${txId} — в листе назначений (${r0.current.length} → ${r1.current.length}), замен — ${replans}`);
  else fail(`смена лечения: ${txId}, было ${JSON.stringify(r0?.current)}, стало ${JSON.stringify(r1?.current)}, замен ${replans}`);
  // «Выписать» — строки в «Обходе» нет
  await page.click('#dcard-discharge');
  await until(id => !window.__game.store.get().doctor?.state?.ward.some(r => r.id === id), who);
  await page.keyboard.press('Escape');
  await until(() => !document.getElementById('dcard'));
  if (!(await page.$(`#dw-${who}`))) ok('«Выписать» — строки в «Обходе» нет');
  else fail('после выписки строка в «Обходе» осталась');
  // «Кто ушёл» (spec docs/specs/2026-10-why.md): с экрана планёрки — вкладка «Пациенты», список «Ушли»; экран закрыт, часы стоят
  if (sum.left > 0) {
    await page.evaluate(() => window.__game.actions.setSpeed(1));
    await page.evaluate(() => window.__game.actions.money({ kind: 'open' }));
    await page.waitForSelector('#meeting');
    await page.click('#meeting #meet-why-left');
    await page.click('#meeting #meet-gone');
    const list = await until(() => {
      const st = window.__game.store.get();
      return !st.economy?.open && window.__game.speed === 0 && st.tab === 'patients' && st.patientFilter.list === 'gone';
    }).then(() => text('#patients'), () => '');
    if (list && (await page.$('#pf-gone.on'))) ok(`«Кто ушёл» — планёрка закрыта, часы стоят, «Пациенты» → «Ушли»: «${list.slice(0, 160)}»`);
    else fail(`«Кто ушёл»: ${JSON.stringify(await page.evaluate(() => ({ open: window.__game.store.get().economy?.open, speed: window.__game.speed, tab: window.__game.store.get().tab, list: window.__game.store.get().patientFilter.list })))}`);
  }
}
