// «Просят посмотреть» (spec docs/specs/2026-10-consults.md): нанятый врач в потоке для ПК после своих обследований не
// уверен — и зовёт игрока. Правило — по уверенности вывода и навыку; ответы — посмотреть самому, пусть решает сам,
// направить к другому врачу; без ответа за `wait` минут врач решает сам. Детерминизм — тот же хэш при любом шаге времени
// и в потоке расчёта; смены «Анамнеза» — как были.
import { describe, expect, test } from 'bun:test';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Id } from '../../src/content/types';
import { askFor, askWhy } from '../../src/engine/shift/consult';
import { apply, candidatesOf, newFlowShift, newSingle, reviewedCase, SANDBOX_VENUE } from '../../src/engine/shift/engine';
import { sliceOf } from '../../src/engine/shift/slice';
import { DAY, type Notice, type ShiftState } from '../../src/engine/shift/types';
import { generatePatient } from '../../src/engine/med/generate';
import { complaintObservations } from '../../src/engine/med/exams';
import { contextOf, posterior } from '../../src/engine/med/infer';
import { decisionLimit } from '../../src/engine/med/policy';
import type { StaffMember } from '../../src/engine/hospital/staff';
import { createSim } from '../../src/sim/host';
import { buildDb, CONTENT_DIR } from '../content/load';
import { hospitalFor } from '../bench/hospital';
import { hash, liveUntil } from './scenario';

const { db } = buildDb();
const consults = db.consults!;
const layout = hospitalFor(db, 6, 100, { emergency: true });
const flow = { perHour: 12, ambulancePerHour: 2 };

/** Терапевты больницы — навыков по кругу. */
const withSkills = (skills: readonly number[]): StaffMember[] => {
  let k = 0;
  return layout.staff.map(m => (m.role === 'role.therapist' ? { ...m, skill: skills[k++ % skills.length] } : m));
};
const start = (seed: number, skills: readonly number[] = [1, 2, 3, 4, 5]): ShiftState =>
  newFlowShift(db, { seed, season: 'winter', hospital: layout.hospital, staff: withSkills(skills), flow });

type Ask = Extract<Notice, { kind: 'consult' }>;
/** Жить минутами до первой просьбы; её нет до `hour` — undefined. */
function untilAsk(s: ShiftState, hour = 20): Ask | undefined {
  const end = (s.day - 1) * DAY + hour * 3600;
  while (s.t < end) {
    const n = apply(db, s, { kind: 'advance', seconds: 60 }).find((x): x is Ask => x.kind === 'consult');
    if (n) return n;
  }
  return undefined;
}

/** Приём закрыт нанятым врачом: строка журнала или (лежит, ждут обратно) пациент в состоянии. */
const closedBy = (s: ShiftState, id: string) => s.gone?.find(r => r.id === id) ?? (s.patients[id]?.closed ? { by: s.patients[id].closed!.by, diagnosis: s.patients[id].closed!.diagnosis } : undefined);
const stepOf = (s: ShiftState, id: string) => s.events.filter(e => e.event.kind === 'colleague' && e.event.id === id);
/** Состояние без журнала команд: недопустимая команда ничего не меняет, но пишется в журнал. */
const bare = (s: ShiftState) => hash({ ...s, journal: [] });

/** Уверенности: болезнь `dx` — `p`, остальное поровну на `rest` болезней других групп. */
function beliefs(dx: Id, p: number, rest: Id[]): { id: Id; p: number }[] {
  return [{ id: dx, p }, ...rest.map(id => ({ id, p: (1 - p) / rest.length }))].sort((a, b) => b.p - a.p || (a.id < b.id ? -1 : 1));
}
const loners = Object.values(db.conditions).filter(c => c.presenting && !c.group).map(c => c.id).sort();

describe('«Просят посмотреть»: правило', () => {
  test('порог по навыку: ниже — просит, выше — нет; слабый просит там, где сильный решает сам', () => {
    const dx = 'cond.influenza';
    const rest = loners.filter(id => id !== dx).slice(0, 20);
    for (let k = 1; k <= 5; k++) {
      const t = consults.unsure[k - 1] / 100;
      expect(askWhy(db, k, dx, beliefs(dx, t - 0.01, rest))?.why).toEqual(['unsure']);
      expect(askWhy(db, k, dx, beliefs(dx, t + 0.01, rest))).toBeUndefined();
    }
    // между порогами навыка 5 и навыка 1 — просит только слабый
    const mid = (consults.unsure[0] + consults.unsure[4]) / 200;
    expect(askWhy(db, 1, dx, beliefs(dx, mid, rest))).toBeDefined();
    expect(askWhy(db, 5, dx, beliefs(dx, mid, rest))).toBeUndefined();
    // уверенный — не просит никто
    for (let k = 1; k <= 5; k++) expect(askWhy(db, k, dx, beliefs(dx, 0.95, rest))).toBeUndefined();
  });

  test('болезни одной группы — одна гипотеза; две группы рядом — просит и сильный', () => {
    // ОРВИ, COVID-19 и бронхит лечат одинаково: уверенность — во всей группе
    const viral = ['cond.arvi', 'cond.covid19', 'cond.acute_bronchitis'];
    expect(new Set(viral.map(id => db.conditions[id].group)).size).toBe(1);
    const spread = loners.filter(id => id !== 'cond.influenza').slice(0, 20);
    const group = [{ id: 'cond.arvi', p: 0.4 }, { id: 'cond.covid19', p: 0.25 }, { id: 'cond.acute_bronchitis', p: 0.2 }, ...spread.map(id => ({ id, p: 0.15 / spread.length }))];
    for (let k = 1; k <= 5; k++) expect(askWhy(db, k, 'cond.covid19', group)).toBeUndefined();
    // грипп против группы ОРВИ: уверенность в гриппе выше порога навыка 5, а группа рядом — «две гипотезы рядом»
    const p1 = consults.unsure[4] / 100 + 0.02;
    const p2 = (p1 * consults.close) / 100 + 0.01;
    const torn = [{ id: 'cond.influenza', p: p1 }, { id: 'cond.arvi', p: p2 * 0.7 }, { id: 'cond.covid19', p: p2 * 0.3 }, ...spread.map(id => ({ id, p: (1 - p1 - p2) / spread.length }))]
      .sort((a, b) => b.p - a.p);
    const ask = askWhy(db, 5, 'cond.influenza', torn);
    expect(ask?.why).toEqual(['close']);
    expect(ask?.lead.map(b => b.id)).toEqual(['cond.influenza', 'cond.arvi']);
    expect(ask?.lead[1].p).toBeCloseTo(p2, 9);
  });

  test('уверенность в диагнозе, посчитанная шагом врача, — тот же ответ без вывода', () => {
    const departments = ['dept.therapy', 'dept.surgery'];
    const candidates = candidatesOf(db, departments);
    let asked = 0;
    for (let seed = 1; seed <= 150; seed++) {
      const patient = generatePatient(db, seed, { department: 'dept.therapy', departments, season: 'winter', walkIn: true });
      const obs = complaintObservations(patient);
      const top = posterior(db, candidates, obs, contextOf(db, patient, obs))[0];
      for (let skill = 1; skill <= 5; skill++) {
        const full = askFor(db, { skill, dx: top.id, candidates, obs, patient, minutes: 20 });
        expect(askFor(db, { skill, dx: top.id, confidence: top.p, candidates, obs, patient, minutes: 20 })).toEqual(full);
        if (full) asked++;
      }
    }
    expect(asked).toBeGreaterThan(50);
  });

  test('срок на лечение или место идёт — решать некогда, не просит', () => {
    const departments = ['dept.therapy', 'dept.surgery'];
    const candidates = candidatesOf(db, departments);
    // больной, о котором по одним жалобам навык 1 попросил бы
    let found: { patient: ReturnType<typeof generatePatient>; dx: Id } | undefined;
    for (let seed = 1; seed < 200 && !found; seed++) {
      const patient = generatePatient(db, seed, { department: 'dept.therapy', departments, season: 'winter', walkIn: true });
      const obs = complaintObservations(patient);
      const dx = posterior(db, candidates, obs, contextOf(db, patient, obs))[0].id;
      if (askFor(db, { skill: 1, dx, candidates, obs, patient, minutes: 20 })) found = { patient, dx };
    }
    expect(found).toBeDefined();
    const { patient, dx } = found!;
    // ЭКГ показала подъём ST: тромболизис — в первые 10 минут
    const obs = [...complaintObservations(patient), { f: 'ecg.st_elevation', shown: true, exam: 'exam.ecg' }];
    expect(decisionLimit(db, obs, patient.complaints, 20, () => 0, patient)).toBeDefined();
    expect(askFor(db, { skill: 1, dx, candidates, obs, patient, minutes: 20 })).toBeUndefined();
  });
});

describe('«Просят посмотреть» в потоке для ПК', () => {
  test('врач просит: больной ждёт у него, извещение, просьба — в состоянии и в срезе', () => {
    const s = start(31, [1]);
    const n = untilAsk(s)!;
    expect(n).toBeDefined();
    const c = s.consults!.find(x => x.id === n.id)!;
    expect(c.by).toBe(n.by);
    expect(c.until - c.at).toBe(consults.wait * 60);
    expect(c.why.length).toBeGreaterThan(0);
    expect(c.lead[0].p).toBeLessThan(1);
    const p = s.patients[n.id];
    expect(p.status).toBe('inRoom');
    expect(p.by).toBe(n.by);
    expect(p.asked).toBe(true);
    expect(p.closed).toBeUndefined();
    // его шаг решения — к сроку ответа
    expect(stepOf(s, n.id).map(e => e.t)).toEqual([c.until]);
    // врач занят им: других больных у него в кабинете нет
    expect(Object.values(s.patients).filter(q => q.status === 'inRoom' && q.by === n.by).map(q => q.id)).toEqual([n.id]);
    expect(s.summary.colleagues?.[n.by]?.asked).toBe(1);
    const person = sliceOf(s).people.find(x => x.id === n.id)!;
    expect(person.asks).toEqual({ at: c.at, until: c.until, why: c.why, lead: c.lead });
    expect(sliceOf(s).people.filter(x => x.asks).length).toBe(s.consults!.length);
  }, 60_000);

  test('не ответили — к сроку продолжает сам: вопросы перед лечением и решение тем диагнозом, что выбрал', () => {
    const s = start(31, [1]);
    const n = untilAsk(s)!;
    const c = s.consults!.find(x => x.id === n.id)!;
    liveUntil(db, s, (c.until - 60) / 3600);
    expect(s.consults?.some(x => x.id === n.id)).toBe(true);
    expect(closedBy(s, n.id)).toBeUndefined();
    apply(db, s, { kind: 'advance', seconds: c.until - s.t });
    expect(s.consults?.some(x => x.id === n.id) ?? false).toBe(false);
    // решил сразу или спрашивает перед лечением — следующий шаг уже назначен
    expect(closedBy(s, n.id) !== undefined || stepOf(s, n.id).length === 1).toBe(true);
    liveUntil(db, s, (c.until + 3600) / 3600);
    expect(closedBy(s, n.id)).toMatchObject({ by: n.by, diagnosis: c.lead[0].id });
  }, 60_000);

  test('«Посмотреть» — больной ваш, как «Забрать»: оценка и разбор — как у ваших приёмов', () => {
    const s = start(31, [1]);
    const n = untilAsk(s)!;
    const c = s.consults!.find(x => x.id === n.id)!;
    expect(s.current).toBeUndefined();
    apply(db, s, { kind: 'consult', id: n.id, answer: 'look' });
    const p = s.patients[n.id];
    expect(s.current).toBe(n.id);
    expect(p.by).toBeUndefined();
    expect(p.from).toBe(n.by);
    expect(s.consults?.some(x => x.id === n.id) ?? false).toBe(false);
    expect(stepOf(s, n.id)).toEqual([]);
    expect(s.summary.colleagues?.[n.by]?.taken).toBe(1);
    // вы решаете — приём ваш: в ваших строках итогов, с оценкой и разбором, и в журнал не уходит
    apply(db, s, { kind: 'diagnose', id: c.lead[0].id });
    apply(db, s, { kind: 'finish' });
    expect(p.closed?.by).toBeUndefined();
    expect(p.closed?.from).toBe(n.by);
    expect(s.summary.seen).toBe(1);
    expect(Object.values(s.summary.grades).reduce((a, b) => a + b, 0)).toBe(1);
    expect(s.patients[n.id]).toBe(p);
    expect(reviewedCase(db, s, p)?.review).toBeUndefined();
  }, 60_000);

  test('«Забрать» больного, о котором просят, — тоже ответ', () => {
    const s = start(31, [1]);
    const n = untilAsk(s)!;
    apply(db, s, { kind: 'takeOver', id: n.id });
    expect(s.consults?.some(x => x.id === n.id) ?? false).toBe(false);
    expect(s.current).toBe(n.id);
  }, 60_000);

  test('«Пусть решает сам» — продолжает сейчас, тем диагнозом, что выбрал', () => {
    const s = start(31, [1]);
    const n = untilAsk(s)!;
    const c = s.consults!.find(x => x.id === n.id)!;
    const t = s.t;
    expect(apply(db, s, { kind: 'consult', id: n.id, answer: 'self' })).toEqual([]);
    expect(s.t).toBe(t);
    expect(s.consults?.some(x => x.id === n.id) ?? false).toBe(false);
    // шаг к сроку ответа снят: решил сейчас или спрашивает перед лечением — и следующий шаг раньше срока
    expect(closedBy(s, n.id) !== undefined || stepOf(s, n.id).length === 1).toBe(true);
    expect(stepOf(s, n.id).every(e => e.t < c.until)).toBe(true);
    liveUntil(db, s, (t + 3600) / 3600);
    expect(closedBy(s, n.id)).toMatchObject({ by: n.by, diagnosis: c.lead[0].id });
  }, 60_000);

  test('«Направить к …» — другой нанятый врач продолжит своим навыком, этот свободен; второй раз не просят', () => {
    const s = start(31, [1]);
    const n = untilAsk(s)!;
    const other = s.staff!.find(m => m.role === 'role.therapist' && m.id !== n.by)!;
    const before = bare(s);
    // к самому себе и к тому, кого нет, — нельзя
    apply(db, s, { kind: 'consult', id: n.id, answer: 'refer', to: n.by });
    apply(db, s, { kind: 'consult', id: n.id, answer: 'refer', to: 'nobody' });
    apply(db, s, { kind: 'consult', id: n.id, answer: 'refer' });
    expect(bare(s)).toBe(before);
    apply(db, s, { kind: 'consult', id: n.id, answer: 'refer', to: other.id });
    const p = s.patients[n.id];
    expect(s.consults?.some(x => x.id === n.id) ?? false).toBe(false);
    expect(p.by).toBe(other.id);
    // рассуждает заново, своим навыком
    expect(p.phase).toEqual({});
    expect(stepOf(s, n.id).every(e => e.t > s.t)).toBe(true);
    expect(s.desk?.[n.by]).toBe(s.t + 60);
    // до конца дня: решил другой врач, а о больном больше не просили
    const again: string[] = [];
    while (s.t < 20 * 3600) for (const x of apply(db, s, { kind: 'advance', seconds: 60 })) if (x.kind === 'consult') again.push(x.id);
    expect(again).not.toContain(n.id);
    expect(closedBy(s, n.id)?.by).toBe(other.id);
  }, 120_000);

  test('ответ без просьбы ничего не меняет; закрытие дня — просьбы с ним', () => {
    const s = start(31, [1]);
    const n = untilAsk(s)!;
    const other = Object.values(s.patients).find(q => !s.consults!.some(c => c.id === q.id))!;
    const before = bare(s);
    for (const answer of ['look', 'self', 'refer'] as const) apply(db, s, { kind: 'consult', id: other.id, answer, to: n.by });
    apply(db, s, { kind: 'consult', id: 'nobody', answer: 'self' });
    expect(bare(s)).toBe(before);
    apply(db, s, { kind: 'closeDay' });
    expect(s.consults).toBeUndefined();
    expect(s.events).toEqual([]);
  }, 60_000);
});

describe('«Просят посмотреть»: сколько и кто', () => {
  test('слабые врачи просят чаще сильных', () => {
    const asks = (skill: number) => {
      const s = start(32, [skill]);
      let n = 0;
      while (s.t < 20 * 3600) n += apply(db, s, { kind: 'advance', seconds: 60 }).filter(x => x.kind === 'consult').length;
      return n;
    };
    const weak = asks(1);
    const strong = asks(5);
    expect(weak).toBeGreaterThan(strong);
    expect(weak).toBeGreaterThan(0);
  }, 120_000);

  test('на потоке с навыками по весам кандидатов просит небольшая доля приёмов (цель — 5–10 %)', () => {
    // больница бенчмарка на 50 пациентов: 34 кабинета, 70 в час; навыки — по весам кандидатов вперемешку по кабинетам, как в
    // tools/bench/consults.ts: k-й терапевт — навык, в чью долю попадает дробная часть k · φ
    const big = hospitalFor(db, 34, 100, { emergency: true });
    const w = db.economy.staff.skills;
    const total = w.reduce((a, b) => a + b, 0);
    const skillAt = (x: number) => {
      let left = x * total;
      for (let i = 0; i < w.length; i++) if ((left -= w[i]) < 0) return i + 1;
      return w.length;
    };
    let k = 0;
    const staff = big.staff.map(m => (m.role === 'role.therapist' ? { ...m, skill: skillAt((++k * ((Math.sqrt(5) - 1) / 2)) % 1) } : m));
    const s = newFlowShift(db, { seed: 1, season: 'winter', hospital: big.hospital, staff, flow: { perHour: 70, ambulancePerHour: 1 } });
    liveUntil(db, s, 20);
    apply(db, s, { kind: 'closeDay' });
    const cols = Object.values(s.history[0].colleagues ?? {});
    const seen = cols.reduce((a, c) => a + c.seen, 0);
    const asked = cols.reduce((a, c) => a + (c.asked ?? 0), 0);
    expect(seen).toBeGreaterThan(300);
    expect(asked / seen).toBeGreaterThan(0.03);
    expect(asked / seen).toBeLessThan(0.12);
  }, 180_000);
});

/** Ответы на открытые просьбы — по порядку: посмотреть (вы свободны), пусть решает сам, направить к следующему врачу. */
function answers(s: ShiftState): { kind: 'consult'; id: string; answer: 'look' | 'self' | 'refer'; to?: string }[] {
  const docs = (s.staff ?? []).filter(m => m.role === 'role.therapist').map(m => m.id);
  return (s.consults ?? []).map((c, i) => {
    const kind = (i + Math.floor(c.at / 60)) % 3;
    if (kind === 0 && s.current === undefined && i === 0) return { kind: 'consult' as const, id: c.id, answer: 'look' as const };
    if (kind === 2) return { kind: 'consult' as const, id: c.id, answer: 'refer' as const, to: docs[(docs.indexOf(c.by) + 1) % docs.length] };
    return { kind: 'consult' as const, id: c.id, answer: 'self' as const };
  });
}

/** День до 20:00 шагом `step` с ответами каждые 20 минут; хэш каждый час и после закрытия дня. */
function dayWith(seed: number, step: number): { hours: string[]; closed: string; asked: number } {
  const s = start(seed, [1, 2]);
  const hours: string[] = [];
  let asked = 0;
  for (let t = 8 * 3600 + 1200; t <= 20 * 3600; t += 1200) {
    while (s.t < t) asked += apply(db, s, { kind: 'advance', seconds: Math.min(step, t - s.t) }).filter(x => x.kind === 'consult').length;
    for (const cmd of answers(s)) apply(db, s, cmd);
    if (t % 3600 === 0) hours.push(hash(s));
  }
  apply(db, s, { kind: 'closeDay' });
  return { hours, closed: hash(s), asked };
}

describe('«Просят посмотреть»: детерминизм', () => {
  test('те же зерно и ответы — тот же хэш каждый час; шаг 15 с — тот же', () => {
    const a = dayWith(33, 60);
    expect(a.asked).toBeGreaterThan(3);
    expect(dayWith(33, 60)).toEqual(a);
    expect(dayWith(33, 15)).toEqual(a);
  }, 180_000);

  test('поток расчёта: кадры ×4 с бюджетом и те же ответы — то же состояние; ни одно извещение о просьбе не теряется', () => {
    const want = dayWith(33, 60);
    const sim = createSim(db);
    const first = sim.handle({ kind: 'start', seed: 33, season: 'winter', hospital: layout.hospital, staff: withSkills([1, 2]), flow });
    expect(first.kind).toBe('slice');
    let notices = 0;
    const count = (r: ReturnType<typeof sim.handle>) => {
      if (r.kind === 'error') throw new Error(r.message);
      if (r.kind === 'slice') notices += r.notices.filter(x => x.kind === 'consult').length;
    };
    const live = () => {
      const r = sim.handle({ kind: 'save' });
      if (r.kind !== 'state') throw new Error(r.kind);
      return r.state;
    };
    // часы игры: кадры их двигают, а команда с ценой (дойти до больного) — ещё и на свою цену, как в карте пациента
    let game = 8 * 3600;
    for (let t = 8 * 3600 + 1200; t <= 20 * 3600; t += 1200) {
      // кадры ×4: 4 игровые секунды, движку — одно событие за кадр; часы отстают, команда доживает отставшее
      while (game < t) {
        const seconds = Math.min(4, t - game);
        count(sim.handle({ kind: 'tick', seconds, budgetMs: 0 }));
        game += seconds;
      }
      // часы игры — на отметке: команда сначала доживает прошедшее
      count(sim.handle({ kind: 'command', cmd: { kind: 'advance', seconds: 0 } }));
      const s = live();
      expect(s.t).toBe(game);
      for (const cmd of answers(s)) count(sim.handle({ kind: 'command', cmd }));
      game = Math.max(game, live().t);
    }
    count(sim.handle({ kind: 'command', cmd: { kind: 'closeDay' } }));
    const s = live();
    expect(hash(s)).toBe(want.closed);
    // извещений о просьбах — столько, сколько просили: и те, что пришли, пока команда доживала время
    expect(notices).toBe(Object.values(s.history[0].colleagues ?? {}).reduce((a, c) => a + (c.asked ?? 0), 0));
    expect(notices).toBe(want.asked);
  }, 300_000);
});

describe('смены «Анамнеза» — как были', () => {
  test('без потока для ПК нанятые врачи не просят: ни просьб, ни отметок, ни извещений', () => {
    const l = hospitalFor(db, 4);
    const staff = l.staff.map(m => (m.role === 'role.therapist' ? { ...m, skill: 1 } : m));
    const s = newSingle(db, { seed: 6, season: 'winter', venue: SANDBOX_VENUE, hospital: l.hospital, staff });
    const notices: Notice[] = [];
    while (s.t < 18 * 3600) notices.push(...apply(db, s, { kind: 'advance', seconds: 60 }));
    expect(Object.values(s.patients).filter(p => p.closed?.by).length).toBeGreaterThan(20);
    expect(notices.some(x => x.kind === 'consult')).toBe(false);
    expect(s.consults).toBeUndefined();
    expect(Object.values(s.patients).some(p => p.asked)).toBe(false);
    expect(Object.values(s.summary.colleagues ?? {}).some(c => c.asked !== undefined)).toBe(false);
  }, 120_000);
});

describe('пороги «Просят посмотреть» — в базе', () => {
  function broken(mutate: (dir: string) => void): string[] {
    const dir = mkdtempSync(join(tmpdir(), 'bolnitsa-consults-'));
    try {
      cpSync(CONTENT_DIR, dir, { recursive: true });
      mutate(dir);
      return buildDb(dir).errors;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  const file = (dir: string) => join(dir, 'hospital/consults.yaml');
  const edit = (dir: string, from: RegExp, to: string) => writeFileSync(file(dir), readFileSync(file(dir), 'utf8').replace(from, to));

  test('порог растёт с навыком, процент за 100, нет файла — сборка не проходит', () => {
    expect(broken(d => edit(d, /^unsure: .*$/m, 'unsure: [50, 56, 62, 68, 70]')).some(e => e.includes('hospital/consults.yaml: unsure 50, 56, 62, 68, 70 — порог растёт с навыком'))).toBe(true);
    expect(broken(d => edit(d, /^close: .*$/m, 'close: 120')).some(e => e.startsWith('hospital/consults.yaml: close'))).toBe(true);
    expect(broken(d => rmSync(file(d)))).toContain('hospital/consults.yaml: нет порогов «Просят посмотреть»');
  });

  test('настоящая база: пороги — для пяти навыков, не растут с навыком', () => {
    expect(consults.unsure).toHaveLength(5);
    expect(consults.unsure.every((x, i) => i === 0 || x <= consults.unsure[i - 1])).toBe(true);
    expect(consults.wait).toBeGreaterThan(0);
  });
});
