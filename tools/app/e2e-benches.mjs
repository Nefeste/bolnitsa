// Сценарий в браузере, часть 15 — скамейки у дверей кабинетов (spec docs/specs/2026-10-door-benches.md, «Проверки»).
// Городская больница, поток 12 в час: у дверей кабинетов нанятых врачей — пары скамей; ×12, пока у двери кто-то не сядет на
// скамью (на карте — сидит на скамье у двери); в пути кого-то из ждущих у двери — «на скамье у кабинета». Стройка:
// «Скамья» — призрак у двери зелёный с ценой, перед дверью — красный «перед дверью», в помещении — «только в коридоре»;
// щелчок ставит, Ctrl+Z убирает; «Снос» над скамьёй — «Снести скамью — вернётся …». Снимок — `e2e-benches-1.jpg`.
import { join } from 'node:path';

/** @param {{ page: import('playwright-core').Page, port: number, out: string, ok: (m: string) => void, fail: (m: string) => void, q: string, shots: string }} x */
export async function benchesPart({ page, port, out, ok, fail, q, shots }) {
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
  const frames = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const look = async (x, y, half = 8) => {
    await page.evaluate(([cx, cy, h]) => {
      const g = window.__game;
      g.stage.cam.target.set(cx, 0, cy);
      g.stage.cam.half = h;
    }, [x, y, half]);
    await frames();
  };
  const at = (x, y) => page.evaluate(([cx, cy]) => window.__game.stage.screenOfCell(cx, cy), [x, y]);
  /** Строка призрака на экране — та, что у стройки сейчас. */
  const settled = () => until(() => (document.getElementById('ghost')?.textContent ?? '') === (window.__game.builder.ghost?.text ?? ''));
  const ghost = async () => {
    await settled();
    return page.$eval('#ghost', el => ({ ok: el.classList.contains('ok'), text: el.textContent ?? '' })).catch(() => ({ ok: false, text: '' }));
  };
  /** Навести курсор на клетку и дождаться призрака. */
  const hover = async (x, y) => {
    const p = await at(x, y);
    await page.mouse.move(p.x, p.y);
    await until(([cx, cy]) => {
      const h = window.__game.builder.hover;
      return !!h && h[0] === cx && h[1] === cy;
    }, [x, y]);
    await settled();
    return p;
  };
  const benches = () => page.evaluate(() => window.__game.hospital.site.decor.filter(d => d.kind === 'bench').length);

  await page.goto(`http://127.0.0.1:${port}/index.html?q=${q}&lang=ru&hospital=preset&seed=3&flow=12,0`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  await page.evaluate(() => window.__game.actions.doctor({ kind: 'autopause', on: false }));

  // ---------------------------------------------------------------- у двери сидят на скамье
  await page.keyboard.press('Digit3');
  const sitter = await until(() => {
    const g = window.__game;
    for (const [k, p] of g.pop.patients()) {
      if (p.doing !== 'waiting' || p.seat < 0) continue;
      const w = g.crowd.walkers.get(k);
      if (w?.state === 'sit' && w.at?.key.startsWith('seat:')) return { key: k, x: w.x, z: w.z, room: p.room };
    }
    return false;
  }, null, 240000)
    .then(h => h.jsonValue())
    .catch(() => null);
  await page.evaluate(() => window.__game.setSpeed(0));
  if (sitter) {
    await look(sitter.x, sitter.z);
    ok(`у двери кабинета сидят на скамье (снимок ${await shot('e2e-benches-1.jpg')} КБ)`);
  } else fail('у дверей никто не сел на скамью');

  // ---------------------------------------------------------------- в пути — «на скамье у кабинета»
  const keys = await page.evaluate(() => {
    const g = window.__game;
    return [...g.pop.patients()].filter(([, p]) => p.doing === 'waiting' && p.room >= 0 && g.plan.rooms[p.room]?.type === 'room.office').map(([k]) => k);
  });
  let found = '';
  for (const key of keys) {
    await page.evaluate(k => window.__game.actions.select(k), key);
    const text = await until(() => {
      const t = document.getElementById('path')?.textContent ?? '';
      return t.length > 0 ? t : false;
    }, null, 10000)
      .then(h => h.jsonValue())
      .catch(() => '');
    if (text.includes('на скамье у кабинета')) {
      found = flat(text);
      break;
    }
  }
  const i = found.indexOf('на скамье у кабинета');
  if (found) ok(`путь ждущего у двери: «…${found.slice(Math.max(0, i - 40), i + 70)}…»`);
  else fail(`путь: у дверей ${keys.length}, ни у кого нет «на скамье у кабинета»`);
  await page.keyboard.press('Escape');

  // ---------------------------------------------------------------- стройка: «Скамья»
  await page.keyboard.press('KeyB');
  await page.click('#tool-bench');
  await look(46, 6, 7);
  const n = await benches();
  // у двери эндокринолога (47, 6): вдоль стены, третья
  const p = await hover(44, 7);
  const g1 = await ghost();
  if (g1.ok && /^Скамья — 800 ₽ · у двери кабинета/.test(g1.text.replace(/ | /g, ' '))) ok(`призрак у двери: «${g1.text}»`);
  else fail(`призрак у двери: ${JSON.stringify(g1)}`);
  await hover(47, 7);
  const g2 = await ghost();
  if (!g2.ok && g2.text.includes('перед дверью')) ok(`перед дверью: «${g2.text}»`);
  else fail(`перед дверью: ${JSON.stringify(g2)}`);
  await hover(47, 3);
  const g3 = await ghost();
  if (!g3.ok && g3.text.includes('только в коридоре')) ok(`в кабинете: «${g3.text}»`);
  else fail(`в кабинете: ${JSON.stringify(g3)}`);
  await page.mouse.move(p.x, p.y);
  await settled();
  await page.mouse.click(p.x, p.y);
  await until(k => window.__game.hospital.site.decor.filter(d => d.kind === 'bench').length === k + 1, n);
  const result = flat(await page.textContent('#result').catch(() => ''));
  if (/Потрачено 800/.test(result.replace(/ | /g, ' '))) ok(`скамья поставлена: «${result}»`);
  else fail(`итог щелчка: «${result}»`);
  await page.keyboard.press('Control+KeyZ');
  await until(k => window.__game.hospital.site.decor.filter(d => d.kind === 'bench').length === k, n);
  ok('Ctrl+Z убрал скамью');

  // ---------------------------------------------------------------- «Снос» над скамьёй
  await page.click('#tool-demolish');
  await hover(45, 7);
  const g4 = await ghost();
  if (/Снести скамью — вернётся 400/.test(g4.text.replace(/ | /g, ' '))) ok(`снос скамьи: «${g4.text}»`);
  else fail(`снос скамьи: ${JSON.stringify(g4)}`);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.keyboard.press('KeyB');
}
