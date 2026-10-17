// Подписи помещений в стройке (spec docs/specs/2026-10-build.md, «Экран и управление»): над каждым помещением — название и
// «работает» или «не работает: причина». Слой DOM поверх 3D-вида: текст меняется со стройкой, место — каждый кадр.
import * as THREE from 'three';
import type { Stage } from '../render/stage';

export interface LabelRow {
  id: string;
  /** середина помещения на плане */
  x: number;
  z: number;
  name: string;
  state: string;
  ok: boolean;
}

export class Labels {
  private root: HTMLDivElement;
  private els = new Map<string, HTMLDivElement>();
  private rows: LabelRow[] = [];
  private v = new THREE.Vector3();
  visible = false;

  constructor(private stage: Stage) {
    this.root = document.createElement('div');
    this.root.className = 'labels';
    // под панелями: слой — перед ними в странице
    document.body.insertBefore(this.root, document.getElementById('ui'));
  }

  set(rows: LabelRow[]) {
    this.rows = rows;
    const keep = new Set(rows.map(r => r.id));
    for (const [id, el] of this.els) {
      if (keep.has(id)) continue;
      el.remove();
      this.els.delete(id);
    }
    for (const r of rows) {
      let el = this.els.get(r.id);
      if (!el) {
        el = document.createElement('div');
        this.root.appendChild(el);
        this.els.set(r.id, el);
      }
      el.className = r.ok ? 'rlabel ok' : 'rlabel bad';
      el.textContent = '';
      const b = document.createElement('b');
      b.textContent = r.name;
      const s = document.createElement('span');
      s.textContent = r.state;
      el.append(b, s);
    }
  }

  /** Каждый кадр: подписи — над серединами помещений; вне кадра — скрыты. */
  frame() {
    this.root.style.display = this.visible ? 'block' : 'none';
    if (!this.visible) return;
    const cam = this.stage.cam.camera;
    const rect = this.stage.renderer.domElement.getBoundingClientRect();
    for (const r of this.rows) {
      const el = this.els.get(r.id);
      if (!el) continue;
      this.v.set(r.x, 0.4, r.z).project(cam);
      if (this.v.z > 1 || Math.abs(this.v.x) > 1.1 || Math.abs(this.v.y) > 1.1) {
        el.style.display = 'none';
        continue;
      }
      el.style.display = 'block';
      el.style.transform = `translate(${rect.left + ((this.v.x + 1) / 2) * rect.width}px, ${rect.top + ((1 - this.v.y) / 2) * rect.height}px) translate(-50%, -50%)`;
    }
  }
}
