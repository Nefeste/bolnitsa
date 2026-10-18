// Сценарий в браузере, часть 10 — сохранения (spec docs/specs/2026-10-saves.md, «Проверки»). Хранилище страницы — с нуля.
// Поликлиника: ×12 до 09:30, пауза — «Игра» → «Сохранить»: в списке «День 1 · 09:3x». Экран начала (адрес без больницы) —
// «Продолжить» с тем же днём и часом; продолжили — тот же час, касса, помещения и штат, часы на паузе; пустили — идут.
// «Загрузить» из меню — снова тот час. «Удалить» — ячейки нет. Испорченный файл — экран начала со словом «Не открыть».
// Снимки — `e2e-saves-*.jpg`.
import { join } from 'node:path';

/** @param {{ page: import('playwright-core').Page, port: number, out: string, ok: (m: string) => void, fail: (m: string) => void, q: string, shots: string }} x */
export async function savesPart({ page, port, out, ok, fail, q, shots }) {
  const until = (fn, a, ms = 30000) => page.waitForFunction(fn, a, { timeout: ms });
  // готово — первый кадр нарисован и пришёл первый срез потока расчёта: часы и касса — уже из сохранения
  const ready = () => page.waitForFunction(() => window.__ready === true && (window.__game?.day ?? 0) > 0, null, { timeout: 120000 });
  /** Снимок: JPEG, в качестве `--shots` (для документов) или как есть. */
  const shot = async name => {
    if (shots) {
      await page.evaluate(x => window.__game?.actions.setQuality(x), shots);
      await page.waitForTimeout(400);
    }
    const buf = await page.screenshot({ path: join(out, name), type: 'jpeg', quality: 72 });
    if (shots) await page.evaluate(x => window.__game?.actions.setQuality(x), q);
    return Math.round(buf.length / 1024);
  };
  const now = () =>
    page.evaluate(() => {
      const g = window.__game;
      const h = g.store.get();
      return { t: g.t, day: g.day, speed: g.speed, cash: h.cash, rooms: g.hospital.site.rooms.length, staff: g.staff.length, start: g.start };
    });
  const hhmm = t => `${String(Math.floor((t % 86400) / 3600)).padStart(2, '0')}:${String(Math.floor((t % 3600) / 60)).padStart(2, '0')}`;

  await page.goto(`http://127.0.0.1:${port}/index.html?q=${q}&lang=ru&hospital=poly`);
  await ready();
  // прошлые прогоны не мешают: хранилище страницы — с нуля
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    try {
      await root.removeEntry('saves', { recursive: true });
    } catch {}
  });
  await page.keyboard.press('Digit3');
  await until(() => window.__game.t >= 9.5 * 3600, null, 180000);
  await page.evaluate(() => window.__game.actions.setSpeed(0));
  await page.waitForTimeout(300);
  const before = await now();

  // «Игра» → «Сохранить»
  await page.click('#game-menu-open');
  await page.waitForSelector('#game-menu');
  await page.click('#save-new');
  await until(() => window.__game.store.get().menu.rows.some(r => r.meta?.kind === 'manual'));
  const rows = await page.evaluate(() => window.__game.store.get().menu.rows);
  const slot = rows[0].slot;
  await page.waitForSelector(`#save-${slot}`);
  const rowText = ((await page.textContent(`#save-${slot}`)) ?? '').replace(/\s+/g, ' ').trim();
  if (rows[0].meta.t === before.t && rowText.includes(`День ${before.day} · ${hhmm(before.t)}`) && rowText.includes('Поликлиника')) ok(`«Сохранить»: «${rowText}»`);
  else fail(`сохранение: ${JSON.stringify({ rows, rowText, before })}`);
  ok(`снимок: ${join(out, 'e2e-saves-1-menu.jpg')} (${await shot('e2e-saves-1-menu.jpg')} КБ)`);

  // экран начала: «Продолжить» — то же день и час; продолжили — та же больница, касса, часы на паузе
  await page.goto(`http://127.0.0.1:${port}/index.html?q=${q}&lang=ru`);
  await page.waitForSelector('#start-continue', { timeout: 60000 });
  const cont = ((await page.textContent('#start-continue')) ?? '').replace(/\s+/g, ' ').trim();
  ok(`снимок: ${join(out, 'e2e-saves-2-start.jpg')} (${await shot('e2e-saves-2-start.jpg')} КБ)`);
  await page.click('#start-continue');
  await ready();
  const after = await now();
  if (cont.includes(`День ${before.day} · ${hhmm(before.t)}`) && JSON.stringify({ ...after, speed: 0 }) === JSON.stringify({ ...before, speed: 0 }) && after.speed === 0)
    ok(`«Продолжить» («${cont}»): ${hhmm(after.t)}, касса ${after.cash}, помещений ${after.rooms}, штат ${after.staff} — как при сохранении; часы на паузе`);
  else fail(`продолжить: ${JSON.stringify({ cont, before, after })}`);
  await page.keyboard.press('Digit3');
  await until(t => window.__game.t > t + 600, after.t, 60000).then(
    () => ok('пустили — часы идут, больница живёт'),
    () => fail('после загрузки часы не идут'),
  );

  // «Загрузить» из меню — снова тот час
  await page.click('#game-menu-open');
  await page.waitForSelector(`#save-load-${slot}`);
  await page.click(`#save-load-${slot}`);
  await page.waitForURL(u => u.searchParams.get('load') === slot, { timeout: 30000 });
  await ready();
  const again = await now();
  if (again.t === before.t && again.cash === before.cash) ok(`«Загрузить» из меню: снова ${hhmm(again.t)}, касса ${again.cash}`);
  else fail(`загрузка из меню: ${JSON.stringify({ again, before })}`);

  // «Удалить» — ячейки нет
  await page.click('#game-menu-open');
  await page.waitForSelector(`#save-remove-${slot}`);
  await page.click(`#save-remove-${slot}`);
  await until(s => !window.__game.store.get().menu.rows.some(r => r.slot === s), slot);
  if (!(await page.$(`#save-${slot}`))) ok('«Удалить» — ячейки нет в списке');
  else fail('после «Удалить» ячейка осталась');

  // испорченный файл — экран начала со словом «Не открыть», игра не падает
  await page.evaluate(async () => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('saves', { create: true });
    const put = async (name, text) => {
      const w = await (await dir.getFileHandle(name, { create: true })).createWritable();
      await w.write(text);
      await w.close();
    };
    await put('manual-9.save', 'это не сохранение');
    await put('manual-9.meta.json', JSON.stringify({ kind: 'manual', savedAt: '2099-01-01T00:00:00.000Z', version: '0.7.0', start: 'poly', day: 1, t: 36000 }));
  });
  await page.goto(`http://127.0.0.1:${port}/index.html?q=${q}&lang=ru`);
  await page.waitForSelector('#start-continue', { timeout: 60000 });
  await page.click('#start-continue');
  const problem = await page.waitForSelector('#start-problem', { timeout: 30000 }).then(e => e.textContent(), () => '');
  if (problem?.includes('Не открыть')) ok(`испорченный файл: «${problem}» — снова экран начала`);
  else fail(`испорченный файл: «${problem}»`);
}
