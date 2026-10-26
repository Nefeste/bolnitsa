// Файл сохранения (spec docs/specs/2026-10-saves.md): шапка, снимок движка и вид окна — JSON, сжатый gzip; обратно —
// разжать, разобрать, провести через миграции (src/engine/shift/migrate.ts). Запись — в потоке расчёта (кадр окна не
// дёргается), загрузка — в окне, и то и другое — в тестах: CompressionStream есть в Chromium, Electron и Bun.
import { migrate, SAVE_SCHEMA, SaveError } from '../engine/shift/migrate';
import type { ShiftState } from '../engine/shift/types';

/** Шапка: что о сохранении видно в списке, не разжимая его. */
export interface SaveMeta {
  /** утреннее, при выходе или своё */
  kind: 'auto' | 'exit' | 'manual';
  /** когда записано — ISO, по часам компьютера */
  savedAt: string;
  /** версия игры, которая записала */
  version: string;
  /** с чего начинали: пустое здание, поликлиника, городская больница */
  start: string;
  /** сценарий кампании (spec docs/specs/2026-10-scenario-1.md); песочница — нет */
  scenario?: string;
  day: number;
  /** игровые секунды */
  t: number;
  /** касса сейчас, ₽ */
  cash?: number;
  /**
   * сложность (spec docs/specs/2026-10-difficulty.md, часть 2): уровень «Управления» — нет у «Обычно» и у сохранений до него;
   * мягкий режим — только включённый. Копии `meta.manage` и `meta.soft` снимка — для строки сохранения
   */
  manage?: 'calm' | 'hard';
  soft?: true;
}

export interface SaveFile {
  schema: number;
  meta: SaveMeta;
  /** вид окна — камера, уровень медицины; его разбирает окно */
  view?: unknown;
  state: ShiftState;
}

/** В байты. JSON — сразу, до первого ожидания: снимок живой и дальше меняется; сжатие — потом. */
export function pack(file: SaveFile): Promise<Uint8Array> {
  return gzip(new TextEncoder().encode(JSON.stringify(file)));
}

/** Из байтов: разжать, разобрать, миграции. Не gzip, не JSON, не сохранение — `broken`; из новой версии — `newer`. */
export async function unpack(bytes: Uint8Array): Promise<SaveFile> {
  let raw: { schema?: unknown; meta?: unknown; view?: unknown; state?: unknown } | null;
  try {
    raw = JSON.parse(new TextDecoder().decode(await gunzip(bytes)));
  } catch (e) {
    throw new SaveError('broken', e instanceof Error ? e.message : String(e));
  }
  if (!raw || typeof raw !== 'object' || !raw.meta || typeof raw.meta !== 'object') throw new SaveError('broken', 'no header');
  const state = migrate(raw.schema, raw.state);
  return { schema: SAVE_SCHEMA, meta: raw.meta as SaveMeta, ...(raw.view !== undefined ? { view: raw.view } : {}), state };
}

// CompressionStream принимает BufferSource, поток Blob даёт Uint8Array — для TypeScript это разные типы
const through = async (data: Uint8Array, t: CompressionStream | DecompressionStream): Promise<Uint8Array> =>
  new Uint8Array(await new Response(new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(t as unknown as ReadableWritablePair<Uint8Array, Uint8Array>)).arrayBuffer());

const gzip = (data: Uint8Array) => through(data, new CompressionStream('gzip'));
const gunzip = (data: Uint8Array) => through(data, new DecompressionStream('gzip'));
