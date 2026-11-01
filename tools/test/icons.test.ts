// Значки окна (решение владельца #139; docs/reports/2026-10-icons.md): Carbon под Apache 2.0 — текст лицензии рядом, с тем же
// SHA-256, что в assets/LICENSES.md (раздел 6), и в сборке; в icons.gen.ts — только пути SVG из закреплённой версии пакета
// и три своих значка; в окне не осталось символов Юникода и эмодзи вместо значков.
import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ICONS } from '../../src/ui/icons.gen';

const root = join(import.meta.dir, '../..');
const licenses = readFileSync(join(root, 'assets/LICENSES.md'), 'utf8');
/** Символы, которые были значками окна до Carbon: крест, галочки, треугольники, меню, шестерёнка, пауза, стройка и др. */
const OLD = /[✕✓✗▸▾☰▦⚙↶⚠⏭❚○✖▣▭▪▯▬]|[\u{1F300}-\u{1FAFF}]/u;

/** Все .ts и .tsx в папке, рекурсивно. */
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap(f => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) ? [p] : [];
  });

describe('значки окна', () => {
  test('лицензия Apache 2.0 — рядом, с SHA-256 из таблицы лицензий, и сборка кладёт её в каждую копию игры', () => {
    const row = licenses.match(/^\| `assets\/licenses\/carbon-icons\.txt` \| `([0-9a-f]{64})` \|$/m);
    const text = readFileSync(join(root, 'assets/licenses/carbon-icons.txt'));
    expect(createHash('sha256').update(text).digest('hex')).toBe(row?.[1] ?? '');
    expect(text.toString('utf8')).toContain('Apache License\n                           Version 2.0, January 2004');
    expect(text.toString('utf8')).toContain('Copyright 2015 IBM Corp.');
    expect(licenses).toContain('## 6. Carbon (IBM) — значки окна');
    expect(readFileSync(join(root, 'tools/app/build.mjs'), 'utf8')).toContain("cpSync(join(root, 'assets/licenses'), join(out, 'assets/licenses'), { recursive: true });");
  });

  test('icons.gen.ts — из @carbon/icons 11.91.0: сетка 16 или 32, только пути; свои — двери и скамья', () => {
    const src = readFileSync(join(root, 'src/ui/icons.gen.ts'), 'utf8');
    expect(src.split('\n')[0]).toContain('из @carbon/icons@11.91.0');
    for (const [name, i] of Object.entries(ICONS)) {
      expect([name, i.size === 16 || i.size === 32]).toEqual([name, true]);
      // разметка вставляется в страницу как есть: только пустые элементы path с атрибутом d
      expect([name, /^(<path d="[^"<>]+"\/>)+$/.test(i.body)]).toEqual([name, true]);
    }
    expect(Object.entries(ICONS).filter(([, i]) => 'own' in i).map(([n]) => n)).toEqual(['door', 'door2', 'bench']);
    expect(Object.keys(ICONS).length).toBe(30);
  });

  test('в окне вместо значков нет символов Юникода и эмодзи (кроме комментариев)', () => {
    const bad: string[] = [];
    for (const f of [...files(join(root, 'src/ui')), ...files(join(root, 'src/i18n')), ...files(join(root, 'src/app'))]) {
      readFileSync(f, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          const s = line.trim();
          if (s.startsWith('//') || s.startsWith('*') || s.startsWith('/*')) return;
          if (OLD.test(line)) bad.push(`${f.slice(root.length + 1)}:${i + 1}: ${s}`);
        });
    }
    expect(bad).toEqual([]);
  });
});
