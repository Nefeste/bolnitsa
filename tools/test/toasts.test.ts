// Извещения всплывающими строками (spec docs/specs/2026-10-aaa-polish.md, «Извещения»): `toastsOf` — какие строки под
// часами в миг `now`, с какой прозрачностью.
import { describe, expect, test } from 'bun:test';
import { FADE, LIFE, type NoticeRow, RECENT, TOASTS, toastsOf } from '../../src/app/toasts';

const row = (at: number, extra: Partial<NoticeRow> = {}): NoticeRow => ({ t: 0, text: `в ${at}`, at, ...extra });

describe('всплывающие извещения', () => {
  test('не больше трёх, новые сверху — в порядке ленты', () => {
    const feed = [row(5000), row(4000), row(3000), row(2000), row(1000)];
    const out = toastsOf(feed, 5000, 0);
    expect(out.length).toBe(TOASTS);
    expect(out.map(x => x.n.at)).toEqual([5000, 4000, 3000]);
  });

  test('обычное гаснет через 6 с, срочное — через 12 с; последнюю секунду — плавно', () => {
    const plain = row(0);
    const urgent = row(0, { tone: 'urgent' });
    expect(toastsOf([plain], LIFE.plain - FADE, 0)[0].opacity).toBe(1);
    expect(toastsOf([plain], LIFE.plain - FADE / 2, 0)[0].opacity).toBeCloseTo(0.5, 6);
    expect(toastsOf([plain], LIFE.plain, 0)).toEqual([]);
    expect(toastsOf([urgent], LIFE.plain + 1000, 0)[0].opacity).toBe(1);
    expect(toastsOf([urgent], LIFE.urgent, 0)).toEqual([]);
  });

  test('погасшие место не занимают: срочное старое остаётся под двумя свежими', () => {
    const feed = [row(9000), row(8500), row(1000), row(500, { tone: 'urgent' })];
    expect(toastsOf(feed, 9500, 0).map(x => x.n.at)).toEqual([9000, 8500, 500]);
  });

  test('новое, показанное позже последнего тика часов окна, — уже на экране', () => {
    expect(toastsOf([row(2000)], 1000, 0)[0].opacity).toBe(1);
  });

  test('всплывает только свежее: старше 30 игровых минут — только в «Журнале»', () => {
    const feed = [row(1000, { t: 13 * 3600 }), row(1000, { t: 8.4 * 3600 })];
    expect(toastsOf(feed, 1000, 13 * 3600).map(x => x.n.t)).toEqual([13 * 3600]);
    expect(toastsOf([row(1000, { t: 13 * 3600 - RECENT })], 1000, 13 * 3600).length).toBe(1);
  });
});
