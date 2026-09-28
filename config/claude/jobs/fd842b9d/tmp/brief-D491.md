# D491 — work order

## The target

**`censusAttackCorpus.ts` file line 199, 1 sentence / 1 legal printing:**

> *"Each player draws 3 cards."*

## What is recorded about it, and why you must not trust it

The resume point prices this as *"a mandatory opponent draw (`opponentMayDraw` ships but is a MAY,
parks, and the opponent answers — separable on any board where they decline) plus a six-file witness
re-point and a park/no-park design call."*

🛑 **Five consecutive slices (D486–D490) found an inherited price naming something already built, and
at D490 my own correction of the price was ALSO half-stale.** D490's family had **zero mutant rows
across 87 decisions** and its recorded refusal had been false for two slices, because nothing in the
corpus rested on it and so nothing forced a re-derivation. **Re-derive this refusal from source
before you price anything against it**, and run the same tripwire audit D490 ran: grep all ~2,349
rows for needles naming this sentence, and report whether any row rests on the refusal.

## What I verified myself, at `fcf1449e` — check each, they are not guesses

- **`drawCards` has NO seat axis**: `{ op: "drawCards"; count: number; recordAs?: EffectSlot;
  from?: "bottom" }` (`effects.ts:5560`). It is the controller's draw.
- **`opponentMayDraw { count: number }`** (`effects.ts:9745`) — opponent-only, and a MAY.
- **`handRefresh` ALREADY HAS A BOTH-SEATS AXIS**: `who: "you" | "both" | "opponent"`
  (`effects.ts:~9018`), with `"both"` documented as *"every seat (Judge, Iono)"* and the executor
  documented as *"already walks a seat LIST"* with *"every event it emits already per-seat and
  count-only"*. ⚠️ **But `handRefresh` moves the hand first** (it carries `toBottom?` and an
  `onlyIfAnyMoved?`), so it is a *refresh*, not a bare draw. **Whether it can express a
  no-shuffle draw is the first thing to check, and I do NOT know the answer.**
- 🛑 **D490 — ONE SLICE AGO — ADDED `"eachPlayer"` TO `discardDeckTop.whose` AND WALKED A SEAT LIST**,
  in a `switch` rather than a ternary. **That precedent is fresh, and it is a hazard as much as a
  help**: a same-shaped widening of `drawCards` may be right, or `drawCards`'s machinery may differ
  in a way that makes it wrong. Price it, do not assume it.

## What you must do FIRST

1. **Build state programmatically off `attackReaderSurface()`'s 13 `deriveAttack*` exports** — never
   `programFor`. Report 13/13 and all four splitters verbatim.
2. **The axis-substitution LATTICE (D489-i / D490)**, not the axis list: substitute each axis onto
   its nearest **BUILT** spelling rather than deleting it, run all 2ⁿ points × 13 readers, and report
   the table by Hamming weight. **Count the axes from the PRINT** — D489's brief named four and the
   sentence had five; D490's named four and it had five again. The axes I can see are the SEAT
   SCOPE (*"each player"*), the MANDATORY mood (no *"may"*), and the COUNT. **Expect at least one
   more that I have not named.**
3. **Is the row alone?** Check whether any other residue row refuses and builds on exactly the same
   axes — and note that **`SUBST-4` is a second "each player" sentence one slice after D490 built
   that walk for a mill**. If a third exists, the axis-deletion test decides whether they are one
   slice (D488) or several (D483).
4. **Witness load (D487-ii / D488 / D490)**, counted and divided by the rows it frees, with each site
   classified as predicate-held (amortises) or sentence-quoting (does not). The resume point claims
   **six files** — verify that number rather than inheriting it, and 🛑 **check every quoted specimen
   is a real row of `legalAttackCorpus()`**: D490 found a near-miss documented *"verbatim off the
   local D1"* carrying an **invented damage figure**, copied into two more files, with both its rungs
   green for two independent wrong reasons. **A byte pin measures an invention as faithfully as the
   truth.**

## The design questions

1. **Which op carries it?** `drawCards` widened with a seat axis, `handRefresh` with a no-move draw,
   a new op, or something else? ⚠️ **Ask what the PARK carries and what the EVENTS carry before
   pricing a union member** (D489): a both-seats draw emits per-seat rows, and D490 found the log
   renderer's voice hangs off `actor === seat` rather than the op's field — check whether that buys
   the second player's wording free here too.
2. 🛑 **THE DECK-OUT RULE, and I expect this to be the real content of the slice.** `flow.ts:65`
   ends the game with `reason: "deckOut"`. *"Each player draws 3 cards"* can empty **either or both**
   decks. D490 established that its both-decks mill ends the game **at the defender's next draw**,
   not on the spot. **Drive: who loses when the ATTACKER decks out on their own attack? When both do?
   What does §8.6's "do as much as you can" say about drawing 3 from a 1-card deck?** Report the
   rules citation you used, not a guess.
3. **Order.** Does the controller draw first? D490 found the two shipped both-seats precedents
   **disagree** — `counterEachAll` walks absolute `SEATS`, `handRefresh` walks controller-first — and
   the distinguishing axis was whether the op emits one event per BODY or one per SEAT. **Apply that
   test here rather than picking one**, and 🛑 **drive it from p2's chair**, because absolute-vs-
   controller ordering is inert on every board where p1 attacks.
4. **`MATCH_RECORD_VERSION`.** D487: adding vocabulary is a widening and cannot force a bump; a bump
   needs a RESHAPE of something persisted. D490's argument was REACHABILITY (D450/D465) and
   explicitly **not** "this byte already ships", which was false there. **Re-derive at the hard
   address** and drive a v29 record that answers a *different number* if you get it wrong.

## Obligations — discharge them, do not assert them

- 🛑 **THE DESCRIBER: trace the call site, never argue from the op's category.** A brief has predicted
  describer work from parking/§9.2 three slices running (D488, D489, D490) and the obligation was
  **empty all three times**. `withConsequence` needs `recordSlotOf(op)` defined **and** a `recordGate`
  on that slot in the queue. Report what the trace found.
- **THE ATTRIBUTION CONTROL.** Break the central arm at its nearest wrong sibling, each killer alone,
  restore in a `finally`, verify size **and** sha256. 🛑 **If `censusAtHead` stays green, that is the
  finding** (D469/D489) — and D490 went further: *all four* re-pointed family suites also stayed
  green, because their claims are about what the **reader** answers while the mutation was in the
  **assembler**. **Say which layer your witnesses actually cover.**

## Boards

Enumerate every candidate reading and **count how many each board separates before choosing**. D490
found seven readings where board A alone separated only six — the collision was the algebraic
identity, and the pair (A, B) was what gave seven distinct signatures. ⚠️ Here the obvious identity
is a board where **both players' decks and hands are symmetric**: *"each player draws 3"*,
*"you draw 3"* and *"your opponent draws 3"* are then indistinguishable by hand SIZE. **Make the
hands and decks asymmetric, and assert WHICH cards went to WHICH hand, by id** — a candidate no
board separates by quantity is separated by contents.

## Hard rules — read these as written

- **Do NOT commit, do NOT `git add`, do NOT run a whole-corpus sweep.** A `--decision D491
  --allow-dirty` probe is expected; report it with the row count derived three ways.
- **`docs/` is UNTOUCHED. Do not run the end-of-session ritual.** 🛑 **`ARCHIVES` in
  `progressLog.test.ts` is the RITUAL's and belongs to the caller — leave that file byte-unchanged
  and verify it by sha256.**
- **Never `git stash` / `git checkout --` / `git reset --hard`.** Never write to the tree while the
  mutation harness is in flight.
- Temp files in `$CLAUDE_JOB_DIR/tmp` only.
- `--allow-dirty` MANDATORY on a dirty tree; `--decision` matches by `String.includes`; **`--only`
  does NOT accumulate.**
- ⚠️ **A `replace` omitting a REQUIRED field reports ERROR — `precheck` gates `find` only.**
- ⚠️ **Census tax lands in WAVES** (D487 five, D488 four, D489 four, D490 three). **Cut it by
  grepping the OLD VALUES as bare tokens first** — D490 found 31 sites across 16 files in one pass
  that way; the runner is a one-throw-per-`it` instrument and a grep is not. **Bump `BUILT.attack`
  FIRST** (D449). ⚠️ **If the sentence and printing deltas disagree, `.length` and `units(…)` sites
  take different numbers** — this row is 1/1, so check whether they agree here. ⚠️ **A `Math.round`
  numerator has a SOLUTION SET** — derive it by intersecting the green ranges at both denominators.
- 🛑 **STATE THE COMMAND YOU USED FOR EVERY COUNT.** `git grep` sees only TRACKED files, so it
  under-counts the version tax by exactly your new suite's contribution — D489 wrote this convention
  and **D490's report made the identical mistake one slice later**, quoting a tracked-only occurrence
  count beside an untracked-inclusive file count. `grep -c 'it('` counts lines containing the
  substring including prose; `grep -cE '^\s+it\('` agrees with vitest. **Re-measure the version tax
  AND its exception list after the edit — never inherit either.** D489's exception list was one short
  because it quoted the arrow it was counting.

## Report back

Build state off the right oracle. The lattice by Hamming weight, with the axis count taken from the
print. Whether the recorded price survives re-derivation, and the tripwire audit result. Witness
load, counted and divided, with every specimen verified against the corpus. The deck-out answer with
its rules citation. The ordering question resolved by the emits-per-body-vs-per-seat test, driven
from p2's chair. The describer obligation, traced. What you built; what you left and its price.
**Every place this brief was wrong — assume at least one, and say which of my claims were hedged and
which were confident.** The gates verbatim. The per-file numstat for deletions. The corpus delta and
a sweep prediction with its arithmetic shown.
