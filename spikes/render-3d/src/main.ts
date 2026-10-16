// Проба «3D-вид больницы»: Three.js, модели CC0, люди со скелетной анимацией на видеокарте,
// стены «целые / срез / вниз», свет с тенями и время суток, пресеты качества, авто-бенч и снимки.
// Параметры адреса:
//   &n=200            — сколько людей
//   &q=low|medium|high — пресет качества
//   &bench=1          — авто-бенч: все пресеты × все числа людей, потом снимки
//   &secs=15&warm=3   — секунд замера и прогрева на каждую клетку бенча
//   &counts=50,100,200,400&qualities=low,medium,high
//   &shots=0          — без снимков; &debug=models — все модели рядом (подбор поворотов)
import * as THREE from 'three';
import { type Index, loadModel, loadPeople, type Model, type People } from './assets';
import { Crowd3D, findSeats } from './crowd';
import { addStalls } from './decor';
import { H, makeHospital, type RoomType, W } from './hospital';
import { PeopleView } from './people';
import { summarize, Window } from './stats';
import { createRenderer, Daylight, gpuString, IsoCamera, type Projection, PRESETS, type Quality, QUALITY_NAMES } from './view';
import { batchMeshes, buildFloors, buildGround, buildWalls, furnish, type WallMode } from './world';

interface ProbeBridge {
  save(json: string): Promise<string>;
  saveShot(name: string, dataUrl: string): Promise<string>;
  metrics(): Promise<{ workingSetMB: number; privateMB: number; byType: Record<string, number> }>;
  info(): Promise<Record<string, unknown>>;
  firstFrame(ms: number): void;
}
declare global {
  interface Window {
    probe?: ProbeBridge;
    __benchResult?: unknown;
    __benchError?: string;
    __shots?: { name: string; dataUrl: string }[];
    __ready?: boolean;
    __shotsDone?: boolean;
  }
}

const q = new URLSearchParams(location.search);
const num = (k: string, d: number) => (q.has(k) ? Number(q.get(k)) : d);
const host = document.getElementById('view') as HTMLDivElement;
const hud = document.getElementById('hud') as HTMLDivElement;
const statusEl = document.getElementById('status') as HTMLDivElement;
const bar = document.getElementById('bar') as HTMLDivElement;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const t0 = performance.now();

const hospital = makeHospital(num('seed', 1));
const stalls = addStalls(hospital);
const seats = findSeats(hospital);
const scene = new THREE.Scene();
const cam = new IsoCamera();
const light = new Daylight(scene);
let quality: Quality = (['low', 'medium', 'high'] as Quality[]).includes(q.get('q') as Quality) ? (q.get('q') as Quality) : 'medium';
let renderer = createRenderer(host, quality);
let gpu = gpuString(renderer);
let wallMode: WallMode = 'cut';
let peopleN = num('n', 200);
let crowd: Crowd3D;
let view: PeopleView;
let people: People;
let walls: ReturnType<typeof buildWalls>;
let looks: { doctors: number[]; staff: number[]; patients: number[] };
let benchRunning = false;
const loadMs: Record<string, number> = {};
const sceneInfo: Record<string, unknown> = {};

const win = new Window();
const live = new Window();
let last = 0;
let firstFrameMs = 0;

function applyQuality(qn: Quality) {
  if (qn !== quality || !renderer) {
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
    quality = qn;
    renderer = createRenderer(host, qn);
    gpu = gpuString(renderer);
  }
  const p = PRESETS[qn];
  light.setShadowSize(p.shadowSize);
  light.setEnv(renderer, p.env);
  view?.setShadows(p.peopleShadows);
  resize();
  renderButtons();
}

function resize() {
  const w = host.clientWidth;
  const h = host.clientHeight;
  renderer.setSize(w, h);
  cam.aspect = w / h;
}
window.addEventListener('resize', resize);

function setPeople(n: number) {
  peopleN = n;
  crowd = new Crowd3D(hospital, seats, n, looks, num('seed', 1) + 6);
  const sit = people.looks[0].clips;
  crowd.sitDur = sit.SitDown.duration;
  crowd.standDur = sit.StandUp.duration;
  const shift = people.looks[0].sitShift;
  crowd.setSeating(num('lift', 0.08), num('back', -shift.z));
  sceneInfo.sitShift = shift;
  win.reset();
  live.reset();
  renderButtons();
}

function setWalls(m: WallMode) {
  wallMode = m;
  walls.setMode(m);
  renderButtons();
}

// ---------------------------------------------------------------- загрузка

async function loadAll() {
  const base = './assets/models';
  const index = (await (await fetch(`${base}/index.json`)).json()) as Index;
  const tm = performance.now();
  const models = new Map<string, Model>();
  await Promise.all([
    ...index.kenney.map(async n => models.set(`kenney/${n}`, await loadModel(`${base}/kenney/${n}.glb`, n))),
    ...index.kaykit.map(async n => models.set(`kaykit/${n}`, await loadModel(`${base}/kaykit/${n}.glb`, n))),
  ]);
  loadMs.furniture = Math.round(performance.now() - tm);
  const tp = performance.now();
  people = await loadPeople(`${base}/people`, index.people);
  loadMs.people = Math.round(performance.now() - tp);
  const idx = (pred: (n: string) => boolean) => index.people.map((n, i) => (pred(n) ? i : -1)).filter(i => i >= 0);
  looks = { doctors: idx(n => n.startsWith('Doctor')), staff: idx(n => n.startsWith('Worker')), patients: idx(n => !n.startsWith('Doctor') && !n.startsWith('Worker')) };
  return models;
}

function debugModels(models: Map<string, Model>) {
  // все модели рядом, перёд (+Z) отмечен красным конусом: подбор поворотов в world.ts
  const names = [...models.keys()];
  const cols = 8;
  names.forEach((n, i) => {
    const m = models.get(n)!;
    const g = new THREE.Group();
    for (const p of m.parts) g.add(new THREE.Mesh(p.geometry, new THREE.MeshStandardMaterial({ color: p.color, map: p.map })));
    const size = m.box.getSize(new THREE.Vector3());
    const s = 1.6 / Math.max(size.x, size.z, size.y * 0.8);
    g.scale.setScalar(s);
    g.position.set(4 + (i % cols) * 3, 0, 4 + Math.floor(i / cols) * 3);
    scene.add(g);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.4, 8), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
    cone.rotation.x = Math.PI / 2;
    cone.position.set(g.position.x, 0.1, g.position.z + 1.2);
    scene.add(cone);
  });
}

async function build() {
  statusEl.textContent = 'Загрузка моделей…';
  const models = await loadAll();
  const tb = performance.now();
  if (q.get('debug') === 'models') {
    debugModels(models);
    for (const m of buildGround(4)) scene.add(m);
  } else {
    for (const m of buildGround(8)) scene.add(m);
    for (const m of buildFloors(hospital, 8)) scene.add(m);
    walls = buildWalls(hospital);
    scene.add(walls.mesh);
    const fur = furnish(hospital, models, stalls);
    for (const m of batchMeshes(fur.batch)) scene.add(m);
    sceneInfo.furnitureItems = fur.batch.items;
    sceneInfo.furnitureTris = Math.round(fur.batch.tris);
  }
  view = new PeopleView(people, 400);
  scene.add(view.group);
  loadMs.scene = Math.round(performance.now() - tb);
  sceneInfo.looks = people.looks.map(l => ({ name: l.name, tris: l.tris, lodTris: l.lodTris, joints: l.joints }));
  sceneInfo.bakedFrames = people.totalFrames;
  sceneInfo.boneTexture = `${people.boneTexture.image.width}x${people.boneTexture.image.height}`;
  sceneInfo.seats = seats.length;
  sceneInfo.toiletStalls = stalls.length;
  if (walls) walls.setMode(wallMode);
  setPeople(peopleN);
  light.setHour(num('hour', 12));
  applyQuality(quality);
  statusEl.textContent = '';
}

// ---------------------------------------------------------------- кадр

const focus = new THREE.Vector3();
const toCam = new THREE.Vector2();
let sim = 0;
let draw = 0;
let calls = 0;
let tris = 0;

/** Люди за краем кадра не рисуются; полные модели — только вблизи (пресет). */
function updatePeople() {
  const cull = cam.half * Math.max(1, cam.aspect) * 1.25 + 3;
  view.update(crowd, cam.target, cull, cam.half <= PRESETS[quality].fullHalf);
}

function render() {
  cam.update(1 / 60);
  if (walls) {
    walls.uniforms.uFocus.value.set(cam.target.x, cam.target.z);
    walls.uniforms.uRadius.value = Math.max(6, cam.half * 0.55);
    walls.uniforms.uToCam.value.copy(cam.toCam(toCam));
  }
  renderer.render(scene, cam.camera);
}

function frame(ts: number) {
  requestAnimationFrame(frame);
  if (!crowd || shooting) return;
  if (last) {
    win.interval.push(ts - last);
    live.interval.push(ts - last);
  }
  const dt = last ? Math.min(0.1, (ts - last) / 1000) : 0;
  last = ts;
  if (!benchRunning) edgePan(dt);
  const a = performance.now();
  crowd.update(dt);
  focus.copy(cam.target);
  updatePeople();
  const b = performance.now();
  render();
  const c = performance.now();
  sim = b - a;
  draw = c - b;
  calls = renderer.info.render.calls;
  tris = renderer.info.render.triangles;
  win.sim.push(sim);
  win.draw.push(draw);
  live.sim.push(sim);
  live.draw.push(draw);
  callsWin.push(calls);
  trisWin.push(tris);
  if (!firstFrameMs) {
    firstFrameMs = Math.round(c);
    window.probe?.firstFrame(firstFrameMs);
  }
}
const callsWin: number[] = [];
const trisWin: number[] = [];

let tick = 0;
setInterval(() => {
  if (!crowd || !live.interval.length) return;
  const iv = summarize(live.interval);
  const fps = Math.round(1000 / (iv.mean || 1));
  const line = `${QUALITY_NAMES[quality]} · ${peopleN} чел. (вблизи ${view.nearCount}) · ${fps} к/с · кадр ${iv.mean} мс (p95 ${iv.p95}) · люди CPU ${summarize(live.sim).mean} мс · рисование CPU ${summarize(live.draw).mean} мс · вызовов ${calls} · треуг. ${Math.round(tris / 1000)} тыс.`;
  hud.textContent = `${line}\n${gpu} · ${String(light.hour).padStart(2, '0')}:00 · сидят ${crowd.sitting()}`;
  if (++tick % 10 === 0) console.log(`[проба] ${line}`);
  live.reset();
}, 500);

// ---------------------------------------------------------------- управление

let rightDrag: { x: number; y: number } | null = null;
let mouse: { x: number; y: number; inside: boolean } = { x: 0, y: 0, inside: false };
host.addEventListener(
  'wheel',
  e => {
    e.preventDefault();
    cam.zoom(Math.exp(e.deltaY * 0.0012));
  },
  { passive: false },
);
host.addEventListener('pointerdown', e => {
  if (e.button === 2 || e.button === 1) {
    rightDrag = { x: e.clientX, y: e.clientY };
    host.setPointerCapture(e.pointerId);
  }
});
host.addEventListener('pointermove', e => {
  mouse = { x: e.clientX, y: e.clientY, inside: true };
  if (!rightDrag) return;
  cam.pan(e.clientX - rightDrag.x, e.clientY - rightDrag.y, host.clientHeight);
  rightDrag = { x: e.clientX, y: e.clientY };
});
host.addEventListener('pointerup', () => {
  rightDrag = null;
});
document.addEventListener('mouseleave', () => {
  mouse.inside = false;
});
host.addEventListener('contextmenu', e => e.preventDefault());
window.addEventListener('blur', () => {
  mouse.inside = false;
});
window.addEventListener('keydown', e => {
  if (e.code === 'KeyQ') cam.rotate(-1);
  if (e.code === 'KeyE') cam.rotate(1);
});

/** Сдвиг краями окна: курсор ближе 10 точек к краю. */
function edgePan(dt: number) {
  if (!mouse.inside || rightDrag) return;
  const m = 10;
  const w = host.clientWidth;
  const h = host.clientHeight;
  const v = 700 * dt;
  let dx = 0;
  let dy = 0;
  if (mouse.x < m) dx = v;
  else if (mouse.x > w - m) dx = -v;
  if (mouse.y < m) dy = v;
  else if (mouse.y > h - m) dy = -v;
  if (dx || dy) cam.pan(dx, dy, h);
}

function renderButtons() {
  bar.innerHTML = '';
  const group = (label: string) => {
    const s = document.createElement('span');
    s.className = 'lbl';
    s.textContent = label;
    bar.appendChild(s);
  };
  const btn = (label: string, on: boolean, act: () => void) => {
    const b = document.createElement('button');
    b.textContent = label;
    if (on) b.className = 'on';
    b.onclick = act;
    bar.appendChild(b);
  };
  group('Люди');
  for (const n of [50, 100, 200, 400]) btn(`${n}`, peopleN === n, () => setPeople(n));
  group('Стены');
  btn('целые', wallMode === 'full', () => setWalls('full'));
  btn('срез', wallMode === 'cut', () => setWalls('cut'));
  btn('вниз', wallMode === 'down', () => setWalls('down'));
  group('Качество');
  for (const k of ['low', 'medium', 'high'] as Quality[]) btn(QUALITY_NAMES[k], quality === k, () => applyQuality(k));
  group('Камера');
  btn('орто', cam.projection === 'ortho', () => setProjection('ortho'));
  btn('персп. 20°', cam.projection === 'persp', () => setProjection('persp'));
  btn('Q ⟲', false, () => cam.rotate(-1));
  btn('E ⟳', false, () => cam.rotate(1));
  btn('Вся карта', false, overview);
  const lab = document.createElement('label');
  lab.className = 'lbl';
  lab.textContent = 'Время ';
  const range = document.createElement('input');
  range.type = 'range';
  range.min = '6';
  range.max = '22';
  range.step = '0.5';
  range.value = String(light.hour);
  range.oninput = () => light.setHour(Number(range.value));
  lab.appendChild(range);
  bar.appendChild(lab);
  btn('Авто-бенч', false, () => void bench());
}

function setProjection(p: Projection) {
  cam.projection = p;
  renderButtons();
}

function overview() {
  cam.target.set(W / 2, 0, H / 2);
  cam.half = 26;
}

// ---------------------------------------------------------------- снимки

let shooting = false;
const SHOT_W = 1920;
const SHOT_H = 1080;

function roomCenter(t: RoomType): THREE.Vector3 {
  const r = hospital.rooms.find(x => x.type === t) ?? hospital.rooms[0];
  return new THREE.Vector3(r.x + r.w / 2, 0, r.y + r.h / 2);
}

interface ShotSpec {
  name: string;
  title: string;
  target: THREE.Vector3;
  half: number;
  hour: number;
  yaw: number;
}

function shotSpecs(): ShotSpec[] {
  const y = Math.PI / 4;
  // &keepcam=1 — один снимок с камеры из адреса (подбор вида)
  if (q.has('keepcam')) return [{ name: 'view', title: 'камера из адреса', target: cam.target.clone(), half: cam.half, hour: light.hour, yaw: cam.yaw }];
  return [
    { name: '1-overview', title: 'общий план, полдень', target: new THREE.Vector3(W / 2, 0, H / 2), half: 26, hour: 12, yaw: y },
    { name: '2-reception', title: 'регистратура и ожидание крупно', target: roomCenter('reception'), half: 6.5, hour: 11, yaw: y },
    { name: '3-ward', title: 'палата крупно', target: roomCenter('ward'), half: 6, hour: 14, yaw: y + Math.PI / 2 },
    { name: '4-evening', title: 'вечер, средний план', target: new THREE.Vector3(W / 2, 0, H / 2 + 6), half: 13, hour: 19, yaw: y + Math.PI },
  ];
}

/** Снимок 1920×1080: холст временно получает этот размер, кадр читается сразу после отрисовки. */
async function takeShots(prefix: string): Promise<{ name: string; title: string; path: string | null }[]> {
  const out: { name: string; title: string; path: string | null }[] = [];
  const save = { target: cam.target.clone(), half: cam.half, yaw: cam.yaw, hour: light.hour, pr: renderer.getPixelRatio() };
  shooting = true;
  window.__shots = [];
  for (const s of shotSpecs()) {
    cam.target.copy(s.target);
    cam.half = s.half;
    cam.setYawNow(s.yaw);
    light.setHour(s.hour);
    // люди успевают разойтись и сесть за пару секунд счёта
    for (let k = 0; k < 450; k++) crowd.update(1 / 30);
    updatePeople();
    renderer.setPixelRatio(1);
    renderer.setSize(SHOT_W, SHOT_H, false);
    cam.aspect = SHOT_W / SHOT_H;
    render();
    const url = renderer.domElement.toDataURL('image/png');
    const name = `${prefix}-${s.name}.png`;
    window.__shots.push({ name, dataUrl: url });
    const path = window.probe ? await window.probe.saveShot(name, url) : null;
    out.push({ name, title: s.title, path });
    await sleep(50);
  }
  cam.target.copy(save.target);
  cam.half = save.half;
  cam.setYawNow(save.yaw);
  light.setHour(save.hour);
  renderer.setPixelRatio(save.pr);
  resize();
  shooting = false;
  last = 0;
  window.__shotsDone = true;
  return out;
}

// ---------------------------------------------------------------- авто-бенч

async function bench() {
  if (benchRunning) return;
  benchRunning = true;
  const secs = num('secs', 15);
  const warm = num('warm', 3);
  const counts = (q.get('counts') ?? '50,100,200,400').split(',').map(Number);
  const qualities = (q.get('qualities') ?? 'low,medium,high').split(',') as Quality[];
  const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
  const prefix = `bench-${window.probe ? 'electron' : 'browser'}-${stamp}`;
  const runs: unknown[] = [];
  statusEl.textContent = 'Авто-бенч идёт…';
  setWalls('cut');
  setProjection('persp');
  light.setHour(12);
  for (const qn of qualities) {
    applyQuality(qn);
    for (const n of counts) {
      setPeople(n);
      overview();
      cam.setYawNow(Math.PI / 4);
      statusEl.textContent = `Авто-бенч: ${QUALITY_NAMES[qn]}, ${n} чел. — прогрев…`;
      await sleep(warm * 1000);
      win.reset();
      callsWin.length = 0;
      trisWin.length = 0;
      crowd.searches = 0;
      crowd.searchMs = 0;
      statusEl.textContent = `Авто-бенч: ${QUALITY_NAMES[qn]}, ${n} чел. — замер ${secs} с…`;
      await sleep(secs * 1000);
      const iv = summarize(win.interval);
      const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
      const cpu = win.sim.map((v, i) => v + (win.draw[i] ?? 0));
      const p = PRESETS[qn];
      const run = {
        renderer: 'three',
        quality: qn,
        people: n,
        frames: win.interval.length,
        fps: Math.round((win.interval.length / secs) * 10) / 10,
        frameMs: iv,
        over33ms: win.interval.filter(v => v > 33.4).length,
        over100ms: win.interval.filter(v => v > 100).length,
        simMs: summarize(win.sim),
        drawCpuMs: summarize(win.draw),
        cpuMs: summarize(cpu),
        astar: { searches: crowd.searches, avgMs: crowd.searches ? Math.round((crowd.searchMs / crowd.searches) * 1000) / 1000 : 0 },
        drawCalls: Math.round(callsWin.reduce((a, b) => a + b, 0) / Math.max(1, callsWin.length)),
        triangles: Math.round(trisWin.reduce((a, b) => a + b, 0) / Math.max(1, trisWin.length)),
        peopleNear: view.nearCount,
        peopleFar: view.farCount,
        gpuMemory: { geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, programs: renderer.info.programs?.length ?? null },
        renderPx: { w: renderer.domElement.width, h: renderer.domElement.height },
        preset: p,
        jsHeapMB: mem ? Math.round(mem.usedJSHeapSize / 1048576) : null,
        processMB: window.probe ? (await window.probe.metrics()).workingSetMB : null,
        gpu,
      };
      console.log(`[бенч] ${JSON.stringify(run)}`);
      runs.push(run);
    }
  }
  let shots: unknown[] = [];
  if (q.get('shots') !== '0') {
    statusEl.textContent = 'Авто-бенч: снимки…';
    applyQuality('high');
    setPeople(200);
    shots = await takeShots(prefix);
  }
  const { clientWidth: w, clientHeight: h } = host;
  const result = {
    probe: 'render-3d',
    when: new Date().toISOString(),
    userAgent: navigator.userAgent,
    chromium: navigator.userAgent.match(/Chrome\/([\d.]+)/)?.[1] ?? null,
    cores: navigator.hardwareConcurrency,
    viewport: { w, h, dpr: window.devicePixelRatio || 1 },
    settings: { secs, warm, counts, qualities, seed: num('seed', 1), walls: 'cut', camera: 'перспектива 20°, наклон 52°, вся карта' },
    scene: { cells: `${W}x${H}`, rooms: hospital.rooms.length, things: hospital.things.length, ...sceneInfo, three: THREE.REVISION },
    startup: { firstFrameMs, loadMs },
    electron: window.probe ? await window.probe.info() : null,
    shots,
    runs,
  };
  const json = JSON.stringify(result, null, 2);
  console.log(`BENCH_RESULT ${JSON.stringify({ ...result, electron: null })}`);
  window.__benchResult = result;
  benchRunning = false;
  if (window.probe) {
    const path = await window.probe.save(json);
    statusEl.textContent = `Готово. Итог сохранён: ${path} (и снимки рядом)`;
  } else {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = `${prefix}.json`;
    a.textContent = 'Готово — скачать итог (JSON)';
    statusEl.textContent = '';
    statusEl.appendChild(a);
  }
}

async function start() {
  await build();
  overview();
  if (q.has('x')) cam.target.set(num('x', W / 2), 0, num('z', H / 2));
  if (q.has('half')) cam.half = num('half', 22);
  if (q.has('yaw')) cam.setYawNow((num('yaw', 45) * Math.PI) / 180);
  if (q.get('walls')) setWalls(q.get('walls') as WallMode);
  if (q.get('proj') === 'ortho') setProjection('ortho');
  loadMs.total = Math.round(performance.now() - t0);
  requestAnimationFrame(frame);
  window.__ready = true;
  if (q.get('bench')) await bench();
  else if (q.get('shot')) await takeShots('shot');
}
start().catch(e => {
  window.__benchError = String(e?.stack ?? e);
  statusEl.textContent = `Ошибка: ${e}`;
  console.error(e);
});
