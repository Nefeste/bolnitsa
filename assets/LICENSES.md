# Лицензии моделей и шрифта игры

Правило студии: контент — только из названного источника с правовым основанием (устав, `docs/06-content.md`, ADR студии
0012); графика ПК-игры может быть и из генераторов, но только по ADR студии 0020 — с журналом и одобрением владельца. **В
этой части генераторов нет**: только модели под **CC0 1.0**, люди Microsoft Rocketbox под **MIT** (раздел 4), шрифт IBM
Plex Sans под **SIL Open Font License 1.1** (раздел 5) и своё (код).

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
| `Medical_Male_03` | врач, специалист, лаборант — белый халат | `0362668b83c966aca3281b7f69575135979d2d0ab1abefc4592fd471eadb5137` | `ded143bc80ec4d9f9830ad2d922f977df9b8ef10eb7f242a6a3a9215b3570fe7` |
| `Medical_Female_02` | врач, специалист, лаборант — белый халат | `1abe734c8f0e632d9739de3b84d0264af0d7a1dbce6f4a2733f70f640d71dc81` | `ac7654801e7d53caa671bf80e4ccdb0071a3c26deaa466e530301c403df292b2` |
| `Medical_Male_01` | врач, специалист, лаборант — белый халат | `b2e93911e9e40675089e81b81a45336ec07c7d6c2d03e9b4b4f283ab8605ef49` | `0c2824d5940587c90ad03447b26b6d64a5bec756f0472bb3f2ddc99b35c0708c` |
| `Medical_Female_01` | у женщин: медсестра, операционная медсестра, санитар, хирург, анестезиолог-реаниматолог, рентгенолаборант | `6835a091044017562d3d52d227ca931770e46310fd16dc336ae95033d6fb0fce` | `4a4952352213e110b256a0cb536d793eb25cb67c76e4c5f13e7eb02866cd4368` |
| `Medical_Male_04` | у мужчин: хирург, анестезиолог-реаниматолог | `257f96334a8f3a0aeccd3dc6307904c076eea4e6123cd8b65a1c90086897409c` | `eb8371c793c0c38aac8a28e1d898b682143f7606c554180e558a1fb9ebb7c825` |
| `Medical_Male_04_Scrubs` | у мужчин: медсестра, операционная медсестра, санитар | `129f42e62b67c511e3b6e3c0b3cba25b21ad5ce546dcb0501ffff3a0887718db` | `c0ae360b523e311d4866ab6ee7f4ea82f29ee0754aefdf22cf72082bb2281f96` |
| `Medical_Male_05` | у мужчин: рентгенолаборант | `5debe9ac2faf2ab2d39a52e53ef6cb8055877e3ce2064b836a23684cd9666a17` | `b8a5f00dc4c8b14156ac525252d2d0e9bb52d07b6c9a15ba4bb6fcc5da81f5a2` |
| `Medical_Female_03` | фельдшер скорой | `015e4e11c61ebb10a9904689efa0d0edfdee8afb5a2c9ae65fed3f1b1b2055d5` | `0538ddde45ac245ac6cbcb24d05a6a0f5c10dc3250e12c92fe736fa6f8587058` |
| `Medical_Male_02` | фельдшер скорой | `0657a437aa44720cd8c52b9dd449c6aeaf1f1b5f9d66396f63e1c13471368672` | `a7de56afa2e0fb16a24e8fee22a393bff0a470dc4b44d2de42b03ced23c2e426` |
| `Business_Female_01` | регистратура | `c1b146b75189ef660bf5331f52a54705c333c9c33d79893f7259e17a9291180a` | `9ab66b4509efce80434ce05a17dd9c3dea5c2f015ecddf3afd8874ad7dd3dca8` |
| `Business_Female_03` | регистратура | `82f9c6c9e48c9dbfd974b88997abf107a3e8b9d158254b9e85aa1b8f9c7a3ab5` | `f3f934a8ba1efe84e6e42b457da3f2862663a016991e42787e9ed9db7dfc4b5c` |
| `Business_Male_03` | регистратура | `90c0ea528d0c21d376dd5036533727ed0f1afdfcd1bc292b9c7a47aa627b58bc` | `18f21ed03bca5d21e7812e654c21972d36747cd94bb863c69203dc4124d9b532` |
| `Business_Male_06` | регистратура | `f6b70a2f7d6dd6e024247735e9cd3072b14a73c369527c81383cbd630af47ead` | `e0610899dd1f2658153848ebba63817a6603d038e763552f5c9da8f8fef23972` |
| `Female_Adult_01` | пациентка | `ec1de43f354ab59bc271eded368bba82bc81c8a2d23d729158311b4535e78bc7` | `1b528f4e5cf7cc0f74fd496604e29df655ed2f01cebaa6d798fa86cb6b0b5165` |
| `Female_Adult_04` | пациентка | `68adb9dc54e61dc6e292303b60ad8a115212bfacdc2384cbd102a4a221e36f00` | `b6016ea7f2495445264fb910118c10343cba71a75042f799f11fc3307237d5a1` |
| `Female_Adult_05` | пациентка | `61dc02bc0449f144f0dd6d01b60389a529c9ea331d7cb0f0d39ec392b6018c26` | `c247d4f8077e394f580e0ccd5b58a601b9855dbf15e359349802120192996f6e` |
| `Female_Adult_07` | пациентка | `9f2d2c297ca31d2140ab8e77c1628eb819e3516d858883cc4a71d50776860078` | `3a087d203c270cf68f71cab6bcab9a69a24684fd8e791c7094860d64390de672` |
| `Female_Adult_08` | пациентка | `61e1aded2bc8d193e14b93babed9ecef5982b52e91a3766c27a4f9977d40efe1` | `96821be4ada0b9a75eac65ff1911018a102d076803cc407cadb39c36f6ab439f` |
| `Female_Adult_09` | пациентка | `ff3e5a36fc33a4e30558bdb7f605901be7c2ca7ecca71160c3ff0e54b39c8d04` | `61d96f16257f55fab69544d9d0d6bc9be179f697275e1286c198e0091b0b164e` |
| `Female_Adult_11` | пациентка | `901810215969b3ffcbde5a6bb48f0af4e98ffbd29c7bace8bddca0de89983584` | `979a696ac52c728f790f0e23988894b4b17c5cb5787eff8364ee54466a62a4b5` |
| `Female_Adult_13` | пациентка | `f21aab85ce5898ac948933ed7c05fbcee7fdf34ea4d9b252190c6323866c7342` | `385d95dc6b3a91e0675a684d5a4a4c487993b58c27ba4e1ac42cde75dc5a1931` |
| `Female_Adult_14` | пациентка | `52477899cc6cc5682edf9b20ebe93b4a1d046bbfe3ea5a493531b39bbdde36a8` | `a233050a51ba3ee053bee1ae210d1c0d49ccebb8cdd93516cc5114c6b328a2b5` |
| `Female_Adult_15` | пациентка | `325bd89d2c0c3f9313152d4d98929d59eff65cb1ffda4e9801846aba5e7def66` | `8f5bdd87d6c978d9f83b2d4bafca9f2d58417537912a440cf2b9beedbf4c1a57` |
| `Female_Adult_17` | пациентка | `f78c5cbbcdcb41f7bec99199b4963b51b6184916fbd1132a92ff03b14241fb9e` | `7e467a56161db53bdff19fd212474b0daa9094113bd90cfdd3d3d6630863dc43` |
| `Female_Adult_03` | пациентка | `97b4fe70df11767e78af51e06a3fc9dc33c624039843b192fc0673f59e59791d` | `b433ad6fa05272cad44c6d4fd84734b0af4d40aa1cb0fe0ebdc5b3cbba8636ff` |
| `Female_Adult_12` | пациентка | `22742307fc83c46130ab28647e9bb47951d88b429ffe197302f827b02e7e940d` | `b11459e03d64fed56c95fc17ed45efcdc8b9b60acc9e7a24d7aee780ac227801` |
| `Business_Female_04` | пациентка | `72eb913b3c72695c023d163dc9a799c916b77bb547832714f7d06803551ad8b6` | `27e4abcbca2962af5955cfd0da0ad9375af2fcec2097ca80ef9e0d5fd46ffab4` |
| `Female_Adult_02` | пожилая пациентка | `e522cd7c7d5d337da932f73354389e349a0d4f5454701f29f0d1d674c37c4025` | `c1bf0da05cb5ef387c42387e2013190950f61007cbc8163959f6a37255ea436d` |
| `Business_Female_02` | пожилая пациентка | `934dffc87fa8e376d09297e80590d8eab1a47574fe0038895a0548b93e5ed17c` | `8638c0d0a2023cbd8cb28923b84c028b87d0fde3290d78e4e2382999c09f6771` |
| `Male_Adult_01` | пациент | `d514aa59c02470e9b0c6feb8a2804b0f930a53b15431b3be7de1dbf9a2ccf85a` | `dcef4ab3595094d1ea067ec5ccfe6d9689a382355e7f828817f45ffa296428d8` |
| `Male_Adult_02` | пациент | `41e68d19388e3a0affc820794708a236298d52fc3dd4c7c4b4a782f6b6118211` | `1e7e93ad15597b16071d49e7fba617ecf75a13da49f093903c5f87c01e4c2bdf` |
| `Male_Adult_04` | пациент | `2629f89b6954706ab6dfbf37ee1ef32e42f0d8f798445db973ca2d7ee7db26af` | `2be618defe8c94b0f86a93c33f097e07d7279ab4429bb4e98d5df9754e951cde` |
| `Male_Adult_06` | пациент | `88c0d41d38e1fc2d7bf9fa46184bb0e1d1e9f3bc74351841e789b946fcc23490` | `297ad73b604dca2fac751be747c7292de9b41c1e75f32673272da9bf51254a8f` |
| `Male_Adult_07` | пациент | `95af162cbc6c97f7c1427aa4329eaf6c90081169ccbf52b30b3411278d704778` | `4ff8c0ed5727b9a85f90315e678015500556b508406926fd2d5231f535116b79` |
| `Male_Adult_08` | пациент | `eb1bc0c0d5751c77a59935121bb286db8953068bd69b4b10edadd9be89947381` | `321db84ea694aaa35df47869745f8189aca0b4a3b7fa5145ec6f68ed55250678` |
| `Male_Adult_11` | пациент | `7f6d3c28a3741c075885d50992d0e84677ad881b7c1363dd6ac8b366b7143035` | `ef5f421d7400d8f44fd692ecefe4eb37af11e850f4b92bdb570b5ff2a7763249` |
| `Male_Adult_12` | пациент | `02a789d2a4b1423e153dde28e2c4954670db8b64b5918679172a8d49c47b70ce` | `3272a0f4efea17b3f8a5c1034a4a4b272ed4e3b2200f6b44bbc4b1b4c13b327d` |
| `Male_Adult_13` | пациент | `2e9743808226038a385d1ac27350f6e208417c151990946317c035eb3cbc1734` | `994103b30c3c03ce769647fce994485dffa996a11718daffe9443747ac83f3a0` |
| `Male_Adult_14` | пациент | `804dd3eaf7d08e305187afa07a571c9a5eb72b78099b3ffd5a9aed8d0af210d1` | `e0ed67376326b4daa9fdd2877628c19f83adce5d1a0afa6d85b82a25d8b21580` |
| `Male_Adult_20` | пациент | `d59d72dcd2d31b0376bf6422cbfb9ff580fd874ad024175813c61af03a3d4eba` | `de5920e871b25eb34a62e971cecb41865e977f7f6eaa4478e3b13ce1d7ee53d4` |
| `Male_Adult_09` | пациент | `d1d5aab1ce274eece6e2c7c4c5128fed62bacf1d7d70ab34da819d79d48e75c2` | `69ac7701a3b52eef774b4123a9df144ce2103ce1aa04e133d7a5360bdfc5a53d` |
| `Male_Adult_10` | пациент | `4ac53843f1818c30233377f1d7661bb9565f135e56d20d8f3d6ce5a51ce02bfd` | `dc8b540119eec575f2ef770380730c6e7444ad37dcd1fecd5df513c149feb37a` |
| `Male_Adult_16` | пациент | `0215abdc3b8250c4b247227de833cae8fc66d4b8f4261d829f2c6c1080ec578e` | `fc3d5ba965a81bdc1fc3c2630592184f2cbe267f15f8a31a1bf251664175e2c1` |
| `Male_Adult_17` | пациент | `411e48b52e7b007d613b0bffd934c99ad1c7b53734fc58866383a3dfd8cad709` | `bcc824695f7b190580d2b330baa8134128047fb5e4aa03c20446cfe1f13012bf` |
| `Male_Adult_18` | пациент | `640bc019936a7f74c44c8694ffa58ab1c2526441ad6ac8595dd4dd662e0d2944` | `08c40809a9241c03e046ce95ee98805a72731e6802508cf6e5f66b212cf5caac` |
| `Business_Male_01` | пациент | `b97f148d1defe5f8530e0597066b12779966f1b217c42aa2032b4707457b7ab5` | `1d82c4729da0c598fbdbb86a3e4ec8691be77a52fc2948fc61379924dca1469c` |
| `Business_Male_02` | пациент | `2407875e2e927d06a54b9af399201afd5be590544bbbd895da680cd35eb0b035` | `797734b60bc27ce1eaeeb881daa6de10cfabfcee8ee415711940f71ecd9b1fb0` |
| `Business_Male_04` | пациент | `98c2471b67eee6ce46dbeb3c620a14ca3a08cc9ce96709732b0b29ee47f09f35` | `38a60cfc32c50e52ab0c7c3813c51d98374e51216bd1b3a999c3c2e61de799fc` |
| `Business_Male_05` | пациент | `4794f99faf413940860becce94585af83fc2c77dada2fa71cdfc01288ffc9ae1` | `fea8bad16a6ccb11040f53be473cee0c520fbdcca0865aff13bbdf9cfc8ab1ac` |
| `Delivery_Male_01` | пациент | `553b6c3851fa9b61a833695cc42dbc64ccabce530d06b43fc30e16c0b9dbd9ce` | `e7726f5e12f9d95aa7c1974d8a5d4c471f1282ecf7320d790d9d82939ec51a46` |
| `Wood_Male_01` | пациент | `697fe7078995ff86c6db2d59e8ad83229d5b6e5cfd96aaeaf5d0bcc812f850cd` | `5c0b255ee3e0e613d89e75371ce9ff23de39e9f38f33768dbeb333bf1b7d77c3` |
| `Male_Adult_03` | пожилой пациент | `fa2c8cf55f95b90e55297e32ba84d26fb939e97402d76a0cdd1ba1c9a0d784c1` | `d66d299c08370608cc580b8fff5500dfef2dbe8f79e738160d779feabd5df0d2` |
| `Male_Adult_05` | пожилой пациент | `d73cdc3883380173cc614e94d429d4b5687f6470faf1cc99033e51226d1ecd8b` | `e7820983f9e9d71924bd5f4a14a348ab29d0e37b17abc9634edd4bd0c73801de` |
| `Business_Male_07` | пожилой пациент | `3b74d194cfe5a17a8c1dc912bf31bb10316c7f64362d945f71b1bd236fd25946` | `2c2148557e5d3cfb19fd67d32d2e695c9d1eba9638721fbd8b6d3e2195e99a7d` |
| `Gardener_Male_01` | пожилой пациент | `bd22fdd66f7fa0d94e235fd2813d475fa6c061cf6d263995cdd5178a5a65145f` | `54ee3c5d7f51b8efae28cc109a7b2377240f9b13d3aad4f660a40c96e9093046` |
| `Construction_Male_01` | пациент в спецодежде — строитель | `ead087ec770b2cf39e3daf6d8455faef4eceaec675f095cc2e3e6b77fd26bb4a` | `858fd95632d1870f4419d0ef0df068a6843c727a05e57540625d4a446db27d9e` |
| `Construction_Male_02` | пациент в спецодежде — строитель, сварщик, шахтёр | `17c379dade97c7cd2f0edb70e1f2504ae90b3c3121fdd389909ef607dc5739d0` | `06cfe0c82ff97a73e49bcca038d609cc58701ef2409e23b8e6f113448e8b8a9c` |
| `Construction_Female_01` | пациентка в спецодежде — строитель | `b071886c032940ee56ddd275e19b0e8f9114d1183622125938e5d5fca2914dd5` | `23615597600e1b25dfff87e5c7dc3d7d2403d48b16d11469cfce912594bc7b6b` |
| `Chef_Female_01` | пациентка в спецодежде — повар | `1ffdb80fbc15a9b4075e1eb8900d8f24baabae676b2239e74bcc8f47cb89d5fb` | `1c820e27a41b320d51c59565a897dd8c360dc95cedb4ee7a5b254d1a7b187daf` |

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

## 6. Своё — код игры

Без внешних файлов, нарисовано кодом:

- **Полы и земля** — `src/render/textures.ts`: плитка, линолеум, паркет, пол операционной, плитка двора, газон, асфальт —
  в 2D-холсте.
- **Стены, окна, наличники, створки дверей, светильники** — `src/render/world.ts`, `doors.ts`, `lamps.ts`.
- **Медицинское оборудование, которого нет в наборах CC0** — `src/render/furniture.ts`: функциональная кровать с бортами,
  стойка капельницы, смотровая кушетка, рентген, КТ, МРТ, операционный стол с лампой, наркозный аппарат, аппарат ИВЛ,
  монитор с дефибриллятором, тележка ЭКГ, лабораторный анализатор, аппарат УЗИ, эндоскопическая стойка, стойка
  регистратуры, пульт рентгена, столик для инструментов, процедурный столик, микроскоп, штатив с пробирками, перегородки
  кабинок санузла.
