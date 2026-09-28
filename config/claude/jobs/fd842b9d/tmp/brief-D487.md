# D487 — the version-costing cluster, measured and possibly taken together

Repo: /home/jofre/projects/luminous_ui  (branch main, tree CLEAN at d71d269a)

## Read first

  - `scripts/autoloop/prompt.md`
  - the `## NEXT (resume point)` block in `docs/progress.md` (after D486).
  - `packages/engine/src/refusedPrintings.ts` before pricing anything (D480).
  - the `| **D486** |` and `| **D473** |` rows in `docs/decisions.md`.
  - `docs/conventions.md` — ⚠️ **~6,000 lines; do NOT read end to end.** Read the
    heading index, then these **by title**:
      · *"Where two programs are extensionally equal, the corpus is PROVABLY blind"*
      · *"Two candidate programs can agree by ARITHMETIC IDENTITY on every board"*
      · *"A rule that turns on persistence must be applied at an address that persists"*
      · *"\"Does the op exist?\" is checkable; \"does a composition of shipped ops spell it?\" is not"*
      · *"Prefer \"an old doc block says X, unverified\" to \"D4xx priced it at X\""*
      · *"A rung passing is not evidence it still tests its stated claim"*

## State

RESIDUE **96 / 135**. Gate §A **122/96/135**. `OPAQUE` **67/98**, `COMPOUND-head`
**8/9**, `COMPOUND-tail` **2/4**, `SUBST-2` **3/4**, `PHRASE-1` **4/5**, and eight
single-row `PHRASE-*` classes. Corpus **2,294**, engine **0.381.0**,
**`MATCH_RECORD_VERSION` 29**, `ARCHIVES` **156**. `BUILT.attack` **1597**,
`units - built` **381**, `BUILT.ability + BUILT.trainer + BUILT.specialEnergy`
**405**. Survivors **42 across nine files**. `patches LITERALLY` **21**;
experiment-identity near-miss **8**. Version tax: successor inherits **61 / 81 /
61 / 17**, with **three** history occurrences (one in `mutants.ts`'s re-point
ledger, which no `expect(` grep reaches).

## The observation this slice starts from

**`MATCH_RECORD_VERSION` has been 29 for the entire run** — every slice has argued
its way to leaving it alone, and several rows have been deferred *specifically*
because building them would move it. Three are known:

  - **Corpus 487** — *"…draw a card for each card in your opponent's hand."* (1p).
    D473 priced it: a **fifth `HandRefreshDraw` member**, and a new member in a
    persisted union is the costly side → **29 → 30**.
  - **`SUBST-4`** — *"Each player draws 3 cards."* (1p). D469 priced it: `drawCards`
    is `{op, count, recordAs?}` with **no seat field, deliberately**, refusal
    written at `effects.ts:9296-9298`; building it reverses a recorded design
    decision **and** adds an op field → **29 → 30**.
  - **`PHRASE-6`** — *"Draw 3 cards from the bottom of your deck."* (1p). The
    classifier says deleting *"from the bottom of your deck"* builds
    `[{op:"drawCards",count:3}]`, so the blocker is a **source** the op cannot
    name. My read, unverified: also an op field on `drawCards`.

⚠️ **All three prices are inherited, and inherited prices in this run have been
wrong more often than right** — including at D486, where one was **93 decisions
old, mis-attributed by my brief, and wrong in both directions.** Treat every figure
above as a claim to check, not a starting point. **Prefer "an old row says X,
unverified" to "D4xx priced it at X"** and grep before quoting.

## What to do — measure the cluster first

1. **MEASURE, do not enumerate** (D477). Over all 640 corpus rows, find every
   residue sentence whose *only* remaining blocker is something that would move
   `MATCH_RECORD_VERSION` — a new member of a persisted union, or a new field on a
   persisted op. **Publish the pattern or the procedure**, and report the count.
   ⚠️ **My three may be wrong in either direction**: there may be more, and one or
   more of them may turn out not to cost a bump at all (D473's rule — *a new
   INHABITANT of an existing union does not*; and D473-ii — *a rule that turns on
   persistence must be applied at an address that persists*; `AttackFlipCount`
   looked like a member question and turned out never to be serialised).
2. **For each, run build state with the RIGHT oracle** (the 13 readers,
   programmatically) and **drive the composition question** (D482): can it be
   spelled by shipped ops? ⚠️ **And apply the counterweight in its strongest form**
   (D486): two candidates can be equal by **arithmetic identity** on every board, in
   which case the separating axis is not a quantity — look at parking, prompting,
   ordering, log text. **If you cannot name a board where two candidates differ,
   say so.**
3. **Then decide whether to spend the bump, and take it ONCE if you do.** If three
   rows share one version cost, building them together pays it once. **If the
   honest answer is that they do not share it — different fields, different unions,
   different addresses — say so and take whichever is genuinely cheapest.**
4. 🛑 **If you bump `MATCH_RECORD_VERSION` 29 → 30, that is a schema decision and it
   must be argued, not assumed.** State: what byte a v30 record can hold that a v29
   cannot; whether any migration or compatibility path exists or is needed; and what
   in the repo asserts the version (there is a mutant row on it — find it). **If the
   honest conclusion is that the bump is not worth 3 printings, that is a complete
   and publishable result** — report the cluster measurement and take something else.

## Requirements (if you build)

1. Build it properly; the op must MEAN something on a real board.
2. New vitest suite, behavioural, with a ZERO-MATCH board and controls separating it
   from silence-for-another-reason. **Compute what each candidate answers BEFORE
   choosing the board** so no two collide. Prefer a file-local `cardPool` (D414);
   check whether any target sentence is already fielded as a refusal witness (D475)
   — **expect re-pointing to be part of the work**, and note a witness can be
   load-bearing in many files (D485 found one in nine).
3. ⚠️ Mutate your central arm to its NEAREST WRONG SIBLING; something OTHER than a
   census suite must go red. Thirteen slices running.
4. ⚠️ **Measure what any generalisation claims over all 640 rows** (D472).
   **Describer obligations follow the CALL PATH** (D478).
5. Hand-authored rows for everything. **Read each row's `what` against its
   `replace` BEFORE probing**; **every discriminating rung differs from its control
   in exactly ONE axis** (D484). ⚠️ **If you add a REQUIRED field, that is a
   corpus-wide edit** — a dependent `replace` omitting it reports ERROR, and
   `precheck` gates `find` only (D476).
6. Census pins if you built a sentence. **`BUILT.attack` is a RECORDED CONSTANT the
   chains subtract FROM — bump it FIRST** (D449). **MEASURE the `Math.round`
   numerator** (holds at 18). **Step literals on a MEASUREMENT, never a prediction.**
7. Both instrument gates must still pass — report their lines.

## Gates before you report

  - `bun run check` GREEN — `typecheck-coverage` line; counts re-derived by counting
    `it(` at HEAD vs now, **explaining any discrepancy**.
  - `bun scripts/mutation/precheck.ts` clean — corpus total, `patches LITERALLY`,
    **and the experiment-identity near-miss count (8)**.
  - `bun scripts/residue-census-gate.ts`, `bun scripts/opaque-anatomy-gate.ts`.
  - `bun scripts/mutation/run.ts --decision D487 --allow-dirty` — MANDATORY flag,
    row count three ways, killed / survivor / GAP **and `error(s)`**.
  - `--only D275-engine-version-drifts-again --allow-dirty` if you bump the engine
    version. 🛑 **`--only` does NOT accumulate.**
  - attribution control: by hand, each killer ALONE, restore in a `finally`, verify
    by size AND sha256. 🛑 **Python's `str.replace` REJECTS a function second
    argument.**

## 🛑 Hard rules — the full list

  - **DO NOT COMMIT. DO NOT `git add`. DO NOT run a whole-corpus sweep.**
  - 🛑 **DO NOT run the end-of-session ritual — it belongs to the caller.** Leave
    `docs/progress.md`, `docs/decisions.md` and `docs/conventions.md` **untouched**,
    and do NOT step `ARCHIVES` in `progressLog.test.ts`.
  - Leave the tree dirty and **NAME every untracked path**.
  - **NEVER** `git stash`, `git checkout --`, `git reset --hard`, or any wholesale
    working-tree mutation.
  - **NEVER write to the tree while the harness is in flight.**
  - Never `String.replace(find, replacementString)` with a replacement read from a
    file.
  - Encode first, write second, inside `try/finally`.
  - Temp files in `$CLAUDE_JOB_DIR/tmp`, never `/tmp`.
  - Do not commit or delete `tmp/mutation-journal.json.clobbered-*`.

## For my sweep prediction

`+K killed, +S declared survivors`, exact, **naming `0 error(s)` explicitly**.
⚠️ **Report `git diff --numstat` per file for every file with deletions.** Survivors:
`interpreter.ts` 12, `effects.ts` 12, `attack.ts` 7, `continuous.ts` 5, `flow.ts` 2,
`redact.ts` 1, `src/features/game/GameHud.tsx` 1, `scripts/mutation/splice-gate.ts`
1, `packages/engine/src/refusedPrintings.ts` 1 — **42 across nine files**.

## Report back

**The cluster measurement FIRST** — how many residue rows are blocked only by a
version-costing change, by what procedure, and how my three fared. Then: whether
you spent the bump and the argument for or against; what you built; what you left
and its price; **every place this brief was wrong**; the gates verbatim; the
per-file numstat for deletions; and the corpus delta.
