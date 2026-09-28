import io
p='docs/progress.md'
s=io.open(p,encoding='utf-8').read()
anchor='## NEXT (resume point)\n\n> ### ▶ THE NEXT CONCRETE ACTION (written 2026-09-10, after D492)'
assert s.count(anchor)==1
NEW = r'''## NEXT (resume point)

> ### ▶ THE NEXT CONCRETE ACTION (written 2026-09-10, after D493)
>
> ✅ **`bun run check` IS GREEN — 479 files / 10,916 tests, `CHECK_EXIT=0`**, `typecheck-coverage`
> **725 → 726**, `lint-coverage` **727 → 728**. **`it(` delta +21 and vitest delta +21 — EXACT**
> (20 in the new suite + 1 in `benchNounScaling.test.ts`), verified per file. Engine **0.387.0 →
> 0.388.0**. **`MATCH_RECORD_VERSION` 29.** Corpus **2,373 → 2,379**, archive ratchet **163**.
>
> 🛑 **(0) THE DEBT: COMMIT FIRST, THEN THE WHOLE-CORPUS SWEEP.**
> ⚠️ **ONE UNTRACKED PATH: `packages/engine/src/benchCounterSuppressed.test.ts`.** `git add`
> EXPLICIT PATHS. 🛑 **LAUNCH THE SWEEP DETACHED WITH `setsid`** (D489, held at D490/D491/D492).
> **POLL the summary line — a detached run sends no notification.**
>
> **THE PREDICTION, COMMITTED BEFORE THE RUN — fifty-fourth consecutive slice to name its number
> first, and the fifty-third landed exactly:**
>
> > **`2336 killed · 43 known survivor(s) · 0 GAP(s) · 0 stale · 0 skipped(dirty) · 0 clobber(s) ·
> > 0 error(s)` over 2,379**
>
> `2330 + 6 = 2336`, `43 + 0 = 43`, `2373 + 6 = 2379`, closing `2336 + 43 = 2379`.
>
> **(1) PRE-CLEARANCE.** 79 files changed / 643 insertions / 178 deletions. **23 survivors clear by
> file**; **7 live in `attack.ts`, which is 18 insertions and ZERO deletions — pure addition**; the
> other **13 live in `effects.ts`, whose ONLY TWO deleted lines** are the two `.exec(` bindings this
> slice re-pointed, and none of the 13 quotes either. Two whose reasons quantify over a structure
> were hand-checked and cleared. `precheck` re-finding all **2,379** `find` strings exactly once is
> the witness that no other line moved. **Six neighbour decisions re-probed** (D409 8/8, D467 12+1,
> D192 5/5, D445 14/14, D488 11/11, D466 10/10), all clean.
>
> **(2) ALREADY VERIFIED INDEPENDENTLY — run the SWEEP.** `check` GREEN **479 / 10,916**; `precheck`
> clean at **2,379**; `residue-census-gate` **OK, §A 113 / 87 / 122**; `opaque-anatomy-gate` **OK**,
> §D **9 classes / 65 sentences / 94 printings**, §E **35,945** pairs, admitted **164**;
> `splice-gate` and `partition-gate` **OK**; probe `--decision D493 --allow-dirty` → **6 killed · 0
> survivors · 0 GAP · 0 stale · 0 clobber · 0 error**. ✅ **Hard-rules line held — `docs/` untouched,
> `progressLog.test.ts` byte-unchanged by sha256, `ARCHIVES` not stepped by the slice.**
> ✅ **`patches LITERALLY` HELD at 22** and was re-derived independently on D492's criterion (a
> `String.replace` special, **not a bare `$`**, which over-counts 213 against the true 22).
>
> **(3) AFTER THE SWEEP: the close-out.** Structural completeness from unique progress-line ids,
> confirm the line, update this stamp's tail and this `(0)` block, append to the `| **D493** |` row,
> add any convention BEFORE `## Git / commits`, re-run `check`, commit.
>
> **(4) THEN D494 — AND THE BIG LESSON IS ABOUT PRICING FORKS.** 🛑 **TWO BLOCKERS ON ONE ROW MAY NOT
> BE INDEPENDENT, AND PRICING THEM SEPARATELY IS THE ERROR.** D493's (A) and (B) each freed **0 / 0**
> alone; only the pair freed **1 / 1**, which is what a single anchor freed for less. **Measure each
> branch's payoff ALONE as well as together — a branch with an empty solo payoff is not half a slice,
> it is a prerequisite.** 🛑 **AND BEFORE BUILDING A COMPOSITION PATH, GREP THE CORPUS FOR THE MUTANT
> WHOSE `replace` IS THAT PATH.** `D409-tail-guard-widened-to-any-reader` is the widening verbatim,
> with its defect in its own `what`; building it would have disarmed the tripwire describing it.
> **The needle is the GUARD LINE, not the decision number.**
>
> **(5) THE ROWS STILL OPEN.** Class table at the new head: **`COMPOUND-head` 7/8** (was 8/9),
> `COMPOUND-mid` 1/2, `SUBST-2` 3/4, `SUBST-3` 1/1, `SUBST-5` 1/1, `PHRASE-1` 4/5, `PHRASE-7` 1/1,
> `PHRASE-13` 1/1, `PHRASE-18` 1/3, `PHRASE-24` 1/1, `PHRASE-29` 1/1, **`OPAQUE` 65/94 — total 87 /
> 122**. ⚠️ **`OPAQUE` is now 75 % of remaining sentences, and 14 of its 65 are STRUCTURALLY
> blocked**, so the ceiling without an ingest migration stays **~88 % of sentences**. 🆕 **Named
> candidates, priced by the builder:** **row 337** (*"If you have 3 or more Energy in play, this
> attack does 70 more damage. …isn't affected by Weakness."*) — **its head is refused 13/13 and is
> the blocker**; one anchor and one `BoardCondition` away, **measured**, and it does NOT share
> D493's blocker set. **Corpus line 669** (the 3-clause coin/tails/W-or-R row) — **went from two
> blockers to one**, and is the only row whose debt D493's *refused* branch would have reduced.
> 🛑 **`Ancient`/`Future`/`Tera` off the table, 30th slice.**
>
> **(6) THE TARGETING RULES, forty-four clauses.** (a)–(oo) as at D492, plus: (pp) 🆕 **D493-i: price
> each branch of a fork ALONE as well as together** — an empty solo payoff makes it a prerequisite,
> not half a slice. (qq) 🆕 **D493-ii: before building a composition path, grep for the mutant whose
> `replace` IS that path.** (rr) 🆕 **D493-iii: a DUAL-CLAIM POPULATION rung is blind to
> correctness** — measured green under a reader mutation that changed the derived value, because it
> asserts *how many readers claim*, never *what they answer*: D469's census blindness one layer down.
> (ss) 🆕 **D493-iv: when a sentence needs two readers, ask whether the caller already hands them the
> same string** — `attack.ts` hands `effect` to all five damage readers, so a two-seam sentence cost
> one constant and **zero caller bytes**, where a composition seam costs a splitter, a rebind and the
> disjointness matrix (which **would have fired**: Sawk carries both a leading requirement clause and
> a trailing suppression clause).
>
> **(7) THE STANDING HAZARDS.** 🛑 **NEVER WRITE TO THE TREE WHILE THE HARNESS IS IN FLIGHT.**
> **`--only` does NOT accumulate.** `--allow-dirty` MANDATORY; `--decision` matches by
> `String.includes`. ⚠️ **`patches LITERALLY` 22**; near-miss **8**. ⚠️ **A `replace` omitting a
> REQUIRED field reports ERROR.** 🛑 **A BARE `toBe(N)` REPLACEMENT IS NOT SAFE FOR SMALL LITERALS**
> (D492) — patch BY LINE NUMBER from `git diff -U0`, and **undo LINES, never VALUES**; the suite
> stays GREEN through such an over-patch. ⚠️ **CENSUS TAX IN WAVES** (D487 five … D493 four: 27
> line-targeted literals, 18 front terms across 6 files, 12 live heads, 4 stragglers). **Count
> MATCHES not LINES.** **`BUILT.attack` FIRST** (D449). 🆕 ⚠️ **A marker occurring TWICE PER LINE must
> be spliced at a column-asserted occurrence** — D493 spliced both `BUILT.attack` chains at the first
> `expect(BUILT.attack - ` with its column asserted < 80 (D463). ⚠️ **A `Math.round` numerator has a
> SOLUTION SET** — D493's held at 20 across the denominator move. ✅ **VERSION TAX: 93 occurrences /
> 66 files / 21 `it(` titles**, re-measured by the caller with the untracked-inclusive command
> against `git grep`'s **91 / 65**. ⚠️ **The builder reported 92 and the caller measured 93 — one
> apart, so the committed figure is the caller's.** 🆕 ⚠️ **THE NEXT BUMP'S EXCEPTION LIST IS ONE**
> (this entry's own heading), and **writing the note itself moved retired-`0.387.0` from 2 to 4** —
> D488's self-reference rule firing a fifth time. **Re-measure both after the edit; never inherit
> either.** 🛑 **`ARCHIVES` is the RITUAL's, and the hard-rules block must SAY so every time.**

### Prior resume point (P3-M5 — D492, the filtered whole-side spread, kept for continuity)

> ### ▶ THE NEXT CONCRETE ACTION (written 2026-09-10, after D492)'''
s=s.replace(anchor,NEW,1)
io.open(p,'w',encoding='utf-8').write(s)
print('ok')
