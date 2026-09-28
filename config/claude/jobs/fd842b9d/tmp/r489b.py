import io
p='docs/progress.md'
s=io.open(p,encoding='utf-8').read()
anchor='## NEXT (resume point)\n\n> ### ▶ THE NEXT CONCRETE ACTION (written 2026-09-08, after D488)'
assert s.count(anchor)==1
NEW = r'''## NEXT (resume point)

> ### ▶ THE NEXT CONCRETE ACTION (written 2026-09-08, after D489)
>
> ✅ **`bun run check` IS GREEN — 475 files / 10,792 tests, `CHECK_EXIT=0`**, `typecheck-coverage`
> **721 → 722**, `lint-coverage` **723 → 724**. **`it(` delta +36 and vitest delta +36 — EXACT**
> (35 in the new suite + 1 rung added to `handEnergyCancel.test.ts`). Engine **0.383.0 → 0.384.0**.
> **`MATCH_RECORD_VERSION` 29, HELD on the serialized alphabet.** Corpus **2,312 → 2,331**, archive
> ratchet **159**.
>
> 🛑 **(0) THE DEBT: COMMIT FIRST, THEN THE WHOLE-CORPUS SWEEP.**
> ⚠️ **ONE UNTRACKED PATH: `packages/engine/src/handDiscardScaledSnipe.test.ts`.** `git add` EXPLICIT
> PATHS — it is not in any tracked-file glob and a path-less commit silently omits the only file that
> witnesses the slice.
>
> **THE PREDICTION, COMMITTED BEFORE THE RUN — fiftieth consecutive slice to name its number first,
> and the forty-ninth landed exactly:**
>
> > **`2289 killed · 42 known survivor(s) · 0 GAP(s) · 0 stale · 0 skipped(dirty) · 0 clobber(s) ·
> > 0 error(s)` over 2,331**
>
> `2270 + 19 = 2289`, `42 + 0 = 42`, `2312 + 19 = 2331`, closing `2289 + 42 = 2331`.
>
> **(1) PRE-CLEARANCE — 30 of 42 survivors clear by file, 12 by line.** `effects.ts` is **236 / 0,
> pure addition**, and `attack.ts`, `redact.ts`, `GameHud.tsx`, `continuous.ts`, `flow.ts`,
> `splice-gate.ts` and `refusedPrintings.ts` are byte-unchanged — 30 survivors housed with zero
> deletions. The remaining 12 live in `interpreter.ts`, whose **four** deleted lines are
> `snipeAmount`'s signature, its two call sites and `if (already >= op.count)`; **none of the twelve
> quotes any of them**, checked row by row. Witness that no other anchor broke: `precheck` re-finds
> all **2,331** `find` strings exactly once (D469). ⚠️ **Three pre-existing rows DID break and were
> re-transcribed** — `D437-narrows-after-the-arity-doctrine`, `D455-hand-cost-collapses-every-copy-to-one`
> and `D455-a-forced-payment-still-asks` — all three re-probed clean, the third **shortened onto the
> line it is about** (D446).
>
> **(2) ALREADY VERIFIED INDEPENDENTLY — run the SWEEP.** `check` GREEN **475 / 10,792**; `precheck`
> clean at **2,331**, `patches LITERALLY` **HELD at 21**, near-miss **HELD at 8**;
> `residue-census-gate` **OK, §A 118 / 92 / 130**; `opaque-anatomy-gate` **OK**, §D **9 classes / 66
> sentences / 96 printings**, §E **36,168** pairs, admitted **166**; `splice-gate` and
> `partition-gate` **OK**; probe `--decision D489 --allow-dirty` → **19 killed · 0 survivors · 0 GAP
> · 0 stale · 0 clobber · 0 error**. Plus **91 neighbour rows re-probed across 9 decisions, all
> clean** (D437/D455/D448/D400/D401/D473/D420/D488/D275). ✅ **Hard-rules line held — `docs/`
> untouched at agent exit, `progressLog.test.ts` byte-unchanged, `ARCHIVES` not stepped by the
> slice.**
>
> **(3) AFTER THE SWEEP: the close-out.** Structural completeness from unique progress-line ids,
> confirm the line, update this stamp's tail and this `(0)` block, append to the `| **D489** |` row,
> add any convention BEFORE `## Git / commits`, re-run `check`, commit.
>
> **(4) THEN D490 — AND THE TARGETING LESSON IS THAT A BRIEF'S "A OR B?" IS ITSELF A CLAIM.** 🛑 **D489's
> work order priced the head as *"a seventh `discardEnergy.from` member, or D485's op mirrored"* and
> the answer was NEITHER** — `payFromHand` already had the source, the filter and the §9.2 filing and
> lacked only the quantifier. ⚠️ **Before choosing between two named carriers, grep the op union for
> the VERB THE SENTENCE PRINTS** (`grep -n 'from your hand' effects.ts`), not for the carriers the
> brief named. 🆕 **And ask what the PARK carries before pricing a union member**: `discardEnergy`'s
> six `from` members are board scopes and every machine under them takes a `PokemonRef`, so a hand
> source there changes the prompt's candidate TYPE — D457's five mirrors — rather than adding a word.
>
> **(5) THE ROWS STILL OPEN, RE-PRICED AT D489.** 🆕 **The `discarded in this way` family now has
> exactly ONE unbuilt member**: *"Discard the top card of each player's deck. This attack does 140
> **more** damage for each Energy card discarded in this way."* (2 printings) — price is a
> **both-decks** recording mill (`discardDeckTop.whose` has no *"each player"* member) **plus** the
> additive `damageDefender.base` path, and it is pinned as the standing refusal in
> `discardScaledDamage` §1. **`SUBST-4`** (*"Each player draws 3 cards."*) — a mandatory opponent
> draw, a six-file witness re-point, a park/no-park call. **Corpus 487** — a fifth member plus a
> widened anchor, two witness files. **The two `ex`/`V` SPREADS** (2 sentences / 4 printings). **529**,
> **569**, **file lines 268 / 537**, **D482's (B)** — unchanged. 🛑 **`Ancient`/`Future`/`Tera` off
> the table, 26th slice.**
>
> **(6) THE TARGETING RULES, thirty clauses.** (a)–(bb) as at D488, plus: (cc) 🆕 **D489-i: run the
> axis-deletion LATTICE, not the axis list, and substitute each axis onto its nearest BUILT spelling
> rather than deleting it** — deleting a clause outright confounds *"this axis is the blocker"* with
> *"the remainder is not a sentence"*. D489 ran all 2⁵ points × 13 readers and found **no proper
> subset builds**, which is strictly more than "one point builds". (dd) 🆕 **D489-ii: "this op parks,
> so the describer obligation is live" is a CATEGORY ARGUMENT and D478 forbids it.** Two slices
> running a brief predicted describer work from parking; both times it was empty. **Trace the one call
> site**: `withConsequence` returns the prompt unchanged unless the QUEUE holds a `recordGate` on the
> filed slot. (ee) 🆕 **D489-iii: a brief's "A or B?" fork is a claim, and the answer is often C.**
>
> **(7) THE STANDING HAZARDS.** 🛑 **NEVER WRITE TO THE TREE WHILE THE HARNESS IS IN FLIGHT.**
> **`--only` does NOT accumulate.** `--allow-dirty` MANDATORY; `--decision` matches by
> `String.includes`. ⚠️ **`patches LITERALLY` 21 — hazard is FALLING; near-miss population 8 — any
> movement, read the rows.** **Python's `str.replace` REJECTS a function second argument.** ⚠️ **A
> `replace` omitting a REQUIRED field reports ERROR — `precheck` gates `find` only.** ⚠️ **READ EACH
> ROW'S `what` AGAINST ITS `replace` BEFORE PROBING**; **every rung differs from its control in
> exactly ONE axis** (D484); **a rung passing is not evidence it still tests its stated claim**
> (D486). ⚠️ **THE CENSUS TAX LANDS IN WAVES** — D487 five, D488 four, D489 four (20/23, 16/17, 5/6,
> 1/1), **the last wave being a second chain sharing one physical line** (D456), which a per-line pass
> steps only the first of. **`BUILT.attack` is a RECORDED CONSTANT the chains subtract FROM — bump it
> FIRST** (D449); ⚠️ **the +1 sentence and +2 printings DISAGREE here**, so `.length` sites take +1
> and `units(…)` sites take +2. ⚠️ **A `Math.round` numerator has a SOLUTION SET, not a solution** —
> derive it by intersecting the green ranges at both denominators (D488). 🆕 🛑 **AND EVERY COUNTING
> INSTRUMENT NEEDS ITS SCOPE CHECKED BEFORE ITS NUMBER IS QUOTED.** The version tax at this head is
> **88 occurrences / 62 files / 18 `it(` titles** — but **`git grep` reports 84 / 61 / 17 because it
> sees only TRACKED files, and every slice's new suite is untracked until the ritual commits it.**
> That is exactly the 4 / 1 / 1 difference. The builder's own report quoted two mutually inconsistent
> figures for this one number. **Re-measure with a scope that includes the untracked suite, and say
> which instrument you used** (D488's `SURVIVES(known)` grep is the same failure at the sweep).
> 🛑 **`ARCHIVES` is the RITUAL's, and the hard-rules block must SAY so every time.**

### Prior resume point (P3-M5 — D488, the recording mill, kept for continuity)

> ### ▶ THE NEXT CONCRETE ACTION (written 2026-09-08, after D488)'''
s=s.replace(anchor,NEW,1)
io.open(p,'w',encoding='utf-8').write(s)
print('resume ok')
