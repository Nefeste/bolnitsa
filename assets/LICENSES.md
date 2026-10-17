# Лицензии моделей игры

Правило студии: контент — только из названного источника с правовым основанием (устав, `docs/06-content.md`, ADR студии
0012); графика ПК-игры может быть и из генераторов, но только по ADR студии 0020 — с журналом и одобрением владельца. **В
этой части генераторов нет**: только модели под **CC0 1.0** и своё (код).

Модели — те же наборы, что у пробы 3D-вида (`spikes/render-3d/assets/LICENSES.md`), взятые 16.10.2026 из тех же
репозиториев и тех же коммитов (ниже). Страницы авторов (kenney.nl, quaternius.com, itch.io) прочитаны в тот день —
лицензия на каждой указана ниже дословно. Скачать файлы с самих страниц из контейнера агента нельзя (прокси не пускает),
поэтому файлы взяты с GitHub: у KayKit — из репозитория автора, у Kenney и Quaternius — из чужих публичных репозиториев,
где лежит **нетронутый архив набора вместе с его `License.txt`**. **Перед выпуском** наборы надо скачать заново со
страниц авторов и сверить по SHA-256 ниже.

В git лежат не исходники, а сжатые копии в `assets/models/` (`tools/app/assets.mjs`: у людей оставлены пять анимаций из
семнадцати — `Idle`, `Walk`, `Run`, `SitDown`, `StandUp`; геометрия и анимации сжаты EXT_meshopt_compression; других
правок нет). Для каждого файла ниже — путь к исходнику и **полный SHA-256 исходника и сжатого файла**; то же —
`assets/models/sources.json`, и тест `tools/test/catalog.test.ts` сверяет сжатые файлы с ним. Где какая модель в игре —
таблица `src/render/catalog.ts`.

## 1. Furniture Kit 2.0 — Kenney

- **Автор:** Kenney (www.kenney.nl).
- **Страница:** https://kenney.nl/assets/furniture-kit — «License: Creative Commons CC0»
  (ссылка на https://creativecommons.org/publicdomain/zero/1.0/).
- **`License.txt` в архиве (дословно):** «Furniture Kit (2.0) Created/distributed by Kenney (www.kenney.nl) Creation date:
  20-10-2018 16:21 — License: (Creative Commons Zero, CC0) http://creativecommons.org/publicdomain/zero/1.0/ — This content
  is free to use in personal, educational and commercial projects. Support us by crediting Kenney or www.kenney.nl (this is
  not mandatory)».
- **Откуда файлы:** https://github.com/RetroDECK/RetroQUEST, папка `assets/kenney_furniture-kit/` (архив набора целиком,
  с `License.txt`), коммит `dfa19a56`; файлы — `Models/GLTF format/<имя>.glb` → `assets/models/kenney/<имя>.glb`.

| Модель | Где в игре | SHA-256 исходника | SHA-256 сжатого файла |
|---|---|---|---|
| `chair` | стул посетителя и процедурной (перекрашен в белый) | `c8a11eec93e89e31250ba91afc1b8d56c3bec7ae86640fd1239f595ff4180883` | `64fba1d5d436c8e35f2c22125e353f2614fe181f9ba7c0a3ed39466f6e033e79` |
| `chairDesk` | кресло врача, регистратора, медсестры, рентгенолога | `46406619186034cbe92b19b79a5f1a8e3f442a17a70a7524ef2c0ad0f35095c6` | `f6c86c1441b59deb9213cb06618045730173d0e2f1c09260ffdee348258e01fb` |
| `chairModernFrameCushion` | стулья зоны ожидания | `fd3351b077cafbd54224e20fa7a3a1b4a4304019cf44c25a6e7709ad71b852b8` | `8676d44facb9041d4e9321041bfb6c210d841ddc59acbded89b6638a12bca72a` |
| `benchCushion` | скамьи коридора | `5186ad938f8b9eff255361fd1fdc48a81f08c318161cde27c93753ab95a2d354` | `4ac45cc1b12c8b65c87c7a0b6ec6fe70038981513365bd9f9c9fb4467e1fe37b` |
| `loungeChair` | кресло отдыха в ординаторской | `ddfe6bc4b3451bca61666d7b614552d6ed2a03d82fc76244b72ae3155874dc6c` | `f9a4670b44b9411d531dd98c5e14a1b99975469df50608765ee95e0fbe3e2805` |
| `desk` | стол врача и ординаторской | `0164fe828f028b321730fb8c74502e353583f751be74da1682d42fff7d3c5a42` | `1847e666a996b738db965bd39fe5c94bf23e3010a7051c10a4d34826b2538daa` |
| `computerScreen` | мониторы на столах | `5942cbad29a2d2b956619569926e81d50a4174403d592fece6556e57632dc643` | `9ccd873c6e977d62cee111988b663d0f55d8460010dda73fe7d5fcde3842f480` |
| `computerKeyboard` | клавиатуры | `9d9135789de2120e9f41ce3f0a56dd1b15f40adcc7888739bb842a2d820da322` | `95c4c66500dcdc6ae4fe98621d6ceb787a0e89fb16bafe478d8d49ac87f5231e` |
| `bookcaseClosedDoors` | шкафы | `ff33f535acdb1825c0e958a293642b39665adcae0b1317b650e83d2bb687f4e2` | `f5a696eddfcc9ee604863552d8f9a0dca1d5a34b8fd00f778bc5e6db650c445b` |
| `sideTableDrawers` | тумбочки у коек | `911145653c11b103b2c2e84f3d019205d1886186015c3b52aceddc3801ae8fdf` | `0f52527265b8c5686e8226b1c91373ba490e04ee1a30140137b81d9a77d3fd95` |
| `table` | столы ординаторской | `ff1a94498d023957f4bc3ff6f55a7a82977d336dbf01a573b3364f03afe5ff61` | `3e510b1b302acf3d2e2ecb7ec4528b521b3dd5bcb041836009efe6dfea268eef` |
| `kitchenCabinet` | лабораторный стол (тумба) | `7238c57778935ae25db5e57e9f7af3ba7068c71b005ff7cfbff3b6f3b1a13200` | `ab66ac84b3d7aaa4d71e4e1de1f6121408af8bd5da1a3fcb46cd31e98ec08bd9` |
| `kitchenSink` | лабораторная мойка | `7b9610277d71f00dcf1bba49cf4d98d77ce5177e84bf76c7da2f8893e542f743` | `e80434e5f0812e6113e9005b8449efa72a1b661122fdbbff7686d755f1b275db` |
| `bathroomSink` | раковины | `39d4f19608cab7e0fed52303b2c689f5f51fae1bad9b6913cb53d838875e797e` | `7cec1daddb1cc104686537f901ae3fbb2b13368917473a7bb77444d7f08bb58d` |
| `bathroomSinkSquare` | раковины санузла | `360853c822f268e7267c62ef20cf646f170a13d76254cc0804a1d397a4a3ea67` | `3cc00304db5939a3a7c39527dac8ce39bcb385d404fd1d0473aa5e99b127ac2d` |
| `toilet` | унитазы в кабинках санузла | `16165cfd03c56c2cb443b800570810a22ef770f65e7a468f6761d9dc14eaaeae` | `83de6a23f27a45394f3c09b97cbff13cf104925f3085fc7f74b6eaa984b24c52` |
| `pottedPlant` | растения | `5b760eda2766f75fda36b2c5df652a1662f82981ef64cd8fa7fe7bcd386b3a15` | `2fbb12212c2e575f96be4cb2fbae4d1577143e948981292c4c4fd81a54ff2cf1` |
| `rugRectangle` | ковёр зоны ожидания | `a989d2d59c04e3071e0c90388b113a9a8f339ce1814ef984c51cb6dcd7c8e0eb` | `15b03e4680e406e177ceb912023c0ffbf5e7dd0aa50af2713a93a610940594fd` |

## 2. KayKit: Furniture Bits 1.0 — Kay Lousberg

- **Автор:** Kay Lousberg (www.kaylousberg.com).
- **Страница:** https://kaylousberg.itch.io/furniture-bits — «Asset license: Creative Commons Zero v1.0 Universal»; «Free
  for personal and commercial use, no attribution required. (CC0 Licensed)».
- **`LICENSE.txt` в репозитории (дословно):** «KayKit : Furniture Bits (1.0) Created/distributed by Kay Lousberg
  (www.kaylousberg.com) Creation date: 08/09/2023 09:00 — License: (Creative Commons Zero, CC0)
  http://creativecommons.org/publicdomain/zero/1.0/ — This content is free to use in personal, educational and commercial
  projects. Support me by crediting Kay Lousberg, www.kaylousberg.com (this is not mandatory)».
- **Откуда файлы:** репозиторий автора https://github.com/KayKit-Game-Assets/KayKit-Furniture-Bits-1.0, коммит `96d5930a`,
  папка `addons/kaykit_furniture_bits/Assets/gltf/` (`<имя>.gltf` + `.bin`, атлас `furniturebits_texture.png` вшит в .glb).
  SHA-256 исходника — у файла `.gltf`.

| Модель | Где в игре | SHA-256 исходника | SHA-256 сжатого файла |
|---|---|---|---|
| `cabinet_medium` | тумбы в рентгене, КТ, МРТ, ординаторской | `139419c479c6f8b38ac24e12ce85bf81a199e05067a544db879f7e403446c9dc` | `bcabe770c32ca6eb1129da233f19db55789e59ead7c84d8b42471e8ac7a992a3` |

## 3. Ultimate Animated Character Pack (ноябрь 2019) — Quaternius

- **Автор:** Quaternius (Tomás Laulhé), https://quaternius.com.
- **Страница:** https://quaternius.com/packs/ultimatedanimatedcharacter.html — «License: CC0» (ссылка на
  https://creativecommons.org/publicdomain/zero/1.0/); «50+ different animated characters, with many animations! … free to
  use in personal and commercial projects».
- **`License.txt` в архиве (дословно):** «LowPoly Models by @Quaternius — License: CC0 1.0 Universal (CC0 1.0) Public Domain
  Dedication https://creativecommons.org/publicdomain/zero/1.0/».
- **Откуда файлы:** https://github.com/kimkichan1225/3DCommunity, папка `public/resources/Ultimate Animated Character Pack -
  Nov 2019/` (архив набора целиком, с `License.txt`), коммит `7a2464f7`; файлы — `glTF/<имя>.gltf` →
  `assets/models/people/<имя>.glb`. Официальная ссылка на скачивание (Google Drive со страницы автора) из контейнера
  недоступна.
- **Пропорции — мультяшные** (голова — около трети роста). Геймдизайн (§13) хочет людей обычных пропорций; в CC0 одетых
  людей обычных пропорций с анимациями под рукой нет — вопрос у владельца (пилот генераторов, `Nefeste/bolnitsa#15`).
  Отрисовка от пропорций не зависит: рост, опора и посадка меряются по модели (`src/render/bake.ts`).

| Модель | Кто в игре | SHA-256 исходника | SHA-256 сжатого файла |
|---|---|---|---|
| `Doctor_Male_Young` | персонал (цвет халата — по должности) | `4f39182b6ecff6affac27f7c4cb2abf9529d68be4a77cc71343b40a83fe6e0cd` | `a5287a16a3735fcfc75b440218df747b58c63bd61338cccab4ca4f778fcb187f` |
| `Doctor_Female_Young` | персонал | `2fd5082696aca804d77555eff96f6e07c11549e4f03661ce2467e2b9f881e5ab` | `677cfae07fd11baa18cdf24a6141b855f659f5ae6e9a23a249c2f11e85862029` |
| `Doctor_Male_Old` | персонал | `882741dd558d5a4e91704c6ef88f2979f9c34d956f2da6ce83aca80e5f43a6ab` | `cad5beb6c8fa106894705726a4c725ace66c3b3211a22acd5b680c2cf9c5334b` |
| `Doctor_Female_Old` | персонал | `7574bea268ed05f11bb1e4a16fdf36ab6302051b5514f20e12f4befb4c99b172` | `0aa4cd25132ce657ad673dec7df83d4d1b822a9aa2cc5d1de68e2ea194a9f936` |
| `Suit_Male` | регистратор | `d89d245d10c81ee637116b3400657dad2873ec1bbfb7f90579b2f77a8779fa5b` | `e593798e03c68edd74bdba8861bcd4df0258d2f7865a665f881521a38cc0be62` |
| `Suit_Female` | регистратор | `37cbe38d428f57aff788be0f585fb9892b6115cc014c494cb19ec65c621e1f07` | `20ee4b1b6812f70ec2e6aa98a6dfb2e489691607c89f1884ee683567f5ce7974` |
| `Casual_Male` | пациент | `db66b2424af60d7799760795ca63c8a5be1c8af64e9f134217f0a3ff9e405379` | `e1d4018b01f851c8236e0648a208bec24cb653a7e924bbd1fb995222dae7e721` |
| `Casual_Female` | пациентка | `87327963ab0f37d004c7340d130808727f3d67b724c3d41aad01fd63c7d6fc8a` | `3013a3e5cc765eaf1bd43a0e0e0bb67eb45ae948e3c93e29ab2b992862632857` |
| `Casual2_Male` | пациент | `9e8f23af968979cc6945d11015d9fd3cb1e94d53c3b91c39cac39a80e7490a79` | `a83778988838e5e31282d0f258b9173b95f10438d964fce81ed3c66d0dde5cdf` |
| `Casual2_Female` | пациентка | `b614bfe01ae69e0d9dfdfb6ff74fb53abfcc32be59858a9b89fb05ffd3062324` | `ee38ad91991e33c655b729a82221391578ea5a44c5196e0eba8d8e27564800a3` |
| `Casual3_Male` | пациент | `f84ec360f53796287cfdb6082ad82fd76464dc34845759ca7f1f2ee9e7604057` | `a93b5f2826ccb14007c4740e9247913fdba59c213091b78a786b50974dd45fc1` |
| `Casual3_Female` | пациентка | `75cb6d7fa20674cb6b1dc3ad4e3c6d0d1de03f0128817ba60dcc4fad4ca008a2` | `8be063ff5ebf3f753887364b813b880d5f495dd1f3d37b0627d674c7b8ace634` |
| `Casual_Bald` | пожилой пациент (в наборе нет бега — бежит шагом) | `a75e2ade5703cd02371d7f38bb6ab307d94a7db2f07d4a219f9248fdecab5e6a` | `1023a993fb3bc2e559dd1825514334cb8684adf51d0a28cf371f6d1c2b58c4f1` |
| `OldClassy_Male` | пожилой пациент | `9ac226f58ee2f80acb2cd4c66f15cfb210937ee1744b9465425f796aa900d9b8` | `07bf3c62b1c84806eceee5fb2a741877eac20c9817af11a9e579a6c9da1fdc79` |
| `OldClassy_Female` | пожилая пациентка | `0c116d90c588f357e6537f12bdab5f377f6cb30590f29826092824dc55f7c5eb` | `4ec6f8d6a7a585a5afaa1e371a721a6f57f70b4a833cb229ff723043622454ee` |

Правки при загрузке (в коде, `src/render/bake.ts`): кожа у набора чёрная — красится тоном кожи экземпляра; кожа выше глаз
(под волосами) — в цвет волос, иначе макушка просвечивает; одежда (халат, рубашка) красится цветом экземпляра — по
должности или зерну пациента (`src/render/cast.ts`); рост приведён к таблице `STATURE` (1,76 и 1,64 м, пожилые — на 4 см
ниже).

## 4. Своё — код игры

Без внешних файлов, нарисовано кодом:

- **Полы и земля** — `src/render/textures.ts`: плитка, линолеум, паркет, пол операционной, плитка двора, газон, асфальт —
  в 2D-холсте.
- **Стены, окна, наличники, створки дверей, светильники** — `src/render/world.ts`, `doors.ts`, `lamps.ts`.
- **Медицинское оборудование, которого нет в наборах CC0** — `src/render/furniture.ts`: функциональная кровать с бортами,
  стойка капельницы, смотровая кушетка, рентген, КТ, МРТ, операционный стол с лампой, наркозный аппарат, аппарат ИВЛ,
  монитор с дефибриллятором, тележка ЭКГ, лабораторный анализатор, аппарат УЗИ, эндоскопическая стойка, стойка
  регистратуры, пульт рентгена, столик для инструментов, процедурный столик, микроскоп, штатив с пробирками, перегородки
  кабинок санузла.
