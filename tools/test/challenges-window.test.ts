// Испытания, часть 2 (spec docs/specs/2026-11-challenges.md): поток расчёта — начало «Одной ночи» в 20:00, часы не дальше конца
// испытания, итог — один раз; рекорды испытаний в хранилище страницы (src/app/challenges.ts).
import { describe, expect, test } from 'bun:test';
import { db } from '../../src/content';
import { hospitalOf } from '../../src/engine/hospital/site';
import { betterChallenge, parseChallenges, readChallenges, recordChallenge, writeChallenges } from '../../src/app/challenges';
import { challengeEndAt, challengeStart } from '../../src/sim/challenge';
import { createSim } from '../../src/sim/host';

const H = 3600;
const ch = (id: string) => db.challenges![`challenge.${id}`];

describe('испытание в потоке расчёта', () => {
  test('«Одна ночь»: часы сразу в 20:00, дальше конца не идут; итог — один раз, у его конца', () => {
    const c = ch('night');
    const h = challengeStart(db, c);
    const sim = createSim(db);
    const first = sim.handle({ kind: 'start', seed: 3, season: 'summer', hospital: hospitalOf(db, h.site), staff: h.staff, flow: { perHour: 9 }, economy: { cash: 5 }, challenge: c.id });
    expect(first.kind).toBe('slice');
    const saved = sim.handle({ kind: 'save' });
    if (saved.kind !== 'state') throw new Error(saved.kind);
    const s = saved.state;
    expect([s.t, s.meta.challenge, s.meta.solo, s.meta.sorts, s.economy, s.meta.season]).toEqual([20 * H, c.id, true, true, undefined, 'winter']);
    // смены врача с итогом в 20:00 здесь нет: итог — испытания
    const ends = [];
    for (let i = 0; i < 40; i++) {
      const out = sim.handle({ kind: 'tick', seconds: 3600, budgetMs: 200 });
      if (out.kind === 'slice') {
        expect(out.shift).toBeUndefined();
        if (out.challenge) ends.push(out.challenge);
      }
    }
    expect(s.t).toBe(challengeEndAt(c));
    expect(ends.length).toBe(1);
    expect(ends[0].id).toBe(c.id);
    expect(ends[0].arrived).toBeGreaterThan(0);
  }, 120_000);

  test('«Только по показаниям»: строка «Без показаний» — с начала, со своим пределом', () => {
    const c = ch('indicated');
    const h = challengeStart(db, c);
    const sim = createSim(db);
    const first = sim.handle({ kind: 'start', seed: 1, season: 'winter', hospital: hospitalOf(db, h.site), staff: h.staff, flow: { perHour: 0, auto: true }, challenge: c.id });
    expect(first.kind === 'slice' ? first.audit : undefined).toEqual({ n: 0, max: 2 });
  });
});

describe('рекорды испытаний', () => {
  const memory = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  };

  test('лучший — по оценке, при равной — по числу в его сторону: у доли не принятых — меньше', () => {
    const flu = ch('flu');
    const hundred = ch('hundred');
    expect(betterChallenge(flu, { grade: 'B', value: 5 }, { grade: 'B', value: 8 })).toBe(true);
    expect(betterChallenge(flu, { grade: 'B', value: 9 }, { grade: 'B', value: 8 })).toBe(false);
    expect(betterChallenge(hundred, { grade: 'B', value: 95 }, { grade: 'B', value: 92 })).toBe(true);
    expect(betterChallenge(hundred, { grade: 'C', value: 99 }, { grade: 'B', value: 90 })).toBe(false);
  });

  test('«пройдено» не забывается; чужое и испорченное — прочь; без хранилища — пусто', () => {
    const c = ch('debt');
    const one = recordChallenge({}, c, { grade: 'B', value: 10_000, passed: true, day: '2026-11-08' });
    expect(one.best).toBe(true);
    const two = recordChallenge(one.records, c, { grade: 'D', value: -400_000, passed: false, day: '2026-11-09' });
    expect(two.best).toBe(false);
    expect(two.records[c.id]).toEqual({ grade: 'B', value: 10_000, passed: true, day: '2026-11-08' });
    const store = memory();
    writeChallenges(two.records, store);
    expect(readChallenges(store)).toEqual(two.records);
    expect(parseChallenges('{"challenge.x":{"grade":"Z","value":1,"passed":true,"day":"d"},"other":{"grade":"A","value":1,"passed":true,"day":"d"}}')).toEqual({});
    expect(parseChallenges('не JSON')).toEqual({});
    expect(readChallenges(undefined)).toEqual({});
  });
});
