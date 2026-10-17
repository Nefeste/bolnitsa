// Для тестов стройки ПК (spec docs/specs/2026-10-build.md): пустое здание, шесть помещений прототипа вдоль северной стены
// (тот же план — в сценарии в браузере, tools/app/e2e.mjs), смена с потоком и команда стройки с проверкой.
import { expect } from 'bun:test';
import type { ContentDb, Id } from '../../src/content/types';
import { emptySite, hospitalOf, type Site, type SiteCommand, type SiteResult } from '../../src/engine/hospital/site';
import { apply, newFlowShift } from '../../src/engine/shift/engine';
import type { ShiftState } from '../../src/engine/shift/types';

/** Шесть помещений прототипа (spec «Тесты»): тип, прямоугольник со стенами; двери — посередине нижней стены. */
export const PROTO: [Id, number, number, number, number][] = [
  ['room.reception', 6, 6, 6, 7],
  ['room.waiting', 11, 6, 9, 7],
  ['room.office', 19, 6, 8, 7],
  ['room.staff', 26, 6, 6, 7],
  ['room.procedure', 31, 6, 6, 7],
  ['room.lab', 36, 6, 6, 7],
];

export const FLOW = { perHour: 6, ambulancePerHour: 1 };

/** Смена с потоком в пустом здании (или в данной больнице ПК). */
export function emptyShift(db: ContentDb, seed = 1, site: Site = emptySite()): ShiftState {
  return newFlowShift(db, { seed, season: 'winter', hospital: hospitalOf(db, site), staff: [], flow: FLOW });
}

/** Команда стройки; `ok` — ждём, что выйдет (по умолчанию — да). Отдаёт извещение. */
export function site(db: ContentDb, s: ShiftState, cmd: SiteCommand, ok = true): SiteResult {
  const out = apply(db, s, { kind: 'site', cmd });
  const n = out.find(x => x.kind === 'site') as ({ kind: 'site' } & SiteResult) | undefined;
  // «Готово» — без извещения
  if (ok && cmd.kind !== 'done') expect(n?.ok ? 'ok' : JSON.stringify(n)).toBe('ok');
  return n ?? { cmd: cmd.kind, ok: true };
}

/** Шесть помещений: протянуть, обставить, дверь посередине нижней стены, люди на все должности; «Готово». */
export function buildProto(db: ContentDb, s: ShiftState): string[] {
  const ids: string[] = [];
  for (const [type, x, y, w, h] of PROTO) {
    const id = site(db, s, { kind: 'room', type, x, y, w, h }).room!;
    ids.push(id);
    site(db, s, { kind: 'furnish', room: id });
    site(db, s, { kind: 'door', room: id, cells: [[x + Math.floor(w / 2), y + h - 1]] });
    for (const role of db.rooms[type].staff) site(db, s, { kind: 'hire', room: id, role });
  }
  site(db, s, { kind: 'done' });
  return ids;
}

/** Прожить до часа `hour` шагом `step`. */
export function liveTo(db: ContentDb, s: ShiftState, hour: number, step = 60) {
  const end = (s.day - 1) * 86400 + hour * 3600;
  while (s.t < end) apply(db, s, { kind: 'advance', seconds: Math.min(step, end - s.t) });
}

export const hash = (x: unknown) => Bun.hash(JSON.stringify(x)).toString(16);
