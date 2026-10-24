// База в окне (spec docs/specs/2026-10-encyclopedia.md): читается один раз — и для игры, и для энциклопедии на экране
// начала, когда игры ещё нет. Не прочиталась — следующий вызов пробует снова.
import type { ContentDb } from '../content/types';

let loading: Promise<ContentDb> | undefined;

export function loadContent(): Promise<ContentDb> {
  loading ??= fetch('./content.json')
    .then(r => r.json() as Promise<ContentDb>)
    .catch((e: unknown) => {
      loading = undefined;
      throw e;
    });
  return loading;
}
