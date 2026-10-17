// Сценарий в браузере, часть 4 — режим врача (spec docs/specs/2026-10-doctor-mode.md, «Тесты»): готовая больница, зерно 11
// и поток числами — 6 в час, скорая 1 в час (`flow=6,1`, как до потока от больницы части 5б), — нанятый терапевт просит
// посмотреть больного к 08:55. Просьба — автопауза и вкладка; «Посмотреть» — карта пациента:
// вопрос, осмотр, анализ с ожиданием результата, уровень «Врач» убирает «Похоже на», гипотеза, диагноз, лечение,
// «Завершить приём» — разбор с оценками. Затем «Взять случай» у больного нанятого врача с карты, «Мой кабинет» —
// переезд и обратно, «Не принимаю», «Свои больные». Снимки карты — `e2e-doctor-*.jpg` (JPEG: для документов).
import { join } from 'node:path';

/** @param {{ page: import('playwright-core').Page, port: number, out: string, ok: (m: string) => void, fail: (m: string) => void, q: string, shots: string }} x */
export async function doctorPart({ page, port, out, ok, fail, q, shots }) {
  const until = (fn, a, ms = 30000) => page.waitForFunction(fn, a, { timeout: ms });
  const hud = () => page.evaluate(() => {
    const h = window.__game.store.get();
    return { t: window.__game.t, speed: window.__game.speed, tab: h.tab, d: h.doctor };
  });
  const card = () => page.evaluate(() => window.__game.store.get().doctor?.card ?? null);
  /** Снимок карты: JPEG, в качестве `--shots` (для документов) или как есть. */
  const shot = async name => {
    if (shots) {
      await page.evaluate(x => window.__game.actions.setQuality(x), shots);
      await page.waitForTimeout(400);
    }
    const buf = await page.screenshot({ path: join(out, name), type: 'jpeg', quality: 72 });
    if (shots) await page.evaluate(x => window.__game.actions.setQuality(x), q);
    return Math.round(buf.length / 1024);
  };
  /** Ждать, пока вид карты станет новее `v` (поток ответил на действие). */
  const fresher = v => until(prev => (window.__game.store.get().doctor?.card?.version ?? 0) > prev, v);

  await page.goto(`http://127.0.0.1:${port}/index.html?q=${q}&lang=ru&hospital=preset&seed=11&flow=6,1`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  await until(() => !!window.__game.store.get().doctor?.state && !!window.__game.crowd.walkers.get('you'));
  const office0 = (await hud()).d?.state?.office;
  const you = await page.evaluate(() => !!window.__game.crowd.walkers.get('you'));
  if (office0 && you) ok(`вы на карте: ваш кабинет ${office0}, фигура врача с меткой`);
  else fail(`фигура врача: кабинет ${office0}, фигура ${you}`);

  // просьба: ×4 до неё — автопауза, вкладка «Просят посмотреть»
  await page.keyboard.press('Digit3');
  await until(() => (window.__game.store.get().doctor?.state?.asks.length ?? 0) > 0, null, 180000);
  await page.waitForTimeout(300);
  const a = await hud();
  const ask = a.d.state.asks[0];
  if (a.speed === 0 && a.tab === 'asks' && (await page.$(`#ask-look-${ask.id}`))) ok(`просьба: «${ask.role}, навык ${ask.skill}» о ${ask.who} — автопауза, вкладка «Просят посмотреть»`);
  else fail(`просьба: скорость ${a.speed}, вкладка ${a.tab}`);
  ok(`снимок: ${join(out, 'e2e-doctor-0-asks.jpg')} (${await shot('e2e-doctor-0-asks.jpg')} КБ)`);

  // «Найти» (spec docs/specs/2026-10-owner-play.md): камера к пациенту, его карточка на карте — с именем, как в просьбе
  await page.click(`#ask-find-${ask.id}`);
  await until(() => !window.__game.stage.cam.flying, null, 20000).catch(() => {});
  await page.waitForSelector('#card-title', { timeout: 10000 }).catch(() => {});
  const found = await page.evaluate(() => {
    const g = window.__game;
    const c = g.stage.cam;
    const w = g.crowd.walkers.get(g.selected);
    return { sel: g.selected, d: w ? Math.hypot(c.target.x - w.x, c.target.z - w.z) : -1, title: document.getElementById('card-title')?.textContent ?? '' };
  });
  const name = ask.who.split(',')[0];
  if (found.sel?.startsWith('p:') && found.d >= 0 && found.d < 2 && found.title.startsWith(`${name},`)) ok(`«Найти»: камера у пациента (${found.d.toFixed(2)} м), карточка «${found.title}»`);
  else fail(`«Найти»: ${JSON.stringify(found)}, в просьбе — «${ask.who}»`);
  await page.click('#card .close').catch(() => {});

  // «Посмотреть» — карта пациента; мир стоит
  await page.click(`#ask-look-${ask.id}`);
  await page.waitForSelector('#dcard', { timeout: 20000 });
  const c0 = await card();
  const title = await page.textContent('#dcard-title');
  if (c0?.id === ask.id && c0.active) ok(`«Посмотреть» — карта: «${title}», больной у вас в кабинете`);
  else fail(`карта: ${JSON.stringify({ id: c0?.id, active: c0?.active })}`);
  const t0 = (await hud()).t;
  await page.keyboard.press('Digit3');
  await page.waitForTimeout(600);
  if ((await hud()).speed === 0 && (await hud()).t === t0) ok('карта открыта — часы стоят, скорость не меняется');
  else fail(`часы идут при открытой карте: ${JSON.stringify(await hud())}`);

  // вопрос: беседой, часы — на цену вопроса
  const asked0 = await page.$$eval('#talk .pair', els => els.length);
  const qBtn = await page.$('.questions button.q:not([disabled])');
  // текст вопроса — без минут и «?» (первый текстовый узел кнопки)
  const qText = await qBtn.evaluate(el => el.firstChild?.textContent?.trim() ?? '');
  await qBtn.click();
  await fresher(c0.version);
  const asked1 = await page.$$eval('#talk .pair', els => els.length);
  const t1 = (await hud()).t;
  if (asked1 === asked0 + 1 && t1 > t0) ok(`вопрос «${qText}» — ответ в беседе, часы +${Math.round((t1 - t0) / 60)} мин`);
  else fail(`вопрос: реплик ${asked0} → ${asked1}, часы ${t0} → ${t1}`);

  // осмотр: первый несделанный в «Весь больной» или «У постели»
  await page.click('#tab-examine');
  const exam = await page.$('#ex-whole button.xrow:not([disabled]), #ex-bedside button.xrow:not([disabled])');
  const examId = await exam.getAttribute('data-exam');
  const v1 = (await card()).version;
  await exam.click();
  await fresher(v1);
  if (await page.$(`.xrow.done[data-exam="${examId}"]`)) ok(`осмотр: ${examId} — ответ на месте строки`);
  else fail(`осмотр ${examId}: строки «сделано» нет`);

  // назначить анализ бланком: галочка, «Отправить» — «Ждём»; «Подождать» — пока не придёт
  await page.click('#tab-order');
  const box = await page.$('#or-lab input[type=checkbox]:not([disabled])');
  const labId = await box.getAttribute('data-exam');
  await box.click();
  await until(id => !!document.querySelector(`input[data-exam="${id}"]:checked`), labId);
  const sum = await page.textContent('#order-sum');
  const v2 = (await card()).version;
  await page.click('#order-send');
  await fresher(v2);
  // полоса «Ждём» — без подписей кнопок
  const pend = await page.$eval('#dcard-pending > span', el => el.textContent ?? '').catch(() => '');
  if (pend.includes('Ждём')) ok(`назначить: «${sum}» → «${pend.replace(/\s+/g, ' ').trim()}»`);
  else fail(`бланк: нет «Ждём» (${pend})`);
  const tw = (await hud()).t;
  for (let i = 0; i < 6 && (await page.$('#dcard-wait')); i++) {
    const v = (await card()).version;
    await page.click('#dcard-wait');
    await fresher(v);
    await page.waitForTimeout(150);
  }
  const lab = await card();
  const labDone = lab.groups.some(g => g.exam === labId);
  if (labDone && lab.pending.length === 0) ok(`«Подождать»: результат пришёл к ${lab.clock} (часы +${Math.round(((await hud()).t - tw) / 60)} мин)`);
  else fail(`результат анализа: ${JSON.stringify({ labDone, pending: lab.pending })}`);
  await page.click('#tab-known');
  await page.waitForTimeout(200);
  ok(`снимок карты: ${join(out, 'e2e-doctor-1-card.jpg')} (${await shot('e2e-doctor-1-card.jpg')} КБ)`);

  // уровень медицины: «Врач» — «Похоже на» нет; «Студент» — снова есть
  const vl = (await card()).version;
  await page.click('#card-lvl-doctor');
  await fresher(vl);
  const noHints = !(await page.$('#dcard-likely')) && (await card()).hints.length === 0;
  const vs = (await card()).version;
  await page.click('#card-lvl-student');
  await fresher(vs);
  const hints = (await card()).hints;
  if (noHints && hints.length > 0) ok(`уровень «Врач» убирает «Похоже на», «Студент» — ${hints.length} подсказки`);
  else fail(`уровни: без подсказок ${noHints}, подсказок у «Студента» ${hints.length}`);

  // гипотеза из «Похоже на», диагноз, лечение — и «Завершить приём»
  const dx = hints[0].id;
  const dom = id => id.replace(/\./g, '_');
  let v = (await card()).version;
  await page.click(`#likely-${dom(dx)}`);
  await fresher(v);
  const inRow = await page.$(`#hyp-${dom(dx)}`);
  v = (await card()).version;
  await page.click(`#dx-${dom(dx)}`);
  await fresher(v);
  const chosen = await page.textContent('#dx-chosen');
  const tx = (await card()).suggested.find(x => !x.disabled);
  if (tx) {
    v = (await card()).version;
    await page.click(`#tx-${dom(tx.id)}`);
    await fresher(v);
  }
  const draft = (await card()).draft;
  if (inRow && draft.diagnosis === dx && (!tx || draft.treatments.includes(tx.id))) ok(`ряд: ${hints[0].name}; «${chosen}»; лечение: ${tx ? tx.name : '—'}`);
  else fail(`решение: ряд ${!!inRow}, черновик ${JSON.stringify(draft)}`);
  await page.click('#dcard-finish');
  await page.waitForSelector('#review', { timeout: 30000 });
  const review = await page.evaluate(() => ({
    verdict: document.getElementById('review-verdict')?.textContent,
    truth: document.getElementById('review-truth')?.textContent,
    overall: document.getElementById('review-overall')?.textContent,
    grades: [...document.querySelectorAll('#review-grades .grade b')].map(b => b.textContent).join(''),
  }));
  if (/^[ABCD]$/.test(review.overall ?? '') && review.truth) ok(`разбор: ${review.verdict}; ${review.truth}; оценки ${review.grades}, итог ${review.overall}`);
  else fail(`разбор: ${JSON.stringify(review)}`);
  ok(`снимок разбора: ${join(out, 'e2e-doctor-2-review.jpg')} (${await shot('e2e-doctor-2-review.jpg')} КБ)`);
  await page.click('#dcard-done');
  await until(() => !document.getElementById('dcard'));
  const closed = (await hud()).d.state.closed;
  if (closed.some(r => r.id === ask.id)) ok(`карта закрыта; в окне врача — закрытый приём с разбором`);
  else fail('закрытого приёма нет в окне врача');

  // «Взять случай» у больного нанятого врача — с карты. Ищем на ×4, но выбираем на паузе: за долю секунды на ×4 приём
  // успевает закончиться, а у ушедшего «Взять случай» скрыто (часть 3) — поэтому после паузы кандидата проверяем заново.
  const candidate = () => {
    const g = window.__game;
    for (const w of g.crowd.walkers.values()) {
      if (w.staff || w.leaving) continue;
      const info = g.pop.info(w.key);
      if (!info || info.kind !== 'patient' || !info.by || (info.doing !== 'office' && info.doing !== 'waiting')) continue;
      const p = g.stage.screenOf(w);
      if (p && p.x > 380 && p.x < 960 && p.y > 140 && p.y < 560) return { ...p, key: w.key, id: info.id };
    }
    return null;
  };
  let target = null;
  for (let tries = 0; tries < 5 && !target; tries++) {
    await page.keyboard.press('Digit3');
    await until(candidate, null, 120000);
    // пауза — действием, а не пробелом: пробел переключает, а автопауза (просьба врача) могла уже остановить часы
    await page.evaluate(() => window.__game.actions.setSpeed(0));
    target = await page.evaluate(candidate);
  }
  if (!target) throw new Error('нет больного нанятого врача на экране — пять попыток');
  await page.mouse.click(target.x, target.y);
  await page.waitForTimeout(300);
  const picked = await page.evaluate(() => window.__game.selected);
  if (picked !== target.key) await page.evaluate(k => window.__game.actions.select(k), target.key);
  await page.waitForSelector('#card-take', { timeout: 10000 });
  await page.click('#card-take');
  const took = await page.waitForSelector('#dcard', { timeout: 20000 }).then(() => true, () => false);
  const tc = await card();
  if (took && tc?.active) ok(`«Взять случай» с карты: «${await page.textContent('#dcard-title')}» — у вас в кабинете, ${tc.groups.length} результатов врача`);
  else fail(`«Взять случай»: карта ${took}, ${JSON.stringify((await hud()).d.said)}`);
  if (took) {
    // закончить быстро: диагноз — первый в списке, «Завершить приём»
    const first = await page.$eval('#dx-select option:nth-child(2)', o => o.value).catch(() => null);
    if (first) {
      const vv = (await card()).version;
      await page.selectOption('#dx-select', first);
      await fresher(vv);
      await page.click('#dcard-finish');
      await page.waitForSelector('#review', { timeout: 30000 });
      ok('второй случай закрыт — разбор');
    }
    await page.keyboard.press('Escape');
    await until(() => !document.getElementById('dcard'));
  }

  // «Мой кабинет»: кабинет гастроэнтеролога — ваш, врач переходит в ваш прежний; обратно; «Не принимаю»
  const staffRoom = id => page.evaluate(i => window.__game.staff.find(m => m.id === i)?.room, id);
  const officeOf = () => page.evaluate(() => window.__game.store.get().doctor?.state?.office);
  const select = id => page.evaluate(i => window.__game.selectRoomId(i), id);
  const gastro = await page.evaluate(() => window.__game.staff.find(m => m.role === 'role.gastroenterologist'));
  await select(gastro.room);
  await page.click('#office-mine');
  await until(r => window.__game.store.get().doctor?.state?.office === r, gastro.room);
  const moved = await staffRoom(gastro.id);
  await page.waitForTimeout(300);
  const fig = await page.evaluate(r => {
    const g = window.__game;
    const w = g.crowd.walkers.get('you');
    const room = g.plan.rooms.find(x => x.id === r);
    return !!w && w.goals.concat(w.at ? [w.at] : []).some(s => s.x > room.x && s.x < room.x + room.w && s.z > room.y && s.z < room.y + room.h);
  }, gastro.room);
  if (moved === office0 && fig) ok(`«Мой кабинет» на ${gastro.room}: гастроэнтеролог — в ${moved}, фигура врача идёт туда`);
  else fail(`«Мой кабинет»: врач в ${moved}, фигура ${fig}`);
  await select(office0);
  await page.click('#office-mine');
  await until(r => window.__game.store.get().doctor?.state?.office === r, office0);
  if ((await staffRoom(gastro.id)) === gastro.room) ok(`обратно: ваш — ${office0}, гастроэнтеролог — в ${gastro.room}`);
  else fail(`обратно: гастроэнтеролог в ${await staffRoom(gastro.id)}`);
  await page.click('#office-off');
  await until(() => !window.__game.store.get().doctor?.state?.office);
  const gone = await page.evaluate(() => !window.__game.crowd.walkers.get('you'));
  await page.click('#office-mine');
  await until(r => window.__game.store.get().doctor?.state?.office === r, office0);
  if (gone && (await officeOf()) === office0) ok('«Не принимаю» — фигуры нет; «Мой кабинет» — снова ваш');
  else fail(`«Не принимаю»: фигура ушла ${gone}, кабинет ${await officeOf()}`);
  await page.click('#card .close').catch(() => {});

  // «Свои больные»: плитка — группа в состоянии смены; снять
  await page.click('#mine-edit');
  await page.click('#mine-heart');
  await until(() => window.__game.store.get().doctor?.state?.mine.includes('heart'));
  const list = await page.textContent('#mine-list');
  await page.click('#mine-heart');
  await until(() => window.__game.store.get().doctor?.state?.mine.length === 0);
  ok(`«Свои больные»: «${list}» — и снято`);
}
