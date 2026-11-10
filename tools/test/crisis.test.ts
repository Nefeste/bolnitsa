// Сценарий 7 «Кризис», часть 1а (spec docs/specs/2026-11-scenario-7.md): больница в кризисе с первой минуты — запись сценария
// задаёт кассу в минусе, долг банку на его срок, репутацию, настроение нанятых со сменой и износ аппаратов; цели — дни «касса
// вечером не в минусе» (`cashAboveZero`) и «никто из штата не ушёл сам» (`noQuit`, итоги суток — `departed`). Без поля — как прежде.
import { describe, expect, test } from 'bun:test';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { db } from '../../src/content';
import type { ContentDb, Scenario } from '../../src/content/types';
import { dayOk } from '../../src/engine/campaign/campaign';
import { hospitalOf } from '../../src/engine/hospital/site';
import { siteOfPlan } from '../../src/engine/hospital/site-plan';
import { withNightShift } from '../../src/engine/hospital/staff';
import { apply, hospitalCtx, newFlowShift } from '../../src/engine/shift/engine';
import { devicesOf } from '../../src/engine/shift/repair';
import type { DaySummary, Flow, ShiftState } from '../../src/engine/shift/types';
import { buildDb, CONTENT_DIR } from '../content/load';

const H = 3600;
const AUTO: Flow = { perHour: 0, auto: true };
const amb = siteOfPlan(db, db.sites!['site.ambulatory']);
const staff = () => (amb.ok ? withNightShift(db, amb.site.rooms, amb.staff) : []);
const base = db.scenarios!['scenario.emergency'];
const crisis: Scenario = { ...base, id: 'scenario.crisis_test', order: 99, budget: -100_000, crisis: { loan: 450_000, reputation: 25, mood: 25, wear: 28 }, letters: [], tips: [] };
const tdb: ContentDb = { ...db, scenarios: { ...db.scenarios, [crisis.id]: crisis } };
const start = (base: ContentDb, scenario: string, seed = 1): ShiftState => {
  if (!amb.ok) throw new Error('site.ambulatory');
  return newFlowShift(base, { seed, season: 'winter', hospital: hospitalOf(base, amb.site), staff: staff(), flow: AUTO, scenario });
};

describe('больница в кризисе с первой минуты', () => {
  test('касса в минусе, долг банку на его срок, репутация, настроение нанятых со сменой, износ каждого аппарата', () => {
    const s = start(tdb, crisis.id);
    const e = s.economy!;
    expect(e.cash).toBe(-100_000);
    expect(e.loan).toEqual({ left: 450_000, perDay: Math.ceil(450_000 / db.money!.loan.days) });
    expect(e.reputation).toBe(25);
    const shifted = s.staff!.filter(m => m.shift !== undefined);
    expect(shifted.length).toBeGreaterThan(0);
    for (const m of shifted) expect(s.moods?.[m.id]?.v).toBe(25);
    const devices = devicesOf(db, hospitalCtx(tdb, s).plan);
    expect(devices.length).toBeGreaterThan(0);
    for (const d of devices) expect(s.wear?.[d.key]).toBe(28);
  });

  test('без поля — то же начало, что прежде; с полем — взнос по кредиту на первой планёрке и уходят, если им не отвечать', () => {
    const plain = start(db, base.id);
    const copy = start({ ...tdb, scenarios: { ...tdb.scenarios, [crisis.id]: { ...crisis, budget: base.budget, crisis: undefined } } }, crisis.id);
    expect(JSON.stringify({ ...copy, campaign: undefined, meta: { ...copy.meta } })).toBe(JSON.stringify({ ...plain, campaign: undefined, meta: { ...plain.meta } }));
    const s = start(tdb, crisis.id, 2);
    while (s.t < (6 * 24 + 8) * H + 60) apply(tdb, s, { kind: 'advance', seconds: 900 });
    const days = s.history.filter(h => h.day >= 1);
    // кредит — равными долями на планёрках
    expect(days[0].economy!.ledger.expenses.loan).toBe(Math.ceil(450_000 / db.money!.loan.days));
    expect(s.economy!.loan!.left).toBe(450_000 - 6 * Math.ceil(450_000 / db.money!.loan.days));
    // настроение ниже порога: три утра — «собирается уйти», двое суток на ответ — и уходят сами
    const gone = days.reduce((n, h) => n + (h.departed ?? 0), 0);
    expect(gone).toBeGreaterThan(0);
    expect(days.some(h => !dayOk('noQuit', h))).toBe(true);
  }, 120_000);
});

describe('дни целей «Кризиса»', () => {
  const day = (x: Partial<DaySummary>): DaySummary => ({ day: 1, arrived: 1, seen: 0, left: 0, unseen: 0, correct: 0, partly: 0, wrong: 0, ...x }) as DaySummary;
  const eco = (cash: number) => ({ economy: { cash, ledger: { income: { oms: 0, dms: 0, self: 0 }, cases: { oms: 0, dms: 0, self: 0 }, expenses: { salaries: 0, equipment: 0, rooms: 0, consumables: 0, interest: 0 }, audit: { cut: 0, weak: 0, unconfirmed: 0, unindicated: 0 } }, reputation: { from: 50, to: 50 }, level: { level: 100, rooms: [] } } }) as unknown as Partial<DaySummary>;

  test('касса вечером не в минусе — по остатку, а не по доходу суток; никто не ушёл сам', () => {
    expect(dayOk('cashAboveZero', day(eco(0)))).toBe(true);
    expect(dayOk('cashAboveZero', day(eco(-1)))).toBe(false);
    expect(dayOk('cashAboveZero', day({}))).toBe(false);
    expect(dayOk('noQuit', day({}))).toBe(true);
    expect(dayOk('noQuit', day({ departed: 1 }))).toBe(false);
  });

  test('загрузчик: поля кризиса и касса в минусе — в записи сценария; вне границ — ошибка', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bolnitsa-content-'));
    try {
      cpSync(CONTENT_DIR, dir, { recursive: true });
      const file = join(dir, 'campaign/scenarios/emergency.yaml');
      const text = readFileSync(file, 'utf8');
      if (!text.includes('budget: 600000\n')) throw new Error('в записи нет кассы');
      writeFileSync(file, text.replace('budget: 600000\n', 'budget: -100000\ncrisis: { loan: 450000, reputation: 25, mood: 25, wear: 28 }\n'));
      const ok = buildDb(dir);
      expect(ok.errors).toEqual([]);
      expect([ok.db.scenarios!['scenario.emergency'].budget, ok.db.scenarios!['scenario.emergency'].crisis]).toEqual([-100_000, { loan: 450_000, reputation: 25, mood: 25, wear: 28 }]);
      writeFileSync(file, text.replace('budget: 600000\n', 'budget: 600000\ncrisis: { reputation: 150 }\n'));
      expect(buildDb(dir).errors.length).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
