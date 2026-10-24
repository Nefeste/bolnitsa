// Люди больницы из среза потока (spec docs/specs/2026-10-shell-3d.md, «Где человек и что он делает»): штат — на местах
// своих помещений, пациенты — по срезу: кто новый — входит с улицы, кого нет — уходит к выходу, у кого новое место — идёт
// туда. Здесь же — кто как выглядит (cast.ts) и что о нём сказать в панели. Без Three.js, кроме цвета. Часть 3 (spec
// docs/specs/2026-10-flow-ui.md): с какого момента человек делает то, что делает, его терпение и просьба врача — для
// значков над головой и вкладки «Пациенты»; ушедший, не дождавшись, уходит к выходу со значком.
import * as THREE from 'three';
import type { ContentDb, Id } from '../content/types';
import type { RoomInstance } from '../engine/hospital/build';
import { onDuty, type StaffMember } from '../engine/hospital/staff';
import type { Doing } from '../engine/shift/slice';
import type { Triage } from '../engine/shift/types';
import { DOINGS, H, HEADER, KINDS, type NameRow, NO_TIME, P, STATUSES, STRIDE, TRIAGES } from '../sim/pack';
import type { Look } from './bake';
import { CLOTHES, COAT, GOWN, lookSpec, OLD_AGE, roleColor, SKIN } from './cast';
import type { Crowd, Walker } from './crowd';
import type { Layout } from './layout';
import { doorInside, nearestWalk, type Places, type Spot, standAt } from './place';

/** Ваша фигура на карте (spec docs/specs/2026-10-doctor-mode.md, «Вы на карте»): врач в белом халате с меткой. */
export const YOU = 'you';

/** Что показать о человеке в панели; `gone` — пациент ушёл, на карте его нет (spec 2026-10-flow-ui). */
export type PersonInfo =
  | {
      kind: 'staff'; role: Id; room?: string; sex: 'm' | 'f'; id?: string;
      /** смена и её часы — с какого и до какого (spec docs/specs/2026-10-staff-shifts.md); `home` — не в больнице */
      shift?: 'day' | 'night'; hours?: [number, number]; home?: true;
    }
  | {
      kind: 'patient'; id: string; name?: string; sex: 'm' | 'f'; age: number; complaint?: Id; triage: Triage; doing: Doing; room?: string; by?: Id; visit: string; gone?: true;
      /** записан к специалисту — его должность (spec docs/specs/2026-10-specialists.md) */
      to?: Id;
      /** ещё идёт туда, где с ним это делают (spec docs/specs/2026-10-owner-play.md), и к какому часу дойдёт (spec 2026-10-walk) */
      walking?: true;
      arrive?: number;
      /** следующий к врачу — ждёт у двери его кабинета (spec 2026-10-walk) */
      door?: true;
    };

/** Что окно знает о пациенте из среза (часть 3): как `Seen` в src/app/flow.ts. */
export interface PatientNow {
  row: NameRow;
  status: (typeof STATUSES)[number];
  triage: Triage;
  doing: Doing;
  room: number;
  by: number;
  bed: number;
  kind: string;
  since: number;
  limit: number;
  ask?: { at: number; until: number };
  /** идёт — к какому часу дойдёт (spec 2026-10-walk); нет — NO_TIME */
  arrive: number;
}

/** Сколько строк пришедших помнить (для «Ушли» и карточки ушедшего). */
const ROWS = 2000;

const LYING: ReadonlySet<Doing> = new Set(['ward', 'surgery', 'ambulance']);

export class Population {
  /** вид — по полу и возрасту; номера видов в `looks` */
  private byUse = new Map<string, number[]>();
  private paints = new Map<string, { clothes: THREE.Color; skin: THREE.Color }>();
  /** последнее о пациенте из среза — для панели, цвета и значков */
  private last = new Map<string, PatientNow>();
  readonly names = new Map<number, NameRow>();
  /** номер пациента в движке → человек на экране и строка пришедшего (последние ROWS) */
  private keys = new Map<string, string>();
  readonly rows = new Map<string, NameRow>();
  /** последнее, что окно знало о пациенте, — и после ухода (по номеру в движке, последние ROWS) */
  private byId = new Map<string, PatientNow>();
  /** ушли, не дождавшись: уходят к выходу со значком «недоволен» */
  private angry = new Set<string>();
  /** часы смены из последнего среза */
  t = 0;
  /** номера помещений в списке больницы → номер в плане */
  private roomIndex: number[] = [];
  /** раскладка новая (стройка) — в следующем срезе места раздаются всем заново */
  private dirty = false;
  /**
   * кто из штата сейчас в больнице (spec docs/specs/2026-10-staff-shifts.md): в смене или доводит начатые приёмы — по
   * последнему срезу; строка — чтобы заметить пересменку
   */
  private here = '';
  /** кто не в смене, а ещё в больнице — доводит приёмы (номера в штате); присылает поток расчёта, когда список меняется */
  private late = new Set<string>();

  constructor(
    private db: ContentDb,
    private layout: Layout,
    private places: Places,
    readonly crowd: Crowd,
    private looks: Look[],
    private staff: StaffMember[],
    rooms: RoomInstance[],
  ) {
    looks.forEach((l, i) => {
      const s = lookSpec(l.name)!;
      const k = `${s.use}:${s.sex}:${s.age}`;
      if (!this.byUse.has(k)) this.byUse.set(k, []);
      this.byUse.get(k)!.push(i);
    });
    this.roomIndex = rooms.map(r => layout.plan.rooms.findIndex(p => p.id === r.id));
  }

  /** Вид человека: пол, возраст, кому годится; нет такого — любой того же назначения. */
  private pick(use: string, sex: 'm' | 'f', old: boolean, seed: number): number {
    const list = this.byUse.get(`${use}:${sex}:${old ? 'old' : 'adult'}`) ?? this.byUse.get(`${use}:${sex}:adult`) ?? this.byUse.get(`${use}:${sex}:old`) ?? [0];
    return list[Math.abs(seed) % list.length];
  }

  /** В больнице ли человек штата (spec 2026-10-staff-shifts): в смене часов среза или доводит начатые приёмы. */
  private present(m: StaffMember): boolean {
    return onDuty(this.db, m, this.t) || this.late.has(m.id);
  }

  /** Кто из штата не в смене, а ещё в больнице (номера в списке штата) — как прислал поток расчёта. */
  setLate(index: readonly number[]) {
    this.late = new Set(index.flatMap(i => (this.staff[i] ? [this.staff[i].id] : [])));
  }

  /**
   * Штат — сразу на местах своих помещений; на стуле сидит, иначе стоит лицом к работе. Номер человека на экране — его
   * номер в штате (`s:<id>`): после стройки и найма он тот же; у кого место прежнее, тот не двигается. Со сменами (spec
   * docs/specs/2026-10-staff-shifts.md) — только те, кто в больнице; на пересменке (`shift`) пришедшие входят с улицы, а
   * ушедшие идут к выходу.
   */
  placeStaff(shift = false) {
    const taken = new Set<number>();
    const keep = new Set<string>();
    this.here = this.staff.map(m => (this.present(m) ? 1 : 0)).join('');
    for (const m of this.staff) {
      if (!this.present(m)) continue;
      const room = this.layout.plan.rooms.find(r => r.id === m.room);
      if (!room) continue;
      const role = this.db.roles[m.role]?.stands ?? m.role;
      const cell = room.staff[role] ?? room.staff[m.role];
      if (!cell) continue;
      const spot = this.places.staffSpot(m, () => cell, taken);
      if (!spot) continue;
      taken.add(spot.cell);
      const key = `s:${m.id}`;
      keep.add(key);
      const w = this.crowd.walkers.get(key);
      if (w) {
        if (w.leaving) this.crowd.stay(w, spot);
        else if (w.at?.key !== spot.key && !(shift && w.goals.some(g => g.key === spot.key))) this.crowd.settle(w, spot);
        continue;
      }
      const use = m.role === 'role.registrar' ? 'registrar' : 'staff';
      const look = this.pick(use, m.sex, m.seed % 3 === 0, m.seed);
      this.crowd.add(key, look, spot, true, false, NaN, shift);
      this.paints.set(key, { clothes: new THREE.Color(roleColor(m.role)), skin: new THREE.Color(SKIN[m.seed % SKIN.length]) });
    }
    for (const [key, w] of [...this.crowd.walkers]) {
      if (!w.staff || keep.has(key) || key === YOU) continue;
      // ушёл со сменой — к выходу; уволен, снесено помещение — сразу
      if (shift && this.staff.some(m => `s:${m.id}` === key)) this.crowd.leave(w);
      else this.crowd.remove(key);
    }
  }

  /**
   * Ваша фигура (spec docs/specs/2026-10-doctor-mode.md, «Вы на карте») — на месте врача в помещении плана `room`: вашем
   * кабинете или смотровой, где вы у привезённого скорой; места врача нет — у двери изнутри. -1 — фигуры нет («Не
   * принимаю»). Белый халат — как у врачей (cast.ts), метку над головой рисует сцена (stage.ts).
   */
  placeYou(room: number) {
    const w = this.crowd.walkers.get(YOU);
    const r = room >= 0 ? this.layout.plan.rooms[room] : undefined;
    if (!r) {
      if (w) this.crowd.remove(YOU);
      return;
    }
    const taken = new Set<number>();
    for (const x of this.crowd.walkers.values()) if (x.staff && x.key !== YOU && x.at) taken.add(x.at.cell);
    const cell = r.staff['role.doctor'];
    const you = { id: YOU, role: 'role.doctor', sex: 'm' as const, seed: 7, skill: 5, salary: 0, days: 0 };
    const spot = (cell ? this.places.staffSpot(you, () => cell, taken) : undefined) ?? standAt(this.layout, nearestWalk(this.layout, doorInside(this.layout, room), taken), 'wait', 0);
    if (w) {
      if (w.at?.key !== spot.key) this.crowd.retarget(w, spot, true);
      return;
    }
    this.crowd.add(YOU, this.pick('staff', 'm', false, 7), spot, true);
    this.paints.set(YOU, { clothes: new THREE.Color(COAT), skin: new THREE.Color(SKIN[2]) });
  }

  /** Стройка (spec docs/specs/2026-10-build.md, «Отрисовка»): новая раскладка, места, штат и список помещений больницы. */
  relayout(layout: Layout, places: Places, staff: StaffMember[], rooms: RoomInstance[]) {
    this.layout = layout;
    this.places = places;
    this.staff = staff;
    this.roomIndex = rooms.map(r => layout.plan.rooms.findIndex(p => p.id === r.id));
    this.placeStaff();
    this.dirty = true;
  }

  /** Часы игры до первого среза (spec 2026-10-staff-shifts): кто в смене, тот и на местах с самого начала. */
  setTime(t: number) {
    this.t = t;
  }

  /** Сверить с упакованным срезом: новые входят, ушедшие уходят, у кого новое место — идут туда. */
  sync(buf: Int32Array, names: readonly NameRow[]) {
    this.t = buf[H.t];
    for (const r of names) {
      this.names.set(r.h, r);
      this.keys.set(r.id, `p:${r.h}`);
      this.rows.set(r.id, r);
      if (this.rows.size > ROWS) {
        const old = this.rows.keys().next().value!;
        this.rows.delete(old);
        this.keys.delete(old);
        this.byId.delete(old);
      }
    }
    const n = buf[H.count];
    const waiting: { key: string; room: number }[] = [];
    const benched: string[] = [];
    const present = new Set<string>();
    // смены (spec 2026-10-staff-shifts): пересменка или ушедший со сменой довёл приёмы — кто в больнице, заново
    if (this.staff.map(m => (this.present(m) ? 1 : 0)).join('') !== this.here) this.placeStaff(true);
    for (let i = 0; i < n; i++) {
      const o = HEADER + i * STRIDE;
      const key = `p:${buf[o + P.handle]}`;
      const doing = DOINGS[buf[o + P.doing]];
      // поток для ПК (spec 2026-10-walk): ждёт в своей зоне ожидания — номер помещения плана
      const roomH = buf[o + P.room];
      if (doing === 'waiting') waiting.push({ key, room: roomH >= 0 ? (this.roomIndex[roomH] ?? -1) : -1 });
      if (doing === 'examQueue' || doing === 'results') benched.push(key);
    }
    this.places.sync(waiting, benched);
    const taken = new Set<number>();
    for (const w of this.crowd.walkers.values()) if (w.staff && w.at) taken.add(w.at.cell);
    for (let i = 0; i < n; i++) {
      const o = HEADER + i * STRIDE;
      const h = buf[o + P.handle];
      const key = `p:${h}`;
      present.add(key);
      const row = this.names.get(h);
      if (!row) continue;
      const doing = DOINGS[buf[o + P.doing]];
      const roomH = buf[o + P.room];
      const room = roomH >= 0 ? (this.roomIndex[roomH] ?? -1) : -1;
      const prev = this.last.get(key);
      const askUntil = buf[o + P.askUntil];
      const now: PatientNow = {
        row, status: STATUSES[buf[o + P.status]], triage: TRIAGES[buf[o + P.triage]], doing, room, by: buf[o + P.by], bed: buf[o + P.bed], kind: String(buf[o + P.flags]),
        since: buf[o + P.since], limit: buf[o + P.limit], ...(askUntil !== NO_TIME ? { ask: { at: buf[o + P.askAt], until: askUntil } } : {}),
        arrive: buf[o + P.arrive],
      };
      // идёт — дойти к часу движка (spec 2026-10-walk)
      const due = now.arrive === NO_TIME ? NaN : now.arrive;
      this.last.set(key, now);
      this.byId.set(row.id, now);
      const spot: Spot = this.places.spot({ key, doing, room, bed: buf[o + P.bed] }, taken);
      if (spot.pose === 'stand') taken.add(spot.cell);
      const w = this.crowd.walkers.get(key);
      if (!w) {
        const look = this.pick('patient', row.sex, row.age >= OLD_AGE, row.seed);
        this.paints.set(key, { clothes: new THREE.Color(CLOTHES[row.seed % CLOTHES.length]), skin: new THREE.Color(SKIN[(row.seed >>> 3) % SKIN.length]) });
        // привезённый скорой — через вход для скорой
        this.crowd.add(key, look, spot, false, KINDS[buf[o + P.flags]] === 'ambulance', due);
        continue;
      }
      // к врачу зовут — идёт сразу, без остановок; после стройки — к новому месту (то же место — тот же ключ: не встаёт)
      if (this.dirty || !prev || prev.doing !== doing || prev.room !== room || w.goals.length === 0) this.crowd.retarget(w, spot, doing === 'office' && prev?.doing !== 'office', due);
      else w.due = due;
    }
    this.dirty = false;
    for (const [key, w] of this.crowd.walkers) {
      if (w.staff || present.has(key)) continue;
      if (!w.leaving) this.crowd.leave(w);
      this.last.delete(key);
    }
    // дошли до выхода — значок больше не нужен
    for (const key of this.angry) if (!this.crowd.walkers.has(key)) this.angry.delete(key);
  }

  /** Пациент ушёл, не дождавшись (извещение `left`): к выходу — со значком «недоволен». */
  markLeft(id: string) {
    const key = this.keys.get(id);
    if (key && this.crowd.walkers.has(key)) this.angry.add(key);
  }

  /** Ушёл, не дождавшись, и ещё идёт к выходу. */
  leavingAngry(key: string): boolean {
    return this.angry.has(key);
  }

  /** Человек на экране по номеру в движке (нет — ушёл). */
  keyOf(id: string): string | undefined {
    const key = this.keys.get(id);
    return key && this.last.has(key) ? key : undefined;
  }

  /** Человек на экране по номеру в движке — и тот, кто уже ушёл из среза и идёт к выходу. */
  walkerKey(id: string): string | undefined {
    const key = this.keys.get(id);
    return key && this.crowd.walkers.has(key) ? key : undefined;
  }

  /** Номер в движке человека на экране (и того, кто уходит к выходу). */
  idOf(key: string): string | undefined {
    if (!key.startsWith('p:')) return undefined;
    return this.names.get(Number(key.slice(2)))?.id;
  }

  /** Пациенты в больнице — что окно о них знает (часть 3: вкладка, значки, нагрузка помещений). */
  patients(): IterableIterator<[string, PatientNow]> {
    return this.last.entries();
  }

  /** Что знает окно о пациенте на экране. */
  now(key: string): PatientNow | undefined {
    return this.last.get(key);
  }

  /** Последнее, что окно знало о пациенте по номеру в движке, — и после ухода. */
  lastOf(id: string): PatientNow | undefined {
    return this.byId.get(id);
  }

  /** Цвет экземпляра: лежащим — больничная рубашка. */
  paint = (w: Walker) => {
    const p = this.paints.get(w.key)!;
    if (!w.staff && w.lie > 0.5) return { clothes: GOWN_COLOR, skin: p.skin };
    const l = this.last.get(w.key);
    if (l && LYING.has(l.doing) && w.state !== 'walk') return { clothes: GOWN_COLOR, skin: p.skin };
    return p;
  };

  /** Что о человеке сказать в панели. */
  info(key: string): PersonInfo | undefined {
    if (key.startsWith('s:')) {
      const m = this.staff.find(x => x.id === key.slice(2));
      if (!m) return undefined;
      const day = this.db.economy.staff.shifts?.day;
      const hours: [number, number] | undefined = m.shift && day ? (m.shift === 'day' ? [day[0], day[1]] : [day[1], day[0]]) : undefined;
      return {
        kind: 'staff', role: m.role, ...(m.room ? { room: m.room } : {}), sex: m.sex, id: m.id,
        ...(m.shift && hours ? { shift: m.shift, hours } : {}), ...(this.present(m) ? {} : { home: true as const }),
      };
    }
    const l = this.last.get(key);
    if (!l) return undefined;
    const room = l.room >= 0 ? this.layout.plan.rooms[l.room]?.id : undefined;
    const by = l.by >= 0 ? this.staff[l.by]?.role : undefined;
    // идёт туда, где с ним это делают: движок знает, к какому часу дойдёт (spec 2026-10-walk); на экране ещё в пути —
    // тоже идёт: карточка говорит «идёт…», а не «у врача»
    const w = this.crowd.walkers.get(key);
    const coming = l.arrive !== NO_TIME && l.arrive > this.t;
    const walking = coming || (!!w && w.state === 'walk' && w.goals.length > 0);
    const door = l.doing === 'waiting' && l.room >= 0 && this.layout.plan.rooms[l.room]?.type !== 'room.waiting';
    return {
      kind: 'patient', id: l.row.id, ...(l.row.name ? { name: l.row.name } : {}), sex: l.row.sex, age: l.row.age, ...(l.row.complaint ? { complaint: l.row.complaint } : {}), triage: l.triage, doing: l.doing,
      ...(l.row.to ? { to: l.row.to } : {}),
      ...(room ? { room } : {}), ...(by ? { by } : {}), visit: ['appointment', 'walkIn', 'return', 'ambulance'][Number(l.kind)] ?? 'walkIn',
      ...(walking ? { walking: true as const } : {}), ...(coming ? { arrive: l.arrive } : {}), ...(door ? { door: true as const } : {}),
    };
  }

  /** Срочность пациента — для значка над головой. */
  triageOf(key: string): Triage | undefined {
    return this.last.get(key)?.triage;
  }
}

const GOWN_COLOR = new THREE.Color(GOWN);
