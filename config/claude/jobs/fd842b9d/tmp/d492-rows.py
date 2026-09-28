import json, os

ROWS = [
    dict(
        id="D492-anchor-loses-its-caret",
        decision="D492",
        what="🛑 THE ANCHOR STOPS BEING WHOLE-SENTENCE AT THE `^` END. Without it a leading clause is swallowed and the spread fires off a sentence whose head nobody read — D464's `^`-end failure, which stays on the LOUD path in the real build and silently resolves under the mutant. §3 drives `Draw a card. <the printed row>`",
        file="packages/engine/src/effects.ts",
        find="  `^This attack does (\\\\d+) damage to each of your opponent['’]s (${SPREAD_EACH_CLASS_NOUNS.join(",
        replace="  `This attack does (\\\\d+) damage to each of your opponent['’]s (${SPREAD_EACH_CLASS_NOUNS.join(",
        expectKilledBy=["packages/engine/src/classedBoardSpread.test.ts"],
    ),
    dict(
        id="D492-anchor-loses-its-terminator",
        decision="D492",
        what="🛑 THE `$` END GOES, so `<the printed row> Draw a card.` resolves into a program that damages four bodies off a sentence half of which nobody read. ⚠️ D464's asymmetry is exactly why this row exists and its `^` twin is not enough: a `$`-end overreach cannot be demonstrated on the loud path once the head derives, so it needs a rung of its own",
        file="packages/engine/src/effects.ts",
        find="  )})\\\\. This attack['’]s damage isn['’]t affected by Weakness or Resistance\\\\.$`,",
        replace="  )})\\\\. This attack['’]s damage isn['’]t affected by Weakness or Resistance\\\\.`,",
        expectKilledBy=["packages/engine/src/classedBoardSpread.test.ts"],
    ),
    dict(
        id="D492-anchor-takes-the-parenthetical-tail-instead",
        decision="D492",
        what="🛑 THE W/R SENTENCE IS SWAPPED FOR D482's PARENTHETICAL — the neighbouring anchor's real bytes, copied verbatim, which is the mistake an author writing this family actually makes. Both printed rows stop deriving and the residue goes back up by 2 / 4. ⚠️ **THIS IS THE ROW THAT SAYS THE TAIL IS A BLOCKER**: the residue classifier calls both rows `COMPOUND-tail` and the work order read that as *the head is the whole of it*",
        file="packages/engine/src/effects.ts",
        find="  )})\\\\. This attack['’]s damage isn['’]t affected by Weakness or Resistance\\\\.$`,",
        replace="  )})\\\\.(?: \\\\(Don['’]t apply Weakness and Resistance for Benched Pokémon\\\\.\\\\))?$`,",
        expectKilledBy=["packages/engine/src/classedBoardSpread.test.ts"],
    ),
    dict(
        id="D492-shortlist-widens-to-the-whole-map",
        decision="D492",
        what="🛑 THE TWO-KEY SHORTLIST BECOMES THE WHOLE `IN_PLAY_BODY_NOUNS` VOCABULARY. Measured over all 640 corpus rows it claims the SAME 2 sentences / 4 printings, so no census, no residue figure and no printed board can see it — D472's *a wider anchor that claims the same rows is pure risk* with the risk made executable. The only thing that reddens is the §2 rung that pins the six extra keys as refused HERE, which is why that rung exists",
        file="packages/engine/src/effects.ts",
        find='const SPREAD_EACH_CLASS_NOUNS: readonly string[] = ["Pokémon ex and Pokémon V", "Pokémon ex"];',
        replace="const SPREAD_EACH_CLASS_NOUNS: readonly string[] = [...IN_PLAY_BODY_NOUNS.keys()].sort(\n  (a, b) => b.length - a.length,\n);",
        expectKilledBy=["packages/engine/src/classedBoardSpread.test.ts"],
    ),
    dict(
        id="D492-arm-drops-the-ignorewr",
        decision="D492",
        what="🛑 THE HIT GOES BACK THROUGH WEAKNESS AND RESISTANCE, which is `damageDefender`'s flat arm's reading and therefore what D482's COMPOSITION would have done. The printed sentence says the opposite. Every benched body answers the same number either way — §8.5 scopes W/R to the Active — so the ONLY board that can see it is one whose Active matches the filter AND carries a Weakness, which is §4's",
        file="packages/engine/src/effects.ts",
        find="          deals: true,\n          ignoreWR: true,\n          filter: classFilter,",
        replace="          deals: true,\n          filter: classFilter,",
        expectKilledBy=["packages/engine/src/classedBoardSpread.test.ts"],
    ),
    dict(
        id="D492-arm-places-counters-instead-of-damage",
        decision="D492",
        what="🛑 `deals` GOES, so the sweep files `COUNTERS_PLACED` and becomes `counterEachAll`'s damage model — the composition D483 §1 named, priced and refused. ⚠️ **THE BOARD CANNOT TELL**: under `ignoreWR` the reduction passives that would normally separate a placed counter from attack damage are nulled anyway, so §8 drives a Rock Chestplate holder reading 100 under BOTH builds and the discriminator is the EVENT, not the number",
        file="packages/engine/src/effects.ts",
        find="          deals: true,\n          ignoreWR: true,\n          filter: classFilter,",
        replace="          ignoreWR: true,\n          filter: classFilter,",
        expectKilledBy=["packages/engine/src/classedBoardSpread.test.ts"],
    ),
    dict(
        id="D492-arm-targets-the-bench-only",
        decision="D492",
        what="🛑 THE SCOPE COLLAPSES TO THE BENCH — arm 6b's real value one screen down, copied verbatim. The printed *each of your opponent's Pokémon ex* includes the Active when the Active is one, and this is the half of the sentence D482's `spreadDamage` leg could not have reached either. Every benched body still takes the printed number, so a suite that only read the bench would be green",
        file="packages/engine/src/effects.ts",
        find='          op: "damageChosen",\n          target: "opponentAny",\n          amount,\n          count: "all",',
        replace='          op: "damageChosen",\n          target: "opponentBench",\n          amount,\n          count: "all",',
        expectKilledBy=["packages/engine/src/classedBoardSpread.test.ts"],
    ),
    dict(
        id="D492-arm-arity-back-to-one",
        decision="D492",
        what='🛑 THE PRINTED *"each of"* BECOMES *"1 of"* — the literal `CHOSEN_ANY_TARGET` has carried since D400, and the byte a v29 record really holds. The attack stops damaging four bodies and PARKS asking which one, which is a different action shape rather than a different number: `phase.kind` becomes `effect:choose` and `EFFECT_PENDING` fires. This is the row §9\'s version argument rests on from the other end',
        file="packages/engine/src/effects.ts",
        find='          target: "opponentAny",\n          amount,\n          count: "all",\n          source: "attack",',
        replace='          target: "opponentAny",\n          amount,\n          count: 1,\n          source: "attack",',
        expectKilledBy=["packages/engine/src/classedBoardSpread.test.ts"],
    ),
    dict(
        id="D492-arm-drops-the-class-filter",
        decision="D492",
        what="🛑 THE PRINTED CLASS NARROWING GOES AND THE SPREAD HITS EVERY BODY ON THE SIDE — which is exactly D482's shipped row, so the mutant is a REAL neighbouring program rather than a straw. The one assertion that separates them is the no-rule-box benched body taking ZERO; every other number on the board is identical",
        file="packages/engine/src/effects.ts",
        find="          ignoreWR: true,\n          filter: classFilter,\n        },",
        replace="          ignoreWR: true,\n        },",
        expectKilledBy=["packages/engine/src/classedBoardSpread.test.ts"],
    ),
    dict(
        id="D492-noun-resolver-hardcodes-the-singleton",
        decision="D492",
        what='🛑 THE MAP LOOKUP STOPS READING THE CAPTURE AND ALWAYS ANSWERS `Pokémon ex`, so the printed PAIR noun silently loses its `V` half — the `anyOf` collapsing to its first member, which is `D446-pair-noun-drops-the-second-suffix`\'s defect at a second address. Both rows still derive, both still hit the Active and both still hit every benched `ex`; only the `V` body moves',
        file="packages/engine/src/effects.ts",
        find='    const classFilter = IN_PLAY_BODY_NOUNS.get(match[2] ?? "");',
        replace='    const classFilter = IN_PLAY_BODY_NOUNS.get("Pokémon ex");',
        expectKilledBy=["packages/engine/src/classedBoardSpread.test.ts"],
    ),
    dict(
        id="D492-arm-drops-the-amount-guard",
        decision="D492",
        what='🛑 THE PRINTED-ZERO GUARD GOES. A `does 0 damage` spelling resolves into a program that walks the whole filtered side and places nothing, instead of falling to the loud `ATTACK_EFFECT_SKIPPED` path — D190b\'s exact-map-or-flag rule at the amount rather than at the noun, and `BENCHED_SNIPE_TAKEN_PRIZES`\' own `per >= 1` reading one arm down',
        file="packages/engine/src/effects.ts",
        find="    if (amount >= 1 && classFilter !== undefined) {",
        replace="    if (classFilter !== undefined) {",
        expectKilledBy=["packages/engine/src/classedBoardSpread.test.ts"],
    ),
    dict(
        id="D492-interpreter-ceiling-is-one",
        decision="D492",
        what='🛑 THE INTERPRETER STOPS HONOURING `"all"` AND READS IT AS AN ARITY OF ONE. The op then parks over four candidates exactly as a v29 `count: 1` would — so this is the IMPLEMENTATION-side twin of `D492-arm-arity-back-to-one`, and the pair is what says the widening is honoured at BOTH seats (D453: an op-name grep finds a producer row and calls the family covered)',
        file="packages/engine/src/interpreter.ts",
        find='      const ceiling = op.count === "all" ? candidates.length : op.count;',
        replace='      const ceiling = op.count === "all" ? 1 : op.count;',
        expectKilledBy=["packages/engine/src/classedBoardSpread.test.ts"],
    ),
]

p = "/home/jofre/projects/luminous_ui/scripts/mutation/mutants.ts"
t = open(p, encoding="utf-8").read()
assert t.rstrip().endswith("];")

def lit(s: str) -> str:
    return json.dumps(s, ensure_ascii=False)

out = []
for r in ROWS:
    out.append("  {")
    out.append(f"    id: {lit(r['id'])},")
    out.append(f"    decision: {lit(r['decision'])},")
    out.append(f"    what: {lit(r['what'])},")
    out.append(f"    file: {lit(r['file'])},")
    out.append(f"    find: {lit(r['find'])},")
    out.append(f"    replace: {lit(r['replace'])},")
    out.append("    expectKilledBy: [")
    for k in r["expectKilledBy"]:
        out.append(f"      {lit(k)},")
    out.append("    ],")
    out.append("  },")
block = "\n".join(out) + "\n"

idx = t.rstrip().rfind("];")
t2 = t.rstrip()[:idx] + block + "];\n"
open(p, "wb").write(t2.encode("utf-8"))
print(f"appended {len(ROWS)} rows; {len(t)} -> {len(t2)} bytes")
