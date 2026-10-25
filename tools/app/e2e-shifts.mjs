// Сценарий в браузере, часть 12 — смены персонала (spec docs/specs/2026-10-staff-shifts.md, «Проверки»). Городская
// больница, поток 6 в час: днём на местах дневная смена, ночной нет; «До утра» до 20:20 — дневные ушли к выходу (кто
// доводит приём — в кабинете), ночная смена вошла с улицы; карточка смотровой приёмного ночью — «день — …», «ночь — …»;
// регистратура ночью не работает — «ночь — Нанять на ночь»: нанять — ночной регистратор на месте, регистратура работает;
// карточка человека — смена и её часы; «Персонал» — «Сейчас в смене». Снимки — `e2e-shifts-*.jpg`.
import { join } from 'node:path';

/** @param {{ page: import('playwright-core').Page, port: number, out: string, ok: (m: string) => void, fail: (m: string) => void, q: string, shots: string }} x */
export async function shiftsPart({ page, port, out, ok, fail, q, shots }) {
  const until = (fn, a, ms = 30000) => page.waitForFunction(fn, a, { timeout: ms });
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
  const flat = s => (s ?? '').replace(/\s+/g, ' ').trim();
  /** Кто из штата на карте: дневные и ночные — на месте, идут к выходу или их нет. */
  const crew = () => page.evaluate(() => {
    const g = window.__game;
    const of = shift => g.staff.filter(m => m.shift === shift).map(m => g.crowd.walkers.get(`s:${m.id}`));
    const day = of('day');
    const night = of('night');
    return {
      staff: g.staff.length, day: day.length, night: night.length,
      dayHere: day.filter(w => w && !w.leaving).length, dayLeaving: day.filter(w => w?.leaving).length,
      nightHere: night.filter(w => w && !w.leaving).length, t: g.t,
    };
  });
  /** «До утра» до часа `h` этих суток; автопауза (срочный, просьба врача) — снова. */
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

  await page.goto(`http://127.0.0.1:${port}/index.html?q=${q}&lang=ru&hospital=preset&seed=12&flow=6,1`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  await page.evaluate(() => window.__game.actions.doctor({ kind: 'autopause', on: false }));

  // ---------------------------------------------------------------- днём: дневная смена на местах
  const d = await crew();
  if (d.night > 0 && d.dayHere === d.day && d.nightHere === 0) ok(`днём: штат ${d.staff}, на местах дневная смена ${d.dayHere}, ночной (${d.night}) нет`);
  else fail(`днём: ${JSON.stringify(d)}`);

  // ---------------------------------------------------------------- 20:00: пересменка
  await ffTo(20 + 20 / 60);
  await page.evaluate(() => window.__game.setSpeed(0));
  const n = await crew();
  if (n.nightHere === n.night && n.dayHere + n.dayLeaving <= n.day && n.dayHere <= 4) ok(`20:20: ночная смена вошла (${n.nightHere}), дневные ушли или идут к выходу (${n.dayLeaving}), доводят приём — ${n.dayHere}`);
  else fail(`пересменка: ${JSON.stringify(n)}`);
  ok(`снимок: ${join(out, 'e2e-shifts-1-night.jpg')} (${await shot('e2e-shifts-1-night.jpg')} КБ)`);

  // ---------------------------------------------------------------- карточка смотровой приёмного ночью
  const er = await page.evaluate(() => window.__game.plan.rooms.find(r => r.type === 'room.emergency').id);
  await page.evaluate(id => window.__game.selectRoomId(id), er);
  await page.waitForSelector('#card .post', { timeout: 10000 });
  const posts = await page.$$eval('#card .post', els => els.map(e => (e.textContent ?? '').replace(/\s+/g, ' ').trim()));
  // строка на должность: «Медсестра · день … Уволить · ночь … Уволить»
  if (posts.some(p => /день.+Уволить.*ночь.+Уволить/.test(p))) ok(`смотровая приёмного ночью: ${posts.map(p => `«${p}»`).join(', ')}`);
  else fail(`смотровая приёмного ночью: ${JSON.stringify(posts)}`);

  // ---------------------------------------------------------------- регистратура ночью: нанять на ночь
  const reg = await page.evaluate(() => window.__game.plan.rooms.find(r => r.type === 'room.reception').id);
  const works = id => page.evaluate(x => window.__game.working.has(x), reg);
  const before = await works(reg);
  await page.evaluate(id => window.__game.selectRoomId(id), reg);
  await page.waitForSelector('#hire-registrar-night', { timeout: 10000 });
  // в строке — «Нанять · 1 625 ₽», полные слова — в подсказке кнопки
  const offer = `${flat(await page.textContent('#hire-registrar-night'))} | ${(await page.getAttribute('#hire-registrar-night', 'title')) ?? ''}`;
  await page.click('#hire-registrar-night');
  await until(id => window.__game.staff.some(m => m.room === id && m.shift === 'night'), reg);
  await until(id => window.__game.working.has(id), reg).catch(() => {});
  const after = await works(reg);
  const hired = await page.evaluate(id => window.__game.staff.find(m => m.room === id && m.shift === 'night').id, reg);
  await until(id => window.__game.crowd.walkers.has(`s:${id}`), hired).catch(() => {});
  const walker = await page.evaluate(id => window.__game.crowd.walkers.has(`s:${id}`), hired);
  if (!before && after && walker && /^Нанять · [\d  ]+ ₽ \| Нанять на ночь: .+ — .+ ₽ за смену$/.test(offer)) ok(`регистратура ночью: не работала; «${offer}» — ночной регистратор на месте, работает`);
  else fail(`найм на ночь: ${JSON.stringify({ before, after, walker, offer })}`);
  ok(`снимок: ${join(out, 'e2e-shifts-2-hire.jpg')} (${await shot('e2e-shifts-2-hire.jpg')} КБ)`);

  // ---------------------------------------------------------------- карточка человека и «Персонал»
  await page.evaluate(id => window.__game.actions.select(`s:${id}`), hired);
  await page.waitForSelector('#card', { timeout: 10000 });
  const card = flat(await page.textContent('#card'));
  if (card.includes('ночная, 20:00–08:00')) ok('карточка ночного регистратора: «ночная, 20:00–08:00»');
  else fail(`карточка человека: «${card}»`);
  const day = await page.evaluate(() => window.__game.staff.find(m => m.shift === 'day' && m.role === 'role.registrar').id);
  await page.evaluate(id => window.__game.actions.select(`s:${id}`), day);
  await until(() => (document.getElementById('card')?.textContent ?? '').includes('дома'));
  ok(`карточка дневного регистратора ночью: «${flat(await page.textContent('#card')).slice(0, 120)}»`);
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__game.actions.setTab('staff'));
  await page.waitForSelector('#staff-on-duty');
  const all = await page.$$eval('#right .tabbody li', els => els.length);
  await page.click('#staff-on-duty');
  const on = await page.$$eval('#right .tabbody li', els => els.length);
  const st = await page.evaluate(() => window.__game.staff.length);
  if (all === st && on < all && on > 0) ok(`«Персонал»: ${all}; «Сейчас в смене» — ${on}`);
  else fail(`«Персонал»: ${JSON.stringify({ all, on, st })}`);
  await page.click('#staff-on-duty');
  await page.evaluate(() => window.__game.actions.setTab(null));
}
