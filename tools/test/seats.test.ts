// Посадка (spec docs/specs/2026-10-shell-3d.md, «Масштаб и опора»; замечание владельца к пробе: «сидят на спинке стула»):
// у каждой модели, на которую садятся, посадочная точка — на сиденье, а не над спинкой; сиденье — на высоте SEAT; таз
// каждого вида человека в позе «сидит» приходится на сиденье, ступни — у пола.
import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { CATALOG, SEAT } from '../../src/render/catalog';
import { Furnisher } from '../../src/render/furniture';
import { heightAt, type Model, modelOf, seatOf } from '../../src/render/models';
import { bakedPeople, gltfOf } from './render-kit';

const seatEntries = Object.entries(CATALOG).filter(([, e]) => 'model' in e && e.seat !== undefined) as [string, { model: string; fit: { w: number; d: number; h: number }; seat: number }][];

describe('сиденья', () => {
  test.each(seatEntries.map(([k, e]) => [k, e.model] as [string, string]))('%s (%s): сиденье — по геометрии, спинка — сзади', async (_k, name) => {
    const model = modelOf(await gltfOf(name), name);
    const s = seatOf(model)!;
    expect(s).not.toBeNull();
    // сиденье — между четвертью и тремя четвертями высоты модели; над точкой посадки ничего нет
    const h = model.box.max.y - model.box.min.y;
    expect(s.y - model.box.min.y).toBeGreaterThan(h * 0.25);
    expect(s.y - model.box.min.y).toBeLessThan(h * 0.75);
    expect(heightAt(model, s.x, s.z)).toBeCloseTo(s.y, 3);
    // спинка (верхняя половина над сиденьем) — позади середины сиденья: перёд модели — +z
    const v = new THREE.Vector3();
    let bz = 0;
    let n = 0;
    for (const p of model.parts) {
      const pos = p.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        if (v.y > s.y + (model.box.max.y - s.y) * 0.5) {
          bz += v.z;
          n++;
        }
      }
    }
    if (n > 0 && model.box.max.y - s.y > h * 0.3) expect(bz / n).toBeLessThan(s.z);
  });

  test('поставленное сиденье — на высоте SEAT, таз каждого вида — на нём, ступни — у пола', async () => {
    const people = await bakedPeople();
    const models = new Map<string, Model>();
    for (const [, e] of seatEntries) if (!models.has(e.model)) models.set(e.model, modelOf(await gltfOf(e.model), e.model));
    const f = new Furnisher(models);
    for (const [k, e] of seatEntries) {
      for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
        const r = f.place(e.model, 5.5, 5.5, yaw, e.fit, { seat: e.seat });
        const a = r.seat!;
        expect(a.y).toBeCloseTo(SEAT, 2);
        // точка посадки — внутри места предмета
        expect(Math.abs(a.x - 5.5)).toBeLessThan(e.fit.w / 2 + 0.05);
        expect(Math.abs(a.z - 5.5)).toBeLessThan(Math.max(e.fit.w, e.fit.d) / 2 + 0.05);
        for (const look of people.looks) {
          // корень сидящего — так, чтобы опора таза пришлась на точку посадки (crowd.ts, seatRoot)
          const lift = a.y - look.seat.y;
          expect([k, look.name, lift >= -0.01 && lift <= 0.07]).toEqual([k, look.name, true]);
        }
      }
    }
  });
});
