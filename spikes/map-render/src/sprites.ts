// Атлас фигурок: рисуется кодом в обычный 2D-холст один раз и отдаётся обеим реализациям как
// одна текстура — люди рисуются одним пакетом (ParticleContainer у PixiJS, drawAtlas у CanvasKit).
import { LOOKS } from './crowd';
import { CELL_PX } from './hospital';

/** Сторона фигурки в атласе, точек: вдвое больше клетки — не мылится при приближении ×2. */
export const SPR = 32;
/** Сторона фигурки на карте, в клетках. */
export const FIGURE = 0.8;
/** Масштаб атласа к миру. */
export const SPR_SCALE = (FIGURE * CELL_PX) / SPR;

const CLOTHES = ['#FFFFFF', '#8EC5E8', '#C8573E', '#3E7CC8', '#5E9E58', '#9A6BB5', '#D9A23B', '#6B7378'];
const SKIN = ['#F1C9A5', '#E0AC86', '#C68C63', '#F5D6BA'];

export function makeAtlas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = SPR * LOOKS;
  c.height = SPR;
  const g = c.getContext('2d');
  if (!g) throw new Error('2d context unavailable');
  for (let i = 0; i < LOOKS; i++) {
    const cx = i * SPR + SPR / 2;
    const cy = SPR / 2;
    // плечи — эллипс одежды с тёмным краем
    g.beginPath();
    g.ellipse(cx, cy, SPR * 0.42, SPR * 0.3, 0, 0, Math.PI * 2);
    g.fillStyle = CLOTHES[i];
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = 'rgba(28,43,45,0.55)';
    g.stroke();
    // голова
    g.beginPath();
    g.arc(cx, cy, SPR * 0.19, 0, Math.PI * 2);
    g.fillStyle = SKIN[i % SKIN.length];
    g.fill();
    g.lineWidth = 1;
    g.stroke();
  }
  return c;
}
