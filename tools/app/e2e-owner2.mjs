// Сценарий в браузере, часть 9 — игра владельца 18.10 (spec docs/specs/2026-10-owner-play-2.md, «Проверки»). Готовая
// больница, зерно 11, поток 6 в час. «Открыть карту» во вкладке «Пациенты» у больного нанятого врача — карта для чтения:
// кто ведёт, «Ход приёма» — вопрос и ответ, назначенное; часы идут. «Следить» за идущим пациентом — камера идёт за ним,
// сдвиг мышью отпускает; у сотрудника — тоже. «Позвать» в окне врача — карты нет, часы идут, «Идёт к вам»; вошёл — карта
// и пауза. Снимки — `e2e-owner2-*.jpg`.
import { join } from 'node:path';

/** @param {{ page: import('playwright-core').Page, port: number, out: string, ok: (m: string) => void, fail: (m: string) => void, q: string, shots: string }} x */
export async function ownerTwoPart({ page, port, out, ok, fail, q, shots }) {
  const until = (fn, a, ms = 30000) => page.waitForFunction(fn, a, { timeout: ms });
  const hud = () => page.evaluate(() => ({ t: window.__game.t, speed: window.__game.speed }));
  /** Снимок: JPEG, в качестве `--shots` (для документов) или как есть. */
  const shot = async name => {
    if (shots) {
      await page.evaluate(x => window.__game.actions.setQuality(x), shots);
      await page.waitForTimeout(400);
    }
    const buf = await page.screenshot({ path: join(out, name), type: 'jpeg', quality: 72 });
    if (shots) await page.evaluate(x => window.__game.actions.setQuality(x), q);
    return Math.round(buf.length / 1024);
  };

  await page.goto(`http://127.0.0.1:${port}/index.html?q=${q}&lang=ru&hospital=preset&seed=11&flow=6,1`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  await until(() => !!window.__game.store.get().doctor?.state);

  // ---------------------------------------------------------------- «Открыть карту» у больного нанятого врача
  // у врача в кабинете и уже что-то спросил: на ×12 до такого, затем пауза — выбрать спокойно
  const atDoctor = () => {
    const g = window.__game;
    for (const w of g.crowd.walkers.values()) {
      if (w.staff || w.leaving) continue;
      const info = g.pop.info(w.key);
      if (info?.kind === 'patient' && info.by && info.doing === 'office' && !info.walking) return info.id;
    }
    return null;
  };
  await page.keyboard.press('Digit3');
  await until(atDoctor, null, 180000);
  await page.waitForTimeout(1500);
  const id = (await page.evaluate(atDoctor)) ?? (await until(atDoctor, null, 60000).then(h => h.jsonValue()));
  await page.keyboard.press('Tab');
  await until(x => !!document.getElementById(`pat-open-${x}`), id);
  const t0 = (await hud()).t;
  await page.click(`#pat-open-${id}`);
  await page.waitForSelector('.dcard.read #dcard-course', { timeout: 20000 });
  // «Ход приёма»: вопрос врача и ответ — по времени; часы идут, пока карта открыта
  await until(() => document.querySelectorAll('#dcard-course .pair .pt').length > 0, null, 60000).catch(() => {});
  const view = await page.evaluate(() => ({
    lead: document.getElementById('dcard-lead')?.textContent ?? '',
    pairs: [...document.querySelectorAll('#dcard-course .pair')].map(e => (e.textContent ?? '').replace(/\s+/g, ' ').trim()),
    actions: document.querySelectorAll('#dcard .questions, #dcard #col-decide').length,
  }));
  const tr = (await hud()).t;
  if (view.pairs.length > 0 && /навык \d/.test(view.lead) && view.actions === 0 && tr > t0) ok(`«Открыть карту» во вкладке «Пациенты»: «${view.lead}»; «Ход приёма»: «${view.pairs[0].slice(0, 90)}»${view.pairs.length > 1 ? ` и ещё ${view.pairs.length - 1}` : ''}; часы идут`);
  else fail(`карта для чтения: ${JSON.stringify({ ...view, t: [t0, tr] })}`);
  ok(`снимок: ${join(out, 'e2e-owner2-1-course.jpg')} (${await shot('e2e-owner2-1-course.jpg')} КБ)`);
  await page.keyboard.press('Escape');
  await until(() => !document.getElementById('dcard'));
  await page.keyboard.press('Tab');

  // ---------------------------------------------------------------- «Следить»
  // идущий пациент: камера держит его, пока он идёт; сдвиг камеры мышью — отпускает
  const moving = () => {
    const g = window.__game;
    for (const w of g.crowd.walkers.values()) {
      if (w.staff || w.leaving || w.state !== 'walk' || !w.cum || !w.pts) continue;
      // впереди ещё 6 м и больше
      const left = w.cum[w.cum.length - 1] - (w.cum[Math.floor(w.seg)] ?? 0);
      if (left > 6 && g.pop.info(w.key)?.kind === 'patient') return w.key;
    }
    return null;
  };
  const key = await until(moving, null, 60000).then(h => h.jsonValue());
  await page.evaluate(k => window.__game.actions.select(k), key);
  await page.waitForSelector('#card-follow', { timeout: 10000 });
  const from = await page.evaluate(k => ({ x: window.__game.crowd.walkers.get(k).x, z: window.__game.crowd.walkers.get(k).z }), key);
  await page.click('#card-follow');
  await page.waitForTimeout(2500);
  const f = await page.evaluate(k => {
    const g = window.__game;
    const w = g.crowd.walkers.get(k);
    const c = g.stage.cam.target;
    return w ? { d: Math.hypot(c.x - w.x, c.z - w.z), x: w.x, z: w.z, on: !!document.querySelector('#card-follow.on') } : null;
  }, key);
  const went = f ? Math.hypot(f.x - from.x, f.z - from.z) : 0;
  if (f && f.on && f.d < 1.5 && went > 1) ok(`«Следить»: пациент прошёл ${went.toFixed(1)} м, камера — в ${f.d.toFixed(2)} м от него`);
  else fail(`«Следить»: ${JSON.stringify({ f, went })}`);
  ok(`снимок: ${join(out, 'e2e-owner2-2-follow.jpg')} (${await shot('e2e-owner2-2-follow.jpg')} КБ)`);
  // сдвиг камеры правой кнопкой — отпускает; справа, где план не закрыт карточкой и панелями
  await page.mouse.move(1040, 300);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(1100, 330, { steps: 4 });
  await page.mouse.up({ button: 'right' });
  await page.waitForTimeout(300);
  if (!(await page.$('#card-follow.on'))) ok('сдвиг камеры мышью — камера отпущена');
  else fail('после сдвига камеры «Следить» осталось включённым');
  // сотрудник — тоже
  const nurse = await page.evaluate(() => [...window.__game.crowd.walkers.keys()].find(k => k.startsWith('s:')) ?? null);
  await page.evaluate(k => window.__game.actions.select(k), nurse);
  await page.waitForSelector('#card-follow', { timeout: 10000 });
  await page.click('#card-follow');
  await page.waitForTimeout(1500);
  const s = await page.evaluate(k => {
    const g = window.__game;
    const w = g.crowd.walkers.get(k);
    const c = g.stage.cam.target;
    return { d: Math.hypot(c.x - w.x, c.z - w.z), on: !!document.querySelector('#card-follow.on'), title: document.getElementById('card-title')?.textContent ?? '' };
  }, nurse);
  if (s.on && s.d < 1) ok(`«Следить» за сотрудником «${s.title}»: камера у него (${s.d.toFixed(2)} м)`);
  else fail(`«Следить» за сотрудником: ${JSON.stringify(s)}`);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  // ---------------------------------------------------------------- «Позвать» в окне врача
  const callable = () => {
    const b = [...document.querySelectorAll('#dock .dlists li button')].find(x => x.textContent === 'Позвать' && !x.disabled);
    return b ? b.closest('li')?.id ?? null : null;
  };
  // строку выбирают на паузе: на ходу её пациента может раньше позвать нанятый врач
  const row = await until(callable, null, 120000).then(h => h.jsonValue());
  await page.evaluate(() => window.__game.actions.setSpeed(0));
  const now = await page.evaluate(callable);
  const who = (now ?? row).replace(/^dr-/, '');
  await page.locator(`#dr-${who} button`, { hasText: 'Позвать' }).click();
  await until(x => window.__game.store.get().doctor?.state?.current?.id === x, who);
  await page.evaluate(() => window.__game.actions.setSpeed(3));
  const tc = (await hud()).t;
  await page.waitForTimeout(600);
  const w = await page.evaluate(() => ({
    card: !!document.getElementById('dcard'), speed: window.__game.speed, t: window.__game.t,
    label: document.querySelector('#dock .dlists .label')?.textContent ?? '', said: document.getElementById('dock-said')?.textContent ?? '',
  }));
  if (!w.card && w.speed === 3 && w.t > tc && w.label === 'Идёт к вам') ok(`«Позвать»: карты нет, часы идут; «${w.label}», «${w.said}»`);
  else fail(`«Позвать», пока идёт: ${JSON.stringify(w)}`);
  await page.waitForSelector('#dcard:not(.read)', { timeout: 90000 });
  const inn = await page.evaluate(() => ({ speed: window.__game.speed, active: window.__game.store.get().doctor?.card?.active }));
  if (inn.active && inn.speed === 0) ok('вошёл к вам — карта и пауза');
  else fail(`вошёл: ${JSON.stringify(inn)}`);
  ok(`снимок: ${join(out, 'e2e-owner2-3-in.jpg')} (${await shot('e2e-owner2-3-in.jpg')} КБ)`);
  await page.keyboard.press('Escape');
  await until(() => !document.getElementById('dcard') && window.__game.speed === 3);
  ok('карта закрыта — часы идут с прежней скоростью');
}
