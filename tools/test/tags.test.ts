// Подписи помещений на среднем плане (spec docs/specs/2026-10-aaa-polish.md, «Подписи помещений на среднем плане»): видны
// только на среднем плане и плавно проявляются; первыми — большие помещения; подпись шире своего помещения на экране или
// налезающая на соседнюю или на значок состояния не рисуется. На плане городской больницы камерой игры — без DOM и WebGL.
import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { candsOf, fadeOf, placeTags, type Box, type TagCand, TAG_GAP, TAG_ZOOM, type TagRow } from '../../src/app/tags';
import { db } from '../../src/content';
import { planOfSite } from '../../src/engine/hospital/site';
import { siteOfPreset } from '../../src/engine/hospital/site-preset';
import { named } from '../../src/i18n';
import { IsoCamera } from '../../src/render/view';

const cand = (id: string, x: number, y: number, w: number, area: number, room = 1000): TagCand => ({ id, text: id, box: { x, y, w, h: 18 }, room, area });
const overlaps = (a: Box, b: Box) => Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.y - b.y) * 2 < a.h + b.h;

describe('подписи помещений: на каком плане видны', () => {
  test('ближе и дальше среднего плана их нет, между — видны целиком, по краям проявляются плавно', () => {
    const { in0, in1, out1, out0 } = TAG_ZOOM;
    for (const h of [3, in0, out0, 45, 60, Number.NaN]) expect([h, fadeOf(h)]).toEqual([h, 0]);
    // общий план городской больницы — 31 м (Home): подписи на нём целиком
    for (const h of [in1, 9, 14, 22, 31, out1]) expect([h, fadeOf(h)]).toEqual([h, 1]);
    expect(fadeOf((in0 + in1) / 2)).toBeCloseTo(0.5, 6);
    expect(fadeOf((out1 + out0) / 2)).toBeCloseTo(0.5, 6);
    // проявляются и гаснут без скачков
    let prev = 0;
    for (let h = in0; h <= in1; h += 0.25) {
      expect(fadeOf(h)).toBeGreaterThanOrEqual(prev);
      prev = fadeOf(h);
    }
    for (let h = out1; h <= out0; h += 0.25) {
      expect(fadeOf(h)).toBeLessThanOrEqual(prev);
      prev = fadeOf(h);
    }
  });
});

describe('подписи помещений: какие рисовать', () => {
  test('налезают — остаётся подпись большего помещения; при равных — по номеру', () => {
    expect(placeTags([cand('a', 100, 100, 80, 20), cand('b', 130, 104, 80, 40)], []).map(c => c.id)).toEqual(['b']);
    expect(placeTags([cand('b', 100, 100, 80, 20), cand('a', 130, 104, 80, 20)], []).map(c => c.id)).toEqual(['a']);
  });

  test('не налезают — все; зазор между ними — не меньше TAG_GAP', () => {
    // 80 в ширину: между краями TAG_GAP − 1 точек — налезают, TAG_GAP — уже нет
    expect(placeTags([cand('a', 100, 100, 80, 20), cand('b', 100 + 80 + TAG_GAP - 1, 100, 80, 10)], []).map(c => c.id)).toEqual(['a']);
    expect(placeTags([cand('a', 100, 100, 80, 20), cand('b', 100 + 80 + TAG_GAP, 100, 80, 10)], []).map(c => c.id)).toEqual(['a', 'b']);
    expect(placeTags([cand('a', 100, 100, 80, 20), cand('b', 100, 140, 80, 10)], []).map(c => c.id)).toEqual(['a', 'b']);
  });

  test('шире своего помещения на экране — нет', () => {
    expect(placeTags([cand('a', 100, 100, 80, 20, 79), cand('b', 300, 100, 80, 10, 80)], []).map(c => c.id)).toEqual(['b']);
  });

  test('значок состояния (chips.ts) — помеха: подпись на нём не рисуется', () => {
    const chip: Box = { x: 100, y: 96, w: 70, h: 18 };
    expect(placeTags([cand('a', 100, 100, 80, 20), cand('b', 400, 100, 80, 10)], [chip]).map(c => c.id)).toEqual(['b']);
  });
});

describe('подписи помещений в городской больнице', () => {
  const site = siteOfPreset(db, db.presets['preset.city']);
  const plan = planOfSite(db, site);
  const rows: TagRow[] = plan.rooms.map(r => ({ id: r.id, x: r.x, z: r.y, w: r.w, h: r.h, text: named(db.rooms[r.type]?.name, r.type) }));
  const W = 1280;
  const H = 720;
  /** Табличка: 12 точек текста — около 6,6 точки на букву, поля 6 и 2 (tags.ts, `plate`). */
  const size = (text: string) => ({ w: Math.ceil(text.length * 6.6) + 12, h: 20 });
  /** Подписи при этом масштабе и середине кадра — камерой игры. */
  function at(half: number, x: number, z: number) {
    const cam = new IsoCamera(plan.grid.w, plan.grid.h);
    cam.aspect = W / H;
    for (let i = 0; i < 30; i++) cam.update(1 / 30);
    cam.target.set(x, 0, z);
    cam.half = half;
    cam.update(0);
    const camera = cam.camera;
    camera.updateMatrixWorld();
    const v = new THREE.Vector3();
    const project = (px: number, pz: number, py = 0) => {
      v.set(px, py, pz).project(camera);
      return { x: ((v.x + 1) / 2) * W, y: ((1 - v.y) / 2) * H, z: v.z };
    };
    const cands = candsOf(rows, project, size, { left: 0, top: 0, right: W, bottom: H });
    return { cands, placed: placeTags(cands, []) };
  }
  const hall = plan.rooms.find(r => r.type === 'room.waiting')!;

  test('на среднем плане у зала ожидания — подписи соседних помещений, ни одна не налезает и не шире помещения', () => {
    const { cands, placed } = at(14, hall.x + hall.w / 2, hall.y + hall.h / 2);
    expect(cands.length).toBeGreaterThan(8);
    expect(placed.length).toBeGreaterThan(5);
    expect(placed.map(p => p.id)).toContain(hall.id);
    for (const p of placed) expect(p.box.w).toBeLessThanOrEqual(p.room);
    for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) expect([placed[i].id, placed[j].id, overlaps(placed[i].box, placed[j].box)]).toEqual([placed[i].id, placed[j].id, false]);
  });

  test('на общем плане помещения мельче — подписей меньше, остаются большие', () => {
    const mid = at(14, plan.grid.w / 2, plan.grid.h / 2).placed;
    const far = at(30, plan.grid.w / 2, plan.grid.h / 2).placed;
    expect(far.length).toBeGreaterThan(0);
    const area = (ps: TagCand[]) => ps.reduce((s, p) => s + p.area, 0) / ps.length;
    expect(area(far)).toBeGreaterThan(area(mid));
  });
});
