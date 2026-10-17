// Значки над людьми (spec docs/specs/2026-10-flow-ui.md, «Значки над людьми»; геймдизайн §13): ждёт долго, недоволен,
// просит. Нарисованы кодом на холсте (атлас), повёрнуты к камере в вершинном шейдере, один вызов отрисовки на всех.
// Рисуются отдельным проходом поверх готового кадра (stage.ts, `over`): после затенения и перевода в тон — цвета те же, что
// в атласе, и видны сквозь стены. Ромб срочности остаётся, как был, — значок встаёт над ним.
import * as THREE from 'three';
import type { Crowd, Walker } from './crowd';

/** Значки атласа по порядку. */
export const ICONS = ['long', 'unhappy', 'ask'] as const;
export type IconKind = (typeof ICONS)[number];

/** Клетка атласа, точек; значок — с полями, чтобы уменьшенные копии не захватывали соседа. */
const CELL = 64;
const PAD = 5;

/** Цвета значков — как полосы срочности и кнопки панелей (app/index.html). */
const FILL: Record<IconKind, string> = { long: '#e7b416', unhappy: '#d8392b', ask: '#2fb5c9' };

function drawIcon(g: CanvasRenderingContext2D, kind: IconKind, x0: number) {
  const cx = x0 + CELL / 2;
  const cy = CELL / 2;
  const r = CELL / 2 - PAD;
  g.save();
  // круг с тёмной каймой: читается и на светлом полу, и на тёмном фоне
  g.beginPath();
  if (kind === 'ask') {
    // облачко реплики с хвостиком вниз
    g.arc(cx, cy - 3, r - 3, 0, Math.PI * 2);
    g.moveTo(cx - 9, cy + r - 9);
    g.lineTo(cx - 2, cy + r + 2);
    g.lineTo(cx + 5, cy + r - 9);
  } else g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fillStyle = FILL[kind];
  g.fill();
  g.lineWidth = 3;
  g.strokeStyle = 'rgba(12, 20, 24, 0.9)';
  g.stroke();
  g.fillStyle = '#ffffff';
  g.strokeStyle = '#ffffff';
  g.lineCap = 'round';
  if (kind === 'long') {
    // часы: циферблат и две стрелки
    g.lineWidth = 4;
    g.beginPath();
    g.arc(cx, cy, r - 9, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx, cy - (r - 15));
    g.moveTo(cx, cy);
    g.lineTo(cx + (r - 18), cy + 2);
    g.stroke();
  } else if (kind === 'unhappy') {
    // недовольное лицо: глаза и рот дугой вниз
    g.beginPath();
    g.arc(cx - 8, cy - 6, 3.6, 0, Math.PI * 2);
    g.arc(cx + 8, cy - 6, 3.6, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 4;
    g.beginPath();
    g.arc(cx, cy + 15, 11, Math.PI * 1.15, Math.PI * 1.85);
    g.stroke();
  } else {
    // вопрос — знак ASCII, любой шрифт его знает
    g.font = 'bold 34px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('?', cx, cy - 2);
  }
  g.restore();
}

function atlas(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = CELL * ICONS.length;
  c.height = CELL;
  const g = c.getContext('2d')!;
  ICONS.forEach((k, i) => drawIcon(g, k, i * CELL));
  const tex = new THREE.CanvasTexture(c);
  // как есть: проход рисует прямо в кадр экрана, без перевода цвета
  tex.colorSpace = THREE.NoColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

const VERTEX = /* glsl */ `
attribute float aIcon;
uniform float uSize;
uniform float uCount;
varying vec2 vUv;
void main() {
  // середина значка — из матрицы экземпляра; сам значок — в плоскости экрана (повёрнут к камере)
  vec4 c = viewMatrix * modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  c.xy += position.xy * uSize;
  gl_Position = projectionMatrix * c;
  vUv = vec2((uv.x + aIcon) / uCount, uv.y);
}
`;
const FRAGMENT = /* glsl */ `
uniform sampler2D uMap;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(uMap, vUv);
  if (c.a < 0.03) discard;
  gl_FragColor = c;
}
`;

/** Над головой: стоит — выше, сидит — ниже, лежит — над постелью; ромб срочности — между головой и значком. */
export function headOf(w: Walker): number {
  const lying = w.lie > 0.5;
  const sitting = w.state === 'sit' || w.state === 'sitDown' || w.state === 'standUp';
  return lying ? w.y + 0.75 : sitting ? w.y + 1.5 : w.y + 2.0;
}

export class Icons {
  readonly mesh: THREE.InstancedMesh;
  private kind: THREE.InstancedBufferAttribute;
  private m4 = new THREE.Matrix4();
  /** сколько значков в последнем кадре — для сценария в браузере */
  shown: Record<IconKind, number> = { long: 0, unhappy: 0, ask: 0 };

  constructor(capacity: number) {
    const geo = new THREE.PlaneGeometry(1, 1);
    this.kind = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
    geo.setAttribute('aIcon', this.kind);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: atlas() }, uSize: { value: 0.6 }, uCount: { value: ICONS.length } },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
  }

  /**
   * Каждый кадр: значок — у тех, кому он есть (`iconOf`: номер в `ICONS` или -1), над головой; размер растёт с отдалением
   * камеры (`half` — половина высоты кадра, м), чтобы читаться и на общем плане.
   */
  update(crowd: Crowd, iconOf: (w: Walker) => number, half: number) {
    let n = 0;
    const shown = { long: 0, unhappy: 0, ask: 0 };
    const cap = this.kind.count;
    for (const w of crowd.walkers.values()) {
      if (w.staff || n >= cap) continue;
      const k = iconOf(w);
      if (k < 0) continue;
      this.m4.makeTranslation(w.x, headOf(w) + 0.7, w.z);
      this.mesh.setMatrixAt(n, this.m4);
      this.kind.setX(n, k);
      shown[ICONS[k]]++;
      n++;
    }
    this.shown = shown;
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.kind.needsUpdate = true;
    (this.mesh.material as THREE.ShaderMaterial).uniforms.uSize.value = THREE.MathUtils.clamp(half * 0.06, 0.6, 2.2);
  }
}
