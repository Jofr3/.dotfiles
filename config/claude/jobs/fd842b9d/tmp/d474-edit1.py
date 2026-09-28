import hashlib
P = "/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts"
orig = open(P, "rb").read()
text = orig.decode("utf-8")

FIND = """const ATTACK_COIN_PER_ENERGY =
  /^Flip a coin for each (?:(.+) )?Energy attached to this Pokémon\\. This attack does (\\d+) damage for each heads\\.$/;
"""

ADD = """
// 🆕🆕 D474 — THE BOARD-COUNTED FLIP COUNT OVER **BODIES** RATHER THAN ENERGY —
// *"Flip a coin for each {D} Pokémon you have in play. This attack does 60 damage
// for each heads."* — corpus FILE LINE 233, **1 sentence / 2 Standard-legal
// printings**, measured over all 640 rows of `legalAttackCorpus()` rather than
// sampled. It is the only row in the column that spells *"you have in play"* at
// all, and the whole `/Flip a coin for each/` family is exactly three rows: this
// one, D128's `Energy attached to this Pokémon` (built), and file line 231's
// `Energy attached to both Active Pokémon` (still unbuilt, and NOT this arm's —
// see below).
//
// 🛑 **STRUCTURALLY DISJOINT FROM `ATTACK_COIN_PER_ENERGY`, SO NO GUARD IS WRITTEN
// AND CORRECTLY NONE IS** (D467/D468's first preference, and D468's second kind of
// `equivalent`). Both patterns are `^…$` and both end with the identical run
// `\\. This attack does (\\d+) damage for each heads\\.$`; the byte immediately
// before that run is mandatory in each and they disagree — `…in play` here,
// `…this Pokémon` there. No string can end two ways, so no input reaches both and
// the ORDER between them is legibility. A lookahead would be unkillable by
// construction, which this repo calls a vacuous guard (D205/D208, D467). The
// order-permutation row is declared `equivalent` with the STRUCTURAL kind named,
// because a guarded equivalence and a structural one carry opposite maintenance
// obligations and the sweep log cannot tell them apart.
//
// ⚠️ **EVERY WIDENING WAS MEASURED OVER THE WHOLE COLUMN AND EVERY ONE CLAIMS THE
// IDENTICAL 1 SENTENCE / 2 PRINTINGS** (D472's rule, at its third address):
// dropping `you have` to `^Flip a coin for each ([^.]+) in play\\.`; opening the
// consequent to `\\. (.+)$`; admitting `more`; dropping the `^`; dropping the
// `\\.$`. All five: **1/2**. A wider anchor that claims the same rows buys nothing
// and costs a wrong program, so the pattern spells what the card prints. And
// because no widening admits a new row, none admits a new OP either, so D473's
// describer question (*does `describeBranch` have a phrase for what a widened
// anchor would newly claim?*) has an empty subject here — stated rather than
// skipped.
//
// THE NOUN IS `([^.]+)` AND IT IS RESOLVED BY `inPlayBodyFilter`, NOT BY THIS
// PATTERN — D159, and the same vocabulary `IN_PLAY_BODY_MULTIPLY` /
// `IN_PLAY_BODY_SCALE` / `YOUR_BENCH_FILTERED_SCALE` hand their noun to. *"Which
// bodies does this printed noun name"* is ONE question with ONE answer, so `{D}`
// resolves through `CLAUSE_POKEMON_TYPES` to `{kind: "typedPokemon", pokemonType:
// "Darkness"}` and *"Ancient Pokémon"* — which no `cardSchema` column classifies —
// reaches the map, MISSES it, and leaves the sentence on the loud
// ATTACK_EFFECT_SKIPPED path. That is the closed-map property D440 refused a
// capture to keep: a filter that counts 0 on every board forever while
// `BUILT.attack` steps for it is strictly worse than an unbuilt sentence.
//
// NO `(?!opponent)` LOOKAHEAD, unlike the `IN_PLAY_BODY_*` pair, and the reason is
// that the literal `you have` already does the refusing: the opponent-side spelling
// of this sentence would be *"your opponent has in play"*, which cannot reach this
// pattern at any noun. A lookahead here would be a `(?!…)` nobody could turn red.
//
// ⚠️ **NO SEAT FIELD ON THE MEMBER, AND FILE LINE 231's SEAT DOES NOT RIDE THIS
// MEMBER.** 231 is *"Flip a coin for each Energy attached to both Active
// Pokémon."* — a count of ENERGY on two bodies, which is `attachedEnergy`'s
// question with a scope, not a count of BODIES. No widening of `pokemonInPlay`
// can reach an Energy count, so 231 rides the SHIPPED member (a scope field on
// `attachedEnergy`, or a fourth member) and this slice neither helps nor blocks
// it. The seat is therefore absent here because the column prints one seat for
// THIS question, and the falsifier is executable: the day the column prints an
// opponent-side body flip count, the field is owed in the same edit.
const ATTACK_COIN_PER_BODY_IN_PLAY =
  /^Flip a coin for each ([^.]+) you have in play\\. This attack does (\\d+) damage for each heads\\.$/;
"""

parts = text.split(FIND)
assert len(parts) == 2, f"find occurs {len(parts) - 1}x"
out = (FIND + ADD).join(parts)
payload = out.encode("utf-8")
with open(P, "wb") as fh:
    fh.write(payload)
now = open(P, "rb").read()
print("before", len(orig), "after", len(now), "delta", len(now) - len(orig))
assert len(now) > len(orig)
print("sha", hashlib.sha256(now).hexdigest()[:16])
