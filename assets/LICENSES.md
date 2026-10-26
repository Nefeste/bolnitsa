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
| `Medical_Male_03` | врач, специалист, лаборант — белый халат | `0b025ea93ebd04be41a3861cb0569769c4994ac3f69838d7684bdcb88116bf2b` | `eda63cc84cb391decd38f2c01f6b98cb9215b7f3e4d9fc39cdab973d41430019` |
| `Medical_Female_02` | врач, специалист, лаборант — белый халат | `ea2833158f3cd702bd0eb60cbc4fb072582109453a45cbe3a62ad664d9fb37bc` | `3afc0a5a5f99bcd5903d02f4d81c7c46c96f5a1c675dc1edd8ad55a541caf973` |
| `Medical_Male_01` | врач, специалист, лаборант — белый халат | `20d0108f0e19d006663759f335935056ba88aba4daf8470df8d0c523c506cfd9` | `89ef51953a60472b9bbb628bed1f4a917a62ef2b5cecc819c9661ed8e6b0e746` |
| `Medical_Female_01` | у женщин: медсестра, операционная медсестра, санитар, хирург, анестезиолог-реаниматолог, рентгенолаборант | `a44832c5f857cd05fc7e35572fba8e3c4eaccdd8f629078fe525a0e56d164d9a` | `3f836005ced81de968d8aa7b0d3e2c44030641a3951ed29546b1e43818a5b275` |
| `Medical_Male_04` | у мужчин: хирург, анестезиолог-реаниматолог | `e48e5c143ef402c6b8bf1d5a04f92a20ada4c80903c332c3b082866d02f3b095` | `dd6d48227549c4a13015f6c0529ea044cb0ff1009b3226987fe1e6f7f2e0c301` |
| `Medical_Male_04_Scrubs` | у мужчин: медсестра, операционная медсестра, санитар | `6a1f37dff49d3dba704ffef823b55ee0885209d714856bde2f0943d6b0ebe3a5` | `bff1f8f774e5c979cf0f1c34e817cb537edd99eaf554f07b8baa5717bb26185e` |
| `Medical_Male_05` | у мужчин: рентгенолаборант | `486c6039a14819362c922268f4bc8e84900974759fa302ad98e740486c777c2d` | `eda63cc84cb391decd38f2c01f6b98cb9215b7f3e4d9fc39cdab973d41430019` |
| `Medical_Female_03` | фельдшер скорой | `b088a24c9c7da9460c88d3263a17dd277ef0ef19bcb24996e28b2978dca55eaf` | `9b6e412a848f0463a267fa68087e98890dafca8fdfc1bb2ccdceb1c2384b7dcf` |
| `Medical_Male_02` | фельдшер скорой | `ff8ba281333b8b1f418fa3453bfe5839cdb07c9fc3f3b774315bc42e9745a99b` | `3ac8c4de190ebb457ff36da9eac0450ccd55951942cd31443bb1e377650e0c61` |
| `Business_Female_01` | регистратура | `9ca3f8747ca3062d73ebaa5a4c713d61f80f001e6a51b1eeeca70268102d8346` | `e17cf519d85d01a48388682084dac76b5f5d7c0b8e8e6e5237872fdf21048833` |
| `Business_Female_03` | регистратура | `228e02fb45aa955c7e3b3dc85044c289fe1dac85e8fae4f0fab817a21daa969f` | `caa21178b41169aa0ed310f39c716b64fbf4cc5a54efe042967d656482d24e0e` |
| `Business_Male_03` | регистратура | `12b214f92949a24971feb3ae333c7f17609c6ce7126f43ba72963b4bad2e2f49` | `ef1fdbd70a403c4faee06aa5d9a09f4056664a955c20bb403bfc6239126248eb` |
| `Business_Male_06` | регистратура | `785d1d1a1c8bda487ccfb373dd58cfc1ad241fc389a3d32fc73d6d86a02c5d78` | `eda63cc84cb391decd38f2c01f6b98cb9215b7f3e4d9fc39cdab973d41430019` |
| `Female_Adult_01` | пациентка | `1d1bcc4fa948c2ee4a3bdf58f0109db820a03fd8bf1c55bb209a04b86ed00b0a` | `7235138a86206bbf9a9e49331002f85fd5f1baf797f9b32cb74960eee5ade1ca` |
| `Female_Adult_04` | пациентка | `cc1157c2275911d00ca52b6a1eccace50de5604195de87567309c23b7e5d92d2` | `0448973c9e5d7a5b525b762e6a821457395940939d0d91b39183583c817a3699` |
| `Female_Adult_05` | пациентка | `75b0104d9884e4286acfa155076f80b49b2e5ef19a09d3bd7eec1e822771d19c` | `ee06f969a56131b313b55364392c507133877a142bbd05ba50a3a6dea5e48030` |
| `Female_Adult_07` | пациентка | `abd0476a0c75280d02992c28d04d61618b4bdabf7b25ed590183ea6712ec9512` | `966fd301513e7d3bdddee02250fb9a05208cda8442845668b0bd203b7a3fb46f` |
| `Female_Adult_08` | пациентка | `c050e2b54632b0f7cab04170cb38bd8984b95f51fb48de8377ad821e84e9a40b` | `764355a0ed5cc11e285dec1913722889a6b5fca359abcb128617ef2a43e10e12` |
| `Female_Adult_09` | пациентка | `1ba6325a50433bd06a7434d38c756c2a082677f996007c7162555934d5014c83` | `9b6e412a848f0463a267fa68087e98890dafca8fdfc1bb2ccdceb1c2384b7dcf` |
| `Female_Adult_11` | пациентка | `d19d673a38f1367887d9b249e43816121f6535f61f0d7046675a6419633f44a5` | `fa7946dd1a769a9086ffeadf42ddde94b2d1de305f3d29bdec096a6662d1536f` |
| `Female_Adult_13` | пациентка | `98cb6b246fa676ebf6e044e8e7342a74a095423ba2b4606caf709bc445d34a9f` | `07083de4c94a198da4d1625379993d99001ae4ade9781e356f3fb28f5944ff25` |
| `Female_Adult_14` | пациентка | `7633acc135b9558a7d38a14fc1976c4e6b56fb87cb190c312d8f56b51c73421a` | `9356b63a4b731a8b2e141ff1fa0f4ea3cefab96af35a60613e4135cb87642d0b` |
| `Female_Adult_15` | пациентка | `9885fb09e9d757f0fec0f409f22a7dcc32d95673529bb5455e106157dd7166eb` | `f8d5b7bd18a3e558595694c27c39807fed37a74e47ae9dcfcf3a3243b1e84db2` |
| `Female_Adult_17` | пациентка | `fec601284c8e47cb8eb9d0d22d4ab02618d46ff4bf56019cfbb4d5f216eae15d` | `f84e29df0d7f38c5d310229499394a109871774fe511c7381fc59556d06079dd` |
| `Female_Adult_03` | пациентка | `67d36264fb4bcb1e4458dca2cddf17b6bfaa62b855677e29fcc683ff2058bc1a` | `73d36c352b54e7538bcffdce1a61ba2df7142a925e4292812091559ee18509e6` |
| `Female_Adult_12` | пациентка | `6710e44f1fd9c36dad4d820a6eb2d74b1755c2e31442624d0825979b4c8ce436` | `855c67231093912c1271084ef9c890278cbe27f1842dd6810a5fd742a022e092` |
| `Business_Female_04` | пациентка | `c380e5bcd2c3a11cc62eb2c16442ef2fb61d41ea5c321c70b6312e02615302f2` | `3afc0a5a5f99bcd5903d02f4d81c7c46c96f5a1c675dc1edd8ad55a541caf973` |
| `Female_Adult_02` | пожилая пациентка | `f3f44dad80539f344ae116dead288448167164a4febeed475aa9623b4f90486c` | `b9657ad75835eb3fdf72a666a6a46525ba019dcad3777ced41d154b67d20f281` |
| `Business_Female_02` | пожилая пациентка | `bcdedf2a88c869f9f25bf9d39af7c53bae57723b96c352d62cb6514adbe28ac9` | `211a92178b49375f78a96776b3c75b2ed362b8644a9e6b71d11bed4dda01c0dd` |
| `Male_Adult_01` | пациент | `e819b578bc2993dd3b1e0fa7f37b0080a1f31adbe79778d669fe062a22d33888` | `afa7a3f366b2f39fef0926bf607e6ab01d7c7d4fd1575631d4749e5249d0a0e5` |
| `Male_Adult_02` | пациент | `a7739b8c98e7b6988eda83763c8f67ea5c5f419a97b4f401f7fb37a176484ea5` | `c310fe82e44b3137e6f72374f7f7e31f48af02678e1d125f7a81cab4708f205b` |
| `Male_Adult_04` | пациент | `5cd6dd0ba2da16549e79c72441c198d4f64e79ea76ec564f9aaf326f78352f3a` | `b165135c837e1fd671a3f3acb5da77dba1345c3cce9e818e33454a564d072aff` |
| `Male_Adult_06` | пациент | `50d89641c8ec962a2b628bc60af389ccb4b1c30bda0eb9774e2655a459ed6815` | `3ac8c4de190ebb457ff36da9eac0450ccd55951942cd31443bb1e377650e0c61` |
| `Male_Adult_07` | пациент | `1f5e4def7ff7a593249da46ac1e71e9d06f6e8277f38d0870d5289ca1b272b14` | `e40860b3490d7361dc66cd92b837d47bd5c1f832f5de4b4133e1c00b128a229e` |
| `Male_Adult_08` | пациент | `7884867b9a722409f8f7e011c33116f2f4d0f9447a546149140c33bd8a50ca29` | `0274d6abe0b5dd3aaaf1f82f0b1bef60dbcf1f2ac98024fe64debd0d022ca109` |
| `Male_Adult_11` | пациент | `998a125ef5937c05fe3669dcbb75bd8e50058954c6d056254df70688646a23c1` | `eda63cc84cb391decd38f2c01f6b98cb9215b7f3e4d9fc39cdab973d41430019` |
| `Male_Adult_12` | пациент | `0644dd06f6efb94cfcb28a9d302ca8711ea42e5b612fc32a7c6e8ca765d438b6` | `eda63cc84cb391decd38f2c01f6b98cb9215b7f3e4d9fc39cdab973d41430019` |
| `Male_Adult_13` | пациент | `501b6a13272e3410f5d1c29df2a3e46218970261a1dd1eda6ee299bbdf2da1c0` | `eda63cc84cb391decd38f2c01f6b98cb9215b7f3e4d9fc39cdab973d41430019` |
| `Male_Adult_14` | пациент | `1df13f073ba4ec35886552f344fb77e065a31fd892b930d5cd0193d364508bd6` | `eda63cc84cb391decd38f2c01f6b98cb9215b7f3e4d9fc39cdab973d41430019` |
| `Male_Adult_20` | пациент | `e21d2b19a09a4438f78f661487bf3b40f8a66682dbed30e7ea0d8977e49b0282` | `eda63cc84cb391decd38f2c01f6b98cb9215b7f3e4d9fc39cdab973d41430019` |
| `Male_Adult_09` | пациент | `1de73e0f95524df16dcdf2ebec4c8c60179f60a3e3cf09e40093f8f1796dd070` | `61fdb30c1e74e1db2b21819b9b93aaf99969f8a8dbf0e8ee4a94d1f62be83c98` |
| `Male_Adult_10` | пациент | `4e73a0cad9680528960d741a492a9e5d303130abab08c9f4e885875feac8230d` | `40c6fff830fbc1304ea2ac261d4dd38b6935c0ba64cf512da5c856609a1dd8be` |
| `Male_Adult_16` | пациент | `89f5cd03fe6d88cefad05400c296794815dd75e51cb11c1bae0ec1d12ea669e9` | `eda63cc84cb391decd38f2c01f6b98cb9215b7f3e4d9fc39cdab973d41430019` |
| `Male_Adult_17` | пациент | `701ad17b3e320854b87d3b1d6608414fcda86d0f0b00c017e2ae1bb993faf53c` | `eda63cc84cb391decd38f2c01f6b98cb9215b7f3e4d9fc39cdab973d41430019` |
| `Male_Adult_18` | пациент | `d05046eebaf559490e0c26ec9b6c77bcef42061a55b926c2645026b39d627209` | `eda63cc84cb391decd38f2c01f6b98cb9215b7f3e4d9fc39cdab973d41430019` |
| `Business_Male_01` | пациент | `d249da91c9e6127edf38f49c6f51715ea1d58474c82cce969556cf828481fad3` | `89ef51953a60472b9bbb628bed1f4a917a62ef2b5cecc819c9661ed8e6b0e746` |
| `Business_Male_02` | пациент | `86fa545706d81a7a41ab44a73dcbf4f78a3bacef60eea61ee5dffb8aac8c8bad` | `4fa948aa81c242cfb8b7cfec931e77e15e058f8df982247beb39c39db17be89e` |
| `Business_Male_04` | пациент | `eb188372f3382e61390ac6ce0793f13a70a52a7d8a6646aba4b0be2b02946575` | `eda63cc84cb391decd38f2c01f6b98cb9215b7f3e4d9fc39cdab973d41430019` |
| `Business_Male_05` | пациент | `70a8e5e77b39e35504603e0d0be873f4a43cb4c43af1308c0ac751868e84e2b2` | `eda63cc84cb391decd38f2c01f6b98cb9215b7f3e4d9fc39cdab973d41430019` |
| `Delivery_Male_01` | пациент | `732ba234534d3f804daf463f3a7c679e4ce181196133c1487273423e20c971be` | `eda63cc84cb391decd38f2c01f6b98cb9215b7f3e4d9fc39cdab973d41430019` |
| `Wood_Male_01` | пациент | `d054449b34d845ed079b00e7a5ecb809d48a9856335ee9e1ed374401767ec929` | `eda63cc84cb391decd38f2c01f6b98cb9215b7f3e4d9fc39cdab973d41430019` |
| `Male_Adult_03` | пожилой пациент | `53e497ba5cf0da8ecb24a377bd000499b1f71703578549119d1d6934303a7191` | `fcedd4cdb3fc80023b7a72668827dcf0e9e8b23bb06a90e449a44c02f3409ccd` |
| `Male_Adult_05` | пожилой пациент | `cf6d1fb7eefb2af64e40c2393e20cc7876f105de104aff9a03be94f362b66530` | `a25fcdf98899fca382bf52de881424ac502bd703402004c4702430c5a0760912` |
| `Business_Male_07` | пожилой пациент | `c025f86435884282884ebeddd3bbc268551d3755ae119f9bd790466a53ddd418` | `eda63cc84cb391decd38f2c01f6b98cb9215b7f3e4d9fc39cdab973d41430019` |
| `Gardener_Male_01` | пожилой пациент | `f5e36bb7b354098e7866dd47b5ef906475c6e28c1f1f8c0efd1addae11c095fe` | `a25fcdf98899fca382bf52de881424ac502bd703402004c4702430c5a0760912` |
| `Construction_Male_01` | пациент в спецодежде — строитель | `0487bad84674d40130ff0af5c5b070748afb2e94bb7c13dd8d69ac77abf12656` | `41ab80c34b9beafe3fa0622fd470e33d945c051a4b0522266e8fd6ce8a230a48` |
| `Construction_Male_02` | пациент в спецодежде — строитель, сварщик, шахтёр | `0509bf0012af9eb28f361b6d9938b0c80191441db1900f290630b8e6cb342b66` | `eda63cc84cb391decd38f2c01f6b98cb9215b7f3e4d9fc39cdab973d41430019` |
| `Construction_Female_01` | пациентка в спецодежде — строитель | `226c4cbbfb8399d525372034aedaef5adf118e771496fc16e70b1e4a8c7faa7d` | `eda63cc84cb391decd38f2c01f6b98cb9215b7f3e4d9fc39cdab973d41430019` |
| `Chef_Female_01` | пациентка в спецодежде — повар | `d8b4b4934c947fd8473f7d403f81d3509167964af2635ccf132afd9dbbee53ef` | `eda63cc84cb391decd38f2c01f6b98cb9215b7f3e4d9fc39cdab973d41430019` |

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
