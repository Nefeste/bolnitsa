// База в панелях режима врача (spec docs/specs/2026-10-doctor-mode.md, «Окно»): раздел бланка направления — по виду
// обследования и кабинету из базы. Знание о медицине, не о больном; задаёт игра при старте (src/app/doctor.ts).
import type { ContentDb } from '../../content/types';

let current: ContentDb | undefined;

export function setUiDb(x: ContentDb) {
  current = x;
}

export function db(): ContentDb {
  if (!current) throw new Error('db: no content');
  return current;
}
