// Сутки целиком в потоке для ПК (spec docs/specs/2026-10-day.md): часы идут без остановки, сами приходят только в часы приёма
// и утром больше, скорая — круглые сутки и вечером больше; планёрка в 08:00 — итог ровно за 24 часа, один раз в сутки, с
// извещением; лежащие живут ночь по часам — сутки в стационаре сменяются в 08:00, нанятые врачи обходят своих в 09:00,
// операционная оперирует ночью, смерть «в ночь этих суток» — в 08:00; детерминизм при любом шаге времени и в потоке
// расчёта; смены «Анамнеза» — как были.
import { describe, expect, setDefaultTimeout, test } from 'bun:test';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emptyLedger } from '../../src/engine/economy/economy';
import { presetHospital } from '../../src/engine/hospital/build';
import { presetStaff } from '../../src/engine/hospital/staff';
import { arrivalAfter, hospitalDay, returnWindow } from '../../src/engine/shift/day';
import { apply, hospitalCtx, inpatientsOf, newFlowShift, newSingle, onTableIn, orBlock, orQueueOf, SANDBOX_VENUE } from '../../src/engine/shift/engine';
import { DAY, type Flow, type GoneRow, type Notice, type ShiftPatient, type ShiftState } from '../../src/engine/shift/types';
import { daysIn, wardState } from '../../src/engine/shift/ward';
import { createSim } from '../../src/sim/host';
import { buildDb, CONTENT_DIR } from '../content/load';
import { hospitalFor } from '../bench/hospital';
import { hash, liveUntil } from './scenario';

// испорченная копия базы собирается целиком — около 0,7 с, а копий в тесте семь: под нагрузкой пяти секунд не хватает
setDefaultTimeout(60_000);

const { db } = buildDb();
const day = db.day!;
const layout = hospitalFor(db, 6, 100, { emergency: true });
const H = 3600;
const start = (seed: number, flow: Flow = { perHour: 12, ambulancePerHour: 2 }): ShiftState =>
  newFlowShift(db, { seed, season: 'winter', hospital: layout.hospital, staff: layout.staff, flow });
/** Городская больница базы: палаты, ПИТ, реанимация, боксы, операционная, смотровая приёмного. */
const city = (seed: number, flow: Flow): ShiftState => {
  const rec = db.presets['preset.city'];
  return newFlowShift(db, { seed, season: 'winter', hospital: presetHospital(db, rec).hospital, staff: presetStaff(db, rec), flow });
};

/** Прожить до часа `hour` от полуночи первых суток (32 — 08:00 вторых суток) шагом `step`; извещения — с часом, когда пришли. */
function live(s: ShiftState, hour: number, step = 60, each?: () => void): { t: number; n: Notice }[] {
  const out: { t: number; n: Notice }[] = [];
  while (s.t < hour * H) {
    for (const n of apply(db, s, { kind: 'advance', seconds: Math.min(step, hour * H - s.t) })) out.push({ t: s.t, n });
    each?.();
  }
  return out;
}

/** Все пришедшие — в состоянии и строками журнала (неделю). */
const arrivals = (s: ShiftState): (ShiftPatient | GoneRow)[] => [...Object.values(s.patients), ...(s.gone ?? [])];
const clock = (t: number) => Math.floor((t % DAY) / H);
const isLive = (p: ShiftPatient) => p.status === 'waiting' || p.status === 'inRoom' || p.status === 'away';
/** Состояние без журнала команд: недопустимая команда ничего не меняет, но пишется в журнал. */
const bare = (s: ShiftState) => hash({ ...s, journal: [] });

describe('сутки целиком: часы', () => {
  test('несколько суток подряд — без остановки: сутки сменяются ровно в 08:00, итог — один раз и ровно за 24 часа', () => {
    const s = start(41, { perHour: 8, ambulancePerHour: 1 });
    const notices = live(s, 80, 60, () => {
      expect(s.dayOpen).toBe(true);
      expect(s.day).toBe(hospitalDay(s.t));
      // следующая планёрка всегда впереди — одна
      expect(s.events.filter(e => e.event.kind === 'morning').map(e => e.t)).toEqual([(s.day - 1) * DAY + 32 * H]);
    });
    expect(notices.some(x => x.n.kind === 'shiftEnd')).toBe(false);
    expect(s.events.some(e => e.event.kind === 'shiftEnd')).toBe(false);
    const mornings = notices.filter(x => x.n.kind === 'morning');
    expect(mornings.map(x => x.t)).toEqual([32 * H, 56 * H, 80 * H]);
    expect(s.day).toBe(4);
    expect(s.history.map(h => h.day)).toEqual([1, 2, 3]);
    const all = arrivals(s);
    // повторные — «как пришедшие сами» (§5), в первые два часа приёма
    const back = all.filter(p => p.kind === 'return').map(p => p.arriveT % DAY);
    expect(back.length).toBeGreaterThan(0);
    expect(back.every(t => t >= 8 * H && t <= 10 * H)).toBe(true);
    mornings.forEach(({ n }, i) => {
      if (n.kind !== 'morning') throw new Error(n.kind);
      const d = i + 1;
      // итог в извещении — тот же, что в истории; пришли — ровно те, кто пришёл с 08:00 до 08:00
      expect(n.summary).toEqual(s.history[i]);
      expect(n.summary.day).toBe(d);
      const from = (d - 1) * DAY + 8 * H;
      const window = all.filter(p => p.arriveT >= from && p.arriveT < from + DAY);
      expect(n.summary.arrived).toBe(window.length);
      expect(n.summary.ambulance?.arrived ?? 0).toBe(window.filter(p => p.kind === 'ambulance').length);
      expect(n.summary.unseen).toBe(0);
      // приняты нанятыми врачами — все, кто закрыт за эти сутки
      expect(Object.values(n.summary.colleagues ?? {}).reduce((a, c) => a + c.seen, 0)).toBeGreaterThan(50);
    });
  }, 180_000);

  test('кто в больнице в 08:00 — там же; «закрыть день» и «следующий день» в потоке для ПК ничего не меняют', () => {
    const s = start(42, { perHour: 8, ambulancePerHour: 1 });
    liveUntil(db, s, 20);
    const before = bare(s);
    apply(db, s, { kind: 'closeDay' });
    apply(db, s, { kind: 'nextDay' });
    expect(bare(s)).toBe(before);
    // за секунду до планёрки и сразу после: кто был в больнице, тот там же — никто не стал «не принят» и не пропал
    while (s.t < 32 * H - 1) apply(db, s, { kind: 'advance', seconds: Math.min(60, 32 * H - 1 - s.t) });
    const there = Object.values(s.patients).filter(p => isLive(p) || p.status === 'admitted').map(p => [p.id, p.status] as const);
    expect(there.length).toBeGreaterThan(0);
    apply(db, s, { kind: 'advance', seconds: 1 });
    expect([s.t, s.day]).toEqual([32 * H, 2]);
    for (const [id, status] of there) expect(s.patients[id]?.status).toBe(status);
  }, 120_000);
});

describe('сутки целиком: кто приходит и когда', () => {
  test('сами — только в часы приёма и утром больше, чем вечером; скорая — и ночью, вечером больше, чем ночью', () => {
    // без нанятых врачей — считаем только, кто когда пришёл
    const empty = hospitalFor(db, 0, 100, { emergency: true });
    const s = newFlowShift(db, { seed: 43, season: 'winter', hospital: empty.hospital, staff: empty.staff, flow: { perHour: 40, ambulancePerHour: 10 } });
    live(s, 56);
    const all = arrivals(s);
    const walk = all.filter(p => p.kind === 'walkIn').map(p => clock(p.arriveT));
    const amb = all.filter(p => p.kind === 'ambulance' && p.returnOf === undefined).map(p => clock(p.arriveT));
    expect(walk.length).toBeGreaterThan(800);
    expect(walk.every(h => h >= day.hours[0] && h < day.hours[1])).toBe(true);
    const count = (xs: number[], from: number, to: number) => xs.filter(h => h >= from && h < to).length;
    // 08–12 против 16–20: по форме базы — в 2,6 раза
    expect(count(walk, 8, 12)).toBeGreaterThan(1.5 * count(walk, 16, 20));
    expect(count(amb, 0, 6)).toBeGreaterThan(0);
    // 16–22 против 00–06: по форме базы — в 2,5 раза
    expect(count(amb, 16, 22)).toBeGreaterThan(1.5 * count(amb, 0, 6));
  }, 180_000);

  test('часы приёма — командой: сразу, следующий сам — по новым часам; повторные — в первые два часа приёма', () => {
    const s = start(44, { perHour: 24, ambulancePerHour: 1 });
    liveUntil(db, s, 10);
    const before = bare(s);
    // неверные часы и те же — ничего не меняют
    for (const [open, close] of [[12, 12], [14, 12], [-1, 10], [10, 25], [8.5, 12], [8, 20]]) apply(db, s, { kind: 'hours', open, close });
    expect(bare(s)).toBe(before);
    apply(db, s, { kind: 'hours', open: 12, close: 16 });
    expect(s.flow!.hours).toEqual([12, 16]);
    const since = s.t;
    live(s, 56);
    const walk = arrivals(s).filter(p => p.kind === 'walkIn' && p.arriveT > since).map(p => clock(p.arriveT));
    expect(walk.length).toBeGreaterThan(100);
    expect(walk.every(h => h >= 12 && h < 16)).toBe(true);
    // окно повторных: с открытия — два часа; приём, открытый до 08:00, — с 08:00; ночной — со следующей полуночи
    expect(returnWindow([8, 20])).toEqual({ from: 8 * H, minutes: 120 });
    expect(returnWindow([12, 16])).toEqual({ from: 12 * H, minutes: 120 });
    expect(returnWindow([6, 9])).toEqual({ from: 8 * H, minutes: 59 });
    expect(returnWindow([0, 6])).toEqual({ from: 24 * H, minutes: 120 });
    const back = arrivals(s).filter(p => p.kind === 'return' && p.arriveT > since).map(p => p.arriveT % DAY);
    expect(back.every(t => t >= 12 * H && t <= 14 * H)).toBe(true);
  }, 180_000);

  test('приход по часам: при ровной частоте — как прежде, до секунды; в закрытые часы никто не приходит', () => {
    const flat = () => 20;
    for (const e of [0.001, 0.3, 1, 2.5, 9.2]) {
      // прежний поток: from + max(1, round(e · 3600 / частота))
      expect(arrivalAfter(10 * H, e, flat)).toBe(10 * H + Math.max(1, Math.round((e * 3600) / 20)));
    }
    const open = (h: number) => (h >= 8 && h < 20 ? 10 : 0);
    // в 19:59 «работы» на минуту до закрытия и ещё на два часа приёма — придёт в 10:00 следующего утра: ночью она не тратится
    expect(arrivalAfter(19 * H + 59 * 60, 10 / 60 + 20, open)).toBe(DAY + 10 * H);
    expect(arrivalAfter(0, 1, () => 0)).toBeUndefined();
  });
});

describe('сутки целиком: ночь', () => {
  test('лежащие: сутки в стационаре растут в 08:00, обход нанятых в 09:00, операционная — круглые сутки, и ночью', () => {
    const s = city(45, { perHour: 6, ambulancePerHour: 4 });
    const ors = () => {
      const ctx = hospitalCtx(db, s);
      return ctx.plan.rooms.filter(r => r.type === 'room.or' && ctx.working.has(r.id)).map(r => r.id);
    };
    const starts = new Map<string, number>();
    let rounded = 0;
    let lyingAt: Map<string, number> | undefined;
    live(s, 80, 60, () => {
      // операционная не простаивает, пока есть кого оперировать: ни днём, ни ночью
      if (orQueueOf(s).some(p => orBlock(db, s, p.stay!.op!.tx) === null)) expect(ors().every(r => onTableIn(s, r))).toBe(true);
      for (const p of inpatientsOf(s)) if (p.stay!.op?.start !== undefined && !starts.has(p.id)) starts.set(p.id, p.stay!.op!.start!);
      const clockMin = (s.t % DAY) / 60;
      // за минуту до планёрки и сразу после — сутки в стационаре у каждого, кто лежит, +1
      if (clockMin === 7 * 60 + 59) lyingAt = new Map(inpatientsOf(s).map(p => [p.id, daysIn(p.stay!, s.day)]));
      if (clockMin === 8 * 60 && lyingAt) {
        for (const p of inpatientsOf(s)) if (lyingAt.has(p.id)) expect(daysIn(p.stay!, s.day)).toBe(lyingAt.get(p.id)! + 1);
        lyingAt = undefined;
      }
      // после обхода в 09:00 у нанятых врачей не осталось лежащих, кого выписать или перевести
      if (clockMin === day.rounds * 60) {
        rounded++;
        for (const p of inpatientsOf(s)) {
          const stay = p.stay!;
          const days = daysIn(stay, s.day);
          if (!p.closed?.by || days < 1 || (stay.op && !stay.op.done)) continue;
          expect(['better', 'same']).toContain(wardState(stay, days));
        }
      }
    });
    expect(rounded).toBe(3);
    // обход выписывал и переводил
    const ward = s.history.slice(1).map(h => h.ward);
    expect(ward.reduce((a, w) => a + (w?.discharged ?? 0) + (w?.transferred ?? 0), 0)).toBeGreaterThan(0);
    // операции шли и ночью, с 20:00 до 08:00
    const night = [...starts.values()].filter(t => clock(t) >= 20 || clock(t) < 8);
    expect(starts.size).toBeGreaterThan(3);
    expect(night.length).toBeGreaterThan(0);
  }, 300_000);

  test('смерть «в ночь этих суток» — в 08:00, в итог этих суток; в «мягком режиме» — перевод в тяжёлом состоянии', () => {
    for (const soft of [false, true]) {
      const s = city(46, { perHour: 6, ambulancePerHour: 4 });
      if (soft) apply(db, s, { kind: 'soft', on: true });
      liveUntil(db, s, 14);
      const p = inpatientsOf(s).find(x => x.stay!.dies === undefined)!;
      expect(p).toBeDefined();
      // как решает конец операции (часть 28б «Анамнеза»): умрёт в ночь этих суток
      p.stay!.dies = daysIn(p.stay!, s.day);
      liveUntil(db, s, 31);
      expect(s.patients[p.id].status).toBe('admitted');
      const n = live(s, 32).find(x => x.n.kind === 'morning');
      expect(n?.t).toBe(32 * H);
      expect(s.patients[p.id].status).toBe('done');
      expect(s.patients[p.id].closed!.outcome.kind).toBe(soft ? 'transferred' : 'died');
      expect(s.history[0].ward?.[soft ? 'severe' : 'died']).toBeGreaterThan(0);
    }
  }, 180_000);
});

describe('сутки целиком: детерминизм', () => {
  /** Хэши в 06:00 и 09:30 вторых суток (после планёрки и обхода); в 10:00 первых суток — часы приёма 09–18. */
  function checkpoints(seed: number, step: number): string[] {
    const s = start(seed, { perHour: 8, ambulancePerHour: 1 });
    const out: string[] = [];
    liveUntil(db, s, 10, step);
    apply(db, s, { kind: 'hours', open: 9, close: 18 });
    for (const hour of [30, 33.5]) {
      while (s.t < hour * H) apply(db, s, { kind: 'advance', seconds: Math.min(step, hour * H - s.t) });
      out.push(hash(s));
    }
    // журнал суток — с планёрки: ход часов от 08:00 одной строкой при любом шаге
    expect(s.journal).toEqual([{ kind: 'advance', seconds: 1.5 * H }]);
    return out;
  }

  test('шаги 60, 15 и 37 с — тот же хэш, и через 08:00', () => {
    const a = checkpoints(47, 60);
    expect(checkpoints(47, 15)).toEqual(a);
    expect(checkpoints(47, 37)).toEqual(a);
  }, 300_000);

  test('поток расчёта: кадры ×4 с бюджетом через 08:00 — то же состояние, что минутами', () => {
    const flow = { perHour: 8, ambulancePerHour: 1 };
    const s = start(49, flow);
    liveUntil(db, s, 33);
    const sim = createSim(db);
    const first = sim.handle({ kind: 'start', seed: 49, season: 'winter', hospital: layout.hospital, staff: layout.staff, flow });
    expect(first.kind).toBe('slice');
    let mornings = 0;
    let lag = 0;
    const tick = (seconds: number) => {
      const r = sim.handle({ kind: 'tick', seconds, budgetMs: 0 });
      if (r.kind !== 'slice') throw new Error(r.kind === 'error' ? r.message : r.kind);
      mornings += r.notices.filter(x => x.kind === 'morning').length;
      lag = r.lag;
    };
    for (let game = 8 * H; game < 33 * H; game += 4) tick(4);
    for (let k = 0; lag > 0 && k < 1_000_000; k++) tick(0);
    expect(lag).toBe(0);
    const saved = sim.handle({ kind: 'save' });
    if (saved.kind !== 'state') throw new Error(saved.kind);
    expect(saved.state.t).toBe(s.t);
    expect(mornings).toBe(1);
    expect(hash(saved.state)).toBe(hash(s));
  }, 300_000);

  test('журнал суток: команда, на которой прошла планёрка, — её время после 08:00 первой строкой', () => {
    const s = start(50, { perHour: 8, ambulancePerHour: 1 });
    while (s.t < 32 * H - 30) apply(db, s, { kind: 'advance', seconds: Math.min(60, 32 * H - 30 - s.t) });
    const twin = structuredClone(s);
    // ход часов через 08:00 — время через `until`
    apply(db, twin, { kind: 'advance', seconds: 100 });
    expect([twin.day, twin.journal]).toEqual([2, [{ kind: 'advance', seconds: 70 }]]);
    // забрать больного у нанятого врача: дорога к вам — часами игры (spec 2026-10-owner-play-2), команда времени не
    // проживает; планёрка — посреди хода часов, и журнал новых суток — с её времени
    const p = Object.values(s.patients).find(x => x.status === 'inRoom' && x.by !== undefined && x.closed === undefined);
    expect(p).toBeDefined();
    const t0 = s.t;
    apply(db, s, { kind: 'takeOver', id: p!.id });
    expect([s.day, s.t]).toEqual([1, t0]);
    apply(db, s, { kind: 'advance', seconds: 100 });
    expect(s.day).toBe(2);
    expect(s.journal).toEqual([{ kind: 'advance', seconds: s.t - 32 * H }]);
  }, 180_000);
});

describe('сутки целиком: касса и смены «Анамнеза»', () => {
  test('касса, если она есть, — на планёрке: зарплаты, содержание, репутация; касса новых суток — с нуля', () => {
    const s = start(51);
    s.economy = { cash: 1_000_000, reputation: db.economy.reputation.start, ledger: emptyLedger() };
    live(s, 32);
    const e = s.history[0].economy!;
    expect(e).toBeDefined();
    expect(e.ledger.expenses.salaries).toBeGreaterThan(0);
    expect(e.ledger.income.oms + e.ledger.income.dms + e.ledger.income.self).toBeGreaterThan(0);
    expect(s.economy.cash).toBe(e.cash);
    expect(s.economy.reputation).toBe(e.reputation.to);
    expect(s.economy.ledger).toEqual(emptyLedger());
  }, 120_000);

  test('смены «Анамнеза» — как были: приём до 14:00, закрытие дня и следующий день — командами', () => {
    const l = hospitalFor(db, 4);
    const s = newSingle(db, { seed: 6, season: 'winter', venue: SANDBOX_VENUE, hospital: l.hospital, staff: l.staff });
    expect(s.events.some(e => e.event.kind === 'shiftEnd' && e.t === 14 * H)).toBe(true);
    expect(s.events.some(e => e.event.kind === 'morning' || e.event.kind === 'rounds')).toBe(false);
    const before = bare(s);
    apply(db, s, { kind: 'hours', open: 9, close: 18 });
    expect(bare(s)).toBe(before);
    liveUntil(db, s, 18);
    apply(db, s, { kind: 'closeDay' });
    expect(s.dayOpen).toBe(false);
    apply(db, s, { kind: 'nextDay' });
    expect([s.day, s.t]).toEqual([2, DAY + 8 * H]);
  }, 120_000);
});

describe('сутки целиком — в базе', () => {
  function broken(mutate: (text: string) => string | null): string[] {
    const dir = mkdtempSync(join(tmpdir(), 'bolnitsa-day-'));
    try {
      cpSync(CONTENT_DIR, dir, { recursive: true });
      const file = join(dir, 'hospital/day.yaml');
      const next = mutate(readFileSync(file, 'utf8'));
      if (next === null) rmSync(file);
      else writeFileSync(file, next);
      return buildDb(dir).errors;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  const has = (errors: string[], part: string) => errors.some(e => e.startsWith('hospital/day.yaml') && e.includes(part));

  test('часы, среднее, «утром больше», «вечером больше», нет файла — сборка не проходит', () => {
    expect(has(broken(t => t.replace(/^hours: .*$/m, 'hours: [20, 8]')), 'открытие не раньше закрытия')).toBe(true);
    expect(has(broken(t => t.replace(/^walk: \[10, /m, 'walk: [10, ').replace(' 150, 160,', ' 150, 170,')), 'должно быть ровно 100')).toBe(true);
    expect(has(broken(t => t.replace(/^ambulance: \[70,/m, 'ambulance: [80,')), 'ambulance за сутки')).toBe(true);
    // та же сумма, а утро и вечер переставлены
    expect(has(broken(t => t.replace(/^walk: .*$/m, `walk: [${[10, 10, 10, 10, 10, 10, 30, 80, 50, 50, 60, 70, 80, 90, 100, 110, 130, 150, 160, 150, 30, 20, 10, 10].join(', ')}]`)), 'утром не больше')).toBe(true);
    expect(has(broken(t => t.replace(/^ambulance: .*$/m, `ambulance: [${Array(24).fill(100).join(', ')}]`)), 'вечером не больше')).toBe(true);
    expect(has(broken(t => t.replace(/^rounds: .*$/m, 'rounds: 24')), 'rounds')).toBe(true);
    expect(broken(() => null)).toContain('hospital/day.yaml: нет часов приёма и формы потока по часам');
  });

  test('настоящая база: часы приёма по умолчанию — 08:00–20:00 (геймдизайн §2), форма — 24 часа, обход утром', () => {
    expect(day.hours).toEqual([8, 20]);
    expect(day.walk).toHaveLength(24);
    expect(day.ambulance).toHaveLength(24);
    expect(day.rounds).toBeGreaterThanOrEqual(8);
    expect(day.rounds).toBeLessThan(12);
  });
});
