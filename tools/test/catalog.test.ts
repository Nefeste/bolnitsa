// Сопоставление «предмет движка → модель» (spec docs/specs/2026-10-shell-3d.md, «Больница на экране»): у каждого предмета
// шаблонов помещений и у каждого аппарата базы есть запись; у каждой модели таблицы — файл в assets/models и строка в
// sources.json с SHA-256 исходника и сжатого файла; файл тот, что записан.
import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CATALOG, entryOf, EXTRA_MODELS } from '../../src/render/catalog';
import { buildDb } from '../content/load';
import { index, MODELS } from './render-kit';

const { db } = buildDb();
const files = new Set([...index.kenney.map(n => `kenney/${n}`), ...index.kaykit.map(n => `kaykit/${n}`), ...index.people.map(n => `people/${n}`)]);
const sources = JSON.parse(readFileSync(join(MODELS, 'sources.json'), 'utf8')) as Record<string, { source: string; sha256: string; out: string }>;

describe('таблица моделей', () => {
  test('у каждого предмета шаблонов — запись, в каждом помещении, где он стоит', () => {
    const missing: string[] = [];
    for (const room of Object.values(db.rooms)) {
      for (const z of room.sizes) for (const o of z.objects) if (!entryOf(o.kind, room.id)) missing.push(`${o.kind}@${room.id}`);
    }
    for (const p of Object.values(db.presets)) for (const d of p.decor) if (!entryOf(d.kind, '')) missing.push(`${d.kind}@коридор`);
    expect(missing).toEqual([]);
  });

  test('у каждого аппарата базы — запись в помещениях, куда его ставят', () => {
    const missing: string[] = [];
    for (const eq of Object.values(db.equipment)) for (const r of eq.rooms) if (!entryOf(eq.sprite, r, eq.id)) missing.push(`${eq.id}@${r}`);
    expect(missing).toEqual([]);
  });

  test('у каждой модели таблицы — файл и запись источника; сжатый файл — тот, что записан', () => {
    const used = new Set([...Object.values(CATALOG).flatMap(e => ('model' in e ? [e.model] : [])), ...EXTRA_MODELS]);
    for (const m of used) expect(files.has(m)).toBe(true);
    for (const f of files) {
      const s = sources[`${f}.glb`];
      expect(s?.sha256).toMatch(/^[0-9a-f]{64}$/);
      const bin = readFileSync(join(MODELS, `${f}.glb`));
      expect(createHash('sha256').update(bin).digest('hex')).toBe(s.out);
    }
  });

  test('в LICENSES.md — каждый файл моделей с полным SHA-256 исходника', () => {
    const lic = readFileSync(join(MODELS, '..', 'LICENSES.md'), 'utf8');
    for (const [f, s] of Object.entries(sources)) {
      expect(lic.includes(f.replace(/\.glb$/, '').split('/')[1])).toBe(true);
      expect(lic.includes(s.sha256)).toBe(true);
    }
  });
});
