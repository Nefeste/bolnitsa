// Слой «Очереди и загрузка» (spec docs/specs/2026-10-flow-ui.md; геймдизайн §3 «Слои карты»): пол помещения окрашен по
// ожиданию и загрузке. Полупрозрачные плоскости чуть выше пола, по одной на помещение плана; глубину не пишут — люди и
// мебель их закрывают, затенение их не видит. Цвета считает окно (src/app/flow.ts, `tintOf`), здесь — только показать.
import * as THREE from 'three';
import type { Layout } from './layout';

export class FloorTint {
  readonly group = new THREE.Group();
  private meshes: THREE.Mesh[] = [];
  private geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

  constructor() {
    this.group.visible = false;
    this.group.renderOrder = 1;
  }

  /** Помещения плана — заново (стройка): плоскость на пол внутри стен. */
  setLayout(layout: Layout) {
    for (const m of this.meshes) {
      this.group.remove(m);
      (m.material as THREE.Material).dispose();
    }
    this.meshes = layout.plan.rooms.map(r => {
      const m = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.42, depthWrite: false }));
      // внутри стен: прямоугольник помещения — со стенами по краю
      m.scale.set(Math.max(0.5, r.w - 2), 1, Math.max(0.5, r.h - 2));
      m.position.set(r.x + r.w / 2, 0.035, r.y + r.h / 2);
      m.visible = false;
      this.group.add(m);
      return m;
    });
  }

  /** Цвет пола каждого помещения плана; null — без цвета. */
  set(colors: readonly (number | null)[]) {
    this.meshes.forEach((m, i) => {
      const c = colors[i] ?? null;
      m.visible = c !== null;
      if (c !== null) (m.material as THREE.MeshBasicMaterial).color.setHex(c);
    });
  }

  /** Сколько помещений окрашено — для сценария в браузере. */
  get painted(): number {
    return this.group.visible ? this.meshes.filter(m => m.visible).length : 0;
  }
}
