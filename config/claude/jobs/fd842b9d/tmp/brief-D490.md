# D490 — work order

## The target

**`censusAttackCorpus.ts` file line 130, 1 sentence / 2 legal printings:**

> *"Discard the top card of each player's deck. This attack does 140 more damage for each
> Energy card discarded in this way."*

This is now the **last unbuilt member of the `discarded in this way` family**. D489's report
names its price as *"a both-decks recording mill (`discardDeckTop.whose` has no 'each player'
member) **plus** the additive `damageDefender.base` path"*, and it is pinned as the standing
refusal in `discardScaledDamage.test.ts` §1.

## ⚠️ THAT RECORDED PRICE IS WRONG IN ITS SECOND HALF, AND I VERIFIED IT BEFORE WRITING THIS

**The additive path already ships and is in production use.** Witnesses, all read out of the tree
at `1f253667` — check each yourself, but they are not guesses:

- `damageDefender`'s scaled arm declares **`base?: number`** (`effects.ts` ~5299), alongside
  `per`, `count: EffectSlot` and D488's `countFilter`.
- `interpreter.ts:1891` **consumes it**:
  `op.amount ?? (op.base ?? 0) + scoredSlot(record, state, op.count, op.countFilter) * op.per`.
- It has **real producers**: `benchDiscardBoost.test.ts` asserts
  `{ op: "damageDefender", base: 50, per: 60, count: "discarded" }` and two siblings, i.e. the
  *"…does 60 **more** damage for each card you discarded in this way"* family already rides it.
- It arrived in commit `8dca7089` — *"the additive fold keeps its base, so the sum must be one hit"*.

**So `more damage` is not a blocker for this sentence.** 🛑 **This is the fourth slice running where
an inherited price named something already paid** (D486, D487, D488's `damageChosen` half, and now
this). **Re-derive the whole price before you accept any part of it, including the half I just
told you is wrong** — I may be wrong in the other direction.

## What you must do FIRST

**Derive build state programmatically off `attackReaderSurface()`'s 13 `deriveAttack*` exports** —
never `programFor` (D480/D482). Report the 13/13 result and both splitters verbatim.

**Then run the AXIS-DELETION LATTICE (D489-i), not the axis list.** Substitute each axis onto its
nearest **BUILT** spelling rather than deleting it, so no point is refused merely for not being a
sentence. Report the full table by Hamming weight, as D489 did. The axes I can see are:

1. **the both-decks mill** — *"the top card of **each player's** deck"* vs the shipped
   `whose: "self" | "opponent"`;
2. **the ownerless filter** — *"for each Energy card **discarded**"*, with **no "you"**, where
   D488's built pair says *"you discarded"*. **Does the count include the OPPONENT's discarded
   card?** That is a rules question with a damage number attached, and it is the one I would most
   expect a suite to get wrong;
3. **the additive connective** — *"**more** damage"* (see above: probably already free);
4. **the count** — one card per player, not N.

**Count the axes from the PRINT, not from this list** — D489's brief named four and the sentence
had five.

**Then count WITNESS LOAD (D487-ii / D488) and divide by the rows it frees.** `discardScaledDamage`
§1 holds the standing refusal; `deckTopMill`, `benchDiscardBoost` and `deckMillFilteredScale` are
all plausible and all must be checked rather than assumed. Note whether the witness is held by
predicate (amortising) or by quoted sentence (not).

## The design questions

1. **How is "each player's deck" spelled?** A third `whose` member (`"eachPlayer"`), two sequential
   ops, or something else? ⚠️ **Ask what the RECORD does under each** — the scaling clause counts
   across both decks, so two sequential `discardDeckTop`s filing into one slot must not overwrite
   (**D458 measured that two sequential recorders overwrite one slot**, and D489 leaned on it).
   That may decide the question on its own. Price both, in sites.
2. **Whose cards does the tail count?** Drive it. A board where only the OPPONENT's discarded card
   is an Energy separates the readings by a whole 140.
3. **Does an empty deck on either side change the count, the damage, or neither?** D455 has a row
   about the mill announcing an empty deck; check it still holds and re-probe it.
4. **`MATCH_RECORD_VERSION`.** D487's rule: adding vocabulary is a widening and cannot force a bump;
   a bump needs a RESHAPE of something already persisted. **Re-derive at the hard address anyway**
   and drive a v29 record that answers a *different number* if you get it wrong.

## Obligations — discharge them, do not assert them

- 🛑 **THE DESCRIBER.** Do **not** argue from whether an op parks — that is the category argument
  D478 forbids and my briefs have made it two slices running, wrong both times. `withConsequence`
  returns the prompt unchanged unless the QUEUE holds a `recordGate` on the filed slot. **Trace the
  one call site and report what you found**, empty or not.
- **THE CENSUS.** Break the central arm at its nearest wrong sibling and report which suites go red.
  🛑 **If `censusAtHead` stays GREEN, say so and treat it as the finding** (D489/D469): a census
  measures whether a sentence is CLAIMED, never whether it is claimed CORRECTLY.

## Boards (D488-ii / D489)

Enumerate every candidate reading and **count how many each board separates before choosing one**.
⚠️ Watch for algebraic identity on the natural board: with one card off each deck, *"count both"*,
*"count mine"* and *"count theirs"* collapse whenever the two cards match in kind — so **the decks
must differ at the top**, and at least one board must have exactly one of the two be an Energy.
⚠️ **A candidate no board separates by quantity is separated by CONTENTS** — assert which pile each
card landed in, not only the damage.

## Hard rules — read these as written

- **Do NOT commit, do NOT `git add`, do NOT run a whole-corpus sweep.** A `--decision D490
  --allow-dirty` probe of your own rows is expected; report it with the row count derived three ways.
- **`docs/` is UNTOUCHED. Do not run the end-of-session ritual.** 🛑 **`ARCHIVES` in
  `progressLog.test.ts` is the RITUAL's and belongs to the caller — leave that file byte-unchanged.**
- **Never `git stash` / `git checkout --` / `git reset --hard`.** Never write to the tree while the
  mutation harness is in flight.
- Temp files in `$CLAUDE_JOB_DIR/tmp` only.
- `--allow-dirty` MANDATORY on a dirty tree; `--decision` matches by `String.includes`; **`--only`
  does NOT accumulate.**
- ⚠️ **A `replace` omitting a REQUIRED field reports ERROR — `precheck` gates `find` only.**
- ⚠️ **The census tax lands in WAVES** (D487 five, D488 four, D489 four) because an earlier failing
  `expect(` masks later ones in the same `it`. **Bump `BUILT.attack` FIRST** (D449). ⚠️ **If the
  sentence and printing deltas DISAGREE, `.length` sites and `units(…)` sites take different
  numbers** (D489). ⚠️ **A `Math.round` numerator has a SOLUTION SET** — derive it by intersecting
  the green ranges at both denominators (D488), never edit it blind because the rung is green.
- 🛑 **EVERY COUNTING INSTRUMENT NEEDS ITS SCOPE CHECKED BEFORE ITS NUMBER IS QUOTED** (D489).
  `git grep` sees only TRACKED files and your new suite is untracked, so it under-counts the version
  tax by exactly your suite's contribution; `grep -c 'it('` counts lines containing the substring
  including prose, where `grep -cE '^\s+it\('` agrees with vitest. **Say which instrument you used**,
  and re-derive the version tax and its exception list rather than inheriting them.
- Attribution control by hand: nearest wrong sibling, each killer alone, restore in a `finally`,
  verify size **and** sha256.

## Report back

Build state off the right oracle. The axis-deletion lattice by Hamming weight. **Whether my
correction above is right, and whether the remaining price is what I said** — assume at least one
error in this brief and name it. Witness load, counted and divided. The candidate readings and how
many each board separates. The record-overwrite question under two sequential mills. The describer
obligation, traced. What you built; what you left and its price. The gates verbatim. The per-file
numstat for deletions. The corpus delta and a sweep prediction with its arithmetic shown.
