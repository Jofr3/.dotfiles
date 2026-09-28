# D488 — mill, then scale by what was milled: two rows, one shape

Repo: /home/jofre/projects/luminous_ui  (branch main, tree CLEAN at c5db916f)

## Read first

  - `scripts/autoloop/prompt.md`
  - the `## NEXT (resume point)` block in `docs/progress.md` (after D487) —
    **sections (4)–(7).**
  - `packages/engine/src/refusedPrintings.ts` before pricing anything (D480).
  - the `| **D487** |` and `| **D473** |` rows in `docs/decisions.md`.
  - `docs/conventions.md` — ⚠️ **~6,000 lines; do NOT read end to end.** Read the
    heading index, then these **by title**:
      · *"Price by witness load, not only by mechanism"*
      · *"Adding vocabulary is always a widening, so a residue row is essentially never blocked by a schema version"*
      · *"The corpus is blind to design equivalence and sharp on behavioural regression"*
      · *"Two candidate programs can agree by ARITHMETIC IDENTITY on every board"*
      · *"\"Does the op exist?\" is checkable; \"does a composition of shipped ops spell it?\" is not"*
      · *"Confidence in a brief is not evidence, and the hedged claims are the derived ones"*
      · *"A green run after fixing one site is evidence the runner stopped early"*

## State

RESIDUE **95 / 134**. Gate §A **121/95/134**. `OPAQUE` **67/98**, `COMPOUND-head`
**8/9**, `COMPOUND-tail` **2/4**, `SUBST-2` **3/4**, `PHRASE-1` **4/5**, plus seven
single-row `PHRASE-*` classes. Corpus **2,301**, engine **0.382.0**,
`MATCH_RECORD_VERSION` **29**, `ARCHIVES` **157**. `BUILT.attack` **1598**,
`units - built` **380**, `BUILT.ability + BUILT.trainer + BUILT.specialEnergy`
**405**. Survivors **42 across nine files**. `patches LITERALLY` **21**; near-miss
**8**. Version tax: successor inherits **61 / 81 / 61 / 17**.

## The pair

Two residue rows share one shape — **mill N from your own deck, then scale damage
by a FILTERED count of what was milled**, both using the §9.2 *"in this way"*
anaphor. Verbatim from `bun scripts/residue-census.ts`:

**(A)** `PHRASE-15`, 1 printing
> *"Discard the top 3 cards of your deck, and this attack does 80 damage for each
> Energy card you discarded in this way."*
> `KEPT builds: "Discard the top 3 cards of your deck."` →
> `[{"op":"discardDeckTop","whose":"self","count":3}]`

**(B)** `PHRASE-16`, 1 printing
> *"Discard the top 7 cards of your deck, and this attack does 70 damage for each
> Misty's Pokémon that you discarded in this way."*
> `KEPT builds: … count:7`

**My read, and I am flagging it as unverified** (D487: the hedged claims are the
derived ones, and my confident ones have been wrong five slices running): the head
ships, the §9.2 *"in this way"* machinery ships (`recordGate` / `recordAs`, D473),
and `CardFilter` can likely already say both *"Energy card"* and an owner-prefixed
Pokémon — so the blocker may be a **damage count source that reads a record slot**,
which the count-source union may or may not have.

⚠️ **Verify all of that. In particular:**
  - **Do they actually share one blocker?** D483's four-row cluster split 2+2 under
    axis deletion. **Delete each axis in turn and re-ask the readers** — the filter,
    the *"in this way"* anaphor, the scaling — and report whether one mechanism
    serves both or this is two slices.
  - The two filters are different in kind (a **category** vs an **owner-prefixed
    name**). One may ship and the other not.
  - ⚠️ **Count the WITNESS LOAD for each before pricing** (D487): how many
    refusal-witness files name each sentence. That is the cost that has been
    mispriced repeatedly, and it decided D487's choice.

## What to do, in order

1. **Build state with the RIGHT oracle** — the 13 readers from
   `attackReaderSurface()`, programmatically; not `programFor` (D480/D482).
2. **Axis-delete to test whether the pair is really a pair** (D483).
3. **Drive the composition question** (D482): can either be spelled by shipped ops?
   ⚠️ **With the counterweight in its strongest form** (D486): two candidates can
   agree by **arithmetic identity** on every board, in which case the separating
   axis is not a quantity — parking, prompting, ordering, log text. **Name the board
   where candidates differ, or say you could not.**
4. **Take whichever subset is coherent.** If only one is cheap, build that and price
   the other. **A partial with an accurate price beats a forced pair.**
5. 🛑 **Do not defer anything for a `MATCH_RECORD_VERSION` cost without re-deriving
   it** — D487 measured **zero of 96** residue rows blocked only by a version
   change, and the reason is structural: adding vocabulary is always a widening. The
   only door is a repair that RESHAPES a durated record, and the test is whether the
   sentence prints a **duration or a schedule**. These two do not.

## Requirements

1. Build it properly; the op must MEAN something on a real board.
2. New vitest suite, behavioural. ⚠️ **For a milled-count scaler the load-bearing
   deck is stacked so that *count-everything*, *count-matching*, *count-nothing* and
   *count-the-whole-discard-pile* give four different damages** — the last matters
   because a build that counts the discard pile rather than the record passes any
   board with an empty pile. **Compute what each candidate answers BEFORE choosing
   the deck**, so no two collide (D482/D486/D487 — at D487 five readings collided at
   one depth and the file needed two decks). Include a ZERO-MATCH board with
   controls separating it from silence-for-another-reason. Prefer a file-local
   `cardPool` (D414).
3. ⚠️ Mutate your central arm to its NEAREST WRONG SIBLING; something OTHER than a
   census suite must go red. Fourteen slices running.
4. ⚠️ **Measure what any generalisation claims over all 640 rows** (D472).
   **Describer obligations follow the CALL PATH** (D478) — ⚠️ **and a §9.2 record
   gate is exactly the shape that DOES reach the describers**, so check.
5. Hand-authored rows for everything. **Read each row's `what` against its
   `replace` BEFORE probing**; **every rung differs from its control in exactly ONE
   axis** (D484); **a rung passing is not evidence it still tests its stated claim**
   (D486).
6. Step the engine version only if `packages/engine` behaviour moved. Decide
   `MATCH_RECORD_VERSION` (29) and STATE which argument, **at the hard address if
   there is one** (D487).
7. Census pins if you built a sentence. **`BUILT.attack` is a RECORDED CONSTANT the
   chains subtract FROM — bump it FIRST** (D449). **MEASURE the `Math.round`
   numerator.** ⚠️ **Expect the census tax in WAVES** — D487 took five rounds
   because an earlier failing `expect(` masks later ones in the same `it`; **a green
   run after fixing one site means the runner stopped early.**
8. Both instrument gates must still pass — report their lines.

## Gates before you report

  - `bun run check` GREEN — `typecheck-coverage` line; counts re-derived by counting
    `it(` at HEAD vs now, **explaining any discrepancy**.
  - `bun scripts/mutation/precheck.ts` clean — corpus total, `patches LITERALLY`,
    **and the near-miss count (8)**.
  - `bun scripts/residue-census-gate.ts`, `bun scripts/opaque-anatomy-gate.ts`.
  - `bun scripts/mutation/run.ts --decision D488 --allow-dirty` — MANDATORY flag,
    row count three ways, killed / survivor / GAP **and `error(s)`**.
  - `--only D275-engine-version-drifts-again --allow-dirty` if you bump the version.
    🛑 **`--only` does NOT accumulate.**
  - attribution control: by hand, each killer ALONE, restore in a `finally`, verify
    by size AND sha256. 🛑 **Python's `str.replace` REJECTS a function second
    argument.**

## 🛑 Hard rules — the full list

  - **DO NOT COMMIT. DO NOT `git add`. DO NOT run a whole-corpus sweep.**
  - 🛑 **DO NOT run the end-of-session ritual — it belongs to the caller.** Leave
    `docs/progress.md`, `docs/decisions.md`, `docs/conventions.md` **untouched**, and
    do NOT step `ARCHIVES` in `progressLog.test.ts`.
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

Build state first; **whether the two rows share one blocker, tested by axis
deletion**; the composition check and the board that separates candidates; **the
witness load for each row**; what you built; what you left and its price; **every
place this brief was wrong** — assume at least one, and note which of my claims
were hedged; the gates verbatim; the per-file numstat for deletions; and the corpus
delta.
