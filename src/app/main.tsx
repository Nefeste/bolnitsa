// Страница игры (spec docs/specs/2026-10-shell-3d.md): панели React и 3D-вид. Параметры адреса — для проверок и бенча:
//   ?q=low|medium|high — пресет качества поверх настроек игрока (spec docs/specs/2026-10-settings.md);
//   ?bench=1 (&secs=15&warm=3&qualities=low,high&shots=0) — авто-бенч; ?shot=1 — только снимки;
//   ?start=10.5 — сразу промотать смену до этого часа; ?lang=en — язык;
//   ?hospital=empty|preset — с чего начать (spec docs/specs/2026-10-build.md, «Начало игры»; нет — окно спросит; бенч и
//   снимки — всегда готовая больница). В Electron — те же ключи: --bench, --hospital empty.
//   ?flow=6,1 — поток числами (сами в час, машин скорой в час), а не от больницы (spec docs/specs/2026-10-economy.md):
//   сценарий режима врача в браузере; авто-бенч и снимки — числа сцены, та же толпа, что прежде, а с ?flow= — его числа.
//   ?load=<ячейка> — открыть сохранение (spec docs/specs/2026-10-saves.md): так меню игры загружает и экран начала
//   продолжает. ?role=doctor|chief|manager — кто вы (spec docs/specs/2026-10-two-ways.md, F4); с ?hospital= без роли —
//   «Врач», как играли до ролей. В Electron — --role chief. ?scenario=scenario.ambulatory — сценарий кампании (spec
//   docs/specs/2026-10-scenario-1.md): его больница, «Врач»; в Electron — --scenario scenario.ambulatory.
//   ?backdrop=0 — экран начала без живой сцены за ним (spec docs/specs/2026-10-aaa-polish.md, «Экран начала на живой сцене»).
//   ?manage=calm|hard и ?soft=1 — сложность новой игры (spec docs/specs/2026-10-difficulty.md, часть 2): уровень «Управления»
//   (нет — «Обычно») и мягкий режим; в Electron — --manage calm, --soft.
import { createRoot } from 'react-dom/client';
import { named, setLang, systemLang, T, type Lang } from '../i18n';
import type { Quality } from '../render/view';
import { App, type Names } from '../ui/App';
import { installEncyclopediaKeys } from '../ui/Encyclopedia';
import { type Actions, type Level, type LevelRow, Store } from '../ui/store';
import type { ContentDb, Manage } from '../content/types';
import { levelOf } from '../engine/shift/manage';
import { startCash } from '../engine/shift/money';
import type { Flow } from '../engine/shift/types';
import { SaveError } from '../engine/shift/migrate';
import type { SaveFile } from '../sim/packing';
import { AUTO, diskOf, Game, SCENE, type Start } from './game';
import { ringOf, TOUR_HALF, TOUR_SPEED, tourAt, tourOf } from './backdrop';
import { loadContent } from './content';
import { listSlots, readSlot } from './saves';
import { scenarioTitle } from './scenario';
import { DEFAULT_ROLE, type Role, roleOf } from './roles';
import { applyText, readSettings } from './settings';

declare const __VERSION__: string;

const q = new URLSearchParams(location.search);
const lang: Lang = q.get('lang') === 'en' || q.get('lang') === 'ru' ? (q.get('lang') as Lang) : systemLang();
setLang(lang);
document.documentElement.lang = lang;
document.title = T.app.title;

const store = new Store();
// размер текста (spec docs/specs/2026-10-settings.md, «Размер текста») — из настроек игрока, и на экране начала
const text = readSettings().text;
applyText(text);
store.set({ lang, version: __VERSION__, text });
let game: Game | undefined;
const later = <K extends keyof Actions>(k: K) => ((...a: unknown[]) => (game?.actions[k] as (...x: unknown[]) => void)?.(...a)) as Actions[K];
const actions: Actions = {
  setSpeed: later('setSpeed'),
  untilMorning: later('untilMorning'),
  setWalls: later('setWalls'),
  setQuality: later('setQuality'),
  setProjection: later('setProjection'),
  setText: later('setText'),
  overview: later('overview'),
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
  pickDept: later('pickDept'),
  markDept: later('markDept'),
  undo: later('undo'),
  done: later('done'),
  furnish: later('furnish'),
  demolish: later('demolish'),
  hire: later('hire'),
  dismiss: later('dismiss'),
  raise: later('raise'),
  reshift: later('reshift'),
  study: later('study'),
  reserve: later('reserve'),
  setMetricDay: later('setMetricDay'),
  filterPatients: later('filterPatients'),
  focus: later('focus'),
  find: later('find'),
  follow: later('follow'),
  toggleLayers: later('toggleLayers'),
  toggleQueues: later('toggleQueues'),
  toggleDepts: later('toggleDepts'),
  toggleProblems: later('toggleProblems'),
  togglePaths: later('togglePaths'),
  pickLeg: later('pickLeg'),
  goProblem: later('goProblem'),
  setMetric: later('setMetric'),
  doctor: later('doctor'),
  money: later('money'),
  dismissHint: later('dismissHint'),
  scenario: later('scenario'),
  toggleSettings: later('toggleSettings'),
  setQualityMode: later('setQualityMode'),
  toggleMenu: later('toggleMenu'),
  saveGame: later('saveGame'),
  loadGame: later('loadGame'),
  deleteGame: later('deleteGame'),
  newGame: later('newGame'),
  // выбор на экране начала — та же страница с его ключами (`go`); сценарий (spec docs/specs/2026-10-scenario-1.md) учит
  // режиму врача — «Врач», роль меняют в окне врача; сложность — ключами `manage` и `soft` (spec 2026-10-difficulty)
  startGame: (kind, role, level) =>
    go(typeof kind === 'string' ? { hospital: kind, role: role ?? DEFAULT_ROLE, ...levelKeys(level) } : 'scenario' in kind ? { ...kind, ...levelKeys(level) } : kind),
  setManage: later('setManage'),
  setSoft: later('setSoft'),
};
/**
 * С чего начать: новая больница и кто вы (spec docs/specs/2026-10-two-ways.md, F4), сложность (spec
 * docs/specs/2026-10-difficulty.md, часть 2) — или сохранение (ячейка).
 */
type Begin = { start: Start; role: Role; scenario?: string; manage?: Manage; soft?: boolean } | { load: string };

/** Сложность — в ключи адреса: «Обычно» и выключенный мягкий режим — без ключей, как играли до сложности. */
function levelKeys(level?: Level): Record<string, string> {
  return { ...(level && level.manage !== 'normal' ? { manage: level.manage } : {}), ...(level?.soft ? { soft: '1' } : {}) };
}

/** Уровень «Управления» из ключа: только известный; нет — «Обычно». */
const manageOfKey = (v: string | null): Manage | undefined => (v === 'calm' || v === 'hard' ? v : undefined);
const names: Names = {
  room: id => game?.names().room(id) ?? id ?? '—',
  role: id => game?.names().role(id) ?? id ?? '—',
  finding: id => game?.names().finding(id) ?? id ?? '—',
  dat: id => game?.names().dat(id) ?? id ?? '—',
};
// энциклопедия (spec docs/specs/2026-10-encyclopedia.md): F1 и Esc окна — раньше клавиш игры, и на экране начала
installEncyclopediaKeys();
createRoot(document.getElementById('ui')!).render(<App store={store} actions={actions} names={names} />);

// качество: `?q=` — задано; иначе из настроек игрока (spec docs/specs/2026-10-settings.md), «авто» начинает с высокого
const fixed = (['low', 'medium', 'high'] as Quality[]).find(x => x === q.get('q'));
const prefs = readSettings().quality;
const quality: Quality = fixed ?? (prefs === 'auto' ? 'high' : prefs);

/** С чего начать: ключ адреса или Electron; бенч и снимки — готовая больница, «Врач»; иначе спросить игрока. */
async function startOf(): Promise<Begin> {
  const args = window.shell ? await window.shell.args() : [];
  const has = (k: string) => q.get(k) === '1' || args.includes(`--${k}`);
  const arg = (k: string) => q.get(k) ?? (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : null);
  const val = arg('hospital');
  if (has('bench') || has('shot')) return { start: 'preset', role: DEFAULT_ROLE };
  if (q.get('load')) return { load: q.get('load')! };
  // сложность (spec docs/specs/2026-10-difficulty.md, часть 2): нет ключей — «Обычно», мягкий режим выключен (#137)
  const manage = manageOfKey(arg('manage'));
  const level = { ...(manage ? { manage } : {}), ...(has('soft') ? { soft: true } : {}) };
  const scenario = arg('scenario');
  if (scenario) return { start: 'empty', role: roleOf(arg('role')) ?? DEFAULT_ROLE, scenario, ...level };
  if (val === 'empty' || val === 'preset' || val === 'poly') return { start: val, role: roleOf(arg('role')) ?? DEFAULT_ROLE, ...level };
  return choose();
}

/**
 * Экран начала: новая больница, «Продолжить» или «Загрузить» (spec docs/specs/2026-10-saves.md), за ним — живая сцена.
 * Выбор открывает страницу заново (`go`), поэтому ответа здесь не ждут.
 */
async function choose(problem?: string): Promise<never> {
  const saves = await listSlots(diskOf()).catch(() => []);
  // «Кампания» (spec docs/specs/2026-10-scenario-1.md): сценарии базы по порядку; база не прочиталась — карточек нет
  const db = await loadContent().catch(() => undefined);
  const scenarios = Object.values(db?.scenarios ?? {}).sort((a, b) => a.order - b.order);
  store.set({
    choose: true, startSaves: saves, startProblem: problem,
    startScenarios: scenarios.map(sc => ({ id: sc.id, title: scenarioTitle(sc), about: named(sc.about) })),
    scenarioNames: Object.fromEntries(scenarios.map(sc => [sc.id, scenarioTitle(sc)])),
    ...(db ? { startLevels: levelsOf(db) } : {}),
  });
  backdrop();
  return new Promise<never>(() => {});
}

/** Числа уровней «Управления» для второго шага экрана начала (spec docs/specs/2026-10-difficulty.md, часть 2). */
function levelsOf(db: ContentDb): Record<Manage, LevelRow> {
  const row = (m: Manage): LevelRow => {
    const l = levelOf(db, m);
    return {
      inflow: l.inflow, patience: l.patience, salary: l.salary, breakdown: l.breakdown, ...(l.overdraft !== undefined ? { overdraft: l.overdraft } : {}),
      cash: { empty: startCash(db, 'empty', m), preset: startCash(db, 'preset', m), poly: startCash(db, 'poly', m) },
    };
  };
  return { calm: row('calm'), normal: row('normal'), hard: row('hard') };
}

/**
 * Выбор на экране начала (spec docs/specs/2026-10-aaa-polish.md, «Экран начала на живой сцене») — та же страница с новым
 * адресом, как загрузка из меню игры: за экраном идёт живая сцена, а игра открывается начисто. Остальные ключи адреса —
 * качество, язык, зерно, поток, час — остаются: с ними открывали экран начала.
 */
function go(extra: Record<string, string>) {
  leaving = true;
  const p = new URLSearchParams(location.search);
  for (const k of ['load', 'hospital', 'role', 'scenario', 'manage', 'soft']) p.delete(k);
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  location.search = p.toString();
}

/** Час живой сцены: утренний приём в разгаре — залы полны, врачи принимают. */
const BACKDROP_HOUR = 10;
let scene = false;
/** Страница уходит (выбор на экране начала, другой адрес): недогруженная живая сцена обрывается, и это не ошибка. */
let leaving = false;
addEventListener('pagehide', () => {
  leaving = true;
});

/**
 * Живая сцена за экраном начала (spec docs/specs/2026-10-aaa-polish.md, «Экран начала на живой сцене»): готовая городская
 * больница с потоком сцены, вы — «Управляющий»: больных ведут нанятые врачи, и больница живёт сама. Своё хранилище — панели
 * экрана начала она не трогает; вид проявляется, когда часы дошли до приёма. Не вышло — экран начала как прежде.
 */
function backdrop() {
  if (scene || q.get('backdrop') === '0') return;
  scene = true;
  const view = document.getElementById('view')!;
  view.classList.add('backdrop');
  // качество — как задано; «авто» — среднее: за панелью и размытием высокое не разглядеть
  void Game.create(view, new Store(), __VERSION__, fixed ?? (prefs === 'auto' ? 'medium' : prefs), 'preset', SCENE.flow, undefined, 'manager', undefined, { backdrop: true })
    .then(async g => {
      window.__backdrop = g;
      const { fastForward } = await import('./bench');
      await fastForward(g, Math.floor(g.t / 86400) * 86400 + BACKDROP_HOUR * 3600);
      fly(g);
      // проявить, когда кадр облёта уже нарисован: первый кадр нового вида — самый долгий (шейдеры, люди на местах)
      await frames(3);
      view.classList.add('shown');
    })
    // сцена — вид, не игра: не открылась (нет WebGL, страница ушла раньше, чем догрузилась) — экран начала как прежде
    .catch(e => {
      if (!leaving) console.warn('start screen backdrop:', e);
    });
}

/** Дождаться `n` кадров страницы. */
function frames(n: number): Promise<void> {
  return new Promise(resolve => {
    const step = () => (--n <= 0 ? resolve() : requestAnimationFrame(step));
    requestAnimationFrame(step);
  });
}

/**
 * Облёт: точка взгляда идёт по кругу над помещениями, `TOUR_SPEED` м/с; масштаб — кадр облёта. «Меньше движения» в системе
 * — камера стоит: люди ходят, кадр нет.
 */
function fly(g: Game) {
  const tour = tourOf(ringOf(g.plan.rooms));
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cam = g.stage.cam;
  cam.half = TOUR_HALF;
  let s = 0;
  let last = 0;
  g.onFrame = ts => {
    if (last && !still) s += Math.min(0.1, (ts - last) / 1000) * TOUR_SPEED;
    last = ts;
    const p = tourAt(tour, s);
    cam.target.set(p.x, 0, p.z);
  };
}

/**
 * Что открыть: новая больница — как есть; сохранение — прочитать и пройти миграции. Не открылось — снова экран начала,
 * со словом почему.
 */
async function begin(): Promise<{ start: Start; role: Role; scenario?: string; manage?: Manage; soft?: boolean; loaded?: SaveFile }> {
  let b = await startOf();
  for (;;) {
    if ('start' in b) return b;
    try {
      const loaded = await readSlot(diskOf(), b.load);
      const start = (['empty', 'preset', 'poly'] as const).find(x => x === loaded.meta.start) ?? 'preset';
      // роль сохранения — в его виде окна (`SavedView.role`)
      return { start, role: DEFAULT_ROLE, loaded };
    } catch (e) {
      b = await choose(T.saves.problem[e instanceof SaveError ? e.problem : 'broken']);
    }
  }
}

// выход из игры (spec docs/specs/2026-10-saves.md): Electron просит сохраниться — в ячейку «при выходе»; бенч и снимки —
// без этого; игры ещё нет (экран начала) — сразу
window.shell?.onClosing(() => {
  void (async () => {
    const args = (await window.shell?.args()) ?? [];
    const quiet = !game || ['bench', 'shot'].some(k => q.get(k) === '1' || args.includes(`--${k}`));
    if (!quiet) await game!.save('exit');
  })().finally(() => window.shell?.closeNow());
});

/**
 * Поток: от больницы; `?flow=6,1` — эти числа; авто-бенч и снимки — числа сцены (та же толпа, что прежде), бенч с `?flow=` —
 * его числа (толпа больше: spec docs/specs/2026-10-people.md, «Проверки»).
 */
async function flowOf(): Promise<Flow> {
  const args = window.shell ? await window.shell.args() : [];
  const has = (k: string) => q.get(k) === '1' || args.includes(`--${k}`);
  const [walk, amb] = (q.get('flow') ?? '').split(',').map(Number);
  const own = Number.isFinite(walk) && walk > 0 ? { perHour: walk, ...(Number.isFinite(amb) && amb > 0 ? { ambulancePerHour: amb } : {}) } : undefined;
  if (has('bench') || has('shot')) return own ?? SCENE.flow;
  return own ?? AUTO;
}

begin()
  .then(async ({ start, role, scenario, manage, soft, loaded }) =>
    Game.create(document.getElementById('view')!, store, __VERSION__, quality, start, await flowOf(), loaded, role, scenario, { manage, soft }),
  )
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
    } else if (!fixed && g.autoWanted) g.startAuto();
    // качество задано адресом — его и отметить в «Настройках»; записано будет, только если игрок выберет сам
    if (fixed) store.set({ qualityMode: fixed });
  })
  .catch(e => {
    window.__benchError = String((e as Error)?.stack ?? e);
    store.set({ error: String(e) });
    console.error(e);
  });
