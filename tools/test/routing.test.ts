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
    // не туда — по правде
    expect(day.wrong).toBe(ps.filter(p => p.dept !== undefined && p.dept !== routeDept(db, primaryOf(p.patient).id)).length);
  }, 120_000);

  test('навык регистратора: 1–2 — по главной жалобе, 3–5 — по всем; низкий навык ошибается не реже', () => {
    const low = city(1, true, 1);
    const high = city(1, true, 5);
    const a = live(low, 56);
    const b = live(high, 56);
    for (const p of a) if (p.dept !== undefined) expect([p.id, p.dept]).toEqual([p.id, deptRoute(db, low, p, false)]);
    for (const p of b) if (p.dept !== undefined) expect([p.id, p.dept]).toEqual([p.id, deptRoute(db, high, p, true)]);
    const wrong = (s: ShiftState) => s.history.reduce((n, d) => n + (d.routing?.wrong ?? 0), 0);
    expect(wrong(low)).toBeGreaterThanOrEqual(wrong(high));
    // направленных не туда врачи передают в отделение болезни — так и в пути
    expect(low.history.reduce((n, d) => n + (d.routing?.sent ?? 0), 0)).toBeGreaterThan(0);
    const sent = Object.values(low.journeys!.of).flatMap(j => j.steps).filter(x => x.k === 'own' && x.dept !== undefined);
    expect(sent.length).toBeGreaterThan(0);
    for (const x of sent) if (x.k === 'own') expect([x.refer, x.from !== undefined, db.departments![x.dept!] !== undefined]).toEqual([true, true, true]);
  }, 240_000);
});
