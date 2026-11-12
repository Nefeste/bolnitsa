// Сценарий 4 «Сердце и мозг», часть 2а (spec docs/specs/2026-11-scenario-4.md; решение владельца #219, вариант 1): маршруты в
// окне — какие включены, состояние врача несёт для галочек карточки смотровой; просьба медсестры смотровой, когда обследование
// по маршруту показало находку срока (подъём ST на ЭКГ — тромболизис в 10 минут от неё): привезённый — в «Ждут вас» первым, со
// сроком; позвали — просьбы нет.
import { describe, expect, test } from 'bun:test';
import { db } from '../../src/content';
import { hospitalOf } from '../../src/engine/hospital/site';
import { siteOfPreset } from '../../src/engine/hospital/site-preset';
import { presetStaff, withNightShift } from '../../src/engine/hospital/staff';
import { startFor } from '../../src/app/roles';
import { startCash } from '../../src/engine/shift/money';
import { apply, newFlowShift } from '../../src/engine/shift/engine';
import type { Notice } from '../../src/engine/shift/types';
import type { ShiftPatient, ShiftState } from '../../src/engine/shift/types';
import { named } from '../../src/i18n';
import { doctorState, routeAlertOf } from '../../src/sim/doctor';

const H = 3600;
const rec = db.presets['preset.city'];
const ROUTES = ['route.ecg_chest_pain', 'route.stroke_ct'];

function city(seed: number): ShiftState {
  const site = siteOfPreset(db, rec);
  const s = newFlowShift(db, { seed, season: 'winter', hospital: hospitalOf(db, site), staff: withNightShift(db, site.rooms, presetStaff(db, rec)), flow: { perHour: 0, auto: true }, economy: { cash: 5_000_000 } });
  apply(db, s, { kind: 'site', cmd: { kind: 'done' } });
  apply(db, s, { kind: 'routes', on: ROUTES });
  return s;
}

/** Первый привезённый, что лёг в смотровую и ещё ждёт врача. */
function lying(s: ShiftState): ShiftPatient {
  for (;;) {
    const p = Object.values(s.patients).find(x => x.bay && x.status === 'waiting' && x.calledT === undefined && x.by === undefined && !x.closed);
    if (p) return p;
    if (s.t > 40 * H) throw new Error('за сутки никого не привезли');
    apply(db, s, { kind: 'advance', seconds: 60 });
  }
}

describe('маршруты в состоянии врача', () => {
  test('включённые — для галочек карточки смотровой; выключили — поля нет', () => {
    const s = city(1);
    expect(doctorState(db, s).routes).toEqual(ROUTES);
    apply(db, s, { kind: 'routes', on: [] });
    expect(doctorState(db, s).routes).toBeUndefined();
  });
});

describe('просьба медсестры смотровой по маршруту', () => {
  const s = city(2);
  const p = lying(s);
  // ЭКГ по маршруту, как её снимает медсестра: результат пришёл минуту назад и показал подъём ST
  p.routed = [...new Set([...(p.routed ?? []), 'route.ecg_chest_pain'])];
  const at = s.t - 60;
  p.results.push({ exam: 'exam.ecg', obs: [{ f: 'ecg.st_elevation', shown: true, exam: 'exam.ecg' }], at, step: p.step });

  test('находка срока — ближайший срок от неё: тромболизис в 10 минут от ЭКГ', () => {
    const lysis = db.targets['target.lysis_stemi'];
    expect(routeAlertOf(db, s, p)).toEqual({ finding: named(db.findings['ecg.st_elevation'].name), target: named(lysis.name), at, until: at + lysis.minutes * 60 });
  });

  test('в «Ждут вас» — первым, с просьбой', () => {
    const st = doctorState(db, s);
    expect(st.yours[0]).toMatchObject({ id: p.id, why: 'alert', alert: { at, until: at + 600 } });
  });

  test('без маршрута, с ещё не пришедшим результатом и у позванного — просьбы нет', () => {
    const routed = p.routed;
    p.routed = undefined;
    expect(routeAlertOf(db, s, p)).toBeUndefined();
    p.routed = routed;
    const r = p.results.at(-1)!;
    r.at = s.t + 60;
    expect(routeAlertOf(db, s, p)).toBeUndefined();
    r.at = at;
    p.calledT = s.t;
    expect(routeAlertOf(db, s, p)).toBeUndefined();
    expect(doctorState(db, s).yours.some(x => x.why === 'alert')).toBe(false);
    delete p.calledT;
  });
});

describe('просьба медсестры — извещением движка', () => {
  test('результат ЭКГ по маршруту с подъёмом ST — извещение `alert` со сроком тромболизиса; «До утра» на нём встанет', () => {
    // как окно «Управляющего»: в его кабинете — нанятый терапевт, своих правил «Просят посмотреть» нет; поток 6 в час и скорая
    const r = startFor(db, siteOfPreset(db, rec), presetStaff(db, rec), 'manager');
    const s = newFlowShift(db, { seed: 1, season: 'winter', hospital: hospitalOf(db, r.site), staff: withNightShift(db, r.site.rooms, r.staff), flow: { perHour: 6, ambulancePerHour: 1 }, economy: { cash: startCash(db, 'preset', 'normal') } });
    apply(db, s, { kind: 'asks', rules: [] });
    apply(db, s, { kind: 'routes', on: ROUTES });
    const alerts: Extract<Notice, { kind: 'alert' }>[] = [];
    while (s.t < 32 * H) for (const n of apply(db, s, { kind: 'advance', seconds: 300 })) if (n.kind === 'alert') alerts.push(n);
    expect(alerts.length).toBeGreaterThan(0);
    for (const a of alerts) {
      const p = s.patients[a.id] ?? s.past?.find(x => x.p.id === a.id)?.p;
      expect(p?.routed).toContain('route.ecg_chest_pain');
      const ecg = p!.results.find(x => x.exam === 'exam.ecg')!;
      expect(ecg.obs.some(o => o.f === 'ecg.st_elevation' && o.shown)).toBe(true);
      expect(a).toMatchObject({ target: 'target.lysis_stemi', finding: 'ecg.st_elevation', at: ecg.at, until: ecg.at + 600 });
    }
  }, 120_000);
});
