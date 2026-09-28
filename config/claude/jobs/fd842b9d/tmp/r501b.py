import io
p='docs/progress.md'
s=io.open(p,encoding='utf-8').read()
anchor='## NEXT (resume point)\n\n> ### ▶ THE NEXT CONCRETE ACTION (written 2026-09-11, after D500)'
assert s.count(anchor)==1
NEW = r'''## NEXT (resume point)

> ### ▶ THE NEXT CONCRETE ACTION (written 2026-09-11, after D501)
>
> ✅ **`bun run check` IS GREEN — 484 files / 11,064 tests, `CHECK_EXIT=0`** (+1 file, **+40 tests**,
> matching the new suite's line-anchored `it(` count exactly). Engine **0.392.0 → 0.393.0**.
> 🛑 **`MATCH_RECORD_VERSION` 29 → 30 — THE FIRST BUMP OF THIS RUN.** Corpus **2,446 → 2,464**,
> declared survivors **48 UNCHANGED**, archive ratchet **171**.
>
> 🛑 **(0) THE DEBT: COMMIT FIRST, THEN THE WHOLE-CORPUS SWEEP.**
> ⚠️ **ONE UNTRACKED PATH: `packages/engine/src/confusionDamage.test.ts`.** `git add` EXPLICIT PATHS.
> 🛑 **LAUNCH THE SWEEP DETACHED WITH `setsid`** (D489, held at D490–D500).
>
> **THE PREDICTION, COMMITTED BEFORE THE RUN — sixty-second consecutive slice to name its number
> first:**
>
> > **`2416 killed · 48 known survivor(s) · 0 GAP(s) · 0 stale · 0 skipped(dirty) · 0 clobber(s) ·
> > 0 error(s)` over 2,464**
>
> `2398 + 18 = 2416`, `48 + 0 = 48`, `2446 + 18 = 2464`, closing `2416 + 48 = 2464`.
>
> **(1) PRE-CLEARANCE.** **119 files / 935 insertions / 250 deletions**, the largest diff of the run —
> a **required** field rippling through every fixture that constructs `SpecialConditions`. **9 of the
> 48 survivors live in files with deletions; 39 ruled out by file.** All 9 reasons read individually,
> and **one quantifies over the structure edited**: `D196-live-active`'s *"the only pre-fold mutation
> of the attacker is the confusion self-damage…"* — **re-derived clause by clause, all three hold**,
> since only the numeric addend moved. `precheck` re-finding all **2,464** `find`s exactly once is the
> witness that no existing line moved into a survivor's anchor. **Two rows re-transcribed**
> (`D326-record-version-not-bumped` 29→30, `D495-census-built-attack-not-stepped` 1615→1616), same
> experiment, same killers, **class unchanged** — ⚠️ **and the D326 rot was PREDICTED by the pre-build
> tripwire audit rather than discovered by `precheck` afterwards, the first time in seven bumps.**
>
> **(2) ALREADY VERIFIED INDEPENDENTLY — run the SWEEP.** `check` GREEN **484 / 11,064**; `precheck`
> clean at **2,464**; `residue-census-gate` **OK, §A 108 / 82 / 116**; `splice-gate` and
> `partition-gate` **OK**; probe `--decision D501 --allow-dirty` → **18 killed · 0 survivors · 0 GAP ·
> 0 stale · 0 clobber · 0 error**. ✅ **`patches LITERALLY` HELD at 22.** ✅ **And two claims were
> re-verified at ritual time**: the version constant reads **30**, and `GameHud.tsx`'s hard-coded
> *"tails: 30 damage to itself"* is **gone**, replaced by a read of the board.
>
> **(3) AFTER THE SWEEP: the close-out.** Structural completeness from unique progress-line ids,
> confirm the line, update this stamp's tail and this `(0)` block, append to the `| **D501** |` row,
> add any convention BEFORE `## Git / commits`, re-run `check`, commit.
>
> **(4) 🛑 THEN D502 — AND THE VERSION LESSON IS THE ONE TO CARRY.** **A bump is owed when a REQUIRED
> key lands at a persisted address and the REST CANNOT WITNESS its absence.** D501 is the fourth
> position in that sequence (D432 *no rest*, D434 *rest not old*, D435 *rest old but degradation is
> NaN*, **D501 *rest old, option available, rest cannot witness***). ⚠️ **And the deciding argument
> was not a rule but a SHIPPED COMPILE-TIME GUARD** — two `satisfies SpecialConditions` sites exist so
> an added engine field is a compile error rather than a silent drop, **and an optional key would have
> disarmed both**. 🛑 **Ask what the OPTIONAL shape would disarm, not only what it would mean.**
>
> **(5) THE ROWS STILL OPEN.** Residue **82 / 116**; ceiling **~88 %**; about **68 sentences of
> reachable work**. `COMPOUND-head` is down to **6**, and its remaining members were measured this
> slice: the **Ancient Supporter** row is banner-blocked; **`Search deck … If you put any Pokémon onto
> your Bench in this way, move an Energy`** needs a §9.2 record on `searchDeck`; the **pre-damage
> optional attach** needs a park and a choice; **`use the effect of a Supporter card you find there`**
> is copy-attack-shaped; the **second Confusion row** (*move any number of damage counters*) and the
> **Poison + attach-bar** row both need new machinery — the latter a **per-body attach bar**, where
> `StampedPlayLockKey` is per-SEAT and holds only `"Item" | "Supporter" | "evolve"`. 🛑
> **`Ancient`/`Future`/`Tera` off the table, 38th slice.**
>
> **(6) 🆕 TWO THINGS LEFT UNDONE, PRICED BY THE BUILDER.** **`OnlineHud.tsx` has NO Confusion hint at
> all** (zero occurrences of `Confused`) — so the local HUD now tells the truth and the online one
> tells the player nothing. **Pre-existing, not created here, but this slice makes the asymmetry
> matter for the first time**; the wire already carries the number, so the cost is one paragraph plus
> a dom test. And `defenderStatusTriple.test.ts`'s loss loop still iterates **three** condition keys
> where there are now four — a free strengthening, left because that rung is about its own slice's
> three statuses.
>
> **(7) THE TARGETING RULES, seventy-three clauses.** (a)–(rrr) as at D500, plus: (sss) 🆕 **D501-i: a
> precedent at the same ADDRESS is not a precedent for the same QUESTION** — `poisonDamage` predates
> `MATCH_RECORD_VERSION` by twelve days, so *"re-derive what the sibling argued"* asked for an
> argument that cannot exist, and an absence that means nothing reads as permission. **Date the
> precedent before citing it.** (ttt) 🆕 **D501-ii: ask what the OPTIONAL shape would DISARM.** An
> optional key can satisfy a `satisfies` guard while reaching neither surface it was written to
> protect. (uuu) 🆕 **D501-iii: grep every READ SITE of a constant before changing it** (D412) — D501
> found a live false claim in the HUD and two in prose that way.
>
> **(8) THE STANDING HAZARDS.** 🛑 **NEVER WRITE TO THE TREE WHILE THE HARNESS IS IN FLIGHT.**
> **`--only` does NOT accumulate**; `--decision` takes ONE value (D443) and is a **FLOOR** with a
> false-negative half (D496); **`--list` IGNORES `--decision`**; **`killedByCommand` REPLACES
> `expectKilledBy`** (D498). ⚠️ **`patches LITERALLY` 22**; near-miss **8**. 🛑 **A BARE `toBe(N)`
> REPLACEMENT IS NOT SAFE FOR SMALL LITERALS** (D492) — ⚠️ **D501 ran the bare-token census FIRST and
> its output was the DECISION not to use a value-keyed pass at all**: `117` matched **186** times and
> `167` **243** times repo-wide, so every literal was patched **by line number** with a
> one-occurrence-in-region assertion. ⚠️ **D463's EATEN-MINUS-SIGN TRAP DOES NOT FAIL LOUDLY** — check
> the **collected-test count** (D495); D501's rose 11,024 → 11,064, exactly the new suite's count.
> ⚠️ **A FIRST-PROBE CLEAN RESULT IS THE WEAKER OUTCOME** (D464) — it shows the rows run, not that the
> suite discriminates; each row's `what` must name the rung that catches it. ⚠️ **A FOREGROUND PROBE
> CAN BE SIGTERM'd BEFORE ITS `finally` RUNS** — prefer `setsid`, verify by hash (D496).
> 🛑 **`ARCHIVES` is the RITUAL's, and the hard-rules block must SAY so every time.**

### Prior resume point (P3-M5 — D500, the Basic Energy attached count, kept for continuity)

> ### ▶ THE NEXT CONCRETE ACTION (written 2026-09-11, after D500)'''
s=s.replace(anchor,NEW,1)
io.open(p,'w',encoding='utf-8').write(s)
print('ok')
