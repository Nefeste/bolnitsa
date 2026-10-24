// MakeHuman в карточке: view=makehuman — три человека из одной базовой сетки (только ползунки и вещи разные); view=sliders —
// редактор: ползунки HTML меняют лицо сразу (цели → подгонка прокси → нормали → кадр).
import { el, ms, stats, texTotals } from '../probe';
import { card, draw, frameBust } from '../studio';
import { Character, type Look } from './character';
import { defaults, Human, type Params, SLIDERS } from './human';

const FEMALE: Look = { hair: 'ponytail01', brows: 'eyebrow001', clothes: 'female_elegantsuit01', grey: 0 };
const MALE: Look = { hair: 'short02', brows: 'eyebrow010', clothes: 'male_casualsuit01', grey: 0 };

const PRESETS: { title: string; sub: string; look: Look; p: Params }[] = [
  { title: 'Молодая женщина, 25', sub: 'пол 0, полнота −0,1; глаза +0,2, губы +0,3, нос −0,2', look: FEMALE, p: { gender: 0, age: 25, weight: -0.1, eyes: 0.2, lips: 0.3, noseWidth: -0.2 } },
  { title: 'Мужчина, 48', sub: 'пол 1, полнота +0,3; челюсть +0,4, нос +0,2, лицо +0,2', look: MALE, p: { gender: 1, age: 48, weight: 0.3, jaw: 0.4, noseWidth: 0.2, faceFat: 0.2 } },
  { title: 'Пожилой мужчина, 78', sub: 'пол 1, седина; нос: длина +0,4, горбинка +0,3', look: { ...MALE, grey: 0.85 }, p: { gender: 1, age: 78, weight: 0, noseLength: 0.4, noseHump: 0.3, faceAge: 0.4 } },
];

/** Кадр бюста: от макушки до верха груди (голова — около 0,24 м, ниже подбородка — шея и плечи). */
function frame(c: ReturnType<typeof card>, ch: Character, angle = -0.32) {
  const { eyes, top } = ch.landmarks();
  const chin = eyes.y - (top - eyes.y) * 1.05;
  frameBust(c, eyes, top + 0.02, chin - 0.2, angle);
}

export async function makehumanView(sliders: boolean) {
  const t0 = performance.now();
  const human = await Human.load();
  stats.view = sliders ? 'sliders' : 'makehuman';
  stats.base = {
    verts: human.base.length / 3,
    bodyFaces: human.obj.fGroup.filter(g => g === human.obj.groups.indexOf('body')).length,
    objMs: human.load.objMs,
    targets: human.load.targets,
    targetsMB: +(human.load.targetBytes / 1e6).toFixed(1),
    targetsMs: human.load.targetsMs,
  };
  const app = document.getElementById('app')!;
  if (!sliders) {
    const cards = el('div', 'cards', app);
    const out: Record<string, unknown>[] = [];
    for (const pr of PRESETS) {
      const c = card(cards, pr.title, `MakeHuman (CC0) · ${pr.sub}`);
      const ch = await Character.create(human, [pr.look]);
      ch.setLook(pr.look);
      ch.update({ ...defaults(), ...pr.p });
      c.scene.add(ch.group);
      frame(c, ch);
      draw(c);
      out.push({ title: pr.title, tris: ch.tris, updateMs: +ch.lastUpdateMs.toFixed(1) });
    }
    stats.busts = out;
  } else {
    const box = el('div', 'editor', app);
    const c = card(box, 'Свой человек', 'MakeHuman (CC0): базовая сетка + цели, вещи — прокси');
    const panel = el('div', 'sliders', box);
    el('h3', '', panel, 'Ползунки');
    const ch = await Character.create(human, [FEMALE, MALE]);
    const p = defaults();
    let pending = false;
    const times: number[] = [];
    const redraw = () => {
      pending = false;
      ch.setLook(p.gender >= 0.5 ? { ...MALE, grey: Math.max(0, (p.age - 55) / 30) } : { ...FEMALE, grey: Math.max(0, (p.age - 55) / 30) });
      ch.update(p);
      times.push(ch.lastUpdateMs);
      frame(c, ch, -0.25);
      draw(c);
      stats.updateMs = { last: +ch.lastUpdateMs.toFixed(1), median: +[...times].sort((a, b) => a - b)[Math.floor(times.length / 2)].toFixed(1), count: times.length };
      stats.tris = ch.tris;
      stats.idle = true;
    };
    for (const s of SLIDERS) {
      const lab = el('label', '', panel, s.label);
      const out = el('output', '', lab);
      const input = el('input', '', panel);
      input.type = 'range';
      input.name = s.name;
      input.min = String(s.min);
      input.max = String(s.max);
      input.step = String(s.step);
      input.value = String(s.value);
      out.textContent = input.value;
      input.addEventListener('input', () => {
        p[s.name] = Number(input.value);
        out.textContent = input.value;
        stats.idle = false;
        if (!pending) {
          pending = true;
          requestAnimationFrame(redraw);
        }
      });
    }
    el('div', 'note', panel, 'Смена пола меняет и вещи (волосы, брови, одежда); с 55 лет волосы седеют. Кожа — смесь текстур CC0 по полу и возрасту.');
    c.scene.add(ch.group);
    // замер пересчёта на процессоре: 40 случайных наборов ползунков (зерно постоянное), без отрисовки
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    const runs: { total: number; targets: number; body: number; proxies: number }[] = [];
    for (let i = 0; i < 40; i++) {
      const q: Params = { ...p };
      for (const s of SLIDERS) q[s.name] = s.min + (s.max - s.min) * rnd();
      ch.setLook(q.gender >= 0.5 ? MALE : FEMALE);
      ch.update(q);
      runs.push({ total: ch.lastUpdateMs, ...ch.timing });
    }
    const pick = (k: keyof (typeof runs)[number], at: number) => +runs.map(r => r[k]).sort((a, b) => a - b)[Math.floor(runs.length * at)].toFixed(1);
    stats.bench = {
      runs: runs.length,
      totalMedian: pick('total', 0.5),
      totalP95: pick('total', 0.95),
      targetsMedian: pick('targets', 0.5),
      bodyMedian: pick('body', 0.5),
      proxiesMedian: pick('proxies', 0.5),
    };
    redraw();
  }
  stats.textures = { count: texTotals.count, decodeMs: Math.round(texTotals.ms), rgbaMB: +(texTotals.bytes / 1e6).toFixed(1) };
  stats.totalMs = ms(t0);
}
