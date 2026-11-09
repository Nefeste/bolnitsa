// Строки испытаний по-русски (spec docs/specs/2026-11-challenges.md, часть 2): раздел «Испытания» на экране начала, второй шаг,
// окно «Итог испытания», рекорд и строка «Без показаний» в окне врача. Английский — challenge.en.ts. Названия и условия
// испытаний — в их записях (`content/challenges/`).
import { pluralRu as plural } from './plural';

const points = (p: number) => p.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (v: number) => `${v.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} %`;
const rub = (n: number) => `${Math.round(n).toLocaleString('ru-RU')} ₽`;
const day = (iso: string) => iso.split('-').reverse().join('.');

export const challengeRu = {
  challenges: {
    /** экран начала */
    start: 'Испытания',
    pick: 'Выбрать испытание',
    startHint: 'одна смена с особым условием — итог от A до D и рекорд',
    lead: 'Короткая партия в готовой больнице с одним условием: смена — 12 часов игры, «В долг» — неделя. Итог — от A до D, пройдено — не ниже «B». Не пройденное ничего не отнимает.',
    chief: 'главврача — стройка, найм и касса',
    doctor: 'врача — вы один, без стройки и кассы',
    notPlayed: 'ещё не играли',
    passed: 'пройдено',
    notPassed: 'не пройдено',
    best: (grade: string, line: string, done: boolean) => `лучший: ${grade}, ${line} — ${done ? 'пройдено' : 'не пройдено'}`,
    role: 'Кто вы — в испытаниях главврача',
    /** число итога по видам — коротко, для строки рекорда */
    short: {
      unseen: (v: number) => `не приняты ${pct(v)}`,
      seen: (v: number) => `приняты ${v}`,
      cash: (v: number) => `касса ${rub(v)}`,
      shift: (v: number) => `балл ${points(v)}`,
    },
    /** окно «Итог испытания» */
    title: (name: string) => `Итог испытания · ${name}`,
    grade: (grade: string) => `Итог: ${grade}`,
    value: {
      unseen: (v: number, seen: number, arrived: number) => `Не приняты до конца: ${pct(v)} — врач позвал ${seen} из ${arrived}`,
      seen: (v: number, arrived: number) => `Приняты — врач позвал до конца: ${v} из ${arrived}`,
      cash: (v: number) => `Касса в конце: ${rub(v)}`,
      shift: (v: number) => `Итог смены врача — балл ${points(v)} из 3`,
    },
    nobody: 'Никого не приняли — итога смены нет.',
    reds: (inTime: number, total: number, minutes: number) =>
      total === 0 ? 'Красных по шкале не привозили.' : `Красных по шкале за ${minutes} ${plural(minutes, 'минуту', 'минуты', 'минут')}: ${inTime} из ${total} — для сведения`,
    unindicated: (n: number, max: number) => `Обследований без показаний: ${n} — можно не больше ${max}`,
    passedYes: 'Пройдено.',
    passedNo: 'Не пройдено: нужен итог не ниже «B».',
    passedNoRule: (max: number) => `Не пройдено: нужен итог не ниже «B» и не больше ${max} обследований без показаний.`,
    isBest: 'Лучший результат этого испытания.',
    bestLine: (grade: string, line: string, iso: string) => `Лучший: ${grade}, ${line} — ${day(iso)}.`,
    again: 'Ещё раз',
    /** окно врача, «Только по показаниям» */
    audit: (n: number, max: number) => `Без показаний: ${n} из ${max}`,
    auditHint: 'Страховая проверяет каждый ваш приём: обследование без показаний не оплатит. Больше — испытание не пройдено.',
    /** верхняя полоса */
    untilEnd: 'До конца испытания',
    untilEndSoon: 'как можно быстрее; остановится, когда что-то случится',
  },
};

export type ChallengeStrings = typeof challengeRu;
