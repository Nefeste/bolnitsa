// Сценарий в браузере, часть 13 — усталость и перерывы (spec docs/specs/2026-10-staff-shifts.md, часть 2, «Проверки»).
// Поликлиника, поток 14 в час — врачам звать есть кого весь день: «До утра» до 15:00, дальше ×12, пока кто-то из врачей не
// пойдёт на перерыв в ординаторскую; тогда пауза: он идёт в ординаторскую или сидит там (цель на карте — в ней); карточка —
// «… ординаторск… до …» и усталость полоской; устаёт и тот, кто делает обследования (часть 2б), — у него в карточке та же
// полоска; «Персонал» — «усталость N · перерыв до …»; пациент у двери его кабинета — в пути «врач на перерыве до …». Снимок
// — `e2e-fatigue-1.jpg`.
import { join } from 'node:path';

/** @param {{ page: import('playwright-core').Page, port: number, out: string, ok: (m: string) => void, fail: (m: string) => void, q: string, shots: string }} x */
export async function fatiguePart({ page, port, out, ok, fail, q, shots }) {
  const until = (fn, a, ms = 30000) => page.waitForFunction(fn, a, { timeout: ms });
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
  const flat = s => (s ?? '').replace(/\s+/g, ' ').trim();
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
  /** Врач, который сейчас на перерыве в ординаторской и ещё не пошёл назад: номер, перерыв и помещение плана. */
  const resting = () =>
    page.evaluate(() => {
      const g = window.__game;
      for (const [id, c] of g.crew) {
        if (c.rest?.kind !== 'staff' || g.t >= c.rest.back) continue;
        const room = g.plan.rooms.find(r => r.id === c.rest.room);
        const m = g.staff.find(x => x.id === id);
        return { id, f: c.f, rest: c.rest, room: room && { x: room.x, y: room.y, w: room.w, h: room.h }, office: m?.room };
      }
      return null;
    });

  await page.goto(`http://127.0.0.1:${port}/index.html?q=${q}&lang=ru&hospital=poly&seed=13&flow=14,0`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  await page.evaluate(() => window.__game.actions.doctor({ kind: 'autopause', on: false }));

  // ---------------------------------------------------------------- днём: усталость растёт, врач идёт на перерыв
  await ffTo(15);
  await page.keyboard.press('Digit3');
  await until(() => {
    const g = window.__game;
    for (const c of g.crew.values()) if (c.rest?.kind === 'staff' && g.t < c.rest.back) return true;
    return false;
  }, null, 240000);
  await page.evaluate(() => window.__game.setSpeed(0));
  const r = await resting();
  if (!r) {
    fail('перерыв: никто не на перерыве');
    return;
  }
  // на карте — идёт в ординаторскую или уже там
  const goal = await page.evaluate(id => {
    const w = window.__game.crowd.walkers.get(`s:${id}`);
    const g = w ? (w.goals[w.goals.length - 1] ?? w.at) : undefined;
    return g ? { x: g.x, z: g.z, pose: g.pose } : null;
  }, r.id);
  const inside = goal && r.room && goal.x >= r.room.x && goal.x < r.room.x + r.room.w && goal.z >= r.room.y && goal.z < r.room.y + r.room.h;
  if (inside) ok(`перерыв: врач с усталостью ${r.f} идёт в ординаторскую (${goal.pose === 'sit' ? 'сядет' : 'встанет'}), вернётся к ${new Date(r.rest.until * 1000).toISOString().slice(11, 16)}`);
  else fail(`перерыв: цель на карте ${JSON.stringify({ goal, r })}`);

  // ---------------------------------------------------------------- карточка: где он и до какого часа, усталость полоской
  await page.evaluate(id => window.__game.actions.select(`s:${id}`), r.id);
  await page.waitForSelector('#card-fatigue', { timeout: 10000 });
  const card = flat(await page.textContent('#card'));
  const bar = Number(await page.getAttribute('#card-fatigue', 'data-value'));
  if (/ординаторск\S* .*до \d\d:\d\d/.test(card) && bar >= 0 && bar <= 100) ok(`карточка врача: «${card.slice(0, 160)}»`);
  else fail(`карточка врача: «${card}» (усталость ${bar})`);
  ok(`снимок: ${join(out, 'e2e-fatigue-1.jpg')} (${await shot('e2e-fatigue-1.jpg')} КБ)`);
  await page.keyboard.press('Escape');

  // ---------------------------------------------------------------- и те, кто делает обследования (часть 2б)
  const doer = await page.evaluate(() => {
    const g = window.__game;
    for (const [id, c] of g.crew) {
      const m = g.staff.find(x => x.id === id);
      if (m && !g.db.roles[m.role]?.stands) return { id, f: c.f, role: m.role, rest: c.rest?.kind };
    }
    return null;
  });
  if (doer) {
    await page.evaluate(id => window.__game.actions.select(`s:${id}`), doer.id);
    await page.waitForSelector('#card-fatigue', { timeout: 10000 });
    const text = flat(await page.textContent('#card'));
    ok(`устаёт и тот, кто делает обследования: «${text.slice(0, 120)}»`);
    await page.keyboard.press('Escape');
  } else fail('усталость тех, кто делает обследования: в «crew» никого, кроме врачей');

  // ---------------------------------------------------------------- «Персонал»: усталость и перерыв
  await page.evaluate(() => window.__game.actions.setTab('staff'));
  await page.waitForSelector('#staff-on-duty');
  const rows = await page.$$eval('#right .tabbody li', els => els.map(e => (e.textContent ?? '').replace(/\s+/g, ' ').trim()));
  const row = rows.find(x => x.includes('перерыв до'));
  if (row && rows.some(x => /усталость \d+/.test(x))) ok(`«Персонал»: «${row}»`);
  else fail(`«Персонал»: ${JSON.stringify(rows.slice(0, 8))}`);
  await page.evaluate(() => window.__game.actions.setTab(null));

  // ---------------------------------------------------------------- путь пациента у его двери: «врач на перерыве до …»
  const keys = await page.evaluate(office => {
    const g = window.__game;
    const n = g.plan.rooms.findIndex(x => x.id === office);
    return [...g.pop.patients()].filter(([, p]) => p.doing === 'waiting' && p.room === n).map(([k]) => k);
  }, r.office);
  let found = '';
  for (const key of keys) {
    await page.evaluate(k => window.__game.actions.select(k), key);
    const text = await until(() => {
      const t = document.getElementById('path')?.textContent ?? '';
      return t.length > 0 ? t : false;
    }, null, 10000)
      .then(h => h.jsonValue())
      .catch(() => '');
    if (/врач (на перерыве|в туалете)/.test(text)) {
      found = flat(text);
      break;
    }
  }
  if (found) ok(`путь пациента у двери его кабинета: «…${found.slice(Math.max(0, found.search(/врач (на перерыве|в туалете)/) - 60), found.search(/врач (на перерыве|в туалете)/) + 40)}…»`);
  else fail(`путь: у двери ${keys.length}, ни у кого нет «врач на перерыве»`);
  await page.keyboard.press('Escape');
}
