import sys
sys.path.insert(0, "/home/jofre/.claude/jobs/fd842b9d/tmp/d475")
from patch import patch
patch("packages/engine/src/testFixtures.ts",
"""      fixture in the pool whose printed count BOTH SEATS contribute to. Three
      indices, and TWO of them are refusals — which is unusual and is the point:
      this member is reachable from exactly one reader, and the two neighbours that
      look like they should reach it are real printings rather than invented
      near-misses.""",
"""      fixture in the pool whose printed count BOTH SEATS contribute to. Three
      indices, and \U0001f195\U0001f195 **as of D475 exactly ONE of them is a refusal** (it was two):
      this member is reachable from exactly one reader, and the two neighbours that
      look like they should reach it are real printings rather than invented
      near-misses.""")

patch("packages/engine/src/testFixtures.ts",
"""        2 "Twin Flip"   60×  ⚠️ THE COIN NEAR-MISS, REFUSED. "Flip a coin for each
                             Energy attached to both Active Pokémon. This attack
                             does 60 damage for each heads." is 1 printing and 1
                             LEGAL — the SAME noun counted as FLIPS rather than as
                             damage. It is not `AttackFlipCount.attachedEnergy`
                             either: that member (D128) reads "attached to this
                             Pokémon", one body, not two. So the pool's only legal
                             both-Actives coin sentence is unread on BOTH sides,
                             and this index is what says so.""",
"""        2 "Twin Flip"   60×  \U0001f195\U0001f195 **D475 — BUILT, AND NO LONGER A REFUSAL.** "Flip a
                             coin for each Energy attached to both Active Pokémon.
                             This attack does 60 damage for each heads." is corpus
                             FILE LINE 231, 1 printing and 1 LEGAL — the SAME noun
                             counted as FLIPS rather than as damage. Both facts
                             this block recorded while it was refused HELD: it is
                             not `AttackFlipCount.attachedEnergy` (that member,
                             D128, reads "attached to this Pokémon" — one body, not
                             two) and neither damage reader may take it. It is
                             `deriveAttackCoinFlip` through a FIFTH, NULLARY member
                             `bothActivesEnergy`. ⚠️ **This index was ALREADY the
                             printed sentence, char for char, so D475 added no
                             `FIXTURE_POOL` id at all** — the pool size, the
                             eleven-deep `ids.length - N` ladder in
                             `opponentResistanceBonus.test.ts` and the Stage-1 count
                             all take a ZERO term (D461/D465).""")
