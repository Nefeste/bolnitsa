// Строка заголовка окна (spec docs/specs/2026-10-clinical-style.md, часть 2): каждое окно поверх карты — элемент с
// role="dialog" в src/ui — начинается строкой заголовка `WindowHead`: значок набора игры, название, кнопки окна, «Закрыть».
// Окно называет себя (aria-labelledby) номером из этой строки. Новое окно без неё тест не пропустит.
import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ICONS } from '../../src/ui/icons.gen';

const root = join(import.meta.dir, '../..');
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap(f => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : f.endsWith('.tsx') ? [p] : [];
  });

interface Win {
  id: string;
  file: string;
  /** первый элемент окна — строка заголовка */
  head: boolean;
  icon?: string;
  /** номер названия из aria-labelledby есть в строке заголовка */
  named: boolean;
  /** «Закрыть» */
  close: boolean;
}

/** Окна в коде окна: открывающий тег с role="dialog" и то, что идёт за ним до конца строки заголовка. */
function windows(): Win[] {
  const out: Win[] = [];
  for (const f of files(join(root, 'src/ui'))) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/<div className=[^>]*\brole="dialog"[^>]*>/g)) {
      const id = m[0].match(/\bid="([^"]+)"/)?.[1] ?? '?';
      // комментарий JSX перед строкой заголовка — можно
      const after = src.slice((m.index ?? 0) + m[0].length).replace(/^\s*(\{\/\*[\s\S]*?\*\/\}\s*)*/, '');
      const head = after.startsWith('<WindowHead');
      const block = head ? after.slice(0, after.indexOf('</WindowHead>')) : '';
      const label = m[0].match(/aria-labelledby="([^"]+)"/)?.[1];
      out.push({
        id,
        file: f.slice(root.length + 1),
        head,
        icon: block.match(/^<WindowHead\s+icon="([\w-]+)"/)?.[1],
        named: !!label && (block.includes(`titleId="${label}"`) || block.includes(`id="${label}"`)),
        close: /\bclose=\{\{/.test(block),
      });
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

describe('строка заголовка окна', () => {
  const all = windows();

  test('окна поверх карты — все восемь, и каждое начинается строкой заголовка со значком набора', () => {
    expect(all.map(w => w.id)).toEqual(['dcard', 'demo-summary', 'enc', 'game-menu', 'meeting', 'scenario-done', 'settings', 'term']);
    for (const w of all) {
      expect([w.id, w.head]).toEqual([w.id, true]);
      expect([w.id, !!w.icon && w.icon in ICONS]).toEqual([w.id, true]);
    }
  });

  test('значки — по окну: у меню и «Настроек» — как у кнопок, что их открывают; у прочих свой', () => {
    expect(Object.fromEntries(all.map(w => [w.id, w.icon]))).toEqual({
      dcard: 'card',
      'demo-summary': 'result',
      enc: 'book',
      'game-menu': 'menu',
      meeting: 'meeting',
      'scenario-done': 'finish',
      settings: 'settings',
      term: 'info',
    });
  });

  test('окно называет себя названием из строки заголовка', () => {
    for (const w of all) expect([w.id, w.named]).toEqual([w.id, true]);
  });

  test('«Закрыть» — у окон, которые закрывает Esc; планёрку закрывает «Продолжить», окна выбора — выбор', () => {
    expect(all.filter(w => w.close).map(w => w.id)).toEqual(['dcard', 'enc', 'game-menu', 'settings']);
  });
});
