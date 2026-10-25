// Имя человека штата (spec docs/specs/2026-10-staff-mood.md, «Видно»): из словаря игры, как у пациентов (`patientName` в
// src/sim/caseView.ts), — по полу и зерну имени; в штате хранится только зерно (`StaffMember.seed`), имя — на языке окна.
import { fnv1a } from '../engine/core/hash';
import { T } from '../i18n';

/** «Петрова Анна». */
export function staffName(m: { sex: 'm' | 'f'; seed: number }): string {
  const n = T.case.names;
  const first = m.sex === 'm' ? n.male : n.female;
  const surname = n.surnames[fnv1a(`staff:${m.seed}:s`) % n.surnames.length];
  return `${m.sex === 'm' ? surname : n.feminine(surname)} ${first[fnv1a(`staff:${m.seed}:f`) % first.length]}`;
}
