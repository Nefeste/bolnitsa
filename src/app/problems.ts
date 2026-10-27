// Слой «Проблемы» (spec docs/specs/2026-10-layers.md, часть 1; геймдизайн §3, «Слои карты»): что сейчас мешает больнице и
// где — помещения по их значкам, люди штата по настроению и усталости, лежачие без каталки, касса. Чистые функции без DOM
// и Three.js — их проверяет tools/test/problems.test.ts; строки — из src/i18n, пороги — те же, что у значков и слоя
// очередей (src/app/flow.ts), у усталости и предела минуса.
import type { Problem } from '../engine/hospital/requirements';
import { T } from '../i18n';
import { dur, LONG_WAIT, type RoomChip, type RoomLoad } from './flow';

/** Красный — не работает или ждут долго; жёлтый — внимание; серый — закрыто игроком (перестройка, снос). */
export type ProblemLevel = 'bad' | 'warn' | 'off';

/** Куда ведёт строка: помещение — камера и его карточка; человек — камера и выбор, как «Найти»; касса — «Отчёты». */
export type ProblemGo = { room: string } | { person: string } | { reports: true };

export interface ProblemRow {
  key: string;
  level: ProblemLevel;
  where: string;
  what: string;
  go: ProblemGo;
}

/** Список слоя: первые `MAX_ROWS` строк и сколько ещё; `count` — красных и жёлтых (число в меню «Слои»). */
export interface ProblemList {
  rows: ProblemRow[];
  more: number;
  count: number;
}

/** Строк в списке справа внизу — не больше. */
export const MAX_ROWS = 8;

const ORDER: ProblemLevel[] = ['bad', 'warn', 'off'];

/**
 * В этой смене в помещении никого, а в другой есть («закрыто до …»), — и это дыра в смене: днём — у любого помещения,
 * ночью — у того, что работает и ночью (`night` вида помещения: лаборатория, палаты, приёмное). Кабинет ночью закрыт —
 * так задумано.
 */
export const shiftGap = (kind: Problem['kind'] | 'broken' | 'offShift' | undefined, day: boolean, night: boolean): boolean => kind === 'offShift' && (day || night);

/**
 * Уровень помещения по его значку: красный — не работает, нет персонала, ждут 30 минут и дольше; жёлтый — ждут 15–30
 * минут, заняты все койки, дыра в смене (`gap`, `shiftGap`); серый — закрыто на перестройку или сносится. «Врач
 * просит», «занято», короткая очередь, кабинет ночью — не проблема.
 */
export function roomLevel(chip: RoomChip, kind?: Problem['kind'] | 'broken' | 'offShift', gap = false): ProblemLevel | undefined {
  if (kind === 'closed' || kind === 'leaving') return 'off';
  if (chip.tone === 'bad') return 'bad';
  if (chip.tone === 'queue') return 'warn';
  if (chip.tone === 'off') return 'off';
  if (gap) return 'warn';
  return undefined;
}

/** Цвет пола слоя: красный и жёлтый — как у слоя очередей, серый — как «не работает» там же; не проблема — без цвета. */
export function problemTint(level: ProblemLevel | undefined): number | null {
  if (level === 'bad') return 0xff2a12;
  if (level === 'warn') return 0xffc400;
  if (level === 'off') return 0x6f7a80;
  return null;
}

export interface ProblemsInput {
  /**
   * помещения плана: значок, нагрузка, первая причина «не работает» и её слова; `night` — вид помещения работает и ночью
   */
  rooms: { id: string; name: string; chip: RoomChip; load: RoomLoad; kind?: Problem['kind'] | 'broken' | 'offShift'; why?: string; night?: boolean }[];
  /** сейчас дневная смена */
  day: boolean;
  /** люди штата: кто; собирается уйти, уходит после смены; усталость в смене (0–100) и на перерыве ли */
  staff: { key: string; who: string; quit?: boolean; go?: boolean; fatigue?: number; resting?: boolean }[];
  /** «ошибается чаще» — с такой усталости (`tired`, economy.yaml); нет — усталость не проблема */
  tired?: number;
  /** лежачие ждут каталку: кто и с какого часа */
  gurney: { key: string; since: number }[];
  /** касса, ₽; нет — игра без денег */
  cash?: number;
  /** предел минуса уровня «Управления», ₽; 0 — не задан */
  limit: number;
  t: number;
  money: (n: number) => string;
}

/** Проблемы сейчас: сначала красные, потом жёлтые и серые; внутри — помещения, люди штата, лежачие, касса. */
export function problemList(x: ProblemsInput): ProblemList {
  const t = T.flow.problems;
  const all: ProblemRow[] = [];
  // помещения: не работает — раньше долгой очереди, очереди — от самой долгой
  const rooms = x.rooms
    .map((r, i) => ({ r, i, level: roomLevel(r.chip, r.kind, shiftGap(r.kind, x.day, !!r.night)) }))
    .filter(r => r.level !== undefined)
    .sort((a, b) => Number(a.r.chip.icon === 'queue') - Number(b.r.chip.icon === 'queue') || b.r.load.wait - a.r.load.wait || a.i - b.i);
  for (const { r, level } of rooms) {
    const c = r.chip;
    const what =
      level === 'off'
        ? r.kind === 'leaving' ? T.problem.leaving : T.problem.closed
        : c.tone === 'rest' || (r.kind === 'offShift' && c.tone !== 'bad' && c.tone !== 'queue')
          ? t.offShift(r.why ?? c.text)
          : c.icon === 'bed' && r.load.beds ? t.bedsFull(r.load.beds[0], r.load.beds[1]) : (c.long ?? c.text);
    all.push({ key: `r:${r.id}`, level: level!, where: r.name, what, go: { room: r.id } });
  }
  for (const m of x.staff) {
    if (m.quit || m.go) all.push({ key: m.key, level: 'bad', where: m.who, what: m.go ? t.leaving : t.quit, go: { person: m.key } });
    else if (x.tired !== undefined && m.fatigue !== undefined && m.fatigue >= x.tired && !m.resting)
      all.push({ key: m.key, level: 'warn', where: m.who, what: t.tired(m.fatigue), go: { person: m.key } });
  }
  // лежачие без каталки: ждут дольше «ждёт долго» — одна строка, к тому, кто ждёт дольше всех
  const long = x.gurney.filter(g => x.t - g.since >= LONG_WAIT).sort((a, b) => a.since - b.since);
  if (long.length > 0) all.push({ key: 'gurney', level: 'warn', where: t.lying, what: t.gurney(long.length, dur(x.t - long[0].since)), go: { person: long[0].key } });
  // касса: в минусе — жёлтая, ниже предела минуса (стройки нет, банк предложит кредит) — красная
  if (x.cash !== undefined && x.cash < 0) {
    const below = x.limit > 0 && x.cash <= -x.limit;
    const what = below ? t.limit(x.money(x.cash)) : x.limit > 0 ? t.minus(x.money(x.cash), x.money(x.limit + x.cash)) : t.minusNoLimit(x.money(x.cash));
    all.push({ key: 'cash', level: below ? 'bad' : 'warn', where: t.cash, what, go: { reports: true } });
  }
  const sorted = ORDER.flatMap(l => all.filter(r => r.level === l));
  return { rows: sorted.slice(0, MAX_ROWS), more: Math.max(0, sorted.length - MAX_ROWS), count: sorted.filter(r => r.level !== 'off').length };
}

/** Тот же список — для `store.set` раз в 100 мс: перерисовывать панель, только когда он изменился. */
export function sameList(a: ProblemList, b: ProblemList): boolean {
  return a.more === b.more && a.count === b.count && a.rows.length === b.rows.length && a.rows.every((r, i) => r.key === b.rows[i].key && r.level === b.rows[i].level && r.what === b.rows[i].what && r.where === b.rows[i].where);
}
