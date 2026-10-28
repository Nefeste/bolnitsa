// Разбор приёма нанятого врача по требованию (spec docs/specs/2026-10-engine-speed.md, ч. 1): тот же до байта, что
// прежний, считавшийся сразу при закрытии. Отпечатки прежнего — tools/test/fixtures/eager-review.json
// (tools/test/make-review-fixture.ts, движок до изменения).
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { db } from '../../src/content';
import { apply, reviewedCase, reviewsDue, settleReviews } from '../../src/engine/shift/engine';
import { CASES, hash, hiredClosed, liveUntil, startShift } from './scenario';

const eager = JSON.parse(readFileSync(join(import.meta.dir, 'fixtures/eager-review.json'), 'utf8')) as {
  venue: string; seed: number; atNoon: { count: number; hash: string }; hired: number; closed: string;
}[];

describe('разбор нанятого врача по требованию', () => {
  for (const c of CASES) {
    const want = eager.find(x => x.venue === c.venue && x.seed === c.seed)!;
    test(`${c.venue}, зерно ${c.seed}: прочитанный приём и итог дня — те же, что сразу`, () => {
      const s = startShift(db, c.venue, c.seed);
      liveUntil(db, s, 12);
      const noon = hiredClosed(s);
      expect(noon.length).toBe(want.atNoon.count);
      // разбор отложен — и не досчитан, пока его не попросили
      expect(reviewsDue(s)).toBe(noon.length);
      const before = hash(s);
      expect(hash(noon.map(p => [p.id, reviewedCase(db, s, p)]))).toBe(want.atNoon.hash);
      // прочитать — не значит изменить
      expect(hash(s)).toBe(before);
      liveUntil(db, s, 18);
      apply(db, s, { kind: 'closeDay' });
      expect(reviewsDue(s)).toBe(0);
      expect(hiredClosed(s).length).toBe(want.hired);
      expect(hash(s)).toBe(want.closed);
    }, 60_000);
  }

  test('досчёт по частям среди дня — тот же итог', () => {
    const c = CASES[0];
    const want = eager.find(x => x.venue === c.venue && x.seed === c.seed)!;
    const s = startShift(db, c.venue, c.seed);
    liveUntil(db, s, 11);
    // по три части разумного врача за раз — как в свободное время кадров
    let rounds = 0;
    for (;;) {
      let left = 3;
      rounds++;
      if (settleReviews(db, s, () => left-- > 0)) break;
    }
    expect(rounds).toBeGreaterThan(1);
    expect(reviewsDue(s)).toBe(0);
    liveUntil(db, s, 18);
    apply(db, s, { kind: 'closeDay' });
    expect(hash(s)).toBe(want.closed);
  }, 60_000);
});
