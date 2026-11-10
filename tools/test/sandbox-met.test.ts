// Песочница, часть 2б (spec docs/specs/2026-11-sandbox.md; решение агента 2): болезни — «все» или «только встреченные в кампании».
// Встреченные — главные болезни закрытых случаев сценариев кампании, ваших и нанятых врачей: поток расчёта отдаёт их окну
// (`MetDesk`), окно копит на этом компьютере (`src/app/met.ts`). Песочница с ними — `newFlowShift(…, { only })`: пришедшие сами,
// записанные и привезённые — только с ними; кому ни одна не бывает — не пришёл. Без списка — тот же поток до байта.
import { describe, expect, test } from 'bun:test';
import { db } from '../../src/content';
import { addMet, parseMet, readMet, writeMet } from '../../src/app/met';
import { hospitalOf } from '../../src/engine/hospital/site';
import { siteOfPlan } from '../../src/engine/hospital/site-plan';
import { withNightShift } from '../../src/engine/hospital/staff';
import { primaryOf } from '../../src/engine/med/plan';
import { apply, departmentsOf, newFlowShift } from '../../src/engine/shift/engine';
import type { Flow, ShiftPatient, ShiftState } from '../../src/engine/shift/types';
import { MetDesk } from '../../src/sim/met';

const H = 3600;
const AUTO: Flow = { perHour: 0, auto: true };

/** Готовая больница из записи `sites/`, со сменами, как в окне; `opts` — в начало смены. */
function siteShift(id: string, seed: number, opts: { only?: string[]; scenario?: string } = {}): ShiftState {
  const p = siteOfPlan(db, db.sites![id]);
  if (!p.ok) throw new Error(id);
  const { mine: _, ...site } = p.site;
  return newFlowShift(db, { seed, season: 'winter', hospital: hospitalOf(db, site), staff: withNightShift(db, site.rooms, p.staff), flow: AUTO, economy: { cash: 5_000_000 }, ...opts });
}

const live = (s: ShiftState, until: number, step = 600) => {
  while (s.t < until) apply(db, s, { kind: 'advance', seconds: step });
};
/** Все, кто пришёл с начала смены: ещё в больнице и ушедшие из состояния. */
const arrived = (s: ShiftState): ShiftPatient[] => [...Object.values(s.patients), ...(s.past ?? []).map(x => x.p)];
const mainOf = (p: ShiftPatient) => primaryOf(p.patient).id;

describe('песочница «только встреченные в кампании»: поток', () => {
  test('без списка, с пустым и с неизвестными болезнями — тот же поток до байта', () => {
    const base = siteShift('site.emergency', 3);
    live(base, 14 * H);
    for (const only of [[], ['cond.no_such_disease']]) {
      const s = siteShift('site.emergency', 3, { only });
      expect(s.meta.only).toBeUndefined();
      live(s, 14 * H);
      expect(JSON.stringify(s)).toBe(JSON.stringify(base));
    }
  }, 120_000);

  test('пришедшие сами, записанные и привезённые — только со встреченными, которые больница принимает; сами — не со «только скорой»', () => {
    const only = ['cond.arvi', 'cond.acute_bronchitis', 'cond.cystitis', 'cond.pneumonia_cap', 'cond.stroke_ischemic', 'cond.cholecystitis', 'cond.no_such_disease'];
    const s = siteShift('site.emergency', 5, { only });
    // список — болезни базы, по алфавиту
    expect(s.meta.only).toEqual(only.filter(id => db.conditions[id]).sort());
    live(s, (24 + 14) * H);
    const all = arrived(s).filter(p => !p.returnOf);
    const admits = departmentsOf(db, s);
    const can = s.meta.only!.filter(id => admits.includes(db.conditions[id].department));
    expect(all.length).toBeGreaterThan(30);
    for (const p of all) expect(can).toContain(mainOf(p));
    // пришедшие сами — без болезней, с которыми только привозят; привезённые — и с ними
    for (const p of all.filter(x => x.kind === 'walkIn')) expect(db.conditions[mainOf(p)].arrival).toBeUndefined();
    expect(all.some(p => p.kind === 'ambulance')).toBe(true);
    expect(new Set(all.map(mainOf)).size).toBeGreaterThan(2);
  }, 120_000);

  test('ни одной встреченной болезни, которую больница принимает, — никто не приходит; часы идут', () => {
    const probe = siteShift('site.ambulatory', 2);
    const admits = departmentsOf(db, probe);
    const other = Object.keys(db.conditions).sort().find(id => !admits.includes(db.conditions[id].department));
    expect(other).toBeDefined();
    const s = siteShift('site.ambulatory', 2, { only: [other!] });
    live(s, 16 * H);
    expect(arrived(s).length).toBe(0);
    expect(s.t).toBeGreaterThanOrEqual(16 * H);
  }, 60_000);
});

describe('встреченные болезни: поток расчёта и окно', () => {
  test('у сценария кампании — главные болезни закрытых случаев, ваших и нанятых врачей, каждая один раз; вне сценария — ничего', () => {
    // как в окне: амбулатория сценария 2 со своим кабинетом и сменами, касса — сценария
    const amb = siteOfPlan(db, db.sites!['site.ambulatory']);
    if (!amb.ok) throw new Error('site.ambulatory');
    const s = newFlowShift(db, { seed: 8, season: 'winter', hospital: hospitalOf(db, amb.site), staff: withNightShift(db, amb.site.rooms, amb.staff), flow: AUTO, scenario: 'scenario.emergency' });
    const desk = new MetDesk();
    expect(desk.out(db, s)).toBeUndefined();
    live(s, 13 * H, 60);
    const first = desk.out(db, s) ?? [];
    const closed = arrived(s).filter(p => p.closed);
    expect(closed.length).toBeGreaterThan(0);
    expect(first).toEqual([...new Set(closed.map(mainOf))].sort());
    // второй раз — только новые
    expect(desk.out(db, s)).toBeUndefined();
    live(s, 18 * H, 60);
    const second = desk.out(db, s) ?? [];
    const now = [...new Set(arrived(s).filter(p => p.closed).map(mainOf))].sort();
    expect([...first, ...second].sort()).toEqual(now);
    for (const id of second) expect(first).not.toContain(id);
    // после загрузки — заново: окно копит без повторов
    desk.reset();
    expect(desk.out(db, s)).toEqual(now);
    // не сценарий — ничего
    const free = siteShift('site.ambulatory', 8);
    live(free, 13 * H, 60);
    expect(arrived(free).some(p => p.closed)).toBe(true);
    expect(new MetDesk().out(db, free)).toBeUndefined();
  }, 120_000);

  test('хранилище окна: по алфавиту, без повторов, только болезни; испорченное — пусто; нового нет — писать нечего', () => {
    expect(parseMet(undefined)).toEqual([]);
    expect(parseMet('{')).toEqual([]);
    expect(parseMet('{"a":1}')).toEqual([]);
    expect(parseMet(JSON.stringify(['cond.b', 'cond.a', 'cond.b', 7, 'room.office']))).toEqual(['cond.a', 'cond.b']);
    expect(addMet(['cond.a'], ['cond.a'])).toBeUndefined();
    expect(addMet(['cond.c'], ['cond.a', 'cond.c', 'x'])).toEqual(['cond.a', 'cond.c']);
    const box = new Map<string, string>();
    const store = { getItem: (k: string) => box.get(k) ?? null, setItem: (k: string, v: string) => void box.set(k, v) };
    writeMet(['cond.a', 'cond.b'], store);
    expect(readMet(store)).toEqual(['cond.a', 'cond.b']);
    expect([...box.keys()]).toEqual(['bolnitsa.met']);
  });
});
