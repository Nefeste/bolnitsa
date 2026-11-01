# Модели Blender, часть 2, группа 4 «Операционная и эндоскопия» (docs/specs/2026-11-blender-2.md): операционный стол с лампой,
# наркозный аппарат, инструментальный столик и эндоскопическая стойка. Бюджет треугольников — blender/budgets.json, размеры —
# blender/sizes.json (из игры).
#
# Все — вместо моделей кодом, в оси их места (`codes`), как модели групп 2 и 3 (`placeAt`); габарит — как у модели кодом. Верх
# ложа операционного стола — высота постели игры (`lieTop`): на неё игра кладёт пациента. Части — для механик (спецификация,
# «Части — для механик»): `screen` светится; у стола — `table`, `pad` и `lamp`, у наркозного аппарата — `bellows`, у стойки —
# `scope`.
from common import SIZES, Part, material

CODES = SIZES['codes']

# сетка затенения у больших плоских частей (решение агента 6)
WIDE = 0.4


def or_table():
    """
    Операционный стол: тяжёлое основание, колонна, ложе из четырёх секций (голова к −z), мягкий верх, боковые шины; лампа —
    на стойке у ног (+x, +z), плечо над столом, купол светом вниз — над серединой ложа.
    """
    top = CODES['or_table']['lieTop']
    steel = material('steel', 'steel', rough=0.35, metal=0.6)
    base = Part('base', material('steel_d', 'steel_d', rough=0.45, metal=0.4))
    base.box(0.55, 0.08, 0.8, 0, 0, 0, bevel=0.03, grid=0)
    base.box(0.16, 0.04, 0.1, 0.18, 0.0, 0.44, bevel=0.01, grid=0)
    column = Part('column', steel)
    column.box(0.3, 0.42, 0.36, 0, 0.08, 0, bevel=0.03, grid=0)
    column.box(0.24, top - 0.08 - 0.5 - 0.06, 0.3, 0, 0.5, 0, bevel=0.02, grid=0)
    # ложе: голова, спина, сиденье, ноги — с зазорами, как у настоящего стола
    table = Part('table', material('or_deck', '#3f7f7a', rough=0.45))
    for z0, z1 in ((-0.975, -0.66), (-0.64, 0.06), (0.08, 0.46), (0.48, 0.975)):
        table.box(0.56, 0.06, z1 - z0, 0, top - 0.08, (z0 + z1) / 2, bevel=0.012, grid=0)
    pad = Part('pad', material('or_pad', '#5aa39b', rough=0.8))
    pad.box(0.52, 0.04, 1.9, 0, top - 0.02, 0, bevel=0.015, grid=WIDE)
    rails = Part('rails', steel)
    for sx in (-0.29, 0.29):
        rails.box(0.02, 0.025, 1.7, sx, top - 0.07, 0, bevel=0, grid=0)
    # лампа: стойка у ног, плечо, купол над серединой ложа
    pole = Part('lamp_stand', steel)
    pole.cyl(0.08, 0.08, 0.03, 0.62, 0, 0.75, seg=16)
    pole.cyl(0.035, 0.035, 2.22, 0.62, 0.03, 0.75, seg=12)
    pole.box(0.62, 0.05, 0.05, 0.31, 2.18, 0.75, bevel=0.01, grid=0)
    pole.box(0.05, 0.05, 0.75, 0.0, 2.18, 0.375, bevel=0.01, grid=0)
    pole.cyl(0.02, 0.02, 0.06, 0, 2.12, 0, seg=8)
    lamp = Part('lamp', material('lamp', 'white', rough=0.35))
    lamp.cyl(0.35, 0.26, 0.12, 0, 2.02, 0, seg=24)
    lamp.cyl(0.04, 0.04, 0.08, 0, 1.95, 0, seg=8)
    light = Part('lamp_light', material('lamp_light', '#fff8d8', rough=0.2))
    light.cyl(0.29, 0.29, 0.012, 0, 2.008, 0, seg=24)
    return [base, column, table, pad, rails, pole, lamp, light]


def anesthesia():
    """
    Наркозный аппарат на колёсах: корпус с ящиками к анестезиологу (+z), рабочая поверхность, испаритель и ротаметры, мех в
    прозрачной колбе, баллоны сзади, монитор на мачте — экраном к анестезиологу, шланги дыхательного контура сбоку.
    """
    wheels = Part('wheels', material('dark', 'dark', rough=0.7))
    for sx in (-0.25, 0.25):
        for sz in (-0.2, 0.2):
            wheels.cyl(0.05, 0.05, 0.035, sx - 0.0175, 0.05, sz, seg=8, axis='x')
    body = Part('body', material('body', '#e7ecec', rough=0.45))
    body.box(0.6, 0.88, 0.5, 0, 0.1, -0.05, bevel=0.03, segments=2, grid=WIDE)
    drawers = Part('drawers', material('panel', 'panel', rough=0.5))
    for y in (0.16, 0.42, 0.68):
        drawers.box(0.52, 0.22, 0.012, 0, y, 0.2, bevel=0.006, grid=0)
        drawers.box(0.16, 0.025, 0.02, 0, y + 0.16, 0.214, bevel=0.005, grid=0)
    work = Part('top', material('top', '#c9d0d2', rough=0.5))
    work.box(0.62, 0.04, 0.52, 0, 0.98, -0.04, bevel=0.01, grid=0)
    # испаритель и ротаметры — на поверхности слева
    vapor = Part('vaporizer', material('vapor', '#e2c044', rough=0.4))
    vapor.box(0.1, 0.16, 0.12, -0.2, 1.02, 0.02, bevel=0.012, grid=0)
    flow = Part('flowmeter', material('lens', 'lens', rough=0.2))
    flow.box(0.16, 0.2, 0.04, -0.17, 1.02, -0.17, bevel=0.006, grid=0)
    # мех в колбе
    bellows = Part('bellows', material('bag', 'bag', rough=0.15))
    bellows.cyl(0.075, 0.075, 0.24, 0.18, 1.02, 0.04, seg=16)
    inner = Part('bellows_inner', material('blanket', 'blanket', rough=0.6))
    inner.cyl(0.055, 0.06, 0.16, 0.18, 1.03, 0.04, seg=12)
    # баллоны сзади
    gas = Part('gas', material('gas_o2', '#5a7fbf', rough=0.4, metal=0.2))
    gas.cyl(0.06, 0.06, 0.55, -0.08, 0.06, -0.32, seg=12)
    gas.cyl(0.06, 0.03, 0.06, -0.08, 0.61, -0.32, seg=12)
    gas2 = Part('gas_n2o', material('gas_n2o', '#4f8a5a', rough=0.4, metal=0.2))
    gas2.cyl(0.06, 0.06, 0.55, -0.22, 0.06, -0.32, seg=12)
    gas2.cyl(0.06, 0.03, 0.06, -0.22, 0.61, -0.32, seg=12)
    hoses = Part('hoses', material('hose', '#d8e6ea', rough=0.6))
    for dz in (0.06, 0.14):
        hoses.cyl(0.02, 0.02, 0.5, 0.29, 0.5, dz, seg=8)
    # мачта и монитор
    mast = Part('mast', material('steel', 'steel', rough=0.35, metal=0.6))
    mast.box(0.05, 0.24, 0.05, 0, 1.02, -0.24, bevel=0, grid=0)
    monitor = Part('monitor', material('dark', 'dark', rough=0.6))
    monitor.box(0.44, 0.3, 0.05, 0, 1.25, -0.22, bevel=0.012, grid=0)
    screen = Part('screen', material('screen', 'screen', rough=0.2))
    screen.box(0.4, 0.26, 0.006, 0, 1.27, -0.192, bevel=0, grid=0)
    return [wheels, body, drawers, work, vapor, flow, bellows, inner, gas, gas2, hoses, mast, monitor, screen]


def instrument_table():
    """Инструментальный столик на колёсах: стальной верх, полка снизу, на верху — стерильная салфетка, инструменты и чаша."""
    steel = material('steel', 'steel', rough=0.3, metal=0.7)
    wheels = Part('wheels', material('dark', 'dark', rough=0.7))
    frame = Part('frame', steel)
    for sx in (-0.3, 0.3):
        for sz in (-0.2, 0.2):
            wheels.cyl(0.035, 0.035, 0.025, sx - 0.0125, 0.035, sz, seg=8, axis='x')
            frame.box(0.025, 0.82, 0.025, sx, 0.06, sz, bevel=0, grid=0)
    shelf = Part('shelf', material('steel_d', 'steel_d', rough=0.4, metal=0.5))
    shelf.box(0.66, 0.02, 0.44, 0, 0.35, 0, bevel=0.005, grid=0)
    top = Part('top', steel)
    top.box(0.68, 0.03, 0.46, 0, 0.88, 0, bevel=0.01, grid=0)
    drape = Part('tray', material('drape', '#2f6f8f', rough=0.85))
    drape.box(0.5, 0.012, 0.34, -0.02, 0.91, 0, bevel=0.004, grid=0)
    tools = Part('instruments', material('instruments', '#dde3e6', rough=0.25, metal=0.8))
    for i in range(5):
        tools.box(0.016, 0.008, 0.18, -0.2 + i * 0.06, 0.922, -0.04, bevel=0, grid=0)
    tools.cyl(0.055, 0.045, 0.03, 0.2, 0.91, 0.08, seg=12)
    return [wheels, frame, shelf, top, drape, tools]


def endoscope():
    """
    Эндоскопическая стойка: тележка на колёсах, три блока (источник света, процессор, отсос), монитор на мачте — экраном к
    врачу (+z); эндоскоп на шнуре от источника света, рукоятка и вводимая трубка — сбоку, к кушетке.
    """
    wheels = Part('wheels', material('dark', 'dark', rough=0.7))
    for sx in (-0.22, 0.22):
        for sz in (-0.2, 0.2):
            wheels.cyl(0.04, 0.04, 0.03, sx - 0.015, 0.04, sz, seg=8, axis='x')
    cart = Part('cart', material('steel_d', 'steel_d', rough=0.45, metal=0.4))
    cart.box(0.5, 0.04, 0.45, 0, 0.08, 0, bevel=0.01, grid=0)
    for sx in (-0.23, 0.23):
        cart.box(0.035, 0.95, 0.035, sx, 0.12, -0.19, bevel=0, grid=0)
    cart.box(0.5, 0.02, 0.45, 0, 1.0, 0, bevel=0.005, grid=0)
    units = Part('units', material('body', '#e7ecec', rough=0.45))
    units.box(0.44, 0.22, 0.38, 0, 0.13, 0, bevel=0.01, grid=0)
    units.box(0.44, 0.22, 0.38, 0, 0.73, 0, bevel=0.01, grid=0)
    proc = Part('processor', material('dark', 'dark', rough=0.6))
    proc.box(0.44, 0.24, 0.38, 0, 0.43, 0, bevel=0.01, grid=0)
    panel = Part('panel', material('teal', 'teal', rough=0.4))
    for y in (0.21, 0.52, 0.81):
        panel.box(0.3, 0.03, 0.01, -0.05, y, 0.192, bevel=0, grid=0)
    mast = Part('mast', material('steel', 'steel', rough=0.35, metal=0.6))
    mast.box(0.05, 0.1, 0.05, 0, 1.02, -0.1, bevel=0, grid=0)
    monitor = Part('monitor', material('dark', 'dark', rough=0.6))
    monitor.box(0.5, 0.36, 0.06, 0, 1.25, -0.08, bevel=0.012, grid=0)
    screen = Part('screen', material('screen', 'screen', rough=0.2))
    screen.box(0.46, 0.32, 0.006, 0, 1.27, -0.047, bevel=0, grid=0)
    # шнур от источника света вверх и к врачу, на нём рукоятка; вводимая трубка свисает
    scope = Part('scope', material('scope', '#222222', rough=0.5))
    scope.box(0.024, 0.7, 0.024, 0.22, 0.922, 0.287, bevel=0.008, rx=0.4, grid=0)
    scope.cyl(0.024, 0.02, 0.12, 0.22, 1.5, 0.41, seg=10)
    scope.cyl(0.009, 0.009, 0.62, 0.22, 0.86, 0.41, seg=8)
    return [wheels, cart, units, proc, panel, mast, monitor, screen, scope]


def _built(make):
    """Модель — объекты частей Blender, как у групп 2 и 3: каждая часть собирается в каноническом порядке (`Part.build`)."""
    return lambda: [p.build() for p in make()]


MODELS = {k: _built(f) for k, f in {'or_table': or_table, 'anesthesia': anesthesia, 'instrument_table': instrument_table, 'endoscope': endoscope}.items()}
