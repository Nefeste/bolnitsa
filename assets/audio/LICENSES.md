# Звуки «Больницы»: откуда каждый файл

Все файлы — **синтез**, собраны `npm run sound` (`tools/sound/gen.ts`) из формул; чужих записей нет
(docs/specs/2026-11-sound.md, часть 1; устав, `docs/06-content.md`, «Звук, музыка, шрифты»). Пересобрать — та же
команда: шум берётся из генератора игры с постоянным зерном, файлы выходят те же. Руками не править.

Общее: моно, 44100 Гц, 16 бит; срез верхов 9000 Гц. Колокольчики — частотная модуляция (отношение 1.41,
глубина до 4, гаснет за 0.3 с). Стук — тон, падающий по частоте и гаснущий, с шумом. Комната —
реверберация Шрёдера — Мурера (гребёнки 29.7, 33.1, 37.1, 41.1, 43.7, 47.9 мс, хвост 0.6 с). Генератор — копия
`tools/sound/gen.ts` «Сказов» (ADR 0002 устава), звуки свои.

| Файл | Что | Параметры |
|---|---|---|
| `click.wav` | кнопка окна: короткий мягкий щелчок | тон 1600 Гц, гаснет за 6 мс; шум в полосе 3 кГц, 3 мс |
| `build.wav` | стройка: встало помещение, предмет, дверь — глухой стук | тон 210 → 150 Гц, гаснет за 45 мс; шум ниже 900 Гц, 20 мс; щелчок 2,2 кГц |
| `demolish.wav` | снос: два глухих стука вниз | тоны 170 → 120 и 130 → 95 Гц через 90 мс; шум ниже 600 Гц, 40 мс |
| `hire.wav` | найм: два колокольчика вверх | колокольчики E5 и A5 через 0,11 с; ЧМ 1.41, глубина до 4 |
| `refuse.wav` | отказ: два тихих тона вниз, без резкости | тоны D4 и A3 через 0,12 с, гаснут за 70 мс; срез 2 кГц |
| `urgent.wav` | срочное: спокойный вызов из трёх колокольчиков вниз, как в больничной трансляции | колокольчики G5, E5, C5 через 0,16 с; ЧМ 1.41 |
| `letter.wav` | письмо: шорох бумаги и колокольчик | шум в полосе 2,5 → 3,5 кГц за 0,12 с; колокольчик A5 через 0,08 с |
| `meeting.wav` | планёрка: утро — три колокольчика вверх, неспешно | колокольчики C5, E5, G5 через 0,22 с; ЧМ 1.41 |
| `goal.wav` | цель выполнена: четыре колокольчика вверх | колокольчики C5, E5, G5, C6 через 0,09 с; ЧМ 1.41 |

## Музыка

Пьесы выбрал владелец 08.11.2026 (#214) из десяти кандидатов агента: спокойная музыка CC0 и CC BY с OpenGameArt.org и Free
Music Archive, без NC, ND и SA (решение владельца #208, вариант 2; docs/specs/2026-11-sound.md, часть 3). Список —
`assets/audio/music.yaml`; файлы собирает `npm run music` (`tools/sound/music.ts`, нужен ffmpeg с libopus): исходник со
страницы пьесы — по SHA-256, тишина по краям — прочь, громкость выровнена (EBU R128: −20 LUFS, пики до −2 дБ), вступление и
конец — плавно, стерео Opus 64 кбит/с, 48 кГц. Это и есть изменения, о которых говорит CC BY. Руками не править. Авторы
пьес CC BY — в «Настройках», «Музыка».

| № | Файл | Пьеса | Лицензия | Страница | Как указать автора | Откуда |
|---|---|---|---|---|---|---|
| 1 | `music/bluebonnet.webm` | Bluebonnet — Kistol | CC0 | https://opengameart.org/content/bluebonnet | — | OpenGameArt, 23.04.2021; на странице: «Music by Kistol»; WAV без петли; исходник https://opengameart.org/sites/default/files/bluebonnet_in_b_major_0.wav, SHA-256 `78efdda0a68fd7cf7029cb991a2a82c1d20dbc5bb821f9cbc2306f92eade33d9` |
| 2 | `music/another-august.webm` | Another August — The Cynic Project | CC0 | https://opengameart.org/content/another-august | — | OpenGameArt, 25.05.2017; на странице: «The Cynic Project / cynicmusic.com / pixelsphere.org»; исходник https://opengameart.org/sites/default/files/013_Another_August_0.mp3, SHA-256 `6de6e4f770cda4d34db433e4df982deccb6877a8fcc5e32b48eeb57f770dec3b` |
| 3 | `music/piano-iix.webm` | Piano IIX — Hardmoon (Arjen Schumacher) | CC0 | https://opengameart.org/content/piano-iix | — | OpenGameArt, 27.11.2017; на странице три лицензии — CC0, GPL и OGA-BY, берём CC0; пьеса 2011 года; исходник https://opengameart.org/sites/default/files/Hardmoon_-_Piano_IIX.mp3, SHA-256 `6af9b2daec8047eb08dfdf77697b50157378fbeaae3420b1dbb5defdac8ca44f` |
| 4 | `music/little-lullaby.webm` | Little Lullaby — Alex_089 | CC BY 4.0 | https://opengameart.org/content/little-lullaby | «Little Lullaby» — Alex_089, OpenGameArt.org, CC BY 4.0 | OpenGameArt, 23.06.2022; WAV; исходник https://opengameart.org/sites/default/files/little_lullaby_wav.wav, SHA-256 `59bbc4fba06ca52cc933cdff0136895ecd5f9aa3c43898d10ed7376fb6d3948f` |
| 5 | `music/the-woods.webm` | The Woods (Remastered) — Axletree | CC BY 4.0 | https://freemusicarchive.org/music/Axletree/erthe/the-woods-remastered/ | «The Woods (Remastered)» — Axletree, Free Music Archive, CC BY 4.0 | Free Music Archive, альбом «Erthe»; «AI generated? No»; исходник https://files.freemusicarchive.org/storage-freemusicarchive-org/tracks/Du8y1nIhCZ5ryvI4xgb4Cqp8l9NhwKiLrCe0MVQw.mp3, SHA-256 `6d2d30dc323939a1fa41f9cfdef2565643c0ac04ac36a9e91809ef42b72ad8ea` |
| 6 | `music/ambient-breath.webm` | (Ambient) Breath — Kirk Osamayo | CC BY 4.0 | https://freemusicarchive.org/music/kirk-osamayo/season-one/ambient-breath/ | «(Ambient) Breath» — Kirk Osamayo, Free Music Archive, CC BY 4.0 | Free Music Archive, альбом «Season One»; «AI generated? No»; исходник https://files.freemusicarchive.org/storage-freemusicarchive-org/tracks/NLyxlCXQ1W125vDy2o5EsJ920h0vwwYZgPsxrQC2.mp3, SHA-256 `8fcc541238eb1cd93229bc9dce0f2b706a9d2a3b104ab4e083e6c4912d38b68d` |
| 7 | `music/celosia.webm` | Celosia — sawsquarenoise | CC BY 4.0 | https://freemusicarchive.org/music/sawsquarenoise/piano-works/celosia/ | «Celosia» — sawsquarenoise, Free Music Archive, CC BY 4.0 | Free Music Archive, альбом «Piano Works»; «AI generated? No»; исходник https://files.freemusicarchive.org/storage-freemusicarchive-org/tracks/lu13jxYPlgvF1a79Swy2QpHBuCLxSw2CdRvBs2AC.mp3, SHA-256 `019288d03074d6f1491cd14acd3f91db9a1cf94b0d33396e51cec975b8296dbd` |
| 8 | `music/tokyo-sunset.webm` | Tokyo Sunset — HoliznaCC0 | CC0 | https://freemusicarchive.org/music/holiznacc0/public-domain-lofi/tokyo-sunset-lofi-peaceful-soft/ | — | Free Music Archive, альбом «Public Domain Lofi»; «AI generated? No»; исходник https://files.freemusicarchive.org/storage-freemusicarchive-org/tracks/Xnd9Hr5AVzB68IlWcImKtXPlwCePD2G2m8ZFSVj4.mp3, SHA-256 `83b9208ab781af9b2da86e6885c4ec0fc1270457848609a1f96267539518fb9b` |
