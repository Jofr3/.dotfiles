import io, sys
P = "/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts"
s = io.open(P, encoding="utf-8").read()
E = []

E.append((
"""// and Camerupt sv03-032 ("Discard the top card of EACH PLAYER'S deck. This attack
// does 100 more damage for each Energy card discarded in this way." — two decks
// AND a damage bonus that reads what was discarded; a genuinely different slice
// that must land loudly). No /i, for the family's stated reason.""",
"""// and corpus FILE LINE 130 ("Discard the top card of EACH PLAYER'S deck. This attack
// does 140 more damage for each Energy card discarded in this way." — two decks
// AND a damage bonus that reads what was discarded). No /i, for the family's stated
// reason.
//
// \U0001f6d1 **D490 CORRECTED TWO THINGS IN THAT LAST ENTRY AND ONLY ONE OF THEM WAS ROT.**
// (a) The FIGURE was **wrong when written**: this block and `deckTopMill.test.ts`'s
// `REAL_NEAR_MISSES[4]` both said *"100 more damage"* where the committed
// `legal_standard = 1` column prints **140** — one row, measured with
// `legalAttackCorpus().filter(([, t]) => t.includes("each player"))`, and the test's own
// block called its copy *"verbatim off the local D1"*. A hand-retyped damage figure is
// D452's phantom specimen, and no byte pin can catch one. The card id is dropped in
// favour of the corpus FILE LINE because this checkout has no D1 and the id is
// UNRESOLVABLE here (D425/D448). (b) The phrase *"a genuinely different slice that must
// land loudly"* has **ROTTED**: D490 built it, through
// `deriveAttackDiscardScaledBoost`'s `eachDeckMill` member and `whose: "eachPlayer"`. The
// row is still a near-miss for THIS anchor and stays in the list — a `\\.$` cannot reach
// across the sentence break — but it is no longer LOUD."""))

E.append((
"""// MULTIPLY one (`does P damage for each`, no printed *"more"*), which is
// `ENERGY_DISCARD_SCALED_DAMAGE`'s own split reproduced one head over — the additive
// twin of this very shape is Camerupt `sv03-032` (*"Discard the top card of each
// player's deck. This attack does 100 more damage for each Energy card discarded in
// this way."*, 2 printings), which `deckTopMill.test.ts` and `benchDiscardBoost.test.ts`
// both hold as a named refusal and which this anchor still refuses on THREE independent
// counts (two decks, the singular, and the `more`). Arms no sentence drives are not
// written (`IN_PLAY_BODY_NOUNS`' rule).""",
"""// MULTIPLY one (`does P damage for each`, no printed *"more"*), which is
// `ENERGY_DISCARD_SCALED_DAMAGE`'s own split reproduced one head over — the additive
// twin of this very shape is corpus FILE LINE 130 (*"Discard the top card of each
// player's deck. This attack does 140 more damage for each Energy card discarded in
// this way."*, 2 printings), which this anchor still refuses on THREE independent
// counts (two decks, the singular, and the `more`). Arms no sentence drives are not
// written (`IN_PLAY_BODY_NOUNS`' rule).
//
// \U0001f195\U0001f195\U0001f195 **D490 CORRECTED THIS PARAGRAPH TWICE.** It quoted **100** where the column
// prints **140** (a hand-retyped figure copied from `deckTopMill.test.ts`'s phantom
// specimen — D452, and D415's *"a claim that is copied is a claim that rots in N
// places"*: the correction was a three-site sweep), and it said the two test files *"both
// hold it as a named refusal"*, which stopped being true in the same slice that corrected
// the figure — `deriveAttackDiscardScaledBoost` claims it now and both files were
// re-pointed onto the owner while keeping every refusal they carried (D438). The card id
// is dropped for the corpus FILE LINE: this checkout has no D1 (D425/D448)."""))

for find, repl in E:
    if s.count(find) != 1:
        sys.stderr.write("COUNT %d for:\n%s\n" % (s.count(find), find[:200])); raise SystemExit(2)
    s = repl.join(s.split(find))
open(P, "wb").write(s.encode("utf-8"))
print("effects.ts doc phantoms corrected")
