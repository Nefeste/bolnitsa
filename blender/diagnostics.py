# Модели Blender, часть 2, группа 3 «Диагностика» (docs/specs/2026-11-blender-2.md): рентген пилота, КТ, МРТ, аппарат УЗИ и
# пульт кабинетов лучевой диагностики. Бюджет треугольников — blender/budgets.json, размеры — blender/sizes.json (из игры).
#
# Все — вместо моделей кодом, в оси их места (`codes`), как модели пилота (`placeAt`); верх стола пациента — высота постели игры
# (`lieTop`): по ней игра кладёт людей. Рентген — модель пилота как есть (blender/models.py): 3392 треугольника при бюджете 3400.
# Части — для механик (спецификация, «Части — для механик»): `screen` светится; у КТ — `gantry` и `table`, у МРТ — `magnet`,
# `bore` и `table`, у рентгена — `tube` и `detector`, как у пилота.
import math

from mathutils import Matrix

from common import SIZES, Part, g2b, material
from models import xray

CODES = SIZES['codes']

# сетка затенения у больших плоских частей (решение агента 6)
WIDE = 0.4


def ring(part, r_out, r_in, depth, y, z, seg=32, x=0.0):
    """
    Кольцо (труба) вдоль оси z игры: наружный и внутренний радиусы, глубина; (x, y, z) — середина кольца. Торцы — плоские,
    бока — гладкие.
    """
    bm = part.bm
    rows = []
    for zz in (z - depth / 2, z + depth / 2):
        outer, inner = [], []
        for k in range(seg):
            a = k * 2 * math.pi / seg
            c, s = math.cos(a), math.sin(a)
            outer.append(bm.verts.new(g2b(x + c * r_out, y + s * r_out, zz)))
            inner.append(bm.verts.new(g2b(x + c * r_in, y + s * r_in, zz)))
        rows.append((outer, inner))
    (o0, i0), (o1, i1) = rows
    for k in range(seg):
        n = (k + 1) % seg
        for f in (
            bm.faces.new((o0[k], o0[n], o1[n], o1[k])),  # наружный бок
            bm.faces.new((i0[k], i1[k], i1[n], i0[n])),  # тоннель
        ):
            f.smooth = True
        bm.faces.new((o0[k], i0[k], i0[n], o0[n]))  # торец у изголовья
        bm.faces.new((o1[k], o1[n], i1[n], i1[k]))  # торец к ногам
    return part


def ct():
    """
    КТ: кольцо гентри на корпусе у изголовья (−z), тоннель — над столом; стол на тумбе уходит в тоннель; на гентри — пульт с
    экраном и голубая полоса.
    """
    top = CODES['ct']['lieTop']
    shell = material('white', 'white', rough=0.45)
    gantry = Part('gantry', shell)
    # кольцо: середина — на высоте 1 м, как у модели кодом; тоннель — 0,34 м, выше стола
    ring(gantry, 0.9, 0.34, 0.6, 1.0, -0.55, seg=32)
    gantry.box(1.6, 0.55, 0.6, 0, 0.18, -0.55, bevel=0.04, grid=WIDE)
    base = Part('base', material('panel', 'panel', rough=0.5))
    base.box(1.9, 0.18, 0.75, 0, 0, -0.55, bevel=0.03, grid=WIDE)
    stripe = Part('stripe', material('teal', 'teal', rough=0.4))
    ring(stripe, 0.92, 0.84, 0.02, 1.0, -0.24, seg=32)
    panel = Part('panel', material('dark', 'dark', rough=0.6))
    panel.box(0.3, 0.14, 0.04, 0.55, 0.62, -0.23, bevel=0.01, grid=0)
    screen = Part('screen', material('screen', 'screen', rough=0.2))
    screen.box(0.24, 0.09, 0.006, 0.55, 0.645, -0.208, bevel=0, grid=0)
    # стол: тумба, ложе, мягкий верх — до высоты постели игры
    pedestal = Part('pedestal', material('steel_d', 'steel_d', rough=0.45, metal=0.3))
    pedestal.box(0.5, top - 0.1, 1.1, 0, 0, 0.45, bevel=0.03, grid=WIDE)
    table = Part('table', material('table', '#e6eaeb', rough=0.45))
    table.box(0.6, 0.08, 2.0, 0, top - 0.1, 0, bevel=0.02, grid=WIDE)
    pad = Part('pad', material('pad', '#6fa9c9', rough=0.85))
    pad.box(0.52, 0.03, 1.7, 0, top - 0.025, 0.1, bevel=0.012, grid=WIDE)
    return [gantry, base, stripe, panel, screen, pedestal, table, pad]


def mri():
    """
    МРТ: большой магнит у изголовья (−z) с тоннелем, тёмное отверстие в лицевой панели и рамка вокруг; голубая полоса; стол на
    тумбе к тоннелю.
    """
    top = CODES['mri']['lieTop']
    magnet = Part('magnet', material('white', 'white', rough=0.45))
    magnet.box(1.95, 1.95, 1.3, 0, 0, -0.45, bevel=0.14, segments=3, grid=WIDE)
    # тоннель: тёмная труба внутрь магнита и рамка у входа
    bore = Part('bore', material('bore', '#2c3a40', rough=0.6))
    ring(bore, 0.4, 0.33, 1.2, top + 0.18, -0.45, seg=24)
    bezel = Part('bezel', material('panel', 'panel', rough=0.5))
    ring(bezel, 0.5, 0.33, 0.06, top + 0.18, 0.22, seg=24)
    stripe = Part('stripe', material('teal', 'teal', rough=0.4))
    stripe.box(1.6, 0.18, 0.04, 0, 1.6, 0.215, bevel=0.01, grid=0)
    pedestal = Part('pedestal', material('steel_d', 'steel_d', rough=0.45, metal=0.3))
    pedestal.box(0.5, top - 0.1, 1.0, 0, 0, 0.5, bevel=0.03, grid=WIDE)
    table = Part('table', material('table', '#e6eaeb', rough=0.45))
    table.box(0.6, 0.08, 1.9, 0, top - 0.1, 0.1, bevel=0.02, grid=WIDE)
    pad = Part('pad', material('pad', '#6fa9c9', rough=0.85))
    pad.box(0.52, 0.03, 1.6, 0, top - 0.025, 0.2, bevel=0.012, grid=WIDE)
    return [magnet, bore, bezel, stripe, pedestal, table, pad]


def us():
    """
    Аппарат УЗИ на тележке: колёса, корпус, панель с клавиатурой к врачу (+z), датчики в держателе сбоку, монитор на стойке —
    экраном к врачу.
    """
    wheels = Part('wheels', material('dark', 'dark', rough=0.7))
    for sx in (-0.2, 0.2):
        for sz in (-0.2, 0.2):
            wheels.cyl(0.04, 0.04, 0.03, sx - 0.015, 0.04, sz, seg=8, axis='x')
    body = Part('body', material('white', 'white', rough=0.45))
    body.box(0.48, 0.55, 0.45, 0, 0.06, 0, bevel=0.03, segments=2, grid=0)
    deck = Part('deck', material('panel', 'panel', rough=0.5))
    deck.box(0.55, 0.06, 0.4, 0, 0.8, 0.05, bevel=0.02, grid=0)
    deck.box(0.08, 0.2, 0.08, 0, 0.61, -0.04, bevel=0, grid=0)
    keys = Part('keyboard', material('keys', 'dark', rough=0.7))
    keys.box(0.4, 0.02, 0.22, 0, 0.86, 0.08, bevel=0.004, grid=0)
    # датчики в держателе сбоку панели: выступает за панель на 3 см, в пределах места модели кодом
    probes = Part('probes', material('probe', 'slate', rough=0.5))
    probes.box(0.05, 0.08, 0.16, 0.28, 0.78, 0.05, bevel=0, grid=0)
    for dz in (-0.04, 0.04):
        probes.cyl(0.016, 0.02, 0.12, 0.28, 0.84, 0.05 + dz, seg=8)
    stand = Part('stand', material('steel', 'steel', rough=0.35, metal=0.6))
    stand.box(0.05, 0.16, 0.04, 0, 0.86, -0.12, bevel=0, grid=0)
    monitor = Part('monitor', material('dark', 'dark', rough=0.6))
    monitor.box(0.46, 0.34, 0.05, 0, 1.0, -0.12, bevel=0.012, rx=-0.12, grid=0)
    screen = Part('screen', material('screen', 'screen', rough=0.2))
    screen.box(0.42, 0.3, 0.006, 0, 1.02, -0.092, bevel=0, rx=-0.12, grid=0)
    return [wheels, body, deck, keys, probes, stand, monitor, screen]


def console():
    """
    Пульт кабинета лучевой диагностики: стол с тумбой, столешница, два монитора экранами к оператору (+z), клавиатура и мышь.
    Модель — в осях места без сдвига: игра сдвигает её к стене (`CODE_SHIFT`), как модель кодом.
    """
    body = Part('body', material('panel', 'panel', rough=0.5))
    body.box(0.92, 0.64, 0.55, 0, 0, -0.02, bevel=0.015, grid=WIDE)
    top = Part('top', material('top', '#7e8b91', rough=0.5))
    top.box(0.94, 0.04, 0.6, 0, 0.64, 0, bevel=0.008, grid=0)
    monitors = Part('monitor', material('dark', 'dark', rough=0.6))
    screens = Part('screen', material('screen', 'screen', rough=0.2))
    for x in (-0.22, 0.22):
        monitors.box(0.1, 0.012, 0.08, x, 0.68, -0.15, bevel=0, grid=0)
        monitors.box(0.03, 0.08, 0.02, x, 0.692, -0.16, bevel=0, grid=0)
        monitors.box(0.4, 0.26, 0.03, x, 0.74, -0.14, bevel=0.006, grid=0)
        screens.box(0.36, 0.22, 0.004, x, 0.76, -0.1235, bevel=0, grid=0)
    keys = Part('keyboard', material('keys', 'dark', rough=0.7))
    keys.box(0.4, 0.015, 0.14, 0, 0.68, 0.08, bevel=0.003, grid=0)
    keys.box(0.06, 0.02, 0.09, 0.3, 0.68, 0.09, bevel=0.006, grid=0)
    return [body, top, monitors, screens, keys]


def _built(make):
    """Модель — объекты частей Blender, как у пилота: каждая часть собирается в каноническом порядке (`Part.build`)."""
    return lambda: [p.build() for p in make()]


MODELS = {'xray': xray, **{k: _built(f) for k, f in {'ct': ct, 'mri': mri, 'us': us, 'console': console}.items()}}
