// Люди больницы из среза потока (spec docs/specs/2026-10-shell-3d.md, «Где человек и что он делает»): штат — на местах
// своих помещений, пациенты — по срезу: кто новый — входит с улицы, кого нет — уходит к выходу, у кого новое место — идёт
// туда. Здесь же — кто как выглядит (cast.ts) и что о нём сказать в панели. Без Three.js, кроме цвета. Часть 3 (spec
// docs/specs/2026-10-flow-ui.md): с какого момента человек делает то, что делает, его терпение и просьба врача — для
// значков над головой и вкладки «Пациенты»; ушедший, не дождавшись, уходит к выходу со значком.
import * as THREE from 'three';
import type { ContentDb, Id } from '../content/types';
import type { RoomInstance } from '../engine/hospital/build';
import { onDuty, ORDERLY, type StaffMember } from '../engine/hospital/staff';
import type { CrewView } from '../engine/shift/crew';
import type { Doing } from '../engine/shift/slice';
import type { Rest, Ride, Triage } from '../engine/shift/types';
import { DOINGS, H, HEADER, kindOf, type NameRow, NO_TIME, P, REFERRED, SLOW, STATUSES, STRIDE, TRIAGES } from '../sim/pack';
import type { Look } from './bake';
import { COAT, OLD_AGE, PARAMEDIC, roleColor, toneOf, WORKWEAR } from './cast';
import { type Crowd, GURNEY_AHEAD, type Walker } from './crowd';
import type { GurneyAt } from './gurney';
import type { Layout } from './layout';
import { type Paint, toneVec } from './people';
import { bedSide, doorInside, gurneyStop, gurneyYaw, nearestWalk, type Places, type Spot, standAt } from './place';
import { carrierGoal, riderAt, type RidePhase, ridesNow } from './rides';

/** Ваша фигура на карте (spec docs/specs/2026-10-doctor-mode.md, «Вы на карте»): врач в белом халате с меткой. */
export const YOU = 'you';

/** Медсёстры каких помещений обходят занятые койки (spec docs/specs/2026-10-staff-motion.md, часть 1, п. 4). */
const ROUND_ROOMS: ReadonlySet<Id> = new Set(['room.ward', 'room.icu', 'room.ricu']);
/** Раз в столько секунд игры медсестра обходит койки — от и до; срок — от номера человека и обхода: соседки не разом. */
export const ROUND_EVERY: readonly [number, number] = [3600, 5400];
/** У стола операционной бумаг не читают: стоящие там — без бумаг в руках. */
const NO_PAPERS: ReadonlySet<Id> = new Set(['room.or']);

/** Через сколько секунд игры обход номер `n` после прежнего; первый — в первые `ROUND_EVERY[1]` секунд смены на карте. */
export function roundGap(id: string, n: number): number {
  let h = 0x811c9dc5;
  const key = `${id}~${n}`;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193) >>> 0;
  const k = (h % 1000) / 1000;
  return n === 0 ? k * ROUND_EVERY[1] : ROUND_EVERY[0] + k * (ROUND_EVERY[1] - ROUND_EVERY[0]);
}

/** Что показать о человеке в панели; `gone` — пациент ушёл, на карте его нет (spec 2026-10-flow-ui). */
export type PersonInfo =
  | {
      kind: 'staff'; role: Id; room?: string; sex: 'm' | 'f'; id?: string;
      /** смена и её часы — с какого и до какого (spec docs/specs/2026-10-staff-shifts.md); `home` — не в больнице */
      shift?: 'day' | 'night'; hours?: [number, number]; home?: true;
      /**
       * усталость 0–100 и что она значит: с `slow` работает медленнее, с `tired` ставит диагноз при меньшей уверенности; перерыв,
       * пока он идёт: идёт туда, там, идёт назад (там же, часть 2)
       */
      fatigue?: number; worn?: 'slow' | 'blur'; rest?: { kind: Rest['kind']; until: number; phase: 'go' | 'there' | 'back' };
      /**
       * настроение и действия с человеком (spec docs/specs/2026-10-staff-mood.md) — дописывает окно (`staffCard` в
       * src/app/game.ts): имя из словаря игры; настроение, на сколько и почему изменилось, «собирается уйти» до каких суток,
       * уходит с какого часа; зарплата, рынок его навыка и до скольки её поднимут; в какую смену перевести и с кем поменяется;
       * что ответил движок на последнее действие с ним
       */
      name?: string;
      mood?: { v: number; d?: number; why?: string[]; quit?: number; go?: number };
      pay?: { now: number; market: number; raise?: number };
      reshift?: { to: 'day' | 'night'; with?: string };
      said?: { ok: boolean; text: string };
      /**
       * рост, учёба, болезнь (там же, разделы 3–5): навык, смен до следующего и наставник; отлучка — учится или болеет и до
       * какого часа; «Отправить учиться» — на сколько суток и за сколько
       */
      skill?: number; steps?: number; mentor?: string; away?: { why: 'study' | 'sick'; until: number }; study?: { days: number; cost: number };
      /**
       * резерв (там же, часть 5; решение владельца #97): без места — в резерве, уволить из карточки — за сколько; замещает —
       * кого и почему того нет; у отсутствующего — кто за него
       */
      reserve?: true; fire?: number;
      covers?: { who: string; sex: 'm' | 'f'; away?: { why: 'study' | 'sick'; until: number } }; coveredBy?: string;
      /**
       * перевозка на каталке (spec docs/specs/2026-10-orderlies.md, «Что видно»): что с ней сейчас, кого везут (имя), откуда и
       * куда (номера помещений плана); санитар без перевозки — `free`: ждёт у каталки
       */
      ride?: { phase: RidePhase; who?: string; from: string; to: string }; free?: true;
    }
  | {
      kind: 'patient'; id: string; name?: string; sex: 'm' | 'f'; age: number; complaint?: Id; triage: Triage; doing: Doing; room?: string; by?: Id; visit: string; gone?: true;
      /** записан к специалисту — его должность (spec docs/specs/2026-10-specialists.md) */
      to?: Id;
      /** направлен к тому, кто его ведёт (`by`; spec docs/specs/2026-10-specialists.md, часть 2) */
      ref?: true;
      /** ещё идёт туда, где с ним это делают (spec docs/specs/2026-10-owner-play.md), и к какому часу дойдёт (spec 2026-10-walk) */
      walking?: true;
      arrive?: number;
      /** следующий к врачу — ждёт у двери его кабинета (spec 2026-10-walk) */
      door?: true;
      /** везут на каталке (spec docs/specs/2026-10-orderlies.md): что с перевозкой сейчас, откуда и куда */
      gurney?: { phase: RidePhase; from: string; to: string };
      /** решение его врача ждёт главврача — до какого часа (spec docs/specs/2026-10-two-ways.md, F3) */
      approve?: number;
    }
  /**
   * фельдшер скорой (spec docs/specs/2026-10-orderlies.md, «Что видно»): кого привёз; ждёт с ним у входа — мест в смотровой
   * нет; передал и уходит к машине
   */
  | { kind: 'medic'; who?: string; wait?: true; leaving?: true };

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
  /** решение его врача ждёт главврача (spec docs/specs/2026-10-two-ways.md, F3) */
  approve?: { at: number; until: number };
  /** идёт — к какому часу дойдёт (spec 2026-10-walk); нет — NO_TIME */
  arrive: number;
  /** ждёт у двери кабинета на скамье (spec docs/specs/2026-10-door-benches.md): номер скамьи коридора; -1 — нет */
  seat: number;
}

/** Сколько строк пришедших помнить (для «Ушли» и карточки ушедшего). */
const ROWS = 2000;

/** Места перевозки на экране (spec docs/specs/2026-10-orderlies.md): откуда взять больного, куда довезти — и где встать у них с каталкой. */
interface Leg {
  from?: Spot;
  fromStop?: Spot;
  to?: Spot;
  toStop?: Spot;
}

export class Population {
  /** вид — по полу и возрасту; номера видов в `looks` */
  private byUse = new Map<string, number[]>();
  /** виды «своей» должности (Rocketbox: хирург, медсестра — cast.ts, `roles`): ключ — должность и пол */
  private byRole = new Map<string, number[]>();
  /** спецодежда (cast.ts, `jobs`): ключ — профессия пациента и пол */
  private byJob = new Map<string, number[]>();
  private paints = new Map<string, Paint>();
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
  /** усталость и перерывы врачей в смене (spec 2026-10-staff-shifts, часть 2): по номеру человека — как прислал поток расчёта */
  private crew = new Map<string, CrewView>();
  /** куда ушёл человек штата: «вид:помещение:вышел»; изменилось — он идёт туда или на своё место */
  private going = new Map<string, string>();
  /** перевозки на каталке (spec docs/specs/2026-10-orderlies.md, «Что видно»): как прислал поток расчёта */
  private rides: Ride[] = [];
  /**
   * кто везёт каталку: номер человека штата → куда он идёт сейчас («место:срок»). Пока он везёт, его место назначает перевозка,
   * и он в больнице, даже если смена кончилась: довозит
   */
  private riding = new Map<string, string>();
  /** что сейчас с перевозкой у того, кто везёт, — для карточки; и у того, кого везут (по номеру больного в движке) */
  private phases = new Map<string, { r: Ride; ph: RidePhase }>();
  private riders = new Map<string, { r: Ride; ph: RidePhase }>();
  /** места перевозок: по перевозке («больной:кто:вышел») */
  private legs = new Map<string, Leg>();
  /** больные, чьё место на экране сейчас назначает перевозка: на каталке, у аппарата, только что довезли */
  private held = new Set<string>();
  /** место каждого пациента по последнему срезу — от него считаются места перевозки и фельдшера */
  private spots = new Map<string, Spot>();
  /** каталка санитара у его места, пока он никого не везёт: номер человека → где она */
  private parked = new Map<string, GurneyAt>();
  /** привезённый скорой на каталке бригады (spec 2026-10-orderlies, «Что видно»): ключ больного → ключ фельдшера */
  private medics = new Map<string, string>();
  /** где фельдшер встал с каталкой: ключ больного → у какого места и где — заново, только когда место больного другое */
  private medicStops = new Map<string, { at: string; stop: Spot }>();
  /**
   * обход медсестры (spec docs/specs/2026-10-staff-motion.md, часть 1, п. 4): номер в штате → ключ её поста, куда она
   * вернётся; когда следующий обход (часы игры) и сколько их было
   */
  private rounds = new Map<string, string>();
  private roundAt = new Map<string, number>();
  private roundN = new Map<string, number>();

  constructor(
    private db: ContentDb,
    private layout: Layout,
    private places: Places,
    readonly crowd: Crowd,
    private looks: Look[],
    private staff: StaffMember[],
    rooms: RoomInstance[],
  ) {
    const add = (m: Map<string, number[]>, k: string, i: number) => {
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(i);
    };
    looks.forEach((l, i) => {
      const s = l.spec;
      if (s.roles) for (const r of s.roles) add(this.byRole, `${r}:${s.sex}`, i);
      else if (s.jobs) for (const j of s.jobs) add(this.byJob, `${j}:${s.sex}`, i);
      else add(this.byUse, `${s.use}:${s.sex}:${s.age}`, i);
    });
    this.roomIndex = rooms.map(r => layout.plan.rooms.findIndex(p => p.id === r.id));
  }

  /**
   * Вид человека: своя должность (есть такие виды — из них), пол, возраст, кому годится; нет такого — любой того же
   * назначения, затем персонал того же пола. Пациент своей профессии — по зерну, у доли `WORKWEAR` — в спецодежде.
   */
  private pick(use: string, sex: 'm' | 'f', old: boolean, seed: number, role?: Id, job?: Id): number {
    const work = job && ((seed >>> 11) % 100) / 100 < WORKWEAR ? this.byJob.get(`${job}:${sex}`) : undefined;
    const own = role ? this.byRole.get(`${role}:${sex}`) : undefined;
    const list =
      work ?? own ?? this.byUse.get(`${use}:${sex}:${old ? 'old' : 'adult'}`) ?? this.byUse.get(`${use}:${sex}:adult`) ?? this.byUse.get(`${use}:${sex}:old`) ?? this.byUse.get(`staff:${sex}:adult`) ?? [0];
    return list[Math.abs(seed) % list.length];
  }

  /**
   * Цвет человека: одежда (цвет должности; у пациентов — своя, из атласа) и оттенок волос и кожи по зерну (cast.ts, `toneOf`;
   * spec docs/specs/2026-10-people.md, часть 2б). `age` — возраст пациента.
   */
  private paintOf(clothes: number, look: number, seed: number, age?: number): Paint {
    const l = this.looks[look];
    return { clothes: new THREE.Color(clothes), tone: toneVec(toneOf(seed, l.spec, l.hair, age)) };
  }

  /**
   * В больнице ли человек штата (spec 2026-10-staff-shifts): в смене часов среза, доводит начатые приёмы или довозит
   * больного на каталке (spec 2026-10-orderlies).
   */
  private present(m: StaffMember): boolean {
    return onDuty(this.db, m, this.t) || this.late.has(m.id) || this.riding.has(m.id);
  }

  /** Кто из штата не в смене, а ещё в больнице (номера в списке штата) — как прислал поток расчёта. */
  setLate(index: readonly number[]) {
    this.late = new Set(index.flatMap(i => (this.staff[i] ? [this.staff[i].id] : [])));
  }

  /** Усталость и перерывы врачей в смене (spec 2026-10-staff-shifts, часть 2) — как прислал поток расчёта. */
  setCrew(rows: readonly CrewView[]) {
    this.crew = new Map(rows.map(r => [r.id, r]));
  }

  /** Перевозки на каталке (spec docs/specs/2026-10-orderlies.md) — как прислал поток расчёта. */
  setRides(rows: readonly Ride[]) {
    this.rides = [...rows];
  }

  /** Перерыв, на который человек ушёл со своего места: идёт туда или уже там; пошёл назад или отдыхает в кабинете — нет. */
  private away(m: StaffMember): Rest | undefined {
    const r = this.crew.get(m.id)?.rest;
    return r && r.kind !== 'here' && r.room !== undefined && this.t < r.back ? r : undefined;
  }

  /** Место человека штата на его посту; на стуле — сидит. `taken` — клетки, где стоят другие. */
  private postOf(m: StaffMember, taken: ReadonlySet<number>): Spot | undefined {
    const room = this.layout.plan.rooms.find(r => r.id === m.room);
    if (!room) return undefined;
    const role = this.db.roles[m.role]?.stands ?? m.role;
    const cell = room.staff[role] ?? room.staff[m.role];
    const spot = cell ? this.staffSpot(m, room.type, cell, taken) : undefined;
    return spot ? this.orderlyPost(m, spot) : undefined;
  }

  /** Место на посту (`Places.staffSpot`); в операционной стоящие — без бумаг (`NO_PAPERS`). */
  private staffSpot(m: StaffMember, type: Id, cell: readonly [number, number], taken: ReadonlySet<number>): Spot | undefined {
    const spot = this.places.staffSpot(m, () => cell, taken);
    if (spot?.work !== 'stand' || !NO_PAPERS.has(type)) return spot;
    const { work: _, ...rest } = spot;
    return rest;
  }

  /**
   * Санитар на своём месте (spec docs/specs/2026-10-orderlies.md, «Ждёт на своём месте у каталки»): стоит лицом туда, где перед
   * ним встанет его каталка, не упираясь в стену; каталка — там, пока он никого не везёт.
   */
  private orderlyPost(m: StaffMember, spot: Spot): Spot {
    if (m.role !== ORDERLY || spot.pose !== 'stand') return spot;
    const yaw = gurneyYaw(this.layout, spot.cell, spot.yaw);
    this.parked.set(m.id, { x: spot.x + Math.sin(yaw) * GURNEY_AHEAD, z: spot.z + Math.cos(yaw) * GURNEY_AHEAD, yaw });
    return { ...spot, yaw };
  }

  /**
   * Перерывы (spec docs/specs/2026-10-staff-shifts.md, часть 2): ушёл — идёт в ординаторскую или в санузел, к часу, когда
   * дошёл бы в движке, и сидит или стоит там; пора назад — идёт на своё место к концу перерыва. Только когда это меняется.
   */
  private rests() {
    if (this.crew.size === 0 && this.going.size === 0) return;
    const used = new Set<string>();
    for (const m of this.staff) {
      if (!this.going.get(m.id)) continue;
      const w = this.crowd.walkers.get(`s:${m.id}`);
      const g = w ? (w.goals[w.goals.length - 1] ?? w.at) : undefined;
      if (g) used.add(g.key);
    }
    for (const m of this.staff) {
      const w = this.crowd.walkers.get(`s:${m.id}`);
      if (!w || w.leaving) {
        this.going.delete(m.id);
        continue;
      }
      // везёт каталку (spec 2026-10-orderlies): отдыхать пойдёт, когда вернётся
      if (this.riding.has(m.id)) continue;
      const r = this.away(m);
      const now = r ? `${r.kind}:${r.room}:${r.from}` : '';
      if (now === (this.going.get(m.id) ?? '')) continue;
      let spot: Spot | undefined;
      if (r) {
        const room = this.layout.plan.rooms.findIndex(x => x.id === r.room);
        if (room < 0) continue;
        spot = this.places.restSpot(room, r.kind === 'toilet' ? 'toilet' : 'staff', used, new Set());
        used.add(spot.key);
        this.going.set(m.id, now);
      } else {
        const taken = new Set<number>();
        for (const x of this.crowd.walkers.values()) if (x.staff && x !== w && x.at) taken.add(x.at.cell);
        spot = this.postOf(m, taken);
        this.going.delete(m.id);
      }
      if (spot) this.crowd.retarget(w, spot, true, r ? r.at : (this.crew.get(m.id)?.rest?.until ?? NaN));
    }
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
    this.parked.clear();
    for (const m of this.staff) {
      if (!this.present(m)) continue;
      const room = this.layout.plan.rooms.find(r => r.id === m.room);
      if (!room) continue;
      const role = this.db.roles[m.role]?.stands ?? m.role;
      const cell = room.staff[role] ?? room.staff[m.role];
      if (!cell) continue;
      const at = this.staffSpot(m, room.type, cell, taken);
      if (!at) continue;
      const spot = this.orderlyPost(m, at);
      taken.add(spot.cell);
      const key = `s:${m.id}`;
      keep.add(key);
      const w = this.crowd.walkers.get(key);
      if (w) {
        // на перерыве (spec 2026-10-staff-shifts, часть 2), везёт каталку (spec 2026-10-orderlies) или на обходе (spec
        // 2026-10-staff-motion) — не на посту: место за ним, назад приведут `rests`, `ridesStep` и `roundsStep`
        if (!w.leaving && (this.going.get(m.id) || this.riding.has(m.id) || this.rounds.has(m.id))) continue;
        if (w.leaving) this.crowd.stay(w, spot);
        else if (w.at?.key !== spot.key && !(shift && w.goals.some(g => g.key === spot.key))) this.crowd.settle(w, spot);
        continue;
      }
      const use = m.role === 'role.registrar' ? 'registrar' : 'staff';
      const look = this.pick(use, m.sex, m.seed % 3 === 0, m.seed, m.role);
      this.crowd.add(key, look, spot, true, false, NaN, shift);
      this.paints.set(key, this.paintOf(roleColor(m.role), look, m.seed));
    }
    for (const [key, w] of [...this.crowd.walkers]) {
      // фельдшеры скорой (`m:`) — не штат: уходят сами
      if (!w.staff || keep.has(key) || key === YOU || key.startsWith('m:')) continue;
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
    const look = this.pick('staff', 'm', false, 7);
    this.crowd.add(YOU, look, spot, true);
    this.paints.set(YOU, this.paintOf(COAT, look, 7));
  }

  /**
   * Тот же штат на тех же местах, а у людей новое (spec docs/specs/2026-10-staff-mood.md: рост, учёба, болезнь, зарплата,
   * смена): кто в больнице, сверит следующий срез (`sync`), раскладка та же.
   */
  setStaff(staff: StaffMember[]) {
    this.staff = staff;
  }

  /** Стройка (spec docs/specs/2026-10-build.md, «Отрисовка»): новая раскладка, места, штат и список помещений больницы. */
  relayout(layout: Layout, places: Places, staff: StaffMember[], rooms: RoomInstance[]) {
    this.layout = layout;
    this.places = places;
    this.staff = staff;
    this.roomIndex = rooms.map(r => layout.plan.rooms.findIndex(p => p.id === r.id));
    // перевозки — по новым клеткам: места заново, тот, кто везёт, идёт к ним; обход — заново по новым койкам: медсестра на посту
    this.legs.clear();
    for (const k of this.riding.keys()) this.riding.set(k, '');
    this.rounds.clear();
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
    const waiting: { key: string; room: number; bench?: number }[] = [];
    const benched: string[] = [];
    const present = new Set<string>();
    // смены (spec 2026-10-staff-shifts): пересменка или ушедший со сменой довёл приёмы — кто в больнице, заново
    if (this.staff.map(m => (this.present(m) ? 1 : 0)).join('') !== this.here) this.placeStaff(true);
    this.rests();
    for (let i = 0; i < n; i++) {
      const o = HEADER + i * STRIDE;
      const key = `p:${buf[o + P.handle]}`;
      const doing = DOINGS[buf[o + P.doing]];
      // поток для ПК (spec 2026-10-walk): ждёт в своей зоне ожидания — номер помещения плана
      const roomH = buf[o + P.room];
      // у двери на скамье, куда посадил движок (spec docs/specs/2026-10-door-benches.md)
      const bench = buf[o + P.bench];
      if (doing === 'waiting') waiting.push({ key, room: roomH >= 0 ? (this.roomIndex[roomH] ?? -1) : -1, ...(bench >= 0 ? { bench } : {}) });
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
      const approveUntil = buf[o + P.approveUntil];
      const now: PatientNow = {
        row, status: STATUSES[buf[o + P.status]], triage: TRIAGES[buf[o + P.triage]], doing, room, by: buf[o + P.by], bed: buf[o + P.bed], kind: String(buf[o + P.flags]),
        since: buf[o + P.since], limit: buf[o + P.limit], ...(askUntil !== NO_TIME ? { ask: { at: buf[o + P.askAt], until: askUntil } } : {}),
        ...(approveUntil !== NO_TIME ? { approve: { at: buf[o + P.approveAt], until: approveUntil } } : {}),
        arrive: buf[o + P.arrive], seat: this.places.doorSeat(key),
      };
      // идёт — дойти к часу движка (spec 2026-10-walk)
      const due = now.arrive === NO_TIME ? NaN : now.arrive;
      this.last.set(key, now);
      this.byId.set(row.id, now);
      const spot: Spot = this.places.spot({ key, doing, room, bed: buf[o + P.bed] }, taken);
      if (spot.pose === 'stand') taken.add(spot.cell);
      this.spots.set(key, spot);
      const w = this.crowd.walkers.get(key);
      if (!w) {
        const look = this.pick('patient', row.sex, row.age >= OLD_AGE, row.seed, undefined, row.job);
        // своя одежда пациента — в атласе вида: маски одежды у пациентов нет, цвет экземпляра ни на что не ложится
        this.paints.set(key, this.paintOf(OWN, look, row.seed, row.age));
        // привезённый скорой — через вход для скорой, на каталке бригады: её везёт фельдшер (spec 2026-10-orderlies)
        const ambulance = kindOf(buf[o + P.flags]) === 'ambulance';
        const pw = this.crowd.add(key, look, spot, false, ambulance, due);
        // медленный шаг (spec docs/specs/2026-10-people.md, «Медленный шаг»): по флагу движка — он и считает его дорогу
        pw.slow = (buf[o + P.flags] & SLOW) !== 0;
        if (ambulance && doing === 'ambulance') this.medic(key, pw, row.seed, spot, taken);
        continue;
      }
      w.slow = (buf[o + P.flags] & SLOW) !== 0;
      // его место назначает перевозка или фельдшер скорой (spec 2026-10-orderlies)
      if (this.held.has(key) || this.medics.has(key)) continue;
      // к врачу зовут — идёт сразу, без остановок; после стройки — к новому месту (то же место — тот же ключ: не встаёт)
      // у двери сел на скамью или встал с неё — тоже к новому месту
      if (this.dirty || !prev || prev.doing !== doing || prev.room !== room || prev.seat !== now.seat || w.goals.length === 0) this.crowd.retarget(w, spot, doing === 'office' && prev?.doing !== 'office', due);
      else w.due = due;
    }
    this.dirty = false;
    for (const key of this.spots.keys()) if (!present.has(key)) this.spots.delete(key);
    this.ridesStep(taken);
    this.medicsStep(taken);
    this.roundsStep(taken);
    for (const [key, w] of this.crowd.walkers) {
      if (w.staff || present.has(key)) continue;
      if (!w.leaving) this.crowd.leave(w);
      this.last.delete(key);
    }
    // дошли до выхода — значок больше не нужен
    for (const key of this.angry) if (!this.crowd.walkers.has(key)) this.angry.delete(key);
    // и окраска с именем тоже: номера людей в срезе не повторяются — без уборки они копились бы за каждым, кто приходил
    // (долгий прогон, docs/05-process.md); строки пришедших для «Ушли» и карточки ушедшего — в `rows`
    for (const key of this.paints.keys()) if (!this.crowd.walkers.has(key)) this.paints.delete(key);
    for (const h of this.names.keys()) if (!this.crowd.walkers.has(`p:${h}`) && !this.crowd.walkers.has(`m:${h}`)) this.names.delete(h);
  }

  /**
   * Перевозки на каталке (spec docs/specs/2026-10-orderlies.md, «Что видно»): тот, кто везёт, идёт за больным с пустой каталкой,
   * перекладывает его, везёт, у аппарата ждёт, везёт назад и возвращается на своё место — к часам перевозки из движка; больной
   * лежит на каталке перед ним. Пока перевозка ведёт больного, его место на экране назначает она, а не срез; кончилась — он
   * там, где говорит срез.
   */
  private ridesStep(taken: ReadonlySet<number>) {
    if (this.rides.length === 0 && this.riding.size === 0 && this.held.size === 0) return;
    const now = ridesNow(this.rides, this.t);
    const held = new Set<string>();
    const legs = new Map<string, Leg>();
    for (const [by, { r, ph }] of now) {
      const cw = this.crowd.walkers.get(`s:${by}`);
      const m = this.staff.find(x => x.id === by);
      if (!cw || cw.leaving || !m) continue;
      const pk = this.keyOf(r.id);
      const pw = pk ? this.crowd.walkers.get(pk) : undefined;
      const id = `${r.id}:${r.by}:${r.go}`;
      const leg = this.legs.get(id) ?? {};
      legs.set(id, leg);
      // откуда — где больной был, когда за ним пошли
      if (!leg.from && pk) leg.from = (pw && pw.carry === undefined && pw.goals.length === 0 && pw.at) || this.spots.get(pk);
      if (leg.from && !leg.fromStop) leg.fromStop = gurneyStop(this.layout, leg.from, taken);
      // куда: на койку — та, что в срезе (когда его взяли, срез говорит, где его койка); на стол, к аппарату — по помещению
      if (!leg.to && pk && ph !== 'go') leg.to = this.destOf(r, pk, taken);
      if (leg.to && !leg.toStop) leg.toStop = gurneyStop(this.layout, leg.to, taken);
      const g = carrierGoal(r, ph);
      const goal = g.at === 'from' ? leg.fromStop : g.at === 'to' ? (leg.toStop ?? this.doorOf(r.to)) : this.postOf(m, taken);
      const k = goal ? `${goal.key}:${g.due}` : '';
      if (goal && this.riding.get(by) !== k) this.crowd.retarget(cw, goal, true, g.due);
      this.riding.set(by, k);
      if (!pk || !pw) continue;
      let lay = riderAt(ph, leg.to?.pose === 'lie');
      if (lay === 'slice') continue;
      // перекладывают, когда тот, кто везёт, уже встал у кровати: пока идёт — больной лежит где лежал; довёз, а ещё в пути (на
      // ×12 кадр длиннее) — больной на каталке, пока не дойдёт
      const there = (stop: Spot | undefined) => !!stop && cw.at?.key === stop.key && cw.goals.length === 0 && cw.state !== 'walk';
      if (ph === 'load' && !there(leg.fromStop) && pw.carry !== cw.key) lay = 'from';
      if (ph === 'loadBack' && !there(leg.toStop) && pw.carry !== cw.key) lay = 'to';
      if ((ph === 'unload' || ph === 'wait') && lay === 'to' && !there(leg.toStop) && pw.carry === cw.key) lay = 'gurney';
      if (ph === 'unloadBack' && !there(leg.fromStop) && pw.carry === cw.key) lay = 'gurney';
      held.add(pk);
      if (lay === 'gurney') {
        if (pw.carry !== cw.key) this.crowd.carry(pw, cw.key);
        continue;
      }
      const spot = lay === 'to' ? leg.to : leg.from;
      if (!spot) continue;
      if (pw.carry !== undefined) this.crowd.release(pw, spot);
      else if (pw.at?.key !== spot.key) this.crowd.settle(pw, spot);
    }
    this.phases = now;
    this.riders = new Map([...now.values()].map(x => [x.r.id, x]));
    // кончилась перевозка: тот, кто вёз, — на своё место (на ×12 мог не дойти); больного, которого она вела, — на место по срезу
    for (const by of [...this.riding.keys()]) {
      if (now.has(by)) continue;
      this.riding.delete(by);
      const m = this.staff.find(x => x.id === by);
      const cw = this.crowd.walkers.get(`s:${by}`);
      const post = m && cw && !cw.leaving ? this.postOf(m, taken) : undefined;
      if (cw && post) this.crowd.retarget(cw, post, true);
    }
    for (const pk of this.held) {
      if (held.has(pk)) continue;
      const pw = this.crowd.walkers.get(pk);
      const spot = this.spots.get(pk);
      if (!pw) continue;
      if (pw.carry !== undefined) {
        if (spot) this.crowd.release(pw, spot);
        else delete pw.carry;
      } else if (spot && pw.at?.key !== spot.key && pw.goals.length === 0) this.crowd.retarget(pw, spot);
    }
    this.held = held;
    this.legs = legs;
    // кто везёт каталку сейчас — тот и держится за каталкой впереди (crowd.ts, `convoy`)
    for (const m of this.staff) {
      const cw = this.crowd.walkers.get(`s:${m.id}`);
      if (cw) cw.gurney = this.riding.has(m.id);
    }
  }

  /**
   * Обход (spec docs/specs/2026-10-staff-motion.md, часть 1, п. 4): медсестра палаты, ПИТ или реанимации раз в `ROUND_EVERY`
   * секунд игры обходит занятые койки своего помещения — от ближней к ближней, у каждой стоит у изголовья с бумагами — и
   * возвращается на пост. Дел в движке у неё на обходе нет, поэтому он только здесь; перерыв и перевозка идут поверх (`rests`,
   * `ridesStep` ведут её по часам движка) — обход прерывается, назад на пост её приводят они.
   */
  private roundsStep(taken: ReadonlySet<number>) {
    for (const m of this.staff) {
      if (m.role !== 'role.nurse') continue;
      const room = this.layout.plan.rooms.findIndex(r => r.id === m.room);
      if (room < 0 || !ROUND_ROOMS.has(this.layout.plan.rooms[room].type)) continue;
      const w = this.crowd.walkers.get(`s:${m.id}`);
      const post = this.rounds.get(m.id);
      if (!w || w.leaving || this.going.get(m.id) || this.riding.has(m.id)) {
        this.rounds.delete(m.id);
        continue;
      }
      if (post !== undefined) {
        // вернулась на пост — обход кончился
        if (w.goals.length === 0 && w.at?.key === post) this.rounds.delete(m.id);
        continue;
      }
      const at = this.roundAt.get(m.id) ?? this.t + roundGap(m.id, 0);
      this.roundAt.set(m.id, at);
      if (this.t < at || w.goals.length > 0 || w.state === 'walk') continue;
      const n = (this.roundN.get(m.id) ?? 0) + 1;
      this.roundN.set(m.id, n);
      this.roundAt.set(m.id, this.t + roundGap(m.id, n));
      const home = this.postOf(m, taken);
      if (!home) continue;
      // занятые койки помещения: лежит на своей кровати, его не везут
      const beds: Spot[] = [];
      for (const [key, p] of this.crowd.walkers) {
        if (!key.startsWith('p:') || p.state !== 'lie' || !p.at?.bed || p.carry !== undefined || this.held.has(key)) continue;
        if (p.at.thing !== undefined && this.layout.things[p.at.thing].room === room) beds.push(p.at);
      }
      if (!beds.length) continue;
      // у изголовья — столько, сколько длится «бумаги в руках» этого вида; от поста — к ближней, от неё — к следующей ближней
      const dwell = this.looks[w.look].clips.Papers.duration;
      const stops: Spot[] = [];
      const used = new Set(taken);
      let from = home.cell;
      const near = (c: number) => Math.abs((c % this.layout.w) - (from % this.layout.w)) + Math.abs(((c / this.layout.w) | 0) - ((from / this.layout.w) | 0));
      const left = beds.map(b => bedSide(this.layout, b, dwell, used)).filter((b): b is Spot => !!b);
      while (left.length) {
        left.sort((a, b) => near(a.cell) - near(b.cell));
        const next = left.shift()!;
        if (stops.some(x => x.key === next.key)) continue;
        stops.push(next);
        used.add(next.cell);
        from = next.cell;
      }
      if (!stops.length) continue;
      this.crowd.route(w, [...stops, home]);
      this.rounds.set(m.id, home.key);
    }
  }

  /** Куда везут: на койку — та, что в срезе, когда срез уже говорит «лежит»; на операцию — стол; к аппарату — его место. */
  private destOf(r: Ride, key: string, taken: ReadonlySet<number>): Spot | undefined {
    const room = this.layout.plan.rooms.findIndex(x => x.id === r.to);
    if (room < 0) return undefined;
    if (r.why === 'op') return this.places.spot({ key, doing: 'surgery', room, bed: -1 }, taken);
    if (r.why === 'exam') return this.places.spot({ key, doing: 'exam', room, bed: -1 }, taken);
    const l = this.last.get(key);
    return l && l.doing === 'ward' && l.room === room ? this.spots.get(key) : undefined;
  }

  /** У двери помещения изнутри — куда идти с каталкой, пока не знаешь, к какой койке. */
  private doorOf(roomId: string): Spot | undefined {
    const room = this.layout.plan.rooms.findIndex(x => x.id === roomId);
    return room >= 0 ? standAt(this.layout, nearestWalk(this.layout, doorInside(this.layout, room)), 'go', 0) : undefined;
  }

  /**
   * Привезённый скорой (spec docs/specs/2026-10-orderlies.md, «Что видно»): его ввозит фельдшер скорой в синем на каталке
   * бригады — от входа для скорой.
   */
  private medic(key: string, pw: Walker, seed: number, spot: Spot, taken: ReadonlySet<number>) {
    const mk = `m:${key.slice(2)}`;
    const sex = seed % 2 === 0 ? 'm' : 'f';
    // фельдшер — свой вид (Rocketbox: синяя форма); нет — фигура персонала в синем
    const look = this.pick('paramedic', sex, false, seed >>> 2);
    const stop = gurneyStop(this.layout, spot, taken);
    this.medicStops.set(key, { at: spot.key, stop });
    // фельдшер всегда с каталкой: и с больным, и уходя к машине (`gurneys`); две машины разом — второй за первым (`queue`)
    const mw = this.crowd.add(mk, look, stop, true, true, NaN, true);
    mw.gurney = true;
    this.crowd.queue(mw);
    this.paints.set(mk, this.paintOf(PARAMEDIC, look, seed >>> 2));
    this.crowd.carry(pw, mk, true);
    this.medics.set(key, mk);
  }

  /**
   * Фельдшер скорой довозит привезённого до его места в смотровой, перекладывает и уходит к машине; места нет — ждёт с ним у
   * входа, пока место не освободится. Больного уже ведут не в смотровую — отпускает его и уходит.
   */
  private medicsStep(taken: ReadonlySet<number>) {
    for (const [pk, mk] of [...this.medics]) {
      const mw = this.crowd.walkers.get(mk);
      const pw = this.crowd.walkers.get(pk);
      const l = this.last.get(pk);
      const spot = this.spots.get(pk);
      if (!mw || mw.leaving || !pw || !l || !spot || l.doing !== 'ambulance') {
        if (pw?.carry === mk) {
          if (spot) this.crowd.release(pw, spot);
          else delete pw.carry;
        }
        if (mw && !mw.leaving) this.crowd.leave(mw, true);
        this.medics.delete(pk);
        this.medicStops.delete(pk);
        continue;
      }
      let at = this.medicStops.get(pk);
      if (at?.at !== spot.key) this.medicStops.set(pk, (at = { at: spot.key, stop: gurneyStop(this.layout, spot, taken) }));
      const stop = at.stop;
      const goal = mw.goals[mw.goals.length - 1] ?? mw.at;
      if (goal?.key !== stop.key) this.crowd.retarget(mw, stop, true);
      else if (spot.pose === 'lie' && mw.goals.length === 0 && mw.state === 'idle') {
        // довёз: переложил на место в смотровой и ушёл
        this.crowd.release(pw, spot);
        this.crowd.leave(mw, true);
        this.medics.delete(pk);
        this.medicStops.delete(pk);
      }
    }
  }

  /**
   * Каталки этого кадра (spec docs/specs/2026-10-orderlies.md, «Что видно»): перед тем, кто везёт, и перед фельдшером скорой; у
   * места санитара в смене — его каталка, пока он никого не везёт.
   */
  gurneys(): GurneyAt[] {
    const out: GurneyAt[] = [];
    const ahead = (w: Walker): GurneyAt => ({ x: w.x + Math.sin(w.heading) * GURNEY_AHEAD, z: w.z + Math.cos(w.heading) * GURNEY_AHEAD, yaw: w.heading });
    for (const id of this.riding.keys()) {
      const w = this.crowd.walkers.get(`s:${id}`);
      if (w) out.push(ahead(w));
    }
    for (const [key, w] of this.crowd.walkers) if (key.startsWith('m:')) out.push(ahead(w));
    for (const [id, at] of this.parked) {
      if (this.riding.has(id)) continue;
      const w = this.crowd.walkers.get(`s:${id}`);
      if (w && !w.leaving) out.push(at);
    }
    return out;
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

  /** Цвет экземпляра: одежда в цвет должности. */
  paint = (w: Walker): Paint => this.paints.get(w.key)!;

  /** Что о человеке сказать в панели. */
  info(key: string): PersonInfo | undefined {
    if (key.startsWith('m:')) {
      const w = this.crowd.walkers.get(key);
      if (!w) return undefined;
      const pk = `p:${key.slice(2)}`;
      const who = this.names.get(Number(key.slice(2)))?.name;
      const wait = !w.leaving && this.medics.get(pk) === key && w.state === 'idle' && w.goals.length === 0 && this.spots.get(pk)?.pose !== 'lie';
      return { kind: 'medic', ...(who ? { who } : {}), ...(wait ? { wait: true as const } : {}), ...(w.leaving ? { leaving: true as const } : {}) };
    }
    if (key.startsWith('s:')) {
      const m = this.staff.find(x => x.id === key.slice(2));
      if (!m) return undefined;
      const day = this.db.economy.staff.shifts?.day;
      const hours: [number, number] | undefined = m.shift && day ? (m.shift === 'day' ? [day[0], day[1]] : [day[1], day[0]]) : undefined;
      const c = this.present(m) ? this.crew.get(m.id) : undefined;
      const f = this.db.economy.staff.fatigue;
      const worn = c && f ? (c.f >= f.tired ? 'blur' : c.f >= f.slow ? 'slow' : undefined) : undefined;
      const r = c?.rest;
      // везёт каталку (spec docs/specs/2026-10-orderlies.md): кого, откуда и куда; санитар в смене без перевозки — свободен
      const ride = this.phases.get(m.id);
      const free = !ride && !r && m.role === ORDERLY && this.present(m) && !m.away;
      return {
        kind: 'staff', role: m.role, ...(m.room ? { room: m.room } : {}), sex: m.sex, id: m.id,
        ...(m.shift && hours ? { shift: m.shift, hours } : {}), ...(this.present(m) ? {} : { home: true as const }),
        ...(c ? { fatigue: c.f } : {}), ...(worn ? { worn } : {}),
        ...(r ? { rest: { kind: r.kind, until: r.until, phase: this.t >= r.back ? 'back' : this.t < r.at ? 'go' : 'there' } } : {}),
        ...(ride ? { ride: { phase: ride.ph, ...(this.rows.get(ride.r.id)?.name ? { who: this.rows.get(ride.r.id)!.name } : {}), from: ride.r.from, to: ride.r.to } } : {}),
        ...(free ? { free: true as const } : {}),
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
    // везут на каталке (spec docs/specs/2026-10-orderlies.md): перекладывают, везут, у аппарата
    const g = this.riders.get(l.row.id);
    const wheeled = g && g.ph !== 'go' && g.ph !== 'home' ? { gurney: { phase: g.ph, from: g.r.from, to: g.r.to } } : {};
    return {
      ...wheeled,
      kind: 'patient', id: l.row.id, ...(l.row.name ? { name: l.row.name } : {}), sex: l.row.sex, age: l.row.age, ...(l.row.complaint ? { complaint: l.row.complaint } : {}), triage: l.triage, doing: l.doing,
      ...(l.row.to ? { to: l.row.to } : {}),
      ...(room ? { room } : {}), ...(by ? { by } : {}), visit: kindOf(Number(l.kind)), ...(by && Number(l.kind) & REFERRED ? { ref: true as const } : {}),
      ...(walking ? { walking: true as const } : {}), ...(coming ? { arrive: l.arrive } : {}), ...(door ? { door: true as const } : {}),
      ...(l.approve ? { approve: l.approve.until } : {}),
    };
  }

  /** Человек штата по номеру в срезе (`P.by`); -1 — вы или никто. */
  staffAt(i: number): StaffMember | undefined {
    return i >= 0 ? this.staff[i] : undefined;
  }

  /** Кто сейчас везёт каталку — номера через запятую: изменилось — «Персонал» заново. */
  get ridingNow(): string {
    return [...this.riding.keys()].join();
  }

  /** Перевозка человека штата сейчас (spec docs/specs/2026-10-orderlies.md): что с ней и до какого часа он занят; нет — не везёт. */
  rideOf(staffId: string): { phase: RidePhase; home: number } | undefined {
    const x = this.phases.get(staffId);
    return x ? { phase: x.ph, home: x.r.home } : undefined;
  }

  /** Срочность пациента — для значка над головой. */
  triageOf(key: string): Triage | undefined {
    return this.last.get(key)?.triage;
  }
}

/** Пациенты — в своей одежде из атласа: цвет одежды экземпляра — белый, ни на что не ложится. */
const OWN = 0xffffff;
