// Язык интерфейса (спецификация прототипа: русский и английский с первого дня). Строки читаются при отрисовке —
// `T.раздел.ключ`, не в константы модуля: язык можно сменить на ходу. Названия помещений, должностей и жалоб — из
// базы (`name.ru`); английских в базе пока нет — показываются русские.
import { en } from './en';
import { ru, type Strings } from './ru';

export type Lang = 'ru' | 'en';
export let T: Strings = ru;
export let lang: Lang = 'ru';

export function setLang(l: Lang) {
  lang = l;
  T = l === 'en' ? en : ru;
}

/** Язык по умолчанию — системы: русский для `ru*`, иначе английский. */
export function systemLang(): Lang {
  return typeof navigator !== 'undefined' && !/^ru\b/i.test(navigator.language || 'ru') ? 'en' : 'ru';
}

/** Название из базы: на языке интерфейса, иначе по-русски. */
export function named(n: { ru: string; en?: string } | undefined, fallback = ''): string {
  if (!n) return fallback;
  return (lang === 'en' && n.en) || n.ru;
}

/** Название в родительном падеже («нет регистратуры»); по-английски падежа нет — то же название. */
export function genitive(n: { name: { ru: string; en?: string }; gen: { ru: string; en?: string } } | undefined, fallback = ''): string {
  if (!n) return fallback;
  return lang === 'en' ? named(n.name, fallback) : named(n.gen, fallback);
}

/** Часы смены: «08:05». */
export function clock(t: number): string {
  const s = ((t % 86400) + 86400) % 86400;
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;
}

/** Множитель из процентов: 80 → «×0,8», 115 → «×1,15» (сложность, spec docs/specs/2026-10-difficulty.md). */
export function factor(pct: number): string {
  return `×${(pct / 100).toLocaleString(lang === 'en' ? 'en-US' : 'ru-RU', { maximumFractionDigits: 2 })}`;
}

/** Деньги: «12 000 ₽» (валюта — рубль, как касса «Анамнеза»; геймдизайн §8 — условная монета, решит владелец). */
export function money(n: number): string {
  return `${Math.round(n).toLocaleString(lang === 'en' ? 'en-US' : 'ru-RU')} ₽`;
}
