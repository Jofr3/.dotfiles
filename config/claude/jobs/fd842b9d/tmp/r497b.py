import io
p='docs/progress.md'
s=io.open(p,encoding='utf-8').read()
anchor='## NEXT (resume point)\n\n> ### ▶ THE NEXT CONCRETE ACTION (written 2026-09-11, after D496)'
assert s.count(anchor)==1
NEW = r'''## NEXT (resume point)

> ### ▶ THE NEXT CONCRETE ACTION (written 2026-09-11, after D497)
>
> ✅ **`bun run check` IS GREEN — 481 files / 10,969 tests, `CHECK_EXIT=0`.** ⚠️ **UNCHANGED, AND
> THAT IS CORRECT** — this slice adds zero `it(` blocks, so there is no test delta to reconcile
> (D496). Engine **0.390.0 — NOT BUMPED**. **`MATCH_RECORD_VERSION` 29.** Corpus **2,418 → 2,424**,
> declared survivors **44 → 46**, archive ratchet **167**.
>
> 🛑 **(0) THE DEBT: COMMIT FIRST, THEN THE WHOLE-CORPUS SWEEP.**
> ⚠️ **NO UNTRACKED PATH.** The whole diff is **ONE tracked file**, `scripts/mutation/mutants.ts`,
> at **80 insertions / 0 deletions**. `git add` EXPLICIT PATHS anyway. 🛑 **LAUNCH THE SWEEP DETACHED
> WITH `setsid`** (D489, held at D490–D496).
>
> **THE PREDICTION, COMMITTED BEFORE THE RUN — fifty-eighth consecutive slice to name its number
> first, and the fifty-seventh landed exactly on BOTH halves:**
>
> > **`2378 killed · 46 known survivor(s) · 0 GAP(s) · 0 stale · 0 skipped(dirty) · 0 clobber(s) ·
> > 0 error(s)` over 2,424**
>
> `2374 + 4 = 2378`, `44 + 2 = 46`, `2418 + 6 = 2424`, closing `2378 + 46 = 2424`.
> ⚠️ **THE DECLARED-SURVIVOR TERM MOVES BY TWO** — the largest step of the run — and **both are
> deliberate, kind-named and `--full`-verified**, not accidents.
> 🛑 **AND THE NO-MOVE HALF: residue stays 85 / 120, `BUILT.attack` stays 1612, `OPAQUE` stays 63 /
> 92, engine stays 0.390.0.**
>
> **(1) PRE-CLEARANCE — THE SIMPLEST POSSIBLE.** **One file, pure addition, zero deletions**, so
> D472's step 1 clears **all 46** survivors outright, and `precheck` re-finding all **2,424** `find`
> strings exactly once is the proof that no existing line moved (D469). The one survivor whose `find`
> lives in the edited file (`D481-survivor-reason-is-miskeyed`) has an untouched anchor. Three
> survivors matched a loose vocabulary regex and were **read in full** — all three are about regex
> anchors over the printed catalog, none about the reader surface.
>
> **(2) ALREADY VERIFIED INDEPENDENTLY — run the SWEEP.** `check` GREEN **481 / 10,969**; `precheck`
> clean at **2,424**; `splice-gate`, `partition-gate`, `residue-census-gate` (§A **111 / 85 / 120**,
> unmoved) and `opaque-anatomy-gate` all **OK**; probe `--decision D497 --allow-dirty` → **4 killed ·
> 2 known survivors · 0 GAP · 0 stale · 0 clobber · 0 error**. ✅ **`patches LITERALLY` HELD at 22**,
> re-derived on the `String.replace`-special criterion; **0 of the 6 D497 rows contributes.**
> ✅ **The loader-dependence was verified at ritual time**: under Bun, `Object.keys(effects)` order
> **=== sorted**, so `found.sort(…)` really is a no-op there.
>
> **(3) AFTER THE SWEEP: the close-out.** Structural completeness from unique progress-line ids,
> confirm the line, update this stamp's tail and this `(0)` block, append to the `| **D497** |` row,
> add any convention BEFORE `## Git / commits`, re-run `check`, commit.
>
> **(4) 🛑 THEN D498 — AND THE DEBT IS NAMED, PRICED AND SHOULD BE TAKEN NEXT.**
> **`resolvedByAnyReader()` (`censusAttackCorpus.ts` lines 805–816) carries ZERO mutant rows.** It is
> **the predicate behind every residue and `BUILT.attack` figure in the repo** — a strictly more
> load-bearing half of the same instrument D497 just guarded, and **the D497 brief never measured
> it.** Its interesting mutations, named by the builder and **deliberately not guessed at**:
> `.some` → `.every`; `!== null` → `!== undefined`; and especially **`!== null` → `!= null`, which is
> probably equivalent today and is a STRICTLY BETTER GUARD than what ships** — it would catch the
> `undefined`-returning enrolment the doc block warns about. ⚠️ **Each needs its own witness survey
> first**; guessing a killer set is the *row-that-dies-for-a-reason-nobody-checked* failure. **Priced
> at one slice.**
>
> **(5) THE ROWS STILL OPEN.** Unchanged by this slice: residue **85 / 120**, `OPAQUE` **63 / 92**
> (74 %, **14 structurally blocked**), ceiling **~88 %**, roughly **71 sentences of reachable work**.
> 🛑 **`Ancient`/`Future`/`Tera` off the table, 34th slice.** ⚠️ **`mutants.ts` is ~2.63 MB against
> Biome's 4 MB `files.maxSize`** — roughly 78 slices of headroom (D496).
>
> **(6) THE TARGETING RULES, fifty-nine clauses.** (a)–(ccc) as at D496, plus: (ddd) 🆕 **D497-i: a
> module namespace's key order is a property of the LOADER, not the module** — spec-sorted under Bun,
> declaration-ordered under vitest, on the same bytes. **Measure enumeration order in the runner that
> owns the answer.** (eee) 🆕 **D497-ii: "no witness exists" is a claim about a GREP, and the shape
> you grep for decides it.** Looking for length pins found none for order; ~50 order-sensitive
> `toEqual` sites existed. **The diagnosis changes the slice**: *untested* needs a witness,
> **driven-but-unpinned needs ROWS** (D474). **And classify witnesses by what they can SEE** — 2 of
> them re-sort and are blind to order by construction. (fff) 🆕 **D497-iii: both halves of a
> two-clause guard deserve a row, and the PAIR is the finding** — one conjunct is load-bearing, one
> is defence in depth, and only the pair says which. (ggg) 🆕 **D497-iv: `equivalent` has a third
> kind, PURITY** — a memo over an input fixed at load, whose falsifier is that nothing can stub the
> input mid-run.
>
> **(7) THE STANDING HAZARDS.** 🛑 **NEVER WRITE TO THE TREE WHILE THE HARNESS IS IN FLIGHT.**
> **`--only` does NOT accumulate**; `--decision` takes ONE value (D443) and is a **FLOOR** with a
> false-negative half (D496); **`--list` IGNORES `--decision`.** ⚠️ **`patches LITERALLY` 22**;
> near-miss **8**. ⚠️ **A `replace` omitting a REQUIRED field reports ERROR.** ⚠️ **A FOREGROUND
> PROBE CAN BE SIGTERM'd BEFORE ITS `finally` RUNS and the tool recovers silently** (D496) — **prefer
> `setsid` for anything that patches the tree**, and verify the tree against HEAD by hash afterwards.
> 🛑 **A BARE `toBe(N)` REPLACEMENT IS NOT SAFE FOR SMALL LITERALS** (D492). ⚠️ **D463's
> EATEN-MINUS-SIGN TRAP DOES NOT FAIL LOUDLY** — check the **collected-test count**, not the failure
> count (D495). ⚠️ **Census tax in waves — NOT APPLICABLE to a coverage slice**, which is itself the
> check that you did not touch the census. 🛑 **`ARCHIVES` is the RITUAL's, and the hard-rules block
> must SAY so every time.**

### Prior resume point (P3-M5 — D496, the first coverage slice, kept for continuity)

> ### ▶ THE NEXT CONCRETE ACTION (written 2026-09-11, after D496)'''
s=s.replace(anchor,NEW,1)
io.open(p,'w',encoding='utf-8').write(s)
print('ok')
