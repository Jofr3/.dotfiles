import sys
sys.path.insert(0, "/home/jofre/.claude/jobs/fd842b9d/tmp/d475")
from patch import patch
P = "packages/engine/src/effects.ts"

patch(P,
"""    const filter = inPlayBodyFilter(inPlayBodies[1] ?? "");
    return filter !== null && per >= 1
      ? { kind: "perHeads", flips: { kind: "pokemonInPlay", filter }, per }
      : null;
  }
  // D129 — the two unbounded arms.""",
"""    const filter = inPlayBodyFilter(inPlayBodies[1] ?? "");
    return filter !== null && per >= 1
      ? { kind: "perHeads", flips: { kind: "pokemonInPlay", filter }, per }
      : null;
  }
  // \U0001f195\U0001f195 D475 — the THIRD board-counted flip count, and the only one BOTH SEATS
  // contribute to. Placed after the two arms it is the sibling of, so the whole
  // `Flip a coin for each …` family reads down the page in one block; the placement
  // is LEGIBILITY and not behaviour, because all three anchors are STRUCTURALLY
  // disjoint (see `ATTACK_COIN_PER_BOTH_ACTIVES_ENERGY`) and no input can reach two
  // of them — which is why the order-permutation row below it is a DECLARED
  // equivalent rather than a killed one.
  //
  // ONE guard and not two, unlike the body arm directly above: that arm captures its
  // noun and owes the VOCABULARY a refusal, while this anchor spells its subject out
  // and has nothing to look up. So `per >= 1` — the coin family's printed-zero guard,
  // carried by every arm in this function — is the whole check. NO flip ceiling, for
  // `MAX_PRINTED_FLIPS`' own stated reason: a bound is owed to the SOURCE of the
  // number, and this one is read off the engine's own board (at most two Actives'
  // worth of attached cards), not out of third-party ingested text.
  const bothActivesEnergy = ATTACK_COIN_PER_BOTH_ACTIVES_ENERGY.exec(effect);
  if (bothActivesEnergy !== null) {
    const per = Number(bothActivesEnergy[1]);
    return per >= 1 ? { kind: "perHeads", flips: { kind: "bothActivesEnergy" }, per } : null;
  }
  // D129 — the two unbounded arms.""")
