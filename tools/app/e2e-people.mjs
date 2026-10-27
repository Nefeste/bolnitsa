// Сценарий в браузере, часть 23 — люди Rocketbox (spec docs/specs/2026-10-people.md, части 1 и 2, «Проверки»). Городская
// больница грузится без ошибок; у людей — 59 видов набора (решение владельца #109), у каждого атлас и маска; к 09:30
// медсёстры, санитары, хирурги, анестезиологи и рентгенолаборанты — в своих видах, остальной персонал — в халатах,
// регистратура — в деловой одежде, фельдшеры — в синей форме, пациенты — в своей одежде, в каске и спецодежде — только своих
// профессий; цвет костюма — по должности: снимок с человеком и без него, разница — его цвета (медсестра — голубая,
// анестезиолог и операционная сестра — бирюзовые), у врача халат белый; люди садятся и встают, лежащие — на постели или
// каталке, а не на полу. Часть 2б: маска на видеокарте — в два канала; у людей одного вида — разные волосы и кожа, и оттенок
// виден в кадре: снимок с оттенком человека и с волосами «как у вида» разные. Медленный шаг (решение владельца #132):
// пожилые и «жёлтые» идут анимацией медленного шага, остальные — обычного. Снимки — `e2e-people-*.jpg`.
import { join } from 'node:path';

/** Сколько видов в игре (src/render/cast.ts, LOOKS). */
const LOOKS = 59;
/** Должности со своими видами (src/render/cast.ts, `roles`): костюм в цвете должности. */
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
      return [...g.crowd.walkers.values()].map(w => {
        const id = w.key.startsWith('p:') ? w.key.slice(2) : '';
        return { key: w.key, look: g.people.looks[w.look].name, spec: g.people.looks[w.look].spec, role: role.get(w.key) ?? '', job: g.pop.rows.get(id)?.job ?? '', state: w.state, x: w.x, y: w.y, z: w.z, lie: w.lie, tone: [...g.pop.paint(w).tone] };
      });
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

  await page.goto(`http://127.0.0.1:${port}/index.html?q=${q}&lang=ru&hospital=preset&seed=3&flow=6,1`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });

  // ---------------------------------------------------------------- 59 видов набора, атлас и маска
  const looks = await page.evaluate(() =>
    window.__game.people.looks.map(l => ({ name: l.name, spec: l.spec, map: !!l.map, mask: !!l.mask, walk: l.walk, hair: l.hair, rg: l.mask?.format === 1030, size: [l.map?.image?.width, l.mask?.image?.width] })),
  );
  const load = await page.evaluate(() => window.__game.load);
  const walks = looks.map(l => l.walk);
  if (looks.length === LOOKS && new Set(looks.map(l => l.name)).size === LOOKS && looks.every(l => l.map && l.mask && l.spec)) {
    ok(`люди Rocketbox: ${looks.length} видов, у каждого атлас и маска; шаг ${Math.min(...walks).toFixed(2)}–${Math.max(...walks).toFixed(2)} м/с; загрузка людей ${Math.round(load.people)} мс из ${Math.round(load.total)}`);
  } else fail(`виды людей: ${JSON.stringify(looks.filter(l => !l.map || !l.mask || !l.spec).map(l => l.name))}, всего ${looks.length}`);
  // видеопамять: атлас RGBA и маска RG с мипмапами (×4/3)
  const mb = looks.reduce((a, l) => a + ((l.size[0] ** 2 * 4 + l.size[1] ** 2 * 2) * 4) / 3, 0) / 1e6;
  const haired = looks.filter(l => l.hair > 0).length;
  if (looks.every(l => l.rg) && haired >= 48) ok(`маска — два канала на видеокарте: атласы и маски ${Math.round(mb)} МБ; волосы в маске — у ${haired} видов из ${looks.length}`);
  else fail(`маска: ${JSON.stringify(looks.filter(l => !l.rg).map(l => l.name))}, волосы — у ${haired}`);

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
  // вид — по таблице cast.ts: должность со своими видами своего пола — один из них; без них — халат (регистратура —
  // деловая одежда); фельдшер — синяя форма; пациент — своя одежда, спецодежда — только своей профессии
  const own = (role, sex) => looks.some(l => l.spec.sex === sex && l.spec.roles?.includes(role));
  const wrong = all.filter(w => {
    const s = w.spec;
    if (w.key.startsWith('p:')) return s.use !== 'patient' || (s.jobs && !s.jobs.includes(w.job));
    if (w.key.startsWith('m:')) return s.use !== 'paramedic';
    if (!w.role) return false;
    if (own(w.role, s.sex)) return !s.roles?.includes(w.role);
    return !!s.roles || s.use !== (w.role === 'role.registrar' ? 'registrar' : 'staff');
  });
  const suits = all.filter(w => SUITS.includes(w.role)).length;
  const kinds = new Set(all.map(w => w.look)).size;
  const work = all.filter(w => w.key.startsWith('p:') && w.spec.jobs).length;
  const medics = all.filter(w => w.key.startsWith('m:')).length;
  if (!wrong.length && suits > 0) {
    ok(`вид по должности и профессии: на карте ${all.length} человек ${kinds} видов, ${suits} в костюмах (сёстры, санитары, хирурги), в спецодежде — ${work}, фельдшеров — ${medics}; остальной персонал — в халатах, регистратура — в деловом`);
  } else fail(`вид по должности: ${JSON.stringify(wrong.slice(0, 5).map(w => [w.key, w.look, w.role, w.job]))}`);
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

  // ---------------------------------------------------------------- оттенки волос и кожи (часть 2б)
  const hairOf = w => (w.tone[0] < 0 ? 'как у вида' : w.tone.slice(0, 3).map(v => Math.round(v * 255)).join(','));
  const byLook = new Map();
  for (const w of all) byLook.set(w.look, [...(byLook.get(w.look) ?? []), w]);
  const repeated = [...byLook.values()].filter(list => list.length >= 2);
  const varied = repeated.filter(list => new Set(list.map(w => `${hairOf(w)}|${w.tone[3].toFixed(3)}`)).size === list.length);
  const colours = new Set(all.map(hairOf));
  if (colours.size >= 4 && varied.length >= Math.ceil(repeated.length * 0.8)) {
    ok(`оттенки: волос ${colours.size} цветов у ${all.length} человек; из ${repeated.length} видов, что встречаются не раз, у ${varied.length} все люди разные`);
  } else fail(`оттенки: ${JSON.stringify({ colours: [...colours], repeated: repeated.length, varied: varied.length })}`);
  // в кадре: тот же человек с оттенком и с волосами «как у вида» — разница в точках его головы
  const dyed = all.find(w => w.key.startsWith('p:') && w.tone[0] >= 0 && still(w));
  if (!dyed) fail('нет перекрашенного пациента на месте');
  else {
    await look(dyed.x, dyed.z, 1.2);
    const diff = await page.evaluate(async k => {
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
      const p = g.pop.paint(w);
      const tone = [...p.tone];
      p.tone = [-1, 0, 0, tone[3]];
      const b = await grab();
      p.tone = tone;
      let n = 0;
      for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) >= 30) n++;
      return n;
    }, dyed.key);
    const n5 = await shot('e2e-people-5.jpg');
    if (diff >= 15) ok(`оттенок виден: у ${dyed.look} волосы ${hairOf(dyed)} вместо своих — ${diff} точек кадра другие (снимок ${n5} КБ)`);
    else fail(`оттенок не виден: ${diff} точек, ${dyed.look}, ${hairOf(dyed)}`);
  }

  // медленный шаг (spec, «Медленный шаг»; решение владельца #132): пожилые от 65 и «жёлтые» идут анимацией медленного шага,
  // остальные пациенты — обычного; кто медленный — по пометке движка в срезе, и она та же, что правило
  await page.evaluate(() => window.__game.actions.setSpeed(1));
  const gait = await until(
    () => {
      const g = window.__game;
      const rows = [];
      for (const w of g.crowd.walkers.values()) {
        if (w.staff || w.state !== 'walk' || !(w.v > 0) || !w.key.startsWith('p:')) continue;
        const p = g.pop.now(w.key);
        if (!p) continue;
        rows.push({ slow: !!w.slow, clip: w.clip, rule: p.row.age >= 65 || p.triage === 'yellow', v: w.v });
      }
      return rows.some(r => r.slow) && rows.some(r => !r.slow) ? rows : null;
    },
    null,
    90000,
  ).then(h => h.jsonValue(), () => null);
  if (!gait) fail('медленный шаг: за полторы минуты не нашлось сразу идущих медленно и обычно');
  else {
    const slow = gait.filter(r => r.slow);
    const fast = gait.filter(r => !r.slow);
    // номера анимаций — src/render/crowd.ts: 1 — шаг, 6 — медленный шаг
    if (gait.every(r => r.slow === r.rule) && slow.every(r => r.clip === 6) && fast.every(r => r.clip === 1)) {
      ok(`медленный шаг: идут ${slow.length} медленно (анимация медленного шага) и ${fast.length} обычно — как велит правило: от 65 лет или «жёлтый»`);
    } else fail(`медленный шаг: ${JSON.stringify(gait)}`);
  }
}
