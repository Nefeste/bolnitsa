// Два способа играть, часть 1 — прозрачность (spec docs/specs/2026-10-two-ways.md, «Части работы»): карта любого больного
// для чтения — без правды; кто ведёт и что думает или решил, по уровню медицины; можно ли взять; лежащие у нанятых врачей —
// в «Обходе» после ваших, и главврач меняет им лечение и выписывает.
import { describe, expect, test } from 'bun:test';
import { db } from '../../src/content';
import { generatePatient } from '../../src/engine/med/generate';
import { hospitalOf } from '../../src/engine/hospital/site';
import { siteOfPreset } from '../../src/engine/hospital/site-preset';
import { presetStaff } from '../../src/engine/hospital/staff';
import { apply, newFlowShift } from '../../src/engine/shift/engine';
import type { ShiftPatient, ShiftState } from '../../src/engine/shift/types';
import { setLang, T } from '../../src/i18n';
import { useDb } from '../../src/sim/caseView';
import { cardView, doctorState } from '../../src/sim/doctor';
import { FLOW } from './site-kit';

useDb(db);
setLang('ru');
const rec = db.presets['preset.city'];
const hospital = hospitalOf(db, siteOfPreset(db, rec));
const staff = presetStaff(db, rec);
const preset = (seed = 11) => newFlowShift(db, { seed, season: 'winter', hospital, staff, flow: FLOW });

/** Жить минутами, пока не найдётся больной по условию. */
function until(s: ShiftState, find: (p: ShiftPatient) => boolean, minutes = 10 * 60): ShiftPatient {
  for (let i = 0; i < minutes; i++) {
    const p = Object.values(s.patients).find(find);
    if (p) return p;
    apply(db, s, { kind: 'advance', seconds: 60 });
  }
  throw new Error('не нашёлся');
}

describe('карта больного нанятого врача', () => {
  test('для чтения и без правды: подменить болезнь при тех же наблюдениях — вид тот же; кто ведёт; можно взять', () => {
    const s = preset();
    const p = until(s, x => !!x.by && x.status === 'inRoom' && x.results.length > 1 && !x.closed);
    const v = cardView(db, s, p.id, 'student', 1)!;
    expect(v.active).toBe(false);
    expect(v.where).toBe('other');
    expect(v.lead?.by).toMatch(/навык \d/);
    expect(v.take).toBe(true);
    expect(v.decision).toBeUndefined();
    // что спросил и что узнал врач — в карте
    expect(v.results.length).toBeGreaterThan(0);
    expect(v.done.length).toBeGreaterThan(0);
    const before = JSON.stringify(v);
    const other = generatePatient(db, 424242, { department: p.patient.department, season: p.patient.season, walkIn: true });
    const told = new Set(p.patient.complaints);
    const saved = p.patient.truth;
    p.patient.truth = { ...other.truth, findings: [...other.truth.findings.filter(f => !told.has(f.f)), ...saved.findings.filter(f => told.has(f.f))] };
    expect(p.patient.truth.conditions[0].id).not.toBe(saved.conditions[0].id);
    expect(JSON.stringify(cardView(db, s, p.id, 'student', 1))).toBe(before);
    p.patient.truth = saved;
  });

  test('что думает врач — по уровню медицины: «из 10», словом, без уверенности; закрыл — чем кончилось, решение — диагноз, лечение и место', () => {
    const s = preset();
    const p = until(s, x => !!x.by && x.status === 'inRoom' && x.phase?.diagnosis !== undefined && !x.closed);
    const text = (level: 'trainee' | 'student' | 'resident' | 'doctor') => cardView(db, s, p.id, level, 1)!.lead!.text;
    const name = db.conditions[p.phase!.diagnosis!].name.ru;
    expect(text('student').startsWith('думает: ')).toBe(true);
    expect(text('student').toLowerCase()).toContain(name.slice(1).toLowerCase());
    expect(text('student')).toMatch(/\d+ из 10$/);
    expect(text('trainee')).toBe(text('student'));
    expect(text('resident')).not.toMatch(/из 10/);
    expect(text('resident')).toContain(' — ');
    expect(text('doctor')).not.toContain(' — ');
    // закрыл приём — чем кончилось и когда; решение блоком: что поставил, чем лечит, где (spec 2026-10-discharged-card)
    while (!p.closed) apply(db, s, { kind: 'advance', seconds: 60 });
    const done = cardView(db, s, p.id, 'student', 1)!;
    const c = p.closed!;
    expect(p.status).toBe('done');
    expect(done.lead!.text).toMatch(/^(отпустил домой|направил в стационар|вызвал скорую|перевёл в другую больницу) в \d\d:\d\d$/);
    expect(done.decided).toEqual({
      diagnosis: { id: c.diagnosis, name: db.conditions[c.diagnosis].name.ru },
      treatments: c.plan.treatments.map(tx => ({ id: tx, name: db.treatments[tx].name.ru })),
      setting: T.case.patient.setting[c.plan.setting],
    });
    // разбор A–D — только у ваших случаев (решение владельца 16.10.2026)
    expect(done.decision).toBeUndefined();
    expect(done.take).toBeUndefined();
  });

  test('ваш больной — без строки «кто ведёт»; ищет диагноз — так и сказано', () => {
    const s = preset();
    const p = until(s, x => !!x.by && x.status === 'inRoom' && x.phase?.diagnosis === undefined && !x.closed);
    expect(cardView(db, s, p.id, 'student', 1)!.lead!.text).toBe('ищет диагноз');
    // взяли — ваш: строки нет
    apply(db, s, { kind: 'takeOver', id: p.id });
    expect(cardView(db, s, p.id, 'student', 1)!.lead).toBeUndefined();
  });
});

describe('лежащие у нанятых врачей', () => {
  test('в «Обходе» после ваших, с тем, кто ведёт; в карте — блок обхода; главврач меняет лечение и выписывает', () => {
    const s = preset();
    const p = until(s, x => x.status === 'admitted' && !!x.stay && !!x.closed?.by, 16 * 60);
    const st = doctorState(db, s);
    expect(st.ward.some(r => r.id === p.id)).toBe(false);
    const row = st.theirs.find(r => r.id === p.id)!;
    expect(row.by).toMatch(/навык \d/);
    const v = cardView(db, s, p.id, 'student', 1)!;
    expect(v.where).toBe('admitted');
    expect(v.round).toBeDefined();
    expect(v.lead!.text.startsWith('решил: ')).toBe(true);
    // сменить лечение: болезнь идёт дальше с новым планом, ведёт тот же врач
    const by = p.closed!.by;
    const was = p.stay!.replans;
    const pick = v.round!.groups.flatMap(g => g.items.map(x => x.id)).find(id => !v.round!.current.includes(id))!;
    apply(db, s, { kind: 'replan', id: p.id, treatments: [...v.round!.current, pick] });
    expect(p.stay!.replans).toBe(was + 1);
    expect(p.stay!.plan.treatments).toContain(pick);
    expect(p.closed!.by).toBe(by);
    // выписать — сразу, не дожидаясь утра
    apply(db, s, { kind: 'discharge', id: p.id });
    expect(p.status).toBe('done');
    expect(doctorState(db, s).theirs.some(r => r.id === p.id)).toBe(false);
  }, 60_000);
});
