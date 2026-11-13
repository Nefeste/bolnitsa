// Песочница, часть 2 (spec docs/specs/2026-11-sandbox.md): участок S, M или L с пустым корпусом; «Корпус» — пристроить
// прямоугольник к стоящему корпусу и снести пустую часть; «Вход» — перенести главный вход или вход скорой. Только в песочнице:
// у сценария и испытания здание задано.
import { describe, expect, test } from 'bun:test';
import { db } from '../../src/content';
import {
  addRoom, addShell, checkEntrance, checkShell, checkUnshell, EMPTY_LOT, emptySite, ENTRANCE_PRICE, hospitalOf, LOTS, mapOf, moveEntrance, removeShell,
  SHELL_CELL, shellRect, type Site, subtractRect,
} from '../../src/engine/hospital/site';
import { onlyDeptsChanged } from '../../src/engine/hospital/departments';
import { apply, newFlowShift } from '../../src/engine/shift/engine';
import { cashNow } from '../../src/engine/shift/money';
import type { Notice, ShiftState } from '../../src/engine/shift/types';

const CELL_FLOOR_OK = (site: Site, x: number, y: number) => mapOf(site).inside[y * site.w + x] === 1;
const insideCount = (site: Site) => mapOf(site).inside.reduce((a, b) => a + b, 0);

describe('участки песочницы', () => {
  test('M — пустое здание, как прежде, до байта; S и L — свои размеры, вход посередине южной стены, скорая — в восточной', () => {
    expect(emptySite(LOTS.M)).toEqual(emptySite());
    expect(LOTS.M).toBe(EMPTY_LOT);
    for (const size of ['S', 'M', 'L'] as const) {
      const lot = LOTS[size];
      const site = emptySite(lot);
      expect([site.w, site.h]).toEqual([lot.w, lot.h]);
      const b = lot.building;
      // главный вход — на южной стене, внутри над ним — пол, снаружи под ним — улица
      for (const [x, y] of site.main) {
        expect(y).toBe(b.y + b.h - 1);
        expect(CELL_FLOOR_OK(site, x, y - 1)).toBe(true);
        expect(CELL_FLOOR_OK(site, x, y)).toBe(false);
      }
      const mid = site.main[0][0] + 0.5;
      expect(Math.abs(mid - (b.x + b.w / 2 - 0.5))).toBeLessThanOrEqual(1);
      for (const [x] of site.ambulance) expect(x).toBe(b.x + b.w - 1);
    }
    expect([LOTS.S.w, LOTS.S.h, LOTS.L.w, LOTS.L.h]).toEqual([40, 30, 90, 60]);
  });
});

describe('«Корпус»', () => {
  const L = () => emptySite(LOTS.L);

  test('пристройка вплотную к стене — вместе со стеной, одно здание; цена — новые клетки', () => {
    const site = L();
    const b = LOTS.L.building;
    // к северу от корпуса: прямоугольник до стены, не задевая её
    const r = { x: b.x + 2, y: b.y - 8, w: 20, h: 8 };
    expect(shellRect(site, r)).toEqual({ ...r, h: 9 });
    const c = checkShell(db, site, r);
    expect(c.ok).toBe(true);
    const fresh = 20 * 9;
    if (c.ok) expect(c.cost).toBe(fresh * SHELL_CELL);
    const d = addShell(db, site, r);
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(insideCount(d.site)).toBe(insideCount(site) + fresh);
    expect(d.site.shell).toBe(fresh);
    // пол пристройки и бывшей стены — внутри здания, до них доходят от главного входа
    const m = mapOf(d.site);
    expect(m.reach[(b.y - 5) * m.w + (b.x + 10)]).toBe(1);
    expect(m.reach[b.y * m.w + (b.x + 10)]).toBe(1);
  });

  test('отказы: мала, за краем участка, в стороне от здания, ничего нового, на входе', () => {
    const site = L();
    const b = LOTS.L.building;
    const err = (r: { x: number; y: number; w: number; h: number }) => {
      const c = checkShell(db, site, r);
      return c.ok ? 'ok' : c.error.kind;
    };
    expect(err({ x: b.x + 2, y: b.y - 3, w: 2, h: 3 })).toBe('small');
    expect(err({ x: 0, y: b.y - 6, w: 10, h: 6 })).toBe('outside');
    expect(err({ x: 70, y: 2, w: 10, h: 10 })).toBe('apart');
    expect(err({ x: b.x + 2, y: b.y + 2, w: 10, h: 10 })).toBe('nothing');
    // под южной стеной, где главный вход: пристройка закрыла бы его
    const [mx] = site.main[0];
    const c = checkShell(db, site, { x: mx - 3, y: b.y + b.h, w: 8, h: 4 });
    expect(c.ok ? 'ok' : c.error).toEqual({ kind: 'overlap', what: 'entrance' });
  });

  test('снести пустую часть: двор внутри — без денег; пристройку — половина её цены назад; отказы', () => {
    const site = L();
    const b = LOTS.L.building;
    const yard = { x: b.x + 20, y: b.y + 8, w: 4, h: 4 };
    const c = checkUnshell(db, site, yard);
    expect(c.ok).toBe(true);
    if (c.ok) expect(c.cost).toBe(0);
    const d = removeShell(db, site, yard);
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(insideCount(d.site)).toBe(insideCount(site) - 16);
    expect(CELL_FLOOR_OK(d.site, yard.x + 1, yard.y + 1)).toBe(false);
    // пристроили — и снесли то же: половина цены назад, клетки — как были
    const wing = { x: b.x + 2, y: b.y - 8, w: 20, h: 8 };
    const added = addShell(db, site, wing);
    if (!added.ok) throw new Error('пристройка');
    const back = removeShell(db, added.site, shellRect(site, wing));
    expect(back.ok).toBe(true);
    if (back.ok) {
      expect(back.cost).toBe(-Math.floor((20 * 9 * SHELL_CELL * db.economy.refund) / 100));
      expect(back.site.shell).toBeUndefined();
    }
    // полосой во всю высоту здание распалось бы на две части
    const split = checkUnshell(db, site, { x: b.x + 20, y: b.y, w: 2, h: b.h });
    expect(split.ok ? 'ok' : split.error).toEqual({ kind: 'cutsOff' });
    // помещение мешает
    const room = addRoom(db, site, 'room.office', { x: b.x + 4, y: b.y + 4, w: 8, h: 7 });
    if (!room.ok) throw new Error('кабинет');
    const busy = checkUnshell(db, room.site, { x: b.x + 5, y: b.y + 5, w: 2, h: 2 });
    expect(busy.ok ? 'ok' : busy.error.kind).toBe('overlap');
    // клетку прямо за главным входом не снести: вход повис бы
    const [mx, my] = site.main[0];
    const door = checkUnshell(db, site, { x: mx, y: my - 1, w: 1, h: 1 });
    expect(door.ok ? 'ok' : door.error).toEqual({ kind: 'overlap', what: 'entrance' });
  });

  test('вычитание прямоугольника — те же клетки, что без него', () => {
    const rects = [{ x: 2, y: 2, w: 10, h: 6 }, { x: 8, y: 6, w: 6, h: 6 }];
    const cut = { x: 5, y: 4, w: 6, h: 5 };
    const cells = (rs: { x: number; y: number; w: number; h: number }[]) => {
      const set = new Set<string>();
      for (const r of rs) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) set.add(`${x},${y}`);
      return set;
    };
    const want = new Set([...cells(rects)].filter(k => !cells([cut]).has(k)));
    expect(cells(subtractRect(rects, cut))).toEqual(want);
  });
});

describe('«Вход»', () => {
  test('главный — на северную стену S: пол внутри, улица снаружи; цена — ENTRANCE_PRICE', () => {
    const site = emptySite(LOTS.S);
    const b = LOTS.S.building;
    const cells: [number, number][] = [
      [b.x + 6, b.y],
      [b.x + 7, b.y],
    ];
    const c = checkEntrance(db, site, 'main', cells);
    expect(c).toEqual({ ok: true, cost: ENTRANCE_PRICE });
    const d = moveEntrance(db, site, 'main', cells);
    expect(d.ok && d.site.main).toEqual(cells);
  });

  test('отказы: не рядом, в углу, на входе скорой, в стену помещения, отрезает помещение', () => {
    const site = emptySite(LOTS.S);
    const b = LOTS.S.building;
    const kind = (s: Site, which: 'main' | 'ambulance', cells: [number, number][]) => {
      const c = checkEntrance(db, s, which, cells);
      return c.ok ? 'ok' : c.error.kind;
    };
    expect(kind(site, 'main', [[b.x + 6, b.y], [b.x + 8, b.y]])).toBe('badWall');
    expect(kind(site, 'main', [[b.x, b.y], [b.x + 1, b.y]])).toBe('badWall');
    expect(kind(site, 'main', site.ambulance.map(([x, y]) => [x, y] as [number, number]))).toBe('overlap');
    // кабинет у северной стены: вход в его стену нельзя
    const office = addRoom(db, site, 'room.office', { x: b.x, y: b.y, w: 8, h: 7 });
    if (!office.ok) throw new Error('кабинет');
    expect(kind(office.site, 'main', [[b.x + 3, b.y], [b.x + 4, b.y]])).toBe('overlap');
  });
});

describe('окно', () => {
  test('пристройка и перенесённый вход — другая сцена, не «только отметки отделений»', () => {
    const site = emptySite(LOTS.L);
    const b = LOTS.L.building;
    const wing = addShell(db, site, { x: b.x + 2, y: b.y - 8, w: 20, h: 8 });
    const moved = moveEntrance(db, site, 'ambulance', [[b.x + b.w - 1, b.y + 4], [b.x + b.w - 1, b.y + 5]]);
    if (!wing.ok || !moved.ok) throw new Error('стройка');
    expect(onlyDeptsChanged(site, wing.site)).toBe(false);
    expect(onlyDeptsChanged(site, moved.site)).toBe(false);
    expect(onlyDeptsChanged(site, { ...site })).toBe(true);
  });
});

describe('команды стройки', () => {
  function sandbox(): ShiftState {
    const s = newFlowShift(db, { seed: 1, season: 'winter', hospital: hospitalOf(db, emptySite(LOTS.L)), staff: [], flow: { perHour: 0, auto: true }, economy: { cash: 1_000_000 } });
    return s;
  }
  const site = (s: ShiftState) => s.hospital!.site!;
  const result = (out: Notice[]) => out.find(n => n.kind === 'site');

  test('пристройка платится из кассы и отменяется целиком; вход переносится и отменяется', () => {
    const s = sandbox();
    const b = LOTS.L.building;
    const cash0 = cashNow(s)!;
    const before = site(s);
    const out = result(apply(db, s, { kind: 'site', cmd: { kind: 'shell', x: b.x + 2, y: b.y - 8, w: 20, h: 8 } }));
    expect(out).toMatchObject({ kind: 'site', cmd: 'shell', ok: true, cost: 20 * 9 * SHELL_CELL });
    expect(cashNow(s)).toBe(cash0 - 20 * 9 * SHELL_CELL);
    expect(insideCount(site(s))).toBe(insideCount(before) + 20 * 9);
    // помещение в пристройке
    const room = result(apply(db, s, { kind: 'site', cmd: { kind: 'room', type: 'room.office', x: b.x + 4, y: b.y - 7, w: 8, h: 7 } }));
    expect(room?.kind === 'site' && room.ok).toBe(true);
    apply(db, s, { kind: 'site', cmd: { kind: 'undo' } });
    apply(db, s, { kind: 'site', cmd: { kind: 'undo' } });
    expect(site(s).inside).toEqual(before.inside);
    expect(cashNow(s)).toBe(cash0);
    const moved = result(apply(db, s, { kind: 'site', cmd: { kind: 'entrance', which: 'ambulance', cells: [[b.x + b.w - 1, b.y + 4], [b.x + b.w - 1, b.y + 5]] } }));
    expect(moved).toMatchObject({ ok: true, cost: ENTRANCE_PRICE });
    expect(site(s).ambulance).toEqual([[b.x + b.w - 1, b.y + 4], [b.x + b.w - 1, b.y + 5]]);
    apply(db, s, { kind: 'site', cmd: { kind: 'undo' } });
    expect(site(s).ambulance).toEqual(before.ambulance);
  });

  test('у сценария — нельзя: здание задано', () => {
    const s = newFlowShift(db, { seed: 1, season: 'winter', hospital: hospitalOf(db, emptySite(LOTS.L)), staff: [], flow: { perHour: 0, auto: true }, economy: { cash: 1_000_000 }, scenario: 'scenario.ambulatory' });
    const out = result(apply(db, s, { kind: 'site', cmd: { kind: 'shell', x: 8, y: 18, w: 20, h: 8 } }));
    expect(out).toMatchObject({ ok: false, error: { kind: 'scenario' } });
  });
});
