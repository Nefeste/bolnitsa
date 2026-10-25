// Сценарий 1 «Амбулатория», движок (spec docs/specs/2026-10-scenario-1.md, «Проверки»): ход сценария в потоке для ПК —
// касса и письма «в начале»; строят только помещения сценария; первые пришедшие сами — заданные больные, когда работает
// ваш кабинет; цели и письма по поводам — на планёрке в 08:00, каждое письмо — один раз; отметки окна (письмо к подсказке,
// прочитано, закрытая подсказка, «Без обучения») — в ходе сценария и в сохранении; те же команды — то же при любом шаге часов.
import { describe, expect, test } from 'bun:test';
import { db } from '../../src/content';
import { emptySite, hospitalOf } from '../../src/engine/hospital/site';
import { primaryOf } from '../../src/engine/med/plan';
import { apply, newFlowShift } from '../../src/engine/shift/engine';
import { SAVE_SCHEMA } from '../../src/engine/shift/migrate';
import type { ShiftState } from '../../src/engine/shift/types';
import type { Game } from '../../src/app/game';
import { goalRow, initialsOf, letterRow, ScenarioDesk, scenarioTitle } from '../../src/app/scenario';
import { setLang } from '../../src/i18n';
import { scenarioView, type ScenarioView } from '../../src/sim/campaign';
import { createSim } from '../../src/sim/host';
import { pack, unpack } from '../../src/sim/packing';
import { FLOW, hash, liveTo, PROTO, site } from './site-kit';

const SC = 'scenario.ambulatory';
const sc = db.scenarios![SC];

/** Сценарий 1 в пустом здании. */
const start = (seed = 1) => newFlowShift(db, { seed, season: 'winter', hospital: hospitalOf(db, emptySite()), staff: [], flow: FLOW, scenario: SC });

/**
 * Амбулатория из помещений прототипа (site-kit): кабинет врача — ваш («Мой кабинет»), без `mine` — с нанятым терапевтом;
 * на остальные должности — люди.
 */
function buildClinic(s: ShiftState, mine = true): string[] {
  const ids: string[] = [];
  for (const [type, x, y, w, h] of PROTO) {
    const id = site(db, s, { kind: 'room', type, x, y, w, h }).room!;
    ids.push(id);
    site(db, s, { kind: 'furnish', room: id });
    site(db, s, { kind: 'door', room: id, cells: [[x + Math.floor(w / 2), y + h - 1]] });
    if (mine && type === 'room.office') site(db, s, { kind: 'office', room: id });
    else for (const role of db.rooms[type].staff) site(db, s, { kind: 'hire', room: id, role });
  }
  site(db, s, { kind: 'done' });
  return ids;
}

/** Пришедшие сами с этой минуты до часа `hour` — по приходу: болезнь и заданный ли. */
function walkIns(s: ShiftState, hour: number): { truth: string; taught: boolean }[] {
  const from = s.t;
  const seen = new Map<string, { truth: string; taught: boolean; t: number }>();
  const end = (s.day - 1) * 86400 + hour * 3600;
  while (s.t < end) {
    apply(db, s, { kind: 'advance', seconds: Math.min(60, end - s.t) });
    for (const p of Object.values(s.patients)) {
      if (p.kind === 'walkIn' && p.arriveT >= from && !seen.has(p.id)) seen.set(p.id, { truth: primaryOf(p.patient).id, taught: !!p.taught, t: p.arriveT });
    }
  }
  return [...seen.values()].sort((a, b) => a.t - b.t).map(({ truth, taught }) => ({ truth, taught }));
}

const mark = (s: ShiftState, what: 'hint' | 'closed' | 'read' | 'tip', id: string) => apply(db, s, { kind: 'mark', what, id });
const letterIds = (s: ShiftState) => s.campaign!.letters.map(l => l.id);

describe('сценарий 1 «Амбулатория»: движок', () => {
  test('начало: ход сценария с письмами «в начале», касса и отделение сценария; без сценария хода нет', () => {
    const s = start();
    expect(s.campaign).toEqual({ chapter: SC, since: 0, done: {}, letters: [{ id: 'hello', day: 0 }, { id: 'budget', day: 0 }] });
    expect(s.economy!.cash).toBe(sc.budget);
    expect(s.meta.department).toBe(sc.department);
    const plain = newFlowShift(db, { seed: 1, season: 'winter', hospital: hospitalOf(db, emptySite()), staff: [], flow: FLOW, economy: { cash: 1000 } });
    expect(plain.campaign).toBeUndefined();
    expect(plain.economy!.cash).toBe(1000);
  });

  test('строят только помещения сценария: прочее — отказ «scenario», больница и касса те же', () => {
    const s = start(2);
    const before = hash({ hospital: s.hospital, cash: s.economy!.cash, works: s.works?.spent ?? 0 });
    const room = site(db, s, { kind: 'room', type: 'room.emergency', x: 6, y: 20, w: 9, h: 6 }, false);
    expect(room.ok).toBe(false);
    expect(room.error).toEqual({ kind: 'scenario' });
    const ready = site(db, s, { kind: 'ready', type: 'room.ward', size: 'S', x: 6, y: 20, rot: 0 }, false);
    expect(ready.error).toEqual({ kind: 'scenario' });
    expect(hash({ hospital: s.hospital, cash: s.economy!.cash, works: s.works?.spent ?? 0 })).toBe(before);
    for (const type of ['room.emergency', 'room.ward', 'room.xray', 'room.or']) expect(sc.build).not.toContain(type);
    expect(site(db, s, { kind: 'room', type: 'room.reception', x: 6, y: 6, w: 6, h: 7 }).ok).toBe(true);
  });

  test('первые пришедшие сами — заданные сценарием, по порядку; нанятые врачи их не зовут', () => {
    const s = start(3);
    buildClinic(s);
    const list = walkIns(s, 13);
    expect(list.length).toBeGreaterThan(sc.tutorial.length);
    expect(list.slice(0, sc.tutorial.length)).toEqual(sc.tutorial.map(x => ({ truth: x.condition, taught: true })));
    expect(list.slice(sc.tutorial.length).every(x => !x.taught)).toBe(true);
    expect(s.campaign!.taught).toBe(sc.tutorial.length);
    for (const p of Object.values(s.patients).filter(x => x.taught)) expect(p.by ?? p.doc).toBeUndefined();
  }, 120_000);

  test('без вашего кабинета заданных некому принять — приходят обычные, заданные ждут его', () => {
    const s = start(4);
    buildClinic(s, false);
    const before = walkIns(s, 11);
    expect(before.length).toBeGreaterThan(0);
    expect(before.some(x => x.taught)).toBe(false);
    expect(s.campaign!.taught).toBeUndefined();
    // свой кабинет напротив — «Мой кабинет»: с этой минуты заданные приходят первыми
    const office = site(db, s, { kind: 'room', type: 'room.office', x: 6, y: 20, w: 8, h: 7 }).room!;
    site(db, s, { kind: 'furnish', room: office });
    site(db, s, { kind: 'door', room: office, cells: [[10, 20]] });
    site(db, s, { kind: 'office', room: office });
    site(db, s, { kind: 'done' });
    const after = walkIns(s, 16);
    expect(after.slice(0, sc.tutorial.length)).toEqual(sc.tutorial.map(x => ({ truth: x.condition, taught: true })));
  }, 120_000);

  test('планёрка: цели и письма по поводам — по закрытым суткам, каждое письмо один раз', () => {
    const s = start(5);
    buildClinic(s);
    liveTo(db, s, 24 + 9);
    const day1 = s.history[0];
    expect(day1.campaign).toBeDefined();
    // лаборатория работает — цель выполнена в первые сутки, письмо о ней и письмо «после первых суток»
    expect(day1.campaign!.done).toContain('lab');
    expect(s.campaign!.done.lab).toBe(1);
    expect(day1.campaign!.letters).toEqual(['firstDay', 'labDone']);
    expect(s.campaign!.letters.filter(l => l.id === 'firstDay')).toEqual([{ id: 'firstDay', day: 1 }]);
    liveTo(db, s, 48 + 9);
    expect(s.history[1].campaign!.letters).not.toContain('firstDay');
    expect(s.history[1].campaign!.letters).not.toContain('labDone');
    expect(new Set(letterIds(s)).size).toBe(letterIds(s).length);
  }, 180_000);

  test('отметки окна: письмо к подсказке — одно и не при «Без обучения»; прочитано, закрытая подсказка, показанная подсказка', () => {
    const s = start(6);
    mark(s, 'hint', 'furnish');
    mark(s, 'hint', 'furnish');
    expect(letterIds(s)).toEqual(['hello', 'budget', 'furnish']);
    // у состояния без письма — ничего
    mark(s, 'hint', 'build');
    expect(letterIds(s)).toEqual(['hello', 'budget', 'furnish']);
    mark(s, 'read', 'hello');
    expect(s.campaign!.letters[0]).toEqual({ id: 'hello', day: 0, read: true });
    mark(s, 'closed', 'door');
    mark(s, 'closed', 'door');
    expect(s.campaign!.hints).toEqual(['door']);
    mark(s, 'tip', 'tip.x');
    expect(s.campaign!.tips).toEqual({ shown: ['tip.x'] });
    // «Без обучения»: писем к состояниям нет, а письма по поводам и цели остаются; снова — снова приходят
    apply(db, s, { kind: 'mark', what: 'off', on: true });
    mark(s, 'hint', 'hire');
    expect(letterIds(s)).not.toContain('hire');
    expect(s.campaign!.tips?.off).toBe(true);
    apply(db, s, { kind: 'mark', what: 'off', on: false });
    mark(s, 'hint', 'hire');
    expect(letterIds(s)).toContain('hire');
    // вне сценария — ничего
    const plain = newFlowShift(db, { seed: 6, season: 'winter', hospital: hospitalOf(db, emptySite()), staff: [], flow: FLOW });
    mark(plain, 'hint', 'furnish');
    expect(plain.campaign).toBeUndefined();
  });

  test('те же команды — тот же ход сценария при любом шаге часов; в сохранении он есть сам', async () => {
    const run = (step: number) => {
      const s = start(7);
      mark(s, 'hint', 'furnish');
      buildClinic(s);
      mark(s, 'hint', 'run');
      liveTo(db, s, 11, step);
      mark(s, 'hint', 'look');
      mark(s, 'read', 'budget');
      liveTo(db, s, 24 + 10, step);
      return s;
    };
    const a = run(60);
    const b = run(900);
    expect(hash({ c: a.campaign, h: a.history, gone: a.gone })).toBe(hash({ c: b.campaign, h: b.history, gone: b.gone }));
    expect(a.campaign!.taught).toBe(sc.tutorial.length);
    const back = (await unpack(await pack({ schema: SAVE_SCHEMA, meta: { kind: 'manual', savedAt: '2026-10-25T12:00:00.000Z', version: '0.22.0', start: 'empty', day: a.day, t: a.t }, state: a }))).state;
    expect(back.campaign).toEqual(a.campaign);
  }, 180_000);

  test('поток расчёта: начать сценарий сообщением `start`', () => {
    const sim = createSim(db);
    const out = sim.handle({ kind: 'start', seed: 8, season: 'winter', hospital: hospitalOf(db, emptySite()), staff: [], flow: FLOW, scenario: SC });
    expect(out.kind).toBe('slice');
    const saved = sim.handle({ kind: 'save' });
    if (saved.kind !== 'state') throw new Error(saved.kind);
    expect(saved.state.campaign?.chapter).toBe(SC);
    expect(saved.state.economy?.cash).toBe(sc.budget);
  });
});

describe('сценарий 1 «Амбулатория»: окно', () => {
  test('вид хода для окна: письма, цели с ходом, отметки; у песочницы — нет', () => {
    const s = start(9);
    let v = scenarioView(db, s)!;
    expect(v.id).toBe(SC);
    expect(v.letters.map(l => l.id)).toEqual(['hello', 'budget']);
    expect(v.goals.map(g => [g.id, g.main, g.done])).toEqual(sc.missions.map(m => [m.id, m.main, false]));
    expect(v.goals.find(g => g.id === 'seen')).toMatchObject({ value: 0, target: 100, accuracy: 0 });
    mark(s, 'closed', 'door');
    apply(db, s, { kind: 'mark', what: 'off', on: true });
    v = scenarioView(db, s)!;
    expect(v.hints).toEqual(['door']);
    expect(v.off).toBe(true);
    // лаборатория работает — цель «помещение работает» видна сразу, запишет её планёрка
    buildClinic(s);
    expect(scenarioView(db, s)!.goals.find(g => g.id === 'lab')!.done).toBe(true);
    const plain = newFlowShift(db, { seed: 9, season: 'winter', hospital: hospitalOf(db, emptySite()), staff: [], flow: FLOW });
    expect(scenarioView(db, plain)).toBeUndefined();
  });

  test('письмо и цель словами — на языке окна; значок — инициалы', () => {
    setLang('ru');
    expect(scenarioTitle(sc)).toBe('Сценарий 1. Амбулатория');
    const hello = letterRow(db, sc, { id: 'hello', day: 0 })!;
    expect(hello).toMatchObject({ from: 'Мира Холм', initials: 'МХ', read: false });
    expect(hello.text.startsWith('Здравствуйте, коллега.')).toBe(true);
    expect(letterRow(db, sc, { id: 'нет', day: 0 })).toBeUndefined();
    expect(goalRow(sc, { id: 'seen', main: true, value: 34, target: 100, accuracy: 81, done: false })).toMatchObject({ text: 'Принять 100 пациентов с точностью от 75 %', value: 34 });
    setLang('en');
    expect(scenarioTitle(sc)).toBe('Scenario 1. Outpatient clinic');
    expect(letterRow(db, sc, { id: 'budget', day: 0, read: true })).toMatchObject({ from: 'Jan Novak', initials: 'JN', read: true });
    setLang('ru');
    expect(initialsOf('Мира  Холм')).toBe('МХ');
  });

  test('окно сценария: карточка письма, отметки — по одному разу, «Сценарий пройден» — один раз и не после загрузки', () => {
    setLang('ru');
    const sent: unknown[] = [];
    const g = { db, client: { command: (c: unknown) => sent.push(c) }, refresh: () => {} } as unknown as Game;
    const view = (over: Partial<ScenarioView> = {}): ScenarioView => ({
      id: SC, letters: [{ id: 'hello', day: 0 }, { id: 'budget', day: 0 }], goals: [], hints: [], tips: [], ...over,
    });
    const desk = new ScenarioDesk(g);
    expect(desk.hud(false)).toBeUndefined();
    desk.onView(view());
    let h = desk.hud(false)!;
    expect(h.letter?.id).toBe('hello');
    expect(h.first).toBe(true);
    // пока открыта планёрка — карточки нет
    expect(desk.hud(true)!.letter).toBeUndefined();
    // прочитано — следующее письмо сразу, ещё до вида от потока; отметка — одна
    desk.dispatch({ kind: 'read', id: 'hello' });
    desk.dispatch({ kind: 'read', id: 'hello' });
    h = desk.hud(false)!;
    expect(h.letter?.id).toBe('budget');
    expect(h.first).toBe(false);
    // состояние подсказки — отметка одна; к уже пришедшему письму — ни одной
    desk.reach('furnish');
    desk.reach('furnish');
    expect(sent).toEqual([{ kind: 'mark', what: 'read', id: 'hello' }, { kind: 'mark', what: 'hint', id: 'furnish' }]);
    // все основные выполнены — «Сценарий пройден», «Продолжить здесь» закрывает, второй раз не открывается
    desk.onView(view({ complete: 3 }));
    expect(desk.hud(false)!.done).toBe(true);
    desk.dispatch({ kind: 'stay' });
    desk.onView(view({ complete: 3 }));
    expect(desk.hud(false)!.done).toBe(false);
    // сохранение после конца: окна нет; письма к состояниям, уже пришедшие, — состояния уже наступали
    const loaded = new ScenarioDesk(g);
    loaded.onView(view({ complete: 3, letters: [{ id: 'hello', day: 0, read: true }, { id: 'door', day: 1, read: true }] }));
    expect(loaded.hud(false)!.done).toBe(false);
    const before = sent.length;
    loaded.reach('door');
    expect(sent.length).toBe(before);
  });
});
