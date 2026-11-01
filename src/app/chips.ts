// Значки состояния помещений (spec docs/specs/2026-10-flow-ui.md, «Значки состояния помещений»; геймдизайн §13): над
// помещением — работает, занято, очередь N, нет персонала, закрыто, «не работает: причина»; без слоя «Очереди и загрузка» —
// только требующие взгляда (`chipShown`, spec docs/specs/2026-10-owner-play.md). Слой DOM поверх 3D-вида, как подписи
// стройки (labels.ts): текст меняется 10 раз в секунду, место — каждый кадр. Значки нарисованы кодом (SVG).
import * as THREE from 'three';
import type { Stage } from '../render/stage';
import type { ChipIcon, RoomChip } from './flow';
import type { Box } from './tags';

/** Значки — SVG 16×16, цвет — от текста (currentColor). */
const SVG: Record<ChipIcon, string> = {
  ok: '<path d="M3 8.5l3.2 3.2L13 4.8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  busy: '<circle cx="8" cy="4.8" r="2.7"/><path d="M3 14.5c0-3.3 2.2-5.2 5-5.2s5 1.9 5 5.2z"/>',
  queue: '<circle cx="3.6" cy="6" r="1.9"/><circle cx="8" cy="6" r="1.9"/><circle cx="12.4" cy="6" r="1.9"/><rect x="1.4" y="9" width="13.2" height="4.6" rx="1.6"/>',
  bed: '<rect x="1.5" y="7.8" width="13" height="3.6" rx="1"/><rect x="2" y="4.6" width="4.2" height="3" rx="1"/><path d="M2 11.4v2.6M14 11.4v2.6" stroke="currentColor" stroke-width="1.6"/>',
  staff: '<circle cx="6.5" cy="4.8" r="2.6"/><path d="M1.6 14.5c0-3.2 2.1-5.1 4.9-5.1 1.4 0 2.6.4 3.4 1.2"/><path d="M10.5 10.5l4 4M14.5 10.5l-4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  closed: '<rect x="1.5" y="5.5" width="13" height="5" rx="1"/><path d="M4 5.5l-2 5M8 5.5l-2 5M12 5.5l-2 5" stroke="#1d272b" stroke-width="1.4"/><path d="M3 10.5v4M13 10.5v4" stroke="currentColor" stroke-width="1.6"/>',
  down: '<circle cx="8" cy="8" r="6.6"/><path d="M5.3 5.3l5.4 5.4M10.7 5.3l-5.4 5.4" stroke="#1d272b" stroke-width="2" stroke-linecap="round"/>',
  ask: '<path d="M2 3.5h12v7.5H7.5L4.5 14v-3H2z"/><path d="M6.4 5.9c.1-1 .8-1.5 1.7-1.5 1 0 1.7.6 1.7 1.4 0 1.2-1.6 1.3-1.6 2.4" fill="none" stroke="#1d272b" stroke-width="1.3" stroke-linecap="round"/><circle cx="8.2" cy="9.6" r=".8" fill="#1d272b"/>',
  mine: '<path d="M8 1.5l1.9 4.1 4.5.5-3.4 3 1 4.4L8 11.2l-4 2.3 1-4.4-3.4-3 4.5-.5z"/>',
};

export interface ChipRow {
  id: string;
  /** середина помещения на плане */
  x: number;
  z: number;
  chip: RoomChip;
}

export class Chips {
  private root: HTMLDivElement;
  /** `size` — ширина и высота на экране, точки; меряется раз после смены текста (подписи помещений их обходят, tags.ts) */
  private els = new Map<string, { el: HTMLDivElement; key: string; size?: [number, number] }>();
  /** значки на экране в последнем кадре: середина и размер */
  boxes: Box[] = [];
  /** на столько точек от середины помещения до нижнего края значка — над подписью помещения (tags.ts); 0 — значок на середине */
  lift = 0;
  private rows: ChipRow[] = [];
  private v = new THREE.Vector3();
  visible = true;
  /** слой «Очереди и загрузка»: подробный текст */
  detailed = false;

  constructor(private stage: Stage) {
    this.root = document.createElement('div');
    this.root.className = 'roomchips';
    // под панелями, как подписи стройки
    document.body.insertBefore(this.root, document.getElementById('ui'));
  }

  /** Состояния помещений — заново (10 раз в секунду): элемент меняется, только если изменился его текст. */
  set(rows: ChipRow[]) {
    this.rows = rows;
    const keep = new Set(rows.map(r => r.id));
    for (const [id, x] of this.els) {
      if (keep.has(id)) continue;
      x.el.remove();
      this.els.delete(id);
    }
    for (const r of rows) {
      const text = this.detailed && r.chip.long ? r.chip.long : r.chip.text;
      const key = `${r.chip.tone}|${r.chip.icon}|${text}`;
      let x = this.els.get(r.id);
      if (!x) {
        x = { el: document.createElement('div'), key: '' };
        this.root.appendChild(x.el);
        this.els.set(r.id, x);
      }
      if (x.key === key) continue;
      x.key = key;
      x.size = undefined;
      x.el.className = `roomchip t-${r.chip.tone}`;
      x.el.dataset.room = r.id;
      x.el.dataset.icon = r.chip.icon;
      x.el.dataset.tone = r.chip.tone;
      x.el.title = r.chip.long ?? r.chip.text;
      x.el.innerHTML = `<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">${SVG[r.chip.icon]}</svg>`;
      const s = document.createElement('span');
      s.textContent = text;
      x.el.append(s);
    }
  }

  /** Каждый кадр: значки — над серединами помещений (выше подписей стройки); вне кадра — скрыты. */
  frame() {
    this.root.style.display = this.visible ? 'block' : 'none';
    this.boxes = [];
    if (!this.visible) return;
    const cam = this.stage.cam.camera;
    const rect = this.stage.renderer.domElement.getBoundingClientRect();
    for (const r of this.rows) {
      const x = this.els.get(r.id);
      if (!x) continue;
      this.v.set(r.x, 0.4, r.z).project(cam);
      if (this.v.z > 1 || Math.abs(this.v.x) > 1.1 || Math.abs(this.v.y) > 1.1) {
        x.el.style.display = 'none';
        continue;
      }
      x.el.style.display = 'flex';
      x.size ??= [x.el.offsetWidth, x.el.offsetHeight];
      const sx = rect.left + ((this.v.x + 1) / 2) * rect.width;
      const sy = rect.top + ((1 - this.v.y) / 2) * rect.height - (this.lift > 0 ? this.lift + x.size[1] / 2 : 0);
      x.el.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -50%)`;
      this.boxes.push({ x: sx, y: sy, w: x.size[0], h: x.size[1] });
    }
  }

  /** Значки в кадре — для сценария в браузере: помещение → значок и текст. */
  dump(): { room: string; icon: string; tone: string; text: string }[] {
    return [...this.els.entries()].map(([room, x]) => ({ room, icon: x.el.dataset.icon ?? '', tone: x.el.dataset.tone ?? '', text: x.el.textContent ?? '' }));
  }
}
