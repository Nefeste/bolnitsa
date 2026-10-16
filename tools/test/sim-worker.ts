// Поток расчёта для теста (tools/test/worker.test.ts): обёртка `createSim` для `worker_threads` Node/Bun. В Electron — та
// же обёртка над `self.onmessage` Web Worker'а. База — собранный бандл (`src/content`), как в игре.
import { parentPort } from 'node:worker_threads';
import { db } from '../../src/content';
import { createSim } from '../../src/sim/host';
import type { ToSim } from '../../src/sim/protocol';

const sim = createSim(db);
parentPort!.on('message', (msg: ToSim) => parentPort!.postMessage(sim.handle(msg)));
