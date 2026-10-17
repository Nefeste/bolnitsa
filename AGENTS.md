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
- `docs/01-product.md` — what the game is, for whom, what is deliberately absent, vocabulary.
- `docs/specs/2026-10-prototype.md` — the live specification: what the prototype must answer.
- `docs/05-process.md` — how work and builds go here (PC specifics).
- `docs/07-roadmap.md` — stages and owner questions.
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
  0014). Steam integration, when it comes, is a separate decision.
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
                                   # by mouse in the empty building); screenshots in tools/app/out/; `-- --only 1|2` for one part
npm run bench:headless -- --qualities low --secs 5   # after build: auto-bench in headless Chromium → tools/app/out/
npm run dist:linux                 # build + AppImage and tar.gz → release/ (not in git)
npm run dist:win                   # build + Windows zip and portable .exe → release/ (from Linux, no wine)
npm run assets -- <sources dir>    # rebuild assets/models/*.glb from the CC0 packs (byte-identical; see assets/LICENSES.md)
npm run bench -- --mode flow --quick           # engine: time per game minute at 50/100/200/300 patients (PC flow)
npm run bench -- --mode desks --quick          # the same with Anamnez's appointment slots
bun --cpu-prof --cpu-prof-dir=tools/bench/out/prof tools/bench/bench.ts --mode flow --only 200 --quick --until 11
bun tools/bench/profile.ts tools/bench/out/prof/<file>.cpuprofile 30 --under catchUp
bun tools/test/make-review-fixture.ts          # only with the ORIGINAL engine: fingerprints of the eager review
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
  rectangles, items, doors, checks, the plan for the engine), `hospital/site-preset.ts` (the preset as a lot) and
  `shift/site.ts` (the `site` command: deferred removal, undo, hiring) — `docs/specs/2026-10-build.md`.
- `src/sim/` — the calculation thread: protocol, host (`createSim`), packed slice (`pack.ts`), Web Worker
  (`worker.ts`) and its client in the window (`client.ts`). The window never runs the engine.
- `src/app/` — the game in the window: loads the database and models, starts with the empty building or the preset,
  frame loop, clock, input, build tools (`build.ts`), room labels (`labels.ts`), auto-bench (`bench.ts`).
- `src/render/` — the 3D view (Three.js): `layout.ts` places template items on the engine plan, `catalog.ts` maps
  engine items to CC0 models or code-made ones, `world.ts` floors and cut walls, `doors.ts`, `lamps.ts`, `post.ts`
  (MSAA + GTAO), `stage.ts`, build ghosts `ghost.ts`; people: `bake.ts` (animations baked into a texture), `cast.ts`
  (the one table of heights, role colours and looks), `place.ts`, `path.ts`, `crowd.ts`, `population.ts`. People exist
  only in rendering: the engine never sees them.
- `src/ui/` — panels (React) and their store; `src/i18n/` — every player-facing string, Russian and English (English
  typed as the Russian); `tools/test/i18n.test.ts` fails on Cyrillic in strings elsewhere in `src/app`, `src/ui`,
  `src/render`, `src/sim`.
- `electron/` — the main process (window, `app://`, no network) and preload; `app/index.html` — the page.
- `assets/` — CC0 models and `LICENSES.md` (sources, licenses, SHA-256); never add a model without its line there.
- `tools/app/` — page build, model preparation, browser scenario, headless bench; `tools/test/` — Bun tests;
  `tools/content/` — database build; `tools/bench/` — engine bench.
- `spikes/` — probes, kept as they were; code taken from them carries `// из spikes/<probe>: <path>` on its first line.
