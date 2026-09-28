import io
p='docs/progress.md'
s=io.open(p,encoding='utf-8').read()
anchor='## NEXT (resume point)\n\n> ### ▶ THE NEXT CONCRETE ACTION (written 2026-09-11, after D498)'
assert s.count(anchor)==1
NEW = r'''## NEXT (resume point)

> ### ▶ THE NEXT CONCRETE ACTION (written 2026-09-11, after D499)
>
> ✅ **`bun run check` IS GREEN — 482 files / 11,002 tests, `CHECK_EXIT=0`** (+1 file = the new
> suite, **+33 tests**). Engine **0.390.0 → 0.391.0**. **`MATCH_RECORD_VERSION` 29.** Corpus
> **2,427 → 2,439**, declared survivors **47 → 48**, archive ratchet **169**.
>
> 🛑 **(0) THE DEBT: COMMIT FIRST, THEN THE WHOLE-CORPUS SWEEP.**
> ⚠️ **ONE UNTRACKED PATH: `packages/engine/src/cancelThenPrevent.test.ts`.** `git add` EXPLICIT
> PATHS. 🛑 **LAUNCH THE SWEEP DETACHED WITH `setsid`** (D489, held at D490–D498).
>
> **THE PREDICTION, COMMITTED BEFORE THE RUN — sixtieth consecutive slice to name its number first:**
>
> > **`2391 killed · 48 known survivor(s) · 0 GAP(s) · 0 stale · 0 skipped(dirty) · 0 clobber(s) ·
> > 0 error(s)` over 2,439**
>
> `2380 + 11 = 2391`, `47 + 1 = 48`, `2427 + 12 = 2439`, closing `2391 + 48 = 2439`.
>
> **(1) PRE-CLEARANCE.** 601 insertions / **196 deletions** across 82 files + 1 untracked. Deletion
> sites: `flipStatusHeadsTails` −19, `censusAtHead` −11, `coinFlipDamage` −9, **`attack.ts` −6**,
> `retreatCostBonus` −5, `mutants.ts` −4, **`effects.ts` −1**, the rest version-literal swaps.
> **Byte-identical to HEAD and verified per file**: `log.ts`, `interpreter.ts`, `redact.ts`,
> `registry.ts`, `types.ts`, `testFixtures.ts`, `censusAttackCorpus.ts`, `match.ts`, all of
> `packages/schema`, `src/`, `apps/`. Of 48 survivors, 22 not dismissible by file; **4 name
> `program` and all 4 quantify over their own printing sets**, unmoved. Neighbours re-checked
> include the **9 rows killed by `flipStatusHeadsTails`** and **12 by `defenderStatusPair`** — both
> suites edited behaviourally, and the changed rungs are **not their discriminators**.
>
> **(2) ALREADY VERIFIED INDEPENDENTLY — run the SWEEP.** `check` GREEN **482 / 11,002**; `precheck`
> clean at **2,439**; `residue-census-gate` **OK, §A 110 / 84 / 118**; `partition-gate` and
> `splice-gate` **OK**; probe `--decision D499 --allow-dirty` → **11 killed · 1 known survivor · 0
> GAP · 0 stale · 0 clobber · 0 error**. ✅ **`patches LITERALLY` HELD at 22**, re-derived on the
> `String.replace`-special criterion (a bare `$` returns **228** — an order of magnitude over).
> ✅ **The family split was re-verified at ritual time: 42 / 151, now 31 built / 11 unread.**
>
> **(3) AFTER THE SWEEP: the close-out.** Structural completeness from unique progress-line ids,
> confirm the line, update this stamp's tail and this `(0)` block, append to the `| **D499** |` row,
> add any convention BEFORE `## Git / commits`, re-run `check`, commit.
>
> **(4) 🛑 THEN D500 — AND THE LESSON THAT SHOULD DRIVE TARGETING IS ABOUT REFUSALS.** D499
> overturned a **57-decision** refusal that four suites carried, one calling it *"a durable witness
> rather than a treadmill"*. **Every clause was true of its CARRIER and false as a claim about the
> engine.** ⚠️ **The disproof is one question — WHICH CARRIER IS READ AT THE SEAM THE RULE RESOLVES
> AT?** — and it is cheap. **Ask it of every recorded refusal before pricing the row it guards.**
> ✅ **And because the refusal was carrier-scoped, five shipped `toBeNull` witnesses stayed green and
> armed**, which is what a correctly-scoped refusal buys.
>
> **(5) THE ROWS STILL OPEN.** Residue **84 / 118**; `OPAQUE` **63 / 92**; ceiling **~88 %**; about
> **70 sentences of reachable work**. The `During your opponent's next turn,` family is **42
> sentences / 151 printings, 31 built / 11 unread** — still the largest reachable group. ⚠️ **Its
> remaining members are NOT cheap**, measured this slice: **no cost-increase op exists at all** (the
> cost+retreat row needs a new durated mechanism on two surfaces) and **no per-body attach bar
> exists** (`StampedPlayLockKey` is per-SEAT and holds `"Item" | "Supporter" | "evolve"`). 🛑
> **`Ancient`/`Future`/`Tera` off the table, 36th slice.**
>
> **(6) THE TARGETING RULES, sixty-eight clauses.** (a)–(kkk) as at D498, plus: (lll) 🆕 **D499-i: a
> THIRD lattice shape — the PREREQUISITE HALF.** `0/1 · 1/3 · 0/1`: one built point at weight 1,
> reached by deleting a segment whose complement is itself a printed corpus row. **The blocker is
> the JOIN**, which is a seam question. (mmm) 🆕 **D499-ii: a refusal scoped to a CARRIER is not a
> refusal of the sentence** — and *"no widening of any anchor in THIS family can reach it"* is the
> hardest form to see. (nnn) 🆕 **D499-iii: the two-reader idiom is free only when neither reader
> consumes a RESOURCE.** Where both draw from `rngState`, a dual claim is two draws for one printed
> flip. **Ask what each reader SPENDS.** (ooo) 🆕 **D499-iv: dispatch ORDER is what makes a sibling
> anchor's `$` observable** — reading the one that can widen FIRST turns its loosening into a red
> rung instead of a survivor.
>
> **(7) THE STANDING HAZARDS.** 🛑 **NEVER WRITE TO THE TREE WHILE THE HARNESS IS IN FLIGHT.**
> **`--only` does NOT accumulate**; `--decision` takes ONE value (D443) and is a **FLOOR** with a
> false-negative half (D496); **`--list` IGNORES `--decision`**; **`killedByCommand` REPLACES
> `expectKilledBy`** (D498). ⚠️ **`patches LITERALLY` 22**; near-miss **8**. ⚠️ **A `replace`
> omitting a REQUIRED field reports ERROR.** 🛑 **A BARE `toBe(N)` REPLACEMENT IS NOT SAFE FOR SMALL
> LITERALS** (D492). ⚠️ **D463's EATEN-MINUS-SIGN TRAP DOES NOT FAIL LOUDLY** — D499 checked the
> **collected-test count** and totals rose monotonically (D495). ⚠️ **A FOREGROUND PROBE CAN BE
> SIGTERM'd BEFORE ITS `finally` RUNS** — prefer `setsid`, verify by hash (D496). 🆕 ⚠️ **A
> FIRST-PROBE SURVIVOR MUST BE DISCRIMINATED WITH `--only … --full`** before blaming a narrow killer
> set (D455) — D499's GAP was a **real 373-decision span absence**, and the row stayed byte-for-byte
> while the suite gained a constructed prefix. 🆕 ⚠️ **D488's SELF-REFERENCE RULE, THIRD OCCURRENCE,
> NOW WITH A FIX**: the paragraph counting the version tax moved **98 → 100 by existing**; spelling
> it entirely in **escaped patterns** makes the figure stable under its own text, and where it still
> cannot be, **publish the command and refuse to quote the number.** 🛑 **`ARCHIVES` is the RITUAL's,
> and the hard-rules block must SAY so every time.**

### Prior resume point (P3-M5 — D498, the predicate behind every census figure, kept for continuity)

> ### ▶ THE NEXT CONCRETE ACTION (written 2026-09-11, after D498)'''
s=s.replace(anchor,NEW,1)
io.open(p,'w',encoding='utf-8').write(s)
print('ok')
