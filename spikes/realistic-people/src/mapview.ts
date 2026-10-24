// Люди на карте: камера, свет, затенение и пресет «высокое» — те же, что в игре (src/render/view.ts, post.ts: перспектива
// 20°, наклон 52°, поворот 45°; солнце, небо и RoomEnvironment; MSAA ×4 и GTAO). Один невидимый холст WebGL рисует сцену
// дважды — в обычном масштабе игры и на пределе приближения — и копируется в два видимых холста с подписями.
//   view=map — по столбцам-должностям: сзади нынешние люди игры, спереди Rocketbox;
//   view=lod — Rocketbox полной сеткой и упрощённые до ~2,5 и ~0,8 тыс. треугольников, справа — врач игры (полный и дальний).
import * as THREE from 'three';
import { ROLE_COLOR } from '../../../src/render/cast';
import { Post } from '../../../src/render/post';
import { makeFloor } from '../../../src/render/textures';
import { createRenderer, Daylight, gpuString, IsoCamera, PRESETS } from '../../../src/render/view';
import { CLOTHES, COAT, type GamePerson, loadGamePeople, SKIN } from './gamepeople';
import { el, frames, gpuBytes, ms, stats, texTotals } from './probe';
import { type Avatar, avatarSpec, cloneWith, loadAvatar, lod, simplifierReady } from './rocketbox';

const W = 800;
const H = 900;
const PLOT = 60;

interface Label {
  x: number;
  z: number;
  text: string;
  /** подпись над головой (название ряда), а не под ногами */
  above?: boolean;
  tone?: 'game' | 'rb';
}

interface Shot {
  title: string;
  /** ширина панели, точек */
  w: number;
  half: number;
  /** куда смотрит камера: сдвиг вдоль ряда, м */
  at: number;
}

/** Столбцы снимка «карта»: должность, вид игры и цвет его одежды, человек Rocketbox. */
const COLUMNS: { role: string; game: string; clothes: number; rb: string }[] = [
  { role: 'врач', game: 'Doctor_Male_Young', clothes: COAT, rb: 'Medical_Male_03' },
  { role: 'врач', game: 'Doctor_Female_Young', clothes: COAT, rb: 'Medical_Female_02' },
  { role: 'медсестра', game: 'Doctor_Female_Young', clothes: ROLE_COLOR['role.nurse'], rb: 'Medical_Female_01' },
  { role: 'хирург', game: 'Doctor_Male_Young', clothes: ROLE_COLOR['role.surgeon'], rb: 'Medical_Male_04' },
  { role: 'пациент', game: 'OldClassy_Male', clothes: CLOTHES[6], rb: 'Male_Adult_14' },
  { role: 'пациентка', game: 'Casual_Female', clothes: CLOTHES[0], rb: 'Female_Adult_09' },
];

export async function mapView(mode: 'map' | 'lod') {
  const t0 = performance.now();
  const app = document.getElementById('app')!;
  const row = el('div', 'row', app);
  const hidden = el('div', '', document.body);
  hidden.style.cssText = `position:absolute;left:-10000px;top:0;width:${W}px;height:${H}px`;
  const r = createRenderer(hidden, 'high', true);
  r.setPixelRatio(1);
  r.setSize(W, H);
  const scene = new THREE.Scene();
  const light = new Daylight(scene, PLOT / 3, PLOT / 3);
  light.sun.target.position.set(PLOT / 2, 0, PLOT / 2);
  light.setShadowSize(PRESETS.high.shadowSize);
  light.setEnv(r, true);
  light.setHour(11);
  const cam = new IsoCamera(PLOT, PLOT);
  cam.aspect = W / H;
  const post = new Post(r, scene, cam.camera, PRESETS.high.ao, PRESETS.high.msaa);

  // пол — плитка коридора игры
  const floorTex = makeFloor('corridor', 8);
  floorTex.texture.repeat.set(PLOT / floorTex.meters, PLOT / floorTex.meters);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(PLOT, PLOT).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: floorTex.texture, roughness: 0.85 }));
  floor.position.set(PLOT / 2, 0, PLOT / 2);
  floor.receiveShadow = true;
  scene.add(floor);

  // ряды поперёк взгляда камеры: «вправо» и «к камере» по земле при повороте 45°
  const right = new THREE.Vector3(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw));
  const toCam = new THREE.Vector3(Math.sin(cam.yaw), 0, Math.cos(cam.yaw));
  const centre = new THREE.Vector3(PLOT / 2, 0, PLOT / 2);
  const at = (along: number, depth: number) => centre.clone().addScaledVector(right, along).addScaledVector(toCam, depth);
  const heading = cam.yaw - 0.35; // лицом к камере, чуть вполоборота
  const labels: Label[] = [];

  await simplifierReady;
  const avatars = new Map<string, Avatar>();
  const tl = performance.now();
  const ids = mode === 'map' ? COLUMNS.map(c => c.rb) : ['Medical_Male_03', 'Medical_Female_01'];
  await Promise.all(ids.map(async id => avatars.set(id, await loadAvatar(avatarSpec(id), 'map'))));
  const rbMs = ms(tl);
  const gameNames = mode === 'map' ? [...new Set(COLUMNS.map(c => c.game))] : ['Doctor_Male_Young'];
  const game = await loadGamePeople(gameNames);

  const gameList: GamePerson[] = [];
  const lods: Record<string, unknown>[] = [];
  let shots: Shot[];
  if (mode === 'map') {
    const step = 1.05;
    COLUMNS.forEach((c, i) => {
      const along = (i - (COLUMNS.length - 1) / 2) * step;
      const back = at(along, -0.9);
      gameList.push({ look: c.game, x: back.x, z: back.z, heading, clothes: c.clothes, skin: SKIN[i % SKIN.length] });
      const front = at(along, 0.9);
      const av = avatars.get(c.rb)!;
      av.root.position.copy(front);
      av.root.rotation.y = heading;
      scene.add(av.root);
      labels.push({ x: front.x, z: front.z, text: c.role });
    });
    const lead = -((COLUMNS.length - 1) / 2) * step - 1.25;
    const g = at(lead, -0.9);
    const rb = at(lead, 0.9);
    labels.push({ x: g.x, z: g.z, text: 'игра сейчас', above: true, tone: 'game' }, { x: rb.x, z: rb.z, text: 'Rocketbox', above: true, tone: 'rb' });
    shots = [
      { title: 'Обычный масштаб игры: половина кадра — 9 м', w: W, half: 9, at: 0 },
      { title: 'Предел приближения игры: половина кадра — 3 м', w: W, half: 3, at: -1.05 },
    ];
  } else {
    const step = 0.72;
    const gap = 0.25;
    let off = -3.1;
    for (const id of ids) {
      const av = avatars.get(id)!;
      for (const target of [0, 2500, 800]) {
        const l = target ? lod(av.geometry, target) : null;
        const obj = l ? cloneWith(av, l.geometry) : av.root;
        const tris = l ? l.tris : av.tris;
        if (l) lods.push({ id, target, tris: l.tris, ms: l.ms });
        const p = at(off, 0);
        obj.position.copy(p);
        obj.rotation.y = heading;
        scene.add(obj);
        labels.push({ x: p.x, z: p.z, text: `${(tris / 1000).toFixed(1).replace('.', ',')} тыс.` });
        off += step;
      }
      const head = at(off - step * 2, 0);
      labels.push({ x: head.x, z: head.z, text: `Rocketbox, ${av.spec.role}`, above: true, tone: 'rb' });
      off += gap;
    }
    const look = game.people.looks[0];
    const first = off;
    for (const full of [true, false]) {
      const p = at(off, 0);
      gameList.push({ look: 'Doctor_Male_Young', x: p.x, z: p.z, heading, clothes: COAT, skin: SKIN[0] });
      labels.push({ x: p.x, z: p.z, text: `${((full ? look.tris : look.lodTris) / 1000).toFixed(1).replace('.', ',')} тыс.` });
      off += step;
    }
    const gh = at(first + step / 2, 0);
    labels.push({ x: gh.x, z: gh.z, text: 'игра сейчас', above: true, tone: 'game' });
    const mid = (-3.1 + off - step) / 2;
    shots = [
      { title: 'Упрощение: предел приближения игры (3 м)', w: 1040, half: 3, at: mid },
      { title: 'Обычный масштаб (9 м)', w: 560, half: 9, at: mid },
    ];
  }
  // у людей игры полная и упрощённая модель — разные сетки; на снимке lod нужны обе сразу
  if (mode === 'lod') {
    game.place([gameList[0]], true);
    scene.add(game.view.group.clone(true));
    game.place([gameList[1]], false);
  } else game.place(gameList, true);
  scene.add(game.view.group);

  const panels: Record<string, unknown>[] = [];
  for (const shot of shots) {
    const w = shot.w;
    const panel = el('div', 'panel', row);
    const c2 = el('canvas', '', panel);
    c2.width = w;
    c2.height = H;
    el('div', 'tag', panel, shot.title);
    r.setSize(w, H);
    post.setSize();
    cam.aspect = w / H;
    cam.half = shot.half;
    cam.target.copy(at(shot.at, 0));
    cam.update(0);
    post.render(cam.camera);
    await frames(1);
    // счёт вызовов и треугольников — за весь кадр (сцена, тени, затенение), а не за последний проход
    r.info.autoReset = false;
    r.info.reset();
    post.render(cam.camera);
    r.info.autoReset = true;
    c2.getContext('2d')!.drawImage(r.domElement, 0, 0, w, H);
    panels.push({ title: shot.title, half: shot.half, calls: r.info.render.calls, triangles: r.info.render.triangles });
    let k = 0;
    for (const l of labels) {
      const v = new THREE.Vector3(l.x, l.above ? 2.05 : 0, l.z).project(cam.camera);
      const sx = ((v.x + 1) / 2) * w;
      const sy = ((1 - v.y) / 2) * H;
      if (sx < 20 || sx > w - 20 || sy < 40 || sy > H - 20) continue;
      const lab = el('div', 'label', panel, l.text);
      lab.style.left = `${sx}px`;
      // мелко на общем плане — подписи соседей вразбежку по высоте
      lab.style.top = `${l.above ? sy - 24 : sy + 6 + (shot.half > 5 && k++ % 2 ? 17 : 0)}px`;
      if (l.tone) {
        lab.style.fontWeight = '600';
        lab.style.background = l.tone === 'rb' ? 'rgba(40,90,140,0.88)' : 'rgba(120,75,30,0.88)';
      }
    }
  }

  stats.view = mode;
  stats.gpu = gpuString(r);
  stats.panels = panels;
  stats.rocketbox = [...avatars.values()].map(a => ({
    id: a.spec.id,
    role: a.spec.role,
    tris: a.tris,
    verts: a.verts,
    bones: a.bones,
    fbxMB: +(a.load.fbxBytes / 1e6).toFixed(2),
    fetchMs: a.load.fetchMs,
    parseMs: a.load.parseMs,
    loadMs: a.load.totalMs,
    textures: a.textures.map(t => `${t.name} ${t.w}×${t.h}`),
    gpuMB: +(a.textures.reduce((s, t) => s + gpuBytes(t.w, t.h), 0) / 1e6).toFixed(1),
  }));
  stats.rocketboxLoadMs = rbMs;
  stats.lods = lods;
  stats.game = { loadMs: game.loadMs, looks: game.people.looks.map(l => ({ name: l.name, tris: l.tris, lodTris: l.lodTris, bones: l.joints })) };
  stats.textures = { count: texTotals.count, decodeMs: Math.round(texTotals.ms), rgbaMB: +(texTotals.bytes / 1e6).toFixed(1) };
  stats.totalMs = ms(t0);
}
