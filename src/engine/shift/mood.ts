// Настроение нанятых в смене (spec docs/specs/2026-10-staff-mood.md, часть 1; геймдизайн §7, «Человек») — своё «Больницы»,
// только в потоке для ПК и только у нанятых со сменой: без смен (сохранения до 0.9.0, смены «Анамнеза») настроения нет.
// Меняется раз в сутки, на планёрке, по прошедшим суткам: зарплата против рынка его навыка, предел усталости, отдых на месте
// без ординаторской, нет санузла, ночные смены подряд; без причин тянется к начальному. Ниже порога несколько утр подряд —
// «собирается уйти»; не ответили — уходит сам после своей смены. Числа — `economy.yaml`, `staff.mood`. Случайного здесь
// нет: всё — на планёрке, в пересменку и в командах игрока, поэтому те же зерно и команды — то же настроение при любом шаге
// часов. Отметки за сутки (предел, отдых на месте) — начало смены, в которой это было: дважды отмеченное — то же.
import type { ContentDb } from '../../content/types';
import type { MoodStep } from '../hospital/site';
import { type Mood, type MoodWhy, onDuty, salaryOf, type StaffMember, wageOf } from '../hospital/staff';
import { DAY, type ShiftState, type StaffNews } from './types';

type Numbers = NonNullable<ContentDb['economy']['staff']['mood']>;

/** Числа настроения, если оно есть: поток для ПК и в базе есть настроение; с человеком — ещё и у него смена. */
export function moodNumbers(db: ContentDb, s: ShiftState, m?: StaffMember): Numbers | undefined {
  return s.flow && (m === undefined || m.shift !== undefined) ? db.economy.staff.mood : undefined;
}

/** Рынок для него, ₽ за смену: с такой зарплатой нанимают человека его должности, навыка и черты (`salaryOf`). */
export const marketOf = (db: ContentDb, m: StaffMember): number => salaryOf(db, m.role, m.skill, m.trait);

/**
 * Зарплата после «Поднять зарплату»: ниже рынка — до рынка, иначе — на `step` % выше, вверх до 50 ₽: не меньше шага, иначе
 * поднятая с рынка не была бы выше рынка настолько, чтобы радовать (`market`).
 */
export function raisedOf(db: ContentDb, m: StaffMember): number {
  const market = marketOf(db, m);
  if (m.salary < market) return market;
  const step = db.economy.staff.mood?.step ?? 10;
  return Math.ceil((m.salary * (100 + step)) / 100 / 50) * 50;
}

/** Выплата уволенному, ₽ (геймдизайн §7): `severance` его смен, ночная — с надбавкой; без настроения в базе — 0. */
export const severanceOf = (db: ContentDb, m: StaffMember): number => (db.economy.staff.mood?.severance ?? 0) * wageOf(db, m);

const clamp = (v: number): number => Math.max(0, Math.min(100, v));

/** Запись настроения человека — новая, если её нет. */
function recordOf(n: Numbers, s: ShiftState, id: string): Mood {
  const moods = (s.moods ??= {});
  return (moods[id] ??= { v: n.start });
}

/** Уходит ли сам (`go`): поднимать зарплату и переводить поздно. */
export const leavingOf = (s: ShiftState, id: string): boolean => s.moods?.[id]?.go !== undefined;

/**
 * Отметить за сутки, до планёрки: дошёл до предела усталости (`limit`) или отдыхал на месте, потому что ординаторской нет
 * (`here`), — в смене, что началась в `at`.
 */
export function noteMood(db: ContentDb, s: ShiftState, m: StaffMember, what: 'limit' | 'here', at: number) {
  const n = moodNumbers(db, s, m);
  if (!n) return;
  recordOf(n, s, m.id)[what] = at;
}

/**
 * Разовая прибавка (spec «Как будет», 1): подняли зарплату (`raise`) — всегда; перевели в другую смену (`moved`) — только
 * того, кто собирался уйти. Поднялось выше порога — «собирается уйти» снято сразу. Что вернуть отменой — шаг; ничего не
 * изменилось — нет.
 */
export function cheer(db: ContentDb, s: ShiftState, m: StaffMember, why: 'raise' | 'moved'): MoodStep | undefined {
  const n = moodNumbers(db, s, m);
  if (!n) return undefined;
  const r = recordOf(n, s, m.id);
  if (why === 'moved' && r.quit === undefined) return undefined;
  const v = clamp(r.v + n[why]);
  const step: MoodStep = { id: m.id, d: v - r.v };
  r.v = v;
  shift(r, step.d!);
  if (r.quit !== undefined && v > n.quit) {
    step.quit = r.quit;
    if (r.low !== undefined) step.low = r.low;
    delete r.quit;
    delete r.low;
  }
  return step;
}

/** Стрелка окна (`d`) — от настроения до последней планёрки: разовая прибавка — тоже в ней. */
function shift(r: Mood, d: number) {
  const x = (r.d ?? 0) + d;
  if (x !== 0) r.d = x;
  else delete r.d;
}

/**
 * Прибавка без отмены (spec «Как будет», 4): вернулся с учёбы — `d` сразу, со стрелкой окна; выше порога — «собирается уйти»
 * снято. Без настроения — ничего.
 */
export function boost(db: ContentDb, s: ShiftState, id: string, d: number) {
  const m = s.staff?.find(x => x.id === id);
  const n = m ? moodNumbers(db, s, m) : undefined;
  if (!n) return;
  const r = recordOf(n, s, id);
  const v = clamp(r.v + d);
  shift(r, v - r.v);
  r.v = v;
  if (r.quit !== undefined && v > n.quit) {
    delete r.quit;
    delete r.low;
  }
}

/** Уволенного — запись прочь; что вернуть отменой — шаг. */
export function moodOut(s: ShiftState, id: string): MoodStep | undefined {
  const was = s.moods?.[id];
  if (!was) return undefined;
  delete s.moods![id];
  return { id, was };
}

/** Отмена действия с человеком: настроение — как до него (прибавку — назад, снятое «собирается уйти» — обратно). */
export function moodBack(s: ShiftState, step: MoodStep) {
  if (step.was) {
    (s.moods ??= {})[step.id] = step.was;
    return;
  }
  const r = s.moods?.[step.id];
  if (!r) return;
  if (step.d) {
    r.v = clamp(r.v - step.d);
    shift(r, -step.d);
  }
  if (step.quit !== undefined) r.quit = step.quit;
  if (step.low !== undefined) r.low = step.low;
}

/** Конец смены, что идёт в `t`: дневной — в `day[1]` часов этих суток, ночной — в `day[0]` часов этих или следующих. */
function shiftEndOf(db: ContentDb, t: number): number {
  const day = db.economy.staff.shifts?.day ?? [0, 24];
  const base = Math.floor(t / DAY) * DAY;
  const h = t - base;
  if (h >= day[0] * 3600 && h < day[1] * 3600) return base + day[1] * 3600;
  return h >= day[1] * 3600 ? base + DAY + day[0] * 3600 : base + day[0] * 3600;
}

/**
 * Тяга к начальному за утро: `drift` % расстояния, отброшенная дробь, но не меньше 1, пока не дотянулось. Постоянные причины
 * `c` в сутки держат настроение у равновесия `start` + `c` · 100 / `drift`: ночные (−2) — у 50, ниже рынка (−5) — у 20.
 */
function pull(n: Numbers, v: number): number {
  const d = n.start - v;
  return d === 0 ? 0 : Math.sign(d) * Math.max(1, Math.trunc((Math.abs(d) * n.drift) / 100));
}

/** Порядок причин с одинаковым весом — для строки окна. */
const ORDER: MoodWhy[] = ['below', 'limit', 'here', 'toilet', 'nights', 'above'];

/**
 * Планёрка (spec «Как будет», 1–2): настроение каждого нанятого со сменой — по прошедшим суткам. Причины — с отметками этих
 * суток (`limit`, `here`, начало смены в [t − сутки, t)), зарплатой против рынка сейчас, санузлом в больнице (`toilet` —
 * есть ли он сейчас, как у репутации) и ночными подряд; и каждое утро — к начальному на `drift` % расстояния (`pull`). Ниже
 * порога `days` утр подряд —
 * «собирается уйти» до утра через `respond` суток; к тому утру не выше порога — уходит после своей смены (`go`), выше — остаётся.
 * Записи тех, кого нет в штате, — прочь. Что сказать на планёрке — новости; нечего — нет.
 */
export function moodMorning(db: ContentDb, s: ShiftState, toilet: boolean): StaffNews | undefined {
  const n = moodNumbers(db, s);
  if (!n || !s.staff) return undefined;
  const news: StaffNews = {};
  const from = s.t - DAY;
  for (const m of s.staff) {
    if (m.shift === undefined) continue;
    const r = recordOf(n, s, m.id);
    if (r.go !== undefined) continue;
    // работал: на месте, а не на учёбе и не болел (spec «Как будет», 4–5)
    const works = m.room !== undefined && !m.away;
    if (works && m.shift === 'night') r.nights = (r.nights ?? 0) + 1;
    else delete r.nights;
    const causes: [MoodWhy, number][] = [];
    const market = marketOf(db, m);
    if (m.salary * 100 <= market * (100 - n.market)) causes.push(['below', n.below]);
    else if (m.salary * 100 >= market * (100 + n.market)) causes.push(['above', n.above]);
    const within = (x: number | undefined) => x !== undefined && x >= from && x < s.t;
    if (within(r.limit)) causes.push(['limit', n.limit]);
    if (within(r.here)) causes.push(['here', n.here]);
    if (works && !toilet) causes.push(['toilet', n.toilet]);
    if ((r.nights ?? 0) >= n.nights[0]) causes.push(['nights', n.nights[1]]);
    // отметки этих суток прочитаны; смены, что начались с планёрки, — в следующие
    if (r.limit !== undefined && r.limit < s.t) delete r.limit;
    if (r.here !== undefined && r.here < s.t) delete r.here;
    const before = r.v;
    r.v = clamp(r.v + causes.reduce((a, c) => a + c[1], 0) + pull(n, r.v));
    if (r.v !== before) r.d = r.v - before;
    else delete r.d;
    if (causes.length > 0) {
      causes.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]) || ORDER.indexOf(a[0]) - ORDER.indexOf(b[0]));
      r.why = causes.map(c => c[0]);
    } else if (r.v === n.start) delete r.why;
    if (r.v < n.quit) {
      r.low = (r.low ?? 0) + 1;
      if (before >= n.quit) (news.low ??= []).push(m.id);
    } else delete r.low;
    if (r.quit !== undefined) {
      if (r.v > n.quit) {
        delete r.quit;
        delete r.low;
      } else if (s.day >= r.quit) {
        // не дождался: уходит в конце своей смены — дневной, что началась сейчас; ночной, что сейчас кончилась; из резерва — сразу
        r.go = works && onDuty(db, m, s.t) ? shiftEndOf(db, s.t) : s.t;
        delete r.quit;
        delete r.low;
        (news.leave ??= []).push({ id: m.id, role: m.role, sex: m.sex, seed: m.seed, why: r.why ?? [] });
      }
    } else if ((r.low ?? 0) >= n.days) {
      r.quit = s.day + n.respond;
      (news.quit ??= []).push({ id: m.id, until: r.quit });
    }
  }
  if (s.moods) {
    const here = new Set(s.staff.map(m => m.id));
    for (const id of Object.keys(s.moods)) if (!here.has(id)) delete s.moods[id];
    if (Object.keys(s.moods).length === 0) delete s.moods;
  }
  return news.low || news.quit || news.leave ? news : undefined;
}

/**
 * Уходящие сами (spec «Как будет», 2) — прочь из штата: их смена кончилась (`go`) и они не ведут пациента (`busy`); ведёт —
 * уйдёт в следующую пересменку. Из снимков отмены стройки — тоже: отмена не вернёт ушедшего. Кто ушёл — номера.
 */
export function depart(s: ShiftState, busy: ReadonlySet<string>): string[] {
  const moods = s.moods;
  if (!moods || !s.staff) return [];
  const ids = new Set(s.staff.filter(m => moods[m.id]?.go !== undefined && moods[m.id].go! <= s.t && !busy.has(m.id)).map(m => m.id));
  if (ids.size === 0) return [];
  s.staff = s.staff.filter(m => !ids.has(m.id));
  for (const id of ids) delete moods[id];
  if (Object.keys(moods).length === 0) delete s.moods;
  for (const step of s.works?.undo ?? []) if (step.staff.some(m => ids.has(m.id))) step.staff = step.staff.filter(m => !ids.has(m.id));
  return [...ids];
}

/** Есть ли кому уходить в этот час — чтобы пересменка без уходящих не трогала кассу. */
export const leaversDue = (s: ShiftState): boolean => s.moods !== undefined && Object.values(s.moods).some(r => r.go !== undefined && r.go <= s.t);

/** Для окна: настроение, на сколько и почему изменилось, «собирается уйти» до каких суток, уходит с какого часа. */
export interface MoodView {
  id: string;
  v: number;
  d?: number;
  why?: MoodWhy[];
  quit?: number;
  go?: number;
}

/** Для окна (spec «Как будет», 1): настроение каждого нанятого со сменой; записи нет — начальное. */
export function moodsOf(db: ContentDb, s: ShiftState): MoodView[] {
  const n = moodNumbers(db, s);
  if (!n || !s.staff) return [];
  return s.staff.flatMap(m => {
    if (m.shift === undefined) return [];
    const r = s.moods?.[m.id];
    if (!r) return [{ id: m.id, v: n.start }];
    return [{
      id: m.id, v: r.v, ...(r.d !== undefined ? { d: r.d } : {}), ...(r.why?.length ? { why: [...r.why] } : {}),
      ...(r.quit !== undefined ? { quit: r.quit } : {}), ...(r.go !== undefined ? { go: r.go } : {}),
    }];
  });
}
