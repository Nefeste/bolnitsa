// Появление мебели (spec docs/specs/2026-10-aaa-polish.md, «Появление мебели»; пункт 4 этапа Б): после стройки новая вещь
// вырастает из пола с лёгким перелётом — меньше половины секунды, вещи помещения одна за другой. Мебель больницы слита в
// несколько больших сеток (furniture.ts), поэтому вещь растёт в вершинном шейдере: у каждой вершины — номер её вещи
// (`owner`), в маленькой текстуре по номеру — середина вещи на полу и когда она появилась. Тот же шейдер — у глубины тени,
// а затенение GTAO берёт глубину из прохода с настоящими материалами (post.ts): вещь растёт и в тени, и в затенении. Старые
// вещи и первая раскладка не растут; «меньше движения» в системе — без роста. Чистые функции проверяет
// tools/test/appear.test.ts.
import * as THREE from 'three';

/** Рост: длительность, с; размер в начале — доля; вещи одна за другой — через `stagger` с, но вся стройка — не дольше `last` с. */
export const APPEAR = { dur: 0.42, from: 0.55, stagger: 0.03, last: 0.45 } as const;

/** Перелёт «назад» (ease-out-back): к 1 через чуть больше 1. */
const C1 = 1.70158;

/** Размер вещи через `t` с после её появления: до появления — 0 (её нет), потом от `from` с перелётом к 1. */
export function appearScale(t: number): number {
  if (t < 0) return 0;
  const a = Math.min(1, t / APPEAR.dur);
  const u = a - 1;
  const e = 1 + (C1 + 1) * u * u * u + C1 * u * u;
  return APPEAR.from + (1 - APPEAR.from) * e;
}

/** Давно — так далеко в прошлом, что рост кончился. */
export const LONG_AGO = -1e6;

/**
 * Когда появилась каждая вещь: новые (их ключа не было в прошлой раскладке) — с `now`, одна за другой; старые и вся первая
 * раскладка (`prev` нет) — давно.
 */
export function bornOf(keys: readonly string[], prev: ReadonlySet<string> | null, now: number): Float32Array {
  const born = new Float32Array(keys.length).fill(LONG_AGO);
  if (!prev) return born;
  let i = 0;
  keys.forEach((k, n) => {
    if (prev.has(k)) return;
    born[n] = now + Math.min(APPEAR.last, i * APPEAR.stagger);
    i++;
  });
  return born;
}

/** Строк в текстуре вещей — по 256 вещей. */
const WIDTH = 256;

const PARS = /* glsl */ `
attribute float owner;
uniform highp sampler2D uAppear;
uniform float uAppearNow;
`;

const BEGIN = /* glsl */ `#include <begin_vertex>
if ( owner >= 0.0 ) {
  float oi = floor( owner + 0.5 );
  vec4 ap = texelFetch( uAppear, ivec2( int( mod( oi, ${WIDTH}.0 ) ), int( floor( oi / ${WIDTH}.0 ) ) ), 0 );
  float at = ( uAppearNow - ap.z ) / ${APPEAR.dur.toFixed(3)};
  if ( at < 1.0 ) {
    float s = 0.0;
    if ( at >= 0.0 ) {
      float u = at - 1.0;
      float e = 1.0 + ${(C1 + 1).toFixed(5)} * u * u * u + ${C1.toFixed(5)} * u * u;
      s = ${APPEAR.from.toFixed(3)} + ${(1 - APPEAR.from).toFixed(3)} * e;
    }
    transformed.xz = ap.xy + ( transformed.xz - ap.xy ) * s;
    transformed.y *= s;
  }
}
`;

/** «Меньше движения» в системе: мебель появляется сразу. */
function reduced(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export class Appear {
  private keys = new Set<string>();
  private born: Float32Array = new Float32Array(0);
  private readonly t0 = performance.now();
  readonly uniforms = {
    uAppear: { value: new THREE.DataTexture(new Float32Array(4), 1, 1, THREE.RGBAFormat, THREE.FloatType) as THREE.DataTexture },
    uAppearNow: { value: 0 },
  };
  /** сколько вещей выросло при последней стройке — для сценария в браузере */
  last = 0;

  /** Секунды часов роста — с создания сцены: у float32 в шейдере точности хватает. */
  now(): number {
    return (performance.now() - this.t0) / 1000;
  }

  /**
   * Новая раскладка: вещи (ключ и середина на полу) — в текстуру; новые растут с этой минуты. `first` — первая раскладка
   * сцены: ничего не растёт.
   */
  set(owners: readonly { key: string; x: number; z: number }[], first: boolean) {
    const keys = owners.map(o => o.key);
    const born = bornOf(keys, first || reduced() ? null : this.keys, this.now());
    this.keys = new Set(keys);
    this.born = born;
    this.last = born.reduce((n, b) => (b > LONG_AGO ? n + 1 : n), 0);
    const rows = Math.max(1, Math.ceil(owners.length / WIDTH));
    const data = new Float32Array(WIDTH * rows * 4);
    owners.forEach((o, i) => {
      data[i * 4] = o.x;
      data[i * 4 + 1] = o.z;
      data[i * 4 + 2] = born[i];
    });
    const tex = new THREE.DataTexture(data, WIDTH, rows, THREE.RGBAFormat, THREE.FloatType);
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    this.uniforms.uAppear.value.dispose();
    this.uniforms.uAppear.value = tex;
  }

  /** Каждый кадр: часы роста — в шейдер. */
  tick() {
    this.uniforms.uAppearNow.value = this.now();
  }

  /** Сколько вещей растёт сейчас — для сценария в браузере. */
  growing(): number {
    const now = this.now();
    let n = 0;
    for (const b of this.born) if (b > LONG_AGO && now - b < APPEAR.dur) n++;
    return n;
  }

  /** Материал мебели (и его глубина для тени) — с ростом: тот же патч, общие часы и текстура. */
  patch<M extends THREE.Material>(mat: M, key: string): M {
    mat.onBeforeCompile = shader => {
      shader.uniforms.uAppear = this.uniforms.uAppear;
      shader.uniforms.uAppearNow = this.uniforms.uAppearNow;
      shader.vertexShader = `${PARS}${shader.vertexShader}`.replace('#include <begin_vertex>', BEGIN);
    };
    mat.customProgramCacheKey = () => `appear-${key}`;
    return mat;
  }
}
