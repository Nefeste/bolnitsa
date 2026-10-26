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
npm run e2e                        # after build: the game in headless Chromium, real clicks (preset; then building six rooms
                                   # by mouse in the empty building; people and flow at 13:00 — icons, «Пациенты», the
                                   # patient's path, the queues overlay, the camera gliding after a right-button drag; then
                                   # the doctor mode: a consult, a whole case, «Take the case», «My office»; then money:
                                   # building from cash, «Until morning» to the 08:00 meeting, «почему?» of the arrived and
                                   # the left, «Кто ушёл», the «Обход» list; then ready rooms: four clicks open the empty
                                   # building, R, one undo; then the start screen on the live scene (the ready city behind
                                   # the glass panel, the camera on its circle, the choice reopens the page with its keys),
                                   # its three cards and the polyclinic; then specialists: hire a gastroenterologist in the
                                   # polyclinic, «по записи к …»; then the owner's play of 18.10:
                                   # «Открыть карту» of anyone, «Следить», «Позвать» — the card when they come in; then
                                   # saves: save, «Продолжить», load from the menu, delete, a broken file; then the card of the
                                   # departed: «Приняты», the decision in a discharged patient's card, the departed's person card;
                                   # then staff shifts: at 20:00 the day shift walks out and the night shift in, the night
                                   # rows of a room card, hiring a night registrar, «Сейчас в смене»; then fatigue: a tired
                                   # doctor walks to the staff room, his card and fatigue bar, «Персонал», «врач на перерыве»
                                   # in a waiting patient's path; then the encyclopedia: the start screen button, search,
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
                                   # chief approves: rule checkboxes, a decision in the list and on the map, its card with the
                                   # «Ещё обследование» form, the path, Enter — «Согласен»; then roles: «Кто вы» on the start
                                   # screen, «Управляющий» sees no medicine for three hours, «Врач» and «Главврач» in the doctor
                                   # window, hints by role, the chief's line and the doctors' errors at the meeting, «Итог» in
                                   # an error's card; then the own card in steps (owner's decision #104): the timeline and the
                                   # steps, a question, an exam and a test go into the timeline, the result opens «Решение»;
                                   # then the people: 59 Rocketbox looks with atlas and mask, the look by role, profession
                                   # and paramedic, the suit colour by role — read from the picture, people sit down, stand
                                   # up and lie, the mask in two channels on the GPU, people of one look with different hair
                                   # and skin, the hair tint seen in the frame, the elderly and «yellow» walk with the slow
                                   # walk clip; then
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
                                   # «Пациенты», the patient card and the path);
                                   # screenshots in tools/app/out/; `-- --only 1|2|…|26` for one part, `-- --only 7,10,11` —
                                   # several in a row on one page, as in the full run
npm run bench:headless -- --qualities low --secs 5   # after build: auto-bench in headless Chromium → tools/app/out/
                                                     # (`-- --flow 40,4` — a bigger crowd, about 180 people,
                                                     # `-- --metric load` — with the «Показатели» layer)
npm run dist:linux                 # build + AppImage and tar.gz → release/ (not in git) — local checks only, not released
npm run dist:win                   # build + Windows x64 zips → release/ (from Linux, no wine): full and app.asar update
npm run assets -- <sources dir>    # rebuild assets/models/*.glb from the CC0 packs (byte-identical; see assets/LICENSES.md)
node tools/app/people.mjs --fetch <dir>   # Rocketbox people (MIT): download the pinned sources, check SHA-256
node tools/app/people.mjs <dir>    # then rebuild assets/models/rocketbox/ (glb + mask, byte-identical; docs/specs/2026-10-people.md)
bun tools/app/people-licenses.ts   # then the Rocketbox tables of assets/LICENSES.md from sources.json and cast.ts
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
                                               # the wrong department (`--first` — by the main complaint, `--vitals`, `--list`)
bun tools/sim/economy.ts --seeds 1,2,3         # economy simulator: scripted hospitals for 7 days, cash, flow, reputation and the criteria
                                               # (`--days 14` — and who quits on their own: at most two in two weeks; `--only
                                               # ambulatory` — scenario 1 with its cash and build order for 10 days, the goal
                                               # «Пять суток с кассой в плюсе» by day 10); under each day — the arrived by kind,
                                               # the meeting's forecast for it and the left by reason (`docs/specs/2026-10-why.md`)
bun tools/sim/halls.ts --flow 14               # the polyclinic under load: waiting halls by the offices vs at the entrance
                                               # (both: `--hall 0` — seats of the whole hospital, `--bench 0` — no door benches)
bun --cpu-prof --cpu-prof-dir=tools/bench/out/prof tools/bench/bench.ts --mode flow --only 200 --quick --until 11
bun tools/bench/profile.ts tools/bench/out/prof/<file>.cpuprofile 30 --under catchUp
bun tools/test/make-review-fixture.ts          # only with the ORIGINAL engine: fingerprints of the eager review
bun tools/test/make-save-fixture.ts 0.7.0      # a save sample for tools/test/fixtures/saves/ — once per save schema number
```

The browser scenario and the headless bench need Chromium: `PLAYWRIGHT_BROWSERS_PATH` (default `/opt/pw-browsers`) or
`CHROMIUM_PATH`. Electron in a container without a GPU: `xvfb-run -a node_modules/electron/dist/electron . --no-sandbox
--swiftshader` (add `--bench --secs 5 --qualities low` for the auto-bench; results land in the working directory).
Software WebGL numbers say nothing about a player's GPU — the owner's PC is the reference.

If the environment sets `BUN_OPTIONS=--smol`, unset it for the bench (`env -u BUN_OPTIONS …`). Any change to
`src/engine/` re-runs the bench and compares with `docs/reports/2026-10-engine-speed.md`; a change to inference must
keep `tools/test/infer-speed.test.ts` and the golden fingerprints green (same numbers to the bit).

Never write Three.js, Electron, React or esbuild code from memory: read the docs of the pinned versions
(`package.json`) first — their APIs change between releases (e.g. `GTAOPass` in three r186).

## Project map

- `src/engine/` — the engine copied from Anamnez (pure TypeScript; see «Hard rules»); `shift/slice.ts` is ours: who is
  where and what they are doing, for rendering. Building by mouse is ours too: `hospital/site.ts` (the lot, rooms as
  rectangles, items, doors, checks, the plan for the engine; a ready room — a catalog sample whole in one command,
  `docs/specs/2026-10-ready-rooms.md`), `hospital/site-preset.ts` (the preset as a lot), `hospital/site-plan.ts` (a
  hospital of ready rooms from a `content/hospital/sites/` record — the polyclinic,
  `docs/specs/2026-10-real-hospital.md`) and `shift/site.ts` (the `site` command: deferred removal, undo, hiring) —
  `docs/specs/2026-10-build.md`. The whole 24-hour day of the PC flow is ours as well: `shift/day.ts` (outpatient hours,
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
  by the hour with those on shift then — `inflowDay`); the window's «почему?» blocks are in `src/ui/Meeting.tsx`.
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
  blue (window only, `m:` walkers) wheels each ambulance arrival in and leaves. The slice's `gurney` doing — admitted and
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
  tutorial patients while your office works (`tutorialNext`, `taught`); the `site` command builds only its rooms (error
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
- `src/sim/` — the calculation thread: protocol, host (`createSim`), packed slice (`pack.ts`), Web Worker
  (`worker.ts`) and its client in the window (`client.ts`). The window never runs the engine. The doctor mode
  (`docs/specs/2026-10-doctor-mode.md`): `caseView.ts` (a copy of Anamnez's player view of a case) and `doctor.ts` build the
  patient card and the doctor's lists here and send them ready-made — the window never sees a patient's truth.
- `src/app/` — the game in the window: loads the database and models, starts with the empty building or the preset,
  frame loop, clock, input, build tools (`build.ts`), room labels (`labels.ts`), auto-bench (`bench.ts`), the live scene
  behind the start screen (`docs/specs/2026-10-aaa-polish.md`, «Экран начала на живой сцене»: `main.tsx` starts the ready
  city as a `Game` with `backdrop` — no input, saves, icons or autopause, never `__ready` — and the choice reopens the page
  with its keys; `backdrop.ts` — the camera's circle over the rooms, pure), the player's
  settings (`settings.ts`: walls, camera, quality «auto», text size — `TEXT_SCALES` 1/1.15/1.3 as `--ui-k`: `zoom` of `#ui`,
  the font of map labels; kept in page storage, not in saves — bench and build change the view through
  `showWalls`/`showQuality`, which do not write them); people and flow:
  pure window logic (`flow.ts` — path lines, room load and state, patient rows) and room status chips (`chips.ts`); popup
  notices under the clock — `toasts.ts` (the last three, real-time fade, only fresh ones; the «Журнал» tab keeps them all). The
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
  `shift/walking.ts`), the slice marks them (`SLOW` in `P.flags`), the window walks them with the `WalkSlow` clip.
  Icons above heads — `icons.ts` (drawn after the frame); the queues overlay floor tint — `overlay.ts`.
- `src/ui/` — panels (React) and their store; `src/ui/doctor/` — the patient card window, the doctor's panel and the
  «Просят посмотреть» tab, driven by `src/app/doctor.ts` (your own card — the timeline «Ход приёма» and one open step of
  four, owner's decision #104, `docs/specs/2026-10-own-card.md`); `src/ui/flow.tsx` — the «Пациенты» tab, the patient's path and
  the map layers menu; `src/ui/Encyclopedia.tsx` — the encyclopedia window (`docs/specs/2026-10-encyclopedia.md`): its
  articles come from `src/app/encyclopedia.ts`, a copy of Anamnez's, over the window's database (`src/app/content.ts`
  reads it once for the game and for the start screen); F1 and Esc are caught before the game's keys; a name with
  `data-enc` (or `data-exam`) under the cursor opens its article; `src/i18n/` — every player-facing string, Russian and
  English (English typed as the Russian; the medical database is Russian-only for now and shows as is in English mode);
  `tools/test/i18n.test.ts` fails on Cyrillic in strings elsewhere in `src/app`, `src/ui`, `src/render`, `src/sim`.
- `electron/` — the main process (window, `app://`, no network) and preload; `app/index.html` — the page.
- `assets/` — CC0 models, Rocketbox people under MIT (`assets/models/rocketbox/`, made by `tools/app/people.mjs`), the
  game's font IBM Plex Sans under SIL OFL 1.1 (`assets/fonts/`, unmodified files with `OFL.txt`; owner's decision #107)
  and `LICENSES.md` (sources, licenses, SHA-256; MIT text verbatim); never add a model or a font without its line there.
- `tools/app/` — page build, model preparation, browser scenario, headless bench, the release update archive — one
  `resources/app.asar` (`update-zip.mjs`); `tools/test/` — Bun tests;
  `tools/content/` — database build; `tools/bench/` — engine bench.
- `spikes/` — probes, kept as they were; code taken from them carries `// из spikes/<probe>: <path>` on its first line.
