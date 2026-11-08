// Проба к спецификации испытаний (docs/specs/2026-11-challenges.md, «Замер»): шесть испытаний геймдизайна (§9: «Зимний
// грипп», «Рентген сломался», «Одна ночь», «В долг», «Только по показаниям», «Сто пациентов») на готовых больницах, когда
// никто не играет или ваши приёмы ведёт «виртуальный врач» (tools/sim/doctor-player.ts), — чтобы условия испытаний и пороги
// их итога опирались на числа «Больницы», а не на догадку. Больницы — как их открывает окно для «Управляющего» (`startFor`:
// в вашем кабинете — нанятый терапевт) или для «Врача» (ваш кабинет — ваш), со сменами (`withNightShift`); зима.
//   flu       — городская и поликлиника; поток — сами, по записи и скорая — ×1, ×1,5 и ×2 (`--x 100,150,200`: уровень
//               «Управления», у которого другой только поток), вес гриппа зимой — ×1 и ×4 (`--flu 1,4`: волна); первые сутки
//               с 08:00: пришли, из них с гриппом, ушли, не дождавшись, и почему, приняты и верных, касса за сутки;
//   xray      — городская и районная: сутки как обычно и с рентгеном, сломанным с утра (все аппараты кабинетов рентгена); у
//               кого в обычные сутки был снимок, — верных в обоих;
//   night     — больница сценариев 2–3 (`site.emergency`), принимаете только вы (`meta.solo`), сами не приходят, скорая —
//               `--amb 1,1.5,2` машин в час в среднем за сутки (ночью — по форме суток `ambulance`, меньше); ваши приёмы с
//               08:00 ведёт разумный «виртуальный врач»; ночь — привезённые с 20:00 до 08:00: приняты, ждали врача (медиана,
//               дольше всех, за 15 минут), ждут в 08:00;
//   debt      — городская, районная и поликлиника — 7 суток с кассой начала «Обычно» и с долгом (`--debt -500000`): касса
//               по утрам, прибыль за сутки и в какое утро касса снова не ниже нуля; кредит банка никто не берёт;
//   indicated — смена врача (08:00–20:00) в поликлинике с кассой — без неё показаний не считают (`ShiftPatient.indicated`):
//               разумный (назначает план разумного врача сразу и отпускает ждать), «по одному» (то же обследование за
//               обследованием: следующее — когда пришёл результат прошлого, ждёт у себя), «по показаниям» (из плана — те
//               платные, что показаны сейчас, сразу все; отпускает ждать; пришли результаты — следующие показанные) и
//               ленивый — обследований и из них без показаний на приём, итог смены;
//   hundred   — амбулатория сценария 1 (`site.ambulatory`), поликлиника и городская: сами — `--per 8.5` человек в час приёма
//               в среднем (около ста за 08:00–20:00), без записи и скорой; приняты, ушли, не дождавшись, ждут в 20:00.
//   engine    — испытания по записям `content/challenges/` (часть 1): больница начала (`challengeStart`), условие — движок;
//               испытания главврача — никто не играет (в вашем кабинете — нанятый терапевт, как у «Управляющего»),
//               испытания врача — «виртуальный врач» (`--play rational,careful,urgent`: «срочного — сразу» отпускает текущего
//               ждать и зовёт красного); итог (`challengeEnd`): оценка, число,
//               пройдено ли, красные в срок, обследования без показаний.
//
// bun tools/bench/challenges.ts [--only flu,xray,night,debt,indicated,hundred,engine] [--seeds 1,2,3]
import type { ContentDb, Id, Manage } from '../../src/content/types';
import { db as bundle } from '../../src/content';
import { slotKey } from '../../src/engine/hospital/requirements';
import { hospitalOf, type Site } from '../../src/engine/hospital/site';
import { siteOfPlan } from '../../src/engine/hospital/site-plan';
import { siteOfPreset } from '../../src/engine/hospital/site-preset';
import { presetStaff, type StaffMember, withNightShift } from '../../src/engine/hospital/staff';
import { apply, candidatesOf, current, hospitalCtx, newFlowShift, observationsOf } from '../../src/engine/shift/engine';
import { levelOf } from '../../src/engine/shift/manage';
import { startCash } from '../../src/engine/shift/money';
import type { Command, Flow, ShiftPatient, ShiftState } from '../../src/engine/shift/types';
import { Rng } from '../../src/engine/core/rng';
import { type DoctorResult, indicated, runDoctor } from '../../src/engine/med/policy';
import { startFor } from '../../src/app/roles';
import { challengeEnd, challengeEndAt, challengeStart } from '../../src/sim/challenge';
import { shiftResult } from '../../src/sim/shift';
import { type Player, playOwn } from '../sim/doctor-player';

const arg = (name: string, def: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
};
const ONLY = arg('only', 'flu,xray,night,debt,indicated,hundred').split(',');
const SEEDS = arg('seeds', '1,2,3').split(',').map(Number);
const XS = arg('x', '100,150,200').split(',').map(Number);
const FLUS = arg('flu', '1,4').split(',').map(Number);
const DEBT = Number(arg('debt', '-500000'));
const AMBS = arg('amb', '1,1.5,2').split(',').map(Number);
const PER = Number(arg('per', '8.5'));
const PLAYS = arg('play', 'rational,careful,urgent').split(',');
const WHY = process.argv.includes('--why');
const db: ContentDb = bundle;
const H = 3600;
const START = 8 * H;
const NIGHT = 20 * H;
const MORNING = 32 * H;

/** Больница, как её открывает окно: «Управляющий» — в вашем кабинете нанятый терапевт; «Врач» — кабинет ваш. */
function hospital(name: string, role: 'manager' | 'doctor'): { site: Site; staff: StaffMember[] } {
  const at = (): { site: Site; staff: StaffMember[] } => {
    if (name === 'poly' || name === 'emergency' || name === 'ambulatory') {
      const p = siteOfPlan(db, db.sites![`site.${name === 'poly' ? 'polyclinic' : name}`]);
      if (!p.ok) throw new Error(`${name}: ${p.error.kind}`);
      return { site: p.site, staff: p.staff };
    }
    const rec = db.presets[`preset.${name}`];
    return { site: siteOfPreset(db, rec), staff: presetStaff(db, rec) };
  };
  const h = at();
  const r = role === 'manager' ? startFor(db, h.site, h.staff, 'manager') : { site: h.site, staff: [...h.staff] };
  return { site: r.site, staff: withNightShift(db, r.site.rooms, r.staff) };
}

/** База, у которой уровень «Трудно» другой только потоком: `inflow` %. */
function surge(inflow: number): { db: ContentDb; manage?: Manage } {
  if (inflow === 100) return { db };
  const base = levelOf(db, 'normal');
  return { db: { ...db, manage: { ...db.manage!, hard: { ...base, overdraft: base.overdraft ?? 0, inflow } } }, manage: 'hard' };
}

/** Волна: вес гриппа зимой ×`k` (`season` записи) — гриппом болеют чаще, остальным столько же. */
function wave(x: ContentDb, k: number): ContentDb {
  if (k === 1) return x;
  const c = x.conditions['cond.influenza'];
  const season = { ...c.season!, winter: c.season!.winter * k };
  return { ...x, conditions: { ...x.conditions, 'cond.influenza': { ...c, season } } };
}

function shift(x: ContentDb, h: { site: Site; staff: StaffMember[] }, seed: number, o: { flow?: Flow; manage?: Manage; solo?: boolean; cash?: boolean | number } = {}): ShiftState {
  const s = newFlowShift(x, {
    seed, season: 'winter', hospital: hospitalOf(x, h.site), staff: h.staff, flow: o.flow ?? { perHour: 0, auto: true },
    ...(o.cash === false ? {} : { economy: { cash: typeof o.cash === 'number' ? o.cash : startCash(x, 'preset') } }), ...(o.manage ? { manage: o.manage } : {}),
    ...(o.solo ? { solo: true } : {}),
  });
  apply(x, s, { kind: 'site', cmd: { kind: 'done' } });
  return s;
}

/** Все больные, что были в состоянии: и ушедшие с картой (`past`). */
function collect(s: ShiftState, seen: Map<string, ShiftPatient>) {
  for (const p of Object.values(s.patients)) seen.set(p.id, p);
  for (const x of s.past ?? []) seen.set(x.p.id, x.p);
}

function runTo(x: ContentDb, s: ShiftState, end: number, seen: Map<string, ShiftPatient>, at?: (s: ShiftState) => void) {
  while (s.t < end) {
    const step = Math.min(300, end - s.t);
    apply(x, s, { kind: 'advance', seconds: step });
    collect(s, seen);
    at?.(s);
  }
}

const has = (p: ShiftPatient, id: Id) => p.patient.truth.conditions.some(c => c.id === id);
const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : 0);
const pct = (a: number, b: number) => (b > 0 ? Math.round((100 * a) / b) : 0);
const share = (ps: ShiftPatient[]) => pct(ps.reduce((n, p) => n + (p.closed!.verdict === 'correct' ? 1 : p.closed!.verdict === 'partly' ? 0.5 : 0), 0), ps.length);
const rub = (n: number) => Math.round(n).toLocaleString('ru-RU');
/** Закрыты в первые сутки (08:00–08:00). */
const closedDay1 = (seen: Map<string, ShiftPatient>) => [...seen.values()].filter(p => p.closed && p.closed.at >= START && p.closed.at < MORNING);

// ---------------------------------------------------------------- «Зимний грипп»
if (ONLY.includes('flu')) {
  for (const name of ['city', 'poly']) {
    for (const f of FLUS) for (const k of XS) {
      console.log(`\n## «Зимний грипп» — ${name}, поток ×${k / 100}, грипп ×${f}: первые сутки с 08:00, зёрна ${SEEDS.join(', ')}`);
      const sums = { arrived: 0, flu: 0, left: 0, closed: 0, correct: 0, cash: 0 };
      for (const seed of SEEDS) {
        const { db: y, manage } = surge(k);
        const x = wave(y, f);
        const s = shift(x, hospital(name, 'manager'), seed, manage ? { manage } : {});
        const cash0 = s.economy!.cash;
        const seen = new Map<string, ShiftPatient>();
        runTo(x, s, MORNING, seen);
        const d = s.history[0];
        const day1 = [...seen.values()].filter(p => p.id.startsWith('1-'));
        const flu = day1.filter(p => has(p, 'cond.influenza')).length;
        const closed = closedDay1(seen);
        const why = Object.entries(d.leftBy?.why ?? {}).map(([w, n]) => `${w} ${n}`).join(', ');
        const cash = d.economy!.cash - cash0;
        console.log(
          `  зерно ${seed}: пришли ${d.arrived} (${Object.entries(d.arrivedBy ?? {}).map(([w, n]) => `${w} ${n}`).join(', ')}), с гриппом ${flu} (${pct(flu, day1.length)} %); ` +
            `ушли ${d.left} (${pct(d.left, d.arrived)} %${why ? `: ${why}` : ''}); закрыты ${closed.length}, верных ${share(closed)} %; касса за сутки ${rub(cash)} ₽`,
        );
        sums.arrived += d.arrived;
        sums.flu += flu;
        sums.left += d.left;
        sums.closed += closed.length;
        sums.correct += share(closed);
        sums.cash += cash;
      }
      const n = SEEDS.length;
      console.log(`  в среднем: пришли ${(sums.arrived / n).toFixed(0)}, с гриппом ${(sums.flu / n).toFixed(0)}, ушли ${(sums.left / n).toFixed(1)} (${pct(sums.left, sums.arrived)} %), закрыты ${(sums.closed / n).toFixed(0)}, верных ${(sums.correct / n).toFixed(0)} %, касса ${rub(sums.cash / n)} ₽`);
    }
  }
}

// ---------------------------------------------------------------- «Рентген сломался»
/** Сломать с утра все аппараты обследований в кабинетах рентгена — до конца суток их нет, как у поломки FR-EQ-3. */
function breakXray(s: ShiftState): number {
  const keys: string[] = [];
  for (const r of hospitalCtx(db, s).plan.rooms) {
    if (r.type !== 'room.xray') continue;
    r.equipment.forEach((id, slot) => {
      const eq = id ? db.equipment[id] : undefined;
      if (eq && eq.exams.length > 0) keys.push(slotKey(r.id, slot));
    });
  }
  s.broken = [...new Set([...(s.broken ?? []), ...keys])];
  return keys.length;
}
const xrayed = (p: ShiftPatient) => p.done.some(e => db.exams[e]?.room === 'room.xray');

if (ONLY.includes('xray')) {
  for (const name of ['city', 'district']) {
    console.log(`\n## «Рентген сломался» — ${name}: первые сутки с 08:00 как обычно и без рентгена, зёрна ${SEEDS.join(', ')}`);
    for (const seed of SEEDS) {
      const runs = [false, true].map(broken => {
        const s = shift(db, hospital(name, 'manager'), seed);
        const n = broken ? breakXray(s) : 0;
        const seen = new Map<string, ShiftPatient>();
        runTo(db, s, MORNING, seen);
        return { s, seen, n, d: s.history[0] };
      });
      const [ok, no] = runs;
      const had = closedDay1(ok.seen).filter(xrayed);
      const same = had.map(p => no.seen.get(p.id)).filter((p): p is ShiftPatient => !!p?.closed);
      const sameOk = had.filter(p => same.some(q => q.id === p.id));
      const gone = had.length - same.length;
      console.log(
        `  зерно ${seed}: обычно — закрыты ${closedDay1(ok.seen).length}, верных ${share(closedDay1(ok.seen))} %, ушли ${ok.d.left}; без рентгена (${no.n} апп.) — закрыты ${closedDay1(no.seen).length}, ` +
          `верных ${share(closedDay1(no.seen))} %, ушли ${no.d.left}; снимок был у ${had.length}: верных обычно ${share(sameOk)} %, без рентгена ${share(same)} % (не закрыты ${gone}); ` +
          `касса за сутки ${rub(ok.d.economy!.cash - startCash(db, 'preset'))} и ${rub(no.d.economy!.cash - startCash(db, 'preset'))} ₽`,
      );
    }
  }
}

// ---------------------------------------------------------------- «Одна ночь»
if (ONLY.includes('night')) {
  for (const amb of AMBS) {
    console.log(`\n## «Одна ночь» — site.emergency, вы один, скорая ${amb} в час в среднем за сутки: ночь 20:00–08:00, зёрна ${SEEDS.join(', ')}`);
    for (const seed of SEEDS) {
      const s = shift(db, hospital('emergency', 'doctor'), seed, { solo: true, cash: false, flow: { perHour: 0, ambulancePerHour: amb } });
      // до 20:00 и ночь — ваши приёмы ведёт разумный врач; ушедшие за сутки — в `past`
      playOwn(db, s, 'rational', MORNING);
      const seen = new Map<string, ShiftPatient>();
      collect(s, seen);
      const night = [...seen.values()].filter(p => p.arriveT >= NIGHT && p.arriveT < MORNING);
      const waits = night.filter(p => p.calledT !== undefined).map(p => Math.round((p.calledT! - p.arriveT) / 60));
      const mine = night.filter(p => p.closed && !p.closed.by);
      const left = (s.gone ?? []).filter(g => g.arriveT >= NIGHT && g.arriveT < MORNING && g.end === 'left').length;
      const still = night.filter(p => p.calledT === undefined && !p.closed && s.patients[p.id]).length;
      const r = shiftResult(s);
      console.log(
        `  зерно ${seed}: ночью привезли ${night.length}; приняты ${mine.length}, верных ${mine.length ? share(mine) : 0} %; ждали врача — медиана ${median(waits)} мин, дольше всех ${Math.max(0, ...waits)}, ` +
          `за 15 минут ${waits.filter(w => w <= 15).length} из ${night.length}; ушли ${left}, ждут в 08:00 ${still}; итог суток ${r ? `${r.overall} (${r.seen} приёмов, точность ${r.correct} %, ${r.minutes} мин)` : '—'}`,
      );
    }
  }
}

// ---------------------------------------------------------------- «В долг»
if (ONLY.includes('debt')) {
  for (const name of ['city', 'district', 'poly']) {
    for (const cash of [startCash(db, 'preset'), DEBT]) {
      console.log(`\n## «В долг» — ${name}: 7 суток, касса начала ${rub(cash)} ₽, никто не играет`);
      for (const seed of SEEDS) {
        const s = shift(db, hospital(name, 'manager'), seed, { cash });
        runTo(db, s, (7 * 24 + 8) * H, new Map());
        const days = s.history.map(d => d.economy!.cash);
        const profit = days.map((c, i) => c - (i === 0 ? cash : days[i - 1]));
        const back = days.findIndex(c => c >= 0);
        console.log(
          `  зерно ${seed}: касса по утрам ${days.map(rub).join(' · ')}; прибыль за сутки — ${profit.map(rub).join(', ')}; в среднем со вторых ` +
            `${rub(profit.slice(1).reduce((a, b) => a + b, 0) / Math.max(1, profit.length - 1))} ₽${cash < 0 ? `; не ниже нуля — ${back >= 0 ? `утром ${back + 2}-х суток` : 'ни разу'}` : ''}`,
        );
      }
    }
  }
}

// ---------------------------------------------------------------- «Только по показаниям»
/**
 * «По одному»: обследования разумного врача — по одному, следующее — когда пришёл результат прошлого (ждёт у себя): так
 * каждое назначают по тому, что уже известно, — как проверяет страховая (`indicated`). Остальное — как `playOwn`.
 */
function playStepwise(x: ContentDb, s: ShiftState, end: number, careful = false, urgent = false) {
  const exams = Object.keys(x.exams).sort();
  const plans = new Map<string, DoctorResult>();
  const tried = new Map<string, Set<Id>>();
  // текущего отпустить подождать нельзя — его приём доводят до конца, а красный ждёт
  const stuck = new Set<string>();
  const step = (cmd: Command) => apply(x, s, cmd);
  const busy = (p: ShiftPatient) => p.pending.length > 0 || (p.out !== undefined && p.out.back > s.t);
  for (let guard = 0; guard < 100_000 && s.t < end; guard++) {
    if (s.meet !== undefined) {
      step({ kind: 'advance', seconds: 30 });
      continue;
    }
    const p = current(s);
    const callable = (y: string) => s.patients[y]?.status === 'waiting' && !s.patients[y].by && (s.patients[y].kind !== 'ambulance' || s.patients[y].sorted);
    // «красного — сразу»: ждёт красный — текущего отпускает подождать (ради того, кто срочнее, можно всегда) и зовёт красного
    const red = urgent ? s.queue.find(y => callable(y) && s.patients[y].triage === 'red') : undefined;
    if (p && red && p.triage !== 'red' && !stuck.has(p.id)) {
      step({ kind: 'sendAway' });
      if (current(s)?.id === p.id) stuck.add(p.id);
      continue;
    }
    if (!p) {
      const id = red ?? s.queue.find(callable);
      step(id ? { kind: 'call', id } : { kind: 'advance', seconds: 60 });
      continue;
    }
    if (busy(p)) {
      // «по показаниям» отпускает ждать, если есть кого звать, — как разумный
      if (careful && s.queue.length > 0) {
        step({ kind: 'sendAway' });
        continue;
      }
      step({ kind: 'waitResults' });
      // «красного — сразу»: ждёт у себя результаты — но привезли красного, и он к нему
      while (busy(p) && s.t < end && !(urgent && !stuck.has(p.id) && p.triage !== 'red' && s.queue.some(y => callable(y) && s.patients[y].triage === 'red'))) step({ kind: 'advance', seconds: 60 });
      continue;
    }
    let plan = plans.get(p.id);
    if (!plan) {
      plan = runDoctor(x, p.patient, 'rational', Rng.seeded(s.meta.seed).fork(`sim:${p.id}`), { candidates: candidatesOf(x, p.departments ?? s.meta.department), exams });
      plans.set(p.id, plan);
    }
    const done = tried.get(p.id) ?? new Set<Id>();
    tried.set(p.id, done);
    const left = plan.exams.filter(e => !p.done.includes(e) && !done.has(e));
    if (careful) {
      // бесплатное (расспрос, осмотр) — как в плане; платное — только показанное сейчас, сразу всё
      const cands = candidatesOf(x, p.departments ?? s.meta.department);
      const minutes = Math.round((s.t - p.arriveT) / 60);
      const now = left.filter(e => (x.exams[e]?.cost ?? 0) === 0 || indicated(x, p.patient, observationsOf(p), cands, e, minutes));
      if (now.length > 0) {
        for (const e of now) {
          // «красного — сразу»: между вопросами и обследованиями — не привезли ли красного
          if (urgent && !stuck.has(p.id) && p.triage !== 'red' && s.queue.some(y => callable(y) && s.patients[y].triage === 'red')) break;
          done.add(e);
          step({ kind: 'exam', exam: e });
        }
        continue;
      }
    } else if (left.length > 0) {
      done.add(left[0]);
      step({ kind: 'exam', exam: left[0] });
      continue;
    }
    step({ kind: 'diagnose', id: plan.diagnosis });
    for (const tx of plan.plan.treatments) step({ kind: 'toggleTreatment', id: tx });
    step({ kind: 'setting', setting: plan.plan.setting });
    step({ kind: 'finish' });
  }
}

if (ONLY.includes('indicated')) {
  for (const player of ['rational', 'careful', 'stepwise', 'lazy'] as (Player | 'stepwise' | 'careful')[]) {
    console.log(`\n## «Только по показаниям» — poly, смена врача 08:00–20:00, играет ${player}, зёрна ${SEEDS.join(', ')}`);
    for (const seed of SEEDS) {
      const s = shift(db, hospital('poly', 'doctor'), seed, { solo: true });
      if (player === 'stepwise' || player === 'careful') playStepwise(db, s, NIGHT, player === 'careful');
      else playOwn(db, s, player, NIGHT);
      const seen = new Map<string, ShiftPatient>();
      collect(s, seen);
      const mine = [...seen.values()].filter(p => p.closed && !p.closed.by);
      const paid = (p: ShiftPatient) => p.done.filter(e => (db.exams[e]?.cost ?? 0) > 0);
      const extra = (p: ShiftPatient) => paid(p).filter(e => !(p.indicated ?? []).includes(e));
      const exams = mine.reduce((n, p) => n + paid(p).length, 0);
      const un = mine.reduce((n, p) => n + extra(p).length, 0);
      const r = shiftResult(s);
      const top = new Map<Id, number>();
      for (const p of mine) for (const e of extra(p)) top.set(e, (top.get(e) ?? 0) + 1);
      const left = (s.gone ?? []).filter(g => g.end === 'left').length;
      console.log(
        `  зерно ${seed}: приёмов ${mine.length}, ушли ${left}, платных обследований ${exams} (${(exams / Math.max(1, mine.length)).toFixed(1)} на приём), без показаний ${un} — у ${mine.filter(p => extra(p).length > 0).length} приёмов; ` +
          `итог ${r ? `${r.overall} (бережливость ${r.grades.thrift}, точность ${r.correct} %, скорость ${r.grades.speed} ${r.minutes} мин)` : '—'}; чаще без показаний: ${[...top].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([e, n]) => `${e.slice(5)} ${n}`).join(', ')}`,
      );
    }
  }
}

// ---------------------------------------------------------------- «Сто пациентов»
if (ONLY.includes('hundred')) {
  for (const name of ['ambulatory', 'poly', 'city']) {
    console.log(`\n## «Сто пациентов» — ${name}: сами ${PER} в час приёма в среднем, без записи и скорой; первые сутки, зёрна ${SEEDS.join(', ')}`);
    for (const seed of SEEDS) {
      const s = shift(db, hospital(name, 'manager'), seed, { flow: { perHour: PER } });
      const seen = new Map<string, ShiftPatient>();
      let at20 = -1;
      runTo(db, s, MORNING, seen, x => {
        if (at20 < 0 && x.t >= NIGHT) at20 = Object.values(x.patients).filter(p => p.status === 'waiting' && p.calledT === undefined).length;
      });
      const d = s.history[0];
      const offices = s.hospital!.site!.rooms.filter(r => r.type === 'room.office').length;
      console.log(`  зерно ${seed}: кабинетов ${offices}; пришли ${d.arrived}, закрыты за сутки ${closedDay1(seen).length}, верных ${share(closedDay1(seen))} %, ушли ${d.left} (${pct(d.left, d.arrived)} %), ждут врача в 20:00 ${at20}`);
    }
  }
}

// ---------------------------------------------------------------- испытания по записям — движок (часть 1)
if (ONLY.includes('engine')) {
  for (const c of Object.values(db.challenges ?? {})) {
    for (const play of c.kind === 'doctor' ? PLAYS : ['никто']) {
      console.log(`\n## ${c.id} — ${c.name.ru}: ${c.start}, с ${c.from} до ${c.to} ч, ${c.kind === 'doctor' ? `играет ${play}` : 'никто не играет'}; зёрна ${SEEDS.join(', ')}`);
      for (const seed of SEEDS) {
        const h = challengeStart(db, c, c.kind === 'chief' ? (site, staff) => startFor(db, site, staff, 'manager') : undefined);
        const s = newFlowShift(db, { seed, season: c.season, hospital: hospitalOf(db, h.site), staff: h.staff, flow: { perHour: 0 }, challenge: c.id });
        apply(db, s, { kind: 'site', cmd: { kind: 'done' } });
        const end = challengeEndAt(c);
        const t0 = performance.now();
        if (c.kind === 'doctor') {
          // сортирует игрок — здесь медсестра по шкале: так же, как отсортировал бы «виртуальный врач», и сразу
          delete s.meta.sorts;
          // ночь: до 20:00 никого — часы идут без врача
          while (s.t < c.from * H) apply(db, s, { kind: 'advance', seconds: Math.min(600, c.from * H - s.t) });
          if (play === 'careful' || play === 'urgent') playStepwise(db, s, end, true, play === 'urgent');
          else playOwn(db, s, play as Player, end);
          if (s.t < end) apply(db, s, { kind: 'advance', seconds: end - s.t });
        } else runTo(db, s, end, new Map());
        const r = challengeEnd(db, s)!;
        // `--why`: красные по шкале — когда привезли, через сколько минут позвал врач и сколько красных ждали тогда
        const reds = WHY && c.reds !== undefined ? [...Object.values(s.patients), ...(s.past ?? []).map(x => x.p)].filter(p => p.kind === 'ambulance' && p.scale?.triage === 'red').sort((a, b) => a.arriveT - b.arriveT) : [];
        const at = (t: number) => `${String(Math.floor(t / H) % 24).padStart(2, '0')}:${String(Math.floor((t % H) / 60)).padStart(2, '0')}`;
        // с кем был врач, когда у красного вышел срок: его приём шёл в ту минуту — красный ли он и был ли у него свой срок
        const mine = [...Object.values(s.patients), ...(s.past ?? []).map(x => x.p)].filter(p => p.calledT !== undefined && !p.closed?.by);
        const withAt = (t: number) => mine.find(q => q.calledT! <= t && (q.closed?.at ?? Infinity) >= t);
        const late = (p: ShiftPatient) => (p.calledT ?? Infinity) - p.arriveT > (c.reds ?? 0) * 60;
        const busyNote = (p: ShiftPatient) => {
          const q = late(p) ? withAt(p.arriveT + (c.reds ?? 0) * 60) : undefined;
          return q && q !== p ? ` [врач у ${q.id}: ${q.triage}${(q.closed?.targets ?? []).length > 0 ? ', свой срок' : ''}]` : '';
        };
        if (reds.length > 0) console.log(`    красные: ${reds.map(p => `${at(p.arriveT)} → ${p.calledT === undefined ? 'не позван' : `${Math.round((p.calledT - p.arriveT) / 60)} мин`}${busyNote(p)}`).join('; ')}`);
        console.log(
          `  зерно ${seed}: итог ${r.grade}, число ${typeof r.value === 'number' ? (c.grade.by === 'cash' ? `${rub(r.value)} ₽` : r.value) : r.value}; ${r.passed ? 'пройдено' : 'не пройдено'}; пришли ${r.arrived}, приняты ${r.seen}` +
            `${r.reds ? `; красных в срок ${r.reds.inTime} из ${r.reds.total}` : ''}${r.unindicated !== undefined ? `; без показаний ${r.unindicated}` : ''}` +
            `${r.shift ? `; смена ${r.shift.overall} (точность ${r.shift.correct} %, ${r.shift.minutes} мин, приёмов ${r.shift.seen})` : ''} — ${((performance.now() - t0) / 1000).toFixed(1)} с`,
        );
      }
    }
  }
}
