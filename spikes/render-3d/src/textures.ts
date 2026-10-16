// Материалы пола и земли — нарисованы кодом в 2D-холст (своё, без чужих текстур): плитка,
// линолеум, паркет, трава. Повтор по миру: один период текстуры — `meters` метров.
import * as THREE from 'three';
import { rng } from './rng';

export type FloorKind = 'corridor' | 'hall' | 'wood' | 'white' | 'ward' | 'grey' | 'toiletTile' | 'grass' | 'asphalt';

export interface FloorTex {
  texture: THREE.Texture;
  meters: number;
}

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')!];
}

function speckle(g: CanvasRenderingContext2D, size: number, n: number, colors: string[], seed: number, r = 1.2) {
  const rnd = rng(seed);
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[Math.floor(rnd() * colors.length)];
    g.globalAlpha = 0.25 + rnd() * 0.35;
    g.beginPath();
    g.arc(rnd() * size, rnd() * size, r * (0.5 + rnd()), 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
}

function tiles(g: CanvasRenderingContext2D, size: number, count: number, base: string, alt: string | null, grout: string, seed: number) {
  const step = size / count;
  const rnd = rng(seed);
  for (let y = 0; y < count; y++) {
    for (let x = 0; x < count; x++) {
      g.fillStyle = alt && (x + y) % 2 ? alt : base;
      g.fillRect(x * step, y * step, step, step);
      // лёгкий разнобой плиток
      g.fillStyle = `rgba(0,0,0,${rnd() * 0.035})`;
      g.fillRect(x * step, y * step, step, step);
    }
  }
  g.strokeStyle = grout;
  g.lineWidth = Math.max(1.5, size / 256);
  for (let i = 0; i <= count; i++) {
    g.beginPath();
    g.moveTo(i * step, 0);
    g.lineTo(i * step, size);
    g.moveTo(0, i * step);
    g.lineTo(size, i * step);
    g.stroke();
  }
}

export function makeFloor(kind: FloorKind, anisotropy: number): FloorTex {
  const S = 512;
  const [c, g] = canvas(S);
  let meters = 2;
  switch (kind) {
    case 'corridor':
      tiles(g, S, 4, '#e9e5dc', null, '#c9c2b4', 1);
      speckle(g, S, 900, ['#b9b2a3', '#f7f4ee'], 2);
      meters = 2;
      break;
    case 'hall':
      tiles(g, S, 4, '#efe3cf', '#e6d6bd', '#cbb898', 3);
      speckle(g, S, 600, ['#c8b391', '#fbf3e4'], 4);
      meters = 2;
      break;
    case 'white':
      tiles(g, S, 8, '#f3f5f5', null, '#cfd6d8', 5);
      meters = 2;
      break;
    case 'toiletTile':
      tiles(g, S, 10, '#dfeaf1', '#f4f8fa', '#b9c8d2', 6);
      meters = 2;
      break;
    case 'ward':
    case 'grey': {
      // линолеум: ровный цвет с крапом
      g.fillStyle = kind === 'ward' ? '#cfe1df' : '#c9cdcf';
      g.fillRect(0, 0, S, S);
      speckle(g, S, 2500, kind === 'ward' ? ['#a9c6c3', '#e8f2f1', '#93b4b0'] : ['#a3a8ab', '#e3e6e7'], 7, 1.4);
      meters = 3;
      break;
    }
    case 'wood': {
      // паркет «ёлочкой» упрощённо — доски вразбежку
      const rnd = rng(8);
      const rows = 8;
      const h = S / rows;
      for (let y = 0; y < rows; y++) {
        let x = -rnd() * S * 0.4;
        while (x < S) {
          const w = S * (0.25 + rnd() * 0.3);
          const l = 52 + rnd() * 10;
          g.fillStyle = `hsl(30, 38%, ${l}%)`;
          g.fillRect(x, y * h, w, h);
          g.fillStyle = 'rgba(80,50,20,0.35)';
          g.fillRect(x, y * h, 2, h);
          x += w;
        }
        g.fillStyle = 'rgba(80,50,20,0.4)';
        g.fillRect(0, y * h, S, 2);
      }
      speckle(g, S, 400, ['#8a6238', '#d8b48a'], 9, 1);
      meters = 2.5;
      break;
    }
    case 'grass':
      g.fillStyle = '#7f9b5c';
      g.fillRect(0, 0, S, S);
      speckle(g, S, 6000, ['#6b8a4b', '#93ad6c', '#5f7d43', '#a3b878'], 10, 2);
      meters = 6;
      break;
    case 'asphalt':
      g.fillStyle = '#8b8f91';
      g.fillRect(0, 0, S, S);
      speckle(g, S, 5000, ['#777b7d', '#a2a6a8', '#6b6f71'], 11, 1.3);
      meters = 4;
      break;
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  return { texture: t, meters };
}
