import sys
sys.path.insert(0, "/home/jofre/.claude/jobs/fd842b9d/tmp/d475")
from patch import patch
patch("packages/engine/src/effects.ts",
"""        `DamageCountSource` sibling carries `seat` because ONE of its anchors
        spells each side; this family's does not. The falsifier is executable —
        the day the column prints an opponent-side body flip count, the field is
        owed in the same edit.""",
"""        `DamageCountSource` sibling carries `seat` because ONE of its anchors
        spells each side; this family's does not.

        \U0001f195\U0001f195\U0001f6d1 **D475 — THE FALSIFIER AS D474 WROTE IT WAS ALREADY SATISFIED ON THE
        DAY IT WAS WRITTEN, AND NOBODY LOOKED.** It said *"the falsifier is
        executable — the day the column prints an opponent-side body flip count,
        the field is owed in the same edit."* The column prints one: corpus **FILE
        LINE 669**, *"Your opponent flips a coin for each of their Benched Pokémon.
        This attack does 80 damage to your opponent's Active Pokémon for each tails.
        This attack's damage isn't affected by Weakness or Resistance."* — 1 legal
        printing, unread by all thirteen readers and by both splitters, measured at
        this head. That is D413/D452's shape at a FALSIFIER rather than at a
        refusal: **an ordinal or a trigger is a countdown, and this one had already
        expired.**

        ⚠️ **AND THE FIELD IS STILL NOT OWED, WHICH IS WHY THE WORDING WAS THE
        DEFECT RATHER THAN THE MEASUREMENT** (D446: a falsifier must name the
        CONDITION that reverses the refusal, never the build that follows it).
        Line 669 needs THREE more mechanisms this family does not have — the flip
        is taken by the OPPONENT (`attack.ts` emits every `ATTACK_EFFECT_COIN_FLIP`
        under `action.seat`), the fold is per **TAILS** (the FACE axis D463 measured
        as missing at corpus line 217), and the tail is a W/R suppression that would
        have to compose. So the honest trigger is narrower: **the day the column
        prints an opponent-side body flip count whose OTHER axes this family already
        reads.** D474's measurement — that the column spells THIS count once,
        own-side, as *"you have in play"* — is still exactly true.""")
