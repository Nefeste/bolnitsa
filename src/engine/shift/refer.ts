// Направление к специалисту (spec docs/specs/2026-10-specialists.md, часть 2; решение владельца #112, «вариант 2») — своё
// «Больницы», поток для ПК. Чистые функции: какую поправку профиля даёт специалист больному и к кому нанятый терапевт
// направит больного вместо просьбы посмотреть. Правды о больном они не видят: только то, что думает врач.
import type { ContentDb, Id } from '../../content/types';
import { PROFILE_PRIOR, type StaffMember } from '../hospital/staff';
import type { Belief, Prior } from '../med/infer';
import type { ShiftPatient } from './types';

/**
 * Поправка профиля специалиста `m` у больного `p`: записан к нему — болезни профиля вероятнее в `PROFILE_PRIOR` раз
 * (spec 2026-10-chapter-4, часть 60а); направлен к нему — в `consults.refer` раз: к нему направляют по подозрению, а
 * записываются с болезнью профиля. У терапевта профиля нет — поправки нет.
 */
export function priorOf(db: ContentDb, p: Pick<ShiftPatient, 'to' | 'ref'>, m: StaffMember): Prior | undefined {
  const ids = db.roles[m.role]?.profile;
  if (!ids) return undefined;
  if (p.to === m.id) return { ids, x: PROFILE_PRIOR };
  const x = db.consults?.refer;
  return p.ref === m.id && x !== undefined ? { ids, x } : undefined;
}

/**
 * К кому из специалистов `list`, которые сейчас принимают, нанятый терапевт направит больного, а не попросит вас
 * посмотреть: что он думает — `lead`, его диагноз и лучшая болезнь второй группы. Ведущая гипотеза — ни в чьём профиле, а
 * вторая — в профиле одного из них: к первому такому. Ведущая уже из профиля — нет: поправка поднимает все болезни профиля
 * одинаково и порядок гипотез не меняет (проба `tools/bench/referrals.ts`).
 */
export function referTo(db: ContentDb, list: readonly StaffMember[], lead: readonly Belief[]): StaffMember | undefined {
  if (lead.length < 2) return undefined;
  const of = (dx: Id) => list.find(x => db.roles[x.role]?.profile?.includes(dx));
  return of(lead[0].id) ? undefined : of(lead[1].id);
}
