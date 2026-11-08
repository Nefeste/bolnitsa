// Сценарий 3 «Хирургия» (spec docs/specs/2026-11-scenario-3.md), часть 1: начало — ваша больница из сценария 2 и свободная
// земля под хирургию (решение владельца #209, вариант 1); цели «срочные операции в срок» (без «подряд») и «ночная бригада»;
// срочные операции в срок, начатые ночью, — в итогах суток потока для ПК.
import { describe, expect, test } from 'bun:test';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { db } from '../../src/content';
import type { Mission } from '../../src/content/types';
import { missionProgress } from '../../src/engine/campaign/campaign';
import { addReady, EMPTY_LOT, emptySite, hospitalOf, widerLot } from '../../src/engine/hospital/site';
import { siteOfPlan } from '../../src/engine/hospital/site-plan';
import { siteOfPreset } from '../../src/engine/hospital/site-preset';
import { presetStaff, withNightShift } from '../../src/engine/hospital/staff';
import { apply, hospitalCtx, newFlowShift } from '../../src/engine/shift/engine';
import type { DaySummary, Flow, ShiftState, SurgeryDay } from '../../src/engine/shift/types';
import { buildDb, CONTENT_DIR } from '../content/load';

const AUTO: Flow = { perHour: 0, auto: true };
const H = 3600;
const built = (() => {
  const p = siteOfPlan(db, db.sites!['site.emergency']);
  if (!p.ok) throw new Error(`site.emergency: ${p.error.kind}`);
  return p;
})();

describe('сценарий 3: начало — ваша больница из сценария 2 со свободной землёй', () => {
  test('амбулатория сценария 2 — первой; крыло приёмного и кабинет хирурга с амбулаторным хирургом; корпус шире на 20 клеток', () => {
    const amb = db.sites!['site.ambulatory'];
    const p = db.sites!['site.emergency'];
    expect(p.rooms.slice(0, amb.rooms.length)).toEqual(amb.rooms);
    expect(p.benches!.slice(0, amb.benches!.length)).toEqual(amb.benches!);
    expect(p.rooms.slice(amb.rooms.length).map(r => r.type)).toEqual(['room.emergency', 'room.ward', 'room.ward', 'room.xray', 'room.office', 'room.staff']);
    const lot = widerLot(20);
    expect([built.site.w, built.site.h]).toEqual([lot.w, lot.h]);
    // главный вход — там же, где у пустого здания; вход скорой — в новой восточной стене
    expect(built.site.main).toEqual(emptySite().main);
    expect(built.site.ambulance.every(([x]) => x === lot.building.x + lot.building.w - 1)).toBe(true);
    // на месте врача кабинета хирурга — амбулаторный хирург, а не нанятый терапевт
    const office = built.site.rooms[amb.rooms.length + 4];
    expect(built.staff.filter(m => m.room === office.id).map(m => m.role)).toEqual(['role.surgeon_clinic']);
  });

  test('свободная земля: операционная и палата для оперированных встают в новой части корпуса', () => {
    const or = addReady(db, built.site, 'room.or', 'M', 55, 6, 0);
    expect(or.ok).toBe(true);
    if (!or.ok) return;
    expect(addReady(db, or.site, 'room.ward', 'M', 64, 6, 0).ok).toBe(true);
  });

  test('пустое здание — то же: участок без расширения — его, `emptySite()` — как было', () => {
    expect(widerLot(0)).toEqual(EMPTY_LOT);
    expect(emptySite(widerLot(0))).toEqual(emptySite());
  });

  test('в игре — как готовая больница: санитары, ночная смена, ночной врач для привезённых; все помещения работают', () => {
    const staff = withNightShift(db, built.site.rooms, built.staff);
    expect(staff.filter(m => m.role === 'role.orderly').length).toBeGreaterThan(0);
    expect(staff.some(m => m.shift === 'night' && db.roles[m.role]?.stands === 'role.doctor')).toBe(true);
    const s = newFlowShift(db, { seed: 3, season: 'winter', hospital: hospitalOf(db, built.site), staff, flow: AUTO, economy: { cash: 300_000 } });
    expect(hospitalCtx(db, s, 10 * H).working.size).toBe(built.site.rooms.length);
  });
});

describe('сценарий 3: цели сроков', () => {
  const view = (surgery: (Partial<SurgeryDay> | undefined)[]) => ({
    campaign: { chapter: 'scenario.emergency', since: 0, done: {}, letters: [] },
    history: surgery.map((x, i): DaySummary => ({ ...newFlowShift(db, { seed: 1, season: 'winter', hospital: hospitalOf(db, built.site), staff: [], flow: AUTO }).summary, day: i + 1, ...(x ? { surgery: { done: 0, onTime: 0, late: 0, complications: 0, ...x } } : {}) })),
  });

  test('«срочные операции в срок» — за сценарий, без «подряд»: опоздание счёт не обнуляет', () => {
    const m: Mission = { id: 'o', main: true, text: { ru: '' }, kind: 'onTime', count: 5 };
    expect(missionProgress(db, view([{ onTime: 2 }, { onTime: 1, late: 1 }, undefined, { onTime: 1 }]), m)).toMatchObject({ value: 4, target: 5, done: false });
    expect(missionProgress(db, view([{ onTime: 2 }, { onTime: 1, late: 1 }, undefined, { onTime: 2 }]), m)).toMatchObject({ value: 5, done: true });
  });

  test('«ночная бригада» — срочные операции в срок, начатые ночью', () => {
    const m: Mission = { id: 'n', main: false, text: { ru: '' }, kind: 'nightOps', count: 1 };
    expect(missionProgress(db, view([{ onTime: 3 }, { onTime: 1, late: 2 }]), m)).toMatchObject({ value: 0, done: false });
    expect(missionProgress(db, view([{ onTime: 3 }, { onTime: 1, night: 1 }]), m)).toMatchObject({ value: 1, done: true });
  });

  test('загрузчик: цели операций — где можно построить операционную', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bolnitsa-content-'));
    try {
      cpSync(CONTENT_DIR, dir, { recursive: true });
      const file = join(dir, 'campaign/scenarios/emergency.yaml');
      const text = readFileSync(file, 'utf8');
      const anchor = 'missions:\n';
      if (!text.includes(anchor)) throw new Error('в записи нет missions');
      writeFileSync(file, text.replace(anchor, `${anchor}  - { id: ontime, main: false, kind: onTime, count: 5, text: { ru: "Срочные в срок", en: "Urgent on time" } }\n`));
      expect(buildDb(dir).errors.filter(e => e.startsWith('scenario.emergency: задание ontime'))).toEqual(['scenario.emergency: задание ontime: в сценарии не построить операционную']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);
});

describe('сценарий 3: ночные операции в итогах суток', () => {
  test('в потоке для ПК: в срок и начатые в ночную смену — `night`, не больше сделанных в срок', () => {
    const rec = db.presets['preset.city'];
    const site = siteOfPreset(db, rec);
    const s: ShiftState = newFlowShift(db, { seed: 1, season: 'winter', hospital: hospitalOf(db, site), staff: withNightShift(db, site.rooms, presetStaff(db, rec)), flow: AUTO, economy: { cash: 1_000_000 } });
    apply(db, s, { kind: 'site', cmd: { kind: 'done' } });
    while (s.t < (24 + 8) * H) apply(db, s, { kind: 'advance', seconds: 600 });
    const day = s.history[0].surgery!;
    expect(day.night).toBeGreaterThan(0);
    expect(day.night!).toBeLessThanOrEqual(day.onTime);
  }, 120_000);
});
