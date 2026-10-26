// Поток расчёта в окне игры (spec docs/specs/2026-10-engine-speed.md, часть 5; docs/specs/2026-10-shell-3d.md): Web Worker
// над `createSim` (host.ts). База — тот же собранный `content.json`, что у страницы; пока она грузится, сообщения ждут.
// Срез уходит без копии (transferList).
import type { ContentDb } from '../content/types';
import { SAVE_SCHEMA } from '../engine/shift/migrate';
import { cashNow } from '../engine/shift/money';
import { createSim, type SimHost } from './host';
import { pack } from './packing';
import type { FromSim, ToSim } from './protocol';

interface Scope {
  onmessage: ((e: MessageEvent<ToSim>) => void) | null;
  postMessage(msg: FromSim, transfer?: Transferable[]): void;
}
const scope = self as unknown as Scope;

let sim: SimHost | undefined;
const waiting: ToSim[] = [];

function reply(msg: ToSim) {
  if (msg.kind === 'pack') return packSave(msg);
  const out = sim!.handle(msg);
  scope.postMessage(out, out.kind === 'slice' ? [out.buf.buffer as ArrayBuffer] : []);
}

/**
 * Файл сохранения (spec docs/specs/2026-10-saves.md): снимок — здесь же в JSON (до первого ожидания: дальше он меняется),
 * сжатие — потом; байты уходят в окно без копии.
 */
function packSave(msg: Extract<ToSim, { kind: 'pack' }>) {
  const out = sim!.handle({ kind: 'save' });
  if (out.kind !== 'state') return scope.postMessage({ kind: 'packFailed', message: out.kind === 'error' ? out.message : out.kind });
  const s = out.state;
  const cash = cashNow(s);
  // сложность — из снимка (spec docs/specs/2026-10-difficulty.md, часть 2): строка сохранения покажет уровень
  const meta = {
    ...msg.meta, day: s.day, t: s.t, ...(cash !== undefined ? { cash } : {}),
    ...(s.meta.manage ? { manage: s.meta.manage } : {}), ...(s.meta.soft ? { soft: true as const } : {}),
  };
  pack({ schema: SAVE_SCHEMA, meta, ...(msg.view !== undefined ? { view: msg.view } : {}), state: s })
    .then(bytes => scope.postMessage({ kind: 'packed', bytes, meta }, [bytes.buffer as ArrayBuffer]))
    .catch(e => scope.postMessage({ kind: 'packFailed', message: e instanceof Error ? e.message : String(e) }));
}

scope.onmessage = e => {
  if (sim) reply(e.data);
  else waiting.push(e.data);
};

fetch('./content.json')
  .then(r => r.json() as Promise<ContentDb>)
  .then(db => {
    sim = createSim(db);
    for (const m of waiting.splice(0)) reply(m);
  })
  .catch(e => scope.postMessage({ kind: 'error', message: `content.json: ${e instanceof Error ? e.message : String(e)}` }));
