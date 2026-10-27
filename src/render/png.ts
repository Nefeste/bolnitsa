// PNG без холста (spec docs/specs/2026-10-catalog.md, «Миниатюры»): кадр миниатюры приходит из видеокарты байтами, а
// картинка из холста 2D (`toDataURL`) ждала бы всю работу видеокарты — на программном WebGL сотни миллисекунд на каждую.
// Здесь — RGB без прозрачности, сжатие `CompressionStream` (zlib), куски PNG с CRC. Чистая функция без DOM — её проверяет
// тест (tools/test/png.test.ts).

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const v = new DataView(out.buffer);
  v.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  v.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * PNG из пикселей RGBA `w`×`h`; `bottomUp` — строки снизу вверх, как их отдаёт WebGL. Прозрачность отбрасывается: кадр
 * миниатюры непрозрачен.
 */
export async function pngOf(rgba: Uint8Array, w: number, h: number, bottomUp = true): Promise<Uint8Array<ArrayBuffer>> {
  const row = w * 3 + 1;
  const raw = new Uint8Array(row * h);
  for (let y = 0; y < h; y++) {
    const src = (bottomUp ? h - 1 - y : y) * w * 4;
    // фильтр строки — «нет» (0); затем RGB каждой точки
    let o = y * row + 1;
    for (let x = 0; x < w; x++, o += 3) {
      raw[o] = rgba[src + x * 4];
      raw[o + 1] = rgba[src + x * 4 + 1];
      raw[o + 2] = rgba[src + x * 4 + 2];
    }
  }
  const z = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
  const head = new Uint8Array(13);
  const v = new DataView(head.buffer);
  v.setUint32(0, w);
  v.setUint32(4, h);
  // 8 бит на канал, RGB; сжатие, фильтры и порядок строк — обычные
  head[8] = 8;
  head[9] = 2;
  const parts = [new Uint8Array(SIGNATURE), chunk('IHDR', head), chunk('IDAT', z), chunk('IEND', new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
