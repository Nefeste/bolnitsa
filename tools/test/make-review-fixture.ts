// Отпечатки прежнего, сразу считаемого разбора приёмов нанятых врачей (spec docs/specs/2026-10-engine-speed.md, ч. 1):
// по ним tools/test/review.test.ts проверяет, что разбор по требованию даёт то же до байта. Записаны движком до
// изменения (копия «Анамнеза» @ 96503ac); перезаписывать — только если медицина изменилась нарочно, тогда же и в «Анамнезе».
// bun tools/test/make-review-fixture.ts
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { apply } from '../../src/engine/shift/engine';
import { buildDb } from '../content/load';
import { CASES, hash, hiredClosed, liveUntil, startShift } from './scenario';

const { db } = buildDb();
const out = CASES.map(({ venue, seed }) => {
  const s = startShift(db, venue, seed);
  liveUntil(db, s, 12);
  const noon = hiredClosed(s);
  const atNoon = { count: noon.length, hash: hash(noon.map(p => [p.id, p.closed])) };
  liveUntil(db, s, 18);
  apply(db, s, { kind: 'closeDay' });
  const all = hiredClosed(s);
  console.log(venue, seed, 'в 12:00 закрыто нанятыми', atNoon.count, 'за день', all.length);
  return { venue, seed, atNoon, hired: all.length, closed: hash(s) };
});
writeFileSync(join(import.meta.dir, 'fixtures/eager-review.json'), `${JSON.stringify(out, null, 2)}\n`);
