// Версия (устав, docs/04-process.md, «Версии»): номер живёт в package.json и package-lock.json — они совпадают; сборка по
// тегу (.github/workflows/build.yml) сверяет тег с package.json и выкладывает файлы с именем продукта из него.
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dir, '../..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
const build = readFileSync(join(root, '.github/workflows/build.yml'), 'utf8');

describe('версия', () => {
  test('package.json и package-lock.json — одна версия, полная X.Y.Z', () => {
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(lock.version).toBe(pkg.version);
    expect(lock.packages[''].version).toBe(pkg.version);
  });

  test('сборка по тегу: файлы релиза — с именем продукта, как их называет electron-builder', () => {
    expect(pkg.build.productName).toBe(pkg.productName);
    expect(pkg.build.artifactName).toBe('${productName}-${version}-${os}-${arch}.${ext}');
    for (const pat of ['-*.AppImage', '-*.tar.gz', '-*-win-x64.zip', '-*-win-x64.exe']) expect(build.includes(`release/${pkg.productName}${pat}`)).toBe(true);
  });
});
