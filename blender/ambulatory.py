# Модели Blender, часть 2, группа 1 «Амбулатория» (docs/specs/2026-11-blender-2.md): мебель и аппараты помещений сценария 1
# — регистратура, ожидание, кабинет врача, сортировка, процедурная, лаборатория, ЭКГ, санузел, ординаторская, скамьи в
# коридоре. Бюджет треугольников каждой — blender/budgets.json, размеры — blender/sizes.json (из игры).
#
# Два вида моделей:
# - вместо модели набора (Kenney, KayKit) — в размер места из каталога окна (`kits`): игра ставит её тем же `place`, что
#   модель набора, — вписывает в место, сажает на сиденье, прижимает к стене. Материалы названы так же, как у модели набора
#   («wood», «carpet», …): перекраски каталога (белая мебель, обивка стульев) ложатся на них по имени;
# - вместо модели кодом — в оси её места (`codes`): игра ставит её `placeAt`, как модели пилота; габарит — модели кодом.
#
# Части — по имени узла .glb, для механик (спецификация, «Части — для механик»): `screen` светится, `seat` — сиденье, `paper`
# — лист на кушетке, `door` — дверцы и дверь кабинки, `tap` — кран, `tray` — лоток, `microscope` и `rack` — то, что стоит на
# лабораторном столе (игра ставит одно из двух).
import math

from common import SIZES, Part, material

KITS = SIZES['kits']
CODES = SIZES['codes']
SEAT = KITS['office_chair']['seat']

# сетка затенения у больших плоских частей: крупнее, чем у пилота (0,2 м), — иначе бюджет не сходится (решение агента 6)
WIDE = 0.4


def fit(name):
    """Место модели из каталога: ширина, глубина, высота (0 — по сиденью)."""
    f = KITS[name]['fits'][0]
    return f['w'], f['d'], f['h']


def legs(part, w, d, h, t=0.035, inset=0.03, y=0.0):
    """Четыре ножки t×t высоты h по углам прямоугольника w×d (середина — 0), отступ от края `inset`."""
    for sx in (-1, 1):
        for sz in (-1, 1):
            part.box(t, h, t, sx * (w / 2 - inset - t / 2), y, sz * (d / 2 - inset - t / 2), bevel=0, grid=0)


def handle(part, x, y, z, h=0.12, along='y'):
    """Ручка дверцы: тонкая планка на лицевой стороне (перёд — +z)."""
    if along == 'y':
        part.box(0.015, h, 0.02, x, y, z + 0.01, bevel=0, grid=0)
    else:
        part.box(h, 0.015, 0.02, x, y, z + 0.01, bevel=0, grid=0)


def monitor_on(parts, x, y, z, face=1, w=0.5):
    """
    Монитор на столе: подставка, ножка, корпус и светящийся экран — к сидящему, клавиатура — перед экраном. Сидящий за столом —
    на +z стола (стол повёрнут к нему, src/render/layout.ts), поэтому `face` — +1.
    """
    body = Part('monitor', material('dark', 'dark', rough=0.6))
    body.box(0.18, 0.012, 0.14, x, y, z, bevel=0.004, grid=0)
    body.box(0.04, 0.12, 0.03, x, y + 0.012, z - face * 0.02, bevel=0, grid=0)
    body.box(w, 0.31, 0.035, x, y + 0.1, z, bevel=0.008, grid=0)
    screen = Part('screen', material('screen', 'screen', rough=0.2))
    screen.box(w - 0.04, 0.27, 0.005, x, y + 0.12, z + face * 0.0195, bevel=0, grid=0)
    keys = Part('keyboard', material('keys', 'dark', rough=0.7))
    keys.box(0.42, 0.018, 0.14, x, y, z + face * 0.2, bevel=0.004, grid=0)
    parts += [body, screen, keys]


# ---------------------------------------------------------------- мебель вместо моделей наборов


def desk():
    """Стол врача: столешница, ножки, тумба с ящиками к сидящему (+z), царга к посетителю (−z); монитор и клавиатура."""
    w, d, h = fit('desk')
    wood = material('wood', '#f3cca8', rough=0.6)
    top = Part('top', wood)
    top.box(w, 0.03, d, 0, h - 0.03, 0, bevel=0.008, grid=WIDE)
    frame = Part('legs', material('metal', '#dfeaec', rough=0.35, metal=0.5))
    legs(frame, w, d, h - 0.03, t=0.035, inset=0.03)
    panel = Part('panel', material('woodDark', '#d7b495', rough=0.6))
    panel.box(w - 0.14, 0.32, 0.016, 0, h - 0.36, -(d / 2 - 0.06), bevel=0.004, grid=0)
    drawers = Part('drawers', material('woodDark', '#d7b495', rough=0.6))
    drawers.box(0.36, h - 0.13, d - 0.12, w / 2 - 0.25, 0.08, 0.02, bevel=0.008, grid=0)
    pull = Part('pulls', material('metal', '#dfeaec', rough=0.35, metal=0.5))
    face = 0.02 + (d - 0.12) / 2
    for y in (0.22, 0.38, 0.52):
        pull.box(0.12, 0.012, 0.012, w / 2 - 0.25, y, face + 0.006, bevel=0, grid=0)
    parts = [top, frame, panel, drawers, pull]
    monitor_on(parts, 0, h, -0.08)
    return parts


def office_chair():
    """Кресло на колёсах: пять лучей, газлифт, сиденье на высоте SEAT, спинка; обивка — «carpet» (перекраска каталога)."""
    w, d, _ = fit('office_chair')
    r = min(w, d) / 2 - 0.03
    base = Part('base', material('metalMedium', '#3a4449', rough=0.5, metal=0.3))
    wheels = Part('wheels', material('dark', 'dark', rough=0.7))
    for k in range(5):
        a = k * 2 * math.pi / 5
        base.box(0.045, 0.03, r, math.sin(a) * r / 2, 0.05, math.cos(a) * r / 2, bevel=0, ry=a, grid=0)
        wheels.cyl(0.028, 0.028, 0.035, math.sin(a) * r - 0.0175, 0.03, math.cos(a) * r, seg=6, axis='x')
    lift = Part('lift', material('metal', '#dfeaec', rough=0.3, metal=0.6))
    lift.cyl(0.03, 0.03, 0.06, 0, 0.05, 0, seg=8)
    lift.cyl(0.02, 0.02, SEAT - 0.18, 0, 0.11, 0, seg=8)
    seat = Part('seat', material('carpet', '#4d6a73', rough=0.9))
    seat.box(0.48, 0.07, 0.46, 0, SEAT - 0.07, 0.01, bevel=0.025, grid=0)
    back = Part('back', material('carpetDarker', '#3e5860', rough=0.9))
    back.box(0.44, 0.4, 0.06, 0, SEAT + 0.08, -(d / 2 - 0.08), bevel=0.025, rx=-0.08, grid=0)
    stem = Part('stem', material('metalMedium', '#3a4449', rough=0.5, metal=0.3))
    stem.box(0.05, 0.16, 0.03, 0, SEAT - 0.05, -(d / 2 - 0.11), bevel=0, grid=0)
    return [base, wheels, lift, seat, back, stem]


def waiting_chair():
    """Стул зала ожидания: металлическая рама, мягкое сиденье и спинка («carpet», «carpetDarker» — обивка зала)."""
    w, d, _ = fit('waiting_chair')
    metal = material('metal', '#dfeaec', rough=0.35, metal=0.5)
    frame = Part('frame', metal)
    legs(frame, w - 0.04, d - 0.06, SEAT - 0.06, t=0.025, inset=0.0)
    for sx in (-1, 1):
        frame.box(0.025, 0.025, d - 0.06, sx * (w / 2 - 0.0325), SEAT - 0.085, 0, bevel=0, grid=0)
        frame.box(0.025, 0.36, 0.025, sx * (w / 2 - 0.0325), SEAT - 0.06, -(d / 2 - 0.0425), bevel=0, grid=0)
    seat = Part('seat', material('carpet', '#5f8f8a', rough=0.9))
    seat.box(w - 0.06, 0.06, d - 0.08, 0, SEAT - 0.06, 0.01, bevel=0.02, grid=0)
    back = Part('back', material('carpetDarker', '#4f7b76', rough=0.9))
    back.box(w - 0.08, 0.3, 0.045, 0, SEAT + 0.04, -(d / 2 - 0.05), bevel=0.018, rx=-0.1, grid=0)
    return [frame, seat, back]


def chair():
    """Простой стул: ножки, сиденье, спинка; белый в больнице («wood», «woodDark» — перекраска каталога)."""
    w, d, _ = fit('chair')
    frame = Part('frame', material('woodDark', '#d7b495', rough=0.6))
    legs(frame, w - 0.06, d - 0.06, SEAT - 0.035, t=0.03, inset=0.0)
    for sx in (-1, 1):
        frame.box(0.03, 0.42, 0.03, sx * (w / 2 - 0.045), SEAT - 0.035, -(d / 2 - 0.045), bevel=0, grid=0)
    seat = Part('seat', material('wood', '#f3cca8', rough=0.6))
    seat.box(w - 0.04, 0.035, d - 0.04, 0, SEAT - 0.035, 0, bevel=0.008, grid=0)
    back = Part('back', material('wood', '#f3cca8', rough=0.6))
    back.box(w - 0.08, 0.16, 0.025, 0, SEAT + 0.22, -(d / 2 - 0.045), bevel=0.006, grid=0)
    return [frame, seat, back]


def bench():
    """Скамья у двери кабинета: деревянные боковины, мягкое сиденье и спинка («wood», «carpet» — перекраска каталога)."""
    w, d, _ = fit('bench')
    wood = material('wood', '#9c7a52', rough=0.6)
    frame = Part('frame', wood)
    for sx in (-1, 1):
        x = sx * (w / 2 - 0.03)
        frame.box(0.05, SEAT - 0.06, 0.05, x, 0, d / 2 - 0.03, bevel=0, grid=0)
        frame.box(0.05, SEAT + 0.36, 0.05, x, 0, -(d / 2 - 0.03), bevel=0, grid=0)
        frame.box(0.05, 0.05, d - 0.08, x, SEAT - 0.11, 0, bevel=0, grid=0)
    frame.box(w - 0.1, 0.05, 0.03, 0, 0.12, -(d / 2 - 0.08), bevel=0, grid=0)
    seat = Part('seat', material('carpet', '#5f8f8a', rough=0.9))
    seat.box(w - 0.1, 0.06, d - 0.1, 0, SEAT - 0.06, 0.01, bevel=0.02, grid=WIDE)
    back = Part('back', material('carpetDarker', '#4f7b76', rough=0.9))
    back.box(w - 0.1, 0.24, 0.04, 0, SEAT + 0.1, -(d / 2 - 0.07), bevel=0.016, rx=-0.12, grid=WIDE)
    return [frame, seat, back]


def lounge_chair():
    """Кресло ординаторской: деревянные ножки, подушка сиденья, спинка и подлокотники (перекраска каталога — «LOUNGE»)."""
    w, d, _ = fit('lounge_chair')
    wood = material('wood', '#b08a5c', rough=0.6)
    base = Part('legs', wood)
    legs(base, w - 0.04, d - 0.04, 0.14, t=0.04, inset=0.02)
    soft = material('carpet', '#7a8fa6', rough=0.95)
    # сиденье — самая большая гладь ниже подлокотников: по ней игра сажает человека (models.ts, `seatOf`)
    seat = Part('seat', soft)
    seat.box(w - 0.3, SEAT - 0.14, d - 0.12, 0, 0.14, 0.04, bevel=0.04, grid=0)
    arms = Part('arms', soft)
    for sx in (-1, 1):
        arms.box(0.13, 0.42, d - 0.06, sx * (w / 2 - 0.085), 0.14, 0.0, bevel=0.035, grid=0)
    back = Part('back', material('carpetDarker', '#67798d', rough=0.95))
    back.box(w - 0.3, 0.46, 0.16, 0, 0.2, -(d / 2 - 0.11), bevel=0.05, rx=-0.15, grid=0)
    return [base, seat, arms, back]


def bookcase():
    """Шкаф с дверцами во всю высоту: корпус, две дверцы, ручки; белый — перекраска каталога, в кабинете — дерево."""
    w, d, h = fit('bookcase')
    front = d / 2 - 0.04
    body = Part('body', material('wood', '#f3cca8', rough=0.6))
    body.box(w, h, d - 0.04, 0, 0, -0.02, bevel=0.01, grid=WIDE)
    doors = Part('door', material('woodDark', '#d7b495', rough=0.55))
    for sx in (-1, 1):
        doors.box(w / 2 - 0.03, h - 0.12, 0.018, sx * (w / 4 - 0.005), 0.08, front + 0.009, bevel=0.005, grid=0)
    pulls = Part('pulls', material('metal', '#dfeaec', rough=0.3, metal=0.6))
    for sx in (-1, 1):
        handle(pulls, sx * 0.04, h / 2, front + 0.008, h=0.16)
    plinth = Part('plinth', material('woodDark', '#d7b495', rough=0.55))
    plinth.box(w - 0.04, 0.07, 0.02, 0, 0, front + 0.01, bevel=0, grid=0)
    return [body, doors, pulls, plinth]


def low_cabinet():
    """Низкий шкаф ординаторской и аппаратных: корпус, столешница, две дверцы с ручками."""
    w, d, h = fit('low_cabinet')
    front = d / 2 - 0.04
    body = Part('body', material('panel', 'panel', rough=0.55))
    body.box(w, h - 0.03, d - 0.04, 0, 0, -0.02, bevel=0.01, grid=WIDE)
    top = Part('top', material('board', 'board', rough=0.5))
    top.box(w, 0.03, d, 0, h - 0.03, 0, bevel=0.008, grid=0)
    doors = Part('door', material('white', 'white', rough=0.45))
    for sx in (-1, 1):
        doors.box(w / 2 - 0.035, h - 0.15, 0.018, sx * (w / 4 - 0.006), 0.07, front + 0.009, bevel=0.005, grid=0)
    pulls = Part('pulls', material('steel', 'steel', rough=0.3, metal=0.6))
    for sx in (-1, 1):
        handle(pulls, sx * 0.05, h - 0.4, front + 0.008, h=0.14)
    return [body, top, doors, pulls]


def sink():
    """Раковина на тумбе-пьедестале: чаша с углублением, кран; белая (у модели набора — без перекраски)."""
    w, d, h = fit('sink')
    white = material('_defaultMat', 'white', rough=0.3)
    rim = h - 0.12
    stand = Part('stand', white)
    stand.box(0.2, rim - 0.16, 0.2, 0, 0, -(d / 2 - 0.14), bevel=0.02, grid=0)
    basin = Part('basin', white)
    basin.box(w, 0.16, d, 0, rim - 0.16, 0, bevel=0.03, grid=0)
    inner = Part('bowl', material('bowl', '#d8e2e6', rough=0.25))
    inner.box(w - 0.12, 0.01, d - 0.16, 0, rim - 0.005, 0.03, bevel=0.02, grid=0)
    tap = Part('tap', material('metalLight', 'steel', rough=0.2, metal=0.8))
    tap.cyl(0.015, 0.015, 0.1, 0, rim, -(d / 2 - 0.06), seg=8)
    tap.box(0.025, 0.02, 0.1, 0, rim + 0.08, -(d / 2 - 0.1), bevel=0, grid=0)
    return [stand, basin, inner, tap]


def sink_wc():
    """Раковина санузла на тумбе: тумба с дверцей, столешница с чашей, кран."""
    w, d, h = fit('sink_wc')
    white = material('carpetWhite', 'white', rough=0.35)
    rim = h - 0.12
    cab = Part('cabinet', white)
    cab.box(w - 0.04, rim - 0.2, d - 0.04, 0, 0.04, -0.01, bevel=0.01, grid=0)
    door = Part('door', material('door', 'panel', rough=0.45))
    door.box(w - 0.12, rim - 0.32, 0.015, 0, 0.1, d / 2 - 0.03, bevel=0.004, grid=0)
    top = Part('basin', white)
    top.box(w, 0.16, d, 0, rim - 0.16, 0, bevel=0.025, grid=0)
    inner = Part('bowl', material('bowl', '#d8e2e6', rough=0.25))
    inner.box(w - 0.16, 0.01, d - 0.18, 0, rim - 0.005, 0.03, bevel=0.02, grid=0)
    tap = Part('tap', material('metalDark', 'steel', rough=0.2, metal=0.8))
    tap.cyl(0.015, 0.015, 0.1, 0, rim, -(d / 2 - 0.06), seg=8)
    tap.box(0.025, 0.02, 0.1, 0, rim + 0.08, -(d / 2 - 0.1), bevel=0, grid=0)
    return [cab, door, top, inner, tap]


def lab_sink():
    """Мойка лаборатории: тумба с двумя дверцами, стальная столешница с чашей, кран-«гусак»; белая — перекраска каталога."""
    w, d, h = fit('lab_sink')
    top_y = h - 0.12
    cab = Part('cabinet', material('wood', '#f3cca8', rough=0.6))
    cab.box(w - 0.02, top_y - 0.12, d - 0.04, 0, 0.08, -0.01, bevel=0.01, grid=WIDE)
    plinth = Part('plinth', material('metalDark', '#96a7a7', rough=0.5))
    plinth.box(w - 0.06, 0.08, d - 0.1, 0, 0, -0.03, bevel=0, grid=0)
    doors = Part('door', material('woodDark', '#d7b495', rough=0.55))
    for sx in (-1, 1):
        doors.box(w / 2 - 0.035, top_y - 0.24, 0.016, sx * (w / 4 - 0.008), 0.11, d / 2 - 0.022, bevel=0.004, grid=0)
        handle(doors, sx * 0.04, top_y - 0.32, d / 2 - 0.006, h=0.12)
    top = Part('top', material('metal', '#dfeaec', rough=0.3, metal=0.6))
    top.box(w, 0.04, d, 0, top_y - 0.04, 0, bevel=0.006, grid=WIDE)
    bowl = Part('bowl', material('metalDark', '#96a7a7', rough=0.35, metal=0.6))
    bowl.box(0.44, 0.008, 0.36, -0.15, top_y - 0.004, 0.04, bevel=0.02, grid=0)
    tap = Part('tap', material('metalLight', '#f8fdfa', rough=0.2, metal=0.8))
    tap.cyl(0.016, 0.016, 0.1, -0.15, top_y, -(d / 2 - 0.07), seg=8)
    tap.box(0.025, 0.02, 0.16, -0.15, top_y + 0.1, -(d / 2 - 0.13), bevel=0, grid=0)
    return [cab, plinth, doors, top, bowl, tap]


def toilet():
    """Кабинка санузла в осях клетки: унитаз у дальней стены, стенки по бокам, дверца спереди — размеры `TOILET` игры."""
    w, d, h = fit('toilet')
    c = KITS['toilet']['cubicle']
    back = -(1 - d) / 2
    white = material('_defaultMat', 'white', rough=0.3)
    bowl = Part('bowl', white)
    bowl.cyl(0.13, 0.17, h * 0.42, 0, 0, back + 0.06, seg=12)
    bowl.box(w - 0.04, 0.05, d * 0.62, 0, h * 0.42, back + 0.04, bevel=0.02, grid=0)
    tank = Part('tank', white)
    tank.box(w, h * 0.42, 0.17, 0, h * 0.5, back - d / 2 + 0.085, bevel=0.02, grid=0)
    seat = Part('seat', material('carpetWhite', '#eef2f3', rough=0.4))
    seat.box(w - 0.06, 0.025, d * 0.5, 0, h * 0.42 + 0.05, back + 0.06, bevel=0.01, grid=0)
    sides = Part('sides', material('cubicle', 'cubicle', rough=0.5))
    s = c['side']
    for sx in (-1, 1):
        sides.box(s['t'], s['h'], s['d'], sx * s['x'], s['y'], s['z'], bevel=0.006, grid=WIDE)
    dr = c['door']
    door = Part('door', material('cubicle_door', 'cubicle_door', rough=0.5))
    door.box(dr['w'], dr['h'], dr['t'], 0, dr['y'], dr['z'], bevel=0.006, grid=WIDE)
    lock = Part('lock', material('metalDark', 'steel', rough=0.3, metal=0.6))
    lock.box(0.05, 0.02, 0.012, dr['w'] / 2 - 0.08, 0.95, dr['z'] + dr['t'] / 2 + 0.006, bevel=0, grid=0)
    return [bowl, tank, seat, sides, door, lock]


# ---------------------------------------------------------------- аппараты и столы вместо моделей кодом


def counter():
    """
    Стойка регистратуры: длина — вдоль x; регистратор — на +z (к нему рабочий стол, ящики и монитор), посетитель — на −z (к нему
    высокая лицевая панель с полкой).
    """
    box = CODES['counter']['code']
    half = box['max'][0]
    ln = half * 2
    front = Part('front', material('front', 'front', rough=0.6))
    front.box(ln, 1.0, 0.12, 0, 0.06, -0.32, bevel=0.012, grid=WIDE)
    plinth = Part('plinth', material('plinth', 'dark', rough=0.7))
    plinth.box(ln - 0.04, 0.06, 0.1, 0, 0, -0.31, bevel=0, grid=0)
    ledge = Part('ledge', material('wood_top', 'wood_top', rough=0.5))
    ledge.box(ln + 0.02, 0.04, 0.3, 0, 1.06, -0.3, bevel=0.012, grid=WIDE)
    body = Part('body', material('beige', 'beige', rough=0.6))
    body.box(ln, 0.62, 0.5, 0, 0, 0.05, bevel=0.01, grid=WIDE)
    desk = Part('desk', material('wood_top', 'wood_top', rough=0.5))
    desk.box(ln, 0.04, 0.6, 0, 0.62, 0.05, bevel=0.01, grid=WIDE)
    drawers = Part('drawers', material('drawers', 'board', rough=0.55))
    for x in (-half + 0.25, half - 0.25):
        drawers.box(0.4, 0.5, 0.012, x, 0.08, 0.306, bevel=0.004, grid=0)
    parts = [front, plinth, ledge, body, desk, drawers]
    monitor_on(parts, 0, 0.66, 0.05)
    return parts


def couch():
    """Смотровая кушетка: ножки, рама, мягкий верх, приподнятое изголовье, бумажная простыня и её рулон у изголовья."""
    top = CODES['couch']['lieTop']
    frame = Part('frame', material('steel', 'steel', rough=0.35, metal=0.6))
    legs(frame, 0.62, 1.76, top - 0.12, t=0.05, inset=0.0)
    frame.box(0.66, 0.05, 1.86, 0, top - 0.12, 0, bevel=0.01, grid=WIDE)
    frame.box(0.6, 0.03, 0.03, 0, 0.12, -0.6, bevel=0, grid=0)
    frame.box(0.6, 0.03, 0.03, 0, 0.12, 0.6, bevel=0, grid=0)
    pad = Part('pad', material('mint', 'mint', rough=0.8))
    pad.box(0.64, 0.08, 1.38, 0, top - 0.08, 0.23, bevel=0.025, grid=WIDE)
    pad.box(0.64, 0.08, 0.55, 0, top - 0.06, -0.62, bevel=0.025, rx=-0.35, grid=0)
    paper = Part('paper', material('sheet', 'sheet', rough=0.95))
    paper.box(0.56, 0.012, 1.24, 0, top - 0.002, 0.24, bevel=0, grid=WIDE)
    roll = Part('paper_roll', material('sheet', 'sheet', rough=0.95))
    roll.cyl(0.05, 0.05, 0.58, -0.29, top - 0.15, -0.88, seg=10, axis='x')
    return [frame, pad, paper, roll]


def lab_bench():
    """Лабораторный стол у стены: тумба с дверцами, столешница, на ней микроскоп или штатив с пробирками (игра ставит одно)."""
    box = CODES['lab_bench']['code']
    d = 0.62
    back = -(1 - d) / 2
    w = 0.98
    h = 0.9
    cab = Part('cabinet', material('cabinet', '#e9ecec', rough=0.55))
    cab.box(w - 0.02, h - 0.12, d - 0.04, 0, 0.08, back - 0.01, bevel=0.01, grid=WIDE)
    plinth = Part('plinth', material('plinth', 'steel_d', rough=0.5))
    plinth.box(w - 0.06, 0.08, d - 0.1, 0, 0, back - 0.03, bevel=0, grid=0)
    doors = Part('door', material('door', '#c9d0d2', rough=0.5))
    for sx in (-1, 1):
        doors.box(w / 2 - 0.035, h - 0.24, 0.016, sx * (w / 4 - 0.008), 0.11, back + d / 2 - 0.022, bevel=0.004, grid=0)
        handle(doors, sx * 0.04, h - 0.3, back + d / 2 - 0.006, h=0.12)
    top = Part('top', material('top', 'light', rough=0.4))
    top.box(w, 0.04, d, 0, h - 0.04, back, bevel=0.008, grid=WIDE)
    dark = material('dark', 'dark', rough=0.6)
    on = -0.15
    # на столе — микроскоп или штатив с пробирками: части `microscope*` и `rack*`, игра ставит одно из двух (как модель кодом)
    scope = Part('microscope', dark)
    scope.box(0.16, 0.03, 0.2, 0, h, on, bevel=0.008, grid=0)
    scope.box(0.04, 0.26, 0.04, 0, h + 0.03, on - 0.07, bevel=0.006, grid=0)
    scope.box(0.1, 0.02, 0.1, 0, h + 0.12, on, bevel=0.004, grid=0)
    lens = Part('microscope_lens', material('lens', 'lens', rough=0.3, metal=0.4))
    lens.cyl(0.025, 0.02, 0.15, 0, h + 0.2, on - 0.06, seg=8, axis='z')
    rack = Part('rack', material('rack', 'rack', rough=0.5))
    rack.box(0.24, 0.05, 0.1, 0, h, on, bevel=0.006, grid=0)
    tubes = {c: Part(f'rack_{c}', material(f'tube_{c}', f'tube_{c}', rough=0.4)) for c in ('r', 'b', 'y', 'g')}
    for i, c in enumerate(('r', 'b', 'y', 'g', 'r')):
        tubes[c].cyl(0.012, 0.012, 0.12, -0.08 + i * 0.04, h + 0.03, on, seg=6)
    return [cab, plinth, doors, top, scope, lens, rack, *tubes.values()]


def analyzer():
    """Лабораторный анализатор: корпус со скруглёнными рёбрами, крышка, экран, полоса, блок проб с лотком наверху."""
    white = material('white', 'white', rough=0.45)
    body = Part('body', white)
    body.box(0.8, 0.85, 0.6, 0, 0, 0, bevel=0.03, grid=WIDE)
    lid = Part('lid', material('light', 'light', rough=0.45))
    lid.box(0.82, 0.05, 0.62, 0, 0.85, 0, bevel=0.015, grid=WIDE)
    seam = Part('seam', material('seam', 'light2', rough=0.5))
    seam.box(0.36, 0.5, 0.008, 0.18, 0.1, 0.3, bevel=0.003, grid=0)
    screen = Part('screen', material('screen', 'screen', rough=0.2))
    screen.box(0.34, 0.22, 0.012, -0.12, 0.56, 0.304, bevel=0.003, grid=0)
    frame = Part('bezel', material('dark', 'dark', rough=0.6))
    frame.box(0.38, 0.26, 0.01, -0.12, 0.54, 0.299, bevel=0.004, grid=0)
    stripe = Part('stripe', material('teal', 'teal', rough=0.4))
    stripe.box(0.8, 0.05, 0.012, 0, 0.35, 0.302, bevel=0, grid=0)
    module = Part('module', material('light2', 'light2', rough=0.45))
    module.box(0.3, 0.3, 0.4, 0.15, 0.9, -0.05, bevel=0.025, grid=0)
    tray = Part('tray', material('slate', 'slate', rough=0.5))
    tray.box(0.2, 0.06, 0.25, 0.15, 1.2, -0.05, bevel=0.01, grid=0)
    for i in range(4):
        tray.cyl(0.012, 0.012, 0.05, 0.09 + i * 0.04, 1.26, -0.05, seg=6)
    return [body, lid, seam, screen, frame, stripe, module, tray]


def procedure_table():
    """Процедурный столик: стальные ножки, нижняя полка, белая столешница, лоток и подлокотник для забора крови."""
    steel = material('steel', 'steel', rough=0.35, metal=0.6)
    frame = Part('legs', steel)
    for sx in (-0.35, 0.35):
        for sz in (-0.22, 0.22):
            frame.cyl(0.02, 0.02, 0.66, sx, 0.02, sz, seg=8)
            frame.cyl(0.028, 0.028, 0.02, sx, 0.0, sz, seg=8)
    shelf = Part('shelf', material('steel_d', 'steel_d', rough=0.45, metal=0.4))
    shelf.box(0.74, 0.02, 0.46, 0, 0.25, 0, bevel=0.005, grid=0)
    top = Part('top', material('white', 'white', rough=0.4))
    top.box(0.8, 0.04, 0.52, 0, 0.68, 0, bevel=0.012, grid=WIDE)
    tray = Part('tray', material('tray', 'tray', rough=0.4))
    tray.box(0.3, 0.03, 0.2, -0.18, 0.72, -0.05, bevel=0.008, grid=0)
    tray.box(0.27, 0.008, 0.17, -0.18, 0.745, -0.05, bevel=0.004, grid=0)
    arm = Part('armrest', material('mint', 'mint', rough=0.8))
    arm.box(0.14, 0.06, 0.4, 0.22, 0.72, 0.02, bevel=0.02, grid=0)
    return [frame, shelf, top, tray, arm]


def ecg():
    """Электрокардиограф на тележке: колёса, основание, стойка, корпус с самописцем, экран, провода отведений."""
    wheels = Part('wheels', material('dark', 'dark', rough=0.7))
    for sx in (-0.2, 0.2):
        for sz in (-0.15, 0.15):
            wheels.cyl(0.035, 0.035, 0.03, sx - 0.015, 0.035, sz, seg=8, axis='x')
    base = Part('base', material('steel_d', 'steel_d', rough=0.45, metal=0.4))
    base.box(0.5, 0.06, 0.4, 0, 0.05, 0, bevel=0.012, grid=0)
    post = Part('post', material('steel', 'steel', rough=0.3, metal=0.6))
    post.box(0.05, 0.71, 0.05, 0, 0.11, -0.12, bevel=0.008, grid=0)
    body = Part('body', material('white', 'white', rough=0.45))
    body.box(0.48, 0.18, 0.38, 0, 0.82, 0, bevel=0.025, grid=0)
    paper = Part('paper', material('sheet', 'sheet', rough=0.9))
    paper.box(0.2, 0.004, 0.16, 0.1, 1.0, 0.07, bevel=0, grid=0)
    keys = Part('keys', material('keys', 'slate', rough=0.5))
    keys.box(0.16, 0.006, 0.14, -0.12, 1.0, 0.08, bevel=0.002, grid=0)
    case = Part('bezel', material('bezel', 'dark', rough=0.6))
    case.box(0.42, 0.3, 0.05, 0, 1.02, -0.12, bevel=0.015, rx=0.15, grid=0)
    screen = Part('screen', material('screen', 'screen', rough=0.2))
    screen.box(0.36, 0.24, 0.006, 0, 1.05, -0.093, bevel=0, rx=0.15, grid=0)
    leads = Part('leads', material('leads', 'dark', rough=0.6))
    for k, x in enumerate((-0.18, -0.12, -0.06, 0.0)):
        leads.cyl(0.006, 0.006, 0.45 - k * 0.06, x, 0.42 + k * 0.05, 0.19, seg=5)
    leads.box(0.3, 0.02, 0.02, -0.09, 0.86, 0.19, bevel=0, grid=0)
    return [wheels, base, post, body, paper, keys, case, screen, leads]


def _built(make):
    """Модель — объекты частей Blender, как у пилота: каждая часть собирается в каноническом порядке (`Part.build`)."""
    return lambda: [p.build() for p in make()]


MODELS = {k: _built(f) for k, f in {
    'desk': desk, 'office_chair': office_chair, 'waiting_chair': waiting_chair, 'chair': chair, 'bench': bench,
    'lounge_chair': lounge_chair, 'bookcase': bookcase, 'low_cabinet': low_cabinet, 'sink': sink, 'sink_wc': sink_wc,
    'lab_sink': lab_sink, 'toilet': toilet, 'counter': counter, 'couch': couch, 'lab_bench': lab_bench,
    'analyzer': analyzer, 'procedure_table': procedure_table, 'ecg': ecg,
}.items()}
