// Страница игры (spec docs/specs/2026-10-shell-3d.md): панели React и 3D-вид. Параметры адреса — для проверок и бенча:
//   ?q=low|medium|high — пресет качества; ?bench=1 (&secs=15&warm=3&qualities=low,high&shots=0) — авто-бенч;
//   ?shot=1 — только снимки; ?start=10.5 — сразу промотать смену до этого часа; ?lang=en — язык;
//   ?hospital=empty|preset — с чего начать (spec docs/specs/2026-10-build.md, «Начало игры»; нет — окно спросит; бенч и
//   снимки — всегда готовая больница). В Electron — те же ключи: --bench, --hospital empty.
//   ?flow=6,1 — поток числами (сами в час, машин скорой в час), а не от больницы (spec docs/specs/2026-10-economy.md):
//   сценарий режима врача в браузере; авто-бенч и снимки — всегда числа сцены, та же толпа, что прежде.
import { createRoot } from 'react-dom/client';
import { setLang, systemLang, T, type Lang } from '../i18n';
import type { Quality } from '../render/view';
import { App, type Names } from '../ui/App';
import { type Actions, Store } from '../ui/store';
import type { Flow } from '../engine/shift/types';
import { AUTO, Game, SCENE, type Start } from './game';

declare const __VERSION__: string;

const q = new URLSearchParams(location.search);
const lang: Lang = q.get('lang') === 'en' || q.get('lang') === 'ru' ? (q.get('lang') as Lang) : systemLang();
setLang(lang);
document.documentElement.lang = lang;
document.title = T.app.title;

const store = new Store();
store.set({ lang, version: __VERSION__ });
let game: Game | undefined;
const later = <K extends keyof Actions>(k: K) => ((...a: unknown[]) => (game?.actions[k] as (...x: unknown[]) => void)?.(...a)) as Actions[K];
const actions: Actions = {
  setSpeed: later('setSpeed'),
  untilMorning: later('untilMorning'),
  setWalls: later('setWalls'),
  setQuality: later('setQuality'),
  setProjection: later('setProjection'),
  overview: later('overview'),
  rotate: later('rotate'),
  select: later('select'),
  setTab: later('setTab'),
  toggleDebug: later('toggleDebug'),
  bench: later('bench'),
  setLang: later('setLang'),
  toggleBuild: later('toggleBuild'),
  setTool: later('setTool'),
  pickRoomType: later('pickRoomType'),
  pickReady: later('pickReady'),
  toggleReadyStaff: later('toggleReadyStaff'),
  pickItem: later('pickItem'),
  undo: later('undo'),
  done: later('done'),
  furnish: later('furnish'),
  demolish: later('demolish'),
  hire: later('hire'),
  dismiss: later('dismiss'),
  filterPatients: later('filterPatients'),
  focus: later('focus'),
  find: later('find'),
  toggleLayers: later('toggleLayers'),
  toggleQueues: later('toggleQueues'),
  doctor: later('doctor'),
  money: later('money'),
  dismissHint: later('dismissHint'),
  toggleView: later('toggleView'),
  startGame: kind => {
    store.set({ choose: false });
    chosen?.(kind);
  },
};
let chosen: ((kind: Start) => void) | undefined;
const names: Names = {
  room: id => game?.names().room(id) ?? id ?? '—',
  role: id => game?.names().role(id) ?? id ?? '—',
  finding: id => game?.names().finding(id) ?? id ?? '—',
};
createRoot(document.getElementById('ui')!).render(<App store={store} actions={actions} names={names} />);

const quality = (['low', 'medium', 'high'] as Quality[]).find(x => x === q.get('q')) ?? 'high';

/** С чего начать: ключ адреса или Electron; бенч и снимки — готовая больница; иначе спросить игрока. */
async function startOf(): Promise<Start> {
  const args = window.shell ? await window.shell.args() : [];
  const has = (k: string) => q.get(k) === '1' || args.includes(`--${k}`);
  const val = q.get('hospital') ?? (args.includes('--hospital') ? args[args.indexOf('--hospital') + 1] : null);
  if (has('bench') || has('shot')) return 'preset';
  if (val === 'empty' || val === 'preset' || val === 'poly') return val;
  store.set({ choose: true });
  return new Promise<Start>(resolve => {
    chosen = resolve;
  });
}

/** Поток: от больницы; авто-бенч и снимки — числа сцены (та же толпа, что прежде); `?flow=6,1` — эти числа. */
async function flowOf(): Promise<Flow> {
  const args = window.shell ? await window.shell.args() : [];
  const has = (k: string) => q.get(k) === '1' || args.includes(`--${k}`);
  if (has('bench') || has('shot')) return SCENE.flow;
  const [walk, amb] = (q.get('flow') ?? '').split(',').map(Number);
  return Number.isFinite(walk) && walk > 0 ? { perHour: walk, ...(Number.isFinite(amb) && amb > 0 ? { ambulancePerHour: amb } : {}) } : AUTO;
}

startOf()
  .then(async start => Game.create(document.getElementById('view')!, store, __VERSION__, quality, start, await flowOf()))
  .then(async g => {
    game = g;
    window.__game = g;
    const args = window.shell ? await window.shell.args() : [];
    const has = (k: string) => q.get(k) === '1' || args.includes(`--${k}`);
    const val = (k: string) => q.get(k) ?? (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : null);
    if (val('start')) {
      const { fastForward } = await import('./bench');
      await fastForward(g, Math.floor(g.t / 86400) * 86400 + Number(val('start')) * 3600);
    }
    (window as unknown as { __started: boolean }).__started = true;
    if (has('bench')) {
      const { runBench } = await import('./bench');
      const num = (k: string) => (val(k) ? Number(val(k)) : undefined);
      const qs = val('qualities')?.split(',') as Quality[] | undefined;
      await runBench(g, { secs: num('secs'), warm: num('warm'), qualities: qs, shots: val('shots') !== '0' });
    } else if (has('shot')) {
      const { takeShots } = await import('./bench');
      await takeShots(g, 'shot');
      (window as unknown as { __shotsDone: boolean }).__shotsDone = true;
    }
  })
  .catch(e => {
    window.__benchError = String((e as Error)?.stack ?? e);
    store.set({ error: String(e) });
    console.error(e);
  });
