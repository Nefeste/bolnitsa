// Лицо в карточке человека — Rocketbox крупно: врач, медсестра, пациент. view=portrait — спокойные лица; view=expression —
// те же люди с выражением из форм лица (*_facial.fbx: 15 визем, 52 формы ARKit, единицы FACS).
import * as THREE from 'three';
import { el, gpuBytes, ms, stats, texTotals } from './probe';
import { addMorphNormals, avatarSpec, loadAvatar } from './rocketbox';
import { card, draw, frameBust } from './studio';

/** Выражения: имя формы (без префикса blendShape1.) → сила. Боль — по FACS: брови вниз (AU4), прищур (AU6/7), нос (AU9/10). */
const EXPR: Record<string, Record<string, number>> = {
  smile: { HB_07_MouthSmile: 0.6, AU_06_CheekRaiser: 0.55, AK_44_MouthSmileLeft: 0.5, AK_45_MouthSmileRight: 0.5, AK_19_EyeSquintLeft: 0.25, AK_20_EyeSquintRight: 0.25 },
  pain: {
    AU_04_BrowLowerer: 0.85,
    AK_03_BrowInnerUp: 0.35,
    AU_07_LidTightener: 0.75,
    AU_43_L_EyeClosed: 0.3,
    AU_43_R_EyeClosed: 0.3,
    AU_09_NoseWrinkler: 0.55,
    AU_10_UpperLipRaiser: 0.4,
    AU_20_LipStretcher: 0.5,
    AU_25_LipsPart: 0.25,
  },
  worry: { AK_03_BrowInnerUp: 1, AU_01_InnerBrowRaiser: 0.3, AU_15_LipCornerDepressor: 0.6, AU_17_ChinRaiser: 0.35, AU_24_LipPressor: 0.2 },
};

const CAST: { id: string; title: string; sub: string; expr: string; exprTitle: string }[] = [
  { id: 'Medical_Male_03', title: 'Врач', sub: 'Rocketbox Medical_Male_03', expr: 'smile', exprTitle: 'улыбка' },
  { id: 'Medical_Female_01', title: 'Медсестра', sub: 'Rocketbox Medical_Female_01', expr: 'worry', exprTitle: 'озабоченность' },
  { id: 'Female_Adult_09', title: 'Пациентка', sub: 'Rocketbox Female_Adult_09', expr: 'pain', exprTitle: 'боль' },
];

export async function portraitView(expression: boolean) {
  const t0 = performance.now();
  const app = document.getElementById('app')!;
  const cards = el('div', 'cards', app);
  const out: Record<string, unknown>[] = [];
  for (const who of CAST) {
    const spec = avatarSpec(who.id);
    const c = card(cards, expression ? `${who.title} — ${who.exprTitle}` : who.title, `${who.sub} · MIT`);
    const a = await loadAvatar(spec, 'portrait', expression);
    c.scene.add(a.root);
    a.root.updateMatrixWorld(true);
    const used: string[] = [];
    let morphNormalsMs = 0;
    if (expression) {
      morphNormalsMs = addMorphNormals(a.geometry);
      const dict = a.mesh.morphTargetDictionary!;
      const infl = a.mesh.morphTargetInfluences!;
      for (const [name, w] of Object.entries(EXPR[who.expr])) {
        const k = Object.keys(dict).find(n => n.endsWith(`.${name}`) || n === name);
        if (k === undefined) throw new Error(`${who.id}: нет формы ${name}`);
        infl[dict[k]] = w;
        used.push(`${name} ${w}`);
      }
    }
    const pos = (n: string) => a.root.getObjectByName(n)!.getWorldPosition(new THREE.Vector3());
    const eyes = pos('Bip01_LEye').add(pos('Bip01_REye')).multiplyScalar(0.5);
    const neck = pos('Bip01_Neck');
    const box = new THREE.Box3().setFromObject(a.root, true);
    frameBust(c, eyes, box.max.y + 0.02, neck.y - 0.2);
    const tr = performance.now();
    draw(c);
    c.r.getContext().finish();
    out.push({
      id: who.id,
      tris: a.tris,
      verts: a.verts,
      morphs: a.morphs,
      // формы лица на видеокарте: сдвиг позиции и нормали каждой вершины в каждой форме (vec4 float на каждое)
      morphMB: +((a.morphs * a.verts * 16 * (expression ? 2 : 1)) / 1e6).toFixed(1),
      morphNormalsMs,
      expression: used,
      textures: a.textures.map(t => `${t.name} ${t.w}×${t.h}`),
      gpuMB: +(a.textures.reduce((s, t) => s + gpuBytes(t.w, t.h), 0) / 1e6).toFixed(1),
      fbxMB: +(a.load.fbxBytes / 1e6).toFixed(2),
      parseMs: a.load.parseMs,
      loadMs: a.load.totalMs,
      renderMs: ms(tr),
    });
  }
  stats.view = expression ? 'expression' : 'portrait';
  stats.cards = out;
  stats.textures = { count: texTotals.count, decodeMs: Math.round(texTotals.ms) };
  stats.totalMs = ms(t0);
}
