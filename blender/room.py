# Запечённый свет готового помещения (пилот — docs/reports/2026-11-blender-pilot.md, часть 2 — docs/specs/2026-11-blender-2.md):
# образец группы, как его строит игра (blender/sizes.json, «rooms» — из tools/app/blender-sizes.ts): пол, стены с дверью по
# клеткам плана, светильники там же, где их панели в игре (lamps.ts), вещи — моделями Blender групп, как их ставит окно,
# остальные — коробками своего размера (стол — крышка на ножках, стул — сиденье со спинкой). На пол запекаются затенение (AO) и
# мягкие тени от светильников (SHADOW) — в одну серую картинку-множитель: assets/models/blender/room-<тип>-<размер>.png. Тень —
# доля света, которую закрыли вещи и стены: запекание с ними делится на запекание без них, — поэтому в картинке нет затухания
# света от панелей (его рисует игра, lamps.ts), и открытый пол — ровно 1. Игра кладёт картинку на пол каждого помещения того
# же образца (src/render/baked.ts): у светильников в игре теней нет, а GTAO видит только то, что в кадре.
import math
import os
import struct
import zlib

import bpy

from ambulatory import MODELS as GROUP1
from diagnostics import MODELS as GROUP3
from stationary import MODELS as GROUP2
from surgery import MODELS as GROUP4
from common import Part, g2b, material

# модели Blender, которые окно ставит по умолчанию (часть 2): у образцов групп вещи — ими, как в игре
PART2 = {**GROUP1, **GROUP2, **GROUP3, **GROUP4}

# сколько точек картинки на метр пола: 32 (тени мягкие, в кадре игры разница с 64 пилота — на уровне шума, а файл вчетверо
# меньше; docs/specs/2026-11-blender-2.md, решение агента 11)
PX = 32
AO_SAMPLES = 256
SHADOW_SAMPLES = 128
# затенение по полу ищется в этом радиусе, м: тень у ножек и в углах, а не от всей комнаты
AO_DISTANCE = 0.6
# картинка — множитель от этих долей (полная тень) до 1: рядом с тенью — свет панелей и отражённый, совсем черно не бывает
AO_FLOOR = 0.5
SHADOW_FLOOR = 0.55
# светильник — панель под потолком, м
LAMP = (0.6, 1.2)
LAMP_POWER = 120.0


def walls(room):
    """Стены — тонкие, по середине клеток стены, с отростками к соседним клеткам стены, как в игре (world.ts)."""
    cells = room['cells']
    w, h, t, top = room['w'], room['h'], room['wallT'], room['wallH']
    door_h = 2.1
    solid = lambda x, y: 0 <= x < w and 0 <= y < h and cells[y][x] in '34'
    part = Part('walls', material('wall', '#e7ebe8', rough=0.9))
    for y in range(h):
        for x in range(w):
            c = cells[y][x]
            if c not in '34':
                continue
            lo = door_h if c == '4' else 0.0
            mx, mz = x + 0.5, y + 0.5
            part.box(t, top - lo, t, mx, lo, mz, bevel=0)
            if solid(x + 1, y):
                part.box(0.5, top - lo, t, mx + 0.25, lo, mz, bevel=0)
            if solid(x - 1, y):
                part.box(0.5, top - lo, t, mx - 0.25, lo, mz, bevel=0)
            if solid(x, y + 1):
                part.box(t, top - lo, 0.5, mx, lo, mz + 0.25, bevel=0)
            if solid(x, y - 1):
                part.box(t, top - lo, 0.5, mx, lo, mz - 0.25, bevel=0)
    return part.build()


def placed(parts, t, offset):
    """
    Части модели — на место вещи: начало осей модели — в `offset` (м, в осях вещи игры: x, z) от середины места, поворот —
    `yaw` вещи вокруг вертикали. Пустой объект-родитель держит поворот и место, части — сдвиг.
    """
    holder = bpy.data.objects.new(f"at_{t['kind']}_{t['at'][0]}_{t['at'][1]}", None)
    bpy.context.scene.collection.objects.link(holder)
    x, z = t['at']
    holder.location = g2b(x, 0, z)
    holder.rotation_euler = (0, 0, t['yaw'])
    # длинный предмет в одной клетке — вдвое короче вдоль своей z, как в игре (furniture.ts, `placeThing`); z игры — −Y Blender
    if t.get('short'):
        holder.scale = (1, 0.5, 1)
    for ob in parts:
        ob.parent = holder
        ob.location = g2b(offset[0], 0, offset[1])
    return parts


def blender_thing(t):
    """
    Вещь образца группы — моделью Blender, как в игре: модель кодом — в осях места со сдвигом (`shift`, furniture.ts
    `CODE_SHIFT`); модель вместо модели набора — серединой габарита в середину места каталога (`box`: с прижатием к стене),
    как её ставит `Furnisher.place`; на лабораторном столе — микроскоп или штатив (`item`), как `skipOf`.
    """
    parts = PART2[t['blender']]()
    # стойка капельницы — только у кровати палаты и бокса (furniture.ts, `skipOf`)
    if t.get('iv') is False:
        for ob in [o for o in parts if o.name in ('iv', 'iv_bag')]:
            bpy.data.objects.remove(ob)
            parts.remove(ob)
    if 'item' in t:
        drop = 'microscope' if t['item'] == 1 else 'rack'
        for ob in [o for o in parts if o.name.startswith(drop)]:
            bpy.data.objects.remove(ob)
            parts.remove(ob)
    if 'code' in t or t['kind'] == 'toilet':
        return placed(parts, t, (0.0, t.get('shift', 0.0)))
    # габарит модели — в осях игры (Blender: X = x, Y = −z)
    xs = [(ob.matrix_world @ v.co).x for ob in parts for v in ob.data.vertices]
    zs = [-(ob.matrix_world @ v.co).y for ob in parts for v in ob.data.vertices]
    (bx0, _, bz0), (bx1, _, bz1) = t['box']['min'], t['box']['max']
    off = ((bx0 + bx1) / 2 - (min(xs) + max(xs)) / 2, (bz0 + bz1) / 2 - (min(zs) + max(zs)) / 2)
    return placed(parts, t, off)


def thing(t):
    """Предмет помещения: модель Blender группы, как в игре, или коробками своего габарита (для теней этого хватает)."""
    if t.get('blender'):
        return blender_thing(t)
    (x0, y0, z0), (x1, y1, z1) = t['box']['min'], t['box']['max']
    w, h, d = x1 - x0, y1 - y0, z1 - z0
    cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
    p = Part(t['kind'], material('furniture', '#cfd5d6'))
    if t['kind'] in ('table', 'desk'):
        p.box(w, 0.04, d, cx, 0.72, cz, bevel=0)
        for sx in (x0 + 0.04, x1 - 0.04):
            for sz in (z0 + 0.04, z1 - 0.04):
                p.box(0.04, 0.72, 0.04, sx, 0, sz, bevel=0)
        # монитор на столе
        p.box(0.5, 0.32, 0.05, cx, 0.78, z0 + 0.12, bevel=0)
    elif t['kind'] == 'plant':
        # горшок — по виду модели набора (около 0,3 м): листья редкие и тени почти не дают; коробкой во всё место
        # под горшком на полу выходил чёрный квадрат
        p.cyl(0.13, 0.16, 0.32, cx, 0, cz, seg=12)
    elif t['kind'] == 'chair':
        p.box(w * 0.8, 0.06, d * 0.8, cx, 0.42, cz, bevel=0)
        p.box(w * 0.8, 0.45, 0.05, cx, 0.48, z0 + 0.05, bevel=0)
        p.box(0.06, 0.42, 0.06, cx, 0, cz, bevel=0)
    else:
        p.box(w, h, d, cx, 0, cz, bevel=0)
    parts = [p.build()]
    x, z = t['at']
    for ob in parts:
        ob.location = g2b(x, 0, z)
        ob.rotation_euler = (0, 0, t['yaw'])
    return parts


def floor_mesh(room, image):
    """Пол от середины стены до середины стены; развёртка: u — вдоль x, v — вдоль z плана (строка картинки — z)."""
    w, h = room['w'], room['h']
    me = bpy.data.meshes.new('floor')
    pts = [(0.5, 0.5), (w - 0.5, 0.5), (w - 0.5, h - 0.5), (0.5, h - 0.5)]
    me.from_pydata([g2b(x, 0, z) for x, z in pts], [], [(0, 3, 2, 1)])
    uv = me.uv_layers.new(name='bake')
    for loop in me.loops:
        x, z = pts[loop.vertex_index]
        uv.data[loop.index].uv = ((x - 0.5) / (w - 1), (z - 0.5) / (h - 1))
    mat = material('floor_bake', '#d9dcd8', rough=0.9)
    node = mat.node_tree.nodes.new('ShaderNodeTexImage')
    node.image = image
    mat.node_tree.nodes.active = node
    me.materials.append(mat)
    ob = bpy.data.objects.new('floor', me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def lamps(room):
    for i, (x, z) in enumerate(room['lamps']):
        data = bpy.data.lights.new(f'lamp{i}', 'AREA')
        data.shape = 'RECTANGLE'
        data.size, data.size_y = LAMP
        data.energy = LAMP_POWER
        ob = bpy.data.objects.new(f'lamp{i}', data)
        ob.location = g2b(x, room['wallH'] - 0.05, z)
        bpy.context.scene.collection.objects.link(ob)


def bake(floor, image, kind, samples):
    scene = bpy.context.scene
    scene.cycles.samples = samples
    bpy.ops.object.select_all(action='DESELECT')
    floor.select_set(True)
    bpy.context.view_layer.objects.active = floor
    scene.render.bake.target = 'IMAGE_TEXTURES'
    scene.render.bake.margin = 4
    bpy.ops.object.bake(type=kind)
    px = list(image.pixels)
    return [px[i * 4] for i in range(len(px) // 4)]


def png(path, w, h, gray):
    """Серая картинка 8 бит — своим кодом: без даты и программы в файле, повторяется до байта."""
    raw = b''.join(b'\x00' + bytes(gray[y * w:(y + 1) * w]) for y in range(h))
    chunk = lambda tag, data: struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)
    out = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 0, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(out)


def build_room(key, room, path):
    w, h = room['w'] - 1, room['h'] - 1
    iw, ih = w * PX, h * PX
    image = bpy.data.images.new('bake', iw, ih, float_buffer=True)
    floor = floor_mesh(room, image)
    blockers = [walls(room)]
    for t in room['things'] + room.get('decor', []):
        blockers += thing(t)
    lamps(room)
    bpy.context.scene.world.light_settings.distance = AO_DISTANCE
    ao = bake(floor, image, 'AO', AO_SAMPLES)
    shadow = bake(floor, image, 'SHADOW', SHADOW_SAMPLES)
    # тот же свет без стен и вещей: делим — остаётся только то, что они закрыли
    for ob in blockers:
        ob.hide_render = True
    open_light = bake(floor, image, 'SHADOW', SHADOW_SAMPLES)
    gray = []
    for a, s, o in zip(ao, shadow, open_light):
        lit = min(1.0, s / o) if o > 1e-6 else 1.0
        v = (AO_FLOOR + (1 - AO_FLOOR) * min(1.0, a)) * (SHADOW_FLOOR + (1 - SHADOW_FLOOR) * lit)
        gray.append(max(0, min(255, round(v * 255))))
    png(path, iw, ih, gray)
    return iw, ih, sum(gray) / len(gray) / 255, min(gray) / 255
