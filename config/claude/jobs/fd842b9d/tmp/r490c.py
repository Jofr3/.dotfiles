import io
p='docs/progress.md'
s=io.open(p,encoding='utf-8').read()
old_row='| simulator | P3 | 🚧 **M1–M3 + M4 done; M5 in progress** (latest: **P3-M5 — D489,'
i=s.index(old_row); j=s.index('\n',i)
new_row=('| simulator | P3 | 🚧 **M1–M3 + M4 done; M5 in progress** (latest: **P3-M5 — D490, *the mill '
 'of BOTH decks, and a phantom specimen pinned green in two files*: the last unbuilt member of the '
 '`discarded in this way` family, which is now CLOSED at 12 sentences / 27 printings. The inherited '
 'price was wrong in both halves and the correction of it was itself half-stale — the recording mill '
 'had shipped at D488 and only the two-deck WALK was missing. A near-miss documented "verbatim off '
 'the local D1" carried an INVENTED damage figure copied to two more sites, which no byte pin can '
 'catch. The record decided the spelling: `recordMoved` ASSIGNS, so two sequential mills answer 190 '
 'where the sentence deals 330. 1 sentence / 2 printings, version 29 held on reachability**; engine '
 '0.385.0, corpus 2,349, check GREEN 476/10,829) |')
s=s[:i]+new_row+s[j:]

log_anchor='### 2026-09-08 — build session #429 (P3-M5 — D489)'
assert s.count(log_anchor)==1
ENTRY = r'''### 2026-09-08 — build session #430 (P3-M5 — D490)

**THE MILL OF BOTH DECKS — AND A PHANTOM SPECIMEN WHOSE INVENTED DAMAGE FIGURE HAD BEEN PINNED GREEN
IN TWO FILES.** Engine **0.384.0 → 0.385.0**, **`MATCH_RECORD_VERSION` 29 UNCHANGED**, mutation
corpus **2,331 → 2,349**, archive ratchet **159 → 160**, `bun run check` GREEN at **476 files /
10,829 tests**.

**(0) BUILD STATE, OFF THE RIGHT ORACLE.** All 13 `deriveAttack*` exports on the printed sentence:
**REFUSED 13 / 13**; all four splitters null; no registry row. Apostrophe **U+0027 at index 35** by
`codePointAt`, and the whole 640-row column carries **zero** U+2019. After the build,
`deriveAttackDiscardScaledBoost` answers `{kind:"eachDeckMill", per:140}` and **the other twelve
still refuse**.

**(1) 🛑 THE INHERITED PRICE WAS WRONG IN BOTH HALVES, AND MY CORRECTION OF IT WAS ITSELF HALF-STALE.**
The recorded refusal said the row needed *"a both-decks RECORDING mill plus the additive
`damageDefender.base` path"*. I verified before briefing that `base` already ships — declared,
consumed at `interpreter.ts:1891` as `op.amount ?? (op.base ?? 0) + scoredSlot(…) * op.per`, with
live producers in `benchDiscardBoost.test.ts`, from commit `8dca7089` — and the builder confirmed
all four witnesses independently. ⚠️ **But the RECORDING half had also already shipped, at D488, two
slices ago** (`discardDeckTop.recordAs`). **What was genuinely missing was ONE thing: the two-deck
WALK.** Fifth consecutive slice where an inherited price named something already built.

**(2) 🛑 AND THE FAMILY HAD ZERO MUTANT ROWS ACROSS 87 DECISIONS — D478's LOOP, MEASURED.** A tripwire
audit over all 2,331 pre-existing rows on eight needles found **no row resting on the refusal**. The
refusal stopped the family being built; an unbuilt family attracted no rows; no row rested on it, so
nothing forced a re-derivation. Its stated reason (*"it needs a recording mill this engine does not
have"*) had been **false since D488**, and it also said *"refused by all TWELVE readers"* when the
surface has been **thirteen since D417**.

**(3) 🛑 A PHANTOM SPECIMEN, IN TWO FILES.** `deckTopMill.test.ts`'s `REAL_NEAR_MISSES[4]`,
documented *"verbatim off the local D1"*, reads **100** more damage. **The committed
`legal_standard = 1` column prints 140**, on the one and only row containing `each player's deck` —
and `effects.ts` had copied the invented figure to **two** more doc sites. **This is D452's
*byte-pin-on-an-invented-string* reached through a hand-retyped DAMAGE FIGURE rather than a
hand-retyped opening, and no byte pin can catch one: the pin measures the invention as faithfully as
it would measure the truth.** Both `toBeNull` rungs on that string were green for **two independent
wrong reasons** — the string is a phantom *and* the readers they name are the wrong ones. Repaired
per D452 at all three sites in one sweep (D415): the specimen is now the printed bytes, asserted to
be a row of `legalAttackCorpus()` with its printing count read off the corpus, and the card id
replaced by the corpus FILE LINE (no D1 here, so the id is unresolvable — **stated, not invented**).

**(4) THE AXIS LATTICE — 2⁵ × 13 READERS, AND MY BRIEF NAMED FOUR AXES WHERE THE PRINT HAS FIVE.**
The unnamed one is the **JOINER**: this sentence is period-joined where D488's mill compound prints
`, and`. It is **not** redundant with the `more` axis, because the additive family's other printed
head is itself period-joined — folding them together would hide the point where only the joiner
moves. **No proper subset builds**: 0 of 5 at weight 1, 0 of 10 at two, 0 of 10 at three, 0 of 5 at
four; the all-five point is D488's shipped compound. Committed as a rung, so it re-runs.

**(5) 🛑 THE RECORD DECIDED THE SPELLING — DRIVEN, NOT ARGUED.** `recordMoved` **ASSIGNS**
(`record[slot] = [...uids]`), so a `[mill self, mill opponent, damage]` program leaves only the
**SECOND** deck's card in `discarded` — measured on board C at **190 where the sentence deals 330**,
with both decks correctly milled and both log rows correct. Two slots is no escape either, because
`damageDefender.count` is one `EffectSlot` — also driven to 190. **D458 measured that overwrite on a
different pair; this is the first printing whose DAMAGE NUMBER turns on it.** So it ships as a third
`whose` value, `"eachPlayer"`, walked as a list of seats in one op — and as a **`switch`, not the
ternary it replaced**, because `op.whose === "self" ? ctx.seat : otherSeat(ctx.seat)` would have
dropped a third member silently out of the wrong side with `tsc` silent (**D447's `snipeTargets`
defect at a new address**). **Zero bytes in `attack.ts`** (three call sites all spelled
`discardScaledBoost !== null`) and **zero in `log.ts`** (the renderer's voice hangs off
`actor === seat`, so a per-seat walk gets both wordings free).

**(6) ⚠️ THE TWO SHIPPED "BOTH SEATS" PRECEDENTS DISAGREE, AND THE DISTINCTION IS THE FINDING (D433).**
`counterEachAll`'s `side:"both"` walks absolute `SEATS`; `handRefresh`'s `who:"both"` walks
controller-first. **`counterEachAll` emits one event per BODY, so seat order is not row order; this
op and `handRefresh` emit one row per SEAT, so the seat order IS the log's order.** Controller-first,
following `handRefresh`. 🛑 **Absolute seats is inert on every board where p1 attacks**, so the
killing rung runs the program from **p2's chair** — without it `D490-eachplayer-walks-the-absolute-seats`
would have survived against a file that looks thorough.

**(7) THE TAIL COUNTS BOTH DECKS, WITH A DAMAGE NUMBER ATTACHED.** The printed clause carries **no
"you"** where every built sibling that counts only your own says *"you discarded"*, and §9.2 reads
*"in this way"* as referring to what the earlier clause **did** — which was to discard from each
player's deck. Board A (Energy off mine, Pokémon off theirs) and board B (the mirror) both answer
**190**, where *count-mine* answers (190, 50) and *count-theirs* (50, 190).

**(8) THE EMPTY DECK, AND A NEW END-TO-END FINDING.** One empty side skips that seat and still mills
the other (§8.6 *"do as much as you can"*); both empty means **no row at all** and the printed base
alone, with the slot still filed as `[]`. D455's row about the mill announcing an empty deck **still
holds** and was re-transcribed onto the `continue`. 🆕 **This is the first op that can empty BOTH
decks at once, and the game does end** — not on the spot, but at the defender's very next draw,
which an attack hands them immediately; `runProgram` alone leaves both decks empty and the game
live, while the full swing ends in `gameOver`.

**(9) `MATCH_RECORD_VERSION` 29 ON REACHABILITY (D450/D465), AND NOT ON "THIS BYTE ALREADY SHIPS",
WHICH IS FALSE HERE.** `"eachPlayer"` is a value no v29 deploy could write. An `EffectOp` reaches a
saved `MatchRecord` only through `EffectContinuation`'s `{pendingOp, rest}`, written only on a park.
Driven three ways: the sole producer returns a **two-op** program, neither op can park, and
`phase.cont` is absent after the swing on a firing board **and** on a whiffing one. A programmatic
walk over every program the engine can build for the whole legal column finds `"eachPlayer"` at
exactly **one site**. The LOSS direction is driven over reconstructed v29 bytes: `whose:"self"` on
the same board still deals **190** where the new value answers **330**.

**(10) BOARDS — SEVEN READINGS, AND BOARD A ALONE SEPARATES ONLY SIX.** Computed as pure functions
before any board was written: the build **190 / 190 / 330**, mine-only **190 / 50 / 190**,
theirs-only **50 / 190 / 190**, filter dropped **330 / 330 / 330**, base dropped **140 / 140 / 280**,
my pile re-scanned **470 / 330 / 470**, both piles re-scanned **610 / 610 / 750**. ⚠️ **`mine only`
collides with the build on board A** — the algebraic identity the brief warned of — so the pair
(A, B) is what gives seven distinct signatures. **Both discard piles are PRE-SEEDED**, because on an
empty pile *"count the record"* and *"count the pile afterwards"* are identical for every deck and
noun. **Three candidates no board separates by quantity are separated by CONTENTS**: every board
asserts which deck lost which card and which pile gained it, by id.

**(11) THE DESCRIBER OBLIGATION, TRACED RATHER THAN ARGUED — AND EMPTY.** `withConsequence` has
**exactly one call site** (`runProgram`'s `"park" in stepped` branch) and returns the prompt
unchanged unless `recordSlotOf(op)` is defined **and** the queue holds a `recordGate` on that slot.
`recordSlotOf` lists **seven** ops and **`discardDeckTop` is not among them**; more decisively the
program never reaches that call site, driven on four boards. **Third slice running that a brief
predicted describer work from a parking/§9.2 category and the obligation was empty.**

**(12) 🛑 `censusAtHead` STAYED GREEN — AND SO DID ALL FOUR FAMILY SUITES.** With the assembler's
`whose: "eachPlayer"` mutated to `"self"` (restored in a `finally`, size and sha256 identical), the
behavioural suite went RED at 13/35 and **`censusAtHead`, `compoundCompose`, `clauseApostrophe`,
`precociousEvolution`, `deckMillFilteredScale`, `benchDiscardBoost`, `discardScaledDamage`,
`deckTopMill`, `exOnlyActive` and `sawkRequirementSplit` all stayed green.** D469's rule again — a
census measures whether a sentence is CLAIMED, never whether it is claimed CORRECTLY — **and one
layer further than D489's**: the four family suites whose witnesses were re-pointed are green
because their claims are about what the **READER** answers, while the mutation is in the
**ASSEMBLER**, downstream of it. **A witness re-pointed onto a reader's return value buys nothing
about the program that reading builds.**

**(13) A FIRST-PROBE GAP THAT WAS D452's EXACT DEFECT.** `D490-anchor-loses-its-caret` SURVIVED
because the leading-text near-miss read *"Before doing damage, **d**iscard the top card…"* — the
**lowercase `d`** meant the rung pinned the CASE while its comment claimed the anchor. Measured
directly, then a sentence-ending prefix added (the lowercase rung kept, being a real and separate
claim). Second probe: **17 killed · 1 known survivor · 0 GAP · 0 error**. Row balance **12
producer-side / 6 implementation-side** (D453). **Six pre-existing rows re-transcribed** (two D403,
two D455, two D488), all re-probed KILLED.

**(14) NUMBERS.** `BUILT.attack` **1602 → 1604** (bumped FIRST). Delta **+1 sentence / +2 printings —
the two DISAGREE**, so `.length` sites take 1 and `units(…)` sites take 2, **including in
`compoundCompose`'s `claimedWhole` 195/489 → 196/491**, which this sentence enters because it is
period-joined AND claimed whole. Residue **92/130 → 91/128**; `OPAQUE` **66/96 → 65/94**; raw unbuilt
**118/180 → 117/178**. `Math.round((inRows/unbuiltAttack)*100)` **18 → 19** with the numerator
**derived by intersection and UNMOVED at {24}**. Tax in **three waves (4, 9, 2)** — small at wave 1
only because 31 literals across 16 files were found first by grepping the OLD VALUES as bare tokens.
⚠️ **Version tax re-measured by the caller: 89 occurrences / 63 files / 19 `it(` titles** —
`git grep` reports **85 / 62** because it sees only tracked files, and the builder's report again
quoted a tracked-only occurrence count beside an untracked-inclusive file count, **one slice after
D489 wrote the convention against exactly that.** ⚠️ **D489's own history-exception list was one
short** (four named, five actual). `it(` **+37 EXACT** (36 new suite + 1 `benchDiscardBoost`).

'''
s=s.replace(log_anchor,ENTRY+log_anchor,1)
io.open(p,'w',encoding='utf-8').write(s)
print('ok')
