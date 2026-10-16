// из anamnez: src/content/index.ts @ 96503ac
// Собранная медицинская база (ADR 0007). Файл собирает `npm run content`; в репозитории его нет.
import type { ContentDb } from './types';
import bundle from './generated/bundle.json';

export const db = bundle as unknown as ContentDb;
