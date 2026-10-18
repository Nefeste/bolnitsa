// Карта ушедшего (spec docs/specs/2026-10-discharged-card.md): отпущенный нанятым врачом уходит из состояния, а его карта
// остаётся сутки, как его путь, — с решением, вопросами, ответами и результатами. Открытая карта не закрывается, когда врач
// его отпустил; «Приняты» — приняты и ушли за сутки, новые сверху; после сохранения — та же карта; смены «Анамнеза» — без
// карт ушедших.
import { describe, expect, test } from 'bun:test';
import { db } from '../../src/content';
import { hospitalOf } from '../../src/engine/hospital/site';
import { siteOfPreset } from '../../src/engine/hospital/site-preset';
import { presetStaff } from '../../src/engine/hospital/staff';
import { apply, atDoctor, newFlowShift, newSandbox } from '../../src/engine/shift/engine';
import { KEEP, MAX_DONE } from '../../src/engine/shift/journey';
import { SAVE_SCHEMA } from '../../src/engine/shift/migrate';
import type { Notice, ShiftPatient, ShiftState } from '../../src/engine/shift/types';
import { hhmm, useDb } from '../../src/sim/caseView';
import { cardView, DoctorDesk, SEEN, seenList } from '../../src/sim/doctor';
import { pack, unpack } from '../../src/sim/packing';
import { FLOW, hash, liveTo } from './site-kit';

const rec = db.presets['preset.city'];
const hospital = hospitalOf(db, siteOfPreset(db, rec));
const staff = presetStaff(db, rec);
const city = (seed: number) => newFlowShift(db, { seed, season: 'winter', hospital, staff, flow: FLOW });
// вид карты знает о медицине из базы (как DoctorDesk)
useDb(db);
const minuteOfDay = (t: number) => Math.floor((t % 86400) / 60);
/** Отпущенные нанятыми врачами — из карт ушедших. */
const released = (s: ShiftState) => (s.past ?? []).filter(x => x.p.closed?.by);

describe('движок: карта ушедшего — сутки, как путь', () => {
  test('отпущенный нанятым врачом — не в состоянии; его карта — в `s.past`: решение, вопросы и результаты; строка журнала и путь — тоже', () => {
    const s = city(3);
    liveTo(db, s, 14);
    const done = released(s);
    expect(done.length).toBeGreaterThan(5);
    for (const { t, p } of done) {
      expect(s.patients[p.id]).toBeUndefined();
      expect(s.gone!.some(r => r.id === p.id && r.end === 'done' && r.diagnosis === p.closed!.diagnosis)).toBe(true);
      expect(p.closed!.at).toBe(t);
      expect(p.results.length).toBeGreaterThan(0);
      expect(s.journeys!.of[p.id]?.end?.t).toBe(t);
    }
    // по порядку ухода
    const ts = s.past!.map(x => x.t);
    expect(ts).toEqual([...ts].sort((a, b) => a - b));
  }, 60_000);

  test('сутки после ухода — по часам ухода: при шаге 60 и 13 с — те же карты; старше суток — убраны', () => {
    const a = city(4);
    const b = city(4);
    liveTo(db, a, 34);
    liveTo(db, b, 34, 13);
    expect(hash(b.past)).toBe(hash(a.past));
    // старые убираются при уходе следующего: все — моложе суток к последнему уходу
    const last = a.past!.at(-1)!.t;
    expect(a.past!.every(x => x.t > last - KEEP)).toBe(true);
    // ушедший в первое утро — больше суток назад: строка журнала есть, карты нет
    const first = a.gone!.find(r => r.end === 'done' && r.by)!;
    expect(a.journeys?.of[first.id]).toBeUndefined();
    expect(a.past!.some(x => x.p.id === first.id)).toBe(false);
    expect(cardView(db, a, first.id, 'student', 1)).toBeNull();
  }, 120_000);

  test('не больше 600: новый уход убирает самые старые', () => {
    const s = city(5);
    liveTo(db, s, 11);
    const sample = released(s)[0].p;
    s.past = Array.from({ length: MAX_DONE }, (_, i) => ({ t: s.t - 600 + i, p: { ...sample, id: `x-${i}` } }));
    const n = s.gone!.length;
    while (s.gone!.length === n) apply(db, s, { kind: 'advance', seconds: 60 });
    const k = s.gone!.length - n;
    expect(s.past.length).toBe(MAX_DONE);
    expect(s.past[0].p.id).toBe(`x-${k}`);
    expect(s.past.at(-1)!.p.id).toBe(s.gone!.at(-1)!.id);
  }, 60_000);

  test('смены «Анамнеза» — без карт ушедших', () => {
    const s = newSandbox(db, { seed: 31, season: 'winter', start: 'clinic', budget: db.economy.sandbox.budgets.generous });
    for (let i = 0; i < 6 * 60; i++) apply(db, s, { kind: 'advance', seconds: 60 });
    expect(s.past).toBeUndefined();
  }, 60_000);
});

describe('поток расчёта: карта ушедшего и «Приняты»', () => {
  test('карта отпущенного: кто вёл и когда отпустил, решение — диагноз, лечение, где лечить; ход приёма; ни сроков, ни «Взять»', () => {
    const s = city(3);
    liveTo(db, s, 14);
    const x = released(s).filter(y => y.p.closed!.plan.setting === 'home').at(-1)!;
    const c = x.p.closed!;
    const v = cardView(db, s, x.p.id, 'student', 1)!;
    expect(v.active).toBe(false);
    expect(v.where).toBe('done');
    expect(v.lead!.by).toMatch(/навык \d/);
    expect(v.lead!.text).toBe(`отпустил домой в ${hhmm(minuteOfDay(c.at))}`);
    expect(v.decided!.diagnosis).toEqual({ id: c.diagnosis, name: db.conditions[c.diagnosis].name.ru });
    expect(v.decided!.treatments.map(t => t.id)).toEqual([...c.plan.treatments]);
    expect(v.decided!.setting).toBe('Дома');
    expect(v.groups.length).toBeGreaterThan(0);
    expect(v.pending).toEqual([]);
    expect(v.targets).toBeUndefined();
    expect(v.take).toBeUndefined();
  }, 60_000);

  test('открытая карта не закрывается, когда нанятый врач отпустил больного: та же карта — с решением', () => {
    const s = city(6);
    liveTo(db, s, 10);
    const desk = new DoctorDesk(db);
    desk.out(s);
    const tried = new Set<string>();
    for (let round = 0; round < 10; round++) {
      let p: ShiftPatient | undefined;
      for (let i = 0; i < 240 && !p; i++) {
        apply(db, s, { kind: 'advance', seconds: 60 });
        p = Object.values(s.patients).find(y => y.by !== undefined && !y.closed && y.status === 'inRoom' && !tried.has(y.id));
      }
      expect(p).toBeDefined();
      tried.add(p!.id);
      desk.view(p!.id, 'ru', 'student');
      let card = desk.out(s).card;
      expect(card?.id).toBe(p!.id);
      for (let i = 0; i < 4 * 60 && !p!.closed; i++) {
        apply(db, s, { kind: 'advance', seconds: 60 });
        const out = desk.out(s);
        if (out.card !== undefined) {
          expect(out.card).not.toBeNull();
          card = out.card;
        }
      }
      // положили в палату или ждут обратно — он ещё в больнице; нужен ушедший
      if (s.patients[p!.id]) continue;
      expect(card!.id).toBe(p!.id);
      expect(card!.decided?.diagnosis.id).toBe(p!.closed!.diagnosis);
      return;
    }
    throw new Error('ни один больной нанятого врача не ушёл');
  }, 120_000);

  test('«Приняты»: приняты и ушли за сутки — новые сверху, не больше 50; ваш — тоже, без врача', () => {
    const s = city(7);
    liveTo(db, s, 10);
    // ваш приём: позвали, вошёл, диагноз — и отпустили домой
    const p = s.patients[s.queue.find(id => !s.patients[id].by && s.patients[id].kind !== 'ambulance')!];
    apply(db, s, { kind: 'call', id: p.id });
    for (let i = 0; i < 3600 && s.meet !== undefined; i++) apply(db, s, { kind: 'advance', seconds: 5 });
    const q = Object.values(db.exams).find(e => e.kind === 'ask' && atDoctor(db, s, p, e.id))!;
    apply(db, s, { kind: 'exam', exam: q.id });
    apply(db, s, { kind: 'diagnose', id: 'cond.arvi' });
    apply(db, s, { kind: 'setting', setting: 'home' });
    apply(db, s, { kind: 'finish' });
    expect(p.closed?.by).toBeUndefined();
    liveTo(db, s, 13);
    const list = seenList(db, s);
    const mine = list.rows.find(r => r.id === p.id)!;
    expect(mine).toMatchObject({ setting: 'home', diagnosis: db.conditions['cond.arvi'].name.ru, sex: p.patient.sex, age: p.patient.age });
    expect(mine.by).toBeUndefined();
    for (const x of released(s)) expect(list.rows.find(r => r.id === x.p.id)?.by).toMatch(/навык \d/);
    expect(list.total).toBe(list.rows.length);
    expect(list.rows.map(r => r.at)).toEqual(list.rows.map(r => r.at).sort((a, b) => b - a));
    // больше пятидесяти — последние пятьдесят, всех — сколько есть
    const sample = released(s)[0].p;
    s.past = [...Array.from({ length: 80 }, (_, i) => ({ t: s.t - 900 + i, p: { ...sample, id: `x-${i}`, closed: { ...sample.closed!, at: s.t - 900 + i } } })), ...s.past!];
    const big = seenList(db, s);
    expect(big.rows.length).toBe(SEEN);
    expect(big.total).toBe(list.total + 80);
    expect(big.rows.map(r => r.at)).toEqual(big.rows.map(r => r.at).sort((a, b) => b - a));
  }, 60_000);

  test('«Приняты» уходят к окну, когда список изменился: кто-то ушёл, сменился язык', () => {
    const s = city(8);
    liveTo(db, s, 9);
    const desk = new DoctorDesk(db);
    expect(desk.out(s).seen).toBeDefined();
    expect(desk.out(s).seen).toBeUndefined();
    const n = released(s).length;
    let seen = undefined as ReturnType<DoctorDesk['out']>['seen'];
    for (let i = 0; i < 6 * 60 && !seen; i++) {
      apply(db, s, { kind: 'advance', seconds: 60 });
      const out = desk.out(s);
      if (released(s).length > n) seen = out.seen;
      else expect(out.seen).toBeUndefined();
    }
    expect(seen!.rows[0].id).toBe(released(s).at(-1)!.p.id);
    desk.view(null, 'en', 'student');
    expect(desk.out(s).seen!.rows[0].by).toMatch(/skill \d/);
    desk.view(null, 'ru', 'student');
    desk.out(s);
  }, 60_000);

  test('после сохранения и загрузки — та же карта ушедшего и те же «Приняты»', async () => {
    const s = city(3);
    liveTo(db, s, 14);
    const id = released(s).at(-1)!.p.id;
    const meta = { kind: 'manual' as const, savedAt: '2026-10-18T12:00:00.000Z', version: '0.7.1', start: 'preset', day: s.day, t: s.t };
    const back = (await unpack(await pack({ schema: SAVE_SCHEMA, meta, state: s }))).state;
    expect(hash(back)).toBe(hash(s));
    expect(JSON.stringify(cardView(db, back, id, 'student', 1))).toBe(JSON.stringify(cardView(db, s, id, 'student', 1)));
    expect(seenList(db, back)).toEqual(seenList(db, s));
  }, 60_000);

  test('ушедший, не дождавшись, — тоже карта: жалобы и что успели узнать; «Больного уже нет в больнице»', () => {
    const s = newFlowShift(db, { seed: 9, season: 'winter', hospital, staff: staff.filter(m => m.role !== 'role.doctor'), flow: FLOW });
    const left: Notice[] = [];
    for (let i = 0; i < 12 * 60 && left.length === 0; i++) left.push(...apply(db, s, { kind: 'advance', seconds: 60 }).filter(n => n.kind === 'left'));
    expect(left.length).toBeGreaterThan(0);
    const id = (left[0] as Extract<Notice, { kind: 'left' }>).id;
    expect(s.patients[id]).toBeUndefined();
    const v = cardView(db, s, id, 'student', 1)!;
    expect(v.where).toBe('gone');
    expect(v.decided).toBeUndefined();
    expect(v.targets).toBeUndefined();
    expect(seenList(db, s).rows.some(r => r.id === id)).toBe(false);
  }, 60_000);
});
