// Сценарий в браузере, часть 19 — санитары и каталки (spec docs/specs/2026-10-orderlies.md, «Проверки»). Городская больница,
// поток от больницы. Карточка смотровой приёмного: санитар — «без него помещение работает, но лежачие ждут». «До утра» до
// 10:00, дальше ×12, пока не запишут перевозку на койку; ×3 — пока её везут: больной лежит на каталке перед тем, кто везёт,
// каталка под ним; карточка санитара — «везёт на каталке: …, … → …», «Следить» — камера за ним; карточка больного — «везут
// на каталке: … → …»; в пути — «на каталке: … → …»; «Персонал» — «везёт больного до …»; довезли — лежит на койке, с каталки
// сняли. Привезённых скорой ввозит фельдшер скорой и уходит. Снимок — `e2e-gurney-1.jpg`.
import { join } from 'node:path';

/** @param {{ page: import('playwright-core').Page, port: number, out: string, ok: (m: string) => void, fail: (m: string) => void, q: string, shots: string }} x */
export async function gurneyPart({ page, port, out, ok, fail, q, shots }) {
  const until = (fn, a, ms = 30000) => page.waitForFunction(fn, a, { timeout: ms });
  const flat = s => (s ?? '').replace(/\s+/g, ' ').trim();
  const shot = async name => {
    if (shots) {
      await page.evaluate(x => window.__game.actions.setQuality(x), shots);
      await page.waitForTimeout(400);
    }
    const buf = await page.screenshot({ path: join(out, name), type: 'jpeg', quality: 72 });
    if (shots) await page.evaluate(x => window.__game.actions.setQuality(x), q);
    return Math.round(buf.length / 1024);
  };
  /** «До утра» до часа `h` этих суток; автопауза — снова. */
  const ffTo = async h => {
    for (let i = 0; i < 200; i++) {
      const done = await page.evaluate(x => {
        const g = window.__game;
        const end = Math.floor(g.t / 86400) * 86400 + x * 3600;
        if (g.t >= end) return true;
        g.doctor.close?.();
        g.ffUntil = end;
        g.ff = true;
        return false;
      }, h);
      if (done) return;
      await page.waitForTimeout(500);
    }
  };
  /** Что сейчас с перевозкой больного `id`: фаза, кто везёт, больной на каталке у него, каталка под больным. */
  const now = id =>
    page.evaluate(x => {
      const g = window.__game;
      const r = g.pop.rides.find(y => y.id === x);
      const ph = r ? g.pop.phases.get(r.by) : undefined;
      const key = g.pop.walkerKey(x);
      const w = key ? g.crowd.walkers.get(key) : undefined;
      const under = w ? g.pop.gurneys().some(c => Math.hypot(c.x - w.x, c.z - w.z) < 0.1) : false;
      return { t: g.t, phase: ph && ph.r.id === x ? ph.ph : null, by: r?.by, key, carry: w?.carry ?? null, state: w?.state, pose: w?.at?.pose, under, shown: g.gurneys.shown };
    }, id);

  await page.goto(`http://127.0.0.1:${port}/index.html?q=${q}&lang=ru&hospital=preset&seed=3`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  await page.evaluate(() => window.__game.actions.doctor({ kind: 'autopause', on: false }));

  // ---------------------------------------------------------------- карточка смотровой: санитар — по желанию
  const er = await page.evaluate(() => window.__game.plan.rooms.find(r => r.type === 'room.emergency').id);
  await page.evaluate(id => window.__game.selectRoomId(id), er);
  await page.waitForSelector('#card .post', { timeout: 10000 });
  const posts = await page.$$eval('#card .post', els => els.map(e => (e.textContent ?? '').replace(/\s+/g, ' ').trim()));
  const post = posts.find(p => p.startsWith('Санитар'));
  if (post && post.includes('без него помещение работает, но лежачие ждут') && /день.+Уволить.*ночь.+Уволить/.test(post)) ok(`смотровая приёмного: «${post}»`);
  else fail(`смотровая приёмного: ${JSON.stringify(posts)}`);
  await page.keyboard.press('Escape');

  // ---------------------------------------------------------------- до перевозки на койку
  await ffTo(10);
  await page.evaluate(() => window.__game.actions.setSpeed(12));
  const medics = new Set();
  let ride = null;
  for (let i = 0; i < 600 && !ride; i++) {
    const r = await page.evaluate(() => {
      const g = window.__game;
      const m = [...g.crowd.walkers.keys()].filter(k => k.startsWith('m:'));
      const bed = g.pop.rides.find(x => x.why === 'bed' && x.pick > g.t);
      return { m, bed: bed ? { ...bed } : null };
    });
    for (const k of r.m) medics.add(k);
    ride = r.bed;
    if (!ride) await page.waitForTimeout(300);
  }
  if (!ride) {
    fail('перевозка: за полдня ни одной на койку');
    return;
  }
  ok(`перевозка записана: ${ride.id} — ${ride.from} → ${ride.to}, за ним придут в ${new Date(ride.pick * 1000).toISOString().slice(11, 16)}`);
  // ×12 — пока не повезут (без видеокарты кадров мало: ×1 почти стоит)
  await page.evaluate(() => window.__game.actions.setSpeed(12));
  let s = await now(ride.id);
  for (let i = 0; i < 600 && s.phase !== 'carry'; i++) {
    await page.waitForTimeout(100);
    s = await now(ride.id);
  }
  await page.evaluate(() => window.__game.setSpeed(0));
  await page.waitForTimeout(300);
  s = await now(ride.id);
  if (s.phase === 'carry' && s.carry === `s:${ride.by}` && s.under && s.shown >= 1) ok(`везут: больной лежит на каталке перед тем, кто везёт (${s.carry}), каталок на карте — ${s.shown}`);
  else fail(`везут: ${JSON.stringify(s)}`);

  // ---------------------------------------------------------------- карточка санитара, «Следить», карточка больного, путь
  await page.evaluate(by => window.__game.actions.select(`s:${by}`), ride.by);
  await page.waitForSelector('#card', { timeout: 10000 });
  const card = flat(await page.textContent('#card'));
  if (/везёт на каталке: .+, .+ → .+/.test(card)) ok(`карточка того, кто везёт: «${card.slice(card.indexOf('везёт'), card.indexOf('везёт') + 90)}»`);
  else fail(`карточка того, кто везёт: «${card}»`);
  await page.evaluate(() => window.__game.actions.follow());
  const follows = await page.evaluate(by => window.__game.following === `s:${by}`, ride.by);
  if (follows) ok('«Следить» за санитаром: камера держит его');
  else fail('«Следить» за санитаром');
  ok(`снимок: ${join(out, 'e2e-gurney-1.jpg')} (${await shot('e2e-gurney-1.jpg')} КБ)`);
  await page.evaluate(() => window.__game.actions.follow());
  await page.keyboard.press('Escape');
  await page.evaluate(k => window.__game.actions.select(k), s.key);
  await page.waitForSelector('#card', { timeout: 10000 });
  const pcard = flat(await page.textContent('#card'));
  const path = await until(() => {
    const t = document.getElementById('path')?.textContent ?? '';
    return t.includes('на каталке') ? t : false;
  }, null, 10000)
    .then(h => h.jsonValue())
    .catch(() => '');
  if (/везут на каталке: .+ → .+/.test(pcard) && /на каталке: .+ → .+/.test(path)) ok(`карточка больного: «${pcard.slice(pcard.indexOf('везут'), pcard.indexOf('везут') + 70)}»; в пути — «${flat(path).slice(flat(path).indexOf('на каталке:') - 30, flat(path).indexOf('на каталке:') + 60)}»`);
  else fail(`карточка больного: «${pcard}», путь: «${flat(path)}»`);
  await page.keyboard.press('Escape');

  // ---------------------------------------------------------------- «Персонал»: везёт больного до …
  await page.evaluate(() => window.__game.actions.setTab('staff'));
  await page.waitForSelector('#staff-on-duty');
  const rows = await page.$$eval('#right .tabbody li', els => els.map(e => (e.textContent ?? '').replace(/\s+/g, ' ').trim()));
  const row = rows.find(x => /везёт больного до \d\d:\d\d/.test(x));
  if (row) ok(`«Персонал»: «${row}»`);
  else fail(`«Персонал»: ${JSON.stringify(rows.filter(x => x.startsWith('Санитар')))}`);
  await page.evaluate(() => window.__game.actions.setTab(null));

  // ---------------------------------------------------------------- довезли: на койке, с каталки сняли
  await page.evaluate(() => window.__game.actions.setSpeed(12));
  for (let i = 0; i < 600 && s.t < ride.done + 120; i++) {
    await page.waitForTimeout(100);
    s = await now(ride.id);
  }
  await page.evaluate(() => window.__game.setSpeed(0));
  s = await now(ride.id);
  if (s.carry === null && (s.state === 'lie' || s.state === 'slide') && s.pose === 'lie') ok(`довезли: лежит на койке (${s.state}), с каталки сняли`);
  else fail(`довезли: ${JSON.stringify(s)}`);

  // ---------------------------------------------------------------- фельдшер скорой
  const left = await page.evaluate(() => [...window.__game.crowd.walkers].filter(([k, w]) => k.startsWith('m:') && w.leaving).length);
  if (medics.size > 0) ok(`привезённых скорой ввозят фельдшеры: ${medics.size}${left ? `, уходят к машине — ${left}` : ''}`);
  else fail('фельдшеров скорой не было');
}
