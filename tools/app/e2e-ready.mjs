// Сценарий в браузере, часть 6 — готовые помещения (spec docs/specs/2026-10-ready-rooms.md, «Проверки»). Пустое здание:
// B — подсказка ведёт к готовому помещению; «Готовое помещение» — регистратура, зона ожидания M, ординаторская и кабинет
// врача щелчком, с персоналом: у каждого дверь, мебель и люди, больница открыта, запечённый свет лёг на все четыре. Палата:
// призрак с мебелью и ценой, R поворачивает дверь, щелчок ставит, Ctrl+Z убирает одним действием; над входом призрак
// красный с причиной; Esc снимает тип, ПКМ — инструмент. Часы идут — пациентов принимают. Снимки — `e2e-ready-*.jpg`
// (JPEG: для документов).
import { join } from 'node:path';

/** @param {{ page: import('playwright-core').Page, port: number, out: string, ok: (m: string) => void, fail: (m: string) => void, q: string, shots: string }} x */
export async function readyPart({ page, port, out, ok, fail, q, shots }) {
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
  // программный WebGL в «высоком» рисует кадр до секунды: камера и строка призрака догоняют не сразу — ждём их, а не время
  const frames = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const at = (x, y) => page.evaluate(([cx, cy]) => window.__game.stage.screenOfCell(cx, cy), [x, y]);
  const look = async (x, y, half = 10) => {
    await page.evaluate(([cx, cy, h]) => {
      const g = window.__game;
      g.stage.cam.target.set(cx, 0, cy);
      g.stage.cam.half = h;
    }, [x, y, half]);
    await frames();
  };
  const hint = () => page.evaluate(() => ({ key: document.getElementById('hint')?.dataset.key ?? '', text: document.getElementById('hint-text')?.textContent ?? '' }));
  /** Строка призрака на экране — та, что у стройки сейчас. */
  const settled = () => until(() => (document.getElementById('ghost')?.textContent ?? '') === (window.__game.builder.ghost?.text ?? ''));
  const ghost = async () => {
    await settled();
    return page.$eval('#ghost', el => ({ ok: el.classList.contains('ok'), text: el.textContent ?? '' })).catch(() => ({ ok: false, text: '' }));
  };
  const rooms = () => page.evaluate(() => window.__game.hospital.site.rooms.length);
  const roomOf = id => page.evaluate(i => {
    const r = window.__game.hospital.site.rooms.find(x => x.id === i);
    return r ? { type: r.type, x: r.x, y: r.y, w: r.w, h: r.h, items: r.items.length, door: r.door ?? [], staff: window.__game.staff.filter(m => m.room === i).map(m => m.role) } : null;
  }, id);
  /** Навести середину готового помещения на клетку и дождаться призрака. */
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

  await page.goto(`http://127.0.0.1:${port}/index.html?q=${q}&lang=ru&hospital=empty`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  const h0 = await hint();
  await page.keyboard.press('KeyB');
  await page.waitForTimeout(250);
  const h1 = await hint();
  if (h0.key === 'build' && h0.text.includes('Готовое помещение') && h1.key === 'draw' && h1.text.includes('Готовое помещение')) ok(`подсказки ведут к готовому: «${h0.text}» → «${h1.text}»`);
  else fail(`подсказки: ${JSON.stringify([h0, h1])}`);
  await page.click('#tool-ready');
  const g0 = await ghost();
  if (g0.text.includes('тип и размер')) ok(`инструмент «Готовое помещение»: «${g0.text}»`);
  else fail(`строка инструмента: ${JSON.stringify(g0)}`);

  // четыре помещения вдоль северной стены — середины; стены соседей общие
  const FOUR = [
    ['reception', '', 9, 9, ['role.registrar']],
    ['waiting', 'M', 16, 9, []],
    ['staff', '', 22, 9, []],
    ['office', '', 28, 9, ['role.therapist']],
  ];
  await look(19, 10, 11);
  let first = '';
  for (const [type, size, x, y, roles] of FOUR) {
    await page.click(`#ready-${type}`);
    if (size) await page.click(`#size-${size}`);
    const p = await hover(x, y);
    const g = await ghost();
    if (!first) first = g.text;
    if (!g.ok) fail(`${type}: призрак красный — «${g.text}»`);
    const n = await rooms();
    await page.mouse.click(p.x, p.y);
    await until(k => window.__game.hospital.site.rooms.length === k + 1, n);
    const id = await page.evaluate(() => window.__game.hospital.site.rooms.at(-1).id);
    await until(([rid, k]) => window.__game.staff.filter(m => m.room === rid).length === k, [id, roles.length]);
    const r = await roomOf(id);
    if (r && r.items > 0 && r.door.length > 0 && JSON.stringify(r.staff) === JSON.stringify(roles)) ok(`${type}${size ? ` ${size}` : ''}: щелчок — ${r.w} × ${r.h}, дверь в ${r.door.length} кл., ${r.items} предм., люди: ${r.staff.length}`);
    else fail(`${type}: ${JSON.stringify(r)}`);
  }
  if (/Регистратура S, 6 × 7 — [\d\s  ]+₽ · регистратор — [\d\s  ]+₽ в сутки/.test(first)) ok(`строка призрака: «${first}»`);
  else fail(`строка призрака: «${first}»`);
  const result = await page.textContent('#result').catch(() => '');
  if (result?.includes('нанято: 1')) ok(`итог щелчка: «${result}»`);
  else fail(`итог щелчка: «${result}»`);
  await until(() => !document.getElementById('closed'));
  ok('четыре готовых помещения: больница открыта');
  // запечённый свет группы 1 (docs/specs/2026-11-blender-2.md): у всех четырёх есть образец — свет лёг на каждое, и на
  // зал ожидания M тоже (в плане стройки у него размер «S»)
  const baked = await page.evaluate(() => window.__game.baked);
  if (baked === 4) ok('запечённый свет лёг на все четыре готовых помещения');
  else fail(`запечённый свет — на ${baked} помещений из четырёх`);

  // палата: призрак с мебелью, R поворачивает дверь, щелчок, Ctrl+Z — одним действием
  await page.click('#ready-ward');
  await look(14, 22, 9);
  const wp = await hover(14, 22);
  const before = await page.evaluate(() => ({ rot: window.__game.builder.rot, ghost: window.__game.ghosts.group.children.map(c => c.children.length) }));
  await page.keyboard.press('KeyR');
  await settled();
  const after = await page.evaluate(() => ({ rot: window.__game.builder.rot, turned: window.__game.builder.turned }));
  const gw = await ghost();
  const kb = await shot('e2e-ready-1.jpg');
  if (after.rot === (before.rot + 1) % 4 && after.turned && gw.ok && /Палата S, 7 × 7 — [\d\s  ]+₽ · медсестра/.test(gw.text)) ok(`R: поворот ${before.rot} → ${after.rot}, «${gw.text}» (снимок ${kb} КБ)`);
  else fail(`R: ${JSON.stringify({ before, after, gw })}`);
  const n4 = await rooms();
  const staff4 = await page.evaluate(() => window.__game.staff.length);
  await page.mouse.click(wp.x, wp.y);
  await until(k => window.__game.hospital.site.rooms.length === k + 1, n4);
  const wid = await page.evaluate(() => window.__game.hospital.site.rooms.at(-1).id);
  const ward = await roomOf(wid);
  // дверь — на стене по повороту: 0 — нижняя, 1 — левая, 2 — верхняя, 3 — правая
  const sideOk = ward && ward.door.length === 2 && ward.door.every(([x, y]) => [y === ward.y + ward.h - 1, x === ward.x, y === ward.y, x === ward.x + ward.w - 1][after.rot]);
  if (sideOk) ok(`палата: двойная дверь на стене поворота ${after.rot}, ${ward.items} предм.`);
  else fail(`палата: ${JSON.stringify(ward)}, поворот ${after.rot}`);
  await page.keyboard.press('Control+KeyZ');
  await until(k => window.__game.hospital.site.rooms.length === k, n4);
  const staffBack = await page.evaluate(() => window.__game.staff.length);
  if (staffBack === staff4) ok('Ctrl+Z убрал палату с медсестрой одним действием');
  else fail(`Ctrl+Z: людей ${staffBack}, было ${staff4}`);

  // над главным входом — красный с причиной; Esc снимает тип, ПКМ — инструмент
  await page.click('#ready-reception');
  await look(29, 28, 9);
  await hover(29, 31);
  const gb = await ghost();
  if (!gb.ok && /мешает вход|за стенами/.test(gb.text)) ok(`над входом: «${gb.text}»`);
  else fail(`над входом: ${JSON.stringify(gb)}`);
  await page.keyboard.press('Escape');
  const t1 = await page.evaluate(() => ({ ready: window.__game.builder.ready ?? null, tool: window.__game.builder.tool ?? null }));
  const ep = await at(29, 28);
  await page.mouse.click(ep.x, ep.y, { button: 'right' });
  const t2 = await page.evaluate(() => window.__game.builder.tool ?? null);
  if (t1.ready === null && t1.tool === 'ready' && t2 === null) ok('Esc снял тип, ПКМ — инструмент');
  else fail(`Esc / ПКМ: ${JSON.stringify({ t1, t2 })}`);

  // выйти из стройки, часы ×12 — пациентов принимают
  await page.keyboard.press('KeyB');
  await page.keyboard.press('Digit3');
  await look(19, 12, 12);
  await until(() => window.__game.store.get().seen > 0, null, 120000);
  const c = await page.evaluate(() => {
    const h = window.__game.store.get();
    return { arrived: h.arrived, seen: h.seen, clock: document.getElementById('clock')?.textContent };
  });
  const kb2 = await shot('e2e-ready-2.jpg');
  ok(`пациенты пришли и приняты: ${JSON.stringify(c)} (снимок ${kb2} КБ)`);
}
