// Слой «Показатели» (spec docs/specs/2026-10-metrics-layer.md, «Проверки»): столбик помещения по его нагрузке сейчас —
// высота растёт с людьми и ожиданием и упирается в потолок; цвет — пороги пола слоя «Очереди и загрузка» (15 и 30 минут,
// 3/4 коек); не работает — низкий серый с причиной; запомненный показатель — в настройках игрока.
import { describe, expect, test } from 'bun:test';
import type { RoomLoad } from '../../src/app/flow';
import { WAIT_BAD, WAIT_OK } from '../../src/app/flow';
import {
  COLOR, COLUMN_FLAT, COLUMN_MAX, COLUMN_MIN, columnOf, LOAD_FULL, METRICS, METRICS_READY, MONEY, MONEY_METRICS, moneyColumnOf, moneyTop, serviceRoom, shortMoney, WAIT_FULL,
} from '../../src/app/metrics';
import { parseSettings } from '../../src/app/settings';
import { money, setLang } from '../../src/i18n';
import { buildDb } from '../content/load';

const load = (over: Partial<RoomLoad> = {}): RoomLoad => ({ queue: 0, wait: 0, busy: false, ask: false, ...over });

describe('слой «Показатели»: столбики', () => {
  test('загрузка: пусто — плашка на полу; люди — столбик от колена, выше, до потолка; цвет — по самому долгому ожиданию', () => {
    setLang('ru');
    expect(columnOf('load', load())).toMatchObject({ value: 0, height: COLUMN_FLAT, color: COLOR.empty, text: 'свободно' });
    expect(columnOf('load', load()).short).toBeUndefined();
    const busy = columnOf('load', load({ busy: true }));
    expect(busy.height).toBeGreaterThan(COLUMN_MIN);
    expect(busy.short).toBe('1');
    expect(busy).toMatchObject({ value: 1, color: COLOR.green, text: 'внутри занято' });
    const three = columnOf('load', load({ queue: 2, busy: true, wait: WAIT_OK - 1 }));
    expect(three.value).toBe(3);
    expect(three.height).toBeGreaterThan(busy.height);
    expect(three.color).toBe(COLOR.green);
    expect(three.text).toBe('ждут 2 · внутри занято');
    expect(columnOf('load', load({ queue: 2, wait: WAIT_OK })).color).toBe(COLOR.yellow);
    expect(columnOf('load', load({ queue: 2, wait: WAIT_BAD })).color).toBe(COLOR.red);
    expect(columnOf('load', load({ queue: LOAD_FULL * 3 })).height).toBe(COLUMN_MAX);
  });

  test('коечные: по доле занятых коек, цвет — меньше 3/4, больше, все; очередь к ним — как у кабинета', () => {
    expect(columnOf('load', load({ beds: [0, 4] }))).toMatchObject({ height: COLUMN_FLAT, color: COLOR.empty, text: 'койки: занято 0 из 4' });
    expect(columnOf('load', load({ beds: [3, 4] })).short).toBe('3/4');
    expect(columnOf('load', load({ beds: [2, 4] })).color).toBe(COLOR.green);
    expect(columnOf('load', load({ beds: [3, 4] })).color).toBe(COLOR.yellow);
    expect(columnOf('load', load({ beds: [4, 4] }))).toMatchObject({ height: COLUMN_MAX, color: COLOR.red });
    expect(columnOf('load', load({ beds: [1, 2], queue: 1, wait: WAIT_BAD })).color).toBe(COLOR.red);
  });

  test('ожидание: никто не ждёт — низкий; дольше — выше, до часа; цвет — по порогам', () => {
    expect(columnOf('wait', load({ busy: true }))).toMatchObject({ height: COLUMN_FLAT, color: COLOR.empty, text: 'никто не ждёт' });
    const a = columnOf('wait', load({ queue: 3, wait: 10 * 60 }));
    const b = columnOf('wait', load({ queue: 1, wait: 40 * 60 }));
    expect(a.color).toBe(COLOR.green);
    expect(b.color).toBe(COLOR.red);
    expect(b.height).toBeGreaterThan(a.height);
    expect(a.text).toBe('ждут 3, самое долгое — 10 мин');
    expect(a.short).toBe('10 мин');
    expect(columnOf('wait', load({ queue: 1, wait: WAIT_FULL * 2 })).height).toBe(COLUMN_MAX);
  });

  test('не работает — низкий серый, в подписи — почему; по-английски — свои слова', () => {
    expect(columnOf('load', load({ queue: 5 }), 'не работает: нет двери')).toEqual({ value: 0, height: COLUMN_FLAT, color: COLOR.down, text: 'не работает: нет двери' });
    setLang('en');
    expect(columnOf('wait', load({ queue: 2, wait: 15 * 60 })).text).toBe('2 waiting, the longest — 15 min');
    setLang('ru');
  });

  test('показатели: все четыре считаются (часть 2); в настройках — только из списка', () => {
    expect(METRICS).toEqual(['load', 'wait', 'revenue', 'profit']);
    expect(METRICS_READY).toEqual(METRICS);
    expect(MONEY_METRICS).toEqual(['revenue', 'profit']);
    expect(parseSettings('{"metric":"wait"}').metric).toBe('wait');
    expect(parseSettings('{"metric":"profit"}').metric).toBe('profit');
    expect(parseSettings('{"metric":"money"}').metric).toBeNull();
  });
});

describe('слой «Показатели»: деньги по помещениям (часть 2)', () => {
  const { db } = buildDb();
  test('служебные помещения — те, что выручки не приносят никогда (решение владельца #120)', () => {
    const service = Object.keys(db.rooms).filter(t => serviceRoom(db, t)).sort();
    expect(service).toEqual(['room.procedure', 'room.reception', 'room.staff', 'room.toilet', 'room.triage', 'room.waiting']);
    for (const t of ['room.office', 'room.emergency', 'room.lab', 'room.xray', 'room.or', 'room.ward', 'room.icu']) expect(serviceRoom(db, t)).toBe(false);
  });

  test('выручка: от самой большой; нет — плашка; подпись — за что', () => {
    setLang('ru');
    const days = [{ income: 40_000, expenses: 10_000, visits: 12, exams: 3 }, { income: 10_000, expenses: 2_000, exams: 5 }, undefined];
    const service = [false, false, false];
    const top = moneyTop('revenue', days, service);
    expect(top).toBe(40_000);
    const a = moneyColumnOf('revenue', days[0], top, false);
    const b = moneyColumnOf('revenue', days[1], top, false);
    expect(a).toMatchObject({ value: 40_000, height: COLUMN_MAX, color: MONEY.revenue, short: '40 тыс.' });
    expect(a.text).toBe(`выручка ${money(40_000)} · приёмов 12 · обследований 3`);
    expect(b.height).toBeLessThan(a.height);
    expect(b.height).toBeGreaterThan(COLUMN_MIN);
    expect(moneyColumnOf('revenue', undefined, top, false)).toMatchObject({ value: 0, height: COLUMN_FLAT, text: 'выручки за сутки нет' });
    expect(moneyColumnOf('revenue', { income: 0, expenses: 500 }, top, true)).toMatchObject({ height: COLUMN_FLAT, color: MONEY.service, text: 'выручки нет — работает на всю больницу' });
  });

  test('прибыль: плюс — зелёный, минус — красный, высота по модулю; служебное — свои расходы серым', () => {
    setLang('ru');
    const days = [{ income: 30_000, expenses: 10_000 }, { income: 1_000, expenses: 6_000 }, { income: 0, expenses: 8_000 }];
    const service = [false, false, true];
    const top = moneyTop('profit', days, service);
    expect(top).toBe(20_000);
    const plus = moneyColumnOf('profit', days[0], top, false);
    expect(plus).toMatchObject({ value: 20_000, height: COLUMN_MAX, color: MONEY.plus, short: '+20 тыс.' });
    expect(plus.text).toBe(`прибыль +${money(20_000)}: выручка ${money(30_000)}, расходы ${money(10_000)}`);
    const minus = moneyColumnOf('profit', days[1], top, false);
    expect(minus).toMatchObject({ value: -5_000, color: MONEY.minus, short: '−5 тыс.' });
    const grey = moneyColumnOf('profit', days[2], top, true);
    expect(grey).toMatchObject({ value: -8_000, color: MONEY.service, text: `расходы ${money(8_000)} — работает на всю больницу` });
    expect(grey.height).toBeGreaterThan(minus.height);
    expect(moneyColumnOf('profit', undefined, top, false)).toMatchObject({ height: COLUMN_FLAT, text: 'ни доходов, ни расходов за сутки' });
  });

  test('короткие числа: тысячи, рубли, знак у прибыли; по-английски — k', () => {
    setLang('ru');
    expect(shortMoney(45_400)).toBe('45 тыс.');
    expect(shortMoney(800)).toBe(money(800));
    expect(shortMoney(-3_600, true)).toBe('−4 тыс.');
    expect(shortMoney(2_000, true)).toBe('+2 тыс.');
    setLang('en');
    expect(shortMoney(45_400)).toBe('45k');
    setLang('ru');
  });
});
