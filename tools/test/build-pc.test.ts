// Стройка ПК во время смены (spec docs/specs/2026-10-build.md): команды движка `site` пока идут часы — больница
// открывается, когда может принимать; перестраиваемое помещение закрыто; снос, найм и резерв; отмена 50 действий;
// занятое убирается, когда освободится, койки лежащих — на тех же кроватях; детерминизм при разном шаге часов.
import { describe, expect, test } from 'bun:test';
import { db } from '../../src/content';
import { planOf } from '../../src/engine/hospital/build';
import { problemsOf } from '../../src/engine/hospital/requirements';
import { bedOrder, emptySite, FREE_CHECK, hospitalOf, SITE_UNDO } from '../../src/engine/hospital/site';
import { siteOfPreset } from '../../src/engine/hospital/site-preset';
import { presetStaff } from '../../src/engine/hospital/staff';
import { apply, hospitalCtx, newFlowShift, newSingle } from '../../src/engine/shift/engine';
import { sliceOf } from '../../src/engine/shift/slice';
import type { ShiftPatient, ShiftState } from '../../src/engine/shift/types';
import { buildProto, emptyShift, hash, liveTo, PROTO, site } from './site-kit';

/** Готовая больница 2а в виде больницы ПК, со штатом, — смена с потоком. */
function cityShift(seed: number): ShiftState {
  const p = db.presets['preset.city'];
  return newFlowShift(db, { seed, season: 'winter', hospital: hospitalOf(db, siteOfPreset(db, p)), staff: presetStaff(db, p), flow: { perHour: 12, ambulancePerHour: 2 } });
}

const working = (s: ShiftState) => hospitalCtx(db, s).working;
/** На операционном столе — ни выписать, ни перевести. */
const onTable = (p: ShiftPatient) => !!p.stay?.op && !p.stay.op.done && p.stay.op.start !== undefined;

describe('стройка в смене', () => {
  test('шесть помещений прототипа в пустом здании: пока больница закрыта, никто не приходит; потом приходят и их принимают', () => {
    const s = emptyShift(db, 1);
    liveTo(db, s, 9);
    expect(s.summary.arrived).toBe(0);
    const ids = buildProto(db, s);
    expect([...working(s)].sort()).toEqual([...ids].sort());
    expect(s.works!.spent).toBeGreaterThan(200_000);
    const lab = ids[5];
    let labBusy = 0;
    const end = 14 * 3600;
    while (s.t < end) {
      apply(db, s, { kind: 'advance', seconds: 60 });
      if (Object.values(s.patients).some(p => p.pending.some(x => x.room === lab))) labBusy++;
    }
    expect(s.summary.arrived).toBeGreaterThan(15);
    // приняты нанятым терапевтом — в его строке итогов и в «приняты» среза
    expect(sliceOf(s).seen).toBeGreaterThan(10);
    expect(labBusy).toBeGreaterThan(0);
  }, 120_000);

  test('скорая — когда построена смотровая приёмного', () => {
    const s = emptyShift(db, 2);
    buildProto(db, s);
    liveTo(db, s, 10);
    const amb = () => Object.values(s.patients).filter(p => p.kind === 'ambulance').length + (s.gone ?? []).filter(r => r.kind === 'ambulance').length;
    expect(amb()).toBe(0);
    const id = site(db, s, { kind: 'room', type: 'room.emergency', x: 6, y: 20, w: 9, h: 6 }).room!;
    site(db, s, { kind: 'furnish', room: id });
    site(db, s, { kind: 'door', room: id, cells: [[10, 20], [11, 20]] });
    site(db, s, { kind: 'hire', room: id, role: 'role.nurse' });
    site(db, s, { kind: 'done' });
    expect(working(s).has(id)).toBe(true);
    liveTo(db, s, 14);
    expect(amb()).toBeGreaterThan(0);
  }, 120_000);

  test('перестраиваемое помещение закрыто — до «Готово» или пока не взялись за другое', () => {
    const s = emptyShift(db, 3);
    const [reception, waiting] = buildProto(db, s);
    expect(working(s).has(reception)).toBe(true);
    site(db, s, { kind: 'item', room: reception, item: { kind: 'plant', x: 7, y: 7, rot: 0 } });
    expect(working(s).has(reception)).toBe(false);
    const plan = hospitalCtx(db, s).plan;
    expect(problemsOf(db, plan, plan.rooms.find(r => r.id === reception)!, hospitalCtx(db, s).staffed)[0]).toEqual({ kind: 'closed' });
    site(db, s, { kind: 'item', room: waiting, item: { kind: 'plant', x: 18, y: 7, rot: 0 } });
    expect(working(s).has(reception)).toBe(true);
    expect(working(s).has(waiting)).toBe(false);
    site(db, s, { kind: 'done' });
    expect(working(s).has(waiting)).toBe(true);
  });

  test('предмет и дверь командой движка: поставить, переставить, убрать дверь и поставить снова; нельзя — причина, ничего не меняется', () => {
    const s = emptyShift(db, 4);
    const [reception, waiting] = buildProto(db, s);
    const room = (id: string) => s.hospital!.site!.rooms.find(r => r.id === id)!;
    site(db, s, { kind: 'item', room: waiting, item: { kind: 'plant', x: 18, y: 7, rot: 0 } });
    const id = room(waiting).items.at(-1)!.id;
    // переставить и повернуть — бесплатно, тот же номер
    expect(site(db, s, { kind: 'move', room: waiting, id, x: 12, y: 7, rot: 1 }).cost).toBe(0);
    expect(room(waiting).items.find(i => i.id === id)).toMatchObject({ kind: 'plant', x: 12, y: 7, rot: 1 });
    // нельзя: на стул, чужой предмет, вне помещения — причина, больница та же
    const chair = room(waiting).items.find(i => i.kind === 'chair')!;
    const before = hash(s.hospital);
    const spent = s.works!.spent;
    expect(site(db, s, { kind: 'move', room: waiting, id, x: chair.x, y: chair.y, rot: 0 }, false).error).toEqual({ kind: 'occupied', item: 'chair' });
    expect(site(db, s, { kind: 'item', room: waiting, item: { kind: 'bed', x: 12, y: 11, rot: 1 } }, false).error).toEqual({ kind: 'notHere' });
    expect(site(db, s, { kind: 'item', room: waiting, item: { kind: 'plant', x: 22, y: 20, rot: 0 } }, false).error).toEqual({ kind: 'notInRoom' });
    expect(hash(s.hospital)).toBe(before);
    expect(s.works!.spent).toBe(spent);
    // без двери регистратура не работает — больница закрыта; дверь снова и «Готово» — открыта
    expect(site(db, s, { kind: 'undoor', room: reception }).cost).toBe(-1000);
    expect(room(reception).door).toBeUndefined();
    site(db, s, { kind: 'done' });
    const plan = hospitalCtx(db, s).plan;
    expect(problemsOf(db, plan, plan.rooms.find(r => r.id === reception)!, hospitalCtx(db, s).staffed)[0]).toEqual({ kind: 'noDoor' });
    expect(working(s).has(reception)).toBe(false);
    expect(site(db, s, { kind: 'door', room: reception, cells: [[9, 12]] }).cost).toBe(2000);
    site(db, s, { kind: 'done' });
    expect(working(s).has(reception)).toBe(true);
  });

  test('снос — половина назад, люди — в резерв; «Нанять» берёт из резерва; уволить', () => {
    const s = emptyShift(db, 4);
    const ids = buildProto(db, s);
    const lab = ids[5];
    const tech = s.staff!.find(m => m.room === lab)!;
    const before = s.works!.spent;
    const n = site(db, s, { kind: 'demolish', room: lab });
    expect(n.cost).toBeLessThan(0);
    expect(s.works!.spent).toBe(before + n.cost!);
    expect(s.hospital!.site!.rooms.some(r => r.id === lab)).toBe(false);
    expect(s.staff!.find(m => m.id === tech.id)!.room).toBeUndefined();
    const again = site(db, s, { kind: 'room', type: 'room.lab', x: 6, y: 20, w: 6, h: 7 }).room!;
    site(db, s, { kind: 'hire', room: again, role: 'role.lab_tech' });
    expect(s.staff!.find(m => m.id === tech.id)!.room).toBe(again);
    expect(s.staff!.filter(m => m.role === 'role.lab_tech').length).toBe(1);
    // на занятую должность — нельзя; уволить — можно, пока он никого не ведёт
    expect(site(db, s, { kind: 'hire', room: again, role: 'role.lab_tech' }, false).error).toEqual({ kind: 'nothing' });
    site(db, s, { kind: 'dismiss', id: tech.id });
    expect(s.staff!.some(m => m.id === tech.id)).toBe(false);
  });

  test(`отмена — последние ${SITE_UNDO} действий, цена — назад целиком`, () => {
    const s = emptyShift(db, 5);
    const room = site(db, s, { kind: 'room', type: 'room.waiting', x: 6, y: 6, w: 14, h: 14 }).room!;
    const spent: number[] = [s.works!.spent];
    // 55 стульев рядами от северной стены: ряд пола под ними — одним куском
    for (let k = 0; k < 55; k++) {
      site(db, s, { kind: 'item', room, item: { kind: 'chair', x: 7 + (k % 12), y: 7 + Math.floor(k / 12), rot: 0 } });
      spent.push(s.works!.spent);
    }
    expect(s.works!.undo.length).toBe(SITE_UNDO);
    for (let k = 0; k < SITE_UNDO; k++) {
      const n = site(db, s, { kind: 'undo' });
      expect(n.cost).toBe(-400);
    }
    expect(site(db, s, { kind: 'undo' }, false).error).toEqual({ kind: 'nothing' });
    expect(s.hospital!.site!.rooms[0].items.length).toBe(5);
    expect(s.works!.spent).toBe(spent[5]);
  });

  test('занятая койка убирается, когда освободится; номера коек лежащих — на тех же кроватях; отмена занятого — нет', () => {
    // зерно 22: к полудню в двух палатах лежат несколько человек, а освобождённую койку за две минуты перевода никто не занял
    // (с потоком по часам суток — spec 2026-10-day — у прежнего зерна 2 её тут же занимает новый больной)
    const s = cityShift(22);
    liveTo(db, s, 12);
    const rooms = () => s.hospital!.site!.rooms;
    const lying = Object.values(s.patients).filter(p => p.status === 'admitted' && p.stay && !onTable(p) && rooms().find(r => r.id === p.stay!.room)?.type === 'room.ward');
    // палата, где лежат двое: первого — перевести, его кровать — убрать; номер второго сдвинется, а кровать — та же
    const pair = lying.flatMap(a => lying.filter(b => b.stay!.room === a.stay!.room && b.stay!.bed > a.stay!.bed).map(b => [a, b] as const))[0];
    expect(pair).toBeDefined();
    const [first, p] = pair;
    const room = p.stay!.room;
    const roomOf = () => rooms().find(r => r.id === room)!;
    const mine = bedOrder(roomOf())[p.stay!.bed].id;
    const freed = bedOrder(roomOf())[first.stay!.bed].id;
    apply(db, s, { kind: 'transfer', id: first.id });
    expect(first.status).not.toBe('admitted');
    const was = p.stay!.bed;
    expect(site(db, s, { kind: 'remove', room, id: freed }).later).toBeUndefined();
    expect(roomOf().items.some(i => i.id === freed)).toBe(false);
    expect(p.stay!.bed).toBe(was - 1);
    expect(bedOrder(roomOf())[p.stay!.bed].id).toBe(mine);
    // его кровать — занята: уберут, когда освободится; до тех пор он на ней
    expect(site(db, s, { kind: 'remove', room, id: mine }).later).toBe(true);
    expect(roomOf().items.find(i => i.id === mine)!.leaving).toBe(true);
    expect(bedOrder(roomOf())[p.stay!.bed].id).toBe(mine);
    apply(db, s, { kind: 'advance', seconds: FREE_CHECK * 2 });
    expect(roomOf().items.some(i => i.id === mine)).toBe(true);
    apply(db, s, { kind: 'transfer', id: p.id });
    apply(db, s, { kind: 'advance', seconds: FREE_CHECK + 60 });
    expect(roomOf().items.some(i => i.id === mine)).toBe(false);
    // отмена, после которой пропала бы занятая койка, — нет: новая кровать в другой палате, на неё «ложится» лежащий
    const other = lying.find(x => x.stay!.room !== room && x.status === 'admitted' && !onTable(x));
    expect(other).toBeDefined();
    const r = rooms().find(x => x.id === other!.stay!.room)!;
    let placed = false;
    for (let y = r.y + 1; y < r.y + r.h - 1 && !placed; y++) {
      for (let x = r.x + 1; x < r.x + r.w - 1 && !placed; x++) {
        for (const rot of [0, 1, 2, 3] as const) {
          if (placed) break;
          placed = apply(db, s, { kind: 'site', cmd: { kind: 'item', room: r.id, item: { kind: 'bed', x, y, rot } } }).some(o => o.kind === 'site' && o.ok);
        }
      }
    }
    expect(placed).toBe(true);
    const fresh = rooms().find(x => x.id === r.id)!;
    other!.stay!.bed = bedOrder(fresh).findIndex(i => i.id === fresh.items[fresh.items.length - 1].id);
    expect(site(db, s, { kind: 'undo' }, false).error).toEqual({ kind: 'inUse' });
  }, 120_000);

  test('снос занятого помещения — когда освободится; до тех пор закрыто', () => {
    const s = cityShift(2);
    liveTo(db, s, 12);
    const ward = s.hospital!.site!.rooms.find(r => r.type === 'room.ward' && Object.values(s.patients).some(p => p.status === 'admitted' && p.stay?.room === r.id && !onTable(p)));
    expect(ward).toBeDefined();
    const n = site(db, s, { kind: 'demolish', room: ward!.id });
    expect(n.later).toBe(true);
    expect(working(s).has(ward!.id)).toBe(false);
    // переводить лежащих, пока палата не опустеет (кто на операции — после неё); снесут — не раньше
    const lying = () => Object.values(s.patients).filter(p => p.status === 'admitted' && p.stay?.room === ward!.id);
    for (let k = 0; k < 6 * 60 && s.hospital!.site!.rooms.some(r => r.id === ward!.id); k++) {
      expect(s.hospital!.site!.rooms.find(r => r.id === ward!.id)!.leaving).toBe(true);
      for (const p of lying()) apply(db, s, { kind: 'transfer', id: p.id });
      apply(db, s, { kind: 'advance', seconds: 60 });
    }
    expect(lying()).toEqual([]);
    expect(s.hospital!.site!.rooms.some(r => r.id === ward!.id)).toBe(false);
    expect(s.staff!.filter(m => m.room === ward!.id)).toEqual([]);
  }, 120_000);

  test('нанятый, который ведёт пациента, не увольняется', () => {
    const s = emptyShift(db, 8);
    buildProto(db, s);
    let busy: string | undefined;
    for (let k = 0; k < 6 * 60 && !busy; k++) {
      apply(db, s, { kind: 'advance', seconds: 60 });
      busy = Object.values(s.patients).find(p => p.status === 'inRoom' && p.by)?.by;
    }
    expect(busy).toBeDefined();
    expect(site(db, s, { kind: 'dismiss', id: busy! }, false).error).toEqual({ kind: 'busy' });
  }, 120_000);

  test('детерминизм: стройка посреди дня — тот же хэш при шаге 60 и 15 с', () => {
    const run = (step: number) => {
      const s = emptyShift(db, 9);
      const out: string[] = [];
      liveTo(db, s, 9, step);
      const ids = buildProto(db, s);
      liveTo(db, s, 10, step);
      out.push(hash(s));
      site(db, s, { kind: 'room', type: 'room.triage', x: 41, y: 6, w: 6, h: 7 });
      site(db, s, { kind: 'item', room: ids[1], item: { kind: 'plant', x: 18, y: 7, rot: 0 } });
      liveTo(db, s, 11, step);
      out.push(hash(s));
      site(db, s, { kind: 'undo' });
      site(db, s, { kind: 'demolish', room: ids[5] });
      liveTo(db, s, 13, step);
      out.push(hash(s));
      return out;
    };
    const a = run(60);
    expect(run(15)).toEqual(a);
  }, 180_000);

  test('стройка — только в потоке для ПК и больнице ПК: в «Смене» «Анамнеза» ничего не меняется', () => {
    const s = newSingle(db, { seed: 1, season: 'winter', venue: 'preset.city' });
    const h = s.hospital;
    const out = apply(db, s, { kind: 'site', cmd: { kind: 'room', type: 'room.office', x: 1, y: 1, w: 8, h: 7 } });
    expect(out).toEqual([{ kind: 'site', cmd: 'room', ok: false, error: { kind: 'mode' } }]);
    expect(s.hospital).toBe(h);
    expect(s.works).toBeUndefined();
  });

  test('готовая больница в потоке: всё работает, пациентов принимают', () => {
    const s = cityShift(10);
    expect(working(s).size).toBe(s.hospital!.site!.rooms.length);
    liveTo(db, s, 12);
    expect(sliceOf(s).seen).toBeGreaterThan(5);
    const plan = planOf(db, s.hospital!);
    expect(plan.mine).toBe('r3');
  }, 120_000);

  test('пустое здание: два входа, всё внутри — коридор; план без помещений', () => {
    const s = emptyShift(db, 11);
    const plan = planOf(db, s.hospital!);
    expect(plan.entrances!.map(e => [e.kind, e.cells.length])).toEqual([['main', 2], ['ambulance', 2]]);
    expect(plan.rooms).toEqual([]);
    expect(s.hospital!.corridor.length).toBe(46 * 26);
    expect(emptySite().w * emptySite().h).toBe(60 * 40);
    expect(PROTO.length).toBe(6);
  });
});
