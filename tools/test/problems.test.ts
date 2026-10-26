// Слой «Проблемы» (spec docs/specs/2026-10-layers.md, часть 1): что считается проблемой и какого она уровня, порядок
// строк, «ещё N», число в меню, цвет пола. Чистые функции src/app/problems.ts — без DOM и Three.js; значки помещений — те
// же, что над картой (`roomChip`); строки — русские (язык по умолчанию).
import { describe, expect, test } from 'bun:test';
import { LONG_WAIT, type RoomLoad, roomChip, WAIT_BAD, WAIT_OK } from '../../src/app/flow';
import { MAX_ROWS, problemList, type ProblemsInput, problemTint, roomLevel, sameList, shiftGap } from '../../src/app/problems';
import { money, setLang } from '../../src/i18n';

setLang('ru');
const T0 = 12 * 3600;
const idle: RoomLoad = { queue: 0, wait: 0, busy: false, ask: false };
const room = (id: string, name: string, load: RoomLoad, problem?: Parameters<typeof roomChip>[1]) => ({
  id, name, load, chip: roomChip(load, problem, false), ...(problem ? { kind: problem.kind } : {}),
});
const base = (x: Partial<ProblemsInput>): ProblemsInput => ({ rooms: [], staff: [], gurney: [], limit: 200_000, t: T0, day: true, money, ...x });

describe('помещения', () => {
  test('уровень по значку: не работает и долгая очередь — красный, очередь 15–30 минут и все койки — жёлтый, перестройка и снос — серый', () => {
    expect(roomLevel(roomChip(idle, { kind: 'noDoor', text: 'нет двери' }, false))).toBe('bad');
    expect(roomLevel(roomChip(idle, { kind: 'noStaff', text: 'нет лаборанта' }, false))).toBe('bad');
    expect(roomLevel(roomChip(idle, { kind: 'broken', text: 'аппарат сломан' }, false))).toBe('bad');
    expect(roomLevel(roomChip({ ...idle, queue: 4, wait: WAIT_BAD }, undefined, false))).toBe('bad');
    expect(roomLevel(roomChip({ ...idle, queue: 2, wait: WAIT_OK }, undefined, false))).toBe('warn');
    expect(roomLevel(roomChip({ ...idle, beds: [4, 4] }, undefined, false))).toBe('warn');
    expect(roomLevel(roomChip(idle, { kind: 'closed', text: 'закрыто на перестройку' }, false), 'closed')).toBe('off');
    expect(roomLevel(roomChip(idle, { kind: 'leaving', text: 'сносится' }, false), 'leaving')).toBe('off');
  });

  test('в этой смене никого («закрыто до …»): днём — жёлтый у любого помещения, ночью — только у работающего и ночью', () => {
    const off = roomChip(idle, { kind: 'offShift', text: 'закрыто до 20:00' }, false);
    expect(off.tone).toBe('rest');
    expect(shiftGap('offShift', true, false)).toBe(true);
    expect(shiftGap('offShift', false, true)).toBe(true);
    expect(shiftGap('offShift', false, false)).toBe(false);
    expect(shiftGap('noStaff', true, true)).toBe(false);
    const lab = { ...room('r1', 'Лаборатория', idle, { kind: 'offShift', text: 'закрыто до 20:00' }), why: 'закрыто до 20:00', night: true };
    const office = { ...room('r2', 'Кабинет врача', idle, { kind: 'offShift', text: 'закрыто до 08:00' }), why: 'закрыто до 08:00' };
    const days = problemList(base({ rooms: [lab] }));
    expect(days.rows.map(r => [r.level, r.where, r.what])).toEqual([['warn', 'Лаборатория', 'в этой смене никого — закрыто до 20:00']]);
    // ночью: лаборатория работает и ночью — дыра; кабинет врача ночью закрыт — так задумано
    const nights = problemList(base({ rooms: [{ ...lab, why: 'закрыто до 08:00' }, office], day: false }));
    expect(nights.rows.map(r => [r.where, r.what])).toEqual([['Лаборатория', 'в этой смене никого — закрыто до 08:00']]);
  });

  test('не проблема: работает, занято, короткая очередь, свободные койки, врач просит посмотреть, не его смена', () => {
    expect(roomLevel(roomChip(idle, undefined, false))).toBeUndefined();
    expect(roomLevel(roomChip({ ...idle, busy: true }, undefined, false))).toBeUndefined();
    expect(roomLevel(roomChip({ ...idle, queue: 1, wait: 5 * 60 }, undefined, false))).toBeUndefined();
    expect(roomLevel(roomChip({ ...idle, beds: [2, 4] }, undefined, false))).toBeUndefined();
    expect(roomLevel(roomChip({ ...idle, ask: true }, undefined, false))).toBeUndefined();
    expect(roomLevel(roomChip(idle, { kind: 'offShift', text: 'закрыто до 08:00' }, false), 'offShift')).toBeUndefined();
  });

  test('строки: где и что; все койки — словами; помещение — туда, с карточкой', () => {
    const l = problemList(
      base({
        rooms: [
          room('r1', 'Лаборатория', idle, { kind: 'noStaff', text: 'нет лаборанта' }),
          room('r2', 'Палата', { ...idle, beds: [4, 4] }),
          room('r3', 'Кабинет врача', { ...idle, queue: 7, wait: 65 * 60 }),
          room('r4', 'Операционная', idle, { kind: 'closed', text: 'закрыто на перестройку' }),
          room('r5', 'Регистратура', { ...idle, busy: true }),
        ],
      }),
    );
    expect(l.rows.map(r => [r.level, r.where, r.what])).toEqual([
      ['bad', 'Лаборатория', 'не работает: нет лаборанта'],
      ['bad', 'Кабинет врача', 'очередь 7 · до 1 ч 05 мин'],
      ['warn', 'Палата', 'все койки заняты: 4/4'],
      ['off', 'Операционная', 'закрыто на перестройку'],
    ]);
    expect(l.rows[0].go).toEqual({ room: 'r1' });
    // в меню — красные и жёлтые, без серых
    expect(l.count).toBe(3);
    expect(l.more).toBe(0);
  });

  test('долгие очереди — от самой долгой', () => {
    const l = problemList(
      base({
        rooms: [room('a', 'Кабинет врача', { ...idle, queue: 3, wait: 35 * 60 }), room('b', 'Кабинет УЗИ', { ...idle, queue: 2, wait: 50 * 60 })],
      }),
    );
    expect(l.rows.map(r => r.where)).toEqual(['Кабинет УЗИ', 'Кабинет врача']);
  });
});

describe('люди штата', () => {
  test('собирается уйти и уходит — красные; устал до «ошибается чаще» в смене — жёлтый; на перерыве и бодрый — нет', () => {
    const l = problemList(
      base({
        tired: 90,
        staff: [
          { key: 's:1', who: 'Медсестра Волкова Нина', quit: true },
          { key: 's:2', who: 'Терапевт Орлов Олег', go: true },
          { key: 's:3', who: 'Терапевт Ким Анна', fatigue: 92 },
          { key: 's:4', who: 'Терапевт Ли Ян', fatigue: 95, resting: true },
          { key: 's:5', who: 'Лаборант Ус Ия', fatigue: 40 },
        ],
      }),
    );
    expect(l.rows.map(r => [r.level, r.where, r.what])).toEqual([
      ['bad', 'Медсестра Волкова Нина', 'собирается уйти'],
      ['bad', 'Терапевт Орлов Олег', 'уходит после смены'],
      ['warn', 'Терапевт Ким Анна', 'устал — ошибается чаще (усталость 92)'],
    ]);
    expect(l.rows[0].go).toEqual({ person: 's:1' });
  });

  test('без порога усталости (смены без усталости) — усталость не проблема', () => {
    expect(problemList(base({ staff: [{ key: 's:3', who: 'Терапевт', fatigue: 99 }] })).rows).toEqual([]);
  });
});

describe('лежачие и касса', () => {
  test('ждут каталку дольше «ждёт долго» — одна строка, к тому, кто ждёт дольше всех', () => {
    const l = problemList(
      base({
        gurney: [
          { key: 'p:7', since: T0 - LONG_WAIT - 10 * 60 },
          { key: 'p:8', since: T0 - 5 * 60 },
          { key: 'p:9', since: T0 - LONG_WAIT },
        ],
      }),
    );
    expect(l.rows.map(r => [r.level, r.where, r.what])).toEqual([['warn', 'Лежачие', '2 ждут каталку · дольше всех 40 мин']]);
    expect(l.rows[0].go).toEqual({ person: 'p:7' });
    expect(problemList(base({ gurney: [{ key: 'p:8', since: T0 - 5 * 60 }] })).rows).toEqual([]);
  });

  test('касса в минусе — жёлтая, со словом, на сколько ещё можно строить; ниже предела — красная; в плюсе — нет', () => {
    const minus = problemList(base({ cash: -12_300 }));
    expect(minus.rows.map(r => [r.level, r.where, r.what])).toEqual([['warn', 'Касса', `в минусе: ${money(-12_300)} · строить можно ещё на ${money(187_700)}`]]);
    expect(minus.rows[0].go).toEqual({ reports: true });
    const below = problemList(base({ cash: -200_000 }));
    expect(below.rows[0].level).toBe('bad');
    expect(below.rows[0].what).toBe(`ниже предела минуса: ${money(-200_000)} — стройки нет, на планёрке банк предложит кредит`);
    expect(problemList(base({ cash: -5_000, limit: 0 })).rows[0].what).toBe(`в минусе: ${money(-5_000)}`);
    expect(problemList(base({ cash: 1_000 })).rows).toEqual([]);
    expect(problemList(base({})).rows).toEqual([]);
  });
});

describe('список', () => {
  test('сначала красные, потом жёлтые, потом серые; внутри — помещения, люди, лежачие, касса', () => {
    const l = problemList(
      base({
        rooms: [room('r9', 'Операционная', idle, { kind: 'closed', text: 'закрыто на перестройку' }), room('r2', 'Палата', { ...idle, beds: [2, 2] })],
        staff: [{ key: 's:1', who: 'Медсестра', quit: true }],
        cash: -300_000,
      }),
    );
    expect(l.rows.map(r => r.key)).toEqual(['s:1', 'cash', 'r:r2', 'r:r9']);
  });

  test(`не больше ${MAX_ROWS} строк, остальные — «ещё N»; в меню — все красные и жёлтые`, () => {
    const rooms = Array.from({ length: MAX_ROWS + 3 }, (_, i) => room(`r${i}`, `Кабинет ${i}`, idle, { kind: 'noDoor', text: 'нет двери' }));
    const l = problemList(base({ rooms }));
    expect(l.rows.length).toBe(MAX_ROWS);
    expect(l.more).toBe(3);
    expect(l.count).toBe(MAX_ROWS + 3);
  });

  test('нет проблем — пусто', () => {
    expect(problemList(base({ rooms: [room('r1', 'Регистратура', { ...idle, busy: true })] }))).toEqual({ rows: [], more: 0, count: 0 });
  });

  test('тот же список — тот же: панель не перерисовывается раз в 100 мс', () => {
    const x = base({ rooms: [room('r1', 'Лаборатория', idle, { kind: 'noDoor', text: 'нет двери' })] });
    expect(sameList(problemList(x), problemList(x))).toBe(true);
    expect(sameList(problemList(x), problemList({ ...x, cash: -1 }))).toBe(false);
  });

  test('цвет пола: красный и жёлтый — как у слоя очередей, серый — «не работает» там же; не проблема — без цвета', () => {
    expect(problemTint('bad')).toBe(0xff2a12);
    expect(problemTint('warn')).toBe(0xffc400);
    expect(problemTint('off')).toBe(0x6f7a80);
    expect(problemTint(undefined)).toBeNull();
  });
});
