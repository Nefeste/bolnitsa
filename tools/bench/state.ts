// Размер снимка движка по суткам (docs/05-process.md, «Долгий прогон»): готовая больница, поток от больницы — как в окне,
// без игрока; в конце каждых суток — весь снимок (JSON, как его пишет сохранение и держит поток расчёта) и самые большие
// его поля. Так видно, что растёт без предела, а что выходит на полку: палаты заполняются за неделю, карты ушедших и пути
// хранятся сутки.
//   bun tools/bench/state.ts [--days 14] [--hospital city|poly] [--seed 3]
import { hospitalOf } from '../../src/engine/hospital/site';
import { siteOfPlan } from '../../src/engine/hospital/site-plan';
import { siteOfPreset } from '../../src/engine/hospital/site-preset';
import { presetStaff, withNightShift } from '../../src/engine/hospital/staff';
import { apply, newFlowShift } from '../../src/engine/shift/engine';
import { startCash } from '../../src/engine/shift/money';
import { DAY } from '../../src/engine/shift/types';
import { buildDb } from '../content/load';

const arg = (k: string, d: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const days = Number(arg('days', '14'));
const which = arg('hospital', 'city');
const seed = Number(arg('seed', '3'));
const { db } = buildDb();

/** Больница как у симулятора экономики (tools/sim/economy.ts): ночная смена, касса начала. */
function start() {
  const flow = { perHour: 0, auto: true as const };
  if (which === 'poly') {
    const p = siteOfPlan(db, db.sites!['site.polyclinic']);
    if (!p.ok) throw new Error(`поликлиника: помещение ${p.room} — ${p.error.kind}`);
    return newFlowShift(db, { seed, season: 'winter', hospital: hospitalOf(db, p.site), staff: withNightShift(db, p.site.rooms, p.staff), flow, economy: { cash: startCash(db, 'poly') } });
  }
  const rec = db.presets['preset.city'];
  const site = siteOfPreset(db, rec);
  return newFlowShift(db, { seed, season: 'winter', hospital: hospitalOf(db, site), staff: withNightShift(db, site.rooms, presetStaff(db, rec)), flow, economy: { cash: startCash(db, 'preset') } });
}

const s = start();
const kb = (x: unknown) => Math.round(JSON.stringify(x ?? null).length / 1024);
const t0 = s.t;
console.log(`${which}, зерно ${seed}: снимок движка в конце суток, КБ`);
for (let d = 1; d <= days; d++) {
  const end = t0 + d * DAY;
  while (s.t < end) apply(db, s, { kind: 'advance', seconds: Math.min(600, end - s.t) });
  const fields = Object.entries(s)
    .map(([k, v]) => [k, kb(v)] as const)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  const n = (o: object | undefined) => Object.keys(o ?? {}).length;
  console.log(
    `${String(d).padStart(2)} | ${String(kb(s)).padStart(5)} | ${fields.map(([k, v]) => `${k} ${v}`).join(', ')} | пациентов ${n(s.patients)}, путей ${n(s.journeys?.of)}, карт ушедших ${n(s.past)}`,
  );
}
