import io
p='docs/progress.md'
s=io.open(p,encoding='utf-8').read()
old_row='| simulator | P3 | 🚧 **M1–M3 + M4 done; M5 in progress** (latest: **P3-M5 — D488,'
i=s.index(old_row); j=s.index('\n',i)
new_row=('| simulator | P3 | 🚧 **M1–M3 + M4 done; M5 in progress** (latest: **P3-M5 — D489, *the hand '
 'discard whose count is a §9.2 slot, and a brief whose central fork was a false dichotomy*: the full '
 '2⁵ axis-deletion lattice × 13 readers shows NO proper subset of the sentence builds, and there was a '
 'fifth axis the work order never named. The carrier was neither of the two the brief offered — '
 '`payFromHand` already had the source, the filter and the §9.2 filing and lacked only the quantifier, '
 'while the `from`-member route would have changed the PROMPT\'s candidate type. The describer '
 'obligation called *live* was empty again: parking is not the trigger, a gate is. 1 sentence / 2 '
 'printings, version HELD on the serialized alphabet**; engine 0.384.0, corpus 2,331, check GREEN '
 '475/10,792) |')
s=s[:i]+new_row+s[j:]

log_anchor='### 2026-09-08 — build session #428 (P3-M5 — D488)'
assert s.count(log_anchor)==1
ENTRY = r'''### 2026-09-08 — build session #429 (P3-M5 — D489)

**THE HAND DISCARD WHOSE COUNT IS A §9.2 SLOT — AND TWO CONFIDENTLY-STATED BRIEF CLAIMS FALSIFIED,
ONE OF THEM A FALSE DICHOTOMY.** Engine **0.383.0 → 0.384.0**, **`MATCH_RECORD_VERSION` 29
UNCHANGED**, mutation corpus **2,312 → 2,331**, archive ratchet **158 → 159**, `bun run check` GREEN
at **475 files / 10,792 tests**.

**(0) BUILD STATE, OFF THE RIGHT ORACLE.** All 13 `deriveAttack*` exports called on the printed
sentence: **REFUSED by 13 / 13**, all four splitters null, no registry row. `refusedPrintings.ts`
re-checked and still silent by construction — `RefusalSurface` deliberately has no `"attack"` member
(*"an attack sentence is built by a DERIVER, not by a row"*). Both printings' apostrophes measured as
**U+0027** with `codePointAt`, not read by eye.

**(1) 🛑 THE AXIS-DELETION LATTICE, RUN IN FULL — 2⁵ POINTS × 13 READERS — AND NO PROPER SUBSET
BUILDS.** Each axis was substituted onto its nearest **BUILT** spelling rather than deleted outright,
because deleting a clause confounds *"this axis is the blocker"* with *"the remainder is not a
sentence"*. 0 of 1 at zero axes changed, **0 of 5** at one, **0 of 10** at two, **0 of 10** at three,
**0 of 5** at four, and **1 of 1 only when all five move** — landing on
`ENERGY_DISCARD_SCALED_DAMAGE`. ⚠️ **There is a FIFTH axis the brief never named**: the printed noun
is bare `Energy cards` with no type token, where the shipped anchor's filter group is mandatory.
**So the brief's verified-with-a-witness claim — *"the counting half of the head already ships in
full; only the SOURCE ZONE is missing"* — was true of the VOCABULARY and false of the SENTENCE.**

**(2) IS THE ROW ALONE? MEASURED, AND YES.** Residue at base 103 sentences / 148 printings. Exactly
one other residue row opens with a hand discard (*"Discard a card from your hand. If you do, your
opponent discards a card from their hand."*) and it does **not** share the blocker: its head is
D473's shipped `payFromHand{count:1,recordAs:"paid"}`, its consequent **builds standalone**, and both
splitters return null — it needs a whole-sentence anchor over a `recordGate`. Exactly one other row
has a chosen-target hit whose amount scales, refused on the **arity of the fold**: *"for each damage
counter on that Pokémon"* counts on a body not yet chosen, and a §9.2 slot is known **before** the
pick. **D483's rule holds: a shared printed phrase is not a shared blocker.** Both pinned as rungs.

**(3) 🛑 THE BRIEF'S CENTRAL FORK WAS A FALSE DICHOTOMY.** It asked *"a seventh `discardEnergy.from`
member, or the own-side mirror of D485's `discardFromOpponentHand`?"* — **neither.** The carrier is
**`payFromHand { count; to; filter?; recordAs? }`**, which already moves filtered cards out of the
controller's own hand into the discard, files their uids under a §9.2 slot, and parks through
`chooseCards` with the hidden-information note a hand offer owes. **What it lacked was the
QUANTIFIER**, and that is `discardEnergy.count`'s own D361 widening at the sibling op — shipped as a
**second union arm** (`{count:"any"; cap: number; to:"discard"}`) rather than two optional fields, on
D361's `opponentEach` idiom, so an uncapped declinable hand discard and a declinable payment under
the deck both stay unrepresentable. ⚠️ **And the `from`-member route was never one union member**:
every machine under `discardEnergy` takes a `PokemonRef` — `discardableEnergies` yields
`{uid, from: PokemonRef}`, the §11 shield filters those refs, `interchangeableCandidates` keys on the
host, and the **park itself carries refs across the wire**. A hand card has no ref, so that route
changes the **prompt's candidate shape** — D457's five mirrors (`packages/schema`, `redact.ts`,
`projection.ts`, both HUDs) — to say what `chooseCards` already says.

**(4) D420's STRUCTURAL GUARD GAINS A THIRD NAMED ESCAPE, NOT A RELAXATION.** An attack-borne
`payFromHand` owes a printed cancel (D420) or a §9.2 gate on its slot (D473) — or, now, is
**declinable AND scaled by its own slot**. Neither half alone suffices, and §5 drives it: *"Discard
up to 3 cards from your hand. Knock Out your opponent's Active Pokémon."* is declinable and would be
a **free Knock Out**. `handEnergyCancel` §4's population steps **5 sentences / 6 printings → 6 / 8**,
partitioned three ways in both directions, with five one-axis near-misses.

**(5) THE FIELD IS NAMED AND NOT A BOOLEAN, AND THE REASON IS MEASURED.** `perTakenPrize` and
`perEnergyOnSelf` name an **implicit** source the fold finds from `(state, ctx)`; an `EffectSlot` is
an **address** with three inhabitants, so a boolean must hard-code one, and the board that breaks it
is a program filing both `paid` and `discarded` — **D458 measured that two sequential recorders
overwrite one slot**. Not `count`, confirmed at the declaration (*"`damageChosen.count` is ALREADY
TAKEN and means the ARITY"*). Shipped as `damageChosen.perRecorded?: EffectSlot`, with **no
`countFilter` twin**: the filing op is already narrowed by the printed noun, so a filter would be
unfalsifiable on every board this sentence reaches, and the falsifier is written at the site.

**(6) THE FOLD ALREADY EXISTED AND THE HEDGED CLAIM CARRIED AGAIN — SEVENTH SLICE RUNNING.**
`snipeAmount(op, state, ctx)` has been the second parallel fold since Covetous Ivy, and **`record`
was already a parameter at both call sites** (`stepOp`, `applyChoice`): **one extra argument and four
lines.** The double-read hazard is real and answered — `resumeProgram` seeds its accumulator from
`cont.record` before `applyChoice`, so the caption and the hit are the same number **because the
record rides the continuation**, driven in §7 with an empty-record board that must deal 0 rather than
degrade to the unscaled hit.

**(7) `MATCH_RECORD_VERSION` 29 HELD ON THE SERIALIZED ALPHABET — AND THE REACHABILITY HALF IS FALSE
HERE.** This is a **two-park** program: the payment writes `phase.cont.pendingOp` with the snipe in
`rest`, then the snipe writes its own continuation, and the record rides between them. **Both new
bytes genuinely reach a saved `MatchRecord`.** The claim is that no v29 deploy could write either and
that ABSENT still means what a v29 writer meant — driven in **both** directions over reconstructed
v29 bytes: an exact `count: 2` payment still parks `min===max===2`, an unridden snipe still deals its
printed **60**, and the new bytes on the same board answer **3** and **120**.

**(8) THE DESCRIBER OBLIGATION MY BRIEF CALLED *LIVE* WAS EMPTY, FOR EXACTLY D478's REASON.** The
brief said *"This op parks. Check the call path and expect real work."* — **a CATEGORY ARGUMENT,
which is what D478 forbids.** `withConsequence` returns the prompt unchanged unless
`queue.find(q => q.op === "recordGate" && q.slot === slot)`; this queue holds one op, the snipe, so
`describeBranch`/`describeCondition` are **unreachable** — the same reason D488's was empty. **Two
slices running, a brief predicted describer work from parking.** Pinned as §8. The real describer
work was elsewhere: `handCostPhrase` learns the printed *"up to N"*, so the park's heading is
**`"Discard up to 3 Energy cards from your hand."` byte for byte** — which makes the caption a D457
witness that the op carried its `cap`.

**(9) THE PROMPT, THE ORDERING AND THE ZERO.** Two parks in one program, ordering driven (payment
first — an op that ran second scores an empty record). **Zero discarded ⇒ `snipeAmount` folds to 0 ⇒
`damageChosen` returns before it builds a prompt: the attack asks for no target and deals nothing** —
the existing `perTakenPrize` ending, and what the D420 escape rests on. An **empty offer** whiffs
inline, files `[]`, never parks; a **single** candidate still parks (D297).

**(10) BOARDS — SEVEN READINGS, SIX SEPARATED BY QUANTITY, TWO MORE ONLY BY CONTENTS.** Computed
before the board was written: correct **120**, rider dropped **60**, count = printed cap **180**,
count = whole pile afterwards **240**, count = hand size before **420**, wrong slot **0 and no pick
at all**, record lost across the park **0**. The two zeroes collide by construction and are separated
on a different axis (one parks and deals nothing, the other never parks). Two further readings — a
dropped filter and a collapsed interchangeable class — are **indistinguishable by damage**, so the
suite asserts the offer as an **id multiset** and the pile's contents. The board pre-empts two
algebraic identities: the discard pile **starts non-empty** and the hand holds **five** Energy plus
two non-Energy, so *"up to 3"*, *"discard all Energy"* and *"discard your hand"* are three different
moves. ⚠️ **A real defect the first board hid**: `cardIdentity` keys a Basic Energy on **what it
PROVIDES**, not its catalog id, so five unnamed `basicEnergy` fixtures are **one** interchangeable
class and a cap of 3 would have measured the ceiling and said nothing about the collapse. Found by a
red rung; fixed with three `typedEnergy` provisions.

**(11) 🛑 `censusAtHead` STAYING GREEN UNDER THE ATTRIBUTION CONTROL IS THE FINDING.** The central arm
was broken at its nearest wrong sibling — reading the printed **hand** head as a **board** discard
(`discardEnergy{from:"yours"}`) — each killer run alone, restored in a `finally` with size **and**
sha256 verified identical. **RED**: `handDiscardScaledSnipe`, `handEnergyCancel`,
`discardScaledDamage`, `scaledAnySnipe`, `anyTargetSnipe`. **GREEN**: `censusAtHead`,
`deckMillFilteredScale`, `payFromHand`. Under that wrong build the sentence still reads,
`resolvedByAnyReader` is still true, the residue still falls by one and `BUILT.attack` still steps —
**D469's rule demonstrated exactly: a census measures whether a sentence is CLAIMED, never whether it
is claimed CORRECTLY.** Five behavioural suites are what discriminate.

**(12) ANCHOR GENERALITY, MEASURED OVER ALL 640 ROWS BEFORE IT WAS WRITTEN (D472).** Six single-axis
generalisations — arity captured, zone opened, quantifier opened, count noun captured,
`Energy(?: cards)?`, W/R mandatory — each claims the **identical 1 sentence / 2 printings**. None
taken; the measurement is a rung. The one optional group is the W/R clarifier, on the family's own
stated rule, with the override recorded (D477).

**(13) WITNESS LOAD: 3 NAMED + 2 FILTER-BUILT = 5, FOR THE 1 ROW IT FREES.** `scaledAnySnipe` §1(a)
(reason **falsified** and corrected in place), `anyTargetSnipe` §5 (re-pointed onto the OP),
`discardScaledDamage` §1 (rung rebuilt as a partition), plus two the sentence is *counted into*
without being named — D465's finding. **The brief's guess was right on all three named files.**

**(14) NUMBERS.** Census delta **+1 sentence / +2 printings** — and the two steps **DISAGREE**, so
`.length` sites take +1 and `units(…)` sites take +2. `BUILT.attack` **1600 → 1602**; resolved
**521/1550 → 522/1552**; `rawUnbuiltSentences` **119 → 118**; `residueSentences` **93 → 92**;
`unbuiltAttack` **132 → 130**; `RAW_UNBUILT_ATTACK_UNITS` **182 → 180**; residue total **93/132 →
92/130**; `OPAQUE` **67/98 → 66/96**. Tax in **four waves** (20/23, 16/17, 5/6, 1/1), the last being
a **second chain sharing one physical line** (D456). ⚠️ **Version tax re-measured by the caller at
88 occurrences / 62 files / 18 `it(` titles** — see the resume point: `git grep` reports 84 / 61 / 17
because it sees only tracked files, and the builder's report quoted two mutually inconsistent
figures. `it(` **+36 EXACT** (35 new suite + 1 `handEnergyCancel`), vitest **10,756 → 10,792**;
`typecheck-coverage` **721 → 722**, `lint-coverage` **723 → 724**, files **474 → 475**.

'''
s=s.replace(log_anchor,ENTRY+log_anchor,1)
io.open(p,'w',encoding='utf-8').write(s)
print('ok')
