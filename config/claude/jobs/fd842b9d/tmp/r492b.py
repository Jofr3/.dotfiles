import io
p='docs/progress.md'
s=io.open(p,encoding='utf-8').read()
anchor='## NEXT (resume point)\n\n> ### ▶ THE NEXT CONCRETE ACTION (written 2026-09-08, after D491)'
assert s.count(anchor)==1
NEW = r'''## NEXT (resume point)

> ### ▶ THE NEXT CONCRETE ACTION (written 2026-09-10, after D492)
>
> ✅ **`bun run check` IS GREEN — 478 files / 10,895 tests, `CHECK_EXIT=0`**, `typecheck-coverage`
> **724 → 725**, `lint-coverage` **726 → 727**. **`it(` delta +33 and vitest delta +33 — EXACT**
> (all 33 in the new suite; **no other suite moved its `it(` count**, verified per-file). Engine
> **0.386.0 → 0.387.0**. **`MATCH_RECORD_VERSION` 29.** Corpus **2,361 → 2,373**, archive ratchet
> **162**.
>
> 🛑 **(0) THE DEBT: COMMIT FIRST, THEN THE WHOLE-CORPUS SWEEP.**
> ⚠️ **ONE UNTRACKED PATH: `packages/engine/src/classedBoardSpread.test.ts`.** `git add` EXPLICIT
> PATHS. 🛑 **LAUNCH THE SWEEP DETACHED WITH `setsid`** (D489, held at D490 and D491): a tracked
> background run gets SIGTERMed within minutes of the turn ending; detached it reparents to init
> (PPID 1) and survives. **POLL the summary line — a detached run sends no notification.**
>
> **THE PREDICTION, COMMITTED BEFORE THE RUN — fifty-third consecutive slice to name its number
> first, and the fifty-second landed exactly:**
>
> > **`2330 killed · 43 known survivor(s) · 0 GAP(s) · 0 stale · 0 skipped(dirty) · 0 clobber(s) ·
> > 0 error(s)` over 2,373**
>
> `2318 + 12 = 2330`, `43 + 0 = 43`, `2361 + 12 = 2373`, closing `2330 + 43 = 2373`.
>
> **(1) PRE-CLEARANCE — 18 of 43 clear by file, 25 by precheck plus a read.** Of the nine
> survivor-housing files only `effects.ts` (**−1**) and `interpreter.ts` (**−2**) carry any deletion
> — **the only engine-source deletions in the whole slice are those three lines.** `precheck`
> re-finding all **2,373** `find` strings exactly once is the witness that no other line moved.
> **130 rows re-probed across 13 decisions**, every verdict matching its recorded class. **Two
> pre-existing rows broke and were re-transcribed** (`D345-playable-gate-reverts-to-the-bench-length`
> shortened onto its predicate per D446; `D437-narrows-after-the-arity-doctrine` re-pointed through
> the new `ceiling` local), both re-probed KILLED.
>
> **(2) ALREADY VERIFIED INDEPENDENTLY — run the SWEEP.** `check` GREEN **478 / 10,895**; `precheck`
> clean at **2,373**; `residue-census-gate` **OK, §A 114 / 88 / 123**; `opaque-anatomy-gate` **OK**,
> §D **9 classes / 65 sentences / 94 printings**, §E **35,880** pairs, admitted **164**;
> `splice-gate` and `partition-gate` **OK**; probe `--decision D492 --allow-dirty` → **12 killed · 0
> survivors · 0 GAP · 0 stale · 0 clobber · 0 error**. ✅ **Hard-rules line held — `docs/` untouched,
> `progressLog.test.ts` byte-unchanged by sha256, `ARCHIVES` not stepped by the slice.**
>
> ⚠️ **`patches LITERALLY` MOVED 21 → 22, AND IT WAS VERIFIED RATHER THAN ACCEPTED.** Re-derived
> independently: exactly **22** rows carry a `String.replace` special (`$$`, `$&`, ``$` ``, `$'`,
> `$n`, `$<name>`) in their `replace`, and exactly **one** is D492's —
> **`D492-anchor-takes-the-parenthetical-tail-instead`**. So this is an AUTHORED dependency, not
> D491's broken-row artefact. ⚠️ **The builder's report named the wrong row**
> (`anchor-loses-its-terminator`); the conclusion was right and the citation was not — **the same
> name-without-checking failure this loop keeps finding.**
>
> **(3) AFTER THE SWEEP: the close-out.** Structural completeness from unique progress-line ids,
> confirm the line, update this stamp's tail and this `(0)` block, append to the `| **D492** |` row,
> add any convention BEFORE `## Git / commits`, re-run `check`, commit.
>
> **(4) THEN D493 — AND THE INSTRUMENT HAS A NAMED GAP NOW.** 🛑 **`residue-census.ts` CLASSIFIES BY
> A ONE-DIRECTION CUT: it asks whether a remainder BUILDS, never whether the remainder COMPOSES.**
> D492's two rows were filed `COMPOUND-tail` on the strength of a cut that could not see the tail was
> also a blocker, and **my brief repeated the instrument's answer as a confident claim.** ⚠️ **Do not
> quote a `CUT 🛑 does NOT build` line as proof that the head is the only blocker** — run the
> substitution in BOTH directions. The class is now empty, so the gap is unobservable at this head
> and will bite the next `COMPOUND-*` row.
>
> **(5) THE ROWS STILL OPEN.** 🛑 **`COMPOUND-tail` is ZERO** — D466 named these two as its only
> members and this slice took both. Class table at the new head: **`COMPOUND-head` 8/9,
> `COMPOUND-mid` 1/2, `SUBST-2` 3/4, `SUBST-3` 1/1, `SUBST-5` 1/1, `PHRASE-1` 4/5, `PHRASE-7` 1/1,
> `PHRASE-13` 1/1, `PHRASE-18` 1/3, `PHRASE-24` 1/1, `PHRASE-29` 1/1, `OPAQUE` 65/94 — total 88 /
> 123.** ⚠️ **`OPAQUE` is 74 % of the remaining sentences and 76 % of the printings**, and **14 of
> its 65 sentences are STRUCTURALLY blocked** (`BLOCKED-COPY-ATTACK` 6/13, `BLOCKED-NAMED-ATTACK`
> 3/6, `BLOCKED-SCHEMA-BANNER` 3/4, `BLOCKED-VARIABLE-MAX` 2/2) — **so the ceiling without an ingest
> migration is ~88 % of sentences.** Next candidates: **`COMPOUND-head` (8/9)**, the largest
> non-`OPAQUE` class; **corpus 487**; **529**; **569**; **file lines 268 / 537**; **D482's (B)**.
> 🛑 **`Ancient`/`Future`/`Tera` off the table, 29th slice.**
>
> **(6) THE TARGETING RULES, forty clauses.** (a)–(ll) as at D491, plus: (mm) 🆕 **D492-i: an
> instrument's classification is an answer to the question the instrument asks.** `residue-census.ts`
> cuts and re-reads; it cannot ask whether the remainder composes, so its `COMPOUND-tail` label is a
> hypothesis. (nn) 🆕 **D492-ii: a bare `toBe(N)` replacement is a line-targeted edit wearing a global
> one's clothes**, and **a revert is not an inverse** — see the standing hazards. (oo) 🆕 **D492-iii:
> when two candidate readings collide, find the ONE BYTE that splits them** rather than a bigger
> board: D492's `to each`/`for each` tie breaks on a Weakness ×2, not on board size.
>
> **(7) THE STANDING HAZARDS.** 🛑 **NEVER WRITE TO THE TREE WHILE THE HARNESS IS IN FLIGHT.**
> **`--only` does NOT accumulate.** `--allow-dirty` MANDATORY; `--decision` matches by
> `String.includes`. ⚠️ **`patches LITERALLY` now 22** (verified authored); near-miss **8**. ⚠️ **A
> `replace` omitting a REQUIRED field reports ERROR.** 🆕 🛑 **A BARE `toBe(N)` / `toHaveLength(N)`
> REPLACEMENT IS NOT SAFE FOR SMALL LITERALS.** D435's *grep the assertion, not the string* is
> necessary and NOT sufficient: `toBe(24)` **is** the assertion spelling and still hit **7 sites in 6
> files** where one was the census figure — **and the obvious repair is NOT AN INVERSE**, because
> replacing the new value back also rewrites sites that legitimately held it, which broke **9
> pre-existing assertions** in one command. **For a literal under ~4 digits, derive the target lines
> from `git diff -U0` and patch BY LINE NUMBER**; check which case you have with one `grep -c` first.
> **A revert is a diff-driven edit too — undo the LINES the diff shows, never the VALUE.** ⚠️ **The
> suite stayed GREEN through the over-patch**; it was caught only by reading the diff. ⚠️ **CENSUS
> TAX IN WAVES** (D487 five, D488 four, D489 four, D490 three, D491 three, D492 four: 20 → 13 → 7 →
> 4). **Count MATCHES, not LINES** — D492's 21 front terms across 9 files read as 18 under `grep -n`.
> **`BUILT.attack` FIRST** (D449). ⚠️ **The sentence and printing deltas DISAGREE here (2 and 4)**, so
> `.length` chains take −2 and `units(…)` chains take −4. ⚠️ **A `Math.round` numerator has a SOLUTION
> SET.** ✅ **VERSION TAX REPORTED CORRECTLY FOR THE SECOND CONSECUTIVE SLICE: 91 occurrences / 65
> files / 20 `it(` titles**, against `git grep`'s **87 / 64** — short by exactly the untracked suite's
> 4 / 1, D489's figure reproduced to the digit. ⚠️ **The history-exception list grew 2 → 4 and THIS
> EDIT AUTHORED TWO OF THEM** — D488's self-reference rule firing a fourth time. **Re-measure both
> after the edit; never inherit either.** 🛑 **`ARCHIVES` is the RITUAL's, and the hard-rules block
> must SAY so every time.**

### Prior resume point (P3-M5 — D491, each player draws 3 cards, kept for continuity)

> ### ▶ THE NEXT CONCRETE ACTION (written 2026-09-08, after D491)'''
s=s.replace(anchor,NEW,1)
io.open(p,'w',encoding='utf-8').write(s)
print('ok')
