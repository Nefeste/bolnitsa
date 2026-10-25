// из anamnez: src/engine/hospital/staff.ts @ 96503ac, изменено: мест в ординаторской больницы ПК — из плана (spec 2026-10-build); смены дня и ночи — `shift`, кто в смене, зарплата за сутки, ночная смена готовой больницы (spec 2026-10-staff-shifts); настроение нанятого — `Mood`, нет на смене — `away`: учится или болеет (spec 2026-10-staff-mood)
// Персонал своей больницы (spec 2026-09-own-hospital, часть 8): кандидаты дня, найм, навык 1–5,
// черта, зарплата за смену, скорость и точность работы, рост навыка с отработанными сменами.
// Числа — баланс игры (content/hospital/economy.yaml, `staff`). Имя человека — из словаря игры,
// как у пациентов: здесь только пол и зерно имени.
import type { ContentDb, Id, Preset } from '../../content/types';
import { Rng } from '../core/rng';
import type { Plan } from './build';
import { DOCTOR, type Staffing } from './requirements';

export type Trait = 'careful' | 'fast' | 'novice' | 'experienced';

/** Смена (spec docs/specs/2026-10-staff-shifts.md; геймдизайн §2): дневная или ночная. */
export type Shift = 'day' | 'night';
export const TRAITS: Trait[] = ['careful', 'experienced', 'fast', 'novice'];

export interface StaffMember {
  /** s1, s2… — не меняется; у штата готовой амбулатории — p1, p2… */
  id: string;
  role: Id;
  sex: 'm' | 'f';
  /** зерно имени — имя из словаря игры */
  seed: number;
  skill: number;
  trait?: Trait;
  /** зарплата за смену, ₽ */
  salary: number;
  /** где работает — помещение; нет — в резерве: получает зарплату, но не работает */
  room?: string;
  /** отработанных смен с последней ступени навыка */
  days: number;
  /**
   * смена (spec 2026-10-staff-shifts): работает в ней каждый день; нет — круглые сутки (сохранения до смен, смены
   * «Анамнеза»)
   */
  shift?: Shift;
  /**
   * нет на смене (spec 2026-10-staff-mood, разделы 4–5): на учёбе или болеет — до планёрки в `until`; место за ним, но в
   * смене его нет (`onDuty`, `dutyOf`)
   */
  away?: { why: 'study' | 'sick'; until: number };
}

/**
 * Настроение нанятого со сменой (spec docs/specs/2026-10-staff-mood.md) — своё «Больницы», в состоянии смены рядом со штатом
 * (`moods`), а не в `StaffMember`: отмена стройки возвращает штат снимком и не должна возвращать настроение. `v` — 0–100,
 * меняется на планёрке; `d` — на сколько с настроения до последней планёрки (с разовыми прибавками после неё); `why` —
 * почему изменилось на последней планёрке с причинами (без причин тянется к началу — `why` прежние, пока не дотянется); `low` — утр подряд ниже порога ухода; `quit` — «собирается уйти» до утра
 * этих суток; `go` — уходит: с этого часа (конец его смены) его нет, как только не ведёт пациента; `nights` — ночных смен
 * подряд; `limit` и `here` — за сутки до планёрки дошёл до предела усталости и отдыхал на месте: начало той смены.
 */
export interface Mood {
  v: number;
  d?: number;
  why?: MoodWhy[];
  low?: number;
  quit?: number;
  go?: number;
  nights?: number;
  limit?: number;
  here?: number;
}

/**
 * Причины настроения: зарплата ниже рынка на ступень и на две и больше, выше рынка, предел усталости, отдых на месте, нет
 * санузла, ночные подряд.
 */
export type MoodWhy = 'below' | 'belowFar' | 'above' | 'limit' | 'here' | 'toilet' | 'nights';

/**
 * Во сколько раз болезни профиля вероятнее у записанного к специалисту (spec 2026-10-chapter-4, часть 60а): к нему
 * записываются с ними, и он это знает. Игровая оценка, подобрана прогоном городской больницы
 */
export const PROFILE_PRIOR = 10;

/** Зарплата за смену: между «навык 1» и «навык 5» должности, с поправкой черты; до 50 ₽. */
export function salaryOf(db: ContentDb, role: Id, skill: number, trait?: Trait): number {
  const [lo, hi] = db.roles[role].salary;
  const base = lo + ((hi - lo) * (skill - 1)) / 4;
  const k = trait ? (db.economy.staff.traits[trait].salary ?? 100) : 100;
  return Math.round((base * k) / 100 / 50) * 50;
}

/**
 * Кандидаты дня: на каждую должность, которую нанимают (и `allow` пропускает), — от и до
 * `candidates` человек из ветви зерна `candidates:<день>`. Номера продолжают сквозной счёт. Специалисты (spec
 * 2026-10-chapter-4, часть 59) — после остальных: номера прежних кандидатов от них не сдвинулись.
 */
export function applicantsOf(db: ContentDb, seed: number, day: number, next: number, allow: (role: Id) => boolean = () => true): { list: StaffMember[]; next: number } {
  const b = db.economy.staff;
  const root = Rng.seeded(seed).fork(`candidates:${day}`);
  const weights: Record<string, number> = { none: b.noTrait };
  for (const t of TRAITS) weights[t] = b.traits[t].weight;
  const list: StaffMember[] = [];
  let n = next;
  const roles = Object.keys(db.roles).sort();
  for (const role of [...roles.filter(id => !db.roles[id].profile), ...roles.filter(id => db.roles[id].profile)]) {
    if (!db.roles[role].hire || !allow(role)) continue;
    const r = root.fork(role);
    const count = r.range(b.candidates[0], b.candidates[1]);
    for (let i = 0; i < count; i++) {
      const c = r.fork(`c${i}`);
      const key = c.weightedKey(weights);
      const trait = key === 'none' ? undefined : (key as Trait);
      const range = trait ? b.traits[trait].skills : undefined;
      const skill = range ? c.range(range[0], range[1]) : c.weighted([1, 2, 3, 4, 5], s => b.skills[s - 1]);
      list.push({
        id: `s${n++}`, role, sex: c.chance(5000) ? 'f' : 'm', seed: c.u32(), skill, ...(trait ? { trait } : {}),
        salary: salaryOf(db, role, skill, trait), days: 0,
      });
    }
  }
  return { list, next: n };
}

/** Время обследования у этого человека, % от записанного в базе: навык и черта «быстрый». */
export function speedOf(db: ContentDb, m?: StaffMember): number {
  if (!m) return 100;
  const b = db.economy.staff;
  const trait = m.trait ? (b.traits[m.trait].speed ?? 100) : 100;
  return Math.round((b.speed[m.skill - 1] * trait) / 100);
}

/** Как читает снимок тот, кто его описывает (рентгенолог, врач УЗД): поправка чувствительности и специфичности, п. п. */
export function readingOf(db: ContentDb, m?: StaffMember): [number, number] {
  if (!m) return [0, 0];
  const b = db.economy.staff;
  const [s, p] = b.reading[m.skill - 1];
  const t = m.trait ? (b.traits[m.trait].reading ?? [0, 0]) : [0, 0];
  return [s + t[0], p + t[1]];
}

/**
 * Как ведёт приём нанятый врач (spec 2026-09-hired-doctors): при какой уверенности ставит
 * диагноз, какая польза обследования (биты) для него ещё стоит цены, как часто забывает
 * спросить о противопоказаниях перед лечением (%). Навык и черта — числа `economy.yaml`.
 */
export function doctorOf(db: ContentDb, m: StaffMember): { threshold: number; minGain: number; forget: number } {
  const d = db.economy.staff.doctor;
  const t = m.trait ? db.economy.staff.traits[m.trait] : undefined;
  const i = m.skill - 1;
  return {
    threshold: Math.min(95, Math.max(50, d.threshold[i] + (t?.threshold ?? 0))) / 100,
    minGain: d.minGain[i] / 1000,
    forget: Math.min(100, Math.max(0, d.forget[i] + (t?.forget ?? 0))),
  };
}

/** Смена отработана: навык растёт на ступень за `growthDays` смен (новичок — быстрее), не выше 5. */
export function grow(db: ContentDb, m: StaffMember): StaffMember {
  if (!m.room || m.skill >= 5) return m;
  const b = db.economy.staff;
  const need = Math.max(1, Math.ceil(b.growthDays / (m.trait ? (b.traits[m.trait].growth ?? 1) : 1)));
  const days = m.days + 1;
  return days >= need ? { ...m, skill: m.skill + 1, days: 0 } : { ...m, days };
}

// --- смены (spec docs/specs/2026-10-staff-shifts.md) ------------------------------------------------------------------

/** Какая смена идёт в `t` (игровые секунды): дневная — с часа `day[0]` до `day[1]`, ночная — остальное. */
export function shiftAt(db: ContentDb, t: number): Shift {
  const day = db.economy.staff.shifts?.day ?? [0, 24];
  const h = Math.floor((((t % 86400) + 86400) % 86400) / 3600);
  return h >= day[0] && h < day[1] ? 'day' : 'night';
}

/**
 * Начало смены, что идёт в `t`: дневной — в `day[0]` часов этих суток, ночной — в `day[1]` часов этих суток или прошлых,
 * если ночь уже за полночь.
 */
export function shiftStartOf(db: ContentDb, t: number): number {
  const day = db.economy.staff.shifts?.day ?? [0, 24];
  const base = Math.floor(t / 86400) * 86400;
  const h = t - base;
  if (h >= day[0] * 3600 && h < day[1] * 3600) return base + day[0] * 3600;
  return h >= day[1] * 3600 ? base + day[1] * 3600 : base - 86400 + day[1] * 3600;
}

/** В смене ли человек в `t`: без смены — всегда; на учёбе или болеет (`away`) — нет. */
export const onDuty = (db: ContentDb, m: StaffMember, t: number): boolean => !m.away && (m.shift === undefined || m.shift === shiftAt(db, t));

/** Работает ли человек в смене `shift`: без смены — в обеих (круглые сутки). */
export const covers = (m: StaffMember, shift: Shift): boolean => m.shift === undefined || m.shift === shift;

/**
 * Работает ли больница ночью (spec 2026-10-staff-shifts): в ней лежат или в неё везёт скорая. Тогда у готовой больницы и
 * у готового помещения «С персоналом» — и ночная смена в помещениях, что работают ночью (`night`); поликлиника ночью закрыта.
 */
export function nightHospital(db: ContentDb, rooms: readonly { type: Id }[]): boolean {
  return rooms.some(r => {
    const k = db.rooms[r.type];
    return k !== undefined && (k.emergency || k.beds || k.icu || k.box);
  });
}

const duties = new WeakMap<readonly StaffMember[], Record<Shift, StaffMember[]>>();

/**
 * Кто в смене в `t` — один и тот же массив на штат и смену: больница и «кто на месте» считаются раз на пересменку. Без
 * смен — сам штат. На учёбе и больные (`away`) — не в смене: уходят и возвращаются они на планёрке, новым штатом.
 */
export function dutyOf(db: ContentDb, staff: readonly StaffMember[], t: number): readonly StaffMember[] {
  if (!staff.some(m => m.shift !== undefined)) return staff;
  let d = duties.get(staff);
  if (!d) {
    d = { day: staff.filter(m => m.shift !== 'night' && !m.away), night: staff.filter(m => m.shift !== 'day' && !m.away) };
    duties.set(staff, d);
  }
  return d[shiftAt(db, t)];
}

/** Зарплата за сутки, ₽, при зарплате должности `salary` в смене `shift`: ночная — с надбавкой (`shifts.night`, %). */
export function payOf(db: ContentDb, salary: number, shift?: Shift): number {
  return shift === 'night' ? Math.round((salary * (db.economy.staff.shifts?.night ?? 100)) / 100) : salary;
}

/** Зарплата человека за сутки, ₽: дневная смена и без смены — зарплата; ночная — с надбавкой. */
export const wageOf = (db: ContentDb, m: StaffMember): number => payOf(db, m.salary, m.shift);

/** Зарплаты штата за сутки, ₽ (spec 2026-10-staff-shifts): по сменам, ночная — с надбавкой. */
export const wagesOf = (db: ContentDb, staff: readonly StaffMember[]): number => staff.reduce((n, m) => n + wageOf(db, m), 0);

/**
 * Штат готовой больницы со сменами (spec 2026-10-staff-shifts): все — дневная смена. Больница, где лежат или куда везёт
 * скорая, работает и ночью: в её помещениях, что работают ночью (`night` у вида помещения), — ещё ночная смена, копия
 * дневного человека: та же должность, навык и черта, другой человек; есть смотровая приёмного — и ночной врач для
 * привезённых скорой: копия первого нанятого терапевта, в его же кабинете. Поликлиника ночью закрыта — ночной смены у неё
 * нет. Номера ночных — после номеров готовой больницы (`p<n>`), облик — из ветви зерна дневного.
 */
export function withNightShift(db: ContentDb, rooms: readonly { id: string; type: Id }[], staff: readonly StaffMember[]): StaffMember[] {
  const out: StaffMember[] = staff.map(m => ({ ...m, shift: 'day' as const }));
  if (!nightHospital(db, rooms)) return out;
  const night = new Set(rooms.filter(r => db.rooms[r.type]?.night).map(r => r.id));
  let n = staff.reduce((k, m) => (m.id.startsWith('p') ? Math.max(k, Number(m.id.slice(1)) || 0) : k), 0);
  const copy = (m: StaffMember): StaffMember => {
    const id = `p${++n}`;
    const r = Rng.seeded(m.seed).fork(`night:${id}`);
    return { ...m, id, sex: r.chance(5000) ? 'f' : 'm', seed: r.u32(), days: 0, shift: 'night' };
  };
  for (const m of staff) if (m.room !== undefined && night.has(m.room)) out.push(copy(m));
  const doctor = staff.find(m => m.room !== undefined && db.roles[m.role]?.stands === DOCTOR && !db.roles[m.role]?.profile);
  if (doctor && rooms.some(r => db.rooms[r.type]?.emergency)) out.push(copy(doctor));
  return out;
}

/** Мест для нанятых врачей в помещениях этого типа, до двери которых можно дойти. */
export function placesOf(db: ContentDb, plan: Plan, type: Id): number {
  return plan.rooms
    .filter(r => r.type === type && r.door.length > 0 && plan.connected[r.id])
    .reduce((n, r) => n + (r.places ?? db.rooms[type]?.sizes.find(z => z.id === r.size)?.places ?? 0), 0);
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Кто на месте: помещение и должность → есть ли человек. Встающий на чужое место (терапевт —
 * на место врача) на нём и считается. Кому нужно место в помещении (терапевту — в
 * ординаторской), тот работает, только если место досталось: места раздаются по номеру
 * помещения, где он работает, затем по номеру человека (spec 2026-09-hired-doctors).
 */
export function staffingOf(db: ContentDb, plan: Plan, staff: readonly StaffMember[]): Staffing {
  const unplaced = new Set<string>();
  const left: Record<string, number> = {};
  const needing = staff.filter(m => m.room !== undefined && db.roles[m.role]?.needs).sort((a, b) => cmp(a.room!, b.room!) || cmp(a.id, b.id));
  for (const m of needing) {
    const type = db.roles[m.role].needs!;
    left[type] ??= placesOf(db, plan, type);
    if (left[type] > 0) left[type]--;
    else unplaced.add(m.id);
  }
  const fills = (m: StaffMember, role: Id) => m.role === role || db.roles[m.role]?.stands === role;
  const staffed: Staffing = (room, role) => staff.some(m => m.room === room && fills(m, role) && !unplaced.has(m.id));
  staffed.unplaced = room => staff.some(m => m.room === room && unplaced.has(m.id));
  return staffed;
}

/** Кто на месте в помещении на должности — для скорости и точности. */
export function memberAt(staff: readonly StaffMember[], room: string, role: Id): StaffMember | undefined {
  return staff.find(m => m.room === room && m.role === role);
}

/**
 * Штат готовой больницы: навык 3, без черт — работает ровно так, как записано в базе. В начале главы кампании (`start`,
 * spec 2026-10-chapter-4, часть 60а) — без тех, кого нанимают в главе; номера остальных — те же.
 */
export function presetStaff(db: ContentDb, p: Preset, start = false): StaffMember[] {
  return p.staff.flatMap((s, i): StaffMember[] => (start && s.later ? [] : [{
    id: `p${i + 1}`, role: s.role, sex: i % 2 === 0 ? 'f' : 'm', seed: i + 1, skill: 3, salary: salaryOf(db, s.role, 3), room: `r${s.room + 1}`, days: 0,
  }]));
}
