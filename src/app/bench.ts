// Авто-бенч в игре (spec docs/specs/2026-10-shell-3d.md, «Авто-бенч»): больница движка с настоящим потоком — смена
// проматывается до 10:30, люди сразу на местах, дальше часы идут на ×1. Пресеты × два плана камеры: общий план и проход
// крупным планом (полные модели людей). Числа — как у пробы (spikes/render-3d, `runs[]`), плюс время видеокарты, время
// потока расчёта и план камеры. В конце — четыре снимка 1920×1080 на «высоком».
// Исправлено, как в копии «Фармзавода» (pharma: src/app/bench.ts @ b9696c0, Nefeste/pharma#53): начало прогона
// отмечается счётом замеров видеокарты и потока, а не длиной их памяти: память обрезается, и выборка была пустой.
import * as THREE from 'three';
import { T } from '../i18n';
import type { Quality } from '../render/view';
import { PRESETS, QUALITIES } from '../render/view';
import { H } from '../sim/pack';
import { type Game, SCENE } from './game';
import { since, summarize } from './stats';

export interface BenchOpts {
  secs?: number;
  warm?: number;
  qualities?: Quality[];
  shots?: boolean;
  /** к какому часу смены промотать перед замером */
  hour?: number;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
let running = false;

/** Промотать смену до часа `until` (игровые секунды) так быстро, как успевает поток; люди — сразу на местах. */
export async function fastForward(g: Game, until: number) {
  g.manual = true;
  await new Promise<void>(resolve => {
    g.onFrame = () => {
      if (g.t >= until) {
        g.onFrame = null;
        resolve();
        return;
      }
      const lag = g.lastSlice?.lag ?? 0;
      g.client.frame(!g.client.busy && lag < 600 ? 1800 : 0, 40);
    };
  });
  g.manual = false;
  g.crowd.settleAll();
}

/** Середины помещений этих типов — точки прохода камеры. */
function route(g: Game): THREE.Vector3[] {
  const types = ['room.waiting', 'room.reception', 'room.office', 'room.ward', 'room.emergency', 'room.xray', 'room.icu'];
  const pts: THREE.Vector3[] = [];
  for (const t of types) {
    for (const r of g.layout.plan.rooms.filter(x => x.type === t).slice(0, t === 'room.office' || t === 'room.ward' ? 2 : 1)) pts.push(new THREE.Vector3(r.x + r.w / 2, 0, r.y + r.h / 2));
  }
  return pts.length ? pts : [new THREE.Vector3(g.layout.w / 2, 0, g.layout.h / 2)];
}

function along(pts: THREE.Vector3[], k: number, out: THREE.Vector3) {
  const f = Math.min(0.9999, Math.max(0, k)) * (pts.length - 1);
  const i = Math.floor(f);
  return out.copy(pts[i]).lerp(pts[Math.min(pts.length - 1, i + 1)], f - i);
}

export async function runBench(g: Game, opts: BenchOpts) {
  if (running) return;
  running = true;
  const secs = opts.secs ?? 15;
  const warm = opts.warm ?? 3;
  const qualities = opts.qualities ?? QUALITIES;
  const store = g.store;
  const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
  const prefix = `bench-${window.shell ? 'electron' : 'browser'}-${stamp}`;
  const cams = ['overview', 'close'] as const;
  const runs: unknown[] = [];
  const startQuality = g.stage.quality;
  try {
    store.set({ status: T.debug.benchRunning });
    // вид бенча — без записи в настройки игрока (spec docs/specs/2026-10-settings.md)
    g.showWalls('cut');
    g.showProjection('persp');
    const target = Math.floor(g.t / 86400) * 86400 + (opts.hour ?? 10.5) * 3600;
    if (g.t < target) await fastForward(g, target);
    g.setSpeed(1);
    const path = route(g);
    for (const q of qualities) {
      g.showQuality(q);
      for (const cam of cams) {
        const name = cam === 'overview' ? T.debug.overviewCam : T.debug.closeCam;
        const place = (k: number) => {
          if (cam === 'overview') g.stage.cam.overview();
          else {
            along(path, k, g.stage.cam.target);
            g.stage.cam.half = 5;
          }
        };
        g.stage.cam.setYawNow(Math.PI / 4);
        place(0);
        store.set({ status: T.debug.benchCell(q, name, T.debug.warm) });
        await sleep(warm * 1000);
        const interval: number[] = [];
        const sim: number[] = [];
        const draw: number[] = [];
        const calls: number[] = [];
        const tris: number[] = [];
        const near: number[] = [];
        const far: number[] = [];
        // отметки — по счёту замеров, а не по длине их памяти: память обрезается
        const gpu0 = g.stage.gpu.taken;
        const rt0 = g.client.roundTripsTaken;
        let last = 0;
        const t0 = performance.now();
        g.onFrame = ts => {
          if (last) interval.push(ts - last);
          last = ts;
          place((performance.now() - t0) / (secs * 1000));
          const f = g.frames;
          if (f.sim.length) sim.push(f.sim[f.sim.length - 1]);
          if (f.draw.length) draw.push(f.draw[f.draw.length - 1]);
          calls.push(g.stage.calls);
          tris.push(g.stage.tris);
          near.push(g.stage.view.nearCount);
          far.push(g.stage.view.farCount);
        };
        store.set({ status: T.debug.benchCell(q, name, T.debug.measure) });
        await sleep(secs * 1000);
        g.onFrame = null;
        const gpu = since(g.stage.gpu.samples, g.stage.gpu.taken, gpu0);
        const cpu = sim.map((v, i) => v + (draw[i] ?? 0));
        const iv = summarize(interval);
        const avg = (a: number[]) => Math.round(a.reduce((x, y) => x + y, 0) / Math.max(1, a.length));
        const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
        const r = g.stage.renderer;
        const run = {
          renderer: 'three',
          quality: q,
          camera: cam,
          people: g.crowd.walkers.size,
          patients: g.lastSlice ? g.lastSlice.buf[H.count] : 0,
          staff: g.staff.length,
          gameTime: g.clockText(),
          frames: interval.length,
          fps: Math.round((interval.length / secs) * 10) / 10,
          frameMs: iv,
          over33ms: interval.filter(v => v > 33.4).length,
          over100ms: interval.filter(v => v > 100).length,
          simMs: summarize(sim),
          drawCpuMs: summarize(draw),
          cpuMs: summarize(cpu),
          gpuMs: gpu.length ? summarize(gpu) : null,
          workerMs: summarize(since(g.client.roundTrips, g.client.roundTripsTaken, rt0)),
          drawCalls: avg(calls),
          triangles: avg(tris),
          peopleNear: Math.max(0, ...near),
          peopleFar: Math.max(0, ...far),
          gpuMemory: { geometries: r.info.memory.geometries, textures: r.info.memory.textures, programs: r.info.programs?.length ?? null },
          renderPx: { w: r.domElement.width, h: r.domElement.height },
          preset: PRESETS[q],
          jsHeapMB: mem ? Math.round(mem.usedJSHeapSize / 1048576) : null,
          processMB: window.shell ? (await window.shell.metrics()).workingSetMB : null,
          gpu: g.stage.gpuName,
        };
        console.log(`[bench] ${JSON.stringify(run)}`);
        runs.push(run);
      }
    }
    let shots: unknown[] = [];
    if (opts.shots !== false) {
      store.set({ status: T.debug.shots });
      g.showQuality('high');
      shots = await takeShots(g, prefix);
    }
    const info = window.shell ? await window.shell.info() : null;
    const result = {
      probe: 'game',
      game: 'bolnitsa',
      version: g.version,
      when: new Date().toISOString(),
      userAgent: navigator.userAgent,
      chromium: navigator.userAgent.match(/Chrome\/([\d.]+)/)?.[1] ?? null,
      cores: navigator.hardwareConcurrency,
      viewport: { w: g.host.clientWidth, h: g.host.clientHeight, dpr: window.devicePixelRatio || 1 },
      settings: {
        secs, warm, qualities, cameras: cams, seed: SCENE.seed, preset: SCENE.preset, flow: g.flow, walls: 'cut',
        camera: 'perspective 20°, pitch 52°; overview and a close pass (half-height 5 m)',
      },
      scene: {
        cells: `${g.layout.w}x${g.layout.h}`,
        rooms: g.layout.plan.rooms.length,
        things: g.layout.things.length,
        furnitureItems: g.furnished.batch.items,
        furnitureTris: Math.round(g.furnished.batch.tris),
        looks: g.people.looks.map(l => ({ name: l.name, tris: l.tris, lodTris: l.lodTris, joints: l.joints, height: l.height, headRatio: Math.round(l.headRatio * 10) / 10 })),
        bakedFrames: g.people.totalFrames,
        boneTexture: `${g.people.boneTexture.image.width}x${g.people.boneTexture.image.height}`,
        seats: g.furnished.seats.filter(Boolean).length,
        beds: g.furnished.lies.filter(Boolean).length,
        lamps: g.stage.lamps.points.length,
        doors: g.stage.doors.doors.length,
        three: THREE.REVISION,
      },
      gpuTimer: g.stage.gpu.available,
      startup: { firstFrameMs: g.firstFrameMs, loadMs: g.load },
      electron: info,
      shots,
      runs,
    };
    const json = JSON.stringify(result, null, 2);
    console.log(`BENCH_RESULT ${JSON.stringify({ ...result, electron: null })}`);
    window.__benchResult = result;
    if (window.shell) {
      const path = await window.shell.save(json);
      store.set({ status: T.debug.done(path) });
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      a.download = `${prefix}.json`;
      a.click();
      store.set({ status: T.debug.download });
    }
    setTimeout(() => store.set({ status: '' }), 15000);
    g.showQuality(startQuality);
    g.showWalls();
    g.showProjection();
  } catch (e) {
    window.__benchError = String((e as Error)?.stack ?? e);
    store.set({ error: String(e) });
  } finally {
    g.onFrame = null;
    g.manual = false;
    running = false;
  }
}

interface ShotSpec {
  name: string;
  title: string;
  target: THREE.Vector3;
  half: number;
  hour: number;
  yaw: number;
}

function roomCenter(g: Game, type: string): THREE.Vector3 {
  const r = g.layout.plan.rooms.find(x => x.type === type) ?? g.layout.plan.rooms[0];
  return new THREE.Vector3(r.x + r.w / 2, 0, r.y + r.h / 2);
}

/** Четыре точки, как у пробы: общий план днём, регистратура и зал ожидания, палата, вечер. */
function shotSpecs(g: Game): ShotSpec[] {
  const y = Math.PI / 4;
  const waiting = roomCenter(g, 'room.waiting');
  const reception = roomCenter(g, 'room.reception');
  return [
    { name: '1-overview', title: T.shots.overview, target: new THREE.Vector3(g.layout.w / 2, 0, g.layout.h / 2), half: Math.max(g.layout.h * 0.62, g.layout.w * 0.36), hour: 12, yaw: y },
    { name: '2-reception', title: T.shots.reception, target: waiting.clone().lerp(reception, 0.35), half: 6.5, hour: 11, yaw: y },
    { name: '3-ward', title: T.shots.ward, target: roomCenter(g, 'room.ward'), half: 5.5, hour: 14, yaw: y + Math.PI / 2 },
    { name: '4-evening', title: T.shots.evening, target: new THREE.Vector3(g.layout.w / 2, 0, g.layout.h / 2 + 4), half: 13, hour: 19.5, yaw: y + Math.PI },
  ];
}

/** Снимки 1920×1080; `prefix` — начало имени файла. */
export async function takeShots(g: Game, prefix: string): Promise<{ name: string; title: string; path: string | null }[]> {
  const out: { name: string; title: string; path: string | null }[] = [];
  const cam = g.stage.cam;
  const save = { target: cam.target.clone(), half: cam.half, yaw: cam.yaw, speed: g.speed };
  window.__shots = [];
  g.setSpeed(0);
  for (const s of shotSpecs(g)) {
    cam.target.copy(s.target);
    cam.half = s.half;
    cam.setYawNow(s.yaw);
    // люди успевают сесть и лечь
    g.crowd.settleAll();
    const url = g.stage.shot(1920, 1080, g.crowd, g.pop.paint, k => g.pop.triageOf(k), s.hour);
    const name = `${prefix}-${s.name}.png`;
    window.__shots.push({ name, dataUrl: url });
    const path = window.shell ? await window.shell.saveShot(name, url) : null;
    out.push({ name, title: s.title, path });
    await sleep(50);
  }
  cam.target.copy(save.target);
  cam.half = save.half;
  cam.setYawNow(save.yaw);
  g.setSpeed(save.speed);
  return out;
}
