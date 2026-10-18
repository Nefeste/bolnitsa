// Стройка ПК во время смены (spec docs/specs/2026-10-build.md, «Стройка в любой момент», «Снос и отмена») — своё.
// Команда движка `{ kind: 'site', cmd }`: помещение, предмет, дверь, «Обставить», готовое помещение
// (spec docs/specs/2026-10-ready-rooms.md), снос, найм, отмена, «Готово» — пока идут часы. Действие — новая больница (`s.hospital` — новый объект): план, требования и то, что работает, движок
// считает заново, свободные нанятые врачи зовут ждущих. Занятое (на койке лежат, аппаратом обследуют, в помещении
// кто-то есть) убирается, когда освободится: проверка — событием очереди `siteFree`, поэтому итог не зависит от того,
// каким шагом идут часы. Койка лежащего — номер в помещении; после стройки номер переносится на тот же предмет. С кассой
// (spec docs/specs/2026-10-economy.md) стройка платится из неё сразу и не ниже предела минуса: не хватает — отказ `money`.
import { Rng } from '../core/rng';
import { DOCTOR, standInOf } from '../hospital/requirements';
import {
  addItem, addReady, addRoom, bedOrder, demolish, type Done, FREE_CHECK, furnish, hospitalOf, moveItem, removeDoor, removedBetween, removeItem, removeRoom,
  setDoor, setOffice, type Site, type SiteCommand, type SiteError, type SiteRoom, SITE_UNDO, type Works,
} from '../hospital/site';
import { salaryOf, type StaffMember } from '../hospital/staff';
import { payWorks, shortOf } from './money';
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

/** Новая больница: койки — на тех же предметах, люди снесённых помещений — в резерве, врачи зовут ждущих. */
function commit(db: ContentDb, s: ShiftState, before: Site, after: Site) {
  rebind(s, before, after);
  s.hospital = hospitalOf(db, after);
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

/** Снимок для отмены: до действия. */
function remember(s: ShiftState, works: Works, site: Site, room?: string) {
  works.undo.push({ site, staff: s.staff ?? [], ...(s.nextStaff !== undefined ? { nextStaff: s.nextStaff } : {}), spent: works.spent, ...(room ? { room } : {}) });
  if (works.undo.length > SITE_UNDO) works.undo.splice(0, works.undo.length - SITE_UNDO);
}

/** Команда стройки ПК. Только в потоке для ПК и в больнице ПК; ошибка — ничего не меняется, извещение с причиной. */
export function siteCommand(db: ContentDb, s: ShiftState, cmd: SiteCommand): Notice[] {
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
      remember(s, works, site, m.room);
      s.staff = s.staff!.filter(x => x.id !== m.id);
      nudge(s);
      return [{ kind: 'site', cmd: cmd.kind, ok: true, cost: 0 }];
    }
  }
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
  }
  if (!r.ok) return no(cmd.kind, r.error);
  // касса (spec 2026-10-economy): трата не уведёт её ниже предела минуса — иначе стройка ждёт денег
  const need = shortOf(db, s, r.cost);
  if (need > 0) return no(cmd.kind, { kind: 'money', need });
  remember(s, works, site, r.room ?? ('room' in cmd ? cmd.room : undefined));
  // готовое «С персоналом»: люди на все должности — в том же шаге отмены
  let hired: number | undefined;
  if (cmd.kind === 'ready' && cmd.staff && r.room) {
    hired = 0;
    for (const role of db.rooms[cmd.type].staff) if (staffPost(db, s, r.site, r.room, role)) hired++;
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
  if (step.room && restored.rooms.some(r => r.id === step.room)) restored.editing = step.room;
  else delete restored.editing;
  const cost = step.spent - works.spent;
  s.staff = step.staff;
  if (step.nextStaff !== undefined) s.nextStaff = step.nextStaff;
  else delete s.nextStaff;
  works.spent = step.spent;
  // касса (spec 2026-10-economy): цена действия — назад целиком
  payWorks(s, cost);
  commit(db, s, site, restored);
  return [{ kind: 'site', cmd: 'undo', ok: true, cost, ...(step.room ? { room: step.room } : {}) }];
}

/**
 * Нанять на должность помещения (spec «Персонал»): врачу — терапевта (нанятый врач встаёт на место врача). Сначала —
 * тот, кто в резерве; нет — новый: навык 3, без черты, зарплата каталога; пол и облик — из ветви зерна `hire:<номер>`.
 */
function hire(db: ContentDb, s: ShiftState, works: Works, site: Site, cmd: Extract<SiteCommand, { kind: 'hire' }>): Notice[] {
  const room = site.rooms.find(r => r.id === cmd.room);
  if (!room || room.leaving) return no('hire', { kind: 'unknown' });
  if (!db.rooms[room.type]?.staff.includes(cmd.role)) return no('hire', { kind: 'notHere' });
  if (cmd.role === DOCTOR && room.id === site.mine) return no('hire', { kind: 'notHere' });
  const role = cmd.role === DOCTOR ? standInOf(db, DOCTOR) : cmd.role;
  if (!role || !db.roles[role]?.hire) return no('hire', { kind: 'unknown' });
  const post = (m: StaffMember) => db.roles[m.role]?.stands ?? m.role;
  if ((s.staff ?? []).some(m => m.room === room.id && post(m) === cmd.role)) return no('hire', { kind: 'nothing' });
  remember(s, works, site, room.id);
  staffPost(db, s, site, room.id, cmd.role);
  nudge(s);
  return [{ kind: 'site', cmd: 'hire', ok: true, cost: 0, room: room.id }];
}

/**
 * Человек на должность `post` помещения `roomId` — без проверок и без записи отмены (их делает команда): врачу — терапевт.
 * Сначала тот, кто в резерве; нет — новый: навык 3, без черты, зарплата каталога; пол и облик — из ветви зерна
 * `hire:<номер>`. Должность занята, ваш кабинет или нанять некого — никого, `false`.
 */
function staffPost(db: ContentDb, s: ShiftState, site: Site, roomId: string, post: Id): boolean {
  if (post === DOCTOR && roomId === site.mine) return false;
  const role = post === DOCTOR ? standInOf(db, DOCTOR) : post;
  if (!role || !db.roles[role]?.hire) return false;
  const staff = s.staff ?? [];
  if (staff.some(m => m.room === roomId && (db.roles[m.role]?.stands ?? m.role) === post)) return false;
  const reserve = staff.find(m => m.room === undefined && m.role === role);
  if (reserve) s.staff = staff.map(m => (m === reserve ? { ...m, room: roomId } : m));
  else {
    const n = s.nextStaff ?? 1;
    const id = `s${n}`;
    const r = Rng.seeded(s.meta.seed).fork(`hire:${id}`);
    const sex: 'm' | 'f' = r.chance(5000) ? 'f' : 'm';
    s.staff = [...staff, { id, role, sex, seed: r.u32(), skill: 3, salary: salaryOf(db, role, 3), room: roomId, days: 0 }];
    s.nextStaff = n + 1;
  }
  return true;
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
  const there = room === undefined ? undefined : s.staff?.find(m => m.room === room && post(m) === DOCTOR);
  if (there && occupied(db, s).staff.has(there.id)) return no('office', { kind: 'busy' });
  // без помещения в отмене: отмена «Моего» не закрывает кабинет на перестройку
  remember(s, works, site);
  if (there) {
    const old = site.mine && site.rooms.some(x => x.id === site.mine && !x.leaving) ? site.mine : undefined;
    s.staff = s.staff!.map(m => {
      if (m !== there) return m;
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
