# Модели Blender для игры (docs/reports/2026-11-blender-pilot.md, docs/specs/2026-11-blender-2.md; blender/README.md):
# пилот — кровать, монитор, рентген и запечённый свет рентген-кабинета M; часть 2 — модели групп (blender/ambulatory.py —
# группа 1, blender/stationary.py — группа 2: её кровать и монитор заменили модели пилота, blender/diagnostics.py — группа 3:
# рентген пилота, КТ, МРТ, УЗИ и пульт; свет рентген-кабинета M теперь — образец группы 3; blender/surgery.py — группа 4:
# операционный стол, наркозный аппарат, инструментальный столик и эндоскопическая стойка). Пишет в blender/.out/ (не в git);
# сжимает и кладёт в assets/models/blender/ `node tools/app/blender-pack.mjs`. Размеры — blender/sizes.json (из игры: bun
# tools/app/blender-sizes.ts), бюджет треугольников части 2 — blender/budgets.json: модель сверх бюджета не пишется.
#
#   blender --background --factory-startup --python blender/build.py [-- имена]
#   python blender/build.py [имена]     # Blender как модуль Python (пакет bpy той же версии)
#
# Без имён — всё: модели пилота, модели части 2 и свет; «room» — свет всех образцов (пилота и групп с ним, blender/budgets.json,
# `light`), «room.reception:S» — одного; список образцов для игры — rooms.json. Версия Blender закреплена (VERSION): другая — отказ, другой файл.
# Запуск дважды даёт те же файлы до байта.
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402

from ambulatory import MODELS as GROUP1  # noqa: E402
from common import HERE, SIZES, bake_ao, export, floor, reset, tris  # noqa: E402
from diagnostics import MODELS as GROUP3  # noqa: E402
from models import MODELS as PILOT  # noqa: E402
from room import build_room  # noqa: E402
from stationary import MODELS as GROUP2  # noqa: E402
from surgery import MODELS as GROUP4  # noqa: E402

VERSION = '4.5.15'
OUT = os.path.join(HERE, '.out')
BUDGETS = json.load(open(os.path.join(HERE, 'budgets.json'), encoding='utf-8'))['models']
# модели части 2 — в своём бюджете; модели пилота переделали их группы: кровать и монитор — группа 2 (у пилота кровать —
# 4872 треугольника при бюджете 1200), рентген — группа 3 (модель пилота как есть, в бюджете)
PART2 = {**GROUP1, **GROUP2, **GROUP3, **GROUP4}
MODELS = {**PILOT, **PART2}


def sample_file(key):
    """Файл образца света: «room.reception:S» → room-reception-S (рентген-кабинет M — room-xray-M, как у пилота)."""
    kind, size = key.split(':')
    return f"room-{kind.replace('room.', '')}-{size}"


def write_sample(key):
    """
    Описание образца для игры (src/render/baked.ts): картинка ложится только на пол помещения того же типа с теми же стенами и
    проёмами (`cells`) и с теми же предметами на тех же местах, так же повёрнутыми (`yaw`).
    """
    room = SIZES['rooms'][key]
    kind, size = key.split(':')
    sample = {'key': key, 'type': kind, 'size': size, 'w': room['w'], 'h': room['h'], 'cells': room['cells'],
              'things': [{'kind': t['kind'], 'at': t['at'], 'yaw': t['yaw']} for t in room['things']]}
    with open(os.path.join(OUT, f'{sample_file(key)}.json'), 'w', encoding='utf-8') as f:
        f.write(json.dumps(sample, ensure_ascii=False, indent=1) + '\n')


def write_index():
    """Список образцов света для игры (src/app/game.ts): ключ → файл и группа части 2 (лист света берёт образцы группы)."""
    index = {key: {'file': sample_file(key), 'group': room['group']} for key, room in SIZES['rooms'].items()}
    with open(os.path.join(OUT, 'rooms.json'), 'w', encoding='utf-8') as f:
        f.write(json.dumps(index, ensure_ascii=False, indent=1) + '\n')


def main(names):
    if bpy.app.version_string.split(' ')[0] != VERSION:
        raise SystemExit(f'нужен Blender {VERSION}, а это {bpy.app.version_string}')
    os.makedirs(OUT, exist_ok=True)
    for name in names:
        t0 = time.time()
        reset()
        if name in SIZES['rooms']:
            key = name
            room = SIZES['rooms'][key]
            file = sample_file(key)
            path = os.path.abspath(os.path.join(OUT, f'{file}.png'))
            w, h, mean, low = build_room(key, room, path)
            write_sample(key)
            write_index()
            print(f'{key}: пол {w}×{h} точек, множитель в среднем {mean:.2f}, самый тёмный {low:.2f}, '
                  f'{os.path.getsize(path) // 1024} КБ, {time.time() - t0:.1f} с')
            continue
        parts = MODELS[name]()
        n = tris(parts)
        if name in PART2 and n > BUDGETS[name]['tris']:
            raise SystemExit(f'{name}: треугольников {n} — больше бюджета {BUDGETS[name]["tris"]} (blender/budgets.json)')
        ground = floor()
        bake_ao(parts)
        bpy.data.objects.remove(ground)
        path = os.path.abspath(os.path.join(OUT, f'{name}.glb'))
        export(parts, path)
        print(f'{name}: частей {len(parts)} ({", ".join(p.name for p in parts)}), треугольников {tris(parts)}, '
              f'{os.path.getsize(path) // 1024} КБ, {time.time() - t0:.1f} с')


if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [a for a in sys.argv[1:] if not a.endswith('.py')]
    if args == ['samples']:
        # только описания образцов и список — без запекания: когда в описании прибавилось поле, а картинки те же
        os.makedirs(OUT, exist_ok=True)
        for key in SIZES['rooms']:
            write_sample(key)
        write_index()
        raise SystemExit(0)
    # «room» — все образцы света (пилота и групп); «room.reception:S» — один
    rooms = [*SIZES['rooms']]
    main([r for a in (args or [*MODELS, 'room']) for r in (rooms if a == 'room' else [a])])
