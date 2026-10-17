// Режим врача (spec docs/specs/2026-10-doctor-mode.md, «Тесты»): «Мой кабинет» командой стройки; что значит «Взять случай»
// для каждого состояния больного; вид карты — без правды о больном; приём целиком через поток расчёта — то же состояние
// при любом шаге часов; уровни медицины меняют подсказки; раскладка осмотра и бланка покрывает базу.
import { describe, expect, test } from 'bun:test';
import { db } from '../../src/content';
import { generatePatient } from '../../src/engine/med/generate';
import { doctorRoom } from '../../src/engine/hospital/requirements';
import { demolish, hospitalOf, setOffice } from '../../src/engine/hospital/site';
import { siteOfPreset } from '../../src/engine/hospital/site-preset';
import { presetStaff } from '../../src/engine/hospital/staff';
import { apply, colleaguesOf, hospitalCtx, newFlowShift, siteOpen } from '../../src/engine/shift/engine';
import { sliceOf } from '../../src/engine/shift/slice';
import type { Command, Notice, ShiftState } from '../../src/engine/shift/types';
import { setLang } from '../../src/i18n';
import { examsByAction, useDb } from '../../src/sim/caseView';
import { type CardView, cardView, type DoctorState, doctorState, officeOf, takeCommand } from '../../src/sim/doctor';
import { createSim } from '../../src/sim/host';
import type { FromSim, ToSim } from '../../src/sim/protocol';
import { EXAM_PLACES } from '../../src/ui/doctor/places';
import { IMAGING_ROOMS } from '../../src/ui/doctor/sections';
import { buildProto, emptyShift, FLOW, hash, liveTo, site } from './site-kit';

useDb(db);
setLang('ru');
const rec = db.presets['preset.city'];
const hospital = hospitalOf(db, siteOfPreset(db, rec));
const staff = presetStaff(db, rec);
/** Готовая больница 2а; зерно 11 — нанятый терапевт просит посмотреть к 09:08 (как в сценарии в браузере). */
const preset = (seed = 11) => newFlowShift(db, { seed, season: 'winter', hospital, staff, flow: FLOW });
const office = (s: ShiftState, room?: string) => site(db, s, { kind: 'office', ...(room ? { room } : {}) }, false);
const roomOf = (s: ShiftState, id: string) => s.staff?.find(m => m.id === id)?.room;

/** Жить минутами до первой просьбы. */
function untilAsk(s: ShiftState): Extract<Notice, { kind: 'consult' }> {
  for (let i = 0; i < 6 * 60; i++) {
    const n = apply(db, s, { kind: 'advance', seconds: 60 }).find(x => x.kind === 'consult');
    if (n?.kind === 'consult') return n;
  }
  throw new Error('просьбы нет');
}

describe('«Мой кабинет»', () => {
  test('в готовой больнице ваш — первый кабинет врача; «Мой» на другом — врач того кабинета встаёт в ваш прежний; отмена', () => {
    const s = preset();
    const mine = officeOf(db, s)!;
    expect(mine).toBe(hospital.site!.mine!);
    const gastro = s.staff!.find(m => m.role === 'role.gastroenterologist')!;
    const theirs = gastro.room!;
    const r = office(s, theirs);
    expect(r.ok).toBe(true);
    expect(officeOf(db, s)).toBe(theirs);
    expect(roomOf(s, gastro.id)).toBe(mine);
    // в вашем кабинете врача не зовут: его нет среди нанятых, что принимают
    expect(colleaguesOf(db, s).some(m => m.room === theirs)).toBe(false);
    // отмена стройки — как было; помещение на перестройку не закрыто
    expect(site(db, s, { kind: 'undo' }).ok).toBe(true);
    expect(officeOf(db, s)).toBe(mine);
    expect(roomOf(s, gastro.id)).toBe(theirs);
    expect(s.hospital!.site!.editing).toBeUndefined();
  });

  test('«Не принимаю» — кабинета нет, «Взять» нельзя; снова «Мой» — ваш', () => {
    const s = preset();
    const mine = officeOf(db, s)!;
    expect(office(s).ok).toBe(true);
    expect(officeOf(db, s)).toBeUndefined();
    expect(doctorRoom(hospitalCtx(db, s).plan)).toBeUndefined();
    liveTo(db, s, 9);
    const someone = Object.values(s.patients).find(p => p.status === 'waiting' || p.by);
    if (someone) expect(takeCommand(db, s, someone.id).refused).toBe('noOffice');
    expect(office(s, mine).ok).toBe(true);
    expect(officeOf(db, s)).toBe(mine);
  });

  test('«Свои больные» без вашего кабинета не ждут вас: «Не принимаю» — всех ведут нанятые врачи', () => {
    const s = preset(5);
    apply(db, s, { kind: 'mine', systems: ['airways', 'lungs', 'heart', 'digestive', 'urinary', 'metabolic', 'nerves', 'bones', 'skin', 'poisoning'] });
    liveTo(db, s, 9);
    const own = doctorState(db, s).yours.filter(r => r.why === 'own');
    expect(own.length).toBeGreaterThan(0);
    expect(office(s).ok).toBe(true);
    expect(doctorState(db, s).yours.filter(r => r.why === 'own')).toEqual([]);
    expect(own.every(r => doctorState(db, s).others.some(x => x.id === r.id) || doctorState(db, s).othersMore > 0)).toBe(true);
  });

  test('нельзя: у вас в кабинете пациент; нанятый врач того кабинета ведёт пациента; не кабинет врача', () => {
    const s = preset();
    const ask = untilAsk(s);
    const therapist = s.staff!.find(m => m.id === ask.by)!;
    // врач с просьбой ведёт больного — его кабинет не взять
    expect(office(s, therapist.room).error?.kind).toBe('busy');
    // не кабинет врача
    expect(office(s, s.hospital!.site!.rooms.find(r => r.type === 'room.reception')!.id).error?.kind).toBe('notHere');
    // у вас пациент — переехать нельзя
    apply(db, s, takeCommand(db, s, ask.id).cmd!);
    expect(s.current).toBe(ask.id);
    const gastro = s.staff!.find(m => m.role === 'role.gastroenterologist')!;
    expect(office(s, gastro.room).error?.kind).toBe('busy');
  });

  test('снесли ваш кабинет — отметка снимается; участок без «Моего» — чистая функция', () => {
    const site0 = hospital.site!;
    const gone = demolish(db, site0, site0.mine!);
    expect(gone.ok && gone.site.mine).toBeUndefined();
    const r = setOffice(db, site0, 'r999');
    expect(r.ok).toBe(false);
  });

  test('пустое здание: «Мой» на кабинете врача — больница открыта и без нанятого врача, нанятый — в резерве', () => {
    const s = emptyShift(db, 3);
    const ids = buildProto(db, s);
    const officeId = ids[2];
    expect(officeOf(db, s)).toBeUndefined();
    const doc = s.staff!.find(m => m.room === officeId)!;
    expect(office(s, officeId).ok).toBe(true);
    expect(officeOf(db, s)).toBe(officeId);
    expect(roomOf(s, doc.id)).toBeUndefined();
    expect(siteOpen(db, s, 'walk')).toBe(true);
    // пациенты приходят и ждут вас: нанятых врачей нет
    liveTo(db, s, 9);
    const st = doctorState(db, s);
    expect(st.office).toBe(officeId);
    expect(st.others.length + st.othersMore).toBeGreaterThan(0);
    // позвать первого — он у вас; в срезе он — в вашем кабинете
    const first = st.others[0];
    const t = takeCommand(db, s, first.id);
    expect(t.cmd).toEqual({ kind: 'call', id: first.id });
    apply(db, s, t.cmd!);
    expect(s.current).toBe(first.id);
    expect(sliceOf(s, officeOf(db, s)).people.find(x => x.id === first.id)?.room).toBe(officeId);
  });
});

describe('«Взять случай»', () => {
  test('просит посмотреть — «Посмотреть»; у врача — takeOver; ждёт никем не взятый — call, занятому — нельзя; свой — открыть', () => {
    const s = preset();
    const ask = untilAsk(s);
    expect(takeCommand(db, s, ask.id)).toEqual({ cmd: { kind: 'consult', id: ask.id, answer: 'look' } });
    expect(takeCommand(db, s, 'no-such')).toEqual({ refused: 'gone' });
    // ответ «Посмотреть» — больной у вас; снова «Взять» — открыть карту
    apply(db, s, { kind: 'consult', id: ask.id, answer: 'look' });
    expect(s.current).toBe(ask.id);
    expect(takeCommand(db, s, ask.id)).toEqual({ open: true });
    // ждёт врача, никем не взятый: вы заняты — нельзя
    for (let i = 0; i < 120 && !s.queue.some(id => !s.patients[id].by && s.patients[id].calledT === undefined); i++) apply(db, s, { kind: 'advance', seconds: 60 });
    const waiting = s.queue.find(id => !s.patients[id].by && s.patients[id].calledT === undefined);
    if (waiting) expect(takeCommand(db, s, waiting).refused).toBe('busy');
    // у нанятого врача (на приёме или ждёт его) — takeOver
    const theirs = Object.values(s.patients).find(p => p.by && !p.closed && (p.status === 'inRoom' || p.status === 'waiting' || p.status === 'away'));
    if (theirs) expect(takeCommand(db, s, theirs.id).cmd).toEqual({ kind: 'takeOver', id: theirs.id });
  });

  test('свободному — call: больной у вас, в срезе — в вашем кабинете', () => {
    const s = preset(5);
    liveTo(db, s, 10);
    // пришедший сам (привезённого скорой вы смотрите в смотровой приёмного): ждёт врача, никем не взятый
    const free = () => s.queue.find(id => !s.patients[id].by && s.patients[id].calledT === undefined && s.patients[id].kind !== 'ambulance');
    for (let i = 0; i < 120 && !free(); i++) apply(db, s, { kind: 'advance', seconds: 60 });
    const waiting = free();
    expect(waiting).toBeDefined();
    const t = takeCommand(db, s, waiting!);
    expect(t.cmd).toEqual({ kind: 'call', id: waiting! });
    apply(db, s, t.cmd!);
    expect(s.current).toBe(waiting!);
    expect(sliceOf(s, officeOf(db, s)).people.find(x => x.id === waiting)?.room).toBe(officeOf(db, s));
  });
});

describe('вид карты', () => {
  test('без правды: подменить болезнь и признаки при тех же наблюдениях — вид тот же; правда — только в разборе', () => {
    const s = preset();
    const ask = untilAsk(s);
    apply(db, s, { kind: 'consult', id: ask.id, answer: 'look' });
    const p = s.patients[ask.id];
    const before = JSON.stringify(cardView(db, s, ask.id, 'student', 1));
    // другая болезнь и другие признаки; жалобы — те же (их атрибуты пациент называет сам)
    const other = generatePatient(db, 424242, { department: p.patient.department, season: p.patient.season, walkIn: true });
    const told = new Set(p.patient.complaints);
    const saved = p.patient.truth;
    p.patient.truth = { ...other.truth, findings: [...other.truth.findings.filter(f => !told.has(f.f)), ...saved.findings.filter(f => told.has(f.f))] };
    expect(p.patient.truth.conditions[0].id).not.toBe(saved.conditions[0].id);
    expect(JSON.stringify(cardView(db, s, ask.id, 'student', 1))).toBe(before);
    p.patient.truth = saved;
    expect(before.includes('"decision"')).toBe(false);
  });

  test('уровни: «Студент» — до 5 «из 10», «Ординатор» — до 3 словами, «Врач» — без подсказок и правил, «Практикант» — сверху по жалобе', () => {
    const s = preset();
    const ask = untilAsk(s);
    apply(db, s, { kind: 'consult', id: ask.id, answer: 'look' });
    apply(db, s, { kind: 'hypothesis', id: 'cond.concussion' });
    const v = (level: 'trainee' | 'student' | 'resident' | 'doctor') => cardView(db, s, ask.id, level, 1)!;
    const student = v('student');
    expect(student.hints.length).toBeGreaterThan(0);
    expect(student.hints.length).toBeLessThanOrEqual(5);
    expect(student.hints.every(h => h.word === undefined)).toBe(true);
    expect(student.differential[0].outOf10).toBeDefined();
    const resident = v('resident');
    expect(resident.hints.length).toBeLessThanOrEqual(3);
    expect(resident.hints.every(h => typeof h.word === 'string')).toBe(true);
    expect(resident.differential[0].word).toBeDefined();
    const doctor = v('doctor');
    expect(doctor.hints).toEqual([]);
    expect(doctor.rules).toEqual([]);
    expect(doctor.differential[0].outOf10).toBeUndefined();
    expect(doctor.differential[0].word).toBeUndefined();
    expect(v('trainee').focus?.length).toBeGreaterThan(0);
    expect(student.focus).toBeUndefined();
  });

  test('раскладка «Анамнеза»: у каждого осмотра базы — место на теле, у каждого снимка — раздел бланка', () => {
    for (const e of Object.values(db.exams)) {
      if (e.kind === 'physical' || e.kind === 'bedside') expect(EXAM_PLACES[e.id] ? e.id : `нет места: ${e.id}`).toBe(e.id);
      if (e.kind === 'imaging' && e.room) expect(IMAGING_ROOMS[e.room] ? e.room : `нет раздела: ${e.room}`).toBe(e.room);
    }
  });
});

/** Ответ потока — срез; что пришло о враче — запомнить. */
interface Seen {
  card?: CardView | null;
  doctor?: DoctorState;
  notices: Notice[];
}
function talk(sim: ReturnType<typeof createSim>, seen: Seen, msg: ToSim): Extract<FromSim, { kind: 'slice' }> {
  const r = sim.handle(msg);
  if (r.kind !== 'slice') throw new Error(r.kind === 'error' ? r.message : r.kind);
  if (r.card !== undefined) seen.card = r.card;
  if (r.doctor) seen.doctor = r.doctor;
  seen.notices.push(...r.notices);
  return r;
}

/**
 * Приём целиком через поток расчёта: до просьбы кадрами по `step` игровых секунд; «Посмотреть»; вопрос, осмотр, анализ,
 * «Подождать», гипотеза, диагноз, лечение, «Завершить приём». Отдаёт срезы карты и сохранение.
 */
async function wholeCase(step: number) {
  const sim = createSim(db);
  const seen: Seen = { notices: [] };
  talk(sim, seen, { kind: 'start', seed: 11, season: 'winter', hospital, staff, flow: FLOW });
  talk(sim, seen, { kind: 'doctor', act: { kind: 'view', open: null, lang: 'ru', level: 'student' } });
  // кадрами до 09:15 — просьба приходит к 09:08; отвечать — в один и тот же игровой час при любом шаге
  let ask: Extract<Notice, { kind: 'consult' }> | undefined;
  for (let i = 0; i < (75 * 60) / step; i++) {
    const r = talk(sim, seen, { kind: 'tick', seconds: step, budgetMs: 1000 });
    ask ??= r.notices.find((n): n is Extract<Notice, { kind: 'consult' }> => n.kind === 'consult');
  }
  expect(ask).toBeDefined();
  expect(seen.doctor?.asks.map(a => a.id)).toEqual([ask!.id]);
  talk(sim, seen, { kind: 'doctor', act: { kind: 'take', id: ask!.id } });
  expect(seen.card?.id).toBe(ask!.id);
  expect(seen.card?.active).toBe(true);
  const id = ask!.id;
  const act = (cmd: Command) => talk(sim, seen, { kind: 'doctor', act: { kind: 'case', id, cmd } });
  const groups = examsByAction(seen.card!.portrait);
  const v = () => seen.card!;
  const q = groups.ask.find(x => !v().done.includes(x) && !v().unavailable[x])!;
  act({ kind: 'exam', exam: q });
  expect(v().done).toContain(q);
  const ex = groups.examine.find(x => !v().done.includes(x) && !v().unavailable[x])!;
  act({ kind: 'exam', exam: ex });
  const lab = groups.order.find(x => db.exams[x].kind === 'lab' && !v().done.includes(x) && !v().unavailable[x])!;
  act({ kind: 'exam', exam: lab });
  expect(v().pending.map(x => x.exam)).toContain(lab);
  for (let k = 0; k < 4 && (v().pending.length > 0 || v().away); k++) {
    act({ kind: 'waitResults' });
    for (let i = 0; i < 20; i++) talk(sim, seen, { kind: 'tick', seconds: 0, budgetMs: 1000 });
  }
  expect(v().pending).toEqual([]);
  expect(v().groups.some(g => g.exam === lab)).toBe(true);
  const dx = v().hints[0].id;
  act({ kind: 'hypothesis', id: dx });
  act({ kind: 'diagnose', id: dx });
  const tx = v().suggested.find(x => !x.disabled);
  if (tx) act({ kind: 'toggleTreatment', id: tx.id });
  expect(v().draft.diagnosis).toBe(dx);
  // действие по больному, которого нет у вас в кабинете, — отказ
  const other = Object.keys((sim.handle({ kind: 'save' }) as { state: ShiftState }).state.patients).find(x => x !== id)!;
  const refused = talk(sim, seen, { kind: 'doctor', act: { kind: 'case', id: other, cmd: { kind: 'finish' } } }).refused;
  expect(refused).toEqual({ act: 'case', id: other, why: 'notInOffice' });
  act({ kind: 'finish' });
  const card = v();
  const saved = sim.handle({ kind: 'save' });
  if (saved.kind !== 'state') throw new Error(saved.kind);
  return { card, doctor: seen.doctor!, state: saved.state };
}

describe('приём через поток расчёта', () => {
  test('от просьбы до разбора; при шаге часов 4 и 15 секунд — то же состояние, что и в основном потоке', async () => {
    const a = await wholeCase(4);
    expect(a.card.active).toBe(false);
    expect(a.card.where).toBe('done');
    const d = a.card.decision!;
    expect(['correct', 'partly', 'wrong']).toContain(d.verdict);
    expect(d.truthName.length).toBeGreaterThan(0);
    expect(['A', 'B', 'C', 'D']).toContain(d.overall);
    expect(d.grades.length).toBe(6);
    expect(a.doctor.closed.map(r => r.id)).toContain(a.card.id);
    expect(a.doctor.asks).toEqual([]);
    // оценку получают только ваши приёмы (решение владельца 16.10.2026): приём закрыт вами, разбор досчитан
    const p = a.state.patients[a.card.id];
    expect(p.closed?.by).toBeUndefined();
    expect(p.closed?.review).toBeUndefined();
    const b = await wholeCase(15);
    expect(hash(b.state)).toBe(hash(a.state));
    // те же команды движка в основном потоке — то же состояние: журнал дня поток расчёта пишет сам
    const s = preset();
    for (const cmd of a.state.journal) apply(db, s, cmd);
    expect(hash(s)).toBe(hash(a.state));
  });

  test('ответы без карты: «Пусть решает сам» и «Направить к …» — просьба уходит из списка', () => {
    for (const answer of ['self', 'refer'] as const) {
      const sim = createSim(db);
      const seen: Seen = { notices: [] };
      talk(sim, seen, { kind: 'start', seed: 11, season: 'winter', hospital, staff, flow: FLOW });
      talk(sim, seen, { kind: 'doctor', act: { kind: 'view', open: null, lang: 'ru', level: 'student' } });
      let id: string | undefined;
      for (let i = 0; i < 1800 && !id; i++) id = talk(sim, seen, { kind: 'tick', seconds: 4, budgetMs: 1000 }).notices.find(n => n.kind === 'consult')?.id;
      const ask = seen.doctor!.asks.find(a => a.id === id)!;
      const to = seen.doctor!.colleagues.find(c => c.id !== ask.by);
      expect(to).toBeDefined();
      talk(sim, seen, { kind: 'command', cmd: { kind: 'consult', id: id!, answer, ...(answer === 'refer' ? { to: to!.id } : {}) } });
      expect(seen.doctor!.asks).toEqual([]);
      const saved = sim.handle({ kind: 'save' });
      if (saved.kind !== 'state') throw new Error(saved.kind);
      const p = saved.state.patients[id!];
      if (answer === 'refer') expect(p?.by).toBe(to!.id);
      else expect(p === undefined || p.closed !== undefined || p.by === ask.by).toBe(true);
    }
  });

  test('язык окна — строки вида: по-английски слова интерфейса, медицина — из базы', () => {
    const sim = createSim(db);
    const seen: Seen = { notices: [] };
    talk(sim, seen, { kind: 'start', seed: 11, season: 'winter', hospital, staff, flow: FLOW });
    talk(sim, seen, { kind: 'doctor', act: { kind: 'view', open: null, lang: 'en', level: 'student' } });
    let id: string | undefined;
    for (let i = 0; i < 1800 && !id; i++) id = talk(sim, seen, { kind: 'tick', seconds: 4, budgetMs: 1000 }).notices.find(n => n.kind === 'consult')?.id;
    talk(sim, seen, { kind: 'doctor', act: { kind: 'take', id: id! } });
    expect(seen.card!.title).toMatch(/years, [MF]$/);
    expect(seen.doctor!.asks).toEqual([]);
    setLang('ru');
  });
});
