// Рост навыка, наставник, учёба и болезнь нанятых в смене (spec docs/specs/2026-10-staff-mood.md, разделы 3–5; геймдизайн §7,
// «Человек») — своё «Больницы», только в потоке для ПК и только у нанятых со сменой. Всё — на планёрке в 08:00: кто отработал
// прошедшие сутки, на смену ближе к следующему навыку; с учёбы возвращаются; кто сегодня заболел — из ветви зерна по человеку
// и суткам, при любом шаге часов то же. «Отправить учиться» — команда стройки (`shift/site.ts`). Числа — `economy.yaml`,
// `staff.growth` и `staff.growthDays`.
import type { ContentDb } from '../../content/types';
import { P_ONE, Rng } from '../core/rng';
import type { StaffMember } from '../hospital/staff';
import { boost } from './mood';
import { DAY, SHIFT_START, type ShiftState, type StaffNews } from './types';

type Numbers = NonNullable<ContentDb['economy']['staff']['growth']>;

/** Числа роста, если он есть: поток для ПК и в базе есть рост; с человеком — ещё и у него смена. */
export function growthNumbers(db: ContentDb, s: ShiftState, m?: StaffMember): Numbers | undefined {
  return s.flow && (m === undefined || m.shift !== undefined) ? db.economy.staff.growth : undefined;
}

/**
 * Стаж в начале игры (spec «Как сделано», раздел 3): в готовой больнице люди работают не первый день — смен с последней
 * ступени у каждого из ветви зерна, от 0 до `growthDays` − 1; иначе все, начавшие вместе, выросли бы в одно утро, а с ними
 * разом упало бы и настроение. Новые — с нуля. Только у людей со сменой, когда в базе есть рост.
 */
export function tenure(db: ContentDb, seed: number, staff: readonly StaffMember[]): StaffMember[] {
  const days = db.economy.staff.growthDays;
  if (!db.economy.staff.growth || days < 2) return [...staff];
  const root = Rng.seeded(seed);
  return staff.map(m => (m.shift === undefined || m.days !== 0 || m.skill >= 5 ? m : { ...m, days: root.fork(`tenure:${m.id}`).range(0, days - 1) }));
}

/** Наставник (решение владельца, #86): в той же смене — человек той же должности с навыком 5, на своём месте и не в отлучке. */
export function mentorOf(staff: readonly StaffMember[], m: StaffMember): StaffMember | undefined {
  return staff.find(x => x !== m && x.role === m.role && x.skill >= 5 && x.shift === m.shift && x.room !== undefined && !x.away);
}

/** Смен на ступень: `growthDays`, с наставником — быстрее на `mentor` %. */
function needOf(db: ContentDb, g: Numbers, staff: readonly StaffMember[], m: StaffMember): number {
  const base = db.economy.staff.growthDays;
  return mentorOf(staff, m) ? Math.ceil((base * 100) / g.mentor) : base;
}

/** Для окна: смен до следующего навыка при нынешнем наставнике; навык 5 или роста нет — нет. */
export function stepsLeft(db: ContentDb, staff: readonly StaffMember[], m: StaffMember): number | undefined {
  const g = db.economy.staff.growth;
  if (!g || m.shift === undefined || m.skill >= 5) return undefined;
  return Math.max(1, needOf(db, g, staff, m) - m.days);
}

/** Час возвращения с учёбы: первая планёрка (08:00) не раньше чем через `studyDays` суток от `t`. */
export function studyUntil(g: Numbers, t: number): number {
  return Math.ceil((t + g.studyDays * DAY - SHIFT_START) / DAY) * DAY + SHIFT_START;
}

/**
 * Планёрка (spec «Как будет», 3–5), до настроения: кто отработал прошедшие сутки — место, смена, не учился и не болел, — на
 * смену ближе к следующему навыку; хватило — навык выше, счёт сначала. Зарплата при этом сама не растёт (решение владельца,
 * #83): рынок для него теперь выше, и настроение падает, пока её не поднимут. Новости — кто вырос.
 */
export function growMorning(db: ContentDb, s: ShiftState): StaffNews['grew'] {
  const g = growthNumbers(db, s);
  const staff = s.staff;
  if (!g || !staff) return undefined;
  const grew: NonNullable<StaffNews['grew']> = [];
  let changed = false;
  const next = staff.map(m => {
    if (m.shift === undefined || m.room === undefined || m.away || m.skill >= 5) return m;
    changed = true;
    const days = m.days + 1;
    if (days < needOf(db, g, staff, m)) return { ...m, days };
    grew.push({ id: m.id, skill: m.skill + 1 });
    return { ...m, skill: m.skill + 1, days: 0 };
  });
  if (changed) s.staff = next;
  return grew.length > 0 ? grew : undefined;
}

/**
 * Планёрка, после настроения: отлучки, что кончились к этому часу, — долой. С учёбы вернулся — навык +1 (до 5) и настроение
 * `studyMood` (решение владельца, #84). Новости — кто вернулся и с каким навыком.
 */
export function backMorning(db: ContentDb, s: ShiftState): StaffNews['back'] {
  const g = growthNumbers(db, s);
  if (!g || !s.staff?.some(m => m.away && m.away.until <= s.t)) return undefined;
  const back: NonNullable<StaffNews['back']> = [];
  s.staff = s.staff.map(m => {
    if (!m.away || m.away.until > s.t) return m;
    const out: StaffMember = { ...m };
    delete out.away;
    if (m.away.why !== 'study') return out;
    if (out.skill < 5) {
      out.skill++;
      out.days = 0;
    }
    back.push({ id: m.id, skill: out.skill });
    return out;
  });
  for (const b of back) boost(db, s, b.id, g.studyMood);
  return back.length > 0 ? back : undefined;
}

/**
 * Планёрка, последним: кто сегодня болеет — на свою смену не выйдет (решение владельца, #85). У каждого, кто работает, — раз
 * в `sick` смен в среднем, из ветви зерна по человеку и суткам; до следующей планёрки его нет, место пустое. Зарплату за эту
 * смену не платят: `refund` возвращает её в кассу суток. Новости — кто болеет.
 */
export function sickMorning(db: ContentDb, s: ShiftState, wage: (m: StaffMember) => number, refund: (rub: number, m: StaffMember) => void): StaffNews['sick'] {
  const g = growthNumbers(db, s);
  if (!g || !s.staff) return undefined;
  const until = s.t + DAY;
  const sick: string[] = [];
  const p = Math.round(P_ONE / g.sick);
  const root = Rng.seeded(s.meta.seed);
  const next = s.staff.map(m => {
    if (m.shift === undefined || m.room === undefined || m.away || !root.fork(`sick:${m.id}:${s.day}`).chance(p)) return m;
    sick.push(m.id);
    refund(wage(m), m);
    return { ...m, away: { why: 'sick' as const, until } };
  });
  if (sick.length === 0) return undefined;
  s.staff = next;
  return sick;
}
