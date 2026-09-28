import json

def s(x):
    return json.dumps(x, ensure_ascii=False)

ANCHOR_FIND = "const ATTACK_COIN_PER_BOTH_ACTIVES_ENERGY =\n  /^Flip a coin for each Energy attached to both Active Pokémon\\. This attack does (\\d+) damage for each heads\\.$/;"
ARM_RETURN = '    return per >= 1 ? { kind: "perHeads", flips: { kind: "bothActivesEnergy" }, per } : null;'
ARM_HEAD = "  const bothActivesEnergy = ATTACK_COIN_PER_BOTH_ACTIVES_ENERGY.exec(effect);\n  if (bothActivesEnergy !== null) {"
ARM_PER = "    const per = Number(bothActivesEnergy[1]);"
BODY_HEAD = "  const inPlayBodies = ATTACK_COIN_PER_BODY_IN_PLAY.exec(effect);\n  if (inPlayBodies !== null) {"
FLIPS = ("      flips =\n"
         "        countAttachedEnergy(state, ownActive, null) +\n"
         "        (foeActive === null ? 0 : countAttachedEnergy(state, foeActive, null));")
OWN = "      const ownActive = state.players[attackerSeat].active ?? attacker;"

SUITE = "packages/engine/src/bothActivesFlipCount.test.ts"
SELF = "packages/engine/src/selfEnergyScaling.test.ts"
INPLAY = "packages/engine/src/inPlayFlipCount.test.ts"
PER_ENERGY = "packages/engine/src/perEnergyFlip.test.ts"
E = "packages/engine/src/effects.ts"
A = "packages/engine/src/attack.ts"

ROWS = [
 dict(id="D475-anchor-loses-its-start-anchor", file=E,
   what="The whole-sentence `^` deleted, so any printing whose TAIL is this sentence is claimed. That is the loud/silent asymmetry D464 named at the `^` end: with leading text the head is unclaimed today and `ATTACK_EFFECT_SKIPPED` fires, so a compound printing would silently lose its head and flip a coin for it. §2's whole-sentence rung drives the constructed prefix, whose own first sentence ENDS before the anchor so the probe varies ONLY the caret (D452).",
   find=ANCHOR_FIND,
   replace=ANCHOR_FIND.replace("/^Flip a coin", "/Flip a coin"),
   killers=[SUITE]),
 dict(id="D475-anchor-loses-its-end-anchor", file=E,
   what="The trailing `$` deleted, the mirror of the row above. D464: once the sentence itself derives, its `$`-end near-miss is NOT demonstrable on the loud path — `splitAttackTrailingClause` would compose a claimed head with a claimed tail — so the rung that kills this one asserts the anchor's own refusal of `⟨sentence⟩ Then, discard a card.` rather than the census.",
   find=ANCHOR_FIND,
   replace=ANCHOR_FIND.replace("for each heads\\\\.$/;", "for each heads\\\\./;"),
   killers=[SUITE]),
 dict(id="D475-anchor-drops-the-printed-scope", file=E,
   what="`both Active Pokémon` re-spelled `this Pokémon` — D128's SHIPPED sentence, and the mistake an author copying the sibling anchor two screens up would actually make. The printed sentence stops deriving entirely (this anchor no longer matches it) while D128's arm, which runs FIRST, keeps its own row — so the census falls by one and the board stops flipping. It is the SCOPE axis alone, which §2 drives from the other side by asserting that the same substitution moves the derived MEMBER rather than turning the sentence off.",
   find=ANCHOR_FIND,
   replace=ANCHOR_FIND.replace("attached to both Active Pokémon", "attached to this Pokémon"),
   killers=[SUITE, SELF]),
 dict(id="D475-anchor-admits-a-type-word", file=E,
   what="A NON-CAPTURING optional type group spliced in — the widening D472's rule refuses, written so the group indices do NOT shift and the mutation is a pure widening rather than an index rot (D447/D458 are the row that pairs the two). Measured over all 640 corpus rows it claims the identical 1 sentence / 1 printing, so it buys nothing; what it costs is a `{R}`-filtered printing deriving an UNFILTERED count, which is a wrong number on every board and no loud row. §2's typed rung is five near-misses on one axis.",
   find=ANCHOR_FIND,
   replace=ANCHOR_FIND.replace("for each Energy attached", "for each (?:.+ )?Energy attached"),
   killers=[SUITE]),
 dict(id="D475-arm-emits-the-self-attached-member", file=E,
   what="🛑 THE CENTRAL ROW, and it is the NEAREST WRONG SIBLING (D469 → D474): the arm emits `attachedEnergy` — the member one screen up, whose own sentence differs from this one in a single printed noun phrase — so the flip count becomes the ATTACKER'S OWN pile and the defender's is silently dropped. ⚠️ EVERY CENSUS IS BLIND TO IT: the sentence still reads, `resolvedByAnyReader` is still true, RESIDUE still falls 1/1 and `BUILT.attack` still steps. Only a board can tell, and §3's holds 2 against 7 so the answer moves 9 → 2. This is also the runtime half of the trap D474 armed the `takeFlips` `switch` for; the TYPE half of that trap does not fire, because this member is NULLARY (see the suite header).",
   find=ARM_RETURN,
   replace='    return per >= 1\n      ? { kind: "perHeads", flips: { kind: "attachedEnergy", energy: null }, per }\n      : null;',
   killers=[SUITE, SELF, INPLAY]),
 dict(id="D475-arm-emits-the-body-count-member", file=E,
   what="The OTHER neighbouring member — D474's `pokemonInPlay` at its widest filter — emitted instead, which is the arm directly above this one in the same function and the second-nearest wrong sibling. The count becomes BODIES rather than ENERGY: 5 on §3's board against the correct 9. Written as a PAIR with the row above because the two neighbours are on opposite sides of this arm and a suite that caught only one would be green on the other.",
   find=ARM_RETURN,
   replace='    return per >= 1\n      ? { kind: "perHeads", flips: { kind: "pokemonInPlay", filter: { kind: "anyPokemon" } }, per }\n      : null;',
   killers=[SUITE]),
 dict(id="D475-arm-drops-the-positive-per-guard", file=E,
   what="`per >= 1` relaxed to `per >= 0`, the coin family's printed-zero guard deleted. A printed `0 damage for each heads` would then spend a flip — and an `rngState` step, which desyncs every later flip in the match — to add nothing. Every arm of `deriveAttackCoinFlip` carries this guard for that reason; §2 drives the refusal beside its one-axis ADMISSION at `per = 1` (D424).",
   find=ARM_RETURN,
   replace=ARM_RETURN.replace("per >= 1", "per >= 0"),
   killers=[SUITE]),
 dict(id="D475-arm-reads-the-whole-match-as-the-amount", file=E,
   what="`bothActivesEnergy[1]` → `[0]`, the classic off-by-one on a single-group anchor and the one D458 measured as a re-transcription event. `[0]` is the whole matched sentence, so `Number(...)` is `NaN`, `NaN >= 1` is false and the printed sentence falls SILENTLY off the built set — the QUIET direction, where the census drops by one and no board complains.",
   find=ARM_PER,
   replace=ARM_PER.replace("[1]", "[0]"),
   killers=[SUITE]),
 dict(id="D475-both-actives-arm-moves-ahead-of-the-body-one", file=E,
   what="THIS SLICE'S ARM IS HOISTED AHEAD OF D474's BODY ARM. Written to test the placement claim in `ATTACK_COIN_PER_BOTH_ACTIVES_ENERGY`'s block — that the ORDER of the three `Flip a coin for each …` arms is LEGIBILITY, because the disjointness is STRUCTURAL rather than guarded. Paired with `D475-anchor-drops-the-printed-scope` (KILLED): the two rows are the two halves of one claim — the ORDER is legibility and the printed SCOPE is behaviour.",
   find=BODY_HEAD,
   replace=("  const bothActivesFirst = ATTACK_COIN_PER_BOTH_ACTIVES_ENERGY.exec(effect);\n"
            "  if (bothActivesFirst !== null) {\n"
            "    const bothActivesPer = Number(bothActivesFirst[1]);\n"
            '    return bothActivesPer >= 1\n'
            '      ? { kind: "perHeads", flips: { kind: "bothActivesEnergy" }, per: bothActivesPer }\n'
            "      : null;\n"
            "  }\n" + BODY_HEAD),
   killers=[SUITE, INPLAY, PER_ENERGY],
   survives=("equivalent",
    "STRUCTURAL disjointness (D468's SECOND kind, the kind that carries NO GUARD — correctly none, because a lookahead here would be unkillable by construction, which D205/D208/D467 call a vacuous guard). All THREE `Flip a coin for each …` anchors are `^…$` over the whole sentence and all three end with the identical run `\\. This attack does (\\d+) damage for each heads\\.$`; the MANDATORY bytes immediately before that run disagree three ways — `…attached to both Active Pokémon` here, `…attached to this Pokémon` at D128, `… you have in play` at D474 — and a string cannot end three ways, so no input reaches two arms and any order computes the identical function. ⚠️ THE DECLARATION IS PREFERRED OVER DELETING THE ROW FOR D427's REASON, AND IT SELF-INVALIDATES: the day any one of the three tails is loosened to admit a sibling's sentence — an optional scope on D128's anchor, a `(?: you have)?` on D474's, an optional `both ` here — two of them overlap, this mutation becomes observable and the row reports STALE-SURVIVOR. ⚠️ AND THE MAINTENANCE OBLIGATION IS THE OPPOSITE OF A GUARDED EQUIVALENCE'S (D467): a guarded one must be re-derived whenever either pattern moves; a structural one cannot be broken without changing the sentence an anchor spells, so this row is the thing that will notice.")),
 dict(id="D475-flip-count-reads-only-the-attacker", file=A,
   what="🛑 THE IMPLEMENTATION-SIDE TWIN OF THE CENTRAL ROW, and the two are NOT the same defect: this one leaves the derived member intact and drops the defender's summand at the FLIP SITE, so every producer-side rung stays green and only a board moves. 9 → 2 on §3's board. The mirror pair in §4 is what makes this and the row below each other's control — one Energy on either side of the table is ONE flip under the real build, 1 and 0 under this one.",
   find=FLIPS,
   replace="      flips = countAttachedEnergy(state, ownActive, null);",
   killers=[SUITE]),
 dict(id="D475-flip-count-reads-only-the-defender", file=A,
   what="The other half of the pair above: the ATTACKER'S summand dropped. 9 → 7 on §3's board, and 1 → 0 on §4's attacker-only board. A suite that drove only the defender-only board would be GREEN under this build, which is exactly why §4 drives both ends of the table on the same count (D445: a mirror board is not a seat inversion).",
   find=FLIPS,
   replace="      flips = foeActive === null ? 0 : countAttachedEnergy(state, foeActive, null);",
   killers=[SUITE]),
 dict(id="D475-flip-count-reads-the-defender-twice", file=A,
   what="`ownActive` resolved off `otherSeat(attackerSeat)`, so BOTH summands read the defender's Active — the seat crossing D447/D454 name as this engine's two worst uncaught defects, in the one shape a commutative sum can still show. ⚠️ CROSSING BOTH ENDS IS NOT WRITTEN AS A ROW, and that is D420's rule applied rather than an omission: `a + b` is commutative, so swapping the two seats outright computes the identical number on every board and the row would express no defect at all.",
   find=OWN,
   replace="      const ownActive = state.players[otherSeat(attackerSeat)].active ?? attacker;",
   killers=[SUITE]),
 dict(id="D475-flip-count-counts-a-printed-type", file=A,
   what="Both calls gain a `\"Fire\"` filter where the printed sentence carries no type word — the narrowing the anchor's own doc block refuses, arriving one layer down at the evaluator. D448's rule is what makes it killable: §3's board holds Fire AND Water on BOTH Actives on purpose, so the filtered answer is 3 against the correct 9. On a single-type board the two would be the same number and this row would survive a suite that looked thorough.",
   find=FLIPS,
   replace=FLIPS.replace(", null)", ', "Fire")'),
   killers=[SUITE]),
 dict(id="D475-flip-count-reads-the-whole-board", file=A,
   what="`countAttachedEnergy` on the two ACTIVES replaced by `countEnergyInPlay` on the two BOARDS — the §6.3 \"in play\" reading, which is the sibling counter `energyOnSelf`'s `zone: \"board\"` arm calls four hundred lines up in this same file, so it is a neighbouring arm's REAL code rather than a straw. The printed subject is two BODIES; benched Energy is invisible to it. 9 → 12 on §3's board, which holds Energy on both Benches for exactly this row.",
   find=FLIPS,
   replace=("      flips =\n"
            "        countEnergyInPlay(state, attackerSeat, null) +\n"
            "        countEnergyInPlay(state, otherSeat(attackerSeat), null);"),
   killers=[SUITE]),
 dict(id="D475-flip-count-counts-units-not-cards", file=A,
   what="`countAttachedEnergy` replaced by `providedEnergy(...).length` — CARDS become UNITS, which is D121's rule (*one Energy card is one Energy however many units it provides*) deleted at the one site that could hide it. ⚠️ IT IS KILLABLE ONLY BECAUSE THE BOARD HOLDS `fix-grassdouble` (D391), the single fixture whose card and unit readings disagree: 9 against 10. Every all-basic board answers the same number under both builds, so the row's own killer depends on a card the fixture list must not \"simplify\" away.",
   find=FLIPS,
   replace=("      flips =\n"
            "        providedEnergy(state, ownActive).length +\n"
            "        (foeActive === null ? 0 : providedEnergy(state, foeActive).length);"),
   killers=[SUITE]),
]

out = []
out.append("  // ── D475 — THE COIN FLIP COUNTED OVER **BOTH ACTIVES** (corpus FILE LINE 231,\n"
           "  //    1 sentence / 1 legal printing). FIFTEEN rows, and the SEAT split is deliberate:\n"
           "  //    NINE producer-side on `effects.ts` (the anchor's four axes, the arm's four) and\n"
           "  //    SIX implementation-side on `attack.ts`'s `takeFlips` case — D453's finding is that\n"
           "  //    a slice's rows are habitually producer-only, and this family's implementation is\n"
           "  //    where the seat lives, so it is where the two worst defect classes of this run\n"
           "  //    (a crossed seat, a dropped summand) actually are.\n")
for r in ROWS:
    out.append("  {")
    out.append(f"    id: {s(r['id'])},")
    out.append('    decision: "D475",')
    out.append(f"    what: {s(r['what'])},")
    if "survives" in r:
        kind, reason = r["survives"]
        out.append("    survives: {")
        out.append(f"      kind: {s(kind)},")
        out.append(f"      reason:\n        {s(reason)},")
        out.append("    },")
    out.append(f"    file: {s(r['file'])},")
    out.append(f"    find: {s(r['find'])},")
    out.append(f"    replace: {s(r['replace'])},")
    out.append(f"    expectKilledBy: [{', '.join(s(k) for k in r['killers'])}],")
    out.append("  },")
block = "\n".join(out) + "\n"

P = "scripts/mutation/mutants.ts"
with open(P, "r", encoding="utf-8") as fh:
    text = fh.read()
TAIL = "\n];\n"
assert text.endswith(TAIL), repr(text[-20:])
new = text[: -len(TAIL)] + "\n" + block + "];\n"
with open(P, "wb") as fh:
    fh.write(new.encode("utf-8"))
print(f"appended {len(ROWS)} rows, {len(text)} -> {len(new)} chars")
