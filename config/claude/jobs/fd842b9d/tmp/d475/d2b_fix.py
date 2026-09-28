import sys
sys.path.insert(0, "/home/jofre/.claude/jobs/fd842b9d/tmp/d475")
from patch import patch
P = "packages/engine/src/inPlayFlipCount.test.ts"
patch(P,
"""    // \U0001f6d1 **THE DISCRIMINATION THE OLD CLAIM CARRIED, KEPT ON A NEW SUBJECT (D444).**
    // What the `toBeNull` really pinned was *"no widening of a BODY count reaches an
    // ENERGY count"*. That is still true and is now assertable POSITIVELY: 231 is read
    // by a member of its own, and THIS slice's anchor still refuses it — so a build
    // that had widened `ATTACK_COIN_PER_BODY_IN_PLAY` to swallow 231 reddens here
    // where the old boolean could not tell that build from the real one.
    expect(ATTACK_COIN_PER_BODY_IN_PLAY_PROBE.test(SIBLING_BOTH_ACTIVES)).toBe(false);
    expect(ATTACK_COIN_PER_BODY_IN_PLAY_PROBE.test(PRINTED)).toBe(true);""",
"""    // \U0001f6d1 **THE DISCRIMINATION THE OLD CLAIM CARRIED, KEPT ON A NEW SUBJECT (D444).**
    // What the `toBeNull` really pinned was *"no widening of a BODY count reaches an
    // ENERGY count"*. That survives POSITIVELY and by VALUE: 231 derives through a
    // member of its OWN, so a build in which `ATTACK_COIN_PER_BODY_IN_PLAY` had been
    // loosened to swallow 231 reddens here — it would answer `pokemonInPlay` — where
    // the old boolean could not have told that build from the real one. The two
    // programs are UNEQUAL, which is D449's strictly-stronger form of a `toBeNull`.
    expect(deriveAttackCoinFlip(SIBLING_BOTH_ACTIVES)).not.toEqual(deriveAttackCoinFlip(PRINTED));
    expect(deriveAttackCoinFlip(SIBLING_BOTH_ACTIVES)).not.toEqual(
      deriveAttackCoinFlip(SIBLING_ENERGY),
    );""")
