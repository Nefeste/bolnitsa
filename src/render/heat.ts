// Слой «Пути пациентов» (spec docs/specs/2026-10-layers.md, часть 2; геймдизайн §3, «Слои карты»): где больные ходят чаще,
// — пол светлее. Одна плоскость над всем участком, клетка плана — тексел текстуры; цвета считает окно (src/app/paths.ts,
// `heatColor`), здесь — только показать. Глубину не пишет, как пол слоя очередей (overlay.ts): люди и мебель его закрывают.
import * as THREE from 'three';
import type { Layout } from './layout';

/** Над полом, м: под окраской слоя очередей (0,035) и над полосами у дверей (0,008). */
const Y = 0.02;

export class FloorHeat {
  readonly group = new THREE.Group();
  private mesh: THREE.Mesh | undefined;
  private tex: THREE.DataTexture | undefined;
  private w = 0;
  private h = 0;
  private lit = 0;

  constructor() {
    this.group.visible = false;
    this.group.renderOrder = 1;
  }

  /** Участок — заново (стройка): плоскость на весь участок, тексел — клетка плана. */
  setLayout(layout: Layout) {
    if (this.mesh) {
      this.group.remove(this.mesh);
      this.mesh.geometry.dispose();
      (this.mesh.material as THREE.Material).dispose();
      this.tex?.dispose();
    }
    const { w, h } = layout;
    this.w = w;
    this.h = h;
    this.lit = 0;
    // клетка (x, y) — тексел (x, y): строка текстуры — y плана, без переворота
    const tex = new THREE.DataTexture(new Uint8Array(w * h * 4), w, h);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    this.tex = tex;
    // два треугольника лицом вверх, обход — как у плиток пола (world.ts); uv — от угла участка
    const v = [0, 0, 0, h, w, h, 0, 0, w, h, w, 0];
    const pos = new Float32Array(18);
    const uv = new Float32Array(12);
    for (let j = 0; j < 6; j++) {
      pos[j * 3] = v[j * 2];
      pos[j * 3 + 1] = Y;
      pos[j * 3 + 2] = v[j * 2 + 1];
      uv[j * 2] = v[j * 2] / w;
      uv[j * 2 + 1] = v[j * 2 + 1] / h;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    this.mesh.name = 'patient paths';
    this.group.add(this.mesh);
  }

  /** Цвет каждой клетки плана, RGBA 0–255 подряд (w·h·4); клеток с цветом — для сценария в браузере. */
  set(rgba: Uint8Array, lit: number) {
    if (!this.tex || rgba.length !== this.w * this.h * 4) return;
    (this.tex.image.data as Uint8Array).set(rgba);
    this.tex.needsUpdate = true;
    this.lit = lit;
  }

  /** Сколько клеток окрашено — для сценария в браузере. */
  get painted(): number {
    return this.group.visible ? this.lit : 0;
  }
}
