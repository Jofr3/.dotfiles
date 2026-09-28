import sys
sys.path.insert(0, "/home/jofre/.claude/jobs/fd842b9d/tmp/d475")
from patch import patch
P = "packages/engine/src/effects.ts"

patch(P,
"""    (D128). \U0001f195\U0001f195 **FOUR members as of D474**, because the pool prints the count four
    ways and only one of them is a number the deriver can read:""",
"""    (D128). \U0001f195\U0001f195 **FIVE members as of D475**, because the pool prints the count five
    ways and only one of them is a number the deriver can read:""")

patch(P,
"""        the day the column prints an opponent-side body flip count, the field is
        owed in the same edit.
      • `untilTails` — "Flip a coin until you get tails." (D129). NOT A NUMBER AT""",
"""        the day the column prints an opponent-side body flip count, the field is
        owed in the same edit.
      • \U0001f195\U0001f195 `bothActivesEnergy` (D475) — "for each Energy attached to both Active
        Pokémon", the LAST board fact the column counts coins by and the only one
        BOTH SEATS contribute to: the Energy CARDS on the attacker's Active plus the
        Energy CARDS on the defender's, resolved at the flip site through two calls
        to the same `countAttachedEnergy`. It is the coin-side twin of
        `DamageCountSource.bothActivesEnergyCount` (D196), and D159's rule is why the
        two share a counter rather than each computing a sum: *"how much Energy is
        attached to this body"* keeps ONE answer across two unions.

        \U0001f6d1 **NULLARY, AND THAT IS D440's RULE READ RATHER THAN COPIED — WHICH IS
        ALSO WHY D474's PREDICTION ABOUT THIS MEMBER DID NOT HOLD.** D474's block in
        `attack.ts` named this row as *"a fifth member carrying an `energy` field of a
        compatible type"* — the shape whose payload would have satisfied the old
        ternary's `count.energy` and fallen SILENTLY into the self-attached reading.
        It is not that shape. *Nullary or asymmetric payload ⇒ two members*, and the
        payload here is EMPTY: the printed sentence carries no type filter (measured
        over all 640 rows — the optional-filter loosening claims the identical 1/1),
        and the seat pair is spelled by the member's own name because the sentence
        names both Actives rather than one side. So the old ternary would have
        answered TS2339 for this member too, exactly as it did for `pokemonInPlay`.
        **The `switch` is still what refuses it — TS2454 on `flips`, measured — and
        it refuses on the DISCRIMINATOR, which is the property that generalises.**

        ⚠️ **AND IT IS NOT A `scope` FIELD ON `attachedEnergy`.** Collapsing the two
        would put an ENERGY TYPE FILTER and a BODY SCOPE in one member, so every
        self-attached value would carry a scope it must ignore and every both-Actives
        value a filter no printing sets — the asymmetric payload D440 forbids, and the
        second answer to one question D159 forbids. It would also make
        `ATTACK_COIN_PER_ENERGY` claim this sentence, which the disjointness note at
        that anchor exists to prevent.
      • `untilTails` — "Flip a coin until you get tails." (D129). NOT A NUMBER AT""")

patch(P,
"""export type AttackFlipCount =
  | { kind: "printed"; count: number }
  | { kind: "attachedEnergy"; energy: BasicEnergyType | "special" | null }
  | { kind: "pokemonInPlay"; filter: CardFilter }
  | { kind: "untilTails" };""",
"""export type AttackFlipCount =
  | { kind: "printed"; count: number }
  | { kind: "attachedEnergy"; energy: BasicEnergyType | "special" | null }
  | { kind: "pokemonInPlay"; filter: CardFilter }
  | { kind: "bothActivesEnergy" }
  | { kind: "untilTails" };""")
