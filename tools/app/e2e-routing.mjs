// Сценарий в браузере, часть 37 — направление по жалобе и амбулаторный хирург (spec docs/specs/2026-10-departments.md, «Часть 4:
// направление по жалобе и хирург на приёме — как будет»). Готовая городская больница: в кабинете эндокринолога — увольнение и
// выбор на месте врача, «Амбулаторный хирург» среди должностей, найм. Дальше часы: пришедшего сам, кого регистратор направил в
// хирургию, зовёт амбулаторный хирург; в пути больного — «регистратор направил: хирургия». «До утра» — на планёрке строка
// «регистратор направил N, не туда — K». Снимок — `e2e-routing-path.jpg`.
import { join } from 'node:path';

/** @param {{ page: import('playwright-core').Page, port: number, out: string, ok: (m: string) => void, fail: (m: string) => void, q: string, shots: string }} x */
export async function routingPart({ page, port, out, ok, fail, q, shots }) {
  const until = (fn, a, ms = 30000) => page.waitForFunction(fn, a, { timeout: ms });
  const flat = s => (s ?? '').replace(/[\s  ]+/g, ' ').trim();
  const shot = async name => {
    if (shots) {
      await page.evaluate(x => window.__game.showQuality(x), shots);
      await page.waitForTimeout(400);
    }
    const buf = await page.screenshot({ path: join(out, name), type: 'jpeg', quality: 72 });
    if (shots) await page.evaluate(x => window.__game.showQuality(x), q);
    return Math.round(buf.length / 1024);
  };

  await page.goto(`http://127.0.0.1:${port}/index.html?q=${q}&lang=ru&hospital=preset&seed=3&flow=10,1`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  await page.evaluate(() => window.__game.actions.doctor({ kind: 'autopause', on: false }));

  // ---------------------------------------------------------------- кабинет эндокринолога: на место врача — амбулаторный хирург
  const endo = await page.evaluate(() => window.__game.staff.find(m => m.role === 'role.endocrinologist' && m.shift === 'day'));
  if (!endo) {
    fail('в городской больнице нет эндокринолога в дневной смене');
    return;
  }
  await page.evaluate(id => window.__game.selectRoomId(id), endo.room);
  await page.waitForSelector('#dismiss-doctor', { timeout: 10000 });
  await page.click('#dismiss-doctor');
  await page.waitForSelector('#hire-doctor-as', { timeout: 10000 });
  const options = await page.$$eval('#hire-doctor-as option', els => els.map(e => `${e.value}: ${(e.textContent ?? '').trim()}`));
  const pick = options.find(x => x.startsWith('role.surgeon_clinic'));
  if (pick) ok(`место врача — на выбор, среди должностей «${pick.split(': ')[1]}»`);
  else fail(`на месте врача нет амбулаторного хирурга: ${JSON.stringify(options)}`);
  await page.selectOption('#hire-doctor-as', 'role.surgeon_clinic');
  await page.click('#hire-doctor');
  await until(room => window.__game.staff.some(m => m.role === 'role.surgeon_clinic' && m.room === room), endo.room, 10000).then(
    () => ok('амбулаторный хирург нанят в кабинет эндокринолога'),
    () => fail('амбулаторный хирург не нанят'),
  );
  await page.keyboard.press('Escape');

  // ---------------------------------------------------------------- направленный в хирургию: его зовёт хирург, в пути — строка
  await page.evaluate(() => window.__game.actions.setSpeed(12));
  const t0 = Date.now();
  let routed = null;
  while (!routed && Date.now() - t0 < 240000) {
    const st = await page.evaluate(() => window.__game.client.save());
    const surgeon = st.staff.find(m => m.role === 'role.surgeon_clinic');
    routed = Object.values(st.patients).find(p => p.kind === 'walkIn' && p.dept === 'dept.surgery' && (p.status === 'waiting' || p.status === 'inRoom')) ?? null;
    if (routed) routed = { id: routed.id, by: routed.by, surgeon: surgeon?.id };
    else await page.waitForTimeout(500);
  }
  if (!routed) {
    fail('за 4 минуты регистратор никого не направил в хирургию');
    return;
  }
  await page.evaluate(() => window.__game.actions.setSpeed(1));
  ok(`регистратор направил в хирургию: ${routed.id}${routed.by ? `, у врача ${routed.by === routed.surgeon ? '— амбулаторного хирурга' : routed.by}` : ''}`);
  // на карте он появится, когда войдёт; путь поток присылает, пока часы идут
  const key = await until(id => window.__game.pop.keyOf(id) ?? false, routed.id, 30000).then(h => h.jsonValue(), () => '');
  if (key) await page.evaluate(k => window.__game.actions.select(k), key);
  const path = await until(() => {
    const t = document.getElementById('path')?.textContent ?? '';
    return t.length > 0 ? t : false;
  }, null, 10000).then(h => h.jsonValue(), () => '');
  if (flat(path).includes('регистратор направил: хирургия')) ok(`в пути больного — «регистратор направил: хирургия» (снимок ${await shot('e2e-routing-path.jpg')} КБ)`);
  else fail(`путь больного (${key || 'нет на карте'}): «${flat(path).slice(0, 200)}»`);
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__game.actions.setSpeed(0));

  // ---------------------------------------------------------------- «До утра»: на планёрке — строка направления
  const t1 = Date.now();
  await page.click('#speed-ff');
  for (;;) {
    const h = await page.evaluate(() => ({ open: window.__game.store.get().economy?.open ?? false, ff: window.__game.ff, speed: window.__game.speed, card: window.__game.doctor.open }));
    if (h.open || Date.now() - t1 > 300000) break;
    if (h.card) await page.keyboard.press('Escape');
    else if (!h.ff && h.speed === 0) await page.click('#speed-ff');
    await page.waitForTimeout(200);
  }
  await page.waitForSelector('#meeting', { timeout: 10000 });
  const line = flat(await page.innerText('#meet-routing').catch(() => ''));
  if (/^регистратор направил \d+, не туда — \d+/.test(line)) ok(`планёрка: «${line}»`);
  else fail(`планёрка, строка направления: «${line}»`);
  await page.evaluate(() => window.__game.actions.money({ kind: 'close' }));
}
