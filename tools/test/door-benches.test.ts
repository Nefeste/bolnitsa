// Скамейки у дверей кабинетов (spec docs/specs/2026-10-door-benches.md; ответ владельца 24.10.2026, #59): скамья коридора не
// дальше `inflow.bench` шагов от клетки перед дверью кабинета — у двери, на ней один человек. Кому нет места в своём зале,
// садится у двери на свободную — терпение как есть; свободной нет — стоит, вдвое меньше. Скамью ставит игрок: только в
// коридоре, не перед дверью и входом, не перекрывая проход. Снесли — сидевший встаёт, терпение не меняется.
import { describe, expect, test } from 'bun:test';
import { db } from '../../src/content';
import type { ContentDb } from '../../src/content/types';
import { checkBench, emptySite, hospitalOf, planOfSite, priceOf, refundOf, type Site } from '../../src/engine/hospital/site';
import { siteOfPlan } from '../../src/engine/hospital/site-plan';
import { siteOfPreset } from '../../src/engine/hospital/site-preset';
import { presetStaff } from '../../src/engine/hospital/staff';
import { apply, hospitalCtx, newFlowShift } from '../../src/engine/shift/engine';
import { cashNow, startCash } from '../../src/engine/shift/money';
import { sliceOf } from '../../src/engine/shift/slice';
import type { ShiftState } from '../../src/engine/shift/types';
import { doorBenches } from '../../src/engine/shift/walking';
import { layoutOf } from '../../src/render/layout';
import { type Anchors, Places } from '../../src/render/place';
import { buildProto, FLOW, hash, liveTo, site } from './site-kit';

const rec = db.presets['preset.city'];
const citySite = siteOfPreset(db, rec);
const cityStaff = presetStaff(db, rec);
const city = (base: ContentDb, seed: number, s: Site = citySite) =>
  newFlowShift(base, { seed, season: 'winter', hospital: hospitalOf(base, s), staff: cityStaff, flow: FLOW });
/** Без скамеек у дверей и без своего зала: стоят, только когда полна вся больница, — терпение как есть. */
const plain: ContentDb = { ...db, inflow: { ...db.inflow!, hall: undefined, bench: undefined } };
const cityPlan = planOfSite(db, citySite);
const W = cityPlan.grid.w;
const at = (x: number, y: number) => y * W + x;
const officeAt = (x: number, y: number) => cityPlan.rooms.find(r => r.type === 'room.office' && r.x === x && r.y === y)!.id;

/** Первый шаг ожидания в пути пришедшего сам: стоял ли у двери и сел ли там на скамью. */
const firstQueue = (s: ShiftState, id: string) => s.journeys?.of[id]?.steps.find(x => x.k === 'queue') as { full?: true; far?: number; bench?: true } | undefined;

/** Терпение каждого пришедшего сам и стоял ли он — в минуту, когда его видно в больнице (это не меняется). */
function patienceOf(base: ContentDb, s: ShiftState, until: number, each?: (s: ShiftState) => void): Map<string, { patience: number; stood: boolean }> {
  const seen = new Map<string, { patience: number; stood: boolean }>();
  while (s.t < until) {
    apply(base, s, { kind: 'advance', seconds: 60 });
    for (const p of Object.values(s.patients)) if (p.kind === 'walkIn' && p.regAt !== undefined && !seen.has(p.id)) seen.set(p.id, { patience: p.patience, stood: p.stands !== undefined });
    each?.(s);
  }
  return seen;
}

describe('скамейки у дверей кабинетов', () => {
  test('число — 3 шага', () => {
    expect(db.inflow?.bench).toBe(3);
  });

  test('скамьи у двери — не дальше 3 шагов по коридору от клетки перед дверью, ближние раньше', () => {
    // гастроэнтеролог: две скамьи напротив двери (40, 6)
    expect(doorBenches(cityPlan, officeAt(37, 0), 3)).toEqual([at(40, 9), at(41, 9)]);
    // эндокринолог и инфекционист — пары вдоль стены
    expect(doorBenches(cityPlan, officeAt(44, 0), 3)).toEqual([at(46, 7), at(45, 7)]);
    expect(doorBenches(cityPlan, officeAt(46, 10), 3)).toEqual([at(51, 9), at(52, 9)]);
    // ваш: пара вдоль стены и скамья зала ожидания напротив; следующая скамья ряда — в 4 шагах
    expect(doorBenches(cityPlan, officeAt(10, 0), 3)).toEqual([at(12, 7), at(11, 7), at(12, 9)]);
    expect(doorBenches(cityPlan, officeAt(10, 0), 4)).toContain(at(11, 9));
  });

  test('городская: нет места в своём зале — садится на свободную скамью у двери, терпение как есть; заняты — стоит, вдвое меньше', () => {
    let sat = 0;
    let stood = 0;
    for (const seed of [1, 2]) {
      const s = city(db, seed);
      const mine = patienceOf(db, s, 13 * 3600);
      // тот же человек без своего зала и скамеек — терпение как есть, если не стоял и там (полна вся больница)
      const base = patienceOf(plain, city(plain, seed), 13 * 3600);
      for (const [id, { patience }] of mine) {
        const q = firstQueue(s, id);
        const was = base.get(id);
        if (!q || (!q.full && q.far === undefined) || !was || was.stood || was.patience === 0) continue;
        if (q.bench) {
          expect(patience).toBe(was.patience);
          sat++;
        } else {
          expect(patience).toBe(Math.round(was.patience / 2));
          stood++;
        }
      }
    }
    expect(sat).toBeGreaterThan(5);
    expect(stood).toBeGreaterThan(5);
  }, 120_000);

  test('на скамье — один; сидящий ждёт у той двери, у которой она стоит; в срезе — его скамья', () => {
    // скамья (48, 9) — у дверей эндокринолога и инфекциониста сразу: их пары убраны
    const s = city(db, 3);
    for (const [x, y] of [[45, 7], [46, 7], [51, 9], [52, 9]] as const) site(db, s, { kind: 'undecor', x, y });
    site(db, s, { kind: 'bench', x: 48, y: 9 });
    const plan = hospitalCtx(db, s).plan;
    expect(doorBenches(plan, officeAt(44, 0), 3)).toEqual([at(48, 9)]);
    expect(doorBenches(plan, officeAt(46, 10), 3)).toEqual([at(48, 9)]);
    let held = 0;
    patienceOf(db, s, 15 * 3600, st => {
      const sitting = Object.values(st.patients).filter(p => p.bench !== undefined && p.status === 'waiting' && p.next !== undefined);
      expect(new Set(sitting.map(p => p.bench)).size).toBe(sitting.length);
      const pl = hospitalCtx(db, st).plan;
      for (const p of sitting) expect(doorBenches(pl, p.next!, 3)).toContain(p.bench!);
      if (sitting.length) {
        held++;
        const slice = sliceOf(st);
        for (const p of sitting) {
          const x = slice.people.find(q => q.id === p.id);
          if (x?.doing === 'waiting') expect(x.bench).toBe(p.bench);
        }
      }
    });
    expect(held).toBeGreaterThan(30);
  }, 120_000);

  test('снесли скамью — сидевший ждёт у двери стоя, терпение не меняется', () => {
    const s = city(db, 1);
    let p = undefined as ShiftState['patients'][string] | undefined;
    while (!p && s.t < 14 * 3600) {
      apply(db, s, { kind: 'advance', seconds: 60 });
      p = Object.values(s.patients).find(x => x.bench !== undefined && x.status === 'waiting');
    }
    expect(p).toBeDefined();
    const patience = p!.patience;
    const cell = p!.bench!;
    site(db, s, { kind: 'undecor', x: cell % W, y: Math.floor(cell / W) });
    expect(p!.bench).toBeUndefined();
    expect(p!.patience).toBe(patience);
    expect(p!.next).toBeDefined();
    expect(sliceOf(s).people.find(x => x.id === p!.id)?.bench).toBeUndefined();
  }, 60_000);

  test('без числа — у дверей стоят, как до скамеек', () => {
    const none: ContentDb = { ...db, inflow: { ...db.inflow!, bench: undefined } };
    const s = city(none, 2);
    liveTo(none, s, 12);
    expect(Object.values(s.patients).filter(p => p.stands).length).toBeGreaterThan(3);
    expect(Object.values(s.patients).some(p => p.bench !== undefined)).toBe(false);
  }, 60_000);

  test('при шаге 60 и 13 с — те же сидящие и то же состояние', () => {
    const a = city(db, 5);
    const b = city(db, 5);
    liveTo(db, a, 12);
    liveTo(db, b, 12, 13);
    expect(Object.values(a.patients).some(p => p.bench !== undefined)).toBe(true);
    expect(hash(b)).toBe(hash(a));
  }, 120_000);
});

describe('скамья в стройке', () => {
  test('только в коридоре, не перед дверью и не на другой скамье; 800 ₽; снос возвращает часть; отмена', () => {
    // с кассой (spec docs/specs/2026-10-economy.md): поток от больницы
    const s = newFlowShift(db, { seed: 1, season: 'winter', hospital: hospitalOf(db, emptySite()), staff: [], flow: { perHour: 0, auto: true }, economy: { cash: startCash(db, 'empty') } });
    buildProto(db, s);
    const cash = () => cashNow(s)!;
    const before = cash();
    expect(site(db, s, { kind: 'bench', x: 12, y: 14 }).cost).toBe(priceOf(db, 'bench'));
    expect(priceOf(db, 'bench')).toBe(800);
    expect(cash()).toBe(before - 800);
    expect(s.hospital!.site!.decor).toContainEqual({ kind: 'bench', x: 12, y: 14 });
    expect(site(db, s, { kind: 'bench', x: 12, y: 14 }, false).error).toEqual({ kind: 'occupied', item: 'bench' });
    // в регистратуре, за стенами, перед дверью кабинета (дверь — посередине нижней стены, 23 × 12)
    expect(site(db, s, { kind: 'bench', x: 8, y: 9 }, false).error).toEqual({ kind: 'corridorOnly' });
    expect(site(db, s, { kind: 'bench', x: 2, y: 2 }, false).error).toEqual({ kind: 'outside' });
    expect(site(db, s, { kind: 'bench', x: 23, y: 13 }, false).error).toEqual({ kind: 'doorway' });
    const back = site(db, s, { kind: 'undecor', x: 12, y: 14 });
    expect(back.cost).toBe(-refundOf(db, 800));
    expect(cash()).toBe(before - 800 + refundOf(db, 800));
    expect(s.hospital!.site!.decor).toHaveLength(0);
    site(db, s, { kind: 'undo' });
    expect(s.hospital!.site!.decor).toContainEqual({ kind: 'bench', x: 12, y: 14 });
    expect(cash()).toBe(before - 800);
    expect(site(db, s, { kind: 'undecor', x: 13, y: 14 }, false).error).toEqual({ kind: 'nothing' });
  });

  test('не перекрывает проход: угол коридора закрыть нельзя', () => {
    let st = emptySite();
    const b = st.inside[0];
    const [cx, cy] = [b.x, b.y + b.h - 1];
    expect(checkBench(db, st, cx + 1, cy).ok).toBe(true);
    st = { ...st, decor: [{ kind: 'bench', x: cx + 1, y: cy }] };
    // вторая скамья отрезала бы угловую клетку
    expect(checkBench(db, st, cx, cy - 1)).toEqual({ ok: false, error: { kind: 'blocks' } });
    // растение проходу не мешает, как на карте
    st = { ...st, decor: [{ kind: 'plant', x: cx + 1, y: cy }] };
    expect(checkBench(db, st, cx, cy - 1).ok).toBe(true);
  });

  test('готовые больницы: скамьи стоят по правилам игрока, у каждого кабинета врача — не меньше двух', () => {
    const poly = siteOfPlan(db, db.sites!['site.polyclinic']);
    if (!poly.ok) throw new Error('поликлиника не строится');
    for (const st of [citySite, poly.site]) {
      const benches = st.decor.filter(d => d.kind === 'bench');
      expect(benches.length).toBeGreaterThan(7);
      for (const d of benches) expect(checkBench(db, { ...st, decor: st.decor.filter(x => x !== d) }, d.x, d.y)).toEqual({ ok: true, cost: 800 });
      const plan = planOfSite(db, st);
      for (const r of plan.rooms) if (r.type === 'room.office') expect(doorBenches(plan, r.id, db.inflow!.bench!).length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('скамьи у дверей на карте', () => {
  const layout = layoutOf(db, cityPlan, citySite.decor);
  // посадочные места — у стульев и скамей; сама мебель здесь не нужна
  const anchors: Anchors = { seats: layout.things.map(t => (t.kind === 'bench' || t.kind === 'chair' ? { x: t.cell[0] + 0.5, y: 0.45, z: t.cell[1] + 0.5, yaw: 0 } : undefined)), lies: [] };
  const room = cityPlan.rooms.findIndex(r => r.id === officeAt(44, 0));
  const seat = (c: number) => `seat:${c}`;

  test('посаженный движком — на своей скамье; остальным у двери — свободные, кто сел, тот сидит; не хватило — стоят', () => {
    const places = new Places(layout, anchors, 3);
    const spot = (key: string) => places.spot({ key, doing: 'waiting', room, bed: -1 }, new Set());
    places.sync([{ key: 'a', room }, { key: 'b', room, bench: at(45, 7) }], []);
    expect(spot('b').key).toBe(seat(at(45, 7)));
    expect(spot('a').key).toBe(seat(at(46, 7)));
    // третий — стоит у двери; первые сидят, где сидели
    places.sync([{ key: 'a', room }, { key: 'b', room, bench: at(45, 7) }, { key: 'c', room }], []);
    expect(spot('a').key).toBe(seat(at(46, 7)));
    expect(spot('c').pose).toBe('stand');
    expect(places.doorSeat('c')).toBe(-1);
    // движок посадил нового на скамью, где сидел «a», — «a» встаёт
    places.sync([{ key: 'a', room }, { key: 'd', room, bench: at(46, 7) }], []);
    expect(spot('d').key).toBe(seat(at(46, 7)));
    expect(spot('a').key).toBe(seat(at(45, 7)));
  });

  test('ждущие обследования не садятся на скамью, занятую у двери', () => {
    const places = new Places(layout, anchors, 3);
    places.sync([{ key: 'a', room, bench: at(46, 7) }, { key: 'b', room, bench: at(45, 7) }], ['x']);
    const x = places.spot({ key: 'x', doing: 'examQueue', room: -1, bed: -1 }, new Set());
    expect([seat(at(46, 7)), seat(at(45, 7))]).not.toContain(x.key);
  });

  test('без числа — у дверей стоят', () => {
    const places = new Places(layout, anchors);
    places.sync([{ key: 'a', room }], []);
    expect(places.spot({ key: 'a', doing: 'waiting', room, bed: -1 }, new Set()).pose).toBe('stand');
  });
});
