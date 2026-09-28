# D499 — work order

## 🛑 The loop returns to BUILDING SENTENCES.

Three coverage slices (D496–D498) discharged the instrument debt. **This slice builds a corpus
sentence**, so the residue, `BUILT.attack` and the census all move, the census tax applies, and the
engine version bumps. That is the opposite of the last three briefs — do not carry their shape.

## The target

**1 sentence / 2 legal printings** — the largest reachable row left in the
`During your opponent's next turn,` family (42 sentences / 151 printings, 27 built / 15 not):

> *"Flip a coin. If tails, this attack does nothing. If heads, during your opponent's next turn,
> prevent all damage from and effects of attacks done to this Pokémon."*

## What I measured at `7378aa48` — re-derive every cell

| string | verdict |
|---|---|
| the full printed sentence | **REFUSED 13/13**, all four splitters `null` |
| *"Flip a coin. If heads, during your opponent's next turn, prevent all damage from and effects of attacks done to this Pokémon."* | **BUILDS** — `deriveAttackEffect` (D142's `FLIP_PREVENT_DAMAGE_AND_EFFECTS`) |
| *"Flip a coin. If tails, this attack does nothing."* | **BUILDS** — `deriveAttackCoinFlip` |

🛑 **So both halves build independently and only the combination has no reader.** That is **D495's
weight-1-only lattice shape recurring** — no prerequisite half, no proper superset to compose from —
and D495 recorded it as a *distinct warrant* for a whole-sentence anchor. **Confirm the shape by
running the lattice; do not assume it because I said so.**

⚠️ **And note which two readers claim the halves: `deriveAttackEffect` and `deriveAttackCoinFlip`.**
D493/D494 shipped sentences claimed by **two** readers over one anchor, because `attack.ts` hands the
same string to several readers. **Check whether that idiom applies here — trace the caller's
dispatch, do not assume it transfers** (D494 traced it and it did; D493 traced it and the second
reader had to be *gated* on the first so the pair could not half-build).

## The design question I expect to be the content

**The two clauses are ONE coin flip with two consequences** — a *cancel* on tails and a *durated
effect* on heads. That is not obviously `coinFlipGate { then, otherwise }`, because *"this attack
does nothing"* is the **cancel** semantics (no damage dealt at all), not an empty `otherwise`.

**Drive it.** Does a cancel and an effect-gate ride the same flip today, or is that the missing
piece? ⚠️ **And check the RNG**: two readers each flipping would be two draws off the same seed for
one printed flip. **Seeds searched, never stubbed** (D495's idiom), and assert the flip is consumed
**once**.

## What you must do FIRST

1. **Build state programmatically** off the 13 `deriveAttack*` exports for every string above, plus
   all four splitters. Report verbatim.
2. 🛑 **THE AXIS-SUBSTITUTION LATTICE, BOTH DIRECTIONS** (D489-i, D492, D495). Substitute each axis
   onto its nearest **BUILT** spelling; report the **built-by-weight vector**, not just the verdict
   (D495: two lattices that both end in "ship an anchor" can say opposite things about why).
   ⚠️ **Count the axes from the PRINT**, and **check each for DEGENERACY before listing it** (D491/
   D494) — an axis whose printed value already builds is not an axis, and an apparent extra
   dimension may be a VALUE inside one (D495's FACE).
3. **Price each branch ALONE as well as together** (D493, re-earned at D494), with the **canonical
   residue predicate copied verbatim from `censusAtHead.test.ts`** — a hand-rolled one over-counted
   the residue by 9 sentences (D494), and I reproduced that error myself two slices ago.
4. 🛑 **GREP THE MUTANT CORPUS FOR THE ROW WHOSE `replace` IS ANY WIDENING YOU CONSIDER** (D493).
   Run the tripwire audit over all 2,427 rows **from the module**, and report what rests on this
   refusal. ⚠️ **Enumerate a gated family by BOTH faces** — a `^Flip a coin\. If heads,` pattern
   cannot see this row, which opens `If tails,` (D495, my own miscount).
5. **Witness load, counted and divided**, each site classified predicate-held or sentence-quoting.
   🛑 **Verify every quoted specimen IS a row of `legalAttackCorpus()`** at its committed printing
   count (D490's phantom). ⚠️ **A sentence grep will not find predicate-held controls** — the runner
   will (D465/D494).

## Obligations

- **THE DESCRIBER: trace the call site, never argue from the op's category.** Eight consecutive
  slices a brief predicted describer work and it was empty — but **D494 found real work in
  `conditionNote`, where the category argument never looks.** Report both traces.
- **`log.ts`: RENDER the row rather than reasoning about it** (D456/D493/D495), and **record any
  honest limit at the rung**.
- **THE ATTRIBUTION CONTROL AT BOTH LAYERS**, each killer alone, restored in a `finally`, size **and**
  sha256 verified. **Name which layer each witness covers** — census and loud controls are blind to
  both, a value re-point covers the reader only, and only a behavioural suite covers the executor.
  🆕 **And a dual-claim POPULATION rung is blind at both layers** (D493/D494).
- 🛑 **`MATCH_RECORD_VERSION`: this row lands in the DURATED family, where a bump can genuinely be
  forced.** D495's was held on the **serialized alphabet**, derived at the hard address, with
  reachability stated second as the weaker half — because the durated record is a **REQUIRED field
  persisted directly in `MatchRecord.state`**. **Name the address first, say WHICH argument you use,
  and if a bump is honestly required, price it rather than contorting the design.**

## Hard rules — read these as written

- **Do NOT commit, do NOT `git add`, do NOT run a whole-corpus sweep.** A `--decision D499
  --allow-dirty` probe is expected; row count derived three ways.
- **`docs/` is UNTOUCHED. Do not run the end-of-session ritual.** 🛑 **`ARCHIVES` in
  `progressLog.test.ts` is the RITUAL's — leave it byte-unchanged and verify by sha256.**
- **Never `git stash` / `git checkout --` / `git reset --hard`.** Never write to the tree while the
  harness is in flight. ⚠️ **A foreground probe can be SIGTERM'd before its `finally` runs and the
  tool recovers silently** (D496) — **prefer `setsid`**, and verify the tree by hash afterwards.
- Temp files in `$CLAUDE_JOB_DIR/tmp` only.
- `--allow-dirty` MANDATORY on a dirty tree; `--decision` takes ONE value (D443) and is a **FLOOR**
  with a false-negative half (D496); **`--only` does NOT accumulate**; **`--list` IGNORES
  `--decision`.** 🆕 ⚠️ **`killedByCommand` REPLACES `expectKilledBy`** — a row killed by both a suite
  and a gate can name only one; record the other in prose (D498).
- ⚠️ **A `replace` omitting a REQUIRED field reports ERROR — `precheck` gates `find` only.**
- 🛑 **A BARE `toBe(N)` REPLACEMENT IS NOT SAFE FOR SMALL LITERALS** (D492) — patch **by line number
  from the runner's `file:line`**, **undo LINES not VALUES**, and **verify by paired diff analysis**.
  ⚠️ **The suite stays GREEN through such an over-patch.**
- ⚠️ **Census tax in WAVES** — grep the OLD VALUES as bare tokens first, **counting MATCHES not
  LINES**; **bump `BUILT.attack` FIRST** (D449); **splice a twice-per-line marker at a
  COLUMN-ASSERTED occurrence** (D463). ⚠️ **D463's EATEN-MINUS-SIGN TRAP DOES NOT FAIL LOUDLY** —
  after any front-term pass, **check the COLLECTED-TEST count, not just the failure count** (D495).
  ⚠️ **This row is 1 sentence / 2 printings, so the two steps DISAGREE** — `.length` sites take 1 and
  `units(…)` sites take 2. **Verify that rather than trusting it.**
- ⚠️ **A `Math.round` numerator has a SOLUTION SET** — intersect across both denominators (D488).
- 🛑 **STATE THE COMMAND YOU USED FOR EVERY COUNT.** `git grep` misses your untracked suite; an
  `it.each` is ONE site and N tests (D494); **re-measure the version tax AND its exception list after
  the edit** — the inherited list has been wrong on three separate slices, each time because the note
  counting it was itself a match.
- ⚠️ **A moved gate population must be VERIFIED, not accepted.** `patches LITERALLY` is **22**; the
  criterion is a `String.replace` special, **not a bare `$`**.

## Report back

Build state for every string in my table, re-derived. The lattice **by built-by-weight vector**, both
directions, with any degenerate axis named. Each branch's solo payoff and the combined payoff, with
the canonical predicate. Whether the two-reader idiom transfers, **traced**. The one-flip question
answered with a driven board, including the RNG consumption. The tripwire audit. Witness load. The
describer and `log.ts` traces. The attribution control at both layers with the layer map. The version
argument, address named first. What you built; what you left and its price. **Every place this brief
was wrong — assume at least one, and say which of my claims were hedged and which were confident.**
The gates verbatim. The per-file numstat for deletions. The corpus delta and a sweep prediction with
its arithmetic shown.
