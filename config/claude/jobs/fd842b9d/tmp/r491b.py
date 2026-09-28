import io
p='docs/progress.md'
s=io.open(p,encoding='utf-8').read()
anchor='## NEXT (resume point)\n\n> ### ▶ THE NEXT CONCRETE ACTION (written 2026-09-08, after D490)'
assert s.count(anchor)==1
NEW = r'''## NEXT (resume point)

> ### ▶ THE NEXT CONCRETE ACTION (written 2026-09-08, after D491)
>
> ✅ **`bun run check` IS GREEN — 477 files / 10,862 tests, `CHECK_EXIT=0`**, `typecheck-coverage`
> **723 → 724**, `lint-coverage` **725 → 726**. **`it(` delta +33 and vitest delta +33 — EXACT**
> (32 in the new suite + 1 in `optionalDraw.test.ts`). Engine **0.385.0 → 0.386.0**.
> **`MATCH_RECORD_VERSION` 29.** Corpus **2,349 → 2,361**, archive ratchet **161**.
>
> 🛑 **(0) THE DEBT: COMMIT FIRST, THEN THE WHOLE-CORPUS SWEEP.**
> ⚠️ **ONE UNTRACKED PATH: `packages/engine/src/eachPlayerDraw.test.ts`.** `git add` EXPLICIT PATHS.
> 🛑 **LAUNCH THE SWEEP DETACHED WITH `setsid`** (D489, reused successfully at D490): a tracked
> background run gets SIGTERMed within minutes of the turn ending; detached it reparents to init
> (PPID 1) and survives. **POLL the summary line — a detached run sends no notification.**
>
> **THE PREDICTION, COMMITTED BEFORE THE RUN — fifty-second consecutive slice to name its number
> first, and the fifty-first landed exactly:**
>
> > **`2318 killed · 43 known survivor(s) · 0 GAP(s) · 0 stale · 0 skipped(dirty) · 0 clobber(s) ·
> > 0 error(s)` over 2,361**
>
> `2306 + 12 = 2318`, `43 + 0 = 43`, `2349 + 12 = 2361`, closing `2318 + 43 = 2361`.
>
> **(1) PRE-CLEARANCE — 18 of 43 clear by file, 25 by needle-then-read.** `attack.ts`,
> `continuous.ts`, `flow.ts`, `redact.ts`, `GameHud.tsx`, `splice-gate.ts` and `refusedPrintings.ts`
> are absent from the diff. The other 25 live in `effects.ts` (13, **−3**) and `interpreter.ts`
> (12, **−5**). ⚠️ **The needle screen is only as good as its needles**: a first pass on the bare
> words `who` and `from` flagged **17 of 25**, every extra hit being English prose in a `reason` —
> **D430's *grep counts text, not structure*.** Re-run on structural spellings it flagged **1**,
> cleared by reading (`D222-duplicated-victim-test` quantifies over a different op's `from`).
> ⚠️ **Four pre-existing rows DID break and were re-transcribed**, one of them a **byte-twin of
> D490's new `switch` case** (D437's converse trap), repaired by lengthening D490's `find` onto the
> line it uniquely owns.
>
> **(2) ALREADY VERIFIED INDEPENDENTLY — run the SWEEP.** `check` GREEN **477 / 10,862**; `precheck`
> clean at **2,361**, `patches LITERALLY` **HELD at 21**, near-miss **HELD at 8**;
> `residue-census-gate` **OK, §A 116 / 90 / 127**; `opaque-anatomy-gate` **OK**, §D **9 classes / 65
> sentences / 94 printings**, §E **35,750** pairs, admitted **164**; `splice-gate` and
> `partition-gate` **OK**; probe `--decision D491 --allow-dirty` → **12 killed · 0 survivors · 0 GAP
> · 0 stale · 0 clobber · 0 error**. ✅ **Hard-rules line held — `docs/` untouched,
> `progressLog.test.ts` byte-unchanged, `ARCHIVES` not stepped by the slice.**
>
> **(3) AFTER THE SWEEP: the close-out.** Structural completeness from unique progress-line ids,
> confirm the line, update this stamp's tail and this `(0)` block, append to the `| **D491** |` row,
> add any convention BEFORE `## Git / commits`, re-run `check`, commit.
>
> **(4) THEN D492.** 🛑 **THE BIG STANDING LESSON, NOW MEASURED TWICE: A REFUSAL ROTS AND NOTHING IN
> THE CORPUS FORCES A RE-DERIVATION.** D490's family had zero mutant rows across 87 decisions;
> D491's tripwire audit was **also empty**. In both cases the recorded price was wrong. ⚠️ **D491
> adds the sharper form: the refusal in source was NOT wrong — it was ANSWERING A DIFFERENT
> QUESTION.** `opponentMayDraw`'s *"deliberately NOT a rider on `drawCards`"* is true of the SHAPE it
> refuses (a parking MAY) and says nothing about a mandatory both-seats key. **D450's rule: a doc
> block that refuses a SHAPE has refused that shape, not the axis.** Read what a refusal's reasoning
> actually quantifies over before treating it as a blocker.
>
> **(5) THE ROWS STILL OPEN.** ⚠️ **`SUBST-4` is now an EMPTY class** — and note `OPAQUE` did **not**
> move (65/94), because the row that left was `SUBST-4`'s. **The two `ex`/`V` SPREADS** (2 sentences
> / 4 printings) — a filtered flat whole-side DAMAGE walk. **Corpus 487**; **529**; **569**; **file
> lines 268 / 537**; **D482's (B)**. 🛑 **`Ancient`/`Future`/`Tera` off the table, 28th slice** — and
> note D491 re-pointed six loud controls onto *"Heal 100 damage from 1 of your Benched Ancient
> Pokémon."* precisely because it is **DATA-blocked** (the banner is a per-printing fact `cardSchema`
> has no column for), so it cannot be built by any reader at any width (D461 rule 2). **That makes it
> a stable witness and also means those six sites go stale the day an ingest migration lands.**
>
> **(6) THE TARGETING RULES, thirty-seven clauses.** (a)–(hh) as at D490, plus: (ii) 🆕 **D491-i: an
> axis whose printed value is ALREADY BUILT is not an axis.** Before listing one, check its nearest
> BUILT spelling *differs from the print*, or the lattice carries a degenerate dimension and its
> Hamming weights mean less than they look. (jj) 🆕 **D491-ii: a lattice run AFTER the build is not
> the lattice.** Derive the pre-state (`before = now && !NEW_ANCHOR.test(point)`) rather than quoting
> it as prose, and assert the points the new anchor claims are exactly the ones that moved.
> (kk) 🆕 **D491-iii: when an axis has no nearest-BUILT spelling, say it is UNAVAILABLE rather than
> inventing a point.** D491's subject-noun axis could not be varied independently of SCOPE and was
> reported so. (ll) 🆕 **D491-iv: read what a refusal QUANTIFIES OVER before treating it as a
> blocker** (D450 at a doc block).
>
> **(7) THE STANDING HAZARDS.** 🛑 **NEVER WRITE TO THE TREE WHILE THE HARNESS IS IN FLIGHT.**
> **`--only` does NOT accumulate.** `--allow-dirty` MANDATORY; `--decision` matches by
> `String.includes`. ⚠️ **`patches LITERALLY` 21; near-miss 8.** 🆕 ⚠️ **AND `spliceReport`'s
> POPULATION MOVES WHEN A ROW BREAKS, NOT ONLY WHEN ONE IS WRITTEN** — it read **22** mid-slice
> against the recorded 21, because a row whose `find` occurs TWICE is counted as spliceable (
> `String.replace` and split/join then disagree); it returned to 21 once `precheck`'s four broken rows
> were repaired. **Read a moved gate population as a question about the corpus's HEALTH before
> reading it as a change in the corpus.** ⚠️ **A `replace` omitting a REQUIRED field reports ERROR.**
> ⚠️ **CENSUS TAX IN WAVES** (D487 five, D488 four, D489 four, D490 three, D491 three: 18 → 10 → 1).
> **Cut it by grepping the OLD VALUES as bare tokens first** — and 🆕 **count MATCHES, not LINES**:
> D491's front-term pass found **21 across 8 files** where `grep -n` reported 18/9, because three
> lines carry two chains each. 🆕 **D458's NAMING is why wave 3 was one site**: `RAW_UNBUILT_ATTACK_UNITS`
> was found by one grep where seven consecutive slices stepped the `toBe(N)` and missed the bare
> arithmetic operand. **`BUILT.attack` FIRST** (D449). 🆕 ⚠️ **A MECHANICAL SUBSTITUTION PASS MUST BE
> CLOSED UNDER ITS OWN OUTPUT** — D491 injected a double-step where one rule's replacement was
> another's pattern, and `git diff` does not flag it because the line still looks stepped.
> ⚠️ **A `Math.round` numerator has a SOLUTION SET** — D491's held at {24} across both denominators.
> ✅ **THE VERSION TAX WAS REPORTED CORRECTLY FOR THE FIRST TIME**: **88 occurrences / 64 files / 19
> `it(` titles** with the untracked-inclusive command, against `git grep`'s **86 / 63** — the builder
> named the command and honoured D489's rule instead of repeating D490's mistake. 🆕 ⚠️ **And the
> exception list GREW FROM 4 TO 6 BECAUSE THE EDIT ITSELF AUTHORED TWO** — D488's self-reference rule
> firing a third time. **Re-measure both after the edit; never inherit either.** 🛑 **`ARCHIVES` is
> the RITUAL's, and the hard-rules block must SAY so every time.**

### Prior resume point (P3-M5 — D490, the mill of both decks, kept for continuity)

> ### ▶ THE NEXT CONCRETE ACTION (written 2026-09-08, after D490)'''
s=s.replace(anchor,NEW,1)
io.open(p,'w',encoding='utf-8').write(s)
print('ok')
