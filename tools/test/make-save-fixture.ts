// Образец сохранения (spec docs/specs/2026-10-saves.md, «Версия схемы и миграции»): поликлиника, поток от больницы,
// первые сутки к 10:30 — вы позвали пациента, и он идёт к вам. Пишется один раз на версию схемы и больше не меняется:
// тест (saves.test.ts) грузит его новыми версиями игры — через миграции — и играет дальше.
//   bun tools/test/make-save-fixture.ts 0.7.0
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { db } from '../../src/content';
import { hospitalOf } from '../../src/engine/hospital/site';
import { siteOfPlan } from '../../src/engine/hospital/site-plan';
import { SAVE_SCHEMA } from '../../src/engine/shift/migrate';
import { cashNow, startCash } from '../../src/engine/shift/money';
import { apply, newFlowShift } from '../../src/engine/shift/engine';
import { pack } from '../../src/sim/packing';

const version = process.argv[2];
if (!version) throw new Error('версия: bun tools/test/make-save-fixture.ts 0.7.0');
const plan = siteOfPlan(db, db.sites!['site.polyclinic']);
if (!plan.ok) throw new Error('поликлиника не строится');
const s = newFlowShift(db, { seed: 1, season: 'winter', hospital: hospitalOf(db, plan.site), staff: plan.staff, flow: { perHour: 0, auto: true }, economy: { cash: startCash(db, 'poly') } });
while (s.t < 10.5 * 3600) apply(db, s, { kind: 'advance', seconds: 60 });
const id = s.queue.find(x => !s.patients[x].by && s.patients[x].kind !== 'ambulance');
if (id) apply(db, s, { kind: 'call', id });
const cash = cashNow(s);
const bytes = await pack({
  schema: SAVE_SCHEMA,
  meta: { kind: 'manual', savedAt: '2026-10-18T12:00:00.000Z', version, start: 'poly', day: s.day, t: s.t, ...(cash !== undefined ? { cash } : {}) },
  view: { camera: { x: 30, z: 20, half: 18, yaw: Math.PI / 4, projection: 'persp' }, level: 'student', autopause: true },
  state: s,
});
const file = join(import.meta.dir, 'fixtures', 'saves', `${version}.save`);
writeFileSync(file, bytes);
console.log(`${file}: ${Math.round(bytes.length / 1024)} КБ, схема ${SAVE_SCHEMA}, день ${s.day}, ${Math.floor(s.t / 3600) % 24}:${String(Math.floor(s.t / 60) % 60).padStart(2, '0')}, пациентов ${Object.keys(s.patients).length}${id ? `, позвали ${id}` : ''}`);
