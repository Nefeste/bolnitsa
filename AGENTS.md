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
(CI: Bun 1.3.11, like Anamnez). Run the first four before every push — `pr.yml` runs the same on every PR.

```bash
npm ci                             # dependencies (yaml, zod, typescript, bun-types)
npm run content                    # build and validate content/ → src/content/generated/bundle.json (not in git)
npm run typecheck                  # content + tsc --noEmit (src, tools)
npm test                           # content + bun test tools/test (~4 min)
npm run bench -- --mode flow --quick           # time per game minute at 50/100/200/300 patients (PC flow)
npm run bench -- --mode desks --quick          # the same with Anamnez's appointment slots
bun tools/bench/consults.ts                    # «Просят посмотреть»: share of hired doctors' cases that ask you (--probe: why these thresholds)
bun --cpu-prof --cpu-prof-dir=tools/bench/out/prof tools/bench/bench.ts --mode flow --only 200 --quick --until 11
bun tools/bench/profile.ts tools/bench/out/prof/<file>.cpuprofile 30 --under catchUp
bun tools/test/make-review-fixture.ts          # only with the ORIGINAL engine: fingerprints of the eager review
```

If the environment sets `BUN_OPTIONS=--smol`, unset it for the bench (`env -u BUN_OPTIONS …`). Any change to
`src/engine/` re-runs the bench and compares with `docs/reports/2026-10-engine-speed.md`; a change to inference must
keep `tools/test/infer-speed.test.ts` and the golden fingerprints green (same numbers to the bit).
