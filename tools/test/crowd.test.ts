// Люди на отрисовке по срезу потока (spec docs/specs/2026-10-shell-3d.md, «Где человек и что он делает»): смена с потоком
// в городской больнице идёт кадрами ×12, срез упаковывается, как в потоке расчёта, а толпа ведёт людей к местам. Люди
// садятся на стулья, ложатся на койки, не уходят в стены и не стоят друг в друге; число людей — из движка. Ходьба в
// движке (spec docs/specs/2026-10-walk.md): человек доходит к часу, который назвал движок.
import { describe, expect, test } from 'bun:test';
import { H } from '../../src/sim/pack';
import { createSim } from '../../src/sim/host';
import { Crowd, idleRate, PACE } from '../../src/render/crowd';
import { GAME_PER_REAL, WALK_SPEED_PC } from '../../src/engine/shift/walking';
import { furnish } from '../../src/render/furniture';
import { Paths } from '../../src/render/path';
import { doorInside, Places, standAt } from '../../src/render/place';
import { Population } from '../../src/render/population';
import { CATALOG, EXTRA_MODELS } from '../../src/render/catalog';
import { withNightShift } from '../../src/engine/hospital/staff';
import { buildDb } from '../content/load';
import { bakedPeople, furnitureModels, presetLayout } from './render-kit';

const { db } = buildDb();

/**
 * Городская больница на отрисовке: раскладка, пути, толпа на ×12 и население со штатом на местах. `shifts` — штат со сменами,
 * как его начинает игра (spec docs/specs/2026-10-staff-shifts.md), часы — 08:00.
 */
async function cityScene(shifts = false) {
  const { hospital, staff: base, layout } = presetLayout(db, 'preset.city');
  const staff = shifts ? withNightShift(db, hospital.rooms, base) : base;
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
  crowd.speed = 12;
  crowd.rate = 12 * GAME_PER_REAL;
  const pop = new Population(db, layout, places, crowd, people.looks, staff, hospital.rooms);
  pop.setTime(8 * 3600);
  pop.placeStaff();
  return { hospital, staff, layout, crowd, pop };
}

describe('толпа по срезу потока', () => {
  test('городская больница, 08:00–11:00 на ×12: люди из движка садятся, ложатся и не стоят друг в друге', async () => {
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
    // 3 часа на ×12 при 60 к/с: 4 игровые секунды на кадр
    for (let f = 0; f < (3 * 3600) / 4; f++) {
      const r = sim.handle({ kind: 'tick', seconds: 4, budgetMs: 50 });
      if (r.kind !== 'slice') throw new Error(r.kind === 'error' ? r.message : r.kind);
      crowd.t = r.buf[H.t];
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
      crowd.t = r.buf[H.t];
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

  // долгий прогон (docs/05-process.md, «Долгий прогон»): номера людей в срезе не повторяются, и окно, которое помнит имя и
  // окраску каждого, кто когда-либо приходил, прибавляло по полмегабайта за игровые сутки — помнить их нужно, пока человек
  // на сцене
  test('имя и окраска — только у тех, кто на сцене: ушедшие не копятся', async () => {
    const { hospital, staff, crowd, pop } = await cityScene();
    const sim = createSim(db);
    const first = sim.handle({ kind: 'start', seed: 5, season: 'winter', hospital, staff, flow: { perHour: 8, ambulancePerHour: 2 } });
    if (first.kind !== 'slice') throw new Error(first.kind);
    const seen = new Set<number>();
    // 4 часа на ×12 при 60 к/с; сверка — после шага толпы: дошедших до выхода толпа убирает в конце шага, а таблицы
    // чистит следующая сверка
    for (let f = 0; f < (4 * 3600) / 4; f++) {
      const r = sim.handle({ kind: 'tick', seconds: 4, budgetMs: 50 });
      if (r.kind !== 'slice') throw new Error(r.kind === 'error' ? r.message : r.kind);
      crowd.t = r.buf[H.t];
      crowd.update(1 / 60);
      pop.sync(r.buf, r.names);
      for (const n of r.names) seen.add(n.h);
    }
    const paints = pop['paints'];
    // окраска — у каждого на сцене (без неё кадр не нарисовать) и ни у кого больше
    expect([...paints.keys()].sort()).toEqual([...crowd.walkers.keys()].sort());
    // имя — у пациента на сцене или у привезённого, которого ещё ведёт фельдшер
    for (const h of pop.names.keys()) expect(crowd.walkers.has(`p:${h}`) || crowd.walkers.has(`m:${h}`)).toBe(true);
    // а ушли и забыты — больше десятка
    expect(seen.size).toBeGreaterThan(20);
    expect(seen.size - pop.names.size).toBeGreaterThan(10);
  }, 180_000);

  // spec docs/specs/2026-10-staff-shifts.md: на карте — кто в смене; в 20:00 дневные идут к выходу, ночные входят с улицы на
  // свои места; кто уже уходил, но ещё нужен (доводит приём), — снова на своём месте
  test('пересменка: ночные входят с улицы и встают на места, дневные уходят; передумавший уходить — снова на месте', async () => {
    const { staff, crowd, pop } = await cityScene(true);
    const night = staff.filter(m => m.shift === 'night').map(m => `s:${m.id}`);
    const day = staff.filter(m => m.shift === 'day').map(m => `s:${m.id}`);
    expect(night.length).toBeGreaterThan(0);
    expect(day.every(k => crowd.walkers.has(k))).toBe(true);
    expect(night.some(k => crowd.walkers.has(k))).toBe(false);
    const spotOf = (k: string) => crowd.walkers.get(k)!.at?.key;
    const was = new Map(day.map(k => [k, spotOf(k)]));
    pop.setTime(20 * 3600 + 30);
    pop.placeStaff(true);
    // пришедшие — от входа, ушедшие — к выходу
    expect(night.every(k => crowd.walkers.get(k)?.state === 'walk')).toBe(true);
    expect(day.every(k => crowd.walkers.get(k)?.leaving)).toBe(true);
    // один дневной врач ещё доводит приём — передумал уходить
    const stays = staff.findIndex(m => m.shift === 'day' && db.roles[m.role]?.stands === 'role.doctor');
    const key = `s:${staff[stays].id}`;
    for (let f = 0; f < 30; f++) crowd.update(1 / 60);
    pop.setLate([stays]);
    pop.placeStaff(true);
    expect(crowd.walkers.get(key)?.leaving).toBe(false);
    for (let f = 0; f < 60 * 60 && day.some(k => k !== key && crowd.walkers.has(k)); f++) crowd.update(1 / 60);
    expect(day.filter(k => k !== key && crowd.walkers.has(k))).toEqual([]);
    expect(night.every(k => crowd.walkers.get(k)?.state !== 'walk' && crowd.walkers.get(k)?.at !== undefined)).toBe(true);
    expect(spotOf(key)).toBe(was.get(key));
  }, 180_000);

  // spec docs/specs/2026-10-staff-shifts.md, часть 2: врач ушёл на перерыв — идёт в ординаторскую и садится там; пора назад
  // — идёт на своё место; в туалет — к раковине санузла
  test('перерыв: врач идёт в ординаторскую и садится, потом — на своё место; в туалет — в санузел', async () => {
    const { staff, layout, crowd, pop } = await cityScene(true);
    const m = staff.find(x => x.shift === 'day' && db.roles[x.role]?.stands === 'role.doctor' && !db.roles[x.role]?.profile)!;
    const key = `s:${m.id}`;
    const post = crowd.walkers.get(key)!.at!.key;
    const staffRoom = layout.plan.rooms.findIndex(r => r.type === 'room.staff');
    const toilet = layout.plan.rooms.findIndex(r => r.type === 'room.toilet');
    const t0 = 13 * 3600;
    const slice = (t: number) => {
      const buf = new Int32Array(14);
      buf[H.t] = t;
      buf[H.count] = 0;
      return buf;
    };
    const rest = { kind: 'staff' as const, room: layout.plan.rooms[staffRoom].id, from: t0, at: t0 + 300, back: t0 + 1500, until: t0 + 1800 };
    pop.setCrew([{ id: m.id, f: 70, rest }]);
    pop.sync(slice(t0 + 10), []);
    const w = crowd.walkers.get(key)!;
    const goal = w.goals[w.goals.length - 1];
    expect(goal).toBeDefined();
    // идёт к стулу или дивану ординаторской
    expect(goal.pose).toBe('sit');
    const inStaff = (x: number, z: number) => {
      const r = layout.plan.rooms[staffRoom];
      return x >= r.x && x < r.x + r.w && z >= r.y && z < r.y + r.h;
    };
    expect(inStaff(goal.x, goal.z)).toBe(true);
    for (let f = 0; f < 60 * 60 && w.goals.length > 0; f++) crowd.update(1 / 60);
    expect(w.at?.key).toBe(goal.key);
    // в карточке — идёт в ординаторскую, потом на перерыве до 13:30
    expect(pop.info(key)).toMatchObject({ rest: { phase: 'go' } });
    pop.sync(slice(t0 + 400), []);
    expect(w.at?.key).toBe(goal.key);
    expect(pop.info(key)).toMatchObject({ kind: 'staff', fatigue: 70, worn: 'slow', rest: { kind: 'staff', until: t0 + 1800, phase: 'there' } });
    // пора назад — на своё место
    pop.sync(slice(t0 + 1500), []);
    for (let f = 0; f < 60 * 60 && w.goals.length > 0; f++) crowd.update(1 / 60);
    expect(w.at?.key).toBe(post);
    // туалет: к раковине санузла
    pop.setCrew([{ id: m.id, f: 20, rest: { kind: 'toilet', room: layout.plan.rooms[toilet].id, from: t0 + 3600, at: t0 + 3700, back: t0 + 4000, until: t0 + 4100 } }]);
    pop.sync(slice(t0 + 3610), []);
    const g = w.goals[w.goals.length - 1];
    const tr = layout.plan.rooms[toilet];
    expect(g.x >= tr.x && g.x < tr.x + tr.w && g.z >= tr.y && g.z < tr.y + tr.h).toBe(true);
    // перерыв кончился, а окно этого не видело (промотка) — всё равно на своё место
    pop.setCrew([{ id: m.id, f: 21 }]);
    pop.sync(slice(t0 + 5000), []);
    for (let f = 0; f < 60 * 60 && w.goals.length > 0; f++) crowd.update(1 / 60);
    expect(w.at?.key).toBe(post);
  }, 180_000);

  // spec docs/specs/2026-10-walk.md, «Проверки»: окно ведёт человека так, чтобы он дошёл к часу движка (±10 %) при ×1, ×3 и
  // ×12; не успевает и в полтора шага — опаздывает, но не бежит; обычный шаг — та скорость, с какой дорогу считает движок
  test('идёт к часу движка: доходит к сроку при ×1, ×3 и ×12; не успевает — идёт в полтора шага', async () => {
    const { layout, crowd } = await cityScene();
    const from = layout.plan.rooms.findIndex(r => r.type === 'room.reception');
    const to = layout.plan.rooms.findIndex(r => r.id === 'r28');
    const a = standAt(layout, doorInside(layout, from), 'wait', 0);
    const b = standAt(layout, doorInside(layout, to), 'wait', 0);
    for (const speed of [1, 3, 12]) {
      for (const k of [1.25, 0.5]) {
        crowd.speed = speed;
        crowd.rate = speed * GAME_PER_REAL;
        crowd.t = 0;
        const key = `t:${speed}:${k}`;
        const w = crowd.add(key, 0, a, true);
        crowd.retarget(w, b, true);
        // стоявший трогается в следующем кадре
        crowd.update(0);
        const len = w.cum![w.cum!.length - 1];
        // обычным шагом — столько игровых секунд; срок — в `k` раз больше
        const plain = len / WALK_SPEED_PC;
        w.due = plain * k;
        let at = NaN;
        for (let f = 0; f < 60 * 600 && Number.isNaN(at); f++) {
          crowd.update(1 / 60);
          crowd.t += crowd.rate / 60;
          if (w.state !== 'walk' && w.at?.key === b.key) at = crowd.t;
        }
        // успевает — к сроку; нет — в полтора шага
        const want = k * plain >= plain / PACE[1] ? k * plain : plain / PACE[1];
        expect(Math.abs(at - want) / want).toBeLessThan(0.1);
        crowd.remove(key);
      }
    }
    expect(WALK_SPEED_PC * GAME_PER_REAL).toBeCloseTo(1.6, 6);
  }, 180_000);
});

describe('темп покоя (spec docs/specs/2026-10-aaa-polish.md, «Жизнь»)', () => {
  test('у каждого — свой темп 0,85–1,15 по ключу, и покой идёт в нём: толпа не дышит в такт', async () => {
    const keys = Array.from({ length: 40 }, (_, i) => `p:${i * 7}`);
    const rates = keys.map(idleRate);
    for (const r of rates) {
      expect(r).toBeGreaterThanOrEqual(0.85);
      expect(r).toBeLessThanOrEqual(1.15);
    }
    expect(new Set(rates).size).toBeGreaterThan(10);
    expect(idleRate('p:12')).toBe(idleRate('p:12'));
    const { crowd, layout } = await cityScene();
    const cell = doorInside(layout, 0);
    const a = crowd.add('t:a', 0, standAt(layout, cell, 'wait', 0), true);
    const b = crowd.add('t:bb', 0, standAt(layout, cell + 1, 'wait', 0), true);
    expect(a.idle).toBe(idleRate('t:a'));
    const t0 = [a.clipTime, b.clipTime];
    crowd.speed = 1;
    crowd.rate = GAME_PER_REAL;
    crowd.update(0.5);
    expect(a.clipTime - t0[0]).toBeCloseTo(0.5 * a.idle, 9);
    expect(b.clipTime - t0[1]).toBeCloseTo(0.5 * b.idle, 9);
  });
});
