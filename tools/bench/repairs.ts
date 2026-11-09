// Проба к спецификации техников и поломок в работе (docs/specs/2026-11-technicians.md, «Замер» и «Часть 1: как сделано»):
// сколько в готовых больницах аппаратов, которые ломаются (у них есть обследования; монитор, наркозный и дыхательный аппараты
// и стол — с запасным), как часто они ломаются при надёжности каталога (`breakdown`: доля за рабочий день) и износе, кто их
// чинит — техник или сервис к утру, — сколько часов рабочего дня аппарат стоит и что стоит ремонт и техник.
// Больницы — как их открывает окно для «Управляющего» (в вашем кабинете — нанятый терапевт), со сменами; зима; никто не
// играет. Считается за `--days` суток с шагом 10 минут: поломка — аппарат появился среди сломанных; починил техник — ушёл
// из них днём, сервис — к утру; техников днём — `--tech` (0 — как без них, 1 — один в ординаторской на дневную смену).
//
// bun tools/bench/repairs.ts [--days 14] [--seeds 1,2,3] [--hospital poly,district,city] [--tech 0,1]
import type { ContentDb, Id } from '../../src/content/types';
import { db as bundle } from '../../src/content';
import { hospitalOf, type Site } from '../../src/engine/hospital/site';
import { siteOfPlan } from '../../src/engine/hospital/site-plan';
import { siteOfPreset } from '../../src/engine/hospital/site-preset';
import { presetStaff, type StaffMember, wageOf, withNightShift } from '../../src/engine/hospital/staff';
import { apply, hospitalCtx, newFlowShift } from '../../src/engine/shift/engine';
import { startCash } from '../../src/engine/shift/money';
import { devicesOf, TECHNICIAN } from '../../src/engine/shift/repair';
import type { ShiftPatient, ShiftState } from '../../src/engine/shift/types';
import { startFor } from '../../src/app/roles';

const arg = (name: string, def: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
};
const DAYS = Number(arg('days', '14'));
const SEEDS = arg('seeds', '1,2,3').split(',').map(Number);
const HOSPITALS = arg('hospital', 'poly,district,city').split(',');
const TECHS = arg('tech', '0,1').split(',').map(Number);
const db: ContentDb = bundle;
const H = 3600;
const STEP = 600;

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

const pct = (n: number) => n.toLocaleString('ru-RU', { maximumFractionDigits: 1 });
const rub = (n: number) => Math.round(n).toLocaleString('ru-RU');

interface Run {
  breaks: number;
  byTech: number;
  byService: number;
  /** часов рабочего дня (08:00–20:00), что аппарат стоял */
  down: number;
  repairs: number;
  wages: number;
  /** обследований в сутки по аппаратам */
  exams: Map<Id, number>;
}

function play(h: { site: Site; staff: StaffMember[] }, seed: number, techs: number): Run {
  const s: ShiftState = newFlowShift(db, { seed, season: 'winter', hospital: hospitalOf(db, h.site), staff: h.staff, flow: { perHour: 0, auto: true }, economy: { cash: startCash(db, 'preset') } });
  const staffRoom = s.hospital!.site!.rooms.find(r => r.type === 'room.staff')?.id;
  for (let i = 0; i < techs && staffRoom; i++) apply(db, s, { kind: 'site', cmd: { kind: 'hire', room: staffRoom, role: TECHNICIAN, shift: 'day' } });
  apply(db, s, { kind: 'site', cmd: { kind: 'done' } });
  const hired = (s.staff ?? []).filter(m => m.role === TECHNICIAN);
  const list = devicesOf(db, hospitalCtx(db, s).plan);
  const run: Run = { breaks: 0, byTech: 0, byService: 0, down: 0, repairs: 0, wages: 0, exams: new Map() };
  const seen = new Map<string, ShiftPatient>();
  let was = new Set<string>();
  const end = (DAYS * 24 + 8) * H;
  while (s.t < end) {
    apply(db, s, { kind: 'advance', seconds: STEP });
    const now = new Set(s.broken ?? []);
    const hour = Math.floor((s.t % (24 * H)) / H);
    for (const k of now) if (!was.has(k)) run.breaks++;
    for (const k of was) if (!now.has(k)) hour === 8 && s.t % (24 * H) < 8 * H + STEP ? run.byService++ : run.byTech++;
    if (hour >= 8 && hour < 20) run.down += (now.size * STEP) / H;
    was = now;
    for (const p of Object.values(s.patients)) seen.set(p.id, p);
    for (const x of s.past ?? []) seen.set(x.p.id, x.p);
  }
  for (const d of s.history) run.repairs += d.economy?.ledger.expenses.repairs ?? 0;
  run.wages = hired.reduce((a, m) => a + wageOf(db, m) * DAYS, 0);
  // обследования по аппаратам: какой аппарат делает обследование — по записи обследования (`equipment`)
  for (const p of seen.values()) {
    for (const e of p.done) {
      const eqs = db.exams[e]?.equipment ?? [];
      const here = list.find(d => eqs.includes(d.eq.id));
      if (here) run.exams.set(here.eq.id, (run.exams.get(here.eq.id) ?? 0) + 1 / DAYS);
    }
  }
  return run;
}

for (const name of HOSPITALS) {
  const h = hospital(name);
  const first = newFlowShift(db, { seed: 1, season: 'winter', hospital: hospitalOf(db, h.site), staff: h.staff, flow: { perHour: 0, auto: true }, economy: { cash: startCash(db, 'preset') } });
  const list = devicesOf(db, hospitalCtx(db, first).plan);
  // доля за рабочий день (каталог — в процентах, база — в долях 1/10 000)
  const perDay = list.reduce((a, d) => a + d.eq.breakdown / 10000, 0);
  console.log(`\n## ${name}: аппаратов, что ломаются, — ${list.length}; по каталогу поломок за сутки ${perDay.toLocaleString('ru-RU', { maximumFractionDigits: 3 })}, раз в ${pct(1 / perDay)} суток`);
  console.log(`  ${list.map(d => `${d.eq.id.slice(3)} (${pct(d.eq.breakdown / 100)} %)`).join(', ')}`);
  for (const techs of TECHS) {
    const runs = SEEDS.map(seed => play(h, seed, techs));
    const n = runs.length;
    const avg = (f: (r: Run) => number) => runs.reduce((a, r) => a + f(r), 0) / n;
    const who = techs === 0 ? 'без техника' : `техников днём ${techs}`;
    console.log(`  ${who}: поломок за ${DAYS} суток ${pct(avg(r => r.breaks))} (техник починил ${pct(avg(r => r.byTech))}, сервис к утру ${pct(avg(r => r.byService))}); аппараты стояли ${pct(avg(r => r.down))} ч рабочего дня; ремонт ${rub(avg(r => r.repairs))} ₽${techs > 0 ? `, зарплата техников ${rub(avg(r => r.wages))} ₽` : ''}`);
    if (techs === TECHS[0]) {
      const byEq = new Map<Id, number>();
      for (const r of runs) for (const [eq, x] of r.exams) byEq.set(eq, (byEq.get(eq) ?? 0) + x / n);
      console.log(`  обследований в сутки на аппарат: ${[...byEq].map(([eq, x]) => `${eq.slice(3)} ${pct(x)}`).join(', ')}`);
    }
  }
}
