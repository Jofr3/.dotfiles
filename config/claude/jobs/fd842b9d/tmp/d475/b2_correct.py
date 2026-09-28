import sys
sys.path.insert(0, "/home/jofre/.claude/jobs/fd842b9d/tmp/d475")
from patch import patch

patch("packages/engine/src/attack.ts",
"""  // \U0001f6d1 **IT WAS LOUD FOR A REASON THAT DOES NOT GENERALISE, WHICH IS EXACTLY WHY
  // THE `switch` IS OWED ANYWAY.** The narrowing that saved it is the FIELD ACCESS,
  // not the discriminator: `count.energy` fails only because the new member has no
  // `energy` key. A fifth member carrying an `energy` field of a compatible type —
  // say a per-Energy count scoped to BOTH Actives, which is corpus file line 231 and
  // is exactly the next thing anyone will add here — would satisfy `count.energy`
  // and fall SILENTLY into the self-attached reading, computing a different number
  // on every board with no compile error anywhere. The ternary's exhaustiveness
  // rested on a payload coincidence; the `switch` rests on the discriminator, so the
  // next member is a compile error whatever it carries.""",
"""  // \U0001f6d1 **IT WAS LOUD FOR A REASON THAT DOES NOT GENERALISE, WHICH IS EXACTLY WHY
  // THE `switch` IS OWED ANYWAY.** The narrowing that saved it is the FIELD ACCESS,
  // not the discriminator: `count.energy` fails only because the new member has no
  // `energy` key. A member carrying an `energy` field of a compatible type would
  // satisfy `count.energy` and fall SILENTLY into the self-attached reading,
  // computing a different number on every board with no compile error anywhere. The
  // ternary's exhaustiveness rested on a payload coincidence; the `switch` rests on
  // the discriminator, so the next member is a compile error whatever it carries.
  //
  // \U0001f195\U0001f195\U0001f6d1 **D475 — THE RULE ABOVE HOLDS AND ITS PREDICTION DID NOT. THE PARAGRAPH
  // NAMED THE WRONG ROW, AND THE CORRECTION IS THE MEASUREMENT.** D474 wrote that the
  // hazardous member was *"a per-Energy count scoped to BOTH Actives, which is corpus
  // file line 231 and is exactly the next thing anyone will add here"*. D475 built
  // file line 231, and its member is `bothActivesEnergy` — **NULLARY**, because the
  // printed sentence carries no type filter (measured over all 640 rows: the
  // optional-filter loosening of the anchor claims the identical 1 sentence /
  // 1 printing) and D440's rule therefore gives a second member rather than a field.
  // **So the old ternary would have been LOUD for this member too.** Measured on THIS
  // file rather than reasoned: with the ternary restored and `pokemonInPlay` peeled
  // off the `:` branch — D473's three-member world plus D475's member, which is the
  // exact world the prediction was about — `bunx tsc -b` answers
  // *"TS2339: Property 'energy' does not exist on type '{ kind: "attachedEnergy"; … }
  // | { kind: "bothActivesEnergy"; }'"*, naming the new member by hand. Restored in a
  // `finally` and verified byte-identical.
  //
  // ⚠️ **WHAT THE `switch` DID BUY IS STILL MEASURED, AND IT IS A DIFFERENT FACT.**
  // With the member added and this `case` withheld, `tsc` answers **TS2454 —
  // *"Variable 'flips' is used before being assigned"*** at the loop below. That
  // refusal is on the DISCRIMINATOR and holds for every member shape, where the
  // ternary's held only for members whose payload happens to lack `energy`. **The
  // conversion remains right (D222/D447) and the row that was supposed to demonstrate
  // it does not.** ⚠️ The general lesson is D427's: *a price is a forecast; a rule is
  // a criterion.* D474's criterion was sound and its forecast about which row would
  // exercise it was a guess written in the same paragraph, in the same voice.""")

patch("packages/engine/src/inPlayFlipCount.test.ts",
"""// **It was loud for a reason that does not generalise, which is why the `switch` is
// owed anyway.** What refused was the FIELD ACCESS, not the discriminator: a fifth
// member carrying an `energy` field of a compatible type — corpus file line 231's
// *"for each Energy attached to both Active Pokémon"* is exactly that, and is the
// next thing anyone will add here — would satisfy `count.energy` and fall SILENTLY
// into the self-attached reading. D222/D447: a total `switch` is the only thing that
// sees a new union member.""",
"""// **It was loud for a reason that does not generalise, which is why the `switch` is
// owed anyway.** What refused was the FIELD ACCESS, not the discriminator: a member
// carrying an `energy` field of a compatible type would satisfy `count.energy` and
// fall SILENTLY into the self-attached reading. D222/D447: a total `switch` is the
// only thing that sees a new union member.
//
// \U0001f195\U0001f195\U0001f6d1 **D475 CORRECTS THE PREDICTION THIS PARAGRAPH USED TO CARRY.** It named
// corpus file line 231 — *"for each Energy attached to both Active Pokémon"* — as
// *"exactly that"* member. D475 built it and the member is **NULLARY**
// (`{ kind: "bothActivesEnergy" }`), because the printed sentence carries no type
// filter, so the old ternary would have answered TS2339 for it as well. Measured on
// the real file: with the ternary restored and `pokemonInPlay` peeled off the `:`
// branch, `tsc` names `{ kind: "bothActivesEnergy"; }` in the TS2339 text. **The rule
// stands, the forecast did not** — see `attack.ts`'s `takeFlips` block, corrected in
// place at the same commit.""")
