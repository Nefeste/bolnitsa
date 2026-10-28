// Касса, репутация, поток от больницы, планёрка, обход и долгий случай в потоке для ПК (spec docs/specs/2026-10-economy.md,
// «Тесты»): начало и срез; стройка из кассы — цена, половина назад при сносе, цена назад при отмене, отказ ниже предела;
// зарплаты и содержание по часам; планёрка — касса суток, процент, кредит; репутация и поток от неё; поток от больницы —
// кабинеты, места смотровой, сразу после стройки; узкие места суток; «Почему?» у цифр планёрки — пришли по виду, ушли по
// причинам, поток на сутки; «стало хуже»; обход в карте; долгий случай нанятого врача; детерминизм при разном шаге и в
// потоке расчёта; сборка базы.
import { describe, expect, setDefaultTimeout, test } from 'bun:test';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { db } from '../../src/content';
import type { ContentDb } from '../../src/content/types';
import { emptyLedger, expensesOf, incomeOf, salariesOf } from '../../src/engine/economy/economy';
import { emptySite, hospitalOf, roomPrice, type Site } from '../../src/engine/hospital/site';
import { siteOfPreset } from '../../src/engine/hospital/site-preset';
import { presetStaff, salaryOf } from '../../src/engine/hospital/staff';
import { apply, capacityOf, inpatientsOf, newFlowShift, newShift } from '../../src/engine/shift/engine';
import { reputationPct, walkPerHour } from '../../src/engine/shift/inflow';
import { turnedWorse } from '../../src/engine/shift/meeting';
import { cashNow, dayNet, startCash, upkeepPerDay } from '../../src/engine/shift/money';
import { sliceOf } from '../../src/engine/shift/slice';
import { DAY, type Flow, type Notice, type ShiftPatient, type ShiftState } from '../../src/engine/shift/types';
import { setLang } from '../../src/i18n';
import { useDb } from '../../src/sim/caseView';
import { cardView, doctorState } from '../../src/sim/doctor';
import { createSim } from '../../src/sim/host';
import { H, Handles, NO_CASH, packSlice } from '../../src/sim/pack';
import type { ToSim } from '../../src/sim/protocol';
import { buildDb, CONTENT_DIR } from '../content/load';
import { hash } from './scenario';
import { PROTO, site } from './site-kit';

// сутки потока и испорченные копии базы (шесть в одном тесте) — по нескольку секунд: под нагрузкой пяти не хватает
setDefaultTimeout(60_000);

useDb(db);
setLang('ru');
const HOUR = 3600;
const AUTO: Flow = { perHour: 0, auto: true };
const rec = db.presets['preset.city'];
const cityHospital = hospitalOf(db, siteOfPreset(db, rec));
const cityStaff = presetStaff(db, rec);

/** Пустое здание (или данный участок) с кассой и потоком от больницы. */
function empty(o: { seed?: number; site?: Site; cash?: number; flow?: Flow } = {}): ShiftState {
  return newFlowShift(db, { seed: o.seed ?? 1, season: 'winter', hospital: hospitalOf(db, o.site ?? emptySite()), staff: [], flow: o.flow ?? AUTO, economy: { cash: o.cash ?? startCash(db, 'empty') } });
}

/** Готовая городская больница с кассой. */
function city(o: { seed?: number; cash?: number; flow?: Flow; dbx?: ContentDb } = {}): ShiftState {
  return newFlowShift(o.dbx ?? db, { seed: o.seed ?? 1, season: 'winter', hospital: cityHospital, staff: cityStaff, flow: o.flow ?? AUTO, economy: { cash: o.cash ?? startCash(db, 'preset') } });
}

/** Прожить до часа `hour` от полуночи первых суток шагом `step`; извещения — с часом, когда пришли. */
function live(s: ShiftState, hour: number, step = 60, dbx: ContentDb = db): { t: number; n: Notice }[] {
  const out: { t: number; n: Notice }[] = [];
  while (s.t < hour * HOUR) for (const n of apply(dbx, s, { kind: 'advance', seconds: Math.min(step, hour * HOUR - s.t) })) out.push({ t: s.t, n });
  return out;
}

/** Помещения прототипа и санузел — протянуть, обставить, дверь посередине нижней стены, люди на все должности. */
function buildClinic(s: ShiftState): string[] {
  const ids: string[] = [];
  for (const [type, x, y, w, h] of [...PROTO, ['room.toilet', 41, 6, 6, 7] as const]) {
    const id = site(db, s, { kind: 'room', type, x, y, w, h }).room!;
    ids.push(id);
    site(db, s, { kind: 'furnish', room: id });
    site(db, s, { kind: 'door', room: id, cells: [[x + Math.floor(w / 2), y + h - 1]] });
    for (const role of db.rooms[type].staff) site(db, s, { kind: 'hire', room: id, role });
  }
  site(db, s, { kind: 'done' });
  return ids;
}

const bare = (s: ShiftState) => hash({ ...s, journal: [] });

describe('касса: начало, срез, доходы', () => {
  test('пустое здание — бюджет песочницы, готовая больница — его доля; в срезе — касса, изменение с 08:00 и репутация', () => {
    expect(startCash(db, 'empty')).toBe(db.economy.sandbox.budgets.normal);
    expect(startCash(db, 'preset')).toBe(Math.floor((db.economy.sandbox.budgets.normal * db.economy.sandbox.clinicShare) / 100));
    const s = empty();
    expect(s.economy).toEqual({ cash: 1_200_000, reputation: 50, ledger: emptyLedger(), accrued: 8 * HOUR });
    const sl = sliceOf(s);
    expect([sl.cash, sl.today, sl.reputation]).toEqual([1_200_000, 0, 50]);
    const { buf } = packSlice(s, sl, 0, new Handles(), new Map(), new Map());
    expect([buf[H.cash], buf[H.today], buf[H.reputation]]).toEqual([1_200_000, 0, 50]);
    // без кассы — как прежде
    const plain = newFlowShift(db, { seed: 1, season: 'winter', hospital: cityHospital, staff: cityStaff, flow: { perHour: 6 } });
    expect(plain.economy).toBeUndefined();
    const p = packSlice(plain, sliceOf(plain), 0, new Handles(), new Map(), new Map()).buf;
    expect([p[H.cash], p[H.today], p[H.reputation]]).toEqual([NO_CASH, NO_CASH, NO_CASH]);
  });

  test('закрытый приём платит в кассу суток: касса сейчас растёт; плательщик — у каждого пришедшего', () => {
    const s = city({ seed: 3 });
    live(s, 12);
    const l = s.economy!.ledger!;
    expect(incomeOf(l)).toBeGreaterThan(0);
    expect(cashNow(s)).toBe(s.economy!.cash + incomeOf(l) - expensesOf(l));
    expect(dayNet(s)).toBe(incomeOf(l) - expensesOf(l));
    const all = Object.values(s.patients);
    expect(all.length).toBeGreaterThan(0);
    expect(all.every(p => p.payer !== undefined)).toBe(true);
    expect(all.filter(p => p.kind === 'ambulance').every(p => p.payer === 'oms')).toBe(true);
  });
});

describe('стройка из кассы', () => {
  test('помещение — минус цена, снос — плюс половина, отмена — плюс цена; в кассе суток — статья «стройка»', () => {
    const s = empty();
    const price = roomPrice(db, 'room.office', 8, 7);
    const r = site(db, s, { kind: 'room', type: 'room.office', x: 19, y: 6, w: 8, h: 7 });
    expect(r.cost).toBe(price);
    expect(cashNow(s)).toBe(1_200_000 - price);
    expect(s.economy!.ledger!.expenses.works).toBe(price);
    site(db, s, { kind: 'demolish', room: r.room! });
    expect(cashNow(s)).toBe(1_200_000 - price + Math.floor(price / 2));
    site(db, s, { kind: 'undo' });
    expect(cashNow(s)).toBe(1_200_000 - price);
    site(db, s, { kind: 'undo' });
    expect(cashNow(s)).toBe(1_200_000);
    expect(s.economy!.ledger!.expenses.works).toBe(0);
  });

  test('ниже предела стройка ждёт денег: отказ «не хватает N ₽»; найм — можно', () => {
    const limit = db.money!.overdraft;
    const s = empty({ cash: -limit + 5000 });
    const price = roomPrice(db, 'room.reception', 6, 7);
    const out = apply(db, s, { kind: 'site', cmd: { kind: 'room', type: 'room.reception', x: 6, y: 6, w: 6, h: 7 } });
    expect(out).toEqual([{ kind: 'site', cmd: 'room', ok: false, error: { kind: 'money', need: price - 5000 } }]);
    expect(s.hospital!.site!.rooms).toEqual([]);
    expect(cashNow(s)).toBe(-limit + 5000);
    // на сколько хватает — можно: санузел дешевле
    const s2 = empty({ cash: -limit + roomPrice(db, 'room.toilet', 6, 7) });
    const t = site(db, s2, { kind: 'room', type: 'room.toilet', x: 6, y: 6, w: 6, h: 7 });
    expect(cashNow(s2)).toBe(-limit);
    // найм денег не требует
    site(db, s2, { kind: 'room', type: 'room.reception', x: 11, y: 6, w: 6, h: 7 }, false);
    expect(site(db, s2, { kind: 'hire', room: t.room!, role: 'role.registrar' }, false).error?.kind).toBe('notHere');
  });
});

describe('зарплаты и содержание по часам', () => {
  test('нанятый в 20:00 — половина суточной; уволенный в 14:00 — четверть; построенное в 20:00 — половина содержания', () => {
    const s = empty();
    const rec1 = site(db, s, { kind: 'room', type: 'room.reception', x: 6, y: 6, w: 6, h: 7 }).room!;
    site(db, s, { kind: 'furnish', room: rec1 });
    site(db, s, { kind: 'done' });
    const before = upkeepPerDay(db, s.hospital!);
    live(s, 14);
    // в 14:00 — нанят и уволен сразу: ни часа работы — ни рубля
    site(db, s, { kind: 'hire', room: rec1, role: 'role.registrar' });
    const id = s.staff![0].id;
    site(db, s, { kind: 'dismiss', id });
    live(s, 20);
    site(db, s, { kind: 'hire', room: rec1, role: 'role.registrar' });
    const ward = site(db, s, { kind: 'room', type: 'room.ward', x: 30, y: 6, w: 7, h: 7 }).room!;
    site(db, s, { kind: 'done' });
    const after = upkeepPerDay(db, s.hospital!);
    live(s, 32);
    const l = s.history[0].economy!.ledger;
    const salary = salaryOf(db, 'role.registrar', 3);
    expect(l.expenses.salaries).toBe(Math.round(salary / 2));
    // помещения: до 20:00 — прежняя больница, после — с палатой (коридор меньше)
    expect(Math.abs(l.expenses.rooms - (before.rooms * 12 + after.rooms * 12) / 24)).toBeLessThanOrEqual(3);
    expect(ward).toBeDefined();
    // вторые сутки — регистратор весь день: ровно суточная
    live(s, 56);
    expect(s.history[1].economy!.ledger.expenses.salaries).toBe(salary);
    // уволенный в 14:00 третьих суток — шесть часов
    live(s, 62);
    site(db, s, { kind: 'dismiss', id: s.staff![0].id });
    live(s, 80);
    expect(s.history[2].economy!.ledger.expenses.salaries).toBe(Math.round((salary * 6) / 24));
  });
});

describe('планёрка: касса суток, процент, кредит', () => {
  test('касса после = касса до + доходы − расходы − процент; итог — в истории и в извещении', () => {
    const s = city({ seed: 2 });
    const cash0 = s.economy!.cash;
    const notices = live(s, 32);
    const m = notices.find(x => x.n.kind === 'morning')!.n;
    if (m.kind !== 'morning') throw new Error(m.kind);
    const e = m.summary.economy!;
    expect(e).toEqual(s.history[0].economy!);
    expect(e.cash).toBe(cash0 + incomeOf(e.ledger) - expensesOf(e.ledger));
    expect(e.ledger.expenses.salaries).toBe(salariesOf(cityStaff));
    // содержание — за все 24 часа: стройки в эти сутки не было, одна запись на планёрке
    const up = upkeepPerDay(db, s.hospital!);
    expect([e.ledger.expenses.rooms, e.ledger.expenses.equipment]).toEqual([up.rooms, up.equipment]);
    expect(up.rooms).toBeGreaterThan(0);
    expect(e.reputation.from).toBe(50);
    // новые сутки — новая касса суток
    expect(s.economy!.ledger).toEqual({ ...emptyLedger(), expenses: { ...emptyLedger().expenses } });
    expect(s.economy!.cash).toBe(e.cash);
  });

  test('в минусе — процент; ниже предела — предложение кредита; кредит — плюс сумма, выплаты с надбавкой, второго нет', () => {
    const m = db.money!;
    const s = empty({ cash: -m.overdraft - 250_000 });
    live(s, 32);
    const e = s.history[0].economy!;
    expect(e.ledger.expenses.interest).toBeGreaterThan(0);
    expect(e.cash).toBeLessThan(-m.overdraft);
    const offer = Math.ceil(-e.cash / m.loan.step) * m.loan.step;
    expect(e.offer).toBe(offer);
    expect(s.economy!.offer).toBe(offer);
    apply(db, s, { kind: 'loan' });
    expect(s.economy!.cash).toBe(e.cash + offer);
    const total = Math.round((offer * (100 + m.loan.fee)) / 100);
    expect(s.economy!.loan).toEqual({ left: total, perDay: Math.ceil(total / m.loan.days) });
    expect(s.economy!.offer).toBeUndefined();
    // второго нет
    const before = bare(s);
    apply(db, s, { kind: 'loan' });
    expect(bare(s)).toBe(before);
    live(s, 56);
    const e2 = s.history[1].economy!;
    expect(e2.ledger.expenses.loan).toBe(Math.ceil(total / m.loan.days));
    expect(e2.loan).toEqual({ left: total - Math.ceil(total / m.loan.days), perDay: Math.ceil(total / m.loan.days) });
    // выше предела — предложения нет
    expect(empty().economy!.offer).toBeUndefined();
  });
});

describe('репутация и поток от неё', () => {
  test('в 08:00 сдвигается к оценке суток на 15 % разницы, с причинами', () => {
    const s = city({ seed: 4 });
    live(s, 32);
    const r = s.history[0].economy!.reputation;
    expect(r.score).toBeDefined();
    expect(r.to).toBe(Math.max(0, Math.min(100, r.from + Math.round(((r.score! - r.from) * db.economy.reputation.pull) / 100))));
    expect(r.reasons.some(x => x.key === 'correct')).toBe(true);
    expect(s.economy!.reputation).toBe(r.to);
    expect(sliceOf(s).reputation).toBe(r.to);
  });

  test('поток сами: ×0,7 при 0, ×1 при 50, ×1,3 при 100 (геймдизайн §8); на скорую не влияет', () => {
    expect(reputationPct(db, 0)).toBe(70);
    expect(reputationPct(db, 50)).toBe(100);
    expect(reputationPct(db, 100)).toBe(130);
    expect(walkPerHour(db, { offices: 2, bays: 0, booked: [] }, 100)).toBeCloseTo(db.inflow!.walkIn * 2 * 1.3, 10);
  });
});

describe('поток от больницы', () => {
  test('кабинеты нанятых терапевтов, места смотровой, специалисты со своей записью; без нанятых — ваш кабинет', () => {
    // городская: терапевт один; к трём специалистам — своя запись (spec 2026-10-specialists); смотровая L — три места
    expect(capacityOf(db, city())).toEqual({ offices: 1, bays: 3, booked: ['p13', 'p5', 'p6'] });
    const s = empty();
    expect(capacityOf(db, s)).toEqual({ offices: 0, bays: 0, booked: [] });
    const ids = buildClinic(s);
    expect(capacityOf(db, s)).toEqual({ offices: 1, bays: 0, booked: [] });
    // «Мой кабинет» на кабинете терапевта: терапевт — в резерв, принимаете вы — и поток по вашему кабинету
    const office = ids[2];
    site(db, s, { kind: 'office', room: office });
    expect(capacityOf(db, s)).toEqual({ offices: 1, bays: 0, booked: [] });
  });

  test('новый кабинет днём — следующий приход сразу по новой частоте; без кабинетов сами не приходят', () => {
    const s = empty();
    // пустое здание: ни одного прихода сами не назначено
    expect(s.events.some(e => e.event.kind === 'flow' && e.event.stream === 'walk')).toBe(false);
    buildClinic(s);
    const next = s.events.find(e => e.event.kind === 'flow' && e.event.stream === 'walk');
    expect(next).toBeDefined();
    live(s, 12);
    const arrivedBy12 = s.summary.arrived;
    expect(arrivedBy12).toBeGreaterThan(0);
    // снесли единственный кабинет — следующего не будет
    const officeId = s.hospital!.site!.rooms.find(r => r.type === 'room.office')!.id;
    const busy = Object.values(s.patients).some(p => p.status === 'inRoom' && p.by);
    site(db, s, { kind: 'demolish', room: officeId });
    if (!busy) expect(s.events.some(e => e.event.kind === 'flow' && e.event.stream === 'walk')).toBe(false);
  });

  test('за сутки приходит столько, сколько ждём: амбулатория на кабинет — ориентир §5', () => {
    let arrived = 0;
    const seeds = [1, 2, 3];
    for (const seed of seeds) {
      const s = empty({ seed });
      buildClinic(s);
      live(s, 32, 300);
      arrived += s.history[0].arrived;
    }
    const expected = db.inflow!.walkIn * db.day!.walk.slice(8, 20).reduce((a, b) => a + b, 0) / 100;
    // три суток, пуассоновский поток: в пределах трёх сигм от ожидаемого
    expect(Math.abs(arrived / seeds.length - expected)).toBeLessThan(3 * Math.sqrt(expected / seeds.length) + 2);
    const [lo, hi] = db.inflow!.targets[0].day;
    expect(arrived / seeds.length).toBeGreaterThanOrEqual(lo - 8);
    expect(arrived / seeds.length).toBeLessThanOrEqual(hi);
  });
});

describe('узкие места суток', () => {
  test('очередь к врачам и ожидание, кабинеты обследований, палаты — в итоге суток', () => {
    const s = city({ seed: 5, flow: { perHour: 14, ambulancePerHour: 2 } });
    live(s, 32, 300);
    const load = s.history[0].load!;
    expect(load.queue).toBeGreaterThan(3);
    expect(load.wait).toBeGreaterThan(30);
    expect(Object.keys(load.rooms ?? {}).length).toBeGreaterThan(0);
    for (const r of Object.values(load.rooms!)) expect(r.n).toBeGreaterThan(0);
    expect(load.beds?.of).toBeGreaterThan(0);
    expect(load.beds!.peak).toBeLessThanOrEqual(load.beds!.of);
    // новые сутки — новые числа: коек «из» считает только планёрка
    expect(s.summary.load).not.toBe(load);
    expect(s.summary.load?.beds?.of ?? 0).toBe(0);
  });
});

describe('«Почему?» у цифр планёрки (spec docs/specs/2026-10-why.md)', () => {
  const sum = (r: Partial<Record<string, number>>) => Object.values(r).reduce((n: number, v) => n + (v ?? 0), 0);

  test('пришли по виду и ушли по причинам — в сумме числа суток; путь каждого ушедшего — с той же причиной', () => {
    const s = city({ seed: 5, flow: { perHour: 14, ambulancePerHour: 2 } });
    live(s, 32, 300);
    const d = s.history[0];
    expect(sum(d.arrivedBy!)).toBe(d.arrived);
    expect(d.arrivedBy!.ambulance).toBe(d.ambulance!.arrived);
    expect(d.left).toBeGreaterThan(5);
    expect(sum(d.leftBy!.why)).toBe(d.left);
    expect(d.leftBy!.why.busy).toBeGreaterThan(0);
    expect(d.leftBy!.stood ?? 0).toBeLessThanOrEqual(d.left);
    expect(d.leftBy!.asks ?? 0).toBeLessThanOrEqual(d.leftBy!.why.busy ?? 0);
    const ends: Record<string, number> = {};
    for (const j of Object.values(s.journeys!.of)) if (j.end?.how === 'left' && j.end.t < 32 * HOUR) ends[j.end.why!] = (ends[j.end.why!] ?? 0) + 1;
    expect(ends).toEqual(d.leftBy!.why as Record<string, number>);
    // новые сутки — новый счёт
    expect(s.summary.leftBy?.why.busy ?? 0).toBeLessThan(d.leftBy!.why.busy!);
  });

  test('смена кончилась, а очередь осталась — «в смене не было врача», хотя при приходе все были заняты', () => {
    const s = empty({ seed: 3, flow: { perHour: 9 } });
    buildClinic(s);
    live(s, 32, 300);
    const d = s.history[0];
    expect(d.leftBy?.why.none ?? 0).toBeGreaterThan(0);
    const late = Object.values(s.journeys!.of).filter(j => j.end?.why === 'none');
    expect(late.length).toBe(d.leftBy!.why.none!);
    for (const j of late) {
      // ушли после пересменки в 20:00, а при приходе ждали занятого врача дневной смены
      expect(j.end!.t).toBeGreaterThan(20 * HOUR);
      expect([...j.steps].reverse().find(x => x.k === 'queue')).toMatchObject({ why: 'busy' });
    }
  });

  test('поток от больницы на сутки: с планёрки, по часам, с теми, кто в смене; сбывается в среднем', () => {
    const s = city({ seed: 2 });
    const c = capacityOf(db, s);
    live(s, 32 + 24 * 3, 600);
    const [d1, d2, d3, d4] = s.history;
    const f = d1.inflow!;
    expect(f).toMatchObject({ offices: c.offices, booked: c.booked.length, bays: c.bays });
    expect(f.pct).toBe(Math.round(reputationPct(db, d1.economy!.reputation.to) * 10) / 10);
    // на кабинет все часы приёма: 2,5 в час × 12 часов при репутации 50, с её поправкой
    expect(f.perOffice).toBeCloseTo((2.5 * 12 * f.pct) / 100, 0);
    expect(f.perBay).toBe(db.inflow!.ambulance);
    // в городской днём и ночью терапевт один: сами — как на кабинет
    expect(f.walk).toBeCloseTo(f.perOffice * f.offices, 0);
    // прогноз сбывается: за трое суток пришедших сами и по записи — в пределах четверти от прогноза
    const came = (k: 'walkIn' | 'appointment') => [d2, d3, d4].reduce((n, d) => n + (d.arrivedBy?.[k] ?? 0), 0);
    const want = (k: 'walk' | 'book') => [d1, d2, d3].reduce((n, d) => n + d.inflow![k], 0);
    expect(Math.abs(came('walkIn') - want('walk'))).toBeLessThan(want('walk') / 4);
    expect(Math.abs(came('appointment') - want('book'))).toBeLessThan(want('book') / 4);
  }, 60_000);

  test('поток без `auto` — без прогноза; смена «Анамнеза» — без счёта по виду и причин', () => {
    const s = city({ seed: 5, flow: { perHour: 6, ambulancePerHour: 1 } });
    live(s, 32, 600);
    expect(s.history[0].inflow).toBeUndefined();
    expect(s.history[0].arrivedBy).toBeDefined();
    const a = newShift(db, { seed: 21, season: 'winter' });
    for (let i = 0; i < 600 && a.summary.arrived < 3; i++) apply(db, a, { kind: 'advance', seconds: 60 });
    expect(a.summary.arrived).toBeGreaterThan(2);
    expect(a.summary.arrivedBy).toBeUndefined();
    expect(a.summary.leftBy).toBeUndefined();
  });
});

/** Лежащий нанятого врача — «ваш» (приём закрыли вы): у него в эти сутки течение болезни станет хуже. */
function ownWorse(s: ShiftState): ShiftPatient | undefined {
  const p = inpatientsOf(s).find(x => x.closed?.by && x.stay && !x.stay.op && x.stay.readyAfter === undefined && x.stay.reaction === undefined);
  if (!p) return undefined;
  delete p.closed!.by;
  return p;
}

describe('обход ваших лежащих', () => {
  test('«стало хуже» — в 08:00, извещение только о ваших и только при переходе', () => {
    const s = city({ seed: 6, flow: { perHour: 6, ambulancePerHour: 2 } });
    live(s, 30, 300);
    const p = ownWorse(s);
    expect(p).toBeDefined();
    p!.stay!.worseAfter = s.day - p!.stay!.since + 1;
    const out = live(s, 32, 60);
    const worse = out.filter(x => x.n.kind === 'worse');
    expect(worse.map(x => (x.n.kind === 'worse' ? x.n.id : ''))).toEqual([p!.id]);
    expect(worse[0].t).toBe(32 * HOUR);
    expect(turnedWorse(s)).toEqual([p!.id]);
    // назавтра — снова хуже, но не «стало»: извещения нет
    const next = live(s, 56, 300).filter(x => x.n.kind === 'worse' && x.n.id === p!.id);
    if (s.patients[p!.id]?.status === 'admitted') expect(next).toEqual([]);
  }, 60_000);

  test('строка обхода — динамика, лечение, можно ли выписать; карта лежащего — блок обхода; «Сменить лечение» и «Выписать» через поток расчёта', () => {
    const sim = createSim(db);
    const send = (m: ToSim) => sim.handle(m);
    send({ kind: 'start', seed: 6, season: 'winter', hospital: cityHospital, staff: cityStaff, flow: { perHour: 6, ambulancePerHour: 2 }, economy: { cash: 300_000 } });
    for (let i = 0; i < 30 * 60; i++) send({ kind: 'tick', seconds: 60, budgetMs: 1000 });
    const saved = send({ kind: 'save' });
    if (saved.kind !== 'state') throw new Error(saved.kind);
    const s = saved.state;
    const p = ownWorse(s)!;
    expect(p).toBeDefined();
    send({ kind: 'load', state: s });
    const row = doctorState(db, s).ward.find(r => r.id === p.id)!;
    expect(row.vitals.some(v => v.label === 'Температура')).toBe(true);
    expect(row.stateText.length).toBeGreaterThan(0);
    expect(row.canDischarge).toBe(true);
    const card = cardView(db, s, p.id, 'student', 1)!;
    expect(card.round?.row.id).toBe(p.id);
    expect(card.round!.groups.length).toBeGreaterThan(0);
    const tx = card.round!.groups.flatMap(g => g.items).find(x => !x.disabled && !card.round!.current.includes(x.id))!;
    const replans = p.stay!.replans;
    send({ kind: 'command', cmd: { kind: 'replan', id: p.id, treatments: [...card.round!.current, tx.id] } });
    const after = send({ kind: 'save' });
    if (after.kind !== 'state') throw new Error(after.kind);
    expect(after.state.patients[p.id].stay!.replans).toBe(replans + 1);
    expect(after.state.patients[p.id].stay!.plan.treatments).toContain(tx.id);
    // стационар платит при выписке: случай — в кассе суток (тариф — код «Анамнеза», `wardIncome`)
    const cases = after.state.economy!.ledger!.ward?.cases ?? 0;
    send({ kind: 'command', cmd: { kind: 'discharge', id: p.id } });
    const done = send({ kind: 'save' });
    if (done.kind !== 'state') throw new Error(done.kind);
    expect(done.state.patients[p.id].status).toBe('done');
    expect(done.state.economy!.ledger!.ward?.cases).toBe(cases + 1);
    expect(doctorState(db, done.state).ward.some(r => r.id === p.id)).toBe(false);
  }, 60_000);
});

describe('долгий случай нанятого врача', () => {
  /** База с коротким сроком: «долго» — через час, чтобы случаи были в каждой смене. */
  const fast: ContentDb = { ...db, consults: { ...db.consults!, long: 1 } };

  test('без диагноза дольше срока — просьба «долго»; без ответа — решает тем, что знает: новых обследований нет', () => {
    const s = city({ seed: 7, dbx: fast, flow: { perHour: 8, ambulancePerHour: 1 } });
    let ask: { id: string; t: number } | undefined;
    while (!ask && s.t < 20 * HOUR) {
      for (const n of apply(fast, s, { kind: 'advance', seconds: 60 })) {
        if (n.kind === 'consult' && s.consults?.find(c => c.id === n.id)?.why.includes('long')) ask = { id: n.id, t: s.t };
      }
    }
    expect(ask).toBeDefined();
    const p = s.patients[ask!.id];
    expect(p.calledT).toBeDefined();
    expect(s.t - p.calledT!).toBeGreaterThanOrEqual(HOUR);
    const c = s.consults!.find(x => x.id === p.id)!;
    expect(c.why).toEqual(['long']);
    expect(c.lead.length).toBeGreaterThan(0);
    const done = [...p.done];
    // никто не отвечает: через 30 минут решает — только вопросы перед лечением
    live(s, (ask!.t + 40 * 60) / HOUR, 60, fast);
    const q = s.patients[p.id] ?? undefined;
    const after = q ? q.done : (s.gone ?? []).some(r => r.id === p.id) ? done : [];
    const added = after.filter(x => !done.includes(x));
    expect(added.every(x => fast.exams[x].kind === 'ask')).toBe(true);
    expect(q === undefined || q.closed !== undefined).toBe(true);
  });

  test('«Пусть решает сам» — только вопросы перед лечением и решение; уже просил — второй раз не просит', () => {
    const s = city({ seed: 8, dbx: fast, flow: { perHour: 8, ambulancePerHour: 1 } });
    let id: string | undefined;
    while (!id && s.t < 20 * HOUR) {
      for (const n of apply(fast, s, { kind: 'advance', seconds: 60 })) if (n.kind === 'consult' && s.consults?.find(c => c.id === n.id)?.why.includes('long')) id = n.id;
    }
    expect(id).toBeDefined();
    const done = [...s.patients[id!].done];
    const at = s.t;
    apply(fast, s, { kind: 'consult', id: id!, answer: 'self' });
    // решает тем, что знает: анализов и снимков больше нет — вопросы перед лечением, и приём закрыт
    const asked: Notice[] = [];
    while (s.patients[id!]?.closed === undefined && s.patients[id!] !== undefined && s.t < at + HOUR) {
      for (const n of apply(fast, s, { kind: 'advance', seconds: 60 })) asked.push(n);
    }
    const p = s.patients[id!];
    expect(p === undefined || p.closed !== undefined).toBe(true);
    if (p) expect(p.done.filter(x => !done.includes(x)).every(x => fast.exams[x].kind === 'ask')).toBe(true);
    expect(s.t - at).toBeLessThan(HOUR);
    // больше о нём не просят
    for (const x of live(s, s.t / HOUR + 3, 60, fast)) asked.push(x.n);
    expect(asked.filter(n => n.kind === 'consult' && n.id === id)).toEqual([]);
  });
});

describe('детерминизм', () => {
  /** Двое суток: стройка, найм и увольнение, часы приёма, кредит (касса с начала ниже предела). */
  function script(step: number): ShiftState {
    const s = empty({ seed: 9, cash: -db.money!.overdraft - 100_000 });
    // стройка — до денег: ниже предела стройка ждёт — сначала в плюс кредитом
    live(s, 32, step);
    apply(db, s, { kind: 'loan' });
    buildClinic(s);
    live(s, 44, step);
    apply(db, s, { kind: 'hours', open: 7, close: 21 });
    site(db, s, { kind: 'dismiss', id: s.staff![0].id });
    live(s, 50, step);
    apply(db, s, { kind: 'site', cmd: { kind: 'hire', room: s.hospital!.site!.rooms[0].id, role: 'role.registrar' } });
    live(s, 80, step);
    return s;
  }

  test('шаги 60, 15 и 37 с — тот же хэш; поток расчёта кадрами с бюджетом — тот же', () => {
    const a = script(60);
    expect(a.economy!.loan).toBeDefined();
    expect(a.history.length).toBe(3);
    expect(a.history[1].economy!.ledger.expenses.works).toBeGreaterThan(0);
    const b = script(15);
    const c = script(37);
    expect(bare(b)).toBe(bare(a));
    expect(bare(c)).toBe(bare(a));
    // поток расчёта: те же команды, кадрами по 4 игровые секунды с маленьким бюджетом
    const sim = createSim(db);
    sim.handle({ kind: 'start', seed: 9, season: 'winter', hospital: hospitalOf(db, emptySite()), staff: [], flow: AUTO, economy: { cash: -db.money!.overdraft - 100_000 } });
    const tickTo = (hour: number) => {
      for (let guard = 0; guard < 200000; guard++) {
        const st = sim.handle({ kind: 'save' });
        if (st.kind !== 'state' || st.state.t >= hour * HOUR) return;
        sim.handle({ kind: 'tick', seconds: Math.min(240, hour * HOUR - st.state.t), budgetMs: 2 });
      }
    };
    tickTo(32);
    sim.handle({ kind: 'command', cmd: { kind: 'loan' } });
    const st0 = sim.handle({ kind: 'save' });
    if (st0.kind !== 'state') throw new Error(st0.kind);
    // те же действия стройки, что `buildClinic`
    const local = empty({ seed: 9, cash: -db.money!.overdraft - 100_000 });
    live(local, 32, 60);
    apply(db, local, { kind: 'loan' });
    const before = local.journal.length;
    buildClinic(local);
    for (const cmd of local.journal.slice(before)) sim.handle({ kind: 'command', cmd });
    tickTo(44);
    sim.handle({ kind: 'command', cmd: { kind: 'hours', open: 7, close: 21 } });
    const st1 = sim.handle({ kind: 'save' });
    if (st1.kind !== 'state') throw new Error(st1.kind);
    sim.handle({ kind: 'command', cmd: { kind: 'site', cmd: { kind: 'dismiss', id: st1.state.staff![0].id } } });
    tickTo(50);
    const st2 = sim.handle({ kind: 'save' });
    if (st2.kind !== 'state') throw new Error(st2.kind);
    sim.handle({ kind: 'command', cmd: { kind: 'site', cmd: { kind: 'hire', room: st2.state.hospital!.site!.rooms[0].id, role: 'role.registrar' } } });
    tickTo(80);
    const end = sim.handle({ kind: 'save' });
    if (end.kind !== 'state') throw new Error(end.kind);
    expect(bare(end.state)).toBe(bare(a));
  }, 240_000);
});

describe('база', () => {
  function broken(file: string, mutate: (text: string) => string | null): string[] {
    const dir = mkdtempSync(join(tmpdir(), 'bolnitsa-economy-'));
    try {
      cpSync(CONTENT_DIR, dir, { recursive: true });
      const path = join(dir, file);
      const next = mutate(readFileSync(path, 'utf8'));
      if (next === null) rmSync(path);
      else writeFileSync(path, next);
      return buildDb(dir).errors;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  const has = (errors: string[], file: string, part: string) => errors.some(e => e.startsWith(file) && e.includes(part));

  test('ориентиры §5, предел и кредит, срок долгого случая — сборка не проходит с неверными', () => {
    expect(has(broken('hospital/inflow.yaml', t => t.replace(/^walkIn: .*$/m, 'walkIn: 6')), 'hospital/inflow.yaml', 'ориентир геймдизайна §5')).toBe(true);
    expect(has(broken('hospital/inflow.yaml', t => t.replace(/^ambulance: .*$/m, 'ambulance: 9')), 'hospital/inflow.yaml', 'скорая')).toBe(true);
    expect(broken('hospital/inflow.yaml', () => null)).toContain('hospital/inflow.yaml: нет чисел потока от больницы');
    expect(broken('hospital/money.yaml', () => null)).toContain('hospital/money.yaml: нет предела минуса и кредита');
    expect(broken('hospital/money.yaml', t => t.replace(/^overdraft: .*$/m, 'overdraft: -5')).some(e => e.startsWith('hospital/money.yaml'))).toBe(true);
    expect(broken('hospital/consults.yaml', t => t.replace(/^long: .*$/m, 'long: 0')).some(e => e.startsWith('hospital/consults.yaml'))).toBe(true);
  });

  test('настоящая база: ±30 % (геймдизайн §8), ориентиры §5 — три, предел и кредит', () => {
    expect(db.inflow!.reputation).toBe(30);
    expect(db.inflow!.targets.map(t => t.name)).toEqual(['амбулатория', 'районная', 'большая']);
    expect(db.money!.overdraft).toBeGreaterThan(0);
    expect(db.consults!.long).toBe(4);
    expect(DAY).toBe(24 * HOUR);
  });
});
