// Лист сравнения моделей Blender группы (docs/specs/2026-11-blender-2.md, «Критерии готовности группы»): Chromium без окна
// открывает dist/ — поликлинику, 11:00, без пациентов — и снимает крупно каждое помещение группы дважды: с моделями кодом и
// CC0 (`models=code`) и с моделями Blender (по умолчанию). Снимки — в tools/app/out/sheet/, лист — одна картинка: слева «было»,
// справа «стало», по строке на помещение.
//
// `--light` — свет группы: слева без запечённого света (`baked=0`), справа с ним.
//
//   npm run build && node tools/app/blender-sheet.mjs [--group 1] [--light] [--out docs/reports/2026-11-blender-1] [--q high] [--port 8097]
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findChromium } from './e2e-lib.mjs';
import { serve } from './serve.mjs';

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const group = Number(arg('group', '1'));
const out = arg('out', new URL('./out/sheet/', import.meta.url).pathname);
const q = arg('q', 'high');
const port = Number(arg('port', '8097'));
const light = process.argv.includes('--light');
/** Два вида: ключ страницы и подпись; второй — то, что в игре по умолчанию. */
const MODES = light
  ? [{ key: 'baked=0', name: 'nolight', title: 'без запечённого света (?baked=0)' }, { key: '', name: 'light', title: `запечённый свет, группа ${group}` }]
  : [{ key: 'models=code', name: 'code', title: 'модели кодом и CC0 (?models=code)' }, { key: '', name: 'blender', title: `Blender, группа ${group}` }];
mkdirSync(out, { recursive: true });

/** Помещения группы и где их снимать: поликлиника (сценарий 1) или город. */
const ROOMS = {
  1: { hospital: 'poly', types: ['room.reception', 'room.waiting', 'room.office', 'room.triage', 'room.procedure', 'room.lab', 'room.ecg', 'room.toilet', 'room.staff'] },
}[group];
if (!ROOMS) throw new Error(`нет группы ${group}`);

const server = await serve(port);
const browser = await chromium.launch({ executablePath: findChromium(), headless: true, args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => {
  if (m.type() === 'error') errors.push(m.text());
});
const frames = (n = 4) =>
  page.evaluate(
    k =>
      new Promise(r => {
        let i = 0;
        const f = () => (++i >= k ? r() : requestAnimationFrame(f));
        requestAnimationFrame(f);
      }),
    n,
  );

const shots = [];
try {
  for (const mode of MODES) {
    await page.goto(`http://127.0.0.1:${port}/index.html?q=${q}&lang=ru&hospital=${ROOMS.hospital}&flow=0,0&start=11${mode.key ? `&${mode.key}` : ''}`);
    await page.waitForFunction(() => window.__started === true, null, { timeout: 300000 });
    await page.evaluate(() => window.__game.actions.doctor({ kind: 'fold', folded: true }));
    // только сцена: панели окна закрывают помещение
    await page.evaluate(() => {
      const ui = document.getElementById('ui');
      if (ui) ui.style.visibility = 'hidden';
    });
    for (const type of ROOMS.types) {
      const room = await page.evaluate(t => {
        const r = window.__game.plan.rooms.find(x => x.type === t);
        return r ? { x: r.x + r.w / 2, z: r.y + r.h / 2, half: Math.max(r.w, r.h) * 0.3 + 0.4 } : null;
      }, type);
      if (!room) {
        console.log(`✗ ${type}: нет в больнице`);
        continue;
      }
      await page.evaluate(([x, z, h]) => {
        const c = window.__game.stage.cam;
        c.target.set(x, 0, z);
        c.half = h;
      }, [room.x, room.z, room.half]);
      await frames(6);
      const name = `${type.replace('room.', '')}-${mode.name}.jpg`;
      await page.screenshot({ path: join(out, name), type: 'jpeg', quality: 80 });
      shots.push({ type, mode: mode.name, name });
    }
  }
  // лист: слева «было» (модели кодом и CC0), справа «стало» (Blender)
  const rows = ROOMS.types.filter(t => shots.some(s => s.type === t));
  const img = n => `data:image/jpeg;base64,${readFileSync(join(out, n)).toString('base64')}`;
  const html = `<html><body style="margin:0;background:#1d2327;color:#e8eef0;font:14px sans-serif">
    <div style="display:grid;grid-template-columns:auto 480px 480px;gap:4px;padding:6px">
      <div></div><div style="text-align:center">${MODES[0].title}</div><div style="text-align:center">${MODES[1].title}</div>
      ${rows
        .map(t => `<div style="writing-mode:vertical-rl;transform:rotate(180deg);text-align:center">${t.replace('room.', '')}</div>
        <img src="${img(`${t.replace('room.', '')}-${MODES[0].name}.jpg`)}" style="width:480px"><img src="${img(`${t.replace('room.', '')}-${MODES[1].name}.jpg`)}" style="width:480px">`)
        .join('')}
    </div></body></html>`;
  const sheet = await browser.newPage({ viewport: { width: 1000, height: 400 } });
  await sheet.setContent(html);
  await sheet.screenshot({ path: join(out, light ? 'sheet-light.jpg' : 'sheet.jpg'), type: 'jpeg', quality: 72, fullPage: true });
  console.log(`✓ лист: ${join(out, light ? 'sheet-light.jpg' : 'sheet.jpg')} — ${rows.length} помещений`);
  console.log(errors.length ? `✗ ошибки в консоли: ${errors.slice(0, 5).join(' | ')}` : '✓ ошибок в консоли нет');
} finally {
  await browser.close();
  server.close();
}
