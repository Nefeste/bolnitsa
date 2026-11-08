// из uzory: tools/audio/music.ts @ cc43d01, изменено: музыка «Больницы» (spec docs/specs/2026-11-sound.md, часть 3) —
// стерео Opus 64 кбит/с вместо моно 32 кбит/с (у ПК — колонки и наушники, а не один динамик телефона), файлы — в
// assets/audio/music, после них — модуль окна src/app/music.gen.ts и реестр assets/audio/LICENSES.md.
//
// npm run music [-- --only <id>] — файлы пьес из assets/audio/music.yaml: скачать исходник и сверить SHA-256, обрезать тишину
// по краям, выровнять громкость (EBU R128: −20 LUFS, пики до −2 дБ), вступление и конец — плавно, сжать в Opus —
// assets/audio/music/<id>.webm. Нужен ffmpeg с libopus: FFMPEG=/путь/к/ffmpeg, иначе из PATH. Исходники — в
// tools/sound/.cache (не в git).
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { licenses } from './gen';
import { AUDIO_DIR, MUSIC_DIR, MUSIC_MAX_BYTES, MUSIC_MODULE, musicModule, readTracks, trackFile, type TrackEntry } from './tracks';

const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const CACHE = join(import.meta.dir, '.cache');
const UA = 'BolnitsaContentBot/0.1 (game studio Gornitsa)';
const RATE = 48000;
/** Громкость файла; тише звуков её делает проигрыватель окна (src/app/music.ts, `MUSIC_GAIN`). */
const LOUDNESS = 'I=-20:TP=-2:LRA=11';
const BITRATE = '64k';

function ffmpeg(args: string[]): string {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-nostdin', ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw new Error(`ffmpeg не запустился (${FFMPEG}): ${r.error.message}`);
  if (r.status !== 0) throw new Error(`ffmpeg ${args.join(' ')}\n${r.stderr.slice(-2000)}`);
  return r.stderr;
}

async function source(t: TrackEntry): Promise<string> {
  mkdirSync(CACHE, { recursive: true });
  const file = join(CACHE, `${t.id}.src`);
  if (!existsSync(file)) {
    const res = await fetch(t.download, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`${t.id}: ${res.status} ${t.download}`);
    writeFileSync(file, new Uint8Array(await res.arrayBuffer()));
  }
  const sha = createHash('sha256').update(readFileSync(file)).digest('hex');
  if (sha !== t.sha256) throw new Error(`${t.id}: SHA-256 исходника ${sha}, в music.yaml — ${t.sha256}`);
  return file;
}

/** Длительность WAV с 32-битными отсчётами, стерео. */
function wavSeconds(file: string): number {
  const b = readFileSync(file);
  for (let at = 12; at + 8 <= b.length; ) {
    const id = b.toString('ascii', at, at + 4);
    const size = b.readUInt32LE(at + 4);
    if (id === 'data') return size / 8 / RATE;
    at += 8 + size + (size & 1);
  }
  throw new Error(`${file}: нет данных`);
}

async function make(t: TrackEntry) {
  const src = await source(t);
  const wav = join(CACHE, `${t.id}.wav`);
  // стерео; тишина по краям — прочь (с конца — через разворот)
  const trim = 'silenceremove=start_periods=1:start_threshold=-50dB:detection=peak';
  ffmpeg(['-y', '-i', src, '-vn', '-af', `aformat=channel_layouts=stereo,aresample=${RATE},${trim},areverse,${trim},areverse`, '-c:a', 'pcm_f32le', wav]);
  const sec = wavSeconds(wav);
  const log = ffmpeg(['-i', wav, '-af', `loudnorm=${LOUDNESS}:print_format=json`, '-f', 'null', '-']);
  const m = JSON.parse(log.slice(log.lastIndexOf('{'), log.lastIndexOf('}') + 1)) as Record<string, string>;
  const norm = `loudnorm=${LOUDNESS}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
  const fades = `afade=t=in:d=0.3,afade=t=out:st=${Math.max(0, sec - 2).toFixed(2)}:d=2`;
  const out = trackFile(t.id);
  ffmpeg(['-y', '-i', wav, '-af', `${norm},${fades}`, '-ar', String(RATE), '-ac', '2', '-c:a', 'libopus', '-b:a', BITRATE, '-vbr', 'on',
    '-compression_level', '10', '-application', 'audio', '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:a', '+bitexact', '-f', 'webm', out]);
  const kb = statSync(out).size / 1024;
  console.log(`${t.id}: ${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}, было ${m.input_i} LUFS, ${kb.toFixed(0)} КБ`);
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : undefined;
  const tracks = readTracks();
  mkdirSync(MUSIC_DIR, { recursive: true });
  for (const t of tracks) if (!only || t.id === only) await make(t);
  writeFileSync(MUSIC_MODULE, musicModule(tracks));
  writeFileSync(join(AUDIO_DIR, 'LICENSES.md'), licenses());
  const total = tracks.reduce((s, t) => s + (existsSync(trackFile(t.id)) ? statSync(trackFile(t.id)).size : 0), 0);
  console.log(`всего ${(total / 1024 / 1024).toFixed(2)} МБ из ${MUSIC_MAX_BYTES / 1024 / 1024}`);
  if (total > MUSIC_MAX_BYTES) process.exit(1);
}
