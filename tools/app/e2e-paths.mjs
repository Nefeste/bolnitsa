// Сценарий в браузере, часть 31 — слой «Пути пациентов» (spec docs/specs/2026-10-layers.md, часть 2, «Проверки»; часть 30 —
// у слоя «Проблемы»). Городская больница с 12:00: «Пути пациентов» в меню «Слои» — пол коридоров окрашен, список справа
// внизу по метрам за сутки, у каждого перехода есть путь по клеткам; щелчок по строке — на полу только он и камера к его
// середине, ещё раз — снова все; сцену пересобрали — пол тот же; час игры — переходов больше; выключили — пол без цвета;
// L — по кругу: «Очереди», «Отделения», «Пути пациентов», «Проблемы», выключены. Снимок — `e2e-paths-1.jpg`.
import { join } from 'node:path';

/** @param {{ page: import('playwright-core').Page, port: number, out: string, ok: (m: string) => void, fail: (m: string) => void, q: string, shots: string }} x */
export async function pathsPart({ page, port, out, ok, fail, q, shots }) {
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
  const frames = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  /** Строки списка: ключ, сколько раз, метров, текст, выбрана ли. */
  const rows = () =>
    page.$$eval('#paths .lrow', els =>
      els.map(e => ({ key: e.dataset.key ?? '', n: Number(e.dataset.n), m: Number(e.dataset.m), on: e.classList.contains('on'), text: (e.textContent ?? '').replace(/[\s  ]+/g, ' ').trim() })),
    );
  /** Что сейчас на полу и в списке. */
  const state = () =>
    page.evaluate(() => {
      const g = window.__game;
      const h = g.store.get();
      const routes = g.legRoutes;
      const legs = g.legs;
      return {
        on: h.layers.paths, others: [h.layers.queues, h.layers.depts, h.layers.problems].filter(Boolean).length, painted: g.stage.heat.painted, sel: h.paths.sel,
        total: h.paths.total, meters: h.paths.meters, legs: legs.length, routed: legs.filter(l => routes.get(`${l.from}>${l.to}`)).length,
        panel: !!document.getElementById('paths-panel'), legend: !!document.getElementById('dept-legend-panel'), problems: !!document.getElementById('problems-panel'),
      };
    });

  await page.goto(`http://127.0.0.1:${port}/index.html?q=${q}&lang=ru&hospital=preset&seed=3&flow=12,1&start=12`);
  await page.waitForFunction(() => window.__started === true, null, { timeout: 180000 });
  await page.evaluate(() => window.__game.actions.doctor({ kind: 'autopause', on: false }));
  await page.evaluate(() => window.__game.setSpeed(0));

  // ---------------------------------------------------------------- «Пути пациентов» в меню «Слои»
  await page.click('#layers');
  await page.click('#layer-paths');
  await until(() => window.__game.store.get().paths.rows.length > 0, null, 20000).catch(() => {});
  await frames();
  const s0 = await state();
  const r0 = await rows();
  const kinds = await page.evaluate(() => {
    const g = window.__game;
    const reception = g.plan.rooms.find(r => r.type === 'room.reception')?.id;
    const legs = g.legs;
    return {
      street: legs.find(l => l.from === '' && l.to === reception)?.n ?? 0,
      exam: legs.filter(l => l.walked > 0).length, ambulance: legs.filter(l => l.from === '*').reduce((n, l) => n + l.n, 0), out: legs.filter(l => l.to === '').reduce((n, l) => n + l.n, 0),
    };
  });
  const sorted = r0.every((r, i) => i === 0 || r0[i - 1].m >= r.m);
  if (s0.on && s0.others === 0 && s0.panel && !s0.legend && !s0.problems && s0.painted > 50 && r0.length > 0 && r0.length <= 6 && sorted && s0.routed === s0.legs && r0.every(r => / → .+ — \d+ раз(а)? по \d+ м/.test(r.text)))
    ok(`«Пути пациентов»: пол окрашен у ${s0.painted} клеток, переходов ${s0.total} (${s0.legs} пар, у всех есть путь), пройдено ${s0.meters} м; сверху — ${r0[0].text}`);
  else fail(`слой «Пути пациентов»: ${JSON.stringify({ s0, r0 })}`);
  if (kinds.street > 0 && kinds.exam > 0 && kinds.out > 0 && kinds.ambulance > 0)
    ok(`переходы: с улицы в регистратуру ${kinds.street}, к обследованию и обратно со временем в пути — ${kinds.exam} пар, к выходу ${kinds.out}, от входа для скорой ${kinds.ambulance}`);
  else fail(`переходы по видам: ${JSON.stringify(kinds)}`);

  // ---------------------------------------------------------------- щелчок по строке — только этот путь, камера к нему
  await page.evaluate(() => window.__game.actions.overview());
  await page.waitForFunction(() => !window.__game.stage.cam.flying, null, { timeout: 10000 }).catch(() => {});
  const pick = r0[0];
  await page.click(`#paths .lrow[data-key="${pick?.key}"]`);
  await until(() => !window.__game.stage.cam.flying && window.__game.store.get().paths.sel !== null, null, 20000).catch(() => {});
  await frames();
  const s1 = await state();
  const one = await page.evaluate(key => {
    const g = window.__game;
    const cells = g.legRoutes.get(key);
    if (!cells) return null;
    const c = cells[cells.length >> 1];
    const x = (c % g.layout.w) + 0.5;
    const z = Math.floor(c / g.layout.w) + 0.5;
    return { cells: cells.length, near: Math.hypot(g.stage.cam.target.x - x, g.stage.cam.target.z - z) };
  }, pick?.key);
  const r1 = await rows();
  if (s1.sel === pick?.key && one && s1.painted === one.cells && one.near < 1.5 && r1.find(r => r.key === pick.key)?.on && r1.filter(r => r.on).length === 1)
    ok(`щелчок по «${pick.text}»: на полу только он — ${s1.painted} клеток (было ${s0.painted}), строка подсвечена, камера у середины пути (${one.near.toFixed(2)} м)`);
  else fail(`щелчок по строке: ${JSON.stringify({ s1, one, pick, r1 })}`);
  await page.click(`#paths .lrow[data-key="${pick?.key}"]`);
  await frames();
  const s2 = await state();
  if (s2.sel === null && s2.painted === s0.painted) ok(`ещё раз — снова все: ${s2.painted} клеток`);
  else fail(`повторный щелчок: ${JSON.stringify(s2)}`);
  // сцену пересобрали (стройка), а переходы те же — поток их не пришлёт: пол перекрашивает окно, пути — по новому плану
  await page.evaluate(() => window.__game.setWorld(false));
  await frames();
  const s2b = await state();
  if (s2b.on && s2b.painted === s0.painted && s2b.routed === s2b.legs) ok(`сцена пересобрана, переходы те же — пол тот же: ${s2b.painted} клеток`);
  else fail(`пересборка сцены: ${JSON.stringify({ s0, s2b })}`);
  // снимок: окно врача свёрнуто — карта видна; фокус со строки снят
  await page.evaluate(() => {
    window.__game.actions.doctor({ kind: 'fold', folded: true });
    document.activeElement?.blur?.();
    window.__game.actions.overview();
  });
  await page.waitForFunction(() => !window.__game.stage.cam.flying, null, { timeout: 10000 }).catch(() => {});
  await frames();
  const kb = await shot('e2e-paths-1.jpg');

  // ---------------------------------------------------------------- час игры — переходов больше
  const t0 = await page.evaluate(() => window.__game.t);
  await page.evaluate(
    end =>
      new Promise(resolve => {
        const g = window.__game;
        g.manual = true;
        g.onFrame = () => {
          if (g.t >= end) {
            g.onFrame = null;
            g.manual = false;
            resolve();
            return;
          }
          const lag = g.lastSlice?.lag ?? 0;
          g.client.frame(!g.client.busy && lag < 600 ? 600 : 0, 40);
        };
      }),
    t0 + 3600,
  );
  await until(n => window.__game.store.get().paths.total > n, s0.total, 20000).catch(() => {});
  const s3 = await state();
  if (s3.total > s0.total && s3.painted >= s0.painted) ok(`через час игры: переходов ${s0.total} → ${s3.total}, окрашено ${s3.painted} клеток`);
  else fail(`через час: ${JSON.stringify({ s0, s3 })}`);

  // ---------------------------------------------------------------- выключили — пол без цвета; L по кругу
  await page.click('#layer-paths');
  await frames();
  const s4 = await state();
  if (!s4.on && s4.painted === 0 && !s4.panel) ok('выключили: пол без цвета, списка нет');
  else fail(`выключили: ${JSON.stringify(s4)}`);
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
  if (seq.join(' ') === 'q--- -d-- --w- ---p ----') ok(`L по кругу: ${seq.join(' → ')} (снимок ${kb} КБ)`);
  else fail(`L по кругу: ${seq.join(' → ')}`);
}
