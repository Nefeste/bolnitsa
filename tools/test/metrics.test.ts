// Слой «Показатели» (spec docs/specs/2026-10-metrics-layer.md, «Проверки»): столбик помещения по его нагрузке сейчас —
// высота растёт с людьми и ожиданием и упирается в потолок; цвет — пороги пола слоя «Очереди и загрузка» (15 и 30 минут,
// 3/4 коек); не работает — низкий серый с причиной; запомненный показатель — в настройках игрока.
import { describe, expect, test } from 'bun:test';
import type { RoomLoad } from '../../src/app/flow';
import { WAIT_BAD, WAIT_OK } from '../../src/app/flow';
import { COLOR, COLUMN_FLAT, COLUMN_MAX, COLUMN_MIN, columnOf, LOAD_FULL, METRICS, METRICS_READY, WAIT_FULL } from '../../src/app/metrics';
import { parseSettings } from '../../src/app/settings';
import { setLang } from '../../src/i18n';

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

  test('показатели: выручка и прибыль ждут части 2; в настройках — только из списка', () => {
    expect(METRICS).toEqual(['load', 'wait', 'revenue', 'profit']);
    expect(METRICS_READY).toEqual(['load', 'wait']);
    expect(parseSettings('{"metric":"wait"}').metric).toBe('wait');
    expect(parseSettings('{"metric":"money"}').metric).toBeNull();
  });
});
