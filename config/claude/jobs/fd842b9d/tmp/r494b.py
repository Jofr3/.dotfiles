import io
p='docs/progress.md'
s=io.open(p,encoding='utf-8').read()
anchor='## NEXT (resume point)\n\n> ### ▶ THE NEXT CONCRETE ACTION (written 2026-09-10, after D493)'
assert s.count(anchor)==1
NEW = r'''## NEXT (resume point)

> ### ▶ THE NEXT CONCRETE ACTION (written 2026-09-10, after D494)
>
> ✅ **`bun run check` IS GREEN — 480 files / 10,944 tests, `CHECK_EXIT=0`**, `typecheck-coverage`
> **726 → 727**, `lint-coverage` **728 → 729**. ⚠️ **`it(` SITES 26 BUT TESTS +28**, and that is
> correct, not a discrepancy: one `it.each` over 3 seeds is one site and three tests. **Counted with
> `grep -cE '^\s+it(\.each)?[(\`]'`, which agrees with vitest exactly**; no other suite moved.
> Engine **0.388.0 → 0.389.0**. **`MATCH_RECORD_VERSION` 29.** Corpus **2,379 → 2,391**, archive
> ratchet **164**.
>
> 🛑 **(0) THE DEBT: COMMIT FIRST, THEN THE WHOLE-CORPUS SWEEP.**
> ⚠️ **ONE UNTRACKED PATH: `packages/engine/src/energyInPlaySuppressed.test.ts`.** `git add`
> EXPLICIT PATHS. 🛑 **LAUNCH THE SWEEP DETACHED WITH `setsid`** (D489, held at D490–D493).
> **POLL the summary line — a detached run sends no notification.**
>
> **THE PREDICTION, COMMITTED BEFORE THE RUN — fifty-fifth consecutive slice to name its number
> first, and the fifty-fourth landed exactly:**
>
> > **`2347 killed · 44 known survivor(s) · 0 GAP(s) · 0 stale · 0 skipped(dirty) · 0 clobber(s) ·
> > 0 error(s)` over 2,391**
>
> `2336 + 11 = 2347`, `43 + 1 = 44`, `2379 + 12 = 2391`, closing `2347 + 44 = 2391`.
> ⚠️ **THE DECLARED-SURVIVOR TERM MOVES AGAIN, 43 → 44** (it last moved at D490). The new one is
> `D494-bonus-arms-swapped`, **STRUCTURAL disjointness with its KIND named** (D468 — carries no
> guard, and correctly none) and **self-invalidating**: it reports `STALE-SURVIVOR` the day either
> pattern loses an end anchor, which two sibling rows mutate.
>
> **(1) PRE-CLEARANCE.** 81 files / 652 insertions / 168 deletions. **Only SIX deleted lines sit in
> engine sources** — 3 in `effects.ts` (all inside the authored region), 3 in `attack.ts` (**all
> comments**), **ZERO in `interpreter.ts`**. 23 of 44 survivors dismissed by file; the other 21 by
> pure-addition with `precheck` as the witness; **step 3 was needed for ZERO** — a mechanical needle
> of all 44 `survives.reason` strings against the 12 structures this slice extended returns only the
> new row. **42 neighbour rows re-probed across 5 decisions** (D493, D409, D368, D486, D445), all
> still KILLED.
>
> **(2) ALREADY VERIFIED INDEPENDENTLY — run the SWEEP.** `check` GREEN **480 / 10,944**; `precheck`
> clean at **2,391**; `residue-census-gate` **OK, §A 112 / 86 / 121**; `opaque-anatomy-gate` **OK**,
> §D **9 classes / 64 sentences / 93 printings**, §E **35,456** pairs, admitted **164**;
> `splice-gate` and `partition-gate` **OK**; probe `--decision D494 --allow-dirty` → **11 killed · 1
> known survivor · 0 GAP · 0 stale · 0 clobber · 0 error**. ✅ **Hard-rules line held.**
> ✅ **`patches LITERALLY` HELD at 22**, re-derived on D492's criterion (a bare `$` reads 214, ~10×).
>
> **(3) AFTER THE SWEEP: the close-out.** Structural completeness from unique progress-line ids,
> confirm the line, update this stamp's tail and this `(0)` block, append to the `| **D494** |` row,
> add any convention BEFORE `## Git / commits`, re-run `check`, commit.
>
> **(4) THEN D495.** 🛑 **THE FORK WAS NEVER A FORK FOR THE SECOND CONSECUTIVE SLICE.** D493's two
> branches each freed 0/0; D494's **five** branches each freed 0/0, and only the whole freed 1/1.
> **Compute each branch's solo payoff over the corpus before comparing — with the canonical residue
> predicate copied verbatim from `censusAtHead`, not a hand-rolled one** (D430). ⚠️ **And the
> composition seam is an ARMED MUTANT for the second slice running** (`D409-tail-guard-widened-to-any-reader`):
> **grep the mutant corpus for the row whose `replace` IS the widening, before writing it.**
> 🆕 **AND THE HEDGED-CLAIMS-CARRY PATTERN IS NOT A LAW.** For six slices my hedged claims were the
> accurate ones; at D494 **every confident measurement was right and the single hedge was wrong**
> (*"expect at least one more axis"* — there were three, and the obvious fourth was DEGENERATE).
> **Treat it as a tendency to check, never as a rule to lean on.**
>
> **(5) THE ROWS STILL OPEN.** Class table: **TOTAL 86 / 121**, `OPAQUE` **64 / 93** — still ~74 % of
> remaining sentences, with **14 structurally blocked**, so the ceiling without an ingest migration
> stays **~88 %**. 🆕 **Named and re-measured at THIS head, not carried:** the **coin row** (*"Your
> opponent flips a coin for each of their Benched Pokémon. … for each tails. …Weakness or
> Resistance."*, 1p) — **its leading half really does refuse**, and `attack.ts`'s corrected block now
> says so and names it. **`If you have …` residue is down to 2 sentences / 2 printings**: the `Tera
> Pokémon` bench threshold (**data-blocked — no banner column**) and the *"exactly 1 Prize card
> remaining"* status consequent. 🛑 **`Ancient`/`Future`/`Tera` off the table, 31st slice.**
>
> **(6) THE TARGETING RULES, forty-eight clauses.** (a)–(ss) as at D493, plus: (tt) 🆕 **D494-i:
> `OPAQUE` means UNCLASSIFIED, never EXPENSIVE** — row 337 was `OPAQUE` and cost **less** than its
> `COMPOUND-head` twin one slice earlier, because the instrument's three probes are all
> **single-region** and this edit needed three **separated** points. (uu) 🆕 **D494-ii: a killer set
> named from a suite's NAME is a lie in the over-broad direction** — `typedEnergyThreshold.test.ts`
> kills neither `conditionHolds` row; **hunt one suite at a time and credit the suites that actually
> discriminate.** (vv) 🆕 **D494-iii: the self-reference rule fires on the LITERAL, never on the
> PATTERN** — a paragraph that writes its grep escaped (`0\.389\.0`) does **not** match the literal
> it counts, so it does not count itself. (ww) 🆕 **D494-iv: an axis whose printed value already
> builds is DEGENERATE, and that applies to PREDICTED axes too** (D491 re-earned on a hedge rather
> than on a named axis).
>
> **(7) THE STANDING HAZARDS.** 🛑 **NEVER WRITE TO THE TREE WHILE THE HARNESS IS IN FLIGHT.**
> **`--only` does NOT accumulate**; `--decision` takes ONE value (D443). `--allow-dirty` MANDATORY.
> ⚠️ **`patches LITERALLY` 22**; near-miss **8**. ⚠️ **A `replace` omitting a REQUIRED field reports
> ERROR.** 🛑 **A BARE `toBe(N)` REPLACEMENT IS NOT SAFE FOR SMALL LITERALS** (D492) — patch **by
> line number from the runner's `file:line`**, and **undo LINES, never VALUES**; the suite stays
> GREEN through such an over-patch. ⚠️ **CENSUS TAX IN WAVES** — D494 took **four**, and ⚠️ **waves 2
> and 3 were the SAME `it` blocks**, the sibling assertion behind the first throw every time (D462).
> **Count MATCHES not LINES**; **`BUILT.attack` FIRST** (D449); **splice a twice-per-line marker at a
> COLUMN-ASSERTED occurrence** (D463). ⚠️ **A `Math.round` numerator has a SOLUTION SET** — D494's
> intersected to **{24}** and the rung is now strictly tighter than before, with no edit. ✅ **VERSION
> TAX 94 occurrences / 67 files / 22 `it(` titles**, re-measured by the caller against `git grep`'s
> **92 / 66** — the difference is exactly the untracked suite. ⚠️ **THE INHERITED TOTAL WAS SHORT BY
> ONE**: D493's note said 92 and the true figure was 93, **the 93rd being that note's own sentence** —
> D488's self-reference rule firing inside the paragraph that warns about it. **The mechanical bump
> had to skip TWO sites, not one** (an arrow AND a count sentence). **Re-measure both after the edit;
> never inherit either.** 🛑 **`ARCHIVES` is the RITUAL's, and the hard-rules block must SAY so every
> time.**

### Prior resume point (P3-M5 — D493, the suppressed bench-counter multiplier, kept for continuity)

> ### ▶ THE NEXT CONCRETE ACTION (written 2026-09-10, after D493)'''
s=s.replace(anchor,NEW,1)
io.open(p,'w',encoding='utf-8').write(s)
print('ok')
