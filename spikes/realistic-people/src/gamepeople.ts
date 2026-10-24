// Нынешние люди игры (Quaternius, CC0) — тем же кодом, что в игре: bakeLook → packPeople (упрощение до 25 %) → PeopleView
// (анимация в шейдере, цвет одежды и кожи на экземпляр). Толпа — подделка с теми полями, которые читает PeopleView.
import * as THREE from 'three';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { MeshoptSimplifier } from 'three/addons/libs/meshopt_simplifier.module.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { bakeLook, lodOf, packPeople, type People } from '../../../src/render/bake';
import { CLOTHES, COAT, SKIN } from '../../../src/render/cast';
import type { Crowd, Walker } from '../../../src/render/crowd';
import { PeopleView } from '../../../src/render/people';
import { ms } from './probe';

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

export interface GamePerson {
  look: string;
  x: number;
  z: number;
  heading: number;
  clothes: number;
  skin: number;
}

export interface GamePeople {
  people: People;
  view: PeopleView;
  loadMs: number;
  /** поставить людей и обновить экземпляры; `full` — полная модель (иначе упрощённая, как на общем плане игры) */
  place(list: GamePerson[], full: boolean): void;
}

export async function loadGamePeople(names: string[]): Promise<GamePeople> {
  const t0 = performance.now();
  await MeshoptSimplifier.ready;
  const raws = await Promise.all(names.map(async n => bakeLook(await loader.loadAsync(`game/people/${n}.glb`), n)));
  const people = packPeople(raws, raws.map(r => lodOf(r, 0.25, MeshoptSimplifier)));
  const view = new PeopleView(people, 32);
  const loadMs = ms(t0);
  const place = (list: GamePerson[], full: boolean) => {
    const walkers = new Map<string, Walker>();
    const paints = new Map<string, { clothes: THREE.Color; skin: THREE.Color }>();
    list.forEach((p, i) => {
      const key = `g${i}`;
      const w = { key, look: names.indexOf(p.look), x: p.x, y: 0, z: p.z, heading: p.heading, lie: 0, clip: 0, clipTime: 0.6, loop: true } as unknown as Walker;
      walkers.set(key, w);
      paints.set(key, { clothes: new THREE.Color(p.clothes), skin: new THREE.Color(p.skin) });
    });
    view.update({ walkers } as unknown as Crowd, w => paints.get(w.key)!, new THREE.Vector3(), 1000, full);
  };
  return { people, view, loadMs, place };
}

export { CLOTHES, COAT, SKIN };
