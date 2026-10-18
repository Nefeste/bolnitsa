// Камера (spec docs/specs/2026-10-aaa-polish.md, «Камера»): масштаб колесом идёт плавно, за несколько кадров, и точка земли
// под курсором остаётся на своём месте экрана; масштаб, заданный прямо (снимки, сценарий, бенч, общий план), — сразу;
// пределы масштаба держатся. Чистая математика Three.js без DOM и WebGL.
import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { IsoCamera } from '../../src/render/view';

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
