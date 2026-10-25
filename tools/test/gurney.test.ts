// Санитары и каталки (spec docs/specs/2026-10-orderlies.md, «Проверки»): привезённого кладут — место в смотровой занято, пока
// санитар его не увёз; на операцию и назад — на каталке, операционная занята, пока его не увезли со стола; КТ лежачему —
// санитар ждёт у аппарата; санитара нет — везёт медсестра; никого — ждёт, срочные первыми; перевозку берёт тот, кто раньше
// будет у больного; те же зерно и команды — то же при любом шаге часов; без смен — как прежде; старое сохранение — с
// санитарами.
import { describe, expect, test } from 'bun:test';
import { db as base } from '../../src/content';
import type { ContentDb } from '../../src/content/types';
import { hospitalOf } from '../../src/engine/hospital/site';
import { siteOfPreset } from '../../src/engine/hospital/site-preset';
import { ORDERLY, presetStaff, type StaffMember, withNightShift } from '../../src/engine/hospital/staff';
import { apply, freeBays, hospitalCtx, newFlowShift, onTableIn, readyIn } from '../../src/engine/shift/engine';
import { carriersOf, planRide } from '../../src/engine/shift/gurney';
import { migrate } from '../../src/engine/shift/migrate';
import type { Ride, ShiftState } from '../../src/engine/shift/types';
import { walkPc } from '../../src/engine/shift/walking';
import { hash, site } from './site-kit';

const MIN = 60;
const H = 3600;
const G = base.economy.staff.gurney!;
/** Никто не болеет: болезнь сотрудника — своя ветвь зерна, здесь она мешала бы видеть перевозки. */
const db: ContentDb = { ...base, economy: { ...base.economy, staff: { ...base.economy.staff, growth: { ...base.economy.staff.growth!, sick: 1e9 } } } };
const rec = base.presets['preset.city'];
const citySite = siteOfPreset(base, rec);
const cityHospital = hospitalOf(base, citySite);
const legacy = presetStaff(base, rec);
const shifts = withNightShift(base, citySite.rooms, legacy);
const city = (seed: number, staff: StaffMember[] = shifts, flow = { perHour: 6, ambulancePerHour: 4 }) =>
  newFlowShift(db, { seed, season: 'winter', hospital: cityHospital, staff, flow });

/** Прожить до `t` шагами по `step` секунд; после каждого — `each` (перевозки, что записаны сейчас). */
function live(s: ShiftState, t: number, step: number, each?: (s: ShiftState) => void) {
  while (s.t < t) {
    apply(db, s, { kind: 'advance', seconds: Math.min(step, t - s.t) });
    each?.(s);
  }
}

/** Все записанные перевозки, как их видели в первый раз. */
function collect(): { seen: Map<string, Ride>; each: (s: ShiftState) => void } {
  const seen = new Map<string, Ride>();
  return {
    seen,
    each: s => {
      for (const r of s.rides ?? []) {
        const key = `${r.id}:${r.by}:${r.pick}`;
        if (!seen.has(key)) seen.set(key, structuredClone(r));
      }
    },
  };
}

describe('санитары и каталки', () => {
  test('числа — в economy.yaml: гипотезы агента; санитар — в смотровой и операционной, помещение работает и без него', () => {
    expect(G).toEqual({ load: 2, unload: 2 });
    expect(base.economy.staff.fatigue!.ride).toBe(1);
    expect(base.roles[ORDERLY]).toMatchObject({ optional: true, hire: true, salary: [900, 1400] });
    expect(base.roles[ORDERLY].rooms).toEqual(['room.emergency', 'room.or']);
    // без санитаров помещения работают — как прежде
    const s = city(1, shifts.filter(m => m.role !== ORDERLY));
    const ctx = hospitalCtx(db, s);
    for (const r of ctx.plan.rooms.filter(x => x.type === 'room.emergency' || x.type === 'room.or')) expect(ctx.working.has(r.id)).toBe(true);
  });

  test('привезённого кладут: место в смотровой занято, пока санитар его не увёз; на койке — когда довезли', () => {
    const s = city(2);
    const { seen, each } = collect();
    let held = 0;
    live(s, 30 * H, 60, x => {
      each(x);
      for (const r of x.rides ?? []) {
        if (r.why !== 'bed') continue;
        const p = x.patients[r.id];
        if (!p || p.status !== 'admitted') continue;
        // до `off` — на своём месте в смотровой (если пришёл оттуда), после — нет
        const bay = x.hospital!.site!.rooms.find(q => q.id === r.from)?.type === 'room.emergency';
        if (bay && x.t < r.off) {
          expect(p.bay?.room).toBe(r.from);
          held++;
        }
        if (x.t >= r.off) expect(p.bay).toBeUndefined();
      }
    });
    const beds = [...seen.values()].filter(r => r.why === 'bed');
    expect(beds.length).toBeGreaterThan(3);
    expect(held).toBeGreaterThan(0);
    for (const r of beds) {
      // время известно сразу: дойти, переложить, довезти, переложить, вернуться
      expect(r.off - r.pick).toBe(G.load * MIN);
      expect(r.done - r.drop).toBe(G.unload * MIN);
      expect(r.pick).toBeGreaterThanOrEqual(r.since);
      expect(r.home).toBeGreaterThanOrEqual(r.done);
    }
    // везут санитары: они в смене
    expect(beds.every(r => s.staff!.find(m => m.id === r.by)?.role === ORDERLY)).toBe(true);
  }, 120_000);

  test('на операцию и назад — на каталке: операция начинается, когда довезли; стол свободен, когда увезли', () => {
    const s = city(3, shifts, { perHour: 6, ambulancePerHour: 6 });
    const { seen, each } = collect();
    let busy = 0;
    live(s, 40 * H, 60, x => {
      each(x);
      for (const r of x.rides ?? []) {
        const op = x.patients[r.id]?.stay?.op;
        if (!op) continue;
        if (r.why === 'op') {
          expect(op.carried).toBe(true);
          expect(op.start).toBe(r.done);
          expect(op.room).toBe(r.to);
        }
        if (r.why === 'back' && x.t < r.off) {
          expect(op.off).toBe(r.off);
          expect(onTableIn(x, r.from)?.id).toBe(r.id);
          busy++;
        }
      }
    });
    const ops = [...seen.values()].filter(r => r.why === 'op');
    const back = [...seen.values()].filter(r => r.why === 'back');
    expect(ops.length).toBeGreaterThan(0);
    expect(back.length).toBeGreaterThan(0);
    expect(busy).toBeGreaterThan(0);
  }, 180_000);

  test('кто везёт: санитары смены; ни одного — медсестра того помещения, откуда везут; иначе ближайшая медсестра', () => {
    const s = city(4);
    const ctx = hospitalCtx(db, s);
    const er = ctx.plan.rooms.find(r => r.type === 'room.emergency')!.id;
    expect(carriersOf(ctx.plan, ctx.staff, er).every(m => m.role === ORDERLY)).toBe(true);
    const noOrderly = ctx.staff.filter(m => m.role !== ORDERLY);
    expect(carriersOf(ctx.plan, noOrderly, er).map(m => [m.role, m.room])).toEqual([['role.nurse', er]]);
    // медсестры смотровой нет — ближайшая
    const far = noOrderly.filter(m => !(m.role === 'role.nurse' && m.room === er));
    const near = carriersOf(ctx.plan, far, er);
    expect(near.length).toBe(1);
    const nurses = far.filter(m => m.role === 'role.nurse' && m.room !== undefined);
    expect(walkPc(ctx.plan, near[0].room, er)).toBe(Math.min(...nurses.map(m => walkPc(ctx.plan, m.room, er))));
    // никого — везти некому
    expect(carriersOf(ctx.plan, far.filter(m => m.role !== 'role.nurse'), er)).toEqual([]);
    expect(planRide(db, s, ctx.plan, far.filter(m => m.role !== 'role.nurse'), 'x', 'bed', er, er)).toBeUndefined();
  });

  test('два санитара — везёт тот, кто раньше будет у больного; занят — тот, кто освободится раньше', () => {
    const s = city(5);
    const ctx = hospitalCtx(db, s);
    const rooms = ctx.plan.rooms;
    const er = rooms.find(r => r.type === 'room.emergency')!.id;
    const ward = rooms.find(r => r.type === 'room.ward')!.id;
    const both = ctx.staff.filter(m => m.role === ORDERLY);
    expect(both.length).toBe(2);
    const first = planRide(db, s, ctx.plan, ctx.staff, 'x', 'bed', er, ward)!;
    const nearest = both.reduce((a, b) => (walkPc(ctx.plan, b.room, er) < walkPc(ctx.plan, a.room, er) ? b : a));
    expect(first.by).toBe(nearest.id);
    expect(first.pick).toBe(s.t + walkPc(ctx.plan, nearest.room, er));
    // записан до вечера — везёт другой
    s.rides = [{ ...first, go: s.t, home: s.t + 10 * H }];
    const second = planRide(db, s, ctx.plan, ctx.staff, 'y', 'bed', er, ward)!;
    expect(second.by).not.toBe(nearest.id);
  });

  test('никого, кто везёт, — ждёт; наняли санитара — везут сразу', () => {
    const s = city(6);
    // утро вторых суток, дневная смена: лежащие есть
    live(s, 34 * H, 600);
    const p = Object.values(s.patients).find(x => x.status === 'admitted' && x.stay);
    expect(p).toBeDefined();
    const ctx = hospitalCtx(db, s);
    const er = ctx.plan.rooms.find(r => r.type === 'room.emergency')!;
    // в смене — ни санитаров, ни медсестёр (в смене их нет: не на месте)
    s.staff = s.staff!.map(m => (m.role === ORDERLY || m.role === 'role.nurse' ? { ...m, room: undefined } : m));
    s.rideWait = [{ id: p!.id, why: 'bed', from: er.id, to: p!.stay!.room, since: s.t }];
    // нанять санитара в смотровую — перевозка записана на него
    site(db, s, { kind: 'hire', room: er.id, role: ORDERLY, shift: 'day' });
    expect(s.rideWait).toBeUndefined();
    const ride = s.rides!.find(r => r.id === p!.id)!;
    expect(s.staff!.find(m => m.id === ride.by)?.role).toBe(ORDERLY);
    expect(ride.since).toBeLessThanOrEqual(ride.pick);
  }, 120_000);

  test('снимок лежачему из смотровой: санитар везёт, ждёт у аппарата и везёт назад; везти некому — нельзя', () => {
    const s = city(7, shifts, { perHour: 2, ambulancePerHour: 6 });
    const imaging = Object.values(db.exams).filter(e => e.kind === 'imaging' && e.room && citySite.rooms.some(r => r.type === e.room)).map(e => e.id);
    let p: ShiftState['patients'][string] | undefined;
    let exam: string | undefined;
    live(s, 12 * H, 60, x => {
      if (exam) return;
      for (const q of Object.values(x.patients)) {
        if (q.kind !== 'ambulance' || !q.bay || q.status !== 'waiting' || q.closed) continue;
        exam = imaging.find(e => readyIn(db, x, q, e) !== undefined);
        if (exam) {
          p = q;
          break;
        }
      }
    });
    expect(exam).toBeDefined();
    const t = readyIn(db, s, p!, exam!);
    expect(t).toBeDefined();
    // туда и назад на каталке: перевозка на обследование записана бы сейчас
    const ctx = hospitalCtx(db, s);
    const room = ctx.plan.rooms.find(r => r.type === db.exams[exam!].room && r.door.length >= 2)!;
    const ride = planRide(db, s, ctx.plan, ctx.staff, p!.id, 'exam', p!.bay!.room, room.id, { exam: { seconds: 20 * MIN, ready: 0 } })!;
    expect(ride.exam!.start).toBeGreaterThanOrEqual(ride.done);
    expect(ride.exam!.off - ride.exam!.end).toBe(G.load * MIN);
    // вернулся на место — после того, как переложил назад (санитар смотровой — сразу там же)
    expect(ride.home).toBeGreaterThanOrEqual(ride.exam!.done);
    // никого, кто везёт: без санитаров и медсестёр в смене — КТ лежачему нельзя
    const keep = s.staff;
    s.staff = s.staff!.map(m => (m.role === ORDERLY || m.role === 'role.nurse' ? { ...m, room: undefined } : m));
    expect(readyIn(db, s, p!, exam!)).toBeUndefined();
    s.staff = keep;
    expect(readyIn(db, s, p!, exam!)).toBe(t);
  }, 120_000);

  test('те же зерно и команды — то же состояние при любом шаге часов', () => {
    const a = city(8);
    const b = city(8);
    live(a, 20 * H, 60);
    live(b, 20 * H, 997);
    expect(a.rides?.length ?? 0).toBe(b.rides?.length ?? 0);
    expect(hash(a)).toBe(hash(b));
  }, 180_000);

  test('без смен (сохранения до 0.9.0) — каталки нет: лежачий на месте сразу, как прежде', () => {
    const s = city(9, legacy);
    const { seen, each } = collect();
    live(s, 14 * H, 600, each);
    expect(seen.size).toBe(0);
    expect(s.rideWait).toBeUndefined();
    expect(freeBays(db, s).length).toBeGreaterThanOrEqual(0);
  }, 120_000);

  test('сохранение схемы 1: миграция ставит санитаров — в смотровой и операционной, в каждую смену', () => {
    const s = city(10, shifts.filter(m => m.role !== ORDERLY));
    const raw = JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
    const out = migrate(1, raw);
    const added = out.staff!.filter(m => m.role === ORDERLY);
    const posts = citySite.rooms.filter(r => r.type === 'room.emergency' || r.type === 'room.or').map(r => r.id).sort();
    for (const shift of ['day', 'night'] as const) expect(added.filter(m => m.shift === shift).map(m => m.room).sort()).toEqual(posts);
    expect(added.every(m => m.skill === 3 && m.salary === 1150 && m.days === 0)).toBe(true);
    expect(new Set(out.staff!.map(m => m.id)).size).toBe(out.staff!.length);
    // второй раз — не добавляет; без смен — тоже
    expect(migrate(1, JSON.parse(JSON.stringify(out)) as Record<string, unknown>).staff!.length).toBe(out.staff!.length);
    expect(migrate(1, JSON.parse(JSON.stringify(city(10, legacy))) as Record<string, unknown>).staff!.some(m => m.role === ORDERLY)).toBe(false);
  });
});
