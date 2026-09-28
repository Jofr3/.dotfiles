# D477 — a cluster of three, and a hypothesis you should try hard to kill

Repo: /home/jofre/projects/luminous_ui  (branch main, tree CLEAN at 40e8434b)

Read FIRST and treat as binding:
  - scripts/autoloop/prompt.md
  - docs/conventions.md — ALL of it. Five entries landed yesterday.
  - the `## NEXT (resume point)` block in docs/progress.md (written after D476) —
    **sections (4)–(8). Let them override me where we differ.**
  - the D474..D476 rows in docs/decisions.md.

## State

RESIDUE **106 sentences / 148 printings**. Gate §A **132 / 106 / 148**. `OPAQUE`
**72/104**, `MULTI-2` **9/12**, `MULTI-3` **9/13**. Corpus **2,194**, engine
**0.374.0**, `MATCH_RECORD_VERSION` **29**, `ARCHIVES` **146** (🛑 the RITUAL's).

Both axes of the coin-flip family closed (count at D475, face at D476), so this
slice starts fresh from the instrument rather than from a family.

## What the instrument shows — a cluster of three sharing one shape

`bun scripts/opaque-anatomy.ts` (run it; read `── MULTI-2 ──` and `── MULTI-3 ──`
yourself — the transcription below is a map, not the territory):

  **(A)** *"Discard all Energy from this Pokémon, and this attack also does 90
      damage to 1 of your opponent's Benched Pokémon. (Don't apply Weakness and
      Resistance for Benched Pokémon.)"* — **2 printings**, `MULTI-3`
  **(B)** *"Discard all {R} Energy from this Pokémon, and this attack does 180
      damage to 1 of your opponent's Benched Pokémon. (…)"* — **1 printing**,
      `MULTI-3`
  **(C)** *"Discard all Energy from this Pokémon, and this attack does 210 damage
      to 1 of your opponent's Benched Pokémon **ex**. (…)"* — **1 printing**,
      `MULTI-2`

**All three align to the same built neighbour**, which the instrument names:
*"Discard all Energy from this Pokémon, and this attack does 120 damage to 1 of
your opponent's Pokémon. (…)"* — already read.

## 🛑 The hypothesis, and why I want you to attack it rather than confirm it

Diffing (A) against that built neighbour, the visible deltas are the word **`also`**
and **`Benched`** in place of the bare noun. `damageChosen` already ships
`target: "opponentBench"` (the census printed it at D468). **If those are the only
two deltas, (A) is 2 printings for one anchor — and (B) adds only an energy-type
filter on the discard.**

⚠️ **Treat that as a hypothesis I have not verified, and try to kill it first.**
Four consecutive slices have found the inherited price wrong in its expensive
clause — D470's *"two ops"* was three consumers, D474's *"zero test rungs"* was
1,668 lines of them, D475's *"the whole of the work"* was already done, D476's
recommendation was refuted by its own citation. **The pattern is that the cheap
clause survives and the specific one does not.** Things to check before believing
me:
  - is `also` actually a delta the anchor rejects, or does something else in the
    sentence differ that the region diff collapsed?
  - does the built neighbour's arm emit `opponentAny`, and does `opponentBench`
    reach the same funnel? **D447's lesson: `placeSnipe` is a funnel BELOW the
    `snipeTargets` switch and must honour any narrowing too.**
  - is the trailing `(Don't apply …)` parenthetical part of the anchor or split off
    by the trailing splitter? That changes what "one anchor" means.

**If the hypothesis dies, say so with the evidence and take whichever of the three
is genuinely cheapest** — or something else from the two classes entirely. A
well-argued switch is the deliverable, not loyalty to my guess.

🛑 **(C) is NOT free even if (A) and (B) are.** D472 priced the `ex` narrowing:
`damageChosen` carries five riders and **none narrows the candidate CLASS**, so it
needs a new op FIELD on a PARKING op, with D334/D421's optional-vs-required question
live and a dropped rider degrading into "snipe any Benched body". **Take it only if
you build the field properly; do not smuggle it in as a capture.**

🛑 **Off the table:** the `Ancient`/`Future` family and the three `Tera` rows (no
`cardSchema` column carries a banner — thirteenth slice running). **File line 537**
owes a **FIFTH** negative-control home.

## Requirements

1. Build it properly; the op must MEAN something on a real board.
2. New vitest suite in `packages/engine/src/`, behavioural. ⚠️ **For a snipe, the
   load-bearing board has a DAMAGED Active and multiple Benched bodies at
   different HP** — so target-picked-wrong, target-defaulted and
   damage-applied-to-Active are three distinguishable answers. Include a
   ZERO-MATCH board (empty opponent Bench) with controls separating it from
   silence-for-another-reason, and drive the self-discard cost independently of
   the damage. Prefer a file-local `cardPool` (D414) — **and check whether these
   sentences are already fielded as refusal witnesses before adding anything**
   (D475 found its row had sat on a fixture since D196).
3. ⚠️ Mutate your central new arm to its NEAREST WRONG SIBLING and check something
   OTHER than a census suite goes red. Six slices running; report the blind list.
4. ⚠️ **Measure what any anchor generalisation would claim over all 640 rows**
   (D472; twice at D473; again at D475). If it claims the same rows, the generality
   is pure risk. **And for every op a widened anchor would newly admit, check
   `describeBranch`/`describeCondition` has a phrase for it** (D473).
5. Hand-authored mutant rows for everything. `expectKilledBy` names your suite;
   `find` occurs exactly once; a `survives` row still needs `expectKilledBy`; any
   `equivalent` row must state WHICH KIND of disjointness. **Do not author a row
   whose mutation cannot change an answer** (D475).
   🆕 ⚠️ **If you make any field REQUIRED, that is a corpus-wide edit** (D476): a
   dependent row's `replace` that omits it does not compile and reports **ERROR**,
   which `precheck` cannot see — it gates `find` only. Read every dependent
   `replace` by hand.
6. Step the engine version only if `packages/engine` behaviour moved.
7. Census pins if you built a sentence. **Derive the tax shape; do not carry it** —
   it has been `-1`/`-2`, `-2`/`-2`, `-1`/`-2`, `-1`/`-1`, `-1`/`-1` over five
   slices. ⚠️ **`BUILT.attack` is a RECORDED CONSTANT the chains subtract FROM —
   bump it FIRST** (D449). `units - built` is **394**;
   `BUILT.ability + BUILT.trainer + BUILT.specialEnergy` **STAYS 405**. There is a
   `Math.round` percentage no grep finds; derive it.
8. `bun scripts/opaque-anatomy-gate.ts` must still pass — report its line.
9. `scripts/residue-census-gate.ts` holds no literals of its own.

## Gates before you report

  - `bun run check` GREEN — exact counts, delta re-derived by counting `it(` at HEAD
    versus now.
  - `bun scripts/mutation/precheck.ts` clean — corpus total **and the
    `patches LITERALLY (N row(s))` count**, currently **15**.
  - `bun scripts/residue-census-gate.ts` OK — §A triple.
  - `bun scripts/opaque-anatomy-gate.ts` OK — its line.
  - `bun scripts/mutation/run.ts --decision D477 --allow-dirty` — MANDATORY flag.
    Row count three ways. Report killed / survivor / GAP **and `error(s)`** exactly.
  - `--only D275-engine-version-drifts-again --allow-dirty` if you bump the version.
    🛑 **`--only` does NOT accumulate.**
  - find-vs-replace diff over your new rows.
  - attribution control on your central row: by hand, each killer ALONE, restore in
    a `finally`, verify by size AND sha256. 🛑 **Python's `str.replace` REJECTS a
    function second argument** — `find`-split + join with `len(parts) == 2`.

## 🛑 The operator rule

**NEVER write to the tree while the harness is in flight.** D475 caused a CLOBBER
this way and paid a round; D476 was interrupted mid-probe by a shell `timeout`,
verified tree integrity by size + sha256 on every survivor-housing source file
before doing anything else, and re-probed the interrupted decision alone — **that is
the correct response.** Sequence your edits and your probes; never overlap them.

## For my sweep prediction

Report `+K killed, +S declared survivors` — exact, and **name `0 error(s)`
explicitly** rather than folding it into a killed-plus-survived total (D476: ERROR
rows fall outside both terms).

⚠️ **Report `git diff --numstat` per file for every file with deletions.** Declared
survivors, measured from the module: `interpreter.ts` 12, `effects.ts` 10,
`attack.ts` 7, `continuous.ts` 5, `flow.ts` 2, `redact.ts` 1, `GameHud.tsx` 1,
`splice-gate.ts` 1 — **39 total**. Name every deleted line in any of those eight and
say whether a survivor's reason touches it.

## Hard rules

  - DO NOT COMMIT. DO NOT `git add`. DO NOT run a whole-corpus sweep. Leave the tree
    dirty and NAME every untracked path.
  - NEVER `git stash`, `git checkout --`, `git reset --hard`, or any wholesale
    working-tree mutation.
  - Never `String.replace(find, replacementString)` with a replacement read from a
    file.
  - Encode first, write second, inside `try/finally`.
  - Temp files in $CLAUDE_JOB_DIR/tmp, never /tmp.
  - Do not commit or delete `tmp/mutation-journal.json.clobbered-*` — D475's
    evidence, gitignored.

## Report back

Which row(s) you built and why; **whether my hypothesis survived, and what killed
it if not** — that is the most useful thing in your report; what you left and its
price in one of D469's three shapes; **every place this brief was wrong**, assuming
at least one; the gates verbatim; the per-file numstat for deletions; and the corpus
delta.
