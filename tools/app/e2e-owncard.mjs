// Сценарий в браузере, часть 22 — своя карта, макет (spec docs/specs/2026-10-own-card.md; решение владельца #73): тот же
// приём, что в части 4 (готовая больница, зерно 11, поток 6 в час, просьба к 09:08), но с `?card=steps`. В середине —
// лента «Ход приёма», справа — шаги «Расспрос», «Осмотр», «Обследования», «Решение», открыт один. Вопрос — уходит из шага в
// ленту с ответом; осмотр — тоже; анализ — в ленте «назначено … — будет к …»; «Ждать» — результат: карта открывается на
// «Решении»; гипотеза, диагноз, лечение, «Завершить приём» — разбор. Снимки для владельца — `e2e-owncard-*.jpg`.
import { join } from 'node:path';

/** @param {{ page: import('playwright-core').Page, port: number, out: string, ok: (m: string) => void, fail: (m: string) => void, q: string, shots: string }} x */
export async function ownCardPart({ page, port, out, ok, fail, q, shots }) {
  const until = (fn, a, ms = 30000) => page.waitForFunction(fn, a, { timeout: ms });
  const card = () => page.evaluate(() => window.__game.store.get().doctor?.card ?? null);
  const fresher = v => until(prev => (window.__game.store.get().doctor?.card?.version ?? 0) > prev, v);
  const dom = id => id.replace(/\./g, '_');
  const shot = async name => {
    if (shots) {
      await page.evaluate(x => window.__game.actions.setQuality(x), shots);
      await page.waitForTimeout(400);
    }
    const buf = await page.screenshot({ path: join(out, name), type: 'jpeg', quality: 72 });
    if (shots) await page.evaluate(x => window.__game.actions.setQuality(x), q);
    return Math.round(buf.length / 1024);
  };
  /** Какие шаги видны и какой открыт; что в ленте. */
  const layout = () =>
    page.evaluate(() => ({
      steps: [...document.querySelectorAll('#dcard-steps .dstep')].map(b => ({
        id: b.id, on: b.classList.contains('on'), title: b.querySelector('b')?.textContent ?? '', note: b.querySelector('small')?.textContent ?? '',
      })),
      course: [...document.querySelectorAll('#dcard-course .pair')].map(e => e.id),
      cols: document.querySelectorAll('#dcard .dcol').length,
    }));

  await page.goto(`http://127.0.0.1:${port}/index.html?q=${q}&lang=ru&hospital=preset&seed=11&flow=6,1&card=steps`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  await until(() => !!window.__game.store.get().doctor?.state);
  // просьба — «Посмотреть»: идёт к вам, вошёл — карта
  await page.keyboard.press('Digit3');
  await until(() => (window.__game.store.get().doctor?.state?.asks.length ?? 0) > 0, null, 180000);
  const ask = await page.evaluate(() => window.__game.store.get().doctor.state.asks[0]);
  await page.click(`#ask-look-${ask.id}`);
  await page.waitForSelector('#dcard #dcard-steps', { timeout: 60000 });
  const c0 = await card();
  const l0 = await layout();
  const titles = l0.steps.map(s => s.title);
  if (c0.active && l0.cols === 0 && JSON.stringify(titles) === JSON.stringify(['Расспрос', 'Осмотр', 'Обследования', 'Решение']) && l0.steps[0].on && l0.steps.filter(s => s.on).length === 1 && (await page.$('#dcard-course'))) {
    ok(`своя карта, макет: лента «Ход приёма» и шаги ${titles.map(x => `«${x}»`).join(', ')}, открыт «Расспрос»`);
  } else fail(`раскладка макета: ${JSON.stringify(l0)}`);
  ok(`снимок: ${join(out, 'e2e-owncard-1-start.jpg')} (${await shot('e2e-owncard-1-start.jpg')} КБ)`);

  // вопрос — из шага в ленту, с ответом
  const qBtn = await page.$('#stepbody-talk button.q:not([disabled])');
  const qExam = await qBtn.getAttribute('data-exam');
  await qBtn.click();
  await fresher(c0.version);
  const l1 = await layout();
  const gone = !(await page.$(`#stepbody-talk #q-${dom(qExam)}`));
  const asked = s => Number(/спрошено: (\d+)/.exec(s.note)?.[1] ?? 0);
  if (l1.course.includes(`course-${dom(qExam)}`) && gone && asked(l1.steps[0]) === asked(l0.steps[0]) + 1) ok(`вопрос ${qExam}: ушёл из «Расспроса» в ленту с ответом; в заголовке — «${l1.steps[0].note}»`);
  else fail(`вопрос: ${JSON.stringify({ qExam, gone, l1 })}`);

  // осмотр — шаг «Осмотр», первая строка «Весь больной» или «У постели»
  await page.click('#step-examine');
  await page.waitForSelector('#stepbody-examine', { timeout: 5000 });
  const exam = await page.$('#stepbody-examine #ex-whole button.xrow:not([disabled]), #stepbody-examine #ex-bedside button.xrow:not([disabled])');
  const examId = await exam.getAttribute('data-exam');
  const v1 = (await card()).version;
  await exam.click();
  await fresher(v1);
  const l2 = await layout();
  if (l2.course.includes(`course-${dom(examId)}`) && !(await page.$(`#stepbody-examine [data-exam="${examId}"]`)) && l2.steps.filter(s => s.on).map(s => s.id).join() === 'step-examine') ok(`осмотр ${examId}: в ленте, из шага ушёл; открыт один шаг — «Осмотр»`);
  else fail(`осмотр: ${JSON.stringify({ examId, l2 })}`);

  // анализ — шаг «Обследования», бланк: в ленте «назначено … — будет к …»
  await page.click('#step-order');
  const box = await page.$('#stepbody-order #or-lab input[type=checkbox]:not([disabled])');
  const labId = await box.getAttribute('data-exam');
  await box.click();
  const v2 = (await card()).version;
  await page.click('#order-send');
  await fresher(v2);
  const l3 = await layout();
  const step = l3.steps.find(s => s.id === 'step-order');
  if (l3.steps.find(s => s.on)?.id === 'step-order' && (await page.$(`#course-wait-${dom(labId)}`)) && /ждут результата: \d/.test(step.note)) ok(`анализ ${labId}: в ленте — «назначено …», в заголовке — «${step.note}»`);
  else fail(`анализ: ${JSON.stringify({ labId, l3 })}`);
  ok(`снимок: ${join(out, 'e2e-owncard-2-progress.jpg')} (${await shot('e2e-owncard-2-progress.jpg')} КБ)`);

  // «Ждать» — результат: карта снова, открыт «Решение»
  for (let i = 0; i < 6 && (await page.$('#dcard-wait')); i++) {
    await page.click('#dcard-wait');
    await until(() => !document.getElementById('dcard'));
    await page.waitForSelector('#dcard #dcard-steps', { timeout: 120000 });
    await page.waitForTimeout(150);
  }
  const l4 = await layout();
  if (l4.steps.find(s => s.on)?.id === 'step-decide' && l4.course.includes(`course-${dom(labId)}`)) ok('результат пришёл — карта открылась на «Решении», результат — в ленте');
  else fail(`после результата: ${JSON.stringify(l4)}`);
  ok(`снимок: ${join(out, 'e2e-owncard-3-decide.jpg')} (${await shot('e2e-owncard-3-decide.jpg')} КБ)`);

  // гипотеза, диагноз, лечение — «Завершить приём»: разбор
  const hints = (await card()).hints;
  const dx = hints[0]?.id ?? (await card()).diagnoses[0].items[0].id;
  let v = (await card()).version;
  if (hints[0]) {
    await page.click(`#likely-${dom(dx)}`);
    await fresher(v);
  }
  v = (await card()).version;
  await page.click(`#dx-${dom(dx)}`);
  await fresher(v);
  const tx = (await card()).suggested.find(x => !x.disabled);
  if (tx) {
    v = (await card()).version;
    await page.click(`#tx-${dom(tx.id)}`);
    await fresher(v);
  }
  const l5 = await layout();
  v = (await card()).version;
  await page.click('#dcard-finish');
  await fresher(v);
  const done = await card();
  const dxNote = l5.steps.find(s => s.id === 'step-decide')?.note ?? '';
  if (done.decision && dxNote) ok(`«Решение»: в заголовке — диагноз «${dxNote}», «Завершить приём» — разбор`);
  else fail(`решение: ${JSON.stringify({ decision: !!done.decision, l5 })}`);
  await page.keyboard.press('Escape');
}
