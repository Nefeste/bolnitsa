// Портрет в карточке (360×440, как окно карточки человека): свой холст на карточку, кадр рисуется вдвое крупнее и
// уменьшается (сглаживание), свет — три источника (ключевой с тенью, заполняющий, контровой) и окружение RoomEnvironment,
// тон — Khronos PBR Neutral или AgX (?tm=agx). Один и тот же свет у Rocketbox и у MakeHuman — сравнение честное.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { el, renderer } from './probe';

export const CARD_W = 360;
export const CARD_H = 440;

export interface Card {
  root: HTMLElement;
  r: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  key: THREE.DirectionalLight;
}

const toneOf = () => (new URLSearchParams(location.search).get('tm') === 'agx' ? THREE.AgXToneMapping : THREE.NeutralToneMapping);

export function card(parent: HTMLElement, title: string, sub: string): Card {
  const root = el('div', 'card', parent);
  const host = el('div', '', root);
  const cap = el('div', 'cap', root);
  el('b', '', cap, title);
  el('span', '', cap, sub);
  const r = renderer(host, CARD_W, CARD_H, 2);
  r.toneMapping = toneOf();
  r.toneMappingExposure = 1.0;
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xd9dde0);
  const pm = new THREE.PMREMGenerator(r);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  pm.dispose();
  scene.environmentIntensity = 0.35;
  const camera = new THREE.PerspectiveCamera(24, CARD_W / CARD_H, 0.05, 20);

  // свет задаётся относительно лица (оно смотрит на +Z): ключевой — слева сверху спереди, тёплый, с мягкой тенью
  const key = new THREE.DirectionalLight(0xfff0e0, 2.6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  const sc = key.shadow.camera;
  sc.left = sc.bottom = -0.45;
  sc.right = sc.top = 0.45;
  sc.near = 0.1;
  sc.far = 5;
  key.shadow.bias = -0.0002;
  key.shadow.normalBias = 0.01;
  key.shadow.radius = 3;
  const fill = new THREE.DirectionalLight(0xdfe8ff, 0.7);
  const rim = new THREE.DirectionalLight(0xffffff, 1.7);
  const hemi = new THREE.HemisphereLight(0xeef3f7, 0x7a6f66, 0.35);
  scene.add(key, key.target, fill, fill.target, rim, rim.target, hemi);
  (scene.userData as { lights: THREE.DirectionalLight[] }).lights = [key, fill, rim];
  return { root, r, scene, camera, key };
}

/**
 * Кадр «голова и плечи»: от макушки (`top`) до верха груди (`bottom`) по высоте карточки, лицо — к +Z, камера чуть
 * сбоку (`angle`, радианы) и на уровне глаз. Свет ставится от той же точки.
 */
export function frameBust(c: Card, centre: THREE.Vector3, top: number, bottom: number, angle = -0.32) {
  const h = (top - bottom) * 1.06;
  const fov = THREE.MathUtils.degToRad(c.camera.fov);
  const d = h / 2 / Math.tan(fov / 2);
  const mid = new THREE.Vector3(centre.x, (top + bottom) / 2, centre.z);
  c.camera.position.set(mid.x + Math.sin(angle) * d, mid.y + 0.03, mid.z + Math.cos(angle) * d);
  c.camera.lookAt(mid);
  const [key, fill, rim] = (c.scene.userData as { lights: THREE.DirectionalLight[] }).lights;
  const at = (l: THREE.DirectionalLight, x: number, y: number, z: number) => {
    l.target.position.copy(mid);
    l.position.copy(mid).add(new THREE.Vector3(x, y, z).normalize().multiplyScalar(2));
  };
  at(key, -0.75, 0.8, 0.95);
  at(fill, 0.9, 0.15, 0.7);
  at(rim, 0.6, 0.7, -0.9);
  for (const l of [key, fill, rim]) l.target.updateMatrixWorld();
}

export function draw(c: Card) {
  c.r.render(c.scene, c.camera);
}
