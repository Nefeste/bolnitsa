// Сценарий в браузере, часть 23 — люди Rocketbox (spec docs/specs/2026-10-people.md, часть 1, «Проверки»). С ключом
// `?people=rb` городская больница грузится без ошибок; у людей — шесть видов набора, у каждого атлас и маска; к 09:30
// медсёстры, санитары, хирурги и анестезиологи — в костюмах своих видов, остальной персонал — в халатах, пациенты — в своей
// одежде; цвет костюма — по должности: снимок с человеком и без него, разница — его цвета (медсестра — голубая,
// анестезиолог и операционная сестра — бирюзовые), у врача халат белый; люди садятся и встают, лежащие — на постели или
// каталке, а не на полу. Снимки — `e2e-people-*.jpg`.
import { join } from 'node:path';

const LOOKS = ['Medical_Male_03', 'Medical_Female_02', 'Medical_Female_01', 'Medical_Male_04', 'Male_Adult_08', 'Female_Adult_09'];
/** Должности со своими видами (src/render/cast.ts, RB_LOOKS): костюм в цвете должности. */
const SUITS = ['role.nurse', 'role.or_nurse', 'role.orderly', 'role.surgeon', 'role.anesthetist'];

/** @param {{ page: import('playwright-core').Page, port: number, out: string, ok: (m: string) => void, fail: (m: string) => void, q: string, shots: string }} x */
export async function peoplePart({ page, port, out, ok, fail, q, shots }) {
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
  const frames = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const look = async (x, z, half) => {
    await page.evaluate(([cx, cz, h]) => {
      const g = window.__game;
      g.stage.cam.target.set(cx, 0, cz);
      g.stage.cam.half = h;
    }, [x, z, half]);
    await frames();
  };
  /** Все на карте: ключ, вид, должность, состояние, где. */
  const people = () =>
    page.evaluate(() => {
      const g = window.__game;
      const role = new Map(g.staff.map(m => [`s:${m.id}`, m.role]));
      return [...g.crowd.walkers.values()].map(w => ({ key: w.key, look: g.people.looks[w.look].name, role: role.get(w.key) ?? '', state: w.state, x: w.x, y: w.y, z: w.z, lie: w.lie }));
    });
  /**
   * Цвет человека в кадре: снимок 320 × 180 с ним и без него (отодвинут за край карты), точки, где кадры разные, — его и
   * его тень; доля «голубых» (синий ярче красного на 25), «бирюзовых» (зелёный ярче красного на 25) и «белых» (светлые без
   * оттенка), в процентах.
   */
  const colorOf = key =>
    page.evaluate(async k => {
      const g = window.__game;
      const w = g.crowd.walkers.get(k);
      const grab = async () => {
        const img = new Image();
        img.src = g.stage.shot(320, 180, g.crowd, g.pop.paint, x => g.pop.triageOf(x), 12);
        await img.decode();
        const c = document.createElement('canvas');
        c.width = 320;
        c.height = 180;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, 320, 180).data;
      };
      const a = await grab();
      const x0 = w.x;
      w.x += 1000;
      const b = await grab();
      w.x = x0;
      let n = 0;
      let blue = 0;
      let teal = 0;
      let white = 0;
      for (let i = 0; i < a.length; i += 4) {
        if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) < 40) continue;
        n++;
        if (a[i + 2] > a[i] + 25) blue++;
        if (a[i + 1] > a[i] + 25) teal++;
        if (Math.min(a[i], a[i + 1], a[i + 2]) > 140 && Math.max(a[i], a[i + 1], a[i + 2]) - Math.min(a[i], a[i + 1], a[i + 2]) < 30) white++;
      }
      const pc = k => (n ? Math.round((k / n) * 100) : 0);
      return { n, blue: pc(blue), teal: pc(teal), white: pc(white) };
    }, key);

  await page.goto(`http://127.0.0.1:${port}/index.html?q=${q}&lang=ru&hospital=preset&seed=3&flow=6,1&people=rb`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });

  // ---------------------------------------------------------------- шесть видов набора, атлас и маска
  const looks = await page.evaluate(() => window.__game.people.looks.map(l => ({ name: l.name, map: !!l.map, mask: !!l.mask, walk: l.walk })));
  const names = looks.map(l => l.name);
  if (names.length === LOOKS.length && LOOKS.every(n => names.includes(n)) && looks.every(l => l.map && l.mask)) {
    ok(`люди Rocketbox: ${names.length} видов, у каждого атлас и маска; шаг ${looks.map(l => l.walk.toFixed(2)).join(', ')} м/с`);
  } else fail(`виды людей: ${JSON.stringify(looks)}`);

  // ---------------------------------------------------------------- к 09:30: кто в чём; садятся и встают
  await page.keyboard.press('Digit3');
  const seen = new Set();
  const t0 = Date.now();
  while (Date.now() - t0 < 240000) {
    for (const w of await people()) seen.add(w.state);
    if (await page.evaluate(() => window.__game.t > 9.5 * 3600)) break;
    await page.waitForTimeout(250);
  }
  await page.keyboard.press('Space');
  await until(() => window.__game.speed === 0);
  if (['sitDown', 'sit', 'standUp', 'walk', 'lie'].every(s => seen.has(s))) ok(`люди садятся, сидят, встают, идут и лежат: ${[...seen].sort().join(', ')}`);
  else fail(`состояния людей: ${[...seen].sort().join(', ')}`);
  const all = await people();
  const staffLooks = new Set(['Medical_Male_03', 'Medical_Female_02']);
  const suitLooks = new Set(['Medical_Female_01', 'Medical_Male_04']);
  const patientLooks = new Set(['Male_Adult_08', 'Female_Adult_09']);
  const wrong = all.filter(w => {
    if (w.key.startsWith('p:')) return !patientLooks.has(w.look);
    if (w.role && SUITS.includes(w.role)) return !suitLooks.has(w.look);
    if (w.role) return !staffLooks.has(w.look);
    return false;
  });
  const suits = all.filter(w => SUITS.includes(w.role)).length;
  if (!wrong.length && suits > 0) ok(`вид по должности: ${suits} в костюмах (сёстры, санитары, хирурги), остальной персонал — в халатах, пациенты — в своём`);
  else fail(`вид по должности: ${JSON.stringify(wrong.slice(0, 5))}`);
  const lying = all.filter(w => w.state === 'lie');
  if (lying.length && lying.every(w => w.y > 0.3 && w.y < 0.9)) ok(`лежат на постели или каталке: ${lying.length}, высота ${lying.map(w => w.y.toFixed(2)).join(', ')} м`);
  else fail(`лежащие: ${JSON.stringify(lying.map(w => [w.key, w.y]))}`);

  // ---------------------------------------------------------------- цвет костюма — по должности, у врача халат белый
  const still = w => w.state === 'sit' || w.state === 'idle';
  const nurse = all.find(w => w.role === 'role.nurse' && still(w));
  const teal = all.find(w => (w.role === 'role.anesthetist' || w.role === 'role.or_nurse') && still(w));
  const doctor = all.find(w => w.role === 'role.therapist' && still(w)) ?? all.find(w => w.role && !SUITS.includes(w.role) && w.role !== 'role.registrar' && still(w));
  if (!nurse || !teal || !doctor) fail(`нет медсестры, анестезиолога или врача на месте: ${JSON.stringify({ nurse: !!nurse, teal: !!teal, doctor: !!doctor })}`);
  else {
    await look(nurse.x, nurse.z, 1.6);
    const cn = await colorOf(nurse.key);
    const n1 = await shot('e2e-people-1.jpg');
    await look(teal.x, teal.z, 1.6);
    const ct = await colorOf(teal.key);
    await look(teal.x, teal.z, 2.6);
    const n2 = await shot('e2e-people-2.jpg');
    await look(doctor.x, doctor.z, 1.6);
    const cd = await colorOf(doctor.key);
    const n3 = await shot('e2e-people-3.jpg');
    console.log(`  медсестра ${JSON.stringify(cn)}, ${teal.role} ${JSON.stringify(ct)}, врач ${JSON.stringify(cd)}`);
    if (cn.n > 200 && cn.blue >= 30 && cn.blue > cd.blue + 20) ok(`медсестра в голубом: ${cn.blue}% голубых точек, у врача — ${cd.blue}% (снимок ${n1} КБ)`);
    else fail(`медсестра не голубая: ${JSON.stringify({ cn, cd })}`);
    if (ct.n > 200 && ct.teal >= 30 && ct.teal > cd.teal + 20) ok(`${teal.role === 'role.anesthetist' ? 'анестезиолог' : 'операционная сестра'} в бирюзовом: ${ct.teal}%, у врача — ${cd.teal}% (снимок ${n2} КБ)`);
    else fail(`костюм операционной не бирюзовый: ${JSON.stringify({ ct, cd })}`);
    if (cd.n > 200 && cd.white >= 8 && cd.white > cn.white + 8) ok(`врач в белом халате: ${cd.white}% белых точек, у медсестры — ${cn.white}% (снимок ${n3} КБ)`);
    else fail(`халат врача: ${JSON.stringify({ cd, cn })}`);
  }
  const lie = lying[0];
  if (lie) {
    await look(lie.x, lie.z, 2.6);
    ok(`лежащий на постели — снимок ${await shot('e2e-people-4.jpg')} КБ`);
  }
}
