// Кто как выглядит (spec docs/specs/2026-10-shell-3d.md, «Больница на экране»; spec docs/specs/2026-10-people.md; геймдизайн
// §13): виды людей набора, рост, цвета одежды по должности. Одно место для этих чисел: запекание (bake.ts), люди на экране
// (people.ts, population.ts) и тесты берут их отсюда.
import type { Id } from '../content/types';

/** Рост до макушки, м: средний взрослый — 1,76 и 1,64 (мужчины и женщины), пожилые — на 4 см ниже. */
export const STATURE: Record<'m' | 'f', Record<'adult' | 'old', number>> = {
  m: { adult: 1.76, old: 1.72 },
  f: { adult: 1.64, old: 1.6 },
};

/** С какого возраста пациент — «пожилой» (вид и рост). */
export const OLD_AGE = 65;

export type Use = 'staff' | 'registrar' | 'patient' | 'paramedic';

/**
 * Вид человека из набора Rocketbox (tools/app/people.mjs): пол, возраст, кому он годится. Голова — 1/7–1/8 роста
 * (геймдизайн §13): тест tools/test/people.test.ts меряет её у каждого вида.
 */
export interface LookSpec {
  name: string;
  sex: 'm' | 'f';
  age: 'adult' | 'old';
  use: Use;
  /**
   * должности, которым вид — свой (хирург — в зелёном костюме с шапочкой, медсестра — в костюме); у таких видов одежда
   * красится по маске атласа. Нет — вид годится любой должности своего назначения
   */
  roles?: string[];
  /**
   * профессии пациентов, которым вид — свой (каски и спецодежда, решение владельца #109): такой вид получает только пациент
   * этих профессий, и то не каждый — `WORKWEAR`
   */
  jobs?: string[];
}

/** Доля пациентов подходящей профессии в спецодежде (по зерну): остальные пришли не с работы — в обычной одежде. */
export const WORKWEAR = 0.5;

/**
 * Виды (spec docs/specs/2026-10-people.md, «Состав»; tools/app/people.mjs) — 59 по решению владельца #109: медики по
 * должностям, регистратура, 42 вида пациентов, спецодежда — пациентам своих профессий.
 */
const R = (name: string, sex: 'm' | 'f', use: Use, more: Pick<LookSpec, 'roles' | 'jobs'> & { age?: 'old' } = {}): LookSpec => ({
  name, sex, age: 'adult', use, ...more,
});
const NURSES = ['role.nurse', 'role.or_nurse', 'role.orderly'];
const OR = ['role.surgeon', 'role.anesthetist'];
const OLD = { age: 'old' } as const;
export const LOOKS: LookSpec[] = [
  // белые халаты — врачи, специалисты, лаборанты, врачи УЗИ и эндоскописты: любая должность без своего вида
  R('Medical_Male_03', 'm', 'staff'),
  R('Medical_Female_02', 'f', 'staff'),
  R('Medical_Male_01', 'm', 'staff'),
  // костюм в цвете должности: у женщин — сёстры, санитарки, операционная и рентгенолаборанты
  R('Medical_Female_01', 'f', 'staff', { roles: [...NURSES, ...OR, 'role.radiographer'] }),
  // хирург в шапочке и маске — операционная у мужчин; он же без шапочки и маски — медбратья и санитары
  R('Medical_Male_04', 'm', 'staff', { roles: OR }),
  R('Medical_Male_04_Scrubs', 'm', 'staff', { roles: NURSES }),
  // рентгенолаборант в защитном фартуке
  R('Medical_Male_05', 'm', 'staff', { roles: ['role.radiographer'] }),
  // фельдшеры скорой — синяя форма, как есть
  R('Medical_Female_03', 'f', 'paramedic'),
  R('Medical_Male_02', 'm', 'paramedic'),
  // регистратура — деловая одежда
  R('Business_Female_01', 'f', 'registrar'),
  R('Business_Female_03', 'f', 'registrar'),
  R('Business_Male_03', 'm', 'registrar'),
  R('Business_Male_06', 'm', 'registrar'),
  // пациентки: 13 предложенных и 3 из запаса, пожилые — две
  ...['Female_Adult_01', 'Female_Adult_04', 'Female_Adult_05', 'Female_Adult_07', 'Female_Adult_08', 'Female_Adult_09', 'Female_Adult_11'].map(n => R(n, 'f', 'patient')),
  ...['Female_Adult_13', 'Female_Adult_14', 'Female_Adult_15', 'Female_Adult_17', 'Female_Adult_03', 'Female_Adult_12', 'Business_Female_04'].map(n => R(n, 'f', 'patient')),
  R('Female_Adult_02', 'f', 'patient', OLD),
  R('Business_Female_02', 'f', 'patient', OLD),
  // пациенты: 13 предложенных и 13 из запаса, пожилые — четверо
  ...['Male_Adult_01', 'Male_Adult_02', 'Male_Adult_04', 'Male_Adult_06', 'Male_Adult_07', 'Male_Adult_08', 'Male_Adult_11', 'Male_Adult_12'].map(n => R(n, 'm', 'patient')),
  ...['Male_Adult_13', 'Male_Adult_14', 'Male_Adult_20', 'Male_Adult_09', 'Male_Adult_10', 'Male_Adult_16', 'Male_Adult_17', 'Male_Adult_18'].map(n => R(n, 'm', 'patient')),
  ...['Business_Male_01', 'Business_Male_02', 'Business_Male_04', 'Business_Male_05', 'Delivery_Male_01', 'Wood_Male_01'].map(n => R(n, 'm', 'patient')),
  R('Male_Adult_03', 'm', 'patient', OLD),
  R('Male_Adult_05', 'm', 'patient', OLD),
  R('Business_Male_07', 'm', 'patient', OLD),
  R('Gardener_Male_01', 'm', 'patient', OLD),
  // каски и спецодежда — только пациентам своих профессий (предложение агента — лист на одобрение владельцу)
  R('Construction_Male_01', 'm', 'patient', { jobs: ['job.builder'] }),
  R('Construction_Male_02', 'm', 'patient', { jobs: ['job.builder', 'job.welder', 'job.miner'] }),
  R('Construction_Female_01', 'f', 'patient', { jobs: ['job.builder'] }),
  R('Chef_Female_01', 'f', 'patient', { jobs: ['job.cook'] }),
];

export const lookSpec = (name: string): LookSpec | undefined => LOOKS.find(l => l.name === name);

/** Рост вида по таблице. */
export const statureOf = (s: Pick<LookSpec, 'sex' | 'age'>) => STATURE[s.sex][s.age];

/**
 * Цвет одежды по должности (геймдизайн §13): врачи — белые халаты; медсёстры и хирурги — костюмы своих цветов;
 * лаборанты — белое; рентгенолаборанты — серо-голубое; санитары — серое. Линейный RGB, как в материалах Three.js.
 */
export const ROLE_COLOR: Record<string, number> = {
  'role.nurse': 0x6fa8d6,
  'role.or_nurse': 0x4f9f96,
  'role.surgeon': 0x3f8f6f,
  'role.anesthetist': 0x4f9f96,
  'role.radiographer': 0x7a93ad,
  // санитар (spec docs/specs/2026-10-orderlies.md) — в сером, как в геймдизайне (§13)
  'role.orderly': 0x8c8f93,
};
/** Фельдшер скорой — в синей форме (spec docs/specs/2026-10-orderlies.md, «Что видно»): ввозит привезённого и уходит. */
export const PARAMEDIC = 0x2f5d9e;
/** Белый халат — врачам и всем, кого нет в ROLE_COLOR. */
export const COAT = 0xf2f4f4;

/** Цвет одежды по должности. */
export const roleColor = (role: Id): number => ROLE_COLOR[role] ?? COAT;

/**
 * Цвета волос (spec docs/specs/2026-10-people.md, часть 2б) — природные, sRGB. Шейдер (people.ts) кладёт цвет на яркость
 * волос вида: пряди и тени между ними остаются, меняется цвет.
 */
export const HAIR = {
  black: 0x2a2523,
  dark: 0x45332a,
  brown: 0x6a4c3a,
  auburn: 0x7e4630,
  light: 0x957657,
  blonde: 0xc3a57e,
  grey: 0x96938f,
  white: 0xd2d0cc,
} as const;
export type HairName = keyof typeof HAIR;
const NATURAL: HairName[] = ['black', 'dark', 'brown', 'auburn', 'light', 'blonde'];

/** Яркость цвета sRGB (luma), 0–1 — в тех же числах, что яркость волос вида (tools/app/people.mjs). */
export const lumaOf = (hex: number) => (0.2126 * ((hex >> 16) & 255) + 0.7152 * ((hex >> 8) & 255) + 0.0722 * (hex & 255)) / 255;

/**
 * Насколько цвет волос может уйти от своего у вида (по яркости): светлее — до ×5 (тёмные волосы в каштановые и русые
 * выходят живыми), темнее — до ×0,45 (у светлых волос вида тёмный цвет лёг бы плоско, а место волос на голове у светлых
 * найдено осторожнее — темнее красить нечего).
 */
export const HAIR_LIGHTER = 5;
export const HAIR_DARKER = 0.45;
/** Доля людей с волосами «как у вида»; доля седых: у пожилых, у пациентов с 50 лет, у остальных. */
export const HAIR_AS_IS = 0.35;
export const GREY = { old: 0.65, fifty: 0.3, other: 0.06 };
/** Яркость кожи — множитель от и до: лица одного вида у разных людей чуть светлее или темнее. */
export const SKIN = [0.9, 1.06] as const;

/** Оттенок человека: цвет волос (sRGB) или null — «как у вида»; множитель яркости кожи. */
export interface Tone {
  hair: number | null;
  skin: number;
}

/** Перемешать биты зерна (финализатор MurmurHash3): соседние зёрна — далёкие оттенки, и вид по зерну не подсказывает оттенок. */
function mix(x: number): number {
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return (x ^ (x >>> 16)) >>> 0;
}

/**
 * Оттенок человека по зерну (spec docs/specs/2026-10-people.md, часть 2б): у одного вида — разные волосы и кожа, и очередь из
 * одинаковых людей перестаёт быть одинаковой. `hair` — яркость волос вида (0 — волос в маске нет: шапка, лысина); `age` —
 * возраст пациента, у персонала — не знаем. Седые — пожилые и часть людей за 50; остальным — природный цвет, который не
 * уходит от своего у вида дальше HAIR_LIGHTER и HAIR_DARKER.
 */
export function toneOf(seed: number, spec: Pick<LookSpec, 'age'>, hair: number, age?: number): Tone {
  const a = mix(seed ^ 0x2545f491);
  const b = mix(a);
  const u1 = (a & 0xffff) / 0x10000;
  const u2 = (a >>> 16) / 0x10000;
  const skin = SKIN[0] + (SKIN[1] - SKIN[0]) * ((b & 0xffff) / 0x10000);
  if (hair <= 0 || u1 < HAIR_AS_IS) return { hair: null, skin };
  const old = spec.age === 'old' || (age !== undefined && age >= OLD_AGE);
  const grey = old ? GREY.old : age !== undefined && age >= 50 ? GREY.fifty : GREY.other;
  const v = (u1 - HAIR_AS_IS) / (1 - HAIR_AS_IS);
  if (v < grey) return { hair: v < grey * 0.6 ? HAIR.grey : HAIR.white, skin };
  const fits = NATURAL.filter(n => lumaOf(HAIR[n]) <= hair * HAIR_LIGHTER && lumaOf(HAIR[n]) >= hair * HAIR_DARKER);
  return { hair: fits.length ? HAIR[fits[Math.floor(u2 * fits.length)]] : null, skin };
}
