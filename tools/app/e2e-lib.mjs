// Общее для сценария в браузере и бенча без окна: где взять Chromium.
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Chromium: CHROMIUM_PATH или первый найденный в PLAYWRIGHT_BROWSERS_PATH (по умолчанию /opt/pw-browsers). */
export function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers';
  for (const d of readdirSync(base).filter(d => /^chromium-\d+$/.test(d)).sort().reverse()) {
    // chrome-linux64 — у сборок Chrome for Testing (chromium-1243 от Playwright 1.63 в контейнерах агентов),
    // chrome-linux — у прежних (chromium-1194 нашего playwright-core 1.56.1)
    for (const dir of ['chrome-linux64', 'chrome-linux']) {
      const p = join(base, d, dir, 'chrome');
      if (existsSync(p)) return p;
    }
  }
  throw new Error('Chromium не найден: задайте CHROMIUM_PATH или PLAYWRIGHT_BROWSERS_PATH');
}


/**
 * Строка заголовка окна (docs/specs/2026-10-clinical-style.md, часть 2) — что в ней на экране: первым значок (какой и сколько
 * точек), название и его шрифт, кто последний в строке и есть ли крестик. Окна нет или строки нет — null.
 */
export function windowHead(page, sel) {
  return page.evaluate(s => {
    const h = document.querySelector(`${s} > .whead`);
    if (!h) return null;
    const kids = [...h.children];
    const icon = kids[0]?.matches('svg.icon') ? kids[0] : null;
    const title = h.querySelector(':scope > .wtitle');
    return {
      icon: icon?.dataset.icon ?? '',
      size: icon ? Math.round(icon.getBoundingClientRect().width) : 0,
      title: title?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      font: title ? getComputedStyle(title).fontSize : '',
      last: kids[kids.length - 1]?.id ?? '',
      close: !!h.querySelector(':scope > button.close'),
    };
  }, sel);
}

/** Строка заголовка как задумано: значок `icon` в 20 точек первым, название 18 точек, последним — `last` (крестик или своя кнопка). */
export function headOk(h, icon, last, close) {
  return !!h && h.icon === icon && h.size === 20 && h.font === '18px' && h.title.length > 0 && h.last === last && h.close === close;
}
