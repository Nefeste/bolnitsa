// Долгий прогон в браузере — к воротам среза (docs/specs/2026-10-v1.md: «3–5 человек со стороны играют час без
// подсказок»): готовая больница идёт подряд несколько игровых суток на ×12 — приходят и уходят больные, пересменки,
// планёрки, обходы, — а игрок только закрывает планёрку утром. Раз в игровой час — память окна после сборки мусора, узлы
// страницы, люди на сцене и сколько имён окно о них помнит, отставание потока расчёта и кадр; раз в шесть игровых часов —
// размер снимка движка. Итог — tools/app/out/soak.json и таблица по суткам; провал — ошибка в консоли, упавшая страница,
// вставшие часы, память окна, которая со вторых суток растёт быстрее `GROW` в сутки, или имён больше, чем людей на сцене.
// Сценарий и пустое здание без стройки стоят — их здесь нет.
//   node tools/app/soak.mjs [--days 3] [--start city|poly] [--q low] [--seed 3] [--port 8095] [--headed]
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { findChromium } from './e2e-lib.mjs';
import { serve } from './serve.mjs';

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const flag = k => process.argv.includes(`--${k}`);
const days = Number(arg('days', 3));
const start = arg('start', 'city');
const q = arg('q', 'low');
const seed = Number(arg('seed', 3));
const port = Number(arg('port', 8095));
const out = new URL('./out/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });

/** Память окна со вторых суток растёт не быстрее, МБ за игровые сутки: первые — разгон (люди, тексты, кэши). */
const GROW = 8;
/** Часы стоят дольше стольких настоящих секунд (не планёрка) — провал. */
const STALL = 120;
/** Имён в окне может быть больше, чем пациентов на сцене, на столько: дошли до выхода, а срез ещё не пришёл. */
const SLACK = 10;
const HOUR = 3600;
const DAY = 86400;
const KEYS = { city: 'hospital=preset', poly: 'hospital=poly' };
if (!KEYS[start]) throw new Error(`--start: ${Object.keys(KEYS).join(' | ')}`);

const server = await serve(port);
const browser = await chromium.launch({
  executablePath: findChromium(),
  headless: !flag('headed'),
  args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--js-flags=--expose-gc', '--enable-precise-memory-info'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', m => {
  if (m.type() === 'error') errors.push(m.text().slice(0, 300));
});
page.on('pageerror', e => errors.push(e.message.slice(0, 300)));
let crashed = false;
page.on('crash', () => (crashed = true));
const mb = b => Math.round((b / 1048576) * 10) / 10;
const clock = t => `${Math.floor(t / DAY) + 1}·${String(Math.floor((t % DAY) / HOUR)).padStart(2, '0')}:00`;

/** Замер: память окна после сборки мусора, узлы, люди, отставание потока, кадров в секунду за полсекунды. */
const sample = () =>
  page.evaluate(async () => {
    const g = window.__game;
    window.gc?.();
    await new Promise(r => setTimeout(r, 50));
    const t0 = performance.now();
    let n = 0;
    await new Promise(r => {
      const f = () => {
        n++;
        if (performance.now() - t0 < 500) requestAnimationFrame(f);
        else r();
      };
      requestAnimationFrame(f);
    });
    return {
      t: g.t,
      heap: performance.memory ? performance.memory.usedJSHeapSize : 0,
      nodes: document.getElementsByTagName('*').length,
      walkers: g.crowd.walkers.size,
      // пациенты и фельдшеры на сцене — и сколько имён окно помнит: имя нужно, пока человек на сцене (строки пришедших для
      // «Ушли» — отдельно, последние 2000)
      people: [...g.crowd.walkers.keys()].filter(k => k.startsWith('p:') || k.startsWith('m:')).length,
      names: g.pop.names.size,
      rows: g.pop.rows.size,
      lag: Math.round(g.lastSlice?.lag ?? 0),
      fps: Math.round((n / ((performance.now() - t0) / 1000)) * 10) / 10,
    };
  });
/** Размер снимка движка (JSON), КБ: то, что держит поток расчёта и пишет сохранение. */
const stateKb = () => page.evaluate(async () => Math.round(JSON.stringify(await window.__game.client.save()).length / 1024));

const began = Date.now();
await page.goto(`http://127.0.0.1:${port}/index.html?q=${q}&lang=ru&${KEYS[start]}&seed=${seed}`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
// игрок не отвечает на просьбы и решения: автопауза врача снята, часы ×12
await page.evaluate(() => {
  window.__game.actions.doctor({ kind: 'autopause', on: false });
  window.__game.setSpeed(12);
});
const first = await sample();
const t0 = first.t;
const end = t0 + days * DAY;
let nextHour = Math.floor(t0 / HOUR) * HOUR + HOUR;
const rows = [first];
const states = [{ t: t0, kb: await stateKb() }];
let meetings = 0;
let still = 0;
let lastT = t0;
console.log(`→ ${start}, зерно ${seed}, ${days} сут. на ×12 с ${clock(t0)}`);
while (!crashed) {
  await page.waitForTimeout(2000);
  let st;
  try {
    st = await page.evaluate(() => ({ t: window.__game.t, meeting: window.__game.store.get().economy?.open === true, speed: window.__game.speed }));
  } catch (e) {
    errors.push(`страница не отвечает: ${String(e).slice(0, 200)}`);
    break;
  }
  // планёрка в 08:00 — прочитали и закрыли; часы снова ×12
  if (st.meeting) {
    meetings++;
    await page.evaluate(() => {
      window.__game.actions.money({ kind: 'close' });
      window.__game.setSpeed(12);
    });
    still = 0;
    continue;
  }
  if (st.speed !== 12) await page.evaluate(() => window.__game.setSpeed(12));
  if (st.t === lastT) {
    still += 2;
    if (still > STALL) {
      errors.push(`часы встали на ${clock(st.t)}`);
      break;
    }
  } else {
    still = 0;
    lastT = st.t;
  }
  if (st.t >= nextHour) {
    const s = await sample();
    rows.push(s);
    nextHour = Math.floor(s.t / HOUR) * HOUR + HOUR;
    if (Math.floor(s.t / HOUR) % 6 === 0) states.push({ t: s.t, kb: await stateKb() });
    if (Math.floor(s.t / HOUR) % 6 === 0) console.log(`  ${clock(s.t)}: память ${mb(s.heap)} МБ, узлов ${s.nodes}, людей ${s.walkers}, имён ${s.names}, отставание ${s.lag} с, ${s.fps} к/с, снимок ${states.at(-1).kb} КБ`);
  }
  if (st.t >= end) break;
}

// по суткам: память в конце суток, рост за сутки, наибольшие узлы, люди и отставание, худший кадр
const byDay = [];
for (let d = 0; d < days; d++) {
  const from = t0 + d * DAY;
  const day = rows.filter(r => r.t > from && r.t <= from + DAY);
  if (!day.length) break;
  const lastRow = day[day.length - 1];
  const prev = d === 0 ? first : byDay[d - 1].last;
  byDay.push({
    day: d + 1,
    heapMb: mb(lastRow.heap),
    growMb: mb(lastRow.heap - prev.heap),
    nodes: Math.max(...day.map(r => r.nodes)),
    walkers: Math.max(...day.map(r => r.walkers)),
    names: Math.max(...day.map(r => r.names)),
    rows: day[day.length - 1].rows,
    lagMax: Math.max(...day.map(r => r.lag)),
    fpsMin: Math.min(...day.map(r => r.fps)),
    stateKb: states.filter(s => s.t > from && s.t <= from + DAY).at(-1)?.kb ?? null,
    last: lastRow,
  });
}
const done = byDay.length === days && rows.at(-1).t >= end - HOUR;
const grows = byDay.slice(1).map(d => d.growMb);
const leak = grows.some(g => g > GROW);
// окно помнит имён больше, чем людей на сцене, — копит ушедших (`SLACK` — дошедшие до выхода между срезами)
const forgets = rows.filter(r => r.names > r.people + SLACK).length;
const ok = done && !crashed && errors.length === 0 && !leak && forgets === 0;
const result = {
  start, seed, days, q, ok, done, crashed, errors: errors.slice(0, 20), meetings, minutes: Math.round((Date.now() - began) / 60000),
  growLimitMb: GROW, forgets, byDay: byDay.map(({ last, ...d }) => d), states,
};
writeFileSync(join(out, 'soak.json'), JSON.stringify(result, null, 1));
console.log('сутки | память, МБ | за сутки | узлов | людей | имён | строк | отставание, с | худший кадр, к/с | снимок, КБ');
for (const d of byDay) console.log(`${d.day} | ${d.heapMb} | ${d.growMb > 0 ? '+' : ''}${d.growMb} | ${d.nodes} | ${d.walkers} | ${d.names} | ${d.rows} | ${d.lagMax} | ${d.fpsMin} | ${d.stateKb ?? '—'}`);
console.log(`${ok ? '✓' : '✗'} ${start}: ${byDay.length} из ${days} сут., планёрок ${meetings}, ошибок ${errors.length}${crashed ? ', страница упала' : ''}${leak ? `, память растёт больше ${GROW} МБ за сутки` : ''}${forgets ? `, имён больше, чем людей, в ${forgets} замерах` : ''}; ${result.minutes} мин`);
for (const e of errors.slice(0, 5)) console.log(`  ✗ ${e}`);
await browser.close();
server.close();
process.exit(ok ? 0 : 1);
