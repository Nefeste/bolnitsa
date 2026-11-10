// Сценарий в браузере, часть 43 — техники и поломки в работе (spec docs/specs/2026-11-technicians.md, часть 2). Готовая
// городская больница, зерно 447: жребий поломки зависит только от зерна — рентген ломается в 10:41 вторых суток (при 231 — в 08:11,
// но нанятый техник там заболевает на вторые сутки: болезнь — раз в 60 смен, по жребию на человека и день). Карточка
// ординаторской: «Техник» на день и на ночь, подпись «без него … сервис»; «Нанять» на день. «До утра» — планёрка; к 10:41 на ×12:
// у рентгена — поломка, в карточке его кабинета — «Аппараты: … поломка в 10:41 — чинит техник, закончит к …», в «Проблемах» —
// строка кабинета с тем же; техник — в «Персонале» «ремонт до …», в его карточке — «ремонт … рентгеновского аппарата», его фигура
// — в кабинете рентгена; к сроку — «работает · обслуживали сегодня»; «До утра» — на планёрке «Поломки: 1 — починено техником 1».
// Снимки — `e2e-technicians-1-card.jpg`, `e2e-technicians-2-meeting.jpg`.
import { join } from 'node:path';

/** @param {{ page: import('playwright-core').Page, port: number, out: string, ok: (m: string) => void, fail: (m: string) => void, q: string, shots: string }} x */
export async function techniciansPart({ page, port, out, ok, fail, q, shots }) {
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
  const flat = s => (s ?? '').replace(/\s+/g, ' ').trim();
  const hhmm = t => new Date(t * 1000).toISOString().slice(11, 16);
  /** «До утра» — до планёрки: своя карта или другое окно кассы мешают — закрыть, автопауза — дальше. */
  const toMeeting = async () => {
    const t0 = Date.now();
    await page.click('#speed-ff');
    for (;;) {
      const h = await page.evaluate(() => ({ meeting: !!document.getElementById('meeting'), open: window.__game.store.get().economy?.open ?? false, ff: window.__game.ff, speed: window.__game.speed, card: window.__game.doctor.open }));
      if (h.meeting || Date.now() - t0 > 300000) break;
      if (h.card || h.open) await page.keyboard.press('Escape');
      else if (!h.ff && h.speed === 0) await page.click('#speed-ff');
      await page.waitForTimeout(200);
    }
    return !!(await page.$('#meeting'));
  };
  /** Рентген из потока расчёта: «помещение:место», сломан ли и с какого часа, работа техника. */
  const xray = () => page.evaluate(() => window.__game.repairs.find(d => d.eq.startsWith('eq.xray')) ?? null);

  // «Управляющий»: своих больных нет — своя карта не держит часы; автопауза выключена
  await page.goto(`http://127.0.0.1:${port}/index.html?q=${q}&lang=ru&hospital=preset&seed=447&flow=6,1&role=manager`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  await page.evaluate(() => window.__game.actions.doctor({ kind: 'autopause', on: false }));

  // ---------------------------------------------------------------- ординаторская: «Техник» на день и на ночь, нанять на день
  const staffRoom = await page.evaluate(() => window.__game.hospital.site.rooms.find(r => r.type === 'room.staff').id);
  await page.evaluate(id => window.__game.selectRoomId(id), staffRoom);
  await page.waitForSelector('#hire-technician', { timeout: 10000 }).catch(() => {});
  const card = flat(await page.textContent('#card').catch(() => ''));
  if (card.includes('Техник') && card.includes('сломанный аппарат чинит сервис') && (await page.$('#hire-technician-night'))) ok(`ординаторская: «Техник» на день и на ночь — «${card.slice(card.indexOf('Техник'), card.indexOf('Техник') + 140)}»`);
  else fail(`ординаторская без «Техника»: «${card.slice(0, 300)}»`);
  await page.click('#hire-technician');
  await until(() => window.__game.staff.some(m => m.role === 'role.technician' && m.shift === 'day'), null, 10000).catch(() => {});
  const tech = await page.evaluate(() => window.__game.staff.find(m => m.role === 'role.technician') ?? null);
  if (tech) ok(`нанят техник на дневную смену: навык ${tech.skill}, место — ординаторская`);
  else {
    fail('техник не нанят');
    return;
  }
  await page.keyboard.press('Escape');

  // ---------------------------------------------------------------- «До утра», планёрка вторых суток
  if (await toMeeting()) ok('«До утра» — планёрка вторых суток');
  else {
    fail('«До утра»: планёрки нет');
    return;
  }
  await page.click('#meeting-close');

  // ---------------------------------------------------------------- 10:41: рентген ломается, техник идёт чинить
  await page.keyboard.press('Digit3');
  await until(() => window.__game.repairs.some(d => d.eq.startsWith('eq.xray') && d.broken), null, 60000).catch(() => {});
  // техник мог быть на обходе другого аппарата: к рентгену — когда кончит
  await until(() => window.__game.repairs.some(d => d.eq.startsWith('eq.xray') && d.job?.kind === 'repair'), null, 60000).catch(() => {});
  await page.evaluate(() => window.__game.setSpeed(0));
  const d = await xray();
  if (d?.broken && d.broken.since !== undefined && hhmm(d.broken.since) === '10:41' && d.job?.by === tech.id) ok(`рентген (${d.key}) сломался в ${hhmm(d.broken.since)}; техник вышел в ${hhmm(d.job.since)}, дойдёт к ${hhmm(d.job.reach)}, закончит к ${hhmm(d.job.done)}`);
  else {
    fail(`рентген: ${JSON.stringify(d)}`);
    return;
  }
  // карточка кабинета: «Аппараты» — кто чинит и к какому часу
  await page.evaluate(id => window.__game.selectRoomId(id), d.room);
  await page.waitForSelector('#card-devices', { timeout: 10000 }).catch(() => {});
  const devices = flat(await page.textContent('#card-devices').catch(() => ''));
  const state = flat(await page.textContent('#room-state').catch(() => ''));
  if (state === 'не работает: аппарат сломан') ok(`карточка кабинета: «${state}» — как значок над картой`);
  else fail(`карточка кабинета, состояние: «${state}»`);
  if (devices.includes(`поломка в 10:41 — чинит техник, закончит к ${hhmm(d.job.done)}`)) ok(`карточка кабинета, «Аппараты»: «${devices}» (снимок ${await shot('e2e-technicians-1-card.jpg')} КБ)`);
  else fail(`карточка кабинета, «Аппараты»: «${devices}»`);
  await page.keyboard.press('Escape');
  // «Проблемы»: строка кабинета — с тем же
  await page.click('#layers');
  await page.click('#layer-problems');
  await until(id => window.__game.store.get().problems.rows.some(r => r.key === `r:${id}`), d.room, 10000).catch(() => {});
  const row = await page.evaluate(id => window.__game.store.get().problems.rows.find(r => r.key === `r:${id}`) ?? null, d.room);
  if (row && row.level === 'bad' && row.what.includes(`поломка — чинит техник, к ${hhmm(d.job.done)}`)) ok(`«Проблемы»: «${row.where} — ${row.what}»`);
  else fail(`«Проблемы»: ${JSON.stringify(row)}`);
  // слой — выключить тем же действием, что кнопка в меню «Слои», и меню закрыть
  await page.evaluate(() => window.__game.actions.toggleProblems());
  await page.evaluate(() => window.__game.actions.toggleLayers());
  // «Персонал» и карточка техника
  const staffRow = await page.evaluate(id => window.__game.store.get().staffList.find(r => r.key === `s:${id}`)?.text ?? '', tech.id);
  if (staffRow.includes(`ремонт до ${hhmm(d.job.done)}`)) ok(`«Персонал»: «${staffRow}»`);
  else fail(`«Персонал»: «${staffRow}»`);
  // к часу, когда дойдёт, — он в кабинете рентгена
  await page.keyboard.press('Digit1');
  await until(t => window.__game.t >= t, d.job.reach + 60, 60000).catch(() => {});
  await until(([key, room]) => {
    const g = window.__game;
    const w = g.pop.crowd.walkers.get(key);
    const r = g.plan.rooms.find(x => x.id === room);
    if (!w || !r) return false;
    const cx = Math.floor(w.x);
    const cy = Math.floor(w.z);
    return cx > r.x && cy > r.y && cx < r.x + r.w - 1 && cy < r.y + r.h - 1 && w.state !== 'walk';
  }, [`s:${tech.id}`, d.room], 30000).catch(() => {});
  await page.evaluate(() => window.__game.setSpeed(0));
  const at = await page.evaluate(([key, room]) => {
    const g = window.__game;
    const w = g.pop.crowd.walkers.get(key);
    const r = g.plan.rooms.find(x => x.id === room);
    return w && r ? { cell: [Math.floor(w.x), Math.floor(w.z)], room: [r.x, r.y, r.w, r.h], state: w.state } : null;
  }, [`s:${tech.id}`, d.room]);
  if (at && at.cell[0] > at.room[0] && at.cell[1] > at.room[1] && at.cell[0] < at.room[0] + at.room[2] - 1 && at.cell[1] < at.room[1] + at.room[3] - 1) ok(`техник — в кабинете рентгена у аппарата: клетка ${at.cell.join(', ')}`);
  else fail(`техник не в кабинете рентгена: ${JSON.stringify(at)}`);
  await page.evaluate(id => window.__game.actions.select(`s:${id}`), tech.id);
  await page.waitForSelector('#card', { timeout: 10000 }).catch(() => {});
  const person = flat(await page.textContent('#card').catch(() => ''));
  if (person.includes('ремонт цифрового рентгеновского аппарата') && person.includes(`закончит к ${hhmm(d.job.done)}`)) ok(`карточка техника: «${person.slice(person.indexOf('ремонт'), person.indexOf('ремонт') + 120)}»`);
  else fail(`карточка техника: «${person.slice(0, 400)}»`);
  await page.keyboard.press('Escape');

  // ---------------------------------------------------------------- починил: рентген работает, износ с нуля
  await page.keyboard.press('Digit3');
  await until(t => window.__game.t >= t, d.job.done + 120, 120000).catch(() => {});
  await page.evaluate(() => window.__game.setSpeed(0));
  const after = await xray();
  await page.evaluate(id => window.__game.selectRoomId(id), d.room);
  await page.waitForSelector('#card-devices', { timeout: 10000 }).catch(() => {});
  const fixedLine = flat(await page.textContent('#card-devices').catch(() => ''));
  if (after && !after.broken && after.wear === 0 && fixedLine.includes('работает · обслуживали сегодня')) ok(`к ${hhmm(d.job.done)} — починен: «${fixedLine}»`);
  else fail(`после ремонта: ${JSON.stringify(after)}, «${fixedLine}»`);
  await page.keyboard.press('Escape');

  // ---------------------------------------------------------------- планёрка третьих суток: «Поломки»
  if (!(await toMeeting())) {
    fail('«До утра»: планёрки третьих суток нет');
    return;
  }
  const line = flat(await page.textContent('#meet-repairs').catch(() => ''));
  if (/^Поломки: \d+ — починено техником \d+, сервисом \d+; ремонт — /.test(line) && /починено техником [1-9]/.test(line)) ok(`планёрка: «${line}» (снимок ${await shot('e2e-technicians-2-meeting.jpg')} КБ)`);
  else fail(`планёрка, «Поломки»: «${line}»`);
  await page.click('#meeting-close');
}
