import sys
sys.path.insert(0, "/home/jofre/.claude/jobs/fd842b9d/tmp/d475")
from patch import patch
P = "packages/engine/src/selfEnergyScaling.test.ts"

patch(P,
"""/** ⚠️ The coin near-miss — 1 printing, 1 LEGAL, and unread on BOTH sides: it is not
    `AttackFlipCount.attachedEnergy` either, because that member reads "attached to
    this Pokémon" (one body) and this names two. */
const TWIN_FLIP =""",
"""/** The coin form of the same printed noun — 1 printing, 1 LEGAL. \U0001f195\U0001f195 **D475 BUILT
    IT**, and the two facts this file carried about it both held: it is NOT
    `AttackFlipCount.attachedEnergy` (that member reads *"attached to this Pokémon"*,
    one body, and this names two), and it is not either DAMAGE reader's either — it is
    `deriveAttackCoinFlip` through a fifth, NULLARY `AttackFlipCount` member
    `bothActivesEnergy`. The rungs below were RE-POINTED rather than deleted (D418):
    what they were really pinning is that the DAMAGE readers still refuse it, and that
    claim is untouched. */
const TWIN_FLIP =""")

patch(P,
"""  it("the printed refusals on `fix-bothactives` stay LOUD on a real board", () => {
    const state = mirrorBoard("fix-bothactives");
    for (const [index, name] of [
      [TWIN.blast, "Twin Blast"],
      [TWIN.flip, "Twin Flip"],
    ] as const) {
      expect(find(swing(state, index).events, "ATTACK_EFFECT_SKIPPED")).toMatchObject({
        attack: name,
      });
    }
  });""",
"""  it("the printed refusal on `fix-bothactives` stays LOUD on a real board — and D475's does NOT", () => {
    // \U0001f195\U0001f195 **D475 SPLIT THIS RUNG IN TWO AND KEPT BOTH HALVES (D424: every "X is
    // refused" owes a neighbouring "Y is admitted" on the same axis).** "Twin Blast"
    // is still refused — it is the MULTIPLY twin of `bothActivesEnergyCount`, printed
    // once and **0 LEGAL**, so no arm was built and the loud path is the right answer.
    // "Twin Flip" is corpus file line 231 and D475 reads it, so it must NOT be loud,
    // and asserting the absence of the row here is what stops a later slice quietly
    // un-building it: an `ATTACK_EFFECT_SKIPPED` naming "Twin Flip" is now a defect.
    const state = mirrorBoard("fix-bothactives");
    expect(find(swing(state, TWIN.blast).events, "ATTACK_EFFECT_SKIPPED")).toMatchObject({
      attack: "Twin Blast",
    });
    const flipped = swing(state, TWIN.flip);
    expect(find(flipped.events, "ATTACK_EFFECT_SKIPPED")).toBeUndefined();
    // …and it really FLIPPED, once per Energy card on the two Actives. `mirrorBoard`
    // gives each side the one Energy that pays the {C} cost, so the count is 1 + 1.
    expect(flipped.events.filter((e) => e.type === "ATTACK_EFFECT_COIN_FLIP")).toHaveLength(2);
  });""")

patch(P,
"""    // ⚠️ THE BOTH-ACTIVES COIN ROW IS UNREAD ON EVERY SIDE, AND THAT IS MEASURED.
    // 1 printing / 1 LEGAL. It is NOT `AttackFlipCount.attachedEnergy` either:
    // that member reads "attached to this Pokémon", one body, and this names two.
    // So the pool's only legal both-Actives coin sentence stays LOUD, and the next
    // slice can price it from here instead of rediscovering it.
    expect(deriveAttackCoinFlip(TWIN_FLIP)).toBeNull();
    expect(deriveAttackDamageBonus(TWIN_FLIP)).toBeNull();
    expect(deriveAttackDamageMultiplier(TWIN_FLIP)).toBeNull();""",
"""    // \U0001f195\U0001f195 **D475 — THE BOTH-ACTIVES COIN ROW IS NOW READ, BY THE COIN READER AND
    // BY NOTHING ELSE.** Re-pointed by NAMING THE OWNER rather than flipped to a bare
    // `not.toBeNull()` (D438): the half of the old claim worth keeping is that the two
    // DAMAGE readers still refuse it, and that half is asserted unchanged beneath the
    // positive one. It is NOT `AttackFlipCount.attachedEnergy` — that member reads
    // "attached to this Pokémon", one body, and this names two — so the member is a
    // fifth, NULLARY one.
    expect(deriveAttackCoinFlip(TWIN_FLIP)).toEqual({
      kind: "perHeads",
      flips: { kind: "bothActivesEnergy" },
      per: 60,
    });
    expect(deriveAttackCoinFlip(TWIN_FLIP)).not.toEqual(deriveAttackCoinFlip(COIN_PER_ENERGY));
    expect(deriveAttackDamageBonus(TWIN_FLIP)).toBeNull();
    expect(deriveAttackDamageMultiplier(TWIN_FLIP)).toBeNull();""")

patch(P,
"""//     it is 1 printing and **0 legal**. D193's neighbour is ADD-only because the
//     twin does not exist at all. Telling those two apart is the difference
//     between "no pattern is owed" and "a pattern is owed and refused".""",
"""//     it is 1 printing and **0 legal**. D193's neighbour is ADD-only because the
//     twin does not exist at all. Telling those two apart is the difference
//     between "no pattern is owed" and "a pattern is owed and refused".
//
//   • \U0001f195\U0001f195 **D475 — THE COIN FORM OF THIS NOUN IS BUILT, AND THE THIRD INDEX ON
//     `fix-bothactives` IS NO LONGER A REFUSAL.** "Flip a coin for each Energy
//     attached to both Active Pokémon. This attack does 60 damage for each heads."
//     (corpus FILE LINE 231, 1 printing / 1 LEGAL) reads through
//     `deriveAttackCoinFlip` and a NULLARY `AttackFlipCount.bothActivesEnergy`. The
//     two facts this file recorded about it both HELD — it is not
//     `attachedEnergy` (one body against two) and neither damage reader may take it —
//     which is why every rung here was re-pointed by naming the new owner rather than
//     deleted. **"Twin Blast" is still refused and is now the file's only both-Actives
//     refusal**, so the "X refused / Y admitted" pair (D424) is one index apart.""")
