// Настройки игрока (spec docs/specs/2026-10-settings.md; решение владельца #70): по умолчанию — стены вниз, перспектива,
// качество «авто», текст обычный; чего нет в хранилище или испорчено — по умолчанию; «авто» — ступенью ниже, пока кадр
// медленный.
import { describe, expect, test } from 'bun:test';
import { AUTO, AutoQuality, DEFAULT_SETTINGS, parseSettings, readSettings, TEXT_SCALES, writeSettings } from '../../src/app/settings';

/** Хранилище в памяти — как хранилище страницы. */
const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

describe('настройки', () => {
  test('по умолчанию — вид владельца: стены вниз, перспектива, качество «авто» (#70)', () => {
    expect(DEFAULT_SETTINGS).toEqual({ walls: 'down', projection: 'persp', quality: 'auto', debug: false, metric: null, text: 1 });
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(readSettings(memory())).toEqual(DEFAULT_SETTINGS);
  });

  test('записанное — читается; чужое и испорченное — по умолчанию, поле за полем', () => {
    const store = memory();
    writeSettings({ walls: 'cut', projection: 'ortho', quality: 'low', debug: true, metric: 'wait', text: 1.3 }, store);
    expect(readSettings(store)).toEqual({ walls: 'cut', projection: 'ortho', quality: 'low', debug: true, metric: 'wait', text: 1.3 });
    // размер текста — один из трёх, как в «Анамнезе»; другой — обычный
    expect(TEXT_SCALES).toEqual([1, 1.15, 1.3]);
    expect(parseSettings('{"text":1.15}').text).toBe(1.15);
    expect(parseSettings('{"text":2}').text).toBe(1);
    expect(parseSettings('{"text":"1.3"}').text).toBe(1);
    // слой «Показатели» (spec docs/specs/2026-10-metrics-layer.md): чужой показатель — слой выключен
    expect(parseSettings('{"metric":"fun"}')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('{"walls":"glass","projection":"ortho","quality":"ultra"}')).toEqual({ ...DEFAULT_SETTINGS, projection: 'ortho' });
    expect(parseSettings('{oops')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('42')).toEqual(DEFAULT_SETTINGS);
    // хранилища нет или оно бросает — по умолчанию, игра идёт
    expect(readSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    expect(readSettings(broken)).toEqual(DEFAULT_SETTINGS);
    expect(() => writeSettings(DEFAULT_SETTINGS, broken)).not.toThrow();
  });

  test('«авто»: быстрый кадр — высокое; медленный — ступенью ниже, и снова смотреть; на низком — остаться', () => {
    const run = (ms: (q: string) => number) => {
      const a = new AutoQuality();
      const steps: string[] = [];
      let frames = 0;
      for (; frames < 5000 && !a.done; frames++) {
        const q = a.push(ms(a.quality));
        if (q) steps.push(q);
      }
      return { quality: a.quality, done: a.done, steps, frames };
    };
    // 60 кадров в секунду: разогрев — 60 кадров, замер — 90
    expect(run(() => 16.7)).toEqual({ quality: 'high', done: true, steps: [], frames: AUTO.warm + AUTO.frames });
    expect(run(q => (q === 'high' ? 30 : 16.7))).toMatchObject({ quality: 'medium', done: true, steps: ['medium'] });
    expect(run(() => 40)).toMatchObject({ quality: 'low', done: true, steps: ['medium', 'low'] });
    // 10 кадров в секунду: ступень — за 2 с разогрева и 3 с замера, а не за 150 кадров
    expect(run(() => 100)).toEqual({ quality: 'low', done: true, steps: ['medium', 'low'], frames: 3 * (20 + 30) });
    // кадр в 2 с (без видеокарты): разогрев — один кадр, замер — не меньше 10
    expect(run(() => 2000)).toEqual({ quality: 'low', done: true, steps: ['medium', 'low'], frames: 3 * (1 + AUTO.least) });
  });

  test('«авто»: разогрев не в счёт — медленные первые кадры (сборка шейдеров) не опускают качество', () => {
    const a = new AutoQuality();
    for (let i = 0; i < 3; i++) a.push(500);
    for (let i = 0; i < 200 && !a.done; i++) a.push(16.7);
    expect([a.quality, a.done]).toEqual(['high', true]);
  });
});
