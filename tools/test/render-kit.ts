// Для тестов 3D-вида (spec docs/specs/2026-10-shell-3d.md, «Тесты»): модели из assets/models без браузера — тот же
// GLTFLoader и тот же разбор, что в игре; больница пресета или одно помещение у коридора.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ContentDb, Id, RoomSizeId, Rot } from '../../src/content/types';
import { emptyPlot, build, planOf, presetHospital, type HospitalState, dims, sizeOf } from '../../src/engine/hospital/build';
import { presetStaff, type StaffMember } from '../../src/engine/hospital/staff';
import { bakeLook, packPeople, type People } from '../../src/render/bake';
import { layoutOf, type Layout } from '../../src/render/layout';
import { type Index, type Model, modelOf } from '../../src/render/models';

export const MODELS = join(import.meta.dir, '../../assets/models');
export const index = JSON.parse(readFileSync(join(MODELS, 'index.json'), 'utf8')) as Index;

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
// картинок в Bun нет: текстуры (атлас KayKit) пропускаются молча, а не предупреждением на каждую модель
loader.register(() => ({ name: 'tests-no-images', loadTexture: () => Promise.resolve(null) as unknown as Promise<THREE.Texture> }));
// атлас Rocketbox — WebP: расширение под тем же именем, что встроенное, его подменяет — без попытки декодировать картинку
loader.register(() => ({ name: 'EXT_texture_webp', loadTexture: () => Promise.resolve(null) as unknown as Promise<THREE.Texture> }));

export async function gltfOf(name: string): Promise<{ scene: THREE.Object3D; animations: THREE.AnimationClip[] }> {
  const buf = readFileSync(join(MODELS, `${name}.glb`));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  return new Promise((res, rej) => loader.parse(ab, '', g => res(g as never), rej));
}

/** Мебель без текстур (атлас KayKit в Bun не грузится: картинки — в браузере). */
export async function furnitureModels(names: string[]): Promise<Map<string, Model>> {
  const out = new Map<string, Model>();
  for (const n of names) out.set(n, modelOf(await gltfOf(n), n));
  return out;
}

/** Люди Rocketbox (spec docs/specs/2026-10-people.md; tools/app/people.mjs): виды набора. */
export const rocketboxIndex = JSON.parse(readFileSync(join(MODELS, 'rocketbox', 'index.json'), 'utf8')) as { looks: string[] };

let people: People | undefined;
/** Все виды людей, запечённые как в игре: упрощённая модель — из файла. */
export async function bakedPeople(): Promise<People> {
  if (people) return people;
  const raws = [];
  for (const n of rocketboxIndex.looks) raws.push(bakeLook(await gltfOf(`rocketbox/${n}`), n));
  people = packPeople(raws);
  return people;
}

/** Больница пресета, план и раскладка. */
export function presetLayout(db: ContentDb, id: Id): { hospital: HospitalState; staff: StaffMember[]; layout: Layout } {
  const rec = db.presets[id];
  const { hospital } = presetHospital(db, rec);
  const staff = presetStaff(db, rec);
  const plan = planOf(db, hospital);
  return { hospital, staff, layout: layoutOf(db, plan, hospital.decor, staffCells(plan, staff, db)) };
}

/** Клетки персонала на местах — к ним повёрнуты столы. */
export function staffCells(plan: ReturnType<typeof planOf>, staff: StaffMember[], db: ContentDb): [number, number][] {
  const out: [number, number][] = [];
  for (const m of staff) {
    const r = plan.rooms.find(x => x.id === m.room);
    const role = db.roles[m.role]?.stands ?? m.role;
    const c = r?.staff[role] ?? r?.staff[m.role];
    if (c) out.push([c[0], c[1]]);
  }
  return out;
}

/** Одно помещение на участке, вокруг — кольцо коридора, вход слева: так дверь любой стороны выходит в коридор. */
export function oneRoom(db: ContentDb, type: Id, size: RoomSizeId, rot: Rot): HospitalState {
  const z = sizeOf(db, type, size)!;
  const [w, h] = dims(z, rot);
  const W = w + 4;
  const H = h + 4;
  const ring: [number, number][] = [];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (x === 1 || y === 1 || x === W - 2 || y === H - 2) ring.push([x, y]);
  let s = { hospital: emptyPlot(W, H, [0, 2], ring), cash: Number.MAX_SAFE_INTEGER };
  const r = build(db, s, { kind: 'room', type, size, x: 2, y: 2, rot });
  if (!r.ok) throw new Error(`${type} ${size} rot ${rot}: ${JSON.stringify(r.error)}`);
  s = r.state;
  // аппараты на все места шаблона
  const slotsOf = z.slotsOf ?? {};
  const want: Id[] = [];
  for (const [eq, idx] of Object.entries(slotsOf)) for (const _ of idx) want.push(eq);
  if (!want.length) for (const eq of Object.values(db.equipment)) if (eq.rooms.includes(type)) {
    for (let i = 0; i < z.slots.length; i++) want.push(eq.id);
    break;
  }
  for (const eq of want) {
    const b = build(db, s, { kind: 'buy', room: 'r1', equipment: eq });
    if (b.ok) s = b.state;
  }
  return s.hospital;
}
