// Люди на отрисовке по срезу потока (spec docs/specs/2026-10-shell-3d.md, «Где человек и что он делает»): смена с потоком
// в городской больнице идёт кадрами ×4, срез упаковывается, как в потоке расчёта, а толпа ведёт людей к местам. Люди
// садятся на стулья, ложатся на койки, не уходят в стены и не стоят друг в друге; число людей — из движка.
import { describe, expect, test } from 'bun:test';
import { H } from '../../src/sim/pack';
import { createSim } from '../../src/sim/host';
import { Crowd } from '../../src/render/crowd';
import { furnish } from '../../src/render/furniture';
import { Paths } from '../../src/render/path';
import { Places } from '../../src/render/place';
import { Population } from '../../src/render/population';
import { CATALOG, EXTRA_MODELS } from '../../src/render/catalog';
import { buildDb } from '../content/load';
import { bakedPeople, furnitureModels, presetLayout } from './render-kit';

const { db } = buildDb();

/** Городская больница на отрисовке: раскладка, пути, толпа на ×4 и население со штатом на местах. */
async function cityScene() {
  const { hospital, staff, layout } = presetLayout(db, 'preset.city');
  const names = [...new Set([...Object.values(CATALOG).flatMap(e => ('model' in e ? [e.model] : [])), ...EXTRA_MODELS])];
  const models = await furnitureModels(names);
  const fur = furnish(layout, models);
  const walk = layout.walk.slice();
  for (const [x, y] of fur.decor) walk[y * layout.w + x] = 0;
  const open = new Uint8Array(layout.w * layout.h);
  for (let i = 0; i < open.length; i++) open[i] = layout.plan.grid.cells[i] === 1 || layout.plan.grid.cells[i] === 2 || layout.plan.grid.cells[i] === 4 ? 1 : 0;
  const paths = new Paths(layout.w, layout.h, walk, open);
  const people = await bakedPeople();
  const places = new Places(layout, fur);
  const crowd = new Crowd(layout, paths, people.looks);
  crowd.speed = 4;
  const pop = new Population(db, layout, places, crowd, people.looks, staff, hospital.rooms);
  pop.placeStaff();
  return { hospital, staff, layout, crowd, pop };
}

describe('толпа по срезу потока', () => {
  test('городская больница, 08:00–11:00 на ×4: люди из движка садятся, ложатся и не стоят друг в друге', async () => {
    const { hospital, staff, layout, crowd, pop } = await cityScene();
    const staffCount = crowd.walkers.size;
    expect(staffCount).toBe(staff.length);

    const sim = createSim(db);
    const first = sim.handle({ kind: 'start', seed: 5, season: 'winter', hospital, staff, flow: { perHour: 6, ambulancePerHour: 1 } });
    if (first.kind !== 'slice') throw new Error(first.kind);
    let maxPeople = 0;
    let sat = 0;
    let lay = 0;
    let tooClose = 0;
    let pairs = 0;
    // 3 часа на ×4 при 60 к/с: 4 игровые секунды на кадр
    for (let f = 0; f < (3 * 3600) / 4; f++) {
      const r = sim.handle({ kind: 'tick', seconds: 4, budgetMs: 50 });
      if (r.kind !== 'slice') throw new Error(r.kind === 'error' ? r.message : r.kind);
      pop.sync(r.buf, r.names);
      maxPeople = Math.max(maxPeople, r.buf[H.count]);
      crowd.update(1 / 60);
      if (f % 30 !== 0) continue;
      const c = crowd.count();
      sat = Math.max(sat, c.sitting);
      lay = Math.max(lay, c.lying);
      const list = [...crowd.walkers.values()];
      for (const w of list) {
        expect(Number.isFinite(w.x) && Number.isFinite(w.z) && Number.isFinite(w.y)).toBe(true);
        // стоящий и идущий — не в стене: клетка под ним — пол, коридор, дверь или улица у входа
        if (w.state === 'idle' || w.state === 'walk') {
          const x = Math.floor(w.x);
          const z = Math.floor(w.z);
          if (x >= 0 && z >= 0 && x < layout.w && z < layout.h) expect(layout.plan.grid.cells[z * layout.w + x]).not.toBe(3);
        }
      }
      const standing = list.filter(w => w.state === 'idle' || w.state === 'walk');
      for (let i = 0; i < standing.length; i++) {
        for (let k = i + 1; k < standing.length; k++) {
          pairs++;
          if (Math.hypot(standing[i].x - standing[k].x, standing[i].z - standing[k].z) < 0.2) tooClose++;
        }
      }
    }
    // людей — столько, сколько в больнице движка, плюс штат
    expect(maxPeople).toBeGreaterThan(3);
    expect(maxPeople).toBeLessThan(60);
    expect(crowd.walkers.size).toBeLessThanOrEqual(staffCount + maxPeople + 12);
    // штат сидит за столами; пациенты садятся в зале ожидания и ложатся на койки
    expect(sat).toBeGreaterThan(5);
    expect(lay).toBeGreaterThan(0);
    // почти никто не стоит в другом: меньше 1 % пар ближе 20 см
    expect(tooClose / Math.max(1, pairs)).toBeLessThan(0.01);
  }, 180_000);

  // spec docs/specs/2026-10-owner-play.md: приём в движке короче дороги на экране — ушедший из среза по пути к врачу сперва
  // доходит до кабинета, а уже потом идёт к выходу (раньше он разворачивался в коридоре и уходил домой, не дойдя)
  test('ушёл из среза по пути к врачу — сперва в кабинет, потом к выходу', async () => {
    const { hospital, staff, crowd, pop } = await cityScene();
    const sim = createSim(db);
    const first = sim.handle({ kind: 'start', seed: 5, season: 'winter', hospital, staff, flow: { perHour: 6, ambulancePerHour: 1 } });
    if (first.kind !== 'slice') throw new Error(first.kind);
    // кто идёт к врачу: на экране в пути, впереди — остановка «приём»
    let found: { key: string; stop: string } | undefined;
    for (let f = 0; f < (3 * 3600) / 4 && !found; f++) {
      const r = sim.handle({ kind: 'tick', seconds: 4, budgetMs: 50 });
      if (r.kind !== 'slice') throw new Error(r.kind === 'error' ? r.message : r.kind);
      pop.sync(r.buf, r.names);
      crowd.update(1 / 60);
      for (const [key, w] of crowd.walkers) {
        const goal = w.goals[w.goals.length - 1];
        if (w.staff || w.state !== 'walk' || goal?.kind !== 'act' || pop.now(key)?.doing !== 'office') continue;
        found = { key, stop: goal.key };
        break;
      }
    }
    expect(found).toBeDefined();
    const w = crowd.walkers.get(found!.key)!;
    // движок отпустил его раньше, чем он дошёл: в карточке — «идёт», а не «у врача»
    expect(pop.info(found!.key)).toMatchObject({ kind: 'patient', doing: 'office', walking: true });
    crowd.leave(w);
    let visited = false;
    for (let f = 0; f < 60 * 120 && crowd.walkers.has(found!.key) && w.state !== 'gone'; f++) {
      crowd.update(1 / 60);
      if (w.at?.key === found!.stop) visited = true;
    }
    expect(visited).toBe(true);
    expect(w.state).toBe('gone');
  }, 180_000);
});
