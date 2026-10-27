// Сценарий в браузере (spec docs/specs/2026-10-shell-3d.md, «Тесты»; стройка — docs/specs/2026-10-build.md, «Тесты»):
// Chromium без окна (Playwright, браузер из PLAYWRIGHT_BROWSERS_PATH) открывает dist/.
// Часть 1 — готовая больница: страница грузится, больница видна, люди есть, клик по человеку открывает карточку, скорость
// меняется клавишами, стены переключаются. Часть 2 — пустое здание: мышью шесть помещений (регистратура, зона ожидания,
// кабинет врача, ординаторская, процедурный, лаборатория) — протяжкой, «Обставить», двери, найм; предмет — красный
// призрак на занятом, R, взять и переставить, снос, Ctrl+Z, Esc, ПКМ; двойная дверь палаты; часы идут — пациенты
// приходят, их принимают. Часть 3 — люди и поток (spec docs/specs/2026-10-flow-ui.md): готовая больница к 13:00 —
// пациенты ходят, значки «ждёт долго» и «недоволен», значки помещений; вкладка «Пациенты» (Tab) — фильтр, клик — камера
// летит к человеку, в карточке — путь с причиной ожидания; «Ушли» — путь ушедшего и почему; слой «Очереди и загрузка» (L);
// ушедший, не дождавшись, идёт к выходу со значком. Часть 4 — режим врача: tools/app/e2e-doctor.mjs. Часть 5 — касса,
// планёрка, обход: tools/app/e2e-economy.mjs. Часть 6 — готовые помещения: tools/app/e2e-ready.mjs. Часть 7 — поликлиника
// по нормам проектирования, с живого экрана начала: tools/app/e2e-poly.mjs. Часть 8 — специалисты: найм с должностью и
// запись к ним, tools/app/e2e-specialists.mjs. Часть 9 — игра владельца 18.10: «Открыть карту» у любого, «Ход приёма»,
// «Следить», «Позвать» — карта, когда вошёл, tools/app/e2e-owner2.mjs. Часть 10 — сохранения: сохранить,
// «Продолжить», загрузить, удалить, испорченный файл, tools/app/e2e-saves.mjs. Часть 11 — карта ушедшего: «Приняты»,
// решение врача в карте отпущенного, карточка ушедшего, tools/app/e2e-discharged.mjs. Часть 12 — смены персонала:
// пересменка в 20:00, ночная смена в карточке помещения, найм на ночь, tools/app/e2e-shifts.mjs. Часть 13 — усталость и
// перерывы: врач идёт в ординаторскую, карточка, «Персонал», «врач на перерыве» в пути пациента, tools/app/e2e-fatigue.mjs.
// Часть 14 — энциклопедия: экран начала, поиск, ссылки, «Назад», F1 над названием, «Подробнее» в «Что это?»,
// tools/app/e2e-encyclopedia.mjs. Часть 15 — скамейки у дверей кабинетов: у двери сидят на скамье, в пути — «на скамье у
// кабинета»; инструмент «Скамья», призрак, Ctrl+Z, снос, tools/app/e2e-benches.mjs. Часть 16 — место под стройку у
// городской больницы: восточное крыло, палата в нём работает, tools/app/e2e-land.mjs. Часть 17 — настроение персонала:
// «собирается уйти» на планёрке, карточка, «Поднять зарплату», «В другую смену», выплата при увольнении,
// tools/app/e2e-mood.mjs. Часть 18 — рост, учёба и болезнь: «вырос до навыка 4» и «Поднять зарплату» на планёрке, вернулся с
// учёбы, сцена не пересобирается, «до навыка 5: 20 смен», «Отправить учиться», tools/app/e2e-growth.mjs. Часть 19 — санитары
// и каталки: санитар везёт больного на каталке, карточки, «Следить», путь, «Персонал», фельдшер скорой,
// tools/app/e2e-gurney.mjs. Часть 20 — «Главврач утверждает»: галочки «О чём спрашивать», решение врача списком и на карте,
// «Карта» с бланком «Ещё обследование», путь, Enter — «Согласен», tools/app/e2e-approve.mjs. Часть 21 — роли и итог
// главврача: «Кто вы» на экране начала, «Управляющий», «Врач» и «Главврач» в окне врача, подсказки по роли, на планёрке —
// «Главврач» и «Ошибки нанятых врачей», «Итог» в карте ошибки, tools/app/e2e-roles.mjs. Часть 22 — своя карта шагами
// (решение владельца #104): лента «Ход приёма» и шаги, вопрос, осмотр и анализ уходят в ленту, результат — «Решение», разбор,
// tools/app/e2e-owncard.mjs. Часть 23 — люди Rocketbox: 59 видов с атласом и маской, вид по должности и профессии, цвет
// костюма по должности, садятся, встают и лежат, tools/app/e2e-people.mjs. Часть 24 — сценарий 1 «Амбулатория»: «Кампания» на экране
// начала, письма наставницы к состояниям подсказок и «в начале», каталог стройки сценария, свой кабинет, первые трое —
// заданные, «Цели» и «Без обучения», «Письма» на планёрке, tools/app/e2e-scenario.mjs. Часть 25 — слой «Показатели»:
// столбики над помещениями из меню «Слои», высота по людям, наведение и щелчок по столбику, «Ожидание», M по кругу,
// показатель запомнен, tools/app/e2e-metrics.mjs. Часть 26 — направление к специалисту, tools/app/e2e-referral.mjs. Часть 27 —
// сложность: второй шаг экрана начала — «Управление» и мягкий режим, игра на выбранном уровне, смена в «Настройках», строка
// сохранения, tools/app/e2e-difficulty.mjs.
// Ошибок в консоли и запросов наружу нет.
// Снимки — tools/app/out/e2e.png, e2e-build-*.png и e2e-flow-*.png; `--shots high` — снимки частей 2 и 3 в этом качестве
// (на время снимка).
//   node tools/app/e2e.mjs [--q low|medium|high] [--headed] [--only 1|2|…|30 или 7,10,11] [--shots low|medium|high] [--port 8093]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { approvePart } from './e2e-approve.mjs';
import { rolesPart } from './e2e-roles.mjs';
import { ownCardPart } from './e2e-owncard.mjs';
import { benchesPart } from './e2e-benches.mjs';
import { doctorPart } from './e2e-doctor.mjs';
import { economyPart } from './e2e-economy.mjs';
import { encyclopediaPart } from './e2e-encyclopedia.mjs';
import { fatiguePart } from './e2e-fatigue.mjs';
import { landPart } from './e2e-land.mjs';
import { moodPart } from './e2e-mood.mjs';
import { growthPart } from './e2e-growth.mjs';
import { gurneyPart } from './e2e-gurney.mjs';
import { findChromium } from './e2e-lib.mjs';
import { metricsPart } from './e2e-metrics.mjs';
import { ownerTwoPart } from './e2e-owner2.mjs';
import { peoplePart } from './e2e-people.mjs';
import { polyPart } from './e2e-poly.mjs';
import { dischargedPart } from './e2e-discharged.mjs';
import { difficultyPart } from './e2e-difficulty.mjs';
import { readyPart } from './e2e-ready.mjs';
import { referralPart } from './e2e-referral.mjs';
import { deptsPart } from './e2e-depts.mjs';
import { catalogPart } from './e2e-catalog.mjs';
import { problemsPart } from './e2e-problems.mjs';
import { savesPart } from './e2e-saves.mjs';
import { scenarioPart } from './e2e-scenario.mjs';
import { shiftsPart } from './e2e-shifts.mjs';
import { specialistsPart } from './e2e-specialists.mjs';
import { serve } from './serve.mjs';

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};

const out = new URL('./out/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });
// порт — свой у каждого прогона, если сценарии идут параллельно (`--port`)
const port = Number(arg('port', '8093'));
const server = await serve(port);
const browser = await chromium.launch({
  executablePath: findChromium(),
  headless: !process.argv.includes('--headed'),
  args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
const requests = [];
page.on('console', m => {
  if (m.type() === 'error') errors.push(m.text());
  if (m.type() === 'error' || m.type() === 'warning') console.log(`  ${m.type()}: ${m.text().slice(0, 300)}`);
});
page.on('pageerror', e => errors.push(e.message));
page.on('request', r => {
  const u = r.url();
  if (!u.startsWith(`http://127.0.0.1:${port}/`) && !u.startsWith('data:') && !u.startsWith('blob:')) requests.push(u);
});
const fail = msg => {
  console.error(`✗ ${msg}`);
  process.exitCode = 1;
};
const ok = msg => console.log(`✓ ${msg}`);
/** Снимок стройки; с `--shots` — в этом качестве: переключить, дождаться четырёх кадров, снять, вернуть. */
const shotAs = async name => {
  const q = arg('shots', '');
  if (q) {
    await page.evaluate(x => window.__game.showQuality(x), q);
    await page.evaluate(() => new Promise(r => {
      let n = 0;
      const f = () => (++n >= 4 ? r() : requestAnimationFrame(f));
      requestAnimationFrame(f);
    }));
  }
  await page.screenshot({ path: join(out, name) });
  if (q) await page.evaluate(x => window.__game.showQuality(x), arg('q', 'low'));
};
/** Шесть помещений прототипа — тот же план, что в tools/test/site-kit.ts (PROTO): тип, прямоугольник со стенами, кого нанять. */
const PROTO = [
  ['room.reception', 6, 6, 6, 7, ['role.registrar']],
  ['room.waiting', 11, 6, 9, 7, []],
  ['room.office', 19, 6, 8, 7, ['role.doctor']],
  ['room.staff', 26, 6, 6, 7, []],
  ['room.procedure', 31, 6, 6, 7, ['role.nurse']],
  ['room.lab', 36, 6, 6, 7, ['role.lab_tech']],
];

// одна часть или несколько через запятую — подряд на одной странице, как в полном прогоне
const only = arg('only', '').split(',').filter(Boolean);
const run = n => only.length === 0 || only.includes(String(n));
try {
  if (run(1)) await partOne();
  if (run(2)) await partTwo();
  if (run(3)) await partThree();
  // часть 4 — режим врача (spec docs/specs/2026-10-doctor-mode.md): tools/app/e2e-doctor.mjs
  if (run(4)) await doctorPart({ page, port, out, ok, fail, q: arg('q', 'low'), shots: arg('shots', '') });
  // часть 5 — касса, планёрка, обход (spec docs/specs/2026-10-economy.md): tools/app/e2e-economy.mjs
  if (run(5)) await economyPart({ page, port, out, ok, fail, q: arg('q', 'low'), shots: arg('shots', '') });
  // часть 6 — готовые помещения (spec docs/specs/2026-10-ready-rooms.md): tools/app/e2e-ready.mjs
  if (run(6)) await readyPart({ page, port, out, ok, fail, q: arg('q', 'low'), shots: arg('shots', '') });
  // часть 7 — поликлиника по нормам проектирования (spec docs/specs/2026-10-real-hospital.md): tools/app/e2e-poly.mjs
  if (run(7)) await polyPart({ page, port, out, ok, fail, q: arg('q', 'low'), shots: arg('shots', '') });
  // часть 8 — специалисты: найм с должностью и своя запись (spec docs/specs/2026-10-specialists.md)
  if (run(8)) await specialistsPart({ page, port, out, ok, fail, q: arg('q', 'low'), shots: arg('shots', '') });
  // часть 9 — игра владельца 18.10: пауза для решений, карта у любого, камера за человеком (spec 2026-10-owner-play-2)
  if (run(9)) await ownerTwoPart({ page, port, out, ok, fail, q: arg('q', 'low'), shots: arg('shots', '') });
  // часть 10 — сохранения (spec docs/specs/2026-10-saves.md)
  if (run(10)) await savesPart({ page, port, out, ok, fail, q: arg('q', 'low'), shots: arg('shots', '') });
  // часть 11 — карта ушедшего (spec docs/specs/2026-10-discharged-card.md)
  if (run(11)) await dischargedPart({ page, port, out, ok, fail, q: arg('q', 'low'), shots: arg('shots', '') });
  // часть 12 — смены персонала (spec docs/specs/2026-10-staff-shifts.md)
  if (run(12)) await shiftsPart({ page, port, out, ok, fail, q: arg('q', 'low'), shots: arg('shots', '') });
  // часть 13 — усталость и перерывы (spec docs/specs/2026-10-staff-shifts.md, часть 2)
  if (run(13)) await fatiguePart({ page, port, out, ok, fail, q: arg('q', 'low'), shots: arg('shots', '') });
  // часть 14 — энциклопедия (spec docs/specs/2026-10-encyclopedia.md)
  if (run(14)) await encyclopediaPart({ page, port, out, ok, fail, q: arg('q', 'low'), shots: arg('shots', '') });
  // часть 15 — скамейки у дверей кабинетов (spec docs/specs/2026-10-door-benches.md)
  if (run(15)) await benchesPart({ page, port, out, ok, fail, q: arg('q', 'low'), shots: arg('shots', '') });
  // часть 16 — место под стройку у городской больницы (spec docs/specs/2026-10-city-land.md)
  if (run(16)) await landPart({ page, port, out, ok, fail, q: arg('q', 'low'), shots: arg('shots', '') });
  // часть 17 — настроение персонала (spec docs/specs/2026-10-staff-mood.md)
  if (run(17)) await moodPart({ page, port, out, ok, fail, q: arg('q', 'low'), shots: arg('shots', '') });
  // часть 18 — рост, учёба и болезнь персонала (spec docs/specs/2026-10-staff-mood.md, разделы 3–5)
  if (run(18)) await growthPart({ page, port, out, ok, fail, q: arg('q', 'low'), shots: arg('shots', '') });
  // часть 19 — санитары и каталки (spec docs/specs/2026-10-orderlies.md)
  if (run(19)) await gurneyPart({ page, port, out, ok, fail, q: arg('q', 'low'), shots: arg('shots', '') });
  // часть 20 — «Главврач утверждает» (spec docs/specs/2026-10-two-ways.md, часть 2)
  if (run(20)) await approvePart({ page, port, out, ok, fail, q: arg('q', 'low'), shots: arg('shots', '') });
  // часть 21 — роли и итог главврача (spec docs/specs/2026-10-two-ways.md, часть 3): tools/app/e2e-roles.mjs
  if (run(21)) await rolesPart({ page, port, out, ok, fail, q: arg('q', 'low'), shots: arg('shots', '') });
  // часть 22 — своя карта, макет (spec docs/specs/2026-10-own-card.md): tools/app/e2e-owncard.mjs
  if (run(22)) await ownCardPart({ page, port, out, ok, fail, q: arg('q', 'low'), shots: arg('shots', '') });
  // часть 23 — люди Rocketbox (spec docs/specs/2026-10-people.md, часть 1): tools/app/e2e-people.mjs
  if (run(23)) await peoplePart({ page, port, out, ok, fail, q: arg('q', 'low'), shots: arg('shots', '') });
  // часть 24 — сценарий 1 «Амбулатория» (spec docs/specs/2026-10-scenario-1.md, часть 2): tools/app/e2e-scenario.mjs
  if (run(24)) await scenarioPart({ page, port, out, ok, fail, q: arg('q', 'low'), shots: arg('shots', '') });
  // часть 25 — слой «Показатели» (spec docs/specs/2026-10-metrics-layer.md, часть 1): tools/app/e2e-metrics.mjs
  if (run(25)) await metricsPart({ page, port, out, ok, fail, q: arg('q', 'low'), shots: arg('shots', '') });
  // часть 26 — направление к специалисту (spec docs/specs/2026-10-specialists.md, часть 2): tools/app/e2e-referral.mjs
  if (run(26)) await referralPart({ page, port, out, ok, fail, q: arg('q', 'low'), shots: arg('shots', '') });
  // часть 27 — сложность (spec docs/specs/2026-10-difficulty.md, часть 2): tools/app/e2e-difficulty.mjs
  if (run(27)) await difficultyPart({ page, port, out, ok, fail, q: arg('q', 'low'), shots: arg('shots', '') });
  // часть 28 — отделения на карте (spec docs/specs/2026-10-departments.md, часть 2): tools/app/e2e-depts.mjs
  if (run(28)) await deptsPart({ page, port, out, ok, fail, q: arg('q', 'low'), shots: arg('shots', '') });
  if (run(29)) await catalogPart({ page, port, out, ok, fail, q: arg('q', 'low'), shots: arg('shots', '') });
  if (run(30)) await problemsPart({ page, port, out, ok, fail, q: arg('q', 'low'), shots: arg('shots', '') });
  if (errors.length) fail(`ошибки в консоли: ${errors.length}\n    ${errors.slice(0, 5).join('\n    ')}`);
  else ok('ошибок в консоли нет');
  if (requests.length) fail(`запросы наружу: ${requests.join(', ')}`);
  else ok('запросов наружу нет');
} catch (e) {
  fail(String(e?.stack ?? e));
} finally {
  await browser.close();
  server.close();
}

async function partOne() {
  // поток — числами сцены (6 в час, скорая 1 в час), как до потока от больницы части 5б: та же толпа, что прежде
  await page.goto(`http://127.0.0.1:${port}/index.html?q=${arg('q', 'low')}&lang=ru&hospital=preset&flow=6,1`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  ok('страница загрузилась, первый кадр нарисован');
  // шрифт игры (решение владельца #107): IBM Plex Sans из своих файлов, а не системный
  const font = await page.evaluate(async () => {
    await document.fonts.ready;
    return { family: getComputedStyle(document.body).fontFamily, loaded: document.fonts.check('13px "IBM Plex Sans"') };
  });
  if (font.loaded && font.family.startsWith('"IBM Plex Sans"')) ok(`шрифт игры — IBM Plex Sans из assets/fonts: ${font.family}`);
  else fail(`шрифт игры: ${JSON.stringify(font)}`);
  // дать потоку расчёта и людям пожить: ×12 на несколько секунд — и до первого пациента (без видеокарты и при занятом
  // процессоре кадров мало, часы идут медленнее)
  await page.keyboard.press('Digit3');
  await page.waitForTimeout(6000);
  // пациенты — кто не из штата (со сменами, spec 2026-10-staff-shifts, на карте только дневная смена)
  await page.waitForFunction(() => [...window.__game.crowd.walkers.values()].some(w => !w.staff), null, { timeout: 120000 }).catch(() => {});
  const s = await page.evaluate(() => {
    const g = window.__game;
    return {
      rooms: g.layout.plan.rooms.length,
      things: g.layout.things.length,
      people: g.crowd.walkers.size,
      // на карте — штат этой смены (spec 2026-10-staff-shifts)
      staff: [...g.crowd.walkers.values()].filter(w => w.staff).length,
      calls: g.stage.calls,
      tris: g.stage.tris,
      t: g.t,
      speed: g.speed,
      clock: document.getElementById('clock')?.textContent ?? '',
    };
  });
  console.log(`  ${JSON.stringify(s)}`);
  if (s.rooms > 10 && s.things > 100) ok(`больница движка: помещений — ${s.rooms}, предметов — ${s.things}`);
  else fail('больница не построилась');
  if (s.people > s.staff) ok(`люди: ${s.people} (штат ${s.staff})`);
  else fail('пациентов нет');
  if (s.calls > 10 && s.tris > 10000) ok(`кадр: ${s.calls} вызовов, ${s.tris} треугольников`);
  else fail('кадр пустой');
  if (s.speed === 12 && s.t > 8 * 3600) ok(`часы идут: ${s.clock}, ×${s.speed}`);
  else fail('часы не идут');
  // больница видна: в середине кадра не один цвет фона
  const shot = await page.screenshot({ path: join(out, 'e2e.png') });
  ok(`снимок: ${join(out, 'e2e.png')} (${Math.round(shot.length / 1024)} КБ)`);
  const varied = await page.evaluate(async () => {
    // кадр WebGL читается сразу после отрисовки: снимок самой игры, уменьшенный
    const g = window.__game;
    const url = g.stage.shot(320, 180, g.crowd, g.pop.paint, k => g.pop.triageOf(k), 12);
    const img = new Image();
    img.src = url;
    await img.decode();
    const t = document.createElement('canvas');
    t.width = 64;
    t.height = 36;
    const c2 = t.getContext('2d');
    c2.drawImage(img, 0, 0, 64, 36);
    const d = c2.getImageData(0, 0, 64, 36).data;
    const colors = new Set();
    for (let i = 0; i < d.length; i += 4) colors.add(`${d[i] >> 4},${d[i + 1] >> 4},${d[i + 2] >> 4}`);
    return colors.size;
  });
  if (varied > 40) ok(`больница видна: ${varied} оттенков в кадре`);
  else fail(`кадр почти однотонный: ${varied} оттенков`);
  // пауза — пробелом
  await page.keyboard.press('Space');
  const paused = await page.evaluate(() => window.__game.speed);
  if (paused === 0) ok('пробел — пауза');
  else fail('пробел не ставит паузу');
  await page.keyboard.press('Digit1');
  // клик по человеку — карточка
  const target = await page.evaluate(() => {
    const g = window.__game;
    for (const w of g.crowd.walkers.values()) {
      if (w.staff) continue;
      const p = g.stage.screenOf(w);
      if (p && p.x > 200 && p.x < 1080 && p.y > 150 && p.y < 600) return { ...p, key: w.key };
    }
    for (const w of g.crowd.walkers.values()) {
      const p = g.stage.screenOf(w);
      if (p && p.x > 200 && p.x < 1080 && p.y > 150 && p.y < 600) return { ...p, key: w.key };
    }
    return null;
  });
  if (target) {
    await page.mouse.click(target.x, target.y);
    await page.waitForTimeout(400);
    const title = await page.evaluate(() => document.getElementById('card-title')?.textContent ?? '');
    // у пациента — имя (spec docs/specs/2026-10-owner-play.md), а не «Пациент, 20 лет»
    const named = !target.key.startsWith('p:') || /^\S+ \S+, \d+/.test(title);
    if (title && named) ok(`клик по человеку — карточка: «${title}»`);
    else fail(`клик по человеку: карточка «${title}»`);
  } else fail('не нашёл человека в кадре');
  // выделение (spec docs/specs/2026-10-aaa-polish.md): у выбранного человека — кольцо; наведение на другого — тонкое кольцо
  // и подпись «кто · что делает»
  const hl = await page.evaluate(() => window.__game.stage.highlight.dump());
  if (hl.ring) ok('у выбранного человека — кольцо выделения');
  else fail(`кольца у выбранного нет: ${JSON.stringify(hl)}`);
  const other = await page.evaluate(sel => {
    const g = window.__game;
    // любой другой человек в кадре — пациент или человек штата (у штата подпись — должность), не под панелями
    for (const w of g.crowd.walkers.values()) {
      if (w.key === sel || w.key === 'you') continue;
      const p = g.stage.screenOf(w);
      if (p && p.x > 320 && p.x < 960 && p.y > 150 && p.y < 560) return { ...p, key: w.key };
    }
    return null;
  }, target?.key ?? '');
  if (other) {
    await page.mouse.move(other.x, other.y);
    await page.waitForTimeout(250);
    const hover = await page.evaluate(() => ({ ...window.__game.stage.highlight.dump(), text: window.__game.hoverLabelText, cursor: window.__game.stage.renderer.domElement.style.cursor }));
    if (hover.hoverRing && hover.text.length > 0 && hover.cursor === 'pointer') ok(`наведение на человека: кольцо, курсор-рука, подпись «${hover.text}»`);
    else fail(`наведение на человека: ${JSON.stringify(hover)}`);
  } else fail('не нашёл второго человека в кадре');
  await settingsPart();
}

/**
 * «Настройки» (spec docs/specs/2026-10-settings.md; решение владельца #70): кнопки «Вид» на экране нет; стены, камера и
 * качество — «Игра» → «Настройки», по умолчанию стены вниз и качество «авто»; размер текста — три, по умолчанию обычный:
 * «крупный» — панели в 1,3 раза больше, шрифт подписей на карте тоже; выбор переживает перезагрузку. В конце — снова как
 * по умолчанию: следующие части начинают с вида игрока, как прежде.
 */
async function settingsPart() {
  const view = () =>
    page.evaluate(() => {
      const g = window.__game;
      const on = id => document.getElementById(id)?.classList.contains('on') ?? null;
      return {
        mode: g.stage.walls.uniforms.uMode.value,
        projection: g.stage.cam.projection,
        quality: g.stage.quality,
        auto: g.auto !== undefined,
        buttons: { down: on('walls-down'), cut: on('walls-cut'), ortho: on('camera-ortho'), persp: on('camera-persp'), low: on('quality-low'), medium: on('quality-medium'), qauto: on('quality-auto'), text0: on('text-0'), text2: on('text-2') },
        saved: localStorage.getItem('bolnitsa.settings'),
        // размер текста: zoom панелей, ширина окна настроек на экране, шрифт подписи помещения на карте
        zoom: getComputedStyle(document.getElementById('ui')).zoom,
        width: Math.round(document.getElementById('settings')?.getBoundingClientRect().width ?? 0),
        label: getComputedStyle(document.querySelector('.rlabel b') ?? document.body).fontSize,
      };
    });
  const open = async () => {
    await page.click('#game-menu-open');
    await page.click('#settings-open');
    await page.waitForSelector('#settings', { timeout: 5000 });
  };
  if (await page.$('#view-menu')) fail('кнопка «Вид» осталась на экране');
  else ok('кнопки «Вид» на экране нет — вид в «Настройках»');
  await open();
  // снимок окна — для отчёта (docs/reports/2026-10-settings/); кнопка «Игра» гаснет за 0,12 с — дождаться
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(out, 'settings.jpg'), type: 'jpeg', quality: 72 });
  const a = await view();
  if (a.mode === 2 && a.buttons.down && a.buttons.persp && a.buttons.low && a.buttons.qauto === false && a.buttons.text0 && a.zoom === '1' && a.saved === null) ok('«Настройки»: по умолчанию стены вниз, перспектива, текст обычный; качество — заданное адресом (?q=low)');
  else fail(`«Настройки» по умолчанию: ${JSON.stringify(a)}`);
  await page.click('#walls-cut');
  await page.click('#camera-ortho');
  await page.click('#quality-medium');
  await page.click('#text-2');
  await page.waitForTimeout(200);
  const b = await view();
  const grew = b.width / a.width;
  if (b.mode === 1 && b.projection === 'ortho' && b.quality === 'medium' && b.buttons.cut && b.buttons.ortho && b.buttons.medium && b.buttons.text2 && b.zoom === '1.3' && Math.abs(grew - 1.3) < 0.02 && b.label === '15.6px') {
    ok(`«Настройки»: стены «срез», камера «орто», качество «среднее», текст «крупный» — сразу: окно ×${grew.toFixed(2)}, подпись помещения ${a.label} → ${b.label}`);
  } else fail(`«Настройки» не применились: ${JSON.stringify({ b, grew })}`);
  await page.screenshot({ path: join(out, 'settings-text.jpg'), type: 'jpeg', quality: 72 });
  await page.keyboard.press('Escape');
  if (await page.$('#settings')) fail('Esc не закрыл «Настройки»');
  else ok('Esc закрывает «Настройки»');
  // перезагрузка без ?q=: качество — из настроек
  await page.goto(`http://127.0.0.1:${port}/index.html?lang=ru&hospital=preset&flow=6,1`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  await open();
  const c = await view();
  if (c.mode === 1 && c.projection === 'ortho' && c.quality === 'medium' && !c.auto && c.buttons.cut && c.buttons.ortho && c.buttons.medium && c.buttons.text2 && c.zoom === '1.3') ok('после перезагрузки — те же стены, камера, качество и размер текста');
  else fail(`после перезагрузки: ${JSON.stringify(c)}`);
  // назад к виду по умолчанию; «авто» начинает с высокого и смотрит на кадр
  await page.click('#walls-down');
  await page.click('#camera-persp');
  await page.click('#quality-auto');
  await page.click('#text-0');
  const d = await view();
  if (d.mode === 2 && d.projection === 'persp' && d.quality === 'high' && d.auto && d.buttons.qauto && d.zoom === '1' && JSON.parse(d.saved ?? '{}').quality === 'auto') ok('качество «авто»: с высокого, по времени кадра; стены вниз, перспектива и обычный текст — снова');
  else fail(`«авто» и вид по умолчанию: ${JSON.stringify(d)}`);
  await page.click('#settings-close');
  if (await page.$('#settings')) fail('«✕» не закрыл «Настройки»');
}

async function partTwo() {
  await page.goto(`http://127.0.0.1:${port}/index.html?q=${arg('q', 'low')}&lang=ru&hospital=empty`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  const at = (x, y) => page.evaluate(([cx, cy]) => window.__game.stage.screenOfCell(cx, cy), [x, y]);
  // камера — на помещение, как игрок сдвинул бы её (управление камерой проверяет часть 1)
  const look = async (x, y, half = 9) => {
    await page.evaluate(([cx, cy, h]) => {
      const g = window.__game;
      g.stage.cam.target.set(cx, 0, cy);
      g.stage.cam.half = h;
    }, [x, y, half]);
    await page.waitForTimeout(200);
  };
  // камера на клетки: ближе всего, чтобы все были в кадре и не под левой панелью
  const fit = async (cells, cx, cy) => {
    for (let half = 8; half <= 24; half += 1) {
      await look(cx, cy, half);
      const pts = await Promise.all(cells.map(([x, y]) => at(x, y)));
      if (pts.every(p => p && p.x > 310 && p.x < 1270 && p.y > 110 && p.y < 700)) return half;
    }
    return 24;
  };
  const until = (fn, a, ms = 20000) => page.waitForFunction(fn, a, { timeout: ms });
  const tool = async name => {
    if (!(await page.$eval(`#tool-${name}`, el => el.classList.contains('on')))) await page.click(`#tool-${name}`);
  };
  const roomOf = id => page.evaluate(i => {
    const r = window.__game.hospital.site.rooms.find(x => x.id === i);
    return r ? { items: r.items.length, door: r.door?.length ?? 0, staff: window.__game.staff.filter(m => m.room === i).length } : null;
  }, id);
  const closed = await page.textContent('#closed');
  if (closed?.includes('регистратур')) ok(`пустое здание: «${closed}», часы на паузе`);
  else fail(`пустое здание: нет «закрыта» (${closed})`);
  // подсказки первых минут (spec docs/specs/2026-10-aaa-polish.md): до стройки — «B — стройка», в стройке — как протянуть
  const hint = () => page.evaluate(() => ({ key: document.getElementById('hint')?.dataset.key ?? '', text: document.getElementById('hint-text')?.textContent ?? '' }));
  const h0 = await hint();
  await page.keyboard.press('KeyB');
  if (await page.$('#tool-room')) ok('B — стройка открыта');
  else fail('B не открыл стройку');
  await page.waitForTimeout(250);
  const h1 = await hint();
  if (h0.key === 'build' && h0.text.includes('B') && h1.key === 'draw') ok(`подсказки: «${h0.text}» → «${h1.text}»`);
  else fail(`подсказки: ${JSON.stringify([h0, h1])}`);
  let first = '';
  for (const [i, [type, x, y, w, h, roles]] of PROTO.entries()) {
    // последнее — с камерой на весь ряд: снимок с подписями построенных
    const last = i === PROTO.length - 1;
    if (last) {
      await page.click('#card .close').catch(() => {});
      await fit([[6, 6], [41, 6], [6, 12], [41, 12]], 26, 9.5);
    } else await look(x + w / 2, y + h / 2);
    await tool('room');
    await page.click(`#rt-${type.slice(5)}`);
    const a = await at(x, y);
    const b = await at(x + w - 1, y + h - 1);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 8 });
    await page.waitForTimeout(150);
    const ghost = await page.textContent('#ghost');
    if (i === 0) first = ghost;
    if (last) await shotAs('e2e-build-1.png');
    await page.mouse.up();
    await until(n => window.__game.hospital.site.rooms.length === n, i + 1);
    const id = await page.evaluate(() => window.__game.hospital.site.rooms.at(-1).id);
    // «Обставить» в карточке нового помещения; новое помещение выбрано — рамка по полу (spec 2026-10-aaa-polish)
    await until(() => !!document.getElementById('card-furnish'));
    if (i === 0) {
      const sel = await page.evaluate(() => window.__game.stage.highlight.dump());
      if (sel.sel) ok('построенное помещение выбрано: рамка по полу');
      else fail(`рамки выбранного помещения нет: ${JSON.stringify(sel)}`);
      // первая причина «не работает» у пустого помещения — дверь или мебель (порядок `problemsOf`): подсказка — по ней
      const hf = await hint();
      if (hf.key === 'door' || hf.key === 'furnish') ok(`подсказка: «${hf.text}»`);
      else fail(`подсказка после постройки: ${JSON.stringify(hf)}`);
    }
    await page.click('#card-furnish');
    await until(rid => window.__game.hospital.site.rooms.find(r => r.id === rid)?.items.length > 0, id);
    // дверь — посередине нижней стены; карточка внизу (с должностями по сменам — выше, spec 2026-10-staff-shifts) не
    // должна закрыть стену: на время двери — без неё, для найма — снова
    if (last) await look(x + w / 2, y + h / 2);
    await page.evaluate(() => window.__game.selectRoomId(undefined));
    await tool('door');
    const d = await at(x + Math.floor(w / 2), y + h - 1);
    await page.mouse.move(d.x, d.y);
    await page.waitForTimeout(120);
    await page.mouse.click(d.x, d.y);
    await until(rid => !!window.__game.hospital.site.rooms.find(r => r.id === rid)?.door, id);
    await page.evaluate(rid => window.__game.selectRoomId(rid), id);
    for (const role of roles) {
      await page.click(`#hire-${role.slice(5)}`);
      await until(([rid, n]) => window.__game.staff.filter(m => m.room === rid).length >= n, [id, roles.indexOf(role) + 1]);
    }
    const r = await roomOf(id);
    if (r && r.items > 0 && r.door === 1 && r.staff === roles.length) ok(`${type}: протянут, обставлен (${r.items} предм.), дверь, людей — ${r.staff}`);
    else fail(`${type}: ${JSON.stringify(r)}`);
  }
  if (/ — [\d\s ]+₽/.test(first)) ok(`призрак помещения: «${first}»`);
  else fail(`призрак без цены: «${first}»`);

  // предмет: призрак на занятом — красный с причиной; R поворачивает; взять и переставить; снос убирает, Ctrl+Z
  // возвращает; Esc и ПКМ — отмена
  const waiting = await page.evaluate(() => window.__game.hospital.site.rooms[1].id);
  const items = rid => page.evaluate(i => window.__game.hospital.site.rooms.find(r => r.id === i).items.map(x => ({ id: x.id, kind: x.kind, x: x.x, y: x.y, rot: x.rot })), rid);
  await look(15, 9);
  await page.evaluate(id => window.__game.selectRoomId(id), waiting);
  await tool('item');
  await until(() => !!document.getElementById('it-plant'));
  await page.click('#it-plant');
  const chair = (await items(waiting)).find(i => i.kind === 'chair');
  const c0 = await at(chair.x, chair.y);
  await page.mouse.move(c0.x, c0.y);
  await page.waitForTimeout(150);
  const red = await page.$eval('#ghost', el => ({ bad: el.classList.contains('bad'), text: el.textContent }));
  if (red.bad && red.text.includes('здесь уже стул')) ok(`призрак на стуле: «${red.text}»`);
  else fail(`призрак на стуле: ${JSON.stringify(red)}`);
  const p = await at(18, 7);
  await page.mouse.move(p.x, p.y);
  await page.waitForTimeout(120);
  const rot0 = await page.evaluate(() => window.__game.builder.rot);
  await page.keyboard.press('KeyR');
  const rot1 = await page.evaluate(() => window.__game.builder.rot);
  const before = (await items(waiting)).length;
  await page.mouse.click(p.x, p.y);
  await until(([rid, n]) => window.__game.hospital.site.rooms.find(r => r.id === rid).items.length === n + 1, [waiting, before]);
  const plant = (await items(waiting)).at(-1);
  if (rot1 === (rot0 + 1) % 4 && plant.rot === rot1) ok(`R повернул предмет: ${rot0} → ${rot1}`);
  else fail(`R: ${rot0} → ${rot1}, поставлен ${plant.rot}`);
  // Esc — снять предмет с курсора; клик по поставленному — взять; переставить туда, где призрак зелёный
  await page.keyboard.press('Escape');
  await page.mouse.click(p.x, p.y);
  const moving = await page.evaluate(() => window.__game.builder.moving);
  let dest;
  for (const [cx, cy] of [[12, 7], [13, 7], [14, 7], [15, 7], [16, 7], [17, 7], [12, 11], [13, 11], [17, 11], [18, 11]]) {
    const q = await at(cx, cy);
    await page.mouse.move(q.x, q.y);
    await page.waitForTimeout(80);
    if (await page.$eval('#ghost', el => el.classList.contains('ok')).catch(() => false)) {
      dest = { x: cx, y: cy, q };
      break;
    }
  }
  if (moving?.id === plant.id && dest) {
    const ghost = await page.textContent('#ghost');
    await page.mouse.click(dest.q.x, dest.q.y);
    const moved = await until(([rid, id, x, y]) => window.__game.hospital.site.rooms.find(r => r.id === rid).items.some(i => i.id === id && i.x === x && i.y === y), [waiting, plant.id, dest.x, dest.y]).then(
      () => true,
      () => false,
    );
    if (moved) ok(`взял и переставил: (18, 7) → (${dest.x}, ${dest.y}), «${ghost}»`);
    else fail(`переставить в (${dest.x}, ${dest.y}): призрак «${ghost}», ответ «${await page.textContent('#result').catch(() => '')}», ${JSON.stringify(await items(waiting))}`);
  } else fail(`переставить: взят ${JSON.stringify(moving)}, свободная клетка ${JSON.stringify(dest)}`);
  // снос: клик по предмету — убран; Ctrl+Z — вернулся
  await tool('demolish');
  const dq = dest?.q ?? p;
  await page.mouse.move(dq.x, dq.y);
  await page.waitForTimeout(120);
  await page.mouse.click(dq.x, dq.y);
  await until(([rid, n]) => window.__game.hospital.site.rooms.find(r => r.id === rid).items.length === n, [waiting, before]);
  const back = await page.textContent('#result');
  await page.keyboard.press('Control+KeyZ');
  await until(([rid, n]) => window.__game.hospital.site.rooms.find(r => r.id === rid).items.length === n + 1, [waiting, before]);
  ok(`снос убрал предмет («${back}»), Ctrl+Z вернул`);
  await tool('item');
  await page.click('#it-plant');
  await page.keyboard.press('Escape');
  const item = await page.evaluate(() => window.__game.builder.item);
  await page.mouse.click(p.x, p.y, { button: 'right' });
  const t = await page.evaluate(() => window.__game.builder.tool);
  if (!item && !t) ok('Esc снял предмет, ПКМ — инструмент');
  else fail(`Esc / ПКМ: предмет ${JSON.stringify(item)}, инструмент ${t}`);

  // палата: одинарная дверь — «нужна двойная», двойная — нет
  await look(9.5, 23.5);
  await tool('room');
  await page.click('#rt-ward');
  const wa = await at(6, 20);
  const wb = await at(12, 26);
  await page.mouse.move(wa.x, wa.y);
  await page.mouse.down();
  await page.mouse.move(wb.x, wb.y, { steps: 8 });
  await page.waitForTimeout(150);
  await page.mouse.up();
  await until(() => window.__game.hospital.site.rooms.length === 7);
  await until(() => !!document.getElementById('card-furnish'));
  await page.click('#card-furnish');
  await tool('door');
  const wd = await at(9, 20);
  await page.mouse.move(wd.x, wd.y);
  await page.waitForTimeout(120);
  await page.mouse.click(wd.x, wd.y);
  await until(() => !!window.__game.hospital.site.rooms[6].door);
  await page.waitForTimeout(300);
  const one = await page.textContent('#room-state');
  await tool('door2');
  await page.mouse.move(wd.x + 2, wd.y + 2);
  await page.mouse.move(wd.x, wd.y);
  await page.waitForTimeout(300);
  await shotAs('e2e-build-2.png');
  await page.mouse.click(wd.x, wd.y);
  await until(() => window.__game.hospital.site.rooms[6].door?.length === 2);
  await page.waitForTimeout(300);
  const two = await page.textContent('#room-state');
  if (one.includes('двойная') && !two.includes('двойная')) ok(`палата: «${one}» → «${two}»`);
  else fail(`палата: «${one}» → «${two}»`);

  // выйти из стройки — открыто; часы ×12 — приходят и принимают
  await page.keyboard.press('KeyB');
  await until(() => !document.getElementById('closed'));
  const working = await page.evaluate(() => [...window.__game.working].length);
  if (working >= 6) ok(`стройка закрыта (B): работают ${working} помещений, больница открыта`);
  else fail(`работают ${working}`);
  await look(24, 16, 16);
  // больница открыта, часы стоят — подсказка «пробел»; наведение на помещение — подпись «название · состояние»
  await page.waitForTimeout(250);
  const hr = await hint();
  if (hr.key === 'run') ok(`подсказка: «${hr.text}»`);
  else fail(`подсказка открытой больницы: ${JSON.stringify(hr)}`);
  const wp = await at(15, 9);
  await page.mouse.move(wp.x, wp.y);
  await page.waitForTimeout(250);
  const hoverRoom = await page.evaluate(() => ({ text: window.__game.hoverLabelText, ...window.__game.stage.highlight.dump() }));
  if (hoverRoom.text.includes('Зона ожидания') && hoverRoom.hover) ok(`наведение на помещение: рамка и подпись «${hoverRoom.text}»`);
  else fail(`наведение на помещение: ${JSON.stringify(hoverRoom)}`);
  await page.keyboard.press('Digit3');
  await page.waitForTimeout(250);
  if ((await hint()).key !== 'run') ok('часы пошли — подсказка «пробел» ушла');
  else fail('подсказка «пробел» осталась при идущих часах');
  await until(() => window.__game.store.get().seen > 0, null, 120000);
  const c = await page.evaluate(() => {
    const h = window.__game.store.get();
    return { arrived: h.arrived, seen: h.seen, clock: document.getElementById('clock')?.textContent };
  });
  ok(`пациенты пришли и приняты: ${JSON.stringify(c)}`);
  await page.click('#card .close').catch(() => {});
  await fit([[6, 6], [41, 6], [6, 12], [41, 12]], 26, 9.5);
  // для снимка — ещё немного приёма; снимки для документов (`--shots`) — к 10:30, когда людей больше
  if (arg('shots', '')) await until(() => window.__game.t % 86400 >= 10.5 * 3600, null, 240000).catch(() => {});
  else await until(() => window.__game.store.get().seen >= 3, null, 60000).catch(() => {});
  await shotAs('e2e-build-3.png');
  ok(`снимок: ${await page.evaluate(() => `${document.getElementById('clock')?.textContent}, принято ${window.__game.store.get().seen}`)}`);
}

async function partThree() {
  // готовая больница: один терапевт на поток — к 13:00 очередь, долгие ожидания, первый ушедший (12:52)
  await page.goto(`http://127.0.0.1:${port}/index.html?q=${arg('q', 'low')}&lang=ru&hospital=preset&start=13&flow=6,1`);
  await page.waitForFunction(() => window.__started === true, null, { timeout: 240000 });
  const until = (fn, a, ms = 20000) => page.waitForFunction(fn, a, { timeout: ms });
  ok(`люди и поток: ${await page.textContent('#clock')}`);
  // автопауза режима врача (часть 4) на просьбы и результаты остановила бы часы — здесь смотрят поток
  await page.evaluate(() => window.__game.actions.doctor({ kind: 'autopause', on: false }));
  // окно врача (часть 4) — свернуть кнопкой: значки и слой видны на всей карте
  await page.click('#dock .close', { timeout: 20000 });
  // пациенты ходят: на ×12 кто-то идёт по срезу — пришёл, позвали к врачу, на обследование (кадров без видеокарты мало)
  const before = await page.evaluate(() => [...window.__game.crowd.walkers.values()].filter(w => !w.staff).map(w => [w.key, w.x, w.z]));
  await page.keyboard.press('Digit3');
  const moved = await page
    .waitForFunction(
      b => {
        const g = window.__game;
        const walking = [...g.crowd.walkers.values()].filter(w => !w.staff && w.state === 'walk' && !w.leaving).length;
        let n = 0;
        for (const [k, x, z] of b) {
          const w = g.crowd.walkers.get(k);
          if (w && Math.hypot(w.x - x, w.z - z) > 0.5) n++;
        }
        return n > 0 && walking > 0 ? { n, of: b.length, walking, clock: document.getElementById('clock')?.textContent } : null;
      },
      before,
      { timeout: 60000, polling: 100 },
    )
    .then(h => h.jsonValue())
    .catch(() => null);
  if (moved) ok(`пациенты ходят: сдвинулись ${moved.n} из ${moved.of}, идут ${moved.walking} (${moved.clock})`);
  else fail('пациенты стоят');
  // извещения всплывающими строками (spec docs/specs/2026-10-aaa-polish.md, «Извещения»): под часами — не больше трёх;
  // щелчок по строке о больном — камера к нему; на паузе новых нет, и строки гаснут сами
  const toasts = await until(() => document.querySelectorAll('#toasts .toast').length > 0, null, 60000).then(() => true).catch(() => false);
  await page.evaluate(() => window.__game.actions.setSpeed(0));
  // о ком строка и на карте ли он: страница, открывшаяся под нагрузкой поздно, показывает и тех, кто уже вышел из больницы
  const shown = await page.evaluate(() =>
    [...document.querySelectorAll('#toasts .toast')].map(e => {
      const who = e.dataset.who;
      const pop = window.__game.pop;
      return { text: e.textContent, go: e.classList.contains('go'), who, here: !!who && !!(pop.keyOf(who) ?? pop.walkerKey(who)) };
    }),
  );
  if (toasts && shown.length >= 1 && shown.length <= 3) ok(`извещения под часами: ${shown.length} — «${shown[0].text}»`);
  else fail(`извещения под часами: ${JSON.stringify(shown)}`);
  // кто на карте — камера к нему; кто уже вышел — открывается его карточка («Найти»: ушёл — карточка с путём)
  const here = shown.findIndex(x => x.go && x.here);
  const go = here >= 0 ? here : shown.findIndex(x => x.go);
  if (go >= 0 && shown[go].here) {
    const was = await page.evaluate(() => [window.__game.stage.cam.target.x, window.__game.stage.cam.target.z]);
    await page.click(`#toasts .toast:nth-child(${go + 1})`);
    const flew = await until(w => { const t = window.__game.stage.cam.target; return window.__game.stage.cam.flying || Math.hypot(t.x - w[0], t.z - w[1]) > 0.5; }, was, 10000).then(() => true).catch(() => false);
    if (flew) ok(`щелчок по извещению «${shown[go].text}» — камера к больному`);
    else fail('щелчок по извещению о больном — камера на месте');
  } else if (go >= 0) {
    await page.click(`#toasts .toast:nth-child(${go + 1})`);
    const card = await until(id => window.__game.selected === `id:${id}`, shown[go].who, 10000).then(() => true).catch(() => false);
    if (card) ok(`щелчок по извещению «${shown[go].text}» — он уже вышел из больницы: его карточка`);
    else fail(`щелчок по извещению о вышедшем — карточки нет: ${JSON.stringify(shown[go])}`);
  }
  const faded = await until(() => !document.getElementById('toasts'), null, 15000).then(() => true).catch(() => false);
  if (faded) ok('на паузе извещения гаснут сами (обычное — 6 с, срочное — 12 с)');
  else fail(`извещения не гаснут: ${await page.evaluate(() => document.getElementById('toasts')?.textContent)}`);
  // ходьба в движке (spec docs/specs/2026-10-walk.md): идущий — в карточке «идёт … · дойдёт к ЧЧ:ММ»; дошёл (в движке и на
  // экране) — «идёт» и срок пропадают
  await page.keyboard.press('Digit1');
  // дойдёт в ближайшие 1–6 игровых минут: с «своим залом» (spec 2026-10-own-hall) в городской идут и к дальним кабинетам —
  // по 10–15 минут игры, а без видеокарты кадров мало и часы идут медленнее
  const going = await page
    .waitForFunction(
      () => {
        const g = window.__game;
        for (const [key, now] of g.pop.patients()) if (now.arrive > g.t + 60 && now.arrive < g.t + 360 && g.crowd.walkers.get(key)?.state === 'walk') return key;
        return null;
      },
      null,
      { timeout: 60000, polling: 100 },
    )
    .then(h => h.jsonValue())
    .catch(() => null);
  if (going) {
    await page.evaluate(k => window.__game.actions.select(k), going);
    await page.waitForTimeout(300);
    const on = await page.evaluate(() => document.querySelector('#card dl')?.textContent ?? '');
    // дошёл — в карточке ни «идёт», ни срока; у двери очередь подвигается (spec 2026-10-own-hall), и он может снова пойти
    // на шаг вперёд — поэтому смотрим, что карточка это показала
    const off = await page
      .waitForFunction(
        k => {
          const g = window.__game;
          const n = g.pop.now(k);
          const text = document.querySelector('#card dl')?.textContent ?? '';
          return (!n || (n.arrive <= g.t && g.crowd.walkers.get(k)?.state !== 'walk')) && !text.includes('дойдёт') && !text.includes('идёт') ? text : null;
        },
        going,
        { timeout: 90000, polling: 100 },
      )
      .then(h => h.jsonValue())
      .catch(() => page.evaluate(() => document.querySelector('#card dl')?.textContent ?? ''));
    const there = !off.includes('дойдёт') && !off.includes('идёт');
    if (/идёт .*дойдёт к \d\d:\d\d/.test(on) && there && !off.includes('дойдёт') && !off.includes('идёт')) ok(`идёт — «${on.match(/Что делает(.*?)Срочность/)?.[1] ?? on}»; дошёл — «${off.match(/Что делает(.*?)Срочность/)?.[1] ?? off}»`);
    else fail(`идущий: «${on}» → «${off}» (дошёл: ${there})`);
    await page.evaluate(() => window.__game.actions.select(undefined));
  } else fail('нет идущего со сроком прихода');
  await page.keyboard.press('Space');
  // значки над людьми и помещениями
  const icons = await page.evaluate(() => window.__game.stage.icons.shown);
  if (icons.long + icons.unhappy > 0) ok(`значки над людьми: ${JSON.stringify(icons)}`);
  else fail(`нет значков «ждёт долго» и «недоволен»: ${JSON.stringify(icons)}`);
  // без слоя — только требующие взгляда и ваш кабинет (spec docs/specs/2026-10-owner-play.md): «Работает» и «Койки» скрыты
  const chips = await page.evaluate(() => window.__game.chips.dump());
  const rooms = await page.evaluate(() => window.__game.plan.rooms.length);
  const quiet = chips.filter(c => c.icon !== 'mine' && !['bad', 'off', 'ask', 'queue'].includes(c.tone));
  if (chips.length < rooms && quiet.length === 0) ok(`значки помещений без слоя: ${chips.length} из ${rooms} — ${chips.map(c => c.text).join(', ') || 'нет'}`);
  else fail(`значки помещений без слоя: ${JSON.stringify(chips.slice(0, 8))}`);
  // снимок: зал ожидания крупно — значки над людьми и помещениями
  const hall = await page.evaluate(() => {
    const r = window.__game.plan.rooms.find(x => x.type === 'room.waiting');
    return [r.x + r.w / 2, r.y + r.h / 2];
  });
  await page.evaluate(([x, z]) => {
    const c = window.__game.stage.cam;
    c.target.set(x + 3, 0, z);
    c.half = 13;
  }, hall);
  await page.waitForTimeout(400);
  await shotAs('e2e-flow-1.png');
  // вкладка «Пациенты»: Tab; фильтр «ждут врача»; клик — камера к человеку, карточка с путём и причиной
  await page.keyboard.press('Tab');
  await until(() => !!document.getElementById('patients'));
  await page.click('#pf-w-wait');
  await page.waitForTimeout(300);
  const rows = await page.$$eval('#patients .patrow', els => els.map(e => e.textContent ?? ''));
  if (rows.length > 0 && rows.every(t => t.includes('ждёт врача'))) ok(`вкладка «Пациенты», ждут врача: ${rows.length}; первый — «${rows[0]}»`);
  else fail(`вкладка «Пациенты»: ${JSON.stringify(rows.slice(0, 5))}`);
  // скольжение после протяжки (spec docs/specs/2026-10-aaa-polish.md, «Камера»): быстрая протяжка правой кнопкой — после
  // отпускания карта идёт дальше и останавливается сама
  await page.evaluate(() => {
    const c = window.__game.stage.cam;
    c.overview();
    c.half = 14;
  });
  await page.mouse.move(640, 380);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(560, 380, { steps: 6 });
  await page.mouse.up({ button: 'right' });
  const up = await page.evaluate(() => {
    const c = window.__game.stage.cam;
    return { gliding: c.gliding, x: c.target.x, z: c.target.z };
  });
  const stopped = await until(() => !window.__game.stage.cam.gliding, null, 15000).then(() => true, () => false);
  const end = await page.evaluate(() => {
    const t = window.__game.stage.cam.target;
    return { x: t.x, z: t.z };
  });
  const slid = Math.hypot(end.x - up.x, end.z - up.z);
  if (up.gliding && stopped && slid > 0.5) ok(`протяжка правой кнопкой — после отпускания карта скользит ещё ${slid.toFixed(1)} м и останавливается сама`);
  else fail(`скольжение после протяжки: ${JSON.stringify({ up, end, stopped })}`);
  await page.evaluate(() => window.__game.stage.cam.overview());
  await page.waitForTimeout(200);
  const cam0 = await page.evaluate(() => window.__game.stage.cam.half);
  await page.click('#patients .patrow');
  // камера долетает за полсекунды кадров; без видеокарты кадров мало — ждём, пока долетит
  await until(() => !window.__game.stage.cam.flying, null, 20000).catch(() => {});
  const fly = await page.evaluate(() => {
    const g = window.__game;
    const c = g.stage.cam;
    const w = g.crowd.walkers.get(g.selected);
    return { sel: g.selected, d: w ? Math.hypot(c.target.x - w.x, c.target.z - w.z) : -1, half: c.half };
  });
  if (fly.sel?.startsWith('p:') && fly.d >= 0 && fly.d < 2 && fly.half < cam0) ok(`клик — камера у человека (${fly.d.toFixed(2)} м, масштаб ${cam0.toFixed(0)} → ${fly.half.toFixed(1)}), он выбран`);
  else fail(`камера к человеку: ${JSON.stringify(fly)}`);
  await until(() => document.querySelectorAll('#path .plines li').length >= 2);
  const path = await page.textContent('#path');
  if (path.includes('ожидание врача') && /заняты|ждёт вас|не принимает/.test(path)) ok(`путь пациента: «${path.slice(0, 160)}…»`);
  else fail(`путь пациента без причины ожидания: «${path}»`);
  // сидя или стоя — по своему залу (spec docs/specs/2026-10-own-hall.md): зал этой больницы — в 37–63 м от кабинета
  // терапевта, его больные ждут стоя у двери кабинета; в пути — почему
  const standing = await page.evaluate(() => {
    const g = window.__game;
    const keys = [];
    for (const [key, p] of g.pop.patients()) if (p.doing === 'waiting' && p.room >= 0 && g.plan.rooms[p.room].type !== 'room.waiting') keys.push(key);
    return keys;
  });
  if (standing.length > 0) {
    await page.evaluate(k => window.__game.actions.select(k), standing[0]);
    const why = await until(() => {
      const t = document.getElementById('path')?.textContent ?? '';
      return t.includes('стоя у кабинета') ? t : null;
    }, null, 20000).then(h => h.jsonValue(), () => '');
    if (why) ok(`у двери кабинета стоят ${standing.length}; в пути — «${why.slice(why.indexOf('стоя у кабинета'), why.indexOf('стоя у кабинета') + 80)}»`);
    else fail(`стоящий у двери: в пути нет «стоя у кабинета» — «${(await page.textContent('#path')) ?? ''}»`);
    await page.evaluate(() => window.__game.actions.select(undefined));
  } else fail('у двери кабинета терапевта никто не стоит');
  // «Ушли»: путь ушедшего — почему ушёл
  await page.click('#pf-gone');
  await page.waitForTimeout(300);
  const gone = await page.$$eval('#patients .patrow', els => els.map(e => e.textContent ?? ''));
  if (gone.length > 0) {
    await page.click('#patients .patrow');
    await until(() => !!document.getElementById('path-left'), null, 10000).catch(() => {});
    const why = (await page.textContent('#path-left').catch(() => '')) ?? '';
    if (why.includes('не дождавшись') && /заняты|ждёт вас|не принимает/.test(why)) ok(`ушедший: «${gone[0]}» — «${why}»`);
    else fail(`ушедший: «${gone[0]}», почему — «${why}»`);
    await shotAs('e2e-flow-2.png');
  } else fail('«Ушли» пусто: к 13:00 ушёл хотя бы один');
  await page.click('#pf-present');
  // слой «Очереди и загрузка»: L — пол окрашен, над помещениями очередь и ожидание
  await page.click('#card .close').catch(() => {});
  await page.keyboard.press('KeyL');
  await page.waitForTimeout(400);
  const layer = await page.evaluate(() => {
    const all = window.__game.chips.dump();
    return { painted: window.__game.stage.tint.painted, all: all.length, quiet: all.filter(c => ['ok', 'busy', 'bed'].includes(c.icon)).length, chips: all.filter(c => /очередь \d+ · до/.test(c.text)).map(c => c.text) };
  });
  if (layer.painted > 0 && layer.chips.length > 0 && layer.all === rooms && layer.quiet > 0) ok(`слой «Очереди и загрузка»: окрашено ${layer.painted}, значков ${layer.all} (спокойных ${layer.quiet}), ${layer.chips.join(', ')}`);
  else fail(`слой: ${JSON.stringify(layer)}`);
  await page.keyboard.press('Tab');
  await page.evaluate(([x, z]) => {
    const c = window.__game.stage.cam;
    c.target.set(x + 6, 0, z - 2);
    c.half = 18;
  }, hall);
  await page.waitForTimeout(400);
  await shotAs('e2e-flow-3.png');
  // L по кругу (геймдизайн §3): после «Очередей» — «Отделения», «Проблемы», ещё раз — слои выключены
  await page.keyboard.press('KeyL');
  await page.keyboard.press('KeyL');
  await page.keyboard.press('KeyL');
  // ушедший, не дождавшись, идёт к выходу со значком «недоволен»
  const left0 = await page.evaluate(() => window.__game.left.length);
  await page.keyboard.press('Digit3');
  const leaving = await page
    .waitForFunction(
      n => {
        const g = window.__game;
        if (g.left.length <= n) return null;
        const key = g.pop.walkerKey(g.left[0].id);
        if (!key) return { gone: true };
        // значки считаются кадром: ушёл только что — его значок с ближайшего кадра; прежде проверка успевала, только пока
        // к выходу шёл кто-то ушедший раньше
        if (g.stage.icons.shown.unhappy === 0) return null;
        const w = g.crowd.walkers.get(key);
        return { key, angry: g.pop.leavingAngry(key), unhappy: g.stage.icons.shown.unhappy, icon: g.iconOf(w), leaving: w.leaving, clock: document.getElementById('clock')?.textContent };
      },
      left0,
      { timeout: 120000, polling: 50 },
    )
    .then(h => h.jsonValue())
    .catch(() => null);
  await page.keyboard.press('Space');
  // значок «недоволен» — первый в списке значков после «ждёт долго» (src/render/icons.ts)
  if (leaving?.key && leaving.angry && leaving.leaving && leaving.unhappy > 0 && leaving.icon === 1) ok(`ушёл, не дождавшись, — идёт к выходу со значком (${leaving.clock})`);
  else fail(`уход недовольного: ${JSON.stringify(leaving)}`);
}
