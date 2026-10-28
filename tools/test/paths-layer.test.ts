// Слой «Пути пациентов» в окне (spec docs/specs/2026-10-layers.md, часть 2): концы переходов у дверей и входов, тепло
// клеток по путям, цвет пола, строки списка — где за сутки прошли больше всего метров. Чистые функции src/app/paths.ts —
// без DOM и Three.js; пути — тот же поиск, что ведёт людей (src/render/path.ts), на плане городской больницы.
import { afterAll, describe, expect, test } from 'bun:test';
import { endsOf, heatColor, heatOf, heatPixels, legRows, lengthOf, MAX_LEGS } from '../../src/app/paths';
import { db } from '../../src/content';
import { planOf } from '../../src/engine/hospital/build';
import { emptySite, hospitalOf } from '../../src/engine/hospital/site';
import { siteOfPreset } from '../../src/engine/hospital/site-preset';
import { presetStaff } from '../../src/engine/hospital/staff';
import { setLang } from '../../src/i18n';
import { layoutOf } from '../../src/render/layout';
import { Paths } from '../../src/render/path';
import { AMBULANCE, type Leg, STREET } from '../../src/sim/legs';
import { staffCells } from './render-kit';

setLang('ru');
afterAll(() => setLang('ru'));
const leg = (from: string, to: string, n: number, walk = 0, walked = 0): Leg => ({ from, to, n, walk, walked });

describe('тепло', () => {
  // ряд из 10 клеток: помещение a — у клетки 1, b — у 5, c — у 8; путь — клетки подряд
  const doors: Record<string, number> = { a: 1, b: 5, c: 8 };
  const door = (room: string) => doors[room] ?? -1;
  let searches = 0;
  const line = (a: number, b: number) => {
    searches++;
    const out: number[] = [];
    for (let i = a; i !== b; i += Math.sign(b - a)) out.push(i);
    out.push(b);
    return Int32Array.from(out);
  };

  test('клетка — сколько раз прошли через неё; путь пары ищется раз; нет конца — пути нет', () => {
    const routes = new Map<string, Int32Array | null>();
    const legs = [leg('a', 'b', 3), leg('b', 'c', 2), leg('a', 'x', 7)];
    const { heat, max } = heatOf(legs, 10, door, line, routes);
    expect(Array.from(heat)).toEqual([0, 3, 3, 3, 3, 5, 2, 2, 2, 0]);
    expect(max).toBe(5);
    expect(searches).toBe(2);
    expect(routes.get('a>x')).toBeNull();
    heatOf(legs, 10, door, line, routes);
    expect(searches).toBe(2);
  });

  test('выбрана строка — на полу только она, а пути ищутся для всех (список знает их длину)', () => {
    const routes = new Map<string, Int32Array | null>();
    searches = 0;
    const { heat, max } = heatOf([leg('a', 'b', 3), leg('b', 'c', 2)], 10, door, line, routes, 'b>c');
    expect(Array.from(heat)).toEqual([0, 0, 0, 0, 0, 2, 2, 2, 2, 0]);
    expect(max).toBe(2);
    expect(searches).toBe(2);
    expect(lengthOf(routes, 'a>b')).toBe(4);
    expect(lengthOf(routes, 'b>c')).toBe(3);
    expect(lengthOf(routes, 'a>x')).toBeUndefined();
  });

  test('цвет: нет проходов — прозрачно; редкие — голубые, средние — жёлтые, частые — красные и гуще', () => {
    expect(heatColor(0)).toEqual([0, 0, 0, 0]);
    expect(heatColor(0.01).slice(0, 3)).toEqual([50, 197, 225]);
    expect(heatColor(0.5)).toEqual([0xff, 0xc4, 0x00, 170]);
    expect(heatColor(1)).toEqual([0xff, 0x2a, 0x12, 230]);
    expect(heatColor(7)).toEqual(heatColor(1));
    for (let i = 1; i < 10; i++) expect(heatColor((i + 1) / 10)[3]).toBeGreaterThan(heatColor(i / 10)[3]);
  });

  test('текстура: клетка — тексел, по корню доли (и редкое видно); окрашенных — сколько клеток с проходами', () => {
    const heat = Float32Array.from([0, 4, 1, 0, 16]);
    const { rgba, lit } = heatPixels(heat, 16);
    expect(lit).toBe(3);
    expect(Array.from(rgba.slice(0, 4))).toEqual([0, 0, 0, 0]);
    expect(Array.from(rgba.slice(4, 8))).toEqual(heatColor(0.5));
    expect(Array.from(rgba.slice(8, 12))).toEqual(heatColor(0.25));
    expect(Array.from(rgba.slice(16, 20))).toEqual(heatColor(1));
    expect(heatPixels(new Float32Array(5), 0)).toEqual({ rgba: new Uint8Array(20), lit: 0 });
  });
});

describe('список', () => {
  const names: Record<string, string> = { rec: 'Регистратура', o1: 'Кабинет врача', lab: 'Лаборатория', er: 'Смотровая скорой' };
  const name = (room: string) => names[room] ?? room;
  const lengths: Record<string, number> = { '>rec': 12, 'rec>o1': 30, 'o1>lab': 40, 'lab>o1': 40, 'o1>': 45, '*>er': 6 };
  const length = (key: string) => lengths[key];

  test('сверху — где прошли больше всего метров: часто и далеко; входы и выход — словами; в пути — среднее у известных', () => {
    const legs = [leg(STREET, 'rec', 23), leg('rec', 'o1', 23), leg('o1', 'lab', 1, 100, 1), leg('lab', 'o1', 4, 280, 2), leg(AMBULANCE, 'er', 2), leg('o1', 'w9', 50)];
    const r = legRows(legs, name, length);
    expect(r.rows.map(x => x.text)).toEqual([
      'Регистратура → Кабинет врача — 23 раза по 30 м',
      'Вход → Регистратура — 23 раза по 12 м',
      'Лаборатория → Кабинет врача — 4 раза по 40 м · в пути 2 мин 20 с',
      'Кабинет врача → Лаборатория — 1 раз по 40 м · в пути 1 мин 40 с',
      'Вход для скорой → Смотровая скорой — 2 раза по 6 м',
      // пути нет — метров не знаем: внизу, хоть и чаще всех
      'Кабинет врача → w9 — 50 раз',
    ]);
    expect(r.rows.map(x => x.m)).toEqual([690, 276, 160, 40, 12, 0]);
    expect(r.total).toBe(23 + 23 + 1 + 4 + 2 + 50);
    expect(r.meters).toBe(690 + 276 + 160 + 40 + 12);
    expect(r.more).toBe(0);
    expect(legRows([leg('o1', STREET, 5)], name, length).rows[0].text).toBe('Кабинет врача → Выход — 5 раз по 45 м');
    expect(legRows([], name, length)).toEqual({ rows: [], total: 0, meters: 0, more: 0 });
  });

  test(`строк — не больше ${MAX_LEGS}, дальше «ещё N»; равные — по числу раз, потом по ключу`, () => {
    const legs = Array.from({ length: MAX_LEGS + 3 }, (_, i) => leg(`r${i}`, `q${i}`, 1 + (i % 2)));
    const r = legRows(legs, name, () => 10);
    expect(r.rows.length).toBe(MAX_LEGS);
    expect(r.more).toBe(3);
    expect(r.rows.map(x => x.key)).toEqual(['r1>q1', 'r3>q3', 'r5>q5', 'r7>q7', 'r0>q0', 'r2>q2']);
  });

  test('время в пути: секунды, минуты с секундами, ровные минуты', () => {
    const t = (walk: number) => legRows([leg('a', 'b', 1, walk, 1)], name, () => 1).rows[0].text;
    expect(t(42)).toBe('a → b — 1 раз по 1 м · в пути 42 с');
    expect(t(119.6)).toBe('a → b — 1 раз по 1 м · в пути 2 мин');
    expect(t(61)).toBe('a → b — 1 раз по 1 м · в пути 1 мин 1 с');
  });

  test('по-английски', () => {
    setLang('en');
    const en: Record<string, string> = { rec: 'Reception', o1: 'Office', lab: 'Lab' };
    const len: Record<string, number> = { '>rec': 12, 'o1>lab': 40 };
    const r = legRows([leg(STREET, 'rec', 1), leg('o1', 'lab', 3, 300, 3)], room => en[room] ?? room, k => len[k]);
    expect(r.rows.map(x => x.text)).toEqual(['Office → Lab — 3 times, 40 m · walk 1 min 40 s', 'Entrance → Reception — 1 time, 12 m']);
    setLang('ru');
  });
});

describe('концы переходов на плане городской больницы', () => {
  // город игры — участок с двумя входами, как в окне (src/engine/hospital/site-preset.ts)
  const city = db.presets['preset.city'];
  const hospital = hospitalOf(db, siteOfPreset(db, city));
  const plan = planOf(db, hospital);
  const layout = layoutOf(db, plan, hospital.decor, staffCells(plan, presetStaff(db, city), db));
  const open = new Uint8Array(layout.walk.length);
  for (let i = 0; i < open.length; i++) open[i] = layout.plan.grid.cells[i] === 1 || layout.plan.grid.cells[i] === 2 || layout.plan.grid.cells[i] === 4 ? 1 : 0;
  const paths = new Paths(layout.w, layout.h, layout.walk, open);
  const ends = endsOf(layout, layout.walk, c => paths.nearest(c));
  const rooms = layout.plan.rooms.filter(r => r.door.length > 0);

  test('у каждого помещения с дверью и у обоих входов — проходимая клетка снаружи', () => {
    expect(rooms.length).toBeGreaterThan(10);
    for (const r of rooms) {
      const c = ends.get(r.id);
      expect(c).toBeGreaterThanOrEqual(0);
      expect(layout.walk[c!]).toBe(1);
    }
    for (const k of [STREET, AMBULANCE]) expect(layout.walk[ends.get(k)!]).toBe(1);
    // у города вход один — скорая заезжает в него же
    expect(plan.entrances!.map(e => e.kind)).toEqual(['main']);
    expect(ends.get(AMBULANCE)).toBe(ends.get(STREET));
  });

  test('пустое здание: два входа — у скорой свой, клетка — середина проёма', () => {
    const empty = hospitalOf(db, emptySite());
    const ep = planOf(db, empty);
    const el = layoutOf(db, ep, empty.decor, []);
    const e = endsOf(el, el.walk, () => -1);
    const mid = (kind: 'main' | 'ambulance') => {
      const cells = ep.entrances!.find(x => x.kind === kind)!.cells;
      const [x, y] = cells[cells.length >> 1];
      return y * el.w + x;
    };
    expect(e.get(STREET)).toBe(mid('main'));
    expect(e.get(AMBULANCE)).toBe(mid('ambulance'));
    expect(e.get(AMBULANCE)).not.toBe(e.get(STREET));
  });

  test('от входа — путь к двери каждого помещения, до которого можно дойти; путь — клетки подряд по проходимым', () => {
    const from = ends.get(STREET)!;
    let found = 0;
    for (const r of rooms) {
      if (!layout.plan.connected[r.id]) continue;
      const cells = paths.find(from, ends.get(r.id)!);
      expect(cells).not.toBeNull();
      found++;
      for (let i = 1; i < cells!.length; i++) {
        const a = cells![i - 1];
        const b = cells![i];
        expect(Math.abs((a % layout.w) - (b % layout.w)) + Math.abs(Math.floor(a / layout.w) - Math.floor(b / layout.w))).toBe(1);
        expect(layout.walk[b]).toBe(1);
      }
    }
    expect(found).toBeGreaterThan(10);
  });
});
