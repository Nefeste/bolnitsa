// Сценарий в браузере (spec docs/specs/2026-10-shell-3d.md, «Тесты»; стройка — docs/specs/2026-10-build.md, «Тесты»):
// Chromium без окна (Playwright, браузер из PLAYWRIGHT_BROWSERS_PATH) открывает dist/.
// Часть 1 — готовая больница: страница грузится, больница видна, люди есть, клик по человеку открывает карточку, скорость
// меняется клавишами, стены переключаются. Часть 2 — пустое здание: мышью шесть помещений (регистратура, зона ожидания,
// кабинет врача, ординаторская, процедурный, лаборатория) — протяжкой, «Обставить», двери, найм; предмет — красный
// призрак на занятом, R, взять и переставить, снос, Ctrl+Z, Esc, ПКМ; двойная дверь палаты; часы идут — пациенты
// приходят, их принимают. Часть 3 — люди и поток (spec docs/specs/2026-10-flow-ui.md): готовая больница к 13:00 —
// пациенты ходят, значки «ждёт долго» и «недоволен», значки помещений; вкладка «Пациенты» (Tab) — фильтр, клик — камера
// летит к человеку, в карточке — путь с причиной ожидания; «Ушли» — путь ушедшего и почему; слой «Очереди и загрузка» (L);
// ушедший, не дождавшись, идёт к выходу со значком. Ошибок в консоли и запросов наружу нет.
// Снимки — tools/app/out/e2e.png, e2e-build-*.png и e2e-flow-*.png; `--shots high` — снимки частей 2 и 3 в этом качестве
// (на время снимка).
//   node tools/app/e2e.mjs [--q low|medium|high] [--headed] [--only 1|2|3] [--shots low|medium|high] [--port 8093]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { findChromium } from './e2e-lib.mjs';
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
    await page.evaluate(x => window.__game.actions.setQuality(x), q);
    await page.evaluate(() => new Promise(r => {
      let n = 0;
      const f = () => (++n >= 4 ? r() : requestAnimationFrame(f));
      requestAnimationFrame(f);
    }));
  }
  await page.screenshot({ path: join(out, name) });
  if (q) await page.evaluate(x => window.__game.actions.setQuality(x), arg('q', 'low'));
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

const only = arg('only', '');
const run = n => !only || only === String(n);
try {
  if (run(1)) await partOne();
  if (run(2)) await partTwo();
  if (run(3)) await partThree();
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
  await page.goto(`http://127.0.0.1:${port}/index.html?q=${arg('q', 'low')}&lang=ru&hospital=preset`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  ok('страница загрузилась, первый кадр нарисован');
  // дать потоку расчёта и людям пожить: ×4 на несколько секунд
  await page.keyboard.press('Digit3');
  await page.waitForTimeout(6000);
  const s = await page.evaluate(() => {
    const g = window.__game;
    return {
      rooms: g.layout.plan.rooms.length,
      things: g.layout.things.length,
      people: g.crowd.walkers.size,
      staff: g.staff.length,
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
  if (s.speed === 4 && s.t > 8 * 3600) ok(`часы идут: ${s.clock}, ×${s.speed}`);
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
    if (title) ok(`клик по человеку — карточка: «${title}»`);
    else fail('клик по человеку не открыл карточку');
  } else fail('не нашёл человека в кадре');
  // стены вниз и обратно
  await page.click('#walls-down');
  const mode = await page.evaluate(() => window.__game.stage.walls.uniforms.uMode.value);
  if (mode === 2) ok('стены — вниз');
  else fail('стены не переключились');
  await page.click('#walls-cut');
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
  await page.keyboard.press('KeyB');
  if (await page.$('#tool-room')) ok('B — стройка открыта');
  else fail('B не открыл стройку');
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
    // «Обставить» в карточке нового помещения
    await until(() => !!document.getElementById('card-furnish'));
    await page.click('#card-furnish');
    await until(rid => window.__game.hospital.site.rooms.find(r => r.id === rid)?.items.length > 0, id);
    // дверь — посередине нижней стены
    if (last) await look(x + w / 2, y + h / 2);
    await tool('door');
    const d = await at(x + Math.floor(w / 2), y + h - 1);
    await page.mouse.move(d.x, d.y);
    await page.waitForTimeout(120);
    await page.mouse.click(d.x, d.y);
    await until(rid => !!window.__game.hospital.site.rooms.find(r => r.id === rid)?.door, id);
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

  // выйти из стройки — открыто; часы ×4 — приходят и принимают
  await page.keyboard.press('KeyB');
  await until(() => !document.getElementById('closed'));
  const working = await page.evaluate(() => [...window.__game.working].length);
  if (working >= 6) ok(`стройка закрыта (B): работают ${working} помещений, больница открыта`);
  else fail(`работают ${working}`);
  await look(24, 16, 16);
  await page.keyboard.press('Digit3');
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
  await page.goto(`http://127.0.0.1:${port}/index.html?q=${arg('q', 'low')}&lang=ru&hospital=preset&start=13`);
  await page.waitForFunction(() => window.__started === true, null, { timeout: 240000 });
  const until = (fn, a, ms = 20000) => page.waitForFunction(fn, a, { timeout: ms });
  ok(`люди и поток: ${await page.textContent('#clock')}`);
  // пациенты ходят: на ×4 кто-то идёт по срезу — пришёл, позвали к врачу, на обследование (кадров без видеокарты мало)
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
  await page.keyboard.press('Space');
  // значки над людьми и помещениями
  const icons = await page.evaluate(() => window.__game.stage.icons.shown);
  if (icons.long + icons.unhappy > 0) ok(`значки над людьми: ${JSON.stringify(icons)}`);
  else fail(`нет значков «ждёт долго» и «недоволен»: ${JSON.stringify(icons)}`);
  const chips = await page.evaluate(() => window.__game.chips.dump());
  const rooms = await page.evaluate(() => window.__game.plan.rooms.length);
  const queue = chips.filter(c => c.icon === 'queue');
  if (chips.length === rooms && queue.length > 0 && chips.some(c => ['ok', 'busy', 'bed', 'mine'].includes(c.icon))) ok(`значки помещений: ${chips.length}; ${queue.map(c => c.text).join(', ')}`);
  else fail(`значки помещений: ${JSON.stringify(chips.slice(0, 8))}`);
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
  const rows = await page.$$eval('#patients .prow', els => els.map(e => e.textContent ?? ''));
  if (rows.length > 0 && rows.every(t => t.includes('ждёт врача'))) ok(`вкладка «Пациенты», ждут врача: ${rows.length}; первый — «${rows[0]}»`);
  else fail(`вкладка «Пациенты»: ${JSON.stringify(rows.slice(0, 5))}`);
  await page.evaluate(() => window.__game.stage.cam.overview());
  await page.waitForTimeout(200);
  const cam0 = await page.evaluate(() => window.__game.stage.cam.half);
  await page.click('#patients .prow');
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
  await shotAs('e2e-flow-2.png');
  // «Ушли»: путь ушедшего — почему ушёл
  await page.click('#pf-gone');
  await page.waitForTimeout(300);
  const gone = await page.$$eval('#patients .prow', els => els.map(e => e.textContent ?? ''));
  if (gone.length > 0) {
    await page.click('#patients .prow');
    await until(() => !!document.getElementById('path-left'), null, 10000).catch(() => {});
    const why = (await page.textContent('#path-left').catch(() => '')) ?? '';
    if (why.includes('не дождавшись') && /заняты|ждёт вас|не принимает/.test(why)) ok(`ушедший: «${gone[0]}» — «${why}»`);
    else fail(`ушедший: «${gone[0]}», почему — «${why}»`);
  } else fail('«Ушли» пусто: к 13:00 ушёл хотя бы один');
  await page.click('#pf-present');
  // слой «Очереди и загрузка»: L — пол окрашен, над помещениями очередь и ожидание
  await page.click('#card .close').catch(() => {});
  await page.keyboard.press('KeyL');
  await page.waitForTimeout(400);
  const layer = await page.evaluate(() => ({ painted: window.__game.stage.tint.painted, chips: window.__game.chips.dump().filter(c => /очередь \d+ · до/.test(c.text)).map(c => c.text) }));
  if (layer.painted > 0 && layer.chips.length > 0) ok(`слой «Очереди и загрузка»: окрашено ${layer.painted}, ${layer.chips.join(', ')}`);
  else fail(`слой: ${JSON.stringify(layer)}`);
  await page.keyboard.press('Tab');
  await page.evaluate(([x, z]) => {
    const c = window.__game.stage.cam;
    c.target.set(x + 6, 0, z - 2);
    c.half = 18;
  }, hall);
  await page.waitForTimeout(400);
  await shotAs('e2e-flow-3.png');
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
        return key ? { key, angry: g.pop.leavingAngry(key), unhappy: g.stage.icons.shown.unhappy, leaving: g.crowd.walkers.get(key).leaving, clock: document.getElementById('clock')?.textContent } : { gone: true };
      },
      left0,
      { timeout: 120000, polling: 50 },
    )
    .then(h => h.jsonValue())
    .catch(() => null);
  await page.keyboard.press('Space');
  if (leaving?.key && leaving.angry && leaving.leaving && leaving.unhappy > 0) ok(`ушёл, не дождавшись, — идёт к выходу со значком (${leaving.clock})`);
  else fail(`уход недовольного: ${JSON.stringify(leaving)}`);
}
