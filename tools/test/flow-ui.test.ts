// Часть 3 в окне (spec docs/specs/2026-10-flow-ui.md): строки пути пациента из пути движка (причины, длительности, «ушёл»),
// нагрузка и состояние помещений, цвет пола слоя очередей, строки и фильтры вкладки «Пациенты», значки настроения.
// Чистые функции src/app/flow.ts — без DOM и Three.js; строки — русские (язык по умолчанию).
import { describe, expect, test } from 'bun:test';
import {
  chipShown, dur, LONG_WAIT, moodOf, NO_FILTER, pathCard, type PathNames, patientRows, rideLine, roomChip, roomLoads, type Seen, tintOf, UNHAPPY, WAIT_BAD, WAIT_OK, wheelLine,
} from '../../src/app/flow';
import { slowOf } from '../../src/app/money';
import type { Plan } from '../../src/engine/hospital/build';
import type { Journey } from '../../src/engine/shift/journey';
import { setLang, T } from '../../src/i18n';

setLang('ru');
const H = (h: number, m = 0) => h * 3600 + m * 60;
const names: PathNames = {
  doctor: id => (id === 's1' ? 'терапевта' : 'врача'),
  dat: id => (id === 's2' ? 'гастроэнтерологу' : 'врачу'),
  who: id => (id === 's1' ? 'Терапевт' : 'Врач'),
  exam: id => (id === 'exam.xray' ? { name: 'Рентгенография', kind: 'imaging' } : { name: 'Общий анализ крови', kind: 'lab' }),
  role: id => (id === 'role.radiographer' ? 'Рентгенолаборант' : 'Медсестра'),
  room: id => (id === 'r2' ? 'смотровая приёмного' : 'палата'),
  nextShift: t => (Math.floor(t / 86400) * 86400 + 20 * 3600 > t ? Math.floor(t / 86400) * 86400 + 20 * 3600 : Math.floor(t / 86400) * 86400 + 32 * 3600),
};

describe('путь пациента в карточке', () => {
  test('лента: час — что — сколько — почему; итог — сколько был в больнице и сколько ждал', () => {
    const j: Journey = {
      kind: 'walkIn', at: H(10, 3),
      steps: [
        { t: H(10, 3), k: 'queue', why: 'busy', ahead: 4, docs: 3, asks: 1 },
        { t: H(10, 15), k: 'doctor', by: 's1', room: 'r5' },
        { t: H(10, 33), k: 'exam', exam: 'exam.xray', room: 'r9', at: H(10, 34), start: H(10, 48), end: H(10, 58), back: H(10, 59), ready: H(11, 10) },
        { t: H(11, 10), k: 'own', by: 's1' },
        { t: H(11, 15), k: 'doctor', by: 's1', room: 'r5' },
      ],
      end: { t: H(11, 24), how: 'home', setting: 'home' },
    };
    const c = pathCard(j, false, H(12), names);
    expect(c.lines.map(l => [l.at, l.text])).toEqual([
      ['10:03', 'пришёл сам'],
      ['10:03', 'ожидание врача — 12 мин'],
      ['10:15', 'у терапевта — 18 мин'],
      ['10:33', 'Рентгенография: дорога 1 мин, очередь 14 мин, процедура 10 мин, обратно 1 мин'],
      ['10:59', 'у терапевта — 11 мин'],
      ['11:10', 'ожидание своего врача — 5 мин'],
      ['11:15', 'у терапевта — 9 мин'],
      ['11:24', 'отпущен домой'],
    ]);
    expect(c.lines[1].why).toBe('все нанятые врачи заняты (3, 1 из них ждут вашего ответа), впереди 4');
    expect(c.lines[3].why).toBe('кабинет был занят до 10:48');
    expect(c.lines[5].why).toBe('врач принимает другого больного');
    expect(c.lines.some(l => l.now)).toBe(false);
    // ждал: врача 12, у рентгена 14, своего врача 5 — из 81 минуты
    expect(c.summary).toBe('в больнице 1 ч 21 мин, из них ждал 31 мин (38 %)');
    expect(c.left).toBeUndefined();
  });

  // spec docs/specs/2026-10-staff-shifts.md, часть 2: врач ушёл на перерыв — ждут его; рентгенолаборант на перерыве — ждут у
  // кабинета, пока вернётся
  test('перерывы: «врач на перерыве до …», «врач в туалете», «рентгенолаборант на перерыве — начали в …»', () => {
    const j: Journey = {
      kind: 'walkIn', at: H(13),
      steps: [
        { t: H(13), k: 'queue', why: 'busy', ahead: 1, docs: 1 },
        { t: H(13, 5), k: 'rest', by: 's1', until: H(13, 41) },
        { t: H(13, 45), k: 'doctor', by: 's1', room: 'r5' },
        { t: H(13, 50), k: 'exam', exam: 'exam.xray', room: 'r9', at: H(13, 52), start: H(14, 20), end: H(14, 30), back: H(14, 32), ready: H(14, 40), rest: 'role.radiographer' },
        { t: H(14, 32), k: 'rest', by: 's1', until: H(14, 40), wc: true },
      ],
    };
    const c = pathCard(j, false, H(14, 45), names);
    const rest = c.lines.find(l => l.at === '13:05')!;
    expect(rest).toMatchObject({ text: 'ожидание своего врача — 40 мин', why: 'врач на перерыве до 13:41', kind: 'wait' });
    expect(c.lines.find(l => l.at === '13:50')!.why).toBe('рентгенолаборант на перерыве — начали в 14:20');
    expect(c.lines.find(l => l.at === '14:32')!).toMatchObject({ why: 'врач в туалете — вернётся к 14:40', now: true });
  });

  test('ушла, не дождавшись: почему — первой строкой; ждала ровно своё терпение', () => {
    const j: Journey = { kind: 'walkIn', at: H(10), steps: [{ t: H(10), k: 'queue', why: 'busy', ahead: 2, docs: 1 }], end: { t: H(11, 10), how: 'left', patience: 70 * 60 } };
    const c = pathCard(j, true, H(12), names);
    expect(c.lines[0].text).toBe('пришла сама');
    expect(c.left).toBe('ушла, не дождавшись: ждала врача 1 ч 10 мин, готова была ждать 1 ч 10 мин — все нанятые врачи заняты (1), впереди 2');
    expect(c.lines[c.lines.length - 1]).toMatchObject({ at: '11:10', kind: 'end', text: 'ушла, не дождавшись', why: 'терпение кончилось: готова была ждать 1 ч 10 мин' });
    // и в мужском роде
    expect(pathCard(j, false, H(12), names).left).toBe('ушёл, не дождавшись: ждал врача 1 ч 10 мин, готов был ждать 1 ч 10 мин — все нанятые врачи заняты (1), впереди 2');
    expect(c.summary).toBe('в больнице 1 ч 10 мин, из них ждала 1 ч 10 мин (100 %)');
  });

  test('идущий шаг — до сейчас; ожидание без минуты не показывается; ждёт вас, у входа, стоя', () => {
    const j: Journey = {
      kind: 'ambulance', at: H(9),
      steps: [
        { t: H(9), k: 'queue', why: 'you', ahead: 0, door: true },
        { t: H(9, 30), k: 'doctor' },
        { t: H(9, 40), k: 'queue', why: 'busy', ahead: 0, docs: 2, full: true },
      ],
    };
    const c = pathCard(j, false, H(10, 5), names);
    expect(c.lines[0]).toMatchObject({ text: 'привезла скорая', why: 'мест в смотровой не было — сначала у входа' });
    expect(c.lines[1].why).toBe('ждёт вас');
    expect(c.lines[2].text).toBe('у вас — 10 мин');
    expect(c.lines[3]).toMatchObject({ text: 'ожидание врача — 25 мин', now: true });
    expect(c.lines[3].why).toContain('стоя');
    // позвали через полминуты — строки ожидания нет
    const quick: Journey = { kind: 'walkIn', at: H(9), steps: [{ t: H(9), k: 'queue', why: 'busy', ahead: 0, docs: 1 }, { t: H(9) + 30, k: 'doctor', by: 's1' }], end: { t: H(9, 20), how: 'home' } };
    expect(pathCard(quick, false, H(10), names).lines.map(l => l.text)).toEqual(['пришёл сам', 'у терапевта — 20 мин', 'отпущен домой']);
  });

  test('результаты, просьба врача, перевод: почему', () => {
    const j: Journey = {
      kind: 'return', at: H(12),
      steps: [
        { t: H(12), k: 'doctor', by: 's1' },
        { t: H(12, 10), k: 'exam', exam: 'exam.cbc', room: 'r2', at: H(12, 11), start: H(12, 11), end: H(12, 16), back: H(12, 17), ready: H(12, 56) },
        { t: H(12, 16), k: 'results', ready: H(12, 56) },
        { t: H(12, 56), k: 'own', by: 's2', refer: true },
        { t: H(13, 6), k: 'doctor', by: 's2' },
        { t: H(13, 10), k: 'ask', by: 's2', until: H(13, 40) },
      ],
      end: { t: H(13, 40), how: 'away', setting: 'ward', full: ['ward', 'icu'] },
    };
    const c = pathCard(j, false, H(14), names);
    const text = c.lines.map(l => l.text);
    expect(text[0]).toBe('вернулся');
    // анализ: забор и результат; назад к врачу не возвращался — отпустили ждать результатов
    expect(text[2]).toBe('Общий анализ крови: дорога 1 мин, процедура 5 мин, результат к 12:56');
    expect(c.lines[3]).toMatchObject({ text: 'ожидание результатов — 40 мин', why: 'анализ готовит лаборатория' });
    // направлен к врачу (spec docs/specs/2026-10-specialists.md, часть 2): к кому и кто направил
    expect(c.lines[4]).toMatchObject({ text: 'направлен к гастроэнтерологу, ожидание — 10 мин', why: 'вы направили; врач принимает другого больного' });
    expect(text[5]).toBe('у врача — 4 мин');
    expect(c.lines[6]).toMatchObject({ text: 'врач просит вас посмотреть — ждёт ответа 30 мин (до 13:40)', why: 'ответа не было — врач решил сам' });
    expect(c.lines[7]).toMatchObject({ text: 'направлен в стационар другой больницы', why: 'свободных мест не было: палаты, ПИТ' });
  });

  // spec docs/specs/2026-10-specialists.md, часть 2: терапевт направил сам — строка и без ожидания, кто направил и почему
  test('направлен терапевтом: к кому и почему; специалист позвал сразу — строка без ожидания', () => {
    const j: Journey = {
      kind: 'walkIn', at: H(11),
      steps: [{ t: H(11, 5), k: 'doctor', by: 's1' }, { t: H(11, 40), k: 'own', by: 's2', refer: true, from: 's1' }, { t: H(11, 40), k: 'doctor', by: 's2' }],
    };
    const c = pathCard(j, true, H(12), names);
    expect(c.lines.map(l => l.text)).toEqual(['пришла сама', 'у терапевта — 35 мин', 'направлена к гастроэнтерологу', 'у врача — 20 мин']);
    expect(c.lines[2].why).toBe('направил терапевт: не уверен, а вторая гипотеза — по профилю специалиста');
  });

  // spec docs/specs/2026-10-orderlies.md, «Что видно»: лежачего везут на каталке — ждал её, почему и как везли
  test('каталка: на снимок — «ожидание каталки», «на каталке»; на койку — после решения: ждёт её, почему, откуда и куда', () => {
    const exam: Journey = {
      kind: 'ambulance', at: H(10),
      steps: [
        { t: H(10, 2), k: 'doctor' },
        { t: H(10, 10), k: 'exam', exam: 'exam.xray', room: 'r9', at: H(10, 28), start: H(10, 30), end: H(10, 40), back: H(10, 52), ready: H(11), gurney: { pick: H(10, 18), busy: true } },
      ],
    };
    const waiting = pathCard(exam, false, H(10, 14), names).lines.at(-1)!;
    expect(waiting).toMatchObject({ text: 'Рентгенография: ожидание каталки 4 мин', why: 'санитар везёт другого — будет к 10:18', now: true });
    const done = pathCard(exam, false, H(10, 55), names).lines;
    expect(done[2]).toMatchObject({ text: 'Рентгенография: ожидание каталки 8 мин, на каталке 10 мин, очередь 2 мин, процедура 10 мин, на каталке обратно 12 мин', why: 'кабинет был занят до 10:30' });
    const nurse: Journey = { ...exam, steps: [exam.steps[0], { ...(exam.steps[1] as Extract<Journey['steps'][number], { k: 'exam' }>), start: H(10, 28), gurney: { pick: H(10, 18), busy: true, nurse: true } }] };
    expect(pathCard(nurse, false, H(10, 55), names).lines[2].why).toBe('медсестра везла другого — пришла в 10:18');
    // на койку: ждёт — некому везти; везут; довезли
    const bed: Journey = { kind: 'ambulance', at: H(18), steps: [{ t: H(18, 2), k: 'doctor' }], end: { t: H(18, 30), how: 'stay', setting: 'icu', room: 'r5' }, bed: { t: H(18, 30), from: 'r2', to: 'r5' } };
    expect(pathCard(bed, true, H(19), names).lines.at(-1)).toMatchObject({ text: 'ожидание каталки — 30 мин', why: 'в смене нет ни санитара, ни медсестры — до пересменки в 20:00', kind: 'wait', now: true });
    const going: Journey = { ...bed, bed: { t: H(18, 30), from: 'r2', to: 'r5', pick: H(20, 5), off: H(20, 7), done: H(20, 20), none: true } };
    const lines = pathCard(going, true, H(20, 10), names).lines;
    expect(lines.at(-2)).toMatchObject({ text: 'ожидание каталки — 1 ч 35 мин', why: 'в смене не было ни санитара, ни медсестры — повезли с пересменки или после найма' });
    expect(lines.at(-1)).toMatchObject({ text: 'на каталке: смотровая приёмного → палата', now: true });
    expect(pathCard(going, true, H(20, 30), names).lines.at(-1)).toMatchObject({ text: 'на каталке: смотровая приёмного → палата — 15 мин' });
    // пришли сразу — ожидания нет
    const quick: Journey = { ...bed, bed: { t: H(18, 30), from: 'r2', to: 'r5', pick: H(18, 30), off: H(18, 32), done: H(18, 40) } };
    expect(pathCard(quick, true, H(19), names).lines.slice(-2).map(l => l.text)).toEqual(['положена в палату интенсивной терапии', 'на каталке: смотровая приёмного → палата — 10 мин']);
    // не срочного медсестра не везёт (решение владельца #99): ждёт санитара
    const orderly: Journey = { ...bed, bed: { ...bed.bed!, orderly: true } };
    expect(pathCard(orderly, true, H(19), names).lines.at(-1)?.why).toBe('в смене нет санитара, а медсестра везёт только срочных — до пересменки в 20:00');
    const waited: Journey = { ...going, bed: { ...going.bed!, orderly: true } };
    expect(pathCard(waited, true, H(20, 10), names).lines.at(-2)?.why).toBe('в смене не было санитара, а медсестра везёт только срочных — повезли с пересменки или после найма');
  });

  test('каталка в карточках: что делает тот, кто везёт, и что с тем, кого везут', () => {
    const room = (id: string) => (id === 'r2' ? 'смотровая приёмного' : 'КТ');
    const r = { from: 'r2', to: 'r9', who: 'Иванов Пётр' };
    expect(rideLine({ ...r, phase: 'go' }, room)).toBe('идёт с каталкой за больным: Иванов Пётр');
    expect(rideLine({ ...r, phase: 'carry' }, room)).toBe('везёт на каталке: Иванов Пётр, смотровая приёмного → КТ');
    expect(rideLine({ ...r, phase: 'carryBack' }, room)).toBe('везёт на каталке: Иванов Пётр, КТ → смотровая приёмного');
    expect(rideLine({ ...r, phase: 'wait' }, room)).toBe('ждёт у аппарата: Иванов Пётр, КТ');
    expect(rideLine({ from: 'r2', to: 'r9', phase: 'home' }, room)).toBe('возвращается с каталкой на место');
    expect(wheelLine({ ...r, phase: 'load' }, room)).toBe('перекладывают на каталку');
    expect(wheelLine({ ...r, phase: 'carry' }, room)).toBe('везут на каталке: смотровая приёмного → КТ');
    expect(wheelLine({ ...r, phase: 'wait' }, room)).toBe('на обследовании: КТ');
  });

  test('планёрка: лежачие ждали каталку — узкое место; ждут и сейчас — тоже (решение владельца #99)', () => {
    expect(slowOf({ queue: 0, wait: 0, gurney: { n: 3, wait: 47 } })).toEqual([{ kind: 'gurney', n: 3, wait: 47 }]);
    expect(slowOf({ queue: 0, wait: 0 })).toEqual([]);
    expect(slowOf({ queue: 0, wait: 0, gurney: { n: 0, wait: 300, now: 2 } })).toEqual([{ kind: 'gurney', n: 0, wait: 300, now: 2 }]);
    const d = T.meeting.dur;
    expect(T.meeting.gurney(3, 47, 10)).toBe(`каталку ждали дольше 10 мин: 3 раза, дольше всех — ${d(47)}`);
    expect(T.meeting.gurney(3, 300, 10, 1)).toBe(`каталку ждали дольше 10 мин: 3 раза, ждут и сейчас — 1, везти некому; дольше всех — ${d(300)}`);
    expect(T.meeting.gurney(0, 300, 10, 2)).toBe(`каталку ждут дольше 10 мин: 2 — везти некому; дольше всех — ${d(300)}`);
  });

  test('длительность: минуты и часы', () => {
    expect(dur(0)).toBe('0 мин');
    expect(dur(59 * 60)).toBe('59 мин');
    expect(dur(65 * 60)).toBe('1 ч 05 мин');
    expect(dur(125 * 60 + 20)).toBe('2 ч 05 мин');
  });
});

/** Помещение плана для `roomLoads`: только то, что она читает. */
const room = (id: string, type: string, beds = 0) => ({ id, type, beds: Array.from({ length: beds }, () => [0, 0]) });
const plan = { rooms: [room('r1', 'room.waiting'), room('r2', 'room.office'), room('r3', 'room.xray'), room('r4', 'room.ward', 2)] } as unknown as Plan;
const seen = (p: Partial<Seen>): Seen => ({ status: 'waiting', triage: 'green', doing: 'waiting', room: -1, by: -1, bed: -1, kind: 'walkIn', since: H(10), limit: -1, ...p });

describe('помещения и слой очередей', () => {
  const t = H(11);
  const people = [
    seen({ since: H(10) }),
    seen({ since: H(10, 30) }),
    seen({ doing: 'registration', status: 'waiting', since: H(10, 59), room: -1 }),
    seen({ by: 0, since: H(10, 50) }),
    seen({ status: 'inRoom', doing: 'office', room: 1, by: 0, ask: { at: H(10, 55), until: H(11, 25) } }),
    seen({ status: 'inRoom', doing: 'examQueue', room: 2, since: H(10, 52) }),
    seen({ status: 'away', doing: 'examQueue', room: 2, since: H(10, 45) }),
    seen({ status: 'admitted', doing: 'ward', room: 3, bed: 1 }),
  ];
  const loads = roomLoads(people, plan, by => (by === 0 ? 1 : -1), 0, t, type => type === 'room.ward');

  test('нагрузка: общая очередь — в зале, свой врач — у кабинета, обследование — у кабинета, койки, просьба', () => {
    expect(loads[0]).toEqual({ queue: 2, wait: H(1), busy: false, ask: false });
    expect(loads[1]).toEqual({ queue: 1, wait: 10 * 60, busy: true, ask: true });
    expect(loads[2]).toEqual({ queue: 2, wait: 15 * 60, busy: false, ask: false });
    expect(loads[3]).toEqual({ queue: 0, wait: 0, busy: false, ask: false, beds: [1, 2] });
  });

  test('значок: не работает, нет персонала, закрыто, просьба, очередь, койки, занято, ваш кабинет, работает', () => {
    expect(roomChip(loads[0], undefined, false)).toMatchObject({ tone: 'bad', icon: 'queue', text: 'очередь 2', long: 'очередь 2 · до 1 ч 00 мин' });
    expect(roomChip(loads[1], undefined, false)).toMatchObject({ tone: 'ask', icon: 'ask' });
    expect(roomChip(loads[2], undefined, false)).toMatchObject({ tone: 'queue', icon: 'queue', text: 'очередь 2' });
    expect(roomChip(loads[3], undefined, false)).toMatchObject({ tone: 'ok', icon: 'bed', text: 'койки 1/2' });
    const idle = { queue: 0, wait: 0, busy: false, ask: false };
    expect(roomChip(idle, { kind: 'noDoor', text: 'нет двери' }, false)).toMatchObject({ tone: 'bad', icon: 'down', text: 'не работает: нет двери' });
    expect(roomChip(idle, { kind: 'noStaff', text: 'нет рентгенолога' }, false)).toMatchObject({ tone: 'bad', icon: 'staff', text: 'нет рентгенолога' });
    expect(roomChip(idle, { kind: 'closed', text: '' }, false)).toMatchObject({ tone: 'off', icon: 'closed', text: 'закрыто' });
    expect(roomChip(idle, { kind: 'broken', text: 'аппарат сломан' }, false)).toMatchObject({ icon: 'down', text: 'не работает: аппарат сломан' });
    expect(roomChip({ ...idle, busy: true }, undefined, false)).toMatchObject({ tone: 'busy', icon: 'busy', text: 'занято' });
    expect(roomChip(idle, undefined, true)).toMatchObject({ icon: 'mine', text: 'ваш кабинет' });
    expect(roomChip(idle, undefined, false)).toMatchObject({ tone: 'ok', icon: 'ok', text: 'работает' });
  });

  // spec docs/specs/2026-10-owner-play.md: «Работает» и «Койки» над каждым помещением — лишнее; без слоя — что требует взгляда
  test('без слоя — только требующие взгляда и ваш кабинет; в слое — все', () => {
    const idle = { queue: 0, wait: 0, busy: false, ask: false };
    const shown = (chip: ReturnType<typeof roomChip>) => [chipShown(chip, false), chipShown(chip, true)];
    expect(shown(roomChip(loads[0], undefined, false))).toEqual([true, true]); // долго ждут
    expect(shown(roomChip(loads[1], undefined, false))).toEqual([true, true]); // просит врач
    expect(shown(roomChip(loads[2], undefined, false))).toEqual([true, true]); // очередь ждёт дольше обычного
    expect(shown(roomChip(loads[3], undefined, false))).toEqual([false, true]); // койки 1/2
    expect(shown(roomChip({ ...idle, beds: [2, 2] }, undefined, false))).toEqual([true, true]); // все койки заняты
    expect(shown(roomChip(idle, { kind: 'noStaff', text: 'нет рентгенолога' }, false))).toEqual([true, true]);
    expect(shown(roomChip(idle, { kind: 'closed', text: '' }, false))).toEqual([true, true]);
    expect(shown(roomChip({ ...idle, busy: true }, undefined, false))).toEqual([false, true]); // занято
    expect(shown(roomChip({ ...idle, queue: 1, wait: 60 }, undefined, false))).toEqual([false, true]); // короткая очередь
    expect(shown(roomChip(idle, undefined, true))).toEqual([true, true]); // ваш кабинет
    expect(shown(roomChip(idle, undefined, false))).toEqual([false, true]); // работает
  });

  test('цвет пола: по самому долгому ожиданию, по койкам, занято, не работает, пусто', () => {
    const idle = { queue: 0, wait: 0, busy: false, ask: false };
    const red = tintOf({ ...idle, queue: 1, wait: WAIT_BAD }, false);
    const yellow = tintOf({ ...idle, queue: 1, wait: WAIT_OK }, false);
    const green = tintOf({ ...idle, queue: 1, wait: WAIT_OK - 60 }, false);
    expect(new Set([red, yellow, green]).size).toBe(3);
    expect(tintOf({ ...idle, beds: [4, 4] }, false)).toBe(red);
    expect(tintOf({ ...idle, beds: [3, 4] }, false)).toBe(yellow);
    expect(tintOf({ ...idle, beds: [1, 4] }, false)).toBe(green);
    expect(tintOf({ ...idle, busy: true }, false)).toBe(green);
    expect(tintOf(idle, false)).toBeNull();
    expect(tintOf({ ...idle, queue: 3, wait: H(2) }, true)).not.toBe(red);
  });
});

describe('вкладка «Пациенты» и значки', () => {
  const t = H(12);
  const list = [
    { ...seen({ triage: 'yellow', since: H(11, 50) }), key: 'p:1', id: '1-w0001', title: 'A' },
    { ...seen({ since: H(11), limit: H(12, 10) }), key: 'p:2', id: '1-w0002', title: 'B' },
    { ...seen({ status: 'inRoom', doing: 'office', room: 1, since: H(11, 55) }), key: 'p:3', id: '1-w0003', title: 'C' },
    { ...seen({ triage: 'red', status: 'away', doing: 'results', since: H(11, 20) }), key: 'p:4', id: '1-w0004', title: 'D' },
    { ...seen({ status: 'admitted', doing: 'ward', since: H(9) }), key: 'p:5', id: '1-w0005', title: 'E' },
  ];

  test('ждущие — сверху, дольше всех — первым; фильтры по срочности, месту и ожиданию', () => {
    const all = patientRows(list, t, NO_FILTER);
    expect(all.total).toBe(5);
    expect(all.rows.map(r => r.id)).toEqual(['1-w0002', '1-w0004', '1-w0001', '1-w0005', '1-w0003']);
    expect(all.rows[0]).toMatchObject({ text: 'ждёт врача — 1 ч 00 мин', mood: 'unhappy' });
    expect(all.rows[1].mood).toBe('long');
    expect(all.rows[2].mood).toBeUndefined();
    expect(patientRows(list, t, { ...NO_FILTER, triage: 'red' }).rows.map(r => r.id)).toEqual(['1-w0004']);
    expect(patientRows(list, t, { ...NO_FILTER, where: 'wait' }).rows.map(r => r.id)).toEqual(['1-w0002', '1-w0001']);
    expect(patientRows(list, t, { ...NO_FILTER, where: 'exams' }).rows.map(r => r.id)).toEqual(['1-w0004']);
    expect(patientRows(list, t, { ...NO_FILTER, where: 'ward' }).rows.map(r => r.id)).toEqual(['1-w0005']);
    expect(patientRows(list, t, { ...NO_FILTER, long: true }).rows.map(r => r.id)).toEqual(['1-w0002', '1-w0004']);
  });

  test('привезённый скорой: ждёт врача в смотровой — «ждут врача»; врач у него — «у врача»', () => {
    const amb = [
      { ...seen({ doing: 'ambulance', kind: 'ambulance', room: 2, bed: 0, since: H(11, 30) }), key: 'p:7', id: '1-a0001', title: 'F' },
      { ...seen({ doing: 'ambulance', kind: 'ambulance', status: 'inRoom', room: 2, bed: 1, since: H(11, 50) }), key: 'p:8', id: '1-a0002', title: 'G' },
    ];
    expect(patientRows(amb, t, { ...NO_FILTER, where: 'wait' }).rows.map(r => r.text)).toEqual(['привезла скорая, ждёт врача — 30 мин']);
    expect(patientRows(amb, t, { ...NO_FILTER, where: 'doctor' }).rows.map(r => r.text)).toEqual(['привезла скорая, у врача — 10 мин']);
  });

  test('значок: просит раньше всего; недоволен — прошло 2/3 терпения; ждёт долго — от 30 минут; у врача — нет', () => {
    const base = { status: 'waiting' as const, doing: 'waiting' as const, since: H(10), limit: -1 };
    expect(moodOf({ ...base, ask: { at: H(10), until: H(10, 30) } }, H(10))).toBe('ask');
    const limit = H(10) + 90 * 60;
    expect(moodOf({ ...base, limit }, H(10) + 90 * 60 * UNHAPPY)).toBe('unhappy');
    expect(moodOf({ ...base, limit }, H(10) + 90 * 60 * UNHAPPY - 60)).toBe('long');
    expect(moodOf(base, H(10) + LONG_WAIT - 1)).toBeUndefined();
    expect(moodOf(base, H(10) + LONG_WAIT)).toBe('long');
    expect(moodOf({ ...base, status: 'inRoom', doing: 'office' }, H(13))).toBeUndefined();
    expect(moodOf({ ...base, status: 'away', doing: 'results' }, H(11))).toBe('long');
  });
});

describe('главврач утверждает в окне (spec docs/specs/2026-10-two-ways.md, часть 2)', () => {
  test('путь: решение ждёт вашего ответа — и чем кончилось: согласились, промолчали, ещё обследование, взяли', () => {
    const decided = (end: Journey['end'], more: Journey['steps'] = []): Journey => ({
      kind: 'walkIn', at: H(10),
      steps: [{ t: H(10, 5), k: 'doctor', by: 's1', room: 'r1' }, { t: H(10, 25), k: 'approve', by: 's1', until: H(10, 55) }, ...more],
      ...(end ? { end } : {}),
    });
    const line = (j: Journey, now: number) => pathCard(j, false, now, names).lines.find(l => l.text.startsWith('решение врача'))!;
    expect(line(decided(undefined), H(10, 37))).toEqual({ at: '10:25', text: 'решение врача ждёт вашего ответа — 12 мин (до 10:55)', why: 'ждёт у двери кабинета, врач принимает другого', kind: 'wait', now: true });
    expect(line(decided({ t: H(10, 31), how: 'home', setting: 'home', chief: 'agreed' }), H(11)).why).toBe('вы согласились');
    expect(line(decided({ t: H(10, 55), how: 'home', setting: 'home', chief: 'silent' }), H(11)).why).toBe('ответа не было — решение врача в силе');
    expect(line(decided(undefined, [{ t: H(10, 30), k: 'own', by: 's1' }]), H(10, 40)).why).toBe('вы назначили ещё обследование');
    expect(line(decided(undefined, [{ t: H(10, 30), k: 'own', by: 's2', refer: true }]), H(10, 40)).why).toBe('вы направили к гастроэнтерологу');
    expect(line(decided(undefined, [{ t: H(10, 30), k: 'doctor' }]), H(10, 40)).why).toBe('вы взяли случай');
    // обследование, которое назначил главврач, — в строке обследования
    const j = decided(undefined, [
      { t: H(10, 30), k: 'own', by: 's1' }, { t: H(10, 33), k: 'doctor', by: 's1', room: 'r1' },
      { t: H(10, 35), k: 'exam', exam: 'exam.xray', room: 'r3', at: H(10, 37), start: H(10, 37), end: H(10, 45), back: H(10, 47), ready: H(11), chief: true },
    ]);
    expect(pathCard(j, false, H(10, 50), names).lines.find(l => l.text.startsWith('Рентгенография'))?.why).toBe('назначил главврач');
  });

  test('значок — после просьбы; в «Пациентах» — «ждёт вашего решения»', () => {
    const base = { status: 'waiting' as const, doing: 'waiting' as const, since: H(10), limit: -1 };
    expect(moodOf({ ...base, approve: { at: H(10), until: H(10, 30) } }, H(10))).toBe('approve');
    expect(moodOf({ ...base, ask: { at: H(10), until: H(10, 30) }, approve: { at: H(10), until: H(10, 30) } }, H(10))).toBe('ask');
    const row = { ...base, triage: 'green' as const, approve: { at: H(10), until: H(10, 30) }, key: 'p:1', id: '1-w0001', title: 'A' };
    expect(patientRows([row], H(10, 12), NO_FILTER).rows[0].text).toBe('ждёт вашего решения — 12 мин');
  });
});
