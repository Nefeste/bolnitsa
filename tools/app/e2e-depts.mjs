// Сценарий в браузере, часть 28 — отделения на карте (spec docs/specs/2026-10-departments.md, часть 2, «Проверки»; часть 27
// — у сложности). Городская больница: у дверей помещений отделений — полосы; стройка, «Отделение» — список отделений,
// призрак над палатой «Палата → Хирургия», щелчок переводит её без пересборки сцены, табличка — «Хирургия»; над
// операционной — «не переводится»; Ctrl+Z — снова терапия, и палата не закрыта на перестройку. Слой «Отделения» — пол всех
// помещений и легенда, подписи видны; L — по кругу. Карточка палаты — «Хирургия · отмечено инструментом», «Без отметки» в
// ней — снова терапия «по виду помещения». «Пациенты»: фильтр по отделению делит список без остатка. Снимки —
// `e2e-depts-*.jpg`.
import { join } from 'node:path';

/** @param {{ page: import('playwright-core').Page, port: number, out: string, ok: (m: string) => void, fail: (m: string) => void, q: string, shots: string }} x */
export async function deptsPart({ page, port, out, ok, fail, q, shots }) {
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
  const look = async (x, y, half = 8) => {
    await page.evaluate(([cx, cy, h]) => {
      const g = window.__game;
      g.stage.cam.target.set(cx, 0, cy);
      g.stage.cam.half = h;
    }, [x, y, half]);
    await frames();
  };
  const at = (x, y) => page.evaluate(([cx, cy]) => window.__game.stage.screenOfCell(cx, cy), [x, y]);
  /** Строка призрака на экране — та, что у стройки сейчас. */
  const settled = () => until(() => (document.getElementById('ghost')?.textContent ?? '') === (window.__game.builder.ghost?.text ?? ''));
  const ghost = async () => {
    await settled();
    return page.$eval('#ghost', el => ({ ok: el.classList.contains('ok'), text: el.textContent ?? '' })).catch(() => ({ ok: false, text: '' }));
  };
  /** Навести курсор на клетку и дождаться призрака. */
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
  /** Середина помещения вида `type` — первого по плану. */
  const roomOf = type =>
    page.evaluate(t => {
      const g = window.__game;
      const i = g.plan.rooms.findIndex(r => r.type === t);
      const r = g.plan.rooms[i];
      return { id: r.id, i, x: r.x + Math.floor(r.w / 2), y: r.y + Math.floor(r.h / 2) };
    }, type);
  const deptAt = i => page.evaluate(n => window.__game.depts[n] ?? null, i);
  const labelDept = id => page.evaluate(r => document.querySelector(`.rlabel[data-room="${r}"] .rdept`)?.textContent ?? null, id);

  await page.goto(`http://127.0.0.1:${port}/index.html?q=${q}&lang=ru&hospital=preset&seed=3&flow=12,0`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  await page.evaluate(() => window.__game.actions.doctor({ kind: 'autopause', on: false }));

  // ---------------------------------------------------------------- полосы у дверей
  const s0 = await page.evaluate(() => {
    const g = window.__game;
    const withDoor = g.plan.rooms.filter((r, i) => g.depts[i] !== undefined && r.door.length > 0).length;
    return { stripes: g.stage.stripes.count, withDoor, depts: [...new Set(g.depts.filter(d => d))].length, rooms: g.plan.rooms.length };
  });
  if (s0.withDoor > 0 && s0.stripes === s0.withDoor) ok(`полосы у дверей: ${s0.stripes} — у всех помещений отделений с дверью; отделений в больнице ${s0.depts}, помещений ${s0.rooms}`);
  else fail(`полосы у дверей: ${JSON.stringify(s0)}`);

  // ---------------------------------------------------------------- стройка: «Отделение»
  await page.keyboard.press('KeyB');
  await page.click('#tool-dept');
  const list = await page.$$eval('#dept-list button', els => els.map(e => (e.textContent ?? '').trim()));
  if (list.join('|') === 'Терапия|Хирургия|Неврология|Инфекционное отделение|Без отметки') ok(`«Отделение»: ${list.join(', ')}`);
  else fail(`список «Отделения»: ${JSON.stringify(list)}`);
  const g0 = await ghost();
  if (g0.text === 'Выберите отделение — и щёлкните по палате или кабинету') ok(`без выбора: «${g0.text}»`);
  else fail(`без выбора: ${JSON.stringify(g0)}`);
  await page.click('#dept-surgery');
  const ward = await roomOf('room.ward');
  await look(ward.x, ward.y, 8);
  await page.evaluate(() => {
    window.__layout0 = window.__game.layout;
  });
  const p = await hover(ward.x, ward.y);
  const g1 = await ghost();
  if (g1.ok && g1.text === 'Палата → Хирургия · бесплатно') ok(`призрак над палатой: «${g1.text}»`);
  else fail(`призрак над палатой: ${JSON.stringify(g1)}`);
  await page.mouse.click(p.x, p.y);
  await until(id => window.__game.hospital.site.rooms.find(r => r.id === id)?.dept === 'dept.surgery', ward.id);
  await until(id => document.querySelector(`.rlabel[data-room="${id}"] .rdept`)?.textContent === 'Хирургия', ward.id, 10000).catch(() => {});
  const after = await page.evaluate(() => ({ same: window.__game.layout === window.__layout0, editing: window.__game.hospital.site.editing ?? null }));
  const result = flat(await page.textContent('#result').catch(() => ''));
  const d1 = await deptAt(ward.i);
  const l1 = await labelDept(ward.id);
  if (d1 === 'dept.surgery' && l1 === 'Хирургия' && after.same && after.editing === null && result === 'Отделение помещения изменено') {
    ok(`щелчок: палата — в хирургии, табличка «${l1}», «${result}»; сцена та же, палата не закрыта на перестройку (снимок ${await shot('e2e-depts-1.jpg')} КБ)`);
  } else fail(`щелчок по палате: ${JSON.stringify({ d1, l1, after, result })}`);
  const g2 = await ghost();
  if (!g2.ok && g2.text === 'Палата: отделение уже «Хирургия»') ok(`ещё раз: «${g2.text}»`);
  else fail(`ещё раз над той же палатой: ${JSON.stringify(g2)}`);
  const or = await roomOf('room.or');
  await look(or.x, or.y, 8);
  await hover(or.x, or.y);
  const g3 = await ghost();
  if (!g3.ok && g3.text.includes('по виду помещения, не переводится')) ok(`над операционной: «${g3.text}»`);
  else fail(`над операционной: ${JSON.stringify(g3)}`);
  await page.keyboard.press('Control+KeyZ');
  await until(id => window.__game.hospital.site.rooms.find(r => r.id === id)?.dept === undefined, ward.id);
  const undone = await page.evaluate(() => ({ same: window.__game.layout === window.__layout0, editing: window.__game.hospital.site.editing ?? null }));
  const d2 = await deptAt(ward.i);
  if (d2 === 'dept.therapy' && undone.same && undone.editing === null) ok('Ctrl+Z: палата снова в терапии, сцена та же, палата не закрыта');
  else fail(`Ctrl+Z: ${JSON.stringify({ d2, undone })}`);
  // снова в хирургию — для слоя и карточки
  await look(ward.x, ward.y, 8);
  const p2 = await hover(ward.x, ward.y);
  await page.mouse.click(p2.x, p2.y);
  await until(id => window.__game.hospital.site.rooms.find(r => r.id === id)?.dept === 'dept.surgery', ward.id);
  await page.keyboard.press('KeyB');

  // ---------------------------------------------------------------- слой «Отделения»
  await page.click('#layers');
  await page.click('#layer-depts');
  await until(() => window.__game.stage.deptTint.painted === window.__game.plan.rooms.length, null, 5000).catch(() => {});
  // подписи показывает кадр игры, а не щелчок: дождаться кадра
  await until(() => getComputedStyle(document.querySelector('.labels')).display === 'block', null, 5000).catch(() => {});
  const layer = await page.evaluate(() => {
    const g = window.__game;
    return {
      painted: g.stage.deptTint.painted, rooms: g.plan.rooms.length, queues: g.store.get().layers.queues,
      legend: [...document.querySelectorAll('#dept-legend li')].map(li => (li.textContent ?? '').replace(/[\s  ]+/g, ' ').trim()),
      labels: getComputedStyle(document.querySelector('.labels')).display, signs: document.querySelectorAll('.rlabel .rdept').length,
    };
  });
  const surgery = layer.legend.find(x => x.startsWith('Хирургия'));
  if (layer.painted === layer.rooms && !layer.queues && surgery && layer.legend[layer.legend.length - 1].startsWith('Без отделения') && layer.labels === 'block' && layer.signs > 0) {
    ok(`слой «Отделения»: пол ${layer.painted} помещений из ${layer.rooms}, легенда — ${layer.legend.join('; ')}; табличек ${layer.signs}`);
  } else fail(`слой «Отделения»: ${JSON.stringify(layer)}`);
  // легенда — своя панель справа внизу: видна и при закрытом меню «Слои», не ложится ни на какую панель (на 1280 × 720 в
  // меню слева она вытесняла «Показатели» за край экрана и закрывала окно врача)
  await page.click('#layers');
  await page.evaluate(() => window.__game.actions.overview());
  await frames();
  const place = await page.evaluate(() => {
    const box = el => {
      const r = el?.getBoundingClientRect();
      return r && r.width > 0 ? { l: r.left, t: r.top, r: r.right, b: r.bottom } : null;
    };
    const legend = box(document.getElementById('dept-legend-panel'));
    const others = ['#left', '#dock', '#right', '#card'].map(s => [s, box(document.querySelector(s))]).filter(([, b]) => b);
    const hit = legend ? others.filter(([, b]) => b.l < legend.r && legend.l < b.r && b.t < legend.b && legend.t < b.b).map(([s]) => s) : [];
    return { legend, menu: !!document.getElementById('layers-menu'), hit, w: innerWidth, h: innerHeight, rows: document.querySelectorAll('#dept-legend li').length };
  });
  const inside = place.legend && place.legend.l >= 0 && place.legend.t >= 0 && place.legend.r <= place.w && place.legend.b <= place.h;
  if (inside && !place.menu && place.hit.length === 0 && place.rows === layer.legend.length)
    ok(`легенда при закрытом меню: справа внизу (${Math.round(place.legend.l)}–${Math.round(place.legend.r)} × ${Math.round(place.legend.t)}–${Math.round(place.legend.b)} на ${place.w} × ${place.h}), ни на какую панель не ложится (снимок ${await shot('e2e-depts-2.jpg')} КБ)`);
  else fail(`легенда при закрытом меню: ${JSON.stringify(place)}`);
  // L — по кругу: «Отделения» → выключены → «Очереди» → «Отделения»
  const layersNow = () => page.evaluate(() => {
    const l = window.__game.store.get().layers;
    return `${l.queues ? 'q' : '-'}${l.depts ? 'd' : '-'}`;
  });
  const seq = [];
  for (let k = 0; k < 3; k++) {
    await page.keyboard.press('KeyL');
    seq.push(await layersNow());
  }
  if (seq.join(' ') === '-- q- -d') ok(`L по кругу: ${seq.join(' → ')}`);
  else fail(`L по кругу: ${seq.join(' → ')}`);

  // ---------------------------------------------------------------- карточка палаты
  await page.evaluate(id => window.__game.selectRoomId(id), ward.id);
  await page.waitForSelector('#card-dept', { timeout: 5000 });
  const c1 = flat(await page.textContent('#card-dept'));
  if (c1.startsWith('Хирургия · отмечено инструментом')) ok(`карточка палаты: «${c1.slice(0, 40)}…»`);
  else fail(`карточка палаты: «${c1}»`);
  await page.selectOption('#card-dept-pick', '');
  await until(() => document.getElementById('card-dept-name')?.textContent === 'Терапия', null, 10000).catch(() => {});
  const c2 = flat(await page.textContent('#card-dept'));
  if (c2.startsWith('Терапия · по виду помещения')) ok(`«Без отметки» в карточке: «${c2.slice(0, 40)}…»`);
  else fail(`«Без отметки» в карточке: «${c2}»`);
  await page.keyboard.press('Escape');

  // ---------------------------------------------------------------- «Пациенты»: фильтр по отделению
  await page.keyboard.press('Digit3');
  await until(() => window.__game.store.get().arrived >= 12, null, 240000).catch(() => {});
  await page.evaluate(() => window.__game.setSpeed(0));
  await page.keyboard.press('Tab');
  await page.waitForSelector('#pf-dept', { timeout: 10000 });
  const values = await page.$$eval('#pf-dept option', els => els.map(e => ({ v: e.value, t: e.textContent ?? '' })));
  const counts = [];
  for (const o of values) {
    await page.selectOption('#pf-dept', o.v);
    await until(v => window.__game.store.get().patientFilter.dept === v, o.v);
    await frames();
    counts.push({ t: o.t, n: await page.$$eval('#patients .patrow', els => els.length) });
  }
  await page.selectOption('#pf-dept', 'all');
  const all = counts[0]?.n ?? 0;
  const parts = counts.slice(1).reduce((s, c) => s + c.n, 0);
  if (values[0]?.v === 'all' && all > 0 && parts === all && counts.slice(1).some(c => c.n > 0)) ok(`фильтр «Пациентов»: ${counts.map(c => `${c.t} — ${c.n}`).join(', ')}; отделения делят список без остатка`);
  else fail(`фильтр «Пациентов»: ${JSON.stringify(counts)}`);
}
