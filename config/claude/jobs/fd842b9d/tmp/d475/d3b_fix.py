import sys
sys.path.insert(0, "/home/jofre/.claude/jobs/fd842b9d/tmp/d475")
from patch import patch
patch("packages/engine/src/selfEnergyScaling.test.ts",
"""    // …and it really FLIPPED, once per Energy card on the two Actives. `mirrorBoard`
    // gives each side the one Energy that pays the {C} cost, so the count is 1 + 1.
    expect(flipped.events.filter((e) => e.type === "ATTACK_EFFECT_COIN_FLIP")).toHaveLength(2);""",
"""    // …and it really FLIPPED, once per Energy CARD on the two Actives. `mirrorBoard`
    // gives P1's Active 2 Fire + 1 Water and P2's Active 5 Water, so the count is
    // **3 + 5 = 8** — the same two piles the "Twin Surge" case above folds at 30 each
    // for 30 + 8 x 30. That the DAMAGE fold and the FLIP count read the identical
    // number off the identical board is the point: one printed noun, one counter
    // (D159). Only the flip COUNT is asserted here — 8 heads would be 480 against
    // `fix-titan`'s 340 HP, so the seed decides whether a Knock Out truncates the
    // tail, and the count is the fact this rung is about.
    expect(flipped.events.filter((e) => e.type === "ATTACK_EFFECT_COIN_FLIP")).toHaveLength(8);""")
