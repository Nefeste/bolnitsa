// Версия (устав, docs/04-process.md, «Версии»): номер живёт в package.json и package-lock.json — они совпадают; сборка по
// тегу (.github/workflows/build.yml) сверяет тег с package.json и выкладывает файлы с именем продукта из него: полный zip и
// архив обновления с одним app.asar (tools/app/update-zip.mjs).
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

  // релиз пока — только Windows x64 одним zip (решение владельца 17.10.2026; docs/05-process.md)
  test('сборка по тегу: файл релиза — zip для Windows x64 с именем продукта, как его называет electron-builder', () => {
    expect(pkg.build.productName).toBe(pkg.productName);
    expect(pkg.build.artifactName).toBe('${productName}-${version}-${os}-${arch}.${ext}');
    expect(pkg.build.win.target).toEqual([{ target: 'zip', arch: ['x64'] }]);
    expect(build.includes(`release/${pkg.productName}-*-win-x64.zip`)).toBe(true);
    expect(build.includes('electron-builder --win --publish never')).toBe(true);
  });

  // между выпусками меняется один resources/app.asar, если в exe нет его суммы (docs/05-process.md, «Сборка для ПК»)
  test('сборка по тегу: рядом с полным zip — архив обновления; exe без суммы asar', () => {
    expect(pkg.build.disableAsarIntegrity).toBe(true);
    expect(pkg.scripts['dist:win'].endsWith('electron-builder --win --publish never && node tools/app/update-zip.mjs')).toBe(true);
    expect(build.includes('run: node tools/app/update-zip.mjs')).toBe(true);
    expect(build.includes(`release/${pkg.productName}-*-win-x64-update.zip`)).toBe(true);
  });
});
