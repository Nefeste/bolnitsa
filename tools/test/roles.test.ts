// Роли (spec docs/specs/2026-10-two-ways.md, часть 3, F4; решение владельца #67): «Врач», «Главврач», «Управляющий» — что
// ставит роль; готовая больница и поликлиника на старте роли без своего кабинета — кабинет игрока обычный, в нём нанятый
// терапевт, и больница работает; галочки роли — в движке.
import { describe, expect, test } from 'bun:test';
import { db } from '../../src/content';
import { DEFAULT_ROLE, firstOffice, ROLE_SETS, ROLES, roleOf, startFor } from '../../src/app/roles';
import { DOCTOR, doctorRoom, OFFICE, standInOf } from '../../src/engine/hospital/requirements';
import { emptySite, hospitalOf, planOfSite } from '../../src/engine/hospital/site';
import { siteOfPlan } from '../../src/engine/hospital/site-plan';
import { siteOfPreset } from '../../src/engine/hospital/site-preset';
import { presetStaff, withNightShift } from '../../src/engine/hospital/staff';
import { DEFAULT_ASKS } from '../../src/engine/shift/approve';
import { apply, newFlowShift } from '../../src/engine/shift/engine';
import { FLOW } from './site-kit';

const rec = db.presets['preset.city'];
const plan = siteOfPlan(db, Object.values(db.sites!)[0]);
if (!plan.ok) throw new Error('поликлиника не строится');

describe('роли', () => {
  test('что ставит роль: «Врач» — как прежде; «Главврач» — «ниже 90 %» и «выписка» (#65); «Управляющий» — ни о чём, без автопаузы', () => {
    expect(ROLES).toEqual(['doctor', 'chief', 'manager']);
    expect(DEFAULT_ROLE).toBe('doctor');
    expect(ROLE_SETS.doctor).toEqual({ office: true, asks: DEFAULT_ASKS, autopause: true, folded: false });
    expect(ROLE_SETS.chief).toEqual({ office: false, asks: ['unsure', 'long', 'below90', 'discharge'], autopause: true, folded: false });
    expect(ROLE_SETS.manager).toEqual({ office: false, asks: [], autopause: false, folded: true });
    expect(roleOf('chief')).toBe('chief');
    expect(roleOf('boss')).toBeUndefined();
    expect(roleOf(undefined)).toBeUndefined();
  });

  for (const [name, site, staff] of [
    ['городская больница', siteOfPreset(db, rec), presetStaff(db, rec)],
    ['поликлиника', plan.site, plan.staff],
  ] as const) {
    test(`${name}: «Врач» — свой кабинет, как прежде; без своего кабинета — в нём нанятый терапевт, и больница работает`, () => {
      const mine = site.mine!;
      expect(mine).toBe(firstOffice(site)!);
      const doctor = startFor(db, site, staff, 'doctor');
      expect(doctor.site).toBe(site);
      expect(doctor.staff).toEqual([...staff]);
      for (const role of ['chief', 'manager'] as const) {
        const r = startFor(db, site, staff, role);
        expect(r.site.mine).toBeUndefined();
        expect(r.staff.length).toBe(staff.length + 1);
        const added = r.staff.at(-1)!;
        expect(added).toMatchObject({ role: standInOf(db, DOCTOR), room: mine, skill: 3, days: 0 });
        expect(new Set(r.staff.map(m => m.id)).size).toBe(r.staff.length);
        // ночная смена — как у готовой больницы; кабинет игрока — обычный кабинет врача
        const all = withNightShift(db, r.site.rooms, r.staff);
        const h = hospitalOf(db, r.site);
        const p = planOfSite(db, r.site);
        expect(doctorRoom(p)).toBeUndefined();
        expect(p.rooms.find(x => x.id === mine)?.type).toBe(OFFICE);
        // смена идёт: в кабинете бывшего вашего принимает нанятый, приёмы закрываются, ваших больных нет
        const s = newFlowShift(db, { seed: 3, season: 'winter', hospital: h, staff: all, flow: FLOW });
        apply(db, s, { kind: 'asks', rules: [...ROLE_SETS[role].asks] });
        for (let i = 0; i < 4 * 60; i++) apply(db, s, { kind: 'advance', seconds: 60 });
        expect(s.meta.asks).toEqual([...ROLE_SETS[role].asks]);
        expect(Object.values(s.summary.colleagues ?? {}).reduce((n, c) => n + c.seen, 0)).toBeGreaterThan(0);
        expect(s.summary.colleagues?.[added.id]?.seen ?? 0).toBeGreaterThan(0);
        expect(s.summary.seen).toBe(0);
      }
    }, 60_000);
  }

  test('пустое здание — под любую роль как есть; «Мой кабинет» у «Врача» — первый кабинет врача участка', () => {
    const site = emptySite();
    for (const role of ROLES) expect(startFor(db, site, [], role)).toEqual({ site, staff: [] });
    expect(firstOffice(site)).toBeUndefined();
    const city = siteOfPreset(db, rec);
    expect(city.rooms.find(r => r.id === firstOffice(city))?.type).toBe(OFFICE);
  });
});
