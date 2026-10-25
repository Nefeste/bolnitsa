// «Главврач утверждает» (spec docs/specs/2026-10-two-ways.md, часть 2: F3 и «Ещё обследование» F2): галочки «О чём
// спрашивать главврача»; решение нанятого врача ждёт ответа у двери кабинета, а врач зовёт следующего; ответы — «Согласен»,
// «Взять», «Направить к …», «Ещё обследование»; молчание до срока — решение врача в силе, и исход тот же; выписка — через
// утверждение на утреннем обходе. По умолчанию — «не уверен» и «долгий случай», как прежде.
import { describe, expect, test } from 'bun:test';
import type { Id } from '../../src/content/types';
import { approveFor, asksOf, BELOW, DEFAULT_ASKS } from '../../src/engine/shift/approve';
import { apply, candidatesOf, examsHere, newFlowShift } from '../../src/engine/shift/engine';
import { sliceOf } from '../../src/engine/shift/slice';
import { type AskRule, DAY, type Notice, type ShiftPatient, type ShiftState } from '../../src/engine/shift/types';
import { generatePatient } from '../../src/engine/med/generate';
import { complaintObservations, examFits } from '../../src/engine/med/exams';
import { contextOf, posterior } from '../../src/engine/med/infer';
import { verdictOf } from '../../src/engine/med/plan';
import { hospitalOf } from '../../src/engine/hospital/site';
import { siteOfPreset } from '../../src/engine/hospital/site-preset';
import { presetStaff } from '../../src/engine/hospital/staff';
import { groupsOf } from '../../src/engine/shift/consult';
import { buildDb } from '../content/load';
import { hospitalFor } from '../bench/hospital';
import { FLOW } from './site-kit';
import { hash } from './scenario';

const { db } = buildDb();
const wait = db.consults!.wait * 60;
const layout = hospitalFor(db, 6, 100, { emergency: true });
const flow = { perHour: 12, ambulancePerHour: 2 };
const start = (seed: number, rules?: AskRule[]): ShiftState => {
  const s = newFlowShift(db, { seed, season: 'winter', hospital: layout.hospital, staff: layout.staff, flow });
  if (rules) apply(db, s, { kind: 'asks', rules });
  return s;
};

type Ap = Extract<Notice, { kind: 'approve' }>;
/** Жить минутами до решения на утверждении; нет его до `hour` — undefined. */
function untilApprove(s: ShiftState, hour = 20, which: (n: Ap) => boolean = () => true): Ap | undefined {
  const end = (s.day - 1) * DAY + hour * 3600;
  while (s.t < end) {
    const n = apply(db, s, { kind: 'advance', seconds: 60 }).find((x): x is Ap => x.kind === 'approve' && which(x));
    if (n) return n;
  }
  return undefined;
}

/** Закрытый приём: в состоянии или в картах ушедших. */
const closedOf = (s: ShiftState, id: string) => s.patients[id]?.closed ?? s.past?.find(x => x.p.id === id)?.p.closed;
const bare = (s: ShiftState) => hash({ ...s, journal: [] });
const roomOf = (s: ShiftState, by: string) => s.staff!.find(m => m.id === by)!.room!;
const lastStep = (s: ShiftState, id: string) => s.journeys!.of[id].steps.at(-1)!;

describe('галочки «О чём спрашивать главврача»', () => {
  test('по умолчанию — «не уверен» и «долгий случай», как прежде; поля нет; порядок — как в настройке', () => {
    const s = start(5);
    expect(s.meta.asks).toBeUndefined();
    expect(asksOf(s)).toEqual(DEFAULT_ASKS);
    apply(db, s, { kind: 'asks', rules: ['every', 'unsure'] });
    expect(s.meta.asks).toEqual(['unsure', 'every']);
    apply(db, s, { kind: 'asks', rules: ['long', 'unsure'] });
    expect(s.meta.asks).toBeUndefined();
    // «ни о чём» — пустой список, не умолчание
    apply(db, s, { kind: 'asks', rules: [] });
    expect(s.meta.asks).toEqual([]);
  });

  test('правило: каждое решение; ниже 90 % — по уверенности в группе диагноза; госпитализация; назначил главврач', () => {
    const departments = ['dept.therapy', 'dept.surgery'];
    const candidates = candidatesOf(db, departments);
    let low = 0;
    let high = 0;
    for (let seed = 1; seed <= 120; seed++) {
      const patient = generatePatient(db, seed, { department: 'dept.therapy', departments, season: 'winter', walkIn: true });
      const obs = complaintObservations(patient);
      const dx = posterior(db, candidates, obs, contextOf(db, patient, obs))[0].id;
      const p1 = groupsOf(db, dx, posterior(db, candidates, obs, contextOf(db, patient, obs))).p1;
      const x = { dx, setting: 'home' as const, candidates, obs, patient, minutes: 20 };
      expect(approveFor(db, { ...x, rules: ['unsure', 'long'], chief: false })).toBeUndefined();
      expect(approveFor(db, { ...x, rules: ['every'], chief: false })?.why).toEqual(['every']);
      expect(approveFor(db, { ...x, rules: [], chief: true })?.why).toEqual(['exam']);
      expect(approveFor(db, { ...x, rules: ['admit'], chief: false })).toBeUndefined();
      expect(approveFor(db, { ...x, setting: 'admit', rules: ['admit'], chief: false })?.why).toEqual(['admit']);
      const below = approveFor(db, { ...x, rules: ['below90'], chief: false });
      if (p1 < BELOW) {
        low++;
        expect(below?.why).toEqual(['below90']);
        expect(below?.lead[0]).toEqual({ id: dx, p: p1 });
      } else {
        high++;
        expect(below).toBeUndefined();
      }
    }
    // по одним жалобам уверенных мало, но они есть
    expect(low).toBeGreaterThan(50);
    expect(high).toBeGreaterThan(0);
  });

  test('срок на лечение или место идёт — решать некогда, врач не ждёт утверждения', () => {
    const departments = ['dept.therapy', 'dept.surgery'];
    const candidates = candidatesOf(db, departments);
    const patient = generatePatient(db, 3, { department: 'dept.therapy', departments, season: 'winter', walkIn: true });
    const obs = [...complaintObservations(patient), { f: 'ecg.st_elevation', shown: true, exam: 'exam.ecg' }];
    const dx = posterior(db, candidates, obs, contextOf(db, patient, obs))[0].id;
    expect(approveFor(db, { rules: ['every'], chief: true, dx, setting: 'admit', candidates, obs, patient, minutes: 20 })).toBeUndefined();
  });
});

describe('решение — на утверждение', () => {
  test('больной ждёт у двери кабинета, терпение не тратится; врач свободен и зовёт следующего; в срезе и пути', () => {
    const s = start(31, ['every']);
    const n = untilApprove(s)!;
    expect(n).toBeDefined();
    const p = s.patients[n.id];
    const a = p.approve!;
    expect(a.by).toBe(n.by);
    expect(a.until - a.at).toBe(wait);
    expect(a.why).toContain('every');
    expect(a.lead![0].id).toBe(a.plan!.diagnosis);
    expect(p.status).toBe('waiting');
    expect(p.closed).toBeUndefined();
    expect(s.queue).not.toContain(p.id);
    if (!p.bay) expect(p.next).toBe(roomOf(s, n.by));
    // терпение не тратится: проверки терпения на это ожидание нет
    expect(s.events.some(e => e.event.kind === 'patience' && e.event.id === p.id && e.event.wait === p.wait)).toBe(false);
    // врач дописывает план и свободен
    expect(s.desk?.[n.by]).toBeGreaterThan(s.t);
    expect(Object.values(s.patients).some(q => q.status === 'inRoom' && q.by === n.by)).toBe(false);
    expect(s.summary.chief).toEqual({ asked: 1, agreed: 0, silent: 0, changed: 0 });
    expect(sliceOf(s).people.find(x => x.id === p.id)!.approve).toEqual({ at: a.at, until: a.until });
    expect(lastStep(s, p.id)).toEqual({ t: a.at, k: 'approve', by: n.by, until: a.until });
    // свой срок — одним событием
    expect(s.events.filter(e => e.event.kind === 'approve' && e.event.id === p.id).map(e => e.t)).toEqual([a.until]);
    // через пять минут врач принимает другого, а этот всё ждёт у двери
    const t = s.t;
    while (s.t < t + 5 * 60) apply(db, s, { kind: 'advance', seconds: 60 });
    expect(p.status).toBe('waiting');
    expect(p.approve).toBe(a);
  }, 60_000);

  test('молчание до срока — решение врача в силе, и исход тот же, что без утверждения', () => {
    const b = start(31, ['every']);
    const n = untilApprove(b)!;
    const a = b.patients[n.id].approve!;
    while (b.t < a.until) apply(db, b, { kind: 'advance', seconds: 60 });
    const silent = closedOf(b, n.id)!;
    expect(silent).toBeDefined();
    expect(b.patients[n.id]?.approve).toBeUndefined();
    // за эти полчаса пришли и другие решения; молчали — о каждом, чей срок вышел
    expect(b.summary.chief!.silent).toBeGreaterThanOrEqual(1);
    expect(b.summary.chief!.agreed + b.summary.chief!.changed).toBe(0);
    expect(b.journeys!.of[n.id].end?.chief).toBe('silent');
    // та же смена без утверждений: тот же больной закрыт тем же врачом в минуту решения — тем же планом и с тем же исходом
    const s = start(31);
    while (!closedOf(s, n.id)) apply(db, s, { kind: 'advance', seconds: 60 });
    const plain = closedOf(s, n.id)!;
    expect(plain.at).toBeLessThanOrEqual(a.at + 60);
    const pick = (c: typeof plain) => ({ by: c.by, diagnosis: c.diagnosis, plan: c.plan, verdict: c.verdict, outcome: c.outcome, grades: c.grades, notes: c.notes });
    expect(pick(silent)).toEqual(pick(plain));
    expect(silent.at).toBe(a.until);
  }, 120_000);

  test('«Согласен» — сразу; без решения или чужое — ничего не меняет', () => {
    const s = start(31, ['every']);
    const n = untilApprove(s)!;
    const other = Object.values(s.patients).find(q => !q.approve)!;
    const before = bare(s);
    apply(db, s, { kind: 'approve', id: other.id, answer: 'agree' });
    apply(db, s, { kind: 'approve', id: 'nobody', answer: 'agree' });
    apply(db, s, { kind: 'approve', id: n.id, answer: 'stay' });
    apply(db, s, { kind: 'approve', id: n.id, answer: 'refer', to: n.by });
    expect(bare(s)).toBe(before);
    const plan = s.patients[n.id].approve!.plan!;
    apply(db, s, { kind: 'approve', id: n.id, answer: 'agree' });
    const c = closedOf(s, n.id)!;
    expect({ diagnosis: c.diagnosis, treatments: c.plan.treatments.filter(tx => plan.treatments.includes(tx)) }).toEqual({ diagnosis: plan.diagnosis, treatments: plan.treatments });
    expect(s.summary.chief).toMatchObject({ asked: 1, agreed: 1 });
    expect(s.events.some(e => e.event.kind === 'approve' && e.event.id === n.id)).toBe(false);
    expect(s.journeys!.of[n.id].end?.chief).toBe('agreed');
  }, 60_000);

  test('«Взять» — случай ваш; «Направить к …» — другой врач позовёт его первым и рассудит заново', () => {
    const s = start(31, ['every']);
    const n = untilApprove(s)!;
    apply(db, s, { kind: 'approve', id: n.id, answer: 'take' });
    const p = s.patients[n.id];
    expect(p.approve).toBeUndefined();
    expect(p.by).toBeUndefined();
    expect(p.from).toBe(n.by);
    expect(s.current).toBe(n.id);
    expect(s.summary.chief).toMatchObject({ asked: 1, changed: 1 });
    const m = untilApprove(s, 20, x => x.id !== n.id)!;
    const other = s.staff!.find(x => x.role === 'role.therapist' && x.id !== m.by)!;
    apply(db, s, { kind: 'approve', id: m.id, answer: 'refer', to: other.id });
    const q = s.patients[m.id];
    expect(q.approve).toBeUndefined();
    expect(q.by).toBe(other.id);
    expect(q.phase).toEqual({});
    expect(q.status).toBe('waiting');
    expect(lastStep(s, m.id)).toMatchObject({ k: 'own', by: other.id, refer: true });
    // позвал и решил другой врач
    while (!closedOf(s, m.id) && !s.patients[m.id]?.approve) apply(db, s, { kind: 'advance', seconds: 60 });
    expect((closedOf(s, m.id) ?? s.patients[m.id].approve)!.by).toBe(other.id);
  }, 120_000);
});

describe('итог главврача: изменённое решение — к лучшему или к худшему (spec docs/specs/2026-10-two-ways.md, F5)', () => {
  test('«Взять» неверное и поставить правду — к лучшему; «Взять» верное и ошибиться — к худшему; согласие — не в счёт', () => {
    const s = start(31, ['every']);
    /** Вы решаете взятый случай: дождаться больного в кабинете, поставить диагноз, завершить. */
    const decide = (id: string, dx: Id) => {
      while (s.meet !== undefined) apply(db, s, { kind: 'advance', seconds: 15 });
      expect(s.current).toBe(id);
      apply(db, s, { kind: 'diagnose', id: dx });
      apply(db, s, { kind: 'finish' });
    };
    const verdict = (n: Ap) => s.patients[n.id].approve?.verdict;
    const a = untilApprove(s, 20, x => verdict(x) === 'wrong')!;
    apply(db, s, { kind: 'approve', id: a.id, answer: 'take' });
    decide(a.id, s.patients[a.id].patient.truth.conditions[0].id);
    expect(s.patients[a.id].closed?.verdict).toBe('correct');
    expect(s.summary.chief).toMatchObject({ changed: 1, better: 1 });
    expect(s.summary.chief?.worse).toBeUndefined();
    expect(s.patients[a.id].chiefFrom).toBeUndefined();
    // согласие — не изменение: ни к лучшему, ни к худшему
    const b = untilApprove(s)!;
    apply(db, s, { kind: 'approve', id: b.id, answer: 'agree' });
    expect(s.summary.chief).toMatchObject({ agreed: 1, changed: 1, better: 1 });
    // верное решение взяли и поставили неверный диагноз — к худшему
    const c = untilApprove(s, 20, x => verdict(x) === 'correct' && s.current === undefined)!;
    apply(db, s, { kind: 'approve', id: c.id, answer: 'take' });
    const p = s.patients[c.id];
    const off = candidatesOf(db, p.departments ?? s.meta.department).find(id => verdictOf(db, id, p.patient) === 'wrong')!;
    decide(c.id, off);
    expect(p.closed?.verdict).toBe('wrong');
    expect(s.summary.chief).toMatchObject({ changed: 2, better: 1, worse: 1 });
  }, 120_000);
});

describe('«Ещё обследование» — назначает главврач, делает врач', () => {
  /** Обследование, которое здесь можно, больному подходит и ещё не сделано: снимок грудной клетки, а сделан — любое, кроме вопроса. */
  const extra = (s: ShiftState, p: ShiftPatient): Id => ['exam.xray_chest', ...examsHere(db, s)].find(id => db.exams[id].kind !== 'ask' && !p.done.includes(id) && examFits(db.exams[id], p.patient))!;

  test('у двери с решением: врач зовёт его первым, делает назначенное и решает снова — снова к главврачу', () => {
    const s = start(31, ['every']);
    const n = untilApprove(s)!;
    const p = s.patients[n.id];
    const exam = extra(s, p);
    // нельзя здесь, уже сделано, нет такого — ничего
    const before = bare(s);
    apply(db, s, { kind: 'order', id: n.id, exam: p.done[0] });
    apply(db, s, { kind: 'order', id: n.id, exam: 'exam.nothing' });
    apply(db, s, { kind: 'order', id: 'nobody', exam });
    expect(bare(s)).toBe(before);
    apply(db, s, { kind: 'order', id: n.id, exam });
    expect(p.approve).toBeUndefined();
    expect(p.orders).toEqual([exam]);
    expect(p.chief).toBe(true);
    expect(p.status).toBe('waiting');
    expect(p.by).toBe(n.by);
    expect(s.summary.chief).toMatchObject({ asked: 1, changed: 1 });
    expect(lastStep(s, p.id)).toMatchObject({ k: 'own', by: n.by });
    // тот же врач делает назначенное первым
    while (!p.done.includes(exam)) apply(db, s, { kind: 'advance', seconds: 60 });
    expect(p.orders).toBeUndefined();
    expect(p.by).toBe(n.by);
    // в пути: на снимок его отправил врач, а назначил главврач
    expect(exam).toBe('exam.xray_chest');
    expect(s.journeys!.of[p.id].steps.find(x => x.k === 'exam' && x.exam === exam)).toMatchObject({ chief: true });
    // решил с результатом — снова к главврачу: «назначил главврач»
    expect(untilApprove(s, 22, x => x.id === p.id)).toBeDefined();
    expect(s.patients[p.id].approve!.why).toEqual(['exam', 'every']);
    expect(s.patients[p.id].chief).toBeUndefined();
  }, 120_000);

  test('у врача на приёме: назначит, когда кончит начатое, не дожидаясь прежних результатов', () => {
    const s = start(41);
    let p: ShiftPatient | undefined;
    for (let i = 0; i < 10 * 60 && !p; i++) {
      apply(db, s, { kind: 'advance', seconds: 60 });
      p = Object.values(s.patients).find(x => x.by && x.status === 'inRoom' && x.pending.length > 0 && !x.closed
        && s.events.some(e => e.event.kind === 'colleague' && e.event.id === x.id && e.t > s.t + 5 * 60));
    }
    expect(p).toBeDefined();
    const exam = extra(s, p!);
    const busy = Math.max(s.t, ...p!.results.map(r => r.at));
    apply(db, s, { kind: 'order', id: p!.id, exam });
    expect(s.events.filter(e => e.event.kind === 'colleague' && e.event.id === p!.id).map(e => e.t)).toEqual([busy]);
    expect(p!.phase).toEqual({});
    while (s.t <= busy) apply(db, s, { kind: 'advance', seconds: 60 });
    expect(p!.done).toContain(exam);
    expect(p!.orders).toBeUndefined();
  }, 60_000);
});

describe('выписка — через утверждение', () => {
  const rec = db.presets['preset.city'];
  const hospital = hospitalOf(db, siteOfPreset(db, rec));
  const staff = presetStaff(db, rec);

  test('утром врач спрашивает; «Ещё сутки» — лежит, назавтра спросит снова; молчание — выписан к сроку', () => {
    const s = newFlowShift(db, { seed: 11, season: 'winter', hospital, staff, flow: FLOW });
    apply(db, s, { kind: 'asks', rules: ['unsure', 'long', 'discharge'] });
    let p: ShiftPatient | undefined;
    for (let i = 0; i < 16 * 60 && !p; i++) {
      apply(db, s, { kind: 'advance', seconds: 60 });
      p = Object.values(s.patients).find(x => x.status === 'admitted' && !!x.stay && !!x.closed?.by && !x.stay.op);
    }
    expect(p).toBeDefined();
    // болезнь пройдёт к первому же обходу
    delete p!.stay!.reaction;
    p!.stay!.readyAfter = 1;
    const asked = untilApprove(s, 24 + 12, x => x.id === p!.id)!;
    expect(asked).toBeDefined();
    expect(p!.approve).toMatchObject({ by: p!.closed!.by, why: ['discharge'] });
    expect(p!.approve!.plan).toBeUndefined();
    expect(p!.status).toBe('admitted');
    // другие лежащие «можно выписывать» — тоже спрашивают
    expect(s.summary.chief!.discharges).toBe(s.summary.chief!.asked);
    apply(db, s, { kind: 'approve', id: p!.id, answer: 'stay' });
    expect(p!.approve).toBeUndefined();
    expect(p!.status).toBe('admitted');
    expect(s.summary.chief).toMatchObject({ changed: 1 });
    // назавтра — снова; не ответили — выписан к сроку
    const again = untilApprove(s, 48 + 12, x => x.id === p!.id)!;
    expect(again).toBeDefined();
    const until = p!.approve!.until;
    while (s.t < until) apply(db, s, { kind: 'advance', seconds: 60 });
    expect(p!.approve).toBeUndefined();
    expect(p!.status).toBe('done');
    expect(p!.closed!.stay?.end).toBe('discharged');
    expect(s.summary.chief!.silent).toBeGreaterThanOrEqual(1);
  }, 240_000);
});

describe('«ни о чём» и «не уверен» снят', () => {
  test('за день — ни просьбы, ни решения на утверждении; приёмы закрываются', () => {
    const s = start(31, []);
    let n = 0;
    while (s.t < 14 * 3600) for (const x of apply(db, s, { kind: 'advance', seconds: 60 })) if (x.kind === 'consult' || x.kind === 'approve') n++;
    expect(n).toBe(0);
    expect(s.consults).toBeUndefined();
    expect(Object.values(s.summary.colleagues ?? {}).reduce((a, c) => a + c.seen, 0)).toBeGreaterThan(10);
  }, 120_000);
});
