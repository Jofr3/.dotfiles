import io
p='docs/progress.md'
s=io.open(p,encoding='utf-8').read()
anchor='## NEXT (resume point)\n\n> ### ▶ THE NEXT CONCRETE ACTION (written 2026-09-11, after D497)'
assert s.count(anchor)==1
NEW = r'''## NEXT (resume point)

> ### ▶ THE NEXT CONCRETE ACTION (written 2026-09-11, after D498)
>
> ✅ **`bun run check` IS GREEN — 481 files / 10,969 tests, `CHECK_EXIT=0`.** ⚠️ **UNCHANGED, AND
> CORRECT** — zero new `it(` blocks, so there is no test delta to reconcile (D496). Engine
> **0.390.0 — NOT BUMPED**. **`MATCH_RECORD_VERSION` 29.** Corpus **2,424 → 2,427**, declared
> survivors **46 → 47**, archive ratchet **168**.
>
> 🛑 **(0) THE DEBT: COMMIT FIRST, THEN THE WHOLE-CORPUS SWEEP.**
> ⚠️ **NO UNTRACKED PATH.** The whole diff is **ONE tracked file**, `scripts/mutation/mutants.ts`,
> at **70 insertions / 0 deletions**. 🛑 **LAUNCH THE SWEEP DETACHED WITH `setsid`** (D489, held at
> D490–D497).
>
> **THE PREDICTION, COMMITTED BEFORE THE RUN — fifty-ninth consecutive slice to name its number
> first, and the fifty-eighth landed exactly including a two-step survivor move:**
>
> > **`2380 killed · 47 known survivor(s) · 0 GAP(s) · 0 stale · 0 skipped(dirty) · 0 clobber(s) ·
> > 0 error(s)` over 2,427**
>
> `2378 + 2 = 2380`, `46 + 1 = 47`, `2424 + 3 = 2427`, closing `2380 + 47 = 2427`.
> 🛑 **AND THE NO-MOVE HALF: residue stays 85 / 120 (§A 111 / 85 / 120), `BUILT.attack` stays 1612,
> `OPAQUE` stays 63 / 92, engine stays 0.390.0.**
>
> **(1) PRE-CLEARANCE — ONE FILE, PURE ADDITION.** D472's step 1 clears **all 47** survivors
> outright; `precheck` re-finding all **2,427** `find` strings at 1× is the witness that no existing
> line moved (D469). **Zero of the 47 survivor reasons quantify over the mutant corpus** — a loose
> regex flagged six and all six matched on *"640 rows of `legalAttackCorpus()`"*, the **sentence**
> corpus. The one gate-side survivor quantifies over `run.ts`'s patching behaviour, untouched.
>
> **(2) ALREADY VERIFIED INDEPENDENTLY — run the SWEEP.** `check` GREEN **481 / 10,969**; `precheck`
> clean at **2,427**; all five gates **OK** (§A **111 / 85 / 120**, unmoved); probe `--decision D498
> --allow-dirty` → **2 killed · 1 known survivor · 0 GAP · 0 stale · 0 clobber · 0 error**.
> ✅ **`patches LITERALLY` HELD at 22** — none of the three `replace` strings contains a `$`.
> ✅ **THE POLARITY SPLIT WAS RE-DRIVEN AT RITUAL TIME AND IS EXACTLY COMPLEMENTARY**: `.every`
> reddens `extraEnergyBonus` and leaves `selfEnergyToHand` GREEN; `!== undefined` is the precise
> reverse; the file restored byte-identical.
>
> **(3) AFTER THE SWEEP: the close-out.** Structural completeness from unique progress-line ids,
> confirm the line, update this stamp's tail and this `(0)` block, append to the `| **D498** |` row,
> add any convention BEFORE `## Git / commits`, re-run `check`, commit.
>
> **(4) 🛑 THEN D499 — AND THE LOOP RETURNS TO BUILDING SENTENCES.** **Three coverage slices are
> enough and the instrument debt is discharged**: D496 covered 20 printings of card behaviour, D497
> covered the oracle, D498 covered the predicate. ⚠️ **A fourth would be padding** — and the two
> remaining instrument gaps are measured as **probably zero honest rows**: `attackReaderSurface()`'s
> only distinct mutations are type errors, and `resolvedByAnyReader`'s lattice is exhausted. **Pick a
> sentence.** Residue **85 / 120**; `OPAQUE` **63 / 92** (74 %, **14 structurally blocked**); ceiling
> **~88 %**; roughly **71 sentences of reachable work**. The largest reachable family remains
> `During your opponent's next turn,` (**42 sentences / 151 printings, 27 built / 15 not**).
> 🛑 **`Ancient`/`Future`/`Tera` off the table, 35th slice.** ⚠️ **`mutants.ts` ~2.65 MB against
> Biome's 4 MB ceiling** — roughly 77 slices of headroom (D496).
>
> **(5) 🆕 A NAMED, CHEAP REPAIR A SUCCESSOR MAY WANT.** `type Reader = (text: string) => unknown`
> means the predicate's comparison has **no type behind it** — the `X | null` guarantee lives at the
> 13 declaration sites four thousand lines away. **Narrowing `Reader` would make D498's declared
> survivor STRUCTURAL instead of population-shaped.** Priced at one type change plus whatever
> `surface()`'s `as unknown as Reader` cast then refuses. Deliberately not done in a coverage slice.
>
> **(6) THE TARGETING RULES, sixty-three clauses.** (a)–(ggg) as at D497, plus: (hhh) 🆕 **D498-i: a
> BOOLEAN predicate's witnesses split by POLARITY, and each half is blind to the other mutation** —
> CLAIM-TRUE rungs see only narrowings, CLAIM-FALSE rungs see only widenings. **Pick one axis-PURE
> suite per row and name the population suite second.** (iii) 🆕 **D498-ii: a one-line predicate can
> have NO count-preserving mutation at all** — say so with the lattice rather than filling a quota.
> (jjj) 🆕 **D498-iii: "strictly a better guard" is a claim about WHICH failure you want.** Before
> calling a stricter comparison an improvement, **ask what the loose version's failure was doing for
> you** — a catastrophic-but-LOUD failure can beat a silent-but-contained one. (kkk) 🆕 **D498-iv: an
> instrument that classifies suites must strip comments AND bracket-match, and be RUN AGAINST A PROBE
> before publishing** — a classifier's error rate is measurable in one experiment and invisible in
> its output.
>
> **(7) THE STANDING HAZARDS.** 🛑 **NEVER WRITE TO THE TREE WHILE THE HARNESS IS IN FLIGHT.**
> **`--only` does NOT accumulate**; `--decision` takes ONE value (D443) and is a **FLOOR** with a
> false-negative half (D496); **`--list` IGNORES `--decision`.** 🆕 ⚠️ **`killedByCommand` REPLACES
> `expectKilledBy`** — a row killed by both a suite and a gate can only name one, so record the other
> in prose or lose it. ⚠️ **`patches LITERALLY` 22**; near-miss **8**. ⚠️ **A `replace` omitting a
> REQUIRED field reports ERROR.** ⚠️ **A FOREGROUND PROBE CAN BE SIGTERM'd BEFORE ITS `finally` RUNS
> and the tool recovers silently** (D496) — **prefer `setsid`**, and verify the tree by hash after.
> 🛑 **A BARE `toBe(N)` REPLACEMENT IS NOT SAFE FOR SMALL LITERALS** (D492). ⚠️ **D463's
> EATEN-MINUS-SIGN TRAP DOES NOT FAIL LOUDLY** — check the **collected-test count** (D495).
> 🛑 **`ARCHIVES` is the RITUAL's, and the hard-rules block must SAY so every time.**

### Prior resume point (P3-M5 — D497, guarding the oracle, kept for continuity)

> ### ▶ THE NEXT CONCRETE ACTION (written 2026-09-11, after D497)'''
s=s.replace(anchor,NEW,1)
io.open(p,'w',encoding='utf-8').write(s)
print('ok')
