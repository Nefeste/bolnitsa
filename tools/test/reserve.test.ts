// Резерв (spec docs/specs/2026-10-staff-mood.md, часть 5; решение владельца #97): «Нанять в резерв» — без места и смены, с
// зарплатой каждый день. Заболел или ушёл учиться — на его место сам встаёт резерв той же должности, с его сменой; вернулся —
// замещающий снова в резерве; ушёл насовсем — место за замещающим. На планёрке — кто кого заменил и кто вернулся в резерв.
// Отмена стройки и сохранение — без потерь; при любом шаге часов — то же.
import { describe, expect, test } from 'bun:test';
import { db as base } from '../../src/content';
import type { ContentDb } from '../../src/content/types';
import { hospitalOf } from '../../src/engine/hospital/site';
import { siteOfPreset } from '../../src/engine/hospital/site-preset';
import { dutyOf, payOf, presetStaff, type StaffMember, wageOf, wagesOf, withNightShift } from '../../src/engine/hospital/staff';
import { apply, newFlowShift } from '../../src/engine/shift/engine';
import { SAVE_SCHEMA } from '../../src/engine/shift/migrate';
import { cover } from '../../src/engine/shift/reserve';
import type { Notice, ShiftState, StaffNews } from '../../src/engine/shift/types';
import { pack, unpack } from '../../src/sim/packing';
import { hash, site } from './site-kit';

const H = 3600;
const DAY = 86400;
const G = base.economy.staff.growth!;
const withSick = (sick: number): ContentDb => ({ ...base, economy: { ...base.economy, staff: { ...base.economy.staff, growth: { ...G, sick } } } });
const db = withSick(1e9);
const rec = base.presets['preset.city'];
const citySite = siteOfPreset(base, rec);
const cityHospital = hospitalOf(base, citySite);
const shifts = withNightShift(base, citySite.rooms, presetStaff(base, rec));
const city = (d: ContentDb, seed: number, staff: StaffMember[] = shifts) =>
  newFlowShift(d, { seed, season: 'winter', hospital: cityHospital, staff, flow: { perHour: 0, ambulancePerHour: 0 }, economy: { cash: 500_000 } });
function run(d: ContentDb, s: ShiftState, t: number, step = 600): Notice[] {
  const out: Notice[] = [];
  while (s.t < t) out.push(...apply(d, s, { kind: 'advance', seconds: Math.min(step, t - s.t) }));
  return out;
}
function morning(d: ContentDb, s: ShiftState): StaffNews | undefined {
  const n = run(d, s, s.day * DAY + 8 * H).find(x => x.kind === 'morning');
  return n?.kind === 'morning' ? n.staff : undefined;
}
const member = (s: ShiftState, id: string) => s.staff!.find(m => m.id === id)!;
/** Дневной регистратор с местом. */
const receptionist = (s: ShiftState) => s.staff!.find(m => m.role === 'role.registrar' && m.shift === 'day' && m.room !== undefined)!;
/** Нанять в резерв — номер нового. */
function reserve(d: ContentDb, s: ShiftState, role: string): string {
  const before = new Set(s.staff!.map(m => m.id));
  expect(site(d, s, { kind: 'reserve', role }).ok).toBe(true);
  return s.staff!.find(m => !before.has(m.id))!.id;
}

describe('резерв', () => {
  test('«Нанять в резерв»: без места и смены, зарплата — каждый день; отмена стройки его убирает', () => {
    const s = city(db, 1);
    const wages = wagesOf(db, s.staff!);
    const id = reserve(db, s, 'role.registrar');
    expect(member(s, id)).toMatchObject({ role: 'role.registrar', skill: 3, days: 0 });
    expect(member(s, id).room).toBeUndefined();
    expect(member(s, id).shift).toBeUndefined();
    expect(wagesOf(db, s.staff!)).toBe(wages + member(s, id).salary);
    // нанять нельзя — нет такой должности
    expect(site(db, s, { kind: 'reserve', role: 'role.nobody' }, false)).toMatchObject({ ok: false, error: { kind: 'unknown' } });
    site(db, s, { kind: 'undo' });
    expect(s.staff!.some(m => m.id === id)).toBe(false);
  });

  test('заболел — на его место встаёт резерв той же должности, с его сменой; поправился — замещающий снова в резерве', () => {
    // болеют все — болезнь у каждого, кто с местом; резерв не болеет
    const d = withSick(1);
    const s = city(d, 2);
    const r = receptionist(s);
    const id = reserve(d, s, 'role.registrar');
    const news = morning(d, s);
    expect(news?.sick).toContain(r.id);
    const cov = news?.covered?.find(x => x.id === r.id);
    expect(cov?.by).toBe(id);
    expect(member(s, id)).toMatchObject({ room: r.room, shift: r.shift, covers: r.id });
    // в смене — он, а не заболевший; место по-прежнему за заболевшим
    const duty = dutyOf(d, s.staff!, s.t);
    expect(duty.some(m => m.id === id)).toBe(true);
    expect(duty.some(m => m.id === r.id)).toBe(false);
    expect(member(s, r.id).room).toBe(r.room);
    // замещающий в смене сам может заболеть; к следующей планёрке поправившийся вернулся — замещающий в резерве
    const d0 = withSick(1e9);
    const next = morning(d0, s);
    expect(member(s, r.id).away).toBeUndefined();
    expect(next?.returned).toContain(id);
    expect(member(s, id).room).toBeUndefined();
    expect(member(s, id).covers).toBeUndefined();
  }, 60_000);

  test('«Отправить учиться» — резерв встаёт сразу; уволили ушедшего учиться — место за замещающим', () => {
    const s = city(db, 3);
    const r = receptionist(s);
    const id = reserve(db, s, 'role.registrar');
    run(db, s, 10 * H);
    expect(site(db, s, { kind: 'study', id: r.id }).ok).toBe(true);
    expect(member(s, id)).toMatchObject({ room: r.room, shift: r.shift, covers: r.id });
    expect(dutyOf(db, s.staff!, s.t).some(m => m.id === id)).toBe(true);
    // уволили того, кто учится, — замещающий остаётся на месте, уже не замещая
    expect(site(db, s, { kind: 'dismiss', id: r.id }).ok).toBe(true);
    expect(member(s, id).room).toBe(r.room);
    expect(member(s, id).covers).toBeUndefined();
    // резерва другой должности не хватит: место медсестры без замены
    const s2 = city(db, 3);
    const nurse = s2.staff!.find(m => m.role === 'role.nurse' && m.shift === 'day' && m.room !== undefined)!;
    reserve(db, s2, 'role.registrar');
    run(db, s2, 10 * H);
    site(db, s2, { kind: 'study', id: nurse.id });
    expect(s2.staff!.some(m => m.covers === nurse.id)).toBe(false);
  }, 60_000);

  test('ночное место — с ночной надбавкой, «В другую смену» замещающему нельзя; отмена найма — место снова пустое', () => {
    const s = city(db, 5);
    const night = s.staff!.find(m => m.role === 'role.nurse' && m.shift === 'night' && m.room !== undefined)!;
    const id = reserve(db, s, 'role.nurse');
    expect(wageOf(db, member(s, id))).toBe(member(s, id).salary);
    run(db, s, 10 * H);
    expect(site(db, s, { kind: 'study', id: night.id }).ok).toBe(true);
    expect(member(s, id)).toMatchObject({ room: night.room, shift: 'night', covers: night.id });
    expect(wageOf(db, member(s, id))).toBe(payOf(db, member(s, id).salary, 'night'));
    expect(wageOf(db, member(s, id))).toBeGreaterThan(member(s, id).salary);
    expect(site(db, s, { kind: 'reshift', id }, false)).toMatchObject({ ok: false, error: { kind: 'nothing' } });
    // учёба не отменяется, найм в резерв — да: его нет, место учащегося пустое
    site(db, s, { kind: 'undo' });
    expect(s.staff!.some(m => m.id === id)).toBe(false);
    expect(s.staff!.some(m => m.covers === night.id)).toBe(false);
    expect(member(s, night.id).away?.why).toBe('study');
  }, 60_000);

  test('в сохранении — как есть; те же зерно и команды — то же при любом шаге часов', async () => {
    const play = (step: number) => {
      const d = withSick(3);
      const s = city(d, 4);
      reserve(d, s, 'role.registrar');
      reserve(d, s, 'role.nurse');
      const news: StaffNews[] = [];
      for (let i = 0; i < 4; i++) for (const n of run(d, s, (i + 1) * DAY + 8 * H, step)) if (n.kind === 'morning' && n.staff) news.push(n.staff);
      return { s, news };
    };
    const a = play(600);
    const b = play(1800);
    expect(hash(a.s.staff)).toBe(hash(b.s.staff));
    expect(hash(a.news)).toBe(hash(b.news));
    expect(hash(a.s.economy)).toBe(hash(b.s.economy));
    // болеют раз в три смены — за четыре планёрки резерв кого-то заменил и вернулся
    expect(a.news.some(n => n.covered?.length)).toBe(true);
    expect(a.news.some(n => n.returned?.length)).toBe(true);
    const back = (await unpack(await pack({ schema: SAVE_SCHEMA, meta: { kind: 'manual', savedAt: '2026-10-25T12:00:00.000Z', version: '0.26.0', start: 'preset', day: a.s.day, t: a.s.t }, state: a.s }))).state;
    expect(back.staff).toEqual(a.s.staff);
  }, 120_000);
});

// Правило замещения само по себе — на штате, собранном руками: смены, отлучки, занятые
const person = (id: string, more: Partial<StaffMember> = {}): StaffMember => ({ id, role: 'role.nurse', sex: 'f', seed: 1, skill: 3, salary: 1700, days: 0, ...more });
const team = (staff: StaffMember[]) => ({ staff }) as unknown as ShiftState;
const free = () => new Set<string>();

describe('резерв: кто встаёт и кто возвращается', () => {
  test('ведёт пациента — доводит, и только потом в резерв', () => {
    const s = team([person('a', { room: 'r1', shift: 'night' }), person('r', { room: 'r1', shift: 'night', covers: 'a' })]);
    expect(cover(s, () => new Set(['r']))).toBeUndefined();
    expect(s.staff![1].covers).toBe('a');
    expect(cover(s, free)).toEqual({ returned: ['r'] });
    expect(s.staff![1]).toEqual(person('r'));
  });

  test('заболел сам замещающий — в резерв, на место — следующий из резерва', () => {
    const away = { why: 'sick' as const, until: DAY };
    const s = team([person('a', { room: 'r1', shift: 'day', away }), person('r', { room: 'r1', shift: 'day', covers: 'a', away }), person('q')]);
    expect(cover(s, free)).toEqual({ covered: [{ id: 'a', by: 'q' }] });
    expect(s.staff![1]).toEqual(person('r', { away }));
    expect(s.staff![2]).toMatchObject({ room: 'r1', shift: 'day', covers: 'a' });
  });

  test('ушёл насовсем — место за замещающим; резерв другой должности не встаёт', () => {
    const s = team([person('r', { room: 'r1', shift: 'day', covers: 'gone' }), person('b', { role: 'role.registrar', room: 'r2', shift: 'day', away: { why: 'study', until: DAY } }), person('q')]);
    expect(cover(s, free)).toBeUndefined();
    expect(s.staff![0]).toEqual(person('r', { room: 'r1', shift: 'day' }));
    expect(s.staff![2].room).toBeUndefined();
  });

  test('вернувшийся сразу встаёт на другое пустое место — в новостях только «заменил»', () => {
    const s = team([person('a', { room: 'r1', shift: 'day' }), person('r', { room: 'r1', shift: 'day', covers: 'a' }), person('b', { room: 'r2', shift: 'night', away: { why: 'sick', until: DAY } })]);
    expect(cover(s, free)).toEqual({ covered: [{ id: 'b', by: 'r' }] });
    expect(s.staff![1]).toMatchObject({ room: 'r2', shift: 'night', covers: 'b' });
  });

  test('отсутствующего перевели в другую смену — замещающий встаёт за ним туда', () => {
    const away = { why: 'study' as const, until: DAY };
    const s = team([person('a', { room: 'r1', shift: 'night', away }), person('r', { room: 'r1', shift: 'day', covers: 'a' })]);
    expect(cover(s, free)).toEqual({ covered: [{ id: 'a', by: 'r' }] });
    expect(s.staff![1]).toMatchObject({ room: 'r1', shift: 'night', covers: 'a' });
  });

  test('без смен и без отлучек — ничего', () => {
    const s = team([person('a', { room: 'r1', away: { why: 'sick', until: DAY } }), person('q')]);
    expect(cover(s, free)).toBeUndefined();
    expect(s.staff![1].room).toBeUndefined();
    const t = team([person('a', { room: 'r1', shift: 'day' }), person('q')]);
    const was = t.staff;
    expect(cover(t, () => { throw new Error('не нужно'); })).toBeUndefined();
    expect(t.staff).toBe(was);
  });
});
