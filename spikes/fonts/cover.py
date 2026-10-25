# Что умеет каждая гарнитура для этой игры: буквы и знаки строк игры и медицинской базы, цифры (табличные ли), курсив,
# x-высота, ширина строки. Значки (☰, ⚙, 🏗…) не в счёт: их заменят SVG одной руки (aaa-polish, Б5).
# Запуск: .venv/bin/python -I cover.py — таблица Markdown для отчёта.
import collections, pathlib, re, unicodedata
from fontTools.ttLib import TTFont

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parent.parent
ICONS = set('☰⚙▦▣▪▬▭▯▸▾⏭✓✕✖✗❚⚠↶🏗🔔')
SAMPLE = 'Терапевт, навык 3 · Лебедева Елена, 47 лет: тромбофлебит подкожной вены ноги — верно. Касса: 300 000 ₽ +12 450 ₽ за сутки'

texts = []
for pattern in ('src/i18n/**/*.ts', 'src/ui/**/*.tsx', 'content/**/*.yaml'):
    texts += [p.read_text(encoding='utf-8') for p in REPO.glob(pattern)]
chars = sorted({ch for t in texts for ch in t if ord(ch) > 126} - ICONS)

rows = []
for d in sorted((HERE / 'files').iterdir()):
    meta = (d / 'METADATA.pb').read_text()
    name = re.search(r'^name: "([^"]+)"', meta, re.M).group(1)
    designer = re.search(r'^designer: "([^"]+)"', meta, re.M).group(1)
    license = re.search(r'^license: "([^"]+)"', meta, re.M).group(1)
    ttfs = sorted(d.glob('*.ttf'))
    upright = next(x for x in ttfs if 'Italic' not in x.name)
    font = TTFont(upright)
    cmap = font.getBestCmap()
    feats = {r.FeatureTag for r in font['GSUB'].table.FeatureList.FeatureRecord} if 'GSUB' in font else set()
    axes = {a.axisTag: (a.minValue, a.maxValue) for a in font['fvar'].axes} if 'fvar' in font else {}
    widths = {font['hmtx'][cmap[ord(c)]][0] for c in '0123456789'}
    digits = 'табличные сразу' if len(widths) == 1 else ('табличные — tnum' if 'tnum' in feats else 'нет табличных')
    italic = 'есть' if any('Italic' in x.name for x in ttfs) else ('наклон осью slnt' if 'slnt' in axes else 'нет')
    upm = font['head'].unitsPerEm
    width = sum(font['hmtx'][cmap[ord(c)]][0] for c in SAMPLE if ord(c) in cmap) / upm
    wght = axes.get('wght')
    weights = f'{int(wght[0])}–{int(wght[1])}' if wght else 'отдельные файлы'
    missing = ''.join(c for c in chars if ord(c) not in cmap)
    rows.append([name, designer, license, digits, italic, weights, round(font['OS/2'].sxHeight / upm, 3), width, missing,
                 sum(x.stat().st_size for x in ttfs) // 1024])
base = next(r[7] for r in rows if r[0] == 'Inter')
print('| Гарнитура | Авторы | Лицензия | Цифры | Курсив | Насыщенность | x-высота | Ширина строки | Нет знаков | Файлы, КБ |')
print('|---|---|---|---|---|---|---|---|---|---|')
for r in sorted(rows, key=lambda r: r[7]):
    print(f'| {r[0]} | {r[1]} | {r[2]} | {r[3]} | {r[4]} | {r[5]} | {r[6]:.3f} | {round(100 * r[7] / base)} % | {r[8] or "—"} | {r[9]} |')
