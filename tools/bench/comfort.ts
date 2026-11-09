// Проба к спецификации комфорта и чистоты (docs/specs/2026-11-comfort.md, «Замер»): сколько людей за сутки проходит через каждое
// помещение готовых больниц и сколько свободного времени у санитаров, — чтобы чистота и уборка опирались на числа, а не на
// догадку. Никто не играет: в вашем кабинете — нанятый терапевт днём и ночью, как в пробах сценариев.
//
// Считается по суткам (с 08:00 до 08:00), по путям движка (`s.journeys`): у врача — помещение врача; обследование — его
// помещение (лаборатория — где берут материал, рентген — сам кабинет); зал ожидания — где пациент сел ждать (`hall`);
// регистратура — каждый пришедший сам; койка — лежащие в палате, ПИТ, реанимации в 08:00. Персонал — перерывы в ординаторской
// и походы в туалет (`crew`). Санитары — сколько минут в сутки на каталке (`rides`) и сколько свободных.
//
// bun tools/bench/comfort.ts [--days 3] [--seeds 1,2] [--hospital poly,city,surgery]
import type { ContentDb, Id } from '../../src/content/types';
import { db as bundle } from '../../src/content';
import { hospitalOf } from '../../src/engine/hospital/site';
import { siteOfPlan } from '../../src/engine/hospital/site-plan';
import { siteOfPreset } from '../../src/engine/hospital/site-preset';
import { presetStaff, type StaffMember, withNightShift } from '../../src/engine/hospital/staff';
import { apply, newFlowShift } from '../../src/engine/shift/engine';
import { startCash } from '../../src/engine/shift/money';
import type { ShiftState } from '../../src/engine/shift/types';

const arg = (name: string, def: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
};
const DAYS = Number(arg('days', '3'));
const SEEDS = arg('seeds', '1,2').split(',').map(Number);
const HOSPITALS = arg('hospital', 'poly,city,surgery').split(',');
const db: ContentDb = bundle;
const H = 3600;
const DAY = 24 * H;

function start(name: string, seed: number): ShiftState {
  let site;
  let staff: StaffMember[];
  if (name === 'city') {
    const rec = db.presets['preset.city'];
    const { mine: _, ...rest } = siteOfPreset(db, rec);
    site = rest;
    staff = presetStaff(db, rec);
  } else {
    const p = siteOfPlan(db, db.sites![name === 'poly' ? 'site.polyclinic' : 'site.surgery']);
    if (!p.ok) throw new Error(`${name}: помещение ${p.room}`);
    const { mine: _, ...rest } = p.site;
    site = rest;
    staff = p.staff;
  }
  const s = newFlowShift(db, { seed, season: 'winter', hospital: hospitalOf(db, site), staff: withNightShift(db, site.rooms, staff), flow: { perHour: 0, auto: true }, economy: { cash: startCash(db, 'preset') } });
  // кабинеты врача без врача — нанятый терапевт днём и ночью (ваш кабинет никто не ведёт)
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

interface RoomDay {
  type: Id;
  cells: number;
  /** посещений пациентов за сутки */
  visits: number[];
  /** перерывов и походов персонала за сутки */
  staff: number[];
}

function run(name: string, seed: number) {
  const s = start(name, seed);
  const rooms = new Map<string, RoomDay>();
  for (const r of s.hospital!.site!.rooms) rooms.set(r.id, { type: r.type, cells: Math.max(0, (r.w - 2) * (r.h - 2)), visits: Array(DAYS).fill(0), staff: Array(DAYS).fill(0) });
  const reception = s.hospital!.site!.rooms.find(r => r.type === 'room.reception')?.id;
  const counted = new Set<string>();
  const dayOf = (t: number) => Math.floor((t - 8 * H) / DAY);
  const add = (room: string | undefined, t: number, key: string, staff = false) => {
    const d = dayOf(t);
    if (room === undefined || d < 0 || d >= DAYS || counted.has(key)) return;
    const r = rooms.get(room);
    if (!r) return;
    counted.add(key);
    (staff ? r.staff : r.visits)[d]++;
  };
  const rideMin = new Map<string, number[]>();
  const seenRide = new Set<string>();
  const orderlies = () => (s.staff ?? []).filter(m => m.role === 'role.orderly');
  const end = (DAYS * 24 + 8) * H;
  while (s.t < end) {
    apply(db, s, { kind: 'advance', seconds: 120 });
    for (const [id, j] of Object.entries(s.journeys?.of ?? {})) {
      if (j.kind !== 'ambulance' && reception) add(reception, j.at, `${id}:reception`);
      for (const st of j.steps) {
        if (st.k === 'doctor') add(st.room, st.t, `${id}:doc:${st.room}`);
        else if (st.k === 'exam') add(st.room, st.at, `${id}:exam:${st.exam}`);
      }
    }
    for (const p of Object.values(s.patients)) {
      if (p.hall) add(p.hall, s.t, `${p.id}:hall:${p.hall}`);
      if (p.stay && dayOf(s.t) >= 0) add(p.stay.room, s.t, `${p.id}:bed:${dayOf(s.t)}`);
    }
    for (const [mid, c] of Object.entries(s.crew ?? {})) {
      const r = c.rest;
      if (r && r.room) add(r.room, r.from, `${mid}:rest:${r.from}`, true);
    }
    for (const r of s.rides ?? []) {
      const key = `${r.id}:${r.by}:${r.go}`;
      if (seenRide.has(key)) continue;
      seenRide.add(key);
      const d = dayOf(r.go);
      if (d < 0 || d >= DAYS) continue;
      const a = rideMin.get(r.by) ?? Array(DAYS).fill(0);
      a[d] += Math.round(((r.home ?? r.done) - r.go) / 60);
      rideMin.set(r.by, a);
    }
  }
  return { rooms, orderlies: orderlies().map(m => ({ id: m.id, room: m.room, shift: m.shift, min: rideMin.get(m.id) ?? Array(DAYS).fill(0) })) };
}

for (const name of HOSPITALS) {
  const byType = new Map<Id, { rooms: number; cells: number; visits: number[]; staff: number[] }>();
  let orderly = '';
  for (const seed of SEEDS) {
    const r = run(name, seed);
    for (const x of r.rooms.values()) {
      const t = byType.get(x.type) ?? { rooms: 0, cells: 0, visits: [], staff: [] };
      t.rooms++;
      t.cells += x.cells;
      t.visits.push(...x.visits);
      t.staff.push(...x.staff);
      byType.set(x.type, t);
    }
    if (seed === SEEDS[0]) {
      orderly = r.orderlies.map(o => `${o.room ?? 'резерв'}/${o.shift ?? '—'}: ${o.min.join(', ')} мин`).join('; ');
    }
  }
  console.log(`\n## ${name}: суток ${DAYS}, зёрна ${SEEDS.join(', ')} — посещений в сутки на помещение (среднее, наибольшее), клеток пола`);
  for (const [type, t] of [...byType.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
    const per = t.rooms / SEEDS.length;
    console.log(`  ${type.slice(5).padEnd(10)} помещений ${per}, клеток ${Math.round(t.cells / t.rooms)}: пациентов ${mean(t.visits).toFixed(1)} (до ${Math.max(0, ...t.visits)}), персонала ${mean(t.staff).toFixed(1)}`);
  }
  console.log(`  санитары (зерно ${SEEDS[0]}), минут на каталке по суткам: ${orderly || 'нет'}`);
}
