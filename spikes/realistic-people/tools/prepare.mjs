// Текстуры Rocketbox — несжатые TGA 2048² (12,6 МБ каждая, с альфой — 16,8 МБ); браузер TGA не читает. Скрипт делает из
// каждой PNG в assets/prepared/: полный размер (портрет) и 512² (карта: человек на экране — 60–200 точек ростом). Только
// Node, без зависимостей: TGA (несжатый и RLE, 24/32 бита) → PNG (zlib). В игре вместо PNG были бы KTX2 (Basis) — их тут
// сделать нечем, поэтому память видеокарты в README посчитана для несжатых RGBA и для сжатых (1 байт на точку).
//
//   node spikes/realistic-people/tools/prepare.mjs
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';

const root = join(dirname(new URL(import.meta.url).pathname), '..');
const src = join(root, 'assets', 'rocketbox');
const out = join(root, 'assets', 'prepared');
mkdirSync(out, { recursive: true });

/** TGA → { w, h, ch, data } (строки сверху вниз, RGB или RGBA). */
function readTga(buf) {
  const idLen = buf[0];
  const cmapType = buf[1];
  const type = buf[2];
  const cmapLen = buf.readUInt16LE(5) * Math.ceil(buf[7] / 8);
  const w = buf.readUInt16LE(12);
  const h = buf.readUInt16LE(14);
  const bpp = buf[16];
  const desc = buf[17];
  if (cmapType !== 0 || (type !== 2 && type !== 10) || (bpp !== 24 && bpp !== 32)) throw new Error(`TGA: тип ${type}, ${bpp} бит — не поддержан`);
  const px = bpp / 8;
  const raw = Buffer.alloc(w * h * px);
  let p = 18 + idLen + cmapLen;
  if (type === 2) buf.copy(raw, 0, p, p + raw.length);
  else {
    for (let o = 0; o < raw.length; ) {
      const head = buf[p++];
      const n = (head & 0x7f) + 1;
      if (head & 0x80) {
        for (let k = 0; k < n; k++, o += px) buf.copy(raw, o, p, p + px);
        p += px;
      } else {
        buf.copy(raw, o, p, p + n * px);
        p += n * px;
        o += n * px;
      }
    }
  }
  const topDown = (desc & 0x20) !== 0;
  const data = Buffer.alloc(w * h * px);
  for (let y = 0; y < h; y++) {
    const sy = topDown ? y : h - 1 - y;
    for (let x = 0; x < w; x++) {
      const s = (sy * w + x) * px;
      const d = (y * w + x) * px;
      data[d] = raw[s + 2];
      data[d + 1] = raw[s + 1];
      data[d + 2] = raw[s];
      if (px === 4) data[d + 3] = raw[s + 3];
    }
  }
  return { w, h, ch: px, data };
}

/** PNG 8 бит RGB/RGBA, фильтр Sub у каждой строки. */
function writePng(file, { w, h, ch, data }) {
  const row = w * ch;
  const filtered = Buffer.alloc((row + 1) * h);
  for (let y = 0; y < h; y++) {
    const o = y * (row + 1);
    filtered[o] = 1;
    for (let i = 0; i < row; i++) filtered[o + 1 + i] = (data[y * row + i] - (i >= ch ? data[y * row + i - ch] : 0)) & 0xff;
  }
  const chunk = (type, body) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(body.length);
    const tb = Buffer.concat([Buffer.from(type, 'ascii'), body]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(tb));
    return Buffer.concat([len, tb, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = ch === 4 ? 6 : 2;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(filtered, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  writeFileSync(file, png);
  return png.length;
}

/** Уменьшение в k раз средним по квадрату k×k. */
function shrink({ w, h, ch, data }, k) {
  const W = w / k;
  const H = h / k;
  const outData = Buffer.alloc(W * H * ch);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      for (let c = 0; c < ch; c++) {
        let s = 0;
        for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) s += data[((y * k + dy) * w + x * k + dx) * ch + c];
        outData[(y * W + x) * ch + c] = Math.round(s / (k * k));
      }
    }
  }
  return { w: W, h: H, ch, data: outData };
}

const walk = d => readdirSync(d).flatMap(n => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
const index = {};
let made = 0;
for (const f of walk(src).filter(f => f.endsWith('.tga')).sort()) {
  const name = basename(f, '.tga');
  const full = join(out, `${name}.png`);
  const small = join(out, `${name}@512.png`);
  if (existsSync(full) && existsSync(small)) {
    // уже сделан: размеры — из заголовка PNG (IHDR), каналы — по типу цвета
    const head = readFileSync(full).subarray(0, 26);
    const ch = head[25] === 6 ? 4 : 3;
    index[name] = { w: head.readUInt32BE(16), h: head.readUInt32BE(20), ch, tga: statSync(f).size, png: statSync(full).size, png512: statSync(small).size };
    continue;
  }
  const t0 = performance.now();
  const img = readTga(readFileSync(f));
  const png = writePng(full, img);
  const png512 = writePng(small, shrink(img, img.w / 512));
  index[name] = { w: img.w, h: img.h, ch: img.ch, tga: statSync(f).size, png, png512 };
  made++;
  console.log(`  ${name}: ${img.w}×${img.h}×${img.ch}, PNG ${(png / 1e6).toFixed(1)} МБ, 512² — ${(png512 / 1e3).toFixed(0)} КБ (${((performance.now() - t0) / 1000).toFixed(1)} с)`);
}
writeFileSync(join(out, 'index.json'), `${JSON.stringify(index, null, 1)}\n`);
console.log(`✓ PNG: новых ${made}, всего ${Object.keys(index).length}`);
