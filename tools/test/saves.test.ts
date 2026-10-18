// Сохранения (spec docs/specs/2026-10-saves.md, «Проверки»): сохранить — загрузить — играть дальше даёт то же состояние,
// что без сохранения, и в основном потоке, и через поток расчёта; образец прежней версии грузится и играет; испорченный
// файл и файл из новой версии — понятная ошибка; ячейки: утренние сдвигом, свои по номерам; папка Electron.
import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listSlots, memoryDisk, nextManual, readSlot, removeSlot, writeAuto, writeSlot } from '../../src/app/saves';
import { db } from '../../src/content';
import { hospitalOf } from '../../src/engine/hospital/site';
import { siteOfPlan } from '../../src/engine/hospital/site-plan';
import { migrate, SAVE_SCHEMA, SaveError } from '../../src/engine/shift/migrate';
import { startCash } from '../../src/engine/shift/money';
import { apply, newFlowShift } from '../../src/engine/shift/engine';
import type { ShiftState } from '../../src/engine/shift/types';
import { createSim } from '../../src/sim/host';
import { pack, type SaveMeta, unpack } from '../../src/sim/packing';
import { hash } from './site-kit';

// папка сохранений Electron — CommonJS оболочки
const { savesIn } = require('../../electron/saves.cjs') as { savesIn: (dir: string) => ReturnType<typeof memoryDisk> };

const plan = siteOfPlan(db, db.sites!['site.polyclinic']);
if (!plan.ok) throw new Error('поликлиника не строится');
const poly = (seed = 1) => newFlowShift(db, { seed, season: 'winter', hospital: hospitalOf(db, plan.site), staff: plan.staff, flow: { perHour: 0, auto: true }, economy: { cash: startCash(db, 'poly') } });
const liveTo = (s: ShiftState, hours: number) => {
  while (s.t < hours * 3600) apply(db, s, { kind: 'advance', seconds: 60 });
};
const meta = (s: ShiftState, kind: SaveMeta['kind'] = 'manual', savedAt = '2026-10-18T12:00:00.000Z'): SaveMeta => ({ kind, savedAt, version: '0.7.0', start: 'poly', day: s.day, t: s.t });

describe('снимок: сохранить — загрузить — играть дальше', () => {
  test('в основном потоке: то же состояние, что без сохранения, через полтора дня', async () => {
    const s = poly(2);
    liveTo(s, 11);
    // позвали — и сохранили, пока он идёт к вам
    const id = s.queue.find(x => !s.patients[x].by && s.patients[x].kind !== 'ambulance')!;
    apply(db, s, { kind: 'call', id });
    expect(s.meet).toBeGreaterThan(s.t);
    const back = (await unpack(await pack({ schema: SAVE_SCHEMA, meta: meta(s), state: s }))).state;
    expect(hash(back)).toBe(hash(s));
    liveTo(s, 48);
    liveTo(back, 48);
    expect(hash(back)).toBe(hash(s));
  }, 120_000);

  test('через поток расчёта: «сохранить» у одного, «открыть» у другого — дальше те же срезы и то же состояние', async () => {
    const run = (sim: ReturnType<typeof createSim>, frames: number) => {
      for (let i = 0; i < frames; i++) sim.handle({ kind: 'tick', seconds: 60, budgetMs: 1000 });
    };
    const a = createSim(db);
    const p = poly(3);
    a.handle({ kind: 'start', seed: 3, season: 'winter', hospital: p.hospital!, staff: p.staff!, flow: p.flow!, economy: { cash: p.economy!.cash } });
    run(a, 150);
    const saved = a.handle({ kind: 'save' });
    if (saved.kind !== 'state') throw new Error(saved.kind);
    const file = await unpack(await pack({ schema: SAVE_SCHEMA, meta: meta(saved.state), state: saved.state }));
    const b = createSim(db);
    expect(b.handle({ kind: 'load', state: file.state }).kind).toBe('slice');
    run(a, 240);
    run(b, 240);
    const sa = a.handle({ kind: 'save' });
    const sb = b.handle({ kind: 'save' });
    if (sa.kind !== 'state' || sb.kind !== 'state') throw new Error('save');
    expect(hash(sb.state)).toBe(hash(sa.state));
  }, 120_000);
});

describe('образцы прежних версий', () => {
  const dir = join(import.meta.dir, 'fixtures', 'saves');
  for (const name of readdirSync(dir).filter(n => n.endsWith('.save'))) {
    test(`${name}: открывается через миграции и играет двое суток`, async () => {
      const file = await unpack(new Uint8Array(readFileSync(join(dir, name))));
      expect(file.schema).toBe(SAVE_SCHEMA);
      expect(file.meta.start).toBe('poly');
      const sim = createSim(db);
      expect(sim.handle({ kind: 'load', state: file.state }).kind).toBe('slice');
      const day = file.state.day;
      for (let i = 0; i < 48 * 60; i++) {
        const r = sim.handle({ kind: 'tick', seconds: 60, budgetMs: 1000 });
        if (r.kind === 'error') throw new Error(r.message);
      }
      const after = sim.handle({ kind: 'save' });
      if (after.kind !== 'state') throw new Error(after.kind);
      // сутки сменились, приём идёт: приходят, нанятые врачи принимают
      expect(after.state.day).toBe(day + 2);
      const last = after.state.history.at(-1)!;
      expect(last.arrived).toBeGreaterThan(30);
      expect(Object.values(last.colleagues ?? {}).reduce((a, c) => a + c.seen, 0)).toBeGreaterThan(30);
    }, 120_000);
  }
});

describe('файл: ошибки — понятные, ничего не ломают', () => {
  test('новее нынешней схемы — «newer»; не снимок, не gzip, без шапки — «broken»', async () => {
    const s = poly(4);
    const bytes = (x: unknown) => pack(x as never);
    const problem = (p: Promise<unknown>) => p.then(() => 'ok', e => (e instanceof SaveError ? e.problem : `other: ${e}`));
    expect(await problem(unpack(await bytes({ schema: SAVE_SCHEMA + 1, meta: meta(s), state: s })))).toBe('newer');
    expect(await problem(unpack(await bytes({ schema: SAVE_SCHEMA, meta: meta(s), state: { t: 1 } })))).toBe('broken');
    expect(await problem(unpack(await bytes({ schema: SAVE_SCHEMA, state: s })))).toBe('broken');
    expect(await problem(unpack(await bytes({ schema: 'x', meta: meta(s), state: s })))).toBe('broken');
    expect(await problem(unpack(new TextEncoder().encode('{"schema":1}')))).toBe('broken');
    expect(await problem(unpack(new Uint8Array([31, 139, 8, 0, 1, 2, 3])))).toBe('broken');
    expect(() => migrate(0, s)).toThrow(SaveError);
    expect(migrate(SAVE_SCHEMA, s)).toBe(s);
  });
});

describe('ячейки', () => {
  const bytesOf = (n: number) => new Uint8Array([n]);
  test('утренние — три последних, сдвигом, со своими шапками; свои — по номерам; список — новые сверху', async () => {
    const disk = memoryDisk();
    const m = (day: number, kind: SaveMeta['kind'] = 'auto'): SaveMeta => ({ kind, savedAt: `2026-10-18T1${day}:00:00.000Z`, version: '0.7.0', start: 'poly', day, t: day * 86400 + 8 * 3600 });
    for (const day of [2, 3, 4, 5]) await writeAuto(disk, bytesOf(day), m(day));
    expect([...disk.files.keys()].filter(n => n.startsWith('auto-')).sort()).toEqual(['auto-1.meta.json', 'auto-1.save', 'auto-2.meta.json', 'auto-2.save', 'auto-3.meta.json', 'auto-3.save']);
    expect([1, 2, 3].map(n => disk.files.get(`auto-${n}.save`)![0])).toEqual([5, 4, 3]);
    expect(await nextManual(disk)).toBe('manual-1');
    await writeSlot(disk, 'manual-1', bytesOf(9), m(6, 'manual'));
    await writeSlot(disk, 'manual-7', bytesOf(9), m(1, 'manual'));
    expect(await nextManual(disk)).toBe('manual-8');
    // шапка потеряна — ячейка всё равно в списке, внизу
    await disk.write('exit.save', bytesOf(1));
    const rows = await listSlots(disk);
    expect(rows.map(r => r.slot)).toEqual(['manual-1', 'auto-1', 'auto-2', 'auto-3', 'manual-7', 'exit']);
    expect(rows[1].meta?.day).toBe(5);
    expect(rows.at(-1)!.meta).toBeNull();
    await removeSlot(disk, 'manual-7');
    expect((await listSlots(disk)).map(r => r.slot)).not.toContain('manual-7');
  });

  test('ячейка открывается целиком: снимок и шапка; нет файла — «broken»', async () => {
    const disk = memoryDisk();
    const s = poly(5);
    liveTo(s, 9);
    const bytes = await pack({ schema: SAVE_SCHEMA, meta: meta(s), view: { level: 'student' }, state: s });
    await writeSlot(disk, 'manual-1', bytes, meta(s));
    const file = await readSlot(disk, 'manual-1');
    expect(hash(file.state)).toBe(hash(s));
    expect(file.view).toEqual({ level: 'student' });
    expect(await readSlot(disk, 'manual-2').then(() => 'ok', e => (e as SaveError).problem)).toBe('broken');
  });
});

describe('папка сохранений Electron (electron/saves.cjs)', () => {
  test('пять действий в своей папке; имена — только ячеек; запись — целиком', async () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'bolnitsa-saves-')), 'saves');
    try {
      const disk = savesIn(dir);
      expect(await disk.list()).toEqual([]);
      expect(await disk.read('auto-1.save')).toBeNull();
      await disk.write('auto-1.save', new Uint8Array([1, 2, 3]));
      await disk.write('auto-1.meta.json', new TextEncoder().encode('{}'));
      expect([...(await disk.read('auto-1.save'))!]).toEqual([1, 2, 3]);
      await disk.move('auto-1.save', 'auto-2.save');
      await disk.move('auto-9.save', 'auto-3.save');
      expect((await disk.list()).sort()).toEqual(['auto-1.meta.json', 'auto-2.save']);
      await disk.remove('auto-2.save');
      await disk.remove('auto-2.save');
      expect(await disk.list()).toEqual(['auto-1.meta.json']);
      // временных файлов не остаётся
      expect(readdirSync(dir)).toEqual(['auto-1.meta.json']);
      for (const bad of ['../x.save', 'a/b.save', 'auto-1.exe', 'Auto.save', '']) {
        await expect(disk.read(bad)).rejects.toThrow('bad save name');
        await expect(disk.write(bad, new Uint8Array([0]))).rejects.toThrow('bad save name');
      }
    } finally {
      rmSync(join(dir, '..'), { recursive: true, force: true });
    }
  });
});
