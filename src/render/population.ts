// Люди больницы из среза потока (spec docs/specs/2026-10-shell-3d.md, «Где человек и что он делает»): штат — на местах
// своих помещений, пациенты — по срезу: кто новый — входит с улицы, кого нет — уходит к выходу, у кого новое место — идёт
// туда. Здесь же — кто как выглядит (cast.ts) и что о нём сказать в панели. Без Three.js, кроме цвета.
import * as THREE from 'three';
import type { ContentDb, Id } from '../content/types';
import type { RoomInstance } from '../engine/hospital/build';
import type { StaffMember } from '../engine/hospital/staff';
import type { Doing } from '../engine/shift/slice';
import type { Triage } from '../engine/shift/types';
import { DOINGS, H, HEADER, KINDS, type NameRow, P, STRIDE, TRIAGES } from '../sim/pack';
import type { Look } from './bake';
import { CLOTHES, GOWN, lookSpec, OLD_AGE, roleColor, SKIN } from './cast';
import type { Crowd, Walker } from './crowd';
import type { Layout } from './layout';
import type { Places, Spot } from './place';

/** Что показать о человеке в панели. */
export type PersonInfo =
  | { kind: 'staff'; role: Id; room?: string; sex: 'm' | 'f' }
  | { kind: 'patient'; id: string; sex: 'm' | 'f'; age: number; complaint?: Id; triage: Triage; doing: Doing; room?: string; by?: Id; visit: string };

const LYING: ReadonlySet<Doing> = new Set(['ward', 'surgery', 'ambulance']);

export class Population {
  /** вид — по полу и возрасту; номера видов в `looks` */
  private byUse = new Map<string, number[]>();
  private paints = new Map<string, { clothes: THREE.Color; skin: THREE.Color }>();
  /** последнее о пациенте из среза — для панели и цвета */
  private last = new Map<string, { row: NameRow; triage: Triage; doing: Doing; room: number; by: number; kind: string }>();
  readonly names = new Map<number, NameRow>();
  /** номера помещений в списке больницы → номер в плане */
  private roomIndex: number[] = [];
  /** раскладка новая (стройка) — в следующем срезе места раздаются всем заново */
  private dirty = false;

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

  /**
   * Штат — сразу на местах своих помещений; на стуле сидит, иначе стоит лицом к работе. Номер человека на экране — его
   * номер в штате (`s:<id>`): после стройки и найма он тот же; у кого место прежнее, тот не двигается.
   */
  placeStaff() {
    const taken = new Set<number>();
    const keep = new Set<string>();
    for (const m of this.staff) {
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
        if (w.at?.key !== spot.key) this.crowd.settle(w, spot);
        continue;
      }
      const use = m.role === 'role.registrar' ? 'registrar' : 'staff';
      const look = this.pick(use, m.sex, m.seed % 3 === 0, m.seed);
      this.crowd.add(key, look, spot, true);
      this.paints.set(key, { clothes: new THREE.Color(roleColor(m.role)), skin: new THREE.Color(SKIN[m.seed % SKIN.length]) });
    }
    for (const [key, w] of [...this.crowd.walkers]) if (w.staff && !keep.has(key)) this.crowd.remove(key);
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

  /** Сверить с упакованным срезом: новые входят, ушедшие уходят, у кого новое место — идут туда. */
  sync(buf: Int32Array, names: readonly NameRow[]) {
    for (const r of names) this.names.set(r.h, r);
    const n = buf[H.count];
    const waiting: string[] = [];
    const benched: string[] = [];
    const present = new Set<string>();
    for (let i = 0; i < n; i++) {
      const o = HEADER + i * STRIDE;
      const key = `p:${buf[o + P.handle]}`;
      const doing = DOINGS[buf[o + P.doing]];
      if (doing === 'waiting') waiting.push(key);
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
      this.last.set(key, { row, triage: TRIAGES[buf[o + P.triage]], doing, room, by: buf[o + P.by], kind: String(buf[o + P.flags]) });
      const spot: Spot = this.places.spot({ key, doing, room, bed: buf[o + P.bed] }, taken);
      if (spot.pose === 'stand') taken.add(spot.cell);
      const w = this.crowd.walkers.get(key);
      if (!w) {
        const look = this.pick('patient', row.sex, row.age >= OLD_AGE, row.seed);
        this.paints.set(key, { clothes: new THREE.Color(CLOTHES[row.seed % CLOTHES.length]), skin: new THREE.Color(SKIN[(row.seed >>> 3) % SKIN.length]) });
        // привезённый скорой — через вход для скорой
        this.crowd.add(key, look, spot, false, KINDS[buf[o + P.flags]] === 'ambulance');
        continue;
      }
      // к врачу зовут — идёт сразу, без остановок; после стройки — к новому месту (то же место — тот же ключ: не встаёт)
      if (this.dirty || !prev || prev.doing !== doing || prev.room !== room || w.goals.length === 0) this.crowd.retarget(w, spot, doing === 'office' && prev?.doing !== 'office');
    }
    this.dirty = false;
    for (const [key, w] of this.crowd.walkers) {
      if (w.staff || present.has(key)) continue;
      if (!w.leaving) this.crowd.leave(w);
      this.last.delete(key);
    }
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
      return m ? { kind: 'staff', role: m.role, ...(m.room ? { room: m.room } : {}), sex: m.sex } : undefined;
    }
    const l = this.last.get(key);
    if (!l) return undefined;
    const room = l.room >= 0 ? this.layout.plan.rooms[l.room]?.id : undefined;
    const by = l.by >= 0 ? this.staff[l.by]?.role : undefined;
    return {
      kind: 'patient', id: l.row.id, sex: l.row.sex, age: l.row.age, ...(l.row.complaint ? { complaint: l.row.complaint } : {}), triage: l.triage, doing: l.doing,
      ...(room ? { room } : {}), ...(by ? { by } : {}), visit: ['appointment', 'walkIn', 'return', 'ambulance'][Number(l.kind)] ?? 'walkIn',
    };
  }

  /** Срочность пациента — для значка над головой. */
  triageOf(key: string): Triage | undefined {
    return this.last.get(key)?.triage;
  }
}

const GOWN_COLOR = new THREE.Color(GOWN);
