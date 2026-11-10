// Встреченные болезни (spec docs/specs/2026-11-sandbox.md, часть 2б; решение агента 2): главные болезни закрытых случаев
// сценария кампании ПК — ваших и нанятых врачей. Поток расчёта отдаёт окну новые, окно копит их на этом компьютере
// (`src/app/met.ts`). Правду больного окно так получает только болезнью уже закрытого случая — как «Итог» его карты.
import type { ContentDb, Id } from '../content/types';
import { scenarioOf } from '../engine/campaign/campaign';
import { primaryOf } from '../engine/med/plan';
import type { ShiftPatient, ShiftState } from '../engine/shift/types';

export class MetDesk {
  /** чьи закрытые случаи уже посмотрены */
  private seen = new Set<string>();
  /** какие болезни уже ушли окну */
  private sent = new Set<Id>();

  reset(): void {
    this.seen.clear();
    this.sent.clear();
  }

  /** Новые встреченные с прошлого раза, по алфавиту; не сценарий кампании ПК или нового нет — ничего. */
  out(db: ContentDb, s: ShiftState): Id[] | undefined {
    if (!s.flow || !scenarioOf(db, s.campaign)) return undefined;
    const fresh: Id[] = [];
    const look = (p: ShiftPatient) => {
      if (!p.closed || this.seen.has(p.id)) return;
      this.seen.add(p.id);
      const id = primaryOf(p.patient).id;
      if (this.sent.has(id)) return;
      this.sent.add(id);
      fresh.push(id);
    };
    for (const p of Object.values(s.patients)) look(p);
    // ушедшие из состояния за сутки — их карты в `past`: после загрузки сохранения они тоже встречались
    for (const x of s.past ?? []) look(x.p);
    return fresh.length > 0 ? fresh.sort() : undefined;
  }
}
