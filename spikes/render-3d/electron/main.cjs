// из spikes/map-render: electron/main.cjs (+ запись снимков PNG, типы .glb/.png, параметры бенча 3D)
// Оболочка Electron для пробы 3D: окно, страница из dist/ по своей схеме app:// (без
// dev-сервера и без сети), замер запуска и памяти, авто-бенч с записью итога и снимков в файлы.
//
//   electron .                      — окно со сценой
//   electron . --bench [--secs 15]  — авто-бенч (пресеты × числа людей) и 4 снимка, итог — bench-*.json и *.png, выход
//   --uncapped                      — без вертикальной синхронизации: счётчик показывает запас
//   --stay                          — не закрываться после бенча
//   --probe-swiftshader             — программный WebGL (для контейнера без видеокарты)
const { app, BrowserWindow, ipcMain, protocol, session } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const t0 = Date.now();
const argv = process.argv;
const has = k => argv.includes(`--${k}`);
const val = (k, d) => {
  const i = argv.indexOf(`--${k}`);
  return i > 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};

if (has('uncapped')) {
  app.commandLine.appendSwitch('disable-frame-rate-limit');
  app.commandLine.appendSwitch('disable-gpu-vsync');
}
app.commandLine.appendSwitch('disable-renderer-backgrounding');
if (has('probe-swiftshader')) {
  app.commandLine.appendSwitch('ignore-gpu-blocklist');
  app.commandLine.appendSwitch('enable-unsafe-swiftshader');
  app.commandLine.appendSwitch('use-angle', 'swiftshader');
}

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

const DIST = path.join(__dirname, '..', 'dist');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png' };
const timings = { processToReadyMs: 0, readyToShowMs: 0, firstFrameMs: 0, processStartToFirstFrameMs: 0 };
let blocked = 0;

async function metrics() {
  const list = app.getAppMetrics();
  const byType = {};
  let ws = 0;
  let priv = 0;
  for (const m of list) {
    ws += m.memory.workingSetSize;
    priv += m.memory.privateBytes ?? 0;
    byType[m.type] = Math.round(((byType[m.type] ?? 0) * 1024 + m.memory.workingSetSize) / 1024);
  }
  // workingSetSize — в килобайтах
  return { workingSetMB: Math.round(ws / 1024), privateMB: Math.round(priv / 1024), byType };
}

/** Куда положить итог: рядом с .exe/AppImage, иначе в «Документы», иначе в домашнюю папку. */
function saveDirs() {
  const dirs = [];
  if (process.env.PORTABLE_EXECUTABLE_DIR) dirs.push(process.env.PORTABLE_EXECUTABLE_DIR);
  if (process.env.APPIMAGE) dirs.push(path.dirname(process.env.APPIMAGE));
  if (app.isPackaged) dirs.push(path.dirname(process.execPath));
  else dirs.push(process.cwd());
  dirs.push(app.getPath('documents'), os.homedir());
  return dirs;
}

app.whenReady().then(async () => {
  timings.processToReadyMs = Math.round(process.uptime() * 1000);

  protocol.handle('app', async req => {
    const { pathname } = new URL(req.url);
    const file = path.resolve(DIST, `.${decodeURIComponent(pathname)}`);
    if (!file.startsWith(DIST)) return new Response('forbidden', { status: 403 });
    try {
      // fs читает и из app.asar — в собранной версии страница лежит там
      const body = await fs.promises.readFile(file);
      return new Response(body, { headers: { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' } });
    } catch {
      return new Response('not found', { status: 404 });
    }
  });

  // Сети нет: любой запрос наружу отменяется и считается.
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (d, cb) => {
    blocked++;
    console.log(`[сеть] запрос отменён: ${d.url}`);
    cb({ cancel: true });
  });

  ipcMain.handle('probe:metrics', () => metrics());
  ipcMain.handle('probe:info', async () => {
    let gpu = null;
    try {
      gpu = await app.getGPUInfo('basic');
    } catch {}
    return {
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
      platform: `${process.platform} ${os.release()} ${process.arch}`,
      cpu: os.cpus()[0]?.model ?? null,
      cpuCount: os.cpus().length,
      ramGB: Math.round(os.totalmem() / 1073741824),
      gpuFeatureStatus: app.getGPUFeatureStatus(),
      gpu,
      vsync: !has('uncapped'),
      startup: timings,
      blockedRequests: blocked,
      memoryAtEnd: await metrics(),
    };
  });
  // Снимки и итог ложатся в одну папку — первую, куда удалось записать
  let outDir = null;
  const write = (name, data) => {
    for (const dir of outDir ? [outDir] : saveDirs()) {
      try {
        fs.writeFileSync(path.join(dir, name), data);
        outDir = dir;
        return path.join(dir, name);
      } catch {}
    }
    return null;
  };
  ipcMain.handle('probe:shot', async (_e, name, dataUrl) => {
    const safe = String(name).replace(/[^\w.-]/g, '_');
    const saved = write(safe, Buffer.from(String(dataUrl).split(',')[1] ?? '', 'base64'));
    console.log(`[бенч] снимок: ${saved}`);
    return saved ?? 'не удалось записать файл';
  });
  ipcMain.handle('probe:save', async (_e, json) => {
    const stamp = (() => {
      try {
        return JSON.parse(json).shots?.[0]?.name?.match(/bench-electron-(\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d)-/)?.[1];
      } catch {
        return null;
      }
    })();
    const name = `bench-electron-${stamp ?? new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
    const saved = write(name, json);
    console.log(`[бенч] итог: ${saved}`);
    if (has('bench') && !has('stay')) setTimeout(() => app.exit(0), 500);
    return saved ?? 'не удалось записать файл';
  });
  ipcMain.on('probe:first-frame', (_e, ms) => {
    timings.firstFrameMs = Math.round(ms);
    timings.processStartToFirstFrameMs = Math.round(process.uptime() * 1000);
    console.log(`[запуск] от старта процесса до первого кадра: ${timings.processStartToFirstFrameMs} мс`);
  });

  const win = new BrowserWindow({
    width: 1600,
    height: 900,
    show: false,
    backgroundColor: '#b9cdd9',
    title: 'Больница — проба 3D',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.once('ready-to-show', () => {
    timings.readyToShowMs = Date.now() - t0;
    win.show();
  });
  win.webContents.on('console-message', e => {
    const msg = e.message ?? '';
    if (msg.startsWith('[') || msg.startsWith('BENCH_RESULT')) console.log(msg.length > 400 ? `${msg.slice(0, 400)}…` : msg);
  });
  const q = new URLSearchParams();
  if (has('bench')) {
    q.set('bench', '1');
    q.set('secs', val('secs', '15'));
    q.set('warm', val('warm', '3'));
    if (val('counts')) q.set('counts', val('counts'));
    if (val('qualities')) q.set('qualities', val('qualities'));
  }
  if (val('q')) q.set('q', val('q'));
  await win.loadURL(`app://probe/index.html${q.size ? `?${q}` : ''}`);
});

app.on('window-all-closed', () => app.quit());
