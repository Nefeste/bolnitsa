// Одеяло на лежащих (spec docs/specs/2026-10-people.md, часть 2б): лежащего на кровати укрывает одеяло — от груди до ног,
// по высоте живота, ног и носков его вида; на кушетке, столе, аппарате и каталке одеяла нет.
import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { CATALOG, EXTRA_MODELS } from '../../src/render/catalog';
import { Crowd } from '../../src/render/crowd';
import { furnish } from '../../src/render/furniture';
import { Paths } from '../../src/render/path';
import { type Paint, PeopleView } from '../../src/render/people';
import { Places, spotOn } from '../../src/render/place';
import { buildDb } from '../content/load';
import { bakedPeople, furnitureModels, presetLayout } from './render-kit';

const { db } = buildDb();

describe('одеяло', () => {
  test('лежащий на кровати — под одеялом своей высоты; на кушетке — без', async () => {
    const { layout } = presetLayout(db, 'preset.city');
    const names = [...new Set([...Object.values(CATALOG).flatMap(e => ('model' in e ? [e.model] : [])), ...EXTRA_MODELS])];
    const fur = furnish(layout, await furnitureModels(names));
    const people = await bakedPeople();
    const beds = fur.lies.flatMap((a, t) => (a?.bed ? [t] : []));
    const others = fur.lies.flatMap((a, t) => (a && !a.bed ? [t] : []));
    expect(beds.length).toBeGreaterThan(5);
    expect(others.length).toBeGreaterThan(0);
    const inBed = spotOn(layout, fur, beds[0], 'act', 60);
    const onCouch = spotOn(layout, fur, others[0], 'act', 60);
    expect([inBed.pose, inBed.bed, onCouch.pose, onCouch.bed]).toEqual(['lie', true, 'lie', undefined]);

    const walk = layout.walk.slice();
    const crowd = new Crowd(layout, new Paths(layout.w, layout.h, walk, new Uint8Array(layout.w * layout.h).fill(1)), people.looks);
    const look = people.looks.findIndex(l => l.spec.use === 'patient');
    const a = crowd.add('p:1', look, inBed, false);
    crowd.settle(a, inBed);
    crowd.settle(crowd.add('p:2', look, onCouch, false), onCouch);
    expect([a.state, a.lie]).toEqual(['lie', 1]);

    const view = new PeopleView(people, 8);
    const paint = (): Paint => ({ clothes: new THREE.Color(1, 1, 1), tone: [-1, 0, 0, 1] });
    view.update(crowd, paint, new THREE.Vector3(a.x, 0, a.z), 1000, true);
    expect(view.blanketCount).toBe(1);

    // одеяло — над постелью, вдоль тела: от груди до ног и чуть дальше; высоты — не ниже тела
    const l = people.looks[look];
    const m = view.blanketOf(a, new THREE.Matrix4(), new Float32Array(3), 0);
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3();
    m.decompose(pos, new THREE.Quaternion(), scale);
    expect(pos.y).toBeCloseTo(a.y, 5);
    expect(scale.z).toBeGreaterThan(0.7 * l.height);
    expect(scale.z).toBeLessThan(0.8 * l.height);
    const lift = new Float32Array(3);
    view.blanketOf(a, new THREE.Matrix4(), lift, 0);
    expect([lift[0] > l.lie.toes, lift[1] > l.lie.legs, lift[2] > l.lie.belly]).toEqual([true, true, true]);
  });

  test('у каждого вида высоты лёжа — правдоподобные: живот, ноги и носки — 15–45 см над постелью', async () => {
    const people = await bakedPeople();
    for (const l of people.looks) {
      for (const h of [l.lie.belly, l.lie.legs, l.lie.toes]) expect([l.name, h > 0.15 && h < 0.45]).toEqual([l.name, true]);
    }
  });
});
