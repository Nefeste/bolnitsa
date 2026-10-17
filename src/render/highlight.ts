// Выделение и наведение на карте (spec docs/specs/2026-10-aaa-polish.md, «Выделение и наведение»): у выбранного
// помещения — рамка по полу цветом акцента, у помещения под курсором — тихая белая; у выбранного человека — кольцо с
// пульсом, у человека под курсором — тонкое; вспышка пола помещения после стройки. Плоские сетки чуть выше пола: глубину
// не пишут, затенение их не видит. Рамка — чистая геометрия (`frameQuads`), её проверяют тесты (tools/test/highlight.test.ts).
import * as THREE from 'three';

/** Цвет выделения — акцент панелей (app/index.html, `--accent`). */
export const ACCENT = 0x2fb5c9;
/** Высота рамок и колец над полом, м: выше цвета слоя очередей (overlay.ts) и ниже людей. */
const Y = 0.04;
/** Ширина рамки помещения, м. */
export const FRAME_W = 0.14;

/**
 * Четыре полосы рамки по внутреннему краю помещения (x0, z0)–(x1, z1): треугольники (x, z подряд), по два на полосу.
 * Полосы лежат внутри прямоугольника, стыки — без наложений.
 */
export function frameQuads(x0: number, z0: number, x1: number, z1: number, t = FRAME_W): Float32Array {
  const w = Math.min(t, (x1 - x0) / 2, (z1 - z0) / 2);
  const quads: [number, number, number, number][] = [
    [x0, z0, x1, z0 + w],
    [x0, z1 - w, x1, z1],
    [x0, z0 + w, x0 + w, z1 - w],
    [x1 - w, z0 + w, x1, z1 - w],
  ];
  const out = new Float32Array(quads.length * 12);
  quads.forEach(([ax, az, bx, bz], i) => {
    out.set([ax, az, ax, bz, bx, bz, ax, az, bx, bz, bx, az], i * 12);
  });
  return out;
}

function frameGeometry(x0: number, z0: number, x1: number, z1: number): THREE.BufferGeometry {
  const q = frameQuads(x0, z0, x1, z1);
  const pos = new Float32Array((q.length / 2) * 3);
  for (let i = 0; i < q.length / 2; i++) {
    pos[i * 3] = q[i * 2];
    pos[i * 3 + 1] = 0;
    pos[i * 3 + 2] = q[i * 2 + 1];
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return g;
}

export interface RoomRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const flat = (color: number, opacity: number) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });

export class Highlight {
  readonly group = new THREE.Group();
  private sel = new THREE.Mesh(new THREE.BufferGeometry(), flat(ACCENT, 0.9));
  private hover = new THREE.Mesh(new THREE.BufferGeometry(), flat(0xffffff, 0.35));
  private flashes: { mesh: THREE.Mesh; t: number }[] = [];
  private selKey = '';
  private hoverKey = '';
  /** кольца у ног: выбранный — акцент с пульсом, под курсором — тонкое белое */
  readonly ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.54, 40).rotateX(-Math.PI / 2), flat(ACCENT, 0.95));
  readonly hoverRing = new THREE.Mesh(new THREE.RingGeometry(0.46, 0.52, 40).rotateX(-Math.PI / 2), flat(0xffffff, 0.6));
  private clock = 0;

  constructor() {
    this.group.name = 'highlight';
    this.group.renderOrder = 2;
    for (const m of [this.sel, this.hover, this.ring, this.hoverRing]) {
      m.visible = false;
      m.renderOrder = 2;
      this.group.add(m);
    }
  }

  /** Рамка по полу помещения `r` (внутри стен); null — нет. */
  private frame(mesh: THREE.Mesh, r: RoomRect | null, key: string, was: string): string {
    if (key === was) return was;
    mesh.geometry.dispose();
    if (!r) {
      mesh.visible = false;
      mesh.geometry = new THREE.BufferGeometry();
      return key;
    }
    mesh.geometry = frameGeometry(r.x + 1, r.y + 1, r.x + r.w - 1, r.y + r.h - 1);
    mesh.position.y = Y;
    mesh.visible = true;
    return key;
  }

  /** Каждый кадр: выбранное и наведённое помещение, кольца у выбранного и наведённого человека, вспышки гаснут. */
  update(dt: number, selected: RoomRect | null, hovered: RoomRect | null, person: { x: number; y: number; z: number } | null, under: { x: number; y: number; z: number } | null) {
    this.clock += dt;
    const key = (r: RoomRect | null) => (r ? `${r.x},${r.y},${r.w},${r.h}` : '');
    this.selKey = this.frame(this.sel, selected, key(selected), this.selKey);
    const h = hovered && key(hovered) !== key(selected) ? hovered : null;
    this.hoverKey = this.frame(this.hover, h, key(h), this.hoverKey);
    const pulse = 0.5 + 0.5 * Math.sin(this.clock * 4);
    (this.sel.material as THREE.MeshBasicMaterial).opacity = 0.7 + 0.25 * pulse;
    this.ring.visible = !!person;
    if (person) {
      this.ring.position.set(person.x, person.y + 0.02, person.z);
      const s = 1 + 0.08 * pulse;
      this.ring.scale.set(s, 1, s);
    }
    this.hoverRing.visible = !!under && (!person || under.x !== person.x || under.z !== person.z);
    if (under) this.hoverRing.position.set(under.x, under.y + 0.02, under.z);
    for (const f of this.flashes) {
      f.t += dt;
      (f.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.55 * (1 - f.t / 0.7));
    }
    for (const f of this.flashes.filter(x => x.t >= 0.7)) {
      this.group.remove(f.mesh);
      f.mesh.geometry.dispose();
      (f.mesh.material as THREE.Material).dispose();
    }
    this.flashes = this.flashes.filter(x => x.t < 0.7);
  }

  /** Вспышка пола помещения — отклик на стройку (spec, «Отклик на стройку»): белая, гаснет за 0,7 с; `ok` — не красная. */
  flash(r: RoomRect, ok = true) {
    const g = new THREE.PlaneGeometry(Math.max(0.5, r.w - 2), Math.max(0.5, r.h - 2)).rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, flat(ok ? 0xffffff : 0xe0533f, 0.55));
    m.position.set(r.x + r.w / 2, Y + 0.01, r.y + r.h / 2);
    m.renderOrder = 2;
    this.group.add(m);
    this.flashes.push({ mesh: m, t: 0 });
  }

  /** Сколько вспышек гаснет сейчас — для проверок. */
  get flashing(): number {
    return this.flashes.length;
  }
}
