import sys
sys.path.insert(0, "/home/jofre/.claude/jobs/fd842b9d/tmp/d475")
from patch import patch

P = "packages/engine/src/effects.ts"
FIND = """const ATTACK_COIN_PER_ENERGY =
  /^Flip a coin for each (?:(.+) )?Energy attached to this Pokémon\\. This attack does (\\d+) damage for each heads\\.$/;

// \U0001f195\U0001f195 D474 — THE BOARD-COUNTED FLIP COUNT OVER **BODIES** RATHER THAN ENERGY —"""

NEW = """const ATTACK_COIN_PER_ENERGY =
  /^Flip a coin for each (?:(.+) )?Energy attached to this Pokémon\\. This attack does (\\d+) damage for each heads\\.$/;

// \U0001f195\U0001f195 D475 — THE THIRD AND LAST BOARD-COUNTED FLIP COUNT: ENERGY ON **BOTH
// ACTIVES** — *"Flip a coin for each Energy attached to both Active Pokémon. This attack
// does 60 damage for each heads."* — corpus FILE LINE 231, **1 sentence / 1
// Standard-legal printing**, measured over all 640 rows of `legalAttackCorpus()`
// rather than sampled. With it the whole `/^Flip a coin for each/` family is READ:
// **three rows / four printings** — D128's self-attached Energy (file line 232),
// D474's own-side BODIES (233), and this one.
//
// \U0001f6d1 **A THIRD ANCHOR AND NOT A WIDENING OF D128's, AND THE MEASUREMENT IS THE WHOLE
// ARGUMENT** (D472's rule, at its fourth address). Every single-axis loosening was
// RUN over the committed column rather than described:
//   · an optional type filter, `(?:(.+) )?Energy attached to both Active Pokémon` — **1/1**
//   · an open consequent, `\\. (.+)$`                                                — **1/1**
//   · admitting `more`                                                              — **0/0**
//   · dropping the `^`                                                              — **1/1**
//   · dropping the `\\.$`                                                            — **1/1**
//   · making `both ` optional                                                       — **1/1**
// Not one of them buys a printing, so the generality would be pure risk. ⚠️ **And the
// two loosenings that DO move a number move it the wrong way**: opening the
// attachment noun to `attached to ([^.]+)\\.` claims **2 sentences / 2 printings** and
// opening the whole head to `for each ([^.]+)\\.` claims **3 / 4** — in both cases the
// extra rows are the SHIPPED siblings', so a widened D128 anchor would take this
// sentence by EATING ITS NEIGHBOUR'S, which is exactly what the family's structural
// disjointness exists to prevent. Because no widening admits a new ROW, none admits a
// new OP either, so D473's describer question has an empty subject here — stated
// rather than skipped.
//
// \U0001f6d1 **STRUCTURALLY DISJOINT FROM BOTH SIBLINGS, SO NO GUARD IS WRITTEN AND
// CORRECTLY NONE IS** (D467/D468's FIRST preference, and D468's SECOND kind of
// `equivalent`). All three patterns are `^…$` and all three end with the identical run
// `\\. This attack does (\\d+) damage for each heads\\.$`; the mandatory bytes
// immediately before that run disagree three ways — `…attached to both Active
// Pokémon` here, `…attached to this Pokémon` at D128, `… you have in play` at D474.
// A string cannot end three ways, so no input reaches two of them and the ORDER among
// them is LEGIBILITY. A lookahead would be unkillable by construction, which this
// repo calls a vacuous guard (D205/D208/D467); the order-permutation row is declared
// `equivalent` with the STRUCTURAL kind named, because the sweep log cannot tell a
// guarded equivalence from a structural one and their maintenance obligations are
// opposite.
//
// ⚠️ **NO TYPE FILTER, AND IT IS THE SAME ABSENCE THE DAMAGE TWIN ALREADY PINS.**
// `selfEnergyScaling.test.ts` has asserted since D196 that the pool prints no typed
// spelling of *"Energy attached to both Active Pokémon"* in any text column; the
// first loosening above measures that again on the COIN side, over the whole 640-row
// attack column. An optional capture here would be a group no printing could ever set
// (D441: the test is how many INDEPENDENT questions the PRINT asks, not how many the
// pattern could answer). The falsifier is executable — the day the column prints a
// typed both-Actives flip count, the group is owed in the same edit.
const ATTACK_COIN_PER_BOTH_ACTIVES_ENERGY =
  /^Flip a coin for each Energy attached to both Active Pokémon\\. This attack does (\\d+) damage for each heads\\.$/;

// \U0001f195\U0001f195 D474 — THE BOARD-COUNTED FLIP COUNT OVER **BODIES** RATHER THAN ENERGY —"""

patch(P, FIND, NEW)
