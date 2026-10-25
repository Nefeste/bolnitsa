// Направление к специалисту (spec docs/specs/2026-10-specialists.md, «Решения владельца», 3; #62): проба на тех же больных
// — лучше ли так, чем решает терапевт. Не лучше — не делаем.
//
// Городская больница (терапевт и три специалиста) и поликлиника, где два терапевта заменены гастроэнтерологом и
// эндокринологом (как `polyspec` в tools/sim/economy.ts); поток от больницы, день с 08:00 до 20:00. Когда нанятый терапевт
// просит посмотреть (не уверен или долгий случай), а его ведущая гипотеза — из профиля специалиста, который сейчас
// принимает, у этого больного три исхода из одного и того же мгновения — копии состояния:
//   сам        — «пусть решает сам»: терапевт решает тем, что знает (так сейчас кончается просьба без ответа);
//   направить  — к специалисту, как нынешний ответ «Направить к …»: тот рассудит заново своим навыком;
//   с профилем — то же, и специалист ведёт его, как записанного к себе: болезни профиля вероятнее (PROFILE_PRIOR).
// Исход — чем закрыт случай: верно, частично, неверно; через сколько минут; ушёл ли, не дождавшись. Основная линия дня идёт
// с «сам». Второй замер — целый день с каждым правилом: те же исходы у всех нанятых врачей и сколько записанных к
// специалистам ушли, не дождавшись, и сколько они ждали.
//
// `--every` — не только просьбы: любое решение терапевта с гипотезой из профиля (он «просит» о каждом, как проба в
// tools/bench/consults.ts, и ему сразу отвечают) — так направляли бы вы сами, по подозрению на болезнь профиля.
//
// `--second` — направлять, когда из профиля не ведущая гипотеза, а вторая (самая вероятная болезнь второй группы): только
// здесь поправка профиля может поменять, чем кончится случай.
//
// bun tools/bench/referrals.ts [--seeds 1,2,3,4] [--only city,poly] [--every] [--second]
import type { ContentDb, Id } from '../../src/content/types';
import { hospitalOf } from '../../src/engine/hospital/site';
import { siteOfPlan } from '../../src/engine/hospital/site-plan';
import { siteOfPreset } from '../../src/engine/hospital/site-preset';
import { presetStaff, salaryOf, withNightShift } from '../../src/engine/hospital/staff';
import { startCash } from '../../src/engine/shift/money';
import { apply, colleaguesOf, newFlowShift } from '../../src/engine/shift/engine';
import { DAY, type ClosedCase, type ShiftState } from '../../src/engine/shift/types';
import { buildDb } from '../content/load';

const arg = (name: string, def: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
};
const SEEDS = arg('seeds', '1,2,3,4').split(',').map(Number);
const ONLY = arg('only', 'city,poly').split(',');
const EVERY = process.argv.includes('--every');
const SECOND = process.argv.includes('--second');

const built = buildDb();
if (built.errors.length) {
  console.error(built.errors.join('\n'));
  process.exit(1);
}
const db: ContentDb = EVERY ? { ...built.db, consults: { ...built.db.consults!, unsure: [101, 101, 101, 101, 101] } } : built.db;

type Mode = 'self' | 'refer' | 'prior';
const MODES: Mode[] = ['self', 'refer', 'prior'];
const NAME: Record<Mode, string> = { self: 'сам', refer: 'направить', prior: 'с профилем' };
/** Сколько ждать исхода после ответа: до конца дня приёма. */
const END = 20 * 3600;

function start(name: string, seed: number): ShiftState {
  const flow = { perHour: 0, auto: true as const };
  if (name === 'city') {
    const rec = db.presets['preset.city'];
    const st = siteOfPreset(db, rec);
    return newFlowShift(db, { seed, season: 'winter', hospital: hospitalOf(db, st), staff: withNightShift(db, st.rooms, presetStaff(db, rec)), flow, economy: { cash: startCash(db, 'preset') } });
  }
  const p = siteOfPlan(db, db.sites!['site.polyclinic']);
  if (!p.ok) throw new Error(`поликлиника: помещение ${p.room} — ${p.error.kind}`);
  // два терапевта — специалистами: в третьем и четвёртом кабинетах (r5, r6), как `polyspec` в tools/sim/economy.ts
  const swap: Record<string, Id> = { r5: 'role.gastroenterologist', r6: 'role.endocrinologist' };
  const staff = p.staff.map(m => (m.room && swap[m.room] ? { ...m, role: swap[m.room], salary: salaryOf(db, swap[m.room], 3) } : m));
  return newFlowShift(db, { seed, season: 'winter', hospital: hospitalOf(db, p.site), staff: withNightShift(db, p.site.rooms, staff), flow, economy: { cash: startCash(db, 'poly') } });
}

/** Специалист, который сейчас принимает и в чьём профиле болезнь `dx`. */
function specialistFor(s: ShiftState, dx: Id) {
  return colleaguesOf(db, s).find(m => db.roles[m.role]?.profile?.includes(dx));
}

interface End {
  verdict?: ClosedCase['verdict'];
  /** закрыт, ушёл не дождавшись, не успели принять, ещё не решён к 20:00 */
  end: 'done' | 'left' | 'unseen' | 'open';
  minutes: number;
  /** кто закрыл: должность */
  role?: Id;
}

/** Чем кончилось у больного `id`: закрыт в состоянии, ушёл (строка журнала) или ещё нет. */
function endOf(s: ShiftState, id: string, from: number): End | undefined {
  const minutes = Math.round((s.t - from) / 60);
  const role = (by?: string) => s.staff?.find(m => m.id === by)?.role;
  const p = s.patients[id];
  if (p?.closed) return { verdict: p.closed.verdict, end: 'done', minutes, role: role(p.closed.by) };
  const g = s.gone?.find(r => r.id === id);
  if (g) return { verdict: g.verdict, end: g.end, minutes, role: role(g.by) };
  return undefined;
}

/** Ответить на просьбу о больном `id` по правилу `mode` и прожить копию до исхода. */
function branch(s0: ShiftState, id: string, mode: Mode, to: string): End {
  const s = structuredClone(s0);
  apply(db, s, mode === 'self' ? { kind: 'consult', id, answer: 'self' } : { kind: 'consult', id, answer: 'refer', to });
  // с профилем: специалист ведёт направленного, как записанного к себе (поправка профиля — у `p.to`)
  if (mode === 'prior' && s.patients[id]) s.patients[id].to = to;
  const from = s0.t;
  const end = (s0.day - 1) * DAY + END;
  while (s.t < end) {
    const e = endOf(s, id, from);
    if (e) return e;
    apply(db, s, { kind: 'advance', seconds: 60 });
  }
  return endOf(s, id, from) ?? { end: 'open', minutes: Math.round((s.t - from) / 60) };
}

interface Case {
  where: string;
  seed: number;
  /** ведущая гипотеза терапевта и правда */
  lead: Id;
  truth: Id;
  /** его уверенность в группе ведущей гипотезы */
  p: number;
  /** ведущая гипотеза — правда */
  leadRight: boolean;
  /** правда — из профиля специалиста */
  inProfile: boolean;
  out: Record<Mode, End>;
}

interface DayRun {
  /** исходы всех приёмов нанятых врачей: верно / частично / неверно */
  correct: number;
  partly: number;
  wrong: number;
  /** исходы направленных (по правилу дня) */
  referred: { n: number; wrong: number; partly: number };
  /** записанные к специалистам: пришли, ушли не дождавшись или не приняты, сколько в среднем ждали вызова, минут */
  booked: number;
  bookedLost: number;
  bookedWait: number;
  /** все, кто ушёл, не дождавшись, и кого не успели принять */
  lost: number;
}

/** День: на каждую просьбу терапевта с гипотезой из профиля работающего специалиста — ответ по правилу; на остальные — «сам». */
function day(where: string, seed: number, mode: Mode, cases?: Case[]): DayRun {
  const s = start(where, seed);
  const referred = new Set<string>();
  const end = END;
  while (s.t < end) {
    for (const n of apply(db, s, { kind: 'advance', seconds: 60 })) {
      if (n.kind !== 'consult') continue;
      const c = s.consults?.find(x => x.id === n.id);
      const by = s.staff?.find(m => m.id === n.by);
      if (!c || !by || db.roles[by.role]?.profile) continue;
      // кого направлять: ведущая гипотеза из профиля работающего специалиста; `--second` — ведущая ни в чьём профиле, а вторая — да
      const hyp = SECOND ? (specialistFor(s, c.lead[0].id) ? undefined : c.lead[1]) : c.lead[0];
      const spec = hyp && specialistFor(s, hyp.id);
      if (!spec) continue;
      const truth = s.patients[n.id].patient.truth.conditions[0].id;
      if (cases) {
        const out = {} as Record<Mode, End>;
        for (const m of MODES) out[m] = branch(s, n.id, m, spec.id);
        cases.push({
          where, seed, lead: c.lead[0].id, truth, p: c.lead[0].p, leadRight: c.lead[0].id === truth, inProfile: db.roles[spec.role].profile!.includes(truth), out,
        });
      }
      // те же больные при каждом правиле: при «сам» — те, кого направили бы
      referred.add(n.id);
      apply(db, s, mode === 'self' ? { kind: 'consult', id: n.id, answer: 'self' } : { kind: 'consult', id: n.id, answer: 'refer', to: spec.id });
      if (mode === 'prior' && s.patients[n.id]) s.patients[n.id].to = spec.id;
    }
    // остальные просьбы — сразу «сам», как и в основной линии
    for (const c of [...(s.consults ?? [])]) apply(db, s, { kind: 'consult', id: c.id, answer: 'self' });
  }
  const out: DayRun = { correct: 0, partly: 0, wrong: 0, referred: { n: 0, wrong: 0, partly: 0 }, booked: 0, bookedLost: 0, bookedWait: 0, lost: 0 };
  const verdicts = [
    ...(s.gone ?? []).filter(r => r.by !== undefined && r.verdict).map(r => ({ id: r.id, v: r.verdict! })),
    ...Object.values(s.patients).filter(p => p.closed?.by).map(p => ({ id: p.id, v: p.closed!.verdict })),
  ];
  for (const { id, v } of verdicts) {
    out[v === 'correct' ? 'correct' : v === 'partly' ? 'partly' : 'wrong']++;
    if (referred.has(id)) {
      out.referred.n++;
      if (v === 'wrong') out.referred.wrong++;
      if (v === 'partly') out.referred.partly++;
    }
  }
  let waited = 0;
  for (const r of s.gone ?? []) {
    if (r.end !== 'done') out.lost++;
    if (r.kind !== 'appointment') continue;
    out.booked++;
    if (r.end !== 'done') out.bookedLost++;
    else if (r.calledT !== undefined) {
      waited++;
      out.bookedWait += (r.calledT - r.arriveT) / 60;
    }
  }
  out.bookedWait = waited ? out.bookedWait / waited : 0;
  return out;
}

const pct = (a: number, b: number) => (b > 0 ? `${((100 * a) / b).toFixed(0)} %` : '—');
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

console.log(`База ${db.contentVersion}; зёрна ${SEEDS.join(', ')}; день 08:00–20:00, поток от больницы; ${EVERY ? 'любое решение терапевта' : 'просьбы терапевта по правилу базы'}, из профиля — ${SECOND ? 'вторая гипотеза' : 'ведущая гипотеза'}\n`);

// ---------------------------------------------------------------- одни и те же больные: три исхода из одной точки
const cases: Case[] = [];
for (const where of ONLY) {
  for (const seed of SEEDS) {
    const t0 = performance.now();
    day(where, seed, 'self', cases);
    console.error(`  ${where} ${seed}: просьб с гипотезой из профиля — ${cases.filter(c => c.where === where && c.seed === seed).length}, ${Math.round((performance.now() - t0) / 1000)} с`);
  }
}
console.log('Одни и те же больные — просьба терапевта, ведущая гипотеза из профиля работающего специалиста:\n');
console.log('| больница | больных | правда в профиле | гипотеза терапевта верна | исход | верно | частично | неверно | не решён к 20:00 | минут до решения |');
console.log('|---|---:|---:|---:|---|---:|---:|---:|---:|---:|');
for (const where of ONLY) {
  const xs = cases.filter(c => c.where === where);
  for (const m of MODES) {
    const done = xs.filter(c => c.out[m].end === 'done');
    console.log(
      `| ${where === 'city' ? 'городская' : 'поликлиника'} | ${xs.length} | ${pct(xs.filter(c => c.inProfile).length, xs.length)} | ${pct(xs.filter(c => c.leadRight).length, xs.length)} | ${NAME[m]} | ` +
        `${pct(xs.filter(c => c.out[m].verdict === 'correct').length, xs.length)} | ${pct(xs.filter(c => c.out[m].verdict === 'partly').length, xs.length)} | ${pct(xs.filter(c => c.out[m].verdict === 'wrong').length, xs.length)} | ` +
        `${pct(xs.filter(c => c.out[m].end !== 'done').length, xs.length)} | ${mean(done.map(c => c.out[m].minutes)).toFixed(0)} |`,
    );
  }
}
// где правда не из профиля: не навредит ли поправка
const out = cases.filter(c => !c.inProfile);
const inn = cases.filter(c => c.inProfile);
console.log('\nПо правде больного — неверно при каждом исходе:\n');
console.log('| правда | больных | сам | направить | с профилем |');
console.log('|---|---:|---:|---:|---:|');
for (const [name, xs] of [['из профиля специалиста', inn], ['не из профиля', out]] as const) {
  console.log(`| ${name} | ${xs.length} | ${MODES.map(m => pct(xs.filter(c => c.out[m].verdict === 'wrong').length, xs.length)).join(' | ')} |`);
}

// ---------------------------------------------------------------- целый день с каждым правилом
console.log('\nЦелый день с каждым правилом (сумма по зёрнам):\n');
console.log('| больница | правило | приёмов нанятых | неверно | частично | направлено: неверно | записанных к специалистам: ушли или не приняты | ждали вызова, мин | всего ушли или не приняты |');
console.log('|---|---|---:|---:|---:|---:|---:|---:|---:|');
for (const where of ONLY) {
  for (const m of MODES) {
    const runs = SEEDS.map(seed => day(where, seed, m));
    const sum = (f: (r: DayRun) => number) => runs.reduce((a, r) => a + f(r), 0);
    const n = sum(r => r.correct + r.partly + r.wrong);
    console.log(
      `| ${where === 'city' ? 'городская' : 'поликлиника'} | ${NAME[m]} | ${n} | ${pct(sum(r => r.wrong), n)} | ${pct(sum(r => r.partly), n)} | ` +
        `${sum(r => r.referred.wrong)} из ${sum(r => r.referred.n)} | ${sum(r => r.bookedLost)} из ${sum(r => r.booked)} | ${mean(runs.map(r => r.bookedWait)).toFixed(0)} | ${sum(r => r.lost)} |`,
    );
  }
}
