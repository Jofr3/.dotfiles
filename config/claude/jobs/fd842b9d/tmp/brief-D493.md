# D493 — work order

## The target

**`censusAttackCorpus.ts` corpus row 529 — 1 sentence / 1 legal printing:**

> *"This attack does 10 damage for each damage counter on all of your Benched Cynthia's Pokémon.
> This attack's damage isn't affected by Weakness."*

It is a `COMPOUND-head` row, and it has been sitting in the residue since **D467**, which noted its
head had started building and called it *"the negative control arriving in the instrument unasked."*

## What I measured at `8f14d702` — re-verify each; my confident claims keep failing

Run programmatically (`attackReaderSurface()` lives in `censusAttackCorpus.ts` and returns the 13
reader NAMES; look each up on the effects module):

| string | verdict |
|---|---|
| the full printed sentence | **REFUSED 13/13**, trailing splitter `null` |
| the HEAD alone | **BUILDS** — `deriveAttackDamageMultiplier` → `{per:10, count:{kind:"damageCountersOnYourBench", filter:{kind:"ownerPokemon", owner:"Cynthia"}}}` |
| *"This attack's damage isn't affected by Weakness or Resistance."* | **BUILDS** — `deriveAttackDamageSuppression` |
| *"This attack's damage isn't affected by **Weakness**."* (Weakness-only) | **REFUSED 13/13** |
| *"This attack does 30 damage. This attack's damage isn't affected by Weakness or Resistance."* | **REFUSED 13/13**, splitter `null` |

🛑 **Read the last row carefully: COMPOSITION FAILS EVEN WHEN BOTH HALVES BUILD.** A suppression
tail cannot ride behind *any* head today. That is D492's finding generalised — the trailing splitter
requires the tail to be a `deriveAttackEffect` clause, and a suppression is a damage reader's.

**So there are two candidate blockers, and you must establish which are real:**

- **(A) VOCABULARY** — `deriveAttackDamageSuppression` reads *"Weakness or Resistance"* and not the
  bare *"Weakness"*.
- **(B) COMPOSITION** — no head + suppression-tail sentence composes, at all.

## 🛑 The design fork, and it is genuinely open

**D492 — one slice ago — hit blocker (B) and answered it with a WHOLE-SENTENCE ANCHOR** rather than
teaching the splitter to compose a suppression tail. That precedent is one slice old and it is a
hazard as much as a guide.

**Price both, in sites, and say which frees more:**

- A whole-sentence anchor for this row: cheap, one row, and it makes (B) someone else's problem
  again — the third slice running to route around the same wall.
- Teaching the composition path to accept a suppression tail: 🛑 **measure what it frees.** I count
  **only 2 corpus rows / 2 printings** printing the Weakness-only clause at all, against **9 rows /
  27 printings** for *"Weakness or Resistance"* — but the relevant number is *how many residue rows
  are head-builds + suppression-tail*, which you should derive rather than take from me.

⚠️ **And the two Weakness-only rows do NOT share a blocker set.** The other one —
*"If you have 3 or more Energy in play, this attack does 70 more damage. This attack's damage isn't
affected by Weakness."* — has a head that is **itself refused 13/13**. So it carries (A) and (B)
**plus its own head blocker**. Confirm that by axis substitution before deciding whether this is a
one-row or two-row slice (D488's test; D483 split 2+2, D488 and D492 did not).

## What you must do FIRST

1. **Build state programmatically for the target and for every string above.** Report 13/13 and all
   four splitters verbatim.
2. 🛑 **THE AXIS-SUBSTITUTION LATTICE, IN BOTH DIRECTIONS** (D489-i, and D492's correction).
   Substitute each axis onto its nearest **BUILT** spelling; report by Hamming weight. ⚠️ **D492's
   lesson is exactly on point here: `residue-census.ts`'s CUT experiment asks only whether the
   REMAINDER BUILDS, never whether it COMPOSES** — and my brief for D492 repeated its label as a
   confident claim and was half wrong. **Vary the segment you KEEP as well as the one you cut.**
   ⚠️ **An axis whose printed value already builds is not an axis** (D491).
3. **Count the axes from the PRINT.** Four consecutive briefs of mine have undercounted.
4. **Re-derive any refusal you find and report what it QUANTIFIES OVER** (D491-iv). Run the tripwire
   audit over all 2,373 rows from the module and report whether any row rests on this refusal.
5. **Witness load, counted and divided**, each site classified predicate-held or sentence-quoting.
   🛑 **Verify every quoted specimen IS a row of `legalAttackCorpus()`** at its committed printing
   count (D490's phantom).

## The design questions

1. **Is the Weakness-only clause the same mechanism as Weakness-or-Resistance, or a different one?**
   ⚠️ D492 found that `ignoreWR` **nulls the target's installed damage reduction as well as W/R**,
   and deliberately left that over-reach unpinned because no corpus row distinguished the two.
   **This row might be that distinguishing case** — it names Weakness and not Resistance. Drive it:
   is there a board where "ignore Weakness" and "ignore Weakness and Resistance" answer different
   numbers? If yes, say what that means for D492's unpinned over-reach.
2. **If you build a composition path, what stops a suppression tail composing behind a head it has
   no business modifying?** D485 refused a tail-only anchor because *"you find there"* was an
   anaphor. A suppression tail has no anaphor — so state what constrains it, or say plainly that
   nothing does and price that.
3. **`MATCH_RECORD_VERSION`.** Re-derive at the hard address and **say WHICH argument you use** —
   D490 used reachability, D491 used D125's widening + D441's absent-key direction, D492 used D125's
   widening with reachability true but deliberately unused. Drive a v29 record answering a
   *different number*.

## Obligations

- **THE DESCRIBER: trace the call site.** Six consecutive slices a brief predicted describer work and
  it was empty. Report the trace, empty or not.
- **THE ATTRIBUTION CONTROL AT BOTH LAYERS** (D491/D492), each killer alone, restored in a `finally`,
  size **and** sha256 verified. **Name which layer each witness covers.**

## Hard rules — read these as written

- **Do NOT commit, do NOT `git add`, do NOT run a whole-corpus sweep.** A `--decision D493
  --allow-dirty` probe is expected; row count derived three ways.
- **`docs/` is UNTOUCHED. Do not run the end-of-session ritual.** 🛑 **`ARCHIVES` in
  `progressLog.test.ts` is the RITUAL's — leave it byte-unchanged and verify by sha256.**
- **Never `git stash` / `git checkout --` / `git reset --hard`.** Never write to the tree while the
  harness is in flight.
- Temp files in `$CLAUDE_JOB_DIR/tmp` only.
- `--allow-dirty` MANDATORY on a dirty tree; `--decision` matches by `String.includes`; **`--only`
  does NOT accumulate.**
- ⚠️ **A `replace` omitting a REQUIRED field reports ERROR — `precheck` gates `find` only.**
- 🛑 **A BARE `toBe(N)` / `toHaveLength(N)` REPLACEMENT IS NOT SAFE FOR SMALL LITERALS** (D492).
  `toBe(24)` **is** the assertion spelling and still hit 7 sites in 6 files; **the obvious repair is
  NOT an inverse** and broke 9 pre-existing assertions in one command. **For a literal under ~4
  digits, patch BY LINE NUMBER from `git diff -U0`**, and **undo LINES, never VALUES**. ⚠️ **The
  suite stays GREEN through such an over-patch** — only the diff shows it.
- ⚠️ **Census tax in WAVES.** Grep the OLD VALUES as bare tokens first, **counting MATCHES not
  LINES**. **Bump `BUILT.attack` FIRST** (D449). Check whether the sentence and printing deltas agree
  (this row is 1/1, so probably yes — verify). ⚠️ **A `Math.round` numerator has a SOLUTION SET.**
- 🛑 **STATE THE COMMAND YOU USED FOR EVERY COUNT.** `git grep` misses your untracked suite;
  `grep -cE '^\s+it\('` agrees with vitest where `grep -c 'it('` does not. **Re-measure the version
  tax AND its exception list after the edit** — D492's list grew 2 → 4 because the edit authored two.
- ⚠️ **A moved gate population must be VERIFIED, not accepted** (D492). `patches LITERALLY` is **22**
  at this head; the criterion is a `String.replace` special (`$$`, `$&`, `` $` ``, `$'`, `$n`,
  `$<name>`), **not a bare `$`**, which over-counts by ten-fold.

## Report back

Build state for every string in my table, re-derived. The lattice by Hamming weight, run in both
directions. Which of (A) and (B) are real blockers. **The design fork priced in sites, with the
number of rows each option frees derived rather than quoted from me.** Whether the second
Weakness-only row joins, measured. The Weakness-vs-Weakness-or-Resistance question, driven — and what
it implies for D492's unpinned `ignoreWR` over-reach. Witness load. The tripwire audit. The describer
trace. The attribution control at both layers with the layer map. What you built; what you left and
its price. **Every place this brief was wrong — assume at least one, and say which of my claims were
hedged and which were confident.** The gates verbatim. The per-file numstat for deletions. The corpus
delta and a sweep prediction with its arithmetic shown.
