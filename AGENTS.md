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
- **No image generators yet.** The owner allowed them for the PC game (decision №77 in
  `Nefeste/uprava`), but only after a studio ADR with the conditions; until then — art by code.
- Never press «Merge»; merging follows charter ADR 0018 (owner paths in `.github/CODEOWNERS`).

## Commands

Appear with the first code (probes, `docs/specs/2026-10-prototype.md`, «Технология»).
