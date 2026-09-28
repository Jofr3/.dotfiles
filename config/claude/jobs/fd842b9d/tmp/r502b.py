import io
p='docs/progress.md'
s=io.open(p,encoding='utf-8').read()
anchor='## NEXT (resume point)\n\n> ### ▶ THE NEXT CONCRETE ACTION (written 2026-09-11, after D501)'
assert s.count(anchor)==1
NEW = r'''## NEXT (resume point)

> ### ▶ THE NEXT CONCRETE ACTION (written 2026-09-12, after D502)
>
> ✅ **`bun run check` IS GREEN — 485 files / 11,105 tests, `CHECK_EXIT=0`** (+1 file, **+41 tests**,
> all in the new suite). Engine **0.393.0 → 0.394.0**. **`MATCH_RECORD_VERSION` HELD at 30.** Corpus
> **2,464 → 2,486**, declared survivors **48 → 50**, archive ratchet **172**.
>
> 🛑 **(0) THE DEBT: COMMIT FIRST, THEN THE WHOLE-CORPUS SWEEP.**
> ⚠️ **ONE UNTRACKED PATH: `packages/engine/src/derivedBenchSearchMove.test.ts`.** `git add` EXPLICIT
> PATHS. 🛑 **LAUNCH THE SWEEP DETACHED WITH `setsid`** (D489, held at D490–D501).
>
> **THE PREDICTION, COMMITTED BEFORE THE RUN — sixty-third consecutive slice to name its number
> first:**
>
> > **`2436 killed · 50 known survivor(s) · 0 GAP(s) · 0 stale · 0 skipped(dirty) · 0 clobber(s) ·
> > 0 error(s)` over 2,486**
>
> `2416 + 20 = 2436`, `48 + 2 = 50`, `2464 + 22 = 2486`, closing `2436 + 50 = 2486`.
>
> **(1) PRE-CLEARANCE.** `effects.ts` **246 / 0, pure addition**; `interpreter.ts` 130 / 9; the other
> 79 files symmetric N/N replacements. **18 survivors cleared by file, 3 more by file, 16 in
> `effects.ts` by pure addition with `precheck` as the witness, 10 of 13 in `interpreter.ts` by
> distance, and 3 re-derived individually** — including `D336-bench-clamp-binds-the-first-group`,
> which sits four lines from an edited hunk and needs a `searchDeck` that is **both** `dest:"bench"`
> **and** carries `also`; this arm has no `also`, so it is unmoved.
>
> **(2) ALREADY VERIFIED INDEPENDENTLY — run the SWEEP.** `check` GREEN **485 / 11,105**; `precheck`
> clean at **2,486**; `residue-census-gate` **OK, §A 107 / 81 / 115**; `splice-gate` and
> `partition-gate` **OK**; probe `--decision D502 --allow-dirty` → **20 killed · 2 known survivors ·
> 0 GAP · 0 stale · 0 clobber · 0 error**. ✅ **`patches LITERALLY` HELD at 22.** ✅ **And the carrier
> correction was re-verified at ritual time**: `sourceRef` exists at HEAD, documented as *"the
> `ctx.sourceUid` question"*, so uid-pinned destinations really do ship on that op.
>
> **(3) AFTER THE SWEEP: the close-out.** Structural completeness from unique progress-line ids,
> confirm the line, update this stamp's tail and this `(0)` block, append to the `| **D502** |` row,
> add any convention BEFORE `## Git / commits`, re-run `check`, commit.
>
> **(4) 🛑 THEN D503 — AND TWO INSTRUMENT LESSONS COME FIRST.** 🆕 **THE TRIPWIRE AUDIT'S NEEDLE LIST
> MUST INCLUDE THE CENSUS CONSTANTS.** `D495-census-built-attack-not-stepped` quotes `"  attack:
> 1616,"` and **rots on EVERY census step**, in a file no code region of a reader slice touches —
> twelve name-needles and seventeen span regions missed it, and `precheck` found it in seconds.
> **Predict it, the way D501 learned to predict `D326` across a version bump.** 🆕 **AND `tsc` OVER
> `scripts/` CATCHES WHAT `precheck` AND A PROBE CANNOT**: 21 rows with array-valued `what` passed
> both, because the runner reads `what` only to print it. **D481's closed hole is the only thing
> between a data error in the corpus and a green gate.**
>
> **(5) THE ROWS STILL OPEN.** Residue **81 / 115**; ceiling **~88 %**; about **67 sentences of
> reachable work**. **`COMPOUND-head` is down to 5**, and its members were priced at D501/D502: the
> **Ancient Supporter** row is banner-blocked; the **pre-damage optional attach** needs a park and a
> choice; **"use the effect of a Supporter card you find there"** is copy-attack-shaped; the **second
> Confusion row** (*move any number of damage counters*) and the **Poison + attach-bar** row both
> need new machinery — the latter a **per-body attach bar**, where `StampedPlayLockKey` is per-SEAT.
> ⚠️ **And the §9.2 gate family is now 7 sentences / 9 printings with no composition path** — a
> splitter for it priced at **0 / 0** solo, so it is a cost line rather than a design option.
> 🛑 **`Ancient`/`Future`/`Tera` off the table, 39th slice.**
>
> **(6) 🆕 STILL-OPEN DEBT FROM D501, UNCHANGED.** **`OnlineHud.tsx` has NO Confusion hint at all**,
> so the local HUD tells the truth and the online one tells the player nothing. Pre-existing; the wire
> already carries the number; the cost is one paragraph plus a dom test.
>
> **(7) THE TARGETING RULES, seventy-nine clauses.** (a)–(uuu) as at D501, plus: (vvv) 🆕 **D502-i: a
> lattice can be EMPTY at every weight — a SIXTH shape, and a claim about the FAMILY rather than the
> axes.** Read it as a statement about the **seam**, and look for the informative sub-lattice (here
> the tail's own 2³). **A degenerate axis makes the point set smaller than the bit set — use a Set.**
> (www) 🆕 **D502-ii: read the ARITY question at the FLOOR, not at the candidate count** — one
> destination looks like a forced arm and is not, because the force is gated on the floor.
> (xxx) 🆕 **D502-iii: the complement of a shipped field is not a field you can invert** — price it
> against its **supply** first (does any producer file the inverted set?), then the value KINDS, then
> the direction of the LOSS. (yyy) 🆕 **D502-iv: a refusal whose BOTH clauses survive re-derivation is
> worth saying out loud** — the run reports falsifications by habit, and *"the quoted price was
> real"* is what makes a refusal actionable. (zzz) 🆕 **D502-v: placing a new anchor is a decision
> about ANOTHER decision's row** — grep the corpus for rows whose `what` names the sentence you are
> about to build, because a terminator mutation can go inert on the one card it cites.
>
> **(8) THE STANDING HAZARDS.** 🛑 **NEVER WRITE TO THE TREE WHILE THE HARNESS IS IN FLIGHT.**
> **`--only` does NOT accumulate**; `--decision` takes ONE value (D443) and is a **FLOOR** with a
> false-negative half (D496); **`--list` IGNORES `--decision`**; **`killedByCommand` REPLACES
> `expectKilledBy`** (D498). ⚠️ **`patches LITERALLY` 22**; near-miss **8**. 🛑 **RUN THE BARE-TOKEN
> CENSUS FIRST AND LET THE COUNT PICK THE METHOD** (D501) — D502's literals matched **98–273** times
> repo-wide, so **all 66 substitutions went by line number** with a **comment-aware** one-occurrence
> check, because `BUILT.attack - ` occurs 3–4× on one 67 KB line and **two chains share a physical
> line at columns 6 and ~31,900**, which the `at < 80` heuristic cannot reach. ⚠️ **D463's
> EATEN-MINUS-SIGN TRAP DOES NOT FAIL LOUDLY** — check the **collected-test count** (D495).
> ⚠️ **A FIRST-PROBE CLEAN RESULT IS THE WEAKER OUTCOME** (D464). ⚠️ **A FOREGROUND PROBE CAN BE
> SIGTERM'd BEFORE ITS `finally` RUNS** — prefer `setsid`, verify by hash (D496). 🆕 ⚠️ **THE
> VERSION-TAX EXCEPTION LIST GROWS BY ONE PER SLICE AND TWO CONVENTIONS CONFLICT**: D499 says spell
> the literal escaped so a note does not count itself; every suite header in this repo spells it
> plainly. **The header convention wins, so the list is `2 + 1` — re-derive it, never inherit it.**
> 🛑 **`ARCHIVES` is the RITUAL's, and the hard-rules block must SAY so every time.**

### Prior resume point (P3-M5 — D501, the raised Confusion self-hit, kept for continuity)

> ### ▶ THE NEXT CONCRETE ACTION (written 2026-09-11, after D501)'''
s=s.replace(anchor,NEW,1)
io.open(p,'w',encoding='utf-8').write(s)
print('ok')
