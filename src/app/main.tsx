// Страница игры (spec docs/specs/2026-10-shell-3d.md): панели React и 3D-вид. Параметры адреса — для проверок и бенча:
//   ?q=low|medium|high — пресет качества; ?bench=1 (&secs=15&warm=3&qualities=low,high&shots=0) — авто-бенч;
//   ?shot=1 — только снимки; ?start=10.5 — сразу промотать смену до этого часа; ?lang=en — язык.
import { createRoot } from 'react-dom/client';
import { setLang, systemLang, T, type Lang } from '../i18n';
import type { Quality } from '../render/view';
import { App, type Names } from '../ui/App';
import { type Actions, Store } from '../ui/store';
import { Game } from './game';

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
};
const names: Names = {
  room: id => game?.names().room(id) ?? id ?? '—',
  role: id => game?.names().role(id) ?? id ?? '—',
  finding: id => game?.names().finding(id) ?? id ?? '—',
};
createRoot(document.getElementById('ui')!).render(<App store={store} actions={actions} names={names} />);

const quality = (['low', 'medium', 'high'] as Quality[]).find(x => x === q.get('q')) ?? 'medium';
Game.create(document.getElementById('view')!, store, __VERSION__, quality)
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
