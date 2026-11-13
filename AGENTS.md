This is «Больница» (working title), a hospital management and doctor simulator for PC (Steam),
built by the «Горница» studio and released under a separate brand (owner's decision,
16.10.2026). It reuses the medical model and the medical database of `Nefeste/anamnez`.
The project is at the **prototype** stage: see `STATUS.md` and `docs/specs/2026-10-prototype.md`.

## Studio charter — read first

This project belongs to the «Горница» studio. Studio-wide rules live only in the public
charter repository `Nefeste/gornitsa` (https://github.com/Nefeste/gornitsa); this repository
keeps only what is specific to the project. Before changing anything — and after a context
reset — read the charter's `AGENTS.md`, then `docs/05-rules.md` (hard rules for every game)
and `docs/04-process.md` (how work is done). Raw files:
`https://raw.githubusercontent.com/Nefeste/gornitsa/main/<path>`.

Current state of this project: `STATUS.md` (it is not repeated here).

Precedence: the owner's recorded decision → the charter → this project's documents. A project
rule may narrow a charter rule, never weaken it. If a document here restates or contradicts
the charter, replace it with a link or report the contradiction to the owner.

This is the studio's first PC game. Where the charter speaks of phones, RuStore, APK or Expo,
`docs/adr/0001-studio-adrs.md` says what applies here, what does not yet, and which charter
decisions this project departs from and on what owner's decision.

## Read `docs/` before changing anything

The project documents itself in [`docs/`](docs/README.md), in Russian. Start there:

- `docs/README.md` — index and reading order.
- `docs/01-product.md` — what the game is, its pillars, for whom, what is deliberately absent, vocabulary
  (UI and code terms must match it).
- `docs/08-game-design.md` — the game as it should ship in 1.0; **all game-design numbers live only there**.
- `docs/specs/2026-10-v1.md` — the path to 1.0: stages, what each contains, release gates.
- `docs/specs/2026-10-prototype.md` — the live specification: what the prototype must answer.
- `docs/05-process.md` — how work and builds go here (PC specifics).
- `docs/07-roadmap.md` — prototype parts and their state, owner questions.
- `docs/09-market.md` — competitors, price, Steam dates.
- `docs/adr/` — decisions that are expensive to reverse; read the relevant one *before*
  proposing the opposite.

## Sister project: Anamnez

The medical core comes from `Nefeste/anamnez` **by copying** with a source line on top of each
file (studio ADR 0002): `// из anamnez: src/engine/med/infer.ts @ <commit>`. A fix in a copied
file is a task to carry it to the other side as well. Its documents are the reference for the
medical model (`docs/10-medical-model.md`) and the medical content rules (`docs/11-content.md`);
they are not restated here.

## Hard rules

Studio-wide rules are in the charter's `docs/05-rules.md`. In addition here:

- **Medical content** follows Anamnez's rules (its `AGENTS.md`, «Medical content rules», and
  `docs/11-content.md`): named primary sources only, never data from other games (Project
  Hospital, Two Point Hospital or any other — not even "to compare"), no doses, eternal ids,
  every record `review: draft` until a human checks it.
- **The engine is pure TypeScript**: no UI, no `Date`, no `Math.random`, seeded randomness,
  `apply(state, command)` and `advance(state, seconds)` (charter ADR 0004).
- **No network.** The game works fully offline and sends nothing anywhere (charter ADR 0008,
  0014). Steam achievements and Steam Cloud go through the player's Steam client, and only
  closer to 1.0 (stage Д; owner's decision 17.10.2026, `docs/adr/0003-steam.md`). Until then the
  game never calls Steam.
- **Generators for graphics only, by studio ADR 0020**
  ([`adr/0020-generators-pc.md`](https://github.com/Nefeste/gornitsa/blob/main/adr/0020-generators-pc.md)):
  images, textures and 3D models may come from generators; every file goes into the project's
  generation log (service, version, date, prompt, what was reworked) or it does not ship; the
  owner approves generated graphics in batches before release; the Steam AI-content disclosure is
  filled in honestly. Texts, rules, medical facts, music and sounds — never from generators.
- Never press «Merge»; merging follows charter ADR 0018 (owner paths in `.github/CODEOWNERS`).

## Commands

The engine and the medical database are copied from Anamnez (`docs/02-architecture.md`); tests run in Bun
(CI: Bun 1.3.11, like Anamnez). The game around them is Electron + Three.js + React (ADR 0002), built with esbuild.
Run `content`, `typecheck`, `test` and the browser scenario before every push — `pr.yml` runs the first three and
the page build on every PR.

```bash
npm ci                             # dependencies, Electron included (ELECTRON_SKIP_BINARY_DOWNLOAD=1 for checks only)
npm run content                    # build and validate content/ → src/content/generated/bundle.json (not in git)
npm run typecheck                  # content + tsc --noEmit (src incl. .tsx, tools)
npm test                           # content + bun test tools/test (~5 min)
npm run build                      # content + page and worker (esbuild) → dist/ (not in git)
npm run electron                   # build + the game window
npm run e2e                        # after build: the game in headless Chromium, real clicks (preset — and the Carbon icons in
                                   # the game and in build mode, no Unicode symbols or emoji left; then building six rooms
                                   # by mouse in the empty building; people and flow at 13:00 — icons, «Пациенты», the
                                   # patient's path, the queues overlay, the camera gliding after a right-button drag; then
                                   # the doctor mode: a consult, a whole case, «Take the case», «My office»; then money:
                                   # building from cash, «Until morning» to the 08:00 meeting, «почему?» of the arrived, the
                                   # left and the insurer's cut, «Кто ушёл», the «Обход» list; then ready rooms: four clicks open the empty
                                   # building (the last one's furniture grows from the floor), R, one undo; then the start screen on the live scene (the ready city behind
                                   # the glass panel, the camera on its circle, the choice reopens the page with its keys),
                                   # its three cards and the polyclinic; then specialists: hire a gastroenterologist in the
                                   # polyclinic, «по записи к …»; then the owner's play of 18.10:
                                   # «Открыть карту» of anyone, «Следить», «Позвать» — the card when they come in; then
                                   # saves: save, «Продолжить», load from the menu, delete, a broken file; then the card of the
                                   # departed: «Приняты», the decision in a discharged patient's card, the departed's person card;
                                   # then staff shifts: at 20:00 the day shift walks out and the night shift in, the night
                                   # rows of a room card, hiring a night registrar, «Сейчас в смене»; then fatigue: a tired
                                   # doctor walks to the staff room, his card and fatigue bar, «Персонал», «врач на перерыве»
                                   # in a waiting patient's path; then the encyclopedia: the start screen button, search, «встречалось»,
                                   # links, «Назад», F1 over a name, «Подробнее» in «Что это?»; then door benches: someone
                                   # sits on a bench by an office door, «на скамье у кабинета» in a path, the «Скамья» tool,
                                   # its ghost, Ctrl+Z, demolishing a bench; then the city's free land: a ready ward in the
                                   # east wing works; then staff mood: «собирается уйти» at the meeting, the person card,
                                   # «Поднять зарплату», «В другую смену», severance in «Уволить»; then growth: «вырос до
                                   # навыка 4» and back from study at the meeting with no scene rebuild, «Поднять зарплату»
                                   # in its row, «Отправить учиться» in the card, the reserve: «Замена из резерва» at the
                                   # meeting, «Нанять в резерв», «замещает: …», the reserve card's «Уволить»; then orderlies:
                                   # a patient on the gurney in front of the orderly, their cards, «Следить», the path,
                                   # «Персонал», paramedics; then the
                                   # chief approves: rule checkboxes and «Подтверждать диагноз», a decision in the list and on the map, its card with the
                                   # «Ещё обследование» form, the path, Enter — «Согласен»; then roles: «Кто вы» on the start
                                   # screen, «Управляющий» sees no medicine for three hours, «Врач» and «Главврач» in the doctor
                                   # window, hints by role, the chief's line and the doctors' errors at the meeting, «Итог» in
                                   # an error's card; then the own card in steps (owner's decision #104): the timeline and the
                                   # steps, a question, an exam and a test go into the timeline, the result opens «Решение»;
                                   # then the people: 59 Rocketbox looks with atlas and mask, the look by role, profession
                                   # and paramedic, the suit colour by role — read from the picture, people sit down, stand
                                   # up and lie, the mask in two channels on the GPU, people of one look with different hair
                                   # and skin, the hair tint seen in the frame, the elderly and «yellow» walk with the slow
                                   # walk clip, staff at desks in the desk work loop, the seated look around and standing staff
                                   # take papers, a ward nurse at a bed of her room on her round; then
                                   # scenario 1: «Кампания» on the start screen, the mentor's letters at the start and to the
                                   # hint states while building, the scenario's build catalog, your own office, the first three
                                   # patients set by the scenario, «Цели» and «Без обучения», «Письма» at the meeting, the
                                   # build order in the catalog and in «Цели» (on and off), no role row in the scenario, the
                                   # mentor's tips in the first patient's card one at a time; then the
                                   # «Показатели» layer: columns over the rooms from «Слои», taller where people are, numbers,
                                   # hover and click on a column, «Ожидание» with M, remembered after a reload; «Выручка» and
                                   # «Прибыль» with service rooms in grey, «До утра» — a past day on the slider, the room
                                   # card's chart by day; then referral to a specialist: «Направить к …» in your own card's
                                   # «Решение» — the specialists on duty, the card closes, «направлен к гастроэнтерологу» in
                                   # «Пациенты», the patient card and the path; then difficulty: «Сложность» on the start
                                   # screen's second step — «Обычно» and soft mode off by default, the level's numbers, «Спокойно»
                                   # and soft mode open the game with `manage=calm&soft=1`, the engine, the start cash, the
                                   # overdraft limit and the room card's wages on that level, «Трудно» in «Настройки» from that
                                   # minute, the level in the save row; then departments on the map:
                                   # stripes at department doors, the «Отделение» tool and its ghost, a ward to surgery
                                   # with no scene rebuild, Ctrl+Z, the «Отделения» layer and legend, L in a cycle, the
                                   # room card's department and its select, the «Пациенты» filter by department; then
                                   # the build catalog: groups by department in order, thumbnails of ready rooms, the
                                   # chosen sample's thumbnail, the same groups for «Помещение»; then the «Проблемы» layer:
                                   # the list bottom-right, a day lab tech dismissed — «в этой смене никого», the night one
                                   # too — the red floor, chip and row «не работает: нет лаборанта», the number in the menu,
                                   # a click on the row flies to the lab and opens its card, L in a cycle; then the «Пути
                                   # пациентов» layer: the corridor floor painted, the list by metres a day, every pair of
                                   # rooms has a path, a row — only its path on the floor and the camera at its middle, again —
                                   # all, an hour of play — more moves, off — no paint, L in a cycle; then the demo path
                                   # (`?demo=1`, docs/specs/2026-11-demo.md): only «Кампания» on the start screen, the load bar
                                   # growing by real work, the mentor's letters, three ready rooms by the build order, the first
                                   # patient two game minutes after your office works, your own case, «До утра» to the meeting,
                                   # «почему?» of the left with no hired doctors, «Итог» with the hospital's snapshot, «Сохранить
                                   # снимок», «Играть дальше»; the feel numbers О1–О6 → tools/app/out/e2e-demo.json); then the
                                   # morning round: a clinical nurse hired on a ward's day nurse post (the choice in its card;
                                   # none at night), «До утра», at 08:30 of
                                   # day 2 she and then a doctor at the bedside by the engine's times, «на обходе» in the card,
                                   # «Персонал» and the waiting patient's path; then room names at a middle zoom: one canvas, no
                                   # DOM, no name over another or over a status chip, none close in, some on the overview,
                                   # none in build mode, «Подписи помещений» off at once and after a reload, bigger with large text;
                                   # then the handover sheet (scenario 2, part 2а): «Пусть сортирует медсестра» unticked, an
                                   # arrival — autopause, «Привезла скорая», the sheet with its head, measurements and NEWS2, the
                                   # clock held against buttons and keys, «Красный», «До утра» — «Сортировка» and «Ночь» at the
                                   # meeting, ticked again — the nurse sorts the waiting; then scenario 2: its card second in
                                   # «Кампания», the ambulatory and its cash, the letters, no checkbox before the emergency room,
                                   # the first tutorial arrival — autopause, the «sheet» letter, the mentor's tip in the sheet,
                                   # «Красный» — under «Ждут вас», «До утра» sorting each — the «night» letter, the meeting, «Цели»
                                   # with the fourth step «Кабинет хирурга» and its goals; then routing: the outpatient surgeon hired
                                   # on the doctor post, a walk-in routed to surgery, «регистратор направил: хирургия» in the path, the
                                   # routing line at the meeting with an example of a wrong route; then sound: the files after the first
                                   # press, «Звук» in «Настройки», a button's click, build, demolish, refuse, hire, silence at 0, the
                                   # meeting; then the doctor's shift: «Для врача» on the start screen, its second step, a shift
                                   # with no building, cash or roles, your case, «До конца смены» — «Итог смены» at 20:00, the record,
                                   # «Новая смена», the best result on the start screen, the city on «Трудно»; then scenario 3: its
                                   # card third in «Кампания», scenario 2's hospital with free land and 700 000 ₽, the letters, three
                                   # build steps, an operating room with a day team and a third ward, the first tutorial patient —
                                   # yours, «Аппендицит и время» in the card, «В операционную», the «night» letter in the evening
                                   # with no night team, the meeting's «Операции» line; then the case of the day: «Случай дня» and 30
                                   # days, the city with no flow, building, cash, fast-forward or «Сохранить», the day's patient at
                                   # 08:00, your case — «Итог дня», «Разбор», «Сыграть снова» — the same patient, the day's grade in
                                   # the list; then the challenges: «Испытания» and the six, «Сто пациентов» as «Главврач» — the
                                   # record's flow and cash, no «Сложность», «До утра» to 20:00 — «Итог испытания» and the record,
                                   # «Ещё раз», the best result in the list, «Одна ночь» at 20:00 alone, «Без показаний: 0 из 2»,
                                   # «Рентген сломался» — the X-ray broken at 09:00, «Рентгеновских снимков за смену» at 20:00;
                                   # then technicians: «Техник» in the staff room card, hired by day, the X-ray breaks at 10:41 of
                                   # day 2 (seed 447), the room card's «Аппараты» and «не работает», «Проблемы», «Персонал», the
                                   # technician standing at the machine, fixed by his hour, «Поломки» at the next meeting;
                                   # then routes for the urgent: «Маршруты для срочного» in the emergency room card, both ticked,
                                   # at ×12 the nurse's request — an ECG by the route shows ST elevation, first in «Ждут вас»
                                   # with the lysis deadline, the urgent line; the meeting's «Сроки» and «по маршрутам»; then
                                   # scenario 4: its card fourth in «Кампания», scenario 3's hospital and 2 500 000 ₽, the
                                   # letters, the CT and the ICU by the ambulance entrance, the first tutorial patient lying with
                                   # routes off — the «маршруты» hint and letter, both routes ticked — the nurse's ECG shows ST
                                   # elevation: the urgent line, the autopause, the «alert» letter, first in «Ждут вас»;
                                   # «Позвать» — the ECG already in the card and «Инфаркт и минуты», the meeting's «Сроки»;
                                   # then the sandbox: met diseases from scenario 2 at ×12 into page storage, «Только
                                   # встреченные» off without them and on with them, lot L on the start screen's second step,
                                   # a wing by «Корпус» (its ghost, the cash, Ctrl+Z), a yard demolished, the ambulance entrance
                                   # moved, none in a scenario;
                                   # screenshots in tools/app/out/; `-- --only 1|2|…|46` for one part, `-- --only 7,10,11` —
                                   # several in a row on one page, as in the full run
node tools/app/soak.mjs --days 3   # after build: a long run in headless Chromium — the ready city at ×12 for three game days,
                                   # the meeting closed each morning; window memory after GC, DOM nodes, people, sim lag and
                                   # frames every game hour, the engine snapshot every six → tools/app/out/soak.json; fails on a
                                   # console error, a crash, a stopped clock, window memory growing over 8 MB a day from the
                                   # second day or more patient names kept than patients on the scene (`--start poly` — the
                                   # polyclinic; docs/05-process.md, «Долгий прогон»)
npm run bench:headless -- --qualities low --secs 5   # after build: auto-bench in headless Chromium → tools/app/out/
                                                     # (`-- --flow 40,4` — a bigger crowd, about 180 people,
                                                     # `-- --metric load` — with the «Показатели» layer,
                                                     # `-- --keys models=code` — the code and CC0 models, as before Blender
                                                     # part 2; `-- --keys baked=0` — without the baked light)
npm run dist:linux                 # build + AppImage and tar.gz → release/ (not in git) — local checks only, not released
npm run dist:win                   # build + Windows x64 zips → release/ (from Linux, no wine): full and app.asar update
npm run assets -- <sources dir>    # rebuild assets/models/*.glb from the CC0 packs (byte-identical; see assets/LICENSES.md)
npm run sound                      # the sounds from formulas (docs/specs/2026-11-sound.md): assets/audio/*.wav and its registry
                                   # assets/audio/LICENSES.md (tools/sound/gen.ts, a copy of Skazy's; byte-identical)
npm run music                      # the music (docs/specs/2026-11-sound.md, part 3): the pieces of assets/audio/music.yaml — the
                                   # owner's choice, #214 — downloaded and checked by SHA-256 (cache tools/sound/.cache, not in
                                   # git), trimmed, levelled, stereo Opus → assets/audio/music/*.webm, src/app/music.gen.ts and the
                                   # registry (tools/sound/music.ts, a copy of Uzory's; needs ffmpeg with libopus; byte-identical
                                   # with the same ffmpeg; `-- --only <id>` — one piece)
node tools/app/people.mjs --fetch <dir>   # Rocketbox people (MIT): download the pinned sources, check SHA-256
node tools/app/people.mjs <dir>    # then rebuild assets/models/rocketbox/ (glb + mask, byte-identical; docs/specs/2026-10-people.md)
bun tools/app/people-licenses.ts   # then the Rocketbox tables of assets/LICENSES.md from sources.json and cast.ts
node tools/app/icons.mjs --fetch <dir>    # the window's icons (owner's decision #139): @carbon/icons from npm, check SHA-256
node tools/app/icons.mjs <dir>     # then src/ui/icons.gen.ts and assets/licenses/carbon-icons.txt (byte-identical)
bun tools/app/blender-sizes.ts     # the Blender pilot (#175): blender/sizes.json — the sizes the scripts take from the game
bun tools/app/blender-catalog.ts   # Blender part 2 (docs/specs/2026-11-blender-2.md): every catalog thing in the city, the
                                   # polyclinic and scenario 1 — what draws it now, how many, triangles now and by the budgets
                                   # of blender/budgets.json after each group
python blender/build.py [names]    # then the models in Blender 4.5.15 (`pip install bpy==4.5.15`, or `blender --background
                                   # --python blender/build.py -- …`) → blender/.out/ (not in git); a part 2 model over its budget
                                   # is not written; no names — all
node tools/app/blender-pack.mjs    # then compress them like the CC0 models into assets/models/blender/; byte-identical;
                                   # passports in assets/LICENSES.md, section 8 (blender/README.md)
node tools/app/blender-sheet.mjs   # after build: the before/after sheet of a group's rooms (11:00, no new patients; group 1 in
                                   # the polyclinic, groups 2–4 in the city) — code and CC0 models vs Blender → tools/app/out/sheet/
                                   # (`--group 1|2|3|4`); `--light` — each light sample built as a ready room in the empty building
                                   # (on «Спокойно»: the cash covers a reanimation L), `baked=0` vs the light, and a check that
                                   # the light lay on every one; group 3's light — its rooms in the city (an MRI L costs more)
npm run bench -- --mode flow --quick           # engine: time per game minute at 50/100/200/300 patients (PC flow)
npm run bench -- --mode desks --quick          # the same with Anamnez's appointment slots
npm run bench -- --mode flow --day             # the whole day to 10:00 of day 2: day and night minutes, 08:00 meeting, 09:00 round
npm run bench -- --mode flow --quick --flat    # flat arrivals by hour: the same patients as before the 24-hour day, to compare
bun tools/bench/consults.ts                    # «Просят посмотреть»: share of hired doctors' cases that ask you (--probe: why these thresholds)
bun tools/bench/referrals.ts                   # referral to a specialist (#62, #112): the same patients from one moment — the
                                               # therapist decides or the specialist leads with the prior ×N (`--x 1,2,3,5,10`); the
                                               # whole day with the engine's rule (`--every`, `--lead`)
bun tools/bench/approvals.ts                   # «Главврач утверждает»: decisions per hour awaiting approval and how many are wrong
                                               # (`--rules below90,discharge`, `--answer silent`; next to it — the same day by default)
bun tools/bench/departments.ts                 # departments (spec): how often a registrar routing walk-ins by complaint would pick
                                               # the wrong department (`--first` — by the main complaint, `--vitals`, `--list`;
                                               # `--engine` — the engine's own routing with the outpatient surgeon, `--skills 1,5`)
bun tools/bench/emergency.ts                   # scenario 2 (spec): a district hospital around the clock — who came and left by day and
                                               # by night, how long the ambulance's patients waited for a doctor, beds and stays
                                               # (`--places 2` — two emergency bays, `--wards M` — four-bed wards, `--days`, `--seeds`)
bun tools/bench/surgery.ts                     # scenario 3 (spec): ready hospitals with an operating room, nobody playing — surgery and
                                               # trauma arrivals by day, operations decided and done, on time and late, complicated at
                                               # the incision, complications, the wait for the table (`--hospital district,city`, `--days`)
bun tools/bench/vascular.ts                    # scenario 4 (spec): ready hospitals with a CT and an ICU, nobody playing — chest pain
                                               # and stroke arrivals by day and the deadlines (ECG in 10 minutes, the stroke exam and CT,
                                               # lysis and transfer for ST elevation) over every closed case, not only yours; ICU, consults
                                               # (`--hospital vascular,city`, `--days`; `--routes` — both routes for the urgent on from
                                               # the first minute, how many went by each and their consumables)
bun tools/bench/challenges.ts                  # challenges (spec docs/specs/2026-11-challenges.md): the six of the game design on ready
                                               # hospitals, nobody playing or the virtual doctor on your cases — a flu wave (`--x`, `--flu`),
                                               # a hundred walk-ins (`--per`), one night alone (`--amb`), debt (`--debt`), exams by
                                               # indication (rational, careful, one by one, lazy), the X-ray broken all day (`--only …`);
                                               # `--only engine` — the records of content/challenges/ through the engine and their result
                                               # (`--plan` — the reasonable chief: two offices and a staff room at 08:00; `--play
                                               # rational,careful,urgent`; `--why` — the night's reds and who the doctor was with)
bun tools/bench/repairs.ts                     # technicians (spec docs/specs/2026-11-technicians.md): the devices that break in each
                                               # ready hospital, how often by the catalog's reliability, exams per day on each; then the
                                               # engine's breakdowns in work for `--days` (14) without a technician and with one on the
                                               # day shift — who repaired them, hours of the working day the devices stood, the repair
                                               # and the technician's wages (`--tech 0,1`, `--hospital poly,district,city`, `--seeds`)
bun tools/bench/comfort.ts                     # comfort and cleanliness (spec docs/specs/2026-11-comfort.md): ready hospitals, nobody
                                               # playing — visits per room per day by the engine's paths (the doctor, exams, the hall
                                               # sat in, the reception, lying in a bed), staff rests and toilet visits, minutes the
                                               # orderlies spend on gurneys (`--hospital poly,city,surgery`, `--days`, `--seeds`)
bun tools/bench/infections.ts                  # scenario 5 (spec docs/specs/2026-11-scenario-5.md): scenario 4's hospital (`start`) or
                                               # the ready city in winter, nobody playing — a wave as the share of walk-ins with one
                                               # disease (`--wave 0,20,40`, `--cond cond.pneumonia_cap`); who came, where they ended, who
                                               # was sent away because the beds were full and with what, the wave's and the infectious
                                               # department's patients needing a bed, pneumonia discharges on time; `--add` — ready
                                               # wards and boxes on the free land at 08:00 (`ward:M:48:16:0+box:S:68:16:0`)
bun tools/bench/levels.ts                      # the sandbox (spec docs/specs/2026-11-sandbox.md): every ready hospital in winter, nobody
                                               # playing — departments, beds, what works at 14:00 and 02:00, correct diagnoses, the
                                               # left, refusals «мест нет», reputation by morning, and the hospital level by the
                                               # proposed requirements (`LEVELS`; `--hospital poly,…,city`, `--days`, `--seeds`)
bun tools/bench/diagnostics.ts                 # scenario 6 (spec docs/specs/2026-11-scenario-6.md): the ready city and the vascular district
                                               # in winter, nobody playing — ultrasound, endoscopy, CT and MRI: exams, income and costs a day
                                               # by room money, payback by the ready room's price; the insurer's cuts by kind and the
                                               # unconfirmed diagnoses by where they are confirmed (`--hospital city,vpreset`, `--days`, `--seeds`;
                                               # `--confirms` — with the chief's rule «Подтверждать диагноз» from the first minute)
bun tools/bench/crisis.ts                      # scenario 7 (spec docs/specs/2026-11-scenario-7.md): a ready hospital in crisis — a bank loan
                                               # (`--loan`), cash below zero (`--cash`), reputation (`--rep`), everyone's mood below the
                                               # quitting line (`--mood`), devices long unserviced (`--wear`); `--play none,quit,all,tech`:
                                               # nobody, a chief who answers «собирается уйти» (+ «Подтверждать диагноз»), raises everyone
                                               # below the line, hires a technician; cash, loan, reputation, who left, by day (`--days 30`)
bun tools/bench/solo.ts                        # the doctor's shift (spec docs/specs/2026-11-doctor-shift.md): a day shift 08:00–20:00 in
                                               # the ready city and polyclinic with one doctor receiving — who came, how many he saw,
                                               # who left, minutes per case, the wait (`--hospital city,poly`, `--manage calm,normal,hard`;
                                               # `--play rational,patient,lazy,shotgun,one` — the virtual doctor plays your cases on the
                                               # shift, `meta.solo`, and the shift result by strategy)
bun tools/bench/rounds.ts                      # the morning round (staff motion spec, part 2): each hired doctor's lying patients at
                                               # 08:30, how many need a decision, then the engine's rounds of the morning — when, beds,
                                               # game minutes (`--days 7`, `--seed`, `--hospital poly`, `--clinical` — a clinical nurse
                                               # on the day nurse post of every room with beds)
bun tools/sim/economy.ts --seeds 1,2,3         # economy simulator: scripted hospitals for 7 days, cash, flow, reputation and the criteria
                                               # (`--days 14` — and who quits on their own: at most two in two weeks; `--only
                                               # ambulatory` — scenario 1 with its cash and build order for 10 days, the goal
                                               # «Пять суток с кассой в плюсе» by day 10; `--manage calm,normal,hard` — every
                                               # hospital on every management level and the level criteria); under each day — the
                                               # arrived by kind, the meeting's forecast for it and the left by reason
                                               # (`docs/specs/2026-10-why.md`); the morning rounds — how many, beds, minutes
                                               # (`--clinical` — a clinical nurse on the day nurse post of every room with beds,
                                               # `--clinical ward` — of the wards only); `--only emergency` — scenario 2 with its
                                               # cash: the wing at 08:00, night therapists, sorting by the scale, the main goals
                                               # by day 8
bun tools/sim/halls.ts --flow 14               # the polyclinic under load: waiting halls by the offices vs at the entrance
                                               # (both: `--hall 0` — seats of the whole hospital, `--bench 0` — no door benches)
bun tools/bench/state.ts --days 14             # the engine snapshot at the end of each game day without the window: its size and the
                                               # biggest fields (`--hospital poly`; docs/reports/2026-10-soak.md)
bun --cpu-prof --cpu-prof-dir=tools/bench/out/prof tools/bench/bench.ts --mode flow --only 200 --quick --until 11
bun tools/bench/profile.ts tools/bench/out/prof/<file>.cpuprofile 30 --under catchUp
bun tools/test/make-review-fixture.ts          # only with the ORIGINAL engine: fingerprints of the eager review
bun tools/test/make-save-fixture.ts 0.7.0      # a save sample for tools/test/fixtures/saves/ — once per save schema number
```

The browser scenario and the headless bench need Chromium: `PLAYWRIGHT_BROWSERS_PATH` (default `/opt/pw-browsers`) or
`CHROMIUM_PATH`. Electron in a container without a GPU: `xvfb-run -a node_modules/electron/dist/electron . --no-sandbox
--swiftshader` (add `--bench --secs 5 --qualities low` for the auto-bench; results land in the working directory).
Software WebGL numbers say nothing about a player's GPU — the owner's PC is the reference. Without a GPU the page draws about
four frames a second, and `page.mouse` sends each move only after the page has taken the previous one — once a frame; the
window reads a drag's speed from the events' own `timeStamp`, so a drag whose speed matters goes through CDP
`Input.dispatchMouseEvent` with `timestamp` (`flick` in part 3 of `tools/app/e2e.mjs`).

If the environment sets `BUN_OPTIONS=--smol`, unset it for the bench (`env -u BUN_OPTIONS …`). Any change to
`src/engine/` re-runs the bench and compares with `docs/reports/2026-10-engine-speed.md`; a change to inference must
keep `tools/test/infer-speed.test.ts` and the golden fingerprints green (same numbers to the bit).

`bun test tools/test` runs every file in one process, in directory-listing order, and keeps each file's module to the end
of the run. So a test takes the database from `src/content` (the bundle, deep-equal to `buildDb()`) and builds its own only
inside a test that checks the build (three files copied from Anamnez keep theirs, as there); an engine cache that grows
with patients or steps (like the inference memos) has one bound for the whole process, not one per database
(`UNKNOWNS_KEEP` in `src/engine/med/infer.ts`). If `npm test` stops with a core at 100 % and RSS frozen, compare
`wc -l < /proc/<pid>/maps` with `/proc/sys/vm/max_map_count`: at that limit Bun's allocator retries `madvise` forever
(`docs/reports/2026-10-test-hang.md`).

Never write Three.js, Electron, React or esbuild code from memory: read the docs of the pinned versions
(`package.json`) first — their APIs change between releases (e.g. `GTAOPass` in three r186).

## Project map

- `src/engine/` — the engine copied from Anamnez (pure TypeScript; see «Hard rules»); `shift/slice.ts` is ours: who is
  where and what they are doing, for rendering. Building by mouse is ours too: `hospital/site.ts` (the lot, rooms as
  rectangles, items, doors, checks, the plan for the engine; a ready room — a catalog sample whole in one command,
  `docs/specs/2026-10-ready-rooms.md`), `hospital/site-preset.ts` (the preset as a lot), `hospital/site-plan.ts` (a
  hospital of ready rooms from a `content/hospital/sites/` record — the polyclinic,
  `docs/specs/2026-10-real-hospital.md`) and `shift/site.ts` (the `site` command: deferred removal, undo, hiring) —
  `docs/specs/2026-10-build.md`. Undo reopens the room a rebuilding step changed; a step that rebuilds nothing (hire,
  dismissal, pay, shift, reserve, «Мой кабинет», a corridor bench, a department mark — `keep` in the undo step, `KEEPS`)
  leaves the rebuild as it is. Sandbox lots and the building (`docs/specs/2026-11-sandbox.md`, part 2): `LOTS` (S, M — the old
  empty building byte for byte, L), the `shell` site command (a building rectangle joined to the standing one — `shellRect` takes
  the wall in; `remove` — an empty part, half back only for the cells bought, `Site.shell`) and `entrance` (main or ambulance on two
  outer wall cells); sandbox only — a scenario or a challenge refuses them (`scenario`); the window: the lot on the empty start's
  second step (`lot` key), «Корпус» and «Вход» in `build.ts`, and `onlyDeptsChanged` compares the building and the entrances, so
  the scene is rebuilt. «Только встреченные в кампании» (part 2б): `meta.only` (`newFlowShift(…, { only })`, known conditions,
  sorted) — a walk-in, a booked patient (the profile's met ones) and an ambulance arrival get a met main disease (`metPatient`:
  the generator's `only`, another person by `:met<k>` keys up to `MET_TRIES`, else nobody comes — the next in their hour); no
  list — byte for byte as before. The met list is the main diseases of closed cases of a PC campaign scenario, yours and hired
  doctors': the sim sends new ones with the slice (`met`, `src/sim/met.ts`), the window keeps them in page storage
  (`bolnitsa.met`, `src/app/met.ts`); the empty start's second step offers «Только встреченные» when there are any (`met=1`,
  `Game.met`, the `start` message's `only`), and the encyclopedia marks them «встречалось» (read at each open). The whole 24-hour day of the PC flow is ours as well: `shift/day.ts` (outpatient hours,
  arrivals by hour of day), the 08:00 meeting and the morning round in `engine.ts`, shapes in `content/hospital/day.yaml`
  — `docs/specs/2026-10-day.md`. Who left the state (`evict`) keeps their card in `s.past` for a day, at most 600, like
  their path — read-only, for «Открыть карту» and «Приняты» (`docs/specs/2026-10-discharged-card.md`).
  `shift/journey.ts` is ours: the patient's path with the reason of every wait (PC flow only; one-line hooks in
  `engine.ts`) — `docs/specs/2026-10-flow-ui.md`. Door benches (`docs/specs/2026-10-door-benches.md`): a corridor bench
  within `inflow.bench` steps of an office door (`doorBenches` in `shift/walking.ts`) seats one; who waits at the door
  without a seat in their hall sits on a free one (`bench`, patience as is) or stands (half the patience); the player
  places and removes them (`checkBench`, the `bench` and `undecor` site commands); the ready city's door benches are a
  PC-only list (`benches` in the preset), so Anamnez's modes keep their hospital byte for byte; so is the city's free
  land — a wider lot and an empty east wing (`land` in the preset, `docs/specs/2026-10-city-land.md`).
  Money of the PC flow is ours: `shift/money.ts` (cash now, wages and upkeep by the hour, building from cash, the
  overdraft limit, the loan), `shift/inflow.ts` (the flow from the hospital), `shift/meeting.ts` (the day's bottlenecks,
  «стало хуже»), numbers in `content/hospital/inflow.yaml` and `money.yaml` — `docs/specs/2026-10-economy.md`.
  «Почему?» at the meeting (`docs/specs/2026-10-why.md`): `DaySummary.arrivedBy` (the arrived by kind), `leftBy` (the left
  by reason, named when patience ran out — `leaving` in `engine.ts`: his doctor on a break, waited for you, or whether a
  hired doctor who would take him is on the shift now; also on the path's end, `End.why`) and `inflow` (the new day's flow
  by the hour with those on shift then — `inflowDay`); the window's «почему?» blocks are in `src/ui/Meeting.tsx`. Refusals of
  admission (`docs/specs/2026-11-scenario-5.md`, «Отказы в госпитализации: как сделано»): `refusal` in `engine.ts` at closing — PC
  flow, sent to another hospital while the database's place (`recommendedSetting`) needs a bed and no fitting one (`choiceFor`'s
  kinds, `NEEDS`) was free: «мест нет» if the hospital has such beds, «своих нет» if not; `DaySummary.refused` by kind and by main
  disease, the meeting's `#meet-refused` with its «почему?» (`refusedOf` in `src/app/money.ts`); the probes count them the same way
  by the patients' paths (`tools/bench/refused.ts`, checked against the engine by `refusals.test.ts`). The insurer's audit by kind
  and the weekly act (`docs/specs/2026-11-scenario-6.md`, part 1а): `shift/audit.ts` — `cutParts` splits a closed case's cut the
  way `caseIncome` counted it (defensibility, unconfirmed diagnosis, exams without indication; the level's pay rounding goes to the
  biggest part, so the parts sum to `ledger.audit.cut`), `recordAudit` writes `DaySummary.audit` (PC flow), `weekAudit` gives the
  morning notice of day 7, 14… its `act`; the chief's rule «Подтверждать диагноз» — the `confirms` command, `meta.confirms`,
  `confirmExam` in `engine.ts`: a hired doctor who chose a diagnosis orders the base's confirming exam first if the hospital does it
  (`ShiftPatient.confirming`, once; `DaySummary.confirms`), then decides again; without it — byte for byte. The window:
  `auditViewOf`/`actViewOf` in `src/app/money.ts`, `AuditRows`/`Act` in `src/ui/Meeting.tsx`, `Confirms` in `src/ui/doctor/Dock.tsx`. The
  management axis (`docs/specs/2026-10-difficulty.md`; owner's decisions #135–#137, #151): `meta.manage` — «Спокойно» or
  «Трудно», none — «Обычно», the base numbers byte for byte; `shift/manage.ts` (`manageOf`, `scaled`) scales the flow
  (`flowRate`, and so the meeting's forecast `inflowDay`), an arrival's patience, wages when paid (`wageOf`/`wagesOf` take
  the level's percent; `StaffMember.salary` stays the «Обычно» pay, so the market and the mood do not change with the
  level), what a closed case pays — a visit (`closePatient`, and its rooms through `caseIncomeRooms`) and a ward stay
  (`closeStay`), `pay` (#151) — the breakdown chance, the overdraft limit and the start cash (`startCash`); the `manage`
  command takes effect from that minute; the numbers — `content/hospital/difficulty.yaml` (only «Спокойно» and «Трудно»;
  the content build checks their direction). The window (part 2): «Сложность» on the start screen's second step (a scenario has its own
  second step) and in «Настройки» (`Difficulty` in `src/ui/App.tsx`), the URL keys `?manage=calm|hard` and `?soft=1`
  (`main.tsx`), `Game.manage`/`soft` — the window's copy of `meta.manage`/`meta.soft`, set at start or from the save and
  changed only by the `manage` and `soft` commands it sends; every salary the window shows goes through `Game.paid` (the
  level's percent, `wageOf`'s rounding); the save header carries `manage` and `soft` from the snapshot (`worker.ts`) for
  the save row.
- Staff shifts (`docs/specs/2026-10-staff-shifts.md`): a hired person works the day (08:00–20:00) or the night shift
  (`shift` in `hospital/staff.ts`; none — round the clock, saves before 0.9.0); who is on duty — `dutyOf`, and
  `hospitalCtx(db, s, at)` builds the hospital from them; the `duty` event at 08:00 and 20:00 in `engine.ts` hands queued
  patients to those on duty, and a doctor off duty finishes their own cases (`lateOf`); wages per shift, night ×1.25
  (`wageOf`); a ready hospital with beds or an emergency room starts with a night shift (`withNightShift`). Part 2 —
  `shift/crew.ts`: hired doctors on a shift tire by the hour and by the case, work slower from 70 and diagnose with less
  certainty from 90, walk to the nearest staff room for a break when nobody waits (at the limit — even if someone does)
  and to the toilet every 4–5 hours; `s.crew` keeps it, integer fatigue, the same at any clock step; numbers —
  `economy.yaml`, `staff.fatigue`. Staff without a shift never tire. Part 2b — those who do exams (the first role of an
  exam room) tire per exam too and rest after their bookings (`planned` rest, the `crew` event in `engine.ts`): the
  machine queue waits for them, a blood draw waits for the nurse, a lab result for the lab tech. Part 3a — `shift/mood.ts`
  (`docs/specs/2026-10-staff-mood.md`): mood 0–100 of hired staff with a shift, once a day at the 08:00 meeting from the
  past day (pay against the market of their skill, the fatigue limit, rest in place without a staff room, no toilet, nights
  in a row); three mornings below 30 — «собирается уйти», two days to answer, then they leave after their shift
  (`depart` — also out of the build undo snapshots); the `raise` and `reshift` site commands, severance on dismissal (its own
  ledger line); numbers — `economy.yaml`, `staff.mood`. Mood lives in `s.moods` beside the staff, never in `StaffMember`:
  the build undo restores the staff by snapshot and must not rewind moods. Staff names in the window — `src/app/people.ts`.
  Part 3b — `shift/growth.ts`: skill grows by worked shifts (`days`), faster with a mentor (skill 5, same role and shift);
  pay does not follow, so the mood cause «below market» counts skill steps; the `study` site command (away three days,
  skill +1); sickness — once per 60 shifts from a seed branch per person and day, the post stays empty, the shift unpaid.
  `StaffMember.away` keeps study and sickness: `onDuty` skips the away, the post stays theirs; the undo merge
  (`mergeStaff`) keeps skill, days and away from the engine. Ready-hospital staff start with staggered tenure (`tenure`).
  Part 5 — `shift/reserve.ts` (owner's decision #97): the `reserve` site command hires a person with no post and no shift,
  paid every day; `cover` puts the first free reserve of the same role on the post of whoever is away (their room and shift,
  `StaffMember.covers`) and sends them back when the absent returns (a busy one — once free, at a shift change); it runs
  after the meeting, every site command and each shift change. A covering member cannot change shifts.
- The morning round (`docs/specs/2026-10-staff-motion.md`, part 2; owner's decisions #166, #181, #183): `shift/rounds.ts`. At
  `rounds` of `day.yaml` (08:30) `rounds()` in `engine.ts` writes `s.rounds` — who rounds whom (`roundsDue`: a hired
  doctor on duty his own lying, `closed.by`; an absent one's — whoever covers his post, else a doctor of the same role with
  the fewest; in a room a clinical nurse watches — only those needing a decision, `needsDecision`) — and starts the
  clinical nurses' rounds at once. A doctor goes when free (`callIn` → `goRound`): the whole path with times at once
  (`roundOf`: nearest room first by `walkPc`, beds by number, `round.bed` minutes each, home), `s.desk` until he is back,
  the waiting get a `rest` step with `round` (`LeftWhy` `round`), `roundLeft` in `pickPc`; each stop ends with the
  `roundStop` event — the bed is work (`round.fatigue`), and a doctor decides there (`decideAtBed`, the old instant rule).
  No `round` in `economy.yaml` — the instant round as before. The clinical nurse (`role.clinical_nurse`; owner's decision
  #183) stands at the nurse post (`stands: role.nurse`) only in rooms with beds (`in` → her derived `rooms`) and only by
  day (`day`): `fitsPost` in `hospital/staff.ts` checks it for the `hire` command and for the room card's choice on the
  nurse post (and `reshift` refuses `dayOnly` to move her, or swap her, to the night); she is the room's nurse for
  staffing, carrying (`carriersOf`), the window's ward round and the reserve (`cover`: with no reserve clinical nurse, a
  reserve nurse covers her), and never among the daily candidates (`day` in `applicantsOf`, like the orderly's
  `optional`). The window: the
  sim sends `rounds` with the slice; `wardRoundsStep` in `population.ts` walks each by the engine's times to the bed
  (`bedSide`, Papers; the spot is picked once per stop) and home; the part 1 ward nurse does not start her own round in a
  room with an engine round.
- Orderlies and gurneys (`docs/specs/2026-10-orderlies.md`): `shift/gurney.ts` — a ride is booked at once on whoever
  reaches the patient first (an orderly of the shift; none — for an urgent patient only, the nurse of the room they lie in
  or the nearest nurse: red, ICU or reanimation, to the operation and back — owner's decision #99, `carriersOf`); its
  times (`go`, `pick`, `off`, `drop`, `done`, `home`, an exam's round trip) are known at booking; nobody to carry — the
  patient waits in `s.rideWait` until a shift change or a hire. The engine (`carry`, `startRide`, the `ride` event) holds the
  emergency bay until pickup, starts an operation when the patient is delivered and frees the table when they are taken
  off (`Operation.carried`, `off`), wheels lying patients to imaging only through a double door. Only with shift staff in
  the PC flow; the orderly role is `optional` (a room works without it) and never among Anamnez's daily candidates.
  The window (part 2): the engine sends `rides` with the slice; `src/render/rides.ts` turns a ride's times into phases,
  `Population.ridesStep` walks the carrier and lays the patient on the gurney in front of them (`Crowd.carry`, `release`),
  `gurneyStop` in `place.ts` picks where to stand by a bed, `src/render/gurney.ts` draws code-made gurneys; a paramedic in
  blue (window only, `m:` walkers) wheels each ambulance arrival in and leaves. Gurneys go one after another (`convoy` in
  `crowd.ts`: whoever wheels one keeps `FOLLOW` along their path behind a gurney going the same way; `queue` starts a
  second paramedic further out in the street). The slice's `gurney` doing — admitted and
  still waiting for pickup (`pickupOf`); the path keeps the bed ride in `Journey.bed` and an exam ride in `gurney` of its
  exam step.
- Referral to a specialist (`docs/specs/2026-10-specialists.md`, part 2; owner's decision #112): `shift/refer.ts` —
  `priorOf` (booked to the specialist — ×`PROFILE_PRIOR`, referred to them — ×`consults.refer`) and `referTo` (the leading
  hypothesis in nobody's profile, the second in the profile of a specialist on duty). In `engine.ts` a hired therapist who
  would ask you refers instead (`referOf`, `sendOn`; with «не уверен» unticked too: referring does not call you), you refer
  from your own office with the `refer` command (`referOwn`), and every hand-over to another doctor — the answer to a
  consult or an approval, a referral — goes through `handOver`, which sets `ShiftPatient.ref`. The path's `own` step with
  `refer` (and `from` when a doctor referred) is never dropped as a zero wait; the slice marks the referred with the
  `REFERRED` bit of `P.flags` (`kindOf` reads the visit kind).
- Departments (`docs/specs/2026-10-departments.md`, part 1; owner's decisions #140, #142): `content/hospital/departments.yaml`
  — the six departments of the game design's §4 table in its order (`paint` — the «Отделение» tool moves wards and offices
  into them; `takes` — disease departments it also takes: trauma goes to surgery); a room's department — `deptOf`/`deptsOf`
  in `hospital/departments.ts`: the tool's mark (`SiteRoom.dept`, the `dept` site command, free and undoable), else the first
  staff member working there whose role has a `department`, else the room type's `department`; diagnostics and common rooms
  have none. The marks themselves change no flow. Part 4 (`docs/specs/2026-10-departments.md`, «Часть 4: как сделано»; owner's
  decisions #140, #141): the outpatient surgeon `role.surgeon_clinic` (an office post, surgery, a profile of surgery and trauma,
  `walkIns`); only while an office doctor with `walkIns` is on duty, the registrar routes a walk-in (`routeArrival`,
  `deptRoute` in `engine.ts`: the door-side inference summed by `routeDept`, all complaints from registrar skill `inflow.route`,
  else the main one) into `ShiftPatient.dept`; `docFor` and `colleagueTakes` send the routed to that department's doctor;
  `redirectOf` passes a patient whose chosen diagnosis is another department's to that department (`sendOn`); day totals —
  `DaySummary.routing`; the path's queue step carries `dept`, the meeting shows `#meet-routing`. Without such a doctor the flow
  is the same byte for byte. Since 0.70.0 the registrar routes only to a department with such a doctor on duty, every other
  department adds to the general flow (`meta.department`, `routeFor`), and a wrong route marks the patient (`misrouted`); the
  meeting's example of one comes from the sim (`routeMissOf` in `src/sim/doctor.ts`, closed cases only).
  Undoing a mark keeps whatever room is being rebuilt (`keep` in the undo step): a mark never closes a room.
  The window (part 2) calls `deptsOf` itself. `src/app/departments.ts` — Okabe–Ito colours (`tools/test/departments-ui.test.ts`
  keeps all seven apart under three kinds of colour blindness), stripes, the «Отделения» layer and its legend, a patient's
  department for the «Пациенты» filter (the room they are in, else their doctor's office); `src/render/stripes.ts` — floor
  stripes at department doors, lit like the floor; the «Отделение» build tool and the room card's select send the `dept`
  site command; a marks-only change keeps the scene (`onlyDeptsChanged`, `staffOnly` in `src/sim/host.ts`).
- The chief approves (`docs/specs/2026-10-two-ways.md`, part 2): `shift/approve.ts` — the rule checkboxes (`meta.asks`, none
  — «unsure» and «long case» as before) and whether a hired doctor's decision waits for the chief. The decision waits in
  `ShiftPatient.approve` (the patient at the office door, no patience; the doctor calls the next); answers — the `approve`
  command, the deadline — the `approve` event: silence closes the case with the doctor's plan at the minute he decided
  (`closePatient(…, at)`), so silence changes nothing. «Ещё обследование» — the `order` command: `ShiftPatient.orders` the
  doctor does first at his next step (`examStep`) and his next decision comes back to the chief (`chief`). Discharge is
  asked at the morning round. Day totals — `DaySummary.chief`. In the window: `decisions` rows in the doctor state, the
  «Просят посмотреть» tab (checkboxes, list, Enter / Shift+Enter), a read card with `order` gets the order form. Part 3:
  roles — `src/app/roles.ts` («Врач», «Главврач», «Управляющий»: office, checkboxes, autopause, the folded doctor window; a
  ready hospital for a role without an office starts with a hired therapist in it, `startFor`); the role is chosen on the
  start screen (second step, `?role=`) and in the doctor window, kept in the save's window view; the engine has no role.
  A hired doctor's closed case shows `verdict` in its card (right or not, the truth, the main note — owner's decision #66);
  the meeting shows the chief's line (`DaySummary.chief`, `better`/`worse` from `ShiftPatient.chiefFrom`) and the doctors'
  errors of the day (`errorsList` in `src/sim/doctor.ts`, sent when changed).
- Saves (`docs/specs/2026-10-saves.md`): `src/engine/shift/migrate.ts` — the save schema number and the migration chain;
  `src/sim/packing.ts` — the file (header, engine snapshot, window view; JSON + gzip), written by the worker;
  `src/app/saves.ts` — slots (`auto-1…3` shifted each morning, `exit`, `manual-<n>`) over a disk: `electron/saves.cjs`
  (the user's game folder, slot names only) or the page storage (OPFS) in a browser. **A changed save format** — a field
  renamed or removed, a meaning changed — raises `SAVE_SCHEMA`, adds a migration step and a new sample in
  `tools/test/fixtures/saves/` (charter ADR 0004); a new optional field does not.
- The PC campaign (`docs/specs/2026-10-scenario-1.md`): a scenario is Anamnez's campaign over the PC flow — a record in
  `content/campaign/scenarios/` (start, cash, what is built, tutorial patients, goals, letters; a letter to a first-minutes
  hint state is `when: { hint }`), `scenarioOf`/`plotOf` in `campaign/campaign.ts`. `newFlowShift(…, { scenario })` and the
  sim's `start` message begin it; goals and letters are counted at the 08:00 meeting (`morning`); the first walk-ins are its
  tutorial patients while your office works (`tutorialNext`, `taught`; the first one comes `FIRST_TAUGHT` — two game
  minutes — after your office starts working, `restream`); the `site` command builds only its rooms (error
  `scenario`); the window's marks — a hint state reached, a hint closed, a letter read, a tip shown, «Без обучения», the
  build order on or off — are the `mark` command, kept in `s.campaign` and so in the save. The window (part 2): the sim sends `ScenarioView` with the
  slice when it changed (`src/sim/campaign.ts`: letters, goals with progress, the end, marks); `src/app/scenario.ts` turns it
  into words and sends the marks (a hint state on first show, a closed hint, a read letter); `src/ui/Scenario.tsx` — the
  letter card over the hint line, the «Цели» tab, «Сценарий пройден»; the meeting's «Письма» section; `?scenario=<id>` /
  `--scenario <id>` starts one; the build catalog shows only its rooms and the first office becomes «Врач»'s own. Part 2в
  (owner's decisions #114, #115): the build order — `guide` in the record; a step is done when a room of its type works
  (`ScenarioView.guide`); the build catalog lists the steps first with numbers and the next one's «why» (`byGuide` in
  `src/ui/Scenario.tsx`), «Цели» lists them too, «Порядок стройки» turns it off; a scenario has no role row — you are «Врач».
  Part 2б: the mentor's tips in the patient card — `tips` in the record; `src/sim/tips.ts` (a copy of Anamnez's) picks them in
  the sim and sends them with the card (`CardView.tips`: the steps, «Решение», the review), one at a time when they fit, each
  once; a tip about a disease only for a tutorial patient (otherwise it would give the diagnosis away); «Понятно» is the
  `tip` mark, and the next tip waits for the doctor's next action (`src/ui/doctor/Card.tsx`, `MentorTip`).
  Scenario 2 «Приёмное» (`docs/specs/2026-11-scenario-2.md`; owner's decisions #196, #197), part 1а in the engine: with
  `meta.sorts` (the record's `sorts: true` or `newFlowShift(…, { sorts })`) the player sorts ambulance arrivals — they wait
  for the `sort` command, hired doctors call only the sorted, your sorts count in `AmbulanceDay.mine`; the `sorts` command
  with `on: false` hands sorting to the nurse, who sorts the waiting at once by the scale. The 08:00 meeting writes
  `DaySummary.night` (`nightOf`: ambulance arrivals since 20:00, the longest wait for a doctor, those never called). Goal
  kinds `sorting` and `nights` (`campaign.ts`); the loader lets a PC scenario count `stay` too. Part 1б: the ready ambulatory
  `content/hospital/sites/ambulatory.yaml` (`site.ambulatory`, the scenario's `start`) with a free east wing; a tutorial
  patient with `ambulance: true` comes by ambulance — each stream takes the next tutorial patient of its own kind
  (`tutorialNext(db, s, stream)`), the first one `FIRST_TAUGHT` after your office and the emergency room work. Part 2а, the
  window: the sim's doctor state carries `er` (an emergency room is built — the «Пусть сортирует медсестра» checkbox, the
  `sorts` command), `sorts` and `handover` (arrivals waiting for your sort: who, reason, the paramedic's measured lines, at the
  door or in a bay; NEWS2 and the red flag on «Практикант» and «Студент»); `src/ui/doctor/Handover.tsx` is the sheet with the
  three colours (the `sort` command), and it holds the clock like your own card (`openSheet`, `still` in `src/app/doctor.ts`:
  speed keys, «До утра» and the meeting wait); calling an unsorted arrival is refused with `sortFirst`. The meeting shows
  «Сортировка привезённых: верно N из M» with one miss as an example (`sortMissOf` in the sim: a colour not by the scale is
  always yours — the nurse sorts by the scale) and the «Ночь» line from `DaySummary.night`. Part 2б: the record
  `content/campaign/scenarios/emergency.yaml` (`scenario.emergency`, `start: site.ambulatory`, `sorts: true`); scenario tips
  may use `when: ambulance` (shown in the sheet — `sheetTip` in `src/sim/tips.ts`, `HandoverRow.tip`) and `when: rounds`
  (the round block of your lying patient — `CardTips.round`); the hint states `sheet`, `bays` (`door` in the doctor state)
  and `night` (`nightUnstaffed` in `src/app/game.ts`, 16:00–20:00 with an emergency room and nobody there at night or no
  night doctor); a tutorial patient waits under «Ждут вас» (`why: 'yours'`). The economy simulator's `--only emergency`
  plays it: the wing at 08:00, night therapists in both offices, sorting by the scale, the main goals by day 8. Part 3
  (0.70.0): a guide step and a `roomWorks` goal may name a `role` — the room works and a member of that role is on its post
  (the step also has its own `name`: «Кабинет хирурга», an office with the outpatient surgeon); `roomWorks` in `campaign.ts`
  is the one check for goals and steps and counts each shift apart (staff-room places of those on that shift, like the shift
  itself); goal kind `routing` — a day with the registrar routing at least `count` and none wrongly. The simulator builds the
  surgeon's office with a second staff room and two door benches on the morning of day 2.
  Scenario 3 «Хирургия» (`docs/specs/2026-11-scenario-3.md`; owner's decision #209, variant 1), part 1: the start site
  `site.emergency` — scenario 2's hospital with free land. A site record may take a `base` (its rooms and benches first; a base
  may have its own base — the loader flattens the chain, the first base first, and refuses a circle or a narrower building), widen the building to the east (`wider` → `widerLot` in `hospital/site.ts`: the ambulance
  entrance moves to the new east wall, the main entrance stays) and name who stands at a doctor post (`as`); without them the
  empty building and every site are the same. Goal kinds `onTime` (urgent operations on time over the scenario, no streak —
  the owner's decision of 15.10.2026 on deadline goals) and `nightOps`; a PC scenario may count `operations` too, and these
  three need the operating room in its build list. `SurgeryDay.night` counts on-time urgent operations started in the night
  shift — PC flow only. Part 2 (0.75.0): the record `content/campaign/scenarios/surgery.yaml` (`scenario.surgery`, start
  `site.emergency`, the nurse sorts) and its new character `char.head_surgeon`; a scenario's `tutorialRoom` (a meaning of its
  own, not the chapter's day) — its tutorial patients come only while those rooms work (`tutorialNext`), and when they start
  working the stream of the next tutorial patient restarts (`reflow` with `flowWas`, the snapshot before the change); a guide
  step may take `count` (that many rooms of its type work — `roomWorks(…, count)`: the third ward), steps of one room differ
  by role or count, and the build catalog shows such a room once, with its first step not done (`byGuide`); the hint state
  `nightOr` (16:00–20:00, an operating room works and someone it needs has no night post — `orNight` in `src/app/game.ts`);
  the meeting's `#meet-surgery` line from `DaySummary.surgery`; the economy simulator's `--only surgery` (the operating room and
  a third ward with staff at 08:00, the main goals by day 8).
  Scenario 4 «Сердце и мозг» (`docs/specs/2026-11-scenario-4.md`; owner's decision #219, variant 1), part 1 (0.83.0): the PC
  flow's day totals count the deadlines and thrombolyses of every closed case, yours and hired doctors' (`DaySummary.allTargets`,
  `allSeq`, `allLysis`), and a PC scenario's `deadline` and `thrombolysis` goals read them (`pcOf` in `campaign.ts`; a chapter —
  yours only, as before). Routes for the urgent: `content/hospital/routes.yaml` (a route names a deadline and an exam), the
  `routes` command (`meta.routes`, PC flow): an arrival lying in an emergency bay whom no doctor has called yet gets the exam of
  each route whose deadline's complaint he came with, from the room's nurse on duty (`routeExams` in `engine.ts`: the bedside
  ECG, the CT on a gurney — `orderExam(…, route)`: without your skills, not in your totals; `ShiftPatient.routed`,
  `DaySummary.routes` — how many and the consumables); a patient out on the CT is called by nobody until he is back (`isOut` in
  `call` and `colleagueTakes`, a `free` event at his return). The start site `site.surgery` — `site.emergency` with the
  operating room and the post-op ward of the simulator's plan; free land for the CT and the ICU by the ambulance entrance.
  Part 2а (0.84.0), the window: «Маршруты для срочного» in the emergency room card (`RoomCard.routes`, the `routes` action; which
  are on comes from the sim, `DoctorState.routes`; none in the doctor's shift); the nurse's request: a lying arrival nobody has
  called whose route exam shows a finding a deadline counts from (ST elevation — lysis in 10 minutes; `routeFinding` in
  `engine.ts`) — at the result's hour (the `routed` event `routeExams` schedules) the engine sends the `alert` notice: an urgent
  line in the window, «До утра» stops (`ffStop`), an autopause for a role with an office; while nobody has called him he is first
  in «Ждут вас» (`routeAlertOf` in `src/sim/doctor.ts`, `why: 'alert'`, `PatientRow.alert`); the meeting's `#meet-deadlines` —
  `DaySummary.allTargets` and `routes` by name (`MeetingView.deadlines`, `routes`).
  Part 2б (0.85.0): the record `content/campaign/scenarios/vascular.yaml` (`scenario.vascular`, start `site.surgery`,
  `tutorialRoom: room.ct`, the three tutorial patients of Anamnez's chapter 3) and its new character `char.head_neurologist`;
  the hint states `alert` (a nurse's request, `alert` of `HintInput`) and `routes` (routes off while a lying arrival with a
  route's complaint waits — `DoctorState.routable`); a route runs before the nurse sorts the arrival, so before a free doctor
  calls him, and its gurney is called at once (`orderExam(…, route)` with no `ORDER_MINUTES`); the economy simulator's `--only
  vascular` (the CT and the ICU with staff at 08:00 by the ambulance entrance, both routes on, the main goals by day 8).
  Scenario 7 «Кризис» (`docs/specs/2026-11-scenario-7.md`; owner's decision #231, variant 1: three mornings below the limit lose the
  scenario — not built yet), part 1а (0.91.0): a PC scenario's
  `budget` may be below zero and its `crisis` (`loan`, `reputation`, `mood`, `wear`) starts the hospital in trouble (`crisisStart` in
  `engine.ts`, before the day's plan); day kinds `cashAboveZero` (the evening cash not below zero) and `noQuit` (nobody of the staff
  left on their own — `DaySummary.departed`, counted in `depart`).
- The demo for Next Fest (`docs/specs/2026-11-demo.md`, #176): the key `?demo=1` (Electron `--demo`, `main.tsx`) — only
  «Кампания» on the start screen, and after the first meeting closes the «Итог» window (`Game.afterMeeting`): what was built
  in the build order, the day's patients and how many left waiting for you, your receptions, cash, real time played, the
  hospital's snapshot — `src/app/demo.ts` (pure: `demoResult`, `snapshotName`, `wishlistUrl` — no button without
  `STEAM_APP_ID`), `src/ui/Demo.tsx`, `Game.snapshot` (the site's rooms framed 1920×1080 a frame after the click), saved by
  Electron into `userData/shots` (`shell:snapshot`, names only) or downloaded in a browser. The load bar (`#loadbar`, every
  run, not only the demo) counts real steps: the database, each furniture model, each of the 59 looks, the world, the start
  (`Game.step`). With the build open the doctor hint says «Готово» first (`leave` in `hints.ts`), and «Свои больные» shows
  only with a hired doctor on duty or systems chosen.
- The doctor's shift (`docs/specs/2026-11-doctor-shift.md`, part 1): `meta.solo` (`newFlowShift(…, { solo })`, a copy of
  Anamnez's «Только вы») — `colleaguesOf` is empty, so hired office doctors take nobody, nobody books a specialist and the
  flow from the hospital is your one office's (`capacityOf`); `siteCommand` refuses all but `done` with `shift` (a ready
  hospital: no building or hiring); the shift has no `economy`. Waiting for results in your own office is visit time in every
  PC game: `waitResults` sets `ShiftPatient.waitIn`, the next visit action adds it to `spent` (`resumeVisit`). The result —
  `src/sim/shift.ts` (a copy of Anamnez's `single.ts`: five categories, their weights and thresholds); the virtual doctor that
  plays your cases with card commands — `tools/sim/doctor-player.ts` (`tools/bench/solo.ts --play`, `tools/test/solo.test.ts`).
  Part 2, the window: «Для врача» on the start screen and its second step (`ShiftStart` in `src/ui/App.tsx`: the polyclinic or
  the city, the level with flow and patience only — `Difficulty` with `solo`), the URL keys `hospital` and `solo=1` with a new
  `seed` (`main.tsx`; `go` and `reopen` drop `solo`), `Game.solo` from the key or the save, the `start` message with `solo`
  and no `economy`; in solo the window hides the build button and keys, the cash, «Сложность» in «Настройки», the role row, the
  room card's hiring, dismissal, furnishing, demolition and «Мой кабинет», the person card's pay, study and shift, «Нанять в
  резерв»; «Ждут вас» lists every waiting patient (`src/sim/doctor.ts`). 20:00 is `shiftEndOf` (`src/sim/shift.ts`, the day
  shift's end): the window and the sim host both hold the clock there, the host sends `shiftEnd` with the slice once,
  `Game.onShiftEnd` stops the clock for good, writes the record (`src/app/records.ts`: `bolnitsa.records` in page storage, per
  hospital and level, best by score then by patients seen) and opens «Итог смены» (`src/ui/Shift.tsx`: «Новая смена» — the
  same hospital and level with a new seed, `shiftAgain`; «В меню»). Part 3, the case of the day: `src/sim/daily.ts` (a copy of
  Anamnez's pick, whole rather than in parts — `dailyCaseSeed`: the first puzzle among the day's seeds that is hard by the
  measure `src/engine/med/difficulty.ts`, a copy too, and solved by the rational doctor with every exam) and `src/sim/days.ts`
  (pure: the day, its seed from the date and the base number, its season, the last 30 days — the window imports it); the
  `start` message's `daily` day makes the host pick and start the city without a flow, `solo` and `meta.daily` — the day's
  patient is the first walk-in at 08:00, generated by the same call as the pick (`DAILY_DEPARTMENT`), with no patience
  (`p.daily`); the host sends `daily` once when that case is closed and never holds the clock at 20:00 for it. The window:
  «Случай дня» in «Для врача» with the last 30 days (`DailyStart` in `src/ui/Daily.tsx`), the key `daily=YYYY-MM-DD`,
  `Game.daily` (no saves, no fast-forward), «Итог дня» (`DailySummary`: «Разбор», «Сыграть снова» — `dailyAgain`), the first
  try in `bolnitsa.daily` (`src/app/daily.ts`); after the end the clock never starts again — `Game.setSpeed` refuses and the
  card's release goes through it.
- Challenges (`docs/specs/2026-11-challenges.md`, part 1): a record of `content/challenges/` — the start hospital, the hours
  `from`/`to` from 00:00 of day 1, the flow, `walkIns`, the flu `wave`, cash, `loan: false`, its own `overdraft`, `sorts`,
  `unindicated`, `breaks` (a device of that kind breaks in work at that hour — `breakAt`; «Рентген сломался», technicians part 3)
  and the `grade` thresholds (`xrays` — X-ray exams of the challenge, `xraysOf`); `meta.challenge`,
  `src/engine/shift/challenge.ts`. `newFlowShift(…, { challenge })`
  takes the season, flow, cash, solo and sorting from the record; `planFlow` starts day 1's streams at `from` (the night at
  20:00); `flowArrive` stops the walk-ins at `walkIns` and gives a wave share of walk-ins the wave's disease through the
  generator's `only` (the copied generator untouched); `offerOf` offers no loan and `limitOf` (money.ts) is the record's limit;
  indications are tracked without cash. Without a challenge — byte for byte as before. The result — `src/sim/challenge.ts`
  (`challengeEnd`: A–D by the doctor's shift result or the record's measure, «Пройдено» — B or better and at most `unindicated`
  exams without indications as the OMS audit cuts them; `challengeEndAt` — `to`, a second before the 08:00 meeting;
  `challengeStart` — the start hospital, the role before the night shift). The window (part 2): «Испытания» on the start
  screen and its step (`ChallengeStart` in `src/ui/Challenges.tsx`: the five with the record line, «Кто вы» for the chief
  challenges), the keys `challenge` and `role` with a new `seed` (`main.tsx`), `Game.challenge` from the key or the save,
  `hospitalAt` builds the record's hospital; the host starts «Одна ночь» at `from` (advancing to 20:00 at once), holds the clock
  at the end (`endOfIn` in `src/sim/host.ts`, `endAt` in the window; «До утра» stops there) and sends `challenge` once and
  `audit` («Без показаний: N из 2», shown in the top bar instead of the cash) when it changes; `onChallengeEnd` stops the clock
  for good, writes the record (`src/app/challenges.ts`: `bolnitsa.challenges` in page storage, best by grade then by the
  measure, «пройдено» kept) and opens «Итог испытания» (`ChallengeSummary`: «Ещё раз» — `challengeAgain`, «В меню»); no
  «Сложность» in «Настройки» during a challenge.
- Technicians and breakdowns in work (`docs/specs/2026-11-technicians.md`, part 1): `shift/repair.ts` — `repairOf` (only the
  PC flow with shift staff and `staff.repair` in `economy.yaml`; otherwise the FR-EQ-3 morning breakdowns, Anamnez's modes
  byte for byte), `wearPct`, `repairMinutes`, `devicesOf`, `nextJob`. In `engine.ts` each morning `planRepairs` adds a day of
  wear to every device (`s.wear`), rolls its day from the morning breakdown's seed branch with the wear's chance and schedules
  a `breakdown` event at a random minute 08:00–20:00 (`breakAt` puts one at any hour — tests, the «Рентген сломался»
  challenge); a free technician of the shift (`role.technician`: a staff-room post, `optional`, `ready: false` — no ready site
  has one, `siteOfPlan`, and a ready room «С персоналом» hires none) goes to the nearest broken device nobody repairs, else
  maintains the longest unserviced one (`techDispatch`, the `fixed` event; `s.fixing`, `s.techs`): a repair puts it back, pays
  `parts` % of its price (`payRepair`), and both zero the wear. The service fixes the rest by morning for `REPAIR_PCT`
  (`repairsOf`). A repairing technician is busy (`occupied`); a dismissed, departed or away one drops his work (`dropGone`).
  Exams booked on a device before it broke are done (bookings carry their times); new ones go to another such device or wait
  for the repair. `s.broken` is a new array on every change: the host sends it by identity. Part 2, the window: a job keeps
  `since` and `reach`, a breakdown its hour (`s.brokeAt`), a day `DaySummary.repairs` (broke, by the technician, left for the
  service); the sim sends `repairs` (`src/sim/repairs.ts`, `DeviceView`: broken since, the job, wear) when it changed; the room
  card's «Аппараты» (`deviceState` in `src/app/game.ts`) and its head «не работает: аппарат сломан», «Проблемы» rows (`devices` of
  `ProblemsInput`), the meeting's `#meet-repairs`, «Персонал» and the person card's job line (`fix`); the technician walks to the
  machine by the engine's times and stands by it (`techStep`, `deviceStop` in `src/render/population.ts`).
- `src/sim/` — the calculation thread: protocol, host (`createSim`), packed slice (`pack.ts`), Web Worker
  (`worker.ts`) and its client in the window (`client.ts`: a slice reaches the window whole, every field the sim sent but
  `kind`). The window never runs the engine. The doctor mode
  (`docs/specs/2026-10-doctor-mode.md`): `caseView.ts` (a copy of Anamnez's player view of a case) and `doctor.ts` build the
  patient card and the doctor's lists here and send them ready-made — the window never sees a patient's truth.
- Sound (`docs/specs/2026-11-sound.md`, part 1; owner's decision #72): `src/app/sound.ts` — the cues (`CUES`: a file
  `assets/audio/<cue>.wav` each), the cue of a site result (`siteCue`), one cue at most every `GAP_MS`, the volume in steps
  (`volumeOf`, `Settings.volume`, «Звук» in «Настройки»); `Sound` loads the files and plays them through Web Audio from the
  player's first press (`unlock`), counts `played` for the browser scenario, and is off on the start screen's live scene and
  with the `bench` and `shot` keys. A sound only answers the player's action or an event they wait for (studio ADR 0023, rule
  6): a window button (`bindInput`), a site result and an urgent notice (`onSlice`, `notice` in `game.ts`), a scenario letter
  but the morning's, the meeting or a done goal (`show` in `money.ts`). The files are made by `tools/sound/gen.ts` from formulas
  (a copy of Skazy's generator; never edit them by hand), each with its line in `assets/audio/LICENSES.md`. Part 3, the music
  (owner's decisions #208, #214): `src/app/music.ts` — `Music` plays the pieces of `TRACKS` (`music.gen.ts`, written by
  `tools/sound/music.ts` from `assets/audio/music.yaml`; never edit it by hand) in a shuffled round (`shuffleOrder`), with
  `PAUSE_S` of silence between them and at `MUSIC_GAIN` of «Музыка» (`musicOf`, `Settings.music`); it starts on the same first
  press as the sound, loads a piece whole (`fetch`, then a `blob:` URL — `media-src` of the page's policy allows it) into an
  `<audio>` element, pauses in a hidden window and is off where the sound is; `Game.music.onChange` puts the piece playing into
  `Hud.track`, and «Настройки» show it and the pieces' credits (`MusicNow` in `src/ui/App.tsx`; a CC BY piece shows its credit
  line). The music section of `assets/audio/LICENSES.md` comes from the same list (`musicLicenses` in `tools/sound/tracks.ts`).
- `src/app/` — the game in the window: loads the database and models, starts with the empty building or the preset,
  frame loop, clock, input, build tools (`build.ts`), room labels (`labels.ts`: build mode and the «Отделения» layer, DOM), room
  names at a middle zoom (`tags.ts`: one canvas over the 3D view at the screen's resolution — `fadeOf` by zoom, `placeTags`
  drops a name wider than its room on screen or over another name or a status chip, bigger rooms first; the chips rise above
  the names, `Chips.lift`; «Подписи помещений» in «Настройках», `names` in `settings.ts`), auto-bench (`bench.ts`), the live scene
  behind the start screen (`docs/specs/2026-10-aaa-polish.md`, «Экран начала на живой сцене»: `main.tsx` starts the ready
  city as a `Game` with `backdrop` — no input, saves, icons or autopause, never `__ready` — and the choice reopens the page
  with its keys; `backdrop.ts` — the camera's circle over the rooms, pure), the player's
  settings (`settings.ts`: walls, camera, quality «auto», text size — `TEXT_SCALES` 1/1.15/1.3 as `--ui-k`: `zoom` of `#ui`,
  the font of map labels; «Меньше движения» — `still`, `null` follows the system, `Game.showStill` sets `still` on the
  camera, `Appear` and `Highlight` and the `still` class of the page (studio ADR 0023, rule 6; how the project meets
  ADR 0023 — `docs/08-game-design.md` §13, «Графика (ADR 0023 устава)»); kept in page storage, not in saves — bench and
  build change the view through `showWalls`/`showQuality`, which do not write them); the build catalog (`docs/specs/2026-10-catalog.md`): groups by
  department — `groups.ts` (`groupOf`, `groupOrder`, `grouped`), thumbnails of ready rooms — `thumbs.ts` (`sampleOf`: the
  sample on its own small lot by `addReady`; `ThumbQueue`: one at a time while the catalog is open), drawn by
  `src/render/thumbs.ts` (the map's floors, walls, doors and furniture, an ortho camera at the map's angle) into a PNG of
  `src/render/png.ts` without waiting for the GPU; people and flow:
  pure window logic (`flow.ts` — path lines, room load and state, patient rows) and room status chips (`chips.ts`); the
  «Проблемы» layer (`docs/specs/2026-10-layers.md`, part 1): `problems.ts` — what holds the hospital back now (rooms by
  their chips, a gap in the shift — `shiftGap`, staff about to quit or tired, lying patients without a gurney, cash), the
  list bottom-right (`ProblemsPanel` in `src/ui/flow.tsx`), a row flies there (`goProblem`); the «Пути пациентов» layer
  (part 2): the sim sends a day's moves from the engine's paths only while it is on (`src/sim/legs.ts`, `legs` in the
  protocol, every `LEGS_EVERY`), `paths.ts` routes each pair of rooms with the walkers' search (`endsOf` — the cell outside
  the middle of a door), sums the cells into heat and lists where the most metres were walked (`legRows`),
  `src/render/heat.ts` — one plane over the lot, a texel per cell; `PathsPanel`, a row shows only its path (`pickLeg`); L
  cycles queues, departments, paths, problems, off; popup notices under the clock — `toasts.ts` (the last three, real-time
  fade, only fresh ones; the «Журнал» tab keeps them all). The
  «Показатели» layer (`docs/specs/2026-10-metrics-layer.md`): `metrics.ts` — a room's column from its load (`columnOf`: height,
  colour, the hover line, the number), `collabels.ts` — numbers over the columns, `src/render/columns.ts` — one instanced mesh
  of shaded boxes, picked by a ray; the chosen metric is a player setting (`metric`), M cycles it, `?metric=load` for bench.
  Part 2 — money by room: the engine writes every move of the day's cash to its room too (`src/engine/shift/rooms.ts`,
  `DaySummary.rooms`; `''` — the common part), so the rooms sum to the day's cash to the rouble; the sim sends
  `RoomsMoney` (today so far, the last 14 days); `moneyColumnOf` — revenue and profit, `serviceRoom` — rooms that never
  earn show their costs in grey (owner's decision #120); the «Сутки» slider and the room card's chart (`MoneyChart`).
- `src/render/` — the 3D view (Three.js): `layout.ts` places template items on the engine plan, `catalog.ts` maps
  engine items to CC0 models or code-made ones, `world.ts` floors and cut walls (and the shadow-only roof: the sun gets in
  only through windows), `doors.ts`, `lamps.ts`, `post.ts` (MSAA + GTAO, colour by the hour and the vignette), `stage.ts`,
  build ghosts `ghost.ts`; people: `bake.ts` (animations baked into a texture), `cast.ts`
  (the one table of heights, role colours and looks), `place.ts`, `path.ts`, `crowd.ts`, `population.ts`. People exist
  only in rendering: the engine never sees them. People are Microsoft Rocketbox looks (`docs/specs/2026-10-people.md`):
  59 in `LOOKS` of `cast.ts` (a look of its own per role — `roles`; hard hats and workwear only for patients of their
  professions — `jobs`, `NameRow.job`), an atlas (strands in its alpha) and a mask — R the clothes, tinted by role colour, G
  the skin (½) and hair (1), tinted per person by `toneOf` in `cast.ts` (part 2б; the converter's `regions` finds them, 9 looks
  in hats or bald have no hair, `NO_HAIR`), the mask goes to the GPU in two channels (`people.ts`); a blanket over whoever
  lies in a bed (`Spot.bed`), shaped by the look's lying heights (`lie` in `bake.ts`). `bake.ts`
  bakes them in the bake workers (`bake-worker.ts` → `dist/bake.js`; `toWire`/`fromWire` hand them over without a copy):
  feet stay planted in walk and run (`lockFeet`, a two-bone leg reach), the seated pose sits on a chair of `SEAT`
  (`catalog.ts`; `seatTo`), walk and run speed per look. The slow walk (owner's decision #132): patients from 65 and
  «yellow» walk at 0.8 of the pace — the rule and the times are the engine's (`slowWalker`, `slowOf`, `SLOW_SPEED_PC` in
  `shift/walking.ts`), the slice marks them (`SLOW` in `P.flags`), the window walks them with the `WalkSlow` clip. Staff in
  motion (`docs/specs/2026-10-staff-motion.md`, part 1; window only): a post seat facing a desk or monitor is `work: 'desk'`
  (`deskAhead` in `place.ts`) and plays the `SitWork` loop, a standing post is `work: 'stand'`; who sits or stands still plays
  a short clip now and then by screen time (`gesture`, `gestureGap` in `crowd.ts`: `SitLook`, `Papers`, none in the OR); a
  ward, ICU or reanimation nurse walks round the occupied beds of her room every 1–1.5 game hours (`roundsStep` in
  `population.ts`, `bedSide`, `Crowd.route`) — a rest or a ride takes over. These clips are segments of long Rocketbox clips
  (`span` in the converter's `CLIPS`, two segments blended into one) at 10 frames a second.
  Icons above heads — `icons.ts` (drawn after the frame); the queues overlay floor tint — `overlay.ts`. New furniture grows from
  the floor after a build (`appear.ts`, `docs/specs/2026-10-aaa-polish.md`, «Появление мебели»): every furniture vertex carries
  its thing's number (`owner`, `Batch.own`), a small texture holds each thing's middle and birth time, the vertex shader of the
  materials and of their shadow depth scales it; new things are those whose `thingKey` the last layout did not have; the first
  layout and «Меньше движения» (`Appear.still`) never grow.
- `src/ui/` — panels (React) and their store; icons — `icons.tsx` (`Icon`: Carbon (IBM) under Apache 2.0, owner's decision
  #139, the text's colour, 16 points) over `icons.gen.ts` (made by `tools/app/icons.mjs`; three own icons in Carbon's style —
  doors and a bench); never put a Unicode symbol or emoji in the window instead of an icon (`tools/test/icons.test.ts`);
  every window over the map (`role="dialog"`) starts with `WindowHead` (`WindowHead.tsx`: icon 20 points, title, the window's
  buttons, «Закрыть» last — what Esc does; `docs/specs/2026-10-clinical-style.md`, part 2; `tools/test/window-head.test.ts`);
  `src/ui/doctor/` — the patient card window, the doctor's panel and the
  «Просят посмотреть» tab, driven by `src/app/doctor.ts` (your own card — the timeline «Ход приёма» and one open step of
  four, owner's decision #104, `docs/specs/2026-10-own-card.md`); `src/ui/flow.tsx` — the «Пациенты» tab, the patient's path and
  the map layers menu; `src/ui/Encyclopedia.tsx` — the encyclopedia window (`docs/specs/2026-10-encyclopedia.md`): its
  articles come from `src/app/encyclopedia.ts`, a copy of Anamnez's, over the window's database (`src/app/content.ts`
  reads it once for the game and for the start screen); F1 and Esc are caught before the game's keys; a name with
  `data-enc` (or `data-exam`) under the cursor opens its article; `src/i18n/` — every player-facing string, Russian and
  English (English typed as the Russian; the medical database is Russian-only for now and shows as is in English mode);
  `tools/test/i18n.test.ts` fails on Cyrillic in strings elsewhere in `src/app`, `src/ui`, `src/render`, `src/sim`.
- `electron/` — the main process (window, `app://`, no network) and preload; `app/index.html` — the page. Its CSS takes
  colours, font sizes and radii only from the `:root` tokens — the dark clinical style (owner's decision #69,
  `docs/specs/2026-10-clinical-style.md`): surfaces, text, accent (`--accent-text` for text), states, seven font sizes;
  `tools/test/style.test.ts` fails on a colour or a font size outside the tokens and on text below 4.5:1 over a white or
  black floor behind the glass.
- `blender/` — models from Blender scripts (`blender/README.md`): Python scripts build each model from parts (a part's id
  is its `.glb` node; AO baked into vertex colours); the sizes come from the game (`blender/sizes.json`). The pilot (#175,
  `docs/reports/2026-11-blender-pilot.md`) made the bed, the monitor, the X-ray machine and the X-ray room's light; groups 2
  and 3 took all of them, so the pilot has no keys of its own any more (`?models=blender`, `&baked=1` are gone). Models go in
  by `Furnisher.placeAt` (the IV stand only in wards and boxes), light by `src/render/baked.ts` (the floor multiplier on
  every room matching the sample, any rotation). Part 2 (owner's decision #178, `docs/specs/2026-11-blender-2.md`): devices and
  furniture in groups, each on by default, `?models=code` (`--models code`) for the code and CC0 models; budgets —
  `blender/budgets.json` (one place: the build, the probe and the test read it). Group 1 «Амбулатория» — `ambulatory.py`:
  instead of a CC0 model (`BLENDER_KIT`) a model the size of its catalog place, materials named like the CC0 model's so the
  catalog's recolours apply, set by `Furnisher.place` at its real size; instead of a code model (`BLENDER_CODE`) one in its
  place's axes (`placeAt`, `CODE_SHIFT`, `skipOf` — the lab bench shows `microscope*` or `rack*`). A desk next to a staff post
  faces it in every room, ready rooms too (`layoutOf`): the screen and the drawers to whoever sits there, the counter's panel
  to the visitor. Group 2 «Стационар» — `stationary.py`: the pilot's bed and monitor brought to budget with the pilot's part
  names (the bed's `iv` and `iv_bag` only in wards and boxes — `skipOf`), the bedside cabinet instead of Kenney
  `sideTableDrawers` and the ventilator. Group 3 «Диагностика» — `diagnostics.py`: the pilot's X-ray machine as is (within
  budget), the CT (`gantry`), the MRI (`magnet`, `bore`), the ultrasound cart and the console of the imaging rooms (shifted
  to the wall, `CODE_SHIFT`); a table's `pad` top sits at the code model's `lieTop`, where people lie. Group 4 «Операционная и
  эндоскопия» — `surgery.py`: the OR table with its lamp (`table`, `pad`, `lamp`), the anaesthesia machine (`bellows`), the
  instrument table and the endoscopy tower (`scope`) — with it every room's devices and furniture come from Blender. A group's
  baked light — a sample per size of each room type in `light` of `budgets.json`, built as the player places the ready room
  (`addReady` in `roomOf`), with the groups' real models in place, 32 points per metre (`blender/room.py`, `PX`; `rooms.json`
  lists them; a bed's IV stand only in wards and boxes, a long thing in one cell half as long — `iv`, `short` in the sample;
  `python blender/build.py samples` rewrites the descriptions without baking) — is on by default, `?baked=0` (Electron
  `--baked 0`) turns it off; the window loads it after the models, alongside the people (`load.light`), so it never lengthens
  the furniture load. `bakedRooms` matches type, sides, the wall and door cells and every thing's place and facing (`cells`,
  `yaw` in the sample) — never the plan's `size`: a room built on the PC site carries its type's smallest size there
  (`planOfSite`). It holds at any rotation because a ready room's items are turned in the template's axes (`placeTemplate`:
  `turnsOf` on the template, then the room's rotation) and the city's double doors follow `readyDraft` (`siteOfPreset`).
  The comparison sheet `tools/app/blender-sheet.mjs --group N [--light]` shoots a group's rooms; group 3's light is shot in
  the city (an MRI L costs more than the empty building's cash).
- `assets/` — CC0 models, Rocketbox people under MIT (`assets/models/rocketbox/`, made by `tools/app/people.mjs`), the
  game's font IBM Plex Sans under SIL OFL 1.1 (`assets/fonts/`, unmodified files with `OFL.txt`; owner's decision #107),
  the Carbon icons' Apache 2.0 text (`assets/licenses/carbon-icons.txt`) and `LICENSES.md` (sources, licenses, SHA-256; MIT
  text verbatim); never add a model, a font or an icon set without its line there.
- `tools/app/` — page build, model preparation, browser scenario, headless bench, the long run (`soak.mjs`), the release
  update archive — one `resources/app.asar` (`update-zip.mjs`); `tools/test/` — Bun tests;
  `tools/content/` — database build; `tools/bench/` — engine bench and the snapshot by day (`state.ts`).
- `spikes/` — probes, kept as they were; code taken from them carries `// из spikes/<probe>: <path>` on its first line.
