# D481 — close the typecheck hole over `scripts/`

Repo: /home/jofre/projects/luminous_ui  (branch main, tree CLEAN at c9f6901f)

## Read first

  - `scripts/autoloop/prompt.md`
  - the `## NEXT (resume point)` block in `docs/progress.md` (written after D480) —
    **section (4) is this slice's work order; (7) its hazards.**
  - the `| **D480** |` row in `docs/decisions.md` (which found the hole), plus D479.
  - `docs/conventions.md` — ⚠️ **~6,000 lines; do NOT read it end to end.** Read the
    heading index, then these entries **by title**:
      · *"When a slow tool is the sole guard over an untypechecked region, every defect there costs a full run"*
      · *"A refusal carries two claims with two different oracles — check build state first"*
      · *"Three prose rules over 150 decisions did not stop the fourth occurrence"*
      · *"The three defect classes a `find`/`replace`/`what` diff catches"*
      · *"The danger of an unkillable row is not that it fails — it is that it PASSES"*
      · *"An instrument that measures the repo must be killable by the corpus"* (D465;
        find its actual title in the index — this is the one that governs this slice)
    plus whatever the index suggests about `lint-coverage` and D212, which closed
    the *lint* half of this same hole.

## State

Corpus **2,238**, engine **0.377.0**, `MATCH_RECORD_VERSION` **29**, `ARCHIVES`
**150** (🛑 the RITUAL's — twelve work orders, eleven builders refusing). RESIDUE
**101/140**, gate §A **127/101/140**, `OPAQUE` **69/100**, `BUILT.attack` **1592**,
`units - built` **386**, `BUILT.ability + BUILT.trainer + BUILT.specialEnergy`
**405**. Declared survivors **41 across nine files**.

## The finding this slice acts on

**`tsc -b` never typechecks `scripts/`.** Every tsconfig `include` is `["src"]` or
`["vite.config.ts"]`, so the five built projects exclude **the mutation corpus
(2,238 rows) and every instrument** — `residue-census.ts`, `opaque-anatomy.ts`,
both gates, `precheck.ts`, `run.ts`, `mutants.ts`, `opcoverage.ts`.

D480 proved it with a live witness rather than by inspection: a survivor's reason
keyed `survives.why` where the runner reads `survives.reason` **shipped green
through `bun run check`**, and surfaced only when a probe printed `undefined`.

⚠️ **D212 closed the LINT half of this same hole in 2026-08** (`lint-coverage.ts`,
which asserts every source file is covered by Biome). **Read what D212 did and why
— the shape of that fix is the strongest available prior art, and this slice is its
missing twin.**

## What to do — and the honest sequencing matters

1. **MEASURE FIRST, BUILD SECOND.** Before changing any config, get `scripts/`
   typechecked in a scratch invocation and **report how many errors exist and of
   what kinds.** That number is the deliverable whether or not the hole closes this
   slice. D480's estimate was *"likely to surface latent errors"* — replace it with
   a count.
2. **Then decide the shape, and justify it.** A new `tsconfig.scripts.json` added
   to the solution's references is the obvious move, but check: does `bun`-specific
   syntax typecheck cleanly under the repo's settings? Do the instruments import
   from `packages/engine` in a way that needs a project reference? Is `mutants.ts`
   (a ~2.3 MB literal) going to make `tsc -b` unacceptably slow — **measure the
   before/after wall-clock of `bun run check` and report it**, because this gate
   runs several times per slice and a large regression is a real cost.
3. **The fix needs a killer** (D465) — a coverage assertion in the same spirit as
   `lint-coverage.ts`, so that a future config edit which silently drops `scripts/`
   back out of the build goes RED. **A tsconfig change with no guard is exactly the
   defect this slice exists to fix, one level up.**
4. **If the honest answer is that the errors are too many for one slice**, say so
   with the count and the breakdown, close what you can behind the guard, and leave
   the rest listed. **A partial close with an accurate count beats a forced one.**

## Requirements

  - Everything you add is covered by its own killer; state what reddens it.
  - Hand-authored mutant rows for what you add. **Read each row's `what` against its
    `replace` BEFORE probing** — three defect classes caught in three slices, the
    newest being rows that are live and correctly described but **unkillable by
    their own suite**, which ship as silent survivors. ⚠️ **This slice is uniquely
    exposed to that**, since a guard over a config is easy to write and hard to
    kill: make sure a board exists where your guard's absence is observable.
  - Step the engine version only if `packages/engine` behaviour moved (it probably
    does not). Decide `MATCH_RECORD_VERSION` (29) and state which argument you make.
  - Both instrument gates must still pass — report their lines.
  - ⚠️ **If closing the hole surfaces errors inside `mutants.ts`, those are corpus
    data errors** — fix them, and say whether any changes a row's meaning rather
    than only its types. **A row whose `replace` or `expectKilledBy` was silently
    mis-typed may have been reporting a verdict about nothing** (D479's
    unkillable-as-written class, arrived at from the other direction).

## Gates before you report

  - `bun run check` GREEN — counts re-derived by counting `it(` at HEAD vs now,
    **plus the before/after wall-clock**.
  - `bun scripts/mutation/precheck.ts` clean — corpus total **and
    `patches LITERALLY (N)`, now 18**; ⚠️ the hazard is that number FALLING.
  - `bun scripts/residue-census-gate.ts`, `bun scripts/opaque-anatomy-gate.ts`.
  - `bun scripts/mutation/run.ts --decision D481 --allow-dirty` — MANDATORY flag,
    row count three ways, report killed / survivor / GAP **and `error(s)`**.
  - `--only D275-engine-version-drifts-again --allow-dirty` if you bump the version.
    🛑 **`--only` does NOT accumulate.**
  - attribution control: by hand, each killer ALONE, restore in a `finally`, verify
    by size AND sha256. 🛑 **Python's `str.replace` REJECTS a function second
    argument** — `find`-split + join with `len(parts) == 2`.

## 🛑 The operator rule

**NEVER write to the tree while the harness is in flight.** If a probe is
interrupted, verify tree integrity by size + sha256 on every survivor-housing file
before doing anything else, then re-probe alone.

## For my sweep prediction

Report `+K killed, +S declared survivors`, exact, **naming `0 error(s)`
explicitly**. Match each survivor's evidence to the shape of its reason.

⚠️ **Report `git diff --numstat` per file for every file with deletions.** Declared
survivors: `interpreter.ts` 12, `effects.ts` 11, `attack.ts` 7, `continuous.ts` 5,
`flow.ts` 2, `redact.ts` 1, `src/features/game/GameHud.tsx` 1,
`scripts/mutation/splice-gate.ts` 1, `packages/engine/src/refusedPrintings.ts` 1 —
**41 total across nine files**. ⚠️ **`splice-gate.ts` is IN `scripts/`**, so this
slice may touch a survivor-housing file for the first time in several slices — name
every deleted line there.

## Hard rules

  - DO NOT COMMIT. DO NOT `git add`. DO NOT run a whole-corpus sweep. Leave the tree
    dirty and NAME every untracked path.
  - NEVER `git stash`, `git checkout --`, `git reset --hard`, or any wholesale
    working-tree mutation.
  - Never `String.replace(find, replacementString)` with a replacement read from a
    file.
  - Encode first, write second, inside `try/finally`.
  - Temp files in `$CLAUDE_JOB_DIR/tmp`, never `/tmp`.
  - Do not commit or delete `tmp/mutation-journal.json.clobbered-*`.

## Report back

**The error count and breakdown FIRST** — that is this slice's headline whether or
not the hole closed. Then: the shape you chose and why; the `bun run check`
before/after wall-clock; what guards the fix; whether any corpus data error you
found changed a row's MEANING rather than only its types; what you left and its
price; **every place this brief was wrong**; the gates verbatim; the per-file
numstat for deletions; and the corpus delta.
