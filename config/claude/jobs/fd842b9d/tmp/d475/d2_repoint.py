import sys
sys.path.insert(0, "/home/jofre/.claude/jobs/fd842b9d/tmp/d475")
from patch import patch
P = "packages/engine/src/inPlayFlipCount.test.ts"

patch(P,
"""/** The THIRD member of the printed `Flip a coin for each …` family (corpus file line
    231, 1 printing) — and it is NOT this member's business. It counts ENERGY on two
    bodies, which is `attachedEnergy`'s question with a scope on it; no widening of a
    BODY count can reach an Energy count. It stays LOUD, and §1 drives that. */
const SIBLING_UNBUILT =""",
"""/** The THIRD member of the printed `Flip a coin for each …` family (corpus file line
    231, 1 printing) — and it is NOT this member's business. It counts ENERGY on two
    bodies, which no widening of a BODY count can reach. \U0001f195\U0001f195 **D475 BUILT IT, on its
    OWN anchor and its OWN nullary `bothActivesEnergy` member — which is what this
    file predicted and is the reason the rung below was RE-POINTED rather than
    deleted (D418/D438): the claim that survives is *"`pokemonInPlay` did not widen to
    take it"*, and that is strictly stronger than the `toBeNull` it replaces.** */
const SIBLING_BOTH_ACTIVES =""")

patch(P, "      [PRINTED, SIBLING_ENERGY, SIBLING_UNBUILT].sort(),",
          "      [PRINTED, SIBLING_ENERGY, SIBLING_BOTH_ACTIVES].sort(),")

patch(P,
"""  it("\U0001f6d1 the whole `Flip a coin for each` family is THREE rows, and only two are read", () => {
    // D448's rule: write the "cannot see" sentence as a QUERY YOU RAN. The loosest
    // shape that can hold this mechanism is the leading clause itself.
    const family = legalAttackCorpus().filter(([, s]) => /Flip a coin for each/.test(s));
    expect(family.map(([, s]) => s).sort()).toEqual(
      [PRINTED, SIBLING_ENERGY, SIBLING_BOTH_ACTIVES].sort(),
    );
    expect([family.length, units(family)]).toEqual([3, 4]);
    expect(deriveAttackCoinFlip(PRINTED)).not.toBeNull();
    expect(deriveAttackCoinFlip(SIBLING_ENERGY)).not.toBeNull();
    expect(deriveAttackCoinFlip(SIBLING_UNBUILT)).toBeNull();
  });""",
"""  it("\U0001f6d1 the whole `Flip a coin for each` family is THREE rows, and D475 read the last", () => {
    // D448's rule: write the "cannot see" sentence as a QUERY YOU RAN. The loosest
    // shape that can hold this mechanism is the leading clause itself.
    const family = legalAttackCorpus().filter(([, s]) => /Flip a coin for each/.test(s));
    expect(family.map(([, s]) => s).sort()).toEqual(
      [PRINTED, SIBLING_ENERGY, SIBLING_BOTH_ACTIVES].sort(),
    );
    expect([family.length, units(family)]).toEqual([3, 4]);
    // \U0001f195\U0001f195 D475 — all THREE now read, and each through a DIFFERENT `AttackFlipCount`
    // member. Re-pointed onto the three derived VALUES rather than relaxed to three
    // `not.toBeNull()`s, because "each row is claimed" is true under a build where one
    // anchor swallowed its neighbour and the members collapsed (D438/D449).
    expect(deriveAttackCoinFlip(PRINTED)?.kind).toBe("perHeads");
    const members = [PRINTED, SIBLING_ENERGY, SIBLING_BOTH_ACTIVES].map((s) => {
      const read = deriveAttackCoinFlip(s);
      return read !== null && "flips" in read ? read.flips.kind : null;
    });
    expect(members).toEqual(["pokemonInPlay", "attachedEnergy", "bothActivesEnergy"]);
  });""")

patch(P,
"""  it("\U0001f6d1 file line 231 stays LOUD, and it is NOT this member's row", () => {
    // The SEAT axis lives on the SHIPPED member, not on this one: 231 counts ENERGY on
    // two bodies. Recorded as a rung so a successor meets the answer rather than
    // re-deriving it (D428: a refusal written as a test cannot rot).
    expect(resolvedByAnyReader(SIBLING_UNBUILT)).toBe(false);
    for (const read of READERS) expect(read(SIBLING_UNBUILT), read.name).toBeNull();
    expect(splitAttackTrailingClause(SIBLING_UNBUILT)).toBeNull();
    expect(splitAttackGateClause(SIBLING_UNBUILT)).toBeNull();
  });""",
"""  it("\U0001f6d1 file line 231 is D475's row and NOT this member's — `pokemonInPlay` did not widen", () => {
    // \U0001f195\U0001f195 **RE-POINTED, NOT FLIPPED (D438/D418).** The old rung said
    // `resolvedByAnyReader === false` — a thirteen-way refusal that D475 makes false.
    // Relaxing it to `=== true` would discard all thirteen refusals at once, which is
    // how D436 disarmed D368's tripwire and produced this run's only GAP. So the
    // replacement NAMES THE OWNER by value and KEEPS the other twelve refusals and
    // both splitters, which is strictly stronger than either boolean.
    expect(resolvedByAnyReader(SIBLING_BOTH_ACTIVES)).toBe(true);
    expect(deriveAttackCoinFlip(SIBLING_BOTH_ACTIVES)).toEqual({
      kind: "perHeads",
      flips: { kind: "bothActivesEnergy" },
      per: 60,
    });
    for (const read of READERS) {
      if (read === deriveAttackCoinFlip) continue;
      expect(read(SIBLING_BOTH_ACTIVES), read.name).toBeNull();
    }
    expect(splitAttackTrailingClause(SIBLING_BOTH_ACTIVES)).toBeNull();
    expect(splitAttackGateClause(SIBLING_BOTH_ACTIVES)).toBeNull();
    // \U0001f6d1 **THE DISCRIMINATION THE OLD CLAIM CARRIED, KEPT ON A NEW SUBJECT (D444).**
    // What the `toBeNull` really pinned was *"no widening of a BODY count reaches an
    // ENERGY count"*. That is still true and is now assertable POSITIVELY: 231 is read
    // by a member of its own, and THIS slice's anchor still refuses it — so a build
    // that had widened `ATTACK_COIN_PER_BODY_IN_PLAY` to swallow 231 reddens here
    // where the old boolean could not tell that build from the real one.
    expect(ATTACK_COIN_PER_BODY_IN_PLAY_PROBE.test(SIBLING_BOTH_ACTIVES)).toBe(false);
    expect(ATTACK_COIN_PER_BODY_IN_PLAY_PROBE.test(PRINTED)).toBe(true);
  });""")
