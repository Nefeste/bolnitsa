// Сценарий 2 «Приёмное», часть 1а (spec docs/specs/2026-11-scenario-2.md): движок. Привезённых скорой сортируете вы, по листу
// передачи (решение владельца #196): они ждут вашей команды `sort`, нанятые врачи их не зовут; ваша сортировка — в счёт суток
// и цели, ошибка — недооценил или переоценил по шкале; отдали медсестре — она сортирует ждущих сразу, и они в цель не идут.
// Ночь суток — привезённые с конца дневной смены до планёрки и кто дольше всех ждал врача. Цели «сутки без ошибок вашей
// сортировки» и «N ночей подряд, когда врач звал быстро».
// Готовая городская больница: смотровая на три места, ночная смена.
import { describe, expect, test } from 'bun:test';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { db } from '../../src/content';
import type { ContentDb, Mission, Scenario } from '../../src/content/types';
import { missionProgress } from '../../src/engine/campaign/campaign';
import { hospitalOf, type SiteCommand } from '../../src/engine/hospital/site';
import { siteOfPlan } from '../../src/engine/hospital/site-plan';
import { siteOfPreset } from '../../src/engine/hospital/site-preset';
import { presetStaff, withNightShift } from '../../src/engine/hospital/staff';
import { apply, hospitalCtx, newFlowShift, siteOpen } from '../../src/engine/shift/engine';
import { startCash } from '../../src/engine/shift/money';
import { type DaySummary, DAY, type ShiftPatient, type ShiftState, type Triage } from '../../src/engine/shift/types';
import { buildDb, CONTENT_DIR } from '../content/load';

const H = 3600;
const rec = db.presets['preset.city'];
const site = siteOfPreset(db, rec);
const city = (seed: number, sorts = false): ShiftState =>
  newFlowShift(db, {
    seed, season: 'winter', hospital: hospitalOf(db, site), staff: withNightShift(db, site.rooms, presetStaff(db, rec)), flow: { perHour: 0, auto: true },
    economy: { cash: startCash(db, 'preset') }, ...(sorts ? { sorts: true } : {}),
  });

/** Жить минутами, пока `stop` не скажет «хватит», но не дольше `hours`; `base` — база, с которой смена начата. */
function liveUntil(s: ShiftState, hours: number, stop: () => boolean, base: ContentDb = db) {
  while (s.t < hours * H && !stop()) apply(base, s, { kind: 'advance', seconds: 60 });
}

const waitingAmbulance = (s: ShiftState): ShiftPatient[] =>
  Object.values(s.patients).filter(p => p.kind === 'ambulance' && p.status === 'waiting' && !p.sorted).sort((a, b) => a.arriveT - b.arriveT || (a.id < b.id ? -1 : 1));
const wrong = (t: Triage): Triage => (t === 'red' ? 'green' : 'red');

describe('сценарий 2: вы сортируете привезённых (решение владельца #196)', () => {
  test('привезённый ждёт вашей сортировки, нанятые врачи его не зовут; без вас — медсестра сортирует сразу', () => {
    const s = city(1, true);
    expect(s.meta.sorts).toBe(true);
    liveUntil(s, 40, () => waitingAmbulance(s).length > 0);
    const [p] = waitingAmbulance(s);
    expect(p).toBeDefined();
    // час ждёт: не отсортирован, никто не позвал
    const until = s.t + H;
    while (s.t < until) apply(db, s, { kind: 'advance', seconds: 60 });
    expect(p.sorted).toBe(false);
    expect(p.calledT).toBeUndefined();
    expect(s.queue).not.toContain(p.id);
    // без вас — сразу по шкале
    const other = city(1);
    expect(other.meta.sorts).toBeUndefined();
    liveUntil(other, 40, () => Object.values(other.patients).some(q => q.kind === 'ambulance'));
    const q = Object.values(other.patients).find(x => x.kind === 'ambulance')!;
    expect(q.sorted).toBe(true);
    expect(q.triage).toBe(q.scale!.triage);
    expect(other.summary.ambulance!.mine).toBeUndefined();
  }, 120_000);

  test('ваша сортировка: верно — в счёт, ошибка — недооценил или переоценил; отсортированного зовёт нанятый врач', () => {
    const s = city(2, true);
    liveUntil(s, 56, () => waitingAmbulance(s).length >= 2);
    const [a, b] = waitingAmbulance(s);
    expect(b).toBeDefined();
    const day = () => s.summary.ambulance!;
    apply(db, s, { kind: 'sort', id: a.id, triage: a.scale!.triage });
    expect(a.sorted).toBe(true);
    expect(day().mine).toBe(1);
    expect(day().under + day().over).toBe(0);
    apply(db, s, { kind: 'sort', id: b.id, triage: wrong(b.scale!.triage) });
    expect(day().mine).toBe(2);
    expect(day().under + day().over).toBe(1);
    // повторно — ничего
    apply(db, s, { kind: 'sort', id: a.id, triage: 'green' });
    expect(day().mine).toBe(2);
    // отсортированных зовут нанятые врачи
    liveUntil(s, s.t / H + 6, () => a.calledT !== undefined && b.calledT !== undefined);
    expect(a.calledT).toBeDefined();
  }, 120_000);

  test('«Пусть сортирует медсестра»: ждущие — сразу по шкале и не в вашу цель; дальше — тоже она', () => {
    const s = city(3, true);
    liveUntil(s, 56, () => waitingAmbulance(s).length > 0);
    const waiting = waitingAmbulance(s);
    const sorted = s.summary.ambulance?.sorted ?? 0;
    apply(db, s, { kind: 'sorts', on: false });
    expect(s.meta.sorts).toBeUndefined();
    for (const p of waiting) {
      expect(p.sorted).toBe(true);
      expect(p.triage).toBe(p.scale!.triage);
      expect(s.queue).toContain(p.id);
    }
    expect(s.summary.ambulance!.sorted).toBe(sorted + waiting.length);
    expect(s.summary.ambulance!.mine).toBeUndefined();
    // снова вы — следующий ждёт вас
    apply(db, s, { kind: 'sorts', on: true });
    liveUntil(s, 80, () => waitingAmbulance(s).length > 0);
    expect(waitingAmbulance(s).length).toBeGreaterThan(0);
  }, 120_000);
});

describe('сценарий 2: ночь суток', () => {
  test('ночь — привезённые с 20:00 до планёрки, дольше всех ждал врача — по приезду и вызову, кого не позвали — до 08:00', () => {
    const s = city(4);
    while (s.t < 56 * H) apply(db, s, { kind: 'advance', seconds: 60 });
    // ночи первых и вторых суток — по всем привезённым, в состоянии и в журнале
    for (const h of s.history) {
      const from = (h.day - 1) * DAY + 20 * H;
      const to = h.day * DAY + 8 * H;
      const rows = [...Object.values(s.patients), ...(s.gone ?? [])].filter(p => p.kind === 'ambulance' && p.arriveT >= from && p.arriveT < to);
      const ids = new Set(rows.map(r => r.id));
      if (ids.size === 0) {
        expect(h.night).toBeUndefined();
        continue;
      }
      expect(h.night!.arrived).toBe(ids.size);
      const waits = rows.map(r => Math.round(((r.calledT ?? to) - r.arriveT) / 60));
      expect(h.night!.wait).toBe(Math.max(...waits));
      expect(h.night!.unseen ?? 0).toBe(rows.filter(r => r.calledT === undefined).length);
    }
    expect(s.history.some(h => h.night)).toBe(true);
  }, 300_000);
});

describe('сценарий 2: цели', () => {
  const day = (n: number, extra: Partial<DaySummary>): DaySummary => ({ ...s0.summary, day: n, ...extra });
  const s0 = city(5);
  const view = (history: DaySummary[]) => ({ campaign: { chapter: 'scenario.test', since: 0, done: {}, letters: [] }, history });
  const sorting: Mission = { id: 'sort', main: true, text: { ru: '' }, kind: 'sorting', count: 4 };
  const nights: Mission = { id: 'night', main: true, text: { ru: '' }, kind: 'nights', count: 3, minutes: 15 };

  test('сортировка: лучшие сутки без ошибок — сколько отсортировали вы; ошибка или медсестра — не в счёт', () => {
    const amb = (mine: number, under = 0, over = 0, sorted = mine) => ({ ambulance: { arrived: sorted, sorted, under, over, ...(mine ? { mine } : {}) } });
    expect(missionProgress(db, view([day(1, amb(3)), day(2, amb(5, 1)), day(3, amb(0, 0, 0, 6))]), sorting)).toMatchObject({ value: 3, target: 4, done: false });
    expect(missionProgress(db, view([day(1, amb(3)), day(2, amb(4))]), sorting)).toMatchObject({ value: 4, done: true });
    expect(missionProgress(db, view([day(1, amb(6, 0, 1))]), sorting)).toMatchObject({ value: 0, done: false });
  });

  test('ночи: подряд от последних суток; ночь без привезённых не рвёт и не продолжает; долго — рвёт, и кого не позвали до утра', () => {
    const n = (wait: number, unseen?: number) => ({ night: { arrived: 2, wait, ...(unseen ? { unseen } : {}) } });
    expect(missionProgress(db, view([day(1, n(5)), day(2, {}), day(3, n(10)), day(4, n(15))]), nights)).toMatchObject({ value: 3, done: true });
    expect(missionProgress(db, view([day(1, n(5)), day(2, n(16)), day(3, n(10)), day(4, n(3))]), nights)).toMatchObject({ value: 2, done: false });
    // не позвали до утра: ожидание — до 08:00; привезли за две минуты до планёрки — не в укор, с ночи — рвёт
    expect(missionProgress(db, view([day(1, n(5)), day(2, n(5)), day(3, n(2, 1))]), nights)).toMatchObject({ value: 3, done: true });
    expect(missionProgress(db, view([day(1, n(5)), day(2, n(5)), day(3, n(240, 1))]), nights)).toMatchObject({ value: 0, done: false });
  });
});

// Часть 1б (spec docs/specs/2026-11-scenario-2.md, «Часть 1б: как сделано»): готовая амбулатория сценария 2 (решение владельца
// #197) и привезённые скорой среди заданных больных.
const amb = siteOfPlan(db, db.sites!['site.ambulatory']);
/** Крыло приёмного: смотровая на два места у входа скорой, рентген, две палаты — готовыми помещениями «С персоналом». */
const WING: SiteCommand[] = [
  { kind: 'ready', type: 'room.emergency', size: 'M', x: 42, y: 27, rot: 2, staff: true },
  { kind: 'ready', type: 'room.xray', size: 'M', x: 32, y: 16, rot: 2, staff: true },
  { kind: 'ready', type: 'room.ward', size: 'M', x: 30, y: 6, rot: 0, staff: true },
  { kind: 'ready', type: 'room.ward', size: 'M', x: 38, y: 6, rot: 0, staff: true },
];
function build(base: ContentDb, s: ShiftState, cmds: SiteCommand[]) {
  for (const cmd of cmds) {
    const n = apply(base, s, { kind: 'site', cmd }).find(x => x.kind === 'site');
    expect([cmd.kind, 'type' in cmd ? cmd.type : '', n && n.kind === 'site' && n.ok]).toEqual([cmd.kind, 'type' in cmd ? cmd.type : '', true]);
  }
  apply(base, s, { kind: 'site', cmd: { kind: 'done' } });
}

describe('сценарий 2: готовая амбулатория (решение владельца #197)', () => {
  test('строится, ваш кабинет — первый, работает всё; в свободное крыло встают смотровая, рентген и две палаты — и работают', () => {
    expect(amb.ok).toBe(true);
    if (!amb.ok) return;
    expect(amb.site.rooms.map(r => r.type).sort()).toEqual(
      ['room.ecg', 'room.lab', 'room.office', 'room.office', 'room.procedure', 'room.reception', 'room.staff', 'room.toilet', 'room.triage', 'room.waiting'],
    );
    expect(amb.site.mine).toBe(amb.site.rooms[0].id);
    // крыла нет — скорая не приезжает
    const s = newFlowShift(db, { seed: 7, season: 'winter', hospital: hospitalOf(db, amb.site), staff: amb.staff, flow: { perHour: 0, auto: true }, economy: { cash: 2_000_000 } });
    expect(siteOpen(db, s, 'walk')).toBe(true);
    expect(siteOpen(db, s, 'amb')).toBe(false);
    build(db, s, WING);
    const ctx = hospitalCtx(db, s);
    for (const r of ctx.plan.rooms) expect([r.type, ctx.working.has(r.id)]).toEqual([r.type, true]);
    expect(siteOpen(db, s, 'amb')).toBe(true);
    // скорая приезжает и кладёт привезённого на место в смотровой
    liveUntil(s, 40, () => Object.values(s.patients).some(p => p.kind === 'ambulance' && p.bay));
    expect(Object.values(s.patients).some(p => p.kind === 'ambulance' && p.bay)).toBe(true);
  }, 120_000);
});

describe('сценарий 2: привезённые скорой среди заданных больных', () => {
  // сценарий для проверки: готовая амбулатория, первый заданный — с пневмонией по скорой, второй — с переломом, сам
  const sc: Scenario = {
    ...db.scenarios!['scenario.ambulatory'], id: 'scenario.test', order: 99, start: 'site.ambulatory', sorts: true,
    build: [...db.scenarios!['scenario.ambulatory'].build, 'room.emergency', 'room.xray', 'room.ward'],
    tutorial: [{ condition: 'cond.pneumonia_cap', ambulance: true, params: { severity: 'severe' } }, { condition: 'cond.ankle_fracture' }],
    letters: [], guide: [], tips: [],
  };
  const tdb: ContentDb = { ...db, scenarios: { ...db.scenarios, [sc.id]: sc } };

  test('первый заданный по скорой — через две минуты после того, как заработала смотровая, и он ваш; до неё пришедшие сами — обычные; второй, пришедший сам, — следом', () => {
    if (!amb.ok) throw new Error('амбулатория не строится');
    const s = newFlowShift(tdb, { seed: 8, season: 'winter', hospital: hospitalOf(tdb, amb.site), staff: amb.staff, flow: { perHour: 0, auto: true }, scenario: sc.id });
    // до смотровой: пришедшие сами есть, заданных нет — следующий заданный по скорой
    liveUntil(s, 10, () => false, tdb);
    const walkIns = Object.values(s.patients).filter(p => p.kind === 'walkIn');
    expect(walkIns.length).toBeGreaterThan(0);
    expect(walkIns.every(p => !p.taught)).toBe(true);
    expect(s.campaign!.taught ?? 0).toBe(0);
    // построили крыло — первый привезённый через две минуты, заданный, с пневмонией
    const built = s.t;
    build(tdb, s, WING);
    liveUntil(s, 12, () => Object.values(s.patients).some(p => p.kind === 'ambulance'), tdb);
    const first = Object.values(s.patients).find(p => p.kind === 'ambulance')!;
    expect(first.arriveT).toBe(built + 120);
    expect(first.taught).toBe(true);
    expect(first.patient.truth.conditions[0].id).toBe('cond.pneumonia_cap');
    expect(s.campaign!.taught).toBe(1);
    // он ваш: ждёт вашей сортировки, нанятые врачи его не зовут — ни до неё, ни после
    liveUntil(s, 11, () => false, tdb);
    expect([first.status, !!first.sorted, first.by, first.calledT]).toEqual(['waiting', false, undefined, undefined]);
    apply(tdb, s, { kind: 'sort', id: first.id, triage: 'red' });
    liveUntil(s, s.t / H + 1, () => false, tdb);
    expect([first.status, !!first.sorted, first.by, first.calledT]).toEqual(['waiting', true, undefined, undefined]);
    // вы зовёте — приём ваш
    apply(tdb, s, { kind: 'call', id: first.id });
    for (let i = 0; i < 3600 && s.meet !== undefined; i++) apply(tdb, s, { kind: 'advance', seconds: 5 });
    expect([s.current, s.meet]).toEqual([first.id, undefined]);
    // следующий пришедший сам — заданный, с переломом
    liveUntil(s, 20, () => (s.campaign!.taught ?? 0) >= 2, tdb);
    const second = Object.values(s.patients).find(p => p.taught && p.kind === 'walkIn')!;
    expect(second.patient.truth.conditions[0].id).toBe('cond.ankle_fracture');
    // сценарий 1 — как прежде: первый заданный пришёл сам
    const one = newFlowShift(db, { seed: 8, season: 'winter', hospital: hospitalOf(db, amb.site), staff: amb.staff, flow: { perHour: 0, auto: true }, scenario: 'scenario.ambulatory' });
    liveUntil(one, 10, () => (one.campaign!.taught ?? 0) > 0);
    expect(Object.values(one.patients).find(p => p.taught)!.kind).toBe('walkIn');
  }, 120_000);

  test('загрузчик: привезённый скорой среди заданных — только где строят смотровую приёмного', () => {
    /** Ошибки сборки базы, где в записи сценария 1 `from` заменено на `to`. */
    const broken = (...pairs: [string, string][]): string[] => {
      const dir = mkdtempSync(join(tmpdir(), 'bolnitsa-content-'));
      try {
        cpSync(CONTENT_DIR, dir, { recursive: true });
        const file = join(dir, 'campaign/scenarios/ambulatory.yaml');
        let text = readFileSync(file, 'utf8');
        for (const [from, to] of pairs) {
          if (!text.includes(from)) throw new Error(`в записи нет «${from}»`);
          text = text.replace(from, to);
        }
        writeFileSync(file, text);
        return buildDb(dir).errors.filter(e => e.includes('болезнь обучения'));
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    };
    const amb: [string, string] = ['tutorial: [cond.arvi,', 'tutorial: [{ condition: cond.arvi, ambulance: true },'];
    expect(broken(amb)).toEqual(['scenario.ambulatory: болезнь обучения cond.arvi: привезённый скорой, а смотровой приёмного в сценарии нет']);
    expect(broken(amb, ['build: [room.reception,', 'build: [room.emergency, room.reception,'])).toEqual([]);
  }, 120_000);
});
