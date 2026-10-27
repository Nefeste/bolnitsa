// Миниатюры каталога стройки (spec docs/specs/2026-10-catalog.md, «Миниатюры»): PNG собирается из байтов кадра без холста —
// подпись, куски с верным CRC, строки сверху вниз; образец каждого готового помещения встаёт на свой участок той же
// командой, что у стройки, и кадр миниатюры берёт помещение целиком, а стены корпуса и вход — нет.
import { describe, expect, test } from 'bun:test';
import { inflateSync } from 'node:zlib';
import * as THREE from 'three';
import { aroundOf, sampleOf } from '../../src/app/thumbs';
import { CELL } from '../../src/engine/hospital/grid';
import { CATALOG, EXTRA_MODELS } from '../../src/render/catalog';
import { crc32, pngOf } from '../../src/render/png';
import { frameOf } from '../../src/render/thumbs';
import { buildDb } from '../content/load';
import { furnitureModels } from './render-kit';

const { db } = buildDb();

/** Куски PNG: тип, данные и CRC каждого — после подписи. */
function chunksOf(png: Uint8Array): { type: string; data: Uint8Array; crc: number; want: number }[] {
  const out = [];
  const v = new DataView(png.buffer, png.byteOffset, png.byteLength);
  for (let at = 8; at < png.length; ) {
    const n = v.getUint32(at);
    const type = String.fromCharCode(...png.subarray(at + 4, at + 8));
    out.push({ type, data: png.subarray(at + 8, at + 8 + n), crc: v.getUint32(at + 8 + n), want: crc32(png.subarray(at + 4, at + 8 + n)) });
    at += 12 + n;
  }
  return out;
}

describe('PNG без холста', () => {
  test('CRC-32 — как у zlib', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  test('подпись, IHDR, IDAT и IEND с верным CRC; строки — сверху вниз, RGB без прозрачности', async () => {
    // 3 × 2, строки снизу вверх, как их отдаёт WebGL: нижняя — красная, зелёная, синяя; верхняя — белая, серая, чёрная
    const px = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255, 128, 128, 128, 255, 0, 0, 0, 7]);
    const png = await pngOf(px, 3, 2);
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const cs = chunksOf(png);
    expect(cs.map(c => c.type)).toEqual(['IHDR', 'IDAT', 'IEND']);
    for (const c of cs) expect([c.type, c.crc]).toEqual([c.type, c.want]);
    const h = new DataView(cs[0].data.buffer, cs[0].data.byteOffset, 13);
    expect([h.getUint32(0), h.getUint32(4), cs[0].data[8], cs[0].data[9], cs[0].data[10], cs[0].data[11], cs[0].data[12]]).toEqual([3, 2, 8, 2, 0, 0, 0]);
    const raw = [...inflateSync(cs[1].data)];
    expect(raw).toEqual([0, 255, 255, 255, 128, 128, 128, 0, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255]);
  });
});

describe('образцы миниатюр', () => {
  test('каждый готовый образец — на своём участке целиком; кадр берёт помещение, но не стены корпуса и вход', async () => {
    const names = [...new Set([...Object.values(CATALOG).flatMap(e => ('model' in e ? [e.model] : [])), ...EXTRA_MODELS])];
    const models = await furnitureModels(names);
    const v = new THREE.Vector3();
    const inFrame = (cam: THREE.Camera, x: number, y: number, z: number) => {
      v.set(x, y, z).project(cam);
      return Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1;
    };
    let n = 0;
    for (const t of Object.values(db.rooms)) {
      for (const z of t.sizes) {
        const s = sampleOf(db, models, t.id, z.id);
        expect([t.id, z.id, !!s]).toEqual([t.id, z.id, true]);
        const { layout, furnished, room } = s!;
        n++;
        // одно помещение с дверью и обстановкой; коридор вокруг — не уже `aroundOf`
        expect(layout.plan.rooms.length).toBe(1);
        expect(layout.things.length).toBeGreaterThan(0);
        expect(furnished.batch.colored.length + furnished.batch.textured.length).toBeGreaterThan(0);
        expect(room.x - 2).toBe(aroundOf(room.w, room.h));
        const cam = frameOf(room);
        for (const [x, y] of [
          [room.x, room.y],
          [room.x + room.w, room.y],
          [room.x, room.y + room.h],
          [room.x + room.w, room.y + room.h],
        ]) {
          expect([t.id, z.id, x, y, inFrame(cam, x, 0, y)]).toEqual([t.id, z.id, x, y, true]);
        }
        // клетки стен вне помещения — стены корпуса и вход: в кадре их нет
        const { w, h, cells } = layout.plan.grid;
        const outer: number[][] = [];
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const wall = cells[y * w + x] === CELL.wall || cells[y * w + x] === CELL.door;
            const mine = x >= room.x && y >= room.y && x < room.x + room.w && y < room.y + room.h;
            if (wall && !mine && inFrame(cam, x + 0.5, 0.6, y + 0.5)) outer.push([x, y]);
          }
        }
        expect([t.id, z.id, outer]).toEqual([t.id, z.id, []]);
      }
    }
    expect(n).toBeGreaterThanOrEqual(20);
  });
});
