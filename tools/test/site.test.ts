// Стройка ПК — чистые функции больницы (spec docs/specs/2026-10-build.md): помещение протяжкой, предметы, двери, нужная
// мебель и двойная дверь из каталога, «Обставить», перевод готовой больницы.
import { describe, expect, test } from 'bun:test';
import { db } from '../../src/content';
import type { Cell, Id } from '../../src/content/types';
import { planOf, presetHospital } from '../../src/engine/hospital/build';
import { problemsOf, workingRooms } from '../../src/engine/hospital/requirements';
import {
  addItem, addRoom, cellsOf, checkDoor, checkItem, checkRoom, demolish, emptySite, furnish, furnishOf, hospitalOf, mapOf, moveItem, planOfSite, removeItem,
  rulesOf, setDoor, type Site, type SiteError,
} from '../../src/engine/hospital/site';
import { siteOfPreset } from '../../src/engine/hospital/site-preset';
import { presetStaff, staffingOf } from '../../src/engine/hospital/staff';
import { CELL } from '../../src/engine/hospital/grid';

const err = (c: { ok: boolean; error?: SiteError }) => (c.ok ? 'ok' : c.error!.kind);
const ok = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => {
  expect(r.ok ? 'ok' : JSON.stringify(r)).toBe('ok');
  return r as Extract<T, { ok: true }>;
};

/** Участок с узкой внутренностью 32 × 10: главный вход снизу слева, вход скорой справа. */
function narrow(): Site {
  return {
    w: 34, h: 12, inside: [{ x: 1, y: 1, w: 32, h: 10 }], main: [[2, 11], [3, 11]], ambulance: [[33, 5], [33, 6]], rooms: [], decor: [], next: 1, nextItem: 1,
  };
}

describe('помещение протяжкой', () => {
  test('у стены корпуса и у соседа — общая стена; цена — по площади; наименьший размер — в любом повороте', () => {
    const s0 = emptySite();
    expect(checkRoom(db, s0, 'room.office', { x: 6, y: 6, w: 8, h: 7 })).toEqual({ ok: true, cost: 20000 });
    expect(checkRoom(db, s0, 'room.office', { x: 6, y: 6, w: 10, h: 8 })).toEqual({ ok: true, cost: 28600 });
    expect(err(checkRoom(db, s0, 'room.office', { x: 6, y: 6, w: 7, h: 8 }))).toBe('ok');
    const a = ok(addRoom(db, s0, 'room.office', { x: 6, y: 6, w: 8, h: 7 }));
    expect(a.room).toBe('r1');
    expect(a.site.editing).toBe('r1');
    // сосед справа делит стену x = 13
    expect(err(checkRoom(db, a.site, 'room.office', { x: 13, y: 6, w: 8, h: 7 }))).toBe('ok');
    const m = mapOf(a.site);
    expect(m.cells[9 * m.w + 9]).toBe(CELL.floor);
    expect(m.cells[12 * m.w + 9]).toBe(CELL.wall);
  });

  test('нельзя — с причиной: мало, много, за стенами, мешает помещение, вход, дверь', () => {
    const s0 = emptySite();
    expect(checkRoom(db, s0, 'room.office', { x: 6, y: 6, w: 7, h: 6 })).toEqual({ ok: false, error: { kind: 'small', min: [8, 7] } });
    expect(err(checkRoom(db, s0, 'room.waiting', { x: 6, y: 6, w: 21, h: 7 }))).toBe('large');
    expect(err(checkRoom(db, s0, 'room.office', { x: 5, y: 6, w: 8, h: 7 }))).toBe('outside');
    expect(err(checkRoom(db, s0, 'room.office', { x: 0, y: 0, w: 8, h: 7 }))).toBe('outside');
    const a = ok(addRoom(db, s0, 'room.office', { x: 6, y: 6, w: 8, h: 7 })).site;
    expect(checkRoom(db, a, 'room.office', { x: 12, y: 6, w: 8, h: 7 })).toEqual({ ok: false, error: { kind: 'overlap', room: 'r1' } });
    // главный вход — посередине южной стены (29–30, 33)
    expect(checkRoom(db, s0, 'room.office', { x: 26, y: 27, w: 8, h: 7 })).toEqual({ ok: false, error: { kind: 'overlap', what: 'entrance' } });
    const d = ok(setDoor(db, a, 'r1', [[9, 12]])).site;
    expect(checkRoom(db, d, 'room.office', { x: 6, y: 13, w: 8, h: 7 })).toEqual({ ok: false, error: { kind: 'overlap', what: 'door', room: 'r1' } });
  });

  test('нет стены к коридору от входа; отрежет от входа дверь соседа или вход скорой', () => {
    // вторая внутренность без входа: помещение в ней — без коридора от входа
    const two: Site = { ...narrow(), inside: [{ x: 1, y: 1, w: 14, h: 10 }, { x: 17, y: 1, w: 16, h: 10 }] };
    expect(err(checkRoom(db, two, 'room.toilet', { x: 22, y: 0, w: 6, h: 7 }))).toBe('noCorridor');
    const s0 = narrow();
    // поперёк всей внутренности — отрезает вход скорой
    expect(checkRoom(db, s0, 'room.toilet', { x: 12, y: 0, w: 6, h: 12 })).toEqual({ ok: false, error: { kind: 'cutsOff', ambulance: true } });
    const noAmb = { ...s0, ambulance: [] };
    const a = ok(addRoom(db, noAmb, 'room.office', { x: 24, y: 0, w: 8, h: 7 })).site;
    expect(err(checkRoom(db, a, 'room.toilet', { x: 12, y: 0, w: 6, h: 12 }))).toBe('ok');
    const withDoor = ok(setDoor(db, a, 'r1', [[27, 6]])).site;
    expect(checkRoom(db, withDoor, 'room.toilet', { x: 12, y: 0, w: 6, h: 12 })).toEqual({ ok: false, error: { kind: 'cutsOff', room: 'r1' } });
  });
});

describe('предметы', () => {
  const office = ok(addRoom(db, emptySite(), 'room.office', { x: 6, y: 6, w: 8, h: 7 })).site;

  test('каталог помещения, клетки, занято, длинные — в две клетки; цена', () => {
    expect(checkItem(db, office, 'r1', { kind: 'desk', x: 9, y: 9, rot: 0 })).toEqual({ ok: true, cost: 1500 });
    expect(err(checkItem(db, office, 'r1', { kind: 'bed', x: 9, y: 9, rot: 0 }))).toBe('notHere');
    expect(err(checkItem(db, office, 'r1', { kind: 'xray', eq: 'eq.xray_analog', x: 9, y: 9, rot: 0 }))).toBe('notHere');
    expect(err(checkItem(db, office, 'r1', { kind: 'chair', x: 6, y: 8, rot: 0 }))).toBe('notInRoom');
    const d = ok(addItem(db, office, 'r1', { kind: 'desk', x: 9, y: 9, rot: 0 })).site;
    expect(checkItem(db, d, 'r1', { kind: 'chair', x: 9, y: 9, rot: 0 })).toEqual({ ok: false, error: { kind: 'occupied', item: 'desk' } });
    // кушетка — две клетки, от изголовья к ногам по повороту
    expect(cellsOf({ kind: 'couch', x: 7, y: 7, rot: 0 }, 'room.office')).toEqual([[7, 7], [7, 8]]);
    expect(cellsOf({ kind: 'couch', x: 7, y: 7, rot: 3 }, 'room.office')).toEqual([[7, 7], [8, 7]]);
    expect(cellsOf({ kind: 'couch', x: 7, y: 7, rot: 3 }, 'room.staff')).toEqual([[7, 7]]);
    expect(err(checkItem(db, d, 'r1', { kind: 'couch', x: 7, y: 11, rot: 0 }))).toBe('notInRoom');
    expect(err(checkItem(db, d, 'r1', { kind: 'couch', x: 8, y: 9, rot: 3 }))).toBe('occupied');
  });

  test('перед дверью и поперёк прохода — нельзя; переставить бесплатно; убрать — половина цены', () => {
    const d = ok(setDoor(db, office, 'r1', [[10, 12]])).site;
    expect(err(checkItem(db, d, 'r1', { kind: 'chair', x: 10, y: 11, rot: 0 }))).toBe('doorway');
    // санузел 6 × 7: внутри 4 × 5; ряд раковин поперёк делит пол надвое
    let t = ok(addRoom(db, emptySite(), 'room.toilet', { x: 6, y: 6, w: 6, h: 7 })).site;
    for (const x of [7, 8, 9]) t = ok(addItem(db, t, 'r1', { kind: 'sink', x, y: 9, rot: 0 })).site;
    expect(err(checkItem(db, t, 'r1', { kind: 'sink', x: 10, y: 9, rot: 0 }))).toBe('blocks');
    const withDesk = ok(addItem(db, office, 'r1', { kind: 'desk', x: 9, y: 9, rot: 0 }));
    expect(withDesk.cost).toBe(1500);
    const id = withDesk.site.rooms[0].items[0].id;
    const moved = ok(moveItem(db, withDesk.site, 'r1', id, { x: 8, y: 8, rot: 2 }));
    expect(moved.cost).toBe(0);
    expect(moved.site.rooms[0].items[0]).toMatchObject({ x: 8, y: 8, rot: 2 });
    const gone = ok(removeItem(db, moved.site, 'r1', id));
    expect(gone.cost).toBe(-750);
    expect(gone.site.rooms[0].items).toEqual([]);
    const later = ok(removeItem(db, moved.site, 'r1', id, true));
    expect(later.site.rooms[0].items[0].leaving).toBe(true);
  });
});

describe('двери', () => {
  const two = (() => {
    let s = ok(addRoom(db, emptySite(), 'room.office', { x: 6, y: 6, w: 8, h: 7 })).site;
    s = ok(addRoom(db, s, 'room.office', { x: 13, y: 6, w: 8, h: 7 })).site;
    return s;
  })();

  test('одинарная и двойная — на своей стене к коридору; не на углу, не в общей стене, не в стене корпуса', () => {
    expect(checkDoor(db, two, 'r1', [[9, 12]])).toEqual({ ok: true, cost: 2000 });
    expect(checkDoor(db, two, 'r1', [[9, 12], [10, 12]])).toEqual({ ok: true, cost: 4000 });
    expect(err(checkDoor(db, two, 'r1', [[9, 12], [11, 12]]))).toBe('badWall');
    expect(err(checkDoor(db, two, 'r1', [[6, 12]]))).toBe('badWall');
    expect(err(checkDoor(db, two, 'r1', [[13, 9]]))).toBe('shared');
    expect(err(checkDoor(db, two, 'r1', [[9, 6]]))).toBe('notCorridor');
    const item = ok(addItem(db, two, 'r1', { kind: 'plant', x: 9, y: 11, rot: 0 })).site;
    expect(err(checkDoor(db, item, 'r1', [[9, 12]]))).toBe('doorway');
  });

  test('новая дверь заменяет прежнюю: та — за полцены', () => {
    const d = ok(setDoor(db, two, 'r1', [[9, 12]]));
    expect(d.cost).toBe(2000);
    const dd = ok(setDoor(db, d.site, 'r1', [[10, 12], [11, 12]]));
    expect(dd.cost).toBe(4000 - 1000);
    expect(dd.site.rooms[0].door).toEqual([[10, 12], [11, 12]]);
    expect(err(checkDoor(db, dd.site, 'r1', [[11, 12], [10, 12]]))).toBe('nothing');
  });

  test('двойная нужна там, где лежат, — из каталога: список геймдизайна и бокс', () => {
    const gurney = Object.keys(db.rooms).filter(id => rulesOf(db, id)!.gurney).sort();
    expect(gurney).toEqual(['room.box', 'room.ct', 'room.emergency', 'room.icu', 'room.mri', 'room.or', 'room.ricu', 'room.ward', 'room.xray']);
    let s = ok(addRoom(db, emptySite(), 'room.ward', { x: 6, y: 6, w: 7, h: 7 })).site;
    s = ok(furnish(db, s, 'r1')).site;
    const one = ok(setDoor(db, s, 'r1', [[9, 12]])).site;
    const r = planOfSite(db, one).rooms[0];
    expect(r.issues).toContainEqual({ kind: 'singleDoor' });
    const dbl = ok(setDoor(db, one, 'r1', [[9, 12], [10, 12]])).site;
    expect(planOfSite(db, dbl).rooms[0].issues).not.toContainEqual({ kind: 'singleDoor' });
  });
});

describe('нужное помещению — из каталога', () => {
  test('нужная мебель по типам — как в спецификации', () => {
    const need = Object.fromEntries(Object.keys(db.rooms).sort().map(id => [id, rulesOf(db, id)!.needs.map(n => `${n.kind}${n.n > 1 ? ` ×${n.n}` : ''}`).sort().join(', ')]));
    expect(need).toEqual({
      'room.box': 'bed', 'room.ct': 'chair, table ×2', 'room.ecg': 'couch', 'room.emergency': 'bed', 'room.endoscopy': 'couch', 'room.icu': 'bed',
      'room.lab': 'table', 'room.mri': 'chair, table ×2', 'room.office': 'chair ×2, desk', 'room.or': 'table', 'room.procedure': 'chair, table',
      'room.reception': 'chair, desk', 'room.ricu': 'bed', 'room.staff': 'desk', 'room.toilet': 'sink', 'room.triage': 'chair, desk',
      'room.ultrasound': 'couch', 'room.waiting': 'chair', 'room.ward': 'bed', 'room.xray': 'chair, table ×2',
    });
  });

  test('пустое помещение — «нет» с тем, чего не хватает; обставленное — ничего', () => {
    let s = ok(addRoom(db, emptySite(), 'room.office', { x: 6, y: 6, w: 8, h: 7 })).site;
    expect(planOfSite(db, s).rooms[0].issues).toEqual([
      { kind: 'closed' },
      { kind: 'noObject', object: 'chair', need: 2, have: 0 },
      { kind: 'noObject', object: 'desk', need: 1, have: 0 },
    ]);
    // в «не работает: …» — первая причина; «закрыто на перестройку» — последней: видно, чего ещё не хватает
    const kinds = (st: Site) => {
      const plan = planOfSite(db, st);
      return problemsOf(db, plan, plan.rooms[0], () => false).map(p => p.kind);
    };
    expect(kinds(s)).toEqual(['noDoor', 'noObject', 'noObject', 'noStaff', 'closed']);
    s = ok(furnish(db, s, 'r1')).site;
    expect(planOfSite(db, s).rooms[0].issues).toEqual([{ kind: 'closed' }]);
    expect(kinds(s)).toEqual(['noDoor', 'noStaff', 'closed']);
  });

  test('«Обставить» — каждый тип и размер в прямоугольнике образца: всё нужное, аппараты на местах, люди у предметов', () => {
    for (const t of Object.values(db.rooms)) {
      for (const z of t.sizes) {
        for (const [w, h] of [[z.w, z.h], [z.h, z.w]]) {
          let s = ok(addRoom(db, emptySite(), t.id, { x: 6, y: 6, w, h })).site;
          const f = ok(furnishOf(db, s, 'r1'));
          s = ok(furnish(db, s, 'r1')).site;
          const r = planOfSite(db, s).rooms[0];
          // образец того же размера: все предметы и места аппаратов (кроме длинного без второй клетки — койки реанимации L)
          const want = z.objects.length + z.slots.length;
          if (f.size === z.id) expect(r.items!.length).toBeGreaterThanOrEqual(want - (t.id === 'room.ricu' && z.id === 'L' ? 1 : 0));
          expect(r.issues!.filter(i => i.kind === 'noObject')).toEqual([]);
          if (t.needsEquipment) expect(r.equipment.length).toBeGreaterThan(0);
          for (const role of t.staff) expect(r.staff[role]).toBeDefined();
          if (z.patient) expect(r.patient).toBeDefined();
          // предметы не делят клеток
          const cells = r.items!.flatMap(i => cellsOf(i, t.id).map(([x, y]) => `${x},${y}`));
          expect(new Set(cells).size).toBe(cells.length);
        }
      }
    }
  });

  test('«Обставить» в большем помещении берёт больший образец; не пустое — нельзя', () => {
    let s = ok(addRoom(db, emptySite(), 'room.waiting', { x: 6, y: 6, w: 14, h: 8 })).site;
    expect(ok(furnishOf(db, s, 'r1')).size).toBe('L');
    s = ok(furnish(db, s, 'r1')).site;
    expect(planOfSite(db, s).rooms[0].seats.length).toBe(18);
    expect(err(furnishOf(db, s, 'r1'))).toBe('notEmpty');
    const lab = ok(addRoom(db, emptySite(), 'room.lab', { x: 6, y: 6, w: 9, h: 8 })).site;
    expect(ok(furnishOf(db, lab, 'r1')).size).toBe('M');
    const items = ok(furnish(db, lab, 'r1')).site.rooms[0].items;
    expect(items.filter(i => i.eq).map(i => i.eq).sort()).toEqual(['eq.biochem_analyzer', 'eq.hematology_analyzer', 'eq.immuno_analyzer', 'eq.urine_analyzer']);
  });

  test('ПИТ: койка работает с монитором рядом, реанимация — с монитором и аппаратом ИВЛ', () => {
    let s = ok(addRoom(db, emptySite(), 'room.ricu', { x: 6, y: 6, w: 9, h: 7 })).site;
    s = ok(furnish(db, s, 'r1')).site;
    const r = planOfSite(db, s).rooms[0];
    expect(r.beds.length).toBe(4);
    const of = r.slotsOf!;
    for (let b = 0; b < 4; b++) {
      expect(r.equipment[of['eq.monitor_defib'][b]]).toBe('eq.monitor_defib');
      expect(r.equipment[of['eq.ventilator'][b]]).toBe('eq.ventilator');
    }
    // убрали аппарат ИВЛ у первой койки — у неё его больше нет
    const vent = s.rooms[0].items.find(i => i.eq === 'eq.ventilator')!;
    const less = ok(removeItem(db, s, 'r1', vent.id)).site;
    expect(planOfSite(db, less).rooms[0].slotsOf!['eq.ventilator'].filter(i => i < 0).length).toBe(1);
  });
});

describe('готовая больница', () => {
  const p = db.presets['preset.city'];
  const site = siteOfPreset(db, p);
  const plan = planOf(db, hospitalOf(db, site));
  const old = planOf(db, presetHospital(db, p).hospital);

  test('те же помещения, места, койки и аппараты; ваш кабинет — первый; всё работает', () => {
    expect(plan.rooms.map(r => [r.id, r.type, r.x, r.y, r.w, r.h])).toEqual(old.rooms.map(r => [r.id, r.type, r.x, r.y, r.w, r.h]));
    for (const r of plan.rooms) {
      const o = old.rooms.find(x => x.id === r.id)!;
      expect([r.id, r.seats.length, r.beds.length, r.equipment.length, r.places ?? 0]).toEqual([o.id, o.seats.length, o.beds.length, o.equipment.filter(Boolean).length, r.type === 'room.staff' ? (db.rooms[r.type].sizes.find(z => z.id === o.size)!.places) : 0]);
      // двери тех, где лежат, — двойные
      if (rulesOf(db, r.type)!.gurney) expect(r.door.length).toBeGreaterThanOrEqual(2);
      expect(r.beds).toEqual(o.beds);
    }
    expect(plan.mine).toBe('r3');
    const staffed = staffingOf(db, plan, presetStaff(db, p));
    const working = workingRooms(db, plan, staffed);
    expect(plan.rooms.filter(r => !working.has(r.id)).map(r => [r.id, problemsOf(db, plan, r, staffed)])).toEqual([]);
  });

  test('снос помещения готовой больницы: на месте двери — проход, пол — коридор', () => {
    const r1 = site.rooms[0];
    const out = ok(demolish(db, site, r1.id));
    expect(out.cost).toBeLessThan(0);
    const m = mapOf(out.site);
    const [dx, dy] = r1.door![0] as Cell;
    expect(m.cells[dy * m.w + dx]).toBe(CELL.corridor);
    expect(m.cells[(r1.y + 2) * m.w + r1.x + 2]).toBe(CELL.corridor);
    expect(m.reach[(r1.y + 2) * m.w + r1.x + 2]).toBe(1);
  });
});

/** Типы помещений — для проверок по всем. */
export const ROOM_TYPES: Id[] = Object.keys(db.rooms).sort();
