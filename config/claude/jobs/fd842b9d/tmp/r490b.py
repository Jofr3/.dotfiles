import io
p='docs/progress.md'
s=io.open(p,encoding='utf-8').read()
anchor='## NEXT (resume point)\n\n> ### ▶ THE NEXT CONCRETE ACTION (written 2026-09-08, after D489)'
assert s.count(anchor)==1
NEW = r'''## NEXT (resume point)

> ### ▶ THE NEXT CONCRETE ACTION (written 2026-09-08, after D490)
>
> ✅ **`bun run check` IS GREEN — 476 files / 10,829 tests, `CHECK_EXIT=0`**, `typecheck-coverage`
> **722 → 723**, `lint-coverage` **724 → 725**. **`it(` delta +37 and vitest delta +37 — EXACT**
> (36 in the new suite + 1 in `benchDiscardBoost.test.ts`), counted with `grep -cE '^\s+it\('`.
> Engine **0.384.0 → 0.385.0**. **`MATCH_RECORD_VERSION` 29, held on REACHABILITY.** Corpus
> **2,331 → 2,349**, archive ratchet **160**.
>
> 🛑 **(0) THE DEBT: COMMIT FIRST, THEN THE WHOLE-CORPUS SWEEP.**
> ⚠️ **ONE UNTRACKED PATH: `packages/engine/src/eachDeckMillBoost.test.ts`.** `git add` EXPLICIT
> PATHS. 🛑 **AND LAUNCH THE SWEEP DETACHED WITH `setsid`** (D489): two tracked background runs were
> SIGTERMed within minutes of the turn ending; a detached run reparents to init (PPID 1) and
> survives. **A detached run sends no completion notification — POLL the summary line.**
>
> **THE PREDICTION, COMMITTED BEFORE THE RUN — fifty-first consecutive slice to name its number
> first, and the fiftieth landed exactly:**
>
> > **`2306 killed · 43 known survivor(s) · 0 GAP(s) · 0 stale · 0 skipped(dirty) · 0 clobber(s) ·
> > 0 error(s)` over 2,349**
>
> `2289 + 17 = 2306`, `42 + 1 = 43`, `2331 + 18 = 2349`, closing `2306 + 43 = 2349`.
> ⚠️ **THE DECLARED-SURVIVOR POPULATION MOVES FOR THE FIRST TIME IN THIS RUN OF SLICES: 42 → 43.**
> The new one is `D490-arm-order-swapped`, **structural** disjointness (D468's second kind, which
> correctly carries no guard): both anchors are `^…$` and disagree on a mandatory literal at position
> 0, so no string matches both. **Kept rather than deleted because it reports STALE-SURVIVOR the day
> either anchor loosens its leading literal**, which is the only change that could make the order
> observable.
>
> **(1) PRE-CLEARANCE — 18 of 43 clear by file, 25 by line.** `attack.ts`, `continuous.ts`, `flow.ts`,
> `redact.ts`, `GameHud.tsx`, `splice-gate.ts` and `refusedPrintings.ts` are absent from the diff
> entirely. The other 25 live in `effects.ts` (**199 / −30**) and `interpreter.ts` (**57 / −18**) —
> real deletions this time, not D489's pure addition — cleared by `precheck` re-finding all **2,349**
> `find` strings exactly once plus a needle screen; **the screen flagged 2 and both were false
> positives**, matching the English word *whose* rather than `discardDeckTop.whose`. **Six
> pre-existing rows DID break and were re-transcribed** (two D403, two D455, two D488), all re-probed
> KILLED inside their decisions.
>
> **(2) ALREADY VERIFIED INDEPENDENTLY — run the SWEEP.** `check` GREEN **476 / 10,829**; `precheck`
> clean at **2,349**, `patches LITERALLY` **HELD at 21**, near-miss **HELD at 8**;
> `residue-census-gate` **OK, §A 117 / 91 / 128**; `opaque-anatomy-gate` **OK**, §D **9 classes / 65
> sentences / 94 printings**, §E **35,685** pairs, admitted **164**; `splice-gate` and
> `partition-gate` **OK**; probe `--decision D490 --allow-dirty` → **17 killed · 1 known survivor · 0
> GAP · 0 stale · 0 clobber · 0 error**. ✅ **Hard-rules line held — `docs/` untouched,
> `progressLog.test.ts` byte-unchanged, `ARCHIVES` not stepped by the slice.**
>
> **(3) AFTER THE SWEEP: the close-out.** Structural completeness from unique progress-line ids,
> confirm the line, update this stamp's tail and this `(0)` block, append to the `| **D490** |` row,
> add any convention BEFORE `## Git / commits`, re-run `check`, commit.
>
> **(4) THEN D491 — AND THE STANDING LESSON IS THAT A REFUSAL ROTS AND NOTHING RE-DERIVES IT.**
> 🛑 **D490's family had ZERO mutant rows across 87 decisions, and D478's loop is why**: the refusal
> stopped the family being built, an unbuilt family attracted no rows, and no row rested on the
> refusal — so nothing forced anyone to re-check it. **Its stated reason had been false since D488**
> (the recording mill it said the engine lacked) **and it miscounted the reader surface as TWELVE**
> (thirteen since D417). ⚠️ **Before pricing any residue row from a recorded refusal, re-derive the
> refusal itself** — five consecutive slices have now found an inherited price naming something
> already built, **and at D490 my own correction of the price was ALSO half-stale.**
>
> **(5) THE ROWS STILL OPEN, RE-PRICED AT D490.** ⚠️ **The `discarded in this way` family is CLOSED**
> (12 sentences / 27 printings), so `deckMillFilteredScale`'s and `discardScaledDamage`'s "what is
> left" rungs now assert an **EMPTY set** — the owner and both cardinalities are named beside the
> emptiness so they still redden on a widening, but **a family with nothing left refused is a weaker
> witness than one with a leftover.** Know that before picking a neighbour. **`SUBST-4`** (*"Each
> player draws 3 cards."*) — a mandatory opponent draw, a six-file witness re-point, a park/no-park
> call; ⚠️ **note this is a second "each player" sentence and D490 just built that walk for a mill —
> check whether `handRefresh`'s `who:"both"` already spells it before pricing anything.** **Corpus
> 487**; **the two `ex`/`V` SPREADS** (2 sentences / 4 printings); **529**, **569**, **file lines 268
> / 537**, **D482's (B)**. 🛑 **`Ancient`/`Future`/`Tera` off the table, 27th slice.**
>
> **(6) THE TARGETING RULES, thirty-three clauses.** (a)–(ee) as at D489, plus: (ff) 🆕 **D490-i: a
> BYTE PIN CANNOT CATCH A PHANTOM SPECIMEN.** `deckTopMill`'s near-miss said *"verbatim off the local
> D1"* and carried an invented damage figure (100 for a printed 140), copied into `effects.ts` twice;
> both rungs on it were green for two independent wrong reasons. **Assert a specimen is a ROW OF
> `legalAttackCorpus()` and read its printing count off the corpus** — a pin measures an invention as
> faithfully as the truth. (gg) 🆕 **D490-ii: a witness re-pointed onto a READER's return value is
> blind to the ASSEMBLER.** All four family suites stayed green under a mutation that mills the wrong
> deck; only the behavioural suite discriminated. **Re-point onto the OP where you can**, and where
> the reader is the only available subject, SAY that the family's witnesses are blind to assembly.
> (hh) 🆕 **D490-iii: when two shipped precedents disagree, find the axis that distinguishes them
> rather than picking one.** `counterEachAll` walks absolute seats and `handRefresh` walks
> controller-first; the distinguishing fact is whether the op emits one event per BODY or one per
> SEAT. **And test it from p2's chair** — absolute-vs-controller is inert on every board where p1
> attacks.
>
> **(7) THE STANDING HAZARDS.** 🛑 **NEVER WRITE TO THE TREE WHILE THE HARNESS IS IN FLIGHT.**
> **`--only` does NOT accumulate.** `--allow-dirty` MANDATORY; `--decision` matches by
> `String.includes`. ⚠️ **`patches LITERALLY` 21; near-miss population 8 — any movement, read the
> rows.** ⚠️ **A `replace` omitting a REQUIRED field reports ERROR — `precheck` gates `find` only.**
> ⚠️ **THE CENSUS TAX LANDS IN WAVES** (D487 five, D488 four, D489 four, D490 three) — **and D490's
> wave 1 was small only because 31 literals across 16 files had already been found by grepping the
> OLD VALUES as bare tokens**, which is faster than letting the runner find them one throw at a time.
> **`BUILT.attack` FIRST** (D449). ⚠️ **The sentence and printing deltas DISAGREE here (+1 / +2)**, so
> `.length` sites and `units(…)` sites take different numbers, **including in `compoundCompose`'s
> `claimedWhole`**, which this sentence enters because it is period-joined AND claimed whole.
> ⚠️ **A `Math.round` numerator has a SOLUTION SET** — D490's moved 18 → 19 while the numerator held
> at 24, derived by intersecting `{24}` at both denominators. 🛑 **EVERY COUNTING INSTRUMENT NEEDS ITS
> SCOPE CHECKED BEFORE ITS NUMBER IS QUOTED, AND SAYING SO IN A CONVENTION DID NOT PREVENT THE
> REPEAT.** The version tax at this head is **89 occurrences / 63 files / 19 `it(` titles**;
> **`git grep` reports 85 / 62 because it sees only TRACKED files** and the new suite contributes
> exactly 4 / 1. D489 wrote this rule and D490's report still quoted a tracked-only occurrence count
> beside an untracked-inclusive file count — **the same mixed figure, one slice later.** ⚠️ **D489's
> own history-exception list was also one short** (it named four; there were five — it called *"this
> heading"* the paragraph inside its changelog entry and missed the entry's own heading), which is
> **D488's self-reference rule firing a second time.** **Re-measure; never inherit a figure or its
> exception list.** 🛑 **`ARCHIVES` is the RITUAL's, and the hard-rules block must SAY so every time.**

### Prior resume point (P3-M5 — D489, the hand discard scaled by a slot, kept for continuity)

> ### ▶ THE NEXT CONCRETE ACTION (written 2026-09-08, after D489)'''
s=s.replace(anchor,NEW,1)
io.open(p,'w',encoding='utf-8').write(s)
print('ok')
