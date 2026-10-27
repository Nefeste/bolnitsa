// Тёмный клинический стиль (spec docs/specs/2026-10-clinical-style.md; решение владельца #69): все цвета, размеры шрифта и
// скругления окна — токены `:root` страницы, правило CSS своих не задаёт; текст на стекле над светлой картой читается —
// контраст по WCAG не ниже 4,5:1, когда под стеклом белое (свет из окон на светлой плитке), и когда чёрное (ночь).
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const html = readFileSync(join(import.meta.dir, '../../app/index.html'), 'utf8');
const css = html.slice(html.indexOf('<style>') + '<style>'.length, html.indexOf('</style>')).replace(/\/\*[\s\S]*?\*\//g, '');
const rootAt = css.indexOf(':root {');
const rootEnd = css.indexOf('}', rootAt) + 1;
const root = css.slice(rootAt, rootEnd);
const rules = css.slice(0, rootAt) + css.slice(rootEnd);
const tokens = new Map([...root.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]));

type Rgba = [number, number, number, number];
const COLOUR = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g;

function colour(v: string): Rgba {
  const hex = v.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map(c => c + c).join('') : hex[1];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1];
  }
  const f = v.match(/^rgba?\(([^)]*)\)$/);
  if (!f) throw new Error(`не цвет: ${v}`);
  const [r, g, b, a = 1] = f[1].split(',').map(Number);
  return [r, g, b, a];
}
const tok = (name: string): Rgba => {
  const v = tokens.get(name);
  if (!v) throw new Error(`нет токена ${name}`);
  return colour(v);
};
/** Цвет поверх цвета (непрозрачного): что увидит глаз. */
const over = (fg: Rgba, bg: Rgba): Rgba => [0, 1, 2].map(i => fg[i] * fg[3] + bg[i] * (1 - fg[3])).concat(1) as Rgba;
function luminance([r, g, b]: Rgba): number {
  const lin = (c: number) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
/** Контраст по WCAG 2: от 1 до 21. */
function contrast(a: Rgba, b: Rgba): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
const WHITE: Rgba = [255, 255, 255, 1];
const BLACK: Rgba = [0, 0, 0, 1];

describe('токены', () => {
  test('цвета — только в :root: правило CSS своих не задаёт', () => {
    expect(rules.match(COLOUR) ?? []).toEqual([]);
    // цвета токенов разбираются, а не только находятся
    const colours = [...tokens.values()].filter(v => /^(#|rgb)/.test(v));
    expect(colours.length).toBeGreaterThan(40);
    for (const v of colours) expect(colour(v)[3]).toBeGreaterThan(0);
  });

  test('шрифт — семь размеров шкалы; подписи на карте — шкала, умноженная на размер текста', () => {
    const scale = [...tokens.keys()].filter(k => k.startsWith('--fs-'));
    expect(scale.map(k => tokens.get(k))).toEqual(['11px', '12px', '13px', '16px', '18px', '22px', '28px']);
    const sizes = [...rules.matchAll(/font-size:\s*([^;]+);/g)].map(m => m[1].trim());
    expect(sizes.length).toBeGreaterThan(40);
    for (const s of sizes) expect(s).toMatch(/^(var\(--fs-[a-z]+\)|calc\(var\(--fs-[a-z]+\) \* var\(--ui-k, 1\)\))$/);
    expect(rules).toContain('font: var(--fs-body)/1.35 "IBM Plex Sans"');
  });

  test('каждая переменная определена, каждый токен где-то нужен', () => {
    const used = new Set([...rules.matchAll(/var\((--[\w-]+)/g)].map(m => m[1]));
    used.delete('--ui-k'); // размер текста ставит окно (src/app/settings.ts), со значением по умолчанию
    for (const u of used) expect(tokens.has(u) ? u : `не определён: ${u}`).toBe(u);
    for (const t of tokens.keys()) expect(used.has(t) ? t : `не нужен: ${t}`).toBe(t);
  });

  test('иерархия: заголовок окна — 18, карточки — 16, разделы окон — одной манерой', () => {
    const rule = (sel: string) => {
      const at = rules.indexOf(`${sel} {`);
      expect(at >= 0 ? sel : `нет правила ${sel}`).toBe(sel);
      return rules.slice(at, rules.indexOf('}', at));
    };
    for (const sel of ['.dtitle', '.mhead', '.enc-head .enc-name', '.enc-article h2', '.scenariodone h2']) expect(rule(sel)).toContain('var(--fs-window)');
    expect(rule('.cardhead')).toContain('var(--fs-title)');
    for (const sel of ['.dcol h3', '.dcourse h3', '.msec h3', '#goals h3', '.settings h3.sub', '.enc-group h3, .enc-block h4']) {
      const r = rule(sel);
      expect(r).toContain('font-size: var(--fs-small)');
      expect(r).toContain('color: var(--accent-text)');
      expect(r).toContain('text-transform: uppercase');
    }
  });
});

describe('читаемость над светлой картой', () => {
  // стекло над картой и окна поверх неё; под ними — белое (свет из окон на плитке) или чёрное (ночь)
  const OVER_MAP = ['--glass', '--glass-tag', '--glass-strong', '--glass-start', '--window', '--window-2', '--window-solid'];
  const TEXT = ['--text', '--muted', '--strong', '--accent-text', '--ok-text', '--warn-text', '--bad-text', '--bad-text-2', '--info-text', '--chief-text', '--speech', '--warn'];

  test('любой текст на любом стекле и окне — не ниже 4,5:1 и над белым, и над чёрным', () => {
    const worst: string[] = [];
    for (const s of OVER_MAP)
      for (const [under, name] of [[WHITE, 'белое'], [BLACK, 'чёрное']] as const) {
        const bg = over(tok(s), under);
        for (const t of TEXT) if (contrast(tok(t), bg) < 4.5) worst.push(`${t} на ${s} (под ним ${name}): ${contrast(tok(t), bg).toFixed(2)}`);
      }
    expect(worst).toEqual([]);
  });

  test('бирюза текстом — светлее заливки: заливкой она над белым не читалась бы', () => {
    const glass = over(tok('--glass'), WHITE);
    expect(contrast(tok('--accent'), glass)).toBeLessThan(4.5);
    expect(contrast(tok('--accent-text'), glass)).toBeGreaterThanOrEqual(4.5);
  });

  test('кнопки на панели: текст и серый — не ниже 4,5:1, и при наведении', () => {
    const panel = over(tok('--glass'), WHITE);
    for (const b of ['--raised', '--raised-hover']) {
      const bg = over(tok(b), panel);
      for (const t of ['--text', '--muted', '--accent-text']) expect(contrast(tok(t), bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('подложки строк в окне: текст на них и цветной текст на своей подложке — не ниже 4,5:1', () => {
    const win = over(tok('--window'), WHITE);
    for (const w of ['--sunken', '--wash', '--wash-2', '--accent-wash-1', '--accent-wash-2', '--accent-wash-3', '--ok-wash-1', '--ok-wash-2', '--ok-wash-3', '--warn-wash', '--bad-wash', '--info-wash', '--chief-wash'])
      for (const t of ['--text', '--muted']) expect(contrast(tok(t), over(tok(w), win))).toBeGreaterThanOrEqual(4.5);
    const pairs: [string, string][] = [['--warn-text', '--warn-wash'], ['--chief-text', '--chief-wash'], ['--ok-text', '--ok-wash-3'], ['--accent-text', '--accent-wash-2'], ['--bad-text', '--bad-wash']];
    for (const [t, w] of pairs) expect(contrast(tok(t), over(tok(w), win))).toBeGreaterThanOrEqual(4.5);
  });

  test('на кнопке акцента и на жёлтой метке «новое» — тёмный текст', () => {
    for (const fill of ['--accent', '--accent-hover', '--warn']) expect(contrast(tok('--on-accent'), tok(fill))).toBeGreaterThanOrEqual(4.5);
  });
});
