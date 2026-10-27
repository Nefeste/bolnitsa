// Значки окна (решение владельца #139; docs/reports/2026-10-icons.md): Carbon (IBM), Apache 2.0 — разметка путей из
// icons.gen.ts (её делает tools/app/icons.mjs), и три своих в его рисунке — двери и скамья. Цвет — цвет текста, размер —
// 16 точек, как буквы кнопок; подпись — рядом или в title кнопки, сам значок для чтения с экрана скрыт.
import { ICONS } from './icons.gen';

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  const i = ICONS[name];
  return (
    <svg
      className="icon"
      data-icon={name}
      viewBox={`0 0 ${i.size} ${i.size}`}
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      dangerouslySetInnerHTML={{ __html: i.body }}
    />
  );
}
