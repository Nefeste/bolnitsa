// Отделения на карте (spec docs/specs/2026-10-departments.md, часть 2; решения владельца #140, #142): цвета отделений,
// полосы на полу у дверей, слой «Отделения» с легендой, табличка над подписью помещения, фильтр «Пациентов». Отделение
// помещения считает движок (`deptsOf`, src/engine/hospital/departments.ts) по плану и штату, которые у окна есть; здесь —
// только как его показать. Чистые функции без DOM и Three.js — их проверяют тесты (tools/test/departments-ui.test.ts).
import type { Id } from '../content/types';
import type { Plan } from '../engine/hospital/build';
import type { Seen } from './flow';

/**
 * Цвета отделений — палитра Окабе — Ито: различимы при дальтонизме (геймдизайн §17) и не похожи друг на друга на светлом
 * и на тёмном полу. Порядок — как в записи отделений; оранжевый палитры — запас для неврологии кабинета, когда она будет.
 */
export const DEPT_COLORS: Readonly<Record<string, number>> = {
  'dept.emergency': 0xd55e00,
  'dept.therapy': 0x56b4e9,
  'dept.surgery': 0x009e73,
  'dept.neurology': 0xcc79a7,
  'dept.infectious': 0xf0e442,
  'dept.icu': 0x0072b2,
};

/**
 * Без отделения — служба (диагностика) и общие помещения: тёмно-серый слоя, полосы у их дверей нет. Светлый серый
 * (#9a9fa5) при дейтеранопии почти совпадал с неврологией — тест держит все цвета слоя различимыми
 * (tools/test/departments-ui.test.ts).
 */
export const NO_DEPT = 0x5f6368;

export const colorOf = (dept: Id | undefined): number => (dept === undefined ? NO_DEPT : (DEPT_COLORS[dept] ?? NO_DEPT));

/** Цвет для страницы: «#56b4e9». */
export const css = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

/** Отделения помещений по номеру в плане, как у слоёв и подписей: у служб и общих — нет. */
export const planDepts = (plan: Plan, byId: Readonly<Record<string, Id>>): (Id | undefined)[] => plan.rooms.map(r => byId[r.id]);

/** Полосы у дверей: цвет отделения помещения; у служб и общих — без полосы. */
export const stripeColors = (depts: readonly (Id | undefined)[]): (number | null)[] => depts.map(d => (d === undefined ? null : colorOf(d)));

/** Слой «Отделения»: пол помещения — в цвет его отделения, у служб и общих — серый. */
export const layerColors = (depts: readonly (Id | undefined)[]): number[] => depts.map(colorOf);

/**
 * Легенда слоя: отделения больницы по порядку записи (`order`), сколько у каждого помещений; `''` — без отделения (служба и
 * общие), последней строкой. Отделений, которых в больнице нет, в легенде нет.
 */
export function legendOf(order: readonly Id[], depts: readonly (Id | undefined)[]): { id: Id | ''; rooms: number }[] {
  const n = new Map<Id | '', number>();
  for (const d of depts) n.set(d ?? '', (n.get(d ?? '') ?? 0) + 1);
  const rows = order.filter(id => n.has(id)).map(id => ({ id, rooms: n.get(id)! }));
  // отделение не из записи (сохранение новее базы) — после записанных, до «без отделения»
  for (const [id, rooms] of n) if (id !== '' && !order.includes(id)) rows.push({ id, rooms });
  if (n.has('')) rows.push({ id: '', rooms: n.get('')! });
  return rows;
}

/**
 * Отделение пациента в «Пациентах»: помещение, где он сейчас, — если оно в отделении (кабинет, палата, операционная,
 * смотровая приёмного); иначе — кабинет его врача (ждёт у двери или в зале); иначе нет: регистратура, общая очередь,
 * обследование без своего врача. Направления по жалобе пока нет (часть 4 — к демо): отделение — по тому, где он.
 */
export function patientDept(p: Pick<Seen, 'room' | 'by'>, depts: readonly (Id | undefined)[], officeOf: (by: number) => number): Id | undefined {
  const here = p.room >= 0 ? depts[p.room] : undefined;
  if (here !== undefined) return here;
  const office = p.by >= 0 ? officeOf(p.by) : -1;
  return office >= 0 ? depts[office] : undefined;
}
