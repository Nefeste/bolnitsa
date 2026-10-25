// Слой «Показатели» (spec docs/specs/2026-10-metrics-layer.md): число над столбиком — сколько людей, коек, минут ожидания.
// Как значки помещений (chips.ts): элементы страницы над холстом, место — каждый кадр, по верху столбика, который растёт
// плавно; элемент меняется, только если изменилось число. У пустого и не работающего столбика числа нет.
import * as THREE from 'three';
import type { Stage } from '../render/stage';

export class ColumnLabels {
  private root: HTMLDivElement;
  private els = new Map<number, { el: HTMLDivElement; text: string }>();
  private v = new THREE.Vector3();
  visible = false;

  constructor(private stage: Stage) {
    this.root = document.createElement('div');
    this.root.className = 'collabels';
    this.root.style.display = 'none';
    // под панелями, как значки помещений
    document.body.insertBefore(this.root, document.getElementById('ui'));
  }

  /** Числа по помещениям плана (10 раз в секунду); нет числа — нет подписи. */
  set(texts: readonly (string | undefined)[]) {
    for (const [i, x] of this.els) {
      if (texts[i] !== undefined) continue;
      x.el.remove();
      this.els.delete(i);
    }
    texts.forEach((text, i) => {
      if (text === undefined) return;
      let x = this.els.get(i);
      if (!x) {
        x = { el: document.createElement('div'), text: '' };
        x.el.className = 'collabel';
        x.el.dataset.room = String(i);
        this.root.appendChild(x.el);
        this.els.set(i, x);
      }
      if (x.text !== text) {
        x.text = text;
        x.el.textContent = text;
      }
    });
  }

  /** Каждый кадр: над верхом столбика; вне кадра — скрыто. */
  frame() {
    this.root.style.display = this.visible ? 'block' : 'none';
    if (!this.visible) return;
    const cam = this.stage.cam.camera;
    const rect = this.stage.renderer.domElement.getBoundingClientRect();
    for (const [i, x] of this.els) {
      const top = this.stage.columns.top(i);
      if (!top) continue;
      this.v.set(top.x, top.y + 0.35, top.z).project(cam);
      if (this.v.z > 1 || Math.abs(this.v.x) > 1.1 || Math.abs(this.v.y) > 1.1) {
        x.el.style.display = 'none';
        continue;
      }
      x.el.style.display = 'block';
      x.el.style.transform = `translate(${rect.left + ((this.v.x + 1) / 2) * rect.width}px, ${rect.top + ((1 - this.v.y) / 2) * rect.height}px) translate(-50%, -100%)`;
    }
  }

  /** Числа в кадре — для сценария в браузере. */
  dump(): string[] {
    return [...this.els.values()].map(x => x.text);
  }
}
