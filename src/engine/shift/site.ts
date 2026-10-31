// Стройка ПК во время смены (spec docs/specs/2026-10-build.md, «Стройка в любой момент», «Снос и отмена») — своё.
// Команда движка `{ kind: 'site', cmd }`: помещение, предмет, дверь, «Обставить», готовое помещение
// (spec docs/specs/2026-10-ready-rooms.md), скамья в коридоре (spec docs/specs/2026-10-door-benches.md), снос, найм, отмена,
// «Готово» — пока идут часы; с людьми (spec docs/specs/2026-10-staff-mood.md) — увольнение с выплатой, «Поднять зарплату» и
// «В другую смену». Действие — новая больница (`s.hospital` — новый объект): план, требования и то, что работает, движок
// считает заново, свободные нанятые врачи зовут ждущих. Занятое (на койке лежат, аппаратом обследуют, в помещении
// кто-то есть) убирается, когда освободится: проверка — событием очереди `siteFree`, поэтому итог не зависит от того,
// каким шагом идут часы. Койка лежащего — номер в помещении; после стройки номер переносится на тот же предмет. С кассой
// (spec docs/specs/2026-10-economy.md) стройка платится из неё сразу и не ниже предела минуса: не хватает — отказ `money`.
// Инструмент «Отделение» (spec docs/specs/2026-10-departments.md, часть 1) — отметка в плане больницы, бесплатно.
import { scenarioOf } from '../campaign/campaign';
import { Rng } from '../core/rng';
import { DOCTOR, standInOf } from '../hospital/requirements';
import {
  addBench, addItem, addReady, addRoom, bedOrder, demolish, type Done, FREE_CHECK, furnish, hospitalOf, markDept, type MoodStep, moveItem, removeDecor, removeDoor,
  removedBetween, removeItem, removeRoom, setDoor, setOffice, type Site, type SiteCommand, type SiteError, type SiteRoom, SITE_UNDO, type Works,
} from '../hospital/site';
import { covers, fitsPost, nightHospital, salaryOf, type Shift, type StaffMember, wageOf } from '../hospital/staff';
import { growthNumbers, studyUntil } from './growth';
import { payStudy, paySeverance, payWorks, shortOf } from './money';
import { manageOf } from './manage';
import { cheer, leavingOf, moodBack, moodOut, raisedOf, severanceOf } from './mood';
import { cover } from './reserve';
import type { ContentDb, Id } from '../../content/types';
import type { Notice, ShiftEvent, ShiftPatient, ShiftState } from './types';

const no = (cmd: SiteCommand['kind'], error: SiteError): Notice[] => [{ kind: 'site', cmd, ok: false, error }];

/** Событие в очередь — как `schedule` в engine.ts: по времени, при равном — по номеру постановки. */
function schedule(s: ShiftState, t: number, event: ShiftEvent) {
  const item = { t, seq: s.seq++, event };
  let i = s.events.length;
  while (i > 0 && (s.events[i - 1].t > t || (s.events[i - 1].t === t && s.events[i - 1].seq > item.seq))) i--;
  s.events.splice(i, 0, item);
}

/** Свободные нанятые врачи зовут ждущих — сразу, со следующим ходом часов (событие `free` движка). */
function nudge(s: ShiftState) {
  if (s.events.some(e => e.event.kind === 'free' && e.event.by === '' && e.t === s.t)) return;
  schedule(s, s.t, { kind: 'free', by: '' });
}

/** Проверить отложенное через FREE_CHECK — одно событие на очередь. */
function scheduleFree(s: ShiftState) {
  if (!s.events.some(e => e.event.kind === 'siteFree')) schedule(s, s.t + FREE_CHECK, { kind: 'siteFree' });
}

const leavingIn = (site: Site) => site.rooms.some(r => r.leaving || r.items.some(i => i.leaving));
const live = (p: ShiftPatient) => p.status === 'waiting' || p.status === 'inRoom' || p.status === 'away' || p.status === 'admitted';

/** Что сейчас занято: помещения с людьми и предметы «r3:17» — койки лежащих, аппараты обследований и операций. */
export function occupied(db: ContentDb, s: ShiftState): { rooms: Set<string>; items: Set<string>; staff: Set<string> } {
  const rooms = new Set<string>();
  const items = new Set<string>();
  const staff = new Set<string>();
  const site = s.hospital?.site;
  if (!site) return { rooms, items, staff };
  const roomOf = (id: string): SiteRoom | undefined => site.rooms.find(r => r.id === id);
  const bed = (room: string, n: number) => {
    const r = roomOf(room);
    const it = r ? bedOrder(r)[n] : undefined;
    if (it) items.add(`${room}:${it.id}`);
  };
  const machines = (room: string, fits: readonly string[]) => {
    for (const it of roomOf(room)?.items ?? []) if (it.eq && fits.includes(it.eq)) items.add(`${room}:${it.id}`);
  };
  for (const p of Object.values(s.patients)) {
    if (!live(p)) continue;
    if (p.status === 'admitted' && p.stay) {
      rooms.add(p.stay.room);
      bed(p.stay.room, p.stay.bed);
      const op = p.stay.op;
      if (op?.room && op.start !== undefined && !op.done) {
        rooms.add(op.room);
        machines(op.room, db.treatments[op.tx]?.surgery?.equipment ?? []);
        if (op.surgeon) staff.add(op.surgeon);
      }
    }
    if (p.bay && p.status !== 'admitted') {
      rooms.add(p.bay.room);
      bed(p.bay.room, p.bay.bed);
    }
    if (p.out && p.out.back > s.t) rooms.add(p.out.room);
    for (const x of p.pending) {
      if (!x.room || s.t >= x.readyAt) continue;
      rooms.add(x.room);
      machines(x.room, db.exams[x.exam]?.equipment ?? []);
    }
    if (p.by && p.status !== 'admitted') {
      staff.add(p.by);
      const office = s.staff?.find(m => m.id === p.by)?.room;
      if (office && p.status === 'inRoom') rooms.add(office);
    }
  }
  // у вас в кабинете пациент (spec 2026-10-doctor-mode): ваш кабинет занят, как кабинет нанятого врача с приёмом
  const yours = s.current ? s.patients[s.current] : undefined;
  if (yours && site.mine && !yours.bay) rooms.add(site.mine);
  return { rooms, items, staff };
}

/** Койки лежащих и места привезённых скорой — на тех же предметах после стройки. */
function rebind(s: ShiftState, before: Site, after: Site) {
  const remap = (room: string, n: number): number => {
    const b = before.rooms.find(r => r.id === room);
    const a = after.rooms.find(r => r.id === room);
    if (!a || !b) return n;
    const id = bedOrder(b)[n]?.id;
    if (id === undefined) return n;
    const k = bedOrder(a).findIndex(i => i.id === id);
    return k >= 0 ? k : n;
  };
  for (const p of Object.values(s.patients)) {
    if (p.stay) {
      const n = remap(p.stay.room, p.stay.bed);
      if (n !== p.stay.bed) p.stay.bed = n;
    }
    if (p.bay) {
      const n = remap(p.bay.room, p.bay.bed);
      if (n !== p.bay.bed) p.bay = { room: p.bay.room, bed: n };
    }
  }
}

/**
 * Новая больница: койки — на тех же предметах, люди снесённых помещений — в резерве, врачи зовут ждущих; сидевший на
 * снесённой скамье ждёт у двери стоя (spec docs/specs/2026-10-door-benches.md).
 */
function commit(db: ContentDb, s: ShiftState, before: Site, after: Site) {
  rebind(s, before, after);
  s.hospital = hospitalOf(db, after);
  if (after.decor !== before.decor) {
    const benches = new Set(after.decor.filter(d => d.kind === 'bench').map(d => d.y * after.w + d.x));
    for (const p of Object.values(s.patients)) if (p.bench !== undefined && !benches.has(p.bench)) delete p.bench;
  }
  const gone = new Set(before.rooms.filter(r => !after.rooms.some(x => x.id === r.id)).map(r => r.id));
  if (gone.size && s.staff?.some(m => m.room !== undefined && gone.has(m.room))) {
    s.staff = s.staff.map(m => {
      if (m.room === undefined || !gone.has(m.room)) return m;
      const out = { ...m };
      delete out.room;
      return out;
    });
  }
  nudge(s);
  if (leavingIn(after)) scheduleFree(s);
}

/** Действия, которые помещение не перестраивают: их отмена оставляет перестройку, какая есть (`WorksStep.keep`). */
const KEEPS = new Set<SiteCommand['kind']>(['dept', 'bench', 'undecor']);

/**
 * Снимок для отмены: до действия. С людьми (spec docs/specs/2026-10-staff-mood.md) — и выплата уволенному (`paid`), и что
 * вернуть настроению (`mood`).
 */
function remember(s: ShiftState, works: Works, site: Site, room?: string, more: { paid?: number; mood?: MoodStep; keep?: true } = {}) {
  works.undo.push({
    site, staff: s.staff ?? [], ...(s.nextStaff !== undefined ? { nextStaff: s.nextStaff } : {}), spent: works.spent, ...(room ? { room } : {}),
    ...(more.paid ? { paid: more.paid } : {}), ...(more.mood ? { mood: more.mood } : {}), ...(more.keep ? { keep: true as const } : {}),
  });
  if (works.undo.length > SITE_UNDO) works.undo.splice(0, works.undo.length - SITE_UNDO);
}

/**
 * Команда стройки ПК. Только в потоке для ПК и в больнице ПК; ошибка — ничего не меняется, извещение с причиной. Вышло —
 * резерв приводится в порядок (`cover`, spec docs/specs/2026-10-staff-mood.md, часть 5): отправили учиться — на место встаёт
 * резерв, уволили отсутствующего — замещающий остаётся, наняли в резерв — встаёт на пустое место.
 */
export function siteCommand(db: ContentDb, s: ShiftState, cmd: SiteCommand): Notice[] {
  const out = siteCommandOf(db, s, cmd);
  if (out.some(n => n.kind === 'site' && n.ok)) cover(s, () => occupied(db, s).staff);
  return out;
}

function siteCommandOf(db: ContentDb, s: ShiftState, cmd: SiteCommand): Notice[] {
  const site = s.hospital?.site;
  if (!s.flow || !site) return no(cmd.kind, { kind: 'mode' });
  const works = (s.works ??= { spent: 0, undo: [] });
  switch (cmd.kind) {
    case 'done': {
      if (site.editing === undefined) return [];
      const next = { ...site };
      delete next.editing;
      commit(db, s, site, next);
      return [];
    }
    case 'undo':
      return undo(db, s, works, site);
    case 'hire':
      return hire(db, s, works, site, cmd);
    case 'office':
      return office(db, s, works, site, cmd.room);
    case 'dismiss': {
      const m = s.staff?.find(x => x.id === cmd.id);
      if (!m) return no(cmd.kind, { kind: 'nothing' });
      if (occupied(db, s).staff.has(m.id)) return no(cmd.kind, { kind: 'busy' });
      // выплата за смены (spec 2026-10-staff-mood; геймдизайн §7) — и ниже предела минуса: уволить можно всегда
      const paid = severanceOf(db, m, manageOf(db, s).salary);
      remember(s, works, site, m.room, { paid, mood: moodOut(s, m.id), keep: true });
      s.staff = s.staff!.filter(x => x.id !== m.id);
      paySeverance(s, paid);
      nudge(s);
      return [{ kind: 'site', cmd: cmd.kind, ok: true, cost: paid }];
    }
    case 'raise':
      return raise(db, s, works, site, cmd.id);
    case 'reshift':
      return reshift(db, s, works, site, cmd.id);
    case 'study':
      return study(db, s, cmd.id);
    // «Нанять в резерв» (часть 5): без места и смены; как найм — в отмене стройки
    case 'reserve': {
      if (!db.roles[cmd.role]?.hire) return no(cmd.kind, { kind: 'unknown' });
      remember(s, works, site, undefined, { keep: true });
      const { id, sex, seed } = newcomer(s);
      s.staff = [...(s.staff ?? []), { id, role: cmd.role, sex, seed, skill: 3, salary: salaryOf(db, cmd.role, 3), days: 0 }];
      nudge(s);
      return [{ kind: 'site', cmd: cmd.kind, ok: true, cost: 0 }];
    }
  }
  // сценарий ПК (spec docs/specs/2026-10-scenario-1.md): строят только помещения из его списка
  const sc = scenarioOf(db, s.campaign);
  if (sc && (cmd.kind === 'room' || cmd.kind === 'ready') && !sc.build.includes(cmd.type)) return no(cmd.kind, { kind: 'scenario' });
  const busy = occupied(db, s);
  let later = false;
  let r: Done;
  switch (cmd.kind) {
    case 'room':
      r = addRoom(db, site, cmd.type, cmd);
      break;
    case 'item':
      r = addItem(db, site, cmd.room, cmd.item);
      break;
    case 'move':
      r = moveItem(db, site, cmd.room, cmd.id, cmd);
      break;
    case 'remove':
      later = busy.items.has(`${cmd.room}:${cmd.id}`);
      r = removeItem(db, site, cmd.room, cmd.id, later);
      break;
    case 'door':
      r = setDoor(db, site, cmd.room, cmd.cells);
      break;
    case 'undoor':
      r = removeDoor(db, site, cmd.room);
      break;
    case 'furnish':
      r = furnish(db, site, cmd.room);
      break;
    case 'ready':
      r = addReady(db, site, cmd.type, cmd.size, cmd.x, cmd.y, cmd.rot);
      break;
    case 'demolish':
      later = busy.rooms.has(cmd.room);
      r = demolish(db, site, cmd.room, later);
      break;
    case 'bench':
      r = addBench(db, site, cmd.x, cmd.y);
      break;
    case 'undecor':
      r = removeDecor(db, site, cmd.x, cmd.y);
      break;
    // инструмент «Отделение» (spec docs/specs/2026-10-departments.md, часть 1): бесплатно, в отмене — как стройка
    case 'dept':
      r = markDept(db, site, cmd.room, cmd.dept);
      break;
  }
  if (!r.ok) return no(cmd.kind, r.error);
  // касса (spec 2026-10-economy): трата не уведёт её ниже предела минуса — иначе стройка ждёт денег
  const need = shortOf(db, s, r.cost);
  if (need > 0) return no(cmd.kind, { kind: 'money', need });
  // отметка отделения и скамья в коридоре помещение не перестраивают — и отмена не закрывает его на перестройку (`keep`)
  remember(s, works, site, r.room ?? ('room' in cmd ? cmd.room : undefined), KEEPS.has(cmd.kind) ? { keep: true } : {});
  // готовое «С персоналом»: люди на все должности — в том же шаге отмены; со сменами (spec 2026-10-staff-shifts) — на
  // дневную, а в помещении, что работает ночью, в больнице, что работает ночью, — и на ночную, как у готовой больницы
  let hired: number | undefined;
  if (cmd.kind === 'ready' && cmd.staff && r.room) {
    hired = 0;
    const shifts: Shift[] = db.rooms[cmd.type].night && nightHospital(db, r.site.rooms) ? ['day', 'night'] : ['day'];
    for (const shift of shifts) for (const role of db.rooms[cmd.type].staff) if (staffPost(db, s, r.site, r.room, role, undefined, shift)) hired++;
  }
  commit(db, s, site, r.site);
  works.spent += r.cost;
  payWorks(s, r.cost);
  return [
    { kind: 'site', cmd: cmd.kind, ok: true, cost: r.cost, ...(later ? { later: true as const } : {}), ...(r.room ? { room: r.room } : {}), ...(hired !== undefined ? { hired } : {}) },
  ];
}

/**
 * Отмена: больница, штат и счётчик — как до последнего действия; цена — назад целиком. Пропал бы занятый предмет,
 * помещение или нанятый, который ведёт пациента, — не отменяется.
 */
function undo(db: ContentDb, s: ShiftState, works: Works, site: Site): Notice[] {
  const step = works.undo[works.undo.length - 1];
  if (!step) return no('undo', { kind: 'nothing' });
  const busy = occupied(db, s);
  const lost = removedBetween(site, step.site);
  if ([...lost.rooms].some(r => busy.rooms.has(r)) || [...lost.items].some(i => busy.items.has(i))) return no('undo', { kind: 'inUse' });
  if ((s.staff ?? []).some(m => busy.staff.has(m.id) && !step.staff.some(x => x.id === m.id))) return no('undo', { kind: 'busy' });
  works.undo.pop();
  const restored: Site = { ...step.site };
  // помещение, которое действие перестраивало, — снова перестраивается; действие без перестройки (`keep`: отметка отделения,
  // найм, увольнение, зарплата, смена, резерв, «Мой кабинет», скамья в коридоре) — перестройка, какая есть
  const editing = step.keep ? site.editing : step.room;
  if (editing !== undefined && restored.rooms.some(r => r.id === editing)) restored.editing = editing;
  else delete restored.editing;
  const cost = step.spent - works.spent;
  s.staff = mergeStaff(s.staff ?? [], step.staff);
  if (step.nextStaff !== undefined) s.nextStaff = step.nextStaff;
  else delete s.nextStaff;
  works.spent = step.spent;
  // касса (spec 2026-10-economy): цена действия — назад целиком; выплата уволенному — тоже (spec 2026-10-staff-mood)
  payWorks(s, cost);
  if (step.paid) paySeverance(s, -step.paid);
  if (step.mood) moodBack(s, step.mood);
  commit(db, s, site, restored);
  return [{ kind: 'site', cmd: 'undo', ok: true, cost: cost - (step.paid ?? 0), ...(step.room ? { room: step.room } : {}) }];
}

/**
 * Штат после отмены (spec docs/specs/2026-10-staff-mood.md): кто был до действия, на тех же местах, в тех же сменах и с той же
 * зарплатой, — но с тем, что случилось с ним после: навык и смены до следующего (рост), учёба и болезнь — из нынешнего штата.
 */
function mergeStaff(now: readonly StaffMember[], was: readonly StaffMember[]): StaffMember[] {
  const cur = new Map(now.map(m => [m.id, m]));
  return was.map(m => {
    const c = cur.get(m.id);
    if (!c || c === m) return m;
    const out: StaffMember = { ...c, salary: m.salary };
    if (m.room !== undefined) out.room = m.room;
    else delete out.room;
    if (m.shift !== undefined) out.shift = m.shift;
    else delete out.shift;
    if (m.covers !== undefined) out.covers = m.covers;
    else delete out.covers;
    return out;
  });
}

/**
 * «Отправить учиться» (spec docs/specs/2026-10-staff-mood.md, раздел 4; решение владельца, #84): до планёрки через
 * `studyDays` суток его нет — место за ним, а в смене пусто; цена — `studyCost` его смен, из кассы сразу и не ниже предела
 * минуса. Вернётся — навык +1 и настроение (`backMorning`). Отмены нет: учёба оплачена и идёт. Нельзя без смены, на навыке 5,
 * в отлучке, пока ведёт пациента и когда уходит сам.
 */
function study(db: ContentDb, s: ShiftState, id: string): Notice[] {
  const m = s.staff?.find(x => x.id === id);
  const g = m ? growthNumbers(db, s, m) : undefined;
  if (!m || !g || m.skill >= 5 || m.away) return no('study', { kind: 'nothing' });
  if (leavingOf(s, id)) return no('study', { kind: 'leaving' });
  if (occupied(db, s).staff.has(id)) return no('study', { kind: 'busy' });
  const cost = g.studyCost * wageOf(db, m, manageOf(db, s).salary);
  const need = shortOf(db, s, cost);
  if (need > 0) return no('study', { kind: 'money', need });
  payStudy(s, cost);
  s.staff = s.staff!.map(x => (x.id === id ? { ...x, away: { why: 'study' as const, until: studyUntil(g, s.t) } } : x));
  nudge(s);
  return [{ kind: 'site', cmd: 'study', ok: true, cost }];
}

/**
 * «Поднять зарплату» (spec docs/specs/2026-10-staff-mood.md, 2): до рынка его навыка или на шаг выше; настроение — прибавка
 * сразу, выше порога — «собирается уйти» снято. Уходящему сам — поздно. Зарплата — со следующего часа кассы.
 */
function raise(db: ContentDb, s: ShiftState, works: Works, site: Site, id: string): Notice[] {
  const m = s.staff?.find(x => x.id === id);
  if (!m) return no('raise', { kind: 'nothing' });
  if (leavingOf(s, id)) return no('raise', { kind: 'leaving' });
  const salary = raisedOf(db, m);
  remember(s, works, site, undefined, { mood: cheer(db, s, m, 'raise'), keep: true });
  s.staff = s.staff!.map(x => (x.id === id ? { ...x, salary } : x));
  return [{ kind: 'site', cmd: 'raise', ok: true, cost: 0 }];
}

/**
 * «В другую смену» (spec docs/specs/2026-10-staff-mood.md, 2): дневной — в ночную и назад, сразу; на его месте в той смене
 * кто-то есть — тот меняется с ним. Собиравшемуся уйти — прибавка настроения. Нельзя, пока он или тот ведёт пациента; без
 * смены (круглые сутки) и на месте, которое в той смене держит человек без смены, — нечего.
 */
function reshift(db: ContentDb, s: ShiftState, works: Works, site: Site, id: string): Notice[] {
  const m = s.staff?.find(x => x.id === id);
  // замещающий (часть 5) — на чужом месте: смена его — смена отсутствующего
  if (!m?.shift || m.covers !== undefined) return no('reshift', { kind: 'nothing' });
  if (leavingOf(s, id)) return no('reshift', { kind: 'leaving' });
  const was = m.shift;
  const to: Shift = was === 'day' ? 'night' : 'day';
  const post = (x: StaffMember) => db.roles[x.role]?.stands ?? x.role;
  const there = m.room === undefined ? [] : s.staff!.filter(x => x !== m && x.room === m.room && post(x) === post(m) && covers(x, to));
  const other = there.find(x => x.shift === to);
  if (there.some(x => x.shift === undefined)) return no('reshift', { kind: 'nothing' });
  const busy = occupied(db, s).staff;
  if (busy.has(m.id) || (other && busy.has(other.id))) return no('reshift', { kind: 'busy' });
  remember(s, works, site, undefined, { mood: cheer(db, s, m, 'moved'), keep: true });
  s.staff = s.staff!.map(x => (x === m ? { ...x, shift: to } : x === other ? { ...x, shift: was } : x));
  nudge(s);
  return [{ kind: 'site', cmd: 'reshift', ok: true, cost: 0 }];
}

/**
 * Нанять на должность помещения (spec «Персонал»): врачу — терапевта или специалиста (`as`, spec
 * docs/specs/2026-10-specialists.md): нанятый врач встаёт на место врача. Сначала — тот, кто в резерве; нет — новый: навык
 * 3, без черты, зарплата каталога; пол и облик — из ветви зерна `hire:<номер>`. На смену (spec
 * docs/specs/2026-10-staff-shifts.md): место — на две смены, у каждой свой человек; кто без смены, тот на обеих.
 */
function hire(db: ContentDb, s: ShiftState, works: Works, site: Site, cmd: Extract<SiteCommand, { kind: 'hire' }>): Notice[] {
  const room = site.rooms.find(r => r.id === cmd.room);
  if (!room || room.leaving) return no('hire', { kind: 'unknown' });
  if (!db.rooms[room.type]?.staff.includes(cmd.role)) return no('hire', { kind: 'notHere' });
  if (cmd.role === DOCTOR && room.id === site.mine) return no('hire', { kind: 'notHere' });
  // встаёт на это место: врачу — терапевт или специалист, кто встаёт на место врача; медсестре в помещении с койками —
  // клиническая медсестра, только днём (spec docs/specs/2026-10-staff-motion.md, часть 2б; решение владельца #183)
  if (cmd.as !== undefined && (cmd.as !== cmd.role && db.roles[cmd.as]?.stands !== cmd.role)) return no('hire', { kind: 'notHere' });
  const role = cmd.as ?? (cmd.role === DOCTOR ? standInOf(db, DOCTOR) : cmd.role);
  if (!role || !db.roles[role]?.hire) return no('hire', { kind: 'unknown' });
  const shift = cmd.shift ?? 'day';
  if (!fitsPost(db, role, room.type, shift)) return no('hire', { kind: 'notHere' });
  const post = (m: StaffMember) => db.roles[m.role]?.stands ?? m.role;
  if ((s.staff ?? []).some(m => m.room === room.id && post(m) === cmd.role && covers(m, shift))) return no('hire', { kind: 'nothing' });
  remember(s, works, site, room.id, { keep: true });
  staffPost(db, s, site, room.id, cmd.role, role, shift);
  nudge(s);
  return [{ kind: 'site', cmd: 'hire', ok: true, cost: 0, room: room.id }];
}

/**
 * Человек на должность `post` помещения `roomId` в смену `shift` — без проверок и без записи отмены (их делает команда):
 * врачу — терапевт или `as` (специалист). Сначала тот, кто в резерве (кто не в отлучке — раньше), — теперь в этой смене;
 * нет — новый: навык 3, без черты, зарплата каталога (`newcomer`). Должность в эту смену занята, ваш кабинет или
 * нанять некого — никого, `false`.
 */
function staffPost(db: ContentDb, s: ShiftState, site: Site, roomId: string, post: Id, as: Id | undefined, shift: Shift): boolean {
  if (post === DOCTOR && roomId === site.mine) return false;
  const role = as ?? (post === DOCTOR ? standInOf(db, DOCTOR) : post);
  if (!role || !db.roles[role]?.hire) return false;
  const type = site.rooms.find(r => r.id === roomId)?.type;
  if (type === undefined || !fitsPost(db, role, type, shift)) return false;
  const staff = s.staff ?? [];
  if (staff.some(m => m.room === roomId && (db.roles[m.role]?.stands ?? m.role) === post && covers(m, shift))) return false;
  const free = (m: StaffMember) => m.room === undefined && m.role === role;
  const reserve = staff.find(m => free(m) && !m.away) ?? staff.find(free);
  if (reserve) s.staff = staff.map(m => (m === reserve ? { ...m, room: roomId, shift } : m));
  else {
    const { id, sex, seed } = newcomer(s);
    s.staff = [...staff, { id, role, sex, seed, skill: 3, salary: salaryOf(db, role, 3), room: roomId, days: 0, shift }];
  }
  return true;
}

/** Новый человек штата: номер по порядку, пол и облик — из ветви зерна `hire:<номер>`. */
function newcomer(s: ShiftState): { id: string; sex: 'm' | 'f'; seed: number } {
  const n = s.nextStaff ?? 1;
  const id = `s${n}`;
  const r = Rng.seeded(s.meta.seed).fork(`hire:${id}`);
  const sex: 'm' | 'f' = r.chance(5000) ? 'f' : 'm';
  s.nextStaff = n + 1;
  return { id, sex, seed: r.u32() };
}

/**
 * «Мой кабинет» и «Не принимаю» (spec docs/specs/2026-10-doctor-mode.md, «Ваш кабинет»): нельзя, пока у вас в кабинете
 * пациент или пока нанятый врач того кабинета ведёт пациента. Нанятый врач того кабинета встаёт в ваш прежний кабинет, а
 * нет прежнего — в резерв: «Мой» не убирает врача из больницы. Цена — 0; в отмене стройки — как любое действие.
 */
function office(db: ContentDb, s: ShiftState, works: Works, site: Site, room: string | undefined): Notice[] {
  if (s.current) return no('office', { kind: 'busy' });
  const r = setOffice(db, site, room);
  if (!r.ok) return no('office', r.error);
  const post = (m: StaffMember) => db.roles[m.role]?.stands ?? m.role;
  // врачи того кабинета — и дневной, и ночной (spec 2026-10-staff-shifts)
  const there = room === undefined ? [] : (s.staff ?? []).filter(m => m.room === room && post(m) === DOCTOR);
  const busy = occupied(db, s).staff;
  if (there.some(m => busy.has(m.id))) return no('office', { kind: 'busy' });
  // отмена «Моего» не закрывает кабинет на перестройку и не открывает тот, что перестраивают
  remember(s, works, site, undefined, { keep: true });
  if (there.length > 0) {
    const old = site.mine && site.rooms.some(x => x.id === site.mine && !x.leaving) ? site.mine : undefined;
    s.staff = s.staff!.map(m => {
      if (!there.includes(m)) return m;
      if (old) return { ...m, room: old };
      const out = { ...m };
      delete out.room;
      return out;
    });
  }
  commit(db, s, site, r.site);
  return [{ kind: 'site', cmd: 'office', ok: true, cost: 0, ...(room ? { room } : {}) }];
}

/** Событие `siteFree`: освободившееся — прочь; ещё что-то ждёт — проверить снова через FREE_CHECK. */
export function siteFree(db: ContentDb, s: ShiftState) {
  const site = s.hospital?.site;
  if (!site || !leavingIn(site)) return;
  const busy = occupied(db, s);
  let next = site;
  for (const r of site.rooms) {
    if (r.leaving) {
      if (!busy.rooms.has(r.id)) next = removeRoom(next, next.rooms.find(x => x.id === r.id)!);
      continue;
    }
    const drop = r.items.filter(i => i.leaving && !busy.items.has(`${r.id}:${i.id}`));
    if (drop.length) next = { ...next, rooms: next.rooms.map(x => (x.id === r.id ? { ...x, items: x.items.filter(i => !drop.includes(i)) } : x)) };
  }
  if (next !== site) commit(db, s, site, next);
  else if (leavingIn(site)) scheduleFree(s);
}
