// Типы для упростителя meshoptimizer из примеров three (у @types/three их нет); сигнатуры — по
// node_modules/three/examples/jsm/libs/meshopt_simplifier.module.js.
declare module 'three/addons/libs/meshopt_simplifier.module.js' {
  export const MeshoptSimplifier: {
    ready: Promise<void>;
    simplify(indices: Uint32Array, positions: Float32Array, stride: number, targetIndexCount: number, targetError: number, flags?: string[]): [Uint32Array, number];
    simplifySloppy(indices: Uint32Array, positions: Float32Array, stride: number, lock: Uint8Array | null, targetIndexCount: number, targetError: number): [Uint32Array, number];
  };
}
