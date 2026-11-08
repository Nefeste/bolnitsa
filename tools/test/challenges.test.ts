// Испытания (spec docs/specs/2026-11-challenges.md, часть 1): записи `content/challenges/`, их условия в движке — поток, волна,
// «ровно сто», ночь с 20:00, касса без кредита, показания без кассы — и итог (`src/sim/challenge.ts`). Без испытания всё — как
// прежде: банк предлагает кредит, показаний без кассы не считают.
import { describe, expect, test } from 'bun:test';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { db } from '../../src/content';
import { hospitalOf } from '../../src/engine/hospital/site';
import { POINTS } from '../../src/sim/shift';
import { walkInsOf } from '../../src/engine/shift/challenge';
import { apply, newFlowShift } from '../../src/engine/shift/engine';
import { offerOf, shortOf } from '../../src/engine/shift/money';
import type { ShiftPatient, ShiftState } from '../../src/engine/shift/types';
import { challengeEnd, challengeEndAt, challengeStart, unindicatedOf } from '../../src/sim/challenge';
import { buildDb, CONTENT_DIR } from '../content/load';
import { playOwn } from '../sim/doctor-player';

const H = 3600;
const ch = (id: string) => db.challenges![`challenge.${id}`];

/** Испытание, как его начнёт окно: больница начала и запись; поток и касса — из неё, переданные — не в счёт. */
function start(id: string, seed = 1): ShiftState {
  const c = ch(id);
  const h = challengeStart(db, c);
  const s = newFlowShift(db, { seed, season: 'summer', hospital: hospitalOf(db, h.site), staff: h.staff, flow: { perHour: 3 }, economy: { cash: 1 }, challenge: c.id });
  apply(db, s, { kind: 'site', cmd: { kind: 'done' } });
  return s;
}

function run(s: ShiftState, until: number) {
  while (s.t < until) apply(db, s, { kind: 'advance', seconds: Math.min(600, until - s.t) });
}

const cards = (s: ShiftState): ShiftPatient[] => [...Object.values(s.patients), ...(s.past ?? []).map(x => x.p)];

describe('испытания: записи', () => {
  test('пять испытаний по порядку экрана начала, у каждого — больница начала', () => {
    expect(Object.keys(db.challenges ?? {})).toEqual(['challenge.flu', 'challenge.hundred', 'challenge.night', 'challenge.debt', 'challenge.indicated']);
    for (const c of Object.values(db.challenges!)) {
      expect(c.name.ru.length).toBeGreaterThan(0);
      expect(c.name.en?.length ?? 0).toBeGreaterThan(0);
      expect(c.about.en?.length ?? 0).toBeGreaterThan(0);
      expect(challengeStart(db, c).site.rooms.length).toBeGreaterThan(0);
    }
  });

  test('конец: смена — в 20:00, ночь и неделя — за секунду до планёрки', () => {
    expect(challengeEndAt(ch('flu'))).toBe(20 * H);
    expect(challengeEndAt(ch('night'))).toBe(32 * H - 1);
    expect(challengeEndAt(ch('debt'))).toBe(176 * H - 1);
  });
});

describe('«Зимний грипп»: поток вдвое больше и волна', () => {
  const s = start('flu');
  run(s, challengeEndAt(ch('flu')));
  const walk = cards(s).filter(p => p.kind === 'walkIn');

  test('сезон, поток и касса — из записи, а не переданные', () => {
    expect(s.meta.challenge).toBe('challenge.flu');
    expect(s.meta.season).toBe('winter');
    expect(s.flow).toEqual({ perHour: 20 });
    expect(start('flu').economy?.cash).toBe(300_000);
    expect(s.meta.solo).toBeUndefined();
  });

  test('пришедших сами — около 250 за смену, с гриппом — около двух из пяти (без волны зимой — 15 %)', () => {
    expect(walk.length).toBeGreaterThan(190);
    expect(walk.length).toBeLessThan(320);
    const flu = walk.filter(p => p.patient.truth.conditions.some(c => c.id === 'cond.influenza')).length;
    expect(flu / walk.length).toBeGreaterThan(0.28);
    expect(flu / walk.length).toBeLessThan(0.55);
  });

  test('итог — по доле не принятых: пороги записи, «Пройдено» — не ниже «B»', () => {
    const end = challengeEnd(db, s)!;
    expect(end.arrived).toBe(walk.length);
    expect(end.seen).toBeLessThanOrEqual(end.arrived);
    expect(end.value).toBe(Math.round((1000 * (end.arrived - end.seen)) / end.arrived) / 10);
    expect(end.grade).toBe(end.value <= 3 ? 'A' : end.value <= 7 ? 'B' : end.value <= 15 ? 'C' : 'D');
    expect(end.passed).toBe(POINTS[end.grade] >= POINTS.B);
  });
});

describe('«Сто пациентов»: ровно сто', () => {
  test('пришедших сами — сто к концу смены, и больше никого', () => {
    const s = start('hundred');
    run(s, challengeEndAt(ch('hundred')));
    expect(walkInsOf(s)).toBe(100);
    run(s, 23 * H);
    expect(walkInsOf(s)).toBe(100);
    const end = challengeEnd(db, s)!;
    expect(end.arrived).toBe(100);
    expect(end.value).toBe(end.seen);
  });
});

describe('«Одна ночь»: с 20:00, вы один, сортируете вы', () => {
  const s = start('night');
  test('вы один и сортируете вы; кассы нет', () => {
    expect(s.meta.solo).toBe(true);
    expect(s.meta.sorts).toBe(true);
    expect(s.economy).toBeUndefined();
  });

  test('до 20:00 никого; ночью — только привезённые скорой', () => {
    run(s, 20 * H - 1);
    expect(cards(s).length).toBe(0);
    run(s, challengeEndAt(ch('night')));
    const night = cards(s);
    expect(night.length).toBeGreaterThan(4);
    expect(night.every(p => p.kind === 'ambulance' && p.arriveT >= 20 * H)).toBe(true);
  });

  test('итог — итог смены врача, красные по шкале в срок — для сведения: никого не позвали — не пройдено', () => {
    const end = challengeEnd(db, s)!;
    expect(end.shift).toBeUndefined();
    expect(end.grade).toBe('D');
    expect(end.reds!.total).toBe(cards(s).filter(p => p.scale?.triage === 'red').length);
    expect(end.passed).toBe(false);
  });
});

describe('«В долг»: касса в минусе, кредита нет, строить можно', () => {
  test('касса начала −1 000 000 ₽; банк кредита не предлагает, а стройка — до −1 500 000 ₽', () => {
    const s = start('debt');
    expect(s.economy!.cash).toBe(-1_000_000);
    expect(s.flow?.auto).toBe(true);
    run(s, 32 * H);
    expect(s.economy!.cash).toBeLessThan(-300_000);
    expect(offerOf(db, s)).toBeUndefined();
    expect(shortOf(db, s, 100_000)).toBe(0);
    expect(shortOf(db, s, 2_000_000)).toBeGreaterThan(0);
  });

  test('без испытания с той же кассой — банк предлагает кредит, а стройка ждёт денег', () => {
    const h = challengeStart(db, ch('debt'));
    const s = newFlowShift(db, { seed: 1, season: 'winter', hospital: hospitalOf(db, h.site), staff: h.staff, flow: { perHour: 0, auto: true }, economy: { cash: -1_000_000 } });
    apply(db, s, { kind: 'site', cmd: { kind: 'done' } });
    run(s, 32 * H);
    expect(offerOf(db, s)).toBeGreaterThan(0);
    expect(shortOf(db, s, 100_000)).toBeGreaterThan(0);
  });
});

describe('«Только по показаниям»: страховая проверяет ваши приёмы и без кассы', () => {
  test('показания назначенных — у ваших приёмов; итог — смена врача и не больше двух без показаний', () => {
    const s = start('indicated');
    expect(s.meta.solo).toBe(true);
    expect(s.economy).toBeUndefined();
    playOwn(db, s, 'rational', 12 * H);
    const mine = cards(s).filter(p => p.closed && !p.closed.by);
    expect(mine.length).toBeGreaterThan(3);
    expect(mine.some(p => (p.indicated ?? []).length > 0)).toBe(true);
    const end = challengeEnd(db, s)!;
    expect(end.unindicated).toBe(unindicatedOf(db, s));
    expect(end.shift?.overall).toBe(end.grade);
    expect(end.passed).toBe(POINTS[end.grade] >= POINTS.B && end.unindicated! <= 2);
  });

  test('без испытания смена врача показаний не считает: кассы нет', () => {
    const h = challengeStart(db, ch('indicated'));
    const s = newFlowShift(db, { seed: 1, season: 'winter', hospital: hospitalOf(db, h.site), staff: h.staff, flow: { perHour: 0, auto: true }, solo: true });
    apply(db, s, { kind: 'site', cmd: { kind: 'done' } });
    playOwn(db, s, 'rational', 12 * H);
    expect(cards(s).some(p => p.indicated !== undefined)).toBe(false);
    expect(challengeEnd(db, s)).toBeUndefined();
  });
});

describe('испытания: загрузчик', () => {
  test('главврачу нужна касса, у врача её нет, пороги — по порядку, волна — у своего потока', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bolnitsa-content-'));
    try {
      cpSync(CONTENT_DIR, dir, { recursive: true });
      const edit = (name: string, from: string, to: string) => {
        const file = join(dir, `challenges/${name}.yaml`);
        const text = readFileSync(file, 'utf8');
        if (!text.includes(from)) throw new Error(`в ${name}.yaml нет «${from}»`);
        writeFileSync(file, text.replace(from, to));
      };
      edit('flu', 'cash: 300000\n', '');
      edit('night', 'reds: 15\n', 'reds: 15\ncash: 1000\n');
      edit('hundred', 'grade: { by: seen, a: 97, b: 90, c: 75 }', 'grade: { by: seen, a: 90, b: 97, c: 75 }');
      edit('debt', 'cash: -1000000\n', 'cash: -1000000\nwave: { condition: cond.influenza, share: 40 }\n');
      const errors = buildDb(dir).errors.filter(e => e.startsWith('challenge.'));
      expect(errors).toEqual([
        'challenge.flu: у испытания главврача нужна касса начала',
        'challenge.hundred: пороги итога 90, 97, 75 не по порядку',
        'challenge.night: у испытания врача кассы нет',
        'challenge.debt: волна и «не больше стольких сами» — у своего потока, а поток — от больницы',
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);
});
