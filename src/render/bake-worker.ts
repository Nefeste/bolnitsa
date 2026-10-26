// Поток запекания людей (spec docs/specs/2026-10-people.md, «Производительность»): виды Rocketbox грузятся и запекаются
// здесь, в нескольких таких потоках сразу, а не в окне — 59 видов окно запекало бы полторы секунды. Окно получает готовые
// сетки, кадры и атлас без копии (bake.ts, toWire / fromWire).
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { bakeLook, toWire, type WireLook } from './bake';

/** Окну — поток: что запечь — папка видов (адрес целиком) и имена. */
export interface BakeTask {
  base: string;
  names: string[];
}
/** Поток — окну: вид готов, вид не вышел, всё. */
export type Baked = { kind: 'look'; look: WireLook } | { kind: 'error'; name: string; message: string } | { kind: 'done' };

interface Scope {
  onmessage: ((e: MessageEvent<BakeTask>) => void) | null;
  postMessage(msg: Baked, transfer?: Transferable[]): void;
}
const scope = self as unknown as Scope;

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

// все виды грузятся сразу (атласы распаковываются в своих потоках браузера), запекается — какой готов
scope.onmessage = async e => {
  await Promise.all(
    e.data.names.map(async name => {
      try {
        const { look, transfer } = toWire(bakeLook(await loader.loadAsync(`${e.data.base}/${name}.glb`), name));
        scope.postMessage({ kind: 'look', look }, transfer);
      } catch (err) {
        scope.postMessage({ kind: 'error', name, message: err instanceof Error ? err.message : String(err) });
      }
    }),
  );
  scope.postMessage({ kind: 'done' });
};
