// Ускоренный вывод (spec docs/specs/2026-10-engine-speed.md, ч. 4) — те же числа до бита, что прежний
// (tools/test/reference/infer.ts — копия до ускорения): уверенность во всех болезнях и польза каждого обследования на
// каждом шаге разумного врача, у больных всех отделений, с записью к специалисту и без.
import { describe, expect, test } from 'bun:test';
import { db } from '../../src/content';
import { Rng } from '../../src/engine/core/rng';
import { complaintObservations, runExam } from '../../src/engine/med/exams';
import { generatePatient } from '../../src/engine/med/generate';
import { contextOf, expectedGain, gainBound, posterior, UNKNOWNS_KEEP } from '../../src/engine/med/infer';
import { runDoctor } from '../../src/engine/med/policy';
import * as ref from './reference/infer';

const DEPARTMENTS = ['dept.therapy', 'dept.surgery', 'dept.trauma', 'dept.neurology', 'dept.infectious'];
const SEASONS = ['winter', 'spring', 'summer', 'autumn'] as const;

describe('ускоренный вывод — те же числа', () => {
  test('уверенность, польза и граница пользы на каждом шаге — до бита', () => {
    const exams = Object.keys(db.exams).sort();
    const candidates = Object.keys(db.conditions).sort().filter(id => db.conditions[id].presenting && DEPARTMENTS.includes(db.conditions[id].department));
    let steps = 0;
    for (let i = 0; i < 120; i++) {
      const p = generatePatient(db, 9_300_000 + i, { department: DEPARTMENTS[i % DEPARTMENTS.length], departments: DEPARTMENTS, season: SEASONS[i % 4] });
      // каждый третий — записан к специалисту: болезни профиля вероятнее
      const prior = i % 3 === 0 ? { ids: candidates.filter((_, k) => k % 5 === i % 5), x: 4 } : undefined;
      const r = runDoctor(db, p, 'rational', Rng.seeded(p.seed).fork('speed'), { candidates, exams });
      const obs = complaintObservations(p);
      for (const e of [undefined, ...r.exams]) {
        if (e) obs.push(...runExam(db, p, e, Rng.seeded(p.seed).fork(`speed:${e}`)));
        const ctx = contextOf(db, p, obs, prior);
        const old = ref.contextOf(db, p, obs, prior);
        const now = posterior(db, candidates, obs, ctx);
        const was = ref.posterior(db, candidates, obs, old);
        expect(JSON.stringify(now)).toBe(JSON.stringify(was));
        const seen = new Set(obs.map(o => o.f));
        const g = exams.map(x => [expectedGain(db, x, now, ctx, seen), gainBound(db, x, now, ctx, seen)]);
        const h = exams.map(x => [ref.expectedGain(db, x, was, old, seen), ref.gainBound(db, x, was, old, seen)]);
        expect(JSON.stringify(g)).toBe(JSON.stringify(h));
        steps++;
      }
    }
    expect(steps).toBeGreaterThan(500);
  }, 300_000);

  // предел запомненного — на весь процесс: в процессе тестов баз много (свои базы файлов, копии `{ ...db, … }`), и с
  // пределом на каждую память копилась до предела числа отображений ядра (vm.max_map_count), а там `bun test` вставал
  test('неизвестных помнится не больше UNKNOWNS_KEEP на все базы сразу; забытое считается заново тем же', () => {
    const p = generatePatient(db, 9_400_000, { department: 'dept.therapy', departments: DEPARTMENTS, season: 'winter' });
    const obs = complaintObservations(p);
    const first = contextOf(db, p, obs).unknowns;
    expect(contextOf(db, p, obs).unknowns).toBe(first);
    for (let i = 0; i < UNKNOWNS_KEEP; i++) contextOf({ ...db }, p, obs);
    const again = contextOf(db, p, obs).unknowns;
    expect(again).not.toBe(first);
    expect(again).toEqual(first);
  });
});
