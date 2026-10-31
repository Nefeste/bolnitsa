// Резерв (spec docs/specs/2026-10-staff-mood.md, часть 5; решение владельца #97) — своё «Больницы», только в потоке для ПК со
// сменами. Нанятый без места («в резерве») той же должности сам встаёт на место того, кто болеет или учится, на время его
// отлучки и потом возвращается в резерв. Пока замещает — у него место и смена отсутствующего и отметка `covers`; место —
// по-прежнему за отсутствующим. Ушёл тот насовсем — замещающий остаётся на его месте. Платят резерву каждый день, как всем
// нанятым (`wagesOf`): «запас людей» геймдизайна (§7) — решение игрока. Чистая функция состояния смены. Место клинической
// медсестры (решение владельца #183) — место медсестры: нет в резерве клинической — встаёт медсестра.
import type { ContentDb } from '../../content/types';
import type { StaffMember } from '../hospital/staff';
import type { ShiftState, StaffNews } from './types';

/**
 * Привести резерв в порядок — после всего, что меняет отлучки и штат: планёрки, пересменки, команд стройки (учёба, найм,
 * увольнение, отмена). Замещающий держит место, пока отсутствующий в отлучке на том же месте и в той же смене, а сам он — нет;
 * иначе, когда доведёт начатое (`busy` — кто ведёт пациента), — отсутствующий вернулся, место сменилось или заболел сам —
 * в резерв, без места и смены; отсутствующий ушёл насовсем — место его. Место отсутствующего без замены — первому по штату в
 * резерве той же должности, кто сам не в отлучке; нет такого, а отсутствующий встаёт на место того, кого нанимают, — первому
 * из резерва той должности (медсестра — за клиническую); замещающему, что сам в отлучке, замены нет — его место освободится. Без
 * смен — ничего. `before` — перед тем, как штат станет другим (касса по эту минуту). Новости для планёрки: кто кого заменил
 * и кто вернулся в резерв (вставший снова на чьё-то место — только «заменил»); ничего — `undefined`.
 */
export function cover(db: ContentDb, s: ShiftState, busyOf: () => ReadonlySet<string>, before?: () => void): Pick<StaffNews, 'covered' | 'returned'> | undefined {
  const staff = s.staff;
  if (!staff?.some(m => m.covers !== undefined || m.away) || !staff.some(m => m.shift !== undefined)) return undefined;
  const byId = new Map(staff.map(m => [m.id, m]));
  let busy: ReadonlySet<string> | undefined;
  const returned: string[] = [];
  const next = staff.map(m => {
    if (m.covers === undefined) return m;
    const absent = byId.get(m.covers);
    if (absent?.away && !m.away && absent.room === m.room && absent.shift === m.shift) return m;
    const out: StaffMember = { ...m };
    delete out.covers;
    if (!absent) return out;
    if ((busy ??= busyOf()).has(m.id)) return m;
    delete out.room;
    delete out.shift;
    if (!m.away) returned.push(m.id);
    return out;
  });
  const taken = new Set(next.flatMap(m => (m.covers !== undefined ? [m.covers] : [])));
  const covered: { id: string; by: string }[] = [];
  for (const a of next) {
    if (!a.away || a.room === undefined || a.shift === undefined || a.covers !== undefined || taken.has(a.id)) continue;
    const idle = (m: StaffMember) => m.room === undefined && !m.away;
    let i = next.findIndex(m => idle(m) && m.role === a.role);
    // на место врача встают только терапевт и специалисты: врача не нанимают — у них замены другой должности нет
    const post = db.roles[a.role]?.stands;
    if (i < 0 && post !== undefined && db.roles[post]?.hire) i = next.findIndex(m => idle(m) && m.role === post);
    if (i < 0) continue;
    next[i] = { ...next[i], room: a.room, shift: a.shift, covers: a.id };
    taken.add(a.id);
    covered.push({ id: a.id, by: next[i].id });
  }
  if (next.every((m, i) => m === staff[i])) return undefined;
  before?.();
  s.staff = next;
  const back = returned.filter(id => !covered.some(c => c.by === id));
  if (covered.length === 0 && back.length === 0) return undefined;
  return { ...(covered.length > 0 ? { covered } : {}), ...(back.length > 0 ? { returned: back } : {}) };
}
