import io
EDITS = []

# ── effects.ts: OPPONENT_ENERGY_SCALE block (the refusal's FIRST copy) ──────────
EDITS.append(("packages/engine/src/effects.ts",
'''// `{C}` is deliberately absent from ENERGY_TYPE_BY_CODE (it is the conservative
// provision fallback for unauthored Special Energy), and "Basic Energy" is a card
// CATEGORY rather than a type and resolves to nothing at all, which is correct:
// "This attack does 40 damage for each Basic Energy attached to this Pokémon."
// (1 legal) asks a question `countEnergyInPlay` does not answer.''',
'''// {C} is deliberately absent from ENERGY_TYPE_BY_CODE (it is the conservative
// provision fallback for unauthored Special Energy), and "Basic Energy" is a card
// CATEGORY rather than a type and resolves to nothing at all, which is correct:
// "This attack does 40 damage for each Basic Energy attached to this Pokémon."
// (1 legal) asks a question `countEnergyInPlay` does not answer.
//
// 🆕🆕 **D500 — THE CLAUSE AFTER THE COLON WAS FALSE, AND IT STOOD FOR ~300
// DECISIONS BECAUSE NOTHING EXECUTES A REASON (D466).** Kept rather than deleted
// (D178), because the first half is still exactly right: `Basic` IS a card
// CATEGORY rather than a type, and that is precisely why it now resolves — the
// map has carried a card class since D118 (`Special`), and this is its
// complement. What was wrong is the carrier and the claim about it:
//   · `countEnergyInPlay` has answered a card-CATEGORY question since D159 —
//     `"special"` reads `isSpecialEnergy` rather than provision — so the category
//     was never outside its vocabulary; and
//   · the sentence quoted does not reach `countEnergyInPlay` AT ALL. *"attached to
//     this Pokémon"* is the ZONE-LESS path and delegates to `countAttachedEnergy`.
// **A refusal names a CARRIER and the carrier can be wrong (D457/D499): ask WHICH
// CARRIER IS READ AT THE SEAM THE RULE RESOLVES AT.** D479's THIRD class — the
// verdict (unbuilt) was true, the reason was not — and the price the reason hid
// was ONE ROW in `CLAUSE_ENERGY_TOKENS`.'''))

# ── effects.ts: SELF_ENERGY_SCALE block (the SECOND copy) ──────────────────────
EDITS.append(("packages/engine/src/effects.ts",
'''// ⚠️ TWO LEGAL ROWS ARE COUNTED BY THE RAW SENTENCE SWEEP AND ARE NOT BUILDABLE,''',
'''// 🆕🆕 **D500 — THE PARAGRAPH BELOW IS ONE ROW OUT OF DATE AND IS KEPT (D178).**
// *"This attack does 40 damage for each Basic Energy attached to this Pokémon."*
// (1 legal) is BUILT now, through ONE row in `CLAUSE_ENERGY_TOKENS` and zero
// anchor bytes — the anchor's `(?:(.+) )?` group always admitted the token, and
// `attachedEnergyFilter` one step later is what refused it. So of the TWO rows
// named below, ONE remains unbuildable: the two-sentence `{W}` printing, whose
// blocker is the whole-sentence anchor and is untouched. The sentence-sweep
// figure is right and the BUILDABLE figure is 22 rather than 21.
// ⚠️ TWO LEGAL ROWS ARE COUNTED BY THE RAW SENTENCE SWEEP AND ARE NOT BUILDABLE,'''))

# ── effects.ts: the `{C}`/`Basic Energy` adjacency note ───────────────────────
EDITS.append(("packages/engine/src/effects.ts",
'''// tries the longest run and backtracks to `Special`, because the literal `Energy`
// that follows the group is required and `card` is not it. The `{C}`/`Basic
// Energy` refusals are untouched: they fail in `attachedEnergyFilter`, one step
// LATER than this anchor, and the token they hand it is unchanged.''',
'''// tries the longest run and backtracks to `Special`, because the literal `Energy`
// that follows the group is required and `card` is not it. The `{C}`/`Basic
// Energy` refusals are untouched: they fail in `attachedEnergyFilter`, one step
// LATER than this anchor, and the token they hand it is unchanged.
// 🆕🆕 **D500 — AND THAT SENTENCE IS EXACTLY WHY THIS SLICE COST NO ANCHOR BYTE.**
// `Basic` is no longer a refusal — the map gained the row — and the paragraph
// above is what said, correctly and in advance, where the refusal actually lived.
// `{C}` is still refused, at the same place, for its own unchanged reason.'''))

# ── effects.ts: the SELF_ENERGY_SCALE arm's inline note ───────────────────────
EDITS.append(("packages/engine/src/effects.ts",
'''  // `attachedEnergyFilter` so that an absent token is the UNTYPED reading and an
  // unresolvable one ("Basic Energy", "{C}") falls through to `return null` and
  // stays LOUD.''',
'''  // `attachedEnergyFilter` so that an absent token is the UNTYPED reading and an
  // unresolvable one ("{C}", or any word the map has no key for) falls through to
  // `return null` and stays LOUD. 🆕🆕 **D500 — `"Basic Energy"` USED TO BE THE
  // EXAMPLE HERE AND IS NOW THE COUNTEREXAMPLE**: the token resolves to the card
  // CATEGORY `"basic"`, so this arm claims the bare `Basic` spelling on both of its
  // tails. `{C}` is kept as the example because its absence is a DECISION with a
  // stated reason, where `Basic`'s was an omission nobody had priced.'''))

# ── effects.ts: SELF_ENERGY_FILTERED_SCALE arm's guard note ───────────────────
EDITS.append(("packages/engine/src/effects.ts",
'''  // both folds carries; `energyType !== undefined` is the ENERGY vocabulary, so
  // *"Basic Energy"* and *"{C}"* fall through to `return null` and stay LOUD exactly
  // as they do one arm up;''',
'''  // both folds carries; `energyType !== undefined` is the ENERGY vocabulary, so
  // *"{C}"* falls through to `return null` and stays LOUD exactly as it does one arm
  // up (🆕🆕 **D500 — *"Basic Energy"* WAS THE SECOND EXAMPLE HERE AND RESOLVES NOW**,
  // to the card CATEGORY `"basic"`; the guard is unchanged and only its example set
  // shrank, which `ownerBoardEnergyScaling.test.ts` §GUARD 3 now drives from the
  // ADMITTED side with `{C}` keeping the refused side);'''))

# ── effects.ts: attachedEnergyFilter's own doc ────────────────────────────────
EDITS.append(("packages/engine/src/effects.ts",
'''    filter I could not read" differ by exactly the failure that matters: the first
    must count everything, the second must count NOTHING and say so. Collapsing
    them would make "for each {C} Energy attached…" or "for each Basic Energy
    attached…" quietly score the unfiltered total''',
'''    filter I could not read" differ by exactly the failure that matters: the first
    must count everything, the second must count NOTHING and say so. Collapsing
    them would make "for each {C} Energy attached…" quietly score the unfiltered
    total (🆕🆕 **D500 — "for each Basic Energy attached…" WAS THE SECOND EXAMPLE
    AND IS NOW A THIRD ANSWER RATHER THAN A NULLISH ONE**: `CLAUSE_ENERGY_TOKENS`
    gained `["Basic", "basic"]`, the card CATEGORY that is `"special"`'s
    complement, so the token resolves and the sentence folds. The two-nullish rule
    is unchanged; what changed is which printed words reach it)'''))

# ── testFixtures.ts: the fix-selfenergy index-3 doc ───────────────────────────
EDITS.append(("packages/engine/src/testFixtures.ts",
'''        3 "Basic Draw"   40×  ⚠️ THE REFUSAL, and it is a real legal printing (1
                              legal), not constructed text. "Basic Energy" is a
                              card CATEGORY rather than a type; it is absent from
                              CLAUSE_ENERGY_TOKENS, resolves to nothing, and the
                              reader must stay LOUD rather than quietly scoring the
                              UNFILTERED total. That is the one mistake
                              `attachedEnergyFilter` exists to prevent, and index 3
                              is where it is driven on the self side.''',
'''        3 "Basic Draw"   40×  🆕🆕 **D500 — BUILT, AND IT WAS THE REFUSAL.** A real
                              legal printing (1 legal), not constructed text. The
                              paragraph this replaces read: *"'Basic Energy' is a
                              card CATEGORY rather than a type; it is absent from
                              CLAUSE_ENERGY_TOKENS, resolves to nothing, and the
                              reader must stay LOUD rather than quietly scoring the
                              UNFILTERED total."* ⚠️ **EVERY CLAUSE OF THAT WAS TRUE
                              AND IT WAS READ AS A REASON TO REFUSE** — `Basic` IS a
                              card category, and that is exactly why it belongs in
                              the map beside `Special`, which has carried a card
                              class there since D118. The absence was an omission,
                              not a decision, and nothing ever re-derived it
                              (D478's loop). The index now folds: `energyOnSelf`
                              with `energyType: "basic"`, counting CARDS whose
                              `energyType` is `Normal` through `matchesFilter`'s
                              shipped `basicEnergy` arm. `basicEnergyScaling.test.ts`
                              is where it is driven, on a board carrying a Special
                              Energy that PROVIDES a basic type — because counting
                              cards and counting provisions are different numbers
                              and only that fixture separates them. The LOUD path is
                              still driven on this body, by `{C}` and by a bogus
                              token, which is what `attachedEnergyFilter` exists to
                              prevent and is now the whole of what index 3 used to
                              carry alone.'''))

# ── index.ts: the two census blocks ───────────────────────────────────────────
EDITS.append(("packages/engine/src/index.ts",
'''    BUILDABLE ONE.** `energyOnSelf`'s 23 is 21: one row is a two-sentence printing
    the anchor refuses, one filters on `Basic Energy` — a card CATEGORY, not a type,
    which resolves to nothing and stays LOUD.''',
'''    BUILDABLE ONE.** `energyOnSelf`'s 23 is 21: one row is a two-sentence printing
    the anchor refuses, one filters on `Basic Energy` — a card CATEGORY, not a type,
    which resolves to nothing and stays LOUD. (🆕🆕 **D500 — 21 IS 22 NOW**: the
    `Basic Energy` row is BUILT, through one row in `CLAUSE_ENERGY_TOKENS` and zero
    anchor bytes. The two-sentence printing is still refused, by the anchor.)'''))

EDITS.append(("packages/engine/src/index.ts",
'''    rows in the gap are LEGAL, which is why a raw sentence sweep cannot be a build
    estimate: "…for each **Basic Energy** attached to this Pokémon." (1 legal)
    filters on a card CATEGORY that resolves to nothing and must stay LOUD, and''',
'''    rows in the gap are LEGAL, which is why a raw sentence sweep cannot be a build
    estimate: "…for each **Basic Energy** attached to this Pokémon." (1 legal)
    filters on a card CATEGORY that resolves to nothing and must stay LOUD (🆕🆕
    **D500 — NOT ANY MORE, and the gap is ONE row rather than two**: the category
    resolves, because the shared token map already carried its complement), and'''))

def main():
    for path, old, new in EDITS:
        s = io.open(path, encoding='utf-8').read()
        assert s.count(old) == 1, (path, s.count(old), old[:70])
        io.open(path, 'w', encoding='utf-8').write(s.replace(old, new, 1))
        print("corrected in place:", path, "|", old.strip().split("\n")[0][:64])

main()
