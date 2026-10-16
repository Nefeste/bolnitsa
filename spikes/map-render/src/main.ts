// Проба «Карта на ПК»: одна сцена — две реализации (PixiJS и CanvasKit), камера мышью,
// счётчик кадров и авто-бенч. Параметры адреса:
//   ?r=pixi|ck      — реализация (по умолчанию pixi)
//   &n=200          — сколько людей
//   &bench=1|all    — авто-бенч текущей реализации или обеих подряд
//   &secs=20&warm=2 — секунд замера и прогрева на каждое число людей
//   &counts=50,100,200,400
import { Crowd } from './crowd';
import { CELL_PX, H, makeHospital, W } from './hospital';
import { ckLoadMs, createCanvasKit } from './render-ck';
import { createPixi } from './render-pixi';
import { makeAtlas } from './sprites';
import { summarize, Window } from './stats';
import type { Camera, MapRenderer, RendererFactory } from './types';

type Kind = 'pixi' | 'ck';
interface ProbeBridge {
  save(json: string): Promise<string>;
  metrics(): Promise<{ workingSetMB: number; privateMB: number; byType: Record<string, number> }>;
  info(): Promise<Record<string, unknown>>;
  firstFrame(ms: number): void;
}
declare global {
  interface Window {
    probe?: ProbeBridge;
    __benchResult?: unknown;
    __benchError?: string;
  }
}

const q = new URLSearchParams(location.search);
const num = (k: string, d: number) => (q.has(k) ? Number(q.get(k)) : d);
const factories: Record<Kind, RendererFactory> = { pixi: createPixi, ck: createCanvasKit };
const NAMES: Record<Kind, string> = { pixi: 'PixiJS', ck: 'CanvasKit' };

const hospital = makeHospital(num('seed', 1));
const atlas = makeAtlas();
const host = document.getElementById('map') as HTMLDivElement;
const hud = document.getElementById('hud') as HTMLDivElement;
const statusEl = document.getElementById('status') as HTMLDivElement;

let kind: Kind = q.get('r') === 'ck' ? 'ck' : 'pixi';
let people = num('n', 200);
let renderer: MapRenderer | null = null;
let crowd = new Crowd(hospital, people, num('seed', 1) + 6);
const cam: Camera = { s: 1, tx: 0, ty: 0 };
const win = new Window();
const live = new Window();
let last = 0;
let firstFrameMs = 0;
const initMs: Partial<Record<Kind, number>> = {};
let switching = false;

function size() {
  return { w: host.clientWidth, h: host.clientHeight, dpr: window.devicePixelRatio || 1 };
}

function fit() {
  const { w, h } = size();
  cam.s = Math.min(w / (W * CELL_PX), h / (H * CELL_PX)) * 0.96;
  cam.tx = (w - W * CELL_PX * cam.s) / 2;
  cam.ty = (h - H * CELL_PX * cam.s) / 2;
}

async function use(k: Kind) {
  switching = true;
  renderer?.destroy();
  renderer = null;
  kind = k;
  const { w, h, dpr } = size();
  const t0 = performance.now();
  const r = await factories[k](hospital, atlas, w, h, dpr);
  initMs[k] = Math.round(performance.now() - t0);
  r.canvas.style.display = 'block';
  host.appendChild(r.canvas);
  r.setCrowd(crowd);
  renderer = r;
  win.reset();
  live.reset();
  last = 0;
  switching = false;
  renderButtons();
}

function setPeople(n: number) {
  people = n;
  crowd = new Crowd(hospital, n, num('seed', 1) + 6);
  renderer?.setCrowd(crowd);
  win.reset();
  live.reset();
  renderButtons();
}

function frame(ts: number) {
  requestAnimationFrame(frame);
  if (!renderer || switching) return;
  if (last) {
    const dt = ts - last;
    win.interval.push(dt);
    live.interval.push(dt);
  }
  const dtSec = last ? Math.min(0.1, (ts - last) / 1000) : 0;
  last = ts;
  const t0 = performance.now();
  crowd.update(dtSec);
  const t1 = performance.now();
  renderer.draw(crowd, cam);
  const t2 = performance.now();
  win.sim.push(t1 - t0);
  win.draw.push(t2 - t1);
  live.sim.push(t1 - t0);
  live.draw.push(t2 - t1);
  if (!firstFrameMs) {
    firstFrameMs = Math.round(t2);
    window.probe?.firstFrame(firstFrameMs);
  }
}
requestAnimationFrame(frame);

// Живой счётчик: раз в полсекунды на экране, раз в 5 секунд в консоли.
let tick = 0;
setInterval(() => {
  if (!renderer || !live.interval.length) return;
  const iv = summarize(live.interval);
  const fps = Math.round(1000 / (iv.mean || 1));
  const line = `${NAMES[kind]} · ${people} чел. · ${fps} к/с · кадр ${iv.mean} мс (p95 ${iv.p95}) · люди ${summarize(live.sim).mean} мс · рисование CPU ${summarize(live.draw).mean} мс`;
  hud.textContent = `${line}\n${renderer.gpu}`;
  if (++tick % 10 === 0) console.log(`[проба] ${line}`);
  live.reset();
}, 500);

// Камера: колесо — масштаб вокруг курсора, перетаскивание любой кнопкой — сдвиг.
host.addEventListener(
  'wheel',
  e => {
    e.preventDefault();
    const rect = host.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const k = Math.exp(-e.deltaY * 0.0015);
    const s = Math.min(8, Math.max(0.3, cam.s * k));
    cam.tx = mx - ((mx - cam.tx) * s) / cam.s;
    cam.ty = my - ((my - cam.ty) * s) / cam.s;
    cam.s = s;
  },
  { passive: false },
);
let drag: { x: number; y: number } | null = null;
host.addEventListener('pointerdown', e => {
  drag = { x: e.clientX, y: e.clientY };
  host.setPointerCapture(e.pointerId);
});
host.addEventListener('pointermove', e => {
  if (!drag) return;
  cam.tx += e.clientX - drag.x;
  cam.ty += e.clientY - drag.y;
  drag = { x: e.clientX, y: e.clientY };
});
host.addEventListener('pointerup', () => {
  drag = null;
});
host.addEventListener('contextmenu', e => e.preventDefault());
window.addEventListener('resize', () => {
  const { w, h, dpr } = size();
  renderer?.resize(w, h, dpr);
});

// Кнопки
const bar = document.getElementById('bar') as HTMLDivElement;
function renderButtons() {
  bar.innerHTML = '';
  const btn = (label: string, on: boolean, act: () => void) => {
    const b = document.createElement('button');
    b.textContent = label;
    if (on) b.className = 'on';
    b.onclick = act;
    bar.appendChild(b);
  };
  btn('PixiJS', kind === 'pixi', () => void use('pixi'));
  btn('CanvasKit', kind === 'ck', () => void use('ck'));
  for (const n of [50, 100, 200, 400]) btn(`${n}`, people === n, () => setPeople(n));
  btn('Вся карта', false, fit);
  btn('Авто-бенч (оба)', false, () => void bench(['pixi', 'ck']));
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function bench(kinds: Kind[]) {
  const secs = num('secs', 20);
  const warm = num('warm', 2);
  const counts = (q.get('counts') ?? '50,100,200,400').split(',').map(Number);
  const runs: unknown[] = [];
  statusEl.textContent = 'Авто-бенч идёт…';
  for (const k of kinds) {
    await use(k);
    for (const n of counts) {
      setPeople(n);
      fit();
      statusEl.textContent = `Авто-бенч: ${NAMES[k]}, ${n} чел. — прогрев…`;
      await sleep(warm * 1000);
      win.reset();
      crowd.searches = 0;
      crowd.searchMs = 0;
      statusEl.textContent = `Авто-бенч: ${NAMES[k]}, ${n} чел. — замер ${secs} с…`;
      await sleep(secs * 1000);
      const iv = summarize(win.interval);
      const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
      const run = {
        renderer: k,
        people: n,
        frames: win.interval.length,
        fps: Math.round((win.interval.length / secs) * 10) / 10,
        frameMs: iv,
        over33ms: win.interval.filter(v => v > 33.4).length,
        over100ms: win.interval.filter(v => v > 100).length,
        simMs: summarize(win.sim),
        drawCpuMs: summarize(win.draw),
        astar: { searches: crowd.searches, avgMs: crowd.searches ? Math.round((crowd.searchMs / crowd.searches) * 1000) / 1000 : 0 },
        jsHeapMB: mem ? Math.round(mem.usedJSHeapSize / 1048576) : null,
        processMB: window.probe ? (await window.probe.metrics()).workingSetMB : null,
        gpu: renderer?.gpu,
      };
      console.log(`[бенч] ${JSON.stringify(run)}`);
      runs.push(run);
    }
  }
  const { w, h, dpr } = size();
  const result = {
    probe: 'map-render',
    when: new Date().toISOString(),
    userAgent: navigator.userAgent,
    chromium: navigator.userAgent.match(/Chrome\/([\d.]+)/)?.[1] ?? null,
    cores: navigator.hardwareConcurrency,
    viewport: { w, h, dpr },
    settings: { secs, warm, counts, seed: num('seed', 1) },
    scene: { cells: `${W}x${H}`, rooms: hospital.rooms.length, things: hospital.things.length },
    startup: { firstFrameMs, ckLoadMs: Math.round(ckLoadMs), initMs },
    electron: window.probe ? await window.probe.info() : null,
    runs,
  };
  const json = JSON.stringify(result, null, 2);
  console.log(`BENCH_RESULT ${JSON.stringify(result)}`);
  window.__benchResult = result;
  if (window.probe) {
    const path = await window.probe.save(json);
    statusEl.textContent = `Готово. Итог сохранён: ${path}`;
  } else {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = `bench-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
    a.textContent = 'Готово — скачать итог (JSON)';
    statusEl.textContent = '';
    statusEl.appendChild(a);
  }
}

async function start() {
  fit();
  await use(kind);
  const b = q.get('bench');
  if (b === 'all') await bench(['pixi', 'ck']);
  else if (b) await bench([kind]);
}
start().catch(e => {
  window.__benchError = String(e?.stack ?? e);
  statusEl.textContent = `Ошибка: ${e}`;
  console.error(e);
});
