import io
p='docs/progress.md'
s=io.open(p,encoding='utf-8').read()
anchor='## NEXT (resume point)\n\n> ### ▶ THE NEXT CONCRETE ACTION (written 2026-09-12, after D502)'
assert s.count(anchor)==1
NEW = r'''## NEXT (resume point)

> ### ▶ THE NEXT CONCRETE ACTION (written 2026-09-12, after D503)
>
> ✅ **`bun run check` IS GREEN — 486 files / 11,125 tests, `CHECK_EXIT=0`** (+1 file, **+20 tests**,
> exactly the new suite). 🛑 **NOTHING ELSE MOVED, BY DESIGN**: residue **81 / 115**, `BUILT.attack`
> **1617**, engine **0.394.0**, `MATCH_RECORD_VERSION` **30**, declared survivors **50** — all
> unchanged. Corpus **2,486 → 2,490**, archive ratchet **173**.
>
> 🛑 **(0) THE DEBT: COMMIT FIRST, THEN THE WHOLE-CORPUS SWEEP.**
> ⚠️ **ONE UNTRACKED PATH: `packages/engine/src/preDamageAttachSeam.test.ts`.** `git add` EXPLICIT
> PATHS. 🛑 **LAUNCH THE SWEEP DETACHED WITH `setsid`** (D489, held at D490–D502).
>
> **THE PREDICTION, COMMITTED BEFORE THE RUN — sixty-fourth consecutive slice to name its number
> first:**
>
> > **`2440 killed · 50 known survivor(s) · 0 GAP(s) · 0 stale · 0 skipped(dirty) · 0 clobber(s) ·
> > 0 error(s)` over 2,490**
>
> `2436 + 4 = 2440`, `50 + 0 = 50`, `2486 + 4 = 2490`, closing `2440 + 50 = 2490`.
>
> 🛑 **(1) THIS SLICE IS A REFUSAL, AND THE REFUSAL IS THE DELIVERABLE.** The row stays unbuilt. **ZERO
> engine source bytes changed** — verified by sha256 against the HEAD blobs for `effects.ts`,
> `interpreter.ts` and `attack.ts` — so the whole diff is **64 insertions and ZERO deletions** across
> two test files, four mutant rows and one new suite. **Pre-clearance therefore clears at step 1**: a
> reason can only be invalidated by bytes that move, and `precheck` re-finding all 2,490 `find`s
> exactly once is the tool-checkable witness.
>
> **(2) ALREADY VERIFIED INDEPENDENTLY — run the SWEEP.** `check` GREEN **486 / 11,125**; `precheck`
> clean at **2,490**; `residue-census-gate` **OK, §A unmoved at 107 / 81 / 115**; `splice-gate` and
> `partition-gate` **OK**; probe `--decision D503 --allow-dirty` → **4 killed · 0 survivors · 0 GAP ·
> 0 error**. ✅ **`patches LITERALLY` HELD at 22.**
>
> **(3) AFTER THE SWEEP: the close-out.** Structural completeness from unique progress-line ids,
> confirm the line, update this stamp's tail and this `(0)` block, append to the `| **D503** |` row,
> add any convention BEFORE `## Git / commits`, re-run `check`, commit.
>
> **(4) 🛑 THEN D504 — AND THE METHOD FINDING COMES FIRST, BECAUSE IT INVERTS CONCLUSIONS.**
> **RUN THE LATTICE OVER THE RESIDUE PREDICATE, NOT OVER THE READERS ALONE.** D503's readers-only
> lattice read `0/1 · 0/3 · 0/3 · 0/1` — D502's empty shape, *"the seam has no path"* — while the
> **splitter-inclusive** lattice read `0/1 · 0/3 · 1/3 · 1/1`, *"the seam HAS a path, and one
> reader's refusal is the only guard."* **Opposite conclusions from one sentence, and only the second
> is actionable.** ⚠️ **Every lattice this run has reported was readers-only** — so the six recorded
> shapes may each be missing a splitter dimension. **Re-run one when it matters.**
>
> **(5) THE ROW THAT WAS REFUSED, AND THE CONDITION THAT REVERSES IT.** Three branches, **all three
> measured at 1 sentence / 1 printing solo** — so D493's rule applies and **the fork was never a
> fork, just three cost lines on one invoice.** The seam is ~**2,000 lines of straight-line
> `attack()`** plus a **required new persisted continuation shape** plus a `MATCH_RECORD_VERSION`
> bump. 🛑 **Stated executably: the day `applyAttackPreDamage` can return something `settleProgram`
> drains — i.e. `attack()`'s post-hook remainder becomes expressible as `PendingStage[]` — the
> branches are cheap and the row is one anchor away.**
>
> **(6) THE ROWS STILL OPEN.** Residue **81 / 115** (unmoved); ceiling **~88 %**; about **67
> sentences of reachable work**. `COMPOUND-head` stays at **5**, now with this member priced as a
> refusal. The rest: the **Ancient Supporter** row (banner-blocked), *"use the effect of a Supporter
> card you find there"* (copy-attack-shaped), the **second Confusion row**, and the **Poison +
> attach-bar** row (per-body attach bar, where `StampedPlayLockKey` is per-SEAT).
> 🛑 **`Ancient`/`Future`/`Tera` off the table, 40th slice.**
>
> **(7) 🆕 STILL-OPEN DEBT, UNCHANGED.** **`OnlineHud.tsx` has NO Confusion hint at all** (D501) —
> the local HUD tells the truth and the online one tells the player nothing; the wire already carries
> the number.
>
> **(8) THE TARGETING RULES, eighty-three clauses.** (a)–(zzz) as at D502, plus: (aaaa) 🆕 **D503-i:
> run the lattice over the RESIDUE PREDICATE, not the readers alone** — readers-only and
> splitter-inclusive gave opposite conclusions on one sentence. (bbbb) 🆕 **D503-ii: *"the order is
> unobservable on today's column"* can be CIRCULAR** — `attack.ts:2559` says so honestly, and the
> column **does** print the pairing; it is unobservable only because that sentence is unbuilt, and it
> is unbuilt because of the order. **When a placement comment cites the pool as its warrant, check
> whether the pool's silence is caused by the thing being excused.** (cccc) 🆕 **D503-iii: a reason
> can be TRUE UNDER A NARROWER READING THAN ITS WORDS CARRY** — a fourth failure mode beside D479's
> *false-when-written / rotted / reason-only*. (dddd) 🆕 **D503-iv: two refusal witnesses on one
> sentence may be COMPLEMENTARY rather than redundant** — count them by **which build road each can
> see**, not by how many name the sentence.
>
> **(9) THE STANDING HAZARDS.** 🛑 **NEVER WRITE TO THE TREE WHILE THE HARNESS IS IN FLIGHT.**
> **`--only` does NOT accumulate**; `--decision` takes ONE value (D443) and is a **FLOOR** with a
> false-negative half (D496); **`--list` IGNORES `--decision`**; **`killedByCommand` REPLACES
> `expectKilledBy`** (D498). ⚠️ **`patches LITERALLY` 22**; near-miss **8**. 🛑 **A GREEN PROBE IS NOT
> EVIDENCE YOUR ROWS ARE WELL-FORMED** (D502) — run `bun run check` after authoring rows.
> 🆕 ⚠️ **AND A CENSUS-CONSTANT TRIPWIRE QUOTES A NUMBER THAT MOVES**:
> `D495-census-built-attack-not-stepped` quotes **`"  attack: 1617,"`** at this head — **D502's
> convention entry recorded it as 1616 and was already stale when written; corrected in
> `conventions.md` at D503's ritual.** **Re-derive the literal from the module, never from a
> convention.** ⚠️ **D463's EATEN-MINUS-SIGN TRAP DOES NOT FAIL LOUDLY** — check the collected-test
> count (D495). ⚠️ **A FOREGROUND PROBE CAN BE SIGTERM'd BEFORE ITS `finally` RUNS** — prefer
> `setsid`, verify by hash (D496). 🛑 **`ARCHIVES` is the RITUAL's, and the hard-rules block must SAY
> so every time.**

### Prior resume point (P3-M5 — D502, the deck search that energises what it benched, kept for continuity)

> ### ▶ THE NEXT CONCRETE ACTION (written 2026-09-12, after D502)'''
s=s.replace(anchor,NEW,1)
io.open(p,'w',encoding='utf-8').write(s)
print('ok')
