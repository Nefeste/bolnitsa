// Готовая больница из готовых помещений (spec docs/specs/2026-10-real-hospital.md) — своё «Больницы». Запись базы
// (`content/hospital/sites/`) строится в пустом здании игры той же функцией, что команда стройки `ready` (`addReady`): те же
// правила, что у игрока, и перестраивается больница так же. Ваш кабинет — отмеченный; люди — на всех должностях, кроме
// вашей, как в готовой больнице (`presetStaff`): навык 3, зарплата каталога, облик по номеру.
import type { ContentDb, SitePlan } from '../../content/types';
import { DOCTOR, standInOf } from './requirements';
import { addReady, emptySite, setOffice, type Site, type SiteError } from './site';
import { salaryOf, type StaffMember } from './staff';

/** Больница по плану и её люди; не построилась — номер помещения в плане и причина. */
export type Planned = { ok: true; site: Site; staff: StaffMember[] } | { ok: false; room: number; error: SiteError };

export function siteOfPlan(db: ContentDb, p: SitePlan): Planned {
  let site = emptySite();
  const ids: string[] = [];
  for (const [i, r] of p.rooms.entries()) {
    const out = addReady(db, site, r.type, r.size, r.x, r.y, r.rot);
    if (!out.ok) return { ok: false, room: i, error: out.error };
    site = out.site;
    ids.push(out.room!);
  }
  const mine = p.rooms.findIndex(r => r.mine);
  if (mine >= 0) {
    const out = setOffice(db, site, ids[mine]);
    if (!out.ok) return { ok: false, room: mine, error: out.error };
    site = out.site;
  }
  const staff: StaffMember[] = [];
  for (const [i, r] of p.rooms.entries()) {
    for (const post of db.rooms[r.type].staff) {
      if (post === DOCTOR && i === mine) continue;
      // нанятый врач встаёт на место врача
      const role = post === DOCTOR ? standInOf(db, DOCTOR) : post;
      if (!role) continue;
      const n = staff.length + 1;
      staff.push({ id: `p${n}`, role, sex: n % 2 === 1 ? 'f' : 'm', seed: n, skill: 3, salary: salaryOf(db, role, 3), room: ids[i], days: 0 });
    }
  }
  return { ok: true, site, staff };
}
