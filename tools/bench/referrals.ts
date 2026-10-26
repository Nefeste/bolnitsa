// Направление к специалисту (spec docs/specs/2026-10-specialists.md, часть 2; решения владельца #62 и #112): проба на тех
// же больных и подбор поправки профиля для направленных.
//
// Городская больница (терапевт и три специалиста) и поликлиника, где два терапевта заменены гастроэнтерологом и
// эндокринологом (как `polyspec` в tools/sim/economy.ts); поток от больницы, день с 08:00 до 20:00.
//
// Одни и те же больные. Основная линия дня — без направления (`consults.refer` нет): нанятый терапевт просит посмотреть, и
// если его ведущая гипотеза ни в чьём профиле, а вторая (самая вероятная болезнь второй группы) — в профиле специалиста,
// который сейчас принимает, — у этого больного исходы из одного и того же мгновения, копии состояния:
//   сам  — «пусть решает сам»: терапевт решает тем, что знает (так сейчас кончается просьба без ответа);
//   ×N   — направлен к специалисту, тот ведёт его с поправкой профиля: болезни профиля вероятнее в N раз (×1 — без неё).
// Исход — чем закрыт случай: верно, частично, неверно; через сколько минут; ушёл ли, не дождавшись.
//
// Целый день с правилом движка: без направления и с каждой поправкой — исходы всех приёмов нанятых врачей, направленных, и
// сколько записанных к специалистам ушли, не дождавшись, и сколько они ждали. На просьбы основная линия отвечает сразу
// «пусть решает сам».
//
// `--every` — не только просьбы: любое решение терапевта (он «просит» о каждом, как проба в tools/bench/consults.ts) — так
// направляли бы вы сами, по подозрению. `--lead` — правило из вопроса #62: из профиля ведущая гипотеза.
//
// bun tools/bench/referrals.ts [--seeds 1,2,3,4] [--only city,poly] [--x 1,2,3,5,10] [--every] [--lead]
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
const XS = arg('x', '1,2,3,5,10').split(',').map(Number);
const EVERY = process.argv.includes('--every');
const LEAD = process.argv.includes('--lead');

const built = buildDb();
if (built.errors.length) {
  console.error(built.errors.join('\n'));
  process.exit(1);
}
const base: ContentDb = EVERY ? { ...built.db, consults: { ...built.db.consults!, unsure: [101, 101, 101, 101, 101] } } : built.db;
/** База с поправкой `x` для направленных; нет — без направления. */
const dbOf = (x?: number): ContentDb => {
  const { refer: _, ...rest } = base.consults!;
  return { ...base, consults: x === undefined ? rest : { ...rest, refer: x } };
};
const OFF = dbOf();

/** Исход: «сам» или ×N. */
type Mode = 'self' | number;
const MODES: Mode[] = ['self', ...XS];
const NAME = (m: Mode) => (m === 'self' ? 'сам' : `×${m}`);
/** Сколько ждать исхода после ответа: до конца дня приёма. */
const END = 20 * 3600;

function start(db: ContentDb, name: string, seed: number): ShiftState {
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
  return colleaguesOf(base, s).find(m => base.roles[m.role]?.profile?.includes(dx));
}

interface End {
  verdict?: ClosedCase['verdict'];
  /** закрыт, ушёл не дождавшись, не успели принять, ещё не решён к 20:00 */
  end: 'done' | 'left' | 'unseen' | 'open';
  minutes: number;
}

/** Чем кончилось у больного `id`: закрыт в состоянии, ушёл (строка журнала) или ещё нет. */
function endOf(s: ShiftState, id: string, from: number): End | undefined {
  const minutes = Math.round((s.t - from) / 60);
  const p = s.patients[id];
  if (p?.closed) return { verdict: p.closed.verdict, end: 'done', minutes };
  const g = s.gone?.find(r => r.id === id);
  if (g) return { verdict: g.verdict, end: g.end, minutes };
  return undefined;
}

/** Ответить на просьбу о больном `id` по исходу `mode` и прожить копию до исхода. */
function branch(s0: ShiftState, id: string, mode: Mode, to: string): End {
  const s = structuredClone(s0);
  const db = mode === 'self' ? OFF : dbOf(mode);
  apply(db, s, mode === 'self' ? { kind: 'consult', id, answer: 'self' } : { kind: 'consult', id, answer: 'refer', to });
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
  /** правда — из профиля специалиста */
  inProfile: boolean;
  out: Map<Mode, End>;
}

/** Основная линия без направления: на каждую просьбу терапевта по правилу — исходы из этой точки; ответ — «сам». */
function cases(where: string, seed: number, into: Case[]) {
  const s = start(OFF, where, seed);
  while (s.t < END) {
    for (const n of apply(OFF, s, { kind: 'advance', seconds: 60 })) {
      if (n.kind !== 'consult') continue;
      const c = s.consults?.find(x => x.id === n.id);
      const by = s.staff?.find(m => m.id === n.by);
      if (!c || !by || base.roles[by.role]?.profile || s.patients[n.id].bay) continue;
      // правило движка: ведущая ни в чьём профиле, вторая — да; `--lead` — из профиля ведущая
      const hyp = LEAD ? c.lead[0] : specialistFor(s, c.lead[0].id) ? undefined : c.lead[1];
      const spec = hyp && specialistFor(s, hyp.id);
      if (!spec) continue;
      const truth = s.patients[n.id].patient.truth.conditions[0].id;
      const out = new Map<Mode, End>();
      for (const m of MODES) out.set(m, branch(s, n.id, m, spec.id));
      into.push({ where, seed, inProfile: base.roles[spec.role].profile!.includes(truth), out });
    }
    for (const c of [...(s.consults ?? [])]) apply(OFF, s, { kind: 'consult', id: c.id, answer: 'self' });
  }
}

interface DayRun {
  /** исходы всех приёмов нанятых врачей: верно / частично / неверно */
  correct: number;
  partly: number;
  wrong: number;
  /** направленные терапевтом по правилу: сколько, их исходы */
  sent: { n: number; wrong: number; partly: number; open: number };
  /** записанные к специалистам: пришли, ушли не дождавшись или не приняты, сколько в среднем ждали вызова, минут */
  booked: number;
  bookedLost: number;
  bookedWait: number;
  /** все, кто ушёл, не дождавшись, и кого не успели принять */
  lost: number;
}

/** Целый день с правилом движка: поправка `x` для направленных; нет — без направления. Просьбы — сразу «сам». */
function day(where: string, seed: number, x?: number): DayRun {
  const db = dbOf(x);
  const s = start(db, where, seed);
  const sent = new Set<string>();
  while (s.t < END) {
    apply(db, s, { kind: 'advance', seconds: 60 });
    for (const c of [...(s.consults ?? [])]) apply(db, s, { kind: 'consult', id: c.id, answer: 'self' });
    for (const p of Object.values(s.patients)) if (p.ref !== undefined) sent.add(p.id);
  }
  const out: DayRun = { correct: 0, partly: 0, wrong: 0, sent: { n: sent.size, wrong: 0, partly: 0, open: 0 }, booked: 0, bookedLost: 0, bookedWait: 0, lost: 0 };
  const verdicts = [
    ...(s.gone ?? []).filter(r => r.by !== undefined && r.verdict).map(r => ({ id: r.id, v: r.verdict! })),
    ...Object.values(s.patients).filter(p => p.closed?.by).map(p => ({ id: p.id, v: p.closed!.verdict })),
  ];
  const closed = new Set<string>();
  for (const { id, v } of verdicts) {
    out[v === 'correct' ? 'correct' : v === 'partly' ? 'partly' : 'wrong']++;
    if (!sent.has(id)) continue;
    closed.add(id);
    if (v === 'wrong') out.sent.wrong++;
    if (v === 'partly') out.sent.partly++;
  }
  out.sent.open = sent.size - closed.size;
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
const placeName = (where: string) => (where === 'city' ? 'городская' : 'поликлиника');

console.log(
  `База ${base.contentVersion}; зёрна ${SEEDS.join(', ')}; день 08:00–20:00, поток от больницы; ${EVERY ? 'любое решение терапевта' : 'просьбы терапевта по правилу базы'}, ` +
    `из профиля — ${LEAD ? 'ведущая гипотеза' : 'вторая гипотеза'}; поправки ${XS.map(x => `×${x}`).join(', ')}\n`,
);

// ---------------------------------------------------------------- одни и те же больные: исходы из одной точки
const all: Case[] = [];
for (const where of ONLY) {
  for (const seed of SEEDS) {
    const t0 = performance.now();
    const n = all.length;
    cases(where, seed, all);
    console.error(`  ${where} ${seed}: больных по правилу — ${all.length - n}, ${Math.round((performance.now() - t0) / 1000)} с`);
  }
}
console.log('Одни и те же больные — терапевт просит, по правилу направил бы:\n');
console.log('| больница | больных | правда в профиле | исход | верно | частично | неверно | не решён к 20:00 | минут до решения |');
console.log('|---|---:|---:|---|---:|---:|---:|---:|---:|');
for (const where of ONLY) {
  const xs = all.filter(c => c.where === where);
  for (const m of MODES) {
    const done = xs.filter(c => c.out.get(m)!.end === 'done');
    const v = (k: ClosedCase['verdict']) => pct(xs.filter(c => c.out.get(m)!.verdict === k).length, xs.length);
    console.log(
      `| ${placeName(where)} | ${xs.length} | ${pct(xs.filter(c => c.inProfile).length, xs.length)} | ${NAME(m)} | ${v('correct')} | ${v('partly')} | ${v('wrong')} | ` +
        `${pct(xs.filter(c => c.out.get(m)!.end !== 'done').length, xs.length)} | ${mean(done.map(c => c.out.get(m)!.minutes)).toFixed(0)} |`,
    );
  }
}
// по правде больного: поправка помогает, где болезнь профиля, и может увести, где её нет
console.log('\nПо правде больного — неверно / частично при каждом исходе (обе больницы):\n');
console.log(`| правда | больных | ${MODES.map(NAME).join(' | ')} |`);
console.log(`|---|---:|${MODES.map(() => '---:').join('|')}|`);
for (const [name, xs] of [['из профиля специалиста', all.filter(c => c.inProfile)], ['не из профиля', all.filter(c => !c.inProfile)]] as const) {
  const cell = (m: Mode) => `${xs.filter(c => c.out.get(m)!.verdict === 'wrong').length} / ${xs.filter(c => c.out.get(m)!.verdict === 'partly').length}`;
  console.log(`| ${name} | ${xs.length} | ${MODES.map(cell).join(' | ')} |`);
}

// ---------------------------------------------------------------- целый день с правилом движка
console.log('\nЦелый день с правилом движка (сумма по зёрнам):\n');
console.log('| больница | поправка | приёмов нанятых | неверно | частично | направлено: неверно / частично / не решён | записанных к специалистам: ушли или не приняты | ждали вызова, мин | всего ушли или не приняты |');
console.log('|---|---|---:|---:|---:|---:|---:|---:|---:|');
for (const where of ONLY) {
  for (const x of [undefined, ...XS]) {
    const runs = SEEDS.map(seed => day(where, seed, x));
    const sum = (f: (r: DayRun) => number) => runs.reduce((a, r) => a + f(r), 0);
    const n = sum(r => r.correct + r.partly + r.wrong);
    console.log(
      `| ${placeName(where)} | ${x === undefined ? 'без направления' : `×${x}`} | ${n} | ${pct(sum(r => r.wrong), n)} | ${pct(sum(r => r.partly), n)} | ` +
        `${sum(r => r.sent.n)}: ${sum(r => r.sent.wrong)} / ${sum(r => r.sent.partly)} / ${sum(r => r.sent.open)} | ${sum(r => r.bookedLost)} из ${sum(r => r.booked)} | ${mean(runs.map(r => r.bookedWait)).toFixed(0)} | ${sum(r => r.lost)} |`,
    );
  }
}
