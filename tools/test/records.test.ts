// Рекорды смены врача (spec docs/specs/2026-11-doctor-shift.md, часть 2): в хранилище страницы, по больнице и уровню; лучший —
// по баллу, при равном — кто принял больше; испорченное и чужое — прочь; хранилища нет или оно бросает — игра идёт.
import { describe, expect, test } from 'bun:test';
import { better, parseRecords, readRecords, recordKey, recordShift, type ShiftRecord, today, writeRecords } from '../../src/app/records';

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
};
const r = (points: number, seen: number, grade: ShiftRecord['grade'] = 'B'): ShiftRecord => ({ grade, points, seen, arrived: 30, day: '2026-11-08' });

describe('рекорды смены врача', () => {
  test('ключ — больница и уровень', () => {
    expect(recordKey('poly', 'normal')).toBe('poly:normal');
    expect(recordKey('preset', 'hard')).toBe('preset:hard');
  });

  test('лучший — по баллу, при равном — кто принял больше; повтор того же — не новый', () => {
    expect(better(r(2, 10))).toBe(true);
    expect(better(r(2.1, 5), r(2, 10))).toBe(true);
    expect(better(r(2, 11), r(2, 10))).toBe(true);
    expect(better(r(2, 10), r(2, 10))).toBe(false);
    expect(better(r(1.9, 30), r(2, 10))).toBe(false);
    const first = recordShift({}, 'poly:normal', r(2, 10));
    expect([first.best, first.prev, first.records['poly:normal']]).toEqual([true, undefined, r(2, 10)]);
    const worse = recordShift(first.records, 'poly:normal', r(1.5, 20, 'C'));
    expect([worse.best, worse.prev, worse.records]).toEqual([false, r(2, 10), first.records]);
    const next = recordShift(first.records, 'poly:normal', r(2.5, 12, 'A'));
    expect([next.best, next.prev, next.records['poly:normal']]).toEqual([true, r(2, 10), r(2.5, 12, 'A')]);
    // у другого уровня — свой
    expect(recordShift(next.records, 'poly:hard', r(1, 3, 'C')).best).toBe(true);
  });

  test('из хранилища: испорченное и чужое — прочь; записать и прочитать — то же', () => {
    expect(parseRecords(undefined)).toEqual({});
    expect(parseRecords('{не json')).toEqual({});
    expect(parseRecords('[1,2]')).toEqual({});
    expect(parseRecords(JSON.stringify({ 'poly:normal': r(2, 10), bad: { grade: 'E', points: 1, seen: 1, arrived: 1, day: 'x' }, worse: { grade: 'A', points: -1, seen: 1, arrived: 1, day: 'x' } }))).toEqual({
      'poly:normal': r(2, 10),
    });
    const store = memory();
    writeRecords({ 'preset:calm': r(2.75, 20, 'A') }, store);
    expect(readRecords(store)).toEqual({ 'preset:calm': r(2.75, 20, 'A') });
  });

  test('хранилища нет или оно бросает — пусто, без ошибки', () => {
    const throwing = {
      getItem: () => {
        throw new Error('нет доступа');
      },
      setItem: () => {
        throw new Error('нет места');
      },
    };
    expect(readRecords(throwing)).toEqual({});
    expect(() => writeRecords({ 'poly:normal': r(2, 10) }, throwing)).not.toThrow();
    expect(readRecords(undefined)).toEqual({});
  });

  test('день — по часам компьютера, `2026-11-08`', () => {
    expect(today(new Date(2026, 10, 8, 23, 59))).toBe('2026-11-08');
    expect(today(new Date(2027, 0, 1))).toBe('2027-01-01');
  });
});
