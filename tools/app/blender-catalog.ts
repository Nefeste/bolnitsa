// Каталог вещей для моделей Blender, часть 2 (docs/specs/2026-11-blender-2.md): что стоит в готовых больницах и в помещениях
// сценария 1 — по записям каталога окна (src/render/catalog.ts): чем нарисовано сейчас (модель кодом или модель набора CC0),
// сколько штук и сколько треугольников у одной и у всех. Числа спецификации — отсюда.
//
// Где считается:
// - город — готовая больница `preset.city`;
// - поликлиника — `site.polyclinic`;
// - сценарий 1 — по одному готовому помещению «С персоналом» каждого типа из списка стройки сценария, размера M (нет M —
//   первого размера), как их ставит игрок.
//
// Бюджет на одну вещь и группа — из blender/budgets.json: итог «по бюджету» — если каждая модель группы уложится в свой.
//
//   npm run content && bun tools/app/blender-catalog.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { db } from '../../src/content';
import type { Id, RoomSizeId } from '../../src/content/types';
import { planOf } from '../../src/engine/hospital/build';
import { hospitalOf } from '../../src/engine/hospital/site';
import { siteOfPlan } from '../../src/engine/hospital/site-plan';
import { BLENDER, entryOf } from '../../src/render/catalog';
import { furnishThing } from '../../src/render/furniture';
import { layoutOf, type Thing } from '../../src/render/layout';
import { furnitureModels, index, oneRoom, presetLayout, staffCells } from '../test/render-kit';

const kits = [...index.kenney.map(n => `kenney/${n}`), ...index.kaykit.map(n => `kaykit/${n}`)];
const models = await furnitureModels([...kits, ...Object.values(BLENDER)]);

/** Чем нарисована вещь: `code:<имя>` — моделью кодом, `<набор>/<имя>` — моделью набора. */
function keyOf(t: Thing): string | undefined {
  const e = entryOf(t.kind, t.type, t.equipment);
  if (!e) return undefined;
  return 'code' in e ? `code:${e.code}` : e.model;
}

/** Треугольников у одной вещи сейчас — без моделей Blender: модели кодом и наборов, как по умолчанию. */
const plain = new Map([...models].filter(([name]) => !name.startsWith('blender/')));
const trisOf = (t: Thing) => Math.round(furnishThing(t, plain).tris);
const blenderTris = (t: Thing) => Math.round(furnishThing(t, models).tris);

type Count = { n: number; tris: number; blender?: number; rooms: Set<string> };
function countOf(things: readonly Thing[]): Map<string, Count> {
  const out = new Map<string, Count>();
  for (const t of things) {
    const k = keyOf(t);
    if (!k) continue;
    const c = out.get(k) ?? { n: 0, tris: trisOf(t), rooms: new Set<string>() };
    c.n++;
    c.rooms.add(t.type || 'коридор');
    const e = entryOf(t.kind, t.type, t.equipment);
    if (e && 'code' in e && BLENDER[e.code]) c.blender = blenderTris(t);
    out.set(k, c);
  }
  return out;
}

const city = presetLayout(db, 'preset.city').layout.things;
const poly = (() => {
  const p = siteOfPlan(db, db.sites!['site.polyclinic']);
  if (!p.ok) throw new Error(`поликлиника: ${p.room} — ${p.error.kind}`);
  const hospital = hospitalOf(db, p.site);
  const plan = planOf(db, hospital);
  return layoutOf(db, plan, hospital.decor, staffCells(plan, p.staff, db)).things;
})();
const scenario = db.scenarios ? Object.values(db.scenarios)[0] : undefined;
const sizeFor = (type: Id): RoomSizeId => (db.rooms[type].sizes.some(z => z.id === 'M') ? 'M' : db.rooms[type].sizes[0].id);
const ambulatory = (scenario?.build ?? []).flatMap(type => {
  const hs = oneRoom(db, type, sizeFor(type), 0);
  const plan = planOf(db, hs);
  return layoutOf(db, plan, hs.decor).things.filter(t => t.room >= 0);
});

const venues = [
  { name: 'город', c: countOf(city) },
  { name: 'поликлиника', c: countOf(poly) },
  { name: 'сценарий 1', c: countOf(ambulatory) },
];

/** Модели части 2: имя файла → группа, что заменяет, бюджет треугольников. */
export const BUDGETS = JSON.parse(readFileSync(join(import.meta.dir, '../../blender/budgets.json'), 'utf8')) as {
  groups: Record<string, string>;
  /** `decor` — вещь без записи каталога: окно ставит её само (кабинка санузла, `decorate` в furniture.ts) — проба её не считает */
  models: Record<string, { group: number; replaces: string; decor?: true; tris: number }>;
};
const modelFor = (k: string) => Object.entries(BUDGETS.models).find(([, m]) => m.replaces === k);

if (import.meta.main) {
  const keys = [...new Set(venues.flatMap(v => [...v.c.keys()]))].sort(
    (a, b) => (modelFor(a)?.[1].group ?? 9) - (modelFor(b)?.[1].group ?? 9) || (venues[0].c.get(b)?.n ?? 0) - (venues[0].c.get(a)?.n ?? 0) || (a < b ? -1 : 1),
  );
  const one = (k: string) => venues.map(v => v.c.get(k)).find(Boolean)!;
  console.log('| Вещь | Сейчас | Треуг. сейчас | Модель Blender | Группа | Бюджет | Город, шт. | Поликлиника, шт. | Сценарий 1, шт. | Где стоит |');
  console.log('|---|---|---:|---|---:|---:|---:|---:|---:|---|');
  for (const k of keys) {
    const c = one(k);
    const src = k.startsWith('code:') ? 'кодом' : k.split('/')[0];
    const name = k.startsWith('code:') ? k.slice(5) : k.split('/')[1];
    const m = modelFor(k);
    const where = [...new Set(venues.flatMap(v => [...(v.c.get(k)?.rooms ?? [])]))].map(r => r.replace('room.', '')).sort().join(', ');
    const pilot = c.blender !== undefined ? ` (пилот ${c.blender})` : '';
    console.log(`| ${name} | ${src} | ${c.tris}${pilot} | ${m ? m[0] : '—'} | ${m ? m[1].group : '—'} | ${m ? m[1].tris : '—'} | ${venues[0].c.get(k)?.n ?? 0} | ${venues[1].c.get(k)?.n ?? 0} | ${venues[2].c.get(k)?.n ?? 0} | ${where} |`);
  }
  // итог: сейчас, с моделями пилота и по бюджету — после каждой группы по очереди
  const groups = Object.keys(BUDGETS.groups).map(Number);
  for (const v of venues) {
    let n = 0;
    let now = 0;
    let pilot = 0;
    const after = groups.map(() => 0);
    for (const [k, c] of v.c) {
      n += c.n;
      now += c.n * c.tris;
      pilot += c.n * (c.blender ?? c.tris);
      const m = modelFor(k)?.[1];
      groups.forEach((g, i) => (after[i] += c.n * (m && m.group <= g ? m.tris : c.tris)));
    }
    console.log(`${v.name}: вещей ${n}; треугольников сейчас ${now}, с моделями пилота ${pilot}; по бюджету после групп ${groups.join(', ')} — ${after.join(', ')}`);
  }
}
