// Бенчмарк движка (spec docs/specs/2026-10-engine-speed.md; основа — проба 2, spikes/engine-throughput): сколько стоит
// ход времени смены, когда в больнице 50–300 пациентов одновременно.
//
// Как в симуляторах «Анамнеза» (tools/sim/shift.ts, district.ts): база собирается из YAML в память (`buildDb`), смена
// живёт командами `apply(db, s, { kind: 'advance', seconds })`, без интерфейса. Больных ведут нанятые терапевты движка —
// тот же разумный врач, что у «Виртуального врача»; игрока нет.
//
// Два режима:
//   --mode desks — как в «Анамнезе» и в пробе: `newSingle`, приток — слоты записи у каждого кабинета (--desks 33,66,132);
//   --mode flow  — поток для ПК (`newFlowShift`): приток в час, пациент — к приходу (--load 50,100,200,300 — сколько
//                  пациентов одновременно нужно; кабинетов и притока — по таблице LOADS ниже).
//
// bun tools/bench/bench.ts                     — поток для ПК: шаги по минуте, кадры по 1 и 4 игровые секунды (×3 и ×12) целиком и по частям, детерминизм
// bun tools/bench/bench.ts --quick             — только шаги по минуте (и повтор меньшей больницы — детерминизм)
// bun tools/bench/bench.ts --mode desks        — по-старому, слотами записи (до и после ускорения — одни и те же пациенты)
// bun tools/bench/bench.ts --no-parts          — без прогонов «по частям» (кадр с бюджетом 4 мс, как в игре «Анамнеза»)
// bun tools/bench/bench.ts --seed 7 --until 18 — зерно смены и до какого часа жить
// bun tools/bench/bench.ts --only 200 --quick  — одна больница (для профиля: bun --cpu-prof --cpu-prof-dir=… …)
// bun tools/bench/bench.ts --json tools/bench/out/result.json — итог ещё и в JSON
//
// Сутки целиком (spec docs/specs/2026-10-day.md), только --mode flow:
// bun tools/bench/bench.ts --mode flow --day   — до 10:00 вторых суток: минута днём (09–14, 14–20), ночью (20–08) и утром
//                                                вторых суток, планёрка в 08:00 и обход в 09:00 — отдельно
// bun tools/bench/bench.ts --mode flow --flat  — ровная форма потока по часам: до 14:00 приходят те же, что до суток целиком,
//                                                — сравнение с прежним движком в окне 09:00–14:00
//
// Смены (spec docs/specs/2026-10-staff-shifts.md), только --mode flow:
// bun tools/bench/bench.ts --mode flow --day --emergency --shifts — штат со сменами, как у готовой больницы: все — дневная,
//                                                а в больнице со смотровой — и ночная там, где работают ночью
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { gzipSync } from 'bun';
import { heapStats } from 'bun:jsc';
import { hospitalFor, type Layout } from './hospital';
import type { ContentDb } from '../../src/content/types';
import { generatePatient } from '../../src/engine/med/generate';
import { withNightShift } from '../../src/engine/hospital/staff';
import { apply, candidatesOf, catchUp, hospitalCtx, newFlowShift, newSingle, reviewsDue, SANDBOX_VENUE } from '../../src/engine/shift/engine';
import { DAY, SHIFT_END, SHIFT_START, type ShiftState } from '../../src/engine/shift/types';
import { buildDb } from '../content/load';

const arg = (name: string, def: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
};
const flag = (name: string) => process.argv.includes(`--${name}`);
const MODE = arg('mode', 'desks') as 'desks' | 'flow';
const DESKS = (flag('only') ? arg('only', '') : MODE === 'desks' ? arg('desks', '33,66,132') : arg('load', '50,100,200,300')).split(',').map(Number);
const SEED = Number(arg('seed', '1'));
const DAY_RUN = flag('day');
const UNTIL = Number(arg('until', DAY_RUN ? '34' : '18')) * 3600;
const QUICK = flag('quick');
const FRAMES = !QUICK && !flag('no-frames');
const PARTS = !QUICK && !flag('no-parts');
const JSON_OUT = flag('json') ? arg('json', 'out/result.json') : undefined;

// --- статистика ------------------------------------------------------------------------------------------------------

const quantile = (xs: number[], q: number) => {
  if (xs.length === 0) return NaN;
  const a = [...xs].sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.floor(q * (a.length - 1) + 0.5))];
};
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : '—');
const f2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : '—');
const mb = (bytes: number) => `${(bytes / 1048576).toFixed(1)} МБ`;
const kb = (bytes: number) => `${Math.round(bytes / 1024)} КБ`;
const clock = (t: number) => {
  const m = Math.floor((t % DAY) / 60);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/** Сколько больных сейчас в больнице: ждут, у врача, на обследовании; лежащие в палате — отдельно. */
function census(s: ShiftState) {
  let live = 0;
  let admitted = 0;
  let stuck = 0;
  for (const p of Object.values(s.patients)) {
    if (p.status === 'waiting' || p.status === 'inRoom' || p.status === 'away') {
      live++;
      // «красных», повторных и со скорой нанятые врачи не берут — они ждут игрока, которого в пробе нет
      if (p.status === 'waiting' && !p.by && p.triaged !== false && p.triage === 'red') stuck++;
    } else if (p.status === 'admitted') admitted++;
  }
  return { live, admitted, stuck };
}

/** копии состояния для замера кучи — снаружи функции, чтобы сборщик не счёл их мёртвыми раньше замера */
const sink: unknown[] = [];

const hashOf = (s: ShiftState) => Bun.hash(JSON.stringify(s)).toString(16);

function heapUsed(): number {
  Bun.gc(true);
  return heapStats().heapSize;
}

// --- база ------------------------------------------------------------------------------------------------------------

const t0 = performance.now();
const { db, errors } = buildDb();
const dbMs = performance.now() - t0;
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
// ровная форма потока по часам (spec 2026-10-day): в окне 09:00–14:00 — тот же приток, что прежде, для сравнения до и после
if (flag('flat') && db.day) db.day = { ...db.day, walk: Array<number>(24).fill(100), ambulance: Array<number>(24).fill(100) };
const therapy = candidatesOf(db, 'dept.therapy');
console.log(`База ${db.contentVersion}: болезней ${Object.keys(db.conditions).length}, у терапии кандидатов ${therapy.length}, обследований ${Object.keys(db.exams).length}; собрана за ${Math.round(dbMs)} мс`);
console.log(`Bun ${Bun.version}, зерно ${SEED}`);

// --- генерация одного пациента ---------------------------------------------------------------------------------------

function genBench(db: ContentDb) {
  const N = 2000;
  const ctx = { department: 'dept.therapy', departments: ['dept.therapy'], season: 'winter' as const, walkIn: true };
  for (let i = 0; i < 200; i++) generatePatient(db, 1_000_000 + i, ctx); // прогрев
  const times: number[] = [];
  for (let i = 0; i < N; i++) {
    const a = performance.now();
    generatePatient(db, i * 7919 + 13, ctx);
    times.push(performance.now() - a);
  }
  return { n: N, medianMs: quantile(times, 0.5), p95Ms: quantile(times, 0.95), maxMs: Math.max(...times), meanMs: mean(times) };
}
const gen = genBench(db);
console.log(`\nГенерация пациента (${gen.n} шт.): медиана ${f2(gen.medianMs)} мс, p95 ${f2(gen.p95Ms)} мс, худший ${f1(gen.maxMs)} мс, в среднем ${f2(gen.meanMs)} мс`);

// --- больница и смена -----------------------------------------------------------------------------------------------

/**
 * Поток для ПК: сколько нужно в больнице одновременно → кабинеты и приток. Подобрано прогонами: нанятый терапевт ведёт
 * около полутора больных сразу, а приём с обследованиями идёт около 50 минут — приток ≈ 1,4 × нагрузка в час.
 */
const EMERGENCY = flag('emergency');
const SHIFTS = flag('shifts');
const flowOf = (load: number) => ({ desks: Math.ceil(load / 1.5), perHour: Math.round(1.4 * load), ambulancePerHour: EMERGENCY ? Math.max(1, Math.round(load / 50)) : 0 });

function layoutFor(n: number): Layout {
  return MODE === 'flow' ? hospitalFor(db, flowOf(n).desks, 100, { emergency: EMERGENCY }) : hospitalFor(db, n);
}

let flowLoad = 0;
function start(layout: Layout): ShiftState {
  if (MODE === 'flow') {
    const f = flowOf(flowLoad);
    const staff = SHIFTS ? withNightShift(db, layout.hospital.rooms, layout.staff) : layout.staff;
    return newFlowShift(db, { seed: SEED, season: 'winter', hospital: layout.hospital, staff, flow: { perHour: f.perHour, ambulancePerHour: f.ambulancePerHour } });
  }
  return newSingle(db, { seed: SEED, season: 'winter', venue: SANDBOX_VENUE, hospital: layout.hospital, staff: layout.staff });
}

// --- смена -----------------------------------------------------------------------------------------------------------

interface Step { t: number; ms: number; live: number }
interface RunResult {
  step: number;
  /** розыгрыш дня — `newSingle` разыгрывает всех пришедших за день сразу */
  planMs: number;
  planned: number;
  steps: Step[];
  /** часы → хэш состояния */
  hashes: Map<number, string>;
  peak: { live: number; t: number; admitted: number; stuck: number; snapshot: number; gzip: number; heap: number; process: number; patients: number; events: number };
  end: { snapshot: number; gzip: number; patients: number; done: number; left: number; admitted: number; stuck: number };
  maxEvents: number;
  totalMs: number;
  /** закрытие дня и хэш после него */
  closeMs: number;
  closedHash: string;
  /** к концу прогона: разборов ждут досчёта; ушедших — строками журнала (поток для ПК) */
  due: number;
  gone: number;
}

function run(layout: Layout, step: number, measureMemory: boolean): RunResult {
  const a = performance.now();
  const s = start(layout);
  const planMs = performance.now() - a;
  const planned = Object.keys(s.patients).length;
  const steps: Step[] = [];
  const hashes = new Map<number, string>();
  let peak: RunResult['peak'] = { live: -1, t: 0, admitted: 0, stuck: 0, snapshot: 0, gzip: 0, heap: 0, process: 0, patients: 0, events: 0 };
  let maxEvents = 0;
  let totalMs = 0;
  // снимок памяти — на пике, но не чаще раза в 10 игровых минут (сборка мусора и JSON сами стоят времени)
  let lastMem = -Infinity;
  while (s.t < UNTIL) {
    const b = performance.now();
    apply(db, s, { kind: 'advance', seconds: step });
    const ms = performance.now() - b;
    totalMs += ms;
    const c = census(s);
    steps.push({ t: s.t, ms, live: c.live });
    maxEvents = Math.max(maxEvents, s.events.length);
    if (s.t % 3600 === 0) hashes.set(s.t, hashOf(s));
    if (c.live > peak.live) {
      peak = { ...peak, live: c.live, t: s.t, admitted: c.admitted, stuck: c.stuck, patients: Object.keys(s.patients).length, events: s.events.length };
      if (measureMemory && s.t - lastMem >= 600) {
        lastMem = s.t;
        const json = JSON.stringify(s);
        peak.snapshot = Buffer.byteLength(json);
        peak.gzip = gzipSync(json).length;
        // сколько занимает в куче само состояние: разница кучи с четырьмя его копиями и без них
        const before = heapUsed();
        for (let i = 0; i < 4; i++) sink.push(JSON.parse(json));
        peak.heap = (heapUsed() - before) / sink.length;
        sink.length = 0;
        peak.process = before;
      }
    }
  }
  const json = JSON.stringify(s);
  const c = census(s);
  const all = Object.values(s.patients);
  const due = reviewsDue(s);
  const gone = s.gone?.length ?? 0;
  // вечер: закрыть день; в режиме desks — с досчётом отложенных разборов, как в «Анамнезе»; в потоке для ПК разбора нанятых нет
  const e0 = performance.now();
  apply(db, s, { kind: 'closeDay' });
  const closeMs = performance.now() - e0;
  const closedHash = hashOf(s);
  return {
    step, planMs, planned, steps, hashes, peak, maxEvents, totalMs, closeMs, closedHash, due, gone,
    end: {
      snapshot: Buffer.byteLength(json), gzip: gzipSync(json).length, patients: all.length,
      done: all.filter(p => p.status === 'done' || p.closed).length + (s.gone ?? []).filter(r => r.end === 'done').length, left: all.filter(p => p.status === 'left').length + (s.gone ?? []).filter(r => r.end === 'left').length, admitted: c.admitted, stuck: c.stuck,
    },
  };
}

/** Счёт до `ms` от сейчас; `first` — одно событие всегда, как `budget` в session.ts «Анамнеза» и в tools/sim/district.ts. */
function budget(ms: number, first = false): () => boolean {
  const end = performance.now() + ms;
  let once = first;
  return () => {
    if (!once) return performance.now() <= end;
    once = false;
    return true;
  };
}

interface PartsResult {
  frames: { t: number; ms: number }[];
  /** насколько часы смены отстали от часов игры, игровых секунд: наибольшее и в 14:00 */
  maxLag: number;
  lagAtEnd: number;
  /** кадров сверх нужных, чтобы догнать к `UNTIL` */
  extraFrames: number;
  hashes: Map<number, string>;
  /** хэш после закрытия дня */
  endHash: string;
  /** разборов ждут досчёта в 14:00 и к концу прогона; закрытие дня (с досчётом остального) */
  dueAtEnd: number;
  due: number;
  closeMs: number;
}

/**
 * Кадры «по частям», как играет «Анамнез» (0.5.13, spec 2026-10-parts): каждый кадр часам игры прибавляется `sec` игровых
 * секунд, а движку даётся 4 мс — `apply(advance, more)` и `catchUp(more)`; шаг нанятого врача и разбор его приёма
 * считаются кусками (`stepParts`). Не успел — часы смены отстают от часов игры и догоняют в следующих кадрах.
 */
function runParts(layout: Layout, sec: number): PartsResult {
  const s = start(layout);
  const frames: PartsResult['frames'] = [];
  const hashes = new Map<number, string>();
  let game = s.t;
  let owed = 0;
  let maxLag = 0;
  let lagAtEnd = 0;
  let extraFrames = 0;
  let dueAtEnd = 0;
  while (s.t < UNTIL || s.until !== undefined) {
    if (game < UNTIL) {
      game += sec;
      owed += sec;
    } else extraFrames++;
    const b = performance.now();
    const more = budget(4, true);
    if (s.until !== undefined) catchUp(db, s, more);
    if (s.until === undefined && owed > 0) {
      apply(db, s, { kind: 'advance', seconds: owed }, more);
      owed = 0;
    }
    frames.push({ t: game, ms: performance.now() - b });
    const lag = game - s.t;
    maxLag = Math.max(maxLag, lag);
    if (game % DAY === SHIFT_END) {
      lagAtEnd = lag;
      dueAtEnd = reviewsDue(s);
    }
  }
  const due = reviewsDue(s);
  const e0 = performance.now();
  apply(db, s, { kind: 'closeDay' });
  return { frames, maxLag, lagAtEnd, extraFrames, hashes, endHash: hashOf(s), dueAtEnd, due, closeMs: performance.now() - e0 };
}

/** Окно рабочей смены: с 09:00 (больница набрала поток) до конца приёма 14:00. */
const inShift = (st: Step) => st.t % DAY > SHIFT_START + 3600 && st.t % DAY <= SHIFT_END;

interface Row {
  desks: number; plot: [number, number]; rooms: number;
  planned: number; planMs: number;
  liveMedian: number; livePeak: number; admittedPeak: number; stuckPeak: number;
  minute: { median: number; p95: number; max: number };
  perPatientMinute: number;
  frames?: Record<'x1' | 'x4', { median: number; p95: number; p99: number; max: number; over4: number; gameSec: number }>;
  parts?: Record<'x1' | 'x4', { median: number; p95: number; p99: number; max: number; over4: number; maxLagMin: number; lagAtEndMin: number; extraFrames: number; same: boolean; dueAtEnd: number; due: number; closeMs: number }>;
  memory: { heapPeak: number; processPeak: number; snapshotPeak: number; gzipPeak: number; snapshotEnd: number; gzipEnd: number; patientsEnd: number };
  done: number; left: number; maxEvents: number; dayMs: number; closeMs: number; closedHash: string;
  deterministic: { same: boolean; compared: number; runs: string[] };
}

const rows: Row[] = [];
for (const desks of DESKS) {
  flowLoad = desks;
  const layout = layoutFor(desks);
  const ctx = hospitalCtx(db, start(layout));
  console.log(MODE === 'flow'
    ? `\n=== Поток для ПК на ${desks} одновременно: кабинетов ${flowOf(desks).desks}, приходят ${flowOf(desks).perHour} в час${EMERGENCY ? `, скорая ${flowOf(desks).ambulancePerHour} в час` : ''} (участок ${layout.plot.join(' × ')}, помещений ${layout.rooms}, стульев ${ctx.seats})`
    : `\n=== Кабинетов нанятых врачей: ${desks} (участок ${layout.plot.join(' × ')}, помещений ${layout.rooms}, работают ${ctx.working.size}, стульев ${ctx.seats})`);
  const main = run(layout, 60, true);
  const win = main.steps.filter(inShift);
  const msMin = win.map(x => x.ms);
  const lives = win.map(x => x.live);
  console.log(`  розыгрыш дня: ${main.planned} пациентов за ${Math.round(main.planMs)} мс`);
  console.log(`  в больнице 09:00–14:00: медиана ${quantile(lives, 0.5)}, пик ${main.peak.live} в ${clock(main.peak.t)} (из них ждут игрока ${main.peak.stuck}); в палатах на пике ${main.peak.admitted}`);
  console.log(`  мс на игровую минуту 09:00–14:00: медиана ${f1(quantile(msMin, 0.5))}, p95 ${f1(quantile(msMin, 0.95))}, худшая ${f1(Math.max(...msMin))}`);
  console.log(`  за день до ${clock(UNTIL)}: ${Math.round(main.totalMs)} мс; приёмов закрыто ${main.end.done}, ушли не дождавшись ${main.end.left}; событий в очереди до ${main.maxEvents}; к ${clock(UNTIL)} ждут досчёта разбора ${main.due}, ушедших в журнале ${main.gone}; закрытие дня ${Math.round(main.closeMs)} мс`);
  console.log(`  память на пике: состояние в куче ${mb(main.peak.heap)} (вся куча процесса с базой и кэшами ${mb(main.peak.process)}), снимок ${kb(main.peak.snapshot)} (gzip ${kb(main.peak.gzip)}); к ${clock(UNTIL)}: снимок ${kb(main.end.snapshot)} (gzip ${kb(main.end.gzip)}), пациентов в состоянии ${main.end.patients}`);
  // сутки целиком (spec 2026-10-day): по часам суток — от начала смены, 08:00 первых суток
  if (DAY_RUN) {
    const H = 3600;
    const span = (from: number, to: number) => main.steps.filter(x => x.t > from * H && x.t <= to * H);
    for (const [name, from, to] of [['день 09–14', 9, 14], ['день 14–20', 14, 20], ['ночь 20–08', 20, 32], ['утро 08–10 вторых суток', 32, 34]] as const) {
      const w = span(from, Math.min(to, UNTIL / H));
      if (w.length === 0) continue;
      const ms = w.map(x => x.ms);
      console.log(`  ${name}: в больнице медиана ${quantile(w.map(x => x.live), 0.5)}; мс на игровую минуту — медиана ${f1(quantile(ms, 0.5))}, p95 ${f1(quantile(ms, 0.95))}, худшая ${f1(Math.max(...ms))}`);
    }
    for (const [name, at] of [['планёрка (минута до 08:00)', 32], ['обход (минута до 09:00)', 33]] as const) {
      const x = main.steps.find(st => st.t === at * H);
      if (x) console.log(`  ${name}: ${f1(x.ms)} мс`);
    }
  }

  const runs: RunResult[] = [main];
  let frames: Row['frames'];
  if (FRAMES) {
    // кадры при 60 к/с: 1 игровая секунда на кадр и 4 — ×3 и ×12 «спокойного» темпа (spec docs/specs/2026-10-walk.md;
    // прежние ×1 и ×4 — 60 игровых секунд в секунду, `docs/02-architecture.md` «Время» «Анамнеза»)
    frames = {} as NonNullable<Row['frames']>;
    for (const [key, sec] of [['x1', 1], ['x4', 4]] as const) {
      const r = run(layout, sec, false);
      runs.push(r);
      const w = r.steps.filter(inShift).map(x => x.ms);
      frames[key] = { median: quantile(w, 0.5), p95: quantile(w, 0.95), p99: quantile(w, 0.99), max: Math.max(...w), over4: w.filter(x => x > 4).length / w.length, gameSec: sec };
      console.log(`  кадр ${key} (${sec} игр. с): медиана ${f2(frames[key].median)} мс, p95 ${f2(frames[key].p95)}, p99 ${f2(frames[key].p99)}, худший ${f1(frames[key].max)} мс; дольше 4 мс — ${(100 * frames[key].over4).toFixed(1)} % кадров`);
    }
  } else if (desks === Math.min(...DESKS)) {
    runs.push(run(layout, 60, false));
  }
  let parts: Row['parts'];
  const partHashes: Map<number, string>[] = [];
  if (PARTS) {
    parts = {} as NonNullable<Row['parts']>;
    for (const [key, sec] of [['x1', 1], ['x4', 4]] as const) {
      const r = runParts(layout, sec);
      partHashes.push(r.hashes);
      const w = r.frames.filter(x => x.t % DAY > SHIFT_START + 3600 && x.t % DAY <= SHIFT_END).map(x => x.ms);
      parts[key] = { median: quantile(w, 0.5), p95: quantile(w, 0.95), p99: quantile(w, 0.99), max: Math.max(...w), over4: w.filter(x => x > 4).length / w.length, maxLagMin: r.maxLag / 60, lagAtEndMin: r.lagAtEnd / 60, extraFrames: r.extraFrames, same: r.endHash === main.closedHash, dueAtEnd: r.dueAtEnd, due: r.due, closeMs: r.closeMs };
      console.log(`  по частям ${key}: кадр медиана ${f2(parts[key].median)} мс, p95 ${f2(parts[key].p95)}, p99 ${f2(parts[key].p99)}, худший ${f1(parts[key].max)} мс, дольше 4 мс — ${(100 * parts[key].over4).toFixed(1)} %; часы отстали до ${f1(parts[key].maxLagMin)} игр. мин (в 14:00 — ${f1(parts[key].lagAtEndMin)}), догнать к ${clock(UNTIL)} — ещё ${r.extraFrames} кадров; разборов ждут досчёта в 14:00 — ${r.dueAtEnd}, к ${clock(UNTIL)} — ${r.due}, закрытие дня ${Math.round(r.closeMs)} мс; итог дня ${parts[key].same ? 'тот же' : 'ДРУГОЙ'}`);
    }
  }
  // детерминизм: прогоны с тем же зерном (и другими шагами времени) — тот же хэш состояния каждый час
  let same = true;
  let compared = 0;
  for (const [t, h] of main.hashes) {
    for (const other0 of [...runs.slice(1).map(r => r.hashes), ...partHashes]) {
      const other = other0.get(t);
      if (other === undefined) continue;
      compared++;
      if (other !== h) same = false;
    }
  }
  // по частям — сравнивается итог дня
  if (parts && (!parts.x1.same || !parts.x4.same)) same = false;
  const last = [...main.hashes.keys()].pop()!;
  console.log(`  детерминизм: ${runs.length + partHashes.length} прогона (шаги ${runs.map(r => `${r.step} с`).join(', ')}${partHashes.length ? ', по частям — кадры 1 и 4 с' : ''}), сравнений по часам ${compared} — ${same ? 'хэши совпали' : 'ХЭШИ РАЗНЫЕ'}; хэш в ${clock(last)}: ${runs.map(r => r.hashes.get(last)).join(' / ')}; после закрытия дня: ${runs.map(r => r.closedHash).join(' / ')}${parts ? `; по частям — ${parts.x1.same && parts.x4.same ? 'тот же' : 'ДРУГОЙ'}` : ''}`);

  rows.push({
    desks, plot: layout.plot, rooms: layout.rooms, planned: main.planned, planMs: main.planMs,
    liveMedian: quantile(lives, 0.5), livePeak: main.peak.live, admittedPeak: main.peak.admitted, stuckPeak: main.peak.stuck,
    minute: { median: quantile(msMin, 0.5), p95: quantile(msMin, 0.95), max: Math.max(...msMin) },
    perPatientMinute: quantile(msMin, 0.5) / Math.max(1, quantile(lives, 0.5)),
    ...(frames ? { frames } : {}),
    ...(parts ? { parts } : {}),
    memory: { heapPeak: main.peak.heap, processPeak: main.peak.process, snapshotPeak: main.peak.snapshot, gzipPeak: main.peak.gzip, snapshotEnd: main.end.snapshot, gzipEnd: main.end.gzip, patientsEnd: main.end.patients },
    done: main.end.done, left: main.end.left, maxEvents: main.maxEvents, dayMs: main.totalMs, closeMs: main.closeMs, closedHash: main.closedHash,
    deterministic: { same, compared, runs: runs.map(r => `${r.step}s`) },
  });
}

// --- итог: таблица и бюджет кадра ------------------------------------------------------------------------------------

console.log('\nИтог (окно 09:00–14:00, шаг 60 игровых секунд):');
console.log('| кабинетов | в больнице, медиана / пик | мс на игр. минуту, медиана / p95 / худшая | кадр 1 с (×3), p95 / худший, мс | кадр 4 с (×12), p95 / худший, мс | снимок на пике / gzip | состояние в куче / вся куча |');
for (const r of rows) {
  const fx = (k: 'x1' | 'x4') => (r.frames ? `${f2(r.frames[k].p95)} / ${f1(r.frames[k].max)}` : '—');
  console.log(`| ${r.desks} | ${r.liveMedian} / ${r.livePeak} | ${f1(r.minute.median)} / ${f1(r.minute.p95)} / ${f1(r.minute.max)} | ${fx('x1')} | ${fx('x4')} | ${kb(r.memory.snapshotPeak)} / ${kb(r.memory.gzipPeak)} | ${mb(r.memory.heapPeak)} / ${mb(r.memory.processPeak)} |`);
}
// бюджет: 4 мс на кадр при 60 к/с; ×12 — 15 кадров на игровую минуту (60 мс), ×3 — 60 кадров (240 мс), ×1 — 180 (720 мс)
if (rows.some(r => r.parts)) {
  console.log('\nПо частям (кадр — 4 мс движку, как в игре «Анамнеза»): насколько отстают часы смены, игровых минут, наибольшее / в 14:00');
  for (const r of rows) if (r.parts) console.log(`| ${r.desks} | 1 с (×3): ${f1(r.parts.x1.maxLagMin)} / ${f1(r.parts.x1.lagAtEndMin)}, худший кадр ${f1(r.parts.x1.max)} мс | 4 с (×12): ${f1(r.parts.x4.maxLagMin)} / ${f1(r.parts.x4.lagAtEndMin)}, худший кадр ${f1(r.parts.x4.max)} мс |`);
}
console.log('\nБюджет 4 мс на кадр при 60 к/с («спокойный» темп): ×12 — 60 мс на игровую минуту, ×3 — 240 мс, ×1 — 720 мс.');
for (const r of rows) {
  const verdict = (ms: number) => (ms <= 60 ? 'в бюджете ×12' : ms <= 240 ? 'в бюджете ×3, не ×12' : ms <= 720 ? 'в бюджете ×1, не ×3' : 'больше бюджета ×1');
  console.log(`  ${r.desks} кабинетов: медиана ${f1(r.minute.median)} мс/мин — ${verdict(r.minute.median)}; p95 ${f1(r.minute.p95)} мс/мин — ${verdict(r.minute.p95)}`);
}

if (JSON_OUT) {
  mkdirSync(dirname(JSON_OUT), { recursive: true });
  writeFileSync(JSON_OUT, JSON.stringify({ bun: Bun.version, seed: SEED, until: UNTIL, dbMs, candidates: therapy.length, gen, rows }, null, 2));
  console.log(`\nJSON: ${JSON_OUT}`);
}
