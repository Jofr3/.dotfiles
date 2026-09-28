import io
p='docs/progress.md'
s=io.open(p,encoding='utf-8').read()
anchor='## NEXT (resume point)\n\n> ### ▶ THE NEXT CONCRETE ACTION (written 2026-09-10, after D494)'
assert s.count(anchor)==1
NEW = r'''## NEXT (resume point)

> ### ▶ THE NEXT CONCRETE ACTION (written 2026-09-10, after D495)
>
> ✅ **`bun run check` IS GREEN — 481 files / 10,969 tests, `CHECK_EXIT=0`**, `typecheck-coverage`
> **727 → 728**, `lint-coverage` **729 → 730**. **`it(` delta +25 and vitest delta +25 — EXACT**, all
> in the new suite, no other suite moved, verified per file. Engine **0.389.0 → 0.390.0**.
> **`MATCH_RECORD_VERSION` 29.** Corpus **2,391 → 2,401**, archive ratchet **165**.
>
> 🛑 **(0) THE DEBT: COMMIT FIRST, THEN THE WHOLE-CORPUS SWEEP.**
> ⚠️ **ONE UNTRACKED PATH: `packages/engine/src/flipDefenderAttackLock.test.ts`.** `git add`
> EXPLICIT PATHS. 🛑 **LAUNCH THE SWEEP DETACHED WITH `setsid`** (D489, held at D490–D494).
> **POLL the summary line — a detached run sends no notification.**
>
> **THE PREDICTION, COMMITTED BEFORE THE RUN — fifty-sixth consecutive slice to name its number
> first, and the fifty-fifth landed exactly (including its moved survivor term):**
>
> > **`2357 killed · 44 known survivor(s) · 0 GAP(s) · 0 stale · 0 skipped(dirty) · 0 clobber(s) ·
> > 0 error(s)` over 2,401**
>
> `2347 + 10 = 2357`, `44 + 0 = 44`, `2391 + 10 = 2401`, closing `2357 + 44 = 2401`.
>
> **(1) PRE-CLEARANCE — THE CLEANEST OF THE RUN.** `effects.ts` is **110 insertions / 0 deletions**
> and `interpreter.ts`, `continuous.ts`, `attack.ts`, `flow.ts`, `redact.ts`, `refusedPrintings.ts`,
> `GameHud.tsx` and `splice-gate.ts` are **untouched** — which dismisses **30 of 44** survivors by
> file. The other **14** live in `effects.ts`, cleared by pure addition with `precheck` re-finding all
> **2,401** `find` strings exactly once. 🆕 **And a third step nobody had needed before**: none of the
> 14 `find` spans lies within **245 lines** of either inserted block, so **no order-permutation pair
> straddles an insertion**. The only pre-existing row whose bytes changed is
> `D275-engine-version-drifts-again`, re-probed KILLED. Neighbours re-probed: **D408 8/8, D410 4/4**.
>
> **(2) ALREADY VERIFIED INDEPENDENTLY — run the SWEEP.** `check` GREEN **481 / 10,969**; `precheck`
> clean at **2,401**; `residue-census-gate` **OK, §A 111 / 85 / 120**; `opaque-anatomy-gate` **OK**,
> §D **9 classes / 63 sentences / 92 printings**, §E **34,965** pairs, admitted **163**;
> `splice-gate` and `partition-gate` **OK**; probe `--decision D495 --allow-dirty` → **10 killed · 0
> survivors · 0 GAP · 0 stale · 0 clobber · 0 error**. ✅ **Hard-rules line held.** ✅ **`patches
> LITERALLY` HELD at 22**, re-derived on the `String.replace`-special criterion before and after.
>
> **(3) AFTER THE SWEEP: the close-out.** Structural completeness from unique progress-line ids,
> confirm the line, update this stamp's tail and this `(0)` block, append to the `| **D495** |` row,
> add any convention BEFORE `## Git / commits`, re-run `check`, commit.
>
> **(4) 🛑 THEN D496 — AND THE NEXT SLICE HAS A NAMED, MEASURED, CHEAP TARGET FOR ONCE.**
> **`--decision D142`, `--decision D144` and `--decision D148` each print "No mutants selected."**
> **D142's gated-prevent family is 19 LEGAL PRINTINGS — the largest single mapping in D134's census —
> and has been executable by NOTHING for ~350 decisions.** Every green sweep in that span said
> nothing about it. **Verified at ritual time by running all three.** ⚠️ **This is a coverage slice,
> not a build slice**: the residue does not move, `BUILT.attack` does not move, and the census stands
> still — so **say so in the prediction and do not expect a residue delta.** Price, measured by the
> builder: **2–4 rows apiece**, both arms `test`-only with **no captures**, and `preventBlock.test.ts`
> / `tailsGatedOp.test.ts` **already field seeded boards for both faces**, so **the killer sets are
> free.** 🆕 **And the general rule this exposes: a family can be BUILT, GREEN and CENSUS-COMPLETE
> while being executable by nothing.** `--decision <D>` printing *"No mutants selected"* is the
> cheapest audit in the toolkit and nothing runs it on a cadence. **Consider sweeping every decision
> id for it once.**
>
> **(5) THE ROWS STILL OPEN.** Residue **85 / 120**; **`OPAQUE` 63 / 92** — still ~74 % of remaining
> sentences, **14 structurally blocked**, ceiling **~88 %**. The `During your opponent's next turn,`
> family is **42 sentences / 151 printings, 27 built / 15 not** — the largest reachable group, and
> now one member lighter. 🛑 **`Ancient`/`Future`/`Tera` off the table, 32nd slice.**
>
> **(6) THE TARGETING RULES, fifty-two clauses.** (a)–(ww) as at D494, plus: (xx) 🆕 **D495-i: a
> WEIGHT-1-ONLY lattice is a distinct warrant.** When every segment of the print is already claimed
> and only the combination has no reader, there is no prerequisite half and no superset to compose
> from — a different justification for a whole-sentence anchor than *"no proper subset builds"*, and
> the opposite shape from D489/D490/D494. **Report the built-by-weight vector, not just the
> conclusion.** (yy) 🆕 **D495-ii: enumerate a family by BOTH faces of its gate.** A
> `^Flip a coin\. If heads,` pattern cannot see an `If tails, … If heads, …` row; the caller's count
> was wrong for exactly that reason. (zz) 🆕 **D495-iii: a recorded refusal that quotes a PRICE must
> have the price re-derived, not just the expressibility claim** — half of D495's inherited price was
> real and half was one fixture too high, because D452's file-local `cardPool` keeps a demonstrator
> out of `FIXTURE_POOL` entirely.
>
> **(7) THE STANDING HAZARDS.** 🛑 **NEVER WRITE TO THE TREE WHILE THE HARNESS IS IN FLIGHT.**
> **`--only` does NOT accumulate**; `--decision` takes ONE value (D443). ⚠️ **`patches LITERALLY`
> 22**; near-miss **8**. ⚠️ **A `replace` omitting a REQUIRED field reports ERROR.** 🛑 **A BARE
> `toBe(N)` REPLACEMENT IS NOT SAFE FOR SMALL LITERALS** — patch **by line number**, **undo LINES not
> VALUES**, and **verify by paired diff analysis** (D492; D495 patched 43 literals that way and
> checked every value netted ±1). ⚠️ **CENSUS TAX IN WAVES** — four again, with **waves 2 and 3 the
> same `it` blocks** (D462). **Count MATCHES not LINES** (D495: 21 front terms on **18 lines**).
> 🆕 🛑 **D463's EATEN-MINUS-SIGN TRAP DOES NOT FAIL LOUDLY, AND THE CONVENTION'S CORRECT FORM WAS
> READ AND STILL GOT WRONG ON THE FIRST PASS.** A marker *including* the `- ` produces
> `length - - 1 /*D495*/ 1 /*D494*/`; `git diff` looks plausible; what surfaced it was a
> **`PARSE_ERROR` in 8 files with 210 tests silently NOT COLLECTED while the summary still read "15
> failed."** **After any front-term pass, check the collected-test count, not just the failure
> count.** ⚠️ **A `Math.round` numerator has a SOLUTION SET.** ✅ **VERSION TAX 97 / 68 / 23**,
> predicted at 97/68/23 **before the suite existed** and landed exactly; `git grep` reads **94 / 67**.
> 🆕 **The next slice's exception list is TWO** (this slice authored two arrow-form references), and
> **the paragraph recording it writes the literal ESCAPED so it does not count itself** — D494's
> precondition, checked, and a first draft that *did* count itself moved the figure 97 → 98.
> 🛑 **`ARCHIVES` is the RITUAL's, and the hard-rules block must SAY so every time.**

### Prior resume point (P3-M5 — D494, the untyped Energy-in-play threshold, kept for continuity)

> ### ▶ THE NEXT CONCRETE ACTION (written 2026-09-10, after D494)'''
s=s.replace(anchor,NEW,1)
io.open(p,'w',encoding='utf-8').write(s)
print('ok')
