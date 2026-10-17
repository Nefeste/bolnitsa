// из anamnez: tools/test/rsc.test.ts @ f86709f, изменено: только «фибрилляция после полуночи — ночь суток поступления» и её помощники, `hospitalDay` — из `day.ts` (Nefeste/anamnez#152)
// Фибрилляция желудочков у лежащего (spec 2026-10-chapter-3 «Анамнеза», часть 39б) — в ночь тех суток больницы, на
// которые она пришлась, и в сменах «Анамнеза»: сутки — с 08:00 до 08:00 (`hospitalDay`), как в потоке для ПК
// (spec 2026-10-day). Прежде смены «Анамнеза» считали её сутки по полуночи, и после полуночи она приходила ночью позже.
import { describe, expect, test } from 'bun:test';
import { db } from '../../src/content';
import type { Id } from '../../src/content/types';
import { generatePatient } from '../../src/engine/med/generate';
import type { Patient } from '../../src/engine/med/types';
import { hospitalDay } from '../../src/engine/shift/day';
import { apply, arrestAfter, newCampaign, newSandbox } from '../../src/engine/shift/engine';
import { DAY, SHIFT_END, type ShiftPatient, type ShiftState } from '../../src/engine/shift/types';

const ACS = 'cond.acs';
const ONSET = 'hx.onset_hours';
const ED = ['dept.therapy', 'dept.surgery', 'dept.trauma'];

const acs = (seed: number, params: Record<string, string> = {}) =>
  generatePatient(db, seed, { department: 'dept.therapy', departments: ED, season: 'winter', primary: ACS, params });
/** Больные с подъёмом ST подряд по зёрнам — с этими значениями параметров. */
function stemis(n: number, params: Record<string, string> = {}, from = 1): Patient[] {
  return Array.from({ length: n }, (_, i) => acs(from + i, { type: 'stemi', ...params }));
}

/** Районная больница главы 2, открыт первый день. */
function district(seed: number): ShiftState {
  const s = newCampaign(db, { seed, season: 'winter', career: 1, chapter: 'chapter.hospital' });
  apply(db, s, { kind: 'nextDay' });
  return s;
}

function close(s: ShiftState, p: ShiftPatient, setting: 'ambulance' | 'admit' | 'icu', treatments: Id[] = []) {
  for (const tx of treatments) apply(db, s, { kind: 'toggleTreatment', id: tx });
  apply(db, s, { kind: 'diagnose', id: p.patient.truth.conditions[0].id });
  apply(db, s, { kind: 'setting', setting });
  apply(db, s, { kind: 'finish' });
}

describe('фибрилляция после полуночи — ночь суток поступления', () => {
  test('сутки смены — с 08:00 до 08:00: ночь после смены — её сутки', () => {
    const at = (day: number, h: number, m = 0) => (day - 1) * DAY + h * 3600 + m * 60;
    expect([at(1, 8), at(1, 14), at(1, 23, 59), at(2, 0), at(2, 7, 59)].map(hospitalDay)).toEqual([1, 1, 1, 1, 1]);
    expect([at(2, 8), at(3, 3), at(3, 8)].map(hospitalDay)).toEqual([2, 2, 3]);
  });

  /** Сколько секунд после полуночи — фибрилляция: позже часа ночи её не бывает (приходят до 14:00, окно — 11 часов). */
  const AFTER = 5 * 60;

  /**
   * Тот, кого ещё ждут, — больной с подъёмом ST (начало — час назад), у которого фибрилляция придётся на 00:05 после
   * суток смены. Приходят до 14:00, скорая — до 13:30, а окно фибрилляции — 11 часов от прихода: после полуночи
   * она сама по себе — у одного больного из тысяч, поэтому его приход в плане дня переставлен на нужный час смены.
   * Нет такого — undefined.
   */
  function vfAfterMidnight(s: ShiftState, kind?: ShiftPatient['kind']): ShiftPatient | undefined {
    const patient = stemis(40).find(x => x.truth.values[ONSET] === 1 && x.truth.risks.length === 0)!;
    for (const q of Object.values(s.patients)) {
      if (q.status !== 'coming' || (kind && q.kind !== kind)) continue;
      const vf = arrestAfter(db, s, { ...q, patient });
      if (vf === undefined) continue;
      const t = s.day * DAY + AFTER - vf;
      if (t <= s.t || t >= (s.day - 1) * DAY + SHIFT_END) continue;
      q.patient = patient;
      q.arriveT = t;
      s.events = s.events.filter(e => !(e.event.kind === 'arrive' && e.event.id === q.id));
      const i = s.events.findIndex(e => e.t > t);
      s.events.splice(i < 0 ? s.events.length : i, 0, { t, seq: s.seq++, event: { kind: 'arrive', id: q.id } });
      return q;
    }
    return undefined;
  }

  test('в палате без монитора — смерть в ночь суток поступления, а не следующих', () => {
    for (let seed = 1; seed < 301; seed++) {
      const s = district(seed);
      const p = vfAfterMidnight(s, 'ambulance');
      if (!p) continue;
      apply(db, s, { kind: 'advance', seconds: p.arriveT - s.t });
      apply(db, s, { kind: 'sort', id: p.id, triage: p.scale!.triage });
      apply(db, s, { kind: 'call', id: p.id });
      close(s, p, 'admit');
      const stay = s.patients[p.id].stay!;
      expect(arrestAfter(db, s, p)! + p.arriveT).toBe(s.day * DAY + AFTER);
      // сутки поступления — нулевые: ночь с первого дня на второй
      expect(stay.dies).toBe(0);
      apply(db, s, { kind: 'closeDay' });
      expect(s.patients[p.id].closed!.outcome).toMatchObject({ kind: 'died', day: 0 });
      expect(s.patients[p.id].closed!.stay!.end).toBe('died');
      return;
    }
    throw new Error('за 300 зёрен не нашлось');
  });

  test('в ПИТ — разряд в ночь суток поступления, а не следующих', () => {
    for (let seed = 21; seed < 121; seed++) {
      const s = newSandbox(db, { seed, season: 'winter', start: 'clinic', budget: db.economy.sandbox.budgets.generous });
      const cells: [number, number][] = [];
      for (let x = 29; x <= 38; x++) for (let y = 7; y <= 9; y++) cells.push([x, y]);
      apply(db, s, { kind: 'build', cmd: { kind: 'corridor', cells } });
      apply(db, s, { kind: 'build', cmd: { kind: 'room', type: 'room.icu', size: 'S', x: 29, y: 0, rot: 0 } });
      const icu = s.hospital!.rooms[s.hospital!.rooms.length - 1].id;
      for (let i = 0; i < 2; i++) apply(db, s, { kind: 'build', cmd: { kind: 'buy', room: icu, equipment: 'eq.monitor_defib' } });
      apply(db, s, { kind: 'buildEnd' });
      apply(db, s, { kind: 'assign', id: s.staff!.find(m => m.role === 'role.nurse' && m.room === 'r7')!.id, room: icu });
      const c = s.candidates!.find(x => x.role === 'role.anesthetist')!;
      apply(db, s, { kind: 'hire', id: c.id });
      apply(db, s, { kind: 'assign', id: c.id, room: icu });
      apply(db, s, { kind: 'nextDay' });
      const p = vfAfterMidnight(s);
      if (!p) continue;
      apply(db, s, { kind: 'advance', seconds: p.arriveT - s.t });
      if (s.patients[p.id].status !== 'waiting' || s.patients[p.id].by) continue;
      apply(db, s, { kind: 'call', id: p.id });
      close(s, p, 'icu');
      const stay = s.patients[p.id].stay!;
      expect(arrestAfter(db, s, p)! + p.arriveT).toBe(s.day * DAY + AFTER);
      // строка обхода — первым утром (`shock + 1`), а не вторым
      expect(stay.shock).toBe(0);
      expect(stay.dies).toBeUndefined();
      apply(db, s, { kind: 'closeDay' });
      expect(s.patients[p.id].status).toBe('admitted');
      return;
    }
    throw new Error('за 100 зёрен не нашлось');
  });
});
