# Модели пилота (docs/reports/2026-11-blender-pilot.md): кровать, монитор у кровати, рентген-аппарат — те же места, что у
# моделей кодом в src/render/furniture.ts (габарит, высота постели, капельница — из blender/sizes.json), но с
# закруглёнными рёбрами, подробностями и затенением, запечённым в цвет вершин.
#
# Каждая часть — свой объект; имя объекта — имя узла в .glb и идентификатор части для игры. Игра уже читает два:
# «screen» (материал экрана светится, furniture.ts) и «iv» (стойка капельницы — только у кровати палаты и бокса);
# остальные — для механик, которых пока нет: подвижная трубка рентгена «tube», борта «rail_left» и «rail_right».
import math

from common import SIZES, Part, material

BED = SIZES['items']['bed']
MONITOR = SIZES['items']['monitor']
XRAY = SIZES['items']['xray']


def bed():
    """Функциональная кровать: изголовье к −z, длина — две клетки, верх матраса — высота постели игры."""
    top = BED['lieTop']
    half = BED['cells'][1] * SIZES['cell'] / 2
    steel = material('steel', 'steel', rough=0.35, metal=0.6)
    parts = []
    wheels = Part('wheels', material('dark', 'dark', rough=0.7))
    fork = Part('casters', steel)
    for sx in (-0.38, 0.38):
        for sz in (-(half - 0.12), half - 0.12):
            wheels.cyl(0.05, 0.05, 0.04, sx - 0.02, 0.05, sz, seg=10, axis='x')
            fork.box(0.05, 0.08, 0.05, sx, 0.06, sz, bevel=0.008)
    parts += [wheels, fork]
    frame = Part('frame', material('steel_d', 'steel_d', rough=0.45, metal=0.4))
    frame.box(0.82, 0.06, 1.72, 0, 0.14, 0, bevel=0.015)
    for sz in (-0.5, 0.5):
        frame.box(0.06, 0.16, 0.06, 0, 0.18, sz, bevel=0.01)
    parts.append(frame)
    deck = Part('deck', steel)
    deck.box(0.92, 0.07, 1.94, 0, 0.31, 0, bevel=0.02)
    parts.append(deck)
    # матрас: от деки до высоты постели, мягкие рёбра
    mattress = Part('mattress', material('mattress', 'mattress', rough=0.9))
    mattress.box(0.88, top - 0.38, 1.88, 0, 0.38, 0, bevel=0.045, segments=3)
    parts.append(mattress)
    board = material('board', 'board', rough=0.6)
    head = Part('headboard', board)
    head.box(0.96, 0.92, 0.05, 0, 0.14, -(half - 0.03), bevel=0.02, segments=3)
    head.box(0.7, 0.05, 0.06, 0, 0.92, -(half - 0.03), bevel=0.02)
    foot = Part('footboard', board)
    foot.box(0.96, 0.74, 0.05, 0, 0.14, half - 0.03, bevel=0.02, segments=3)
    foot.box(0.7, 0.05, 0.06, 0, 0.74, half - 0.03, bevel=0.02)
    parts += [head, foot]
    pillow = Part('pillow', material('sheet', 'sheet', rough=0.95))
    pillow.box(0.6, 0.1, 0.34, 0, top - 0.01, -(half - 0.3), bevel=0.04, segments=3)
    parts.append(pillow)
    blanket = Part('blanket', material('blanket', 'blanket', rough=0.95))
    blanket.box(0.9, 0.06, 1.15, 0, top - 0.02, half - 0.64, bevel=0.025, segments=2)
    blanket.box(0.9, 0.24, 0.04, 0, top - 0.22, half - 0.08, bevel=0.015)
    parts.append(blanket)
    # борта у изголовья — с обеих сторон
    for side, sx in (('rail_left', -0.47), ('rail_right', 0.47)):
        rail = Part(side, steel)
        rail.box(0.025, 0.025, 0.85, sx, top + 0.12, -(half - 0.55), bevel=0.008)
        rail.box(0.025, 0.025, 0.85, sx, top + 0.04, -(half - 0.55), bevel=0.008)
        for sz in (-(half - 0.18), -(half - 0.92)):
            rail.box(0.025, 0.16, 0.025, sx, top - 0.02, sz, bevel=0.008)
        parts.append(rail)
    # капельница — сбоку у изголовья: место — из игры (furniture.ts, IV_AT)
    ix, iz = BED['iv']
    iv = Part('iv', steel)
    for k in range(5):
        a = k * 2 * math.pi / 5
        iv.box(0.03, 0.02, 0.2, ix + math.sin(a) * 0.09, 0.03, iz + math.cos(a) * 0.09, bevel=0.005)
    iv.cyl(0.012, 0.012, 1.85, ix, 0.03, iz, seg=10)
    iv.box(0.36, 0.015, 0.015, ix, 1.86, iz, bevel=0.005)
    bag = Part('iv_bag', material('bag', 'bag', rough=0.3))
    bag.box(0.09, 0.16, 0.04, ix + 0.14, 1.66, iz, bevel=0.015)
    parts += [iv, bag]
    return [p.build() for p in parts]


def monitor():
    """Монитор с дефибриллятором на стойке у изголовья: пять ножек на колёсах, полка, корпус, светящийся экран."""
    steel = material('steel', 'steel', rough=0.35, metal=0.6)
    base = Part('base', material('steel_d', 'steel_d', rough=0.45, metal=0.4))
    wheels = Part('wheels', material('dark', 'dark', rough=0.7))
    for k in range(5):
        a = k * 2 * math.pi / 5
        base.box(0.035, 0.025, 0.2, math.sin(a) * 0.1, 0.05, math.cos(a) * 0.1, bevel=0.008)
        wheels.cyl(0.025, 0.025, 0.02, math.sin(a) * 0.18 - 0.01, 0.025, math.cos(a) * 0.18, seg=8, axis='x')
    stand = Part('stand', steel)
    stand.cyl(0.03, 0.03, 0.06, 0, 0.05, 0, seg=12)
    stand.cyl(0.02, 0.02, 1.2, 0, 0.08, 0, seg=12)
    shelf = Part('shelf', steel)
    shelf.box(0.36, 0.04, 0.28, 0, 0.9, 0.02, bevel=0.01)
    defib = Part('defib', material('defib', 'defib', rough=0.5))
    defib.box(0.32, 0.12, 0.22, 0, 0.94, 0.02, bevel=0.02, segments=2)
    defib.box(0.18, 0.03, 0.03, 0, 1.06, -0.04, bevel=0.01)
    body = Part('body', material('dark', 'dark', rough=0.7))
    body.box(0.4, 0.3, 0.08, 0, 1.24, 0.02, bevel=0.02, segments=2)
    body.box(0.1, 0.06, 0.06, 0, 1.2, -0.02, bevel=0.01)
    # экран — материал «screen»: в игре светится (furniture.ts, `place`)
    screen = Part('screen', material('screen', 'screen', rough=0.2))
    screen.box(0.34, 0.24, 0.01, 0, 1.27, 0.062, bevel=0.003, segments=1)
    return [p.build() for p in (base, wheels, stand, shelf, defib, body, screen)]


def xray():
    """Рентген: стол пациента вдоль z (верх — высота постели игры), колонна с плечом и трубкой сбоку, стойка у изголовья."""
    top = XRAY['lieTop']
    half = XRAY['cells'][1] * SIZES['cell'] / 2
    white = material('white', 'white', rough=0.45)
    panel = material('panel', 'panel', rough=0.5)
    table = Part('table', panel)
    table.box(0.5, top - 0.1, 0.6, 0, 0.02, 0, bevel=0.03, segments=2)
    table.box(0.64, 0.04, 0.8, 0, 0, 0, bevel=0.015)
    table.box(0.82, 0.08, 2.0, 0, top - 0.08, 0, bevel=0.025, segments=2)
    pad = Part('pad', material('pad', 'pad', rough=0.85))
    pad.box(0.72, 0.03, 1.7, 0, top - 0.005, 0.1, bevel=0.012, segments=2)
    column = Part('column', white)
    column.box(0.22, 2.16, 0.22, -0.7, 0.04, 0.1, bevel=0.03, segments=2)
    # опорная плита — не шире габарита модели кодом (blender/sizes.json, «code»): колонна стоит в своём месте
    column.box(0.3, 0.04, 0.3, -0.7, 0, 0.1, bevel=0.01)
    # пульт на колонне
    column.box(0.02, 0.18, 0.14, -0.58, 1.1, 0.1, bevel=0.005)
    arm = Part('arm', white)
    arm.box(0.8, 0.16, 0.18, -0.35, 1.9, 0.1, bevel=0.03)
    # трубка — подвижная часть: ездит по плечу (механики пока нет)
    tube = Part('tube', material('head', 'head', rough=0.4))
    tube.box(0.38, 0.3, 0.38, 0, 1.62, 0.1, bevel=0.04, segments=3)
    tube.cyl(0.07, 0.07, 0.42, -0.19, 1.71, 0.1, seg=16, axis='x')
    collimator = Part('collimator', material('dark', 'dark', rough=0.6))
    collimator.cyl(0.13, 0.17, 0.12, 0, 1.5, 0.1, seg=20)
    detector = Part('detector', panel)
    detector.box(0.62, 1.45, 0.12, 0, 0.35, -(half - 0.0), bevel=0.03, segments=2)
    detector.box(0.18, 0.35, 0.1, 0, 0, -(half - 0.0), bevel=0.02)
    detector.box(0.5, 0.03, 0.3, 0, 0, -(half - 0.06), bevel=0.01)
    plate = Part('plate', material('teal', 'teal', rough=0.4))
    plate.box(0.5, 0.5, 0.01, 0, 0.9, -(half - 0.065), bevel=0.003, segments=1)
    return [p.build() for p in (table, pad, column, arm, tube, collimator, detector, plate)]


MODELS = {'bed': bed, 'monitor': monitor, 'xray': xray}
