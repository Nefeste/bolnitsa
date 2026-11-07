// Проба к спецификации сценария 2 «Приёмное» (docs/specs/2026-11-scenario-2.md, «Замер»): что делает больница со скорой,
// рентгеном и палатами круглые сутки, если никто не играет, — чтобы цели сценария опирались на числа, а не на догадки.
//
// Больница — районная симулятора экономики (`tools/sim/economy.ts`, `district`): ряд амбулатории, ЭКГ, два кабинета,
// доврачебный, вторая зона ожидания, рентген, две палаты и смотровая приёмного; ночная смена там, где работают ночью, и
// ночной терапевт в первом кабинете. Все случаи ведут нанятые врачи. Считается:
// - кто пришёл и кто ушёл, не дождавшись, — днём (08:00–20:00) и ночью (20:00–08:00), и по виду прихода;
// - привезённые скорой: цвет по шкале (NEWS2 и красные флаги), сколько ждали врача от приезда — днём и ночью;
// - стационар: поступили, выписаны, раньше срока, переведены; сутки против обычного срока; сколько коек занято.
//
// bun tools/bench/emergency.ts [--days 7] [--seeds 1,2,3,4,5,6] [--places 1] [--wards S]
//   --places 2 — смотровая на два места; --wards M — палаты на четыре койки вместо двух
import type { Id } from '../../src/content/types';
import { emptySite, hospitalOf, type SiteCommand } from '../../src/engine/hospital/site';
import { nightHospital } from '../../src/engine/hospital/staff';
import { startCash } from '../../src/engine/shift/money';
import { apply, newFlowShift } from '../../src/engine/shift/engine';
import type { ShiftState, Triage, VisitKind } from '../../src/engine/shift/types';
import { buildDb } from '../content/load';

const arg = (name: string, def: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
};
const DAYS = Number(arg('days', '7'));
const SEEDS = arg('seeds', '1,2,3,4,5,6').split(',').map(Number);
const PLACES = Number(arg('places', '1'));
const WARDS = arg('wards', 'S');

const built = buildDb();
if (built.errors.length) {
  console.error(built.errors.join('\n'));
  process.exit(1);
}
const db = built.db;

/** Помещение по плану, как в симуляторе экономики: тип, прямоугольник со стенами, дверь посередине верхней или нижней стены. */
type Spec = [type: Id, x: number, y: number, w: number, h: number, side: 'top' | 'bottom'];
const DISTRICT: Spec[] = [
  ['room.reception', 6, 6, 6, 7, 'bottom'],
  ['room.waiting', 11, 6, 9, 7, 'bottom'],
  ['room.office', 19, 6, 8, 7, 'bottom'],
  ['room.staff', 26, 6, 6, 7, 'bottom'],
  ['room.procedure', 31, 6, 6, 7, 'bottom'],
  ['room.lab', 36, 6, 6, 7, 'bottom'],
  ['room.toilet', 41, 6, 6, 7, 'bottom'],
  ['room.ecg', 46, 6, 6, 7, 'bottom'],
  ['room.office', 6, 15, 8, 7, 'top'],
  ['room.office', 13, 15, 8, 7, 'top'],
  ['room.triage', 20, 15, 6, 7, 'top'],
  ['room.waiting', 25, 15, 6, 7, 'top'],
  ['room.xray', 30, 15, 8, 7, 'top'],
  // палата: S — две койки, M — четыре (content/hospital/rooms/ward.yaml); вторая M — в нижнем ряду, левее смотровой
  ...(WARDS === 'M'
    ? ([['room.ward', 37, 15, 9, 7, 'top'], ['room.ward', 32, 27, 9, 7, 'top']] as Spec[])
    : ([['room.ward', 37, 15, 7, 7, 'top'], ['room.ward', 43, 15, 7, 7, 'top']] as Spec[])),
  // смотровая: S — одна койка, M — две (content/hospital/rooms/emergency.yaml)
  PLACES >= 2 ? ['room.emergency', 42, 27, 9, 6, 'top'] : ['room.emergency', 44, 27, 7, 6, 'top'],
];
const DOUBLE = new Set(['room.ward', 'room.xray', 'room.emergency']);

function site(s: ShiftState, cmd: SiteCommand): string | undefined {
  const n = apply(db, s, { kind: 'site', cmd }).find(x => x.kind === 'site');
  if (!n || n.kind !== 'site' || !n.ok) throw new Error(`стройка: ${JSON.stringify(cmd)} — ${JSON.stringify(n)}`);
  return n.room;
}

/** Построить, как симулятор экономики: протянуть, обставить, дверь, люди на все должности; ночная смена и ночной терапевт. */
function build(s: ShiftState) {
  const night = nightHospital(db, DISTRICT.map(([type]) => ({ type })));
  let office: string | undefined;
  for (const [type, x, y, w, h, side] of DISTRICT) {
    const id = site(s, { kind: 'room', type, x, y, w, h })!;
    site(s, { kind: 'furnish', room: id });
    const mid = x + Math.floor(w / 2);
    const wy = side === 'top' ? y : y + h - 1;
    site(s, { kind: 'door', room: id, cells: DOUBLE.has(type) ? [[mid - 1, wy], [mid, wy]] : [[mid, wy]] });
    for (const role of db.rooms[type].staff) {
      site(s, { kind: 'hire', room: id, role, shift: 'day' });
      if (night && db.rooms[type].night) site(s, { kind: 'hire', room: id, role, shift: 'night' });
    }
    if (type === 'room.office') office ??= id;
  }
  if (night && office) site(s, { kind: 'hire', room: office, role: 'role.doctor', shift: 'night' });
  apply(db, s, { kind: 'site', cmd: { kind: 'done' } });
}

const HOUR = 3600;
/** ночь — 20:00–08:00, как ночная смена (`content/hospital/economy.yaml`, `staff.shifts.day`) */
const isNight = (t: number) => {
  const h = Math.floor((t % (24 * HOUR)) / HOUR);
  return h < 8 || h >= 20;
};
const part = (t: number) => (isNight(t) ? 'night' : 'day');

interface Seen {
  kind: VisitKind;
  arriveT: number;
  calledT?: number;
  scale?: Triage;
  news2?: number;
}

const arrived = { day: {} as Record<string, number>, night: {} as Record<string, number> };
const left = { day: {} as Record<string, number>, night: {} as Record<string, number> };
/** ушли ночью — когда пришли: днём (не приняли до пересменки) или ночью */
const leftNightCameDay = { n: 0 };
const ambWait = { day: [] as number[], night: [] as number[] };
const redWait = { day: [] as number[], night: [] as number[] };
const colors: Record<string, number> = {};
const news: number[] = [];
const ward = { admitted: 0, discharged: 0, early: 0, transferred: 0, died: 0, stayDays: 0, stayNorm: 0 };
const occupancy: number[] = [];
let beds = 0;
let doorMax = 0;
let days = 0;

for (const seed of SEEDS) {
  const s = newFlowShift(db, { seed, season: 'winter', hospital: hospitalOf(db, emptySite()), staff: [], flow: { perHour: 0, auto: true }, economy: { cash: startCash(db, 'empty') } });
  build(s);
  beds = s.hospital!.site!.rooms.filter(r => r.type === 'room.ward').reduce((n, r) => n + r.items.filter(i => i.kind === 'bed').length, 0);
  const seen = new Map<string, Seen>();
  const end = (DAYS * 24 + 8) * HOUR;
  while (s.t < end) {
    const notices = apply(db, s, { kind: 'advance', seconds: 60 });
    for (const p of Object.values(s.patients)) {
      let x = seen.get(p.id);
      if (!x) {
        x = { kind: p.kind, arriveT: p.arriveT };
        seen.set(p.id, x);
        arrived[part(p.arriveT)][p.kind] = (arrived[part(p.arriveT)][p.kind] ?? 0) + 1;
      }
      if (p.scale && x.scale === undefined) {
        x.scale = p.scale.triage;
        x.news2 = p.scale.news2;
        colors[p.scale.triage] = (colors[p.scale.triage] ?? 0) + 1;
        news.push(p.scale.news2);
      }
      if (p.calledT !== undefined && x.calledT === undefined) {
        x.calledT = p.calledT;
        if (p.kind === 'ambulance') {
          const w = Math.round((p.calledT - p.arriveT) / 60);
          ambWait[part(p.arriveT)].push(w);
          if (x.scale === 'red') redWait[part(p.arriveT)].push(w);
        }
      }
    }
    for (const n of notices) {
      if (n.kind !== 'left') continue;
      const x = seen.get(n.id);
      const k = x?.kind ?? 'walkIn';
      left[part(s.t)][k] = (left[part(s.t)][k] ?? 0) + 1;
      if (isNight(s.t) && x && !isNight(x.arriveT)) leftNightCameDay.n++;
    }
    const lying = Object.values(s.patients).filter(p => p.status === 'admitted' && p.stay && s.hospital!.site!.rooms.find(r => r.id === p.stay!.room)?.type === 'room.ward').length;
    occupancy.push(lying);
    doorMax = Math.max(doorMax, Object.values(s.patients).filter(p => p.kind === 'ambulance' && !p.bay && p.status === 'waiting').length);
  }
  for (const h of s.history) {
    days++;
    const w = h.ward;
    if (!w) continue;
    ward.admitted += w.admitted;
    ward.discharged += w.discharged;
    ward.early += w.early;
    ward.transferred += w.transferred;
    ward.died += w.died ?? 0;
    ward.stayDays += w.stayDays;
    ward.stayNorm += w.stayNorm;
  }
}

const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
const fmt = (r: Record<string, number>) => Object.entries(r).map(([k, v]) => `${k} ${v}`).join(', ') || '—';
const med = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : 0);
const p90 = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length * 0.9)] : 0);
const max = (xs: number[]) => (xs.length ? Math.max(...xs) : 0);
const per = (n: number) => (n / days).toFixed(1);

console.log(`районная: смотровая на ${PLACES} ${PLACES === 1 ? 'место' : 'места'}, коек в палатах ${beds}; зёрна ${SEEDS.join(',')}, по ${DAYS} сут. — всего ${days} сут.`);
console.log(`пришли днём ${sum(arrived.day)} (${per(sum(arrived.day))} в сутки: ${fmt(arrived.day)}), ночью ${sum(arrived.night)} (${per(sum(arrived.night))}: ${fmt(arrived.night)})`);
console.log(`ушли, не дождавшись: днём ${sum(left.day)} (${per(sum(left.day))} в сутки: ${fmt(left.day)}), ночью ${sum(left.night)} (${per(sum(left.night))}: ${fmt(left.night)}; из них пришли днём — ${leftNightCameDay.n})`);
console.log(`скорая по шкале: ${fmt(colors)}; NEWS2 — медиана ${med(news)}, 9 из 10 — не больше ${p90(news)}`);
console.log(`скорая — от приезда до врача, мин: днём медиана ${med(ambWait.day)}, 9 из 10 — ${p90(ambWait.day)}, дольше всех ${max(ambWait.day)} (${ambWait.day.length}); ночью медиана ${med(ambWait.night)}, 9 из 10 — ${p90(ambWait.night)}, дольше всех ${max(ambWait.night)} (${ambWait.night.length})`);
console.log(`  «красные»: днём ${redWait.day.join(', ') || '—'}; ночью ${redWait.night.join(', ') || '—'}`);
console.log(`  у входа без места в смотровой — до ${doorMax} сразу`);
const occ = occupancy.length ? occupancy.reduce((a, b) => a + b, 0) / occupancy.length : 0;
console.log(`стационар: поступили ${ward.admitted} (${per(ward.admitted)} в сутки), выписаны ${ward.discharged}, раньше срока ${ward.early}, переведены ${ward.transferred}, умерли ${ward.died}`);
console.log(`  сутки у выписанных: ${ward.discharged ? (ward.stayDays / ward.discharged).toFixed(2) : '—'} при обычных ${ward.discharged ? (ward.stayNorm / ward.discharged).toFixed(2) : '—'}; коек занято в среднем ${occ.toFixed(1)} из ${beds}, все заняты — ${((100 * occupancy.filter(n => n >= beds).length) / Math.max(1, occupancy.length)).toFixed(0)} % времени`);
