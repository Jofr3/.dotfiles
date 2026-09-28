# D484 — the per-line partition audit, and a guard for it

Repo: /home/jofre/projects/luminous_ui  (branch main, tree CLEAN at 5a898e41)

## Read first

  - `scripts/autoloop/prompt.md`
  - the `## NEXT (resume point)` block in `docs/progress.md` (after D483) —
    **section (4) is this slice's work order; (5)–(8) its context and hazards.**
  - the `| **D483** |` row in `docs/decisions.md` (the finding), plus D481 (the
    most recent guard-building slice, whose shape is the prior art) and D480.
  - `docs/conventions.md` — ⚠️ **~6,000 lines; do NOT read end to end.** Read the
    heading index, then these **by title**:
      · *"`find` occurs exactly once ≠ one row per line"*
      · *"A corpus cannot self-report a row that tests its neighbour"*
      · *"A coverage guard needs a self-check, because its failure mode is going vacuous"*
      · *"\"Defects in proportion to how long it was open\" is not a law"*
      · *"A coverage gap named by the directory where it was noticed will leave files behind"*
      · *"The danger of an unkillable row is not that it fails — it is that it PASSES"*
      · *"The three defect classes a `find`/`replace`/`what` diff catches"*

## State

Corpus **2,267**, engine **0.379.0**, `MATCH_RECORD_VERSION` **29**, `ARCHIVES`
**153** (🛑 RITUAL's). RESIDUE **98/137**, gate §A **124/98/137**, `OPAQUE` **67/98**,
`BUILT.attack` **1595**, `units - built` **383**,
`BUILT.ability + BUILT.trainer + BUILT.specialEnergy` **405**. Survivors **42 across
nine files**. `patches LITERALLY` **21** — ⚠️ the hazard is it FALLING.

## The finding this slice acts on

D483 found **two mutant rows whose `find` strings both resolved to the same line**,
for **46 decisions**. A slice re-indexed a capture group; only one of the two rows
quoting that line was re-transcribed; the other landed on its neighbour's line.
**Both reported KILLED on every sweep, and the arm one of them names had no row at
all.**

🛑 **`precheck`'s guarantee was true throughout.** It asserts *"every `find` occurs
exactly once in its target"* — and it does. Each find occurs once; both point at the
same line. **A per-row uniqueness check does not imply a per-line partition, and
nothing asserts the second.**

## What to do — measurement first, exactly as D481

1. **MEASURE BEFORE BUILDING.** Group all 2,267 rows by the `(file, resolved line)`
   their `find` lands on, and **report how many lines carry more than one row, and
   which**. That count is this slice's headline whether or not a guard follows.
   ⚠️ **Expect a non-trivial answer in EITHER direction and do not force it** —
   D481's equivalent measurement came back at six errors against a forecast of
   "proportional to how long it was open", and *"defects in proportion to age is not
   a law"* is now a convention because of it.
2. **Triage what you find.** A collision is not automatically a defect: two rows may
   legitimately mutate different *parts* of one line, or one row's `find` may span
   several lines. **Say which collisions are defects and which are legitimate**, and
   for each defect say whether it is D483's shape (a row silently testing its
   neighbour) or something else.
3. **Then decide the guard's exact predicate**, and justify it. "No line carries two
   rows" may be too strong if legitimate collisions exist; the honest alternative is
   to assert **the exact set** of known collisions, ratchet-style, so a new one
   reddens. **Say which you chose and why.**
4. **Fix the defects you find**, and for each, say whether repairing it changes a
   verdict. ⚠️ **Expect it not to** — D483's repair left both verdicts KILLED, and
   D480's ten formerly-spliced rows all came back killed too. **When a
   silent-corruption class is fixed and no verdict moves, the recovered value is
   MEANING, not coverage** — say so plainly rather than implying the sweep confirmed
   anything.

⚠️ **If the measurement comes back clean — zero collisions besides D483's, already
repaired — that is a complete and publishable result.** Write the guard anyway if it
is cheap (the value is preventing recurrence, which D483 proves is possible), or say
why it is not worth it. **Do not manufacture defects to justify the slice.**

## The guard, if you write one

**D481's `typecheck-coverage.ts` is the prior art and its shape is the requirement:**
  - **It must hold no number of its own** where possible — derive from the module.
  - **It must have no exemption list**, or an explicit and asserted one.
  - **It must assert its own wiring** — D481's reads `package.json`'s `check` script
    and requires its own path in it, because the older lint guard can be switched
    off by deleting eight words with nothing going red.
  - 🛑 **It must have a SELF-CHECK on synthetic inputs whose answer is known by
    construction.** A coverage guard's one unkillable failure mode is going
    **vacuous** — blank the predicate, widen a comparison — and a mutation against a
    vacuous guard reports SURVIVED and gets believed. **That self-check is the board
    on which the guard's own absence is observable.**
  - **Delete any rung that cannot fire** (D481 wrote one and removed it when the
    compiler was found to catch that case an earlier call).

## Requirements

  - Hand-authored mutant rows for whatever you add. **Read each row's `what` against
    its `replace` BEFORE probing** — and note this slice is uniquely exposed to
    UNKILLABLE-AS-WRITTEN, since a guard over a data property is easy to write and
    hard to kill.
  - Step the engine version only if `packages/engine` behaviour moved (it probably
    does not). Decide `MATCH_RECORD_VERSION` (29) and STATE which argument.
  - Both instrument gates must still pass — report their lines.

## Gates before you report

  - `bun run check` GREEN — `typecheck-coverage` line too; counts re-derived by
    counting `it(` at HEAD vs now, **and explain any discrepancy**.
  - `bun scripts/mutation/precheck.ts` clean — corpus total and `patches LITERALLY`.
  - `bun scripts/residue-census-gate.ts`, `bun scripts/opaque-anatomy-gate.ts`.
  - `bun scripts/mutation/run.ts --decision D484 --allow-dirty` — MANDATORY flag,
    row count three ways, killed / survivor / GAP **and `error(s)`**.
  - `--only D275-engine-version-drifts-again --allow-dirty` if you bump the version.
    🛑 **`--only` does NOT accumulate.**
  - attribution control: by hand, each killer ALONE, restore in a `finally`, verify
    by size AND sha256. 🛑 **Python's `str.replace` REJECTS a function second
    argument.**

## 🛑 The operator rule

**NEVER write to the tree while the harness is in flight.**

## For my sweep prediction

`+K killed, +S declared survivors`, exact, **naming `0 error(s)` explicitly**.

⚠️ **Report `git diff --numstat` per file for every file with deletions.** Survivors:
`interpreter.ts` 12, `effects.ts` 12, `attack.ts` 7, `continuous.ts` 5, `flow.ts` 2,
`redact.ts` 1, `src/features/game/GameHud.tsx` 1, `scripts/mutation/splice-gate.ts`
1, `packages/engine/src/refusedPrintings.ts` 1 — **42 across nine files**.
⚠️ **If you repair a collision, you are editing `mutants.ts`, which houses no
survivor — but a repaired row's `find` moving is exactly the event that could break
a NEIGHBOUR's resolution.** Re-run `precheck` after every repair, not only at the end.

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

**The collision count and its triage FIRST** — how many lines carry more than one
row, which are defects, which are legitimate, and of what kind. Then: the guard's
predicate and why; whether any repair changed a verdict; what you left and its
price; **every place this brief was wrong**; the gates verbatim; the per-file
numstat for deletions; and the corpus delta.
