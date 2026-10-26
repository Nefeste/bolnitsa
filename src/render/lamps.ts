// Потолочные светильники (spec docs/specs/2026-10-shell-3d.md, «Больница на экране»): видимые панели под потолком и
// свет от них — пятна на полу (карта света пола, второй набор координат), без источников с тенями: тени даёт только
// солнце. Панели у камеры срезаются вместе со стенами (`cutAt`), в режиме «вниз» их нет.
import * as THREE from 'three';
import { CELL } from '../engine/hospital/grid';
import type { Layout } from './layout';
import { cutAt, WALL_H, type Walls } from './world';

export interface Lamps {
  /** корпус и рассеиватель — две InstancedMesh в одной группе */
  mesh: THREE.Group;
  /** карта света пола: по участку, 8 точек на метр */
  lightMap: THREE.CanvasTexture;
  points: { x: number; z: number }[];
  material: THREE.MeshStandardMaterial;
  /** панели у камеры прячутся, как срезанные стены; издалека (общий план) — тоже: там они только рябят */
  update(walls: Walls['uniforms'], half: number): void;
  /** сила света по часу: днём слабее (светло и так), вечером и ночью сильнее */
  setHour(hour: number, materials: THREE.MeshStandardMaterial[]): void;
}

/** Где висят светильники: в помещениях — сеткой через 3 м, в коридорах — по середине через 4 м. */
export function lampPoints(l: Layout): { x: number; z: number; room: number }[] {
  const out: { x: number; z: number; room: number }[] = [];
  l.plan.rooms.forEach((r, n) => {
    const iw = r.w - 2;
    const ih = r.h - 2;
    const nx = Math.max(1, Math.round(iw / 3));
    const nz = Math.max(1, Math.round(ih / 3));
    for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) out.push({ x: r.x + 1 + (iw * (i + 0.5)) / nx, z: r.y + 1 + (ih * (k + 0.5)) / nz, room: n });
  });
  const { w, h, plan } = l;
  const corridor = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && plan.grid.cells[y * w + x] === CELL.corridor;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!corridor(x, y)) continue;
      // середина коридора: со всех сторон коридор
      if (!(corridor(x - 1, y) && corridor(x + 1, y) && corridor(x, y - 1) && corridor(x, y + 1))) continue;
      if ((x + y) % 4 !== 0) continue;
      out.push({ x: x + 0.5, z: y + 0.5, room: -1 });
    }
  }
  return out;
}

export function buildLamps(l: Layout): Lamps {
  const pts = lampPoints(l);
  const { w, h } = l;
  // пятна света: в помещении — не дальше его стен, в коридоре — по коридору
  const px = 8;
  const c = document.createElement('canvas');
  c.width = w * px;
  c.height = h * px;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = 'lighter';
  for (const p of pts) {
    g.save();
    if (p.room >= 0) {
      const r = l.plan.rooms[p.room];
      g.beginPath();
      g.rect((r.x + 0.9) * px, (r.y + 0.9) * px, (r.w - 1.8) * px, (r.h - 1.8) * px);
      g.clip();
    }
    const rad = (p.room >= 0 ? 2.6 : 2.2) * px;
    const grd = g.createRadialGradient(p.x * px, p.z * px, 0, p.x * px, p.z * px, rad);
    grd.addColorStop(0, 'rgba(255,244,222,0.55)');
    grd.addColorStop(0.55, 'rgba(255,244,222,0.25)');
    grd.addColorStop(1, 'rgba(255,244,222,0)');
    g.fillStyle = grd;
    g.fillRect(p.x * px - rad, p.z * px - rad, rad * 2, rad * 2);
    g.restore();
  }
  const lightMap = new THREE.CanvasTexture(c);
  lightMap.channel = 1;
  lightMap.colorSpace = THREE.SRGBColorSpace;

  // светильник — квадратная светящаяся панель 0,58 м в тёмной рамке (как растровый светильник «Армстронг»): сверху (потолка
  // в разрезе нет) видна светящаяся сторона. Длинные панели вдоль комнат читались как доски, а в коридорах — как разметка
  const body = new THREE.BoxGeometry(0.68, 0.03, 0.68);
  const glow = new THREE.BoxGeometry(0.58, 0.036, 0.58);
  const material = new THREE.MeshStandardMaterial({ color: 0xfff6e8, emissive: 0xffeed2, emissiveIntensity: 1, roughness: 0.3 });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x9aa4a8, roughness: 0.5, metalness: 0.3 });
  const shell = new THREE.InstancedMesh(body, frameMat, pts.length);
  const light = new THREE.InstancedMesh(glow, material, pts.length);
  shell.name = 'lamp frames';
  light.name = 'lamp panels';
  const mesh = new THREE.Group();
  mesh.add(shell, light);
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const zero = new THREE.Vector3(0, 0, 0);
  const straight = new THREE.Quaternion();
  // срезаются по помещению целиком: по его середине — иначе в полусрезанной комнате часть панелей висела бы в воздухе
  const anchor = pts.map(pt => {
    if (pt.room < 0) return { x: pt.x, z: pt.z };
    const r = l.plan.rooms[pt.room];
    return { x: r.x + r.w / 2, z: r.y + r.h / 2 };
  });
  const set = (i: number, on: boolean) => {
    m.compose(p.set(pts[i].x, WALL_H - 0.08, pts[i].z), straight, on ? one : zero);
    shell.setMatrixAt(i, m);
    light.setMatrixAt(i, m);
  };
  pts.forEach((_, i) => set(i, true));
  shell.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  light.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const shown = new Uint8Array(pts.length).fill(1);
  return {
    mesh,
    lightMap,
    points: pts,
    material,
    update(u, half) {
      let changed = false;
      const far = half > 15;
      pts.forEach((_, i) => {
        const on = !far && cutAt(u, anchor[i].x, anchor[i].z) < 0.02 ? 1 : 0;
        if (on === shown[i]) return;
        shown[i] = on;
        set(i, on === 1);
        changed = true;
      });
      if (changed) {
        shell.instanceMatrix.needsUpdate = true;
        light.instanceMatrix.needsUpdate = true;
      }
    },
    setHour(hour, materials) {
      // вечером (после 18) и ночью свет сильнее. Ночью рассеянный свет гаснет (view.ts), и помещения держатся на этих
      // пятнах (spec 2026-10-aaa-polish, «Свет»). Днём свет горит, как в настоящей больнице: солнце в помещения
      // попадает только через окна (крыша для теней, world.ts), и без светильников они бы темнели («Свет, часть 2»)
      const evening = hour >= 18 ? Math.min(1, (hour - 18) / 2) : hour < 7 ? 1 : 0;
      const k = 0.75 + 1.05 * evening;
      for (const mat of materials) mat.lightMapIntensity = k;
      material.emissiveIntensity = 0.7 + 0.9 * evening;
    },
  };
}
