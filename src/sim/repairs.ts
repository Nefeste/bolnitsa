// Техники и поломки в работе (spec docs/specs/2026-11-technicians.md, часть 2): аппараты, что ломаются, — окну: сломан ли и с
// какого часа, кто у него работает, когда дойдёт и когда кончит, сколько суток без обслуживания. Только в потоке для ПК со
// сменами (`repairOf`): без смен поломки — с утра на сутки, и окну хватает списка сломанных (`broken` среза).
import type { ContentDb, Id } from '../content/types';
import { hospitalCtx } from '../engine/shift/engine';
import { devicesOf, repairOf } from '../engine/shift/repair';
import type { ShiftState } from '../engine/shift/types';

export interface DeviceView {
  /** «помещение:место» */
  key: string;
  room: string;
  eq: Id;
  /** сломан; `since` — час поломки в работе */
  broken?: { since?: number };
  /** техник у аппарата: ремонт или обход; вышел, дойдёт, кончит */
  job?: { by: string; kind: 'repair' | 'maintain'; since: number; reach: number; done: number };
  /** суток без обслуживания; нет — с начала игры его не считали */
  wear?: number;
}

/** Аппараты больницы, что ломаются, — по порядку помещений и мест; без поломок в работе — undefined. */
export function repairsView(db: ContentDb, s: ShiftState): DeviceView[] | undefined {
  if (!repairOf(db, s)) return undefined;
  const broken = new Set(s.broken ?? []);
  return devicesOf(db, hospitalCtx(db, s).plan).map(d => {
    const f = s.fixing?.[d.key];
    const at = s.brokeAt?.[d.key];
    const wear = s.wear?.[d.key];
    return {
      key: d.key, room: d.room, eq: d.eq.id,
      ...(broken.has(d.key) ? { broken: at !== undefined ? { since: at } : {} } : {}),
      // сохранение 0.80.0 — без часов дороги: он уже у аппарата
      ...(f ? { job: { by: f.by, kind: f.kind, since: f.since ?? 0, reach: f.reach ?? 0, done: f.done } } : {}),
      ...(wear !== undefined ? { wear } : {}),
    };
  });
}
