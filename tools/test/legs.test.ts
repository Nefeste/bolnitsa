// Переходы слоя «Пути пациентов» (spec docs/specs/2026-10-layers.md, часть 2): из путей движка (`s.journeys`) — откуда куда
// ходили, сколько раз и сколько шли. Поток расчёта шлёт их окну, только пока слой включён: сразу, потом не чаще раза в
// `LEGS_EVERY` и только изменившиеся; на ход смены слой не влияет.
import { describe, expect, test } from 'bun:test';
import { hospitalOf } from '../../src/engine/hospital/site';
import { siteOfPreset } from '../../src/engine/hospital/site-preset';
import { presetStaff } from '../../src/engine/hospital/staff';
import { newFlowShift } from '../../src/engine/shift/engine';
import type { Journey, Step } from '../../src/engine/shift/journey';
import type { Flow } from '../../src/engine/shift/types';
import { createSim } from '../../src/sim/host';
import { AMBULANCE, journeyLegs, legsOf, STREET } from '../../src/sim/legs';
import { type FromSim, LEGS_EVERY } from '../../src/sim/protocol';
import { buildDb } from '../content/load';
import { hash, liveUntil } from './scenario';

const { db } = buildDb();
// город игры — участок с двумя входами, как в окне (src/engine/hospital/site-preset.ts)
const preset = db.presets['preset.city'];
const city = { hospital: hospitalOf(db, siteOfPreset(db, preset)), staff: presetStaff(db, preset) };
const CITY: Flow = { perHour: 6, ambulancePerHour: 1 };

/** Переходы одного пути строками «откуда>куда» и «:в пути», если оно известно; `reception` null — регистратуры нет. */
function legs(j: Journey, mine?: string, reception: string | null = 'rec'): string[] {
  const out: string[] = [];
  journeyLegs(j, mine, reception ?? undefined, (from, to, walk) => out.push(`${from}>${to}${walk !== undefined ? `:${walk}` : ''}`));
  return out;
}
const J = (steps: Step[], x: Partial<Journey> = {}): Journey => ({ kind: 'walkIn', at: 0, steps, ...x });
const doctor = (t: number, room?: string, by?: string): Step => ({ t, k: 'doctor', ...(by !== undefined ? { by } : {}), ...(room !== undefined ? { room } : {}) });
const exam = (t: number, room: string, at: number, end: number, back: number, x: Partial<Extract<Step, { k: 'exam' }>> = {}): Step => ({
  t, k: 'exam', exam: 'exam.cbc', room, at, start: at, end, back, ready: end, ...x,
});

describe('переходы одного пути', () => {
  test('пришёл сам: с улицы в регистратуру, к врачу, на обследование и обратно, домой — к выходу', () => {
    const j = J([{ t: 10, k: 'queue', why: 'busy', ahead: 0 }, doctor(100, 'o1', 's1'), exam(200, 'lab', 260, 500, 570), doctor(600, 'o1', 's1')], {
      end: { t: 900, how: 'home' },
    });
    expect(legs(j)).toEqual(['>rec', 'rec>o1', 'o1>lab:60', 'lab>o1:70', 'o1>']);
  });

  test('скорая — от своего входа; лёг — от врача на койку по перевозке', () => {
    const j = J([doctor(50, 'er', 's2')], { kind: 'ambulance', end: { t: 400, how: 'stay', room: 'w1' }, bed: { t: 400, from: 'er', to: 'w1' } });
    expect(legs(j)).toEqual(['*>er', 'er>w1']);
    expect(AMBULANCE).toBe('*');
    expect(STREET).toBe('');
  });

  test('у вас — ваш кабинет; без регистратуры — с улицы прямо к врачу; к другому врачу — переход; лёг без перевозки — в палату', () => {
    expect(legs(J([doctor(10)], { end: { t: 90, how: 'away' } }), 'mine')).toEqual(['>rec', 'rec>mine', 'mine>']);
    expect(legs(J([doctor(10, 'o1', 's1'), doctor(300, 'o2', 's3')], { end: { t: 900, how: 'stay', room: 'w2' } }), undefined, null)).toEqual([
      '>o1', 'o1>o2', 'o2>w2',
    ]);
    // лёг в той же комнате (смотровая скорой) — не переход
    expect(legs(J([doctor(10, 'er', 's2')], { kind: 'ambulance', end: { t: 90, how: 'stay', room: 'er' } }))).toEqual(['*>er']);
  });

  test('лежачего на обследование везли: в пути — с часа, когда за ним пришли; обследование в том же кабинете и без возврата', () => {
    const j = J([doctor(10, 'er', 's2'), exam(100, 'ct', 400, 700, 760, { gurney: { pick: 340 } }), exam(800, 'er', 800, 900, 900), exam(1000, 'xr', 1030, 1100, 1100)], {
      kind: 'ambulance',
    });
    expect(legs(j)).toEqual(['*>er', 'er>ct:60', 'ct>er:60', 'er>xr:30']);
  });

  test('не дождался и не принят — переходов нет: где он ждал, путь не пишет; ушедший после врача — без выхода', () => {
    expect(legs(J([{ t: 10, k: 'queue', why: 'busy', ahead: 3 }], { end: { t: 900, how: 'left' } }))).toEqual([]);
    expect(legs(J([], { end: { t: 900, how: 'unseen' } }))).toEqual([]);
    expect(legs(J([doctor(10, 'o1', 's1')], { end: { t: 900, how: 'left' } }))).toEqual(['>rec', 'rec>o1']);
    // у вас, а кабинета нет — врача не было
    expect(legs(J([doctor(10)], { end: { t: 90, how: 'home' } }))).toEqual([]);
  });
});

describe('переходы смены', () => {
  const s = newFlowShift(db, { seed: 3, season: 'winter', hospital: city.hospital, staff: city.staff, flow: CITY });
  liveUntil(db, s, 14);
  const all = legsOf(s, undefined);
  const rooms = new Set(s.hospital!.rooms.map(r => r.id));
  const reception = s.hospital!.rooms.find(r => r.type === 'room.reception')!.id;
  const n = (from: string, to: string) => all.find(l => l.from === from && l.to === to)?.n ?? 0;

  test('городская больница к 14:00: с улицы в регистратуру — каждый пришедший сам и принятый; концы — помещения больницы или входы', () => {
    const walkIns = Object.values(s.journeys!.of).filter(j => j.kind !== 'ambulance' && j.steps.some(x => x.k === 'doctor' && x.room !== undefined)).length;
    expect(walkIns).toBeGreaterThan(10);
    expect(n(STREET, reception)).toBe(walkIns);
    for (const l of all) {
      expect(l.from === STREET || l.from === AMBULANCE || rooms.has(l.from)).toBe(true);
      expect(l.to === STREET || rooms.has(l.to)).toBe(true);
      expect(l.from).not.toBe(l.to);
      expect(l.n).toBeGreaterThan(0);
      expect(l.walked).toBeLessThanOrEqual(l.n);
      expect(l.walk).toBeGreaterThanOrEqual(0);
    }
    // одна пара — одна строка
    expect(new Set(all.map(l => `${l.from}>${l.to}`)).size).toBe(all.length);
    // к обследованию и обратно — со временем в пути
    expect(all.some(l => l.walked > 0 && l.walk / l.walked > 0)).toBe(true);
    expect(all.some(l => l.to === STREET)).toBe(true);
  });

  test('не поток для ПК (нет путей) — пусто', () => {
    expect(legsOf({ ...s, journeys: undefined }, undefined)).toEqual([]);
  });
});

describe('поток расчёта', () => {
  const start = { kind: 'start', seed: 3, season: 'winter', hospital: city.hospital, staff: city.staff, flow: CITY } as const;
  const legsIn = (r: FromSim) => (r.kind === 'slice' ? r.legs : undefined);

  test('слой выключен — переходов в срезе нет; включили — сразу; дальше — не чаще раза в LEGS_EVERY и только новые; выключили — нет', () => {
    const sim = createSim(db);
    sim.handle(start);
    let sent = 0;
    for (let i = 0; i < (4 * 3600) / 60; i++) if (legsIn(sim.handle({ kind: 'tick', seconds: 60, budgetMs: 5000 }))) sent++;
    expect(sent).toBe(0);
    const first = legsIn(sim.handle({ kind: 'legs', on: true }));
    expect(first?.length).toBeGreaterThan(0);
    // в каждом срезе — минута игры: за час — не больше 3600 / LEGS_EVERY посылок
    const at: number[] = [];
    for (let i = 0; i < 60; i++) {
      const r = sim.handle({ kind: 'tick', seconds: 60, budgetMs: 5000 });
      if (legsIn(r)) at.push(i);
    }
    expect(at.length).toBeGreaterThan(0);
    expect(at.length).toBeLessThanOrEqual(3600 / LEGS_EVERY);
    for (let k = 1; k < at.length; k++) expect((at[k] - at[k - 1]) * 60).toBeGreaterThanOrEqual(LEGS_EVERY);
    sim.handle({ kind: 'legs', on: false });
    sent = 0;
    for (let i = 0; i < 60; i++) if (legsIn(sim.handle({ kind: 'tick', seconds: 60, budgetMs: 5000 }))) sent++;
    expect(sent).toBe(0);
  });

  test('слой не меняет смену: с ним и без него — то же состояние', () => {
    const run = (on: boolean) => {
      const sim = createSim(db);
      sim.handle(start);
      if (on) sim.handle({ kind: 'legs', on: true });
      for (let i = 0; i < (3 * 3600) / 60; i++) sim.handle({ kind: 'tick', seconds: 60, budgetMs: 5000 });
      for (let k = 0; k < 100_000; k++) {
        const r = sim.handle({ kind: 'tick', seconds: 0, budgetMs: 5000 });
        if (r.kind === 'slice' && r.lag === 0) break;
      }
      const saved = sim.handle({ kind: 'save' });
      if (saved.kind !== 'state') throw new Error(saved.kind);
      return hash(saved.state);
    };
    expect(run(true)).toBe(run(false));
  });
});
