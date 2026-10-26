// Сценарий в браузере, часть 7 — поликлиника по нормам проектирования (spec docs/specs/2026-10-real-hospital.md,
// «Проверки»). Без ключа в адресе — экран начала: «Кампания» (spec docs/specs/2026-10-scenario-1.md) и три карточки песочницы;
// за ним — живая сцена (spec docs/specs/2026-10-aaa-polish.md, «Экран начала на живой сцене»): городская больница к 10:00,
// часы идут, камера едет по кругу, игрой сцена не считается, панель — стекло; выбор открывает страницу с его ключами.
// «Поликлиника» — тринадцать готовых помещений, люди на местах, ваш кабинет — первый, больница открыта. Часы идут — пациенты
// приходят, их принимают. Снимки — `e2e-poly-0-start.jpg` (экран начала на живой сцене) и `e2e-poly-1.jpg`.
import { join } from 'node:path';

/** @param {{ page: import('playwright-core').Page, port: number, out: string, ok: (m: string) => void, fail: (m: string) => void, q: string, shots: string }} x */
export async function polyPart({ page, port, out, ok, fail, q, shots }) {
  const until = (fn, a, ms = 30000) => page.waitForFunction(fn, a, { timeout: ms });
  const frames = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
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

  await page.goto(`http://127.0.0.1:${port}/index.html?q=${q}&lang=ru`);
  await page.waitForSelector('#start', { timeout: 60000 });
  // карточки новой игры; «Продолжить» и список сохранений (spec 2026-10-saves) — от прошлых частей сценария, не в счёт;
  // «Энциклопедия» (spec 2026-10-encyclopedia) — не больница
  const cards = (await page.$$eval('#start button', els => els.map(e => [e.id, e.querySelector('b')?.textContent ?? '']))).filter(([id]) => !id.startsWith('start-continue') && !id.startsWith('start-save') && id !== 'start-enc');
  // первой — «Кампания»: сценарий 1 (spec docs/specs/2026-10-scenario-1.md), под ней — песочница
  const want = [['start-scenario-ambulatory', 'Сценарий 1. Амбулатория'], ['start-empty', 'Пустое здание'], ['start-poly', 'Поликлиника'], ['start-preset', 'Городская больница']];
  if (JSON.stringify(cards) === JSON.stringify(want)) ok(`экран начала — «Кампания» и три карточки песочницы: ${cards.map(c => `«${c[1]}»`).join(', ')}`);
  else fail(`карточки начала: ${JSON.stringify(cards)}`);
  // живая сцена за экраном начала: проявилась к приёму, часы идут, камера едет по кругу; игрой она не считается
  await page.waitForSelector('#view.shown', { timeout: 120000 });
  const scene = () =>
    page.evaluate(() => {
      const g = window.__backdrop;
      return { t: g.t, x: g.stage.cam.target.x, z: g.stage.cam.target.z, half: g.stage.cam.half, people: g.crowd.walkers.size, start: g.start, role: g.doctor.hud.role, game: !!window.__game, ready: window.__ready === true };
    });
  const s1 = await scene();
  // часы и камера пошли (без видеокарты первый показ размытия над сценой — секунды)
  const w0 = Date.now();
  const going = ([t, x, z]) => {
    const g = window.__backdrop;
    return g.t > t && Math.hypot(g.stage.cam.target.x - x, g.stage.cam.target.z - z) > 0.05;
  };
  await until(going, [s1.t, s1.x, s1.z], 60000).catch(() => {});
  const s2 = await scene();
  const secs = ((Date.now() - w0) / 1000).toFixed(1);
  const moved = Math.hypot(s2.x - s1.x, s2.z - s1.z);
  const hour = (s1.t % 86400) / 3600;
  if (s1.start === 'preset' && s1.role === 'manager' && hour >= 10 && s1.people > 20 && s2.t > s1.t && moved > 0.05 && s2.half === 13 && !s2.game && !s2.ready) {
    ok(`за экраном начала — живая сцена: городская больница, ${hour.toFixed(1)} ч, людей ${s1.people}; за ${secs} с часы прошли ${Math.round(s2.t - s1.t)} с, камера — ${moved.toFixed(2)} м; игрой не считается`);
  } else fail(`живая сцена: ${JSON.stringify({ s1, s2, moved, secs })}`);
  const glass = await page.evaluate(() => getComputedStyle(document.getElementById('start')).backdropFilter);
  if (glass.includes('blur')) ok(`панель — стекло над сценой: ${glass}`);
  else fail(`панель экрана начала: ${glass}`);
  await page.waitForFunction(() => getComputedStyle(document.getElementById('view'), '::after').opacity === '0', null, { timeout: 15000 });
  // снимок как есть: качество сцены — её, `--shots` переключает только игру
  const start = await page.screenshot({ path: join(out, 'e2e-poly-0-start.jpg'), type: 'jpeg', quality: 72 });
  ok(`снимок: ${join(out, 'e2e-poly-0-start.jpg')} (${Math.round(start.length / 1024)} КБ)`);
  // второй шаг — «Кто вы» (spec docs/specs/2026-10-two-ways.md, F4): три карточки ролей; «Назад» — к выбору больницы
  await page.click('#start-preset');
  await page.waitForSelector('#start-roles', { timeout: 10000 });
  const roles = await page.$$eval('#start-roles button[id^="start-role-"]', els => els.map(e => [e.id, e.querySelector('b')?.textContent ?? '', !!e.querySelector('span')?.textContent]));
  const wantRoles = [['start-role-doctor', 'Врач', true], ['start-role-chief', 'Главврач', true], ['start-role-manager', 'Управляющий', true]];
  if (JSON.stringify(roles) === JSON.stringify(wantRoles)) ok(`второй шаг — «Кто вы»: ${roles.map(r => `«${r[1]}»`).join(', ')}, у каждой — строка`);
  else fail(`карточки ролей: ${JSON.stringify(roles)}`);
  await page.click('#start-back');
  await page.waitForSelector('#start-poly', { timeout: 10000 });
  ok('«Назад» — снова выбор больницы');
  await page.click('#start-poly');
  await page.click('#start-role-doctor');
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  // выбор открыл страницу заново — с его ключами; живой сцены в игре нет
  const opened = await page.evaluate(() => ({ url: location.search, backdrop: !!window.__backdrop, view: document.getElementById('view').className }));
  if (opened.url.includes('hospital=poly') && opened.url.includes('role=doctor') && opened.url.includes(`q=${q}`) && !opened.backdrop && !opened.view.includes('backdrop')) {
    ok(`выбор — та же страница с ключами «${opened.url}», без живой сцены`);
  } else fail(`после выбора: ${JSON.stringify(opened)}`);
  const h = await page.evaluate(() => {
    const g = window.__game;
    const site = g.hospital.site;
    const offices = site.rooms.filter(r => r.type === 'room.office').map(r => r.id);
    return {
      rooms: site.rooms.length, working: g.working.size, mine: site.mine, first: offices[0], offices: offices.length,
      therapists: g.staff.filter(m => m.role === 'role.therapist').length, staff: g.staff.length, closed: !!document.getElementById('closed'),
    };
  });
  if (h.rooms === 13 && h.working === 13 && h.mine === h.first && h.offices === 4 && h.therapists === 3 && h.staff === 8 && !h.closed) {
    ok(`поликлиника: ${h.rooms} помещений, работают все, ваш кабинет — первый, терапевтов ${h.therapists}, людей ${h.staff}, открыта`);
  } else fail(`поликлиника: ${JSON.stringify(h)}`);

  // часы ×12 — пациентов принимают; снимок здания: окно врача свёрнуто, подсказка закрыта
  await page.keyboard.press('Digit3');
  await until(() => window.__game.store.get().seen > 8, null, 180000);
  await page.click('#dock .close').catch(() => {});
  await page.click('#hint-close').catch(() => {});
  await page.evaluate(() => {
    const g = window.__game;
    g.stage.cam.target.set(24, 0, 18);
    g.stage.cam.half = 19;
  });
  await frames();
  const c = await page.evaluate(() => {
    const s = window.__game.store.get();
    return { arrived: s.arrived, seen: s.seen, clock: document.getElementById('clock')?.textContent };
  });
  const kb = await shot('e2e-poly-1.jpg');
  if (c.seen > 0) ok(`пациенты пришли и приняты: ${JSON.stringify(c)} (снимок ${kb} КБ)`);
  else fail(`приём: ${JSON.stringify(c)}`);
}
