// Поликлиника по нормам проектирования (spec docs/specs/2026-10-real-hospital.md): план из базы строится той же функцией, что
// команда стройки `ready`, — так же, как поставил бы игрок; работает всё, больница открыта, ваш кабинет — первый. Правила
// планировки: у каждого кабинета врача зал ожидания не дальше 10 м и не меньше пяти мест на кабинет; регистратура и
// доврачебный кабинет — ближе всего ко входу. Детерминизм; пациенты приходят, и их принимают.
import { describe, expect, setDefaultTimeout, test } from 'bun:test';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { db } from '../../src/content';
import type { SitePlan } from '../../src/content/types';
import { doctorRoom, openBlocks } from '../../src/engine/hospital/requirements';
import { emptySite, hospitalOf, planOfSite, readyCost } from '../../src/engine/hospital/site';
import { siteOfPlan } from '../../src/engine/hospital/site-plan';
import { staffingOf } from '../../src/engine/hospital/staff';
import { metersBetween, metersFromEntrance } from '../../src/engine/hospital/walk';
import { apply, hospitalCtx, newFlowShift } from '../../src/engine/shift/engine';
import { cashNow, startCash } from '../../src/engine/shift/money';
import type { ShiftState } from '../../src/engine/shift/types';
import { buildDb, CONTENT_DIR } from '../content/load';
import { hash, site } from './site-kit';

// испорченная копия базы собирается целиком — около половины секунды, а копий в тесте пять
setDefaultTimeout(60_000);

const PLAN: SitePlan = db.sites!['site.polyclinic'];
const built = siteOfPlan(db, PLAN);
if (!built.ok) throw new Error(`поликлиника не строится: ${JSON.stringify(built)}`);
const { site: poly, staff } = built;
const plan = planOfSite(db, poly);
const ids = (type: string) => plan.rooms.filter(r => r.type === type).map(r => r.id);
/** Смена в поликлинике с потоком от больницы и кассой готовой больницы. */
const shift = (seed: number): ShiftState =>
  newFlowShift(db, { seed, season: 'winter', hospital: hospitalOf(db, poly), staff, flow: { perHour: 0, auto: true }, economy: { cash: startCash(db, 'poly') } });

describe('поликлиника — план из базы', () => {
  test('строится, как поставил бы игрок готовыми помещениями: те же стены, двери и вещи, та же цена', () => {
    const s = newFlowShift(db, { seed: 1, season: 'winter', hospital: hospitalOf(db, emptySite()), staff: [], flow: { perHour: 0, auto: true }, economy: { cash: startCash(db, 'empty') } });
    const before = cashNow(s)!;
    for (const r of PLAN.rooms) {
      const room = site(db, s, { kind: 'ready', type: r.type, size: r.size, x: r.x, y: r.y, rot: r.rot, staff: !r.mine }).room!;
      if (r.mine) site(db, s, { kind: 'office', room });
    }
    const by = s.hospital!.site!;
    expect(by.rooms).toEqual(poly.rooms);
    expect(by.mine).toBe(poly.mine);
    expect(before - cashNow(s)!).toBe(PLAN.rooms.reduce((n, r) => n + readyCost(db, r.type, r.size), 0));
    // люди — на тех же должностях тех же помещений
    const posts = (list: readonly { role: string; room?: string }[]) => list.map(m => `${m.room}:${m.role}`).sort();
    expect(posts(s.staff ?? [])).toEqual(posts(staff));
  });

  test('всё работает, больница открыта; ваш кабинет — первый, в остальных — терапевты; на каждой должности по человеку', () => {
    const staffed = staffingOf(db, plan, staff);
    const ctx = hospitalCtx(db, shift(1));
    expect([...ctx.working].sort()).toEqual(plan.rooms.map(r => r.id).sort());
    expect(openBlocks(db, plan, ctx.working, staffed)).toEqual([]);
    const offices = ids('room.office');
    expect(offices.length).toBe(4);
    expect(doctorRoom(plan)).toBe(offices[0]);
    expect(staff.filter(m => m.role === 'role.therapist').map(m => m.room).sort()).toEqual(offices.slice(1).sort());
    const want = plan.rooms.flatMap(r => db.rooms[r.type].staff.filter(p => !(r.id === offices[0] && p === 'role.doctor')).map(p => `${r.id}:${p}`)).sort();
    expect(staff.map(m => `${m.room}:${db.roles[m.role].stands ?? m.role}`).sort()).toEqual(want);
  });

  test('залы ожидания у кабинетов: ближний — не дальше 10 м от двери кабинета, мест — не меньше пяти на кабинет', () => {
    const halls = ids('room.waiting');
    const offices = ids('room.office');
    const served = new Map<string, number>();
    for (const o of offices) {
      const near = halls.map(h => [h, metersBetween(plan, h, o)!] as const).sort((a, b) => a[1] - b[1])[0];
      expect(`${o}: ${near[1]} м`).toBe(`${o}: ${Math.min(near[1], 10)} м`);
      served.set(near[0], (served.get(near[0]) ?? 0) + 1);
    }
    for (const [h, n] of served) expect(plan.rooms.find(r => r.id === h)!.seats.length).toBeGreaterThanOrEqual(5 * n);
  });

  test('регистратура и доврачебный кабинет — ближе всех ко входу', () => {
    const from = plan.rooms.map(r => [r.type, metersFromEntrance(plan, r.id)!] as const).sort((a, b) => a[1] - b[1]);
    expect(from.slice(0, 2).map(([t]) => t).sort()).toEqual(['room.reception', 'room.triage']);
  });

  test('чего игрок не поставил бы, в базу не попадёт: помещение на чужом полу, дверь в стену, второй ваш кабинет, без ординаторской', () => {
    /** Ошибки сборки базы, где в записи поликлиники `from` заменено на `to`. */
    const broken = (from: string, to: string): string[] => {
      const dir = mkdtempSync(join(tmpdir(), 'bolnitsa-content-'));
      try {
        cpSync(CONTENT_DIR, dir, { recursive: true });
        const file = join(dir, 'hospital/sites/polyclinic.yaml');
        const text = readFileSync(file, 'utf8');
        if (!text.includes(from)) throw new Error(`в записи нет «${from}»`);
        writeFileSync(file, text.replace(from, to));
        return buildDb(dir).errors;
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    };
    expect(broken('{ type: room.toilet, size: S, x: 20,', '{ type: room.toilet, size: S, x: 23,')).toEqual(['site.polyclinic: помещение 3 (room.lab) не ставится: overlap']);
    expect(broken('{ type: room.reception, size: S, x: 22, y: 26, rot: 2 }', '{ type: room.reception, size: S, x: 22, y: 26, rot: 0 }')).toEqual(['site.polyclinic: помещение 11 (room.reception) не ставится: doorTo']);
    expect(broken('{ type: room.office, size: M, x: 13, y: 6, rot: 0 }', '{ type: room.office, size: M, x: 13, y: 6, rot: 0, mine: true }')).toEqual(['site.polyclinic: ваш кабинет — один, и это кабинет врача']);
    expect(broken('  - { type: room.staff, size: M, x: 44, y: 6, rot: 0 }\n', '')).toContain('site.polyclinic: room.office (r2) не работает: noPlace');
    expect(broken('{ type: room.lab, size: S', '{ type: room.lab, size: L')).toEqual(['site.polyclinic: у room.lab нет образца L']);
  });

  test('детерминизм: тот же план — та же больница и те же люди; то же зерно — те же сутки', () => {
    expect(hash(siteOfPlan(db, PLAN))).toBe(hash(built));
    const day = (seed: number) => {
      const s = shift(seed);
      while (s.t < 32 * 3600) apply(db, s, { kind: 'advance', seconds: 600 });
      return s.history;
    };
    expect(hash(day(2))).toBe(hash(day(2)));
  });

  test('сутки: пациенты приходят, их принимают нанятые терапевты, ушедших — не больше 2 %', () => {
    const s = shift(1);
    while (s.t < 32 * 3600) apply(db, s, { kind: 'advance', seconds: 600 });
    const d = s.history[0];
    const seen = Object.values(d.colleagues ?? {}).reduce((n, c) => n + c.seen, d.seen);
    expect(d.arrived).toBeGreaterThan(50);
    expect(seen).toBeGreaterThanOrEqual(d.arrived - 5);
    // до медленного шага (0.42.0, решение владельца #132) в этих сутках не ушёл никто; теперь пожилые и «жёлтые» дольше
    // идут к врачу и на обследования, и один из 85 не дождался: молодого «зелёного» обогнали «жёлтые». За неделю
    // симулятора экономики в поликлинике ушли 1,6 % (до того — 1,9 %)
    expect(d.left / d.arrived).toBeLessThanOrEqual(0.02);
  });
});
