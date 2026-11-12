// Сценарий в браузере, часть 44 — маршруты для срочного (spec docs/specs/2026-11-scenario-4.md, часть 2а; решение владельца
// #219, вариант 1). Готовая городская больница, «Управляющий», поток 6 в час и скорая раз в час, зерно 1: привезённый с
// инфарктом вечером, ЭКГ по маршруту — с подъёмом ST. Карточка смотровой приёмного: «Маршруты для срочного» — две галочки, обе
// сняты; поставить обе — в состоянии врача оба маршрута. На ×12 — до просьбы медсестры: в «Ждут вас» первым, срок тромболизиса
// — 10 минут от ЭКГ, срочная строка «Медсестра смотровой: … подъём сегмента ST на ЭКГ; тромболизис при подъёме ST — до …».
// «До утра» — на планёрке «Сроки: …» и «по маршрутам: ЭКГ — …; расходники — …».
// Снимки — `e2e-routes-1-card.jpg`, `e2e-routes-2-meeting.jpg`.
import { join } from 'node:path';

/** @param {{ page: import('playwright-core').Page, port: number, out: string, ok: (m: string) => void, fail: (m: string) => void, q: string, shots: string }} x */
export async function routesPart({ page, port, out, ok, fail, q, shots }) {
  const until = (fn, a, ms = 30000, polling = undefined) => page.waitForFunction(fn, a, { timeout: ms, ...(polling ? { polling } : {}) });
  const shot = async name => {
    if (shots) {
      await page.evaluate(x => window.__game.showQuality(x), shots);
      await page.waitForTimeout(400);
    }
    const buf = await page.screenshot({ path: join(out, name), type: 'jpeg', quality: 72 });
    if (shots) await page.evaluate(x => window.__game.showQuality(x), q);
    return Math.round(buf.length / 1024);
  };
  const flat = s => (s ?? '').replace(/\s+/g, ' ').trim();
  /** «До утра» — до планёрки: своя карта или другое окно кассы мешают — закрыть, автопауза — дальше. */
  const toMeeting = async () => {
    const t0 = Date.now();
    await page.click('#speed-ff');
    for (;;) {
      const h = await page.evaluate(() => ({ meeting: !!document.getElementById('meeting'), open: window.__game.store.get().economy?.open ?? false, ff: window.__game.ff, speed: window.__game.speed, card: window.__game.doctor.open }));
      if (h.meeting || Date.now() - t0 > 300000) break;
      if (h.card || h.open) await page.keyboard.press('Escape');
      else if (!h.ff && h.speed === 0) await page.click('#speed-ff');
      await page.waitForTimeout(200);
    }
    return !!(await page.$('#meeting'));
  };

  // «Управляющий»: своих больных нет — своя карта не держит часы; автопауза выключена
  await page.goto(`http://127.0.0.1:${port}/index.html?q=${q}&lang=ru&hospital=preset&seed=1&flow=6,1&role=manager`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  await page.evaluate(() => window.__game.setSpeed(0));

  // ---------------------------------------------------------------- карточка смотровой: «Маршруты для срочного»
  const er = await page.evaluate(() => window.__game.hospital.site.rooms.find(r => r.type === 'room.emergency')?.id ?? null);
  if (!er) {
    fail('в городской больнице нет смотровой приёмного');
    return;
  }
  await page.evaluate(id => window.__game.selectRoomId(id), er);
  await page.waitForSelector('#card-routes', { timeout: 10000 }).catch(() => {});
  const boxes = () => page.$$eval('#card-routes input[type=checkbox]', xs => xs.map(x => ({ id: x.dataset.route, on: x.checked })));
  const before = await boxes();
  const text = flat(await page.textContent('#card-routes').catch(() => ''));
  if (before.length === 2 && before.every(b => !b.on) && text.includes('Боль в груди — ЭКГ у постели сразу') && text.includes('Признаки инсульта — КТ сразу')) ok(`карточка смотровой: «Маршруты для срочного» — «${text}», обе галочки сняты`);
  else fail(`карточка смотровой, маршруты: ${JSON.stringify(before)} «${text}»`);
  for (const b of before) {
    await page.click(`#card-routes input[data-route="${b.id}"]`);
    await until(id => (window.__game.doctor.hud.state?.routes ?? []).includes(id), b.id, 10000).catch(() => {});
  }
  const after = await boxes();
  const routes = await page.evaluate(() => window.__game.doctor.hud.state?.routes ?? []);
  if (after.length === 2 && after.every(b => b.on) && routes.length === 2) ok(`обе галочки поставлены — маршруты включены: ${routes.join(', ')} (снимок ${await shot('e2e-routes-1-card.jpg')} КБ)`);
  else {
    fail(`маршруты не включились: ${JSON.stringify(after)} ${JSON.stringify(routes)}`);
    return;
  }
  await page.keyboard.press('Escape');

  // ---------------------------------------------------------------- «До утра» до просьбы медсестры: ЭКГ по маршруту с подъёмом ST
  // ×12 в браузере без видеокарты идёт медленнее записанного — «До утра», пока не придёт срочная строка (он встаёт на красном
  // пришедшем — дальше); пришла — часы стоп
  {
    const t0 = Date.now();
    for (;;) {
      // журнал окна — сразу, а не со следующей отрисовкой панелей: «До утра» встал на просьбе — не пускать его дальше
      const h = await page.evaluate(() => ({ got: window.__game.notices.some(n => n.text.startsWith('Медсестра смотровой:')), ff: window.__game.ff, t: window.__game.t, open: window.__game.store.get().economy?.open ?? false }));
      if (h.got || h.t > 32 * 3600 || Date.now() - t0 > 300000) break;
      if (h.open) await page.keyboard.press('Escape');
      else if (!h.ff) await page.evaluate(() => window.__game.actions.untilMorning());
      await page.waitForTimeout(100);
    }
    await page.evaluate(() => window.__game.setSpeed(0));
  }
  const alert = await page.evaluate(() => (window.__game.doctor.hud.state?.yours ?? []).find(r => r.why === 'alert') ?? null);
  const toast = await page.evaluate(() => window.__game.notices.find(n => n.text.startsWith('Медсестра смотровой:')) ?? null);
  const hhmm = t => new Date(t * 1000).toISOString().slice(11, 16);
  const now = hhmm(await page.evaluate(() => window.__game.t));
  if (toast && toast.tone === 'urgent' && toast.text.includes('подъём сегмента ST на ЭКГ') && /тромболизис при подъёме ST — до \d\d:\d\d/.test(toast.text) && toast.who) ok(`срочная строка (к ${now}): «${toast.text}»`);
  else fail(`срочной строки нет к ${now}: ${JSON.stringify(toast)}`);
  // строка «Ждут вас» — пока его не позвали: «До утра» мог проскочить её — тогда хватит строки журнала
  if (!alert) ok('к остановке его уже позвали — просьба снята');
  else if (alert.alert.until - alert.alert.at === 600 && (await page.evaluate(() => window.__game.doctor.hud.state.yours[0].why)) === 'alert') ok(`«Ждут вас» — первым: ${alert.who}, ЭКГ в ${hhmm(alert.alert.at)} — «${alert.alert.finding}», «${alert.alert.target}» до ${hhmm(alert.alert.until)}`);
  else fail(`«Ждут вас»: ${JSON.stringify(alert)}`);

  // ---------------------------------------------------------------- «До утра»: строка сроков и маршрутов на планёрке
  if (await toMeeting()) ok('«До утра» — планёрка вторых суток');
  else {
    fail('«До утра»: планёрки нет');
    return;
  }
  const line = flat(await page.textContent('#meet-deadlines').catch(() => ''));
  const routed = flat(await page.textContent('#meet-routes').catch(() => ''));
  if (line.startsWith('Сроки:') && line.includes('ЭКГ при боли в груди — ') && !/; [А-ЯЁ][а-яё]/.test(line) && /по маршрутам: ЭКГ — [1-9]/.test(routed) && routed.includes('расходники —')) ok(`планёрка: «${line}» (снимок ${await shot('e2e-routes-2-meeting.jpg')} КБ)`);
  else fail(`планёрка, сроки и маршруты: «${line}»`);
  await page.click('#meeting-close');
}
