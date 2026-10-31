// Сценарий в браузере, часть 33 — утренний обход (spec docs/specs/2026-10-staff-motion.md, часть 2, «Проверки»). Готовая
// больница, поток 14 в час. В первое утро лежащих у нанятых ещё нет, поэтому сначала карточка палаты: клиническая медсестра
// — только днём, «без неё помещение работает…», найм. Потом «До утра», планёрка — и в 08:30 вторых суток: клиническая
// медсестра обходит койки своей палаты — у изголовья, её карточка; ×12, пока нанятый врач не ушёл на обход, ×1, пока он не
// встанет у койки; пауза — он у изголовья с бумагами (`bedside:` — место у койки), карточка — «на обходе: N из M коек,
// вернётся в …», «Персонал» — «на обходе до …», ждущий у двери его кабинета — в пути «врач на обходе — вернётся в …».
// Снимки — `e2e-rounds-1-doctor.jpg`, `e2e-rounds-2-nurse.jpg`.
import { join } from 'node:path';

/** @param {{ page: import('playwright-core').Page, port: number, out: string, ok: (m: string) => void, fail: (m: string) => void, q: string, shots: string }} x */
export async function roundsPart({ page, port, out, ok, fail, q, shots }) {
  const until = (fn, a, ms = 30000) => page.waitForFunction(fn, a, { timeout: ms });
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
  const hhmm = t => new Date(t * 1000).toISOString().slice(11, 16);
  /** «Следить» за выбранным и ближе — снимок у койки; потом камеру отпустить. */
  const closeShot = async (id, name) => {
    await page.evaluate(() => window.__game.actions.follow());
    await page.waitForTimeout(1200);
    await page.evaluate(() => window.__game.stage.cam.zoom(0.55));
    await page.waitForTimeout(900);
    const follows = await page.evaluate(id => window.__game.following === `s:${id}`, id);
    ok(`снимок у койки («Следить»${follows ? '' : ' — камера не держит его'}): ${join(out, name)} (${await shot(name)} КБ)`);
    await page.evaluate(() => window.__game.actions.follow());
  };
  /** Обход из движка, что идёт сейчас (`by` — чей; иначе — первый врача или медсестры): у какой остановки, стоит ли у койки. */
  const rounding = (nurse, by) =>
    page.evaluate(([nurse, by]) => {
      const g = window.__game;
      for (const r of g.pop.wardRounds) {
        if (!!r.nurse !== nurse || (by && r.by !== by) || g.t < r.from || g.t >= r.until) continue;
        const i = r.stops.findIndex(st => g.t < st.end);
        const w = g.crowd.walkers.get(`s:${r.by}`);
        const m = g.staff.find(x => x.id === r.by);
        return {
          by: r.by, from: r.from, until: r.until, n: r.stops.length, i, stop: i >= 0 ? r.stops[i] : null, office: m?.room,
          at: w?.at?.key ?? '', still: !!w && w.goals.length === 0 && w.state !== 'walk', t: g.t,
        };
      }
      return null;
    }, [nurse, by ?? '']);
  /** Ждать (×1), пока тот, кто на обходе, не встанет у койки своей остановки; кончился обход — null. */
  const atBed = async (nurse, by) => {
    for (let i = 0; i < 600; i++) {
      const r = await rounding(nurse, by);
      if (!r) return null;
      if (r.stop && r.t >= r.stop.at && r.still && r.at.startsWith('bedside:')) return r;
      await page.waitForTimeout(100);
    }
    return null;
  };

  await page.goto(`http://127.0.0.1:${port}/index.html?q=${q}&lang=ru&hospital=preset&seed=3&flow=14,2`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  await page.evaluate(() => window.__game.actions.doctor({ kind: 'autopause', on: false }));

  // ---------------------------------------------------------------- клиническая медсестра: карточка палаты, найм
  const ward = await page.evaluate(() => window.__game.plan.rooms.find(r => r.type === 'room.ward')?.id);
  await page.evaluate(id => window.__game.selectRoomId(id), ward);
  await page.waitForSelector('#hire-clinical_nurse', { timeout: 10000 });
  const night = await page.$('#hire-clinical_nurse-night');
  const posts = await page.$$eval('#card .post', els => els.map(e => (e.textContent ?? '').replace(/\s+/g, ' ').trim()));
  const post = posts.find(x => x.startsWith('Клиническая медсестра')) ?? '';
  if (!night && post.includes('без неё помещение работает')) ok(`карточка палаты: «${post}» — только днём`);
  else fail(`карточка палаты: ночное место ${!!night}, «${post}»`);
  await page.click('#hire-clinical_nurse');
  await until(id => window.__game.staff.some(m => m.role === 'role.clinical_nurse' && m.room === id), ward, 10000).catch(() => {});
  const nurse = await page.evaluate(id => window.__game.staff.find(m => m.role === 'role.clinical_nurse' && m.room === id)?.id, ward);
  if (nurse) ok(`клиническая медсестра нанята в палату (${nurse})`);
  else {
    fail('клиническая медсестра: не нанята');
    return;
  }
  await page.keyboard.press('Escape');

  // ---------------------------------------------------------------- «До утра», планёрка
  const t0 = Date.now();
  await page.click('#speed-ff');
  for (;;) {
    const h = await page.evaluate(() => ({ open: window.__game.store.get().economy?.open ?? false, ff: window.__game.ff, speed: window.__game.speed, card: window.__game.doctor.open }));
    if (h.open || Date.now() - t0 > 300000) break;
    if (h.card) await page.keyboard.press('Escape');
    else if (!h.ff && h.speed === 0) await page.click('#speed-ff');
    await page.waitForTimeout(200);
  }
  if (await page.$('#meeting')) ok(`«До утра» — планёрка вторых суток (${Math.round((Date.now() - t0) / 1000)} с)`);
  else {
    fail('«До утра»: планёрки нет');
    return;
  }
  await page.click('#meeting-close');

  // ---------------------------------------------------------------- 08:30: клиническая медсестра обходит свою палату
  // её обход короткий — к 08:30 на ×12, дальше ×1
  const day2 = await page.evaluate(() => Math.floor(window.__game.t / 86400) * 86400 + 8 * 3600 + 29 * 60);
  await page.keyboard.press('Digit3');
  await until(t => window.__game.t >= t, day2, 60000).catch(() => {});
  await page.keyboard.press('Digit1');
  await until(id => window.__game.pop.wardRounds.some(r => r.by === id), nurse, 60000).catch(() => {});
  const started = await page.evaluate(id => window.__game.pop.wardRounds.find(r => r.by === id) ?? null, nurse);
  if (!started) {
    fail('клиническая медсестра: в 08:30 обхода нет');
    return;
  }
  ok(`клиническая медсестра — обход с ${hhmm(started.from)} до ${hhmm(started.until)}, коек ${started.stops.length}`);
  const her = await atBed(true, nurse);
  if (her) {
    await page.evaluate(() => window.__game.setSpeed(0));
    ok(`клиническая медсестра у койки ${her.i + 1} из ${her.n} (${her.at}), на посту к ${hhmm(her.until)}`);
    await page.evaluate(id => window.__game.actions.select(`s:${id}`), nurse);
    await page.waitForSelector('#card', { timeout: 10000 });
    const text = flat(await page.textContent('#card'));
    if (/на обходе: \d+ из \d+ ко(ек|йки)/.test(text)) ok(`карточка клинической медсестры: «${text.slice(0, 160)}»`);
    else fail(`карточка клинической медсестры: «${text}»`);
    await closeShot(nurse, 'e2e-rounds-2-nurse.jpg');
    await page.keyboard.press('Escape');
  } else fail(`клиническая медсестра: не у койки — ${JSON.stringify(await rounding(true, nurse))}`);

  // ---------------------------------------------------------------- 08:30: врач уходит на обход, встаёт у койки
  await page.keyboard.press('Digit3');
  await until(() => window.__game.pop.wardRounds.some(r => !r.nurse && window.__game.t >= r.from && window.__game.t < r.until), null, 120000).catch(() => {});
  await page.keyboard.press('Digit1');
  const doc = await atBed(false);
  if (!doc) {
    fail(`обход: врач не встал у койки — ${JSON.stringify(await rounding(false))}`);
    return;
  }
  await page.evaluate(() => window.__game.setSpeed(0));
  ok(`обход: врач ушёл в ${hhmm(doc.from)}, у койки ${doc.i + 1} из ${doc.n} (${doc.at}) с ${hhmm(doc.stop.at)}, вернётся в ${hhmm(doc.until)}`);

  // ---------------------------------------------------------------- карточка врача и «Персонал»
  await page.evaluate(id => window.__game.actions.select(`s:${id}`), doc.by);
  await page.waitForSelector('#card', { timeout: 10000 });
  const card = flat(await page.textContent('#card'));
  if (new RegExp(`на обходе: \\d+ из ${doc.n} ко(ек|йки), вернётся в ${hhmm(doc.until)}`).test(card)) ok(`карточка врача: «${card.slice(0, 200)}»`);
  else fail(`карточка врача: «${card}»`);
  await closeShot(doc.by, 'e2e-rounds-1-doctor.jpg');
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__game.actions.setTab('staff'));
  await page.waitForSelector('#staff-on-duty');
  const rows = await page.$$eval('#right .tabbody li', els => els.map(e => (e.textContent ?? '').replace(/\s+/g, ' ').trim()));
  const row = rows.find(x => x.includes(`на обходе до ${hhmm(doc.until)}`));
  if (row) ok(`«Персонал»: «${row}»`);
  else fail(`«Персонал»: ${JSON.stringify(rows.slice(0, 10))}`);
  await page.evaluate(() => window.__game.actions.setTab(null));

  // ---------------------------------------------------------------- путь ждущего у двери его кабинета
  const keys = await page.evaluate(office => {
    const g = window.__game;
    const n = g.plan.rooms.findIndex(x => x.id === office);
    return [...g.pop.patients()].filter(([, p]) => p.doing === 'waiting' && p.room === n).map(([k]) => k);
  }, doc.office);
  let found = '';
  for (const key of keys) {
    await page.evaluate(k => window.__game.actions.select(k), key);
    const text = await until(() => {
      const t = document.getElementById('path')?.textContent ?? '';
      return t.length > 0 ? t : false;
    }, null, 10000)
      .then(h => h.jsonValue())
      .catch(() => '');
    if (text.includes('врач на обходе — вернётся в')) {
      found = flat(text);
      break;
    }
  }
  if (found) {
    const at = found.indexOf('врач на обходе');
    ok(`путь ждущего у двери его кабинета: «…${found.slice(Math.max(0, at - 60), at + 40)}…»`);
  } else fail(`путь: у двери ${keys.length}, ни у кого нет «врач на обходе — вернётся в …»`);
  await page.keyboard.press('Escape');
}
