// Деньги по помещениям (spec docs/specs/2026-10-metrics-layer.md, часть 2, «Проверки»): итог суток по помещениям — доходы и
// расходы с общим — до рубля равен кассе суток; обращение — кабинету врача, обследование — где сделали, стационар — палате,
// операция — операционной, зарплаты и содержание — помещению их мест; то же при любом шаге часов; в больнице «Анамнеза» —
// ничего этого нет.
import { describe, expect, test } from 'bun:test';
import { db } from '../../src/content';
import { expensesOf, incomeOf } from '../../src/engine/economy/economy';
import { hospitalOf } from '../../src/engine/hospital/site';
import { siteOfPreset } from '../../src/engine/hospital/site-preset';
import { presetStaff, withNightShift } from '../../src/engine/hospital/staff';
import { apply, newFlowShift, newShift } from '../../src/engine/shift/engine';
import { startCash } from '../../src/engine/shift/money';
import { COMMON } from '../../src/engine/shift/rooms';
import type { DaySummary, ShiftState } from '../../src/engine/shift/types';
import { hash } from './scenario';

const H = 3600;
const DAY = 24 * H;
const rec = db.presets['preset.city'];
const citySite = siteOfPreset(db, rec);
const city = (seed: number) =>
  newFlowShift(db, {
    seed, season: 'winter', hospital: hospitalOf(db, citySite), staff: withNightShift(db, citySite.rooms, presetStaff(db, rec)),
    flow: { perHour: 0, auto: true }, economy: { cash: startCash(db, 'preset') },
  });
function live(s: ShiftState, t: number, step: number) {
  while (s.t < t) apply(db, s, { kind: 'advance', seconds: Math.min(step, t - s.t) });
}
const sum = (d: DaySummary, k: 'income' | 'expenses') => Object.values(d.rooms ?? {}).reduce((n, r) => n + r[k], 0);
const typeOf = (id: string) => citySite.rooms.find(r => r.id === id)?.type;

describe('деньги по помещениям', () => {
  test('итог суток по помещениям — до рубля касса суток; три сутки городской больницы', () => {
    const s = city(1);
    live(s, 3 * DAY + 9 * H, 600);
    expect(s.history.length).toBeGreaterThanOrEqual(3);
    for (const d of s.history) {
      const l = d.economy!.ledger;
      expect(sum(d, 'income')).toBe(incomeOf(l));
      expect(sum(d, 'expenses')).toBe(expensesOf(l));
      expect(incomeOf(l)).toBeGreaterThan(0);
    }
  }, 300_000);

  test('за что и кому: приёмы — кабинетам врачей, обследования — их кабинетам, стационар — палатам; зарплаты — местам', () => {
    const s = city(2);
    live(s, 2 * DAY + 9 * H, 900);
    const d = s.history[s.history.length - 1];
    const rooms = Object.entries(d.rooms ?? {}).filter(([id]) => id !== COMMON);
    // приёмы — только у кабинетов врача и смотровой приёмного
    const visits = rooms.filter(([, r]) => (r.visits ?? 0) > 0).map(([id]) => typeOf(id));
    expect(visits.length).toBeGreaterThan(0);
    for (const t of visits) expect(['room.office', 'room.emergency']).toContain(t ?? '');
    // обследования — кабинетам обследований, лаборатории и смотровой (у постели), не регистратуре
    const exams = rooms.filter(([, r]) => (r.exams ?? 0) > 0).map(([id]) => typeOf(id));
    expect(exams.length).toBeGreaterThan(0);
    for (const t of exams) expect(t === 'room.reception' || t === 'room.waiting').toBe(false);
    // служебные — без доходов, с расходами: зарплата и содержание
    for (const [id, r] of rooms) {
      if (typeOf(id) !== 'room.reception' && typeOf(id) !== 'room.waiting') continue;
      expect(r.income).toBe(0);
      expect(r.expenses).toBeGreaterThan(0);
    }
    // общее — коридор, проценты: без доходов
    expect(d.rooms?.[COMMON]?.income ?? 0).toBe(0);
  }, 300_000);

  test('стационар и операция: случай — палате, прибавка за операцию — операционной', () => {
    const s = city(3);
    let stays = 0;
    let or = 0;
    while (s.t < 6 * DAY && (stays === 0 || or === 0)) {
      live(s, s.t + DAY, 900);
      for (const d of s.history) {
        for (const [id, r] of Object.entries(d.rooms ?? {})) {
          if ((r.stays ?? 0) > 0) {
            stays += r.stays!;
            expect(['room.ward', 'room.icu', 'room.ricu', 'room.box']).toContain(typeOf(id) ?? '');
          }
          if (typeOf(id) === 'room.or' && r.income > 0) or++;
        }
      }
    }
    expect(stays).toBeGreaterThan(0);
    expect(or).toBeGreaterThan(0);
  }, 600_000);

  test('при любом шаге часов — то же', () => {
    const a = city(4);
    const b = city(4);
    live(a, 2 * DAY + 9 * H, 300);
    live(b, 2 * DAY + 9 * H, 1800);
    expect(hash(a.history.map(d => d.rooms))).toBe(hash(b.history.map(d => d.rooms)));
    expect(hash(a.summary.rooms)).toBe(hash(b.summary.rooms));
  }, 300_000);

  test('больница «Анамнеза» — без счёта по помещениям', () => {
    const s = newShift(db, { seed: 5, season: 'winter' });
    live(s, 4 * H, 600);
    expect(s.summary.rooms).toBeUndefined();
    expect(Object.values(s.patients).some(p => p.examRooms !== undefined)).toBe(false);
  });
});
