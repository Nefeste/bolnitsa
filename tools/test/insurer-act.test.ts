// Сценарий 6, часть 1а (spec docs/specs/2026-11-scenario-6.md): экспертиза страховой по видам в итогах суток потока для ПК — снято
// за обоснованность ниже A, за диагноз без подтверждения и за обследования без показаний, вместе — то же, что `ledger.audit.cut`;
// акт раз в неделю — на планёрке после седьмых суток; правило главврача «Подтверждать диагноз» — нанятый врач перед решением
// назначает подтверждающее обследование; без правила — ход тот же до байта.
import { describe, expect, test } from 'bun:test';
import { db } from '../../src/content';
import { actViewOf, auditViewOf } from '../../src/app/money';
import { setLang } from '../../src/i18n';
import type { CaseIncome } from '../../src/engine/economy/economy';
import { hospitalOf } from '../../src/engine/hospital/site';
import { siteOfPreset } from '../../src/engine/hospital/site-preset';
import { presetStaff, withNightShift } from '../../src/engine/hospital/staff';
import { ACT_DAYS, cutParts, weekAudit } from '../../src/engine/shift/audit';
import { apply, newFlowShift, newShift } from '../../src/engine/shift/engine';
import type { AuditDay, DaySummary, Flow, Notice, ShiftState } from '../../src/engine/shift/types';

const H = 3600;
const AUTO: Flow = { perHour: 0, auto: true };

/** Готовая городская больница, со сменами и кассой, как в окне; никто не играет. */
function city(seed: number): ShiftState {
  const rec = db.presets['preset.city'];
  const { mine: _, ...site } = siteOfPreset(db, rec);
  return newFlowShift(db, { seed, season: 'winter', hospital: hospitalOf(db, site), staff: withNightShift(db, site.rooms, presetStaff(db, rec)), flow: AUTO, economy: { cash: 5_000_000 } });
}

const live = (s: ShiftState, until: number, step = 600): Notice[] => {
  const out: Notice[] = [];
  while (s.t < until) out.push(...apply(db, s, { kind: 'advance', seconds: step }));
  return out;
};
const sum = (r: Record<string, number | undefined>) => Object.values(r).reduce((a: number, b) => a + (b ?? 0), 0);

describe('экспертиза страховой по видам', () => {
  test('сутки: снятое по видам — то же, что `ledger.audit.cut`; приёмы по видам — те же счётчики', () => {
    const s = city(1);
    live(s, (2 * 24 + 8) * H + 60);
    const days = s.history.filter(h => h.day >= 1);
    expect(days.length).toBe(2);
    for (const h of days) {
      const l = h.economy!.ledger.audit;
      const a = h.audit!;
      expect(a).toBeDefined();
      expect(a.rub.weak + a.rub.unconfirmed + a.rub.unindicated).toBe(l.cut);
      expect(sum(a.unconfirmed)).toBe(l.unconfirmed);
      expect(sum(a.weak)).toBe(l.weak);
      expect(sum(a.unindicated)).toBe(l.unindicated);
      // приёмов со снятым — не больше закрытых; ваших нет: никто не играет
      expect(sum(a.who)).toBeGreaterThan(0);
      expect(a.who['']).toBeUndefined();
      // диагноз без подтверждения — те, что база подтверждает обследованием
      for (const id of Object.keys(a.unconfirmed)) expect(db.conditions[id].confirm).not.toBe('clinical');
      expect(a.rub.unconfirmed).toBeGreaterThan(0);
    }
  }, 120_000);

  test('по видам с множителем оплаты уровня: остаток округления — виду, где снято больше; вместе — `cut`', () => {
    const diagnosis = Object.keys(db.conditions).sort().find(id => db.conditions[id].severity === 'moderate')!;
    const exam = Object.keys(db.exams).sort().find(id => db.exams[id].cost === 1500)!;
    for (const pay of [90, 100, 110]) {
      const t = db.economy.tariffs;
      const full = t.oms.moderate;
      const quality = Math.round((full * 60) / 100);
      const visit = Math.round((full * 60 * t.omsUnconfirmed) / 10000);
      const base = Math.round((db.exams[exam].cost * t.omsExam) / 100) + full - visit;
      const x: CaseIncome = { paid: 0, cut: Math.round((base * pay) / 100), quality: 60, unconfirmed: true, unindicated: [exam], level: 100 };
      const rub = cutParts(db, 'oms', diagnosis, x, pay);
      expect(rub.weak + rub.unconfirmed + rub.unindicated).toBe(x.cut);
      expect(rub.weak).toBeGreaterThan(0);
      expect(rub.unconfirmed).toBeGreaterThan(0);
      expect(Math.abs(rub.weak - Math.round(((full - quality) * pay) / 100))).toBeLessThanOrEqual(1);
    }
    // ДМС — только обследования; платный — ничего
    const dms: CaseIncome = { paid: 0, cut: Math.round((db.exams[exam].cost * db.economy.tariffs.dms.price) / 100), quality: 100, unconfirmed: false, unindicated: [exam], level: 100 };
    expect(cutParts(db, 'dms', diagnosis, dms, 100)).toEqual({ weak: 0, unconfirmed: 0, unindicated: dms.cut });
  });

  test('режимы «Анамнеза» — без экспертизы по видам: поля нет', () => {
    const s = newShift(db, { seed: 1, season: 'winter' });
    live(s, 10 * H);
    expect(s.summary.audit).toBeUndefined();
    for (const h of s.history) expect(h.audit).toBeUndefined();
  });
});

describe('акт страховой раз в неделю', () => {
  const day = (n: number, a?: Partial<AuditDay>, confirms?: number): DaySummary =>
    ({
      day: n,
      ...(a ? { audit: { rub: { weak: 0, unconfirmed: 0, unindicated: 0 }, unconfirmed: {}, weak: {}, unindicated: {}, who: {}, ...a } } : {}),
      ...(confirms ? { confirms } : {}),
    }) as DaySummary;

  test('после седьмых, четырнадцатых… суток — неделя вместе; в другие дни и без снятого — акта нет', () => {
    expect(ACT_DAYS).toBe(7);
    const history = Array.from({ length: 14 }, (_, i) =>
      day(i + 1, { rub: { weak: 100, unconfirmed: 200, unindicated: 0 }, unconfirmed: { 'cond.influenza': 2 }, weak: { B: 1 }, who: { s1: 3 } }, i % 2 === 0 ? 1 : undefined),
    );
    expect(weekAudit(history, 6)).toBeUndefined();
    expect(weekAudit(history, 0)).toBeUndefined();
    const w = weekAudit(history, 14)!;
    expect([w.from, w.to, w.cut, w.confirms]).toEqual([8, 14, 7 * 300, 3]);
    expect(w.unconfirmed).toEqual({ 'cond.influenza': 14 });
    expect(w.weak).toEqual({ B: 7 });
    expect(w.who).toEqual({ s1: 21 });
    expect(weekAudit(Array.from({ length: 7 }, (_, i) => day(i + 1)), 7)).toBeUndefined();
  });

  test('городская больница: планёрка после седьмых суток несёт акт — неделя экспертизы, как сумма суток', () => {
    const s = city(2);
    const notices = live(s, (7 * 24 + 8) * H + 60, 900);
    const mornings = notices.filter((n): n is Extract<Notice, { kind: 'morning' }> => n.kind === 'morning');
    expect(mornings.map(m => m.summary.day)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    for (const m of mornings.slice(0, 6)) expect(m.act).toBeUndefined();
    const act = mornings[6].act!;
    expect([act.from, act.to]).toEqual([1, 7]);
    const week = s.history.filter(h => h.day >= 1 && h.day <= 7);
    expect(act.cut).toBe(week.reduce((a, h) => a + (h.economy?.ledger.audit.cut ?? 0), 0));
    expect(sum(act.unconfirmed)).toBe(week.reduce((a, h) => a + (h.economy?.ledger.audit.unconfirmed ?? 0), 0));
  }, 180_000);
});

describe('правило «Подтверждать диагноз»', () => {
  test('без правила, с выключенным — тот же ход до байта; с правилом — подтверждающие обследования, диагнозов без подтверждения меньше', () => {
    const base = city(3);
    live(base, 20 * H, 300);
    const off = city(3);
    apply(db, off, { kind: 'confirms', on: false });
    live(off, 20 * H, 300);
    expect(off.meta.confirms).toBeUndefined();
    // журнал команд — свой у каждой смены: выключенное правило в нём записано
    const same = (s: ShiftState) => JSON.stringify({ ...s, journal: s.journal.filter(c => c.kind !== 'confirms') });
    expect(same(off)).toBe(same(base));
    const on = city(3);
    apply(db, on, { kind: 'confirms', on: true });
    expect(on.meta.confirms).toBe(true);
    live(on, 20 * H, 300);
    expect(on.summary.confirms ?? 0).toBeGreaterThan(3);
    const unconfirmed = (s: ShiftState) => s.economy?.ledger?.audit.unconfirmed ?? 0;
    expect(unconfirmed(on)).toBeLessThan(unconfirmed(base));
    // назначенное по правилу — сделано или ждёт результата; один раз на больного
    const all = [...Object.values(on.patients), ...(on.past ?? []).map(x => x.p)];
    const by = all.filter(p => p.confirming !== undefined);
    expect(by.length).toBe(on.summary.confirms ?? 0);
    for (const p of by) expect(p.done.includes(p.confirming!) || p.pending.some(x => x.exam === p.confirming) || p.orders?.includes(p.confirming!) === true || p.status !== 'done').toBe(true);
  }, 180_000);

  test('режимы «Анамнеза» — правила нет: команда ничего не меняет', () => {
    const s = newShift(db, { seed: 1, season: 'winter' });
    apply(db, s, { kind: 'confirms', on: true });
    expect(s.meta.confirms).toBeUndefined();
  });
});

describe('слова окна', () => {
  test('экспертиза: диагнозы чаще всего — с тем, чем подтверждают; оценки по порядку; ваши — «ваши приёмы»', () => {
    setLang('ru');
    const flu = Object.keys(db.conditions).find(id => db.conditions[id].confirm !== 'clinical' && (db.conditions[id].confirm as string[]).length > 0)!;
    const a: AuditDay = {
      rub: { weak: 1000, unconfirmed: 3000, unindicated: 1500 },
      unconfirmed: { [flu]: 5, 'cond.zzz': 1 },
      weak: { D: 1, B: 4 },
      unindicated: { 'exam.ct_head': 2 },
      who: { '': 1, s9: 6 },
    };
    const v = auditViewOf(db, a, id => (id === '' ? 'ваши приёмы' : `врач ${id}`));
    expect(v.cases).toBe(7);
    expect(v.unconfirmed[0].name).toBe(db.conditions[flu].name.ru);
    expect(v.unconfirmed[0].by.length).toBeGreaterThan(0);
    expect(v.weak).toEqual([
      { grade: 'B', n: 4 },
      { grade: 'D', n: 1 },
    ]);
    expect(v.unindicated).toEqual([{ name: db.exams['exam.ct_head'].name.ru, n: 2 }]);
    expect(v.who).toEqual([
      { who: 'врач s9', n: 6 },
      { who: 'ваши приёмы', n: 1 },
    ]);
    const act = actViewOf(db, { ...a, from: 1, to: 7, cut: 5500, confirms: 3 }, id => id);
    expect([act.from, act.to, act.cut, act.confirms]).toEqual([1, 7, 5500, 3]);
  });
});
