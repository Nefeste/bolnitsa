// Строки демо по-русски (spec docs/specs/2026-11-demo.md): полоса загрузки, окно «Итог» после первой планёрки, снимок
// больницы. Английский — demo.en.ts.
import { pluralRu as plural } from './plural';

export const demoRu = {
  demo: {
    /** полоса загрузки: что грузится сейчас */
    loadContent: 'База болезней и больницы',
    loadModels: (done: number, total: number) => `Мебель и аппараты: ${done} из ${total}`,
    loadPeople: (done: number, total: number) => `Люди: ${done} из ${total}`,
    loadWorld: 'Строим больницу',
    loadStart: 'Открываем смену',
    /** окно «Итог» */
    title: 'Итог',
    lead: (day: number) => `Первые сутки вашей амбулатории позади — вот ${day > 1 ? `сутки ${day}` : 'они'} в цифрах.`,
    built: 'Построено',
    builtNone: 'ничего',
    patients: 'Больные за сутки',
    arrived: (n: number) => `пришли ${n}`,
    seen: (n: number) => `приняты ${n}`,
    left: (n: number) => `ушли, не дождавшись, ${n}`,
    /** ушло больше, чем принято, а врач — вы один: что делать завтра, как в «почему?» планёрки */
    hire: 'Одному всех не принять: ещё кабинет врача с терапевтом примет тех, кого вы не успеваете.',
    own: 'Ваши приёмы',
    ownLine: (n: number, right: number) => `${n} ${plural(n, 'приём', 'приёма', 'приёмов')}, из них верно — ${right}`,
    ownNone: 'сами вы ещё никого не приняли',
    cash: 'Касса утром',
    played: 'Вы играете',
    minutes: (m: number) => `${m} ${plural(m, 'минуту', 'минуты', 'минут')}`,
    snapshot: 'Снимок больницы',
    saveShot: 'Сохранить снимок',
    savedTo: (where: string) => `Сохранён: ${where}`,
    downloaded: 'Снимок сохранён в загрузки браузера',
    wishlist: 'В список желаемого Steam',
    goOn: 'Играть дальше',
    menu: 'В меню',
  },
};

export type DemoStrings = typeof demoRu;
