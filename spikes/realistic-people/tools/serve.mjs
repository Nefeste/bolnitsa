// Отдаёт пробу на http://127.0.0.1:8095 (только этот компьютер): страница и dist/ — из папки пробы, скачанные модели —
// /assets/, люди игры (Quaternius, сжатые glb) — /game/ из assets/models корня репозитория. Сеть наружу странице не нужна.
//
//   node spikes/realistic-people/tools/serve.mjs   →   http://127.0.0.1:8095/
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const spike = new URL('../', import.meta.url).pathname;
const game = new URL('../../../assets/models/', import.meta.url).pathname;
const port = Number(process.env.PORT ?? 8095);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.glb': 'model/gltf-binary',
  '.wasm': 'application/wasm',
};

export function serve(p = port) {
  const server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    const file = path.startsWith('/game/') ? join(game, path.slice(6)) : join(spike, path === '/' ? 'index.html' : path);
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise(resolve => server.listen(p, '127.0.0.1', () => resolve(server)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await serve();
  console.log(`http://127.0.0.1:${port}/  (Ctrl+C — остановить)`);
}
