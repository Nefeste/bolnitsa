// Отладочный вид ?view=shapes&id=Medical_Male_03[&w=1]: формы лица по одной на полную силу (или с силой w) — чтобы подобрать
// выражения. Один холст рисует лицо для каждой формы и копируется в маленькие холсты с подписью.
import * as THREE from 'three';
import { el, stats } from './probe';
import { addMorphNormals, avatarSpec, loadAvatar } from './rocketbox';
import { card, CARD_H, CARD_W, draw, frameBust } from './studio';

const DEFAULT = [
  'AK_44_MouthSmileLeft', 'AK_07_CheekSquintLeft', 'AU_06_CheekRaiser', 'AU_12_LipCornerPuller', 'HB_07_MouthSmile', 'AK_19_EyeSquintLeft',
  'AK_03_BrowInnerUp', 'AU_01_InnerBrowRaiser', 'AU_04_BrowLowerer', 'AK_01_BrowDownLeft', 'AU_07_LidTightener', 'AU_09_NoseWrinkler',
  'AU_10_UpperLipRaiser', 'AU_15_LipCornerDepressor', 'AU_17_ChinRaiser', 'AU_20_LipStretcher', 'AK_30_MouthFrownLeft', 'AU_43_L_EyeClosed',
  'AU_25_LipsPart', 'AK_25_JawOpen', 'AU_24_LipPressor', 'AU_45_Blink', 'AK_46_MouthStretchLeft', 'AU_41_LidDroop',
];

export async function shapesView() {
  const q = new URLSearchParams(location.search);
  const id = q.get('id') ?? 'Medical_Male_03';
  const w = Number(q.get('w') ?? 1);
  const list = q.get('s')?.split(',') ?? DEFAULT;
  const app = document.getElementById('app')!;
  const hidden = el('div', '', document.body);
  hidden.style.cssText = 'position:absolute;left:-10000px;top:0';
  const c = card(hidden, '', '');
  const a = await loadAvatar(avatarSpec(id), 'portrait', true);
  stats.morphNormalsMs = addMorphNormals(a.geometry);
  c.scene.add(a.root);
  a.root.updateMatrixWorld(true);
  const pos = (n: string) => a.root.getObjectByName(n)!.getWorldPosition(new THREE.Vector3());
  const eyes = pos('Bip01_LEye').add(pos('Bip01_REye')).multiplyScalar(0.5);
  const box = new THREE.Box3().setFromObject(a.root, true);
  frameBust(c, eyes, box.max.y + 0.01, pos('Bip01_Neck').y - 0.02, -0.15);
  const grid = el('div', '', app);
  grid.style.cssText = 'display:grid;grid-template-columns:repeat(8,180px);gap:6px;padding:8px';
  const dict = a.mesh.morphTargetDictionary!;
  const infl = a.mesh.morphTargetInfluences!;
  for (const s of ['(нет)', ...list]) {
    infl.fill(0);
    const k = Object.keys(dict).find(n => n.endsWith(`.${s}`));
    if (k) infl[dict[k]] = w;
    draw(c);
    const cell = el('div', '', grid);
    const cv = el('canvas', '', cell);
    cv.width = 180;
    cv.height = 220;
    cv.getContext('2d')!.drawImage(c.r.domElement, 0, 0, CARD_W * 2, CARD_H * 2, 0, 0, 180, 220);
    el('div', '', cell, s).style.cssText = 'font-size:11px;color:#ccc';
  }
}
