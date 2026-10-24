// Сценарий в браузере, часть 8 — специалисты в потоке (spec docs/specs/2026-10-specialists.md, «Проверки»). Поликлиника,
// поток от больницы: в 08:00 часы на паузе — в карточке третьего кабинета «Уволить» терапевта, на месте врача — список
// четырёх должностей с зарплатой и «Нанять»; «гастроэнтеролог» встаёт на место. Часы ×12: к нему записываются — во вкладке
// «Пациенты» и в карточке пациента «по записи к гастроэнтерологу». Снимок — `e2e-spec-1.jpg`.
import { join } from 'node:path';

/** @param {{ page: import('playwright-core').Page, port: number, out: string, ok: (m: string) => void, fail: (m: string) => void, q: string, shots: string }} x */
export async function specialistsPart({ page, port, out, ok, fail, q, shots }) {
  const until = (fn, a, ms = 30000) => page.waitForFunction(fn, a, { timeout: ms });
  /** Снимок: JPEG, в качестве `--shots` (для документов) или как есть. */
  const shot = async name => {
    if (shots) {
      await page.evaluate(x => window.__game.actions.setQuality(x), shots);
      await page.waitForTimeout(400);
    }
    const buf = await page.screenshot({ path: join(out, name), type: 'jpeg', quality: 72 });
    if (shots) await page.evaluate(x => window.__game.actions.setQuality(x), q);
    return Math.round(buf.length / 1024);
  };

  await page.goto(`http://127.0.0.1:${port}/index.html?q=${q}&lang=ru&hospital=poly`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  // пауза: в 08:00 терапевт ещё свободен — его можно уволить
  await page.keyboard.press('Space');
  await until(() => window.__game.store.get().speed === 0);
  const office = await page.evaluate(() => window.__game.hospital.site.rooms.filter(r => r.type === 'room.office')[2].id);
  await page.evaluate(id => window.__game.selectRoomId(id), office);
  await until(() => !!document.querySelector('#dismiss-doctor'));
  await page.click('#dismiss-doctor');
  await until(() => !!document.querySelector('#hire-doctor-as'));
  const options = await page.$$eval('#hire-doctor-as option', els => els.map(e => ({ role: e.getAttribute('value'), text: e.textContent ?? '' })));
  await page.selectOption('#hire-doctor-as', 'role.gastroenterologist');
  const hint = (await page.getAttribute('#hire-doctor', 'title')) ?? '';
  if (
    // терапевт первым, специалисты — по номеру должности
    JSON.stringify(options.map(o => o.role)) === JSON.stringify(['role.therapist', 'role.endocrinologist', 'role.gastroenterologist', 'role.infectionist']) &&
    // зарплата — за смену (spec docs/specs/2026-10-staff-shifts.md)
    options.every(o => /₽ за смену/.test(o.text)) && hint.includes('своя запись')
  ) ok(`на месте врача — список: ${options.map(o => `«${o.text}»`).join(', ')}; подсказка гастроэнтеролога — «${hint.slice(0, 60)}…»`);
  else fail(`выбор должности: ${JSON.stringify({ options, hint })}`);
  await page.click('#hire-doctor');
  await until(id => window.__game.staff.some(m => m.room === id && m.role === 'role.gastroenterologist'), office);
  const who = await page.textContent('#card .post').catch(() => '');
  if (who?.includes('Гастроэнтеролог · 3')) ok(`в кабинете — «${who.replace(/\s+/g, ' ').trim()}»`);
  else fail(`кто в кабинете: «${who}»`);
  await page.click('#card .close').catch(() => {});

  // часы ×12: к гастроэнтерологу записываются — «по записи к гастроэнтерологу» в «Пациентах» и в карточке
  await page.keyboard.press('Digit3');
  await page.keyboard.press('Tab');
  await until(() => !!document.getElementById('patients'));
  const booked = 'по записи к гастроэнтерологу';
  await until(t => [...document.querySelectorAll('#patients .patrow')].some(e => (e.textContent ?? '').includes(t)), booked, 180000);
  const row = await page.$$eval('#patients .patrow', (els, t) => els.map(e => e.textContent ?? '').find(x => x.includes(t)) ?? '', booked);
  ok(`«Пациенты»: «${row}»`);
  await page.keyboard.press('Space');
  await page.locator('#patients .patrow', { hasText: booked }).first().click();
  await until(t => (document.getElementById('card')?.textContent ?? '').includes(t), booked);
  const card = (await page.textContent('#card')) ?? '';
  const kb = await shot('e2e-spec-1.jpg');
  if (card.includes(`Визит${booked}`) || card.includes(booked)) ok(`карточка пациента: «${booked}» (снимок ${kb} КБ)`);
  else fail(`карточка пациента: «${card.slice(0, 200)}»`);
}
