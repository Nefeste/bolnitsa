// Встреченные болезни (spec docs/specs/2026-11-sandbox.md, часть 2б; решение агента 2): главные болезни закрытых случаев
// кампании — ваших и нанятых врачей — на этом компьютере, в хранилище страницы, как рекорды испытаний (`challenges.ts`): они про
// игрока, а не про больницу. Из них — поток песочницы «только встреченные». Чисто: хранилище передают, без него — в памяти сеанса.

const KEY = 'bolnitsa.met';

/** Встреченные из строки хранилища: по алфавиту, без повторов; чужое и испорченное — прочь. */
export function parseMet(raw: string | null | undefined): string[] {
  let v: unknown;
  try {
    v = raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter((x): x is string => typeof x === 'string' && x.startsWith('cond.')))].sort();
}

/** Добавить встреченные; новых нет — `undefined`, писать нечего. */
export function addMet(list: readonly string[], ids: readonly string[]): string[] | undefined {
  const fresh = ids.filter(id => id.startsWith('cond.') && !list.includes(id));
  return fresh.length > 0 ? [...new Set([...list, ...fresh])].sort() : undefined;
}

/** Хранилище страницы, если оно есть и доступно. */
function storage(): Pick<Storage, 'getItem' | 'setItem'> | undefined {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : undefined;
  } catch {
    return undefined;
  }
}

export function readMet(store = storage()): string[] {
  try {
    return parseMet(store?.getItem(KEY));
  } catch {
    return [];
  }
}

/** Записать; не вышло — встреченные живут до конца сеанса. */
export function writeMet(list: readonly string[], store = storage()): void {
  try {
    store?.setItem(KEY, JSON.stringify(list));
  } catch {
    // хранилище недоступно или полно
  }
}
