// Оттенки волос и кожи (spec docs/specs/2026-10-people.md, часть 2б): у одного вида — разные волосы и кожа по зерну человека;
// маска вида — два канала (R — одежда, G — кожа и волосы), пряди — в альфе атласа, их грани — по нормалям.
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { GREY, HAIR, HAIR_AS_IS, HAIR_DARKER, HAIR_LIGHTER, lumaOf, SKIN, toneOf } from '../../src/render/cast';
import { gltfOf, MODELS, rocketboxIndex } from './render-kit';

const RB = join(MODELS, 'rocketbox');
const adult = { age: 'adult' as const };
const old = { age: 'old' as const };
const seeds = Array.from({ length: 4000 }, (_, i) => i * 7919 + 13);
const share = (list: unknown[], f: (x: never) => boolean) => list.filter(x => f(x as never)).length / list.length;

describe('оттенки людей', () => {
  test('по зерну — всегда один и тот же; кожа — в своих пределах', () => {
    for (const s of seeds.slice(0, 200)) {
      expect(toneOf(s, adult, 0.1)).toEqual(toneOf(s, adult, 0.1));
      const t = toneOf(s, adult, 0.1);
      expect(t.skin).toBeGreaterThanOrEqual(SKIN[0]);
      expect(t.skin).toBeLessThan(SKIN[1]);
    }
  });

  test('волос в маске нет (шапка, лысина) — цвет волос не меняется, кожа — меняется', () => {
    const tones = seeds.map(s => toneOf(s, adult, 0));
    expect(tones.every(t => t.hair === null)).toBe(true);
    expect(new Set(tones.map(t => t.skin.toFixed(3))).size).toBeGreaterThan(50);
  });

  test('у трети — «как у вида»; у остальных — природный цвет не дальше своих пределов от волос вида', () => {
    for (const hair of [0.08, 0.2, 0.6]) {
      const tones = seeds.map(s => toneOf(s, adult, hair));
      expect(share(tones, (t: { hair: number | null }) => t.hair === null)).toBeGreaterThan(HAIR_AS_IS - 0.03);
      for (const t of tones) {
        if (t.hair === null || t.hair === HAIR.grey || t.hair === HAIR.white) continue;
        expect(lumaOf(t.hair)).toBeLessThanOrEqual(hair * HAIR_LIGHTER);
        expect(lumaOf(t.hair)).toBeGreaterThanOrEqual(hair * HAIR_DARKER);
      }
      // и цветов не один: очередь из одного вида разная
      expect(new Set(tones.map(t => t.hair)).size).toBeGreaterThanOrEqual(3);
    }
  });

  test('седых: пожилых — больше половины перекрашенных, с 50 лет — около трети, моложе — единицы', () => {
    const grey = (t: { hair: number | null }) => t.hair === HAIR.grey || t.hair === HAIR.white;
    const painted = (list: { hair: number | null }[]) => list.filter(t => t.hair !== null);
    const elder = painted(seeds.map(s => toneOf(s, old, 0.3)));
    const fifty = painted(seeds.map(s => toneOf(s, adult, 0.3, 55)));
    const young = painted(seeds.map(s => toneOf(s, adult, 0.3, 30)));
    expect(share(elder, grey)).toBeCloseTo(GREY.old, 1);
    expect(share(fifty, grey)).toBeCloseTo(GREY.fifty, 1);
    expect(share(young, grey)).toBeCloseTo(GREY.other, 1);
    // пожилой по возрасту пациента — как пожилой вид
    expect(share(painted(seeds.map(s => toneOf(s, adult, 0.3, 70))), grey)).toBeCloseTo(GREY.old, 1);
  });

  test('соседние зёрна — разные оттенки', () => {
    const near = seeds.slice(0, 50).map(s => [toneOf(s, adult, 0.15), toneOf(s + 1, adult, 0.15)]);
    expect(near.filter(([a, b]) => a.hair === b.hair && Math.abs(a.skin - b.skin) < 0.005).length).toBeLessThan(5);
  });
});

describe('маска и атлас видов', () => {
  test('маска — PNG в три канала по 8 бит (на видеокарту уходят два: R и G); у кого пряди — атлас WebP с альфой', () => {
    const alpha = new Set<string>();
    for (const name of rocketboxIndex.looks) {
      const png = readFileSync(join(RB, `${name}.mask.png`));
      // IHDR: ширина, высота, глубина, тип цвета (2 — RGB)
      expect([name, png.readUInt32BE(16), png.readUInt32BE(20), png[24], png[25]]).toEqual([name, 1024, 1024, 8, 2]);
      const glb = readFileSync(join(RB, `${name}.glb`));
      const at = glb.indexOf('WEBPVP8X');
      // VP8X: флаг альфы — бит 4 первого байта флагов; у видов без прядей альфа вся 255, и кодировщик её не пишет
      if (at > 0 && (glb[at + 12] & 0x10) !== 0) alpha.add(name);
    }
    for (const name of ['Medical_Female_02', 'Female_Adult_04', 'Male_Adult_08', 'Construction_Male_01']) expect([name, alpha.has(name)]).toEqual([name, true]);
    expect(alpha.size).toBeGreaterThanOrEqual(35);
  });

  test('яркость волос вида — в glb; без волос — только виды в шапке, каске или с лысиной', async () => {
    const hair = new Map<string, number>();
    for (const name of rocketboxIndex.looks) {
      const { scene } = await gltfOf(`rocketbox/${name}`);
      hair.set(name, (scene.getObjectByName('rocketbox')?.userData as { hair?: number }).hair ?? -1);
    }
    for (const [name, h] of hair) expect([name, h >= 0 && h < 1]).toEqual([name, true]);
    for (const name of ['Chef_Female_01', 'Delivery_Male_01', 'Construction_Male_01', 'Business_Male_04']) expect([name, hair.get(name)]).toEqual([name, 0]);
    for (const name of ['Medical_Female_02', 'Male_Adult_08', 'Female_Adult_04', 'Male_Adult_16']) expect([name, hair.get(name)! > 0]).toEqual([name, true]);
    expect([...hair.values()].filter(h => h > 0).length).toBeGreaterThanOrEqual(48);
  });

  test('грани прядей обходятся по нормалям вершин — у полной и упрощённой модели: иначе пластина темнеет, как освещённая сзади', async () => {
    let strands = 0;
    for (const name of rocketboxIndex.looks) {
      const { scene } = await gltfOf(`rocketbox/${name}`);
      for (const part of ['body', 'lod']) {
        const mesh = scene.getObjectByName(part) as THREE.Mesh;
        const g = mesh.geometry;
        const [P, N, U, I] = [g.getAttribute('position'), g.getAttribute('normal'), g.getAttribute('uv'), g.getIndex()!];
        const v = (a: typeof P, i: number) => new THREE.Vector3(a.getX(i), a.getY(i), a.getZ(i));
        let against = 0;
        for (let t = 0; t < I.count; t += 3) {
          const [a, b, c] = [I.getX(t), I.getX(t + 1), I.getX(t + 2)];
          // четверть прядей атласа: u < ½, v ≥ ½
          if ((U.getX(a) + U.getX(b) + U.getX(c)) / 3 >= 0.5 || (U.getY(a) + U.getY(b) + U.getY(c)) / 3 < 0.5) continue;
          strands++;
          // против — явно (косинус меньше −0,1): у грани-щепки или стоящей ребром к нормалям знак после сжатия координат случаен
          const face = v(P, b).sub(v(P, a)).cross(v(P, c).sub(v(P, a))).normalize();
          if (face.dot(v(N, a).add(v(N, b)).add(v(N, c)).normalize()) < -0.1) against++;
        }
        expect([name, part, against]).toEqual([name, part, 0]);
      }
    }
    expect(strands).toBeGreaterThan(10000);
  });
});
