// Готовые помещения (spec docs/specs/2026-10-ready-rooms.md): образец каталога целиком одним действием — размер, дверь на
// своей стене и своей ширины, все предметы; цена — как у собранного руками; где нельзя — с причиной; призрак сам берёт
// поворот, с которым можно. Команда движка: одна трата из кассы, одна отмена, люди на должности — из резерва раньше
// новых; готовое не закрыто на перестройку; четыре готовых с персоналом открывают больницу, и пациентов принимают.
import { describe, expect, test } from 'bun:test';
import { db } from '../../src/content';
import type { Id, RoomSizeId, Rot } from '../../src/content/types';
import { openBlocks } from '../../src/engine/hospital/requirements';
import {
  addReady, addRoom, cellsOf, checkReady, dimsOf, DOOR_PRICE, emptySite, furnishOf, hospitalOf, planOfSite, priceOf, readyCorner, readyCost, readyDraft,
  readyTurn, roomPrice, rulesOf, setDoor, type SiteError, sideOf,
} from '../../src/engine/hospital/site';
import { apply, hospitalCtx, newFlowShift } from '../../src/engine/shift/engine';
import { cashNow, startCash } from '../../src/engine/shift/money';
import { sliceOf } from '../../src/engine/shift/slice';
import { FLOW, liveTo, site } from './site-kit';

const err = (c: { ok: boolean; error?: SiteError }) => (c.ok ? 'ok' : c.error!.kind);
const ROTS: Rot[] = [0, 1, 2, 3];
/** Все образцы каталога: тип и размер. */
const SAMPLES: [Id, RoomSizeId][] = Object.values(db.rooms).flatMap(t => t.sizes.map((z): [Id, RoomSizeId] => [t.id, z.id]));
const sizeOf = (type: Id, size: RoomSizeId) => db.rooms[type].sizes.find(z => z.id === size)!;
/** Смена с потоком в пустом здании, с кассой. */
const shift = (seed: number, cash = startCash(db, 'empty')) =>
  newFlowShift(db, { seed, season: 'winter', hospital: hospitalOf(db, emptySite()), staff: [], flow: FLOW, economy: { cash } });

describe('готовое помещение — образец целиком', () => {
  test('каждый тип, образец и поворот: размер образца, дверь на своей стене и своей ширины, все предметы; работает, кроме людей', () => {
    expect(SAMPLES.length).toBe(29);
    for (const [type, size] of SAMPLES) {
      const z = sizeOf(type, size);
      const rules = rulesOf(db, type)!;
      for (const rot of ROTS) {
        const c = checkReady(db, emptySite(), type, size, 20, 10, rot);
        const at = `${type} ${size} ${rot}`;
        expect(`${at}: ${err(c)}`).toBe(`${at}: ok`);
        if (!c.ok) continue;
        const { rect, door, items } = c.draft;
        expect([rect.w, rect.h]).toEqual(dimsOf(z, rot));
        // дверь — на стене образца «внизу», повёрнутой: поворот и есть сторона двери; где лежат — двойная
        // где лежат и куда везут лежачих на обследование (spec docs/specs/2026-10-orderlies.md, #90) — двойная
        expect(door.length).toBe(rules.gurney || rules.wheels ? 2 : Math.min(2, z.door.width));
        for (const [x, y] of door) expect(sideOf(rect, x, y)).toBe(rot);
        // все предметы и аппараты образца, ни один не делит клеток с другим
        expect(items.length).toBe(z.objects.length + z.slots.length);
        const cells = items.flatMap(i => cellsOf(i, type).map(([x, y]) => `${x},${y}`));
        expect(new Set(cells).size).toBe(cells.length);
        // цена — помещение по площади, дверь, предметы; в каталоге — та же, где и как ни поставь
        expect(c.cost).toBe(roomPrice(db, type, rect.w, rect.h) + DOOR_PRICE[door.length] + items.reduce((n, i) => n + priceOf(db, i.kind, i.eq), 0));
        expect(readyCost(db, type, size)).toBe(c.cost);
        const r = addReady(db, emptySite(), type, size, 20, 10, rot);
        if (!r.ok) throw new Error(at);
        expect(r.site.editing).toBeUndefined();
        const placed = planOfSite(db, r.site).rooms.find(x => x.id === r.room)!;
        expect(`${at}: ${placed.issues!.map(i => i.kind).filter(k => k !== 'noStaff').join(',')}`).toBe(`${at}: `);
      }
    }
  });

  test('цена и состав — как у протянутого, обставленного и с дверью того же размера; реанимация L — с шестой, короткой койкой', () => {
    for (const [type, size] of SAMPLES) {
      const c = checkReady(db, emptySite(), type, size, 20, 10, 0);
      if (!c.ok) throw new Error(type);
      const { rect, door, items } = c.draft;
      const drawn = addRoom(db, emptySite(), type, rect);
      if (!drawn.ok) throw new Error(type);
      const doored = setDoor(db, drawn.site, drawn.room!, door);
      if (!doored.ok) throw new Error(type);
      const f = furnishOf(db, doored.site, drawn.room!);
      if (!f.ok) throw new Error(type);
      expect(f.size).toBe(size);
      const by = (list: readonly { kind: string; eq?: string; x: number; y: number; rot: number }[]) => list.map(i => `${i.kind}:${i.eq ?? ''}@${i.x},${i.y}/${i.rot}`).sort();
      const manual = drawn.cost + doored.cost + f.cost;
      if (type === 'room.ricu' && size === 'L') {
        // длинная койка там не помещается: «Обставить» её не ставит, готовое — ставит короткой, как в готовой больнице
        const short = items.filter(i => i.short);
        expect(short.map(i => i.kind)).toEqual(['bed']);
        expect(by(items.filter(i => !i.short))).toEqual(by(f.items));
        expect(c.cost).toBe(manual + priceOf(db, 'bed'));
        const r = addReady(db, emptySite(), type, size, 20, 10, 0);
        if (!r.ok) throw new Error(type);
        expect(planOfSite(db, r.site).rooms[0].beds.length).toBe(6);
        continue;
      }
      expect(by(items)).toEqual(by(f.items));
      expect(c.cost).toBe(manual);
    }
  });

  test('где нельзя — с причиной: за стенами, мешает сосед и вход, дверь в стену корпуса и в общую стену', () => {
    const s0 = emptySite();
    expect(err(checkReady(db, s0, 'room.office', 'M', 0, 0, 0))).toBe('outside');
    expect(err(checkReady(db, s0, 'room.office', 'L' as RoomSizeId, 20, 10, 0))).toBe('unknown');
    // главный вход — посередине южной стены (29–30, 33)
    expect(checkReady(db, s0, 'room.office', 'M', 26, 27, 0)).toMatchObject({ ok: false, error: { kind: 'overlap', what: 'entrance' } });
    const a = addReady(db, s0, 'room.office', 'M', 20, 10, 0);
    if (!a.ok) throw new Error('a');
    expect(checkReady(db, a.site, 'room.office', 'M', 24, 12, 0)).toMatchObject({ ok: false, error: { kind: 'overlap', room: 'r1' } });
    // у северной стены корпуса (внутренность — с y = 7): дверь наверх — в стену корпуса, вниз — в коридор
    expect(err(checkReady(db, s0, 'room.office', 'M', 20, 6, 2))).toBe('doorTo');
    expect(err(checkReady(db, s0, 'room.office', 'M', 20, 6, 0))).toBe('ok');
    // справа от первого кабинета, стена x = 27 — общая: дверь влево ложится на неё
    expect(err(checkReady(db, a.site, 'room.office', 'M', 27, 10, 1))).toBe('doorTo');
    expect(err(checkReady(db, a.site, 'room.office', 'M', 27, 10, 3))).toBe('ok');
    // не вышло — образец всё равно есть: призрак рисует его красным
    const bad = checkReady(db, s0, 'room.office', 'M', 20, 6, 2);
    expect(!bad.ok && bad.draft?.items.length).toBe(7);
  });

  test('призрак: середина — под курсором; поворот — прежний, если можно, иначе следующий по R, с которым можно', () => {
    const s0 = emptySite();
    expect(readyCorner(db, 'room.office', 'M', 0, [23, 13])).toEqual([20, 10]);
    expect(readyCorner(db, 'room.office', 'M', 1, [23, 13])).toEqual([20, 10]);
    expect(readyDraft(db, s0, 'room.office', 'M', 20, 10, 1)!.rect).toEqual({ x: 20, y: 10, w: 7, h: 8 });
    // в середине здания можно с любым поворотом — берётся прежний
    for (const rot of ROTS) expect(readyTurn(db, s0, 'room.office', 'M', [23, 13], rot)).toBe(rot);
    // вплотную к северной стене корпуса дверь наверх не выйти: прежний поворот 2 сменяется следующим по R — 3
    const c = [23, 9] as [number, number];
    const corner = readyCorner(db, 'room.office', 'M', 2, c)!;
    expect(corner[1]).toBe(6);
    expect(err(checkReady(db, s0, 'room.office', 'M', corner[0], corner[1], 2))).toBe('doorTo');
    const turned = readyTurn(db, s0, 'room.office', 'M', c, 2);
    expect(turned).not.toBe(2);
    const at = readyCorner(db, 'room.office', 'M', turned, c)!;
    expect(err(checkReady(db, s0, 'room.office', 'M', at[0], at[1], turned))).toBe('ok');
    // нигде нельзя (над входом) — прежний
    expect(readyTurn(db, s0, 'room.office', 'M', [29, 31], 1)).toBe(1);
  });
});

describe('готовое помещение — команда движка', () => {
  const READY = (type: Id, size: RoomSizeId, x: number, y: number, staff = true) => ({ kind: 'ready' as const, type, size, x, y, rot: 0 as Rot, staff });

  test('одна трата из кассы, люди на должности, не закрыто на перестройку; одна отмена возвращает всё', () => {
    const s = shift(1);
    const cash0 = cashNow(s)!;
    const office = site(db, s, { kind: 'room', type: 'room.office', x: 30, y: 15, w: 8, h: 7 }).room!;
    expect(s.hospital!.site!.editing).toBe(office);
    const spent0 = s.works!.spent;
    const price = (checkReady(db, s.hospital!.site!, 'room.ward', 'S', 6, 6, 0) as { cost: number }).cost;
    const n = site(db, s, READY('room.ward', 'S', 6, 6));
    // палата работает и ночью, а больница, где лежат, — ночная тоже (spec 2026-10-staff-shifts): медсестра на день и на ночь
    expect(n).toMatchObject({ cmd: 'ready', ok: true, cost: price, hired: 2 });
    const ward = n.room!;
    const r = s.hospital!.site!.rooms.find(x => x.id === ward)!;
    expect(r.door!.length).toBe(2);
    expect(r.items.filter(i => i.kind === 'bed').length).toBe(2);
    // взялись за другое — прежнее открыто; готовое не закрыто
    expect(s.hospital!.site!.editing).toBeUndefined();
    expect(s.staff!.filter(m => m.room === ward).map(m => `${m.role}:${m.shift}`)).toEqual(['role.nurse:day', 'role.nurse:night']);
    expect(s.works!.spent).toBe(spent0 + price);
    expect(cashNow(s)).toBe(cash0 - s.works!.spent);
    const ctx = hospitalCtx(db, s);
    expect(ctx.working.has(ward)).toBe(true);
    // одна отмена — помещение, люди и деньги как были
    const staff = s.staff!.length;
    const u = site(db, s, { kind: 'undo' });
    expect(u).toMatchObject({ cmd: 'undo', ok: true, cost: -price });
    expect(s.hospital!.site!.rooms.some(x => x.id === ward)).toBe(false);
    expect(s.staff!.length).toBe(staff - 2);
    expect(s.works!.spent).toBe(spent0);
    expect(cashNow(s)).toBe(cash0 - spent0);
  });

  test('без персонала — пустые должности; с ним — сначала резерв, потом новые; врачу — терапевт', () => {
    const s = shift(2);
    const bare = site(db, s, READY('room.icu', 'S', 6, 6, false));
    expect(bare.hired).toBeUndefined();
    expect(s.staff ?? []).toEqual([]);
    // снесли ПИТ с людьми — медсестры и анестезиологи дня и ночи ушли в резерв; новая ПИТ берёт их же
    const s2 = shift(2);
    const icu = site(db, s2, READY('room.icu', 'S', 6, 6)).room!;
    const was = s2.staff!.map(m => m.id).sort();
    expect(s2.staff!.map(m => `${m.role}:${m.shift}`).sort()).toEqual(['role.anesthetist:day', 'role.anesthetist:night', 'role.nurse:day', 'role.nurse:night']);
    site(db, s2, { kind: 'demolish', room: icu });
    expect(s2.staff!.every(m => m.room === undefined)).toBe(true);
    const again = site(db, s2, READY('room.icu', 'S', 14, 6));
    expect(again.hired).toBe(4);
    expect(s2.staff!.map(m => m.id).sort()).toEqual(was);
    expect(s2.staff!.every(m => m.room === again.room)).toBe(true);
    // кабинет врача — терапевт, на дневную смену: ночью кабинеты закрыты
    const doc = site(db, s2, READY('room.office', 'M', 22, 6));
    expect(s2.staff!.filter(m => m.room === doc.room).map(m => `${m.role}:${m.shift}`)).toEqual(['role.therapist:day']);
  });

  test('нельзя — ничего не меняется, извещение с причиной; денег не хватает до предела минуса — «money»', () => {
    const s = shift(3);
    const before = JSON.stringify([s.hospital, s.staff, s.economy, s.events]);
    const bad = apply(db, s, { kind: 'site', cmd: { ...READY('room.office', 'M', 20, 6), rot: 2 } });
    expect(bad).toEqual([{ kind: 'site', cmd: 'ready', ok: false, error: { kind: 'doorTo' } }]);
    expect(JSON.stringify([s.hospital, s.staff, s.economy, s.events])).toBe(before);
    expect(s.works ?? { spent: 0, undo: [] }).toEqual({ spent: 0, undo: [] });
    const limit = db.money!.overdraft;
    const poor = shift(3, -limit + 1000);
    const price = (checkReady(db, poor.hospital!.site!, 'room.office', 'M', 20, 6, 0) as { cost: number }).cost;
    const out = apply(db, poor, { kind: 'site', cmd: READY('room.office', 'M', 20, 6) });
    expect(out).toEqual([{ kind: 'site', cmd: 'ready', ok: false, error: { kind: 'money', need: price - 1000 } }]);
    expect(poor.hospital!.site!.rooms).toEqual([]);
    expect(poor.staff ?? []).toEqual([]);
  });

  test('четыре готовых с персоналом открывают больницу — регистратура, зона ожидания, ординаторская, кабинет врача; принимают', () => {
    const s = shift(5);
    liveTo(db, s, 9);
    expect(s.summary.arrived).toBe(0);
    const ids = [
      site(db, s, READY('room.reception', 'S', 6, 6)),
      site(db, s, READY('room.waiting', 'M', 11, 6)),
      site(db, s, READY('room.staff', 'S', 19, 6)),
      site(db, s, READY('room.office', 'M', 24, 6)),
    ].map(n => n.room!);
    const ctx = hospitalCtx(db, s);
    expect(openBlocks(db, ctx.plan, ctx.working, ctx.staffed)).toEqual([]);
    expect([...ctx.working].sort()).toEqual([...ids].sort());
    // одна запись отмены на помещение
    expect(s.works!.undo.length).toBe(4);
    liveTo(db, s, 14);
    expect(s.summary.arrived).toBeGreaterThan(10);
    expect(sliceOf(s).seen).toBeGreaterThan(5);
  }, 120_000);
});
