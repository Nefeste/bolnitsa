// Сценарий 3 «Хирургия» (spec docs/specs/2026-11-scenario-3.md), часть 1: начало — ваша больница из сценария 2 и свободная
// земля под хирургию (решение владельца #209, вариант 1); цели «срочные операции в срок» (без «подряд») и «ночная бригада»;
// срочные операции в срок, начатые ночью, — в итогах суток потока для ПК. Часть 2: запись сценария — первые больные ждут
// операционную (`tutorialRoom`), порядок стройки с третьей палатой и санитаром в операционной, цели, письма, подсказки;
// строка «Операции» на планёрке.
import { describe, expect, test } from 'bun:test';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { guideRows } from '../../src/app/scenario';
import { db } from '../../src/content';
import type { Mission } from '../../src/content/types';
import { missionProgress, roomWorks } from '../../src/engine/campaign/campaign';
import { addReady, EMPTY_LOT, emptySite, hospitalOf, type SiteCommand, widerLot } from '../../src/engine/hospital/site';
import { siteOfPlan } from '../../src/engine/hospital/site-plan';
import { siteOfPreset } from '../../src/engine/hospital/site-preset';
import { presetStaff, withNightShift } from '../../src/engine/hospital/staff';
import { apply, hospitalCtx, newFlowShift } from '../../src/engine/shift/engine';
import type { DaySummary, Flow, ShiftState, SurgeryDay } from '../../src/engine/shift/types';
import { T } from '../../src/i18n';
import { byGuide } from '../../src/ui/Scenario';
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

describe('сценарий 3: запись — первые больные, порядок стройки, цели, письма', () => {
  const sc = db.scenarios!['scenario.surgery'];
  const OR: SiteCommand = { kind: 'ready', type: 'room.or', size: 'M', x: 55, y: 6, rot: 0, staff: true };
  const WARD: SiteCommand = { kind: 'ready', type: 'room.ward', size: 'M', x: 64, y: 6, rot: 0, staff: true };
  const start = (seed: number) =>
    newFlowShift(db, { seed, season: 'winter', hospital: hospitalOf(db, built.site), staff: withNightShift(db, built.site.rooms, built.staff), flow: AUTO, scenario: sc.id });
  const site = (s: ShiftState, cmd: SiteCommand) => {
    const n = apply(db, s, { kind: 'site', cmd }).find(x => x.kind === 'site');
    if (!n || n.kind !== 'site' || !n.ok) throw new Error(`стройка: ${JSON.stringify(cmd)} — ${JSON.stringify(n)}`);
  };

  test('третий; начало — больница сценария 2 со свободной землёй, строят и операционную; сортирует медсестра; первые больные — к операционной', () => {
    expect([sc.order, sc.start, sc.sorts]).toEqual([3, 'site.emergency', undefined]);
    expect(sc.build).toEqual([...db.scenarios!['scenario.emergency'].build, 'room.or']);
    expect(sc.tutorialRoom).toEqual(['room.or']);
    expect(sc.tutorial.map(t => [t.condition, !!t.ambulance])).toEqual([['cond.appendicitis', true], ['cond.ankle_fracture', false], ['cond.strangulated_hernia', true]]);
    // всем троим нужна операция: аппендициту — в сутки, ущемлённой грыже — за 2 часа, нестабильному перелому лодыжек — без срока
    expect(sc.tutorial.map(t => db.conditions[t.condition].surgery?.window)).toEqual([24, undefined, 2]);
    expect(sc.tutorial[1].params).toEqual({ stability: 'unstable' });
    expect(sc.guide.map(g => [g.room, g.role, g.count])).toEqual([['room.or', undefined, undefined], ['room.ward', undefined, 3], ['room.or', 'role.orderly', undefined]]);
    expect(sc.missions.filter(m => m.main).map(m => m.kind)).toEqual(['roomWorks', 'operations', 'onTime']);
    // письма: заведующая хирургией — с начала; к вечеру без ночной бригады — подсказка `nightOr`
    expect(db.characters['char.head_surgeon'].name.en).toBe('Amara Obi');
    expect(sc.letters.find(l => l.from === 'char.head_surgeon' && l.when === 'start')).toBeDefined();
    expect(sc.letters.find(l => typeof l.when === 'object' && 'hint' in l.when)?.when).toEqual({ hint: 'nightOr' });
  });

  test('первые больные ждут операционную: до неё заданных нет, заработала — первый по скорой через две минуты, с аппендицитом; второй — пришедший сам, с переломом', () => {
    const s = start(5);
    const ambulance = () => Object.values(s.patients).some(p => p.kind === 'ambulance');
    while (s.t < 24 * H && !ambulance()) apply(db, s, { kind: 'advance', seconds: 60 });
    // скорая везёт, сами идут, а заданных нет
    expect(ambulance()).toBe(true);
    expect(Object.values(s.patients).some(p => p.kind === 'walkIn')).toBe(true);
    expect(Object.values(s.patients).some(p => p.taught)).toBe(false);
    const at = s.t;
    site(s, OR);
    apply(db, s, { kind: 'site', cmd: { kind: 'done' } });
    while (s.t < at + 10 * 60 && !s.campaign!.taught) apply(db, s, { kind: 'advance', seconds: 60 });
    const first = Object.values(s.patients).find(p => p.taught)!;
    expect([first.kind, first.arriveT, first.patient.truth.conditions[0].id]).toEqual(['ambulance', at + 120, 'cond.appendicitis']);
    while (s.t < at + 12 * H && (s.campaign!.taught ?? 0) < 2) apply(db, s, { kind: 'advance', seconds: 60 });
    const second = Object.values(s.patients).find(p => p.taught && p.id !== first.id)!;
    expect([second.kind, second.patient.truth.conditions[0].id]).toEqual(['walkIn', 'cond.ankle_fracture']);
  }, 120_000);

  test('порядок стройки: операционная, третья палата, санитар в операционной; в каталоге — одна строка операционной', () => {
    const s = start(6);
    const steps = () => sc.guide.map(g => roomWorks(db, s, g.room, g.role, g.count));
    expect(steps()).toEqual([false, false, false]);
    site(s, OR);
    site(s, WARD);
    apply(db, s, { kind: 'site', cmd: { kind: 'done' } });
    expect(steps()).toEqual([true, true, true]);
    // каталог: у операционной два шага — строка одна, на месте первого; её шаг — первый несделанный, а сделаны оба — первый
    const rows = ['room.ward', 'room.or', 'room.office'].map(id => ({ id }));
    const view = (done: boolean[]) => ({ guide: { on: true, steps: guideRows(db, sc, sc.guide.map((g, i) => ({ room: g.room, done: done[i] }))) } }) as Parameters<typeof byGuide>[1];
    const out = (done: boolean[]) => byGuide(rows, view(done)).map(x => [x.row.id, x.step?.n]);
    expect(out([false, false, false])).toEqual([['room.or', 1], ['room.ward', 2], ['room.office', undefined]]);
    expect(out([true, false, false])).toEqual([['room.or', 3], ['room.ward', 2], ['room.office', undefined]]);
    expect(out([true, true, true])).toEqual([['room.or', 1], ['room.ward', 2], ['room.office', undefined]]);
    expect(guideRows(db, sc, sc.guide.map(g => ({ room: g.room, done: false })))[1].name).toBe('Палата для оперированных');
  }, 120_000);

  test('планёрка: строка «Операции» — сделано, срочные в срок и поздно, в срок ночью, осложнения', () => {
    expect(T.meeting.surgery(3, 2, 1, 1, 1)).toBe('операции: 3, срочные — в срок 2, поздно 1 (в срок ночью — 1); осложнения после операции — 1');
    expect(T.meeting.surgery(1, 0, 0, 0, 0)).toBe('операции: 1');
  });

  test('загрузчик: помещение обучения — из тех, что строят; шаг числом — с именем и не сделан с начала; шаги не повторяются', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bolnitsa-content-'));
    try {
      cpSync(CONTENT_DIR, dir, { recursive: true });
      const file = join(dir, 'campaign/scenarios/surgery.yaml');
      const text = readFileSync(file, 'utf8');
      for (const anchor of ['tutorialRoom: room.or\n', 'guide:\n']) if (!text.includes(anchor)) throw new Error(`в записи нет ${anchor}`);
      writeFileSync(
        file,
        text
          .replace('tutorialRoom: room.or\n', 'tutorialRoom: [room.or, room.icu]\n')
          .replace('guide:\n', 'guide:\n  - { room: room.ward, count: 2, name: { ru: "Палата", en: "Ward" }, why: { ru: "нужна", en: "needed" } }\n  - { room: room.or, why: { ru: "нужна", en: "needed" } }\n'),
      );
      expect(buildDb(dir).errors.filter(e => e.startsWith('scenario.surgery:')).sort()).toEqual([
        'scenario.surgery: помещение обучения room.icu в сценарии не построить',
        'scenario.surgery: порядок стройки: room.or повторяется',
        'scenario.surgery: порядок стройки: шаг room.ward числом 2 сделан с начала',
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);
});
