import io
p='docs/progress.md'
s=io.open(p,encoding='utf-8').read()
old_row='| simulator | P3 | 🚧 **M1–M3 + M4 done; M5 in progress** (latest: **P3-M5 — D493,'
i=s.index(old_row); j=s.index('\n',i)
new_row=('| simulator | P3 | 🚧 **M1–M3 + M4 done; M5 in progress** (latest: **P3-M5 — D494, *the '
 'untyped Energy-in-play threshold, and the first inherited price in six slices to survive contact*: '
 'the correction of D493\'s false claim held in every cell, while the one HEDGE failed — three axes, '
 'not four, the obvious fourth degenerate. Five branches each free 0/0 alone and only the whole frees '
 '1/1, so the fork was never a fork for the second consecutive slice. The describer work was real but '
 'in `conditionNote`, where the category argument never looks. Row 337 was OPAQUE and cost LESS than '
 'its COMPOUND-head twin. 1 sentence / 1 printing**; engine 0.389.0, corpus 2,391, check GREEN '
 '480/10,944) |')
s=s[:i]+new_row+s[j:]
log_anchor='### 2026-09-10 — build session #433 (P3-M5 — D493)'
assert s.count(log_anchor)==1
ENTRY = r'''### 2026-09-10 — build session #434 (P3-M5 — D494)

**THE UNTYPED ENERGY-IN-PLAY THRESHOLD — AND THE FIRST INHERITED PRICE IN SIX SLICES TO SURVIVE
CONTACT, WHILE THE HEDGE WAS WHAT FAILED.** Engine **0.388.0 → 0.389.0**, **`MATCH_RECORD_VERSION`
29 UNCHANGED**, mutation corpus **2,379 → 2,391**, archive ratchet **163 → 164**, declared survivors
**43 → 44**, `bun run check` GREEN at **480 files / 10,944 tests**.

**(0) ✅ THE BRIEF'S CORRECTION OF D493 WAS ITSELF RIGHT, IN EVERY CELL.** D493's report had priced
row 337 saying *"no reader takes an in-play Energy threshold as a bonus antecedent."* Measured:
*"If you have **at least 3 {D}** Energy in play, this attack does 50 more damage."* **BUILDS** via
`deriveAttackDamageBonus` and is corpus line 341. The shipped anchor demands **both** the `at least
N` quantifier **and** a type token, so row 337 differs on both head axes plus the tail. **This is the
first inherited price in six slices to survive re-derivation intact.**

**(1) 🛑 AND THE PATTERN INVERTED — CONFIDENT CLAIMS ALL RIGHT, THE ONE HEDGE WRONG.** The brief
said *"the axes I can see are QUANTIFIER, TYPE, TAIL — expect at least ONE MORE."* There are
**three**. The obvious fourth, AMOUNT, is **DEGENERATE** (D491): `70` against the sibling's `50` is a
capture on an anchor that already builds, so a 2⁴ table would have been the 2³ table reported twice.
**The extra dimension is INSIDE the tail** — its SCOPE is three-valued (`absent` / `Weakness` /
`Weakness or Resistance`) — and a value is not an axis. ⚠️ **Recorded as a counter-example rather
than assuming the hedged-claims-carry tendency is a law.** The full **2 × 2 × 3 = 12-point** lattice
× 13 readers: **no proper subset builds**, and the single built point **is** corpus line 341 — which
is what justifies a whole-sentence anchor over a composition.

**(2) 🛑 EVERY BRANCH ALONE FREES 0 / 0 — THE FORK WAS NEVER A FORK, FOR THE SECOND CONSECUTIVE
SLICE.** Measured over all 640 rows with the **canonical residue predicate copied verbatim from
`censusAtHead.test.ts`** (D430) rather than a hand-rolled one: quantifier **0/0**, type **0/0**, both
head axes together **0/0**, the bare-Weakness tail **0/0**, the composition seam **0/0** — and
**only all of it together frees 1/1**. The reachable population is directly checkable: exactly two
corpus rows carry an Energy-in-play threshold (341 built, 337 not) and exactly two carry the
bare-Weakness tail (529 built at D493, 337 not).

**(3) 🛑 THE COMPOSITION SEAM IS AN ARMED MUTANT FOR THE SECOND SLICE RUNNING.** The tripwire audit
over all 2,379 rows, enumerated from the module across 17 needles, found
`D409-tail-guard-widened-to-any-reader` again — `replace` byte-for-byte the widening, defect in its
own `what`. Not built; re-probed and still KILLED. **No mutant row rested on this refusal** (the
printed antecedent returns 0 rows). 🆕 **AND A GENUINE ABSENCE FINDING**: `conditionHolds`'
`yourEnergyInPlayAtLeast` arm — the line this slice evaluates through — **had ZERO mutant rows
intersecting it by span since the member shipped at D193**, as did its `conditionNote` arm. Two of
the twelve new rows close that.

**(4) UNTYPED IS THE FILTER'S ABSENCE AND A GENUINELY DIFFERENT PREDICATE, DRIVEN.**
`countEnergyInPlay`'s `null` arm counts Energy **CARDS** (`holder.energy.length`) where a type asks
`providesEnergyType` per uid. So the widening costs **ZERO interpreter bytes** and `conditionHolds`'
line is **byte-identical**. The separating board is **2 × {W} + 1 × {D}**: 3 untyped, 2 as `{W}`,
1 as `{D}` — so *every* type narrowing falls short of the printed threshold, not just the
neighbour's (D448).

**(5) D493's TWO-READER IDIOM TRANSFERS — TRACED, NOT ASSUMED.** `attack.ts:1618` binds
`damageBonus` off `effect`; the suppression binds off the **same local**, and its own block says it
is deliberately not chained onto the `damageBonus !== null` ladder. So the pair costs **one constant,
one clause row and ZERO `attack.ts` bytes**, with the suppression arm **gated on the bonus arm
claiming it** so the pair cannot half-build (D445).

**(6) `MATCH_RECORD_VERSION` 29 AT TWO ADDRESSES ON TWO ARGUMENTS (D443).** The **reading**
(`AttackDamageBonus`/`AttackDamageSuppression`) by **NO CARRIER** — parse-time `const` locals inside
`attack()`, absent from `packages/schema`, driven over a serialised post-attack `GameState`. The
**`BoardCondition` field** by **D125/D333's WIDENING**, because `conditionGate.cond` is an `EffectOp`
field and reaches `MatchRecord.state` — ⚠️ **so the no-carrier argument is UNAVAILABLE there, and the
builder says so** rather than reusing it. Driven over a reconstructed v29 value that answers a
**different number** on the same board.

**(7) 🆕 THE DESCRIBER WORK WAS REAL, IN THE PLACE THE CATEGORY ARGUMENT NEVER LOOKS.**
`describeBranch`/`describeCondition` are **EMPTY for the eighth consecutive slice**, traced to their
single call site — this program emits **no op at all**. But widening `energy` to admit `null` makes
`conditionNote`'s shipped ternary interpolate **`${null}` → *"you have at least 3 null Energy in
play"***, with `tsc` silent. The arm is **owed** and is **unrenderable from any printed sentence
today** (D446) — asserted as a sweep over every op the derived attack column produces rather than
claimed, with a mutant deleting it KILLED.

**(8) 🆕 `log.ts` NEEDED NO NEW ARM, AND THE LIMIT IS RECORDED AT THE RUNG.** Rendered rather than
reasoned about (D456): a suppressed step carries `null`, so the `weakness` crumb simply does not
render. ⚠️ **The honest limit, written beside the rung**: the crumb's *absence* cannot tell a player
*"Weakness was suppressed"* from *"this body has no Weakness."* That is D192's shipped design and
this slice does not change it.

**(9) 🆕 THE ATTRIBUTION CONTROL FOUND A DEFECT IN THE BUILDER'S OWN KILLER SETS.** Hunting one suite
at a time, `typedEnergyThreshold.test.ts` — named on the strength of its **name** — **kills neither
`conditionHolds` row** and carries zero references to the member. The measured killers are two
shipped suites that had been discriminating that line **since D193/D376 and had never been credited
with it** — DRIVEN-BUT-UNPINNED (D474), not untested. Corrected before the second probe. The layer
map reproduced D491's exactly, **and confirmed D493's addition: the dual-claim POPULATION rung is
blind at BOTH layers**, so both such rungs now say so in their own comments.

**(10) 🆕 ROW 337 WAS `OPAQUE`, AND IT COST LESS THAN ITS `COMPOUND-head` TWIN ONE SLICE EARLIER.**
The instrument could not reach it because the edit to a built string is a quantifier substitution
**and** a type substitution **and** a tail removal — three **separated** points, where all three of
`residue-census.ts`'s probes are **single-region**. **`OPAQUE` means UNCLASSIFIED, never EXPENSIVE**,
for the second time in this run.

**(11) NUMBERS.** `BUILT.attack` **1610 → 1611**; residue **87/122 → 86/121**; **`OPAQUE` 65/94 →
64/93**; `claimedWhole` **199/496 → 200/497**; dual-claim population **2 → 3**. The sentence and
printing steps **AGREE at 1 and 1**. Tax in **four waves**, ⚠️ **waves 2 and 3 being the SAME `it`
blocks** — the sibling assertion behind the first throw, every time (D462). Every literal patched
**by line number from the runner's `file:line`** (D492). `Math.round` numerator **intersected to
{24}**, unmoved, and the rung is now **strictly tighter** than before with no edit. ⚠️ **`it(` SITES
26 but TESTS +28, and that is correct** — one `it.each` over 3 seeds is one site and three tests;
counted with a pattern that admits `it.each`, it agrees with vitest exactly. ✅ **Version tax 94 / 67
/ 22**, against `git grep`'s 92 / 66. 🛑 **The inherited total was SHORT BY ONE** — D493's note said
92 where the truth was 93, **the 93rd being that note's own sentence**, so the mechanical bump had to
skip **two** historical sites rather than one. 🆕 **And a precondition on D488's rule nobody had
stated: the self-reference fires on the LITERAL, never on the PATTERN** — a paragraph writing its
grep escaped does not match the literal it counts, so it does not count itself.

'''
s=s.replace(log_anchor,ENTRY+log_anchor,1)
io.open(p,'w',encoding='utf-8').write(s)
print('ok')
