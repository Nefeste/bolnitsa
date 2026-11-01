# Лицензии моделей, шрифта и значков игры

Правило студии: контент — только из названного источника с правовым основанием (устав, `docs/06-content.md`, ADR студии
0012); графика ПК-игры может быть и из генераторов, но только по ADR студии 0020 — с журналом и одобрением владельца. **В
этой части генераторов нет**: только модели под **CC0 1.0**, люди Microsoft Rocketbox под **MIT** (раздел 4), шрифт IBM
Plex Sans под **SIL Open Font License 1.1** (раздел 5), значки окна Carbon под **Apache 2.0** (раздел 6) и своё: код
(раздел 7) и модели пилота Blender из своих скриптов (раздел 8).

Мебель — те же наборы, что у пробы 3D-вида (`spikes/render-3d/assets/LICENSES.md`), взятые 16.10.2026 из тех же
репозиториев и тех же коммитов (ниже). Страницы авторов (kenney.nl, itch.io) прочитаны в тот день — лицензия на каждой
указана ниже дословно. Скачать файлы с самих страниц из контейнера агента нельзя (прокси не пускает), поэтому файлы взяты с
GitHub: у KayKit — из репозитория автора, у Kenney — из чужого публичного репозитория, где лежит **нетронутый архив набора
вместе с его `License.txt`**. **Перед выпуском** наборы надо скачать заново со страниц авторов и сверить по SHA-256 ниже.

В git лежат не исходники, а сжатые копии в `assets/models/` (`tools/app/assets.mjs`: геометрия сжата
EXT_meshopt_compression, других правок нет). Для каждого файла ниже — путь к исходнику и **полный SHA-256 исходника и
сжатого файла**; то же — `assets/models/sources.json`, и тест `tools/test/catalog.test.ts` сверяет сжатые файлы с ним. Где
какая модель в игре — таблица `src/render/catalog.ts`.

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

С версии 0.31.0 людей Quaternius (CC0) в игре нет: их место заняли люди Rocketbox (раздел 4), файлы
`assets/models/people/` удалены. Раздел оставлен, чтобы номера следующих не сдвинулись; прежняя запись с SHA-256 — в
истории git до 0.31.0.

## 4. Microsoft Rocketbox — люди игры

- **Автор:** Microsoft — библиотека Microsoft Rocketbox («Copyright (c) 2020 Microsoft»).
- **Страница:** https://github.com/microsoft/Microsoft-Rocketbox — `README.md`: «The library of avatars is now released
  under MIT License.» Репозиторий в архиве (только чтение); `README.md` и `LICENSE.md` — на том же коммите, что файлы.
- **Лицензия — MIT, не CC0:** к копиям прикладываются строка авторства и текст лицензии (ниже, дословно). Этот файл
  входит в сборку игры (`LICENSES.md` рядом со страницей, `tools/app/build.mjs`); в игре строка авторства будет в
  титрах, когда они появятся (spec `docs/specs/2026-10-people.md`).
- **Откуда файлы:** коммит `0943055db6ec570bcef9f2c8b41c9e5467c808f9`,
  https://raw.githubusercontent.com/microsoft/Microsoft-Rocketbox/0943055db6ec570bcef9f2c8b41c9e5467c808f9/… —
  `node tools/app/people.mjs --fetch <папка>` качает их и сверяет SHA-256 с `assets/models/rocketbox/sources.json`;
  `node tools/app/people.mjs <папка>` собирает файлы игры заново, байт в байт.
- **Что изменено** (`tools/app/people.mjs`): скелет Biped (81 кость) сведён к 23 костям тела с именами игры — веса пальцев
  отданы кисти, лица — голове; одинаковые вершины слиты, добавлена упрощённая сетка (около 0,8 тыс. треугольников);
  цветные текстуры уменьшены до 512² (принадлежности — до 512 × 256) и сложены в атлас 1024² (WebP), карты нормалей и
  блеска не взяты; **убраны эмблемы, надписи и логотипы**: на бейджах врачей — красный круг с белым крестом и надписи
  «St. Hospital», «Your Name» (фото осталось), у фельдшеров — «PARAMEDIC» на спине и нашивки на груди и рукаве, на
  одежде пациентов — надписи, знаки и фирменные ярлыки, на поясе строителя — «RocketBUILD», «COOLTOOL» и наклейки
  (закрашены цветом вокруг или заменены соседним местом той же ткани), иероглифы татуировки — кожей рядом; вид
  `Medical_Male_04_Scrubs` — тот же `Medical_Male_04` без шапочки и маски; маска PNG — одежда, которая красится цветом
  должности, и непрозрачность прядей; шесть анимаций на каждый пол (стоит, идёт, бежит, садится на стул, встаёт, сидит):
  у шага и бега вычтено смещение корня, у посадки и вставания срезаны неподвижные кадры, из петли сидя (33–36 с) взят
  кусок 3–8 с, который продолжает позу посадки и замыкается сам на себя; рост приведён к таблице `STATURE`; геометрия и
  анимации сжаты EXT_meshopt_compression. Других правок нет.

| Вид | Кто в игре | SHA-256 `.glb` | SHA-256 `.mask.png` |
|---|---|---|---|
| `Medical_Male_03` | врач, специалист, лаборант — белый халат | `86fb2d10d9107fa0e343554e2a9e4f6056f35c91d73b19e91fd377fdc5776ca0` | `9e682e50a3d04a15a42cb3dcf6b0df859362df3de37f02f99ebb6d0067162c50` |
| `Medical_Female_02` | врач, специалист, лаборант — белый халат | `32cacd07c7c9969ac7ef660b61871491f9b0f835dd2b59bf9f001f708bf7278a` | `6d6af96a0bdbbf1b7d37f711478aa9aa974a8b97558aecd6638a8c1b77c16177` |
| `Medical_Male_01` | врач, специалист, лаборант — белый халат | `80610b0ff6b3c2e68d739beae586c92cc3fd728c0d390c94c3c5508fe24c9885` | `236c114256de1cef8f962563e2a1efc9753be4560e2847bc8267bd4b913b110b` |
| `Medical_Female_01` | у женщин: медсестра, операционная медсестра, санитар, хирург, анестезиолог-реаниматолог, рентгенолаборант | `39b8ef82de7bb56c445ca857ef56594cde4692412e4aefa657ecdd62937fe055` | `a82c6bef01fb404756346d3422843ec73c664de701dc5227b91b7b5cbc04beda` |
| `Medical_Male_04` | у мужчин: хирург, анестезиолог-реаниматолог | `fdcc040de38a5404c3e58f8d1b0dc7771101014fadffd506dc9822dc12f8b9a2` | `cda768ca269074e628c3291406d0c69145a9f20964c5d00c4da1ad5f5ab39070` |
| `Medical_Male_04_Scrubs` | у мужчин: медсестра, операционная медсестра, санитар | `0b489e26e1c0b4b7c0465dff0c1cf0f11b85d0965ed38d1663eb2916633b96a4` | `76a653f6a45e16fe115362b532dcd277cbdbc560811acf389855b9b07f7f7b71` |
| `Medical_Male_05` | у мужчин: рентгенолаборант | `5101b484aad152e62ee908e459cd1ec12b3aef15403a7582340ba49d6cf86ad2` | `82c919fea3f4e9e342ed07d0302a7f4b7e07e22deb104f56bcdd3db473f1d3a9` |
| `Medical_Female_03` | фельдшер скорой | `d16f24694c589f433b1f3c44a5b5295a15c61ea43ee20363331bdc2a6b45dc34` | `955583e330d2a89d9fa5a2d448fbb2d26441a882217a5b5857fa1aea5d7d7217` |
| `Medical_Male_02` | фельдшер скорой | `9bcdb0a603bac7ab261d3fb5ceca7db6d1a5cc22e46b96fbd3eadb4bad69143a` | `fe36997790a174149b94728c2ec5d02682c5a643e41a135942e08737ee87540e` |
| `Business_Female_01` | регистратура | `08083eb59f12a7e5ed488d2879664fb93680f032f80df0c46fcb126379c07559` | `afcdc26bebdef89c41a7aba0073c5b27f5b74ccbcb3b71557f0cae6a0dae77c5` |
| `Business_Female_03` | регистратура | `992e47ab7e715b8f9f70d819df10842a410c70af79ff545fb7e332951f23c940` | `8ddf255143d37fc382cf93b3ba178afaf4ae607a67223fc198a8cf5422fefba5` |
| `Business_Male_03` | регистратура | `c98d88c3d0280cc479396e858c59f420c9c7ee4ae657d068c10e03621cb246a8` | `c6647b4d8cea3bf07f312da2474746be0862d283306a03b450f8726122347263` |
| `Business_Male_06` | регистратура | `fbf1597aadcd9f1e52b8b7ffdc0451d106e419ebdcdaf726c4f53fdcc15932dc` | `83708ee9747647177a5abb66be3ada6ae9b07ce3ec34c7513137cae068536c3d` |
| `Female_Adult_01` | пациентка | `01a714fedf7b7be596da7ffc0f7a301c70c0ecc84f6adf0ec144e4be4e24b8b5` | `23507f7dea4242a6c42448b5a0fd0455d548eaafe94ac67c2c10a3fe53bab9b2` |
| `Female_Adult_04` | пациентка | `b53fdbe68574e7c57e9c03b58eed9b6b9830b17071d9dd0773e6ba402500a9dc` | `b4c117634743b27f68a9a324c4e29557ec756152ac2e3180dbe1050d0935bc14` |
| `Female_Adult_05` | пациентка | `b33f3f3b753fa4f4b8fba457ea3cb40581c2ad97199144325acab0c6362483a7` | `a24309f1508f373243d14007e5d14f1129e801e2eb6c4cbdb5e18684a2e5961f` |
| `Female_Adult_07` | пациентка | `8d519591f431d5c474511e0e23cf8c4a4f454d1a63c120ab203ac171a3a2c94e` | `4d10f0bb1c45632a8bf71d93ddd4198f572ff0e3526ed1b132ea51bb37171a26` |
| `Female_Adult_08` | пациентка | `c9ee8d69e71af499da0e38135983b42eff40f6c99a7eb1ad97e2ec0decae73b2` | `ee698e02e859372b9c785710f59e0660f743783f2e677923bddf73942c5c71ba` |
| `Female_Adult_09` | пациентка | `7409e29f9a14d750ea355a5df4774785dc98bb23c98688b1979a11f05d8dfcfe` | `fbefa95f903d0f829f94f170885859ca99c374d27213d833e36ccc7d858e4baf` |
| `Female_Adult_11` | пациентка | `513ca0e784d01c0ac491a32fecd589c76bca9956929f95a3a440aec7de9cabda` | `225e37d3d1eb67f01b5eda9b113a6302998d2e32250b47d34a74dfa0e0bd2c13` |
| `Female_Adult_13` | пациентка | `5b72d8a27290fe5a8b96b2ed11ca6302399ed93e8d7716a1ea2585afb1ff6195` | `9ea1b409b90206322901d1ea621b61a4ea1f3ca7a9c0a4de58ee36a07aa805e2` |
| `Female_Adult_14` | пациентка | `44d8b82b6f448c3398c048ffac73206d37efd3ac40215cb526fd92f5cc253355` | `02431ff0d436441bb38dc4fb414b14aeaf4d5f2e4540a8c9ba129c0a160b4f23` |
| `Female_Adult_15` | пациентка | `3eb100e0fce0bd9f957b5ec8753f27d38977ae95ee6137a095ed6b706b28a4cf` | `13caeff1ad25c57f2e999c08ea3d63297d94492232ea108e5d8e16aaadab66e6` |
| `Female_Adult_17` | пациентка | `bd547826f0a5248ecff9a6a28ab1b0bdd423bc648729189ae058da0026fdc459` | `00be8e89c327729ae94a2b89ddf48d7e3d5a93f7ffd727cac2b14bd275b3b214` |
| `Female_Adult_03` | пациентка | `1f506f888309f69c5a5141cdd005acfcaa32b101148d6071676e074abbc37cf2` | `222e8af3a65f76dd28243b8f49992270793fe349c0c16424f491396b740b907f` |
| `Female_Adult_12` | пациентка | `fe0aa2211e6bab35ad954caaa7a5b9c7f08b70375bbfa67e5da2f1818d490294` | `159a6c55e99827f3f369ebd4c854a9b8a4358f7cd1dcb9cd9a29904c71ef24d4` |
| `Business_Female_04` | пациентка | `66d41af0e660704c18a66e764897b360123e974ee4298f64231a9805953865d1` | `517684005fe1c23748d5ce2e1b737ffe57740332767c57adf8415b026635a03c` |
| `Female_Adult_02` | пожилая пациентка | `62335e0a59d9e843201348df825bf46a3e2d34107173682aa9fef20d24f92fc8` | `2d88655854fddc2c891347b6eebf865d91890aa2cf93c8ebf48b747c7a976d08` |
| `Business_Female_02` | пожилая пациентка | `aea2cd71ef77f367f7a0b656c0302d1bea4ccfcab8307aa13c6df18984a4d90a` | `57ce726303cfccd322a3360281698bae8a55cdec82a2d7bc56c612770c492647` |
| `Male_Adult_01` | пациент | `ee4736e455a69945a35b8ff7a391569b48ff5c1f46a0e10098e93f8bfc8ff8e1` | `0614a4e9077699e8c3555ebb0df119666d498809e0534d9d3e278305d0de6be9` |
| `Male_Adult_02` | пациент | `e9d2cca0adc206869ae7eb4daad9d6f2bf3eabf9872a07c4b4224824a2f66184` | `af9b25e27b6bbc3813fe10d3fd15c357b5648bcfdcae1a40564f9eacca8491fd` |
| `Male_Adult_04` | пациент | `831bb010f98c7e6af3cd14fa2d7d40cc47911b4a1b1513b73568f588d8afcce7` | `51153d96b87e188f3aac6458706de9cbbdc96984b4b196093bc6ecf89ee5a9f4` |
| `Male_Adult_06` | пациент | `47961e5883decb33d6d84e3a0806b0f0b269c431c9d6a2e8fe3e171c23ee401a` | `5fa625c86a30e7448263e2f4961b24f4798a333374280579ff638b535d6cd7b6` |
| `Male_Adult_07` | пациент | `061b2598352adf7bd276f3afc19693b5e35bf2ad69deaf7f9140c3ac7e361605` | `d2eeec8c43320a89fdac5ce5510543b16f2d8b48a2e6779b31ecea98355eb1b5` |
| `Male_Adult_08` | пациент | `c3fa195896e38b9e9f4f724f521730c1c00609ab7037f258b14fb2609291fdd1` | `eb88c5ce68cb0ba49e625ada97ec2019d2b4b15482af0f06a73797696d9e0b45` |
| `Male_Adult_11` | пациент | `38ac32f44bcc79cc3ac66e40d78b2e0dbb24954d49791f7bd9f171ebaae0a3a6` | `631e44cd44eeb49a342905dcac5944b7488e7595d2cda5bb59c3e58e6dc81f71` |
| `Male_Adult_12` | пациент | `92be8406ef237728dba8617df96bfaa94a63f4b1c52a1af3da021ada91a5e960` | `57b4cfb9b2b39a0e90e7054c775a5e041b978aef95c071708d4587a97be1a182` |
| `Male_Adult_13` | пациент | `bb7fabd46c3d5a5bd0a0b192343b2ca85c8c328073fe40b8465f7483dca40e30` | `05cb1a6e1d9eb578addfd668a6e7a754fb19fab3ebc116f5b1d3408a34a459d3` |
| `Male_Adult_14` | пациент | `fc8f33c793c3336a1324d695e16107e8bbdcf8d81ab14f0451d7f0e0a5b9d9ee` | `099046b6aac7b258a794c698008928a6a2d566fce31a4799826009deb8c117e4` |
| `Male_Adult_20` | пациент | `9b784f0a1ee37d0cd12fb827f1d2354597b24f85fcdca4c802e8862c15fc89c6` | `bf860f2520fdd149d5513156ecfef27f280520c6f47b879d1e7514fb880e05da` |
| `Male_Adult_09` | пациент | `6957fa3d03f9430238e6f002e95e52dd97e88679d981d724871a829e4c2b24fb` | `2d826f1d5efaef0447f76df89920c12b3849e8f07e393d48c7b40a5485660135` |
| `Male_Adult_10` | пациент | `53954ae4bdbdc7df845a19f28586f8a7d80c4789038e319531171fe1b0e0263b` | `81faefcef6bf237422ce3ebf57298c6e586f651a6786ff43af517c879d7797db` |
| `Male_Adult_16` | пациент | `c17f671847b923a3d22edb1495f46125e23fbc2b7559c6354a541d2eea7b858d` | `0b754a057725ab59505d00bac27cd981e2a4834e912b247f9885f41046d74c83` |
| `Male_Adult_17` | пациент | `ba4da0f8d1143e74b8f038e531ccbe1bdc7c5497d5e1f1970121aa5440c9ddf2` | `92c49a6e625e3d1134dfd4a30628d6172bcfee7c500b75ca6d27548d3f49421a` |
| `Male_Adult_18` | пациент | `d44b063fa25bee90ca339fc1a83570fb337d350dd9bea20001ad93619fa19732` | `8f4700028f106ccd2e3b5b3c4b41677887e1fd903a94a366104d69de499107ed` |
| `Business_Male_01` | пациент | `e326633c3cf9d5ec531cb3b4334635aabd3706a638869803ee5327f5e473cae0` | `d5d94e55d09596943517261c35a6465ed3f61af2f384401434ee749f7020816f` |
| `Business_Male_02` | пациент | `02f37cd6fd889b3fe63bcbdd701b68539d12b3ef6553cec18ab1b4f08011211c` | `e26b7757dc93e23a61f214c6464a6ef4031ccbdd0b7a51c6f409149e48f19eec` |
| `Business_Male_04` | пациент | `c5ad50c37772f39e58e6c5a6464ae3a1bd213382bb0306fe0fe79b1ca051b9d1` | `3f47fe1b3cf8c2c7a69eacd080e1171b1e0eec7ee9ac9896367a8b9bf1403fcf` |
| `Business_Male_05` | пациент | `792c8ee0ebf0327e414f56c2fb9e3aa6cf52624ef7190a1c4d41fc247094c81e` | `4bc1569b269a63786313707b7f868d03808b0159800c635250f6b591c1d7e3a5` |
| `Delivery_Male_01` | пациент | `6edbbce7fa27240f22e9606bbc56cff91098d716d50856979bdeb2dc96493ef1` | `575563d093a6ca501493bb5587c1c5c6c531c0361811fa7e713b40f5624a4b08` |
| `Wood_Male_01` | пациент | `dd57d37a15560b333e8d159d8b4ba6c962ea7ccbf0edb887763416a85f3acf6c` | `6c567e91b12a39f562d3b7fcc5e05a21677b2e77bff6899a9b4ed035f9a7f409` |
| `Male_Adult_03` | пожилой пациент | `a26cf7368fc54d0bcbebb6280458a785d3c58d0734be1a7db405b73e37dbd581` | `d5c66b7200e5d4c248293deff13fb433a892dd046ae6f5c509283ab4377df2c5` |
| `Male_Adult_05` | пожилой пациент | `2bb2eeb914c02f90f16d3bfb2be5873c25f3586a0ecc413658d2c4b66ff8026f` | `5491a9ad03bbcff5c6268928b7b4e01e4678b8fe1b5922d5cda4e2d84f4b98a5` |
| `Business_Male_07` | пожилой пациент | `dfe05893393fd6705c9d29d8cc1eab97826778c96e61b3af89ff893fbd125d0c` | `9797e153e607f66dc1b3797e37ee126c873dc3377b06c1607b39a336f50bc59e` |
| `Gardener_Male_01` | пожилой пациент | `d4e49efa7139393014fec4db964353d549d8bf57ebdb097976f1a27c3c6e1c00` | `1abe672513754e43fcc9fc8c56fa3c0dedc3805b173a7e3f90b8d41dc7c3c12d` |
| `Construction_Male_01` | пациент в спецодежде — строитель | `3c88f0fdda5168d8ecd63323dfd79447ba11433f47a39b48f0eff5238a1c8ce6` | `8587b44eaa52c79a629b60b69252cebb6572e7dffd23011843d1de21babe6501` |
| `Construction_Male_02` | пациент в спецодежде — строитель, сварщик, шахтёр | `9c15d87b6dfe4e05bf086f5586d8513ab19d08c53a0807005bf0b86b442c6857` | `2a0989c3fe1b2e0b16e4d2877f220a665d92612149600bbac1b70b3c7806686d` |
| `Construction_Female_01` | пациентка в спецодежде — строитель | `222979ea2b182ada749b85d4a9de1dfcd0377c0b6e208eea1affb2ed6bc3bdde` | `f92f36bdacc67ca8c5f7beada0875c9c6ba2bbba35ce189f8a9fb5393df6aa4b` |
| `Chef_Female_01` | пациентка в спецодежде — повар | `51becf2162851bd37f7d11567a23fcded70c06d89de7f7ee6e9bfc9f04b2d843` | `e28eaef2d888b7d07163f21617c9de4f64baf1db88faac45cef83f1b4128f401` |

Исходники — путь от корня репозитория набора и полный SHA-256:

| Файл набора | SHA-256 |
|---|---|
| `LICENSE.md` | `17474e386e0b9e1a700cc3d06b2b0882a2c376d9c6b49c7f8274409b8f8d2352` |
| `Assets/Animations/all_animations_max_motextr_static/m_idle_breathe_01.max.fbx` | `281735704260d96e882d13e3c77d0ede00ed5d2e40805cd305000b3e5cbb1090` |
| `Assets/Animations/all_animations_max_motextr_static/f_idle_breathe_01.max.fbx` | `e470ba984484149c8269772b7640b754bd996ba83b23ae75535128412997aa45` |
| `Assets/Animations/all_animations_max_motextr_xy/m_walk_neutral.max.fbx` | `93089851a370e3a117a6bd04c002815f7133fce41c6271e9eb448ca1228b154f` |
| `Assets/Animations/all_animations_max_motextr_xy/f_walk_neutral.max.fbx` | `e210c9e34949a4eacad0a85021d4d1a59aab177ca1737e6038309896147ebae2` |
| `Assets/Animations/all_animations_max_motextr_xy/m_run_neutral.max.fbx` | `2f5647b86022ddbb702819ce939c7012e3636796fff93d1b979ea716a71dff5f` |
| `Assets/Animations/all_animations_max_motextr_xy/f_run_neutral.max.fbx` | `3665a15cc1fea263ffb642b22e0a12c7d3bc771fead869f8fec3959fbd584eeb` |
| `Assets/Animations/all_animations_max_motextr_xyz/m_sit_down_chair_01.max.fbx` | `2dbfccc5febc8d37ff9d1593f75253cbd8d5393c6a448695184755535491e4cf` |
| `Assets/Animations/all_animations_max_motextr_xyz/f_sit_down_chair_01.max.fbx` | `6ef5c1d78ed9050e722795cb2edca96e9551647a47729cab1d84a4c8383a3ed5` |
| `Assets/Animations/all_animations_max_motextr_xyz/m_sit_stand_up_chair_01.max.fbx` | `69439ca9df8e330af75e82bd1b4e64e5e6858d3de0761515e67bad649a9989ac` |
| `Assets/Animations/all_animations_max_motextr_xyz/f_sit_stand_up_chair_01.max.fbx` | `c9e35246ca52ddf85c6a6d9d1da2f064eb0d7089393d3d92667eff6c1da23a20` |
| `Assets/Avatars/Professions/Medical_Male_03/Export/Medical_Male_03.fbx` | `097cc7866954595ad3243d7ff060e7a4b68ac0f91232a4f19ad3b9e0041f2d17` |
| `Assets/Avatars/Professions/Medical_Male_03/Textures/m153_body_color.tga` | `0684fadbe2eae7f98a2dae333b495cc3321174c0c1e618523eef071b24efeb44` |
| `Assets/Avatars/Professions/Medical_Male_03/Textures/m153_head_color.tga` | `5fef414d2953b8b696fe065364089c695d8a3ef3ae2b55edd29afbc7992b4ce3` |
| `Assets/Avatars/Professions/Medical_Male_03/Textures/m153_stetoskop_color.tga` | `d480d0e5da84ee1a2f5824d74078011eac9feaf37621cacf8e77f9631e1c63e7` |
| `Assets/Avatars/Professions/Medical_Female_02/Export/Medical_Female_02.fbx` | `ae96dd938340349bc643023b5838767f95f7cf63b026ecc3e5348fef00859115` |
| `Assets/Avatars/Professions/Medical_Female_02/Textures/f153_body_color.tga` | `9731d55e2bcf431edfa48d655b8d77a85fec4660ef227caaeb5115a8c73574aa` |
| `Assets/Avatars/Professions/Medical_Female_02/Textures/f153_head_color.tga` | `b4bd5494901c7a8cbc1c4df2083fed3091e8d00b57641ebfdd84a7951f623bc8` |
| `Assets/Avatars/Professions/Medical_Female_02/Textures/f153_opacity_color.tga` | `d6bb4ddde05c1dcddd829db99e0f0ef4416d05cdb94e1e6770779724aa3f696f` |
| `Assets/Avatars/Professions/Medical_Female_02/Textures/f153_stetoskop_color.tga` | `d480d0e5da84ee1a2f5824d74078011eac9feaf37621cacf8e77f9631e1c63e7` |
| `Assets/Avatars/Professions/Medical_Female_01/Export/Medical_Female_01.fbx` | `e5aeed027bfc6da910fcc4fc5c3eaabc8881541c60673b9466e908f9513e9618` |
| `Assets/Avatars/Professions/Medical_Female_01/Textures/f152_body_color.tga` | `4a77f4d66a566c535da9c6d10e79057e1a8dab30ff27c88f8613328ef6c323d8` |
| `Assets/Avatars/Professions/Medical_Female_01/Textures/f152_head_color.tga` | `8dd641084b5d856eb38d801c97ebd69d601efdc9a9720ba7f6bd556ddd03d0cc` |
| `Assets/Avatars/Professions/Medical_Female_01/Textures/f152_opacity_color.tga` | `07d5e246c49b95a15c336e4135d1d9a5cebfe2e3cb68b6041346ddf8c61b12f0` |
| `Assets/Avatars/Professions/Medical_Male_04/Export/Medical_Male_04.fbx` | `5f7cd19833e24039bdf313d3534579b366b5ad5e7288627ebf579edf953a0a85` |
| `Assets/Avatars/Professions/Medical_Male_04/Textures/m162_body_color.tga` | `e4c94f19f7f9ca05485f1786c92871e4eddb30633ab01c38b282194dd435572c` |
| `Assets/Avatars/Professions/Medical_Male_04/Textures/m162_head_color.tga` | `35f616c20e0b809605c9d63457e60af25e60e901bc19f2326d21cbc74d04904a` |
| `Assets/Avatars/Professions/Medical_Male_04/Textures/m162_protection_color.tga` | `32590d1f0de6155e936b189fd3ade5daa8cb1cdec8f9e5bb0f2be10222d1e1ba` |
| `Assets/Avatars/Adults/Male_Adult_08/Export/Male_Adult_08.fbx` | `e0d979315a5f11050945522f9f084932807af2edeefbdb380a2c9aa36c9f9bb3` |
| `Assets/Avatars/Adults/Male_Adult_08/Textures/m014_body_color.tga` | `9b6cef05b86497ffca6f131842950341302fa170e5ce3de1c2446501be774b91` |
| `Assets/Avatars/Adults/Male_Adult_08/Textures/m014_head_color.tga` | `5d3723b8d6f6175b26adb1f2d46ade55b19630c2cee1bd2e43dbd293c6fa7d38` |
| `Assets/Avatars/Adults/Male_Adult_08/Textures/m014_opacity_color.tga` | `282684b09dd7e3b7b521387240855773f419a90c67ba58ff9ad478a7ec01cc93` |
| `Assets/Avatars/Adults/Female_Adult_09/Export/Female_Adult_09.fbx` | `a578ec65cabf169d7b13c0bb0a6c472e898857e81f6207b2af7f846d8b0d8523` |
| `Assets/Avatars/Adults/Female_Adult_09/Textures/f009_body_color.tga` | `7e2a7688798489cb2a124947c581c1f5c0cd62b36303d5cee1d9b0baf320724b` |
| `Assets/Avatars/Adults/Female_Adult_09/Textures/f009_head_color.tga` | `b311e6f30a9b587d62e4fd301354b24ea7f58a6cdf2c39abb73d46d9d40e799a` |
| `Assets/Avatars/Adults/Female_Adult_09/Textures/f009_opacity_color.tga` | `868688524e4427758e716da5cc9bc3a6c6b35cf640e4fbe81c99618a750babf4` |
| `Assets/Avatars/Professions/Medical_Male_01/Export/Medical_Male_01.fbx` | `11df553be0a51691034be585ac402a933a530bb8e5529d6dba7a7462b87e5a3b` |
| `Assets/Avatars/Professions/Medical_Male_01/Textures/m152_body_color.tga` | `717b4569cac7b96fc8eadc4de001156af9f86138f4cc80764d1642024e91c145` |
| `Assets/Avatars/Professions/Medical_Male_01/Textures/m152_head_color.tga` | `2422f9dacdbbe78a3c5ac2f593a541ab324ec41c8c65993f120a6864ab50c8f8` |
| `Assets/Avatars/Professions/Medical_Male_01/Textures/m152_opacity_color.tga` | `7793ea45a31c2153cf1ef7319ce67c60fd6c84d59767ceb3e9f7f88160a720d9` |
| `Assets/Avatars/Professions/Medical_Male_05/Export/Medical_Male_05.fbx` | `d4d01405cd528b635067b7d6ac21cbe15d026f5c9ac8af48ec6f5800a4c15a03` |
| `Assets/Avatars/Professions/Medical_Male_05/Textures/m163_body_color.tga` | `972d6bb16a114e8ecea273092287c8d5bc48b9680072416622a1da04058d4d50` |
| `Assets/Avatars/Professions/Medical_Male_05/Textures/m163_head_color.tga` | `1abe3f5a6b8ffca4de39dbe75f1cf511dcce152f97b9264517a531a3327db7e9` |
| `Assets/Avatars/Professions/Medical_Male_05/Textures/m163_protection_color.tga` | `8d6f350030e7932785e44177df60e27279e82d3efaa88e3f1681f7812cb53e46` |
| `Assets/Avatars/Professions/Medical_Female_03/Export/Medical_Female_03.fbx` | `a22a5e5bd126c95a2dcf2803c3a0972950e78dfead319ef1ec358a058de68da5` |
| `Assets/Avatars/Professions/Medical_Female_03/Textures/f154_body_color_blue.tga` | `782d59ce0dd0b12a1fbf45da68f85da1ab1d0578ba95110e2e2de80ba8ca1fa5` |
| `Assets/Avatars/Professions/Medical_Female_03/Textures/f154_head_color.tga` | `10a2a0f83b86578ebeb18de4916dea2db6bcba8fc05867149e37fc7f91bd9f38` |
| `Assets/Avatars/Professions/Medical_Female_03/Textures/f154_opacity_color.tga` | `868688524e4427758e716da5cc9bc3a6c6b35cf640e4fbe81c99618a750babf4` |
| `Assets/Avatars/Professions/Medical_Male_02/Export/Medical_Male_02.fbx` | `2cc76daa16b37898dcd2f9533026313eb8dcd98322a350ebd4108d9a17d516d8` |
| `Assets/Avatars/Professions/Medical_Male_02/Textures/m154_body_color_blue.tga` | `6fe8e5b0a9a6ce151ee79752f99b1b43936037892f32bea27bfb4b8821c1c195` |
| `Assets/Avatars/Professions/Medical_Male_02/Textures/m154_head_color.tga` | `f7ac8fc87c1d8fb37840f6729b903f2ef76cbcfde5e02a784167b8eb3006a75a` |
| `Assets/Avatars/Professions/Medical_Male_02/Textures/m154_opacity_color.tga` | `7cb2146e511c1bd207f5e7f061c8b66915db1bbc15c3748c6d98469630fd346d` |
| `Assets/Avatars/Professions/Business_Female_01/Export/Business_Female_01.fbx` | `7a13fa1e633d7718fe53bc5a26d96552fd271db7dd48a4fe3ab93f520df23fc2` |
| `Assets/Avatars/Professions/Business_Female_01/Textures/f014_body_color.tga` | `168c58454bf7c28171c6f4bf2e7be2106bd0285aea576ff4076a2168d8d97aec` |
| `Assets/Avatars/Professions/Business_Female_01/Textures/f014_head_color.tga` | `8a4f4762f69b67a4f40e80436b66e359d319606874895e0e02e51aba15a9ffd2` |
| `Assets/Avatars/Professions/Business_Female_01/Textures/f014_opacity_color.tga` | `2bbcf46ac04f0e913e06e36c90a7d53198c7db99d614c70dca80f0d1a95d8390` |
| `Assets/Avatars/Professions/Business_Female_02/Export/Business_Female_02.fbx` | `0819b017327f4293d522fea3f2dba94d1d8b2d408ec9253fb89f530523e24671` |
| `Assets/Avatars/Professions/Business_Female_02/Textures/f015_body_color.tga` | `60b84f3ba5315a76d324569e4ebee6d6bd7a461344158e5b0ef782d667db8285` |
| `Assets/Avatars/Professions/Business_Female_02/Textures/f015_head_color.tga` | `0df4e3f107cb1b06576894617121e53642e5b2d480b88c2a321ba2c4632a1014` |
| `Assets/Avatars/Professions/Business_Female_02/Textures/f015_glasses_opacity_color.tga` | `f9ece0a65d4771eaf9b6db864bb5898519f84fc23345ad0fa05b9dadb47d3555` |
| `Assets/Avatars/Professions/Business_Female_02/Textures/f015_opacity_color.tga` | `15cff3cd49521da8679ee0087c8aa2b8414c2b3a0cc9ec775c5225ef1dec6b81` |
| `Assets/Avatars/Professions/Business_Female_03/Export/Business_Female_03.fbx` | `5ed65d8591d7117adde33fb6896af98840a7cc52f21db298ae71a1e8ac0cd090` |
| `Assets/Avatars/Professions/Business_Female_03/Textures/f016_body_color.tga` | `25876a06194932b7e36d5b10cf123e6f317e8055dd335690851d23812cf916ea` |
| `Assets/Avatars/Professions/Business_Female_03/Textures/f016_head_color.tga` | `cd7b9b7fa318866143cb1c5b118455545e36b5ef3cd86155f4096bcacfe2f4e2` |
| `Assets/Avatars/Professions/Business_Female_03/Textures/f016_opacity_color.tga` | `b474fbbead89fbbecf6d05d152295c5fe9e1dab2cc0c76aa7ab49d5da70b24f8` |
| `Assets/Avatars/Professions/Business_Female_04/Export/Business_Female_04.fbx` | `68515701a9fd49a3e1f3632314da5def1169fe35896d34fbb10c5dcd78f2ca18` |
| `Assets/Avatars/Professions/Business_Female_04/Textures/f020_body_color.tga` | `5bf0a4789c1bd3f73c63062c68dacc70c09144b0be48c08095e35ddbbb6f060a` |
| `Assets/Avatars/Professions/Business_Female_04/Textures/f020_head_color.tga` | `b2ea878de23e30d80ce5a1097b1a51b3736a4deee4c6b20dc8b3c996ac9a91a5` |
| `Assets/Avatars/Professions/Business_Female_04/Textures/f020_opacity_color.tga` | `d6bb4ddde05c1dcddd829db99e0f0ef4416d05cdb94e1e6770779724aa3f696f` |
| `Assets/Avatars/Professions/Business_Male_01/Export/Business_Male_01.fbx` | `c39987e44c031674946c2a6929abceb99b21ef3322023bbf2e31bd1705e8a130` |
| `Assets/Avatars/Professions/Business_Male_01/Textures/m005_body_color.tga` | `d60e18359910606900af6a5eff1aeb46b7e4dcbe981964af53be4a9342e17c14` |
| `Assets/Avatars/Professions/Business_Male_01/Textures/m005_head_color.tga` | `a0f95b2f4b17b92c6c0bd21c2a76ae7e2b561f6623c33ef3e83c35dba75d210a` |
| `Assets/Avatars/Professions/Business_Male_01/Textures/m005_opacity_color.tga` | `7793ea45a31c2153cf1ef7319ce67c60fd6c84d59767ceb3e9f7f88160a720d9` |
| `Assets/Avatars/Professions/Business_Male_02/Export/Business_Male_02.fbx` | `8f00396b5038034bfa69d2f48b33d473ac2a99c915c9e265cb34f4e1ecea3374` |
| `Assets/Avatars/Professions/Business_Male_02/Textures/m008_body_color.tga` | `63155667b314dd4a3352dd6652ff47ac007010468c020fb4ae9cc7ed5b6c8065` |
| `Assets/Avatars/Professions/Business_Male_02/Textures/m008_head_color.tga` | `4a8a1591ef002a79518913fe47f33018341886bc956096a6f63f9fdace4b478b` |
| `Assets/Avatars/Professions/Business_Male_02/Textures/m008_opacity_color.tga` | `a17361aecc6a53a6b0cede4bebddb36f3a8cb67ed6f469814d5a511e2eef4dd2` |
| `Assets/Avatars/Professions/Business_Male_03/Export/Business_Male_03.fbx` | `585c82ebdea20203a18d64c2ec0cfafd3cfe064c3c58b70af25ebd9b8c4ac38f` |
| `Assets/Avatars/Professions/Business_Male_03/Textures/m020_body_color.tga` | `fc5b3f2b9f54c720365b6f7feffe48e6a3bf8b923087a1b9983ce9304f4030f6` |
| `Assets/Avatars/Professions/Business_Male_03/Textures/m020_head_color.tga` | `a2991d6c6a313ed9e8483ba94e0d5fc16c981a09873a792adebde5b8736bc3c5` |
| `Assets/Avatars/Professions/Business_Male_03/Textures/m020_opacity_color.tga` | `bdf589201336169ca659fac8652fc2b4105fc1634363a5cc461c8a8fa32679a2` |
| `Assets/Avatars/Professions/Business_Male_04/Export/Business_Male_04.fbx` | `eb550af41c5a3db4218a22fed0f0c2033387152fd526c86a2d7a5663703125df` |
| `Assets/Avatars/Professions/Business_Male_04/Textures/m015_body_color.tga` | `cb5e2a26dbd67f2ebe4cae00c204d5740f17c3eeec3dd1376568df9f26f49ba6` |
| `Assets/Avatars/Professions/Business_Male_04/Textures/m015_head_color.tga` | `45c56d522276b146a824d76aaa7167d96f8b6a2849e0682246f4b161464e6e9c` |
| `Assets/Avatars/Professions/Business_Male_05/Export/Business_Male_05.fbx` | `9df6ccb0a2cd72118a6377b966263c570710808655ced1ff075b0bc71a8f2b5d` |
| `Assets/Avatars/Professions/Business_Male_05/Textures/m016_body_color.tga` | `2c4b2bae2ce46ba75516ee23d4e58e63c75183fde3b9336f079f071d33276a89` |
| `Assets/Avatars/Professions/Business_Male_05/Textures/m016_head_color.tga` | `fc70452d6916baa122078ffe759a1278b8ae44993b3aa570c250b5d40f0ea666` |
| `Assets/Avatars/Professions/Business_Male_06/Export/Business_Male_06.fbx` | `f0892405f3193c09c85a8391efd5219d8a6bc45ff293e6356175efd457e67b0b` |
| `Assets/Avatars/Professions/Business_Male_06/Textures/m025_body_color.tga` | `36abf3edc359181188961d24fa59e7140f32e2f328d1ba7b3d644aa8477b3a22` |
| `Assets/Avatars/Professions/Business_Male_06/Textures/m025_head_color.tga` | `5f0ab4b879f0bd8834390a2ad6f3c99b6a7821c6293ec1bcb17fa1ba87f0cf39` |
| `Assets/Avatars/Professions/Business_Male_07/Export/Business_Male_07.fbx` | `efe9d0cda6fa6f9c8365e026d9cda1dbbd8903b624b56fee77027efcd3c9ad5b` |
| `Assets/Avatars/Professions/Business_Male_07/Textures/m018_body_color.tga` | `e95d6b706c641e72f45ab02191e8edc1af6b25839ae6362762b39d0958e4cea0` |
| `Assets/Avatars/Professions/Business_Male_07/Textures/m018_head_color.tga` | `2e25f8fd67c914a5c01ace3768b78584a778344793ac63982b33ac6e86f1eff2` |
| `Assets/Avatars/Adults/Female_Adult_01/Export/Female_Adult_01.fbx` | `8cbaf86576004b96469bc80df123b97fef788f4a7bb3f3eaa616fcfaf55698a3` |
| `Assets/Avatars/Adults/Female_Adult_01/Textures/f001_body_color.tga` | `c038b01c5d05831c3f4e8c6daa18394e8a4851372acd3fcbdf30e7ee53c56cae` |
| `Assets/Avatars/Adults/Female_Adult_01/Textures/f001_head_color.tga` | `0d3153c59c54908d5f5194ffe3a7d882351f0dd74f9ef44ab3a2f164a3bf9d8e` |
| `Assets/Avatars/Adults/Female_Adult_01/Textures/f001_opacity_color.tga` | `12c9c366814e665687fe64056421213686b50a972a5ad47295f247d6a8ff7369` |
| `Assets/Avatars/Adults/Female_Adult_02/Export/Female_Adult_02.fbx` | `71a9d3495d06e42e33f9276795bd75fea9d4779c5ad47f65490f049ae2b7eaa9` |
| `Assets/Avatars/Adults/Female_Adult_02/Textures/f002_body_color.tga` | `94577d184374270beef531394253c864483b9b9cb2c58e30ecd9364e8baa9f29` |
| `Assets/Avatars/Adults/Female_Adult_02/Textures/f002_head_color.tga` | `a258f150c9a185d0335b74bd16acb8f4c18eabf469e2e2ea97066e20aa475a66` |
| `Assets/Avatars/Adults/Female_Adult_02/Textures/f002_opacity_color.tga` | `6f6bde560371ac39cd65f8f1f26e0e7db8b8c7d6224c4139844a21593c962d45` |
| `Assets/Avatars/Adults/Female_Adult_03/Export/Female_Adult_03.fbx` | `d8930ca41e72166310622c9ffacd752d93459518ca5e59c84a32b07a10acaebd` |
| `Assets/Avatars/Adults/Female_Adult_03/Textures/f003_body_color.tga` | `fc22fd6bd6686d5638bab7d24cdb435d180e6065325796b41b1966f047843e2c` |
| `Assets/Avatars/Adults/Female_Adult_03/Textures/f003_head_color.tga` | `4c45609d3385a5358378424f72615637e061ff56c66343a71045adc04b7a27df` |
| `Assets/Avatars/Adults/Female_Adult_03/Textures/f003_opacity_color.tga` | `31c5ae34c355c71aef8ec8c67ece37009f385a1081db378df5e7987158aec523` |
| `Assets/Avatars/Adults/Female_Adult_04/Export/Female_Adult_04.fbx` | `a1a0debc6851d0ffe2079b5743d3255ad115139ccd6f8c8fccfd52c49bef6dfd` |
| `Assets/Avatars/Adults/Female_Adult_04/Textures/f004_body_color.tga` | `02c1362ed7daed6cb3aac33dc85f8e635c9be29265c7d96515c8ca7230c50781` |
| `Assets/Avatars/Adults/Female_Adult_04/Textures/f004_head_color.tga` | `61b418a825e85514541f28c5968e9e0a0d1897506f7c7bccd27eef336e1473ef` |
| `Assets/Avatars/Adults/Female_Adult_04/Textures/f004_opacity_color.tga` | `cf9b868f3f2b9f48ee3d764d1b8f611df94167e393f6275c04779963b3ddd506` |
| `Assets/Avatars/Adults/Female_Adult_05/Export/Female_Adult_05.fbx` | `fffbb46af5f0f0323abad47f04f6067ec6f8757a345d5e53804601bbb77feca4` |
| `Assets/Avatars/Adults/Female_Adult_05/Textures/f005_body_color.tga` | `e15c1c5c0a7fca62be865c426c69ecad703da904d2456d040bbba73cedae8e81` |
| `Assets/Avatars/Adults/Female_Adult_05/Textures/f005_head_color.tga` | `4e3be559aab4a52d5b55c65447daa8922e633cac049361386a185753d072f1e6` |
| `Assets/Avatars/Adults/Female_Adult_05/Textures/f005_opacity_color.tga` | `8573246d70931d4a2b0fc330024c2b3df4f450de368b4eedd21bb3276855d456` |
| `Assets/Avatars/Adults/Female_Adult_07/Export/Female_Adult_07.fbx` | `faaa677ad270784b87538d16839c179b0930a121fa0bb3fed8f3ed189b33a98a` |
| `Assets/Avatars/Adults/Female_Adult_07/Textures/f007_body_color.tga` | `9a2e740bce46ff2e00c8a24074ee28a1d63198024d03718d5fde6cbfe7ef0fd3` |
| `Assets/Avatars/Adults/Female_Adult_07/Textures/f007_head_color.tga` | `65e399a091d27b2e66f202ba3628c270f513f80a1ea5776771f5e9239ddeed15` |
| `Assets/Avatars/Adults/Female_Adult_07/Textures/f007_opacity_color.tga` | `c7c59dfb5f79160ac7cb88091b7c3e9148f9868008915f35ebfe29dc34e917c1` |
| `Assets/Avatars/Adults/Female_Adult_08/Export/Female_Adult_08.fbx` | `cf857fe04595edee9174caaf3f0d18dd5d5cc4d0702c8851f2cc413dd8cfea9e` |
| `Assets/Avatars/Adults/Female_Adult_08/Textures/f008_body_color.tga` | `13fad57cdcfaee92264172ef076539d928bbc1ba86309f493cd7dae06137d4fa` |
| `Assets/Avatars/Adults/Female_Adult_08/Textures/f008_head_color.tga` | `17e73fd0e0fb4e769b2a29c85922bad356a55d1fa0d4628c906ead0403793d35` |
| `Assets/Avatars/Adults/Female_Adult_08/Textures/f008_opacity_color.tga` | `9d2fdbbf9df2ecbb34082541c82bf1d464fbddc3b5f8683d0ea060a667cdeb8e` |
| `Assets/Avatars/Adults/Female_Adult_11/Export/Female_Adult_11.fbx` | `713d79f1bf21e20e9c1e9ec4ed4d421c84c0466dfdeebf59d47af81b71b8ca88` |
| `Assets/Avatars/Adults/Female_Adult_11/Textures/f011_body_color.tga` | `e9797c77c32009ba0485aa351876063daa0e88250fba4884377faf8cea1d5eb6` |
| `Assets/Avatars/Adults/Female_Adult_11/Textures/f011_head_color.tga` | `f2439ebb800708c467f3cf0147568d3e9c3c61ac76977363fc992d16e8b38efe` |
| `Assets/Avatars/Adults/Female_Adult_11/Textures/f011_opacity_color.tga` | `07d5e246c49b95a15c336e4135d1d9a5cebfe2e3cb68b6041346ddf8c61b12f0` |
| `Assets/Avatars/Adults/Female_Adult_12/Export/Female_Adult_12.fbx` | `e7f1d9af57cfbac0be76c2c31c9c695aec2204e09e6616abda61df71bf4a7f67` |
| `Assets/Avatars/Adults/Female_Adult_12/Textures/f012_body_color.tga` | `7f517e4c12738bda2638786f8d6557920e3481a80a9b34d7af4f1c2f30e20dca` |
| `Assets/Avatars/Adults/Female_Adult_12/Textures/f012_head_color.tga` | `1ae65738cd3660055236357a525c3dc8edda56e64a5275f5a083e8c7c356d941` |
| `Assets/Avatars/Adults/Female_Adult_12/Textures/f012_opacity_color.tga` | `6a8ef2b5554b504a298a17856de12bdee7fee5a87265726ee0b373f0752a95c7` |
| `Assets/Avatars/Adults/Female_Adult_13/Export/Female_Adult_13.fbx` | `cbfa41f09859179bba873d70bd075ce910d298fce8b2a74e4920049b33f0402b` |
| `Assets/Avatars/Adults/Female_Adult_13/Textures/f019_body_color.tga` | `ad4ae502d585441ab9344e9c9819b6af077d56f11dac1b45ed7edbafd27b2007` |
| `Assets/Avatars/Adults/Female_Adult_13/Textures/f019_head_color.tga` | `b2443eb8a3c247021dec33c12ff87960904c35196c31e0dfd94adab1caacc8c4` |
| `Assets/Avatars/Adults/Female_Adult_13/Textures/f019_opacity_color.tga` | `c01fb95dab617aed3b8ff67b9ecf4b16bc5fe6bb6518245b0a5aacffec39087a` |
| `Assets/Avatars/Adults/Female_Adult_14/Export/Female_Adult_14.fbx` | `63d32ecd1fd6427050616fe3e2277011ea7442d019bb0b61dfdd5299587467f4` |
| `Assets/Avatars/Adults/Female_Adult_14/Textures/f017_body_color.tga` | `feed2c59b6c4eb2f673cd37d92392686867b4507adf4862c2c3e579f0df51b94` |
| `Assets/Avatars/Adults/Female_Adult_14/Textures/f017_head_color.tga` | `c5805bb8b3a1c1ddae011696ee742747c9efefa4be5db4a059251c452031023a` |
| `Assets/Avatars/Adults/Female_Adult_14/Textures/f017_opacity_color.tga` | `2d72503c645408d279d691e2545eddb446b82db57a7519f537bb8fe33fde26aa` |
| `Assets/Avatars/Adults/Female_Adult_15/Export/Female_Adult_15.fbx` | `49300e70f72ec0238a17ea583610d41fd34ae78135ee1c0fda5ed9493e49a56a` |
| `Assets/Avatars/Adults/Female_Adult_15/Textures/f018_body_color.tga` | `d3e41b8a2845b2dd546c2ffb166b18541bf2937b8a336d6cadf4d4c725047df5` |
| `Assets/Avatars/Adults/Female_Adult_15/Textures/f018_head_color.tga` | `48fef42795a7bc800c305de504126f079925f297ff19e0ed377eff2668eb81f8` |
| `Assets/Avatars/Adults/Female_Adult_15/Textures/f018_opacity_color.tga` | `879270fb466c3f2e264d45ac6c6c694b94bb58e94cfb035721567b04109546f2` |
| `Assets/Avatars/Adults/Female_Adult_17/Export/Female_Adult_17.fbx` | `777125303c2b4c493dce961b66cfc8c86ac69ee697c212ea9fe3107bfc45831f` |
| `Assets/Avatars/Adults/Female_Adult_17/Textures/f006_body_color.tga` | `d657c9113b23c72a58bca56bcfe7c0956caea976a6144c3f53c0181b9f2b746d` |
| `Assets/Avatars/Adults/Female_Adult_17/Textures/f006_head_color.tga` | `f23bfa861e036dc9a39ae8c6595bf0128f021eb762464e58f72907a9b49ecbfa` |
| `Assets/Avatars/Adults/Female_Adult_17/Textures/f006_opacity_color.tga` | `2ce67c662cf20256c8bf0713e4aeff5f7be0ae3cee981df119dbc7d32111e3d0` |
| `Assets/Avatars/Adults/Male_Adult_01/Export/Male_Adult_01.fbx` | `8d1edb51b4dc3427ae2456f4407fc105532c145dd019e53cd42bab31cc948a29` |
| `Assets/Avatars/Adults/Male_Adult_01/Textures/m002_body_color.tga` | `6a048a6b2140a1f5293798ca286be64fd0de6d79572e1273ff5765bd578f463f` |
| `Assets/Avatars/Adults/Male_Adult_01/Textures/m002_head_color.tga` | `f5b64e4894930d438f7c419c3c9d0bba1f95fa4de9af078b762ea55bfca1ab85` |
| `Assets/Avatars/Adults/Male_Adult_01/Textures/m002_opacity_color.tga` | `53818d3f45519451edd2bc60d6e59cd4057ecd381827463c5503da0439d0a5cf` |
| `Assets/Avatars/Adults/Male_Adult_02/Export/Male_Adult_02.fbx` | `1c65e292e9057a23f7f70969f6971c631c1316fcaaf93e575a4557201c835018` |
| `Assets/Avatars/Adults/Male_Adult_02/Textures/m003_body_color.tga` | `52ef8bad71600de972eabeab2845019cf8ce6e274f11b9c7fbd315566c51e232` |
| `Assets/Avatars/Adults/Male_Adult_02/Textures/m003_head_color.tga` | `f7d7d06bc9e3bee73bb037a0c55ca2915593fa5ef7b08da3f6a59409ed5cfc8f` |
| `Assets/Avatars/Adults/Male_Adult_02/Textures/m003_opacity_color.tga` | `2c0751e05d78587d3898ce60bbea8b3f23e78150b7e497b7e97fe8c66e91ee1e` |
| `Assets/Avatars/Adults/Male_Adult_03/Export/Male_Adult_03.fbx` | `7064a9f50c95975c6d64ab0c5f5504364bad4ac987750728d0b5f1788fd59dcf` |
| `Assets/Avatars/Adults/Male_Adult_03/Textures/m004_body_color.tga` | `13686c52f5a8552a7263545f22d79aeef7269112f8b48fc1e7864a13de0b045b` |
| `Assets/Avatars/Adults/Male_Adult_03/Textures/m004_head_color.tga` | `96130ef4c94702d8ee6004ce7d1c48f4b5fb6383ad70410f7316ff4031b031e4` |
| `Assets/Avatars/Adults/Male_Adult_03/Textures/m004_opacity_color.tga` | `7b7255ae4042577edbf3dff253b2a32231db6fe281cd8781306d9e26fcf9d03a` |
| `Assets/Avatars/Adults/Male_Adult_04/Export/Male_Adult_04.fbx` | `fe0d026bc59e7d7ea8f4049edf77ee8040e050224b44a10fb4727b9b3d6efba0` |
| `Assets/Avatars/Adults/Male_Adult_04/Textures/m006_body_color.tga` | `8dd7a0a1de383bd295f9f6f42b4ab484b2afa4ab920521a161bd18b18c3aae0f` |
| `Assets/Avatars/Adults/Male_Adult_04/Textures/m006_head_color.tga` | `e889edd96192a396efec0bf0baed370fdff4a8d3b2efdc3809722eb19cd21941` |
| `Assets/Avatars/Adults/Male_Adult_04/Textures/m006_opacity_color.tga` | `3c5656dbad4872676c9469f6da09690c0e891148394165dda11b265cb2b014c0` |
| `Assets/Avatars/Adults/Male_Adult_05/Export/Male_Adult_05.fbx` | `cd0e17505d7b4148cf3b19ccdec9a90f063671f841b60d193d3527a0980052d0` |
| `Assets/Avatars/Adults/Male_Adult_05/Textures/m009_body_color.tga` | `cf5704a0c083d57dab9b7cfdb797d8440fffd0128c7b560b8daad15c5dbcaad7` |
| `Assets/Avatars/Adults/Male_Adult_05/Textures/m009_head_color.tga` | `2ff27ddb9b4b63ec75ab121813890c34be569c26de99687cbf29e84cb814a22e` |
| `Assets/Avatars/Adults/Male_Adult_05/Textures/m009_opacity_color.tga` | `959801169cfd2274b72d8c7a052d4b83029c5f9a8afddf8d69837361fd411cf2` |
| `Assets/Avatars/Adults/Male_Adult_06/Export/Male_Adult_06.fbx` | `537284add0fb8bd3bf9dd9459cba2c6d4d34de50b86dfdfef09c2c57cbf1a878` |
| `Assets/Avatars/Adults/Male_Adult_06/Textures/m011_body_color.tga` | `f92110adc6f33c8802652e4c2f5282226e3fbee672f510b3fb765a1599dd3f91` |
| `Assets/Avatars/Adults/Male_Adult_06/Textures/m011_head_color.tga` | `b3f7731c506ae105bead54cb558c366ed9e72463565f78727365e52a90b841c5` |
| `Assets/Avatars/Adults/Male_Adult_06/Textures/m011_opacity_color.tga` | `7cb2146e511c1bd207f5e7f061c8b66915db1bbc15c3748c6d98469630fd346d` |
| `Assets/Avatars/Adults/Male_Adult_07/Export/Male_Adult_07.fbx` | `acad3095ae886a583ec5f30878123b933f2cd5f24030c4bcddc000113a75c0cb` |
| `Assets/Avatars/Adults/Male_Adult_07/Textures/m013_body_color.tga` | `60aa05b5c4bca75696619faba64e9601eb8ad13911b0ae5c541ef420a830f268` |
| `Assets/Avatars/Adults/Male_Adult_07/Textures/m013_head_color.tga` | `a3db4a4013f39b2e38f307588b5353398e08b6fa017f5e2554287be19f454789` |
| `Assets/Avatars/Adults/Male_Adult_07/Textures/m013_opacity_color.tga` | `d5b075decc3904150c0af6afabae65bd66ceb8a5c6b192e93557e094f9af605d` |
| `Assets/Avatars/Adults/Male_Adult_09/Export/Male_Adult_09.fbx` | `ebb89800dbad28b4352369c7149314e010806268a28d7f5bb954a4393bba3d00` |
| `Assets/Avatars/Adults/Male_Adult_09/Textures/m017_body_color.tga` | `6959a7dca441963ac10b0f86df4b3191ad5da839c16a1fc972da8464b6807b65` |
| `Assets/Avatars/Adults/Male_Adult_09/Textures/m017_head_color.tga` | `5e4b4af1dc24660607fb96cebdafacae649f36d4a7bc8af99178634126664cb8` |
| `Assets/Avatars/Adults/Male_Adult_09/Textures/m017_opacity_color.tga` | `510c4b20b534a1b3d488638a33319968c4108f1aac887ab50188a77980cf1bc0` |
| `Assets/Avatars/Adults/Male_Adult_10/Export/Male_Adult_10.fbx` | `6a7a693d9a7ea6c866037f0cc8e45c5243bbcff008665b2ae505f72a6648ae00` |
| `Assets/Avatars/Adults/Male_Adult_10/Textures/m024_body_color.tga` | `5424cf19d81306897f005a94e104cfff08dd0d75cba57734cc056baab85e12cb` |
| `Assets/Avatars/Adults/Male_Adult_10/Textures/m024_head_color.tga` | `60e12ea8f638ddeb99f315a805b907c7ddbb5ea048234b0b1e58c5bfb8bc1dd3` |
| `Assets/Avatars/Adults/Male_Adult_10/Textures/m024_opacity_color.tga` | `801be5b63549f6ca46c405a4d86c723735a7c4edcbb042c453bdb6fed31bfbdb` |
| `Assets/Avatars/Adults/Male_Adult_11/Export/Male_Adult_11.fbx` | `e31f5cf98667a93861ac69da3f12aabe36b896c802a550b2799ecc18c8af0eb8` |
| `Assets/Avatars/Adults/Male_Adult_11/Textures/m001_body_color.tga` | `6e41493d53f3c52d59d70d0eb299b580e7e1895a599ee5843689691d20f9ca9f` |
| `Assets/Avatars/Adults/Male_Adult_11/Textures/m001_head_color.tga` | `75a2f5e67d9f2c43e83f2fa29e70c1e9bd83e5f2704e563997ae914f03f9771b` |
| `Assets/Avatars/Adults/Male_Adult_12/Export/Male_Adult_12.fbx` | `b44fa6011b934abd69954fd6c5025c1e2011e05c7892acb6bbc2e9cf70a84014` |
| `Assets/Avatars/Adults/Male_Adult_12/Textures/m007_body_color.tga` | `9e5951e67e90ade61f33c51c9673aa1b974358dac12dc0a9abdd4b281cda6b61` |
| `Assets/Avatars/Adults/Male_Adult_12/Textures/m007_head_color.tga` | `164007a5ca94b3f84b04ab77a3a7bc49f65f12af4153781dcbf429589750f7c1` |
| `Assets/Avatars/Adults/Male_Adult_13/Export/Male_Adult_13.fbx` | `2898a6ff32144aed2fa57f383dfb9401580ad8b6f2c2857d06a7efdfe94b3f9a` |
| `Assets/Avatars/Adults/Male_Adult_13/Textures/m010_body_color.tga` | `af8d799127f243c9db2134de1fe1b93d99eacee4affadf27d5af77bb57b1db89` |
| `Assets/Avatars/Adults/Male_Adult_13/Textures/m010_head_color.tga` | `101064ec2886fc74a20e1c6e2b81b0c2596f25614fb5d9aa2d01cab7337e2b09` |
| `Assets/Avatars/Adults/Male_Adult_14/Export/Male_Adult_14.fbx` | `9d3ecf5c94a84e22b081ddadebf57da18d79541e48e792fa598335553f2dc399` |
| `Assets/Avatars/Adults/Male_Adult_14/Textures/m012_body_color.tga` | `04b656f0f0119ca6b5a4aa00fdccc19918fd18976a446f2f192753a4e73f0147` |
| `Assets/Avatars/Adults/Male_Adult_14/Textures/m012_head_color.tga` | `520e067d7c117af8471f32e6e66dd80b0e87717c1218f0a3759dfd6db504a729` |
| `Assets/Avatars/Adults/Male_Adult_16/Export/Male_Adult_16.fbx` | `9c03f1142ddbca6592336f7823f39436635e996fccc3c2a0a9dc32535d6b706d` |
| `Assets/Avatars/Adults/Male_Adult_16/Textures/m019_body_color.tga` | `537b0853dcec81c6e7dba07795273fa692f468c944fb57f9c2133ca9e57ef656` |
| `Assets/Avatars/Adults/Male_Adult_16/Textures/m019_head_color.tga` | `e8ca7dabfcc79b31cd7e0f0fa4f58f718dcb4e79e48dcbd8d96ee11a9c332e7b` |
| `Assets/Avatars/Adults/Male_Adult_17/Export/Male_Adult_17.fbx` | `c1f5f218684baae3fb505f9b100af97953ac868f03e6a9b6b2c7365c353c05bb` |
| `Assets/Avatars/Adults/Male_Adult_17/Textures/m022_body_color.tga` | `7efb4d7c5214b936f2db46285d33bb6b3f47d84faf1a3f8737957d631a270215` |
| `Assets/Avatars/Adults/Male_Adult_17/Textures/m022_head_color.tga` | `47ceae79a6d3760bbecf4302d5b9c647429943d48cc7ea25ac4696b363e5ea9c` |
| `Assets/Avatars/Adults/Male_Adult_18/Export/Male_Adult_18.fbx` | `94bc6fb7efcdf7acad06c6a6b90910e0a58446df6beae578e1ceb35585d85306` |
| `Assets/Avatars/Adults/Male_Adult_18/Textures/m023_body_color.tga` | `b47dc98ae870bad036d658a1c732faf026f219eaab488317644f970184d8e7f9` |
| `Assets/Avatars/Adults/Male_Adult_18/Textures/m023_head_color.tga` | `086433bf57e1e9ef8690860ecf2adeeab1c4b0e663947e9c9fd0354b8abd6ad7` |
| `Assets/Avatars/Adults/Male_Adult_20/Export/Male_Adult_20.fbx` | `78c6ffd6899afe415f7e22f088ac36f153046592a6867e5a9e80a10695d996c6` |
| `Assets/Avatars/Adults/Male_Adult_20/Textures/m027_body_color.tga` | `54cf6fe03676bea4cd9190ee2057c826e43f49d2f82170a92d1c0413eb153500` |
| `Assets/Avatars/Adults/Male_Adult_20/Textures/m027_head_color.tga` | `61c117bea375ea983f697c5b1acdf0ebff86ff69e21c956d27d10bc4ecc9be63` |
| `Assets/Avatars/Professions/Delivery_Male_01/Export/Delivery_Male_01.fbx` | `f45d05370f024308d577cb3a10586e775b8d2daf09249bb43fa9b316d7d5c20f` |
| `Assets/Avatars/Professions/Delivery_Male_01/Textures/m112_body_color.tga` | `11a38aea3b9298570f534c4c496f5db7ecfbbcec158f844bfb2c194ebc6d632e` |
| `Assets/Avatars/Professions/Delivery_Male_01/Textures/m112_head_color.tga` | `b71fec9a9ed3afde8002b5f101056f52a93982ee733e2573b8041fd8f28bb1d8` |
| `Assets/Avatars/Professions/Wood_Male_01/Export/Wood_Male_01.fbx` | `a484e5b447a7297cb12b71e5d2d7dee94d789d7a8d1a43db5afaef632f433e80` |
| `Assets/Avatars/Professions/Wood_Male_01/Textures/m110_body_color.tga` | `40dae9f97393da399ed58cc8b1eb08c7a5130709a349a723641f8413319d8183` |
| `Assets/Avatars/Professions/Wood_Male_01/Textures/m110_head_color.tga` | `76a0ac7757ff6fa6336d95f8c18493814e8cb21a6c261947f46998c1357c2b40` |
| `Assets/Avatars/Professions/Gardener_Male_01/Export/Gardener_Male_01.fbx` | `d49650b7a6d38da0d4954531722b3d404ec4ba12c66362471d8f2d4f8905e2f9` |
| `Assets/Avatars/Professions/Gardener_Male_01/Textures/m106_body_color.tga` | `12502994c1cac0dabe9243a5da55cb8c5252d6c1abe0936acdd67dbd8c59f992` |
| `Assets/Avatars/Professions/Gardener_Male_01/Textures/m106_head_color.tga` | `43c4dfb34ac7806a03410d589a60dce4c9cfff94423f3da48f1123e1ced30cf0` |
| `Assets/Avatars/Professions/Gardener_Male_01/Textures/m106_opacity_color.tga` | `959801169cfd2274b72d8c7a052d4b83029c5f9a8afddf8d69837361fd411cf2` |
| `Assets/Avatars/Professions/Construction_Female_01/Export/Construction_Female_01.fbx` | `17d236c4e880bc10742a48dba643dc4cc13cd408bc10a18608de7a6cdb8b1e3b` |
| `Assets/Avatars/Professions/Construction_Female_01/Textures/f101_body_color.tga` | `1d7cc8b2e04c1664de8243642ffdbb21b97ddc8d004819b13a2bba0123f53145` |
| `Assets/Avatars/Professions/Construction_Female_01/Textures/f101_head_color.tga` | `2c97fa8deac807f40ddb43b628f5ac6ec6866dc9429d17ade1a54a4323ab2e4a` |
| `Assets/Avatars/Professions/Construction_Female_01/Textures/f101_helmet_color.tga` | `5b9f70e2cefb06ad4fdc76a5e3e84b35f9c72f07f397100c2ecc7eeccc3ea5b2` |
| `Assets/Avatars/Professions/Construction_Male_01/Export/Construction_Male_01.fbx` | `f442bd5c237e8f279160bac3038649316bd366db281260471f212025cf7b0607` |
| `Assets/Avatars/Professions/Construction_Male_01/Textures/m111_body_color.tga` | `e1936c0b0c35e6c9fa2b43734513c0c381627e1ae5c42f9ff7ee361e34a4ed0e` |
| `Assets/Avatars/Professions/Construction_Male_01/Textures/m111_head_color.tga` | `27b3cea6654c2ef31bc8410db9d7dc53ebacf6babf9a49dd91f26cd8e076993e` |
| `Assets/Avatars/Professions/Construction_Male_01/Textures/m111_helmet_color.tga` | `b6c8690a8e110b4f3075282e2fefa2cc6004b7912952f277697c63d114dbbd8d` |
| `Assets/Avatars/Professions/Construction_Male_01/Textures/m111_tools_color.tga` | `a2c99065c0abbc80edd4f509101c003cd1c564c9887b5ec60755c0772d4466e1` |
| `Assets/Avatars/Professions/Construction_Male_01/Textures/m111_opacity_color.tga` | `45a2ffb28682599e8a4424e0b1148eb1996b09c481882b1b0be4877fa7ecf20d` |
| `Assets/Avatars/Professions/Construction_Male_02/Export/Construction_Male_02.fbx` | `1c10ca643745aaa7db38e1ba85bd3f0c18f76a70df430b319d4438990561d3bb` |
| `Assets/Avatars/Professions/Construction_Male_02/Textures/m101_body_color.tga` | `193f8332af1c4b5a2fd5de8d811c76cd35ab77c28ffb38910366f85f1ff8227c` |
| `Assets/Avatars/Professions/Construction_Male_02/Textures/m101_head_color.tga` | `e78198aaa2f4ce94e4ac884947e0775ad5dec913601997525ca573f1fc9cfed5` |
| `Assets/Avatars/Professions/Construction_Male_02/Textures/m101_helmet_color.tga` | `5b9f70e2cefb06ad4fdc76a5e3e84b35f9c72f07f397100c2ecc7eeccc3ea5b2` |
| `Assets/Avatars/Professions/Chef_Female_01/Export/Chef_Female_01.fbx` | `b21b7d289e1eac379b3fd62aa06603013d8460f625874a276d0a548be533ece7` |
| `Assets/Avatars/Professions/Chef_Female_01/Textures/f110_body_color.tga` | `1569cfef7176687409b8fe037110a18a760bdc093b355bd577adc71e7cecd0ab` |
| `Assets/Avatars/Professions/Chef_Female_01/Textures/f110_head_color_a.tga` | `92030fb20c5e64469883a41bfcf249a221af48d0e35c1dcc68655a932b478e17` |
| `Assets/Animations/all_animations_max_motextr_static/m_sit_chair_idle_neutral_01.max.fbx` | `c5aeab85a7daa50770f70644b1651ff7811594500a702e8b454e7386566e1df2` |
| `Assets/Animations/all_animations_max_motextr_static/f_sit_chair_idle_neutral_01.max.fbx` | `45a11c11fa22364eb0ea0a0f20c05771aeefa92a7fbe89361eed90e218e58abb` |
| `Assets/Animations/all_animations_max_motextr_xy/m_walk_slow_01.max.fbx` | `8c5e5ed18be9e1062a26d230677d2801a679c70fd67f8aa8de14ff37f6d20577` |
| `Assets/Animations/all_animations_max_motextr_xy/f_walk_slow_01.max.fbx` | `75a8083f0a1c324cef42aae08e3de6c46503ae2f6916956e571a2bb79ef350be` |
| `Assets/Animations/all_animations_max_motextr_static/m_sit_table_idle_neutral_01.max.fbx` | `b0d32e673184f5907332ff5094518834cd838bd68591a410ce06298126a1815c` |
| `Assets/Animations/all_animations_max_motextr_static/f_sit_table_idle_neutral_01.max.fbx` | `518e3790c39fbda5de67cbbec5f72d0b1f1912e988d3a56ed1944bef6062afaa` |
| `Assets/Animations/all_animations_max_motextr_static/m_sit_chair_idle_look_around.max.fbx` | `08fbd2b1a75fa6c697e652905749187bc0cd5647d20bc6184d618032972cf3c2` |
| `Assets/Animations/all_animations_max_motextr_static/f_sit_chair_idle_look_around.max.fbx` | `8a6129aece3d382cecb4db5c3ef62a9e2826ef776a7cbec84eb5e28771d699f9` |
| `Assets/Animations/all_animations_max_motextr_static/m_documents_check.max.fbx` | `c1f5f89116004401b5adc491ae1ac47d5467ca4257a350c4c284bf93bf9f35d1` |
| `Assets/Animations/all_animations_max_motextr_static/f_documents_check.max.fbx` | `c6b47b71c70e19a1cb2c9b0c49f3d3af3676a87037df942ac3b71d8a777a5d05` |

**`LICENSE.md` набора (дословно):**

```
MIT License

Copyright (c) 2020 Microsoft

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## 5. IBM Plex Sans — шрифт игры

Решение владельца 25.10.2026 (#107, «вариант 1»; отчёт [`docs/reports/2026-10-fonts.md`](../docs/reports/2026-10-fonts.md)).

- **Авторы:** Mike Abbink (IBM) и Bold Monday. «Copyright © 2017 IBM Corp. with Reserved Font Name "Plex"» — первая
  строка `OFL.txt`.
- **Лицензия:** SIL Open Font License 1.1, текст дословно — `assets/fonts/OFL.txt`, рядом со шрифтом; сборка кладёт его
  туда же (`dist/assets/fonts/OFL.txt`), и он едет в каждой копии игры, как требует условие 2 лицензии. OFL разрешает
  встраивать шрифт в программу и распространять вместе с ней, и в продаваемой игре тоже; нельзя продавать сам шрифт
  отдельно (условие 1). Зарезервированное имя «Plex» запрещает его только у изменённых версий (условие 3) — файлы здесь
  не изменены, имена файлов — те же.
- **Откуда файлы:** хранилище Google Fonts на GitHub — https://github.com/google/fonts, ветка `main`, папка
  `ofl/ibmplexsans/`; скачаны 25.10.2026 пробой `spikes/fonts/fetch.py` (адрес
  `https://raw.githubusercontent.com/google/fonts/main/ofl/ibmplexsans/<файл>`). Это переменные шрифты: насыщенность
  100–700 и ширина 75–100 % в одном файле, прямой и курсив. **Перед выпуском** — скачать заново и сверить по SHA-256.

| Файл | SHA-256 |
|---|---|
| `assets/fonts/IBMPlexSans[wdth,wght].ttf` | `3b031aa4216174205bd8471f88a49b91f093169e9e87bd5262242bc5967fe2e3` |
| `assets/fonts/IBMPlexSans-Italic[wdth,wght].ttf` | `0b94c5e981993764db32bf9c610ecc60cbd34ad77ec2f10ba03c64ab75124d8e` |
| `assets/fonts/OFL.txt` | `7e6b2818edbd8f6a01ae80641cc8f16a51080d08fb4e532be3a0b6f74adb07da` |

Тест `tools/test/fonts.test.ts` сверяет файлы с этой таблицей.

## 6. Carbon (IBM) — значки окна

Решение владельца 26.10.2026 (#139, «вариант 1»; отчёт [`docs/reports/2026-10-icons.md`](../docs/reports/2026-10-icons.md)).

- **Автор:** IBM, дизайн-система Carbon — пакет `@carbon/icons` 11.91.0 с npm (https://www.npmjs.com/package/@carbon/icons;
  исходники — https://github.com/carbon-design-system/carbon, папка `packages/icons`). «Copyright 2015 IBM Corp.» — в
  тексте лицензии пакета.
- **Лицензия:** Apache License 2.0, текст дословно — `assets/licenses/carbon-icons.txt` (файл `LICENSE` пакета); сборка
  кладёт его в `dist/assets/licenses/`, и он едет с каждой копией игры (условие 4а). Apache 2.0 разрешает использовать,
  менять и распространять значки, в том числе в продаваемой игре; файла `NOTICE` у пакета нет.
- **Что взято и что изменено:** 21 значок — разметка путей их SVG, рисунок на 16 точек, где он есть, иначе — на 32; лежит в
  `src/ui/icons.gen.ts`. Невидимые пути (`opacity="0"`) убраны, пробелы схлопнуты; об изменении сказано в первой строке
  файла (условие 4б). Файл делает `node tools/app/icons.mjs` из архива пакета, сверив его SHA-256. Пакет не ставится:
  `npm pack` берёт архив без скриптов, так что телеметрия пакета (`telemetry.yml`) не запускается.
- **Свои значки** — дверь, двойная дверь, скамья: таких в наборе нет. Нарисованы кодом в рисунке Carbon (раздел 7).

| Файл | SHA-256 |
|---|---|
| `carbon-icons-11.91.0.tgz` (архив пакета с npm, в git не лежит) | `77260d43016148438bb6ae2553e708573b5a81f47d3bbb03faa6e71e2103d804` |
| `assets/licenses/carbon-icons.txt` | `037b3e9eaff51477b270e9082f54b99175e4dd893548654f00995045b68294b8` |

## 7. Своё — код игры

Без внешних файлов, нарисовано кодом:

- **Значки инструментов стройки, которых нет в Carbon** — дверь, двойная дверь, скамья: `OWN` в `tools/app/icons.mjs`, в
  рисунке набора (сетка 32, заливка, линии в 2 точки).

- **Полы и земля** — `src/render/textures.ts`: плитка, линолеум, паркет, пол операционной, плитка двора, газон, асфальт —
  в 2D-холсте.
- **Стены, окна, наличники, створки дверей, светильники** — `src/render/world.ts`, `doors.ts`, `lamps.ts`.
- **Медицинское оборудование, которого нет в наборах CC0** — `src/render/furniture.ts`: функциональная кровать с бортами,
  стойка капельницы, смотровая кушетка, рентген, КТ, МРТ, операционный стол с лампой, наркозный аппарат, аппарат ИВЛ,
  монитор с дефибриллятором, тележка ЭКГ, лабораторный анализатор, аппарат УЗИ, эндоскопическая стойка, стойка
  регистратуры, пульт рентгена, столик для инструментов, процедурный столик, микроскоп, штатив с пробирками, перегородки
  кабинок санузла.

## 8. Своё — модели Blender

Пилот Blender ([#175](https://github.com/Nefeste/bolnitsa/issues/175), [отчёт](../docs/reports/2026-11-blender-pilot.md)):
файлы собраны скриптами `blender/` в **Blender 4.5.15 LTS** — пакет `bpy` 4.5.15 с PyPI, тот же Blender как модуль Python
(почему не программа Blender — в отчёте), — без внешних файлов: геометрия из частей, цвета — палитра игры, затенение и свет
запечены в Cycles. Права — свои, полные. Размеры — из игры (`blender/sizes.json`, `tools/app/blender-sizes.ts`). Запуск
дважды даёт те же файлы до байта; тест `tools/test/blender.test.ts` сверяет файлы с этой таблицей.

Часть 2 ([спецификация](../docs/specs/2026-11-blender-2.md), решение владельца
[#178](https://github.com/Nefeste/bolnitsa/issues/178)): модели групп — те же скрипты и тот же Blender, файлы сжаты, как
модели CC0 (`tools/app/blender-pack.mjs`, EXT_meshopt_compression); бюджет треугольников каждой — `blender/budgets.json`.
Группа 2 «Стационар» (0.59.0) переделала кровать и монитор пилота — те же файлы, теперь в бюджете и сжатые. Группа 3
«Диагностика» (0.60.0) взяла рентген пилота как есть — тот же файл, теперь сжатый — и пересняла свет рентген-кабинета M:
теперь это образец группы с моделями групп в нём, 32 точки на метр. Запечённый свет
групп (0.58.0): у каждого размера помещений группы (`light` в `blender/budgets.json`) — образец с моделями
группы на местах, свет его пола запечён в Cycles (`blender/room.py`, 32 точки на метр); картинки и образцы копируются как
есть.

| Файл | Что | Скрипт | Blender | SHA-256 |
|---|---|---|---|---|
| `assets/models/blender/counter.glb` | стойка регистратуры: 9 частей | `blender/ambulatory.py` (`counter`), `blender/build.py`, `tools/app/blender-pack.mjs` | 4.5.15 | `67b2023e1d5c3b8b052169b850b828c851c8fd254e36ff7aabbc5fed39e0e8de` |
| `assets/models/blender/desk.glb` | стол с компьютером: 8 частей | `blender/ambulatory.py` (`desk`), `blender/build.py`, `tools/app/blender-pack.mjs` | 4.5.15 | `b3820a85dc2e4cc76cd0987690be52dec061e07b251602bf7f03dc651b3fadcb` |
| `assets/models/blender/office_chair.glb` | кресло на колёсах: 6 частей | `blender/ambulatory.py` (`office_chair`), `blender/build.py`, `tools/app/blender-pack.mjs` | 4.5.15 | `182cb40547f213dd6d26d5caf91cffe37e46522f9bfe6e72dfb29d0b8a5abf0a` |
| `assets/models/blender/waiting_chair.glb` | стул зала ожидания: 3 частей | `blender/ambulatory.py` (`waiting_chair`), `blender/build.py`, `tools/app/blender-pack.mjs` | 4.5.15 | `5d92aa3e271d105c2077664ac7c3611aa3eb7901e62630fd705a2194404dd2c1` |
| `assets/models/blender/chair.glb` | стул: 3 частей | `blender/ambulatory.py` (`chair`), `blender/build.py`, `tools/app/blender-pack.mjs` | 4.5.15 | `664e79f479d28bab00603f07f52b6bd351e467d4b5a0fa216d7f2b03aa7f60c5` |
| `assets/models/blender/bench.glb` | скамья у двери кабинета: 3 частей | `blender/ambulatory.py` (`bench`), `blender/build.py`, `tools/app/blender-pack.mjs` | 4.5.15 | `f02d6ebff6438f79195072830a3ac5180f44da42832686a40449aac7cc10e385` |
| `assets/models/blender/lounge_chair.glb` | кресло ординаторской: 4 частей | `blender/ambulatory.py` (`lounge_chair`), `blender/build.py`, `tools/app/blender-pack.mjs` | 4.5.15 | `34909b393a5ad2928d28a732a529ca3b608fab8a5595bde2c665190405494cbd` |
| `assets/models/blender/toilet.glb` | кабинка санузла: 6 частей | `blender/ambulatory.py` (`toilet`), `blender/build.py`, `tools/app/blender-pack.mjs` | 4.5.15 | `065c3b2bd4b80f33dfd95a05f7da6fdbfa78214a8a333735fe9f915476804115` |
| `assets/models/blender/couch.glb` | смотровая кушетка: 4 частей | `blender/ambulatory.py` (`couch`), `blender/build.py`, `tools/app/blender-pack.mjs` | 4.5.15 | `30000016c67932f7c652075e02b865f8a9edabcb244e93d8f4dafe0fc6bd39ed` |
| `assets/models/blender/bookcase.glb` | шкаф с дверцами: 4 частей | `blender/ambulatory.py` (`bookcase`), `blender/build.py`, `tools/app/blender-pack.mjs` | 4.5.15 | `7a6e197b2ee535e71c68ce3c7ae42975ae16931ff8cd47743579fffed857c00f` |
| `assets/models/blender/low_cabinet.glb` | низкий шкаф: 4 частей | `blender/ambulatory.py` (`low_cabinet`), `blender/build.py`, `tools/app/blender-pack.mjs` | 4.5.15 | `6dcaf644c1c6bf9a24ab13714b99adb3fab271e3012b3bfeda518831d58aeda9` |
| `assets/models/blender/sink.glb` | раковина: 4 частей | `blender/ambulatory.py` (`sink`), `blender/build.py`, `tools/app/blender-pack.mjs` | 4.5.15 | `01792e530042fd40a3400f88620057484ec33e86cef88b495e660f3c4448eaf2` |
| `assets/models/blender/sink_wc.glb` | раковина санузла на тумбе: 5 частей | `blender/ambulatory.py` (`sink_wc`), `blender/build.py`, `tools/app/blender-pack.mjs` | 4.5.15 | `b78183f4a9d66e2aef83a505517ec180fba425f671245f0ec0b6f52538e6af84` |
| `assets/models/blender/lab_sink.glb` | мойка лаборатории: 6 частей | `blender/ambulatory.py` (`lab_sink`), `blender/build.py`, `tools/app/blender-pack.mjs` | 4.5.15 | `79611cc7aea48005c99cb09a4f77aa0bde0bdc733e689d984ab1ed0b4098d4d1` |
| `assets/models/blender/lab_bench.glb` | лабораторный стол: микроскоп или штатив: 11 частей | `blender/ambulatory.py` (`lab_bench`), `blender/build.py`, `tools/app/blender-pack.mjs` | 4.5.15 | `1a2d423a0136cb78330238c1ca438a2f4d0b5c026a977378d9e9850c89e9c8b6` |
| `assets/models/blender/analyzer.glb` | лабораторный анализатор: 8 частей | `blender/ambulatory.py` (`analyzer`), `blender/build.py`, `tools/app/blender-pack.mjs` | 4.5.15 | `8842b1559d43571b8d607db895b666eff752c4b9f02c9c9065974f41e62562b2` |
| `assets/models/blender/procedure_table.glb` | процедурный столик: 5 частей | `blender/ambulatory.py` (`procedure_table`), `blender/build.py`, `tools/app/blender-pack.mjs` | 4.5.15 | `079c81a8f32bf04b52e5609b68fa41362bf84e4c531479095fe5efaf1cdc8aa3` |
| `assets/models/blender/ecg.glb` | электрокардиограф на тележке: 9 частей | `blender/ambulatory.py` (`ecg`), `blender/build.py`, `tools/app/blender-pack.mjs` | 4.5.15 | `a5f85cfb181658f0cee0998a4d931c0f92a4aea887b19eaf630ad05bed8cb93e` |
| `assets/models/blender/room-reception-S.png` | свет на полу регистратуры S | `blender/room.py`, `blender/build.py` | 4.5.15 | `4fb8a133001dc387c46bc20c656616ad2259c9775dbb75765d2e6c1c993daad3` |
| `assets/models/blender/room-reception-S.json` | образец: тип, размер, предметы на местах | `blender/build.py` | 4.5.15 | `665e5a70773bcfa5db161685d96d42c362853671045b184270dfc46e936e0397` |
| `assets/models/blender/room-waiting-S.png` | свет на полу зала ожидания S | `blender/room.py`, `blender/build.py` | 4.5.15 | `f4f5ee310442e168921c080ad99aaddb53a38ab3351d80f00bac0937cf73fa43` |
| `assets/models/blender/room-waiting-S.json` | образец: тип, размер, предметы на местах | `blender/build.py` | 4.5.15 | `85492a5e5c63b64bf63ce9071697137a2bc2599cd91343b61a3b2d18612e591e` |
| `assets/models/blender/room-waiting-M.png` | свет на полу зала ожидания M | `blender/room.py`, `blender/build.py` | 4.5.15 | `c2d5020f3eacd481ae70a6b5567ec48cf5aa2feae783e8b05cde41720d0f6ab6` |
| `assets/models/blender/room-waiting-M.json` | образец: тип, размер, предметы на местах | `blender/build.py` | 4.5.15 | `fcc7fa27f0a5005cfd96edf2ace61c416d9905cb644b2c9ffed852ef538417d4` |
| `assets/models/blender/room-waiting-L.png` | свет на полу зала ожидания L | `blender/room.py`, `blender/build.py` | 4.5.15 | `62aff75e78b947bfbeb556f66c24778632be9e385fe42ac1c18a4ea778518331` |
| `assets/models/blender/room-waiting-L.json` | образец: тип, размер, предметы на местах | `blender/build.py` | 4.5.15 | `94e96aa152c1b1875369592a07f81870593fba3d5cab0a8d89214424948d395e` |
| `assets/models/blender/room-office-M.png` | свет на полу кабинета врача M | `blender/room.py`, `blender/build.py` | 4.5.15 | `c205aac925852e1a62bbbbedb4bee496ced0979dba2521dd6faa913198de9987` |
| `assets/models/blender/room-office-M.json` | образец: тип, размер, предметы на местах | `blender/build.py` | 4.5.15 | `7281455196cbb3fcc8d7765cb3fba9c93904397562e5e8a6a61016bbc799b232` |
| `assets/models/blender/room-triage-S.png` | свет на полу сортировки S | `blender/room.py`, `blender/build.py` | 4.5.15 | `b251877e4aca5f405835d21fa8daaa342099b85f621aa2fd6170a5f9149aaaaf` |
| `assets/models/blender/room-triage-S.json` | образец: тип, размер, предметы на местах | `blender/build.py` | 4.5.15 | `60ed3b9b526373e334b10f1ebbe11cbb1ca59eae9a3c519c1c4777563e2fbb24` |
| `assets/models/blender/room-procedure-S.png` | свет на полу процедурной S | `blender/room.py`, `blender/build.py` | 4.5.15 | `6027a23726174184a80d3c1459c3f6b0e13ad5c12a89581f11ee805e77969e06` |
| `assets/models/blender/room-procedure-S.json` | образец: тип, размер, предметы на местах | `blender/build.py` | 4.5.15 | `f39ad11d39fbe2aee5cbcccd6a8bf21e86eca17541239a5703f593c37ca1de56` |
| `assets/models/blender/room-lab-S.png` | свет на полу лаборатории S | `blender/room.py`, `blender/build.py` | 4.5.15 | `5776e0e037b7f05d947cb56722c6894f615f7cf70699385fa19645a0a9713597` |
| `assets/models/blender/room-lab-S.json` | образец: тип, размер, предметы на местах | `blender/build.py` | 4.5.15 | `2876294ea29e365d222baad0628dc34815328fad368fd47bc2bf0bf81b8e3606` |
| `assets/models/blender/room-lab-M.png` | свет на полу лаборатории M | `blender/room.py`, `blender/build.py` | 4.5.15 | `f033fd17eec0031dfac5dd5bcff3ebfce8f1164b666d01dac2fe3d94e29f21ba` |
| `assets/models/blender/room-lab-M.json` | образец: тип, размер, предметы на местах | `blender/build.py` | 4.5.15 | `05b2a902978a6f8acdaf7abd3034d9471566c13960f8d94d3ecbb91bb6965d69` |
| `assets/models/blender/room-ecg-S.png` | свет на полу кабинета ЭКГ S | `blender/room.py`, `blender/build.py` | 4.5.15 | `511f422348847c206541316d6a7609337907d751f9230f9ab0c335e3ea96cd92` |
| `assets/models/blender/room-ecg-S.json` | образец: тип, размер, предметы на местах | `blender/build.py` | 4.5.15 | `eb839fb58d690a49d5076fc71eb073394189924de7c6033154745f139bcecca8` |
| `assets/models/blender/room-toilet-S.png` | свет на полу санузла S | `blender/room.py`, `blender/build.py` | 4.5.15 | `290490a6f32deae4af6a7c0c49dffa5f6dd54cfeabab7c6d9e4de1842283a03b` |
| `assets/models/blender/room-toilet-S.json` | образец: тип, размер, предметы на местах | `blender/build.py` | 4.5.15 | `fb9a07d5d3586be1daee1a0992b2000ea48c5ec8cb8059795dd589d405d9c998` |
| `assets/models/blender/room-staff-S.png` | свет на полу ординаторской S | `blender/room.py`, `blender/build.py` | 4.5.15 | `91fad1536d2442372985e783493fb53a7387ab9173549c6ce792665447beb460` |
| `assets/models/blender/room-staff-S.json` | образец: тип, размер, предметы на местах | `blender/build.py` | 4.5.15 | `efbf5aa33bf84aec15790c1960f8fdd0f562100b62549d4fb4e306941fb917ce` |
| `assets/models/blender/room-staff-M.png` | свет на полу ординаторской M | `blender/room.py`, `blender/build.py` | 4.5.15 | `a94283a003083a175abb2e7ae61c5ef938ec17b3441faa06d4fe53debb2298f4` |
| `assets/models/blender/room-staff-M.json` | образец: тип, размер, предметы на местах | `blender/build.py` | 4.5.15 | `70034b69520df6871c34402719f63e67a720b1df6c2ca17d683c3e35b7fd46bb` |
| `assets/models/blender/rooms.json` | указатель образцов света: «тип:размер» → файл и группа | `blender/build.py` | 4.5.15 | `0c59813c45396c2768b6cd861f72ac3716f39e512251773deeb773afa4d905de` |
| `assets/models/blender/bed.glb` | кровать: 13 частей, стойка капельницы — `iv` и `iv_bag` | `blender/stationary.py` (`bed`), `blender/build.py`, `tools/app/blender-pack.mjs` | 4.5.15 | `2915164cb2b58bb15b44f0411d87093dca88dde031458260832b0057bc235f7e` |
| `assets/models/blender/monitor.glb` | монитор с дефибриллятором: 7 частей | `blender/stationary.py` (`monitor`), `blender/build.py`, `tools/app/blender-pack.mjs` | 4.5.15 | `83d3763c369b6ea000963bd346b6daf9ec4040678b898b2ccba6b5d9ad092da8` |
| `assets/models/blender/bedside.glb` | тумбочка у кровати: 6 частей | `blender/stationary.py` (`bedside`), `blender/build.py`, `tools/app/blender-pack.mjs` | 4.5.15 | `8a06e9491b18b0bdb0a0e53790aff6e67a44e533e1064943963fa68505c3c21b` |
| `assets/models/blender/ventilator.glb` | аппарат ИВЛ: 10 частей | `blender/stationary.py` (`ventilator`), `blender/build.py`, `tools/app/blender-pack.mjs` | 4.5.15 | `c439870df7d6f8cb66caa63de598a847269b5c0ca54349cfbdacef1874d0de78` |
| `assets/models/blender/room-ward-S.png` | свет на полу палаты S | `blender/room.py`, `blender/build.py` | 4.5.15 | `de9d728ec7b53198ba7ae4551729d6004cd22d8279d790f9e87fbcfcc606b360` |
| `assets/models/blender/room-ward-S.json` | образец: тип, размер, предметы на местах | `blender/build.py` | 4.5.15 | `70c91fb02ef0b4f2610cdeae250e561483d943c6690275ede9dff7ab41502468` |
| `assets/models/blender/room-ward-M.png` | свет на полу палаты M | `blender/room.py`, `blender/build.py` | 4.5.15 | `813237562374e563361d81befecef7461097146033a4a6ed50827bdb28248af3` |
| `assets/models/blender/room-ward-M.json` | образец: тип, размер, предметы на местах | `blender/build.py` | 4.5.15 | `d719ec17fcaf66042a0c89df7b4e2ad507c3745cd7c50829779873ea487be59b` |
| `assets/models/blender/room-box-S.png` | свет на полу бокса S | `blender/room.py`, `blender/build.py` | 4.5.15 | `b9cd03f299134f4b434dfcf9d7a203033374249df56d04233207276420d8f118` |
| `assets/models/blender/room-box-S.json` | образец: тип, размер, предметы на местах | `blender/build.py` | 4.5.15 | `5027e7290b59d151dca0f9d601b41489908ff8806d48a8ff93c9402b3279a869` |
| `assets/models/blender/room-icu-S.png` | свет на полу ПИТ S | `blender/room.py`, `blender/build.py` | 4.5.15 | `439ecce56ae825d280028f0fa503473b22c0f4e463bdeeb88fe479ef80630366` |
| `assets/models/blender/room-icu-S.json` | образец: тип, размер, предметы на местах | `blender/build.py` | 4.5.15 | `d8c5438a84fdcf1f5eb45beddc5f1e92eadab7f37f9377cba6150630a4ec145f` |
| `assets/models/blender/room-icu-M.png` | свет на полу ПИТ M | `blender/room.py`, `blender/build.py` | 4.5.15 | `365ca1fbfa471d573692927366cd29ac47adc6b559899008b016dde1d5dbb4f6` |
| `assets/models/blender/room-icu-M.json` | образец: тип, размер, предметы на местах | `blender/build.py` | 4.5.15 | `bf443e8bd98c0a424caca9cb6f22ffde8c7e0eb5cada9b1078e50aa768e4e56e` |
| `assets/models/blender/room-ricu-M.png` | свет на полу реанимации M | `blender/room.py`, `blender/build.py` | 4.5.15 | `d33f6d5d457ffb21f458736d845e9586ab3de7b97495644c793a2b7426e2c35b` |
| `assets/models/blender/room-ricu-M.json` | образец: тип, размер, предметы на местах | `blender/build.py` | 4.5.15 | `984d129a26cc5ce12bcd93896a1ba1be9a38c67049c67d01c722a4393b987d9f` |
| `assets/models/blender/room-ricu-L.png` | свет на полу реанимации L | `blender/room.py`, `blender/build.py` | 4.5.15 | `0e4b05ed44deae39aa540d4bf5c9fced482fa522f281685649623dbac467a533` |
| `assets/models/blender/room-ricu-L.json` | образец: тип, размер, предметы на местах | `blender/build.py` | 4.5.15 | `63a05a9115f82c620937030295fe5a7fc70fae5377c0d72e04f0ca994a49b5e2` |
| `assets/models/blender/room-emergency-S.png` | свет на полу приёмного S | `blender/room.py`, `blender/build.py` | 4.5.15 | `a3c3e06433d698142b31b53889df0dc6ed75472c99c703c27752b79ef39931ed` |
| `assets/models/blender/room-emergency-S.json` | образец: тип, размер, предметы на местах | `blender/build.py` | 4.5.15 | `304b72ca6f6c12e13c3403c14a2917802ab151948983dec69b26f8f2202f5b6d` |
| `assets/models/blender/room-emergency-M.png` | свет на полу приёмного M | `blender/room.py`, `blender/build.py` | 4.5.15 | `2bfa0de156fd2bb8a8d797a024372a30723c44fdde14b36c3aa02890b35c31c6` |
| `assets/models/blender/room-emergency-M.json` | образец: тип, размер, предметы на местах | `blender/build.py` | 4.5.15 | `037395d6e37d39ba3dd2b26a26fa530001fe91ae6c9fb39422cbaae7cd868173` |
| `assets/models/blender/room-emergency-L.png` | свет на полу приёмного L | `blender/room.py`, `blender/build.py` | 4.5.15 | `77f4f93fe8a1071bbfe9e0eb1b659323707eb76850bd95618edc4f5ece5d71ab` |
| `assets/models/blender/room-emergency-L.json` | образец: тип, размер, предметы на местах | `blender/build.py` | 4.5.15 | `cbf527567984a216398e8369db208aed7500ad7e79a2a605cd9ece6c5ed84fc5` |
| `assets/models/blender/xray.glb` | рентген: 8 частей — модель пилота как есть, в бюджете группы 3 | `blender/models.py` (`xray`), `blender/diagnostics.py`, `blender/build.py`, `tools/app/blender-pack.mjs` | 4.5.15 | `25625f4d22df7546397880f2472bc8e8df1fd0076d66623ca596260137b33a4d` |
| `assets/models/blender/ct.glb` | КТ: 8 частей, гентри и стол — `gantry`, `table` | `blender/diagnostics.py` (`ct`), `blender/build.py`, `tools/app/blender-pack.mjs` | 4.5.15 | `f726955fa7781251fbc0736d6a89cadef812a0b3d83c5daaa6f45f0e3f955c12` |
| `assets/models/blender/mri.glb` | МРТ: 7 частей, магнит, тоннель и стол — `magnet`, `bore`, `table` | `blender/diagnostics.py` (`mri`), `blender/build.py`, `tools/app/blender-pack.mjs` | 4.5.15 | `306aca93dc7b45f18a120961ee1de2345c6a1e1a46c9baeafdeddf9396abfb05` |
| `assets/models/blender/us.glb` | аппарат УЗИ: 8 частей | `blender/diagnostics.py` (`us`), `blender/build.py`, `tools/app/blender-pack.mjs` | 4.5.15 | `07145391acd1be431d1db09b389c38717ff60fc9bb817a08026f44e311c90021` |
| `assets/models/blender/console.glb` | пульт кабинета лучевой диагностики: 5 частей | `blender/diagnostics.py` (`console`), `blender/build.py`, `tools/app/blender-pack.mjs` | 4.5.15 | `6b07b21b2c8eae3b9b27d66ef37071484c8da9355dcd13c6a40709bc2f59b91a` |
| `assets/models/blender/room-xray-M.png` | свет на полу рентген-кабинета M | `blender/room.py`, `blender/build.py` | 4.5.15 | `74e07f695b2b137d6e8391fa08ee54034ef1d158b67563bd9c4d66f5ab9ca2ee` |
| `assets/models/blender/room-xray-M.json` | образец: тип, размер, предметы на местах | `blender/build.py` | 4.5.15 | `8f914b676c2b8105e70646d263600df6a41b19824a044e6afc5e4d452d860419` |
| `assets/models/blender/room-ct-M.png` | свет на полу кабинета КТ M | `blender/room.py`, `blender/build.py` | 4.5.15 | `fd330404953f6bc0a970fb01cd023894e4366bfa037cd1863b18e09d32eb1f84` |
| `assets/models/blender/room-ct-M.json` | образец: тип, размер, предметы на местах | `blender/build.py` | 4.5.15 | `2e2733c161f4a97fd02d0845e3a457176de386a91517ae4dbf1995049ddf94ba` |
| `assets/models/blender/room-mri-L.png` | свет на полу кабинета МРТ L | `blender/room.py`, `blender/build.py` | 4.5.15 | `3c204d0110fadf9b79cd27ab7017e73c0dfba71f8721bfb7c1a2e10ff6d91338` |
| `assets/models/blender/room-mri-L.json` | образец: тип, размер, предметы на местах | `blender/build.py` | 4.5.15 | `606215421390e9aafa0d94cfbf5d78b0e74f7b3e33b9d3c88f068bf99a83bf4d` |
| `assets/models/blender/room-ultrasound-S.png` | свет на полу кабинета УЗИ S | `blender/room.py`, `blender/build.py` | 4.5.15 | `8073bbfc4182e71fa61099b0b21b323c2127d883d1cece8e8db40aefdcaeb7c2` |
| `assets/models/blender/room-ultrasound-S.json` | образец: тип, размер, предметы на местах | `blender/build.py` | 4.5.15 | `00721d944536db2e512089e0afc824ac7bf0407e6013031aebafab851666eac5` |
