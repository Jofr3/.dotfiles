# D494 — work order

## The target

**`censusAttackCorpus.ts` row 337 — 1 sentence / 1 legal printing:**

> *"If you have 3 or more Energy in play, this attack does 70 more damage. This attack's damage
> isn't affected by Weakness."*

## ⚠️ FIRST — an inherited claim that is FALSE, and I checked it

D493's report priced this row as *"one anchor and one `BoardCondition` away"* and said **"no reader
takes an in-play Energy threshold as a bonus antecedent."* **That second half is wrong.** Measured
at `db335817`:

| spelling | verdict |
|---|---|
| *"If you have **at least 3 {D}** Energy in play, this attack does 50 more damage."* | **BUILDS** — `deriveAttackDamageBonus` |
| *"If you have **3 or more {D}** Energy in play, …"* | REFUSED 13/13 |
| *"If you have **at least 3** Energy in play, …"* (untyped) | REFUSED 13/13 |
| *"If you have **3 or more** Energy in play, …"* (**row 337's head**) | REFUSED 13/13 |
| row 337 in full | REFUSED 13/13 |

**An in-play Energy threshold condition SHIPS.** The shipped anchor demands **both** the *"at
least N"* quantifier **and** a type token. Row 337 differs on **both** head axes, plus the tail.

🛑 **This is the fifth consecutive slice where an inherited price named something already built or
mis-stated a blocker.** Re-derive everything below; treat my table as a hypothesis with a citation,
not as fact.

## The corpus context, measured

**Two** corpus rows carry an Energy-in-play threshold — the built typed one above (1p) and row 337
(1p). Nine rows open *"If you have …"* / 16 printings; the other seven build. So the `If you have`
frame is well served and this row is the outlier inside it.

## What you must do FIRST

1. **Build state programmatically** for row 337 and for every string in my table. Report 13/13 and
   all four splitters verbatim.
2. 🛑 **THE AXIS-SUBSTITUTION LATTICE, IN BOTH DIRECTIONS** (D489-i, D492's correction, D493's
   method). Substitute each axis onto its nearest **BUILT** spelling; report by Hamming weight.
   ⚠️ **Vary the segment you KEEP as well as the one you cut** — D493 found the shipped family idiom
   that way (a head refused alone whose compound builds). ⚠️ **An axis whose printed value already
   builds is not an axis** (D491), and **count the axes from the PRINT** — five consecutive briefs
   of mine have undercounted. The axes I can see are QUANTIFIER (`3 or more` vs `at least 3`), TYPE
   (untyped vs `{D}`), and TAIL (the Weakness suppression). **Expect at least one more.**
3. 🛑 **PRICE EACH BRANCH ALONE AS WELL AS TOGETHER** (D493's rule, learned the hard way last
   slice). Widening the quantifier, widening to untyped, and pairing with the suppression tail may
   each free **0/0** on their own. **Compute each branch's payoff over the whole corpus separately
   before comparing** — a branch with an empty solo payoff is a prerequisite, not half a slice.
4. 🛑 **BEFORE BUILDING ANY WIDENING, GREP THE MUTANT CORPUS FOR THE ROW WHOSE `replace` IS THAT
   WIDENING** (D493's finding: the composition branch it was pricing already existed verbatim as
   `D409-tail-guard-widened-to-any-reader`, with the defect in its own `what`, and building it would
   have disarmed the tripwire describing it). **The needle is the code line, not a decision
   number.** Run the tripwire audit over all 2,379 rows from the module and report what rests on
   this refusal.
5. **Witness load, counted and divided**, each site classified predicate-held or sentence-quoting.
   🛑 **Verify every quoted specimen IS a row of `legalAttackCorpus()`** at its committed printing
   count (D490's phantom specimen).

## The design questions

1. **Is the quantifier a vocabulary widening or a second anchor?** ⚠️ D472's discipline applies:
   measure whether the wider spelling claims any sentence the tight one does not. If *"3 or more"*
   and *"at least 3"* are synonyms over the whole corpus, say so with the count.
2. **Does untyped mean "any Energy" or is it a different count?** Drive it. `countEnergyInPlay`
   exists and D470 gave it an optional filter — check whether the untyped case is the filter's
   absence or a distinct predicate, and what board separates them.
3. **The suppression tail: does D493's idiom apply?** D493 shipped a whole-sentence anchor read by
   **two** readers, because `attack.ts` hands `effect` to all five damage readers, so a two-seam
   sentence costs one constant and **zero caller bytes**. ⚠️ **Check whether that transfers here** —
   D493's head was claimed by the *multiplier*; row 337's is claimed by the *bonus* reader, which
   may or may not be handed the same string. **Do not assume it transfers; trace the caller.**
4. **`MATCH_RECORD_VERSION`.** Re-derive at the hard address and **say WHICH argument you use** —
   D493 used no-carrier and named it before making it, explicitly rejecting reachability as the
   wrong shape. Drive a v29 record answering a *different number* if the argument needs it.

## Obligations

- **THE DESCRIBER: trace the call site.** Seven consecutive slices a brief predicted describer work
  and it was empty. Report the trace either way. ⚠️ **And check `log.ts`** — D493 found that was the
  surface that actually moved, and rendered it.
- **THE ATTRIBUTION CONTROL AT BOTH LAYERS** (D491/D492/D493), each killer alone, restored in a
  `finally`, size **and** sha256 verified. **Name which layer each witness covers.** 🆕 **And note
  D493's new finding: a dual-claim POPULATION rung is blind to correctness** — it asserts how many
  readers claim, never what they answer. If you write one, say what it does not cover.

## Hard rules — read these as written

- **Do NOT commit, do NOT `git add`, do NOT run a whole-corpus sweep.** A `--decision D494
  --allow-dirty` probe is expected; row count derived three ways.
- **`docs/` is UNTOUCHED. Do not run the end-of-session ritual.** 🛑 **`ARCHIVES` in
  `progressLog.test.ts` is the RITUAL's — leave it byte-unchanged and verify by sha256.**
- **Never `git stash` / `git checkout --` / `git reset --hard`.** Never write to the tree while the
  harness is in flight.
- Temp files in `$CLAUDE_JOB_DIR/tmp` only.
- `--allow-dirty` MANDATORY on a dirty tree; `--decision` matches by `String.includes`; **`--only`
  does NOT accumulate.**
- ⚠️ **A `replace` omitting a REQUIRED field reports ERROR — `precheck` gates `find` only.**
- 🛑 **A BARE `toBe(N)` REPLACEMENT IS NOT SAFE FOR SMALL LITERALS** (D492): it hit 7 sites in 6
  files, and **the obvious repair is NOT an inverse** — it broke 9 pre-existing assertions in one
  command. **Patch BY LINE NUMBER from `git diff -U0`**, and **undo LINES, never VALUES**. ⚠️ **The
  suite stays GREEN through such an over-patch**; only the diff shows it.
- ⚠️ **Census tax in WAVES.** Grep the OLD VALUES as bare tokens first, **counting MATCHES not
  LINES** (D491). **Bump `BUILT.attack` FIRST** (D449). 🆕 **A marker occurring TWICE PER LINE must
  be spliced at a column-asserted occurrence** (D463/D493). Check whether the sentence and printing
  deltas agree — this row is 1/1, so probably; verify. ⚠️ **A `Math.round` numerator has a SOLUTION
  SET.**
- 🛑 **STATE THE COMMAND YOU USED FOR EVERY COUNT.** `git grep` misses your untracked suite;
  `grep -cE '^\s+it\('` agrees with vitest where `grep -c 'it('` does not. **Re-measure the version
  tax AND its exception list after the edit** — the list has grown from the edit's own additions on
  four separate slices now. ⚠️ **The next bump's inherited exception list is ONE**; re-derive it.
- ⚠️ **A moved gate population must be VERIFIED, not accepted** (D492/D493). `patches LITERALLY` is
  **22**; the criterion is a `String.replace` special (`$$`, `$&`, `` $` ``, `$'`, `$n`, `$<name>`),
  **not a bare `$`**, which over-counts ~10×.

## Report back

Build state for every string in my table, re-derived — **including whether my correction of D493's
claim is itself right.** The lattice by Hamming weight, both directions, axes counted from the print.
Each branch's solo payoff and the combined payoff, measured over the corpus. The tripwire audit,
including any mutant row that already spells a widening you considered. Witness load, counted and
divided, every specimen verified. The three design questions answered with measurements. The
describer trace and the `log.ts` check. The attribution control at both layers with the layer map.
What you built; what you left and its price. **Every place this brief was wrong — assume at least
one, and say which of my claims were hedged and which were confident.** The gates verbatim. The
per-file numstat for deletions. The corpus delta and a sweep prediction with its arithmetic shown.
