// Строки смены врача по-русски (spec docs/specs/2026-11-doctor-shift.md, часть 2): раздел «Для врача» на экране начала,
// второй шаг, «До конца смены», окно «Итог смены» и рекорд. Английский — shift.en.ts. Слова итога — как у «Смены» «Анамнеза».
import type { Manage } from '../content/types';
import { pluralRu as plural } from './plural';

/** Балл итога: «2,77». */
const points = (p: number) => p.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** День рекорда из `2026-11-08`: «08.11.2026». */
const day = (iso: string) => iso.split('-').reverse().join('.');
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
/** День случая дня из `2026-11-08`: «8 ноября». */
const dayName = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;

export const shiftRu = {
  shift: {
    /** экран начала */
    section: 'Для врача',
    start: 'Смена врача',
    startHint: 'готовая больница, принимаете только вы — итог от A до D и рекорд',
    lead: 'Дневная смена, 08:00–20:00. Нанятые врачи кабинетов в этот день не принимают — все больные ваши; медсёстры, лаборанты, рентген и хирурги работают. Ни стройки, ни кассы — только приём.',
    hospital: 'Больница',
    poly: 'Поликлиника',
    polyHint: 'кабинеты, лаборатория, ЭКГ; рентгена нет',
    city: 'Городская больница',
    cityHint: 'все обследования, приёмное и скорая',
    best: (grade: string, p: number) => `лучший: ${grade}, балл ${points(p)}`,
    noBest: 'смен здесь ещё не было',
    level: 'Уровень',
    levelHint: 'Уровень меняет поток и терпение больных; лучший результат — свой у каждой больницы и уровня.',
    /** что уровень меняет в смене врача: кассы нет — только поток и терпение */
    line: {
      calm: 'Больных меньше, и ждут они дольше.',
      normal: 'Поток и терпение — как задуманы.',
      hard: 'Больных больше, и ждут они меньше.',
    } as Record<Manage, string>,
    numbers: (inflow: string, patience: string) => `поток ${inflow} · терпение ${patience}`,
    go: 'Начать смену',
    /** верхняя полоса */
    untilEnd: 'До конца смены',
    untilEndSoon: 'до 20:00 — как можно быстрее; остановится, когда что-то случится',
    /** окно «Итог смены» */
    title: (venue: string) => `Итог смены · ${venue}`,
    levelName: (level: string) => `уровень «${level}»`,
    category: { accuracy: 'Точность', defensibility: 'Обоснованность', thrift: 'Бережливость', safety: 'Безопасность', speed: 'Скорость' } as Record<string, string>,
    overall: 'Итог',
    points: (p: number) => `балл ${points(p)} из 3`,
    seen: (seen: number, arrived: number) => `Принято: ${seen} из ${arrived}`,
    left: (n: number) => `Ушли, не дождавшись: ${n}`,
    correct: (n: number) => `Верных диагнозов: ${n} % (почти верный — за половину)`,
    minutes: (n: number) => `На приём — в среднем ${n} ${plural(n, 'минута', 'минуты', 'минут')}`,
    nobody: 'Никого не приняли — итога нет.',
    isBest: 'Лучший результат в этой больнице на этом уровне.',
    bestLine: (grade: string, p: number, iso: string) => `Лучший здесь: ${grade}, балл ${points(p)} — ${day(iso)}.`,
    again: 'Новая смена',
    menu: 'В меню',
  },
  /** случай дня (spec docs/specs/2026-11-doctor-shift.md, часть 3): экран начала, список дней, «Итог дня» */
  daily: {
    start: 'Случай дня',
    startHint: 'один трудный больной в сутки, у всех тот же; любой из последних 30 дней — когда угодно',
    lead: 'Трудный больной: по жалобам похоже на многое, и расспроса с осмотром мало. Городская больница, других больных нет — только он. Засчитывается первая попытка; переиграть можно.',
    days: 'Дни',
    day: (iso: string, i: number) => (i === 0 ? `Сегодня, ${dayName(iso)}` : i === 1 ? `Вчера, ${dayName(iso)}` : dayName(iso)),
    played: (grade: string, verdict: string) => `сыгран: ${grade}, ${verdict}`,
    notPlayed: 'не сыгран',
    verdict: { correct: 'диагноз верный', partly: 'почти верный', wrong: 'неверный' } as Record<string, string>,
    /** окно «Итог дня» */
    title: (iso: string) => `Случай дня · ${dayName(iso)}`,
    grade: (grade: string, verdict: string) => `Итог: ${grade}, ${verdict}`,
    first: 'Засчитано — первая попытка.',
    counted: (grade: string, verdict: string) => `Засчитана первая попытка: ${grade}, ${verdict}.`,
    review: 'Разбор',
    again: 'Сыграть снова',
  },
};

export type ShiftStrings = typeof shiftRu;
