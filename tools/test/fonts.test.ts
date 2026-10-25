// Шрифт игры (решение владельца #107; docs/reports/2026-10-fonts.md, «Что дальше»): IBM Plex Sans под SIL OFL 1.1 —
// в assets/fonts только файлы из таблицы assets/LICENSES.md (раздел 5) и с теми же SHA-256; текст лицензии — рядом, с
// копирайтом и зарезервированным именем; страница подключает их своими адресами, а сборка кладёт рядом и лицензию.
import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dir, '../..');
const fonts = join(root, 'assets/fonts');
const licenses = readFileSync(join(root, 'assets/LICENSES.md'), 'utf8');
/** Строки таблицы раздела 5: файл → SHA-256. */
const table = new Map([...licenses.matchAll(/^\| `assets\/fonts\/([^`]+)` \| `([0-9a-f]{64})` \|$/gm)].map(m => [m[1], m[2]]));

describe('шрифт игры', () => {
  test('в assets/fonts — ровно файлы таблицы лицензий, с теми же SHA-256', () => {
    expect([...table.keys()].sort()).toEqual(readdirSync(fonts).sort());
    expect(table.size).toBe(3);
    for (const [file, sha] of table) expect(createHash('sha256').update(readFileSync(join(fonts, file))).digest('hex')).toBe(sha);
  });

  test('лицензия рядом: SIL OFL 1.1, копирайт IBM и зарезервированное имя «Plex»', () => {
    const ofl = readFileSync(join(fonts, 'OFL.txt'), 'utf8');
    // строки — CRLF, как в источнике: файл лежит нетронутым (.gitattributes: без перевода строк)
    expect(ofl.split('\r\n')[0]).toBe('Copyright © 2017 IBM Corp. with Reserved Font Name "Plex"');
    expect(ofl).toContain('SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007');
    expect(licenses).toContain('## 5. IBM Plex Sans — шрифт игры');
  });

  test('страница подключает свои файлы — прямой и курсив, и набирает им; сборка кладёт шрифт и лицензию', () => {
    const page = readFileSync(join(root, 'app/index.html'), 'utf8');
    const faces = [...page.matchAll(/@font-face \{ font-family: "IBM Plex Sans"; src: url\("assets\/fonts\/([^"]+)"\)[^}]*font-style: (normal|italic);/g)];
    expect(faces.map(f => f[2]).sort()).toEqual(['italic', 'normal']);
    for (const f of faces) expect(existsSync(join(fonts, f[1]))).toBe(true);
    expect(page).toMatch(/html, body \{[^}]*font: 13px\/1\.35 "IBM Plex Sans", system-ui/);
    // своими адресами: CSP страницы пускает только свои файлы
    expect(page).toContain("default-src 'self'");
    expect(readFileSync(join(root, 'tools/app/build.mjs'), 'utf8')).toContain("cpSync(join(root, 'assets/fonts'), join(out, 'assets/fonts'), { recursive: true });");
  });
});
