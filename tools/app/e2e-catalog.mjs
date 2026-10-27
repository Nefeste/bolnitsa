// Сценарий в браузере, часть 29 — каталог стройки по отделениям (spec docs/specs/2026-10-catalog.md, «Проверки»). Пустое
// здание, стройка: «Готовое помещение» — заголовки групп по порядку (отделения по записи, «Диагностика», «Общие»), в группе
// — по алфавиту, у каждой строки — миниатюра образца: PNG, не однотонная (пол, стены и мебель); у выбранного помещения с
// несколькими образцами миниатюра — того, что выбран; «Помещение» — те же группы. Время сборки одной миниатюры в окне —
// в журнал. Снимок — `e2e-catalog-1.jpg`.
import { join } from 'node:path';

/** @param {{ page: import('playwright-core').Page, port: number, out: string, ok: (m: string) => void, fail: (m: string) => void, q: string, shots: string }} x */
export async function catalogPart({ page, port, out, ok, fail, q, shots }) {
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
  /** Список каталога: заголовки групп и строки под ними — по порядку на экране. */
  const listOf = sel =>
    page.$$eval(`${sel} > li`, els => {
      const out = [];
      for (const e of els) {
        if (e.classList.contains('ghead')) out.push({ group: e.getAttribute('data-group') ?? '', rows: [] });
        else if (out.length) out[out.length - 1].rows.push({ id: e.querySelector('button')?.id ?? '', name: e.querySelector('button > span')?.textContent ?? '', src: e.querySelector('img.thumb')?.getAttribute('src') ?? '' });
      }
      return out;
    });
  /** Группы — по порядку каталога (`catalogGroups`), в группе — по алфавиту. */
  const ordered = async list => {
    const order = await page.evaluate(() => window.__game.store.get().catalogGroups.map(g => g.id));
    const idx = list.map(g => order.indexOf(g.group));
    const groups = idx.every((n, i) => n >= 0 && (i === 0 || n > idx[i - 1]));
    const sorted = list.every(g => g.rows.map(r => r.name).join('|') === [...g.rows.map(r => r.name)].sort((a, b) => a.localeCompare(b, 'ru')).join('|'));
    return groups && sorted;
  };
  /** Пиксели миниатюры: сколько разных цветов (по 4 бита на канал) и разброс яркости. */
  const pixels = src =>
    page.evaluate(
      s =>
        new Promise(res => {
          const img = new Image();
          img.onload = () => {
            const c = document.createElement('canvas');
            c.width = img.width;
            c.height = img.height;
            const g = c.getContext('2d');
            g.drawImage(img, 0, 0);
            const d = g.getImageData(0, 0, c.width, c.height).data;
            const seen = new Set();
            let sum = 0;
            let sum2 = 0;
            const n = d.length / 4;
            for (let i = 0; i < d.length; i += 4) {
              seen.add(((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4));
              const y = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
              sum += y;
              sum2 += y * y;
            }
            res({ w: img.width, h: img.height, colors: seen.size, sd: Math.sqrt(Math.max(0, sum2 / n - (sum / n) ** 2)) });
          };
          img.onerror = () => res(null);
          img.src = s;
        }),
      src,
    );

  await page.goto(`http://127.0.0.1:${port}/index.html?q=${q}&lang=ru&hospital=empty`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  await page.keyboard.press('KeyB');
  await page.click('#tool-ready');
  await page.waitForSelector('#ready-types', { timeout: 5000 });

  // ---------------------------------------------------------------- группы и миниатюры «Готового помещения»
  const rows = await page.evaluate(() => window.__game.store.get().readyTypes.length);
  // по одной за раз: все — за несколько кадров; на программном WebGL — с запасом
  await until(n => document.querySelectorAll('#ready-types img.thumb').length >= n, rows, 60000).catch(() => {});
  const list = await listOf('#ready-types');
  const all = list.flatMap(g => g.rows);
  const names = { 'dept.emergency': 'Приёмное отделение', 'dept.therapy': 'Терапия', 'dept.surgery': 'Хирургия', 'dept.infectious': 'Инфекционное отделение', 'dept.icu': 'Реанимация', service: 'Диагностика', common: 'Общие' };
  const heads = await page.$$eval('#ready-types > li.ghead', els => els.map(e => (e.textContent ?? '').trim()));
  if (all.length === rows && (await ordered(list)) && heads.every((h, i) => h === names[list[i].group])) {
    ok(`«Готовое помещение» по группам: ${list.map(g => `${heads[list.indexOf(g)]} (${g.rows.length})`).join(', ')}; в группе — по алфавиту`);
  } else fail(`группы «Готового помещения»: ${JSON.stringify({ rows, heads, list: list.map(g => ({ g: g.group, r: g.rows.map(r => r.name) })) })}`);
  const stats = [];
  for (const r of all) stats.push({ id: r.id, ...(r.src.startsWith('blob:') ? await pixels(r.src) : { w: 0 }) });
  const flatOnes = stats.filter(s => !(s.w === 160 && s.h === 100 && s.colors >= 40 && s.sd >= 8));
  // сколько окно занято на миниатюру: образец, сборка сцены и кадр (без ожидания видеокарты и шейдеров)
  const ms = await page.evaluate(() => window.__game.thumbs.times.map(x => x.sample + x.build + x.frame));
  const med = [...ms].sort((a, b) => a - b)[Math.floor(ms.length / 2)] ?? 0;
  if (stats.length === rows && flatOnes.length === 0) {
    const c = stats.map(s => s.colors);
    ok(`миниатюры у всех ${stats.length} строк: 160 × 100, цветов от ${Math.min(...c)} до ${Math.max(...c)}; окно занято на миниатюру — ${med.toFixed(1)} мс (медиана), дольше всех — ${Math.max(...ms).toFixed(0)} мс (снимок ${await shot('e2e-catalog-1.jpg')} КБ)`);
  } else fail(`миниатюры: ${JSON.stringify(flatOnes.length ? flatOnes : stats)}`);

  // у выбранного с несколькими образцами — миниатюра выбранного образца
  const multi = await page.evaluate(() => window.__game.store.get().readyTypes.find(t => t.sizes.length > 1));
  if (multi) {
    const btn = `#ready-${multi.id.slice(5)}`;
    await page.click(btn);
    const last = multi.sizes[multi.sizes.length - 1].id;
    await page.click(`#size-${last}`);
    const key = `${multi.id}|${last}`;
    await until(k => !!window.__game.store.get().thumbs[k], key, 30000).catch(() => {});
    const src = await page.$eval(`${btn} img.thumb`, e => e.getAttribute('src') ?? '').catch(() => '');
    const want = await page.evaluate(k => window.__game.store.get().thumbs[k] ?? '', key);
    const first = await page.evaluate(k => window.__game.store.get().thumbs[k] ?? '', `${multi.id}|${multi.sizes[0].id}`);
    if (src && src === want && src !== first) ok(`${multi.name} ${last}: миниатюра — выбранного образца, не первого`);
    else fail(`миниатюра выбранного образца: ${JSON.stringify({ key, same: src === want, first: src === first })}`);
  }

  // ---------------------------------------------------------------- «Помещение»: те же группы
  await page.click('#tool-room');
  await page.waitForSelector('#room-types', { timeout: 5000 });
  const rooms = await listOf('#room-types');
  const types = await page.evaluate(() => window.__game.store.get().roomTypes.length);
  if (rooms.flatMap(g => g.rows).length === types && (await ordered(rooms))) ok(`«Помещение» по группам: ${rooms.map(g => `${g.group} (${g.rows.length})`).join(', ')}`);
  else fail(`группы «Помещения»: ${JSON.stringify(rooms.map(g => ({ g: g.group, r: g.rows.map(r => r.name) })))}`);
  await page.keyboard.press('Escape');
}
