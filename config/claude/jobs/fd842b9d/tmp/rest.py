import io
p='docs/progress.md'
s=io.open(p,encoding='utf-8').read()

# --- status row ---
old_row = '| simulator | P3 | 🚧 **M1–M3 + M4 done; M5 in progress** (latest: **P3-M5 — D487,'
i = s.index(old_row)
j = s.index('\n', i)
new_row = ('| simulator | P3 | 🚧 **M1–M3 + M4 done; M5 in progress** (latest: **P3-M5 — D488, '
 '*the recording mill, and pair-hood MEASURED by axis deletion*: two residue rows share ONE mechanism '
 'and TWO blockers — a mill that filed nothing and a scaled count read by `.length` — proven by '
 'deleting each axis in turn and re-running all 13 readers, where D483\'s cluster split 2+2 under the '
 'same test. The composition near-miss is real and folds at declaration; on an EMPTY pile it is equal '
 'to the build BY ALGEBRA, so every board pre-seeds. Witness load was one file / two rungs for BOTH '
 'rows — per-mechanism, not per-row. 2 sentences / 2 printings, version HELD and driven**; engine '
 '0.383.0, corpus 2,312, check GREEN 474/10,756) |')
s = s[:i] + new_row + s[j:]

# --- session log ---
log_anchor = '### 2026-09-08 — build session #427 (P3-M5 — D487)'
assert s.count(log_anchor)==1
ENTRY = r'''### 2026-09-08 — build session #428 (P3-M5 — D488)

**THE RECORDING MILL — TWO ROWS, ONE MECHANISM, AND THE PAIR-HOOD MEASURED RATHER THAN ASSERTED.**
Engine **0.382.0 → 0.383.0**, **`MATCH_RECORD_VERSION` 29 UNCHANGED**, mutation corpus
**2,301 → 2,312**, archive ratchet **157 → 158**, `bun run check` GREEN at **474 files / 10,756
tests**.

**(0) BUILD STATE FIRST, OFF THE ORACLE THIS SURFACE ACTUALLY HAS.** All 13 `deriveAttack*` exports
run programmatically off `attackReaderSurface()`, never `programFor` (D480/D482). At HEAD both
sentences were refused by **13 / 13**. `refusedPrintings.ts` had nothing to say in either direction —
its limit 1 is that attack printings have **no rows in that table at all** — and both
`REFUSED_PRINTINGS` and `RESOLVED_REFUSALS` are untouched.

**(1) 🛑 THE TWO BLOCKERS, AND BOTH ROWS CARRY BOTH.** `discardDeckTop` carried **no `recordAs`** —
nothing filed what was milled — and `damageDefender.count: EffectSlot` was counted by **`.length`
with no filter**. Neither is what the brief predicted (see (6)).

**(2) 🛑 PAIR-HOOD BY AXIS DELETION — A MEASUREMENT, NOT AN ASSERTION.** Each axis deleted alone,
both rows re-run against all 13 readers: deleting the **FILTER** (`→ card`) refuses both **and
collapses them to the SAME STRING at two counts**; deleting the **MILL HEAD** (the shipped
Energy-discard head under the same filtered tail) refuses both; deleting the **SCALING** builds both
(`discardDeckTop count:3` / `count:7`); comma→period refuses both. **Two blockers, both rows carry
both, and the noun is neither.** Unlike D483's 2+2 split this is one mechanism. The filters differ in
KIND — a category (`anyEnergy`) versus an owner-prefixed name (`ownerPokemon`) — and that difference
cost **ZERO**: both members shipped. **Pair-hood is pinned in the corpus two ways**:
`D488-noun-group-goes-greedy` and `D488-noun-resolver-loses-the-owner` are characters only **row B**
can see, so had the pair split those two rows would have had no killer.

**(3) 🛑 THE COMPOSITION CHECK — THE NEAR-MISS IS DERIVABLE, AND IT CONSTRAINS THE BOARD.** Rewriting
the tail as *"…for each Energy card in your discard pile."* IS claimed by
`deriveAttackDamageMultiplier`, producing `cardsInDiscardPile { seat:"you", filter:{kind:"anyEnergy"} }`.
It fails on two independent grounds: it folds at **DECLARATION**, before the program runs, and it
counts the **WHOLE pile**. `deriveAttackDamageMultiplier(MILL_ENERGY)` is null, so there is no
composition to reach for. ⚠️ **But the counterweight fired as an ALGEBRAIC identity and did not
dissolve the question — it constrained the board.** On a pile that starts **EMPTY**, "count the
record" and "count the pile afterwards" are equal **for every deck, count and noun**, because the
pile afterwards *is* what the mill moved. **So every board in the suite pre-seeds the pile.** Board A
separates 6 of 8 candidate readings (80 / 240 / 0 / 320 / 640 / 160); **board B separates all 8**
(140 / 490 / 0 / 350 / 770 / 210 / 280 / 70) — which is why the file fields two decks. ⚠️ **The one
candidate NO board separates is a MILL-SIDE filter**: on any deck whose top N all match it is
arithmetically identical forever. Its separating axis is not a quantity but *which cards left the
deck*, so §6 asserts the pile **CONTENTS**, not only its size.

**(4) 🛑 WITNESS LOAD COUNTED BEFORE PRICING (D487-ii) — AND IT DID NOT SCALE WITH ROW COUNT.**
Grepped repo-wide: **neither sentence appears verbatim anywhere outside `censusAttackCorpus.ts`.**
The refusal witness is held **by PREDICATE**, in **one file, two rungs** — `discardScaledDamage.test.ts`
§1 (*"this anchor takes SIX… and only those"*; *"the remaining 3 sentences / 4 printings are a
different MECHANISM"*). `benchDiscardBoost.test.ts`'s and `deckTopMill.test.ts`'s mill refusals are
Camerupt's **additive** row, not these; `scaledAnySnipe`/`anyTargetSnipe` witness the hand-discard
sibling. **The load is 1 file / 2 rungs for the PAIR — shared, not per row — so building both cost
exactly what building one would have.** Both rungs re-pointed onto the **shape** rather than deleted
(D178/D438), and the first now discriminates the two arms **by the op** (`discardEnergy` vs
`discardDeckTop`): a `.length` re-point would have gone on being right while the sentence it names
stopped being true. ⚠️ **That rung's comment names TWO blockers for its leftovers and EXACTLY ONE IS
NOW PAID.** The `damageChosen` that reads a slot is still unbuilt and is what the one remaining
sentence needs.

**(5) WHAT SHIPPED.** Corpus **file lines 126 and 129**, 2 sentences / 2 legal printings, both
through one anchor `DECK_MILL_FILTERED_SCALED_DAMAGE`: one `deriveAttackEffect` arm, one noun
resolver `milledCardFilter` that **READS `DISCARD_PILE_NOUNS` without adding to it** (a row there
would widen D440's two anchors and claim a sentence the column does not print), two OPTIONAL op keys
(`discardDeckTop.recordAs`, `damageDefender.countFilter`, plus `countFilter?: never` on the flat
arm), `recordMoved` on both interpreter mill paths and one helper `scoredSlot`. **ZERO** new
`EffectOp`/`EffectSlot`/`CardFilter`/`BoardCondition`/`DamageCountSource` members, readers (**13**),
prompts, choice kinds, parks, events, error codes, state fields, registry rows, `FIXTURE_POOL` ids
(file-local `cardPool`), `redact.ts` or `packages/schema` bytes. New suite
`packages/engine/src/deckMillFilteredScale.test.ts`, **31 `it(`** over 11 sections.

**(6) ⚠️ WHERE THE BRIEF WAS WRONG — AND THE HEDGED HALF IS THE INTERESTING ONE.** It read the
blocker as *"a damage count source that reads a record slot, which the count-source union may or may
not have"*. **`DamageCountSource` is not involved at all**: that union folds at declaration, off the
board. This family's count is `damageDefender.count`, an `EffectSlot` read from inside the program
after the mill, and **it has shipped since D96**. The brief also **did not name the other blocker at
all**. Sixth consecutive slice where the hedged claim is the derived one — but *hedged and right*
here meant right that **something** was missing, not right about **what**. ⚠️ **And an inherited
figure it quoted was wrong in its exception list**: D487's version-tax paragraph says **THREE**
history occurrences left alone; there are **FOUR** — the changelog's D487 heading, `mutants.ts`'s
D275 ledger, `deckBottomDraw.test.ts`'s header arrow, **and that paragraph itself, which quotes the
arrow it is counting**. `grep` returns 85; `85 − 4 = 81`, **so the arithmetic was right while the
word was wrong** — a figure and its exception list are two claims and only the figure had a witness.
Corrected in `index.ts`.

**(7) `MATCH_RECORD_VERSION` 29 HELD, ARGUED AT THE HARD ADDRESS.** The alphabet DOES grow and
reachability is NOT empty — `discardDeckTop` rides `coinFlipGate.then`, `damageDefender` sits in
registry programs — so §9 **drives** that a v29 `{op:"discardDeckTop",whose:"self",count:3}` still
mills three and files nothing, and a v29 `{op:"damageDefender",per:80,count:"discarded"}` still
counts the whole slot: **240 vs the filtered 80, a different number**, so the rung cannot pass by
accident. **Describer obligation (D478) checked by CALL PATH and found EMPTY** — this build has
`recordAs` with no `recordGate`, `withConsequence` fires only on a park, neither op parks, and
`describeBranch` is reached only from `recordGate.then`.

**(8) ATTRIBUTION CONTROL, BY HAND.** The central arm broken at its nearest wrong sibling (`recordAs`
dropped → the shipped `DECK_TOP_MILL` + Hail Blade pair), each killer alone, restored in a `finally`,
string replacement only: **RED** `deckMillFilteredScale` (8 failed / 23 passed) and
`discardScaledDamage` (1 failed / 20 passed — **not this slice's suite, and not a census**);
**GREEN** `deckTopMill`, `hailBlade`, `benchDiscardBoost`, and **all four census suites**. Restored
size and sha256 both verified. **Fifteen slices running: something other than a census suite goes
red.**

**(9) THE CENSUS TAX, IN FOUR WAVES.** 20 sites, then 14, then 3, then green — the masked-`expect(`
effect firing in every round. `BUILT.attack` bumped **FIRST** (1598 → **1600**, D449). Two chain
sites needed a front-inserted `- 2` in `censusAtHead.test.ts`, one in `precociousEvolution.test.ts`,
14 more across six files; frozen endpoints untouched. 🆕 **The `Math.round` numerator was MEASURED BY
INTERSECTION rather than read**: the rung `round(inRows/unbuiltAttack × 100) === 18` is green at
**both** denominators, and `inRows ∈ {33,34}` at 184 `∩ {32,33}` at 182 `= {33}` — **UNMOVED**.
33/184 = 17.93 %, 33/182 = 18.13 %; the fraction held at 18 while only the denominator moved, so a
blind edit there would have been invisible.

**(10) NUMBERS.** Residue **95/134 → 93/132**; gate §A **121/95/134 → 119/93/132**; **`PHRASE-15` and
`PHRASE-16` both 1/1 → gone, two classes deleted**; `OPAQUE` **HELD at 67/98**; reader summand
**519/1548 → 521/1550**; `BUILT.attack` **1598 → 1600**; `units − built` **380 → 378**; raw unbuilt
sentences **121 → 119**, printings **184 → 182**. Version tax **81 occurrences / 61 files / 17 `it(`
titles**, four history occurrences left alone. `it(` **10,248 → 10,279 = +31**, vitest **10,725 →
10,756 = +31**, new suite **31** — EXACT. `typecheck-coverage` **720 → 721**; files **473 → 474**.

'''
s = s.replace(log_anchor, ENTRY + log_anchor, 1)
io.open(p,'w',encoding='utf-8').write(s)
print('ok')
