// Камера (spec docs/specs/2026-10-aaa-polish.md, «Камера»): масштаб колесом идёт плавно, за несколько кадров, и точка земли
// под курсором остаётся на своём месте экрана; масштаб, заданный прямо (снимки, сценарий, бенч, общий план), — сразу;
// пределы масштаба держатся; отпущенная после протяжки карта скользит и останавливается трением. Чистая математика
// Three.js без DOM и WebGL.
import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { IsoCamera, releaseVelocity } from '../../src/render/view';

/** Камера над участком 60 × 40, устоявшаяся (поворот дошёл до цели). */
function settled(projection: 'persp' | 'ortho' = 'persp'): IsoCamera {
  const cam = new IsoCamera(60, 40);
  cam.projection = projection;
  cam.aspect = 16 / 9;
  for (let i = 0; i < 30; i++) cam.update(1 / 30);
  return cam;
}

/** Точка экрана (доли −1…1) точки земли. */
const ndcOf = (cam: IsoCamera, x: number, z: number) => new THREE.Vector3(x, 0, z).project(cam.camera);

describe('камера: плавный масштаб к точке под курсором', () => {
  test.each(['persp', 'ortho'] as const)('%s: точка под курсором стоит на месте, пока масштаб доходит до цели', projection => {
    const cam = settled(projection);
    const half0 = cam.half;
    // «курсор» правее и ниже середины кадра
    const ground = cam.groundAt(0.45, -0.35)!;
    expect(ground).toBeDefined();
    const before = ndcOf(cam, ground.x, ground.z);
    expect(Math.abs(before.x - 0.45)).toBeLessThan(1e-3);
    expect(Math.abs(before.y + 0.35)).toBeLessThan(1e-3);
    cam.zoom(0.5, { x: ground.x, z: ground.z });
    // масштаб не прыгнул: за первый кадр прошёл лишь часть пути
    cam.update(1 / 60);
    expect(cam.half).toBeLessThan(half0);
    expect(cam.half).toBeGreaterThan(half0 * 0.5 + 0.5);
    expect(cam.zooming).toBe(true);
    const mid = ndcOf(cam, ground.x, ground.z);
    expect(Math.abs(mid.x - before.x)).toBeLessThan(2e-3);
    expect(Math.abs(mid.y - before.y)).toBeLessThan(2e-3);
    for (let i = 0; i < 120; i++) cam.update(1 / 60);
    expect(cam.zooming).toBe(false);
    expect(cam.half).toBeCloseTo(half0 * 0.5, 2);
    const after = ndcOf(cam, ground.x, ground.z);
    expect(Math.abs(after.x - before.x)).toBeLessThan(2e-3);
    expect(Math.abs(after.y - before.y)).toBeLessThan(2e-3);
    // точка взгляда сдвинулась к курсору
    expect(cam.target.x).toBeGreaterThan(30);
  });

  test('без точки — к середине кадра: точка взгляда не двигается', () => {
    const cam = settled();
    const t0 = cam.target.clone();
    cam.zoom(0.7);
    for (let i = 0; i < 60; i++) cam.update(1 / 60);
    expect(cam.target.distanceTo(t0)).toBeLessThan(1e-9);
    expect(cam.half).toBeCloseTo(22 * 0.7, 3);
  });

  test('заданный прямо масштаб — сразу и отменяет плавный; пределы — от 3 м до трёх четвертей участка', () => {
    const cam = settled();
    cam.zoom(0.5, { x: 10, z: 10 });
    cam.half = 15;
    cam.update(1 / 60);
    expect(cam.half).toBe(15);
    expect(cam.zooming).toBe(false);
    const [lo, hi] = cam.halfRange;
    expect([lo, hi]).toEqual([3, 45]);
    cam.zoom(0.001);
    for (let i = 0; i < 200; i++) cam.update(1 / 60);
    expect(cam.half).toBe(lo);
    cam.zoom(1000);
    for (let i = 0; i < 200; i++) cam.update(1 / 60);
    expect(cam.half).toBe(hi);
    // общий план — тоже сразу
    cam.zoom(0.5, { x: 5, z: 5 });
    cam.overview();
    expect(cam.zooming).toBe(false);
    expect(cam.target.x).toBe(30);
  });

  test('полёт к человеку и масштаб колесом не мешают друг другу: колесо отменяет полёт', () => {
    const cam = settled();
    cam.flyTo(10, 10, 9);
    cam.update(1 / 60);
    expect(cam.flying).toBe(true);
    cam.zoom(1.2, { x: 20, z: 20 });
    expect(cam.flying).toBe(false);
    for (let i = 0; i < 120; i++) cam.update(1 / 60);
    expect(cam.zooming).toBe(false);
  });
});

describe('камера: скольжение после протяжки', () => {
  const run = (cam: IsoCamera, fps: number, secs: number) => {
    for (let i = 0; i < fps * secs; i++) cam.update(1 / fps);
  };

  test('отпущенная карта идёт дальше за рукой и останавливается: путь — скорость руки × 0,22 с', () => {
    const glide = settled();
    const pan = settled();
    glide.glideFrom(600, -300, 720);
    expect(glide.gliding).toBe(true);
    const t0 = glide.target.clone();
    // туда же, куда сдвиг протяжкой на скорость × τ
    pan.pan(600 * 0.22, -300 * 0.22, 720);
    const path = pan.target.distanceTo(t0);
    glide.update(1 / 60);
    // за первый кадр — только начало пути
    expect(glide.target.distanceTo(t0)).toBeGreaterThan(path * 0.03);
    expect(glide.target.distanceTo(t0)).toBeLessThan(path * 0.15);
    run(glide, 60, 3);
    expect(glide.gliding).toBe(false);
    // хвост медленнее 2 % высоты кадра в секунду отброшен
    expect(glide.target.distanceTo(pan.target)).toBeLessThan(0.3);
  });

  test('путь один при любой частоте кадров', () => {
    const slow = settled();
    const fast = settled();
    slow.glideFrom(-900, 400, 720);
    fast.glideFrom(-900, 400, 720);
    run(slow, 20, 3);
    run(fast, 144, 3);
    expect(slow.target.distanceTo(fast.target)).toBeLessThan(0.15);
  });

  test('не быстрее 2,5 высот кадра в секунду', () => {
    const cam = settled();
    const t0 = cam.target.clone();
    cam.glideFrom(1e6, 0, 720);
    run(cam, 60, 3);
    const most = settled();
    most.pan(2.5 * 720 * 0.22, 0, 720);
    expect(cam.target.distanceTo(t0)).toBeLessThan(most.target.distanceTo(t0) + 0.01);
    expect(cam.target.distanceTo(t0)).toBeGreaterThan(most.target.distanceTo(t0) - 0.3);
  });

  test('протяжка, колесо, полёт к человеку, «Следить», общий план и заданный масштаб — останавливают', () => {
    const stops: [string, (c: IsoCamera) => void][] = [
      ['протяжка', c => c.pan(1, 0, 720)],
      ['колесо', c => c.zoom(0.9, { x: 20, z: 20 })],
      ['полёт', c => c.flyTo(10, 10)],
      ['следить', c => c.track(10, 10, 1 / 60)],
      ['общий план', c => c.overview()],
      ['масштаб', c => {
        c.half = 12;
      }],
      ['взял рукой', c => c.stopGlide()],
    ];
    for (const [name, stop] of stops) {
      const cam = settled();
      cam.glideFrom(800, 0, 720);
      cam.update(1 / 60);
      stop(cam);
      expect([name, cam.gliding]).toEqual([name, false]);
    }
  });

  test('у края участка — стоп по этой оси, без отскока', () => {
    const cam = settled();
    // поворот 45°: сдвиг протяжкой влево ведёт точку взгляда к x+ и z−
    cam.target.set(64, 0, 20);
    cam.glideFrom(-1500, 0, 720);
    run(cam, 60, 0.5);
    expect(cam.target.x).toBe(65);
    const z = cam.target.z;
    expect(z).toBeLessThan(20);
    run(cam, 60, 3);
    expect(cam.target.x).toBe(65);
    expect(cam.gliding).toBe(false);
    expect(cam.target.z).toBeLessThanOrEqual(z);
  });
});

describe('скорость руки при отпускании', () => {
  test('по сдвигам последних 80 мс', () => {
    const v = releaseVelocity([0, 16, 32, 48].map(t => ({ t, dx: 10, dy: -4 })), 50)!;
    expect(v.x).toBeCloseTo(800, 6);
    expect(v.y).toBeCloseTo(-320, 6);
    const w = releaseVelocity([0, 40, 80, 120].map(t => ({ t, dx: 10, dy: 0 })), 125)!;
    expect(w.x).toBeCloseTo(20 / 0.045, 6);
  });

  test('рука перед отпусканием стояла дольше 50 мс или сдвигов нет — не скользит', () => {
    expect(releaseVelocity([0, 16, 32].map(t => ({ t, dx: 10, dy: 0 })), 90)).toBeNull();
    expect(releaseVelocity([], 10)).toBeNull();
  });
});
