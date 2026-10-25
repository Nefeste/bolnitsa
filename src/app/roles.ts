// Роли (spec docs/specs/2026-10-two-ways.md, F4; решение владельца #67): «Врач», «Главврач», «Управляющий» — одним выбором
// игрок говорит, сколько медицины хочет. Роль — набор настроек, которые есть и по отдельности: «Мой кабинет», «Свои больные»,
// о чём спрашивать главврача (F3), автопауза окна врача. Роль ставит их разом, игрок поправляет любую. Чистые функции — их
// проверяют тесты (tools/test/roles.test.ts); команды в поток отправляет окно врача (src/app/doctor.ts).
import type { ContentDb } from '../content/types';
import { DOCTOR, OFFICE, standInOf } from '../engine/hospital/requirements';
import { setOffice, type Site } from '../engine/hospital/site';
import { lastPreset, salaryOf, type StaffMember } from '../engine/hospital/staff';
import { DEFAULT_ASKS } from '../engine/shift/approve';
import type { AskRule } from '../engine/shift/types';

export type Role = 'doctor' | 'chief' | 'manager';

/** Порядок карточек на старте и кнопок в окне врача. */
export const ROLES: readonly Role[] = ['doctor', 'chief', 'manager'];

/** Роль по умолчанию — «Врач»: так играли до ролей; бенч, снимки и сохранения без роли — тоже. */
export const DEFAULT_ROLE: Role = 'doctor';

/** Что ставит роль. */
export interface RoleSet {
  /** свой кабинет: у «Врача» — первый кабинет врача, если своего нет; у остальных — «Не принимаю» */
  office: boolean;
  /** о чём нанятые врачи спрашивают главврача */
  asks: readonly AskRule[];
  /** автопауза окна врача — на просьбу «не уверен» и результаты ваших больных */
  autopause: boolean;
  /** окно врача свёрнуто: у «Управляющего» медицины на экране нет, пока он сам её не откроет */
  folded: boolean;
}

export const ROLE_SETS: Record<Role, RoleSet> = {
  doctor: { office: true, asks: DEFAULT_ASKS, autopause: true, folded: false },
  // «ниже 90 %» и «выписка» — у роли «Главврач» (решение владельца #65)
  chief: { office: false, asks: ['unsure', 'long', 'below90', 'discharge'], autopause: true, folded: false },
  manager: { office: false, asks: [], autopause: false, folded: true },
};

/** Роль из адреса или сохранения — только из списка. */
export const roleOf = (v: unknown): Role | undefined => ROLES.find(r => r === v);

/** Первый кабинет врача участка — «Мой кабинет» у «Врача», когда своего нет. */
export function firstOffice(site: Site): string | undefined {
  return site.rooms.find(r => r.type === OFFICE && !r.leaving)?.id;
}

/**
 * Готовая больница на старте для роли без своего кабинета (spec F4): кабинет игрока — обычный кабинет врача, и в нём
 * нанятый врач, как в остальных: навык 3, зарплата каталога, облик по номеру (`presetStaff`, `siteOfPlan`). Пустое здание и
 * роль «Врач» — как есть.
 */
export function startFor(db: ContentDb, site: Site, staff: readonly StaffMember[], role: Role): { site: Site; staff: StaffMember[] } {
  const room = site.mine;
  const stand = standInOf(db, DOCTOR);
  if (ROLE_SETS[role].office || room === undefined || !stand) return { site, staff: [...staff] };
  const out = setOffice(db, site, undefined);
  if (!out.ok) return { site, staff: [...staff] };
  const n = lastPreset(staff) + 1;
  const doctor: StaffMember = { id: `p${n}`, role: stand, sex: n % 2 === 1 ? 'f' : 'm', seed: n, skill: 3, salary: salaryOf(db, stand, 3), room, days: 0 };
  return { site: out.site, staff: [...staff, doctor] };
}
