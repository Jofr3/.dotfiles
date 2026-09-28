import sys
sys.path.insert(0, "/home/jofre/.claude/jobs/fd842b9d/tmp/d475")
from patch import patch
P = "packages/engine/src/bothActivesFlipCount.test.ts"

patch(P,
"""    for (const text of [
      // …the SCOPE alone: one body is D128's shipped member.
      PRINTED.replace("both Active Pokémon", "this Pokémon"),
      // …the SEAT alone: the printed subject names both Actives, not one side's.""",
"""    // \U0001f6d1 THE SCOPE AXIS IS NOT A REFUSAL AND SAYING SO IS THE POINT (D424's
    // admission, and D399's one-axis rule taken seriously). Changing `both Active
    // Pokémon` to `this Pokémon` and NOTHING else lands on D128's SHIPPED anchor, so
    // the honest one-axis claim about that byte is that it moves the MEMBER — not
    // that it turns the sentence off. A rung asserting `toBeNull` there would have
    // been red, and it was: this is the shape the first run found.
    expect(deriveAttackCoinFlip(PRINTED.replace("both Active Pokémon", "this Pokémon"))).toEqual({
      kind: "perHeads",
      flips: { kind: "attachedEnergy", energy: null },
      per: 60,
    });
    for (const text of [
      // …the SEAT alone: the printed subject names both Actives, not one side's.""")

patch(P,
"""      // The board really is the one described — without this the case could pass on a
      // board that simply failed to place anything. Every WRONG reading is non-zero.
      const shape = readings(state);
      expect(shape[0], `seed ${seed}`).toBe(0);
      expect(shape.slice(1).every((n) => n > 0), `seed ${seed} / ${shape.join(",")}`).toBe(true);""",
"""      // The board really is the one described — without this the case could pass on a
      // board that simply failed to place anything.
      //
      // \U0001f6d1 **THE HONEST FORM OF "EVERY WRONG READING WOULD FLIP" IS NARROWER THAN IT
      // LOOKS, AND MEASURING IT IS WHAT SHOWED THAT.** With both Actives empty, every
      // ACTIVE-based reading is necessarily 0 too — the units reading, either
      // one-seat reading and the typed reading all collapse onto the right answer, so
      // this board cannot separate them and does not claim to (§3 and §4's mirror pair
      // are what do). What it DOES separate are the five readings that leave the
      // Active Spot: the two BOARD counts, their sum, and the three BODY counts, all
      // of them non-zero here, so a build reading `countEnergyInPlay` or D474's
      // `pokemonInPlay` flips where the real one does not.
      const shape = readings(state);
      expect(shape.slice(0, 5), `seed ${seed}`).toEqual([0, 0, 0, 0, 0]);
      expect(shape.slice(5).every((n) => n > 0), `seed ${seed} / ${shape.join(",")}`).toBe(true);""")
