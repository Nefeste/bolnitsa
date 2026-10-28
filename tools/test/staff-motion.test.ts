// Персонал в движении (spec docs/specs/2026-10-staff-motion.md, часть 1) — только окно: за столом на посту — петля работы,
// на перерыве и в ожидании — покой сидя; сидящий на стуле или скамье изредка оглядывается, стоящий на посту — берёт бумаги,
// у каждого в свой срок; медсестра палаты обходит занятые койки своего помещения и уступает перевозке.
import { describe, expect, test } from 'bun:test';
import { db } from '../../src/content';
import { withNightShift } from '../../src/engine/hospital/staff';
import { GAME_PER_REAL } from '../../src/engine/shift/walking';
import { CLIP_NAMES } from '../../src/render/bake';
import { CATALOG, EXTRA_MODELS } from '../../src/render/catalog';
import { CLIPS, Crowd, GESTURE, GESTURE_FIRST, gestureGap, IDLE, loopPhase, PAPERS, SIT, SIT_LOOK, SIT_WORK } from '../../src/render/crowd';
import { furnish } from '../../src/render/furniture';
import { Paths } from '../../src/render/path';
import { bedSide, Places, type Spot } from '../../src/render/place';
import { Population, ROUND_EVERY, roundGap } from '../../src/render/population';
import { createSim } from '../../src/sim/host';
import { H } from '../../src/sim/pack';
import { bakedPeople, furnitureModels, presetLayout } from './render-kit';


/** Городская больница на отрисовке, как в tools/test/crowd.test.ts: раскладка, пути, толпа на ×12 и население, часы — 08:00. */
async function cityScene(shifts = false) {
  const { hospital, staff: base, layout } = presetLayout(db, 'preset.city');
  const staff = shifts ? withNightShift(db, hospital.rooms, base) : base;
  const names = [...new Set([...Object.values(CATALOG).flatMap(e => ('model' in e ? [e.model] : [])), ...EXTRA_MODELS])];
  const fur = furnish(layout, await furnitureModels(names));
  const walk = layout.walk.slice();
  for (const [x, y] of fur.decor) walk[y * layout.w + x] = 0;
  const open = new Uint8Array(layout.w * layout.h);
  for (let i = 0; i < open.length; i++) open[i] = layout.plan.grid.cells[i] === 1 || layout.plan.grid.cells[i] === 2 || layout.plan.grid.cells[i] === 4 ? 1 : 0;
  const people = await bakedPeople();
  const places = new Places(layout, fur);
  const crowd = new Crowd(layout, new Paths(layout.w, layout.h, walk, open), people.looks);
  crowd.speed = 12;
  crowd.rate = 12 * GAME_PER_REAL;
  const pop = new Population(db, layout, places, crowd, people.looks, staff, hospital.rooms);
  pop.setTime(8 * 3600);
  pop.placeStaff();
  return { hospital, staff, layout, places, crowd, pop, people };
}

/** Пустой срез на час `t`: в больнице никого, кроме штата. */
function slice(t: number) {
  const buf = new Int32Array(14);
  buf[H.t] = t;
  buf[H.count] = 0;
  return buf;
}

describe('персонал в движении: клипы', () => {
  test('номера клипов окна — как в запекании; новые клипы — у каждого вида, нужной длины', async () => {
    expect([...CLIPS]).toEqual(CLIP_NAMES);
    const p = await bakedPeople();
    for (const look of p.looks) {
      const { SitWork, SitLook, Papers } = look.clips;
      expect([look.name, SitWork.duration > 3.5 && SitWork.duration < 5]).toEqual([look.name, true]);
      expect([look.name, SitLook.duration > 3 && SitLook.duration < 5.5]).toEqual([look.name, true]);
      expect([look.name, Papers.duration > 5.5 && Papers.duration < 7]).toEqual([look.name, true]);
      for (const c of [SitWork, SitLook, Papers]) expect(c.fps).toBe(10);
    }
  });

  test('текстура костей — не больше чем на половину больше прежней: кадров на вид в среднем не больше 484', async () => {
    const p = await bakedPeople();
    // до части 1 — 322,6 кадра на вид (10,51 МБ текстуры); бюджет спецификации — +50 %
    expect(p.totalFrames / p.looks.length).toBeLessThanOrEqual(484);
  });
});

describe('персонал в движении: за столом и на перерыве', () => {
  test('штат за столами на посту — петля работы; стоящий на посту — «на посту», в операционной — без бумаг', async () => {
    const { staff, layout, crowd } = await cityScene();
    let desks = 0;
    for (const m of staff) {
      const w = crowd.walkers.get(`s:${m.id}`);
      if (!w?.at) continue;
      const type = layout.plan.rooms.find(r => r.id === m.room)!.type;
      if (w.state === 'sit') {
        // за столом — все, кто сидит на посту в больнице пресета: врачи, регистратор, медсестра доврачебного, рентгенологи
        expect([m.role, type, w.at.work, w.clip]).toEqual([m.role, type, 'desk', SIT_WORK]);
        desks++;
      } else expect([m.role, type, w.at.work]).toEqual([m.role, type, type === 'room.or' ? undefined : 'stand']);
    }
    expect(desks).toBeGreaterThan(5);
  });

  test('соседи за столами начинают петлю работы с разной доли, один и тот же человек — с той же', () => {
    const phases = Array.from({ length: 30 }, (_, i) => loopPhase(`s:${i}`));
    expect(new Set(phases.map(x => Math.round(x * 20))).size).toBeGreaterThan(10);
    expect(loopPhase('s:7')).toBe(loopPhase('s:7'));
  });

  test('на перерыве в ординаторской — покой сидя, не работа; вернулся за стол — снова работа', async () => {
    const { staff, layout, crowd, pop } = await cityScene(true);
    const m = staff.find(x => x.shift === 'day' && db.roles[x.role]?.stands === 'role.doctor' && !db.roles[x.role]?.profile)!;
    const w = crowd.walkers.get(`s:${m.id}`)!;
    expect(w.clip).toBe(SIT_WORK);
    const staffRoom = layout.plan.rooms.find(r => r.type === 'room.staff')!;
    const t0 = 13 * 3600;
    pop.setCrew([{ id: m.id, f: 70, rest: { kind: 'staff', room: staffRoom.id, from: t0, at: t0 + 300, back: t0 + 1500, until: t0 + 1800 } }]);
    crowd.t = t0 + 10;
    pop.sync(slice(t0 + 10), []);
    for (let f = 0; f < 60 * 60 && (w.goals.length > 0 || w.state !== 'sit'); f++) crowd.update(1 / 60);
    expect(w.state).toBe('sit');
    expect(w.at?.work).toBeUndefined();
    expect([SIT, SIT_LOOK]).toContain(w.clip);
    crowd.t = t0 + 1500;
    pop.sync(slice(t0 + 1500), []);
    for (let f = 0; f < 60 * 60 && (w.goals.length > 0 || w.state !== 'sit'); f++) crowd.update(1 / 60);
    expect(w.at?.work).toBe('desk');
    expect(w.clip).toBe(SIT_WORK);
  }, 180_000);
});

describe('персонал в движении: жесты', () => {
  test('сроки жестов — от ключа и номера: в пределах, разные у соседей, первый — вскоре, как сел', () => {
    const keys = Array.from({ length: 40 }, (_, i) => `p:${i * 3}`);
    const first = keys.map(k => gestureGap(k, 0));
    for (const g of first) {
      expect(g).toBeGreaterThanOrEqual(GESTURE_FIRST[0]);
      expect(g).toBeLessThan(GESTURE_FIRST[1]);
    }
    for (const k of keys) {
      for (let n = 1; n < 6; n++) {
        expect(gestureGap(k, n)).toBeGreaterThanOrEqual(GESTURE[0]);
        expect(gestureGap(k, n)).toBeLessThan(GESTURE[1]);
      }
    }
    // соседи не в такт: первые жесты 40 человек — больше чем в 30 разных десятых долях секунды, в одну — не больше трёх
    const at = new Map<number, number>();
    for (const g of first) at.set(Math.round(g * 10), (at.get(Math.round(g * 10)) ?? 0) + 1);
    expect(at.size).toBeGreaterThan(30);
    expect(Math.max(...at.values())).toBeLessThanOrEqual(3);
    expect(gestureGap('p:3', 2)).toBe(gestureGap('p:3', 2));
  });

  test('сидящий ждёт — оглядывается и возвращается в покой; стоящий на посту — бумаги; в паузе жестов нет', async () => {
    const { layout, places, crowd, staff } = await cityScene();
    // пациент на стуле зала ожидания: место — как у ждущих в срезе
    const hall = layout.plan.rooms.findIndex(r => r.type === 'room.waiting');
    places.sync([{ key: 'p:1', room: hall }], []);
    const seat = places.spot({ key: 'p:1', doing: 'waiting', room: hall, bed: -1 }, new Set());
    expect(seat.pose).toBe('sit');
    const p = crowd.add('p:1', 0, seat, false);
    crowd.settle(p, seat);
    const lab = staff.find(m => m.role === 'role.lab_tech')!;
    const s = crowd.walkers.get(`s:${lab.id}`)!;
    expect(s.at?.work).toBe('stand');
    // пауза: часы не идут — никто не начинает жест
    crowd.speed = 0;
    crowd.rate = 0;
    for (let f = 0; f < 60 * 60; f++) crowd.update(0);
    expect(p.clip).toBe(SIT);
    expect(s.clip).toBe(IDLE);
    crowd.speed = 1;
    crowd.rate = GAME_PER_REAL;
    const seen = { look: false, papers: false, back: false };
    for (let f = 0; f < 60 * 120; f++) {
      crowd.update(1 / 60);
      if (p.clip === SIT_LOOK) seen.look = true;
      if (seen.look && p.clip === SIT && !p.once) seen.back = true;
      if (s.clip === PAPERS) seen.papers = true;
    }
    expect(seen).toEqual({ look: true, papers: true, back: true });
    // жестов за две минуты — 3–5: первый — через 2–15 с, дальше раз в 20–40 с и сам жест — около 5 с
    expect(p.gestures).toBeGreaterThanOrEqual(3);
    expect(p.gestures).toBeLessThanOrEqual(5);
  }, 180_000);
});

describe('персонал в движении: обход медсестры', () => {
  test('у койки — свободная клетка у изголовья, лицом к лежащему', async () => {
    const { layout, places } = await cityScene();
    const ward = layout.plan.rooms.findIndex(r => r.type === 'room.ward');
    const bed = places.spot({ key: 'p:9', doing: 'ward', room: ward, bed: 0 }, new Set());
    expect(bed.pose).toBe('lie');
    const side = bedSide(layout, bed, 6, new Set())!;
    expect(side).toMatchObject({ pose: 'stand', kind: 'act', dwell: 6, work: 'bed' });
    expect(layout.walk[side.cell]).toBe(1);
    // ближе к изголовью, чем к ногам
    const head = { x: bed.x - Math.sin(bed.yaw) * 0.6, z: bed.z - Math.cos(bed.yaw) * 0.6 };
    const feet = { x: bed.x + Math.sin(bed.yaw) * 0.6, z: bed.z + Math.cos(bed.yaw) * 0.6 };
    expect(Math.hypot(side.x - head.x, side.z - head.z)).toBeLessThan(Math.hypot(side.x - feet.x, side.z - feet.z));
    // смотрит на лежащего: к середине между изголовьем и серединой постели — не дальше 10°
    const to = Math.atan2((head.x + bed.x) / 2 - side.x, (head.z + bed.z) / 2 - side.z);
    expect(Math.abs(Math.atan2(Math.sin(side.yaw - to), Math.cos(side.yaw - to)))).toBeLessThan(0.18);
  });

  test('сроки обходов — 1–1,5 часа игры, у медсестёр не разом', () => {
    for (let n = 1; n < 8; n++) {
      expect(roundGap('m:1', n)).toBeGreaterThanOrEqual(ROUND_EVERY[0]);
      expect(roundGap('m:1', n)).toBeLessThan(ROUND_EVERY[1]);
    }
    const first = Array.from({ length: 12 }, (_, i) => Math.round(roundGap(`m:${i}`, 0) / 60));
    expect(new Set(first).size).toBeGreaterThan(8);
  });

  test('медсестра палаты обходит занятые койки своей палаты — у каждой бумаги — и возвращается на пост; перевозка прерывает обход', async () => {
    const { hospital, staff, layout, crowd, pop } = await cityScene(true);
    const sim = createSim(db);
    const first = sim.handle({ kind: 'start', seed: 5, season: 'winter', hospital, staff, flow: { perHour: 6, ambulancePerHour: 2 } });
    if (first.kind !== 'slice') throw new Error(first.kind);
    crowd.speed = 12;
    crowd.rate = 12 * GAME_PER_REAL;
    const nurses = staff.filter(m => m.role === 'role.nurse' && m.shift === 'day' && layout.plan.rooms.find(r => r.id === m.room)?.type === 'room.ward');
    expect(nurses.length).toBeGreaterThan(0);
    const keys = new Set(nurses.map(m => `s:${m.id}`));
    const posts = new Map(nurses.map(m => [`s:${m.id}`, crowd.walkers.get(`s:${m.id}`)!.at!.key]));
    // за кем следим: была у койки (бумаги в руках) и вернулась на пост; у койки — только своей палаты
    const visited = new Map<string, Spot[]>();
    let back = 0;
    // 6 часов на ×12: 4 игровые секунды на кадр
    for (let f = 0; f < (6 * 3600) / 4; f++) {
      const r = sim.handle({ kind: 'tick', seconds: 4, budgetMs: 50 });
      if (r.kind !== 'slice') throw new Error(r.kind === 'error' ? r.message : r.kind);
      crowd.t = r.buf[H.t];
      pop.sync(r.buf, r.names);
      crowd.update(1 / 60);
      for (const k of keys) {
        const w = crowd.walkers.get(k);
        if (!w?.at) continue;
        if (w.at.work === 'bed' && w.state === 'idle') {
          const list = visited.get(k) ?? [];
          if (!list.some(s => s.key === w.at!.key)) list.push(w.at);
          visited.set(k, list);
          expect(w.clip === PAPERS || w.clip === IDLE).toBe(true);
        }
        if (visited.has(k) && w.at.key === posts.get(k) && w.goals.length === 0) back++;
      }
    }
    expect(visited.size).toBeGreaterThan(0);
    for (const [k, list] of visited) {
      const m = nurses.find(x => `s:${x.id}` === k)!;
      const room = layout.plan.rooms.find(r => r.id === m.room)!;
      for (const s of list) {
        const x = s.cell % layout.w;
        const y = (s.cell / layout.w) | 0;
        expect(x >= room.x && x < room.x + room.w && y >= room.y && y < room.y + room.h).toBe(true);
      }
    }
    expect(back).toBeGreaterThan(0);

    // перевозка поверх обхода: медсестру ставят везти — её путь меняет перевозка, обход забыт; кончилась — на пост
    const m = nurses[0];
    const w = crowd.walkers.get(`s:${m.id}`)!;
    const t = crowd.t;
    const beds = [...crowd.walkers.entries()].filter(([k, p]) => k.startsWith('p:') && p.state === 'lie' && p.at?.bed);
    expect(beds.length).toBeGreaterThan(0);
    {
      (pop as unknown as { rounds: Map<string, string> }).rounds.set(m.id, posts.get(`s:${m.id}`)!);
      const [pk] = beds[0];
      const id = pop.now(pk)!.row.id;
      const to = layout.plan.rooms.find(r => r.type === 'room.or')!.id;
      pop.setRides([{ id, by: m.id, why: 'op', since: t, from: m.room!, to, go: t, pick: t + 60, off: t + 120, drop: t + 200, done: t + 400, home: t + 500 }]);
      pop.sync(slice(t + 10), []);
      expect((pop as unknown as { rounds: Map<string, string> }).rounds.has(m.id)).toBe(false);
      expect(w.goals.length).toBeGreaterThan(0);
      expect(w.goals.every(g => g.work !== 'bed')).toBe(true);
    }
  }, 300_000);
});
