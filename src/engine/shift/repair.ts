// Техники и поломки в работе (spec docs/specs/2026-11-technicians.md, часть 1) — своё «Больницы», только в потоке для ПК со
// штатом по сменам и когда в базе есть числа ремонта (`staff.repair`): в сменах «Анамнеза» поломки — с утра на сутки (FR-EQ-3),
// как прежде. Утром у каждого аппарата обследований — жребий суток по «надёжности» каталога, уровню «Управления» и износу
// (суткам без обслуживания); выпал — поломка в минуту рабочего дня. Сломался — свободный техник смены идёт и чинит за минуты
// своего навыка; занятые — после своей работы; техника нет до утра — сервис: к утру и 2 % цены (`REPAIR_PCT`). В свободное
// время техник обходит аппараты — дольше всех без обслуживания первым, ближний при равных — и сбрасывает износ. Здесь — кто
// и что, события и касса — в `engine.ts`.
import type { ContentDb, Equipment } from '../../content/types';
import type { Plan } from '../hospital/build';
import { slotKey } from '../hospital/requirements';
import type { StaffMember } from '../hospital/staff';
import type { ShiftState } from './types';
import { walkPc } from './walking';

export const TECHNICIAN = 'role.technician';

export type Repair = NonNullable<ContentDb['economy']['staff']['repair']>;

/**
 * Что ломается (FR-EQ-3): аппараты обследований в кабинетах; монитор у постели, наркозный и дыхательный аппараты и стол — нет:
 * у них в больнице есть запасной.
 */
export const breaks = (eq: Equipment): boolean => eq.exams.length > 0;

/** Числа ремонта, если поломки — в работе: поток для ПК, штат со сменами и числа в базе; иначе — поломки с утра на сутки. */
export function repairOf(db: ContentDb, s: ShiftState): Repair | undefined {
  return s.flow && s.staff?.some(m => m.shift !== undefined) ? db.economy.staff.repair : undefined;
}

/** Износ, % шанса поломки: 100 и ещё 100 за каждые `wear` суток без обслуживания, не больше `max`. */
export const wearPct = (r: Repair, days: number): number => Math.min(r.max, 100 + Math.floor((100 * Math.max(0, days)) / r.wear));

/** Минут ремонта у техника навыка 1–5. */
export const repairMinutes = (r: Repair, skill: number): number => r.minutes[Math.min(5, Math.max(1, Math.round(skill))) - 1];

export interface Device {
  key: string;
  room: string;
  eq: Equipment;
}

/** Аппараты больницы, что ломаются, — по порядку помещений и мест. */
export function devicesOf(db: ContentDb, plan: Plan): Device[] {
  const out: Device[] = [];
  for (const r of plan.rooms) {
    r.equipment.forEach((id, slot) => {
      const eq = id ? db.equipment[id] : undefined;
      if (eq && breaks(eq)) out.push({ key: slotKey(r.id, slot), room: r.id, eq });
    });
  }
  return out;
}

export interface TechJob {
  kind: 'repair' | 'maintain';
  key: string;
  room: string;
  /** когда кончит: дорога от того места, где он, и работа */
  done: number;
}

/**
 * Следующая работа свободного техника `m`, который сейчас в помещении `at`: сломанный аппарат, который никто не чинит, — ближний
 * первым; нет — обход: кто дольше всех без обслуживания (не меньше суток), при равных — ближний, потом по порядку.
 */
export function nextJob(plan: Plan, s: ShiftState, m: StaffMember, at: string, devices: readonly Device[], r: Repair): TechJob | undefined {
  const taken = s.fixing ?? {};
  const broken = new Set(s.broken ?? []);
  const walk = (room: string) => walkPc(plan, at, room);
  let best: Device | undefined;
  let bestWalk = Number.POSITIVE_INFINITY;
  for (const d of devices) {
    if (!broken.has(d.key) || taken[d.key]) continue;
    const w = walk(d.room);
    if (w < bestWalk) {
      best = d;
      bestWalk = w;
    }
  }
  if (best) return { kind: 'repair', key: best.key, room: best.room, done: s.t + bestWalk + repairMinutes(r, m.skill) * 60 };
  let wear = 0;
  for (const d of devices) {
    if (broken.has(d.key) || taken[d.key]) continue;
    const days = s.wear?.[d.key] ?? 0;
    if (days < 1) continue;
    const w = walk(d.room);
    if (days > wear || (days === wear && w < bestWalk)) {
      best = d;
      wear = days;
      bestWalk = w;
    }
  }
  return best ? { kind: 'maintain', key: best.key, room: best.room, done: s.t + bestWalk + r.maintain * 60 } : undefined;
}
