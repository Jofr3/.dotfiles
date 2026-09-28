import io
p='docs/progress.md'
s=io.open(p,encoding='utf-8').read()
old_row='| simulator | P3 | 🚧 **M1–M3 + M4 done; M5 in progress** (latest: **P3-M5 — D492,'
i=s.index(old_row); j=s.index('\n',i)
new_row=('| simulator | P3 | 🚧 **M1–M3 + M4 done; M5 in progress** (latest: **P3-M5 — D493, *the '
 'suppressed bench-counter multiplier, and a composition branch that was already a mutant row*: the '
 'design fork was decided by measurement — (A) and (B) each free 0/0 alone and only the pair frees '
 '1/1, which is what one anchor frees for less, so they were never independent blockers. The '
 'composition branch is `D409-tail-guard-widened-to-any-reader` VERBATIM, with its defect in its own '
 '`what`; building it would have disarmed the tripwire describing it. 1 sentence / 1 printing, the '
 'first solo inhabitant of `AttackDamageSuppression.weakness`**; engine 0.388.0, corpus 2,379, check '
 'GREEN 479/10,916) |')
s=s[:i]+new_row+s[j:]

log_anchor='### 2026-09-10 — build session #432 (P3-M5 — D492)'
assert s.count(log_anchor)==1
ENTRY = r'''### 2026-09-10 — build session #433 (P3-M5 — D493)

**THE SUPPRESSED BENCH-COUNTER MULTIPLIER — AND A COMPOSITION BRANCH THAT WAS ALREADY A MUTANT ROW,
VERBATIM, WITH ITS DEFECT IN ITS OWN `what`.** Engine **0.387.0 → 0.388.0**, **`MATCH_RECORD_VERSION`
29 UNCHANGED**, mutation corpus **2,373 → 2,379**, archive ratchet **162 → 163**, `bun run check`
GREEN at **479 files / 10,916 tests**.

**(0) BUILD STATE, RE-DERIVED FOR EVERY STRING.** Reader surface **13**. The full row 529: **REFUSED
13/13**, all four splitters null. The HEAD alone: **BUILDS** (`deriveAttackDamageMultiplier`). The
*"Weakness or Resistance"* clause: **BUILDS** (`deriveAttackDamageSuppression` → `{weakness:true,
resistance:true}`). The bare *"Weakness."* clause: **REFUSED 13/13**.

**(1) 🛑 MY EVIDENCE FOR THE COMPOSITION BLOCKER WAS INVALID, THOUGH ITS CONCLUSION WAS TRUE.** I
briefed, with a 🛑 on it, that *"This attack does 30 damage. …Weakness or Resistance."* being refused
demonstrated that composition fails when both halves build. **That head is itself refused 13/13** —
base damage lives in the `damage` column and no reader claims a bare damage sentence — so the
specimen carries a HEAD blocker and demonstrates nothing. The correct demonstration is the **Cynthia
head + a W-or-R tail** (both halves build, whole string refused, split null) against the control
***"…head. Draw 3 cards."*, which COMPOSES.** A confident claim with true content and false evidence.

**(2) 🛑 THE FORK WAS DECIDED BY MEASUREMENT, AND THE TWO BLOCKERS WERE NEVER INDEPENDENT.** Measured
over all 640 rows: **(A) alone frees 0 / 0** — the bare clause is printed standalone **zero** times,
occurring only as the tail of file lines 337 and 529. **(B) alone frees 0 / 0** — the set *refused
whole, unserved by all four splitters, head claimed, tail claimed by a NON-`deriveAttackEffect`
reader* is **EMPTY** at this head, because row 529's own tail is refused 13/13, so there is nothing
to compose. **(A)+(B) together free 1 / 1 — and a whole-sentence anchor frees the same 1 / 1, for
less.** ⚠️ **So my brief's framing was the error**: I asked which branch freed more, and neither
branch pays alone. **A branch with an empty solo payoff is not half a slice; it is a prerequisite.**

**(3) 🛑 AND THE COMPOSITION BRANCH IS AN ARMED MUTANT.** The tripwire audit over all **2,373**
pre-existing rows, enumerated from the module across 19 needles, found
**`D409-tail-guard-widened-to-any-reader`**, whose `replace` is *literally*
`if (!claimedByAnyReader(tail)) return null;` — byte for byte the widening — and whose `what` states
the defect it ships: *"a tail claimed only by a DAMAGE reader would then be admitted, and the caller
has nowhere to put it… SILENT IN EVERY CENSUS."* `attack.ts` appends `compoundSplit.tail`'s **ops**
to the program and a suppression has none. **Building that branch would have disarmed the tripwire
that describes it** (D436's GAP). **Exactly one row rests on this refusal, and it is the one that
names it.** D447 had already refused a mirror splitter at *1 sentence / 2 printings, "which does not
pay"*; this seam pays **less**.

**(4) THE SHIPPED FAMILY IDIOM WAS ALREADY A WHOLE-SENTENCE ANCHOR.** Varying the segment **kept**
(5 heads × 4 tails) found the finding: **corpus line 616's head is REFUSED on its own while its
compound BUILDS.** The idiom for `<head>. <W/R suppression>` is a whole-sentence anchor that swallows
the tail, at **four addresses / 12 printings** (lines 539, 600, 616, 620) plus line 392 through
`splitAttackRequirementClause`. **Composition was never this family's road.**

**(5) ⚠️ MY CENTRAL DESIGN QUESTION RESTED ON A CONFLATION, AND THE CODE SAYS SO EXPLICITLY.**
`damageChosen.ignoreWR` is an **op** field on the snipe path — one boolean nulling Weakness,
Resistance and installed reduction together — where row 529 lands on `AttackDamageSuppression`, the
**main hit**, which has carried **three independent booleans since D192**, read at three different
steps. `effects.ts:27638` already reads *"NOT `damageChosen.ignoreWR`, AND THAT WAS CHECKED RATHER
THAN ASSUMED… SIBLING, not shared."* **So row 529 is NOT the distinguishing case for D492's unpinned
over-reach**, which is confirmed real on its own carrier and stays unpinned. What row 529 **is**: the
**first solo inhabitant of `AttackDamageSuppression.weakness`**, a field D192 kept separate on a
measurement that named this very row. Driven on a synthetic ×2-Fire-Weakness / −30-Fire-Resistance
wall off a base of 120: `{weakness}` **90**, `{weakness,resistance}` **120**, no suppression **210**,
`{resistance}` **240** — four distinct numbers, **and the first pair is separated by no printed
board** (no D1 card lists one type in both columns), which is why the fixture is synthetic and says
so.

**(6) WHAT SHIPPED.** One constant `BENCH_COUNTER_FILTERED_SUPPRESSED`, read by **two** readers: the
multiplier via a one-line `??` on the **existing** arm (arm body **byte-unchanged**, so D467's three
rows stay anchored and no `return` line becomes a byte-twin — D437/D448 **avoided rather than
paid**), and the suppression reader via a new arm **gated on the multiplier also claiming it**, so
the pair cannot half-build (D445's `.test()`-beside-an-`.exec()` defect, answered by asking the arm
that owns the guards). **`DAMAGE_SUPPRESSION` is byte-unchanged**, so the standalone clause stays
refused and three shipped `toBeNull` rungs in three files stay green. D472 measured that the tight
tail, a five-object alternation and a bare `(.+)` tail all claim the **same 1/1**, so the tight
spelling ships. **`MATCH_RECORD_VERSION` 29 on the NO-CARRIER argument** — both readings are
parse-time `const`s inside `attack()`, absent from `packages/schema` — **named before it was made and
explicitly NOT D450's reachability, which is about `EffectOp`s and is the wrong shape here.**

**(7) THE DESCRIBER TRACE — EMPTY, SEVENTH CONSECUTIVE SLICE.** This slice produces **no `EffectOp`**
at all (`deriveAttackEffect(printed) === null`), so no program, no park, and `withConsequence` is
unreachable. The user-visible surface that **does** move is `log.ts`, now rendered and asserted:
`· scaled +120`, no `×2` segment, `−30` present as the control.

**(8) ATTRIBUTION CONTROL AT BOTH LAYERS — AND A NEW BLINDNESS FOUND.** Restored in a `finally` with
size and sha256 verified on both files. Under the READER mutation: census GREEN, value re-point RED,
behavioural RED. Under the EXECUTOR mutation: census GREEN, value re-point **GREEN**, behavioural
RED. 🆕 **And the dual-claim POPULATION rung stayed GREEN under the reader mutation** — it asserts
*how many readers claim*, never *what they answer*. **D469's census blindness reproduced one layer
down, at a population rung.**

**(9) NUMBERS.** `BUILT.attack` **1609 → 1610**; resolved **526/1559 → 527/1560**; raw unbuilt
**114 → 113**; residue **88/123 → 87/122**; **`COMPOUND-head` 8/9 → 7/8**; `OPAQUE` **UNCHANGED at
65/94**; `claimedWhole` **198/495 → 199/496**. The sentence and printing steps **AGREE at 1 and 1**,
measured. Tax in **four waves** — 27 line-targeted literals (D492's rule, paired analysis 27+/27−
symmetric), 18 front terms across 6 files counted as **matches not lines**, 12 live heads, 4
stragglers. 🆕 **Both `BUILT.attack` chains were spliced at a COLUMN-ASSERTED occurrence** because the
marker occurs twice per line (D463). ✅ **Version tax re-measured by the caller: 93 occurrences / 66
files / 21 `it(` titles**, against `git grep`'s **91 / 65** — ⚠️ **the builder reported 92; the
committed figure is the caller's measurement.** `it(` **+21 EXACT** (20 new suite + 1
`benchNounScaling`), verified per file.

'''
s=s.replace(log_anchor,ENTRY+log_anchor,1)
io.open(p,'w',encoding='utf-8').write(s)
print('ok')
