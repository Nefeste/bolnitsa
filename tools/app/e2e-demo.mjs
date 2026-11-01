// Сценарий в браузере, часть 32 — демо (spec docs/specs/2026-11-demo.md, «Сквозной путь игрока»): путь от экрана начала до
// окна «Итог» целиком, одной страницей, как игрок. Экран начала с ключом `demo` — только «Кампания»; «Сценарий 1» → «Начать»
// — полоса загрузки растёт по настоящей работе и доходит до конца; письма наставницы; регистратура, ожидание и свой кабинет
// готовыми помещениями — щелчком мыши по участку; пустили часы — первый больной у дверей; «Позвать» — его карта: вопрос,
// осмотр, «Решение», «Завершить приём» — разбор; «До утра» — планёрка в 08:00; закрыли — окно «Итог»: построенное, больные,
// ваши приёмы, касса, время, снимок больницы 1920×1080; «Сохранить снимок» — PNG загрузкой; «Играть дальше». Замеры ощущения
// (О1–О4, О6) — строками и в tools/app/out/e2e-demo.json. Снимки — `e2e-demo-*.jpg`.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { headOk, windowHead } from './e2e-lib.mjs';

/** @param {{ page: import('playwright-core').Page, port: number, out: string, ok: (m: string) => void, fail: (m: string) => void, q: string, shots: string }} x */
export async function demoPart({ page, port, out, ok, fail, q, shots }) {
  const until = (fn, a, ms = 30000) => page.waitForFunction(fn, a, { timeout: ms });
  const frames = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const flat = s => (s ?? '').replace(/[\s  ]+/g, ' ').trim();
  const dom = id => id.replace(/\./g, '_');
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
  /** Путь игрока по часам: шаг → секунды с начала части. */
  const t0 = Date.now();
  const path = {};
  const mark = k => (path[k] = Math.round((Date.now() - t0) / 100) / 10);
  const feel = {};
  /**
   * О1 — отклик на щелчок: от нажатия кнопки мыши до первого изменения окна (DOM), по времени страницы. Ставится заново после
   * каждой загрузки страницы.
   */
  const listen = () =>
    page.evaluate(() => {
      window.__clicks = [];
      let down = null;
      document.addEventListener('pointerdown', () => (down = performance.now()), true);
      new MutationObserver(() => {
        if (down === null) return;
        window.__clicks.push(performance.now() - down);
        down = null;
      }).observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
    });
  const clicks = async () => (await page.evaluate(() => window.__clicks ?? [])).map(v => Math.round(v));

  // ---------------------------------------------------------------- экран начала: только «Кампания»
  // без живой сцены: её проверяет часть 7; здесь — путь игрока и замеры
  await page.goto(`http://127.0.0.1:${port}/index.html?q=${q}&lang=ru&seed=5&backdrop=0&demo=1`);
  await page.waitForSelector('#start-scenario-ambulatory', { timeout: 60000 });
  mark('экран начала');
  const sandbox = await page.$('#start-empty, #start-preset, #start-poly');
  if (!sandbox) ok(`экран начала демо: «Кампания», песочницы нет (снимок ${await shot('e2e-demo-1-start.jpg')} КБ)`);
  else fail('экран начала демо: есть карточки песочницы');
  await listen();
  await page.click('#start-scenario-ambulatory');
  await page.waitForSelector('#start-go', { timeout: 10000 });

  // ---------------------------------------------------------------- «Начать» — полоса загрузки
  const go = Date.now();
  await Promise.all([page.waitForURL(/scenario=/, { timeout: 30000 }), page.click('#start-go')]);
  /** Полоса: сделано, всего, подпись — раз в 150 мс, пока игра не готова. */
  const samples = [];
  for (let i = 0; i < 2000; i++) {
    const s = await page
      .evaluate(() => {
        const b = document.getElementById('loadbar');
        return { ready: window.__ready === true, done: Number(b?.getAttribute('aria-valuenow') ?? -1), total: Number(b?.getAttribute('aria-valuemax') ?? -1), text: document.getElementById('status')?.textContent ?? '', at: performance.now() };
      })
      .catch(() => null);
    if (s?.ready) break;
    if (s && s.done >= 0) samples.push(s);
    await page.waitForTimeout(150);
  }
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
  feel.O6 = Math.round((Date.now() - go) / 100) / 10;
  mark('сценарий загружен');
  // полоса растёт и не стоит дольше 2 с (по времени страницы: между ростами)
  let stall = 0;
  let grew = 0;
  for (let i = 1; i < samples.length; i++) {
    if (samples[i].done > samples[i - 1].done) grew++;
    else if (samples[i].done === samples[i - 1].done) stall = Math.max(stall, samples[i].at - samples.findLast((x, k) => k < i && x.done < samples[i].done)?.at || 0);
  }
  const last = samples.at(-1);
  const texts = [...new Set(samples.map(s => flat(s.text)))];
  feel.O6stall = Math.round(stall / 100) / 10;
  // последние шаги — мир и смена — идут перед самой готовностью: замер раз в 150 мс видит полосу на трёх четвертях и дальше
  if (samples.length >= 3 && grew >= 2 && last && last.done / last.total >= 0.75 && texts.some(t => t.startsWith('Люди:'))) {
    ok(`О6 загрузка: ${feel.O6} с от «Начать»; полоса — ${samples.length} замеров, росла ${grew} раз, последняя ${last.done} из ${last.total}, дольше всего стояла ${feel.O6stall} с; подписи: ${texts.slice(0, 4).join(' · ')} …`);
  } else fail(`полоса загрузки: ${JSON.stringify({ n: samples.length, grew, last, texts: texts.slice(0, 6) })}`);
  await listen();

  // ---------------------------------------------------------------- письма наставницы
  for (const id of ['hello', 'budget']) {
    const got = await until(x => document.getElementById('letter')?.dataset.letter === x, id, 30000).then(() => true, () => false);
    if (got) {
      await page.click('#letter-ok');
      await until(x => document.getElementById('letter')?.dataset.letter !== x, id, 5000).catch(() => {});
    } else fail(`письмо «${id}» не пришло`);
  }
  mark('письма прочитаны');
  ok(`письма наставницы «hello» и «budget» — «Понятно» (снимок ${await shot('e2e-demo-2-letters.jpg')} КБ)`);

  // ---------------------------------------------------------------- стройка: три готовых помещения щелчком
  const at = (x, y) => page.evaluate(([cx, cy]) => window.__game.stage.screenOfCell(cx, cy), [x, y]);
  const settled = () => until(() => (document.getElementById('ghost')?.textContent ?? '') === (window.__game.builder.ghost?.text ?? ''));
  await page.evaluate(() => {
    const g = window.__game;
    g.stage.cam.target.set(19, 0, 10);
    g.stage.cam.half = 11;
  });
  await frames();
  await page.keyboard.press('KeyB');
  await page.click('#tool-ready');
  const O2 = [];
  for (const [type, size, x, y] of [
    ['reception', '', 9, 9],
    ['waiting', 'M', 16, 9],
    ['office', '', 28, 9],
  ]) {
    await page.click(`#ready-${type}`);
    if (size) await page.click(`#size-${size}`);
    const p = await at(x, y);
    await page.mouse.move(p.x, p.y);
    await until(([cx, cy]) => {
      const h = window.__game.builder.hover;
      return !!h && h[0] === cx && h[1] === cy;
    }, [x, y]);
    await settled();
    const n = await page.evaluate(() => window.__game.hospital.site.rooms.length);
    const c = Date.now();
    await page.mouse.click(p.x, p.y);
    await until(k => window.__game.hospital.site.rooms.length === k + 1, n, 30000);
    O2.push(Date.now() - c);
  }
  // из стройки — «Готово», как игрок; карточка последнего помещения — Esc
  await page.keyboard.press('Escape');
  await page.click('#done');
  await page.keyboard.press('Escape');
  await until(() => !document.getElementById('done'), null, 10000).catch(() => fail('стройка не закрылась'));
  feel.O2 = O2;
  mark('построено');
  const built = await page.evaluate(() => window.__game.hospital.site.rooms.map(r => r.type));
  if (JSON.stringify(built) === JSON.stringify(['room.reception', 'room.waiting', 'room.office'])) ok(`О2 стройка: регистратура, ожидание M, свой кабинет — щелчком; до помещения на карте ${O2.join(', ')} мс (снимок ${await shot('e2e-demo-3-built.jpg')} КБ)`);
  else fail(`построено: ${JSON.stringify(built)}`);
  await until(() => !document.getElementById('closed'), null, 30000).catch(() => fail('больница не открылась'));

  // ---------------------------------------------------------------- открытие: первый больной у дверей (×1)
  // письмо «пустите часы» — «Понятно»; часы — пробелом, как игрок
  if (await until(() => !!document.getElementById('letter-ok'), null, 10000).then(() => true, () => false)) await page.click('#letter-ok');
  await page.keyboard.press('Space');
  await until(() => window.__game.speed === 1, null, 10000).catch(() => fail('пробел не пустил часы'));
  const open = Date.now();
  const tOpen = await page.evaluate(() => window.__game.t);
  await until(() => [...window.__game.crowd.walkers.keys()].some(k => k.startsWith('p:')), null, 300000);
  feel.O3 = Math.round((Date.now() - open) / 100) / 10;
  // без видеокарты кадр редкий, а шаг часов за кадр ограничен: на ×1 часы идут медленнее настоящих — считаем и по часам игры
  feel.O3game = Math.round((await page.evaluate(() => window.__game.t)) - tOpen);
  mark('первый больной');
  ok(`О3 первый больной: ${feel.O3} с здесь после пуска часов, ${Math.round(feel.O3game / 60)} мин игры — на ×1 это ${Math.round(feel.O3game / 20)} с (снимок ${await shot('e2e-demo-4-first.jpg')} КБ)`);

  // ---------------------------------------------------------------- свой случай: «Позвать» → карта → разбор
  const callable = () => {
    const b = [...document.querySelectorAll('#dock .dlists li button')].find(x => x.textContent === 'Позвать' && !x.disabled);
    return b ? (b.closest('li')?.id ?? null) : null;
  };
  // ждут вас — на ×3, как ждал бы игрок, не ×1: замер О3 уже есть
  await page.evaluate(() => window.__game.actions.setSpeed(3));
  const row = await until(callable, null, 300000).then(h => h.jsonValue());
  mark('ждёт вас');
  const who = row.replace(/^dr-/, '');
  const call = Date.now();
  await page.locator(`#dr-${who} button`, { hasText: 'Позвать' }).click();
  await page.waitForSelector('#dcard #dcard-steps', { timeout: 180000 });
  feel.O4call = Math.round((Date.now() - call) / 100) / 10;
  const card = () => page.evaluate(() => window.__game.store.get().doctor?.card ?? null);
  const fresher = v => until(prev => (window.__game.store.get().doctor?.card?.version ?? 0) > prev, v);
  // подсказки наставницы — «Понятно», если стоят над шагами
  const tips = async () => {
    for (let i = 0; i < 4 && (await page.$('#tip-ok')); i++) {
      await page.click('#tip-ok');
      await page.waitForTimeout(150);
    }
  };
  const caseStart = Date.now();
  await tips();
  const q1 = await page.$('#stepbody-talk button.q:not([disabled])');
  if (q1) {
    const v = (await card()).version;
    await q1.click();
    await fresher(v);
  }
  await tips();
  await page.click('#step-examine');
  const ex = await page.$('#stepbody-examine #ex-whole button.xrow:not([disabled]), #stepbody-examine #ex-bedside button.xrow:not([disabled])');
  if (ex) {
    const v = (await card()).version;
    await ex.click();
    await fresher(v);
  }
  await tips();
  await page.click('#step-decide');
  const c1 = await card();
  const dx = c1.hints[0]?.id ?? c1.diagnoses[0].items[0].id;
  let v = c1.version;
  if (c1.hints[0]) {
    await page.click(`#likely-${dom(dx)}`);
    await fresher(v);
  }
  v = (await card()).version;
  await page.click(`#dx-${dom(dx)}`);
  await fresher(v);
  const tx = (await card()).suggested.find(x => !x.disabled);
  if (tx) {
    v = (await card()).version;
    await page.click(`#tx-${dom(tx.id)}`);
    await fresher(v);
  }
  await tips();
  v = (await card()).version;
  await page.click('#dcard-finish');
  await fresher(v);
  const done = await card();
  feel.O4case = Math.round((Date.now() - caseStart) / 100) / 10;
  mark('свой случай');
  if (done?.decision) ok(`О4 свой случай: от «Позвать» до карты ${feel.O4call} с; вопрос, осмотр, «Решение», «Завершить приём» — разбор за ${feel.O4case} с машины (снимок ${await shot('e2e-demo-5-review.jpg')} КБ)`);
  else fail(`свой случай: ${JSON.stringify({ decision: !!done?.decision })}`);
  await page.keyboard.press('Escape');
  await until(() => !document.getElementById('dcard'), null, 10000).catch(() => {});

  // ---------------------------------------------------------------- «До утра» — планёрка
  await page.click('#speed-ff');
  await page.waitForSelector('#meeting', { timeout: 600000 });
  mark('планёрка');
  ok(`«До утра» — планёрка в 08:00 (снимок ${await shot('e2e-demo-6-meeting.jpg')} КБ)`);
  // «почему?» ушедших: нанятых врачей в сценарии нет — совет не «отдайте нанятым», а ещё кабинет с врачом (проход по снимкам 2)
  await page.click('#meet-why-left');
  const whyYou = ((await page.textContent('#meet-left-you').catch(() => '')) ?? '').replace(/\s+/g, ' ').trim();
  if (/кабинет врача с терапевтом/.test(whyYou) && !/нанятым/.test(whyYou)) ok(`«почему?» ушедших без нанятых врачей: «${whyYou}»`);
  else fail(`«почему?» ушедших: «${whyYou}»`);
  await page.click('#meeting-close');

  // ---------------------------------------------------------------- «Итог»
  await page.waitForSelector('#demo-summary', { timeout: 60000 });
  mark('итог');
  // снимок — картинка адресом `data:`: декодируется не сразу
  await until(() => (document.getElementById('demo-shot')?.naturalWidth ?? 0) > 0, null, 30000).catch(() => {});
  const sum = await page.evaluate(() => {
    const img = document.getElementById('demo-shot');
    const text = id => (document.getElementById(id)?.textContent ?? '').replace(/\s+/g, ' ').trim();
    return {
      built: text('demo-built'), patients: text('demo-patients'), hire: text('demo-hire'), own: text('demo-own'), cash: text('demo-cash'), played: text('demo-played'),
      shot: img ? { w: img.naturalWidth, h: img.naturalHeight } : null, wishlist: !!document.getElementById('demo-wishlist'), speed: window.__game.speed,
    };
  });
  if (/Регистратура/.test(sum.built) && /Кабинет врача/.test(sum.built) && /пришли \d+/.test(sum.patients) && /кабинет врача с терапевтом/.test(sum.hire) && /^1 приём, из них верно — [01]$/.test(sum.own) && sum.cash && /\d+ минут/.test(sum.played) && sum.shot?.w === 1920 && sum.shot?.h === 1080 && !sum.wishlist && sum.speed === 0) {
    ok(`«Итог»: построено — «${sum.built}»; «${sum.patients}»; «${sum.hire}»; «${sum.own}»; касса ${sum.cash}; играете ${sum.played}; снимок ${sum.shot.w}×${sum.shot.h}; кнопки Steam нет; часы стоят (снимок ${await shot('e2e-demo-7-summary.jpg')} КБ)`);
  } else fail(`«Итог»: ${JSON.stringify(sum)}`);
  // строка заголовка (docs/specs/2026-10-clinical-style.md, часть 2): закрывается выбором — «Играть дальше» или «В меню»
  const head = await windowHead(page, '#demo-summary');
  if (headOk(head, 'result', 'demo-title', false) && head.title === 'Итог') ok(`«Итог»: строка заголовка — значок «${head.icon}», «${head.title}», крестика нет — выбор кнопками`);
  else fail(`строка заголовка «Итога»: ${JSON.stringify(head)}`);

  // «Сохранить снимок» — в браузере загрузкой: PNG 1920×1080
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('#demo-save')]);
  const file = join(out, 'e2e-demo-snapshot.png');
  await dl.saveAs(file);
  const png = readFileSync(file);
  const isPng = png.subarray(1, 4).toString() === 'PNG' && png.readUInt32BE(16) === 1920 && png.readUInt32BE(20) === 1080;
  const saved = await page.textContent('#demo-saved').catch(() => '');
  if (isPng && /загрузки/.test(saved ?? '') && /^snapshot-[0-9T-]+\.png$/.test(dl.suggestedFilename())) ok(`«Сохранить снимок»: ${dl.suggestedFilename()} — PNG 1920×1080, ${Math.round(png.length / 1024)} КБ; «${saved}»`);
  else fail(`снимок: ${JSON.stringify({ isPng, saved, name: dl.suggestedFilename(), bytes: png.length })}`);

  // «Играть дальше» — окно закрыто, часы идут
  await page.click('#demo-go');
  await until(() => !document.getElementById('demo-summary') && window.__game.speed === 1, null, 10000).then(
    () => ok('«Играть дальше»: «Итог» закрыт, часы идут ×1'),
    () => fail('«Играть дальше»: окно не закрылось или часы стоят'),
  );

  // ---------------------------------------------------------------- О1 и итог пути
  const c = await clicks();
  const sorted = [...c].sort((a, b) => a - b);
  feel.O1 = { n: c.length, median: sorted[Math.floor(sorted.length / 2)] ?? null, max: sorted.at(-1) ?? null };
  if (c.length >= 8) ok(`О1 отклик на щелчок: ${c.length} щелчков, медиана ${feel.O1.median} мс, самый долгий ${feel.O1.max} мс`);
  else fail(`О1: щелчков записано ${c.length}`);
  writeFileSync(join(out, 'e2e-demo.json'), `${JSON.stringify({ path, feel }, null, 1)}\n`);
  ok(`путь демо по часам части, с: ${Object.entries(path).map(([k, s]) => `${k} ${s}`).join(' · ')}`);
}
