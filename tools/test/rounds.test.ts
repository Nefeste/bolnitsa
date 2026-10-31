// Утренний обход (spec docs/specs/2026-10-staff-motion.md, часть 2, «Проверки»; решения владельца #166 и #181): в 08:30 нанятый
// врач с лежащими допринимает текущего и уходит; часы остановок — по `walkPc` и `round.bed`; до возвращения он никого не
// зовёт; решение — в минуту у койки; ждущие его ждут «на обходе», ушедшие — своя причина; врача нет — обходит замещающий или
// врач той же должности; клиническая медсестра обходит все койки своего помещения, и врач идёт туда только к тем, кому нужно
// решение; те же зерно и команды — тот же обход при любом шаге часов; в поликлинике обхода нет.
import { beforeAll, describe, expect, test } from 'bun:test';
import { db as base } from '../../src/content';
import type { ContentDb } from '../../src/content/types';
import type { Plan } from '../../src/engine/hospital/build';
import { hospitalOf } from '../../src/engine/hospital/site';
import { siteOfPlan } from '../../src/engine/hospital/site-plan';
import { siteOfPreset } from '../../src/engine/hospital/site-preset';
import { presetStaff, type StaffMember, withNightShift } from '../../src/engine/hospital/staff';
import { apply, colleaguesOf, hospitalCtx, inpatientsOf, newFlowShift } from '../../src/engine/shift/engine';
import { startCash } from '../../src/engine/shift/money';
import { CLINICAL, needsDecision, roundOf, roundsDue } from '../../src/engine/shift/rounds';
import { DAY, type Round, type ShiftPatient, type ShiftState } from '../../src/engine/shift/types';
import { walkPc } from '../../src/engine/shift/walking';
import { daysIn, wardState } from '../../src/engine/shift/ward';
import { hash, site } from './site-kit';

const MIN = 60;
const LONG = 120_000;
const R = base.economy.staff.round!;
/** Никто не болеет: болезнь — своя ветвь зерна, здесь она мешала бы видеть обход. */
const db: ContentDb = { ...base, economy: { ...base.economy, staff: { ...base.economy.staff, growth: { ...base.economy.staff.growth!, sick: 1e9 } } } };
const rec = base.presets['preset.city'];
const citySite = siteOfPreset(base, rec);
const cityHospital = hospitalOf(base, citySite);
const cityStaff = withNightShift(base, citySite.rooms, presetStaff(base, rec));
/** Город, как у симулятора экономики и пробы `tools/bench/rounds.ts`: поток от больницы, касса начала. */
const city = (seed: number, staff: StaffMember[] = cityStaff) =>
  newFlowShift(db, { seed, season: 'winter', hospital: cityHospital, staff, flow: { perHour: 0, auto: true }, economy: { cash: startCash(db, 'preset') } });

function live(s: ShiftState, t: number, step = 600, each?: (s: ShiftState) => void) {
  while (s.t < t) {
    apply(db, s, { kind: 'advance', seconds: Math.min(step, t - s.t) });
    each?.(s);
  }
}

/** 08:30 суток `d`: первые начинаются в 08:00 — обход в первое же утро. */
const roundsAt = (t0: number, d: number) => t0 + d * DAY + 30 * MIN;

/** Остановки обхода — по `walkPc` и `round.bed`: от места к ближнему помещению, по койкам, назад. */
function checkTimes(plan: Plan, home: string | undefined, r: Round) {
  let at = home;
  let now = r.from;
  const left = new Set(r.stops.map(st => st.room));
  for (const st of r.stops) {
    if (st.room !== at) {
      // ближнее из оставшихся помещений
      if (at !== home) left.delete(at!);
      const best = Math.min(...[...left].map(x => walkPc(plan, at, x)));
      expect(walkPc(plan, at, st.room)).toBe(best);
      now += walkPc(plan, at, st.room);
      at = st.room;
    }
    expect(st.at).toBe(now);
    expect(st.end).toBe(now + R.bed * MIN);
    now = st.end;
  }
  expect(r.until).toBe(now + walkPc(plan, at, home));
}

/** Что увидели за четверо суток города: первые обходы каждого врача по утрам, часы его «стола», ждущих, решения у коек. */
interface Seen {
  s: ShiftState;
  t0: number;
  /** кого в 08:30 ждёт обход (`due` и уже ушедшие) и обходы врачей — по суткам */
  days: { lead: Set<string>; first: Map<string, Round>; docs: Map<string, StaffMember> }[];
  /** «стол» врача на обходе — не до конца обхода */
  desk: number;
  /** ждущие врача, ушедшего на обход: путь кончается «на обходе» до его возвращения / всего */
  waits: [number, number];
  /** выписанные на обходе: в минуту остановки / раньше / позже */
  decided: [number, number, number];
}

function observe(seed: number, nights: number): Seen {
  const s = city(seed);
  const t0 = s.t;
  const out: Seen = { s, t0, days: [], desk: 0, waits: [0, 0], decided: [0, 0, 0] };
  for (let d = 0; d < nights; d++) {
    live(s, roundsAt(t0, d) - MIN);
    if (d === 0) expect(s.rounds).toBeUndefined();
    // кому из лежащих на обходе выписка
    const docs = new Map(colleaguesOf(db, s, roundsAt(t0, d)).map(m => [m.id, m] as const));
    const ready = new Set(inpatientsOf(s).filter(p => p.closed?.by && needsDecision(p, s.day) && wardState(p.stay!, daysIn(p.stay!, s.day)) === 'ready').map(p => p.id));
    const first = new Map<string, Round>();
    // кто ждал какого врача минуту назад: те, кого он застал, уходя на обход
    let waiting = new Map<string, string[]>();
    const before = (x: ShiftState) => {
      waiting = new Map();
      for (const p of Object.values(x.patients)) {
        const by = p.by ?? p.doc;
        if (p.status === 'waiting' && by !== undefined) waiting.set(by, [...(waiting.get(by) ?? []), p.id]);
      }
    };
    before(s);
    let lead: Set<string> | undefined;
    live(s, roundsAt(t0, d) + 3 * 3600, 60, x => {
      // в 08:30: кого ждёт обход — список `due` и уже ушедшие
      lead ??= new Set([...Object.keys(x.rounds!.due), ...x.rounds!.on.filter(r => !r.nurse).map(r => r.by)]);
      for (const r of x.rounds?.on ?? []) {
        if (r.nurse || first.has(r.by)) continue;
        first.set(r.by, r);
        // ждавшие его — «врач на обходе, вернётся в …»
        for (const id of waiting.get(r.by) ?? []) {
          const p = x.patients[id];
          if (p?.status !== 'waiting' || (p.by ?? p.doc) !== r.by) continue;
          out.waits[1]++;
          if (x.journeys?.of[id]?.steps.some(st => st.k === 'rest' && st.round && st.by === r.by && st.until === r.until)) out.waits[0]++;
        }
      }
      for (const r of first.values()) {
        if (x.t < r.until && x.desk?.[r.by] !== r.until) out.desk++;
        for (const st of r.stops) {
          if (!ready.has(st.id)) continue;
          const lying = x.patients[st.id]?.status === 'admitted';
          if (x.t < st.end && !lying) {
            out.decided[1]++;
            ready.delete(st.id);
          } else if (x.t >= st.end) {
            out.decided[lying ? 2 : 0]++;
            ready.delete(st.id);
          }
        }
      }
      before(x);
    });
    out.days.push({ lead: lead!, first, docs });
  }
  return out;
}

describe('утренний обход', () => {
  let seen: Seen;
  // четверо суток города, в часы обхода — по минуте: дольше обычного теста
  beforeAll(() => {
    seen = observe(3, 4);
  }, LONG);

  test('числа — в economy.yaml и day.yaml: гипотезы агента; клиническая медсестра — необязательная, только днём, готовые её не нанимают', () => {
    expect(R).toEqual({ bed: 3, fatigue: 1 });
    expect(base.day!.rounds).toBe(8.5);
    expect(base.roles[CLINICAL]).toMatchObject({ optional: true, ready: false, day: true });
    for (const room of ['room.ward', 'room.icu', 'room.ricu', 'room.box']) expect(base.rooms[room].staff).toContain(CLINICAL);
    // готовые больницы её не нанимают: выбор игрока с ценой
    expect(cityStaff.some(m => m.role === CLINICAL)).toBe(false);
    // у остальных должностей флагов нет: их записи в сборке прежние
    expect(Object.values(base.roles).filter(r => r.ready === false || r.day).map(r => r.id)).toEqual([CLINICAL]);
  });

  test('в 08:30 каждый врач с лежащими уходит на обход: путь и часы — по walkPc и round.bed', () => {
    const plan = hospitalCtx(db, seen.s).plan;
    let rounds = 0;
    for (const [d, day] of seen.days.entries()) {
      // кто свободен в 08:30 — ушёл сразу; занятые — когда допримут текущего
      expect([...day.first.keys()].sort()).toEqual([...day.lead].sort());
      for (const r of day.first.values()) {
        expect(r.from).toBeGreaterThanOrEqual(roundsAt(seen.t0, d));
        expect(r.from).toBeLessThan(roundsAt(seen.t0, d) + 3600);
        expect(r.stops.length).toBeGreaterThan(0);
        checkTimes(plan, day.docs.get(r.by)!.room, r);
        rounds++;
      }
    }
    expect(rounds).toBeGreaterThanOrEqual(seen.days.length);
  });

  test('до возвращения врач никого не зовёт; ждущие его ждут «на обходе»', () => {
    expect(seen.desk).toBe(0);
    expect(seen.waits[1]).toBeGreaterThan(0);
    expect(seen.waits[0]).toBe(seen.waits[1]);
  });

  test('решение — у койки, в минуту, когда кончились минуты врача у неё', () => {
    const [at, early, late] = seen.decided;
    expect(at).toBeGreaterThan(0);
    expect(early).toBe(0);
    expect(late).toBe(0);
  });

  test('ушедшие, пока их врач на обходе, — своя причина в «почему?» планёрки', () => {
    const round = seen.s.history.reduce((n, d) => n + (d.leftBy?.why.round ?? 0), 0);
    expect(round).toBeGreaterThan(0);
  });

  test('врача нет — лежащих обходит замещающий, иначе врач той же должности, у кого своих меньше; никого — не обходят', () => {
    const doc = (id: string, role = 'role.therapist', more: Partial<StaffMember> = {}): StaffMember =>
      ({ id, role, room: `r-${id}`, sex: 'm', skill: 3, shift: 'day', ...more }) as StaffMember;
    const lying = (id: string, by: string): ShiftPatient =>
      ({ id, status: 'admitted', closed: { by }, stay: { room: 'ward-1', bed: Number(id.slice(1)), since: 0, setting: 'admit' } }) as unknown as ShiftPatient;
    const a = doc('a');
    const b = doc('b');
    const c = doc('c', 'role.endocrinologist');
    const sick = doc('x', 'role.therapist', { away: { why: 'sick', until: 1 } });
    const cover = doc('z', 'role.therapist', { covers: 'x' });
    const all = [a, b, c, sick, cover];
    const ps = [lying('p1', 'a'), lying('p2', 'a'), lying('p3', 'x'), lying('p4', 'c'), lying('p5', 'y')];
    // на посту отсутствующего — резерв: его лежащие у резерва; чьего врача нет в штате — у того, у кого своих меньше
    expect(roundsDue([a, b, c, cover], all, ps, new Set(), 2)).toEqual({ a: ['p1', 'p2'], z: ['p3'], c: ['p4'], b: ['p5'] });
    // резерва нет — врач той же должности, у кого своих меньше: b (у a — двое)
    expect(roundsDue([a, b, c], all, ps.slice(0, 4), new Set(), 2)).toEqual({ a: ['p1', 'p2'], b: ['p3'], c: ['p4'] });
    // эндокринолога нет в смене, другого эндокринолога нет — его лежащих сегодня не обходят
    expect(roundsDue([a, b], all, ps.slice(0, 4), new Set(), 2)).toEqual({ a: ['p1', 'p2'], b: ['p3'] });
  });

  test('клиническая медсестра: в её помещении врач не идёт к тем, кому решение не нужно', () => {
    const doc = { id: 'a', role: 'role.therapist', room: 'off', sex: 'm', skill: 3, shift: 'day' } as StaffMember;
    const p = (id: string, room: string): ShiftPatient => ({ id, status: 'admitted', closed: { by: 'a' }, stay: { room, bed: 1, since: 0, setting: 'admit' } }) as unknown as ShiftPatient;
    const ps = [p('p1', 'ward-1'), p('p2', 'ward-2')];
    // легли сегодня — решать рано: в палате без медсестры врач их обходит, в палате с ней — нет
    expect(ps.some(x => needsDecision(x, 0))).toBe(false);
    expect(roundsDue([doc], [doc], ps, new Set(['ward-1']), 0)).toEqual({ a: ['p2'] });
    expect(roundsDue([doc], [doc], ps, new Set(['ward-1', 'ward-2']), 0)).toEqual({});
  });

  test(
    'клиническая медсестра в палате города: с 08:30 обходит все койки помещения, врачи туда — только к отмеченным',
    () => {
      const s = city(3);
      const t0 = s.t;
      const ward = s.hospital!.rooms.find(r => r.type === 'room.ward')!.id;
      site(db, s, { kind: 'hire', room: ward, role: CLINICAL, shift: 'day' });
      const nurse = s.staff!.find(m => m.role === CLINICAL)!;
      let checked = 0;
      for (let d = 0; d < 3; d++) {
        live(s, roundsAt(t0, d) - MIN);
        const beds = inpatientsOf(s).filter(p => p.stay!.room === ward);
        const need = new Set(beds.filter(p => needsDecision(p, s.day)).map(p => p.id));
        live(s, roundsAt(t0, d) + MIN, 60);
        const r = s.rounds!.on.find(x => x.by === nurse.id);
        if (beds.length === 0) {
          expect(r).toBeUndefined();
          continue;
        }
        // её обход — сразу в 08:30, по всем койкам помещения, по номеру койки, у каждой round.bed минут
        expect(r?.nurse).toBe(true);
        expect(r!.from).toBe(roundsAt(t0, d));
        expect(r!.stops.map(st => st.id).sort()).toEqual(beds.map(p => p.id).sort());
        expect(r!.stops.map(st => st.bed)).toEqual([...r!.stops.map(st => st.bed)].sort((x, y) => x - y));
        checkTimes(hospitalCtx(db, s).plan, nurse.room, r!);
        // врачи в её палату — только к тем, кому нужно решение (ушедший на обход взял свой список из `due`)
        const toWard = [...Object.values(s.rounds!.due).flat(), ...s.rounds!.on.filter(x => !x.nurse).flatMap(x => x.stops.map(st => st.id))];
        for (const id of toWard) if (s.patients[id]?.stay?.room === ward) expect(need.has(id)).toBe(true);
        checked++;
      }
      expect(checked).toBeGreaterThan(0);
    },
    LONG,
  );

  test(
    'те же зерно и команды — тот же обход при любом шаге часов',
    () => {
      const a = city(7);
      const b = city(7);
      const t = roundsAt(a.t, 1) + 2 * 3600;
      live(a, t, 60);
      live(b, t, 900);
      expect(a.rounds).toEqual(b.rounds);
      expect(a.rounds!.on.length).toBeGreaterThan(0);
      expect(hash(inpatientsOf(a).map(p => p.id))).toBe(hash(inpatientsOf(b).map(p => p.id)));
    },
    LONG,
  );

  test('в поликлинике лежащих нет — обхода нет', () => {
    const p = siteOfPlan(base, base.sites!['site.polyclinic']);
    if (!p.ok) throw new Error('поликлиника');
    const s = newFlowShift(db, { seed: 3, season: 'winter', hospital: hospitalOf(base, p.site), staff: withNightShift(base, p.site.rooms, p.staff), flow: { perHour: 0, auto: true }, economy: { cash: startCash(db, 'poly') } });
    live(s, roundsAt(s.t, 1) + 3600, 900);
    expect(s.rounds?.on ?? []).toEqual([]);
  }, LONG);

  test('roundOf: обходить некого — обход без остановок', () => {
    const plan = hospitalCtx(db, city(1)).plan;
    expect(roundOf(plan, 'a', plan.rooms[0].id, [], 1000, 3)).toEqual({ by: 'a', from: 1000, until: 1000, stops: [] });
  });

  test('без числа минут у койки — обход мгновенный, как до части 2', () => {
    const flat: ContentDb = { ...db, economy: { ...db.economy, staff: { ...db.economy.staff, round: undefined } } };
    const s = newFlowShift(flat, { seed: 3, season: 'winter', hospital: cityHospital, staff: cityStaff, flow: { perHour: 0, auto: true }, economy: { cash: startCash(flat, 'preset') } });
    const end = roundsAt(s.t, 0) + MIN;
    while (s.t < end) apply(flat, s, { kind: 'advance', seconds: 600 });
    expect(s.rounds).toBeUndefined();
  });
});
