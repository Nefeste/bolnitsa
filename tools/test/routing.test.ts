// Отделения, часть 4 (spec docs/specs/2026-10-departments.md, «Часть 4: как сделано»): регистратор направляет пришедшего
// сам по жалобам — только когда в смене есть врач кабинета, который берёт пришедших своего отделения (амбулаторный хирург);
// без него поток прежний. Навык регистратора 3–5 — все жалобы, 1–2 — главная (решение владельца #141). Направленного в
// хирургию берёт амбулаторный хирург; врач, у которого диагноз другого отделения, передаёт больного туда. Готовая городская
// больница: эндокринолог её четвёртого кабинета заменён амбулаторным хирургом.
import { describe, expect, test } from 'bun:test';
import { db } from '../../src/content';
import { routeDept } from '../../src/engine/hospital/departments';
import { hospitalOf } from '../../src/engine/hospital/site';
import { siteOfPreset } from '../../src/engine/hospital/site-preset';
import { presetStaff, salaryOf, type StaffMember, withNightShift } from '../../src/engine/hospital/staff';
import { primaryOf } from '../../src/engine/med/plan';
import { apply, deptRoute, newFlowShift } from '../../src/engine/shift/engine';
import { startCash } from '../../src/engine/shift/money';
import type { ShiftPatient, ShiftState } from '../../src/engine/shift/types';
import { setLang } from '../../src/i18n';
import { useDb } from '../../src/sim/caseView';
import { routeMissOf } from '../../src/sim/doctor';

const H = 3600;
const rec = db.presets['preset.city'];
const site = siteOfPreset(db, rec);
const SURGEON = 'role.surgeon_clinic';
/** Городская больница; `surgeon` — эндокринолог заменён амбулаторным хирургом; `registrar` — навык регистраторов. */
function city(seed: number, surgeon: boolean, registrar?: number): ShiftState {
  const staff = withNightShift(db, site.rooms, presetStaff(db, rec)).map((m): StaffMember =>
    surgeon && m.role === 'role.endocrinologist' ? { ...m, role: SURGEON, salary: salaryOf(db, SURGEON, m.skill) }
    : registrar !== undefined && m.role === 'role.registrar' ? { ...m, skill: registrar } : m,
  );
  return newFlowShift(db, { seed, season: 'winter', hospital: hospitalOf(db, site), staff, flow: { perHour: 0, auto: true }, economy: { cash: startCash(db, 'preset') } });
}
/** Прожить до часа `hours`, собирая пришедших сами — и тех, кого уже нет в состоянии. */
function live(s: ShiftState, hours: number): ShiftPatient[] {
  const seen = new Map<string, ShiftPatient>();
  while (s.t < hours * H) {
    apply(db, s, { kind: 'advance', seconds: 300 });
    for (const p of Object.values(s.patients)) if (p.kind === 'walkIn') seen.set(p.id, p);
  }
  return [...seen.values()];
}

describe('отделения, часть 4: направление по жалобе и амбулаторный хирург', () => {
  test('должность: встаёт на место врача, хирургия, берёт пришедших своего отделения, профиль — хирургия и травма', () => {
    const r = db.roles[SURGEON];
    expect([r.stands, r.department, r.walkIns, r.needs]).toEqual(['role.doctor', 'dept.surgery', true, 'room.staff']);
    expect(r.profile!.every(id => routeDept(db, id) === 'dept.surgery')).toBe(true);
    // прочие специалисты — только своих записанных
    for (const id of ['role.gastroenterologist', 'role.endocrinologist', 'role.infectionist']) expect(db.roles[id].walkIns).toBeUndefined();
  });

  test('без амбулаторного хирурга регистратор не направляет: поток прежний', () => {
    const s = city(1, false);
    const ps = live(s, 32);
    expect(ps.length).toBeGreaterThan(0);
    expect(ps.some(p => p.dept !== undefined)).toBe(false);
    expect(s.history[0].routing).toBeUndefined();
  }, 120_000);

  test('с амбулаторным хирургом: направленных в хирургию зовёт он, терапевт — нет; итоги суток', () => {
    const s = city(3, true);
    const ps = live(s, 32);
    const surgeon = s.staff!.find(m => m.role === SURGEON)!;
    const day = s.history[0].routing!;
    expect(day.routed).toBe(ps.filter(p => p.dept !== undefined && p.arriveT < 32 * H).length);
    const surg = ps.filter(p => p.dept === 'dept.surgery');
    expect(surg.length).toBeGreaterThan(0);
    for (const p of surg) {
      const by = p.closed?.by ?? p.by;
      if (by !== undefined && p.ref === undefined) expect([p.id, by]).toEqual([p.id, surgeon.id]);
    }
    expect(surg.some(p => (p.closed?.by ?? p.by) === surgeon.id)).toBe(true);
    // путь — хирургия или общий поток: инфекционист города берёт только записанных, к нему не направляют
    expect(new Set(ps.flatMap(p => (p.dept !== undefined ? [p.dept] : [])))).toEqual(new Set(['dept.surgery', 'dept.therapy']));
    // не туда — по правде, среди тех же путей: болезнь отделения без такого врача — общий поток
    const right = (p: ShiftPatient) => (routeDept(db, primaryOf(p.patient).id) === 'dept.surgery' ? 'dept.surgery' : 'dept.therapy');
    for (const p of ps) if (p.dept !== undefined) expect([p.id, p.misrouted === true]).toEqual([p.id, p.dept !== right(p)]);
    expect(day.wrong).toBe(ps.filter(p => p.misrouted && p.arriveT < 32 * H).length);
  }, 120_000);

  test('навык регистратора: 1–2 — по главной жалобе, 3–5 — по всем; низкий навык ошибается не реже', () => {
    const low = city(1, true, 1);
    const high = city(1, true, 5);
    const a = live(low, 56);
    const b = live(high, 56);
    const targets = new Set(['dept.surgery']);
    for (const p of a) if (p.dept !== undefined) expect([p.id, p.dept]).toEqual([p.id, deptRoute(db, low, p, false, targets)]);
    for (const p of b) if (p.dept !== undefined) expect([p.id, p.dept]).toEqual([p.id, deptRoute(db, high, p, true, targets)]);
    const wrong = (s: ShiftState) => s.history.reduce((n, d) => n + (d.routing?.wrong ?? 0), 0);
    expect(wrong(low)).toBeGreaterThanOrEqual(wrong(high));
    // направленных не туда врачи передают в отделение болезни — так и в пути
    expect(low.history.reduce((n, d) => n + (d.routing?.sent ?? 0), 0)).toBeGreaterThan(0);
    const sent = Object.values(low.journeys!.of).flatMap(j => j.steps).filter(x => x.k === 'own' && x.dept !== undefined);
    expect(sent.length).toBeGreaterThan(0);
    for (const x of sent) if (x.k === 'own') expect([x.refer, x.from !== undefined, db.departments![x.dept!] !== undefined]).toEqual([true, true, true]);
  }, 240_000);

  // сценарий 2, часть 3 (spec docs/specs/2026-11-scenario-2.md): на планёрке — пример направленного не туда; только чей приём
  // закрыт, иначе болезнь назвала бы диагноз
  test('пример направленного не туда за сутки: из закрытых приёмов, отделение регистратора — не отделение болезни', () => {
    useDb(db);
    setLang('ru');
    const s = city(3, true, 1);
    const ps = live(s, 33);
    expect(s.history[0].routing!.wrong).toBeGreaterThan(0);
    const miss = routeMissOf(db, s)!;
    expect(miss.day).toBe(1);
    expect(miss.to).not.toBe(miss.dept);
    const wrong = ps.filter(p => p.misrouted && p.closed && p.id.startsWith('1-w'));
    expect(wrong.length).toBeGreaterThan(0);
    const first = wrong.sort((a, b) => a.arriveT - b.arriveT)[0];
    expect(miss.disease.toLowerCase()).toBe(db.conditions[primaryOf(first.patient).id].name.ru.toLowerCase());
  }, 120_000);
});
