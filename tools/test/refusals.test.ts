// Отказы в госпитализации (spec docs/specs/2026-11-scenario-5.md, часть 1): в итогах суток потока для ПК — отправленные в другую
// больницу, кому по базе нужна койка: своя такого вида вся занята («мест нет») или таких нет («своих нет»); по виду места и по
// главной болезни. Счёт движка — тот же, что у проб (tools/bench/refused.ts) по путям больных; строка планёрки — по порядку мест.
import { describe, expect, test } from 'bun:test';
import { db } from '../../src/content';
import { refusedOf } from '../../src/app/money';
import { hospitalOf } from '../../src/engine/hospital/site';
import { siteOfPlan } from '../../src/engine/hospital/site-plan';
import { withNightShift } from '../../src/engine/hospital/staff';
import { STAYS } from '../../src/engine/med/plan';
import { apply, newFlowShift, newShift } from '../../src/engine/shift/engine';
import type { Place } from '../../src/engine/shift/journey';
import type { Flow, Refused, ShiftPatient, ShiftState } from '../../src/engine/shift/types';
import { refusalOf } from '../bench/refused';

const AUTO: Flow = { perHour: 0, auto: true };
const H = 3600;

/** Готовая больница из записи `sites/`, со сменами; кабинеты врача — нанятые терапевты днём и ночью, никто не играет. */
function siteShift(id: string, seed: number): ShiftState {
  const p = siteOfPlan(db, db.sites![id]);
  if (!p.ok) throw new Error(id);
  const { mine: _, ...site } = p.site;
  const s = newFlowShift(db, { seed, season: 'winter', hospital: hospitalOf(db, site), staff: withNightShift(db, site.rooms, p.staff), flow: AUTO, economy: { cash: 5_000_000 } });
  for (const r of s.hospital!.site!.rooms.filter(x => x.type === 'room.office')) {
    for (const shift of ['day', 'night'] as const) {
      if (!s.staff!.some(m => m.room === r.id && (m.shift === shift || m.shift === undefined) && db.roles[m.role]?.stands === 'role.doctor')) {
        apply(db, s, { kind: 'site', cmd: { kind: 'hire', room: r.id, role: 'role.doctor', shift } });
      }
    }
  }
  apply(db, s, { kind: 'site', cmd: { kind: 'done' } });
  return s;
}

const total = (r: Refused | undefined) => [...Object.values(r?.full ?? {}), ...Object.values(r?.none ?? {})].reduce((a, b) => a + (b ?? 0), 0);

/**
 * Прогон минутами с подсчётом по путям больных, как в пробах: конец пути — отказ по `refusalOf` в ту же минуту, когда его
 * записал движок (шаг — минута, проверка — сразу после шага).
 */
function runCounting(s: ShiftState, until: number): { full: Record<Place, number>; none: Record<Place, number>; by: Record<string, number> } {
  const out = { full: { ward: 0, icu: 0, ricu: 0, box: 0 }, none: { ward: 0, icu: 0, ricu: 0, box: 0 }, by: {} as Record<string, number> };
  const ended = new Set<string>();
  const patient = (id: string): ShiftPatient | undefined => s.patients[id] ?? s.past?.find(x => x.p.id === id)?.p;
  while (s.t < until) {
    apply(db, s, { kind: 'advance', seconds: 60 });
    for (const [id, j] of Object.entries(s.journeys?.of ?? {})) {
      if (!j.end || ended.has(id)) continue;
      ended.add(id);
      const p = patient(id);
      const no = p ? refusalOf(db, s, p, j.end) : undefined;
      if (!no || !p) continue;
      (no.full ? out.full : out.none)[no.place]++;
      const main = p.patient.truth.conditions.find(c => c.role === 'primary')?.id ?? p.patient.truth.conditions[0].id;
      out.by[main] = (out.by[main] ?? 0) + 1;
    }
  }
  return out;
}

describe('отказы в госпитализации в итогах суток', () => {
  test('больница сценария 2: «мест нет» в палатах — и счёт движка тот же, что у проб по путям больных', () => {
    const s = siteShift('site.emergency', 1);
    const probe = runCounting(s, (2 * 24 + 8) * H);
    const days = s.history.filter(h => h.day >= 1);
    expect(days.length).toBe(2);
    const sum = (k: 'full' | 'none', place: Place) => days.reduce((a, h) => a + (h.refused?.[k][place] ?? 0), 0);
    for (const place of ['ward', 'icu', 'ricu', 'box'] as const) {
      expect(sum('full', place)).toBe(probe.full[place]);
      expect(sum('none', place)).toBe(probe.none[place]);
    }
    const by: Record<string, number> = {};
    for (const h of days) for (const [c, n] of Object.entries(h.refused?.by ?? {})) by[c] = (by[c] ?? 0) + n;
    expect(by).toEqual(probe.by);
    // палаты заняты — отказы есть; и всем им по базе нужна своя койка
    expect(sum('full', 'ward')).toBeGreaterThan(0);
    for (const h of days) expect(Object.values(h.refused?.by ?? {}).reduce((a, b) => a + b, 0)).toBe(total(h.refused));
  }, 180_000);

  test('амбулатория без палат: кому нужна койка — «своих нет», а «мест нет» не бывает', () => {
    const s = siteShift('site.ambulatory', 1);
    while (s.t < (2 * 24 + 8) * H) apply(db, s, { kind: 'advance', seconds: 600 });
    const days = s.history.filter(h => h.day >= 1);
    expect(days.some(h => (h.refused?.none.ward ?? 0) > 0)).toBe(true);
    for (const h of days) expect(Object.values(h.refused?.full ?? {}).reduce((a, b) => a + (b ?? 0), 0)).toBe(0);
    // с чем — болезни, которым по базе нужна своя койка
    for (const h of days) for (const c of Object.keys(h.refused?.by ?? {})) expect(db.conditions[c]).toBeDefined();
  }, 120_000);

  test('режимы «Анамнеза» — без отказов в итогах: поля нет', () => {
    const s = newShift(db, { seed: 1, season: 'winter' });
    while (s.t < 10 * H) apply(db, s, { kind: 'advance', seconds: 600 });
    expect(s.summary.refused).toBeUndefined();
    for (const h of s.history) expect(h.refused).toBeUndefined();
  });

  test('места отказа — то, что лечат в стационаре', () => {
    expect(STAYS).toEqual(['admit', 'surgery', 'icu', 'ricu', 'box']);
  });
});

describe('строка планёрки', () => {
  test('по порядку мест, «мест нет» и «своих нет» отдельно, болезни — восемь чаще всех, названием', () => {
    const conds = Object.keys(db.conditions).sort().slice(0, 10);
    const by = Object.fromEntries(conds.map((c, i) => [c, i + 1]));
    const v = refusedOf(db, { full: { box: 2, ward: 5 }, none: { ricu: 1 }, by })!;
    expect(v.n).toBe(8);
    expect(v.full).toEqual([
      { place: 'ward', n: 5 },
      { place: 'box', n: 2 },
    ]);
    expect(v.none).toEqual([{ place: 'ricu', n: 1 }]);
    expect(v.by.length).toBe(8);
    expect(v.by[0]).toEqual({ name: db.conditions[conds[9]].name.ru, n: 10 });
    expect(v.by.map(x => x.n)).toEqual([10, 9, 8, 7, 6, 5, 4, 3]);
  });

  test('никому не отказали — строки нет', () => {
    expect(refusedOf(db, undefined)).toBeUndefined();
    expect(refusedOf(db, { full: {}, none: {}, by: {} })).toBeUndefined();
  });
});
