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

/** Часы смены: «08:05». */
export function clock(t: number): string {
  const s = ((t % 86400) + 86400) % 86400;
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;
}

/** Деньги: «12 000 ₽» (валюта — рубль, как касса «Анамнеза»; геймдизайн §8 — условная монета, решит владелец). */
export function money(n: number): string {
  return `${Math.round(n).toLocaleString(lang === 'en' ? 'en-US' : 'ru-RU')} ₽`;
}
