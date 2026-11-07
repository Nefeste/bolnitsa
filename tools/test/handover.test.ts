// Сценарий 2 «Приёмное», часть 2а (spec docs/specs/2026-11-scenario-2.md, «Часть 2а: лист передачи в окне»): что окно врача
// получает из потока расчёта о привезённых скорой. Сортируете вы — привезённый в списке «Привезла скорая» с листом передачи:
// кто, повод, что измерил фельдшер; на «Практиканте» и «Студенте» — баллы NEWS2, на трудных уровнях — нет; «Взять» —
// сначала сортировка. Сортирует медсестра — списка нет. Галочка видна, когда смотровая работает. Ошибка сортировки — примером
// на планёрке следующего утра. Готовая городская больница: смотровая на три места, ночная смена.
import { describe, expect, test } from 'bun:test';
import { db } from '../../src/content';
import { hospitalOf } from '../../src/engine/hospital/site';
import { siteOfPreset } from '../../src/engine/hospital/site-preset';
import { presetStaff, withNightShift } from '../../src/engine/hospital/staff';
import { apply, newFlowShift } from '../../src/engine/shift/engine';
import { startCash } from '../../src/engine/shift/money';
import { DAY, type ShiftState, type Triage } from '../../src/engine/shift/types';
import { setLang } from '../../src/i18n';
import { useDb } from '../../src/sim/caseView';
import { DoctorDesk, doctorState, sortMissOf, takeCommand } from '../../src/sim/doctor';
import { emptyShift } from './site-kit';

useDb(db);
setLang('ru');
const H = 3600;
const rec = db.presets['preset.city'];
const site = siteOfPreset(db, rec);
const city = (seed: number, sorts: boolean): ShiftState =>
  newFlowShift(db, {
    seed, season: 'winter', hospital: hospitalOf(db, site), staff: withNightShift(db, site.rooms, presetStaff(db, rec)), flow: { perHour: 0, auto: true },
    economy: { cash: startCash(db, 'preset') }, ...(sorts ? { sorts: true } : {}),
  });

/** Жить минутами, пока `stop` не скажет «хватит», но не дольше `hours`. */
function liveUntil(s: ShiftState, hours: number, stop: () => boolean) {
  while (s.t < hours * H && !stop()) apply(db, s, { kind: 'advance', seconds: 60 });
}
const wrong = (t: Triage): Triage => (t === 'red' ? 'green' : 'red');

describe('сценарий 2, часть 2а: лист передачи в окне врача', () => {
  test('сортируете вы: привезённый — в «Привезла скорая» с листом; баллы — на лёгких уровнях; «Взять» — сначала сортировка', () => {
    const s = city(1, true);
    liveUntil(s, 40, () => doctorState(db, s).handover.length > 0);
    const st = doctorState(db, s, 'student');
    expect([st.er, st.sorts]).toEqual([true, true]);
    const row = st.handover[0];
    const p = s.patients[row.id];
    expect([p.kind, p.status, !!p.sorted]).toEqual(['ambulance', 'waiting', false]);
    expect(row.who.length).toBeGreaterThan(0);
    expect(row.reason.length).toBeGreaterThan(0);
    // фельдшер измерил — строками; правды о больном нет: только номер, слова и баллы шкалы
    expect(row.measured.length).toBeGreaterThan(0);
    expect(row.at).toBe(p.arriveT);
    expect(row.door).toBe(!p.bay);
    expect(row.news2).toBe(p.scale!.news2);
    expect(Object.keys(row).every(k => ['id', 'who', 'reason', 'measured', 'door', 'at', 'news2', 'flag'].includes(k))).toBe(true);
    // «Практикант» — тоже с баллами; «Ординатор» и «Врач» — без
    expect(doctorState(db, s, 'trainee').handover[0].news2).toBe(p.scale!.news2);
    for (const level of ['resident', 'doctor'] as const) {
      const r = doctorState(db, s, level).handover[0];
      expect([r.news2, r.flag]).toEqual([undefined, undefined]);
    }
    // в общей очереди его нет: сначала сортировка
    expect(st.others.some(r => r.id === row.id)).toBe(false);
    expect(takeCommand(db, s, row.id)).toEqual({ refused: 'sortFirst' });
    // отсортировали — из листа ушёл
    apply(db, s, { kind: 'sort', id: row.id, triage: p.scale!.triage });
    expect(doctorState(db, s).handover.some(r => r.id === row.id)).toBe(false);
  }, 120_000);

  test('сортирует медсестра: списка нет, галочка видна; отдали медсестре — ждущие ушли из списка; без смотровой галочки нет', () => {
    const s = city(1, false);
    liveUntil(s, 40, () => Object.values(s.patients).some(p => p.kind === 'ambulance'));
    const st = doctorState(db, s);
    expect([st.er, st.sorts, st.handover]).toEqual([true, undefined, []]);
    // сортировали вы, а потом отдали медсестре
    const mine = city(2, true);
    liveUntil(mine, 40, () => doctorState(db, mine).handover.length > 0);
    expect(doctorState(db, mine).handover.length).toBeGreaterThan(0);
    apply(db, mine, { kind: 'sorts', on: false });
    expect([doctorState(db, mine).sorts, doctorState(db, mine).handover]).toEqual([undefined, []]);
    // пустое здание: смотровой нет — нет и галочки
    expect(doctorState(db, emptyShift(db)).er).toBeUndefined();
  }, 120_000);

  test('ошибка вашей сортировки — примером на планёрке: кто, ваш цвет и цвет по шкале; поток шлёт её один раз за сутки', () => {
    const s = city(3, true);
    const desk = new DoctorDesk(db);
    desk.view(null, 'ru', 'student');
    let missed: string | undefined;
    // первые сутки: каждого привезённого — не по шкале, чтобы ошибки были наверняка
    while (s.t < DAY + 8 * H) {
      apply(db, s, { kind: 'advance', seconds: 60 });
      for (const r of doctorState(db, s).handover) {
        const p = s.patients[r.id];
        apply(db, s, { kind: 'sort', id: r.id, triage: wrong(p.scale!.triage) });
        missed ??= r.id;
      }
    }
    expect(missed).toBeDefined();
    const day = s.history.at(-1)!;
    expect(day.ambulance!.mine).toBeGreaterThan(0);
    expect(day.ambulance!.under + day.ambulance!.over).toBe(day.ambulance!.mine!);
    const miss = sortMissOf(db, s)!;
    expect(miss.day).toBe(day.day);
    expect(miss.yours).not.toBe(miss.scale);
    // первым — недооценённый: «красного» назвали «зелёным»
    const under = Object.values(s.patients).some(p => p.kind === 'ambulance' && p.sorted && p.scale && p.scale.triage === 'red' && p.triage === 'green');
    if (under) expect([miss.yours, miss.scale]).toEqual(['green', 'red']);
    // поток шлёт пример с первым срезом после планёрки — и больше не шлёт, пока не пройдут сутки
    expect(desk.out(s).sortMiss).toEqual(miss);
    expect(desk.out(s).sortMiss).toBeUndefined();
    // верная сортировка — примера нет
    const right = city(4, true);
    while (right.t < DAY + 8 * H) {
      apply(db, right, { kind: 'advance', seconds: 60 });
      for (const r of doctorState(db, right).handover) apply(db, right, { kind: 'sort', id: r.id, triage: right.patients[r.id].scale!.triage });
    }
    expect(right.history.at(-1)!.ambulance!.mine).toBeGreaterThan(0);
    expect(sortMissOf(db, right)).toBeUndefined();
  }, 240_000);
});
