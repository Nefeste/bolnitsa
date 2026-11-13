// Проба к спецификации «Песочница» (docs/specs/2026-11-sandbox.md, «Замер»): что есть у каждой готовой больницы — отделения,
// койки, диагностика днём и ночью, точность врачей за неделю, отказы «мест нет», — чтобы требования уровня больницы
// (амбулатория → районная → городская → областная, геймдизайн §4) опирались на числа, а не на догадку.
//
// Больницы: поликлиника, амбулатория сценария 1, начала сценариев 2–4 (`site.emergency`, `site.surgery` и она же с кабинетом
// КТ и палатой интенсивной терапии «С персоналом», как в симуляторе экономики), готовые районная, районная с сосудистым
// отделением и городская. Зима, никто не играет: кабинеты врача ведут нанятые терапевты днём и ночью.
//
// В 14:00 и в 02:00 третьих суток — что работает (`hospitalCtx` на этот час): помещения по видам, отделения, которые
// больница принимает (`departmentsOf`), койки палат, ПИТ, реанимации и боксов; за все сутки — приёмы, верные диагнозы (ваши
// и нанятых врачей), отказы в госпитализации (`refusalOf`, tools/bench/refused.ts: «мест нет» и «нет своих»), умершие в стационаре.
// Уровень по предложенным требованиям — в конце строки; требования — `LEVELS` ниже, игровые числа спецификации.
//
// bun tools/bench/levels.ts [--days 7] [--seeds 1,2] [--hospital poly,ambulatory,emergency,surgery,vascular,district,vpreset,city]
import type { ContentDb, Id } from '../../src/content/types';
import { db as bundle } from '../../src/content';
import { hospitalOf, type SiteCommand } from '../../src/engine/hospital/site';
import { siteOfPlan } from '../../src/engine/hospital/site-plan';
import { siteOfPreset } from '../../src/engine/hospital/site-preset';
import { presetStaff, type StaffMember, withNightShift } from '../../src/engine/hospital/staff';
import { apply, boxBeds, departmentsOf, hospitalCtx, icuBeds, newFlowShift, ricuBeds, wardBeds } from '../../src/engine/shift/engine';
import type { ShiftPatient, ShiftState } from '../../src/engine/shift/types';
import { refusalOf } from './refused';

const arg = (name: string, def: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
};
const DAYS = Number(arg('days', '7'));
const SEEDS = arg('seeds', '1,2').split(',').map(Number);
const HOSPITALS = arg('hospital', 'poly,ambulatory,emergency,surgery,vascular,district,vpreset,city').split(',');
const db: ContentDb = bundle;
const H = 3600;
const DAY = 24 * H;

/** Диагностика, которую считают «круглосуточной», если помещение работает и ночью. */
const DIAG: Id[] = ['room.lab', 'room.xray', 'room.ultrasound', 'room.ct', 'room.mri', 'room.endoscopy'];

/**
 * Предложенные требования уровня (игровые числа спецификации): отделения со своими койками или помещениями (кроме приёмного
 * и терапии — они у всех), коек всего, что работает круглосуточно, точность за 7 суток, %.
 */
const LEVELS: { name: string; depts: number; beds: number; night: Id[]; accuracy: number }[] = [
  { name: 'районная', depts: 1, beds: 8, night: ['room.emergency', 'room.xray', 'room.lab'], accuracy: 70 },
  { name: 'городская', depts: 3, beds: 24, night: ['room.emergency', 'room.xray', 'room.lab', 'room.ct', 'room.icu'], accuracy: 75 },
  { name: 'областная', depts: 4, beds: 48, night: ['room.emergency', 'room.xray', 'room.lab', 'room.ct', 'room.icu', 'room.ricu', 'room.ultrasound', 'room.endoscopy', 'room.mri'], accuracy: 80 },
];

function start(name: string, seed: number): ShiftState {
  let site;
  let staff: StaffMember[];
  const preset = ({ district: 'preset.district', vpreset: 'preset.vascular', city: 'preset.city' } as Record<string, Id>)[name];
  if (preset) {
    const rec = db.presets[preset];
    const { mine: _, ...rest } = siteOfPreset(db, rec);
    site = rest;
    staff = presetStaff(db, rec);
  } else {
    const id = ({ poly: 'site.polyclinic', ambulatory: 'site.ambulatory', emergency: 'site.emergency' } as Record<string, Id>)[name] ?? 'site.surgery';
    const p = siteOfPlan(db, db.sites![id]);
    if (!p.ok) throw new Error(`${name}: помещение ${p.room}`);
    const { mine: _, ...rest } = p.site;
    site = rest;
    staff = p.staff;
  }
  const s = newFlowShift(db, { seed, season: 'winter', hospital: hospitalOf(db, site), staff: withNightShift(db, site.rooms, staff), flow: { perHour: 0, auto: true }, economy: { cash: 5_000_000 } });
  const cmd = (c: SiteCommand) => apply(db, s, { kind: 'site', cmd: c });
  // больница сценария 4: кабинет КТ у смотровой и ПИТ «С персоналом» — как разумный план симулятора экономики
  if (name === 'vascular') {
    cmd({ kind: 'ready', type: 'room.ct', size: 'M', x: 52, y: 26, rot: 2, staff: true });
    cmd({ kind: 'ready', type: 'room.icu', size: 'M', x: 62, y: 26, rot: 2, staff: true });
  }
  for (const r of s.hospital!.site!.rooms.filter(x => x.type === 'room.office')) {
    for (const shift of ['day', 'night'] as const) {
      if (!s.staff!.some(m => m.room === r.id && (m.shift === shift || m.shift === undefined) && db.roles[m.role]?.stands === 'role.doctor')) cmd({ kind: 'hire', room: r.id, role: 'role.doctor', shift });
    }
  }
  cmd({ kind: 'done' });
  return s;
}

interface Look {
  /** работающие помещения по видам */
  rooms: Record<Id, number>;
  depts: Id[];
}

/**
 * Отделения больницы: те, что она принимает (`departmentsOf`; травма — у хирургии, `takes`), и те, чьи помещения работают
 * (отделение по виду помещения: операционная — хирургия, бокс — инфекционное, ПИТ и реанимация — реанимация).
 */
function look(s: ShiftState): Look {
  const ctx = hospitalCtx(db, s);
  const rooms: Record<Id, number> = {};
  for (const r of ctx.plan.rooms) if (ctx.working.has(r.id)) rooms[r.type] = (rooms[r.type] ?? 0) + 1;
  const of = (d: Id) => Object.values(db.departments ?? {}).find(x => x.takes?.includes(d))?.id ?? d;
  const depts = new Set(departmentsOf(db, s).map(of));
  for (const t of Object.keys(rooms)) if (db.rooms[t]?.department) depts.add(db.rooms[t].department!);
  return { rooms, depts: [...depts].filter(d => db.departments?.[d]).sort() };
}

function run(name: string, seed: number) {
  const s = start(name, seed);
  let day: Look | undefined;
  let night: Look | undefined;
  let beds = { ward: 0, icu: 0, ricu: 0, box: 0 };
  const ended = new Set<string>();
  let full = 0;
  let none = 0;
  const patient = (id: string): ShiftPatient | undefined => s.patients[id] ?? s.past?.find(x => x.p.id === id)?.p;
  const end = (DAYS * 24 + 8) * H;
  const at14 = (2 * 24 + 14) * H;
  const at02 = (3 * 24 + 2) * H;
  while (s.t < end) {
    apply(db, s, { kind: 'advance', seconds: 300 });
    if (!day && s.t >= at14) {
      day = look(s);
      beds = { ward: wardBeds(db, s).length, icu: icuBeds(db, s).length, ricu: ricuBeds(db, s).length, box: boxBeds(db, s).length };
    }
    if (!night && s.t >= at02) night = look(s);
    for (const [id, j] of Object.entries(s.journeys?.of ?? {})) {
      const e = j.end;
      if (!e || ended.has(id)) continue;
      ended.add(id);
      const d = Math.floor((e.t - 8 * H) / DAY);
      const p = patient(id);
      const no = d >= 0 && d < DAYS && p ? refusalOf(db, s, p, e) : undefined;
      if (no?.full) full++;
      else if (no) none++;
    }
  }
  // сутки N — с 08:00 суток N до 08:00 следующих
  const days = (s.history ?? []).filter(h => h.day >= 1 && h.day <= DAYS);
  let seen = 0;
  let correct = 0;
  let died = 0;
  let arrived = 0;
  let left = 0;
  const rep: number[] = [];
  for (const h of days) {
    arrived += h.arrived;
    left += h.left + (h.unseen ?? 0);
    if (h.economy) rep.push(h.economy.reputation.to);
    seen += h.seen;
    correct += h.correct;
    for (const c of Object.values(h.colleagues ?? {})) {
      seen += c.seen;
      correct += c.correct;
    }
    died += h.ward?.died ?? 0;
  }
  return { day: day!, night: night!, beds, seen, correct, died, full, none, days: days.length, arrived, left, rep };
}

const short = (id: Id) => db.rooms[id]?.name.ru ?? id;
const deptName = (id: Id) => db.departments?.[id]?.name.ru ?? id;

for (const name of HOSPITALS) {
  for (const seed of SEEDS) {
    const r = run(name, seed);
    const bedsAll = r.beds.ward + r.beds.icu + r.beds.ricu + r.beds.box;
    const nightDiag = DIAG.filter(t => (r.night.rooms[t] ?? 0) > 0);
    const accuracy = r.seen ? Math.round((100 * r.correct) / r.seen) : 0;
    const extra = r.day.depts.filter(d => d !== 'dept.therapy' && d !== 'dept.emergency');
    const level =
      [...LEVELS].reverse().find(l => extra.length >= l.depts && bedsAll >= l.beds && accuracy >= l.accuracy && l.night.every(t => (r.night.rooms[t] ?? 0) > 0))?.name ?? 'амбулатория';
    const missing = LEVELS.map(l => {
      const why = [
        extra.length < l.depts && `отделений ${extra.length} из ${l.depts}`,
        bedsAll < l.beds && `коек ${bedsAll} из ${l.beds}`,
        accuracy < l.accuracy && `точность ${accuracy} из ${l.accuracy}`,
        ...l.night.filter(t => !(r.night.rooms[t] ?? 0)).map(t => `ночью нет: ${short(t)}`),
      ].filter(Boolean);
      return why.length ? `${l.name} — ${why.join(', ')}` : `${l.name} — да`;
    });
    console.log(
      `${name.padEnd(10)} зерно ${seed}: помещений днём ${Object.values(r.day.rooms).reduce((a, b) => a + b, 0)}, ночью ${Object.values(r.night.rooms).reduce((a, b) => a + b, 0)}; ` +
        `отделения ${r.day.depts.map(deptName).join(', ')}; койки: палаты ${r.beds.ward}, ПИТ ${r.beds.icu}, реанимация ${r.beds.ricu}, боксы ${r.beds.box}; ` +
        `диагностика ночью: ${nightDiag.map(short).join(', ') || 'нет'}; приёмов ${r.seen} за ${r.days} суток, верных ${accuracy} %; ` +
        `ушли, не дождавшись, ${r.arrived ? Math.round((100 * r.left) / r.arrived) : 0} % пришедших; отказы: мест нет ${(r.full / DAYS).toFixed(1)} в сутки, нет своих ${(r.none / DAYS).toFixed(1)}; умерли ${r.died}; ` +
        `репутация по утрам ${r.rep.join(', ')}`,
    );
    console.log(`    уровень по предложенным требованиям: ${level}; ${missing.join('; ')}`);
  }
}
