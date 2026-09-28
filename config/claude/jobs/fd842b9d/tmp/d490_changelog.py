import io, sys
P = "/home/jofre/projects/luminous_ui/packages/engine/src/index.ts"
s = io.open(P, encoding="utf-8").read()
ANCHOR = "    \U0001f195\U0001f195\U0001f195 engineVersion 0.383.0 → **0.384.0** (D489 — THE HAND DISCARD WHOSE COUNT IS"
NEW = """    \U0001f195\U0001f195\U0001f195 engineVersion 0.384.0 → **0.385.0** (D490 — THE MILL OF **BOTH** DECKS,
    SCALED BY THE ENERGY AMONG WHAT IT MILLED. `censusAttackCorpus.ts` **FILE LINE 130** —
    *"Discard the top card of each player's deck. This attack does 140 more damage for each
    Energy card discarded in this way."*, **1 sentence / 2 legal printings**, and the LAST
    unbuilt member of the `discarded in this way` family (12 sentences / 27 printings, all
    twelve now claimed). Build state derived off `attackReaderSurface()`'s THIRTEEN
    `deriveAttack*` exports and never off `programFor` (D480/D482): **REFUSED 13 / 13**, all
    four splitters null, no registry row.

    \U0001f6d1 **THE INHERITED PRICE WAS HALF WRONG AND THE OTHER HALF WAS ALSO ALREADY PAID.**
    D489 recorded it as *"a both-decks recording mill PLUS the additive `damageDefender.base`
    path"*. The additive path has shipped since **D403** with two live printings on it, and
    the RECORDING half of the mill shipped at **D488** (`discardDeckTop.recordAs`). What was
    genuinely missing was ONE thing: the two-deck WALK. That is the fifth slice running whose
    inherited price named something already built.

    \U0001f6d1 **THE 2⁵ AXIS-SUBSTITUTION LATTICE RAN IN FULL — 32 POINTS × 13 READERS — AND NO
    PROPER SUBSET BUILDS**: 0 of 5 at one axis, 0 of 10 at two, 0 of 10 at three, 0 of 5 at
    four. ⚠️ **AND THE AXES ARE COUNTED FROM THE PRINT: FIVE, where the work order named
    four.** The unnamed one is the JOINER — this sentence is PERIOD-joined where D488's mill
    compound prints `, and` — and it is not redundant with the `more` axis, because the
    additive family's other printed head is itself period-joined.

    \U0001f6d1 **ONE OP, NOT TWO SEQUENTIAL MILLS, AND THE §9.2 RECORD DECIDES IT.**
    `recordMoved` ASSIGNS, so two `discardDeckTop`s filing into `discarded` leave only the
    SECOND deck's card in the slot — 190 where the sentence deals 330. Two slots is no escape
    either: `damageDefender.count` is ONE `EffectSlot`. Driven in §7 rather than argued.

    \U0001f6d1 **A TWO-MEMBER READING UNION, NOT A FOURTEENTH READER, AND THE ARGUMENT IS
    MEASURED MARGINAL SITES (D424).** A new `deriveAttack*` export enrols itself in
    `attackReaderSurface()` by NAME (D444), which at this head would have moved **75
    `expect(attackReaderSurface()).toHaveLength(13)` assertions across 74 files** plus each
    file's hand-listed `READERS` array. Riding `deriveAttackDiscardScaledBoost` costs **ZERO
    bytes in `attack.ts`** — `scaledBase`, `effectSimulated` and `modifierSimulated` are each
    spelled `discardScaledBoost !== null`. And it cannot be a `deriveAttackEffect` arm at any
    price (D403's argument): the printed *"more"* keeps the base, which only `attack.ts` has.

    **ONE new op VALUE** (`discardDeckTop.whose: "eachPlayer"`), dispatched by a `switch`
    where a ternary stood — D447's defect at a new address, and the reason the old line could
    not simply gain a member. **ZERO** new `EffectOp` kinds, op FIELDS, `EffectSlot` /
    `CardFilter` / `DamageCountSource` / `BoardCondition` members, readers (**13**), prompts,
    parks, choice kinds, events, error codes, `GameState` fields, registry rows,
    `FIXTURE_POOL` ids (file-local `cardPool`, D414), `redact.ts` bytes, `packages/schema`
    bytes or `log.ts` bytes. **`log.ts` standing still is a MEASUREMENT**: the renderer's
    voice hangs off `actor === seat` and not off the op's field, so a walk emitting one row
    per seat gets both wordings free.

    \U0001f6d1 **`MATCH_RECORD_VERSION` STAYS 29 ON REACHABILITY (D450) IN ITS FIRST-POSITION
    FORM (D465), AND "this byte already ships" IS FALSE HERE** — `"eachPlayer"` is a value no
    v29 deploy could write. The sole producer returns a TWO-op program whose mill is at index
    0 and whose damage op returns a `GameState`, so no continuation is written at all; driven
    on a firing board AND a whiffing one, plus the LOSS direction over a reconstructed v29
    `whose: "self"`.

    ⚠️ **THE DESCRIBER OBLIGATION WAS EMPTY AND IT WAS TRACED, NOT ARGUED FROM CATEGORY**
    (D478/D489, third slice running). `withConsequence` has ONE call site and returns the
    prompt unchanged unless `recordSlotOf(op)` is defined AND the queue holds a `recordGate`
    on that slot; `recordSlotOf` lists seven ops and `discardDeckTop` is not one — and more
    decisively, neither op in this program can park.

    \U0001f6d1 **TWO PHANTOM SPECIMENS CORRECTED, AND BOTH WERE THE SAME INVENTED FIGURE.**
    `deckTopMill.test.ts`'s `REAL_NEAR_MISSES[4]` — documented *"verbatim off the local D1"* —
    read **100** more damage where the committed column prints **140**, and `effects.ts`
    carried the same wrong figure at two doc sites. That is D452's *byte pin on an invented
    string*, arriving through a hand-retyped DAMAGE FIGURE; no byte pin can catch one, and the
    repair is D452's: the specimen is now asserted to be a row of `legalAttackCorpus()` with
    its printing count read off the corpus. The card id is dropped for the corpus FILE LINE
    because this checkout has no D1 (D425/D448).

    ⚠️ **THE VERSION TAX, RE-MEASURED AT THIS HEAD RATHER THAN FORECAST: 85 occurrences across
    63 files, 18 of them `it(…)` TITLES, with SEVEN history occurrences of `0.384.0` left
    alone.** D490 AUTHORS a pin, which is the half D427 says every note misses. ⚠️ **And
    D489's exception list was one short**: it named FOUR where there were FIVE, calling "this
    heading" the paragraph INSIDE its changelog entry and missing the entry's own
    `0.383.0 → 0.384.0` heading — D488's self-reference rule fired a second time.)
"""
if s.count(ANCHOR) != 1:
    sys.stderr.write("ANCHOR COUNT %d\n" % s.count(ANCHOR)); raise SystemExit(2)
s = (NEW + ANCHOR).join(s.split(ANCHOR))
open(P, "wb").write(s.encode("utf-8"))
print("changelog entry added")
