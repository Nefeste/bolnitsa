// Сопоставление «предмет движка → модель» (spec docs/specs/2026-10-shell-3d.md, «Больница на экране»): у каждого предмета
// шаблонов помещений и у каждого аппарата базы есть запись; у каждой модели таблицы — файл в assets/models и строка в
// sources.json с SHA-256 исходника и сжатого файла; файл тот, что записан. Люди Rocketbox (spec docs/specs/2026-10-people.md,
// «Конвертер»; лицензия MIT) — так же по assets/models/rocketbox/sources.json, и в LICENSES.md — текст MIT дословно.
import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { db } from '../../src/content';
import { CATALOG, entryOf, EXTRA_MODELS } from '../../src/render/catalog';
import { index, MODELS, rocketboxIndex } from './render-kit';

const files = new Set([...index.kenney.map(n => `kenney/${n}`), ...index.kaykit.map(n => `kaykit/${n}`)]);
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

describe('люди Rocketbox', () => {
  const RB = join(MODELS, 'rocketbox');
  const rb = JSON.parse(readFileSync(join(RB, 'sources.json'), 'utf8')) as {
    commit: string;
    files: Record<string, string>;
    looks: Record<string, { glb: string; mask: string }>;
  };
  const lic = readFileSync(join(MODELS, '..', 'LICENSES.md'), 'utf8');
  const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');

  test('у каждого вида — glb и маска, SHA-256 — те, что записаны; других файлов в папке нет', () => {
    expect(Object.keys(rb.looks).sort()).toEqual(rocketboxIndex.looks.slice().sort());
    for (const [name, s] of Object.entries(rb.looks)) {
      expect([name, sha(readFileSync(join(RB, `${name}.glb`)))]).toEqual([name, s.glb]);
      expect([name, sha(readFileSync(join(RB, `${name}.mask.png`)))]).toEqual([name, s.mask]);
    }
    const want = ['index.json', 'sources.json', ...rocketboxIndex.looks.flatMap(n => [`${n}.glb`, `${n}.mask.png`])];
    expect(readdirSync(RB).sort()).toEqual(want.sort());
  });

  test('в LICENSES.md — коммит набора, каждый исходник и каждый файл игры с полным SHA-256, текст MIT дословно', () => {
    expect(lic).toContain(rb.commit);
    for (const [f, h] of Object.entries(rb.files)) expect([f, lic.includes(f) && lic.includes(h)]).toEqual([f, true]);
    for (const [name, s] of Object.entries(rb.looks)) expect([name, lic.includes(name) && lic.includes(s.glb) && lic.includes(s.mask)]).toEqual([name, true]);
    // текст лицензии в блоке кода — тот самый файл набора: тот же SHA-256
    const m = /\*\*`LICENSE\.md` набора \(дословно\):\*\*\n\n```\n([\s\S]*?)\n```/.exec(lic);
    expect(m).not.toBeNull();
    expect(sha(`${m![1]}\n`)).toBe(rb.files['LICENSE.md']);
  });
});
