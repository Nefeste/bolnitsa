// Слой «Показатели» (spec docs/specs/2026-10-metrics-layer.md; решение владельца 25.10.2026 — «Слой на карте»): над каждым
// помещением объёмный столбик — высота по значению, цвет по оценке. Часть 1 — показатели «сейчас» из среза: загрузка
// (кто ждёт и кто внутри, у коечных — занятые койки) и ожидание (самое долгое). Пороги цвета — те же, что у пола слоя
// «Очереди и загрузка» (геймдизайн §3). Часть 2 — деньги по помещениям за сутки из движка (`DaySummary.rooms`): выручка и
// прибыль; служебные помещения — свои расходы серым (решение владельца #120). Чистые функции без three.js — их проверяют
// тесты (tools/test/metrics.test.ts); слова — в src/i18n (`T.metrics`).
import type { ContentDb, Id } from '../content/types';
import { DOCTOR } from '../engine/hospital/requirements';
import type { RoomDay } from '../engine/shift/types';
import { money, T } from '../i18n';
import { BEDS_HIGH, dur, type RoomLoad, WAIT_BAD, WAIT_OK } from './flow';

/** Показатели слоя: «сейчас» — загрузка и ожидание; за сутки — выручка и прибыль (часть 2). */
export type Metric = 'load' | 'wait' | 'revenue' | 'profit';
export const METRICS: readonly Metric[] = ['load', 'wait', 'revenue', 'profit'];
/** Что уже считается: все четыре (часть 2). */
export const METRICS_READY: readonly Metric[] = METRICS;
/** Деньги за сутки: выручка и прибыль; у них — ползунок по суткам и график в карточке помещения. */
export const MONEY_METRICS: readonly Metric[] = ['revenue', 'profit'];

/**
 * Высота столбика, м: пусто или не работает — плашка на полу, чтобы её не спутать с мебелью; самый низкий столбик — по
 * колено; самый высокий — выше стен (2,7 м) в два с лишним раза.
 */
export const COLUMN_FLAT = 0.05;
export const COLUMN_MIN = 0.5;
export const COLUMN_MAX = 6.5;
/** Людей у помещения, при которых столбик загрузки — во всю высоту. */
export const LOAD_FULL = 10;
/** Ожидание во всю высоту, с: час. */
export const WAIT_FULL = 3600;

/** Цвета: те же, что у пола слоя «Очереди и загрузка»; пусто — светлый холодный, не работает — серый. */
export const COLOR = { green: 0x1fbf5a, yellow: 0xffc400, red: 0xff2a12, empty: 0x8fb3c4, down: 0x6f7a80 } as const;

/**
 * Столбик помещения: значение, высота, цвет, строка для подписи под курсором и короткое число над столбиком («3», «3/4»,
 * «42 мин»); пустому и не работающему числа не нужно.
 */
export interface Column {
  value: number;
  height: number;
  color: number;
  text: string;
  short?: string;
}

const scale = (x: number, full: number) => COLUMN_MIN + (Math.min(Math.max(x, 0), full) / full) * (COLUMN_MAX - COLUMN_MIN);
const byWait = (wait: number) => (wait >= WAIT_BAD ? COLOR.red : wait >= WAIT_OK ? COLOR.yellow : COLOR.green);

/**
 * Столбик помещения «сейчас». `down` — почему не работает (текст причины); тогда столбик низкий и серый, а в подписи —
 * причина, как у значка.
 */
export function columnOf(metric: Metric, load: RoomLoad, down?: string): Column {
  if (down !== undefined) return { value: 0, height: COLUMN_FLAT, color: COLOR.down, text: down };
  if (metric === 'wait') {
    if (load.queue === 0) return { value: 0, height: COLUMN_FLAT, color: COLOR.empty, text: T.metrics.noWait };
    return { value: load.wait, height: scale(load.wait, WAIT_FULL), color: byWait(load.wait), text: T.metrics.wait(load.queue, dur(load.wait)), short: dur(load.wait) };
  }
  // коечные: занятые койки из скольких
  if (load.beds && load.queue === 0) {
    const [used, all] = load.beds;
    const color = used === 0 ? COLOR.empty : used >= all ? COLOR.red : used >= all * BEDS_HIGH ? COLOR.yellow : COLOR.green;
    return { value: used, height: used > 0 && all > 0 ? scale(used / all, 1) : COLUMN_FLAT, color, text: T.metrics.beds(used, all), ...(used > 0 ? { short: `${used}/${all}` } : {}) };
  }
  const people = load.queue + (load.busy ? 1 : 0);
  if (people === 0) return { value: 0, height: COLUMN_FLAT, color: COLOR.empty, text: T.metrics.free };
  return { value: people, height: scale(people, LOAD_FULL), color: load.queue > 0 ? byWait(load.wait) : COLOR.green, text: T.metrics.load(load.queue, load.busy), short: String(people) };
}

/** Цвета денег: выручка — один нейтральный; прибыль — плюс зелёный, минус красный; служебное помещение — серое. */
export const MONEY = { revenue: 0x4f9fd8, plus: COLOR.green, minus: COLOR.red, service: 0x9aa4a9 } as const;

/**
 * Служебное помещение (решение владельца #120): выручки не приносит никогда — не принимает врач, нет коек и это не бокс, не смотровая
 * приёмного, не кабинет аппарата и не кабинет обследований (регистратура, ожидание, санузел, ординаторская, процедурный —
 * кровь берут для лаборатории, доврачебный). Оно работает на всю больницу.
 */
export function serviceRoom(db: ContentDb, type: Id): boolean {
  const t = db.rooms[type];
  if (!t) return false;
  return !t.beds && !t.box && !t.emergency && !t.needsEquipment && !t.staff.includes(DOCTOR) && !Object.values(db.exams).some(e => e.room === type);
}

/** Короткое число денег над столбиком: от тысячи — «45 тыс.», меньше — «800 ₽»; `sign` — со знаком (прибыль). */
export function shortMoney(n: number, sign = false): string {
  const s = sign && n > 0 ? '+' : n < 0 ? '−' : '';
  const a = Math.abs(n);
  return a >= 1000 ? `${s}${T.metrics.thousands(Math.round(a / 1000))}` : `${s}${money(a)}`;
}

/** Деньги со знаком: «+12 300 ₽», «−4 100 ₽». */
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${money(Math.abs(n))}`;

/**
 * Наибольшее значение среди помещений — по нему высота: выручка, у прибыли — модуль (у служебных — их расходы). Меньше
 * рубля — рубль, чтобы делить было на что.
 */
export function moneyTop(metric: Metric, days: readonly (RoomDay | undefined)[], service: readonly boolean[]): number {
  let top = 1;
  days.forEach((d, i) => {
    if (!d) return;
    const v = metric === 'revenue' ? d.income : service[i] ? d.expenses : Math.abs(d.income - d.expenses);
    if (v > top) top = v;
  });
  return top;
}

/**
 * Столбик денег помещения за сутки (`day`; нет — ни рубля за эти сутки). `top` — наибольшее среди помещений
 * (`moneyTop`): столбики — от него. Выручка — нейтральным цветом; прибыль — зелёным в плюсе, красным в минусе; у служебного
 * в прибыли — свои расходы серым, «работает на всю больницу» (решение владельца #120).
 */
export function moneyColumnOf(metric: Metric, day: RoomDay | undefined, top: number, service: boolean): Column {
  const income = day?.income ?? 0;
  const expenses = day?.expenses ?? 0;
  if (metric === 'revenue') {
    if (income <= 0) return { value: 0, height: COLUMN_FLAT, color: service ? MONEY.service : COLOR.empty, text: service ? T.metrics.serviceRevenue : T.metrics.noRevenue };
    return { value: income, height: scale(income, top), color: MONEY.revenue, text: T.metrics.revenue(money(income), day?.visits ?? 0, day?.exams ?? 0, day?.stays ?? 0), short: shortMoney(income) };
  }
  if (service) {
    if (expenses <= 0) return { value: 0, height: COLUMN_FLAT, color: MONEY.service, text: T.metrics.serviceRevenue };
    return { value: -expenses, height: scale(expenses, top), color: MONEY.service, text: T.metrics.service(money(expenses)), short: shortMoney(-expenses, true) };
  }
  if (income === 0 && expenses === 0) return { value: 0, height: COLUMN_FLAT, color: COLOR.empty, text: T.metrics.noMoney };
  const profit = income - expenses;
  return {
    value: profit, height: scale(Math.abs(profit), top), color: profit >= 0 ? MONEY.plus : MONEY.minus,
    text: T.metrics.profit(signed(profit), money(income), money(expenses)), short: shortMoney(profit, true),
  };
}
