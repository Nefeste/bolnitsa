// Сценарий в браузере, часть 30 — слой «Проблемы» (spec docs/specs/2026-10-layers.md, часть 1, «Проверки»; часть 29 — у
// каталога стройки). Городская больница: «Проблемы» в меню «Слои» — список справа внизу, легенды отделений нет; уволили
// дневного лаборанта — днём в лаборатории никого: жёлтая строка «в этой смене никого — закрыто до 20:00»; уволили и
// ночного — красный пол, значок и строка «не работает: нет лаборанта», в меню — число; камера далеко, щелчок по строке —
// камера к лаборатории и её карточка; L — по кругу: выключены, «Очереди», «Отделения», «Пути пациентов», «Проблемы».
// Снимок — `e2e-problems-1.jpg`.
import { join } from 'node:path';

/** @param {{ page: import('playwright-core').Page, port: number, out: string, ok: (m: string) => void, fail: (m: string) => void, q: string, shots: string }} x */
export async function problemsPart({ page, port, out, ok, fail, q, shots }) {
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
  const flat = s => (s ?? '').replace(/[\s  ]+/g, ' ').trim();
  const frames = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  /** Строки списка: ключ, уровень, текст. */
  const rows = () =>
    page.$$eval('#problems .prow', els => els.map(e => ({ key: e.dataset.key ?? '', level: e.dataset.level ?? '', text: (e.textContent ?? '').replace(/[\s  ]+/g, ' ').trim() })));

  await page.goto(`http://127.0.0.1:${port}/index.html?q=${q}&lang=ru&hospital=preset&seed=3&flow=12,0`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  await page.evaluate(() => window.__game.actions.doctor({ kind: 'autopause', on: false }));
  await page.evaluate(() => window.__game.setSpeed(0));

  // ---------------------------------------------------------------- «Проблемы» в меню «Слои»
  await page.click('#layers');
  await page.click('#layer-problems');
  await until(() => !!document.getElementById('problems-panel'), null, 10000).catch(() => {});
  const s0 = await page.evaluate(() => {
    const l = window.__game.store.get().layers;
    return { on: l.problems, queues: l.queues, depts: l.depts, panel: !!document.getElementById('problems-panel'), legend: !!document.getElementById('dept-legend-panel') };
  });
  const r0 = await rows();
  const none = flat(await page.textContent('#problems-none').catch(() => ''));
  if (s0.on && !s0.queues && !s0.depts && s0.panel && !s0.legend && (r0.length > 0 || none === 'Проблем нет — всё работает'))
    ok(`«Проблемы»: список справа внизу${r0.length ? ` — ${r0.map(r => r.text).join('; ')}` : ` — «${none}»`}; легенды отделений нет`);
  else fail(`слой «Проблемы»: ${JSON.stringify({ s0, r0, none })}`);

  // ---------------------------------------------------------------- уволили лаборанта — лаборатория не работает
  const lab = await page.evaluate(() => {
    const g = window.__game;
    const i = g.plan.rooms.findIndex(r => r.type === 'room.lab');
    const r = g.plan.rooms[i];
    return { id: r.id, i, x: r.x + r.w / 2, z: r.y + r.h / 2 };
  });
  const labRow = id => page.evaluate(i => window.__game.store.get().problems.rows.find(r => r.key === `r:${i}`) ?? null, id);
  await page.evaluate(id => window.__game.selectRoomId(id), lab.id);
  await page.waitForSelector('#dismiss-lab_tech', { timeout: 10000 });
  await page.click('#dismiss-lab_tech');
  await until(id => window.__game.store.get().problems.rows.some(r => r.key === `r:${id}`), lab.id, 20000).catch(() => {});
  const gap = await labRow(lab.id);
  if (gap?.level === 'warn' && gap.what === 'в этой смене никого — закрыто до 20:00') ok(`уволили дневного лаборанта: «Лаборатория — ${gap.what}», жёлтая`);
  else fail(`дневной лаборант уволен: ${JSON.stringify(gap)}`);
  await page.waitForSelector('#dismiss-lab_tech-night', { timeout: 10000 });
  await page.click('#dismiss-lab_tech-night');
  await until(id => window.__game.store.get().problems.rows.find(r => r.key === `r:${id}`)?.level === 'bad', lab.id, 20000).catch(() => {});
  await page.keyboard.press('Escape');
  await frames();
  const s1 = await page.evaluate(id => {
    const g = window.__game;
    const p = g.store.get().problems;
    const chips = g.chips.dump();
    return {
      row: p.rows.find(r => r.key === `r:${id}`) ?? null, count: p.count, menu: document.getElementById('layer-problems')?.textContent ?? '',
      painted: g.stage.tint.painted, chip: chips.find(c => c.room === id)?.text ?? null, calm: chips.filter(c => c.tone === 'ok' || c.tone === 'busy' || c.tone === 'rest').length,
    };
  }, lab.id);
  const r1 = await rows();
  const shown = r1.find(r => r.key === `r:${lab.id}`);
  if (s1.row?.level === 'bad' && s1.row.what === 'не работает: нет лаборанта' && shown?.text === 'Лаборатория — не работает: нет лаборанта' && s1.painted >= 1 && s1.chip?.includes('нет лаборанта') && s1.calm === 0 && s1.menu === `Проблемы · ${s1.count}`)
    ok(`уволили и ночного: строка «${shown.text}», пол окрашен у ${s1.painted}, значок «${s1.chip}», спокойных значков нет; в меню — «${s1.menu}»`);
  else fail(`лаборатория без лаборанта: ${JSON.stringify({ s1, r1 })}`);

  // ---------------------------------------------------------------- щелчок по строке — камера к лаборатории и её карточка
  await page.evaluate(() => window.__game.actions.overview());
  await page.waitForFunction(() => !window.__game.stage.cam.flying, null, { timeout: 10000 }).catch(() => {});
  await frames();
  const far = await page.evaluate(([x, z]) => Math.hypot(window.__game.stage.cam.target.x - x, window.__game.stage.cam.target.z - z), [lab.x, lab.z]);
  await page.click(`#problems .prow[data-key="r:${lab.id}"]`);
  await until(([x, z]) => {
    const c = window.__game.stage.cam;
    return !c.flying && Math.hypot(c.target.x - x, c.target.z - z) < 1.5;
  }, [lab.x, lab.z], 20000).catch(() => {});
  await page.waitForSelector('#card-title', { timeout: 10000 }).catch(() => {});
  const near = await page.evaluate(([x, z]) => Math.hypot(window.__game.stage.cam.target.x - x, window.__game.stage.cam.target.z - z), [lab.x, lab.z]);
  const card = flat(await page.textContent('#card-title').catch(() => ''));
  const sel = await page.evaluate(() => window.__game.selectedRoom ?? null);
  if (far > 3 && near < 1.5 && sel === lab.id && card === 'Лаборатория') ok(`щелчок по строке: камера к лаборатории (${far.toFixed(1)} → ${near.toFixed(2)} м), карточка «${card}»`);
  else fail(`щелчок по строке: ${JSON.stringify({ far, near, sel, card })}`);
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__game.actions.overview());
  await page.waitForFunction(() => !window.__game.stage.cam.flying, null, { timeout: 10000 }).catch(() => {});
  await frames();
  const kb = await shot('e2e-problems-1.jpg');

  // ---------------------------------------------------------------- L по кругу
  const layersNow = () =>
    page.evaluate(() => {
      const l = window.__game.store.get().layers;
      return `${l.queues ? 'q' : '-'}${l.depts ? 'd' : '-'}${l.paths ? 'w' : '-'}${l.problems ? 'p' : '-'}`;
    });
  const seq = [];
  for (let k = 0; k < 5; k++) {
    await page.keyboard.press('KeyL');
    seq.push(await layersNow());
  }
  if (seq.join(' ') === '---- q--- -d-- --w- ---p') ok(`L по кругу: ${seq.join(' → ')} (снимок ${kb} КБ)`);
  else fail(`L по кругу: ${seq.join(' → ')}`);
}
