# Модели Blender для игры (docs/reports/2026-11-blender-pilot.md; blender/README.md): кровать, монитор, рентген →
# assets/models/blender/<имя>.glb; запечённый свет рентген-кабинета M → assets/models/blender/room-xray-M.png. Размеры —
# blender/sizes.json (из игры: bun tools/app/blender-sizes.ts).
#
#   blender --background --factory-startup --python blender/build.py [-- bed monitor xray room]
#   python blender/build.py [bed monitor xray room]     # Blender как модуль Python (пакет bpy той же версии)
#
# Версия Blender закреплена (VERSION): другая — отказ, другой файл. Запуск дважды даёт те же файлы до байта.
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402

from common import SIZES, bake_ao, export, floor, reset, tris  # noqa: E402
from models import MODELS  # noqa: E402
from room import build_room  # noqa: E402

VERSION = '4.5.15'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'models', 'blender')


def main(names):
    if bpy.app.version_string.split(' ')[0] != VERSION:
        raise SystemExit(f'нужен Blender {VERSION}, а это {bpy.app.version_string}')
    os.makedirs(OUT, exist_ok=True)
    for name in names:
        t0 = time.time()
        reset()
        if name == 'room':
            path = os.path.abspath(os.path.join(OUT, 'room-xray-M.png'))
            room = SIZES['rooms']['room.xray:M']
            w, h, mean, low = build_room('room.xray:M', room, path)
            # образец для игры (src/render/baked.ts): картинка ложится только на пол помещения с теми же предметами на тех же местах
            sample = {'key': 'room.xray:M', 'type': 'room.xray', 'size': 'M', 'w': room['w'], 'h': room['h'],
                      'things': [{'kind': t['kind'], 'at': t['at']} for t in room['things']]}
            with open(os.path.join(OUT, 'room-xray-M.json'), 'w', encoding='utf-8') as f:
                f.write(json.dumps(sample, ensure_ascii=False, indent=1) + '\n')
            print(f'room: рентген-кабинет M, пол {w}×{h} точек, множитель в среднем {mean:.2f}, самый тёмный {low:.2f}, '
                  f'{os.path.getsize(path) // 1024} КБ, {time.time() - t0:.1f} с')
            continue
        parts = MODELS[name]()
        ground = floor()
        bake_ao(parts)
        bpy.data.objects.remove(ground)
        path = os.path.abspath(os.path.join(OUT, f'{name}.glb'))
        export(parts, path)
        print(f'{name}: частей {len(parts)} ({", ".join(p.name for p in parts)}), треугольников {tris(parts)}, '
              f'{os.path.getsize(path) // 1024} КБ, {time.time() - t0:.1f} с')


if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [a for a in sys.argv[1:] if not a.endswith('.py')]
    main(args or [*MODELS, 'room'])
