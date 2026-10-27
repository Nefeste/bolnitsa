// Миниатюры каталога стройки (spec docs/specs/2026-10-catalog.md, «Миниатюры»): образец готового помещения на пустом
// участке — той же командой, что у стройки (`addReady`), с тем же планом и той же раскладкой, что у карты; рисует
// src/render/thumbs.ts. Очередь — по одной миниатюре за раз, по порядку каталога; готовые хранятся до конца игры.
import type { ContentDb, Id, RoomSizeId } from '../content/types';
import { planOf } from '../engine/hospital/build';
import { addReady, dimsOf, hospitalOf, type Site, type SiteRoom } from '../engine/hospital/site';
import { furnish, type Furnished } from '../render/furniture';
import { type Layout, layoutOf } from '../render/layout';
import type { Model } from '../render/models';
import type { Thumbs } from '../render/thumbs';

export const thumbKey = (type: Id, size: RoomSizeId) => `${type}|${size}`;

/**
 * Коридор вокруг образца `w`×`h`, клеток: кадр миниатюры шире ромба помещения и углами уходит за него почти на 0,8 его
 * стороны — стены корпуса и вход должны быть дальше.
 */
export const aroundOf = (w: number, h: number) => Math.max(w, h);

/**
 * Участок под один образец `w`×`h`: здание — образец и коридор вокруг (`aroundOf`), вход — посередине южной стены, снаружи —
 * клетка улицы. Маленький участок — маленькие пол и стены: сцена миниатюры собирается быстрее, чем на участке пустого здания.
 */
export function lotFor(w: number, h: number): Site {
  const a = aroundOf(w, h);
  const b = { x: 1, y: 1, w: w + 2 * a + 2, h: h + 2 * a + 2 };
  const mid = b.x + Math.floor(b.w / 2) - 1;
  const south = b.y + b.h - 1;
  return {
    w: b.w + 2, h: b.h + 2,
    inside: [{ x: b.x + 1, y: b.y + 1, w: b.w - 2, h: b.h - 2 }],
    main: [
      [mid, south],
      [mid + 1, south],
    ],
    ambulance: [], rooms: [], decor: [], next: 1, nextItem: 1,
  };
}

/**
 * Образец `size` вида `type` на своём участке (`lotFor`), дверью вниз — к камере карты. Раскладка и мебель — те же функции,
 * что у карты; нет образца — нет.
 */
export function sampleOf(db: ContentDb, models: Map<string, Model>, type: Id, size: RoomSizeId): { layout: Layout; furnished: Furnished; room: SiteRoom } | undefined {
  const z = db.rooms[type]?.sizes.find(s => s.id === size);
  if (!z) return undefined;
  const [w, h] = dimsOf(z, 0);
  const a = aroundOf(w, h);
  const done = addReady(db, lotFor(w, h), type, size, 2 + a, 2 + a, 0);
  if (!done.ok) return undefined;
  const room = done.site.rooms[0];
  const hospital = hospitalOf(db, done.site);
  const layout = layoutOf(db, planOf(db, hospital), hospital.decor);
  return { layout, furnished: furnish(layout, models), room };
}

export class ThumbQueue {
  /** готовые: ключ `thumbKey` → PNG адресом `blob:` */
  readonly done = new Map<string, string>();
  /**
   * Каждая миниатюра в окне, мс: образец (план, раскладка, мебель), сборка сцены и кадр — без ожидания видеокарты и шейдеров;
   * для замера.
   */
  readonly times: { key: string; sample: number; build: number; frame: number }[] = [];
  private want: string[] = [];
  private busy = false;

  constructor(
    private db: ContentDb,
    private models: Map<string, Model>,
    private thumbs: Thumbs,
    private onDone: (done: ReadonlyMap<string, string>) => void,
  ) {}

  /** Нужны эти миниатюры — по порядку; готовые и уже ждущие не повторяются. */
  ask(keys: readonly string[]) {
    for (const k of keys) if (!this.done.has(k) && !this.want.includes(k)) this.want.push(k);
  }

  /** Раз в кадр: следующая миниатюра, если прошлая уже готова. */
  step() {
    if (this.busy) return;
    const key = this.want.shift();
    if (key === undefined) return;
    const [type, size] = key.split('|') as [Id, RoomSizeId];
    const t0 = performance.now();
    const s = sampleOf(this.db, this.models, type, size);
    if (!s) {
      this.done.set(key, '');
      return;
    }
    this.busy = true;
    const sample = performance.now() - t0;
    this.thumbs
      .draw(s.layout, s.furnished, s.room)
      .then(({ url, ms }) => {
        this.times.push({ key, sample, ...ms });
        this.done.set(key, url);
        this.onDone(this.done);
      })
      .catch(() => this.done.set(key, ''))
      .finally(() => {
        this.busy = false;
      });
  }
}
