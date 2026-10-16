// Разбор профиля процессора (`bun --cpu-prof`): доля времени по функциям — собственная и вместе с вызванными, — и по файлам.
// bun profile.ts out/<файл>.cpuprofile [сколько строк, 15] [--under apply]
// --under <функция> — считать только образцы, в стеке которых есть эта функция (apply — ход смены без сборки базы).
import { readFileSync } from 'node:fs';

interface Node {
  id: number;
  callFrame: { functionName: string; url: string; lineNumber: number };
  children?: number[];
}
interface Profile {
  nodes: Node[];
  samples: number[];
  timeDeltas: number[];
}

const file = process.argv[2];
if (!file) {
  console.error('bun profile.ts <файл .cpuprofile> [строк]');
  process.exit(1);
}
const TOP = Number(process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : 15);
const ui = process.argv.indexOf('--under');
const UNDER = ui >= 0 ? process.argv[ui + 1] : undefined;
const prof = JSON.parse(readFileSync(file, 'utf8')) as Profile;
const byId = new Map(prof.nodes.map(n => [n.id, n]));
const parent = new Map<number, number>();
for (const n of prof.nodes) for (const c of n.children ?? []) parent.set(c, n.id);

const short = (url: string) => url.replace(/^.*engine-throughput\//, '').replace(/^file:\/\//, '') || '(движок JS)';
const label = (n: Node) => `${n.callFrame.functionName || '(анонимная)'} — ${short(n.callFrame.url)}:${n.callFrame.lineNumber + 1}`;

const self = new Map<string, number>();
const total = new Map<string, number>();
const files = new Map<string, number>();
let all = 0;
let idle = 0;
let skipped = 0;
prof.samples.forEach((id, i) => {
  const dt = prof.timeDeltas[i] ?? 0;
  const n = byId.get(id)!;
  if (UNDER) {
    let found = false;
    for (let x: number | undefined = id; x !== undefined && !found; x = parent.get(x)) found = byId.get(x)!.callFrame.functionName === UNDER;
    if (!found) {
      skipped += dt;
      return;
    }
  }
  all += dt;
  if (n.callFrame.functionName === '(idle)' || n.callFrame.functionName === '(program)') idle += dt;
  const l = label(n);
  self.set(l, (self.get(l) ?? 0) + dt);
  const f = short(n.callFrame.url);
  files.set(f, (files.get(f) ?? 0) + dt);
  // вместе с вызванными: каждая функция стека — один раз на образец
  const seen = new Set<string>();
  for (let x: number | undefined = id; x !== undefined; x = parent.get(x)) {
    const k = label(byId.get(x)!);
    if (seen.has(k)) continue;
    seen.add(k);
    total.set(k, (total.get(k) ?? 0) + dt);
  }
});

const pct = (v: number) => `${((100 * v) / all).toFixed(1).padStart(5)} %`;
const show = (title: string, m: Map<string, number>, skip: (k: string) => boolean = () => false) => {
  console.log(`\n${title}`);
  [...m.entries()].filter(([k]) => !skip(k)).sort((a, b) => b[1] - a[1]).slice(0, TOP).forEach(([k, v]) => console.log(`${pct(v)}  ${k}`));
};
console.log(`Всего ${(all / 1e6).toFixed(1)} с образцов${UNDER ? ` под ${UNDER} (вне — ${(skipped / 1e6).toFixed(1)} с)` : ''}, простой ${pct(idle)}`);
show('Собственное время функции:', self);
show('Вместе с вызванными (только код пробы и движка):', total, k => !k.includes('src/') && !k.includes('bench.ts'));
show('По файлам:', files);
