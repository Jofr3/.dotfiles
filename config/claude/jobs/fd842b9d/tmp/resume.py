import io
p='docs/progress.md'
s=io.open(p,encoding='utf-8').read()
anchor='## NEXT (resume point)\n\n> ### ▶ THE NEXT CONCRETE ACTION (written 2026-09-08, after D487)'
assert s.count(anchor)==1
NEW = r'''## NEXT (resume point)

> ### ▶ THE NEXT CONCRETE ACTION (written 2026-09-08, after D488)
>
> ✅ **`bun run check` IS GREEN — 474 files / 10,756 tests, `CHECK_EXIT=0`**, `typecheck-coverage`
> **720 → 721**, `lint-coverage` 723. **`it(` delta +31 and vitest delta +31 — EXACT**, and the new
> suite has exactly 31. Engine **0.382.0 → 0.383.0**. **`MATCH_RECORD_VERSION` 29, HELD and DRIVEN
> at the hard address.** Corpus **2,301 → 2,312**, archive ratchet **158**.
>
> 🛑 **(0) THE DEBT: COMMIT FIRST, THEN THE WHOLE-CORPUS SWEEP.**
> ⚠️ **ONE UNTRACKED PATH: `packages/engine/src/deckMillFilteredScale.test.ts`.** `git add` EXPLICIT
> PATHS — it is not in any tracked-file glob and a path-less commit silently omits the only file
> that witnesses the slice.
>
> **THE PREDICTION, COMMITTED BEFORE THE RUN — forty-ninth consecutive slice to name its number
> first, and the forty-eighth landed exactly:**
>
> > **`2270 killed · 42 known survivor(s) · 0 GAP(s) · 0 stale · 0 skipped(dirty) · 0 clobber(s) ·
> > 0 error(s)` over 2,312**
>
> `2259 + 11 = 2270`, `42 + 0 = 42`, `2301 + 11 = 2312`, closing `2270 + 42 = 2312`.
>
> **(1) PRE-CLEARANCE — seven of the nine survivor-housing files clear by file.** They are
> **byte-unchanged and absent from `numstat` entirely**. The two that moved: `effects.ts` (12
> survivors, **193 / −3** — the three op-declaration lines, each replaced in place) and
> `interpreter.ts` (12 survivors, **56 / −2** — the `damageDefender` amount line and the mill's
> zero-guard line). **Both deletion sets are EXACTLY the sites of the three re-pointed mutant rows**
> (`D403-the-interpreter-ignores-the-addend`, `D316-flat-hit-skips-weakness`,
> `D455-the-mill-announces-an-empty-deck`), all three re-transcribed with their claims unchanged.
> Witness that no other anchor broke: `precheck` re-finds all **2,312** `find` strings exactly once
> (D469). Totals **74 files, +686 / −159**; every other deletion is a mechanical 1-for-1 version-tax
> or census-pin replacement.
>
> **(2) ALREADY VERIFIED INDEPENDENTLY — run the SWEEP.** `check` GREEN **474 / 10,756**; `precheck`
> clean at **2,312**, `patches LITERALLY` **HELD at 21**, near-miss **HELD at 8**;
> `residue-census-gate` **OK, §A 119 / 93 / 132**; `opaque-anatomy-gate` **OK**, §D **9 classes / 67
> sentences / 98 printings**, §E **36,649** pairs, admitted **166**; `splice-gate` and
> `partition-gate` **OK**; probe `--decision D488 --allow-dirty` → **11 killed · 0 survivors · 0 GAP
> · 0 stale · 0 clobber · 0 error**, row count three ways (11 progress lines, 11 table rows,
> `2312 − 2301 = 11`). ✅ **Hard-rules line held again — `docs/` untouched at agent exit, `ARCHIVES`
> not stepped by the slice.**
>
> **(3) AFTER THE SWEEP: the close-out.** Structural completeness from the module, confirm the line,
> update this stamp's tail and this `(0)` block, append to the `| **D488** |` row, add any convention
> BEFORE `## Git / commits`, re-run `check`, commit.
>
> **(4) THEN D489 — AND THE TARGETING LESSON IS THAT PAIR-HOOD IS CHEAP TO MEASURE.** 🛑 **D488
> deleted each axis in turn and re-ran all 13 readers, and the answer came back in minutes**: one
> mechanism, two blockers, both carried by both rows, the noun irrelevant. D483 ran the same test and
> got a 2+2 SPLIT. **Neither answer was guessable from the sentences.** ⚠️ **Run axis deletion on any
> candidate cluster before pricing it as one slice or as several** — it is the same cost either way
> and it is the only thing that distinguishes them. 🆕 **And the D487-ii witness-load rule now has a
> second data point that cuts the OTHER way**: D488's two rows shared **one file / two rungs**, so
> building both cost what building one would have. **Witness load is per-MECHANISM, not per-ROW.**
>
> **(5) THE ROWS STILL OPEN, RE-PRICED AT D488.** ⚠️ **The re-pointed rung in
> `discardScaledDamage.test.ts` §1 names TWO blockers for its leftovers and EXACTLY ONE IS NOW PAID**
> — the recording mill. **The `damageChosen` that reads a slot is still unbuilt, and it is what the
> one remaining sentence of that anchor needs.** **`SUBST-4`** (*"Each player draws 3 cards."*) — the
> blocker is a **mandatory opponent draw** (`opponentMayDraw` ships but is a MAY, parks, and the
> opponent answers) plus a **six-file** witness re-point and a park/no-park design call. **Corpus
> 487** — a fifth member plus a widened anchor, **two** witness files. **The two `ex`/`V` SPREADS**
> (2 sentences / 4 printings) — a filtered flat whole-side DAMAGE walk. **529**, **569**, **file
> lines 268 / 537**, **D482's (B)** — unchanged. 🛑 **`Ancient`/`Future`/`Tera` off the table, 25th
> slice.**
>
> **(6) THE TARGETING RULES, twenty-seven clauses.** (a)–(z) as at D487, plus: (aa) 🆕 **D488-i:
> measure pair-hood by AXIS DELETION, never by sentence resemblance.** Delete each axis alone and
> re-run the readers; two rows are one slice iff they refuse and build together on every axis.
> (bb) 🆕 **D488-ii: when a near-miss is an ALGEBRAIC identity on the natural board, the finding is
> WHICH BOARD to write, not whether the build is justified.** D488's empty-pile board made "count the
> record" and "count the pile afterwards" equal for every deck; pre-seeding the pile is what made the
> suite say anything. **And a candidate no board separates at all** (the mill-side filter) **is
> separated by CONTENTS, not by quantity.**
>
> **(7) THE STANDING HAZARDS.** 🛑 **NEVER WRITE TO THE TREE WHILE THE HARNESS IS IN FLIGHT.**
> **`--only` does NOT accumulate.** `--allow-dirty` MANDATORY; `--decision` matches by
> `String.includes`. ⚠️ **`patches LITERALLY` 21 — hazard is FALLING; near-miss population 8 — any
> movement, read the rows.** **Python's `str.replace` REJECTS a function second argument.** ⚠️ **A
> `replace` omitting a REQUIRED field reports ERROR — `precheck` gates `find` only.** ⚠️ **READ EACH
> ROW'S `what` AGAINST ITS `replace` BEFORE PROBING**; **every rung differs from its control in
> exactly ONE axis** (D484); **a rung passing is not evidence it still tests its stated claim**
> (D486). ⚠️ **THE CENSUS TAX LANDS IN WAVES** because an earlier failing `expect(` masks later ones
> in the same `it` — D487 took FIVE rounds, D488 took FOUR (20, 14, 3, green). **`BUILT.attack` is a
> RECORDED CONSTANT the chains subtract FROM — bump it FIRST** (D449). 🆕 ⚠️ **A `Math.round`
> numerator can be DERIVED BY INTERSECTION rather than read**: D488's `round(inRows/unbuiltAttack ×
> 100) === 18` is green at BOTH denominators, and `inRows ∈ {33,34} ∩ {32,33} = {33}` — **the
> fraction held at 18 while only the denominator moved**, so a blind edit there would have been
> invisible. ⚠️ **Version tax measured at exactly 81 occurrences / 61 files / 17 `it(` titles, with
> FOUR history occurrences left alone** — **D487's paragraph said THREE and was wrong in its
> exception list while right in its arithmetic**, because it quotes the arrow it is counting; a
> figure and its exception list are two claims and only the figure had a witness. 🛑 **`ARCHIVES` is
> the RITUAL's, and the hard-rules block must SAY so every time.**

### Prior resume point (P3-M5 — D487, the version-costing census, kept for continuity)

> ### ▶ THE NEXT CONCRETE ACTION (written 2026-09-08, after D487)'''
s = s.replace(anchor, NEW, 1)
io.open(p,'w',encoding='utf-8').write(s)
print('resume ok')
