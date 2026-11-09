// Проба к спецификации техников и поломок в работе (docs/specs/2026-11-technicians.md, «Замер»): сколько в готовых больницах
// аппаратов, которые ломаются (у них есть обследования; монитор, наркозный и дыхательный аппараты и стол — с запасным), как
// часто они ломаются при надёжности каталога (`breakdown`: доля за рабочий день) и сколько обследований в сутки делает
// каждый, — чтобы сравнить поломку на сутки (FR-EQ-3, как сейчас) с ремонтом за несколько часов.
// Больницы — как их открывает окно для «Управляющего» (в вашем кабинете — нанятый терапевт), со сменами; зима; никто не
// играет. Считается за `--days` суток: поломки движка (`broken` с утра), обследования по аппаратам, ремонт в кассе.
//
// bun tools/bench/repairs.ts [--days 7] [--seeds 1,2,3] [--hospital poly,district,city]
import type { ContentDb, Id } from '../../src/content/types';
import { db as bundle } from '../../src/content';
import { slotKey } from '../../src/engine/hospital/requirements';
import { hospitalOf, type Site } from '../../src/engine/hospital/site';
import { siteOfPlan } from '../../src/engine/hospital/site-plan';
import { siteOfPreset } from '../../src/engine/hospital/site-preset';
import { presetStaff, type StaffMember, withNightShift } from '../../src/engine/hospital/staff';
import { apply, breaks, hospitalCtx, newFlowShift } from '../../src/engine/shift/engine';
import { startCash } from '../../src/engine/shift/money';
import type { ShiftPatient, ShiftState } from '../../src/engine/shift/types';
import { startFor } from '../../src/app/roles';

const arg = (name: string, def: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
};
const DAYS = Number(arg('days', '7'));
const SEEDS = arg('seeds', '1,2,3').split(',').map(Number);
const HOSPITALS = arg('hospital', 'poly,district,city').split(',');
const db: ContentDb = bundle;
const H = 3600;

function hospital(name: string): { site: Site; staff: StaffMember[] } {
  const raw = (() => {
    if (name === 'poly') {
      const p = siteOfPlan(db, db.sites!['site.polyclinic']);
      if (!p.ok) throw new Error(`poly: ${p.error.kind}`);
      return { site: p.site, staff: p.staff };
    }
    const rec = db.presets[`preset.${name}`];
    return { site: siteOfPreset(db, rec), staff: presetStaff(db, rec) };
  })();
  const r = startFor(db, raw.site, raw.staff, 'manager');
  return { site: r.site, staff: withNightShift(db, r.site.rooms, r.staff) };
}

/** Аппараты, которые ломаются: помещение, место, запись каталога. */
function devices(s: ShiftState): { key: string; room: Id; eq: Id }[] {
  const out: { key: string; room: Id; eq: Id }[] = [];
  for (const r of hospitalCtx(db, s).plan.rooms) {
    r.equipment.forEach((id, slot) => {
      const eq = id ? db.equipment[id] : undefined;
      if (eq && breaks(eq)) out.push({ key: slotKey(r.id, slot), room: r.type, eq: eq.id });
    });
  }
  return out;
}

const pct = (n: number) => n.toLocaleString('ru-RU', { maximumFractionDigits: 1 });

for (const name of HOSPITALS) {
  const h = hospital(name);
  const first = newFlowShift(db, { seed: 1, season: 'winter', hospital: hospitalOf(db, h.site), staff: h.staff, flow: { perHour: 0, auto: true }, economy: { cash: startCash(db, 'preset') } });
  const list = devices(first);
  // доля за рабочий день (каталог — в процентах, база — в долях 1/10 000)
  const perDay = list.reduce((a, d) => a + db.equipment[d.eq].breakdown / 10000, 0);
  console.log(`\n## ${name}: аппаратов, что ломаются, — ${list.length}; поломок в среднем за сутки ${pct(perDay)}, раз в ${pct(1 / perDay)} суток`);
  console.log(`  ${list.map(d => `${d.eq.slice(3)} (${d.room.slice(5)}, ${pct(db.equipment[d.eq].breakdown / 100)} %)`).join(', ')}`);
  const byEq = new Map<Id, number[]>();
  let broken = 0;
  let repairs = 0;
  for (const seed of SEEDS) {
    const s = newFlowShift(db, { seed, season: 'winter', hospital: hospitalOf(db, h.site), staff: h.staff, flow: { perHour: 0, auto: true }, economy: { cash: startCash(db, 'preset') } });
    apply(db, s, { kind: 'site', cmd: { kind: 'done' } });
    const seen = new Map<string, ShiftPatient>();
    const end = (DAYS * 24 + 8) * H;
    while (s.t < end) {
      apply(db, s, { kind: 'advance', seconds: 600 });
      for (const p of Object.values(s.patients)) seen.set(p.id, p);
      for (const x of s.past ?? []) seen.set(x.p.id, x.p);
    }
    for (const d of s.history) {
      repairs += d.economy?.ledger.expenses.repairs ?? 0;
    }
    broken += s.history.reduce((a, d) => a + (d.economy?.ledger.expenses.repairs ? 1 : 0), 0);
    // обследования по аппаратам: какой аппарат делает обследование — по записи обследования (`equipment`)
    const count = new Map<Id, number>();
    for (const p of seen.values()) {
      for (const e of p.done) {
        const eqs = db.exams[e]?.equipment ?? [];
        const here = list.find(d => eqs.includes(d.eq));
        if (here) count.set(here.eq, (count.get(here.eq) ?? 0) + 1);
      }
    }
    for (const d of list) byEq.set(d.eq, [...(byEq.get(d.eq) ?? []), (count.get(d.eq) ?? 0) / DAYS]);
  }
  const n = SEEDS.length;
  console.log(`  сутки с ремонтом: ${broken} из ${DAYS * n}; на ремонт за ${DAYS} суток в среднем ${Math.round(repairs / n).toLocaleString('ru-RU')} ₽`);
  console.log(`  обследований в сутки на аппарат: ${[...byEq].map(([eq, xs]) => `${eq.slice(3)} ${pct(xs.reduce((a, b) => a + b, 0) / xs.length)}`).join(', ')}`);
}
