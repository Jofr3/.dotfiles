import io
p='docs/progress.md'
s=io.open(p,encoding='utf-8').read()
anchor='## NEXT (resume point)\n\n> ### ▶ THE NEXT CONCRETE ACTION (written 2026-09-11, after D499)'
assert s.count(anchor)==1
NEW = r'''## NEXT (resume point)

> ### ▶ THE NEXT CONCRETE ACTION (written 2026-09-11, after D500)
>
> ✅ **`bun run check` IS GREEN — 483 files / 11,024 tests, `CHECK_EXIT=0`**, `typecheck-coverage`
> **730**, `lint-coverage` **732**. **`it(` delta +22 and vitest delta +22 — EXACT**, all in the new
> suite, no other suite moved. Engine **0.391.0 → 0.392.0**. **`MATCH_RECORD_VERSION` 29.** Corpus
> **2,439 → 2,446**, declared survivors **48 UNCHANGED**, archive ratchet **170**.
>
> 🛑 **(0) THE DEBT: COMMIT FIRST, THEN THE WHOLE-CORPUS SWEEP.**
> ⚠️ **ONE UNTRACKED PATH: `packages/engine/src/basicEnergyScaling.test.ts`.** `git add` EXPLICIT
> PATHS. 🛑 **LAUNCH THE SWEEP DETACHED WITH `setsid`** (D489, held at D490–D499).
>
> **THE PREDICTION, COMMITTED BEFORE THE RUN — sixty-first consecutive slice to name its number
> first:**
>
> > **`2398 killed · 48 known survivor(s) · 0 GAP(s) · 0 stale · 0 skipped(dirty) · 0 clobber(s) ·
> > 0 error(s)` over 2,446**
>
> `2391 + 7 = 2398`, `48 + 0 = 48`, `2439 + 7 = 2446`, closing `2398 + 48 = 2446`.
>
> 🛑 **(1) THE UNUSUAL PART: THE BUILDER DIED ON A SERVER-SIDE 500 AND WROTE NO REPORT.** Its last
> words were that a surviving row was **inert on the board it had chosen** — not a killer-set
> problem — and that it was fixing the suite (D496/D499's pattern). **The caller verified the whole
> state independently from the tree** and found the repair had landed: `check` green, `precheck`
> clean at 2,446, all gates OK, probe **7 killed · 0 survivors · 0 GAP · 0 error**, no journal on
> disk, no harness running, `docs/` untouched and `progressLog.test.ts` byte-unchanged.
> ✅ **AND THE REASONING WAS RECOVERABLE, BECAUSE IT IS PINNED IN THE SUITE RATHER THAN NARRATED** —
> the lattice vector, the degeneracy argument and the separating board all read out of
> `basicEnergyScaling.test.ts` and the doc blocks. **That is this loop's own discipline paying for
> itself under a failure it was not designed for.**
>
> ⚠️ **(2) WHAT IS NOT RECOVERABLE, AND IS NOT INVENTED.** The builder's **branch pricing**, its
> **tripwire audit**, its **witness-load count** and its **`MATCH_RECORD_VERSION` argument** were
> never written down. **The version is unchanged at 29 and every gate agrees, but no argument for it
> is on record.** 🛑 **A successor touching this row must RE-DERIVE it rather than assume one was
> made** — this is the D410 situation (*"finished by hand after the agent died, and the debt named
> rather than implied"*), and the debt is named here.
>
> **(3) ALREADY VERIFIED INDEPENDENTLY — run the SWEEP.** `check` GREEN **483 / 11,024**; `precheck`
> clean at **2,446**; `residue-census-gate` **OK, §A 109 / 83 / 117**; `partition-gate` and
> `splice-gate` **OK**; probe `--decision D500 --allow-dirty` → **7 killed · 0 survivors · 0 GAP · 0
> stale · 0 clobber · 0 error**. Version tax measured at **101 occurrences / 70 files**.
>
> **(4) AFTER THE SWEEP: the close-out.** Structural completeness from unique progress-line ids,
> confirm the line, update this stamp's tail and this `(0)` block, append to the `| **D500** |` row,
> add any convention BEFORE `## Git / commits`, re-run `check`, commit.
>
> **(5) 🆕 A FOURTH LATTICE SHAPE, READ OUT OF THE SUITE.** Built-by-weight **`0/1 · 1/1` — a 2¹
> TABLE**, because **three of four candidate axes are DEGENERATE** (each one's printed value already
> builds on an otherwise-built sentence). Beside D489/D490/D494's *one built point at FULL weight*,
> D495's `0/1 · 2/2 · 0/1` *every segment builds*, and D499's `0/1 · 1/3 · 0/1` *prerequisite half*.
> **This is the single-axis sentence: the NOUN is the whole blocker**, and the honest table is
> smaller than the axis list suggests.
>
> **(6) THE ROWS STILL OPEN.** Residue **83 / 117**; ceiling **~88 %**; about **69 sentences of
> reachable work**. ⚠️ **The survey done at D500's start is worth keeping**: `SUBST-2` is **entirely
> banner-blocked** (Ancient ×2, Future ×1) and three of `PHRASE-1`'s four members are too, so the
> non-`OPAQUE` classes are thinner than their counts suggest. The `During your opponent's next turn,`
> family is **31 built / 11 unread**, and its remaining members are **NOT cheap** — measured at D499:
> **no cost-increase op exists at all**, and **no per-body attach bar exists** (`StampedPlayLockKey`
> is per-SEAT and holds `"Item" | "Supporter" | "evolve"`). 🛑 **`Ancient`/`Future`/`Tera` off the
> table, 37th slice.**
>
> **(7) THE TARGETING RULES, seventy clauses.** (a)–(ooo) as at D499, plus: (ppp) 🆕 **D500-i: a
> FOURTH lattice shape — the SINGLE-AXIS sentence (`0/1 · 1/1`).** When three of four candidate axes
> are degenerate, **the honest table is 2¹ and saying so is the finding**; a 2⁴ table would be the
> same table reported eight times. (qqq) 🆕 **D500-ii: when a printed noun names a CARD CLASS, count
> CARDS and not what they PROVIDE** — a Special Energy may provide a basic type, so the separating
> board needs one, and D500 fields it with a same-class control. (rrr) 🆕 **D500-iii: reuse the
> shipped arm for a noun rather than writing a second reader of the same word** (D159) — D500's new
> value asks `matchesFilter`'s existing `basicEnergy` arm.
>
> **(8) THE STANDING HAZARDS.** 🛑 **NEVER WRITE TO THE TREE WHILE THE HARNESS IS IN FLIGHT.**
> **`--only` does NOT accumulate**; `--decision` takes ONE value (D443) and is a **FLOOR** with a
> false-negative half (D496); **`--list` IGNORES `--decision`**; **`killedByCommand` REPLACES
> `expectKilledBy`** (D498). ⚠️ **`patches LITERALLY` 22**; near-miss **8**. ⚠️ **A `replace`
> omitting a REQUIRED field reports ERROR.** 🛑 **A BARE `toBe(N)` REPLACEMENT IS NOT SAFE FOR SMALL
> LITERALS** (D492). ⚠️ **D463's EATEN-MINUS-SIGN TRAP DOES NOT FAIL LOUDLY** — check the
> **collected-test count** (D495). ⚠️ **A FOREGROUND PROBE CAN BE SIGTERM'd BEFORE ITS `finally`
> RUNS** — prefer `setsid`, verify by hash (D496). ⚠️ **A FIRST-PROBE SURVIVOR MUST BE DISCRIMINATED
> WITH `--only … --full`** before blaming a narrow killer set (D455/D499) — **and D500's was inert on
> its chosen board, a third diagnosis beside *real gap* and *narrow killer set*.** 🆕 🛑 **AN AGENT
> CAN DIE MID-SLICE AND LEAVE A COMPLETE, GREEN TREE.** **Verify the state before assuming it is
> partial** — `check`, `precheck`, every gate, the probe, the journal, and `ps` — and **name what the
> lost report cannot tell you rather than implying it was said.** 🛑 **`ARCHIVES` is the RITUAL's, and
> the hard-rules block must SAY so every time.**

### Prior resume point (P3-M5 — D499, the cancel and the shield on one coin, kept for continuity)

> ### ▶ THE NEXT CONCRETE ACTION (written 2026-09-11, after D499)'''
s=s.replace(anchor,NEW,1)
io.open(p,'w',encoding='utf-8').write(s)
print('ok')
