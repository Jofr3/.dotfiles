import io, os
p = "packages/engine/src/effects.ts"
src = io.open(p, encoding="utf-8").read()

anchor = '''const ATTACK_REVEAL_AND_DISCARD =
  /^Your opponent reveals their hand\\. Discard a card you find there\\.$/;
'''
assert src.count(anchor) == 1, src.count(anchor)
block = '''
// \U0001f195\U0001f195 **D485 — THE FAMILY'S EIGHTH SENTENCE SHAPE, AND ITS FIRST WITH NO PICK
// IN IT.** *"Your opponent reveals their hand. Discard all Item cards and Pokémon
// Tool cards you find there."* — **1 legal printing**, `censusAttackCorpus.ts` FILE
// LINE 673, the whole population of the shape (the carrier id is UNRESOLVED and is
// stated as such rather than invented, this checkout having no D1 — D425).
//
// \U0001f6d1 **A WHOLE-SENTENCE ANCHOR, AND THE CHEAPER ROUTE WAS DRIVEN AND THEN
// REFUSED.** `residue-census.ts` classes this row `COMPOUND-head`, and D466's rule
// is to drive `splitAttackTrailingClause` before pricing one. Driven: the printed
// string splits at exactly this period into a head `deriveAttackEffect` already
// claims (`revealOpponentHand`) and this tail, so **a TAIL-ONLY anchor would have
// freed the row through the splitter with no compound anchor at all.** It is
// refused anyway, on D472's ground:
//
//   ⚠️ ***"you find there"* IS AN ANAPHOR, AND ITS ANTECEDENT IS THE REVEAL.** A
//   standalone `^Discard all … you find there\\.$` arm would make
//   `deriveAttackEffect` claim a fragment whose *there* points at nothing — and,
//   worse, `splitAttackTrailingClause` would then compose it behind **any** head
//   some reader claims. *"Draw 3 cards. Discard all Item cards and Pokémon Tool
//   cards you find there."* would resolve into a program that empties half the
//   opponent's hand off a sentence that never revealed it. **An anchor that
//   generalises a pronoun's carrier silently generalises its REFERENT** (D472, the
//   same defect one part of speech over), and it is the "too loose" direction
//   D278/D279 refuse. `D485-tail-only-anchor-loses-the-reveal` arms that refusal.
//
// ⚠️ **AND IT IS THE FAMILY'S OWN IDIOM RATHER THAN A ONE-OFF**: every one of the
// seven sentence shapes above is anchored WHOLE with its leading reveal
// (`ATTACK_REVEAL_AND_BOTTOM`, `ATTACK_REVEAL_AND_BENCH_UP_TO`,
// `ATTACK_REVEAL_AND_DISCARD`, `ATTACK_REVEAL_SUPPORTER_BOTTOM`,
// `ATTACK_REVEAL_TRAINER_COUNT`), for this reason at seven addresses.
//
// \U0001f6d1 **A LITERAL AND NOT A TEMPLATE, ON D121's MEASURED WARRANT.** That warrant
// wants TWO printings with one token varying before a capture is justified. The two
// printed nouns here vary against a population of **one sentence / one printing**,
// and a `^Discard all (.+) cards and (.+) cards you find there\\.$` template over a
// printed-noun table would be a parameter with a single witness — D424's shape,
// refused. Measured over all 640 corpus rows, the templated form claims the
// IDENTICAL 1 sentence / 1 printing (`opponentHandSweep.test.ts` §2 runs both and
// asserts the equality), so the wider form buys nothing and costs a noun table.
//
// **NO APOSTROPHE OF EITHER CLASS ON THIS ANCHOR, AND NONE IS OWED** — the sentence
// says *their hand* and never *your opponent's hand*, so there is no `['’']` slot
// for a punctuation-normalising re-ingest to curl (`clauseApostrophe.test.ts`'s
// sweep, asserted in §2).
const ATTACK_REVEAL_AND_SWEEP =
  /^Your opponent reveals their hand\\. Discard all Item cards and Pokémon Tool cards you find there\\.$/;
'''
src = src.replace(anchor, anchor + block, 1)

arm = '''  if (ATTACK_REVEAL_AND_DISCARD.test(effect)) {
    return [{ op: "bottomFromOpponentHand", dest: "discard" }];
  }
'''
assert src.count(arm) == 1, src.count(arm)
newarm = '''  // \U0001f195\U0001f195 D485 — the family's EIGHTH arm, and the first that reveals and then
  // moves cards WITHOUT asking anybody anything. TWO ops in printed order: the
  // shipped `revealOpponentHand` for the first sentence (the same op the head has
  // derived to on its own since M5) and the new `discardFromOpponentHand` for the
  // second. The reveal is not decoration — the sweep is a public fact about a
  // hidden zone, and the printed reveal is what makes it one.
  //
  // \U0001f6d1 THE FILTER IS THE PRINTED NOUN PHRASE AND NOTHING MORE. *"Item cards and
  // Pokémon Tool cards"* is `anyOf` of two SHIPPED members, and the `and` names a
  // SET whose membership each card is asked about one at a time — `anyOf`'s `.some`,
  // D245's reading, and the reading the catalog forces: `item` and `toolCard` are
  // disjoint (cards.ts), so an intersection would sweep nothing at all.
  if (ATTACK_REVEAL_AND_SWEEP.test(effect)) {
    return [
      { op: "revealOpponentHand" },
      {
        op: "discardFromOpponentHand",
        filter: { kind: "anyOf", filters: [{ kind: "item" }, { kind: "toolCard" }] },
      },
    ];
  }
'''
src = src.replace(arm, arm + newarm, 1)
tmp = p + ".d485tmp"
with io.open(tmp, "w", encoding="utf-8") as f:
    f.write(src)
os.replace(tmp, p)
print("ok")
