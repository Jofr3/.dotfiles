import io
p='docs/progress.md'
s=io.open(p,encoding='utf-8').read()
anchor='## NEXT (resume point)\n\n> ### ▶ THE NEXT CONCRETE ACTION (written 2026-09-10, after D495)'
assert s.count(anchor)==1
NEW = r'''## NEXT (resume point)

> ### ▶ THE NEXT CONCRETE ACTION (written 2026-09-11, after D496)
>
> ✅ **`bun run check` IS GREEN — 481 files / 10,969 tests, `CHECK_EXIT=0`.** ⚠️ **THE TEST COUNT IS
> UNCHANGED AND THAT IS CORRECT**: this slice strengthened assertions **inside existing `it` blocks**
> and added none, so there is no `it(` delta to reconcile. Engine **0.390.0 — NOT BUMPED**.
> **`MATCH_RECORD_VERSION` 29.** Corpus **2,401 → 2,418**, archive ratchet **166**.
>
> 🛑 **(0) THE DEBT: COMMIT FIRST, THEN THE WHOLE-CORPUS SWEEP.**
> ⚠️ **NO UNTRACKED PATH THIS TIME** — the whole diff is **two tracked files**,
> `packages/engine/src/preventBlock.test.ts` and `scripts/mutation/mutants.ts`. `git add` EXPLICIT
> PATHS anyway. 🛑 **LAUNCH THE SWEEP DETACHED WITH `setsid`** (D489, held at D490–D495).
>
> **THE PREDICTION, COMMITTED BEFORE THE RUN — fifty-seventh consecutive slice to name its number
> first, and the fifty-sixth landed exactly:**
>
> > **`2374 killed · 44 known survivor(s) · 0 GAP(s) · 0 stale · 0 skipped(dirty) · 0 clobber(s) ·
> > 0 error(s)` over 2,418**
>
> `2357 + 17 = 2374`, `44 + 0 = 44`, `2401 + 17 = 2418`, closing `2374 + 44 = 2418`.
> 🛑 **AND THE RESIDUE, `BUILT.attack` AND THE ENGINE VERSION DO NOT MOVE.** Residue stays **85 /
> 120**, `BUILT.attack` stays **1612**, `OPAQUE` stays **63 / 92**. **A coverage slice that reports a
> residue delta has done something wrong.**
>
> **(1) PRE-CLEARANCE — THE SIMPLEST OF THE RUN.** `mutants.ts` is **194 / 0, pure addition**;
> `preventBlock.test.ts` is 40 / 8. **ZERO of the 44 declared survivors live in either file**, so all
> 44 clear at D472's step 2 and no reason needed re-deriving. The 44 reasons were needled anyway for
> structures this slice touched: three name `preventDamage`, all three in `continuous.ts`, and all
> three quantify over **registry continuous-passive fields**, not D142's op. Untouched.
>
> **(2) ALREADY VERIFIED INDEPENDENTLY — run the SWEEP.** `check` GREEN **481 / 10,969**; `precheck`
> clean at **2,418**; `splice-gate`, `partition-gate`, `residue-census-gate` (§A **111 / 85 / 120**,
> unmoved) and `opaque-anatomy-gate` all **OK**; probe `--decision D496 --allow-dirty` → **17 killed
> · 0 survivors · 0 GAP · 0 stale · 0 clobber · 0 error**. ✅ **`patches LITERALLY` HELD at 22** — no
> D496 row's `replace` carries a `String.replace` special (the `$` in `\.$/;` is followed by `/`,
> which is not one). ✅ **Hard-rules line held; engine version and `MATCH_RECORD_VERSION` verified
> untouched by `git diff --name-only`.**
>
> **(3) AFTER THE SWEEP: the close-out.** Structural completeness from unique progress-line ids,
> confirm the line, update this stamp's tail and this `(0)` block, append to the `| **D496** |` row,
> add any convention BEFORE `## Git / commits`, re-run `check`, commit.
>
> **(4) THEN D497 — AND THE COVERAGE SEAM IS NOW A MEASURED, REPEATABLE AUDIT.** 🆕 **The
> empty-`--decision` sweep found SEVEN ids, not three** (D142–D146, D148, D154), **and from D211
> onward only 12 ids select zero rows** — nine are harness/instrument decisions, and the three worth
> a successor's look are **D364, D418, D419**. ⚠️ **D418/D419 are the reader-surface slices whose own
> findings were about instruments going quiet**, which makes them the highest-value next absence.
> Cost: one ~40-line span script, already written to the job tmp dir this slice. 🛑 **But run the
> SPAN, not the name** — `--decision D146` selects zero rows while its region carries four `D239-*`
> rows, so the empty-`--decision` list is a **floor**, not the measurement.
>
> **(5) THE ROWS STILL OPEN.** Unchanged by this slice: residue **85 / 120**, `OPAQUE` **63 / 92**
> (74 %, **14 structurally blocked**), ceiling **~88 %**, roughly **71 sentences of reachable work**.
> 🛑 **`Ancient`/`Future`/`Tera` off the table, 33rd slice.**
> 🆕 ⚠️ **AND A DEADLINE WORTH KNOWING**: `scripts/mutation/mutants.ts` is now **2,608,763 bytes**
> against Biome's `files.maxSize` of **4,194,304**. At ~20 KB/slice that is **~79 slices** of
> headroom before D460's failure recurs. Not urgent; not invisible either.
>
> **(6) THE TARGETING RULES, fifty-five clauses.** (a)–(zz) as at D495, plus: (aaa) 🆕 **D496-i: a
> PAIR of anchors needs a PAIR of probes**, and an anchor-shape defect is **invisible to every census
> by construction** — measured, not argued: every single-axis loosening of this family's three
> anchors claims exactly the rows it claimed before. **Group a family's guards by how many members
> each rung NAMES, not by how many rungs there are.** (bbb) 🆕 **D496-ii: `--decision <D>` printing
> "No mutants selected" is a FLOOR** — it has a false-negative half (`D146`), and **`--list` ignores
> `--decision`.** (ccc) 🆕 **D496-iii: a coverage slice must state what does NOT move** — residue,
> `BUILT.attack`, census, engine version — or its prediction cannot be checked.
>
> **(7) THE STANDING HAZARDS.** 🛑 **NEVER WRITE TO THE TREE WHILE THE HARNESS IS IN FLIGHT.**
> **`--only` does NOT accumulate**; `--decision` takes ONE value (D443); 🆕 **`--list` IGNORES
> `--decision`.** ⚠️ **`patches LITERALLY` 22**; near-miss **8**. ⚠️ **A `replace` omitting a REQUIRED
> field reports ERROR.** 🛑 **A BARE `toBe(N)` REPLACEMENT IS NOT SAFE FOR SMALL LITERALS** (D492).
> ⚠️ **D463's EATEN-MINUS-SIGN TRAP DOES NOT FAIL LOUDLY** — after any front-term pass, **check the
> COLLECTED-TEST count, not just the failure count** (D495). ⚠️ **Census tax in waves** — **not
> applicable to a coverage slice**, which is itself the check that you did not touch the census.
> 🆕 ⚠️ **A FOREGROUND PROBE CAN BE SIGTERM'd BY A TOOL TIMEOUT BEFORE ITS `finally` RUNS** — D496
> had to restore `effects.ts` by hand from the HEAD blob, and **the tool recovers silently, so
> nothing else would record it** (D475). **Prefer `setsid` for anything that patches the tree.**
> 🛑 **`ARCHIVES` is the RITUAL's, and the hard-rules block must SAY so every time.**

### Prior resume point (P3-M5 — D495, the coin-gated defender attack lock, kept for continuity)

> ### ▶ THE NEXT CONCRETE ACTION (written 2026-09-10, after D495)'''
s=s.replace(anchor,NEW,1)
io.open(p,'w',encoding='utf-8').write(s)
print('ok')
