// «Свет, часть 2» (spec docs/specs/2026-10-aaa-polish.md): крыша для теней — над всем зданием и только над ним; стены
// отбрасывают тень в полную высоту, стекло солнце пропускает; цвет кадра и виньетка по часу; тень солнца — 85 %.
import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { db } from '../../src/content';
import { CELL } from '../../src/engine/hospital/grid';
import { Daylight } from '../../src/render/view';
import { buildRoof, buildWalls, WALL_H } from '../../src/render/world';
import { presetLayout } from './render-kit';

const { layout } = presetLayout(db, 'preset.city');

describe('крыша для теней', () => {
  const roof = buildRoof(layout);
  const pos = roof.geometry.getAttribute('position');

  test('закрывает каждую клетку здания и ни одной клетки улицы, на высоте стен', () => {
    let area = 0;
    for (let i = 0; i < pos.count; i += 3) {
      const [ax, az, bx, bz, cx, cz] = [pos.getX(i), pos.getZ(i), pos.getX(i + 1), pos.getZ(i + 1), pos.getX(i + 2), pos.getZ(i + 2)];
      area += Math.abs((bx - ax) * (cz - az) - (cx - ax) * (bz - az)) / 2;
      const cell = Math.floor((az + bz + cz) / 3) * layout.w + Math.floor((ax + bx + cx) / 3);
      expect(layout.plan.grid.cells[cell]).not.toBe(CELL.outside);
    }
    const building = [...layout.plan.grid.cells].filter(c => c !== CELL.outside).length;
    expect(area).toBeCloseTo(building, 6);
    for (let i = 0; i < pos.count; i++) expect(pos.getY(i)).toBeCloseTo(WALL_H, 5);
  });

  test('в кадре её нет, а тень от неё есть — с обеих сторон', () => {
    const mat = roof.material as THREE.MeshBasicMaterial;
    expect(mat.colorWrite).toBe(false);
    expect(mat.depthWrite).toBe(false);
    expect(mat.shadowSide).toBe(THREE.DoubleSide);
    expect(roof.castShadow).toBe(true);
  });

  test('тень стен — в полную высоту при любом срезе, стекло её не даёт', () => {
    const depth = buildWalls(layout).mesh.customDepthMaterial!;
    const s = { vertexShader: THREE.ShaderLib.depth.vertexShader, fragmentShader: THREE.ShaderLib.depth.fragmentShader, uniforms: {} };
    depth.onBeforeCompile(s as never, undefined as never);
    expect(s.vertexShader).not.toContain('wallCut');
    expect(s.fragmentShader).toContain('discard');
  });
});

describe('цвет кадра по часу', () => {
  const light = new Daylight(new THREE.Scene(), layout.w, layout.h);

  test('полдень ровный, вечер тёплый, рассвет и ночь холоднее; ночью виньетка сильнее', () => {
    light.setHour(13);
    expect([light.grade.r, light.grade.g, light.grade.b]).toEqual([1, 1, 1]);
    expect(light.vignette).toBeCloseTo(0.2, 6);
    light.setHour(18);
    expect(light.grade.r).toBeGreaterThan(1);
    expect(light.grade.b).toBeLessThan(1);
    light.setHour(7.5);
    expect(light.grade.b).toBeGreaterThan(light.grade.r);
    light.setHour(23);
    expect(light.grade.b).toBeGreaterThan(light.grade.r);
    expect(light.vignette).toBeCloseTo(0.3, 6);
  });

  test('тень солнца пропускает 15 %: у мебели под крышей остаются мягкие тени', () => {
    expect(light.sun.shadow.intensity).toBe(0.85);
  });
});
