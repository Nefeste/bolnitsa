// Демо для Next Fest (spec docs/specs/2026-11-demo.md): окно «Итог» после первой планёрки — из итога суток, построенного и
// порядка стройки сценария; имя файла снимка; кнопка «В список желаемого» — только с номером приложения Steam.
import { describe, expect, test } from 'bun:test';
import { db } from '../../src/content';
import { demoResult, snapshotName, STEAM_APP_ID, wishlistUrl } from '../../src/app/demo';
import type { DaySummary } from '../../src/engine/shift/types';

/** Итог суток: только поля, которые читает «Итог». */
const day = (over: Partial<DaySummary> = {}): DaySummary =>
  ({ day: 1, arrived: 9, seen: 6, left: 2, unseen: 1, correct: 2, partly: 1, wrong: 0, grades: {}, money: 0, returnsPlanned: 0, returnsToday: 0, ...over }) as DaySummary;

describe('«Итог» демо', () => {
  const guide = db.scenarios!['scenario.ambulatory'].guide!.map(g => g.room);

  test('построенное — по порядку стройки сценария, потом остальное; одинаковые — числом', () => {
    const r = demoResult(day(), ['room.office', 'room.reception', 'room.office', 'room.waiting'], guide, 61);
    expect(r.built).toEqual([
      { type: 'room.reception', n: 1 },
      { type: 'room.waiting', n: 1 },
      { type: 'room.office', n: 2 },
    ]);
    // помещения не из порядка стройки — после него, как пришли
    expect(demoResult(day(), ['room.ward', 'room.reception'], guide, 0).built.map(b => b.type)).toEqual(['room.reception', 'room.ward']);
  });

  test('больные — из итога суток; совет «ещё кабинет врача», когда врач — вы один; ваши приёмы — верные, частично и неверные; касса — утренняя; время — целые секунды', () => {
    const r = demoResult(day({ economy: { cash: 163_000 } as DaySummary['economy'] }), [], guide, 1234.6);
    expect([r.day, r.arrived, r.seen, r.left]).toEqual([1, 9, 6, 2]);
    expect([r.own, r.right]).toEqual([3, 2]);
    expect(r.cash).toBe(163_000);
    expect(r.played).toBe(1235);
    expect(demoResult(day(), [], guide, -5).cash).toBeNull();
    expect(demoResult(day(), [], guide, -5).played).toBe(0);
    // совет «ещё кабинет врача»: ушло больше, чем принято, и нанятые не приняли никого
    const hired = (seen: number) => ({ c1: { seen } }) as unknown as DaySummary['colleagues'];
    expect(demoResult(day({ seen: 1, left: 26 }), [], guide, 0).hire).toBe(true);
    expect(demoResult(day({ seen: 1, left: 26, colleagues: hired(0) }), [], guide, 0).hire).toBe(true);
    expect(demoResult(day({ seen: 1, left: 26, colleagues: hired(4) }), [], guide, 0).hire).toBe(false);
    expect(demoResult(day({ seen: 6, left: 2 }), [], guide, 0).hire).toBe(false);
  });

  test('имя снимка — только латиница, цифры и дефис: Electron примет его в папку игры', () => {
    const n = snapshotName(new Date(Date.UTC(2026, 9, 30, 18, 4, 5)));
    expect(n).toBe('snapshot-2026-10-30T18-04-05.png');
    expect(n).toMatch(/^snapshot-[0-9T-]+\.png$/);
  });

  test('«В список желаемого» — только с номером приложения Steam; страницы ещё нет — кнопки нет', () => {
    expect(wishlistUrl('')).toBeNull();
    expect(wishlistUrl('steam://evil')).toBeNull();
    expect(wishlistUrl('480')).toBe('steam://store/480');
    expect(wishlistUrl()).toBe(STEAM_APP_ID ? `steam://store/${STEAM_APP_ID}` : null);
  });
});
