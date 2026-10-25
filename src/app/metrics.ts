// Слой «Показатели» (spec docs/specs/2026-10-metrics-layer.md; решение владельца 25.10.2026 — «Слой на карте»): над каждым
// помещением объёмный столбик — высота по значению, цвет по оценке. Часть 1 — показатели «сейчас» из среза: загрузка
// (кто ждёт и кто внутри, у коечных — занятые койки) и ожидание (самое долгое). Пороги цвета — те же, что у пола слоя
// «Очереди и загрузка» (геймдизайн §3). Чистые функции без three.js — их проверяют тесты (tools/test/metrics.test.ts);
// слова — в src/i18n (`T.metrics`).
import { T } from '../i18n';
import { BEDS_HIGH, dur, type RoomLoad, WAIT_BAD, WAIT_OK } from './flow';

/** Показатели слоя; выручка и прибыль — часть 2 (деньги по помещениям в движке). */
export type Metric = 'load' | 'wait' | 'revenue' | 'profit';
export const METRICS: readonly Metric[] = ['load', 'wait', 'revenue', 'profit'];
/** Что уже считается: часть 1. */
export const METRICS_READY: readonly Metric[] = ['load', 'wait'];

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
