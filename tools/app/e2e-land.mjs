// Сценарий в браузере, часть 16 — место под стройку у городской больницы (spec docs/specs/2026-10-city-land.md,
// «Проверки»). Городская больница: участок 78 × 40, восточное крыло — пол без помещений, коридоры открываются в него;
// «Готовое помещение» — палата в крыле с персоналом: щелчок — стоит, люди на местах, работает; Ctrl+Z убирает. Снимок —
// `e2e-land-1.jpg`.
import { join } from 'node:path';

/** @param {{ page: import('playwright-core').Page, port: number, out: string, ok: (m: string) => void, fail: (m: string) => void, q: string, shots: string }} x */
export async function landPart({ page, port, out, ok, fail, q, shots }) {
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
  const look = async (x, y, half = 10) => {
    await page.evaluate(([cx, cy, h]) => {
      const g = window.__game;
      g.stage.cam.target.set(cx, 0, cy);
      g.stage.cam.half = h;
    }, [x, y, half]);
    await frames();
  };
  const at = (x, y) => page.evaluate(([cx, cy]) => window.__game.stage.screenOfCell(cx, cy), [x, y]);
  const settled = () => until(() => (document.getElementById('ghost')?.textContent ?? '') === (window.__game.builder.ghost?.text ?? ''));
  const ghost = async () => {
    await settled();
    return page.$eval('#ghost', el => ({ ok: el.classList.contains('ok'), text: el.textContent ?? '' })).catch(() => ({ ok: false, text: '' }));
  };
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
  const rooms = () => page.evaluate(() => window.__game.hospital.site.rooms.length);

  await page.goto(`http://127.0.0.1:${port}/index.html?q=${q}&lang=ru&hospital=preset&seed=3&flow=6,1`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });

  // ---------------------------------------------------------------- участок шире, крыло — пол без помещений
  const lot = await page.evaluate(() => {
    const g = window.__game;
    const s = g.hospital.site;
    const free = [8, 18, 28].every(y => g.plan.grid.cells[y * g.plan.grid.w + 64] === 2);
    return { w: s.w, h: s.h, free, east: Math.max(...s.rooms.map(r => r.x + r.w)) };
  });
  if (lot.w === 78 && lot.h === 40 && lot.free && lot.east <= 56) ok(`участок ${lot.w} × ${lot.h}: восточное крыло — коридор, помещения кончаются на ${lot.east - 1}-й клетке`);
  else fail(`участок: ${JSON.stringify(lot)}`);

  // ---------------------------------------------------------------- палата в крыле: щелчок — стоит и работает
  await page.keyboard.press('KeyB');
  await page.click('#tool-ready');
  await page.click('#ready-ward');
  await look(64, 22, 11);
  const p = await hover(64, 22);
  const g = await ghost();
  if (g.ok && /^Палата S, 7 × 7 — /.test(g.text)) ok(`призрак в крыле: «${g.text}»`);
  else fail(`призрак в крыле: ${JSON.stringify(g)}`);
  const n = await rooms();
  await page.mouse.click(p.x, p.y);
  await until(k => window.__game.hospital.site.rooms.length === k + 1, n);
  const id = await page.evaluate(() => window.__game.hospital.site.rooms.at(-1).id);
  await page.keyboard.press('KeyB');
  await until(x => window.__game.working.has(x), id).catch(() => {});
  const ward = await page.evaluate(x => {
    const g = window.__game;
    const r = g.hospital.site.rooms.find(y => y.id === x);
    return { x: r.x, y: r.y, door: r.door ?? [], staff: g.staff.filter(m => m.room === x).length, working: g.working.has(x) };
  }, id);
  if (ward.x >= 52 && ward.door.length === 2 && ward.staff > 0 && ward.working) ok(`палата в крыле: ${ward.x}, ${ward.y}, двойная дверь, людей — ${ward.staff}, работает (снимок ${await shot('e2e-land-1.jpg')} КБ)`);
  else fail(`палата в крыле: ${JSON.stringify(ward)}`);

  // ---------------------------------------------------------------- Ctrl+Z — одним действием
  await page.keyboard.press('KeyB');
  await page.keyboard.press('Control+KeyZ');
  await until(k => window.__game.hospital.site.rooms.length === k, n);
  ok('Ctrl+Z убрал палату');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.keyboard.press('KeyB');
}
