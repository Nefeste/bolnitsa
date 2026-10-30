// Сценарий 1 «Амбулатория», движок (spec docs/specs/2026-10-scenario-1.md, «Проверки»): ход сценария в потоке для ПК —
// касса и письма «в начале»; строят только помещения сценария; первые пришедшие сами — заданные больные, когда работает
// ваш кабинет; цели и письма по поводам — на планёрке в 08:00, каждое письмо — один раз; отметки окна (письмо к подсказке,
// прочитано, закрытая подсказка, «Без обучения») — в ходе сценария и в сохранении; те же команды — то же при любом шаге часов.
import { describe, expect, test } from 'bun:test';
import { db } from '../../src/content';
import { emptySite, hospitalOf } from '../../src/engine/hospital/site';
import { primaryOf } from '../../src/engine/med/plan';
import { apply, atDoctor, newFlowShift } from '../../src/engine/shift/engine';
import { SAVE_SCHEMA } from '../../src/engine/shift/migrate';
import type { ShiftPatient, ShiftState } from '../../src/engine/shift/types';
import type { Game } from '../../src/app/game';
import { goalRow, guideRows, initialsOf, letterRow, ScenarioDesk, scenarioTitle } from '../../src/app/scenario';
import { byGuide } from '../../src/ui/Scenario';
import { setLang } from '../../src/i18n';
import { scenarioView, type ScenarioView } from '../../src/sim/campaign';
import { useDb } from '../../src/sim/caseView';
import { cardView } from '../../src/sim/doctor';
import { cardTips, tipFits, type TipMoment } from '../../src/sim/tips';
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

  // демо (spec docs/specs/2026-11-demo.md, «Ощущение», О3): первый больной — через секунды после открытия, а не через случайный
  // промежуток потока (у амбулатории с одним кабинетом — около 20 минут игры)
  test('поток от больницы: первый заданный приходит через две минуты игры после того, как заработал ваш кабинет', () => {
    const s = newFlowShift(db, { seed: 6, season: 'winter', hospital: hospitalOf(db, emptySite()), staff: [], flow: { perHour: 0, auto: true }, scenario: SC });
    const t0 = s.t;
    buildClinic(s);
    // 08:06 — первый уже пришёл (и ещё не ушёл, не дождавшись: его ждут вы)
    liveTo(db, s, 8.1);
    const walk = Object.values(s.patients).filter(p => p.kind === 'walkIn');
    expect(walk.length).toBe(1);
    expect(walk[0].taught).toBe(true);
    expect(walk[0].arriveT - t0).toBe(120);
    // следующий — по частоте потока, не через две минуты
    const next = s.events.find(e => e.event.kind === 'flow' && e.event.stream === 'walk');
    expect(next).toBeDefined();
    expect(next!.t - walk[0].arriveT).not.toBe(120);
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

// часть 2в (решения владельца #114, #115): порядок стройки — шаги из записи, сделан ли — по больнице сейчас, выключить
// отметкой `guide`; в каталоге стройки шаги — первыми, по номеру
describe('сценарий 1 «Амбулатория»: порядок стройки', () => {
  const ORDER = ['room.reception', 'room.waiting', 'room.office', 'room.procedure', 'room.toilet', 'room.staff', 'room.lab', 'room.triage', 'room.ecg'];

  test('запись: девять шагов из того, что в сценарии строят, каждый — один раз, у каждого — «зачем» на двух языках', () => {
    expect(sc.guide.map(g => g.room)).toEqual(ORDER);
    for (const g of sc.guide) {
      expect(sc.build).toContain(g.room);
      expect(g.why.ru.length).toBeGreaterThan(0);
      expect(g.why.en?.length ?? 0).toBeGreaterThan(0);
    }
  });

  test('вид для окна: шаг сделан, когда помещение его типа работает; выключить и включить — отметкой, она в сохранении', async () => {
    const s = start(5);
    let v = scenarioView(db, s)!;
    expect(v.guide!.map(x => x.room)).toEqual(ORDER);
    expect(v.guide!.every(x => !x.done)).toBe(true);
    expect(v.guideOff).toBeUndefined();
    // амбулатория прототипа: регистратура, ожидание, ваш кабинет, ординаторская, процедурная, лаборатория — работают
    buildClinic(s);
    v = scenarioView(db, s)!;
    expect(v.guide!.filter(x => x.done).map(x => x.room)).toEqual(['room.reception', 'room.waiting', 'room.office', 'room.procedure', 'room.staff', 'room.lab']);
    apply(db, s, { kind: 'mark', what: 'guide', on: false });
    expect(scenarioView(db, s)!.guideOff).toBe(true);
    const saved = await unpack(await pack({ schema: SAVE_SCHEMA, meta: { kind: 'manual', savedAt: '2026-10-25T12:00:00.000Z', version: '0.24.0', start: 'empty', day: s.day, t: s.t }, state: s }));
    expect(scenarioView(db, saved.state)!.guideOff).toBe(true);
    apply(db, s, { kind: 'mark', what: 'guide', on: true });
    expect(scenarioView(db, s)!.guideOff).toBeUndefined();
  });

  test('строки окна: номер, имя и «зачем» на языке окна; следующий — первый несделанный; выключен — `on: false`', () => {
    setLang('ru');
    const steps = ORDER.map((room, i) => ({ room, done: i < 4 }));
    const rows = guideRows(db, sc, steps);
    expect(rows.map(r => r.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(rows.filter(r => r.next).map(r => r.type)).toEqual(['room.toilet']);
    expect(rows[0]).toMatchObject({ name: 'Регистратура', why: 'без неё никто не войдёт', done: true, next: false });
    setLang('en');
    expect(guideRows(db, sc, steps)[0].why).toBe('nobody gets in without it');
    setLang('ru');
    // всё построено — следующего нет
    expect(guideRows(db, sc, ORDER.map(room => ({ room, done: true }))).some(r => r.next)).toBe(false);
    const sent: unknown[] = [];
    const g = { db, client: { command: (c: unknown) => sent.push(c) }, refresh: () => {} } as unknown as Game;
    const desk = new ScenarioDesk(g);
    desk.onView({ id: SC, letters: [], goals: [], hints: [], tips: [], guide: steps });
    expect(desk.hud(false)!.guide!.on).toBe(true);
    desk.dispatch({ kind: 'guide', on: false });
    expect(sent).toEqual([{ kind: 'mark', what: 'guide', on: false }]);
    desk.onView({ id: SC, letters: [], goals: [], hints: [], tips: [], guide: steps, guideOff: true });
    expect(desk.hud(false)!.guide!.on).toBe(false);
    // у сценария без порядка в виде шагов нет — и в окне тоже
    desk.onView({ id: SC, letters: [], goals: [], hints: [], tips: [] });
    expect(desk.hud(false)!.guide).toBeUndefined();
  });

  test('каталог стройки: шаги порядка — первыми, по номеру, остальные — как были; выключен — как было', () => {
    setLang('ru');
    const rows = ['room.ecg', 'room.lab', 'room.office', 'room.reception', 'room.box'].map(id => ({ id }));
    const steps = guideRows(db, sc, ORDER.map(room => ({ room, done: room === 'room.reception' })));
    const hud = { guide: { on: true, steps } } as Parameters<typeof byGuide>[1];
    const out = byGuide(rows, hud);
    expect(out.map(x => x.row.id)).toEqual(['room.reception', 'room.office', 'room.lab', 'room.ecg', 'room.box']);
    expect(out.map(x => x.step?.n ?? 0)).toEqual([1, 3, 7, 9, 0]);
    expect(out[0].step!.done).toBe(true);
    const off = byGuide(rows, { guide: { on: false, steps } } as Parameters<typeof byGuide>[1]);
    expect(off.map(x => x.row.id)).toEqual(rows.map(r => r.id));
    expect(off.every(x => x.step === undefined)).toBe(true);
    expect(byGuide(rows, undefined).map(x => x.row.id)).toEqual(rows.map(r => r.id));
  });
});

// часть 2б: подсказки наставницы в карте больного — выбирает их поток расчёта (правда о больном — там), по одной, каждую — один
// раз за сценарий; о болезни — только у заданного больного; «Без обучения» — ни одной
describe('сценарий 1 «Амбулатория»: подсказки в карте', () => {
  useDb(db);
  /** Заданный больной с этой болезнью ждёт вас — позвать и дождаться, пока войдёт. */
  function callTaught(s: ShiftState, condition: string): ShiftPatient {
    let p: ShiftPatient | undefined;
    for (let i = 0; i < 24 * 60 && !p; i++) {
      apply(db, s, { kind: 'advance', seconds: 60 });
      p = Object.values(s.patients).find(x => x.taught && x.status === 'waiting' && primaryOf(x.patient).id === condition);
    }
    if (!p) throw new Error(`заданный больной ${condition} не пришёл`);
    apply(db, s, { kind: 'call', id: p.id });
    for (let i = 0; i < 3600 && s.meet !== undefined; i++) apply(db, s, { kind: 'advance', seconds: 5 });
    expect([s.current, s.meet]).toEqual([p.id, undefined]);
    return p;
  }
  /** Что ещё можно сделать у вас в кабинете этим видом: вопросы, осмотр. */
  const todo = (s: ShiftState, p: ShiftPatient, kind: string) => Object.values(db.exams).filter(e => e.kind === kind && !p.done.includes(e.id) && atDoctor(db, s, p, e.id));
  const tipsOf = (s: ShiftState, p: ShiftPatient) => cardView(db, s, p.id, 'student', 1)!.tips;
  const ids = (s: ShiftState, p: ShiftPatient) => {
    const t = tipsOf(s, p);
    return [t?.card?.id, t?.decide?.id, t?.review?.id];
  };

  test('запись: шесть подсказок наставницы по порядку, на двух языках; о болезни — у заданных больных; статьи — из базы', () => {
    expect(sc.tips.map(t => t.id)).toEqual(['start', 'examine', 'strep', 'decision', 'urine', 'review']);
    for (const t of sc.tips) {
      expect(t.from).toBe('char.tutor');
      for (const x of [t.name, t.text]) expect([x.ru.length > 0, (x.en?.length ?? 0) > 0]).toEqual([true, true]);
      if (typeof t.when === 'object') expect(sc.tutorial.map(x => x.condition)).toContain(t.when.condition);
      for (const id of t.see) expect(!!(db.exams[id] || db.conditions[id])).toBe(true);
    }
  });

  test('к месту: о болезни — только у заданного и после первого действия; расспрос — до вопросов, осмотр — после двух', () => {
    const at = (over: Partial<TipMoment>): TipMoment => ({
      screen: 'card', patient: 'p', condition: 'cond.strep_pharyngitis', taught: true, asked: 0, examined: 0, tested: 0, decided: false, ...over,
    });
    const tip = (id: string) => sc.tips.find(t => t.id === id)!;
    expect(tipFits(tip('strep'), at({ asked: 1 }))).toBe(true);
    // не заданный — подсказка о его болезни выдала бы диагноз
    expect(tipFits(tip('strep'), at({ asked: 1, taught: false }))).toBe(false);
    expect(tipFits(tip('strep'), at({}))).toBe(false);
    expect(tipFits(tip('strep'), at({ asked: 1, condition: 'cond.arvi' }))).toBe(false);
    expect(tipFits(tip('start'), at({}))).toBe(true);
    expect(tipFits(tip('start'), at({ asked: 1 }))).toBe(false);
    expect(tipFits(tip('examine'), at({ asked: 1 }))).toBe(false);
    expect(tipFits(tip('examine'), at({ asked: 2 }))).toBe(true);
    expect(tipFits(tip('examine'), at({ asked: 2, examined: 1 }))).toBe(false);
    expect(tipFits(tip('decision'), at({ screen: 'decision' }))).toBe(true);
    expect(tipFits(tip('decision'), at({}))).toBe(false);
    expect(tipFits(tip('review'), at({ screen: 'review', decided: true }))).toBe(true);
    expect(tipFits(tip('review'), at({ screen: 'review' }))).toBe(false);
  });

  test('приём заданных больных: расспрос, осмотр, «Решение», разбор, горло — по одной, каждая один раз; «Без обучения» — ни одной', () => {
    setLang('ru');
    const s = start(11);
    buildClinic(s);
    // первый — ОРВИ: карта открылась — «Сначала — расспрос», на «Решении» — своя
    const arvi = callTaught(s, 'cond.arvi');
    expect(ids(s, arvi)).toEqual(['start', 'decision', undefined]);
    expect(tipsOf(s, arvi)!.card).toMatchObject({ title: 'Сначала — расспрос', from: 'Мира Холм', see: [{ id: 'exam.ask_onset', name: db.exams['exam.ask_onset'].name.ru }] });
    mark(s, 'tip', 'start');
    expect(ids(s, arvi)).toEqual([undefined, 'decision', undefined]);
    // два вопроса — «Теперь — осмотр»; осмотрел — её место прошло
    const [q1, q2] = todo(s, arvi, 'ask');
    apply(db, s, { kind: 'exam', exam: q1.id });
    expect(tipsOf(s, arvi)?.card).toBeUndefined();
    apply(db, s, { kind: 'exam', exam: q2.id });
    expect(tipsOf(s, arvi)?.card?.id).toBe('examine');
    apply(db, s, { kind: 'exam', exam: todo(s, arvi, 'physical')[0].id });
    expect(tipsOf(s, arvi)?.card).toBeUndefined();
    mark(s, 'tip', 'decision');
    expect(tipsOf(s, arvi)).toBeUndefined();
    // «Завершить приём» — разбор
    apply(db, s, { kind: 'diagnose', id: 'cond.arvi' });
    apply(db, s, { kind: 'finish' });
    expect(arvi.closed).toBeDefined();
    expect(ids(s, arvi)).toEqual([undefined, undefined, 'review']);
    mark(s, 'tip', 'review');
    expect(tipsOf(s, arvi)).toBeUndefined();
    // второй — фарингит: расспрос уже показан; первый вопрос — «Горло и антибиотик», на английском — по-английски
    const strep = callTaught(s, 'cond.strep_pharyngitis');
    expect(tipsOf(s, strep)).toBeUndefined();
    apply(db, s, { kind: 'exam', exam: todo(s, strep, 'ask')[0].id });
    expect(tipsOf(s, strep)?.card?.id).toBe('strep');
    setLang('en');
    expect(tipsOf(s, strep)!.card).toMatchObject({ title: 'Sore throat and antibiotics', from: 'Mira Holm' });
    setLang('ru');
    // «Без обучения» — ни одной; снова обучение — снова есть
    apply(db, s, { kind: 'mark', what: 'off', on: true });
    expect(tipsOf(s, strep)).toBeUndefined();
    apply(db, s, { kind: 'mark', what: 'off', on: false });
    expect(tipsOf(s, strep)?.card?.id).toBe('strep');
    // не ваш больной и не сценарий — подсказок нет
    expect(cardTips(db, s, strep, false)).toBeUndefined();
    const plain = newFlowShift(db, { seed: 11, season: 'winter', hospital: hospitalOf(db, emptySite()), staff: [], flow: FLOW });
    expect(cardTips(db, plain, strep, true)).toBeUndefined();
  }, 180_000);

  test('окно: «Понятно» у подсказки — отметка `tip` движку', () => {
    const sent: unknown[] = [];
    const g = { db, client: { command: (c: unknown) => sent.push(c) }, refresh: () => {} } as unknown as Game;
    const desk = new ScenarioDesk(g);
    desk.dispatch({ kind: 'tip', id: 'start' });
    expect(sent).toEqual([]);
    desk.onView({ id: SC, letters: [], goals: [], hints: [], tips: [] });
    desk.dispatch({ kind: 'tip', id: 'start' });
    expect(sent).toEqual([{ kind: 'mark', what: 'tip', id: 'start' }]);
  });
});
