// Подсказки первых минут (spec docs/specs/2026-10-aaa-polish.md, «Первые минуты»): какая подсказка при каком состоянии
// больницы, как они сменяют друг друга и как закрытая не возвращается. Чистая функция без DOM.
import { describe, expect, test } from 'bun:test';
import type { Block } from '../../src/engine/hospital/requirements';
import { HINT_KEYS, type HintInput, type HintKey, hintOf } from '../../src/app/hints';

const base: HintInput = { buildOn: false, drawing: false, paused: true, arrived: 0, asks: 0, looked: false };
const none = new Set<HintKey>();
const down = (problem: Block & { kind: 'down' } extends { problem: infer P } ? P : never): Block => ({ kind: 'down', room: 'room.reception', problem });

describe('подсказки первых минут', () => {
  test('пустое здание: «стройка» → в стройке «протяните» → с выбранным типом ведёт строка призрака', () => {
    const block: Block = { kind: 'noRoom', room: 'room.reception' };
    expect(hintOf({ ...base, block }, none)).toBe('build');
    expect(hintOf({ ...base, block, buildOn: true }, none)).toBe('draw');
    expect(hintOf({ ...base, block, buildOn: true, drawing: true }, none)).toBeUndefined();
  });

  test('помещение есть, но не работает: по причине — обставить, дверь, нанять, аппарат, иначе «щёлкните по помещению»', () => {
    expect(hintOf({ ...base, block: down({ kind: 'noObject', object: 'desk', have: 0, need: 1 }) }, none)).toBe('furnish');
    expect(hintOf({ ...base, block: down({ kind: 'noDoor' }) }, none)).toBe('door');
    expect(hintOf({ ...base, block: down({ kind: 'singleDoor' }) }, none)).toBe('door');
    expect(hintOf({ ...base, block: down({ kind: 'noStaff', role: 'role.registrar' }) }, none)).toBe('hire');
    expect(hintOf({ ...base, block: down({ kind: 'noEquipment' }) }, none)).toBe('machine');
    expect(hintOf({ ...base, block: down({ kind: 'noPlace', room: 'room.staff' }) }, none)).toBe('fix');
    expect(hintOf({ ...base, block: down({ kind: 'noPath' }) }, none)).toBe('fix');
    expect(hintOf({ ...base, block: { kind: 'noEquipment', room: 'room.lab', equipment: [] } }, none)).toBe('fix');
  });

  test('открытая больница: часы стоят — «пробел»; пошли — «щёлкните»; посмотрел — ничего', () => {
    expect(hintOf({ ...base }, none)).toBe('run');
    expect(hintOf({ ...base, paused: false }, none)).toBe('look');
    expect(hintOf({ ...base, arrived: 3 }, none)).toBe('look');
    expect(hintOf({ ...base, paused: false, looked: true }, none)).toBeUndefined();
  });

  test('просьба врача — важнее остального', () => {
    expect(hintOf({ ...base, block: { kind: 'noRoom', room: 'room.reception' }, asks: 1 }, none)).toBe('asks');
    expect(hintOf({ ...base, paused: false, looked: true, asks: 2 }, none)).toBe('asks');
  });

  test('закрытая подсказка не возвращается, а следующая по состоянию — приходит', () => {
    const block: Block = { kind: 'noRoom', room: 'room.reception' };
    const seen = new Set<HintKey>(['build']);
    expect(hintOf({ ...base, block }, seen)).toBeUndefined();
    expect(hintOf({ ...base, block, buildOn: true }, seen)).toBe('draw');
    seen.add('asks');
    expect(hintOf({ ...base, asks: 1 }, seen)).toBe('run');
  });

  test('каждый ключ достижим и записан в списке', () => {
    const reached = new Set<HintKey>();
    const states: HintInput[] = [
      { ...base, block: { kind: 'noRoom', room: 'room.reception' } },
      { ...base, block: { kind: 'noRoom', room: 'room.reception' }, buildOn: true },
      { ...base, block: down({ kind: 'noObject', object: 'desk', have: 0, need: 1 }) },
      { ...base, block: down({ kind: 'noDoor' }) },
      { ...base, block: down({ kind: 'noStaff', role: 'role.registrar' }) },
      { ...base, block: down({ kind: 'noEquipment' }) },
      { ...base, block: down({ kind: 'closed' }) },
      { ...base },
      { ...base, paused: false },
      { ...base, asks: 1 },
    ];
    for (const s of states) {
      const k = hintOf(s, none);
      if (k) reached.add(k);
    }
    expect([...reached].sort()).toEqual([...HINT_KEYS].sort());
  });
});
