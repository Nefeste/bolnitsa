// Отделения на карте (spec docs/specs/2026-10-departments.md, часть 2): цвета различимы и при дальтонизме, полосы у дверей и
// пол слоя — по отделениям помещений движка, легенда — по порядку записи, отделение пациента для «Пациентов» — где он или
// кабинет его врача; отметка отделения не пересобирает сцену окна (`staffOnly`), стройка — пересобирает.
import { describe, expect, test } from 'bun:test';
import { colorOf, DEPT_COLORS, layerColors, legendOf, NO_DEPT, patientDept, planDepts, stripeColors } from '../../src/app/departments';
import { NO_FILTER, patientRows } from '../../src/app/flow';
import { db } from '../../src/content';
import { planOf } from '../../src/engine/hospital/build';
import { deptsOf, deptWhy, onlyDeptsChanged } from '../../src/engine/hospital/departments';
import { hospitalOf, markDept } from '../../src/engine/hospital/site';
import { siteOfPreset } from '../../src/engine/hospital/site-preset';
import { presetStaff, withNightShift } from '../../src/engine/hospital/staff';
import { startCash } from '../../src/engine/shift/money';
import type { Command } from '../../src/engine/shift/types';
import { createSim } from '../../src/sim/host';
import type { FromSim } from '../../src/sim/protocol';
import { FLOW } from './site-kit';

const rec = db.presets['preset.city'];
const citySite = siteOfPreset(db, rec);
const cityStaff = withNightShift(db, citySite.rooms, presetStaff(db, rec));

/**
 * Как цвет видят при протанопии, дейтеранопии и тританопии: матрицы Machado, Oliveira, Fernandes (2009), полная степень, в
 * линейном RGB; разница — CIE76 в Lab (D65). Для проверки палитры, не для игры.
 */
const CVD: Record<string, number[][]> = {
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
  normal: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
};
const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
function labOf(hex: number, m: number[][]): number[] {
  const c = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map(v => lin(v / 255));
  const [r, g, b] = m.map(row => Math.min(1, Math.max(0, row[0] * c[0] + row[1] * c[1] + row[2] * c[2])));
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  const fx = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const fy = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const fz = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

describe('отделения на карте', () => {
  test('у каждого отделения записи — свой цвет; все цвета слоя различимы и при дальтонизме (ΔE ≥ 15)', () => {
    expect(Object.keys(DEPT_COLORS)).toEqual(Object.keys(db.departments!));
    const all = [...Object.values(DEPT_COLORS), NO_DEPT];
    expect(new Set(all).size).toBe(all.length);
    for (const [kind, m] of Object.entries(CVD)) {
      let min = Infinity;
      for (let i = 0; i < all.length; i++)
        for (let j = i + 1; j < all.length; j++) {
          const a = labOf(all[i], m);
          const b = labOf(all[j], m);
          min = Math.min(min, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
        }
      expect([kind, min >= 15]).toEqual([kind, true]);
    }
    expect(colorOf(undefined)).toBe(NO_DEPT);
    expect(colorOf('dept.nowhere')).toBe(NO_DEPT);
  });

  test('готовая городская: полосы — у помещений отделений, серый пол — у служб и общих; легенда — по порядку записи', () => {
    const hospital = hospitalOf(db, citySite);
    const plan = planOf(db, hospital);
    const depts = planDepts(plan, deptsOf(db, citySite, cityStaff));
    const stripes = stripeColors(depts);
    const floor = layerColors(depts);
    plan.rooms.forEach((r, i) => {
      const d = depts[i];
      expect([r.type, stripes[i]]).toEqual([r.type, d === undefined ? null : DEPT_COLORS[d]]);
      expect([r.type, floor[i]]).toEqual([r.type, d === undefined ? NO_DEPT : DEPT_COLORS[d]]);
    });
    // регистратура, ожидание, лаборатория — без отделения; палаты — терапия, операционная — хирургия
    const of = (type: string) => [...new Set(plan.rooms.flatMap((r, i) => (r.type === type ? [depts[i] ?? ''] : [])))];
    for (const type of ['room.reception', 'room.waiting', 'room.lab']) expect([type, of(type)]).toEqual([type, ['']]);
    expect(of('room.ward')).toEqual(['dept.therapy']);
    expect(of('room.or')).toEqual(['dept.surgery']);
    const legend = legendOf(Object.keys(db.departments!), depts);
    const order = Object.keys(db.departments!);
    expect(legend.slice(0, -1).map(x => x.id)).toEqual(order.filter(id => depts.includes(id)));
    expect(legend[legend.length - 1].id).toBe('');
    expect(legend.reduce((n, x) => n + x.rooms, 0)).toBe(plan.rooms.length);
  });

  test('легенда: отделение не из записи — после записанных, «без отделения» — последним; без него — его нет', () => {
    expect(legendOf(['a', 'b', 'c'], ['c', undefined, 'x', 'a', 'c'])).toEqual([
      { id: 'a', rooms: 1 },
      { id: 'c', rooms: 2 },
      { id: 'x', rooms: 1 },
      { id: '', rooms: 1 },
    ]);
    expect(legendOf(['a'], ['a'])).toEqual([{ id: 'a', rooms: 1 }]);
  });

  test('отделение пациента: помещение, где он, если оно в отделении; иначе кабинет его врача; иначе нет', () => {
    // 0 — зал ожидания, 1 — кабинет терапии, 2 — палата хирургии, 3 — рентген
    const depts = [undefined, 'dept.therapy', 'dept.surgery', undefined];
    const officeOf = (by: number) => (by === 0 ? 1 : -1);
    expect(patientDept({ room: 2, by: 0 }, depts, officeOf)).toBe('dept.surgery');
    expect(patientDept({ room: 0, by: 0 }, depts, officeOf)).toBe('dept.therapy');
    expect(patientDept({ room: 3, by: 0 }, depts, officeOf)).toBe('dept.therapy');
    expect(patientDept({ room: 3, by: -1 }, depts, officeOf)).toBeUndefined();
    expect(patientDept({ room: -1, by: 5 }, depts, officeOf)).toBeUndefined();
  });

  test('фильтр «Пациентов» по отделению: все, одно, без отделения', () => {
    const row = (id: string, dept?: string) => ({
      key: `p:${id}`, id, title: id, status: 'waiting' as const, triage: 'green' as const, doing: 'waiting' as const, since: 0, limit: -1, ...(dept ? { dept } : {}),
    });
    const list = [row('a', 'dept.therapy'), row('b', 'dept.surgery'), row('c')];
    const ids = (dept: typeof NO_FILTER.dept) => patientRows(list, 60, { ...NO_FILTER, dept }).rows.map(r => r.id);
    expect(ids('all')).toEqual(['a', 'b', 'c']);
    expect(ids('dept.surgery')).toEqual(['b']);
    expect(ids('none')).toEqual(['c']);
    expect(patientRows(list, 60, { ...NO_FILTER, dept: 'dept.icu' })).toEqual({ rows: [], total: 3 });
  });

  test('откуда отделение — для карточки помещения: отметка, тот, кто работает, вид помещения', () => {
    const office = citySite.rooms.find(r => cityStaff.some(m => m.room === r.id && m.role === 'role.infectionist'))!;
    expect(deptWhy(db, office, cityStaff)).toEqual({ dept: 'dept.infectious', by: 'staff', role: 'role.infectionist' });
    const ward = citySite.rooms.find(r => r.type === 'room.ward')!;
    expect(deptWhy(db, ward, cityStaff)).toEqual({ dept: 'dept.therapy', by: 'type' });
    expect(deptWhy(db, { ...ward, dept: 'dept.surgery' }, cityStaff)).toEqual({ dept: 'dept.surgery', by: 'mark' });
    expect(deptWhy(db, citySite.rooms.find(r => r.type === 'room.lab')!, cityStaff)).toBeUndefined();
  });

  test('только отметки: план тот же — сцену не пересобирать; дверь, предмет, снос — пересобрать', () => {
    const ward = citySite.rooms.find(r => r.type === 'room.ward')!;
    const marked = markDept(db, citySite, ward.id, 'dept.surgery');
    if (!marked.ok) throw new Error('markDept');
    expect(onlyDeptsChanged(citySite, citySite)).toBe(true);
    expect(onlyDeptsChanged(citySite, marked.site)).toBe(true);
    const moved = { ...marked.site, rooms: marked.site.rooms.map(r => (r.id === ward.id ? { ...r, door: [...(r.door ?? [])] } : r)) };
    expect(onlyDeptsChanged(citySite, moved)).toBe(false);
    expect(onlyDeptsChanged(citySite, { ...marked.site, editing: ward.id })).toBe(false);
    expect(onlyDeptsChanged(citySite, { ...marked.site, rooms: marked.site.rooms.slice(1) })).toBe(false);
  });

  test('поток расчёта: отметка и её отмена — больница «та же» (`staffOnly`); перестройка — новая сцена', () => {
    const sim = createSim(db);
    const world = (r: FromSim) => (r.kind === 'slice' ? r.world : undefined);
    const first = sim.handle({ kind: 'start', seed: 1, season: 'winter', hospital: hospitalOf(db, citySite), staff: cityStaff, flow: FLOW, economy: { cash: startCash(db, 'preset') } });
    expect(world(first)?.staffOnly).toBeUndefined();
    const ward = citySite.rooms.find(r => r.type === 'room.ward')!.id;
    const site = (cmd: Command) => world(sim.handle({ kind: 'command', cmd }));
    const marked = site({ kind: 'site', cmd: { kind: 'dept', room: ward, dept: 'dept.surgery' } });
    expect(marked?.staffOnly).toBe(true);
    expect(marked?.hospital.site?.rooms.find(r => r.id === ward)?.dept).toBe('dept.surgery');
    expect(marked?.works?.undo).toBe(1);
    const undone = site({ kind: 'site', cmd: { kind: 'undo' } });
    expect(undone?.staffOnly).toBe(true);
    expect(undone?.hospital.site?.rooms.find(r => r.id === ward)?.dept).toBeUndefined();
    // перестройка: убрали растение — план другой, сцена — заново
    const r = citySite.rooms.find(x => x.items.some(i => i.kind === 'plant'))!;
    const rebuilt = site({ kind: 'site', cmd: { kind: 'remove', room: r.id, id: r.items.find(i => i.kind === 'plant')!.id } });
    expect(rebuilt).toBeDefined();
    expect(rebuilt?.staffOnly).toBeUndefined();
  });
});
