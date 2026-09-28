# D485 — two heads already build; the tails are the question

Repo: /home/jofre/projects/luminous_ui  (branch main, tree CLEAN at 3b6124de)

## Read first

  - `scripts/autoloop/prompt.md`
  - the `## NEXT (resume point)` block in `docs/progress.md` (after D484) —
    **sections (4)–(7).**
  - `packages/engine/src/refusedPrintings.ts` before pricing anything (D480).
  - the `| **D482** |`, `| **D483** |` and `| **D484** |` rows in
    `docs/decisions.md`.
  - `docs/conventions.md` — ⚠️ **~6,000 lines; do NOT read end to end.** Read the
    heading index, then these **by title**:
      · *"\"Does the op exist?\" is checkable; \"does a composition of shipped ops spell it?\" is not"*
      · *"The arithmetic-coincidence class applies to designs, not only to assertions"*
      · *"A shared printed word is not a shared blocker"*
      · *"A refusal carries two claims with two different oracles — check build state first"*
      · *"A rung that tests two fields at once cannot prove either"*
      · *"Ask what the instrument assumes about itself that nothing asserts"*
      · *"A refusal witness is a tripwire whose blast radius is the whole family"*

## State

RESIDUE **98 / 137**. Gate §A **124/98/137**. `OPAQUE` **67/98**, `COMPOUND-head`
**10/11**, `COMPOUND-tail` **2/4**, `SUBST-2` **3/4**, `PHRASE-1` **4/5**. Corpus
**2,280**, engine **0.379.0**, `MATCH_RECORD_VERSION` **29**, `ARCHIVES` **154**
(🛑 RITUAL's). `BUILT.attack` **1595**, `units - built` **383**,
`BUILT.ability + BUILT.trainer + BUILT.specialEnergy` **405**. Survivors **42 across
nine files**. `patches LITERALLY` **21**; `precheck` also now reports experiment
identity with a near-miss population of **8**.

## Two candidates, both with their HEAD already built

Verbatim from `bun scripts/residue-census.ts`, `── COMPOUND-head ──`:

**(A)** 1 printing
> *"Your opponent reveals their hand. Discard all Item cards and Pokémon Tool cards
> you find there."*
> `KEPT ✅ builds: "Your opponent reveals their hand."` →
> `[{"op":"revealOpponentHand"}]`
> `CUT 🛑 does NOT build: "Discard all Item cards and Pokémon Tool cards you find there."`

**(B)** 1 printing
> *"Your opponent's Active Pokémon is now Confused. Put 8 damage counters instead of
> 3 on that Pokémon for this Special Condition."*
> `KEPT ✅ builds: "…is now Confused."` →
> `[{"op":"applyStatus","target":"defender","status":"confused"}]`
> `CUT 🛑 does NOT build: "Put 8 damage counters instead of 3 …"`

⚠️ **D466 measured that *"build the head and the row leaves"* is FALSE for several
`COMPOUND-head` rows. Check whether either of these is one of them before starting**
— if so, say so; that is a finding, not a failure.

## What to do, in order

1. **Build state with the RIGHT oracle** (D480/D482): the 13 readers from
   `attackReaderSurface()`, run programmatically, not `programFor`.
2. **Ask the composition question and DRIVE it** (D482). For **(A)**: does a
   filtered discard from the opponent's hand compose from shipped ops?
   `opponentDiscardsFromHand` ships (D426) — **check whether it takes a filter or
   only a count**, and whether `CardFilter` can already say *Item* and *Pokémon
   Tool* (`Card.category` and `trainerType` are both real `cardSchema` columns, so
   D468's schema test should pass — **verify that**). For **(B)**: the Confused
   damage is a rules constant; check where it lives and whether anything already
   parameterises it.
   🛑 **And apply D483's counterweight: a composition that matches on the boards you
   happen to build is not a composition that matches.** If a shipped op is
   *byte-identical in effect* to the right answer on the boards you would naturally
   write, name the board where they differ — or say you could not.
3. **Take whichever is genuinely cheapest**, or something else from the instruments
   if both are dear. Say why. **A well-argued switch is the deliverable.**

## Requirements

1. Build it properly; the op must MEAN something on a real board.
2. New vitest suite, behavioural. **For (A)** the load-bearing board has a hand
   mixing Items, Tools and non-matching cards, so *discard-everything*,
   *discard-items-only* and *discard-nothing* are three distinguishable answers —
   ⚠️ **and compute what each candidate would answer BEFORE choosing the hand**, so
   no two collide (D482: a section went silently vacuous because two readings gave
   byte-identical boards, and **the symptom was a control passing**). **For (B)**
   the board must distinguish 8 counters from 3 *and* from the unmodified rule.
   Include a ZERO-MATCH board with controls separating it from
   silence-for-another-reason. Prefer a file-local `cardPool` (D414); check first
   whether either sentence is already fielded as a refusal witness (D475) — and
   expect re-pointing it to be part of the work if so.
3. ⚠️ Mutate your central arm to its NEAREST WRONG SIBLING; something OTHER than a
   census suite must go red. Eleven slices running.
4. ⚠️ **Measure what any generalisation claims over all 640 rows** (D472); an
   override is legitimate only as a recorded rung (D477). **Describer obligations
   follow the CALL PATH** (D478) — ⚠️ **and (B) is a Special-Condition rule change,
   so check whether any HUD or projection surface renders that constant.**
5. Hand-authored rows for everything. **Read each row's `what` against its `replace`
   BEFORE probing**, and ⚠️ **make every discriminating rung differ from its control
   in exactly ONE axis** — D484's own guard shipped a two-axis rung that survived
   its mutant.
6. Step the engine version only if `packages/engine` behaviour moved. Decide
   `MATCH_RECORD_VERSION` (29) and STATE which argument.
7. Census pins if you built a sentence. **Derive the tax shape.** ⚠️ **`BUILT.attack`
   is a RECORDED CONSTANT the chains subtract FROM — bump it FIRST** (D449).
   ⚠️ **MEASURE the `Math.round` numerator** — it crossed to 18 at D483.
   ⚠️ **Version tax is 58 assertions / 75 sites / 58 files / 14 titles; you inherit
   59 / 77 / 59 / 15.**
8. Both instrument gates must still pass — report their lines.

## Gates before you report

  - `bun run check` GREEN — `typecheck-coverage` line too; counts re-derived by
    counting `it(` at HEAD vs now, **explaining any discrepancy**.
  - `bun scripts/mutation/precheck.ts` clean — corpus total, `patches LITERALLY`,
    **and the experiment-identity near-miss count (8 at HEAD — if it moves, read the
    rows rather than the number)**.
  - `bun scripts/residue-census-gate.ts`, `bun scripts/opaque-anatomy-gate.ts`.
  - `bun scripts/mutation/run.ts --decision D485 --allow-dirty` — MANDATORY flag,
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

Which you took and **why, with build state stated first and the composition check
second**; whether either row is one of D466's *"building the head does not free the
row"* cases; what you built; what you left and its price; **every place this brief
was wrong**; the gates verbatim; the per-file numstat for deletions; and the corpus
delta.
