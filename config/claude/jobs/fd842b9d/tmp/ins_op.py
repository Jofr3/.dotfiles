import io, hashlib, os
p = "packages/engine/src/effects.ts"
src = io.open(p, encoding="utf-8").read()
anchor = '  | { op: "opponentDiscardsFromHand"; count: number }\n'
assert src.count(anchor) == 1, src.count(anchor)
block = '''  /** \U0001f195\U0001f195 **D485 — THE MANDATORY FILTERED SWEEP OF THE OPPONENT'S HAND, AND
      IT IS THE FAMILY'S FIRST CROSS-SEAT HAND MOVE WITH NO DECISION IN IT AT ALL.**
      Every card in the OPPONENT's hand matching `filter` goes to the OPPONENT's
      discard pile. No pick, no offer, no park, no `decider` — the printed
      sentence names a PREDICATE and the board answers it.

        "Your opponent reveals their hand. Discard all Item cards and Pokémon Tool
         cards you find there."   (`censusAttackCorpus.ts` FILE LINE 673, 1 legal
                                   printing — the whole population of the shape)

      \U0001f6d1 **A NEW OP AND NOT A WIDENING, AND THE REFUSAL IT ANSWERS IS D445's OWN,
      NAMED RATHER THAN RE-ARGUED.** `opponentHandScaling.test.ts` §6 refused this
      sentence in exactly these words: *"`bottomFromOpponentHand`'s whole middle is
      an OFFER — filtered, collapsed to one representative per interchangeable
      class, then asked. A sweep has no offer to collapse and no question to ask, so
      routing it through this op means disabling the collapse, the arity check and
      the auto-resolve on a new field — five conditionals for one printing"*, and it
      wrote its own falsifier: *"the day a mandatory-sweep op exists … that rung
      goes RED."* This is that op. The refusal was re-read against the code before it
      was inherited (D466) and every clause of it is still true.

      ⚠️ **THE COMPOSITION QUESTION WAS ASKED FIRST AND DRIVEN (D482), AND THE
      NEAR-MISS IS THE PART WORTH WRITING DOWN (D483).** Three shipped ops touch the
      opponent's hidden hand and none of them spells this:
        · `opponentDiscardsFromHand { count }` — a STATIC count, UNFILTERED, and
          answered by the opponent. The printed count here is not a number at all.
        · `randomFromOpponentHand { to }` — one card, chosen by the RNG.
        · `bottomFromOpponentHand { filter, dest: "discard" }` — the near-miss, and
          it takes the SAME `filter` this op takes into the SAME pile. \U0001f6d1 **On any
          board whose opponent hand holds exactly ONE matching card the two are
          BYTE-IDENTICAL** (a single-class offer auto-resolves, so there is not even
          a park to tell them apart) — which is precisely the board a suite would
          reach for first. **They differ the moment the hand holds TWO matches:**
          this op takes both and asks nothing; that one takes exactly one and PARKS
          to ask which. `opponentHandSweep.test.ts` §5 fields that board and drives
          both readings rather than arguing them.

      **THE FILTER IS REQUIRED, AND IT IS BUILT OUT OF MEMBERS THAT ALREADY SHIP.**
      The printed *"Item cards and Pokémon Tool cards"* is `anyOf` over `item` and
      `toolCard` — three shipped `CardFilter` members and no new one. They are
      DISJOINT by construction (cards.ts: `trainerType` is `Item` xor `Tool`; D231
      measured 116 Item rows and 60 Tool rows with no row both), which is why the
      print names both and why `anyOf`'s `.some` is the right combinator. No
      `count`, no `upTo` and no `to`: D135's rule that an absent field means what
      the sentence means, and D231's that a field with one reachable value is an
      unkillable mutant. A bare unfiltered sweep would be `discardHand` pointed at
      the other seat, and no printing in this column asks for one.

      ⚠️ **AN EMPTY MATCH IS A SILENT NO-OP** — the family's standing ending
      (`randomFromOpponentHand`'s empty hand, `payFromHandApply`'s `paid.length === 0`,
      `opponentDiscardsFromHand`'s `take === 0`). A row announcing a discard of zero
      cards describes something that did not happen.

      ⚠️ **NO `programPlayable` WHIFF GATE (cardplay.ts)**, the family's standing
      answer: that gate exists so a CARD PLAY is not spent on a program that can only
      whiff, attacks never consult it (§8), and this op has no registry row. The
      condition that would reverse it is a Trainer or Ability printing this sentence
      — and note that such a gate would have to read the FILTER against a HIDDEN
      zone, which `bottomFromOpponentHand`'s own gate refuses to do for exactly that
      reason (a filter's matches stay hidden knowledge; only the hand's LENGTH is
      public). */
  | { op: "discardFromOpponentHand"; filter: CardFilter }
'''
src = src.replace(anchor, anchor + block, 1)
tmp = p + ".d485tmp"
with io.open(tmp, "w", encoding="utf-8") as f:
    f.write(src)
os.replace(tmp, p)
print("ok", len(src))
