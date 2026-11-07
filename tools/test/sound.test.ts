// Звук, часть 1 (spec docs/specs/2026-11-sound.md): файлы в assets/audio — те, что собирает tools/sound/gen.ts, у каждого
// строка в реестре; моно 44,1 кГц, тихие и короткие, без перегруза; пересборка даёт те же отсчёты. Звуки окна — те же, что
// файлы, и у каждого повод из таблицы спецификации (ADR 0023 устава, правило 6); громкость — ступенями; один и тот же звук —
// не чаще 80 мс; у стройки — свой звук по виду команды.
import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CUES, due, GAP_MS, siteCue, volumeOf, VOLUMES } from '../../src/app/sound';
import { licenses, RATE, SOUNDS } from '../sound/gen';

const DIR = join(import.meta.dir, '../../assets/audio');

function read(file: string): { rate: number; channels: number; bits: number; x: Int16Array } {
  const b = readFileSync(join(DIR, file));
  expect([b.toString('ascii', 0, 4), b.toString('ascii', 8, 12)]).toEqual(['RIFF', 'WAVE']);
  const n = b.readUInt32LE(40) / 2;
  const x = new Int16Array(n);
  for (let i = 0; i < n; i++) x[i] = b.readInt16LE(44 + i * 2);
  return { rate: b.readUInt32LE(24), channels: b.readUInt16LE(22), bits: b.readUInt16LE(34), x };
}

describe('файлы звуков', () => {
  test('в папке ровно то, что собирает генератор, — по звуку окна на файл; реестр — тот, что пишет генератор', () => {
    const files = readdirSync(DIR).filter(f => f.endsWith('.wav')).sort();
    expect(files).toEqual(SOUNDS.map(s => s.file).sort());
    expect(files).toEqual(CUES.map(c => `${c}.wav`).sort());
    const reg = readFileSync(join(DIR, 'LICENSES.md'), 'utf8');
    expect(reg).toBe(licenses());
    for (const f of files) expect(reg).toContain(`\`${f}\``);
  });

  for (const s of SOUNDS) {
    test(`${s.file}: моно ${RATE} Гц, 16 бит, тихий и короткий, без перегруза; пересборка — те же отсчёты`, () => {
      const { rate, channels, bits, x } = read(s.file);
      expect([rate, channels, bits]).toEqual([RATE, 1, 16]);
      let peak = 0;
      for (const v of x) peak = Math.max(peak, Math.abs(v) / 32768);
      expect(peak).toBeGreaterThan(0.25);
      expect(peak).toBeLessThanOrEqual(0.6);
      expect(x.length / RATE).toBeLessThanOrEqual(1.7);
      // без щелчка в начале и в конце
      expect(Math.abs(x[0])).toBeLessThan(64);
      expect(Math.abs(x[x.length - 1])).toBeLessThan(64);
      // пересборка: отсчёты те же — с запасом в одну ступень на последний бит синуса другой сборки движка JavaScript
      const again = s.make();
      expect(again.length).toBe(x.length);
      let worst = 0;
      for (let i = 0; i < x.length; i++) worst = Math.max(worst, Math.abs(Math.round(Math.max(-1, Math.min(1, again[i])) * 32767) - x[i]));
      expect(worst).toBeLessThanOrEqual(1);
    });
  }
});

describe('звуки окна', () => {
  test('у каждого звука — повод из таблицы спецификации, и в таблице — только они', () => {
    const spec = readFileSync(join(import.meta.dir, '../../docs/specs/2026-11-sound.md'), 'utf8');
    const rows = [...spec.matchAll(/^\| `([a-z]+)` \| (.+?) \| (.+?) \|$/gm)].map(m => m[1]);
    expect(rows).toEqual([...CUES]);
  });

  test('стройка: встало — стук, снесено — два стука, нанят — колокольчики, не прошло — отказ; прочее — без звука', () => {
    for (const cmd of ['room', 'ready', 'item', 'door', 'bench', 'furnish', 'move']) expect([cmd, siteCue(cmd, true)]).toEqual([cmd, 'build']);
    for (const cmd of ['demolish', 'remove', 'undecor', 'undoor']) expect([cmd, siteCue(cmd, true)]).toEqual([cmd, 'demolish']);
    for (const cmd of ['hire', 'reserve']) expect([cmd, siteCue(cmd, true)]).toEqual([cmd, 'hire']);
    for (const cmd of ['dismiss', 'raise', 'reshift', 'study', 'dept', 'office', 'done', 'undo']) expect([cmd, siteCue(cmd, true)]).toEqual([cmd, undefined]);
    for (const cmd of ['room', 'hire', 'done']) expect(siteCue(cmd, false)).toBe('refuse');
  });

  test('один и тот же звук — не чаще 80 мс; громкость — ступенями по 0,1', () => {
    expect(GAP_MS).toBe(80);
    expect([due(undefined, 0), due(1000, 1079), due(1000, 1080)]).toEqual([true, false, true]);
    expect(VOLUMES).toHaveLength(11);
    expect([volumeOf(0.34), volumeOf(0.36), volumeOf(-1), volumeOf(9), volumeOf(Number.NaN), volumeOf('0.5')]).toEqual([0.3, 0.4, 0, 1, 0.7, 0.7]);
  });
});
