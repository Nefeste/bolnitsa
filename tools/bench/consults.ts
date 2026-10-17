// «Просят посмотреть» (spec docs/specs/2026-10-consults.md): какая доля приёмов нанятых врачей просит вас посмотреть — в
// потоке для ПК, на больницах бенчмарка (tools/bench/bench.ts: кабинетов — нагрузка / 1,5, приток — 1,4 × нагрузка в час),
// со смотровой приёмного и скорой; день до 20:00.
//
// bun tools/bench/consults.ts                          — 10, 50, 100, 200 человек; никто не отвечает: просьба ждёт срока,
//                                                        и врач решает сам; терапевты по навыку — по весам кандидатов
// bun tools/bench/consults.ts --skill 3                — все терапевты навыка 3, как в больнице бенчмарка
// bun tools/bench/consults.ts --load 50 --seeds 1,2    — нагрузки и зёрна
// bun tools/bench/consults.ts --probe                  — откуда пороги: просит каждый (кроме идущего срока), ему сразу
//                                                        «пусть решает сам»; как часто ошибается врач при каждой
//                                                        уверенности и сколько просили бы при порогах базы и при общем;
//                                                        как часто он ошибается с необъяснённым красным флагом
import { hospitalFor } from './hospital';
import type { ContentDb, Id } from '../../src/content/types';
import { knownFacts } from '../../src/engine/med/infer';
import { apply, candidatesOf, newFlowShift, observationsOf } from '../../src/engine/shift/engine';
import type { StaffMember } from '../../src/engine/hospital/staff';
import { DAY, type ShiftState } from '../../src/engine/shift/types';
import { buildDb } from '../content/load';

const arg = (name: string, def: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
};
const LOADS = arg('load', '10,50,100,200').split(',').map(Number);
const SEEDS = arg('seeds', '1,2').split(',').map(Number);
const SKILL = process.argv.includes('--skill') ? Number(arg('skill', '3')) : undefined;
const PROBE = process.argv.includes('--probe');

const built = buildDb();
if (built.errors.length) {
  console.error(built.errors.join('\n'));
  process.exit(1);
}
const db: ContentDb = built.db;
const rule = db.consults!;
/** Пробу: просит каждый — порог выше любой уверенности. */
const probeDb: ContentDb = { ...db, consults: { ...rule, unsure: [101, 101, 101, 101, 101] } };

const PHI = (Math.sqrt(5) - 1) / 2;
/**
 * Навык терапевтов — по весам кандидатов (`staff.skills`, %), вперемешку по кабинетам: k-й — тот навык, в чью долю
 * попадает дробная часть k · φ. Подряд по кабинетам нельзя: при равном времени свободные врачи зовут по номеру кабинета,
 * и первые брали бы срочных. Все одного навыка — `--skill`.
 */
function skilled(staff: StaffMember[]): StaffMember[] {
  const w = db.economy.staff.skills;
  const total = w.reduce((a, b) => a + b, 0);
  let k = 0;
  const skillAt = (x: number) => {
    let left = x * total;
    for (let i = 0; i < w.length; i++) if ((left -= w[i]) < 0) return i + 1;
    return w.length;
  };
  return staff.map(m => (m.role === 'role.therapist' ? { ...m, skill: SKILL ?? skillAt((++k * PHI) % 1) } : m));
}

interface Decision {
  skill: number;
  /** уверенность в группе его диагноза и во второй группе */
  p1: number;
  p2: number;
  /** проба: показан красный флаг, которого диагноз не объясняет */
  flag: boolean;
  wrong: boolean;
}

/**
 * Проба: показан ли больному красный флаг (`redFlags` болезней, из которых выбирает врач), который не объясняют связи
 * диагноза `dx`, известных сопутствующих и факторов риска, — сигнал «необъяснённый красный флаг», которого нет в правиле.
 */
function unexplainedFlag(s: ShiftState, id: string, dx: Id): boolean {
  const p = s.patients[id];
  const obs = observationsOf(p);
  const flags = new Set(candidatesOf(db, p.departments ?? s.meta.department).flatMap(c => db.conditions[c].redFlags ?? []));
  const known = knownFacts(db, obs);
  const links = new Set([
    ...(db.conditions[dx]?.findings ?? []), ...known.conditions.flatMap(c => db.conditions[c]?.findings ?? []), ...known.risks.flatMap(r => db.risks[r]?.findings ?? []),
  ].map(l => l.f));
  return obs.some(o => o.shown && flags.has(o.f) && !links.has(o.f));
}

interface Day {
  /** приёмов нанятых врачей и просьб — по навыку */
  seen: number[];
  asked: number[];
  /** неверно: у тех, о ком просили, и у остальных */
  wrongAsked: number;
  askedSeen: number;
  wrongRest: number;
  rest: number;
  /** просьб с 09:00 до 14:00; самое большее открытых сразу */
  window: number;
  open: number;
  /** проба: каждое решение с уверенностью */
  decisions: Decision[];
}

function day(load: number, seed: number): Day {
  const layout = hospitalFor(db, Math.ceil(load / 1.5), 100, { emergency: true });
  const staff = skilled(layout.staff);
  const use = PROBE ? probeDb : db;
  const s: ShiftState = newFlowShift(use, {
    seed, season: 'winter', hospital: layout.hospital, staff, flow: { perHour: Math.round(1.4 * load), ambulancePerHour: Math.max(1, Math.round(load / 50)) },
  });
  const skillOf = new Map(staff.map(m => [m.id, m.skill]));
  const asked = new Map<string, Omit<Decision, 'wrong'>>();
  const out: Day = { seen: [0, 0, 0, 0, 0], asked: [0, 0, 0, 0, 0], wrongAsked: 0, askedSeen: 0, wrongRest: 0, rest: 0, window: 0, open: 0, decisions: [] };
  while (s.t < 20 * 3600) {
    for (const n of apply(use, s, { kind: 'advance', seconds: 60 })) {
      if (n.kind !== 'consult') continue;
      const c = s.consults!.find(x => x.id === n.id)!;
      asked.set(n.id, { skill: skillOf.get(n.by) ?? 3, p1: c.lead[0].p, p2: c.lead[1]?.p ?? 0, flag: PROBE && unexplainedFlag(s, n.id, c.lead[0].id) });
      const clock = s.t % DAY;
      if (clock >= 9 * 3600 && clock <= 14 * 3600) out.window++;
    }
    out.open = Math.max(out.open, s.consults?.length ?? 0);
    // проба: сразу «пусть решает сам» — тем диагнозом, с которым просил
    if (PROBE) for (const c of [...(s.consults ?? [])]) apply(use, s, { kind: 'consult', id: c.id, answer: 'self' });
  }
  // итог суток с 08:00 до 20:00 (spec 2026-10-day: сутки кончаются в 08:00, день не закрывают)
  for (const [by, c] of Object.entries(s.summary.colleagues ?? {})) {
    const k = (skillOf.get(by) ?? 3) - 1;
    out.seen[k] += c.seen;
    out.asked[k] += c.asked ?? 0;
  }
  const closed = [...(s.gone ?? []).filter(r => r.by !== undefined && r.verdict).map(r => ({ id: r.id, verdict: r.verdict! })),
    ...Object.values(s.patients).filter(p => p.closed?.by).map(p => ({ id: p.id, verdict: p.closed!.verdict }))];
  for (const r of closed) {
    const a = asked.get(r.id);
    const wrong = r.verdict === 'wrong';
    if (a) {
      out.askedSeen++;
      if (wrong) out.wrongAsked++;
      out.decisions.push({ ...a, wrong });
    } else {
      out.rest++;
      if (wrong) out.wrongRest++;
    }
  }
  return out;
}

const pct = (a: number, b: number) => (b > 0 ? `${((100 * a) / b).toFixed(1)} %` : '—');
const days = (load: number) => SEEDS.map(seed => day(load, seed));
const staffLine = `терапевты ${SKILL ? `все навыка ${SKILL}` : `по весам кандидатов ${db.economy.staff.skills.join('/')} %`}; со скорой; зёрна ${SEEDS.join(', ')}`;
console.log(`База ${db.contentVersion}; пороги: unsure ${rule.unsure.join('/')} %, close ${rule.close} %, ждёт ${rule.wait} мин; ${staffLine}\n`);

if (!PROBE) {
  console.log('| в больнице | приходят в час | приёмов нанятых | просили посмотреть | по навыку 1 / 2 / 3 / 4 / 5 | неверно: просили / остальные | просьб в час 09–14 | открыто сразу, наибольшее |');
  console.log('|---:|---:|---:|---:|---|---:|---:|---:|');
  for (const load of LOADS) {
    const t0 = performance.now();
    const all = days(load);
    const sum = (f: (d: Day) => number) => all.reduce((a, d) => a + f(d), 0);
    const seen = [0, 1, 2, 3, 4].map(k => sum(d => d.seen[k]));
    const asked = [0, 1, 2, 3, 4].map(k => sum(d => d.asked[k]));
    const n = seen.reduce((a, b) => a + b, 0);
    const a = asked.reduce((x, y) => x + y, 0);
    const bySkill = seen.map((x, k) => (x > 0 ? ((100 * asked[k]) / x).toFixed(1) : '—')).join(' / ');
    console.log(`| ${load} | ${Math.round(1.4 * load)} | ${n} | ${a} (${pct(a, n)}) | ${bySkill} % | ${pct(sum(d => d.wrongAsked), sum(d => d.askedSeen))} / ${pct(sum(d => d.wrongRest), sum(d => d.rest))} | ${(sum(d => d.window) / 5 / SEEDS.length).toFixed(1)} | ${Math.max(...all.map(d => d.open))} |`);
    console.error(`  ${load}: ${Math.round((performance.now() - t0) / 1000)} с`);
  }
} else {
  const all: Decision[] = [];
  let timed = 0;
  for (const load of LOADS) {
    for (const d of days(load)) {
      all.push(...d.decisions);
      timed += d.rest;
    }
    console.error(`  ${load}: решений ${all.length}`);
  }
  const wrong = all.filter(x => x.wrong).length;
  console.log(`Решений с просьбой ${all.length} (неверно ${pct(wrong, all.length)}); без просьбы — шёл срок на лечение или место — ${timed} (${pct(timed, timed + all.length)})\n`);
  console.log('| уверенность в группе диагноза | доля решений | неверно |');
  console.log('|---|---:|---:|');
  const bands: [number, number, string][] = [[0, 0.5, 'ниже 50 %'], [0.5, 0.6, '50–60 %'], [0.6, 0.7, '60–70 %'], [0.7, 0.8, '70–80 %'], [0.8, 0.9, '80–90 %'], [0.9, 2, '90 % и выше']];
  for (const [lo, hi, name] of bands) {
    const xs = all.filter(x => x.p1 >= lo && x.p1 < hi);
    console.log(`| ${name} | ${pct(xs.length, all.length)} | ${pct(xs.filter(x => x.wrong).length, xs.length)} |`);
  }
  const W = db.economy.staff.skills;
  const report = (name: string, unsure: readonly number[]) => {
    const asks = (x: Decision) => x.p1 * 100 < unsure[x.skill - 1] || x.p2 * 100 >= rule.close * x.p1;
    const per = [1, 2, 3, 4, 5].map(k => {
      const xs = all.filter(x => x.skill === k);
      return xs.length > 0 ? xs.filter(asks).length / xs.length : NaN;
    });
    const mix = per.reduce((a, p, i) => a + (Number.isNaN(p) ? 0 : (p * W[i]) / 100), 0);
    const a = all.filter(asks);
    const rest = all.filter(x => !asks(x));
    const unsureOf = (x: Decision) => x.p1 * 100 < unsure[x.skill - 1];
    const closeOf = (x: Decision) => x.p2 * 100 >= rule.close * x.p1;
    const why = `почему: не уверен ${pct(a.filter(x => unsureOf(x) && !closeOf(x)).length, a.length)}, рядом ${pct(a.filter(x => !unsureOf(x) && closeOf(x)).length, a.length)}, оба ${pct(a.filter(x => unsureOf(x) && closeOf(x)).length, a.length)}`;
    console.log(`${name}: просят ${pct(a.length, all.length)} (по весам кандидатов ${(100 * mix).toFixed(1)} %); по навыку ${per.map(p => (Number.isNaN(p) ? '—' : (100 * p).toFixed(1))).join(' / ')} %; неверно: просили ${pct(a.filter(x => x.wrong).length, a.length)}, остальные ${pct(rest.filter(x => x.wrong).length, rest.length)}; просьбы застают ${pct(a.filter(x => x.wrong).length, wrong)} ошибок; ${why}`);
  };
  const flagged = all.filter(x => x.flag);
  console.log(`\nНеобъяснённый красный флаг: у ${pct(flagged.length, all.length)} решений, из них неверно ${pct(flagged.filter(x => x.wrong).length, flagged.length)} (у всех — ${pct(wrong, all.length)})`);
  console.log('');
  report(`пороги базы ${rule.unsure.join('/')} %`, rule.unsure);
  for (const u of [60, 65]) report(`общий порог ${u} %`, [u, u, u, u, u]);
  // для подбора: доля просьб у навыка при пороге «не уверен» T (и «рядом» — как в базе)
  const ts = [44, 48, 50, 52, 54, 56, 58, 60, 62, 64, 66, 68, 70, 72, 74];
  console.log(`\n| навык \\ порог, % | ${ts.join(' | ')} |`);
  console.log(`|---|${ts.map(() => '---:').join('|')}|`);
  for (let k = 1; k <= 5; k++) {
    const xs = all.filter(x => x.skill === k);
    const row = ts.map(t => (xs.length > 0 ? ((100 * xs.filter(x => x.p1 * 100 < t || x.p2 * 100 >= rule.close * x.p1).length) / xs.length).toFixed(1) : '—'));
    console.log(`| ${k} (${xs.length}) | ${row.join(' | ')} |`);
  }
}
