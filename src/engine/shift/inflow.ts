// Поток от больницы (spec docs/specs/2026-10-economy.md, «Поток от больницы»; решение владельца 17.10.2026 — ответ на вопрос 2
// части 5а) — своё «Больницы», поток для ПК. Сколько приходят сами — от числа кабинетов, где принимают пришедших, и от
// репутации; сколько машин везёт скорая — от мест смотровой приёмного. Числа — content/hospital/inflow.yaml; форма по часам
// суток — day.yaml (часть 5а). Чистые расчёты: сколько кабинетов и мест в больнице, считает движок (engine.ts, `capacityOf`).
import type { ContentDb } from '../../content/types';

/** Что в больнице принимает поток: кабинеты, где принимают пришедших сами, и места смотровой приёмного. */
export interface Capacity {
  offices: number;
  bays: number;
}

/** Поток сами от репутации, %: при 0 и 100 — меньше и больше на `inflow.reputation`, между — по прямой. */
export function reputationPct(db: ContentDb, reputation: number): number {
  const r = Math.max(0, Math.min(100, reputation));
  return 100 + ((db.inflow?.reputation ?? 0) * (r - 50)) / 50;
}

/** Сами: человек в час в среднем за час приёма по умолчанию — на кабинет, с репутацией. */
export function walkPerHour(db: ContentDb, c: Capacity, reputation: number): number {
  return ((db.inflow?.walkIn ?? 0) * c.offices * reputationPct(db, reputation)) / 100;
}

/** Скорая: машин в час в среднем за сутки — на место смотровой. */
export function ambulancePerHour(db: ContentDb, c: Capacity): number {
  return ((db.inflow?.ambulance ?? 0) * c.bays) / 24;
}
