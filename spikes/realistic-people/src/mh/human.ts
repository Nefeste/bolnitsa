// Человек из базовой сетки MakeHuman и целей (CC0). Как цели складываются — своё правило, выведенное из имён файлов:
//   «<раса>-<пол>-<возраст>» несут пол и возраст (полные сдвиги всей сетки), «universal-<пол>-<возраст>-averagemuscle-<вес>»
//   — полноту поверх них (файлы «…-averageweight» пустые: средняя полнота — это и есть сетка). Вес цели — произведение
//   долей по осям: пол (женщина ↔ мужчина), возраст (опорные 25 и 90 лет, между ними — линейно), полнота, раса. Цели лица —
//   парами «-decr/-incr»: ползунок −1…1 включает одну из пары с весом |значения|; левая и правая (l-/r-) — вместе.
import { type Obj, parseObj, parseTarget, type Target } from './formats';

const DATA = 'assets/makehuman/makehuman/data/';

export interface Slider {
  name: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  /** цели лица: путь без «-decr.target»/«-incr.target» */
  targets?: string[];
}

export const SLIDERS: Slider[] = [
  { name: 'gender', label: 'Пол: женщина ↔ мужчина', min: 0, max: 1, step: 0.01, value: 0.5 },
  { name: 'age', label: 'Возраст, лет', min: 20, max: 90, step: 1, value: 30 },
  { name: 'weight', label: 'Полнота', min: -1, max: 1, step: 0.01, value: 0 },
  { name: 'faceFat', label: 'Лицо: полнота', min: -1, max: 1, step: 0.01, value: 0, targets: ['head/head-fat'] },
  { name: 'noseWidth', label: 'Нос: ширина', min: -1, max: 1, step: 0.01, value: 0, targets: ['nose/nose-scale-horiz'] },
  { name: 'noseLength', label: 'Нос: длина', min: -1, max: 1, step: 0.01, value: 0, targets: ['nose/nose-scale-vert'] },
  { name: 'noseHump', label: 'Нос: горбинка', min: -1, max: 1, step: 0.01, value: 0, targets: ['nose/nose-hump'] },
  { name: 'jaw', label: 'Челюсть: ширина', min: -1, max: 1, step: 0.01, value: 0, targets: ['chin/chin-bones'] },
  { name: 'chin', label: 'Подбородок: вперёд', min: -1, max: 1, step: 0.01, value: 0, targets: ['chin/chin-prominent'] },
  { name: 'chinWidth', label: 'Подбородок: ширина', min: -1, max: 1, step: 0.01, value: 0, targets: ['chin/chin-width'] },
  { name: 'cheekbones', label: 'Скулы', min: -1, max: 1, step: 0.01, value: 0, targets: ['cheek/l-cheek-bones', 'cheek/r-cheek-bones'] },
  { name: 'eyes', label: 'Глаза: размер', min: -1, max: 1, step: 0.01, value: 0, targets: ['eyes/l-eye-scale', 'eyes/r-eye-scale'] },
  { name: 'lips', label: 'Губы: полнота', min: -1, max: 1, step: 0.01, value: 0, targets: ['mouth/mouth-upperlip-volume', 'mouth/mouth-lowerlip-volume'] },
  { name: 'faceAge', label: 'Черты лица: возраст', min: -1, max: 1, step: 0.01, value: 0, targets: ['head/head-age'] },
];

export type Params = Record<string, number>;

export const defaults = (): Params => Object.fromEntries(SLIDERS.map(s => [s.name, s.value]));

const RACES = ['caucasian', 'african', 'asian'] as const;
const GENDERS = ['female', 'male'] as const;
const AGES = ['young', 'old'] as const;
const WEIGHTS = ['minweight', 'maxweight'] as const;

/** Все файлы целей, которые нужны ползункам. */
export function targetFiles(): string[] {
  const out: string[] = [];
  for (const r of RACES) for (const g of GENDERS) for (const a of AGES) out.push(`macrodetails/${r}-${g}-${a}`);
  for (const g of GENDERS) for (const a of AGES) for (const w of WEIGHTS) out.push(`macrodetails/universal-${g}-${a}-averagemuscle-${w}`);
  for (const s of SLIDERS) for (const t of s.targets ?? []) out.push(`${t}-decr`, `${t}-incr`);
  return out;
}

/** Веса целей по ползункам. Раса — доли (по умолчанию — вся «caucasian»). */
export function weightsOf(p: Params, race: Record<(typeof RACES)[number], number> = { caucasian: 1, african: 0, asian: 0 }): Map<string, number> {
  const w = new Map<string, number>();
  const g = { female: 1 - p.gender, male: p.gender };
  const t = Math.min(1, Math.max(0, (p.age - 25) / (90 - 25)));
  const a = { young: 1 - t, old: t };
  const wt = { minweight: Math.max(0, -p.weight), maxweight: Math.max(0, p.weight) };
  for (const r of RACES) for (const gg of GENDERS) for (const aa of AGES) w.set(`macrodetails/${r}-${gg}-${aa}`, race[r] * g[gg] * a[aa]);
  for (const gg of GENDERS) for (const aa of AGES) for (const ww of WEIGHTS) w.set(`macrodetails/universal-${gg}-${aa}-averagemuscle-${ww}`, g[gg] * a[aa] * wt[ww]);
  for (const s of SLIDERS) {
    const v = p[s.name] ?? 0;
    for (const tt of s.targets ?? []) {
      w.set(`${tt}-decr`, Math.max(0, -v));
      w.set(`${tt}-incr`, Math.max(0, v));
    }
  }
  return w;
}

export class Human {
  /** базовая сетка (вся, с вспомогательными частями — к ним привязаны глаза и ресницы) */
  readonly obj: Obj;
  readonly base: Float32Array;
  /** сетка с целями — для тела и подгонки прокси */
  readonly pos: Float32Array;
  readonly targets: Map<string, Target>;
  readonly load: { objMs: number; targetsMs: number; targetBytes: number; targets: number };

  private constructor(obj: Obj, targets: Map<string, Target>, load: Human['load']) {
    this.obj = obj;
    this.base = obj.v;
    this.pos = new Float32Array(obj.v);
    this.targets = targets;
    this.load = load;
  }

  static async load(): Promise<Human> {
    const t0 = performance.now();
    const obj = parseObj(await (await fetch(`${DATA}3dobjs/base.obj`)).text());
    const objMs = Math.round(performance.now() - t0);
    const t1 = performance.now();
    let bytes = 0;
    const files = targetFiles();
    const list = await Promise.all(
      files.map(async f => {
        const text = await (await fetch(`${DATA}targets/${f}.target`)).text();
        bytes += text.length;
        return [f, parseTarget(text)] as const;
      }),
    );
    return new Human(obj, new Map(list), { objMs, targetsMs: Math.round(performance.now() - t1), targetBytes: bytes, targets: files.length });
  }

  /** Сетка по ползункам: база + Σ вес × сдвиг. */
  apply(p: Params, race?: Parameters<typeof weightsOf>[1]) {
    const pos = this.pos;
    pos.set(this.base);
    for (const [name, w] of weightsOf(p, race)) {
      if (Math.abs(w) < 1e-4) continue;
      const t = this.targets.get(name);
      if (!t) throw new Error(`нет цели ${name}`);
      const { idx, d } = t;
      for (let i = 0; i < idx.length; i++) {
        const o = idx[i] * 3;
        pos[o] += w * d[i * 3];
        pos[o + 1] += w * d[i * 3 + 1];
        pos[o + 2] += w * d[i * 3 + 2];
      }
    }
  }
}
