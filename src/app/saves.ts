// Сохранения в окне (spec docs/specs/2026-10-saves.md): ячейки поверх «диска» — файлов Electron (electron/saves.cjs) или
// хранилища страницы (сценарий в браузере, разработка). Ячейка — два файла: `<ячейка>.save` — сжатый снимок
// (src/sim/packing.ts) и `<ячейка>.meta.json` — шапка для списка, чтобы не разжимать снимки. Утренние — `auto-1` (новое)
// … `auto-3`, сдвигом; при выходе — `exit`; свои — `manual-<n>`. Запись каждого файла — целиком: временный, затем подмена.
import { SaveError } from '../engine/shift/migrate';
import { type SaveFile, type SaveMeta, unpack } from '../sim/packing';

/** «Диск»: пять действий над файлами одной папки; имена — только ячеек, без путей. */
export interface Disk {
  read(name: string): Promise<Uint8Array | null>;
  /** записать целиком: временный файл, затем подмена */
  write(name: string, bytes: Uint8Array): Promise<void>;
  /** переименовать поверх: заменяет `to`; нет `from` — ничего */
  move(from: string, to: string): Promise<void>;
  remove(name: string): Promise<void>;
  list(): Promise<string[]>;
}

/** Сколько утренних хранить — три последних утра (геймдизайн §14). */
export const AUTO_KEEP = 3;

export interface SaveRow {
  slot: string;
  /** шапка; нет — файл шапки потерян или испорчен, но снимок, может быть, цел */
  meta: SaveMeta | null;
}

const enc = new TextEncoder();

/** Записать ячейку: снимок, затем шапку. */
export async function writeSlot(disk: Disk, slot: string, bytes: Uint8Array, meta: SaveMeta): Promise<void> {
  await disk.write(`${slot}.save`, bytes);
  await disk.write(`${slot}.meta.json`, enc.encode(JSON.stringify(meta)));
}

/** Утреннее: прежние сдвигаются на одну (`auto-1` → `auto-2` …), старшее уходит, новое — в `auto-1`. */
export async function writeAuto(disk: Disk, bytes: Uint8Array, meta: SaveMeta): Promise<void> {
  for (let n = AUTO_KEEP - 1; n >= 1; n--) {
    await disk.move(`auto-${n}.save`, `auto-${n + 1}.save`);
    await disk.move(`auto-${n}.meta.json`, `auto-${n + 1}.meta.json`);
  }
  await writeSlot(disk, 'auto-1', bytes, meta);
}

/** Имя новой своей ячейки: следующий номер после самого большого. */
export async function nextManual(disk: Disk): Promise<string> {
  let n = 0;
  for (const name of await disk.list()) {
    const m = /^manual-(\d+)\.save$/.exec(name);
    if (m) n = Math.max(n, Number(m[1]));
  }
  return `manual-${n + 1}`;
}

/** Все ячейки: новые — сверху; без шапки — внизу. */
export async function listSlots(disk: Disk): Promise<SaveRow[]> {
  const slots = (await disk.list()).filter(n => n.endsWith('.save')).map(n => n.slice(0, -'.save'.length));
  const rows = await Promise.all(slots.map(async slot => ({ slot, meta: metaOf(await disk.read(`${slot}.meta.json`)) })));
  return rows.sort((a, b) => (b.meta?.savedAt ?? '').localeCompare(a.meta?.savedAt ?? '') || a.slot.localeCompare(b.slot));
}

function metaOf(bytes: Uint8Array | null): SaveMeta | null {
  if (!bytes) return null;
  try {
    const m = JSON.parse(new TextDecoder().decode(bytes)) as SaveMeta;
    return m && typeof m === 'object' && typeof m.savedAt === 'string' && typeof m.t === 'number' ? m : null;
  } catch {
    return null;
  }
}

/** Открыть ячейку: разжать, миграции. Нет файла — `broken`. */
export async function readSlot(disk: Disk, slot: string): Promise<SaveFile> {
  const bytes = await disk.read(`${slot}.save`);
  if (!bytes) throw new SaveError('broken', `no ${slot}.save`);
  return unpack(bytes);
}

export async function removeSlot(disk: Disk, slot: string): Promise<void> {
  await disk.remove(`${slot}.save`);
  await disk.remove(`${slot}.meta.json`);
}

// ------------------------------------------------------------------------------------------------- диски

/** Мост к папке сохранений Electron (electron/preload.cjs): те же пять действий. */
export interface ShellSaves {
  read(name: string): Promise<Uint8Array | null>;
  write(name: string, bytes: Uint8Array): Promise<void>;
  move(from: string, to: string): Promise<void>;
  remove(name: string): Promise<void>;
  list(): Promise<string[]>;
}

/** Хранилище страницы (Origin Private File System): сценарий в браузере и разработка без Electron. */
export function pageDisk(): Disk {
  // папка — заново при каждом действии: её могли убрать (очистка данных сайта, сценарий в браузере)
  const root = () => navigator.storage.getDirectory().then(r => r.getDirectoryHandle('saves', { create: true }));
  const read = async (name: string): Promise<Uint8Array | null> => {
    try {
      const f = await (await (await root()).getFileHandle(name)).getFile();
      return new Uint8Array(await f.arrayBuffer());
    } catch {
      return null;
    }
  };
  const write = async (name: string, bytes: Uint8Array) => {
    // запись хранилища страницы — во временный файл и подмена при закрытии: целиком или никак
    const w = await (await (await root()).getFileHandle(name, { create: true })).createWritable();
    await w.write(bytes as Uint8Array<ArrayBuffer>);
    await w.close();
  };
  const remove = async (name: string) => {
    try {
      await (await root()).removeEntry(name);
    } catch {
      // нет файла — нечего убирать
    }
  };
  return {
    read,
    write,
    remove,
    move: async (from, to) => {
      const bytes = await read(from);
      if (!bytes) return;
      await write(to, bytes);
      await remove(from);
    },
    list: async () => {
      const names: string[] = [];
      for await (const name of (await root()).keys()) names.push(name);
      return names;
    },
  };
}

/** В памяти — тесты. */
export function memoryDisk(): Disk & { files: Map<string, Uint8Array> } {
  const files = new Map<string, Uint8Array>();
  return {
    files,
    read: async name => files.get(name) ?? null,
    write: async (name, bytes) => void files.set(name, bytes),
    move: async (from, to) => {
      const b = files.get(from);
      if (!b) return;
      files.set(to, b);
      files.delete(from);
    },
    remove: async name => void files.delete(name),
    list: async () => [...files.keys()],
  };
}
