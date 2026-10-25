// Кто как выглядит (spec docs/specs/2026-10-shell-3d.md, «Больница на экране»; геймдизайн §13): виды людей набора,
// рост, цвета одежды по должности, палитры пациентов. Одно место для этих чисел: запекание (bake.ts), люди на экране
// (people.ts) и тесты берут их отсюда.
import type { Id } from '../content/types';

/** Рост до макушки, м: средний взрослый — 1,76 и 1,64 (мужчины и женщины), пожилые — на 4 см ниже. */
export const STATURE: Record<'m' | 'f', Record<'adult' | 'old', number>> = {
  m: { adult: 1.76, old: 1.72 },
  f: { adult: 1.64, old: 1.6 },
};

/** С какого возраста пациент — «пожилой» (вид и рост). */
export const OLD_AGE = 65;

export type Use = 'staff' | 'registrar' | 'patient';

/**
 * Вид человека из набора: пол, возраст, кому он годится, какие материалы красятся на экземпляр (одежда), пропорции.
 * Пропорции набора Quaternius — мультяшные (голова — около трети роста); у людей обычных пропорций голова — 1/7–1/8
 * роста (геймдизайн §13). Тест tools/test/people.test.ts меряет голову у каждого вида и сверяет с этой отметкой.
 */
export interface LookSpec {
  name: string;
  sex: 'm' | 'f';
  age: 'adult' | 'old';
  use: Use;
  /** материалы одежды, которые красятся цветом экземпляра */
  tint: string[];
  proportions: 'cartoon' | 'normal';
  /**
   * должности, которым вид — свой (Rocketbox: хирург — в зелёном костюме с шапочкой, медсестра — в костюме); у таких видов
   * одежда красится по маске атласа. Нет — вид годится любой должности своего назначения
   */
  roles?: string[];
}

const L = (name: string, sex: 'm' | 'f', age: 'adult' | 'old', use: Use, tint: string[]): LookSpec => ({ name, sex, age, use, tint, proportions: 'cartoon' });

export const LOOKS: LookSpec[] = [
  L('Doctor_Male_Young', 'm', 'adult', 'staff', ['Main']),
  L('Doctor_Female_Young', 'f', 'adult', 'staff', ['Main']),
  L('Doctor_Male_Old', 'm', 'old', 'staff', ['Main']),
  L('Doctor_Female_Old', 'f', 'old', 'staff', ['Main']),
  L('Suit_Male', 'm', 'adult', 'registrar', []),
  L('Suit_Female', 'f', 'adult', 'registrar', []),
  L('Casual_Male', 'm', 'adult', 'patient', ['Shirt']),
  L('Casual_Female', 'f', 'adult', 'patient', ['Shirt']),
  L('Casual2_Male', 'm', 'adult', 'patient', ['Shirt']),
  L('Casual2_Female', 'f', 'adult', 'patient', ['Shirt']),
  L('Casual3_Male', 'm', 'adult', 'patient', ['Shirt']),
  L('Casual3_Female', 'f', 'adult', 'patient', ['Shirt']),
  L('Casual_Bald', 'm', 'old', 'patient', ['Shirt']),
  L('OldClassy_Male', 'm', 'old', 'patient', ['Shirt']),
  L('OldClassy_Female', 'f', 'old', 'patient', ['Shirt']),
];

/**
 * Люди Rocketbox (spec docs/specs/2026-10-people.md, часть 1 — за ключом адреса `?people=rb`; tools/app/people.mjs): врачи
 * в халатах — любая должность персонала; медсестра — сёстры, санитары и операционная, костюм в цвете должности; хирург —
 * операционная, у мужчин и сёстры. Регистраторов в части 1 нет — их место занимают врачи.
 */
const R = (name: string, sex: 'm' | 'f', use: Use, roles?: string[]): LookSpec => ({ name, sex, age: 'adult', use, tint: [], proportions: 'normal', ...(roles ? { roles } : {}) });
const NURSES = ['role.nurse', 'role.or_nurse', 'role.orderly'];
const OR = ['role.surgeon', 'role.anesthetist'];
export const RB_LOOKS: LookSpec[] = [
  R('Medical_Male_03', 'm', 'staff'),
  R('Medical_Female_02', 'f', 'staff'),
  R('Medical_Female_01', 'f', 'staff', [...NURSES, ...OR]),
  R('Medical_Male_04', 'm', 'staff', [...NURSES, ...OR]),
  R('Male_Adult_08', 'm', 'patient'),
  R('Female_Adult_09', 'f', 'patient'),
];

export const lookSpec = (name: string): LookSpec | undefined => LOOKS.find(l => l.name === name) ?? RB_LOOKS.find(l => l.name === name);

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

/** Своя одежда пациентов — по зерну; больничная рубашка — лежащим. */
export const CLOTHES = [0x3b5b8c, 0x8c3b3b, 0x4f7a4a, 0x6b5b8c, 0x8c7a3b, 0x3b7a8c, 0x5c5c5c, 0xa0613b, 0x2f3f5f, 0x7a2f4f];
export const GOWN = 0x9cc3d8;
/** Тон кожи — по зерну. */
export const SKIN = [0xe8b896, 0xd9a07a, 0xf1c9a5, 0xc68863, 0xa86f4c, 0xeac0a0];
