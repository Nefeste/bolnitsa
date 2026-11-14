// Проба к спецификации «Сценарий 6 «Диагностический центр»» (docs/specs/2026-11-scenario-6.md, «Замер»): деньги диагностики и
// проверка страховой в готовых больницах, когда никто не играет. Сколько обследований в сутки делают УЗИ, эндоскопия, КТ и МРТ,
// что они приносят и стоят (деньги по помещениям, `DaySummary.rooms`: обследования — помещению, где сделали; зарплаты людей на
// его местах и содержание с аппаратами — по часам), за сколько суток окупилось бы готовое помещение по его цене (`readyCost`) и
// сколько обследований страховая не оплатила как сделанные без показаний (`ledger.audit.unindicated`; у ДМС — так же, платный
// платит за всё). Доля ДМС и платных — от репутации (`payerOf`).
//
// Больницы: готовая городская (УЗИ, КТ, эндоскопия, МРТ) и районная с сосудистым отделением (УЗИ и КТ). Зима, никто не играет:
// кабинеты врача ведут нанятые терапевты днём и ночью. Сутки 1 — вход в поток, в среднем — со вторых.
//
// С `--confirms` — с правилом главврача «Подтверждать диагноз» (spec docs/specs/2026-11-scenario-6.md, часть 1а) с первой минуты:
// сколько подтверждающих обследований назначили, сколько снято и верных диагнозов.
//
// bun tools/bench/diagnostics.ts [--days 7] [--seeds 1,2] [--hospital city,vpreset] [--confirms]
import type { ContentDb, Id } from '../../src/content/types';
import { db as bundle } from '../../src/content';
import { hospitalOf, readyCost, type SiteCommand } from '../../src/engine/hospital/site';
import { siteOfPreset } from '../../src/engine/hospital/site-preset';
import { presetStaff, withNightShift } from '../../src/engine/hospital/staff';
import { apply, newFlowShift } from '../../src/engine/shift/engine';
import type { DaySummary, ShiftPatient, ShiftState } from '../../src/engine/shift/types';

const arg = (name: string, def: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
};
const DAYS = Number(arg('days', '7'));
const SEEDS = arg('seeds', '1,2').split(',').map(Number);
const HOSPITALS = arg('hospital', 'city,vpreset').split(',');
const CONFIRMS = process.argv.includes('--confirms');
const db: ContentDb = bundle;
const H = 3600;
const DAY = 24 * H;

/** Помещения диагностики, о которых сценарий 6. */
const DIAG: Id[] = ['room.ultrasound', 'room.endoscopy', 'room.ct', 'room.mri'];

function start(name: string, seed: number): ShiftState {
  const rec = db.presets[({ city: 'preset.city', vpreset: 'preset.vascular', district: 'preset.district' } as Record<string, Id>)[name] ?? name];
  if (!rec) throw new Error(name);
  const { mine: _, ...site } = siteOfPreset(db, rec);
  const s = newFlowShift(db, { seed, season: 'winter', hospital: hospitalOf(db, site), staff: withNightShift(db, site.rooms, presetStaff(db, rec)), flow: { perHour: 0, auto: true }, economy: { cash: 5_000_000 } });
  const cmd = (c: SiteCommand) => apply(db, s, { kind: 'site', cmd: c });
  for (const r of s.hospital!.site!.rooms.filter(x => x.type === 'room.office')) {
    for (const shift of ['day', 'night'] as const) {
      if (!s.staff!.some(m => m.room === r.id && (m.shift === shift || m.shift === undefined) && db.roles[m.role]?.stands === 'role.doctor')) cmd({ kind: 'hire', room: r.id, role: 'role.doctor', shift });
    }
  }
  cmd({ kind: 'done' });
  if (CONFIRMS) apply(db, s, { kind: 'confirms', on: true });
  return s;
}

/** Все, кто пришёл: ещё в больнице и ушедшие из состояния. */
const everyone = (s: ShiftState): ShiftPatient[] => [...Object.values(s.patients), ...(s.past ?? []).map(x => x.p)];

const fmt = (x: number, d = 0) => x.toFixed(d).replace('.', ',');
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

for (const name of HOSPITALS) {
  for (const seed of SEEDS) {
    const s = start(name, seed);
    const t0 = performance.now();
    // закрытые — по мере закрытия: планёрка убирает ушедших из состояния (в `past` — сутки)
    const seen = new Map<string, ShiftPatient>();
    while (s.t < DAYS * DAY + 8 * H + 60) {
      apply(db, s, { kind: 'advance', seconds: 600 });
      for (const p of everyone(s)) if (p.closed && p.paid && !seen.has(p.id)) seen.set(p.id, p);
    }
    const days: DaySummary[] = s.history.filter(h => h.day >= 2 && h.day <= DAYS);
    const rooms = s.hospital!.site!.rooms.filter(r => DIAG.includes(r.type));
    console.log(`\n=== ${name}, зерно ${seed}: ${days.length} суток со вторых (${Math.round((performance.now() - t0) / 1000)} с)`);
    for (const r of rooms) {
      const rd = days.map(h => h.rooms?.[r.id] ?? { income: 0, expenses: 0 });
      const exams = avg(rd.map(x => x.exams ?? 0));
      const income = avg(rd.map(x => x.income));
      const expenses = avg(rd.map(x => x.expenses));
      const placed = s.hospital!.rooms.find(x => x.id === r.id);
      const cost = placed ? readyCost(db, r.type, placed.size) : 0;
      const profit = income - expenses;
      const pay = profit > 0 ? `окупится за ${fmt(cost / profit)} сут.` : 'не окупается';
      console.log(`  ${r.type} ${placed?.size ?? '?'}: обследований в сутки ${fmt(exams, 1)}; приносит ${fmt(income)} ₽, стоит ${fmt(expenses)} ₽, итог ${fmt(profit)} ₽ в сутки; готовое — ${fmt(cost)} ₽, ${pay}`);
    }
    // проверка страховой: обследований без показаний за сутки — всего и в помещениях диагностики
    const cut = avg(days.map(h => h.economy?.ledger.audit.unindicated ?? 0));
    const rub = avg(days.map(h => h.economy?.ledger.audit.cut ?? 0));
    const cases = days.map(h => h.economy?.ledger.cases ?? { oms: 0, dms: 0, self: 0 });
    const all = avg(cases.map(c => c.oms + c.dms + c.self));
    const dms = avg(cases.map(c => c.dms));
    const self = avg(cases.map(c => c.self));
    const closed = [...seen.values()].filter(p => p.closed!.at >= DAY + 8 * H && p.closed!.at < DAYS * DAY + 8 * H);
    const cutBy: Record<string, number> = {};
    for (const p of closed) {
      for (const id of p.paid!.unindicated) {
        const room = db.exams[id]?.room;
        if (!room || !DIAG.includes(room)) continue;
        cutBy[id] = (cutBy[id] ?? 0) + 1;
      }
    }
    const perDay = Object.entries(cutBy).sort((a, b) => b[1] - a[1]).map(([id, n]) => `${id.replace('exam.', '')} ${fmt(n / days.length, 1)}`).join(', ');
    // диагнозы без подтверждения: какие и где их подтверждают (`confirm` записи болезни — обследования и их помещения)
    const unc: Record<string, number> = {};
    const uncRoom: Record<string, number> = {};
    for (const p of closed) {
      if (!p.paid!.unconfirmed) continue;
      const d = p.closed!.diagnosis;
      unc[d] = (unc[d] ?? 0) + 1;
      const c = db.conditions[d]?.confirm;
      const rooms = c && c !== 'clinical' ? [...new Set(c.map(e => db.exams[e]?.room ?? 'у постели'))] : ['—'];
      for (const r of rooms) uncRoom[r] = (uncRoom[r] ?? 0) + 1;
    }
    const top = (r: Record<string, number>, k: number) => Object.entries(r).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, k).map(([id, n]) => `${id.replace(/^(cond|room)\./, '')} ${fmt(n / days.length, 1)}`).join(', ');
    const rep = s.economy?.reputation ?? 0;
    console.log(`  закрыто приёмов в сутки ${fmt(all)}, ДМС ${fmt(dms, 1)} (${fmt((100 * dms) / Math.max(1, all), 1)} %), платных ${fmt(self, 1)}; репутация к концу ${fmt(rep)}`);
    const weak = avg(days.map(h => h.economy?.ledger.audit.weak ?? 0));
    const unconfirmed = avg(days.map(h => h.economy?.ledger.audit.unconfirmed ?? 0));
    const income = avg(days.map(h => { const l = h.economy?.ledger; return l ? l.income.oms + l.income.dms + l.income.self : 0; }));
    const confirms = avg(days.map(h => h.confirms ?? 0));
    // приёмы нанятых врачей: верные — по разбору у их итогов суток
    const col = (h: DaySummary) => Object.values(h.colleagues ?? {});
    const seenAll = avg(days.map(h => col(h).reduce((a, c) => a + c.correct + c.partly + c.wrong, 0)));
    const correct = avg(days.map(h => col(h).reduce((a, c) => a + c.correct, 0)));
    const money = avg(days.map(h => {
      const l = h.economy?.ledger;
      if (!l) return 0;
      const out = Object.values(l.expenses).reduce((a: number, v) => a + (v ?? 0), 0);
      return l.income.oms + l.income.dms + l.income.self + (l.ward?.income ?? 0) - out;
    }));
    const left = avg(days.map(h => h.left));
    console.log(`  верных диагнозов ${fmt((100 * correct) / Math.max(1, seenAll), 1)} % из ${fmt(seenAll)} в сутки, ушли не дождавшись — ${fmt(left, 1)}; касса за сутки ${money >= 0 ? '+' : ''}${fmt(money)} ₽${CONFIRMS ? `; по правилу «Подтверждать диагноз» назначено ${fmt(confirms, 1)} в сутки` : ''}`);
    console.log(`  без подтверждения чаще всего: ${top(unc, 8)}; где подтверждают: ${top(uncRoom, 8)}`);
    console.log(`  экспертиза страховой: снято ${fmt(rub)} ₽ в сутки при доходе по приёмам ${fmt(income)} ₽; обоснованность ниже A — ${fmt(weak, 1)} приёмов, диагноз без подтверждения — ${fmt(unconfirmed, 1)}, обследований без показаний — ${fmt(cut, 1)}; в диагностике — ${perDay || 'нет'}`);
  }
}
