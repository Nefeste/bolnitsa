// Путь пациента (spec docs/specs/2026-10-flow-ui.md, «Путь пациента в движке»): поток для ПК записывает, что с человеком
// было и почему он ждал; смены «Анамнеза» — без пути. Причины ожидания — из состояния движка; детерминизм — тот же путь
// при любом шаге времени и в потоке расчёта; хранится сутки после ухода, законченных — не больше MAX_DONE.
import { describe, expect, test } from 'bun:test';
import { db } from '../../src/content';
import { SYSTEMS } from '../../src/content/types';
import type { StaffMember } from '../../src/engine/hospital/staff';
import { apply, newFlowShift, newShift, newSingle } from '../../src/engine/shift/engine';
import { type Journey, KEEP, MAX_DONE, type Step, SWEEP } from '../../src/engine/shift/journey';
import { sliceOf } from '../../src/engine/shift/slice';
import { DAY, type Flow, type Notice, type ShiftState } from '../../src/engine/shift/types';
import { createSim } from '../../src/sim/host';
import { Handles, packSlice, peopleOf } from '../../src/sim/pack';
import { hospitalFor, type Layout } from '../bench/hospital';
import { presetLayout } from './render-kit';
import { hash, liveUntil } from './scenario';

const city = presetLayout(db, 'preset.city');
const bench = hospitalFor(db, 6, 100, { emergency: true });
const CITY: Flow = { perHour: 6, ambulancePerHour: 1 };

function flowShift(seed: number, opts: { l?: Pick<Layout, 'hospital' | 'staff'>; flow?: Flow; staff?: StaffMember[] } = {}): ShiftState {
  const l = opts.l ?? city;
  return newFlowShift(db, { seed, season: 'winter', hospital: l.hospital, staff: opts.staff ?? l.staff, flow: opts.flow ?? CITY });
}
const journeys = (s: ShiftState): [string, Journey][] => Object.entries(s.journeys?.of ?? {});
const steps = (s: ShiftState): Step[] => journeys(s).flatMap(([, j]) => j.steps);
const WAITS = new Set<Step['k']>(['queue', 'own', 'results', 'ask']);
const therapist = (m: StaffMember) => m.role === 'role.therapist';

/** Шаги пути — по времени; ожидание не пустое: следующий шаг или конец — позже. */
function checkOrder(j: Journey) {
  j.steps.forEach((x, i) => {
    const next = j.steps[i + 1]?.t ?? j.end?.t;
    if (i > 0) expect(x.t).toBeGreaterThanOrEqual(j.steps[i - 1].t);
    if (WAITS.has(x.k) && next !== undefined) expect(next).toBeGreaterThan(x.t);
    if (x.k === 'exam') {
      expect(x.at).toBeGreaterThanOrEqual(x.t);
      expect(x.start).toBeGreaterThanOrEqual(x.at);
      expect(x.end).toBeGreaterThanOrEqual(x.start);
      expect(x.back).toBeGreaterThanOrEqual(x.end);
      expect(x.ready).toBeGreaterThanOrEqual(x.end);
    }
  });
  expect(j.steps.length === 0 || j.steps[0].t >= j.at).toBe(true);
}

describe('путь пациента', () => {
  test('только в потоке для ПК: в сменах «Анамнеза» поля нет', () => {
    const single = newSingle(db, { seed: 1, season: 'winter', venue: 'preset.city' });
    liveUntil(db, single, 11);
    const practice = newShift(db, { seed: 2, season: 'winter' });
    liveUntil(db, practice, 11);
    for (const s of [single, practice]) {
      expect(Object.keys(s.patients).length).toBeGreaterThan(3);
      expect(s.journeys).toBeUndefined();
      // срез и без пути: с прихода
      for (const p of sliceOf(s).people) expect(p.since).toBe(s.patients[p.id].arriveT);
    }
  }, 120_000);

  test('у каждого пришедшего — путь: шаги по порядку, ожидания не пустые, у врача — кто и где, конец — как ушёл', () => {
    const s = flowShift(1);
    liveUntil(db, s, 14);
    const of = s.journeys!.of;
    const present = Object.values(s.patients).filter(p => p.status !== 'coming');
    expect(present.length).toBeGreaterThan(5);
    for (const p of present) {
      expect(of[p.id]).toBeDefined();
      expect(of[p.id].at).toBe(p.arriveT);
      expect(of[p.id].kind).toBe(p.kind);
    }
    // ушедшие сегодня — в журнале строками, их путь — ещё здесь
    for (const r of s.gone ?? []) expect(of[r.id]?.end?.how).toBe(r.end === 'done' ? of[r.id].end!.how : r.end);
    const rooms = new Map(city.staff.map(m => [m.id, m.room]));
    for (const [id, j] of journeys(s)) {
      checkOrder(j);
      for (const x of j.steps) if (x.k === 'doctor' && x.by) expect(x.room).toBe(rooms.get(x.by)!);
      const p = s.patients[id];
      if (j.end?.how === 'stay') {
        expect(p?.stay?.room).toBe(j.end.room!);
        expect(['admit', 'icu', 'ricu', 'box', 'surgery']).toContain(j.end.setting!);
      }
      if (!j.end) expect(['waiting', 'inRoom', 'away']).toContain(p.status);
    }
    const kinds = new Set(steps(s).map(x => x.k));
    for (const k of ['queue', 'doctor', 'exam', 'results', 'own'] as const) expect(kinds.has(k)).toBe(true);
    const ends = new Set(journeys(s).map(([, j]) => j.end?.how));
    for (const k of ['home', 'stay'] as const) expect(ends.has(k)).toBe(true);
  }, 120_000);

  test('почему ждал врача: все заняты — с числом врачей и очередью; ни один не принимает; ждёт вас', () => {
    // городская больница: walk-in берёт один терапевт (специалисты — только записанных к ним)
    const busy = flowShift(1);
    liveUntil(db, busy, 12);
    const q = steps(busy).filter((x): x is Extract<Step, { k: 'queue' }> => x.k === 'queue');
    expect(q.length).toBeGreaterThan(5);
    expect(q.every(x => x.why === 'busy' && x.docs === 1 && x.ahead >= 0)).toBe(true);
    expect(q.some(x => x.ahead > 0)).toBe(true);
    // терапевта нет — открыт только ваш кабинет: ни один нанятый не принимает
    const none = flowShift(1, { staff: city.staff.filter(m => !therapist(m)) });
    liveUntil(db, none, 11);
    const qn = steps(none).filter(x => x.k === 'queue');
    expect(qn.length).toBeGreaterThan(3);
    expect(qn.every(x => x.k === 'queue' && x.why === 'none' && x.docs === undefined)).toBe(true);
    // «свои больные» — все группы: новых оставляют вам
    const mine = flowShift(1);
    apply(db, mine, { kind: 'mine', systems: [...SYSTEMS] });
    liveUntil(db, mine, 11);
    const qm = steps(mine).filter(x => x.k === 'queue' && x.why === 'you');
    expect(qm.length).toBeGreaterThan(3);
  }, 120_000);

  test('скорая без места в смотровой ждёт у входа; своего зала у кабинета нет или он полон — стоя (spec 2026-10-own-hall)', () => {
    const amb = flowShift(1, { flow: { perHour: 6, ambulancePerHour: 8 } });
    liveUntil(db, amb, 12);
    const door = journeys(amb).filter(([, j]) => j.steps.some(x => x.k === 'queue' && x.door));
    expect(door.length).toBeGreaterThan(3);
    expect(door.every(([, j]) => j.kind === 'ambulance')).toBe(true);
    const crowd = flowShift(1, { flow: { perHour: 40, ambulancePerHour: 1 } });
    liveUntil(db, crowd, 11);
    // зал городской больницы — в 37–63 м от кабинетов нанятых врачей: их больные стоят, «зала не дальше 10 м нет»
    const stood = journeys(crowd).filter(([, j]) => j.steps.some(x => x.k === 'queue' && (x.full || x.far !== undefined)));
    expect(stood.length).toBeGreaterThan(10);
    expect(stood.every(([, j]) => j.kind !== 'ambulance')).toBe(true);
    expect(stood.some(([, j]) => j.steps.some(x => x.k === 'queue' && x.far === 10))).toBe(true);
  }, 120_000);

  test('ушёл, не дождавшись: путь кончается ожиданием врача — ровно столько, сколько был готов ждать', () => {
    const s = flowShift(1, { flow: { perHour: 40, ambulancePerHour: 1 } });
    liveUntil(db, s, 11);
    const left = journeys(s).filter(([, j]) => j.end?.how === 'left');
    expect(left.length).toBeGreaterThan(10);
    for (const [, j] of left) {
      const last = j.steps[j.steps.length - 1];
      expect(last.k).toBe('queue');
      expect(j.end!.patience!).toBeGreaterThan(0);
      // терпение — с того, как сел в зале ожидания (spec 2026-10-walk)
      expect(j.end!.t - ((last.k === 'queue' && last.sat) || last.t)).toBe(j.end!.patience!);
    }
  }, 120_000);

  test('очередь у кабинета обследования — пока его занимал другой; результаты — после процедуры; свой врач — занят', () => {
    const s = flowShift(1, { l: bench, flow: { perHour: 12, ambulancePerHour: 2 } });
    liveUntil(db, s, 18);
    const exams = steps(s).filter((x): x is Extract<Step, { k: 'exam' }> => x.k === 'exam');
    const queued = exams.filter(x => x.start > x.at);
    expect(queued.length).toBeGreaterThan(2);
    // начали, когда кабинет освободился: кто-то другой кончил там ровно тогда
    for (const x of queued) expect(exams.some(y => y !== x && y.room === x.room && y.end === x.start)).toBe(true);
    for (const [, j] of journeys(s)) {
      j.steps.forEach((x, i) => {
        const prev = j.steps[i - 1];
        if (x.k === 'results' && prev?.k === 'exam') expect(x.t).toBeGreaterThanOrEqual(prev.end);
        if (x.k === 'own') expect(x.by).toBeDefined();
      });
    }
    expect(steps(s).some(x => x.k === 'own')).toBe(true);
    expect(steps(s).some(x => x.k === 'results')).toBe(true);
  }, 120_000);

  test('отправлен в другую больницу, а свои койки заняты все — путь это помнит', () => {
    const s = flowShift(3, { l: bench, flow: { perHour: 12, ambulancePerHour: 6 } });
    liveUntil(db, s, 18);
    const away = journeys(s).filter(([, j]) => j.end?.how === 'away');
    expect(away.length).toBeGreaterThan(3);
    const full = away.filter(([, j]) => j.end!.full?.includes('ward'));
    expect(full.length).toBeGreaterThan(2);
    for (const [, j] of full) expect(['ward', 'ambulance']).toContain(j.end!.setting!);
    // домой и лёг — без списка занятых мест
    for (const [, j] of journeys(s)) if (j.end && j.end.how !== 'away') expect(j.end.full).toBeUndefined();
  }, 120_000);

  test('просьба врача: ждёт вашего ответа; направлен — ждёт другого врача; без ответа — врач решает сам через 30 минут', () => {
    const weak = bench.staff.map(m => (therapist(m) ? { ...m, skill: 1 } : m));
    const s = flowShift(5, { l: bench, flow: { perHour: 12, ambulancePerHour: 2 }, staff: weak });
    const end = 18 * 3600;
    let ask: Extract<Notice, { kind: 'consult' }> | undefined;
    while (s.t < end && !ask) ask = apply(db, s, { kind: 'advance', seconds: 60 }).find((n): n is Extract<Notice, { kind: 'consult' }> => n.kind === 'consult');
    expect(ask).toBeDefined();
    const j = s.journeys!.of[ask!.id];
    const last = j.steps[j.steps.length - 1];
    expect(last.k === 'ask' && last.by === ask!.by && last.until - last.t === db.consults!.wait * 60).toBe(true);
    // направить к другому врачу: ждёт его
    const other = weak.find(m => therapist(m) && m.id !== ask!.by)!;
    apply(db, s, { kind: 'consult', id: ask!.id, answer: 'refer', to: other.id });
    const after = j.steps[j.steps.length - 1];
    expect(after.k === 'own' && after.by === other.id && after.refer === true).toBe(true);
    // следующая просьба — без ответа: врач решает сам, не раньше срока
    let next: Extract<Notice, { kind: 'consult' }> | undefined;
    while (s.t < end && !next) next = apply(db, s, { kind: 'advance', seconds: 60 }).find((n): n is Extract<Notice, { kind: 'consult' }> => n.kind === 'consult');
    expect(next).toBeDefined();
    const k = s.journeys!.of[next!.id];
    const at = k.steps.length - 1;
    const until = (k.steps[at] as Extract<Step, { k: 'ask' }>).until;
    liveUntil(db, s, Math.min(20, until / 3600 + 1));
    expect((k.steps[at + 1]?.t ?? k.end!.t) >= until).toBe(true);
  }, 120_000);

  test('детерминизм: тот же путь при шаге 60 и 15 с и в потоке расчёта кадрами с бюджетом', () => {
    const a = flowShift(4);
    liveUntil(db, a, 13);
    const b = flowShift(4);
    liveUntil(db, b, 13, 15);
    expect(hash(b.journeys)).toBe(hash(a.journeys));
    expect(hash(b)).toBe(hash(a));
    const sim = createSim(db);
    sim.handle({ kind: 'start', seed: 4, season: 'winter', hospital: city.hospital, staff: city.staff, flow: CITY });
    // окно смотрит путь первого пришедшего — на состояние это не влияет
    sim.handle({ kind: 'watch', id: '1-w0000' });
    let lag = 1;
    for (let i = 0; i < (5 * 3600) / 4; i++) sim.handle({ kind: 'tick', seconds: 4, budgetMs: 2 });
    for (let k = 0; lag > 0 && k < 100_000; k++) {
      const r = sim.handle({ kind: 'tick', seconds: 0, budgetMs: 2 });
      if (r.kind === 'slice') lag = r.lag;
    }
    const saved = sim.handle({ kind: 'save' });
    if (saved.kind !== 'state') throw new Error(saved.kind);
    expect(saved.state.t).toBe(a.t);
    expect(hash(saved.state.journeys)).toBe(hash(a.journeys));
    expect(hash(saved.state)).toBe(hash(a));
  }, 180_000);

  test('поток расчёта: путь того, кого смотрит окно, — в срезе, когда он изменился', () => {
    const sim = createSim(db);
    sim.handle({ kind: 'start', seed: 1, season: 'winter', hospital: city.hospital, staff: city.staff, flow: CITY });
    let r = sim.handle({ kind: 'watch', id: '1-w0003' });
    expect(r.kind === 'slice' && r.path).toEqual({ id: '1-w0003', journey: null });
    const got: number[] = [];
    // ходьба в движке (spec 2026-10-walk): путь до конца — дольше прежних трёх часов
    for (let i = 0; i < (6 * 3600) / 60; i++) {
      r = sim.handle({ kind: 'tick', seconds: 60, budgetMs: 50 });
      if (r.kind === 'slice' && r.path?.journey) got.push(r.path.journey.steps.length + (r.path.journey.end ? 100 : 0));
    }
    // пришёл, шаги прибавлялись, путь кончился — и только тогда срез его нёс
    expect(got.length).toBeGreaterThan(1);
    expect(new Set(got).size).toBe(got.length);
    expect(got[got.length - 1]).toBeGreaterThanOrEqual(100);
    r = sim.handle({ kind: 'watch', id: null });
    expect(r.kind === 'slice' && r.path).toBeUndefined();
  }, 120_000);

  test('хранится сутки после ухода, лежащих — пока лежат; законченных — не больше MAX_DONE', () => {
    const s = flowShift(6);
    liveUntil(db, s, 20);
    const day1 = journeys(s).map(([id]) => id);
    // сутки целиком (spec 2026-10-day): день не закрывают — часы идут через ночь и планёрку до 13:00 следующих суток
    const end = DAY + 13 * 3600;
    while (s.t < end) apply(db, s, { kind: 'advance', seconds: Math.min(60, end - s.t) });
    expect(s.day).toBe(2);
    const of = s.journeys!.of;
    for (const [id, j] of journeys(s)) {
      if (!j.end) continue;
      if (s.patients[id]?.status !== 'admitted') expect(j.end.t).toBeGreaterThan(s.journeys!.sweep - 3600 - KEEP);
    }
    // лежащие со вчера — с путём; ушедшие вчера после полудня — тоже
    const lying = Object.values(s.patients).filter(p => p.status === 'admitted' && p.arriveT < DAY);
    expect(lying.length).toBeGreaterThan(0);
    for (const p of lying) expect(of[p.id]).toBeDefined();
    expect(day1.some(id => (of[id]?.end?.t ?? 0) > 13 * 3600 && s.patients[id]?.status !== 'admitted')).toBe(true);
    expect(day1.some(id => !of[id])).toBe(true);
    // большой поток: после каждой уборки законченных — не больше MAX_DONE
    const big = hospitalFor(db, 40);
    const b = flowShift(7, { l: big, flow: { perHour: 120 } });
    let sweeps = 0;
    let sweep = 0;
    while (b.t < 15 * 3600) {
      apply(db, b, { kind: 'advance', seconds: 60 });
      if (b.journeys && b.journeys.sweep !== sweep) {
        sweep = b.journeys.sweep;
        sweeps++;
        // законченные к часу уборки: кто закончил в ту же минуту после неё — до следующей
        const at = sweep - SWEEP;
        const done = journeys(b).filter(([id, j]) => j.end && j.end.t <= at && b.patients[id]?.status !== 'admitted').length;
        expect(done).toBeLessThanOrEqual(MAX_DONE);
      }
    }
    expect(sweeps).toBeGreaterThan(4);
    expect(journeys(b).length).toBeGreaterThan(MAX_DONE / 2);
  }, 240_000);

  test('срез: с какого момента и до какого часа терпения; просьба врача — в упакованном срезе', () => {
    const weak = city.staff.map(m => (therapist(m) ? { ...m, skill: 1 } : m));
    const s = flowShift(2, { staff: weak });
    const rooms = new Map(city.hospital.rooms.map((r, i) => [r.id, i]));
    const team = new Map(weak.map((m, i) => [m.id, i]));
    const handles = new Handles();
    let asked = 0;
    let limited = 0;
    while (s.t < 14 * 3600) {
      apply(db, s, { kind: 'advance', seconds: 120 });
      const slice = sliceOf(s);
      const back = peopleOf(packSlice(s, slice, 0, handles, rooms, team).buf);
      slice.people.forEach((p, i) => {
        const q = s.patients[p.id];
        expect(p.since!).toBeLessThanOrEqual(s.t);
        expect(p.since!).toBeGreaterThanOrEqual(q.arriveT);
        expect(back[i].since).toBe(p.since!);
        if (p.limit !== undefined) {
          limited++;
          expect(q.status === 'waiting' && q.by === undefined).toBe(true);
          // терпение — с того, как сел в зале ожидания (spec 2026-10-walk)
          const last = s.journeys!.of[p.id].steps.at(-1)!;
          expect(p.limit).toBe((last.k === 'queue' && last.sat !== undefined ? last.sat : p.since!) + q.patience);
          expect(back[i].limit).toBe(p.limit);
        } else expect(back[i].limit).toBe(-1);
        if (p.asks) {
          asked++;
          expect(back[i].ask).toEqual({ at: p.asks.at, until: p.asks.until });
        } else expect(back[i].ask).toBeUndefined();
      });
    }
    expect(limited).toBeGreaterThan(10);
    expect(asked).toBeGreaterThan(0);
  }, 120_000);

  test('ждёт обследования, только когда у кабинета очередь; нет очереди — идёт туда сразу', () => {
    const s = flowShift(1, { l: bench, flow: { perHour: 12, ambulancePerHour: 2 } });
    let queue = 0;
    let walk = 0;
    while (s.t < 16 * 3600) {
      apply(db, s, { kind: 'advance', seconds: 60 });
      for (const p of sliceOf(s).people) {
        const q = s.patients[p.id];
        // привезённый скорой лежит в смотровой и на обследованиях: каталок ещё нет (spec 2026-10-flow-ui, «Чего в части нет»)
        if (q.kind === 'ambulance') continue;
        // от врача — на время приёма; отпущенный ждать результатов — на следующее (с ходьбой в движке, spec 2026-10-walk,
        // врач чаще отпускает его и зовёт другого)
        let end: number | undefined;
        if (q.status === 'inRoom' && q.out && q.out.until > s.t) end = q.out.until;
        else if (q.status === 'away') {
          const next = q.pending.filter(y => y.room && y.start !== undefined && y.start > s.t).sort((u, v) => u.start! - v.start!)[0];
          if (next && !q.pending.some(y => y.start !== undefined && s.t >= y.start && s.t < (y.end ?? y.readyAt))) end = next.end ?? next.readyAt;
        }
        if (end === undefined) continue;
        const x = [...s.journeys!.of[p.id].steps].reverse().find(y => y.k === 'exam' && y.end === end) as Extract<Step, { k: 'exam' }> | undefined;
        if (!x) continue;
        const waits = x.start > x.at && s.t < x.start;
        expect(p.doing).toBe(waits ? 'examQueue' : 'exam');
        if (waits) queue++;
        else walk++;
      }
    }
    expect(queue).toBeGreaterThan(0);
    expect(walk).toBeGreaterThan(0);
  }, 120_000);
});
