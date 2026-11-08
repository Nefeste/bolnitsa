// Сценарий в браузере, часть 38 — звук, часть 1 (spec docs/specs/2026-11-sound.md). Готовая городская больница: до первого
// нажатия звука нет, первое нажатие — файлы загружены; «Звук» в «Настройках» — 70 % по умолчанию; кнопка окна — щелчок;
// снять скамью у двери — снос, поставить на её место — стук, на занятое место — отказ; найм в резерв — колокольчики;
// громкость 0 — тишина и после нажатий; снова 70 % — «До утра», планёрка звуком. Громкость запоминается после перезагрузки.
// Часть 3 — музыка: с первым нажатием — первая пьеса; в «Настройках» — «Музыка» 50 %, что звучит и восемь авторов пьес, у
// четырёх — CC BY; «Музыка» 0 — пьеса смолкла, громкость записана; снова 50 % — новая пьеса.

/** @param {{ page: import('playwright-core').Page, port: number, out: string, ok: (m: string) => void, fail: (m: string) => void, q: string }} x */
export async function soundPart({ page, port, ok, fail, q }) {
  const until = (fn, a, ms = 30000) => page.waitForFunction(fn, a, { timeout: ms });
  const played = () => page.evaluate(() => ({ ...window.__game.sound.played }));
  const site = cmd => page.evaluate(c => window.__game.client.command({ kind: 'site', cmd: c }), cmd);
  /** Ждать, пока звук `cue` прозвучит больше `n` раз. */
  const heard = (cue, n, ms = 10000) => until(([c, k]) => window.__game.sound.played[c] > k, [cue, n], ms).then(() => true, () => false);

  await page.goto(`http://127.0.0.1:${port}/index.html?q=${q}&lang=ru&hospital=preset&seed=5&flow=6,1`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  await page.evaluate(() => window.__game.actions.doctor({ kind: 'autopause', on: false }));
  await page.evaluate(() => window.__game.actions.setSpeed(0));

  // ---------------------------------------------------------------- первое нажатие: файлы звуков
  const before = await page.evaluate(() => window.__game.sound.ready);
  await page.click('#game-menu-open');
  const loaded = await until(() => window.__game.sound.ready, null, 15000).then(() => true, () => false);
  if (!before && loaded) ok('до первого нажатия звука нет; первое нажатие — файлы звуков загружены');
  else fail(`звук до и после первого нажатия: ${JSON.stringify({ before, loaded })}`);
  // музыка (spec docs/specs/2026-11-sound.md, часть 3): с тем же нажатием — первая пьеса
  const tune = () => page.evaluate(() => ({ started: window.__game.music.started, now: window.__game.music.now?.id ?? null, track: window.__game.store.get().track ?? null }));
  const music = await until(() => window.__game.music.started > 0 && !!window.__game.music.now, null, 30000).then(() => true, () => false);
  const m0 = await tune();
  if (music && m0.track !== null) ok(`с первым нажатием — музыка: «${m0.now}»`);
  else fail(`музыка после первого нажатия: ${JSON.stringify(m0)}`);

  // ---------------------------------------------------------------- «Звук» в «Настройках»; кнопка — щелчок
  await page.click('#settings-open');
  await page.waitForSelector('#settings #volume', { timeout: 5000 });
  const vol = await page.evaluate(() => ({ value: document.getElementById('volume')?.value, text: document.getElementById('volume-value')?.textContent }));
  if (vol.value === '70' && vol.text === '70 %') ok('«Настройки»: «Звук» — 70 % по умолчанию');
  else fail(`«Звук» в «Настройках»: ${JSON.stringify(vol)}`);
  const mus = await page.evaluate(() => {
    const items = [...document.querySelectorAll('#music-authors li')].map(li => li.textContent ?? '');
    return { value: document.getElementById('music')?.value, text: document.getElementById('music-value')?.textContent, now: document.getElementById('music-now')?.textContent ?? '', items: items.length, by: items.filter(x => x.includes('CC BY')).length };
  });
  if (mus.value === '50' && mus.text === '50 %' && /^Сейчас: «.+» — .+/.test(mus.now) && mus.items === 8 && mus.by === 4) {
    ok(`«Музыка» — 50 % по умолчанию; «${mus.now}»; «Авторы музыки» — восемь пьес, у четырёх — CC BY`);
  } else fail(`«Музыка» в «Настройках»: ${JSON.stringify(mus)}`);
  const p0 = await played();
  await page.click('#settings-close');
  if (await heard('click', p0.click)) ok('кнопка окна — щелчок');
  else fail(`щелчка нет: ${JSON.stringify(await played())}`);

  // ---------------------------------------------------------------- стройка: снос, стук, отказ; найм — колокольчики
  const p1 = await played();
  await site({ kind: 'undecor', x: 11, y: 7 });
  const off = await heard('demolish', p1.demolish);
  await site({ kind: 'bench', x: 11, y: 7 });
  const on = await heard('build', p1.build);
  await site({ kind: 'bench', x: 12, y: 7 });
  const no = await heard('refuse', p1.refuse);
  await site({ kind: 'reserve', role: 'role.nurse' });
  const hire = await heard('hire', p1.hire);
  await site({ kind: 'done' });
  if (off && on && no && hire) ok('стройка: снять скамью — снос, поставить — стук, на занятое место — отказ; найм в резерв — колокольчики');
  else fail(`звуки стройки: ${JSON.stringify({ off, on, no, hire, played: await played() })}`);

  // ---------------------------------------------------------------- громкость 0 — тишина
  await page.click('#game-menu-open');
  await page.click('#settings-open');
  await page.waitForSelector('#settings #volume', { timeout: 5000 });
  await page.$eval('#volume', el => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    set.call(el, '0');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const zero = await page.evaluate(() => ({ text: document.getElementById('volume-value')?.textContent, saved: JSON.parse(localStorage.getItem('bolnitsa.settings') ?? '{}').volume }));
  const p2 = await played();
  await page.click('#settings-close');
  await page.click('#game-menu-open');
  await page.click('#game-menu-open');
  await page.waitForTimeout(400);
  const p3 = await played();
  if (zero.text === 'без звука' && zero.saved === 0 && p3.click === p2.click) ok('«Звук» — «без звука»: нажатия кнопок тихие, громкость записана');
  else fail(`громкость 0: ${JSON.stringify({ zero, p2: p2.click, p3: p3.click })}`);
  // «Музыка» 0 — пьеса смолкла; снова 50 % — новая пьеса
  await page.click('#game-menu-open');
  await page.click('#settings-open');
  await page.waitForSelector('#settings #music', { timeout: 5000 });
  const m1 = await tune();
  await page.$eval('#music', el => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    set.call(el, '0');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const hush = await until(() => !window.__game.music.now && window.__game.store.get().track === undefined, null, 5000).then(() => true, () => false);
  const quiet = await page.evaluate(() => ({ text: document.getElementById('music-value')?.textContent, saved: JSON.parse(localStorage.getItem('bolnitsa.settings') ?? '{}').music, now: !!document.getElementById('music-now') }));
  await page.evaluate(() => window.__game.actions.setMusic(0.5));
  const again = await until(n => window.__game.music.started > n && !!window.__game.music.now, m1.started, 30000).then(() => true, () => false);
  await page.click('#settings-close');
  if (hush && quiet.text === 'без музыки' && quiet.saved === 0 && !quiet.now && again) ok('«Музыка» — «без музыки»: пьеса смолкла, громкость записана; снова 50 % — новая пьеса');
  else fail(`«Музыка» 0 и снова: ${JSON.stringify({ hush, quiet, again, m: await tune() })}`);

  // ---------------------------------------------------------------- громкость запоминается; «До утра» — планёрка звуком
  await page.evaluate(() => window.__game.actions.setVolume(0.7));
  await page.reload();
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  const kept = await page.evaluate(() => window.__game.store.get().volume);
  await page.evaluate(() => window.__game.actions.doctor({ kind: 'autopause', on: false }));
  await page.click('#speed-ff');
  await until(() => window.__game.sound.ready, null, 15000).catch(() => {});
  const t1 = Date.now();
  for (;;) {
    const h = await page.evaluate(() => ({ open: window.__game.store.get().economy?.open ?? false, ff: window.__game.ff, speed: window.__game.speed, card: window.__game.doctor.open }));
    if (h.open || Date.now() - t1 > 300000) break;
    if (h.card) await page.keyboard.press('Escape');
    else if (!h.ff && h.speed === 0) await page.click('#speed-ff');
    await page.waitForTimeout(200);
  }
  const meeting = await heard('meeting', 0, 5000);
  if (kept === 0.7 && meeting) ok('громкость — та же после перезагрузки; «До утра» — планёрка звуком');
  else fail(`после перезагрузки и планёрки: ${JSON.stringify({ kept, meeting, played: await played() })}`);
  await page.evaluate(() => window.__game.actions.money({ kind: 'close' }));
}
