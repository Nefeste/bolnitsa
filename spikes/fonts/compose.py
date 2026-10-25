# Листы сравнения: один участок экрана в четырёх гарнитурах; подпись — самой гарнитурой.
# Запуск: .venv/bin/python -I compose.py → docs/reports/2026-10-fonts/*.jpg
import pathlib
from PIL import Image, ImageDraw, ImageFont

HERE = pathlib.Path(__file__).resolve().parent
DEST = HERE.parent.parent / 'docs/reports/2026-10-fonts'
FONTS = [('plex', 'IBM Plex Sans', 'ibmplexsans/IBMPlexSans[wdth,wght].ttf'), ('golos', 'Golos Text', 'golostext/GolosText[wght].ttf'),
         ('manrope', 'Manrope', 'manrope/Manrope[wght].ttf'), ('inter', 'Inter', 'inter/Inter[opsz,wght].ttf')]
BG, FG = (24, 31, 35), (230, 236, 238)


def label(img, text, ttf):
    f = ImageFont.truetype(str(HERE / 'files' / ttf), 22)
    f.set_variation_by_axes([600 if a['name'] in (b'Weight', 'Weight') else a['default'] for a in f.get_variation_axes()])
    out = Image.new('RGB', (img.width, img.height + 40), BG)
    ImageDraw.Draw(out).text((10, 7), text, font=f, fill=FG)
    out.paste(img, (0, 40))
    return out


def grid(tiles, cols, gap=12):
    w, h = max(t.width for t in tiles), max(t.height for t in tiles)
    rows = (len(tiles) + cols - 1) // cols
    out = Image.new('RGB', (cols * w + (cols - 1) * gap, rows * h + (rows - 1) * gap), (12, 16, 18))
    for i, t in enumerate(tiles):
        out.paste(t, ((i % cols) * (w + gap), (i // cols) * (h + gap)))
    return out


def sheet(scene, box, cols, name):
    tiles = [label(Image.open(HERE / 'shots' / f'{scene}-{k}.png').convert('RGB').crop(box), title, ttf) for k, title, ttf in FONTS]
    img = grid(tiles, cols)
    img.save(DEST / name, quality=80, optimize=True, progressive=True)
    print(name, img.size, (DEST / name).stat().st_size // 1024, 'КБ')


DEST.mkdir(parents=True, exist_ok=True)
sheet('3-meeting', (216, 52, 1064, 560), 2, '1-meeting.jpg')  # планёрка: сутки, ошибки врачей, касса
sheet('2-card', (310, 52, 970, 545), 2, '2-card.jpg')  # карта отпущенного: решение, итог, ход приёма
sheet('1-patients', (0, 0, 1130, 48), 1, '3-top.jpg')  # верхняя полоса: часы, касса, счётчики
sheet('1-patients', (992, 160, 1272, 535), 4, '4-list.jpg')  # вкладка «Пациенты»
