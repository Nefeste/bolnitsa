# Общее для моделей Blender (docs/reports/2026-11-blender-pilot.md; blender/README.md): сцена с нуля, материалы из палитры
# игры, части — отдельными объектами (имя объекта — имя узла в .glb — имя части), коробки со скруглёнными рёбрами и
# цилиндры в осях предмета игры, затенение, запечённое в цвет вершин, экспорт в .glb.
#
# Оси. В игре у предмета x — вправо, y — вверх, перёд — +z (у кровати — от изголовья к ногам), середина места — 0; в
# Blender вверх — Z, а экспорт glTF «+Y вверх» переводит точку Blender (x, y, z) в (x, z, −y). Поэтому точка игры (x, y, z)
# в Blender — (x, −z, y); все размеры ниже — в осях игры, перевод — только здесь.
import json
import math
import os

# bpy — первым: у Blender как модуля Python (пакет bpy) bmesh и mathutils появляются только после него
import bpy
import bmesh
from mathutils import Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
SIZES = json.load(open(os.path.join(HERE, 'sizes.json'), encoding='utf-8'))

# затенение в цвет вершин: на сколько метров вокруг ищутся соседние поверхности и сколько лучей на точку
AO_DISTANCE = 0.35
AO_SAMPLES = 256
# затенение в игре — множитель цвета от AO_FLOOR (полная тень) до 1: в игре поверх ещё GTAO, без пола — темнело бы дважды
AO_FLOOR = 0.35
# грани коробок — сеткой не крупнее, м: затенение в цвет вершин живёт в вершинах, а на большой грани без сетки оно
# растягивалось бы от затенённых краёв на всю грань (верх матраса выходил серым)
GRID = 0.2


def lin(hex_color):
    """Цвет «#rrggbb» (sRGB, как в палитре игры) — в линейный, как ждут узлы материала Blender."""
    out = []
    for i in (1, 3, 5):
        c = int(hex_color[i:i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return tuple(out)


def g2b(x, y, z):
    """Точка в осях игры — в осях Blender."""
    return (x, -z, y)


def reset():
    """Пустая сцена, Cycles на процессоре с закреплённым зерном: запекание повторяется."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.seed = 0
    scene.cycles.use_denoising = False
    # один поток: при нескольких запекание в цвет вершин иногда даёт другие числа (порядок сложения) — файл не повторялся
    scene.render.threads_mode = 'FIXED'
    scene.render.threads = 1
    world = bpy.data.worlds.new('world')
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes['Background']
    bg.inputs[0].default_value = (1, 1, 1, 1)
    bg.inputs[1].default_value = 1.0
    return scene


def material(name, color, rough=0.55, metal=0.0):
    """Материал по имени (его читает игра: «screen» светится, по имени — перекраска); цвет — ключ палитры или «#rrggbb»."""
    m = bpy.data.materials.get(name)
    if m:
        return m
    hex_color = SIZES['palette'].get(color, color)
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*lin(hex_color), 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    return m


class Part:
    """Часть модели: одна сетка, один материал; имя — идентификатор части (узел .glb)."""

    def __init__(self, name, mat):
        self.name = name
        self.mat = mat
        self.bm = bmesh.new()

    def box(self, w, h, d, x, y, z, bevel=0.012, segments=1, rx=0.0):
        """
        Коробка ширины w (x), высоты h (y), глубины d (z); (x, y, z) — середина низа; rx — наклон вокруг x, рад. Грани — сеткой
        не крупнее GRID, рёбра коробки скруглены на `bevel` м.
        """
        tmp = bmesh.new()
        bmesh.ops.create_cube(tmp, size=1.0)
        # сетка: рёбра вдоль каждой оси (x — ширина, y — глубина, z — высота в осях Blender) делятся поровну
        for axis, size in ((0, w), (1, d), (2, h)):
            cuts = max(0, math.ceil(size / GRID - 1e-9) - 1)
            if cuts:
                along = lambda e: all(abs(e.verts[0].co[k] - e.verts[1].co[k]) < 1e-6 for k in range(3) if k != axis)
                edges = [e for e in tmp.edges if along(e)]
                bmesh.ops.subdivide_edges(tmp, edges=edges, cuts=cuts, use_grid_fill=True)
        m = Matrix.Translation(g2b(x, y + h / 2, z)) @ Matrix.Rotation(-rx, 4, 'X') @ Matrix.Diagonal((w, d, h, 1))
        bmesh.ops.transform(tmp, matrix=m, verts=tmp.verts)
        tmp.normal_update()
        if bevel > 0:
            # только рёбра коробки: где сходятся грани разных сторон, а не линии сетки
            sharp = [e for e in tmp.edges if len(e.link_faces) == 2 and e.link_faces[0].normal.dot(e.link_faces[1].normal) < 0.5]
            bmesh.ops.bevel(tmp, geom=sharp, offset=min(bevel, w / 2.2, h / 2.2, d / 2.2), segments=segments, profile=0.5, affect='EDGES', clamp_overlap=True)
        # в сетку части: вершины и грани как есть (порядок наведёт `build`)
        vmap = {v: self.bm.verts.new(v.co) for v in tmp.verts}
        for f in tmp.faces:
            nf = self.bm.faces.new([vmap[v] for v in f.verts])
            nf.smooth = f.smooth
        tmp.free()
        return self

    def cyl(self, r0, r1, h, x, y, z, seg=16, axis='y', smooth=True):
        """Цилиндр (конус): радиусы низа и верха, высота h вдоль оси; (x, y, z) — середина низа; ось — 'y', 'x' или 'z'."""
        rot = {'y': Matrix.Identity(4), 'x': Matrix.Rotation(math.pi / 2, 4, 'Y'), 'z': Matrix.Rotation(math.pi / 2, 4, 'X')}[axis]
        off = {'y': (0, h / 2, 0), 'x': (h / 2, 0, 0), 'z': (0, 0, h / 2)}[axis]
        m = Matrix.Translation(g2b(x + off[0], y + off[1], z + off[2])) @ rot
        geom = bmesh.ops.create_cone(self.bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r0, radius2=r1, depth=h, matrix=m)
        if smooth:
            for f in {f for v in geom['verts'] for f in v.link_faces}:
                # бока гладкие, торцы — плоские
                f.smooth = len(f.verts) == 4
        return self

    def build(self):
        """
        Объект части. Сетка — в каноническом порядке: скругление рёбер (bmesh.ops.bevel) выдаёт грани в разном порядке от
        запуска к запуску (порядок зависит от адресов в памяти), и .glb не повторялся. Поэтому у каждой грани обход
        начинается с наименьшей вершины (по координатам, до микрона), грани сортируются, вершины нумеруются по первому
        появлению, а грань делится на треугольники веером от первой вершины (все грани здесь выпуклые).
        """
        key = lambda v: (round(v.co.x, 6), round(v.co.y, 6), round(v.co.z, 6))
        faces = []
        for f in self.bm.faces:
            vs = [key(lp.vert) for lp in f.loops]
            k = min(range(len(vs)), key=lambda i: vs[i])
            faces.append((vs[k:] + vs[:k], f.smooth))
        self.bm.free()
        faces.sort()
        verts = {}
        tris = []
        smooth = []
        for vs, sm in faces:
            ids = [verts.setdefault(v, len(verts)) for v in vs]
            for i in range(1, len(ids) - 1):
                tris.append((ids[0], ids[i], ids[i + 1]))
                smooth.append(sm)
        me = bpy.data.meshes.new(self.name)
        me.from_pydata(list(verts), [], tris)
        me.polygons.foreach_set('use_smooth', smooth)
        me.update()
        me.materials.append(self.mat)
        ob = bpy.data.objects.new(self.name, me)
        bpy.context.scene.collection.objects.link(ob)
        return ob


def floor(size=6.0):
    """Пол под предметом — только для запекания: к нему темнеют низы ножек и колёс; в .glb его нет."""
    p = Part('floor', material('floor', '#d9dcd8'))
    p.box(size, 0.02, size, 0, -0.02, 0, bevel=0)
    return p.build()


def bake_ao(objects, distance=AO_DISTANCE, samples=AO_SAMPLES):
    """Затенение (ambient occlusion) — в цвет вершин каждой части: Cycles, лучи на `distance` м."""
    scene = bpy.context.scene
    scene.cycles.samples = samples
    scene.world.light_settings.distance = distance
    bpy.ops.object.select_all(action='DESELECT')
    for ob in objects:
        attr = ob.data.color_attributes.new('ao', 'BYTE_COLOR', 'CORNER')
        ob.data.color_attributes.active_color = attr
        ob.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    scene.render.bake.target = 'VERTEX_COLORS'
    bpy.ops.object.bake(type='AO')
    # ослабить: от AO_FLOOR до 1 (в игре поверх — GTAO)
    for ob in objects:
        data = ob.data.color_attributes['ao'].data
        for c in data:
            v = AO_FLOOR + (1 - AO_FLOOR) * c.color[0]
            c.color = (v, v, v, 1.0)


def export(objects, path):
    """Только части модели — в .glb: узлы с именами частей, материалы, затенение — COLOR_0 (цвет вершин)."""
    bpy.ops.object.select_all(action='DESELECT')
    for ob in objects:
        ob.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        use_selection=True,
        export_yup=True,
        export_apply=False,
        export_texcoords=False,
        export_normals=True,
        export_vertex_color='ACTIVE',
        export_materials='EXPORT',
        export_extras=False,
    )


def tris(objects):
    """Сколько треугольников в частях (после деления многоугольников)."""
    return sum(sum(len(p.vertices) - 2 for p in ob.data.polygons) for ob in objects)
