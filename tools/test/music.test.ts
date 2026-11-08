// Звук, часть 3 — музыка (spec docs/specs/2026-11-sound.md; решения владельца #208 и #214): в assets/audio/music — ровно
// пьесы списка assets/audio/music.yaml, восемь, что выбрал владелец; лицензии — CC0 и CC BY, у CC BY — строка атрибуции;
// файлы — WebM с Opus, в пределах размера; модуль окна и реестр — те, что пишет генератор (без ffmpeg: из списка); круг
// пьес — каждая по разу, без повтора на стыке; громкость «Музыка» — ступенями.
import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_MUSIC, MUSIC_GAIN, musicOf, PAUSE_S, shuffleOrder } from '../../src/app/music';
import { TRACKS } from '../../src/app/music.gen';
import { VOLUMES } from '../../src/app/sound';
import { licenses } from '../sound/gen';
import { AUDIO_DIR, MUSIC_DIR, MUSIC_MAX_BYTES, MUSIC_MODULE, musicLicenses, musicModule, readTracks } from '../sound/tracks';

const tracks = readTracks();

describe('пьесы', () => {
  test('восемь, что выбрал владелец (#214): все кандидаты, кроме Viewpoint (Serat) и ACOUSTIC MEDITATION (Jason Shaw)', () => {
    expect(tracks.map(t => t.id)).toEqual(['bluebonnet', 'another-august', 'piano-iix', 'little-lullaby', 'the-woods', 'ambient-breath', 'celosia', 'tokyo-sunset']);
    expect(tracks.some(t => /serat|jason shaw/i.test(t.author))).toBe(false);
  });

  test('лицензии — CC0 и CC BY; у CC BY — строка атрибуции с названием, автором, источником и лицензией; у CC0 — нет', () => {
    for (const t of tracks) {
      expect(['CC0', 'CC BY 3.0', 'CC BY 4.0']).toContain(t.license);
      if (t.license === 'CC0') expect(t.credit).toBeUndefined();
      else {
        expect(t.credit).toContain(t.title);
        expect(t.credit).toContain(t.author);
        expect(t.credit).toContain(t.license);
        expect(t.credit).toMatch(/OpenGameArt\.org|Free Music Archive/);
      }
      // не из генератора: у Free Music Archive — отметка автора «AI generated? No»
      if (t.page.startsWith('https://freemusicarchive.org/')) expect(t.note).toContain('AI generated? No');
    }
  });

  test('в папке — ровно файлы списка: WebM с Opus, не пустые, вместе — в пределах размера', () => {
    const files = readdirSync(MUSIC_DIR).sort();
    expect(files).toEqual(tracks.map(t => `${t.id}.webm`).sort());
    let total = 0;
    for (const f of files) {
      const b = readFileSync(join(MUSIC_DIR, f));
      // заголовок EBML, тип документа webm, звук — Opus
      expect([...b.subarray(0, 4)]).toEqual([0x1a, 0x45, 0xdf, 0xa3]);
      expect(b.subarray(0, 64).includes(Buffer.from('webm'))).toBe(true);
      expect(b.subarray(0, 4096).includes(Buffer.from('A_OPUS'))).toBe(true);
      const size = statSync(join(MUSIC_DIR, f)).size;
      expect(size).toBeGreaterThan(500 * 1024);
      total += size;
    }
    expect(total).toBeLessThanOrEqual(MUSIC_MAX_BYTES);
  });

  test('модуль окна и раздел реестра — те, что пишет генератор; у каждого файла — строка в реестре', () => {
    expect(readFileSync(MUSIC_MODULE, 'utf8')).toBe(musicModule(tracks));
    const reg = readFileSync(join(AUDIO_DIR, 'LICENSES.md'), 'utf8');
    expect(reg).toBe(licenses());
    expect(reg).toContain(musicLicenses(tracks));
    for (const t of tracks) expect(reg).toContain(`\`music/${t.id}.webm\``);
    expect(TRACKS.map(t => t.id)).toEqual(tracks.map(t => t.id));
  });
});

describe('проигрыватель', () => {
  test('круг — каждая пьеса по разу; на стыке кругов одна и та же не звучит дважды подряд', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    let last: number | undefined;
    for (let round = 0; round < 50; round++) {
      const order = shuffleOrder(8, last, rnd);
      expect([...order].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
      expect(order[0]).not.toBe(last);
      last = order[order.length - 1];
    }
    expect(shuffleOrder(1, 0, rnd)).toEqual([0]);
  });

  test('громкость «Музыка» — ступенями, как у звука; по умолчанию — половина; музыка тише звуков, между пьесами — тишина', () => {
    expect(DEFAULT_MUSIC).toBe(0.5);
    expect(musicOf(0.26)).toBe(0.3);
    expect(musicOf(-1)).toBe(0);
    expect(musicOf(undefined)).toBe(DEFAULT_MUSIC);
    for (const v of VOLUMES) expect(musicOf(v)).toBe(v);
    expect(MUSIC_GAIN).toBeGreaterThan(0);
    expect(MUSIC_GAIN).toBeLessThan(1);
    expect(PAUSE_S).toBeGreaterThanOrEqual(10);
  });
});
