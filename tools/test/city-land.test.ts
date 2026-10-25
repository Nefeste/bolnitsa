// Свободная земля под стройку у городской больницы (spec docs/specs/2026-10-city-land.md; просьба владельца 24.10.2026,
// #58): в больнице ПК участок шире, а восточное крыло без помещений — коридор, в который открываются три коридора; там
// строят, как в пустом здании. В «Смене» и кампании «Анамнеза» больница та же.
import { describe, expect, test } from 'bun:test';
import { db } from '../../src/content';
import { presetHospital } from '../../src/engine/hospital/build';
import { CELL } from '../../src/engine/hospital/grid';
import { checkReady, hospitalOf, mapOf, planOfSite, type Site } from '../../src/engine/hospital/site';
import { siteOfPreset } from '../../src/engine/hospital/site-preset';
import { presetStaff, staffingOf } from '../../src/engine/hospital/staff';
import { problemsOf } from '../../src/engine/hospital/requirements';
import { apply, hospitalCtx, newFlowShift } from '../../src/engine/shift/engine';
import { FLOW, liveTo, site } from './site-kit';

const rec = db.presets['preset.city'];
const city = siteOfPreset(db, rec);
const land = rec.land!;

/** Клетки свободной земли — те, что в её прямоугольниках и не под помещениями. */
function wing(st: Site): number[] {
  const m = mapOf(st);
  const out: number[] = [];
  for (const r of land.inside) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (m.cells[y * m.w + x] === CELL.corridor) out.push(y * m.w + x);
  return out;
}

describe('свободная земля у городской больницы', () => {
  test('участок 78 × 40, крыло 24 × 35 — коридор, весь достижимый от входа; в «Смене» больница та же', () => {
    expect([city.w, city.h]).toEqual([78, 40]);
    expect(land.inside).toEqual([{ x: 52, y: 1, w: 24, h: 35 }]);
    const m = mapOf(city);
    const cells = wing(city);
    expect(cells.length).toBeGreaterThan(24 * 35 - 60);
    for (const i of cells) expect(m.reach[i]).toBe(1);
    // три коридора открываются в крыло
    for (const y of [8, 18, 28]) expect(m.cells[y * m.w + 60]).toBe(CELL.corridor);
    // «Анамнез» — тот же участок 56 × 40
    const { hospital } = presetHospital(db, rec);
    expect([hospital.w, hospital.h]).toEqual([56, 40]);
  });

  test('помещения, двери, штат и скамьи — те же: крыло пустое', () => {
    const plain = siteOfPreset(db, { ...rec, land: undefined });
    expect(city.rooms).toEqual(plain.rooms);
    expect(city.decor).toEqual(plain.decor);
    expect(presetStaff(db, rec).length).toBe(presetStaff(db, { ...rec, land: undefined }).length);
  });

  test('в крыле встаёт готовая палата с персоналом и работает; туда ходят', () => {
    const s = newFlowShift(db, { seed: 1, season: 'winter', hospital: hospitalOf(db, city), staff: presetStaff(db, rec), flow: FLOW });
    // первое место в крыле, где палата S встаёт, — поворот, при котором дверь выходит в коридор
    let at: { x: number; y: number; rot: 0 | 1 | 2 | 3 } | undefined;
    for (let y = 2; y < 30 && !at; y++) {
      for (let x = 56; x < 70 && !at; x++) {
        for (const rot of [0, 1, 2, 3] as const) {
          if (checkReady(db, s.hospital!.site!, 'room.ward', 'S', x, y, rot).ok) {
            at = { x, y, rot };
            break;
          }
        }
      }
    }
    expect(at).toBeDefined();
    const id = site(db, s, { kind: 'ready', type: 'room.ward', size: 'S', ...at!, staff: true }).room!;
    site(db, s, { kind: 'done' });
    liveTo(db, s, 9);
    const ctx = hospitalCtx(db, s);
    const plan = ctx.plan;
    const room = plan.rooms.find(r => r.id === id)!;
    expect(room.x).toBeGreaterThanOrEqual(52);
    expect(plan.connected[id]).toBe(true);
    expect(problemsOf(db, plan, room, staffingOf(db, plan, ctx.staff))).toEqual([]);
    expect(ctx.working.has(id)).toBe(true);
    // больница работает, как прежде: принимают
    apply(db, s, { kind: 'advance', seconds: 3 * 3600 });
    expect(s.summary.arrived).toBeGreaterThan(5);
  }, 60_000);

  test('план больницы ПК — тот же план для движка: крыло — коридор, помещения на прежних местах', () => {
    const plan = planOfSite(db, city);
    const before = planOfSite(db, siteOfPreset(db, { ...rec, land: undefined }));
    expect(plan.rooms.map(r => [r.id, r.type, r.x, r.y, r.door])).toEqual(before.rooms.map(r => [r.id, r.type, r.x, r.y, r.door]));
    expect(plan.grid.w).toBe(78);
  });
});
