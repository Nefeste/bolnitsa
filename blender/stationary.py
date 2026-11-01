# Модели Blender, часть 2, группа 2 «Стационар» (docs/specs/2026-11-blender-2.md): кровать и монитор пилота, доведённые до
# бюджета, тумбочка у кровати и аппарат ИВЛ — палата, бокс, ПИТ, реанимация, приёмное. Бюджет треугольников каждой —
# blender/budgets.json, размеры — blender/sizes.json (из игры).
#
# Кровать и монитор — вместо моделей кодом, в оси их места (`codes`), как модели пилота (`placeAt`); части те же, что у пилота:
# у кровати `iv` и `iv_bag` (стойка капельницы — игра ставит её только в палате и боксе, furniture.ts `skipOf`), борта
# `rail_left` и `rail_right`, `mattress`, `pillow`, `blanket`; у монитора — светящийся `screen`. Пилот: кровать — 4872
# треугольника, монитор — 1016; здесь — без сетки затенения на маленьких частях, скругление — только где его видно.
# Тумбочка — вместо Kenney `sideTableDrawers`, в размер места каталога; материалы «wood» и «woodDark», как у модели набора:
# каталог перекрашивает её в белое. Аппарат ИВЛ — вместо модели кодом, на колёсах, с экраном и шлангами к больному.
import math

from common import SIZES, Part, material

CODES = SIZES['codes']
KITS = SIZES['kits']
BED = SIZES['items']['bed']

# сетка затенения у больших плоских частей (решение агента 6): у матраса и одеяла — чтобы тень от подушки и бортов не
# растекалась на всю грань
WIDE = 0.4


def bed():
    """Функциональная кровать: изголовье к −z, длина — две клетки, верх матраса — высота постели игры (`lieTop`)."""
    top = CODES['bed']['lieTop']
    half = BED['cells'][1] * SIZES['cell'] / 2
    steel = material('steel', 'steel', rough=0.35, metal=0.6)
    wheels = Part('wheels', material('dark', 'dark', rough=0.7))
    fork = Part('casters', steel)
    for sx in (-0.38, 0.38):
        for sz in (-(half - 0.12), half - 0.12):
            wheels.cyl(0.05, 0.05, 0.04, sx - 0.02, 0.05, sz, seg=8, axis='x')
            fork.box(0.05, 0.08, 0.05, sx, 0.06, sz, bevel=0, grid=0)
    frame = Part('frame', material('steel_d', 'steel_d', rough=0.45, metal=0.4))
    frame.box(0.82, 0.06, 1.72, 0, 0.14, 0, bevel=0, grid=0)
    for sz in (-0.5, 0.5):
        frame.box(0.06, 0.16, 0.06, 0, 0.18, sz, bevel=0, grid=0)
    deck = Part('deck', steel)
    deck.box(0.92, 0.07, 1.94, 0, 0.31, 0, bevel=0.012, grid=0)
    # матрас: от деки до высоты постели, мягкие рёбра; сетка — чтобы затенение у подушки и бортов не растекалось
    mattress = Part('mattress', material('mattress', 'mattress', rough=0.9))
    mattress.box(0.88, top - 0.38, 1.88, 0, 0.38, 0, bevel=0.04, segments=2, grid=WIDE)
    board = material('board', 'board', rough=0.6)
    head = Part('headboard', board)
    head.box(0.96, 0.92, 0.05, 0, 0.14, -(half - 0.03), bevel=0.018, grid=0)
    head.box(0.7, 0.05, 0.06, 0, 0.92, -(half - 0.03), bevel=0, grid=0)
    foot = Part('footboard', board)
    foot.box(0.96, 0.74, 0.05, 0, 0.14, half - 0.03, bevel=0.018, grid=0)
    foot.box(0.7, 0.05, 0.06, 0, 0.74, half - 0.03, bevel=0, grid=0)
    pillow = Part('pillow', material('sheet', 'sheet', rough=0.95))
    pillow.box(0.6, 0.1, 0.34, 0, top - 0.01, -(half - 0.3), bevel=0.04, segments=2, grid=0)
    blanket = Part('blanket', material('blanket', 'blanket', rough=0.95))
    blanket.box(0.9, 0.06, 1.15, 0, top - 0.02, half - 0.64, bevel=0.02, grid=WIDE)
    blanket.box(0.9, 0.24, 0.04, 0, top - 0.22, half - 0.08, bevel=0.012, grid=0)
    # борта у изголовья — с обеих сторон
    rails = []
    for side, sx in (('rail_left', -0.47), ('rail_right', 0.47)):
        rail = Part(side, steel)
        rail.box(0.025, 0.025, 0.85, sx, top + 0.12, -(half - 0.55), bevel=0, grid=0)
        rail.box(0.025, 0.025, 0.85, sx, top + 0.04, -(half - 0.55), bevel=0, grid=0)
        for sz in (-(half - 0.18), -(half - 0.92)):
            rail.box(0.025, 0.16, 0.025, sx, top - 0.02, sz, bevel=0, grid=0)
        rails.append(rail)
    # стойка капельницы — сбоку у изголовья: место — из игры (furniture.ts, IV_AT)
    ix, iz = BED['iv']
    iv = Part('iv', steel)
    for k in range(5):
        a = k * 2 * math.pi / 5
        iv.box(0.03, 0.02, 0.2, ix + math.sin(a) * 0.09, 0.03, iz + math.cos(a) * 0.09, bevel=0, ry=a, grid=0)
    iv.cyl(0.012, 0.012, 1.85, ix, 0.03, iz, seg=6)
    iv.box(0.36, 0.015, 0.015, ix, 1.86, iz, bevel=0, grid=0)
    bag = Part('iv_bag', material('bag', 'bag', rough=0.3))
    bag.box(0.09, 0.16, 0.04, ix + 0.14, 1.66, iz, bevel=0.012, grid=0)
    return [wheels, fork, frame, deck, mattress, head, foot, pillow, blanket, *rails, iv, bag]


def monitor():
    """
    Монитор с дефибриллятором на стойке у изголовья: пять ножек на колёсах, полка с дефибриллятором, корпус, светящийся
    экран; верх корпуса — на высоте модели кодом (1,58 м).
    """
    steel = material('steel', 'steel', rough=0.35, metal=0.6)
    base = Part('base', material('steel_d', 'steel_d', rough=0.45, metal=0.4))
    wheels = Part('wheels', material('dark', 'dark', rough=0.7))
    for k in range(5):
        a = k * 2 * math.pi / 5
        base.box(0.035, 0.025, 0.18, math.sin(a) * 0.09, 0.05, math.cos(a) * 0.09, bevel=0, ry=a, grid=0)
        wheels.cyl(0.025, 0.025, 0.02, math.sin(a) * 0.175 - 0.01, 0.025, math.cos(a) * 0.175, seg=6, axis='x')
    stand = Part('stand', steel)
    stand.cyl(0.03, 0.03, 0.06, 0, 0.05, 0, seg=8)
    stand.cyl(0.02, 0.02, 1.2, 0, 0.08, 0, seg=8)
    shelf = Part('shelf', steel)
    shelf.box(0.36, 0.04, 0.28, 0, 0.9, 0.02, bevel=0.008, grid=0)
    defib = Part('defib', material('defib', 'defib', rough=0.5))
    defib.box(0.32, 0.12, 0.22, 0, 0.94, 0.02, bevel=0.02, segments=2, grid=0)
    defib.box(0.18, 0.03, 0.03, 0, 1.06, -0.04, bevel=0, grid=0)
    body = Part('body', material('dark', 'dark', rough=0.7))
    body.box(0.4, 0.3, 0.08, 0, 1.28, 0.02, bevel=0.02, segments=2, grid=0)
    body.box(0.1, 0.06, 0.06, 0, 1.24, -0.02, bevel=0, grid=0)
    # экран — материал «screen»: в игре светится (furniture.ts, `place`)
    screen = Part('screen', material('screen', 'screen', rough=0.2))
    screen.box(0.34, 0.24, 0.01, 0, 1.31, 0.062, bevel=0, grid=0)
    return [base, wheels, stand, shelf, defib, body, screen]


def bedside():
    """Тумбочка у кровати: корпус, столешница, ящик и дверца к кровати (+z), ручки, цоколь; белая — перекраска каталога."""
    f = KITS['bedside']['fits'][0]
    w, d, h = f['w'], f['d'], f['h']
    front = d / 2 - 0.02
    body = Part('body', material('wood', '#f3cca8', rough=0.6))
    body.box(w - 0.02, h - 0.03, d - 0.04, 0, 0, -0.02, bevel=0.008, grid=0)
    top = Part('top', material('wood', '#f3cca8', rough=0.6))
    top.box(w, 0.03, d, 0, h - 0.03, 0, bevel=0.008, grid=0)
    fronts = Part('drawer', material('woodDark', '#d7b495', rough=0.55))
    fronts.box(w - 0.06, 0.13, 0.016, 0, h - 0.19, front, bevel=0.004, grid=0)
    door = Part('door', material('woodDark', '#d7b495', rough=0.55))
    door.box(w - 0.06, h - 0.31, 0.016, 0, 0.08, front, bevel=0.004, grid=0)
    pulls = Part('pulls', material('metal', '#dfeaec', rough=0.3, metal=0.6))
    pulls.box(0.12, 0.015, 0.02, 0, h - 0.13, front + 0.018, bevel=0, grid=0)
    pulls.box(0.015, 0.1, 0.02, w / 2 - 0.08, h / 2 - 0.1, front + 0.018, bevel=0, grid=0)
    plinth = Part('plinth', material('woodDark', '#d7b495', rough=0.55))
    plinth.box(w - 0.06, 0.06, 0.02, 0, 0.01, front - 0.01, bevel=0, grid=0)
    return [body, top, fronts, door, pulls, plinth]


def ventilator():
    """
    Аппарат ИВЛ на тележке, в габарите модели кодом: четыре колеса, основание, стойка, корпус с увлажнителем и ручками, над
    корпусом — светящийся экран к больному (+z), дыхательный контур — два шланга на держателе.
    """
    steel = material('steel', 'steel', rough=0.35, metal=0.6)
    wheels = Part('wheels', material('dark', 'dark', rough=0.7))
    for sx in (-0.18, 0.18):
        for sz in (-0.18, 0.18):
            wheels.cyl(0.05, 0.05, 0.04, sx - 0.02, 0.05, sz, seg=8, axis='x')
    base = Part('base', material('steel_d', 'steel_d', rough=0.45, metal=0.4))
    base.box(0.4, 0.05, 0.4, 0, 0.05, 0, bevel=0.012, grid=0)
    pole = Part('stand', steel)
    pole.cyl(0.025, 0.025, 0.85, 0, 0.1, 0, seg=8)
    body = Part('body', material('white', 'white', rough=0.45))
    body.box(0.42, 0.32, 0.3, 0, 0.95, 0, bevel=0.03, segments=2, grid=0)
    # ручки по бокам корпуса
    for sx in (-0.2, 0.2):
        body.box(0.02, 0.2, 0.025, sx, 1.0, -0.13, bevel=0, grid=0)
    # экран над корпусом: шейка, рамка и стекло — к больному
    bezel = Part('bezel', material('dark', 'dark', rough=0.6))
    bezel.box(0.06, 0.04, 0.04, 0, 1.27, 0.02, bevel=0, grid=0)
    bezel.box(0.34, 0.24, 0.03, 0, 1.3, 0.05, bevel=0.01, rx=0.15, grid=0)
    screen = Part('screen', material('screen', 'screen', rough=0.2))
    screen.box(0.3, 0.2, 0.006, 0, 1.32, 0.068, bevel=0, rx=0.15, grid=0)
    # увлажнитель — прозрачная колба сбоку под корпусом
    humid = Part('humidifier', material('bag', 'bag', rough=0.3))
    humid.cyl(0.045, 0.045, 0.14, 0.17, 0.79, 0.05, seg=10)
    knobs = Part('knobs', material('slate', 'slate', rough=0.5))
    for x in (-0.12, 0.0, 0.12):
        knobs.cyl(0.018, 0.018, 0.02, x, 1.05, 0.15, seg=8, axis='z')
    # дыхательный контур: держатель и два шланга к больному (концы — там же, где у модели кодом, около 0,5 м от середины)
    arm = Part('arm', steel)
    arm.box(0.025, 0.025, 0.3, 0.17, 1.12, 0.32, bevel=0, grid=0)
    arm.box(0.025, 0.22, 0.025, 0.17, 0.9, 0.47, bevel=0, grid=0)
    hoses = Part('hoses', material('hose', '#d8e6ea', rough=0.5))
    for x in (0.1, 0.17):
        hoses.cyl(0.02, 0.02, 0.33, x, 0.98, 0.15, seg=6, axis='z')
    return [wheels, base, pole, body, bezel, screen, humid, knobs, arm, hoses]


def _built(make):
    """Модель — объекты частей Blender, как у пилота: каждая часть собирается в каноническом порядке (`Part.build`)."""
    return lambda: [p.build() for p in make()]


MODELS = {k: _built(f) for k, f in {'bed': bed, 'monitor': monitor, 'bedside': bedside, 'ventilator': ventilator}.items()}
