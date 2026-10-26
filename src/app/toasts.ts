// Извещения всплывающими строками (spec docs/specs/2026-10-aaa-polish.md, «Извещения»): под часами — последние три, новое
// сверху; обычное гаснет через 6 с, срочное (красный пришёл, остановка сердца, вашему больному хуже) — через 12 с,
// последнюю секунду — плавно. Время — настоящее, не игровое: на ×12 игровые минуты летят, а прочитать строку надо успеть.
// Вся лента — во вкладке «Журнал».

/** Как заметно извещение: срочное — красной полосой, тревожное (ушёл, не дождавшись; уходит сотрудник) — жёлтой. */
export type Tone = 'urgent' | 'warn';

export interface NoticeRow {
  /** игровое время, с */
  t: number;
  text: string;
  tone?: Tone;
  /** больной, к которому ведёт щелчок по строке */
  who?: string;
  /** когда показано, мс настоящего времени (`performance.now()`) */
  at: number;
}

/** Сколько строк сразу. */
export const TOASTS = 3;
/** Сколько живёт строка, мс: обычная и срочная. */
export const LIFE = { plain: 6000, urgent: 12000 };
/** Последние столько мс строка гаснет. */
export const FADE = 1000;
/**
 * Всплывает только свежее: не старше 30 игровых минут. Начало с середины дня догоняет его с 08:00 — извещения той
 * догонки остаются в «Журнале», а не всплывают разом.
 */
export const RECENT = 1800;

export const lifeOf = (n: NoticeRow) => (n.tone === 'urgent' ? LIFE.urgent : LIFE.plain);

/**
 * Строки под часами на миг `now` при игровом времени `t`: живые и свежие, не больше трёх, новые сверху (лента и так новыми
 * вперёд), с прозрачностью.
 */
export function toastsOf(notices: readonly NoticeRow[], now: number, t: number): { n: NoticeRow; opacity: number }[] {
  const out: { n: NoticeRow; opacity: number }[] = [];
  for (const n of notices) {
    if (t - n.t > RECENT) continue;
    const left = lifeOf(n) - (now - n.at);
    if (left <= 0) continue;
    out.push({ n, opacity: Math.min(1, left / FADE) });
    if (out.length === TOASTS) break;
  }
  return out;
}
