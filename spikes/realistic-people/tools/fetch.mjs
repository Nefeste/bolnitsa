// Скачивает исходные файлы пробы в assets/ (в git их нет) и сверяет SHA-256 с tools/sources.json.
//
// Три источника: Microsoft Rocketbox (MIT) и MakeHuman (CC0) — отдельными файлами с raw.githubusercontent.com на
// закреплённом коммите; системные ресурсы MakeHuman (CC0) — из архива на files.makehumancommunity.org. Архив весит
// 281 МБ, а нужно из него ~20 МБ, поэтому нужные файлы вынимаются из него запросами Range: сначала конец архива
// (оглавление), потом только сжатые данные нужных файлов. Сеть нужна только этому скрипту; страница пробы в сеть не ходит.
//
//   node spikes/realistic-people/tools/fetch.mjs            # скачать недостающее, сверить суммы
//   node spikes/realistic-people/tools/fetch.mjs --update   # записать суммы новых файлов в sources.json (первый раз)
//   node spikes/realistic-people/tools/fetch.mjs --list mh-system skins/   # оглавление архива (по префиксу)
//
// Node 22: fetch ходит через HTTPS_PROXY только с NODE_USE_ENV_PROXY=1 — скрипт перезапускает себя с ним сам.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { inflateRawSync } from 'node:zlib';

if ((process.env.HTTPS_PROXY || process.env.https_proxy) && process.env.NODE_USE_ENV_PROXY !== '1') {
  const r = spawnSync(process.execPath, ['--no-warnings', ...process.argv.slice(1)], { stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1' } });
  process.exit(r.status ?? 1);
}

const here = dirname(new URL(import.meta.url).pathname);
const root = join(here, '..');
const sourcesPath = join(here, 'sources.json');
const sources = JSON.parse(readFileSync(sourcesPath, 'utf8'));
const update = process.argv.includes('--update');
const sha = buf => createHash('sha256').update(buf).digest('hex');

async function get(url, range) {
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await fetch(url, range ? { headers: { range: `bytes=${range[0]}-${range[1] - 1}` } } : undefined);
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      if (range && r.status !== 206) throw new Error(`сервер не отдал кусок (Range): ${r.status} ${url}`);
      return Buffer.from(await r.arrayBuffer());
    } catch (e) {
      if (attempt >= 3) throw e;
      console.log(`  повтор ${attempt}: ${e.message}`);
    }
  }
}

// ---------------------------------------------------------------- архив по кускам

/** Оглавление zip по сети: запись конца архива (EOCD), затем центральный каталог. ZIP64 не нужен: архив меньше 4 ГБ. */
async function zipIndex(url, bytes) {
  const tailLen = Math.min(bytes, 65557);
  const tail = await get(url, [bytes - tailLen, bytes]);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('не найден конец архива (EOCD)');
  const cdSize = tail.readUInt32LE(eocd + 12);
  const cdOffset = tail.readUInt32LE(eocd + 16);
  const cd = await get(url, [cdOffset, cdOffset + cdSize]);
  const entries = new Map();
  for (let p = 0; p < cd.length; ) {
    if (cd.readUInt32LE(p) !== 0x02014b50) throw new Error(`битый каталог архива на ${p}`);
    const method = cd.readUInt16LE(p + 10);
    const comp = cd.readUInt32LE(p + 20);
    const size = cd.readUInt32LE(p + 24);
    const nameLen = cd.readUInt16LE(p + 28);
    const extraLen = cd.readUInt16LE(p + 30);
    const commentLen = cd.readUInt16LE(p + 32);
    const offset = cd.readUInt32LE(p + 42);
    const name = cd.subarray(p + 46, p + 46 + nameLen).toString('utf8');
    entries.set(name, { method, comp, size, offset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** Один файл из архива: локальный заголовок (его длины имени и поля extra могут отличаться от каталога), затем данные. */
async function zipEntry(url, e) {
  const head = await get(url, [e.offset, e.offset + 30]);
  if (head.readUInt32LE(0) !== 0x04034b50) throw new Error('битый локальный заголовок');
  const start = e.offset + 30 + head.readUInt16LE(26) + head.readUInt16LE(28);
  const data = await get(url, [start, start + e.comp]);
  if (e.method === 0) return data;
  if (e.method === 8) return inflateRawSync(data);
  throw new Error(`метод сжатия ${e.method} не поддержан`);
}

// ---------------------------------------------------------------- главное

const listAt = process.argv.indexOf('--list');
if (listAt > 0) {
  const src = sources[process.argv[listAt + 1]];
  const prefix = process.argv[listAt + 2] ?? '';
  const idx = await zipIndex(src.zip, src.zipBytes);
  for (const [name, e] of idx) if (name.startsWith(prefix)) console.log(`${String(e.size).padStart(10)}  ${name}`);
  process.exit(0);
}

let changed = false;
let bad = 0;
let fetched = 0;
let total = 0;
for (const [key, src] of Object.entries(sources)) {
  if (key.startsWith('_')) continue;
  const dir = join(root, 'assets', key);
  let idx = null;
  for (const [path, want] of Object.entries(src.files)) {
    const file = join(dir, path);
    let buf = existsSync(file) ? readFileSync(file) : null;
    if (buf && want && sha(buf) === want) {
      total += buf.length;
      continue;
    }
    if (src.zip) {
      idx ??= await zipIndex(src.zip, src.zipBytes);
      const e = idx.get(path);
      if (!e) throw new Error(`${key}: в архиве нет ${path}`);
      buf = await zipEntry(src.zip, e);
    } else {
      buf = await get(src.url + path.split('/').map(encodeURIComponent).join('/'));
    }
    const h = sha(buf);
    if (!want || update) {
      if (want !== h) changed = true;
      src.files[path] = h;
    } else if (h !== want) {
      console.error(`✗ ${key}/${path}: SHA-256 ${h}, ожидалась ${want}`);
      bad++;
      continue;
    }
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, buf);
    fetched++;
    total += buf.length;
    console.log(`  ${(buf.length / 1e6).toFixed(2).padStart(6)} МБ  ${key}/${path}`);
  }
}
if (changed) writeFileSync(sourcesPath, `${JSON.stringify(sources, null, 1)}\n`);
console.log(`${bad ? '✗' : '✓'} скачано ${fetched}, всего в assets/ ${(total / 1e6).toFixed(0)} МБ${bad ? `, не сошлось: ${bad}` : ''}${changed ? '; суммы записаны в sources.json' : ''}`);
process.exitCode = bad ? 1 : 0;
