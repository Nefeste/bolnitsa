// Проба к спецификации сценария 5 «Инфекции» (docs/specs/2026-11-scenario-5.md, «Замер»): зимняя волна гриппа в больнице —
// сколько приходит, сколько кладут и куда, скольких отправляют в другую больницу, потому что мест нет, сколько с пневмонией, —
// чтобы цели «волна без отказов в госпитализации» и «пневмонии в срок» опирались на числа, а не на догадку.
//
// Больницы: ваша из сценария 4 (`site.surgery` с кабинетом КТ у смотровой и ПИТ «С персоналом», как в симуляторе экономики) и
// готовая городская (три бокса, палаты, ПИТ, реанимация). Зима; волна — доля пришедших сами с гриппом (`--wave 0,20,40`), как
// у испытания «Зимний грипп»: в пробе — своя запись испытания в копии базы (поток — от больницы, часы — все сутки прогона); в
// игру она не идёт. Никто не играет: кабинеты врача ведут нанятые терапевты днём и ночью.
//
// По суткам (с 08:00): пришли сами и по скорой; с гриппом и с пневмонией (по болезням пациента); где закрыли: дома, легли у нас
// (палата, бокс, ПИТ, реанимация), отправлены в другую больницу — и из них потому, что свои места были заняты (`full` или
// `wanted` в конце пути); ушли, не дождавшись; лежат в 08:00.
//
// `--cond` — болезнь волны (по умолчанию грипп; `cond.pneumonia_cap`, `cond.covid19` — те, кого кладут тяжёлыми).
// `--add` — что пристроить к вашей больнице в 08:00 первых суток, готовыми помещениями «С персоналом»: варианты через запятую,
// помещения варианта через «+», помещение — `тип:размер:x:y:поворот` (`-` — ничего), например
// `--add -,ward:M:48:16:0,ward:M:48:16:0+ward:M:58:16:0+box:S:68:16:0` — места на свободной земле `site.surgery` у КТ и ПИТ.
// Кого отправили, потому что мест нет, — и по тому, какие места были заняты: палаты, ПИТ и реанимация, боксы; с какими
// болезнями (главная болезнь пациента, восемь чаще всех).
//
// bun tools/bench/infections.ts [--days 7] [--seeds 1,2,3] [--hospital start,city] [--wave 0,20,40] [--cond cond.influenza]
//   [--add -,ward:M:48:16:0]
import type { Challenge, ContentDb, Id } from '../../src/content/types';
import { db as bundle } from '../../src/content';
import { hospitalOf, type SiteCommand } from '../../src/engine/hospital/site';
import { siteOfPlan } from '../../src/engine/hospital/site-plan';
import { siteOfPreset } from '../../src/engine/hospital/site-preset';
import { primaryOf } from '../../src/engine/med/plan';
import { presetStaff, type StaffMember, withNightShift } from '../../src/engine/hospital/staff';
import { apply, newFlowShift } from '../../src/engine/shift/engine';
import type { ShiftPatient, ShiftState } from '../../src/engine/shift/types';

const arg = (name: string, def: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
};
const DAYS = Number(arg('days', '7'));
const SEEDS = arg('seeds', '1,2,3').split(',').map(Number);
const HOSPITALS = arg('hospital', 'start,city').split(',');
const WAVES = arg('wave', '0,20,40').split(',').map(Number);
const H = 3600;
const DAY = 24 * H;
const FLU = 'cond.influenza';
const COND = arg('cond', FLU);
const PNEUMONIA = 'cond.pneumonia_cap';
/** Варианты пристройки: помещения «С персоналом» в 08:00 первых суток. */
const ADDS = arg('add', '-').split(',').map(v => (v === '-' ? [] : v.split('+').map(r => {
  const [type, size, x, y, rot] = r.split(':');
  return { type: `room.${type}`, size: size as 'S' | 'M' | 'L', x: Number(x), y: Number(y), rot: Number(rot) as 0 | 1 | 2 | 3 };
})));
type Add = (typeof ADDS)[number];

/** Копия базы с записью испытания пробы: волна гриппа на все сутки прогона, поток от больницы. */
function dbWith(share: number): { db: ContentDb; id?: Id } {
  if (share <= 0) return { db: bundle };
  const ch: Challenge = {
    id: 'challenge.probe_wave', order: 99, name: { ru: 'проба' }, about: { ru: 'проба' }, kind: 'chief', start: 'preset.city', season: 'winter',
    from: 8, to: 8 + DAYS * 24, flow: 'auto', wave: { condition: COND, share }, cash: 5_000_000, grade: { by: 'unseen', a: 1, b: 2, c: 3 },
  };
  return { db: { ...bundle, challenges: { ...(bundle.challenges ?? {}), [ch.id]: ch } }, id: ch.id };
}

function start(db: ContentDb, name: string, seed: number, add: Add, challenge?: Id): ShiftState {
  let site;
  let staff: StaffMember[];
  if (name === 'city') {
    const rec = db.presets['preset.city'];
    const { mine: _, ...rest } = siteOfPreset(db, rec);
    site = rest;
    staff = presetStaff(db, rec);
  } else {
    const p = siteOfPlan(db, db.sites!['site.surgery']);
    if (!p.ok) throw new Error(`${name}: помещение ${p.room}`);
    const { mine: _, ...rest } = p.site;
    site = rest;
    staff = p.staff;
  }
  const s = newFlowShift(db, {
    seed, season: 'winter', hospital: hospitalOf(db, site), staff: withNightShift(db, site.rooms, staff), flow: { perHour: 0, auto: true }, economy: { cash: 5_000_000 },
    ...(challenge ? { challenge } : {}),
  });
  const cmd = (c: SiteCommand) => apply(db, s, { kind: 'site', cmd: c });
  // ваша больница из сценария 4: кабинет КТ у смотровой и ПИТ «С персоналом» — как разумный план симулятора экономики
  if (name === 'start') {
    cmd({ kind: 'ready', type: 'room.ct', size: 'M', x: 52, y: 26, rot: 2, staff: true });
    cmd({ kind: 'ready', type: 'room.icu', size: 'M', x: 62, y: 26, rot: 2, staff: true });
  }
  for (const r of add) {
    const out = cmd({ kind: 'ready', ...r, staff: true }).find(n => n.kind === 'site');
    if (!out || out.kind !== 'site' || !out.ok) throw new Error(`${name}: не встало ${r.type} ${r.size} ${r.x},${r.y}: ${JSON.stringify(out)}`);
  }
  for (const r of s.hospital!.site!.rooms.filter(x => x.type === 'room.office')) {
    for (const shift of ['day', 'night'] as const) {
      if (!s.staff!.some(m => m.room === r.id && (m.shift === shift || m.shift === undefined) && db.roles[m.role]?.stands === 'role.doctor')) cmd({ kind: 'hire', room: r.id, role: 'role.doctor', shift });
    }
  }
  cmd({ kind: 'done' });
  return s;
}

interface Row {
  walk: number; amb: number; flu: number; pneumonia: number;
  home: number; ward: number; box: number; icu: number; away: number; full: number; left: number; lying: number;
  /** отправлены, потому что мест нет: заняты палаты, ПИТ или реанимация, боксы */
  fullWard: number; fullIcu: number; fullBox: number;
  /** пневмония: легли у нас, отправлены, дома; выписаны — в срок (не дольше обычного, не раньше) и раньше срока */
  pnStay: number; pnAway: number; pnHome: number; pnOut: number; pnOnTime: number; pnEarly: number;
  /** главная болезнь — болезнь волны: пришли, нужна койка (легли или отправлены, потому что мест нет), из них отправлены; выписаны и их сутки */
  wvArr: number; wvBed: number; wvFull: number; wvOut: number; wvDays: number;
  /** главная болезнь — инфекционного отделения: пришли, нужна койка, из них отправлены, потому что мест нет */
  infArr: number; infBed: number; infFull: number;
}

const has = (p: ShiftPatient, id: Id) => p.patient.truth.conditions.some(c => c.id === id);
/** отправленные, потому что мест нет, — по главной болезни, за все прогоны варианта */
const refused = new Map<Id, number>();

function run(db: ContentDb, name: string, seed: number, add: Add, challenge?: Id): Row[] {
  const s = start(db, name, seed, add, challenge);
  const rows: Row[] = Array.from({ length: DAYS }, () => ({ walk: 0, amb: 0, flu: 0, pneumonia: 0, home: 0, ward: 0, box: 0, icu: 0, away: 0, full: 0, left: 0, lying: 0, fullWard: 0, fullIcu: 0, fullBox: 0, pnStay: 0, pnAway: 0, pnHome: 0, pnOut: 0, pnOnTime: 0, pnEarly: 0, wvArr: 0, wvBed: 0, wvFull: 0, wvOut: 0, wvDays: 0, infArr: 0, infBed: 0, infFull: 0 }));
  const dayOf = (t: number) => Math.floor((t - 8 * H) / DAY);
  const arrived = new Set<string>();
  const ended = new Set<string>();
  const out = new Set<string>();
  const main = (p: ShiftPatient) => primaryOf(p.patient).id;
  const infectious = (p: ShiftPatient) => db.conditions[main(p)]?.department === 'dept.infectious';
  const end = (DAYS * 24 + 8) * H;
  let lastDay = s.day;
  while (s.t < end) {
    apply(db, s, { kind: 'advance', seconds: 300 });
    const all = [...Object.values(s.patients), ...(s.past ?? []).map(x => x.p)];
    for (const p of all) {
      const d = dayOf(p.arriveT);
      if (d < 0 || d >= DAYS) continue;
      if (!arrived.has(p.id) && p.status !== 'coming') {
        arrived.add(p.id);
        const r = rows[d];
        if (p.kind === 'ambulance') r.amb++;
        else r.walk++;
        if (has(p, FLU)) r.flu++;
        if (has(p, PNEUMONIA)) r.pneumonia++;
        if (main(p) === COND) r.wvArr++;
        if (infectious(p)) r.infArr++;
      }
      // выписан: срок в стационаре — у закрытого случая
      const st = p.closed?.stay;
      if (st && (st.end === 'discharged' || st.end === 'early') && !out.has(p.id)) {
        out.add(p.id);
        const r = rows[Math.min(DAYS - 1, Math.max(0, dayOf(s.t)))];
        if (main(p) === PNEUMONIA) {
          r.pnOut++;
          if (st.end === 'early') r.pnEarly++;
          else if (st.days <= st.norm) r.pnOnTime++;
        }
        if (main(p) === COND) {
          r.wvOut++;
          r.wvDays += st.days;
        }
      }
      const j = s.journeys?.of[p.id];
      const e = j?.end;
      if (!e || ended.has(p.id)) continue;
      ended.add(p.id);
      const r = rows[dayOf(e.t)] ?? rows[d];
      if (e.how === 'home') r.home++;
      else if (e.how === 'left' || e.how === 'unseen') r.left++;
      else if (e.how === 'away') {
        r.away++;
        if ((e.full?.length ?? 0) > 0 || e.wanted !== undefined) {
          r.full++;
          const place = e.full?.[0] ?? e.wanted;
          refused.set(main(p), (refused.get(main(p)) ?? 0) + 1);
          if (main(p) === COND) r.wvFull++;
          if (infectious(p)) r.infFull++;
          if (place === 'box') r.fullBox++;
          else if (place === 'icu' || place === 'ricu') r.fullIcu++;
          else r.fullWard++;
        }
      } else if (e.how === 'stay') {
        if (e.setting === 'box') r.box++;
        else if (e.setting === 'icu' || e.setting === 'ricu') r.icu++;
        else r.ward++;
      }
      const bed = e.how === 'stay' || (e.how === 'away' && ((e.full?.length ?? 0) > 0 || e.wanted !== undefined));
      if (bed && main(p) === COND) r.wvBed++;
      if (bed && infectious(p)) r.infBed++;
      if (has(p, PNEUMONIA)) {
        if (e.how === 'stay') r.pnStay++;
        else if (e.how === 'away') r.pnAway++;
        else if (e.how === 'home') r.pnHome++;
      }
    }
    if (s.day !== lastDay) {
      const d = s.day - 2;
      if (d >= 0 && d < DAYS) rows[d].lying = Object.values(s.patients).filter(p => p.status === 'admitted').length;
      lastDay = s.day;
    }
  }
  return rows;
}

const sum = (rows: Row[], k: keyof Row) => rows.reduce((a, r) => a + r[k], 0);

for (const name of HOSPITALS) {
  for (const share of WAVES) {
    const { db, id } = dbWith(share);
    for (const add of ADDS) {
      const all: Row[] = [];
      refused.clear();
      const extra = add.length ? add.map(r => `${r.type.slice(5)} ${r.size} (${r.x},${r.y})`).join(' + ') : 'ничего';
      console.log(`\n## ${name}, зима, волна ${COND} — ${share} % пришедших сами; пристроено: ${extra}; суток ${DAYS}, зёрна ${SEEDS.join(', ')}`);
      for (const seed of SEEDS) {
        const rows = run(db, name, seed, add, id);
        all.push(...rows);
        console.log(`  зерно ${seed}: ${rows.map((r, i) => `с${i + 1} ${r.walk}+${r.amb} (грипп ${r.flu}, пневм. ${r.pneumonia}) → дома ${r.home}, легли ${r.ward}/${r.box}/${r.icu}, отправлены ${r.away} (мест нет ${r.full}), ушли ${r.left}, лежат ${r.lying}`).join('; ')}`);
      }
      const n = all.length;
      const avg = (k: keyof Row) => (sum(all, k) / n).toFixed(1);
      console.log(
        `  в сутки в среднем: пришли ${avg('walk')} сами и ${avg('amb')} по скорой, с гриппом ${avg('flu')}, с пневмонией ${avg('pneumonia')}; ` +
          `дома ${avg('home')}, легли в палату ${avg('ward')}, в бокс ${avg('box')}, в ПИТ и реанимацию ${avg('icu')}; отправлены ${avg('away')}, из них мест нет ${avg('full')} ` +
          `(палаты ${avg('fullWard')}, ПИТ и реанимация ${avg('fullIcu')}, боксы ${avg('fullBox')}); ушли ${avg('left')}; лежат в 08:00 ${avg('lying')}`,
      );
      console.log(`  пневмония за ${n} суток: легли у нас ${sum(all, 'pnStay')}, отправлены ${sum(all, 'pnAway')}, дома ${sum(all, 'pnHome')}; выписаны ${sum(all, 'pnOut')}, из них в срок ${sum(all, 'pnOnTime')}, раньше срока ${sum(all, 'pnEarly')}`);
      const wvOut = sum(all, 'wvOut');
      console.log(
        `  ${db.conditions[COND]?.name.ru ?? COND} главной болезнью: пришли ${avg('wvArr')} в сутки, нужна койка ${avg('wvBed')}, из них мест нет ${avg('wvFull')}; ` +
          `выписаны ${wvOut} за ${n} суток, в среднем ${wvOut ? (sum(all, 'wvDays') / wvOut).toFixed(1) : '—'} суток в стационаре`,
      );
      console.log(`  инфекционное отделение главной болезнью: пришли ${avg('infArr')} в сутки, нужна койка ${avg('infBed')}, из них мест нет ${avg('infFull')}`);
      const zero = SEEDS.map((_, k) => all.slice(k * DAYS, (k + 1) * DAYS).filter(r => r.full === 0).length);
      console.log(`  суток без отправленных, потому что мест нет: ${zero.join(', ')} из ${DAYS} по зёрнам`);
      const top = [...refused.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
      console.log(`  мест нет — с чем (за ${n} суток): ${top.map(([c, k]) => `${db.conditions[c]?.name.ru ?? c} ${k}`).join(', ')}`);
    }
  }
}
