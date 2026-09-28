import sys
sys.path.insert(0, "/home/jofre/.claude/jobs/fd842b9d/tmp/d475")
from patch import patch
P = "packages/engine/src/effects.ts"

patch(P,
"""// The near-miss is one row and it is a COIN sentence: "Flip a coin for each Energy
// attached to both Active Pokémon. This attack does 60 damage for each heads." (1
// printing, 1 LEGAL) — the same noun counted as FLIPS rather than damage, which is
// D128's family and NOT `AttackFlipCount.attachedEnergy` either (that member reads
// "attached to this Pokémon"). It is refused here by the capital-`This` head and
// asserted to stay unread on both sides.""",
"""// The near-miss is one row and it is a COIN sentence: "Flip a coin for each Energy
// attached to both Active Pokémon. This attack does 60 damage for each heads." (1
// printing, 1 LEGAL) — the same noun counted as FLIPS rather than damage, which is
// D128's family and NOT `AttackFlipCount.attachedEnergy` either (that member reads
// "attached to this Pokémon"). It is refused here by the capital-`This` head.
// \U0001f195\U0001f195 **D475 BUILT IT** — corpus FILE LINE 231, through
// `ATTACK_COIN_PER_BOTH_ACTIVES_ENERGY` and a fifth, NULLARY `AttackFlipCount`
// member `bothActivesEnergy` — so *"asserted to stay unread on both sides"*, which
// this paragraph used to end with, is no longer the claim. **What survives is the
// half that was doing the work**: this DAMAGE anchor still refuses it, on the
// capital-`This` head, and `selfEnergyScaling.test.ts` pins that by naming the coin
// reader as the owner rather than by asserting a null (D438).""")

patch(P,
"""// one, D128's `Energy attached to this Pokémon` (built), and file line 231's
// `Energy attached to both Active Pokémon` (still unbuilt, and NOT this arm's —
// see below).""",
"""// one, D128's `Energy attached to this Pokémon` (built), and file line 231's
// `Energy attached to both Active Pokémon` — \U0001f195\U0001f195 built at D475 on its own anchor
// and its own NULLARY member, which is what the note at the foot of this block
// predicted, and NOT this arm's.""")

patch(P,
"""// ⚠️ **NO SEAT FIELD ON THE MEMBER, AND FILE LINE 231's SEAT DOES NOT RIDE THIS
// MEMBER.** 231 is *"Flip a coin for each Energy attached to both Active
// Pokémon."* — a count of ENERGY on two bodies, which is `attachedEnergy`'s
// question with a scope, not a count of BODIES. No widening of `pokemonInPlay`
// can reach an Energy count, so 231 rides the SHIPPED member (a scope field on
// `attachedEnergy`, or a fourth member) and this slice neither helps nor blocks
// it. The seat is therefore absent here because the column prints one seat for
// THIS question, and the falsifier is executable: the day the column prints an
// opponent-side body flip count, the field is owed in the same edit.""",
"""// ⚠️ **NO SEAT FIELD ON THE MEMBER, AND FILE LINE 231's SEAT DOES NOT RIDE THIS
// MEMBER.** 231 is *"Flip a coin for each Energy attached to both Active
// Pokémon."* — a count of ENERGY on two bodies, which is `attachedEnergy`'s
// question with a scope, not a count of BODIES. No widening of `pokemonInPlay`
// can reach an Energy count, so 231 rides neither this member nor this anchor.
// \U0001f195\U0001f195 **D475 SETTLED WHICH OF THE TWO OFFERED SHAPES IT TOOK, AND IT WAS THE
// SECOND**: not *"a scope field on `attachedEnergy`"* but a member of its own,
// `bothActivesEnergy`, because the payloads are asymmetric (an ENERGY TYPE FILTER
// against nothing at all) and D440's rule gives two members for that. The seat is
// absent HERE because the column prints one seat for THIS question, and the
// falsifier is executable: the day the column prints an opponent-side body flip
// count, the field is owed in the same edit.""")
