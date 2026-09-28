# D492 — work order

## The target

**Two rows, `censusAttackCorpus.ts` file lines 539 and 616 — 2 sentences / 4 legal printings:**

> *"This attack does 100 damage to each of your opponent's Pokémon ex and Pokémon V. This
> attack's damage isn't affected by Weakness or Resistance."* (2 printings)
>
> *"This attack does 60 damage to each of your opponent's Pokémon ex. This attack's damage
> isn't affected by Weakness or Resistance."* (2 printings)

## What I verified at `59495182` — witnesses, not guesses. Check each.

1. **Both are REFUSED 13 / 13.** Run programmatically: `attackReaderSurface()` returns the reader
   NAMES (it is in `censusAttackCorpus.ts`, not `effects.ts`); look each up on the effects module.
2. 🛑 **THE TWO NEAREST SIBLINGS ARE ALREADY BUILT, AND THEY DIFFER BY ONE PREPOSITION.** Corpus
   lines 612 and 613 — *"…does 60 damage **for** each of your opponent's Pokémon ex and Pokémon V
   **in play**."* and its ex-only twin — **BUILD, via `deriveAttackDamageMultiplier`.** So the
   *count* over this filter already ships; what does not is the *spread*.
3. **The `ex` / `V` filter ALREADY SHIPS.** `effects.ts` ~12796 maps the printed noun to
   `{kind:"suffixPokemon", suffix:"ex"}` and composes the pair as `anyOf` — D483's table, with its
   own note that *"the pair is an `anyOf` and NOT a new filter member"*. **The filter is not the
   blocker.**
4. **The W/R tail is NOT the blocker either, and the instrument says so.** `scripts/residue-census.ts`
   cuts the trailing sentence and reports, for both rows: `CUT 🛑 does NOT build: This attack does
   100 damage to each of your opponent's Pokémon ex and Pokémon V.` **The head is what refuses.**
5. **`spreadDamage` is `{ target: "opponentBench" | "yourBench"; amount: number }`** — no filter
   field, no whole-side member.

**So the residual question is narrow: what does a FILTERED WHOLE-SIDE spread cost?**

## 🛑 The precedent you must price against — and why it may NOT transfer

**D482 built the unfiltered whole-side spread and it needed NO new op**: *"This attack does 30
damage to each of your opponent's Pokémon."* is `damageDefender`'s FLAT arm (the full §8.5 pipeline,
so W/R **do** apply on the Active) followed by `spreadDamage { target: "opponentBench" }`. Its
decisions row records that **D447, D459 and D462 all priced that row at *"a third
`spreadDamage.target` plus a §8.5 asymmetry"* and all three were FALSE** — the asymmetry the price
was for *is* the boundary between two ops that had shipped since D189/D316.

⚠️ **Do not assume the same answer here.** Two things differ, and both cut against it:

- **W/R.** D482's row applies Weakness and Resistance on the Active, which is exactly why
  `damageDefender`'s flat arm was the right op for that leg. **These two rows print *"This attack's
  damage isn't affected by Weakness or Resistance."*** — so the Active leg must **not** take W/R.
- **CONDITIONALITY.** *"Each of your opponent's Pokémon ex"* includes the Active **only if the
  Active is itself an ex/V**. D482's row hit the Active unconditionally. So the Active leg is now
  gated on a filter match, which is a shape the two-op composition may not express.

**Price the composition honestly against both**, and if it fails, say which of the two kills it.
Also check whether D482's own doc block or `index.ts` 0.327.0's *"`spreadDamage` only ever touches
`side.bench`"* claim constrains you — D482 refused to widen `spreadDamage` partly to avoid
falsifying that in three files.

## 🛑 The collision board, which I expect to be the sharpest part of the slice

*"Does 100 damage **TO** each of your opponent's Pokémon ex"* and *"does 100 damage **FOR** each of
your opponent's Pokémon ex"* — the built sibling at line 612/613 — **are indistinguishable on a
board where the opponent's ONLY ex is their Active.** Both deal 100 to that one body. They diverge
only when the opponent has an ex on the Bench, or an Active that is not an ex.

This is D486's arithmetic-identity hazard at a **preposition**, and it is the natural board a suite
would write. **Enumerate the candidate readings and count how many each board separates before
choosing one** (D488-ii, D490). At minimum drive: Active-is-ex with a benched ex; Active-not-ex with
benched exes; a mixed board with non-ex bodies that must take **zero**; and the built `for each`
sibling on the same boards, asserting it still answers its own number.

## What you must do FIRST

1. **Build state programmatically off the 13 `deriveAttack*` exports** — never `programFor`. Report
   13/13 and all four splitters verbatim for **both** rows.
2. 🛑 **AXIS-SUBSTITUTION LATTICE (D489-i / D490 / D491), not an axis list.** Substitute each axis
   onto its nearest **BUILT** spelling rather than deleting it, run all 2ⁿ points × 13 readers, and
   report by Hamming weight. ⚠️ **Count the axes from the PRINT** — three consecutive briefs of mine
   have undercounted. And ⚠️ **an axis whose printed value is ALREADY BUILT is not an axis** (D491):
   the FILTER and the W/R tail are both live candidates for being degenerate here, so check each
   one's nearest built spelling actually differs from the print before listing it.
3. 🛑 **ARE THE TWO ROWS ONE SLICE? Test by axis deletion, do not assume** (D488-i). They differ
   only in the amount and in whether `Pokémon V` is included. D488's pair looked like two and was
   one; D483's cluster looked like one and was two. **And check whether 612/613 belong to the
   cluster too** — they share the filter and the noun and differ by a preposition.
4. **Re-derive any refusal you find rather than inheriting it, and report what it QUANTIFIES OVER**
   (D491-iv). D490 and D491 both found recorded prices wrong; D491's refusal was *correct but
   answering a different question*. Run the tripwire audit over all 2,361 rows from the module and
   report whether any row rests on this refusal.
5. **Witness load, counted and divided** by the rows it frees, each site classified predicate-held
   (amortises) or sentence-quoting (does not). 🛑 **Verify every quoted specimen IS a row of
   `legalAttackCorpus()`** at its committed printing count — D490 found an invented damage figure
   pinned green in two files.

## Obligations

- **THE DESCRIBER: trace the call site, never argue from the op's category.** Four consecutive
  slices a brief predicted describer work and it was empty every time. Report the trace.
- **THE ATTRIBUTION CONTROL, AT BOTH LAYERS** (D491): break the reader arm and the executor
  separately, each killer alone, restore in a `finally`, verify size **and** sha256. **Name which
  layer each witness covers** — census and loud controls are blind to both, a value re-point covers
  the reader only, and only a behavioural suite covers the executor.
- **`MATCH_RECORD_VERSION`.** Re-derive at the hard address and say WHICH argument you are using —
  D490 used reachability, D491 used D125's widening + D441's absent-key direction and stated that
  reachability would have been false. Drive a v29 record that answers a *different number*.

## Hard rules — read these as written

- **Do NOT commit, do NOT `git add`, do NOT run a whole-corpus sweep.** A `--decision D492
  --allow-dirty` probe is expected; report it with the row count derived three ways.
- **`docs/` is UNTOUCHED. Do not run the end-of-session ritual.** 🛑 **`ARCHIVES` in
  `progressLog.test.ts` is the RITUAL's — leave that file byte-unchanged and verify by sha256.**
- **Never `git stash` / `git checkout --` / `git reset --hard`.** Never write to the tree while the
  mutation harness is in flight.
- Temp files in `$CLAUDE_JOB_DIR/tmp` only.
- `--allow-dirty` MANDATORY on a dirty tree; `--decision` matches by `String.includes`; **`--only`
  does NOT accumulate.**
- ⚠️ **A `replace` omitting a REQUIRED field reports ERROR — `precheck` gates `find` only.**
- ⚠️ **Census tax in WAVES.** Cut it by grepping the OLD VALUES as bare tokens first, and 🆕 **count
  MATCHES, not LINES** (D491: a front-term pass found 21 across 8 files where `grep -n` said 18/9).
  **Bump `BUILT.attack` FIRST** (D449). ⚠️ **Check whether the sentence and printing deltas AGREE** —
  here they will not (2 sentences, 4 printings), so `.length` sites take 2 and `units(…)` sites take
  4. ⚠️ **A `Math.round` numerator has a SOLUTION SET** — derive by intersecting both denominators.
  🆕 ⚠️ **A mechanical substitution pass must be CLOSED UNDER ITS OWN OUTPUT** — D491 injected a
  double-step and `git diff` did not flag it, because the line still looked stepped.
- 🛑 **STATE THE COMMAND YOU USED FOR EVERY COUNT.** `git grep` sees only TRACKED files and misses
  your new suite; `grep -c 'it('` counts prose lines where `grep -cE '^\s+it\('` agrees with vitest.
  **Re-measure the version tax AND its exception list after the edit** — D491's list grew 4 → 6
  because the edit itself authored two.
- 🆕 ⚠️ **`spliceReport`'s population moves when a row BREAKS**, not only when one is written — a
  `find` occurring twice counts as spliceable. Read a moved gate population as a question about the
  corpus's health first.

## Report back

Build state off the right oracle, for both rows. The lattice by Hamming weight, with axes counted
from the print and any degenerate axis named as such. Whether the two rows are one slice, and
whether 612/613 join them — measured. Whether the D482 composition transfers, and if not, which of
W/R or conditionality kills it. The collision board and how many readings each board separates.
Witness load, counted and divided, every specimen verified. The tripwire audit. The describer trace.
The attribution control at both layers, with the layer map. What you built; what you left and its
price. **Every place this brief was wrong — assume at least one, and say which of my claims were
hedged and which were confident.** The gates verbatim. The per-file numstat for deletions. The
corpus delta and a sweep prediction with its arithmetic shown.
