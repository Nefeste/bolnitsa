// из uzory: tools/audio/tracks.ts @ cc43d01, изменено: музыка «Больницы» (spec docs/specs/2026-11-sound.md, часть 3) — с
// OpenGameArt.org и Free Music Archive (решение владельца #208, вариант 2; пьесы — #214), CC0 и CC BY без NC, ND и SA;
// у пьесы — автор и строка атрибуции со страницы вместо композитора и исполнителя; модуль для окна — src/app/music.gen.ts,
// раздел реестра assets/audio/LICENSES.md — отсюда же; без «approved»: список выбрал владелец.
//
// Список пьес (assets/audio/music.yaml): разбор со строгой проверкой, модуль для окна и строки реестра. Чистые функции — их
// проверяют тесты (tools/test/music.test.ts) без ffmpeg.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

export const AUDIO_DIR = join(import.meta.dir, '..', '..', 'assets', 'audio');
export const MUSIC_DIR = join(AUDIO_DIR, 'music');
export const MUSIC_MODULE = join(import.meta.dir, '..', '..', 'src', 'app', 'music.gen.ts');
/** Вся музыка — не больше 14 МБ: около 25 минут стерео Opus 64 кбит/с. */
export const MUSIC_MAX_BYTES = 14 * 1024 * 1024;

export interface TrackEntry {
  id: string;
  title: string;
  author: string;
  license: 'CC0' | 'CC BY 3.0' | 'CC BY 4.0';
  /** страница пьесы: на ней — лицензия и, у CC BY, как указать автора */
  page: string;
  /** откуда файл — тот, что на странице; `sha256` — его хеш */
  download: string;
  sha256: string;
  /** у CC BY — строка атрибуции, как просит страница; у CC0 — нет */
  credit?: string;
  /** где и когда выложена, отметка «не ИИ» (генераторы музыки запрещены: AGENTS.md, ADR 0020 устава) */
  note: string;
}

const ID = /^[a-z0-9][a-z0-9-]{2,39}$/;
/** Только то, что можно выпускать без разрешения: CC0 и CC BY — не NC, не ND, не SA (решение владельца #208). */
const LICENSES = ['CC0', 'CC BY 3.0', 'CC BY 4.0'] as const;
const PAGE = [/^https:\/\/opengameart\.org\/content\/[a-z0-9-]+$/, /^https:\/\/freemusicarchive\.org\/music\/[^\s]+\/$/];
const FROM = [/^https:\/\/opengameart\.org\/sites\/default\/files\/[^\s/]+\.(wav|mp3|ogg|flac)$/, /^https:\/\/files\.freemusicarchive\.org\/storage-freemusicarchive-org\/tracks\/[A-Za-z0-9]+\.mp3$/];

export function readTracks(file = join(AUDIO_DIR, 'music.yaml')): TrackEntry[] {
  const raw = parse(readFileSync(file, 'utf8')) as { tracks?: unknown };
  if (!raw || !Array.isArray(raw.tracks)) throw new Error('music.yaml: нет списка tracks');
  const ids = new Set<string>();
  return raw.tracks.map((t: Record<string, unknown>, i) => {
    const at = `music.yaml, пьеса ${i + 1}`;
    const str = (k: string) => {
      const v = t[k];
      if (typeof v !== 'string' || !v.trim()) throw new Error(`${at}: нет ${k}`);
      return v.trim();
    };
    const id = str('id');
    if (!ID.test(id) || ids.has(id)) throw new Error(`${at}: id ${id}`);
    ids.add(id);
    const license = str('license');
    if (!(LICENSES as readonly string[]).includes(license)) throw new Error(`${id}: лицензия ${license} — нужна CC0 или CC BY`);
    const page = str('page');
    if (!PAGE.some(r => r.test(page))) throw new Error(`${id}: page — страница пьесы на OpenGameArt или Free Music Archive`);
    const download = str('download');
    if (!FROM.some(r => r.test(download))) throw new Error(`${id}: download ${download}`);
    const sha256 = str('sha256');
    if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error(`${id}: sha256`);
    const by = license !== 'CC0';
    if (by && typeof t.credit !== 'string') throw new Error(`${id}: у CC BY нужна строка атрибуции (credit)`);
    if (!by && t.credit !== undefined) throw new Error(`${id}: у CC0 строки атрибуции нет`);
    return {
      id, title: str('title'), author: str('author'), license: license as TrackEntry['license'], page, download, sha256,
      ...(by ? { credit: str('credit') } : {}), note: str('note'),
    };
  });
}

export const trackFile = (id: string) => join(MUSIC_DIR, `${id}.webm`);

/** Модуль для окна: пьесы — название, автор, лицензия, страница, строка атрибуции; файл — `assets/audio/music/<id>.webm`. */
export function musicModule(tracks: readonly TrackEntry[]): string {
  const q = (s: string) => JSON.stringify(s);
  const rows = tracks.map(
    t => `  { id: ${q(t.id)}, title: ${q(t.title)}, author: ${q(t.author)}, license: ${q(t.license)}, page: ${q(t.page)}${t.credit ? `, credit: ${q(t.credit)}` : ''} },`,
  );
  return [
    '// Собрано tools/sound/music.ts из assets/audio/music.yaml (spec docs/specs/2026-11-sound.md, часть 3) — не править руками.',
    "import type { Track } from './music';",
    '',
    `export const TRACKS: readonly Track[] = [\n${rows.join('\n')}\n];`,
    '',
  ].join('\n');
}

/** Раздел реестра assets/audio/LICENSES.md: у каждого файла музыки — строка (устав, `docs/06-content.md`). */
export function musicLicenses(tracks: readonly TrackEntry[]): string {
  const rows = tracks.map(
    (t, i) => `| ${i + 1} | \`music/${t.id}.webm\` | ${t.title} — ${t.author} | ${t.license} | ${t.page} | ${t.credit ?? '—'} | ${t.note}; исходник ${t.download}, SHA-256 \`${t.sha256}\` |`,
  );
  return `## Музыка

Пьесы выбрал владелец 08.11.2026 (#214) из десяти кандидатов агента: спокойная музыка CC0 и CC BY с OpenGameArt.org и Free
Music Archive, без NC, ND и SA (решение владельца #208, вариант 2; docs/specs/2026-11-sound.md, часть 3). Список —
\`assets/audio/music.yaml\`; файлы собирает \`npm run music\` (\`tools/sound/music.ts\`, нужен ffmpeg с libopus): исходник со
страницы пьесы — по SHA-256, тишина по краям — прочь, громкость выровнена (EBU R128: −20 LUFS, пики до −2 дБ), вступление и
конец — плавно, стерео Opus 64 кбит/с, 48 кГц. Это и есть изменения, о которых говорит CC BY. Руками не править. Авторы
пьес CC BY — в «Настройках», «Музыка».

| № | Файл | Пьеса | Лицензия | Страница | Как указать автора | Откуда |
|---|---|---|---|---|---|---|
${rows.join('\n')}
`;
}
