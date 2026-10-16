# Лицензии ассетов пробы 3D

Правило студии: контент — только из названного источника с правовым основанием (устав,
`docs/06-content.md`, ADR студии 0012). В этой пробе — только модели под **CC0 1.0** и своё
(код). Генераторов изображений и 3D-моделей нет.

Все модели взяты **16.10.2026**. Страницы авторов (kenney.nl, quaternius.com, itch.io)
прочитаны в этот день — лицензия на каждой странице указана ниже дословно. Скачать файлы с
этих сайтов из контейнера агента нельзя (прокси не пускает), поэтому файлы взяты с GitHub:
у KayKit — из репозитория самого автора, у Kenney и Quaternius — из чужих публичных
репозиториев, где лежит **нетронутый архив набора вместе с его `License.txt`**. Перед выпуском
игры наборы надо скачать заново со страниц авторов и сверить (ниже — начало SHA-256 каждого
взятого файла).

В git лежат не исходники, а сжатые копии в `assets/models/` (`tools/assets.mjs`: лишние
анимации убраны, геометрия и анимации сжаты EXT_meshopt_compression, без других правок).
Всего — 6,7 МБ.

## 1. Furniture Kit 2.0 — Kenney

- **Автор:** Kenney (www.kenney.nl).
- **Страница:** https://kenney.nl/assets/furniture-kit — «License: Creative Commons CC0»
  (ссылка на https://creativecommons.org/publicdomain/zero/1.0/).
- **`License.txt` в архиве (дословно):** «Furniture Kit (2.0) Created/distributed by Kenney
  (www.kenney.nl) Creation date: 20-10-2018 16:21 — License: (Creative Commons Zero, CC0)
  http://creativecommons.org/publicdomain/zero/1.0/ — This content is free to use in personal,
  educational and commercial projects. Support us by crediting Kenney or www.kenney.nl (this is
  not mandatory)».
- **Откуда файлы:** https://github.com/RetroDECK/RetroQUEST, папка
  `assets/kenney_furniture-kit/` (архив набора целиком, с `License.txt`), коммит `dfa19a56`.
- **Взято** (`Models/GLTF format/`, файл → в `assets/models/kenney/`, SHA-256 исходника):

| Файл | SHA-256 (начало) | Где в сцене |
|---|---|---|
| `bedSingle.glb` | `ca00c63f9a12da31` | кровать в палате (перекрашена в больничные цвета) |
| `sideTableDrawers.glb` | `911145653c11b103` | столик в процедурной |
| `chair.glb` | `c8a11eec93e89e31` | стул посетителя |
| `chairDesk.glb` | `46406619186034cb` | кресло врача и регистратора |
| `chairModernFrameCushion.glb` | `fd3351b077cafbd5` | стулья зала ожидания |
| `desk.glb` | `0164fe828f028b32` | стол врача |
| `computerScreen.glb` | `5942cbad29a2d2b9` | мониторы |
| `computerKeyboard.glb` | `9d9135789de2120e` | клавиатура |
| `bookcaseClosedDoors.glb` | `ff33f535acdb1825` | шкафы |
| `bathroomSink.glb` | `39d4f19608cab7e0` | раковина в палате и кабинетах |
| `bathroomSinkSquare.glb` | `360853c822f268e7` | раковины в туалете |
| `toilet.glb` | `16165cfd03c56c2c` | унитазы в кабинках |
| `kitchenCabinet.glb` | `7238c57778935ae2` | лабораторный стол |
| `kitchenSink.glb` | `7b9610277d71f00d` | лабораторная мойка |
| `pottedPlant.glb` | `5b760eda2766f75f` | растения |
| `table.glb` | `ff1a94498d023957` | стол в комнате персонала |
| `rugRectangle.glb` | `a989d2d59c04e307` | ковёр в зале ожидания |

## 2. KayKit: Furniture Bits 1.0 — Kay Lousberg

- **Автор:** Kay Lousberg (www.kaylousberg.com).
- **Страница:** https://kaylousberg.itch.io/furniture-bits — «Asset license: Creative Commons
  Zero v1.0 Universal»; «Free for personal and commercial use, no attribution required. (CC0
  Licensed)».
- **`LICENSE.txt` в репозитории (дословно):** «KayKit : Furniture Bits (1.0) Created/distributed
  by Kay Lousberg (www.kaylousberg.com) Creation date: 08/09/2023 09:00 — License: (Creative
  Commons Zero, CC0) http://creativecommons.org/publicdomain/zero/1.0/ — This content is free to
  use in personal, educational and commercial projects. Support me by crediting Kay Lousberg,
  www.kaylousberg.com (this is not mandatory)».
- **Откуда файлы:** репозиторий автора https://github.com/KayKit-Game-Assets/KayKit-Furniture-Bits-1.0,
  коммит `96d5930a`, папка `addons/kaykit_furniture_bits/Assets/gltf/`.
- **Взято:**

| Файл | SHA-256 (начало) | Где в сцене |
|---|---|---|
| `cabinet_medium.gltf` + `.bin` | `a7861b1cf89dde7e` | тумбы в рентгене и комнате персонала |
| `cactus_medium_A.gltf` + `.bin` | `f7d7553ff773e6c4` | растения |
| `furniturebits_texture.png` (атлас цветов, вшит в .glb) | `de62db37a80d1801` | — |

## 3. Ultimate Animated Character Pack (ноябрь 2019) — Quaternius

- **Автор:** Quaternius (Tomás Laulhé), https://quaternius.com.
- **Страница:** https://quaternius.com/packs/ultimatedanimatedcharacter.html — «License: CC0»
  (ссылка на https://creativecommons.org/publicdomain/zero/1.0/); «50+ different animated
  characters, with many animations! … free to use in personal and commercial projects».
- **`License.txt` в архиве (дословно):** «LowPoly Models by @Quaternius — License: CC0 1.0
  Universal (CC0 1.0) Public Domain Dedication https://creativecommons.org/publicdomain/zero/1.0/».
- **Откуда файлы:** https://github.com/kimkichan1225/3DCommunity, папка
  `public/resources/Ultimate Animated Character Pack - Nov 2019/` (архив набора целиком, с
  `License.txt`), коммит `7a2464f7`. Официальная ссылка на скачивание (Google Drive со страницы
  автора) из контейнера недоступна.
- **Взято** (`glTF/`, у каждого — 4 анимации из 17: `Idle`, `Walk`, `SitDown`, `StandUp`):

| Файл | SHA-256 (начало) | Кто в сцене |
|---|---|---|
| `Doctor_Male_Young.gltf` | `4f39182b6ecff6af` | врач |
| `Doctor_Female_Young.gltf` | `2fd5082696aca804` | врач |
| `Doctor_Male_Old.gltf` | `882741dd558d5a4e` | врач |
| `Doctor_Female_Old.gltf` | `7574bea268ed05f1` | врач |
| `Worker_Male.gltf` | `324e2c95c31d11b9` | санитар (рабочая одежда, каска) |
| `Worker_Female.gltf` | `a1cb51a7bde77588` | санитарка |
| `Casual_Male.gltf` | `db66b2424af60d77` | пациент |
| `Casual_Female.gltf` | `87327963ab0f37d0` | пациентка |
| `Casual2_Male.gltf` | `9e8f23af968979cc` | пациент |
| `Casual2_Female.gltf` | `b614bfe01ae69e0d` | пациентка |
| `Casual3_Male.gltf` | `f84ec360f5379628` | пациент |
| `Casual3_Female.gltf` | `75cb6d7fa20674cb` | пациентка |
| `Casual_Bald.gltf` | `a75e2ade5703cd02` | пациент |
| `Suit_Male.gltf` | `d89d245d10c81ee6` | посетитель |
| `Suit_Female.gltf` | `37cbe38d428f57af` | посетительница |

Правки при загрузке (в коде, `src/assets.ts`): кожа у набора чёрная — заменена шестью живыми
тонами; кожа выше глаз (под волосами) — в цвет волос, иначе макушка просвечивает; рост приведён
к 1,55 м.

## 4. Своё — код пробы

Без внешних файлов, нарисовано кодом:

- **Полы и земля** — `src/textures.ts`: плитка, линолеум, паркет, трава, асфальт в 2D-холсте.
- **Стены, окна, наличники дверей** — `src/world.ts`, `buildWalls`.
- **Медицинское оборудование, которого нет в наборах CC0** — `src/world.ts`: смотровая
  кушетка, стойка капельницы, лабораторный анализатор, тележка ЭКГ, рентген-аппарат (стол,
  колонна с трубкой, стойка-детектор), пульт рентгена, микроскоп, штатив с пробирками, стойка
  регистратуры, перегородки кабинок.

## Чего нет в наборах

Больничного в бесплатных наборах CC0 почти нет: ни кроватей с бортами, ни рентгена, ни
анализаторов, ни капельниц, ни ширм. Поэтому оборудование сделано кодом из коробок и
цилиндров, а домашняя мебель Kenney перекрашена в больничную палитру.
