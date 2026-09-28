import json

P = "scripts/mutation/mutants.ts"
orig = open(P, "rb").read()
text = orig.decode("utf-8")

EFF = "packages/engine/src/effects.ts"
ATK = "packages/engine/src/attack.ts"
CON = "packages/engine/src/continuous.ts"

SUITE = "packages/engine/src/inPlayFlipCount.test.ts"
PER_ENERGY = "packages/engine/src/perEnergyFlip.test.ts"
MULTI = "packages/engine/src/multiCoinFlip.test.ts"
COIN = "packages/engine/src/coinFlipDamage.test.ts"
UNTIL = "packages/engine/src/untilTailsFlip.test.ts"
PROG = "packages/engine/src/perHeadsProgram.test.ts"

ANCHOR = "  /^Flip a coin for each ([^.]+) you have in play\\. This attack does (\\d+) damage for each heads\\.$/;"
ARM_RET = ('    return filter !== null && per >= 1\n'
           '      ? { kind: "perHeads", flips: { kind: "pokemonInPlay", filter }, per }\n'
           '      : null;')
ARM_HEAD = ("  const inPlayBodies = ATTACK_COIN_PER_BODY_IN_PLAY.exec(effect);\n"
            "  if (inPlayBodies !== null) {\n"
            "    const per = Number(inPlayBodies[2]);")
PE_ANCHOR = "  /^Flip a coin for each (?:(.+) )?Energy attached to this Pokémon\\. This attack does (\\d+) damage for each heads\\.$/;"
PE_TYPED = ('      const energy = literalClauseRow(CLAUSE_ENERGY_TOKENS, token);\n'
            '      return energy !== undefined && per >= 1\n'
            '        ? { kind: "perHeads", flips: { kind: "attachedEnergy", energy }, per }\n'
            '        : null;')
SW_PRINTED = '    case "printed":\n      flips = count.count;\n      break;'
SW_ENERGY = ('      flips = countAttachedEnergy(\n'
             '        state,\n'
             '        state.players[attackerSeat].active ?? attacker,\n'
             '        count.energy,\n'
             '      );')
SW_BODY = "      flips = countPokemonInPlay(state, attackerSeat, count.filter);"
LOOP = "  for (let flip = 0; flip < flips; flip += 1) {"
LOOP_BODY = "    const [face, next] = flipCoin(rng);\n    faces.push(face);\n    rng = next;"
RET = "  return [faces, rng];"
UT_RET = "    return [faces, rngState];"
CAE_NULL = "  if (energy === null) return pokemon.energy.length;"
CAE_TYPED = "  return pokemon.energy.filter((uid) => providesEnergyType(state, pokemon, uid, energy)).length;"

ROWS = [
# ── A. THE NEW ANCHOR ────────────────────────────────────────────────────────
dict(id="D474-anchor-loses-its-start-anchor", file=EFF, find=ANCHOR,
     replace="  /Flip a coin for each ([^.]+) you have in play\\. This attack does (\\d+) damage for each heads\\.$/;",
     what="the leading `^` goes, so any sentence ENDING with these words is claimed and everything printed in front of it is silently discarded — *\"This attack does 30 damage. Flip a coin for each {D} Pokémon you have in play. …\"* would resolve as the bare fold, spending the printed 30. ⚠️ D452's rule: the probe string varies ONLY the anchor — its prefix ENDS a sentence, so the family's capital `F` is preserved and the case-sensitivity is not doing the refusing. §2 drives it.",
     kills=[SUITE]),
dict(id="D474-anchor-loses-its-end-anchor", file=EFF, find=ANCHOR,
     replace="  /^Flip a coin for each ([^.]+) you have in play\\. This attack does (\\d+) damage for each heads\\./;",
     what="the trailing `$` goes, so any sentence OPENING with these words is claimed and its tail is silently dropped — *\"…for each heads. Then, discard a card.\"* would fold the coins and never discard. D464's rule is why this row and its `^` twin are BOTH written: the two ends fail differently, and only the `^` end's refusal is demonstrable on the loud path once the sentence itself derives.",
     kills=[SUITE]),
dict(id="D474-anchor-widens-the-printed-subject", file=EFF, find=ANCHOR,
     replace="  /^Flip a coin for each ([^.]+) in play\\. This attack does (\\d+) damage for each heads\\.$/;",
     what="🛑 **THE WIDENING D472's RULE SAYS TO MEASURE, INSTALLED AS THE DEFECT.** The printed `you have` goes, which over the whole 640-row column claims the IDENTICAL 1 sentence / 2 printings — a wider anchor that claims the same rows is pure risk. What it costs here is LOUD rather than quiet, and that is the interesting half: `([^.]+)` then captures `{D} Pokémon you have`, which `inPlayBodyFilter` cannot resolve, so the PRINTED sentence stops deriving altogether and the census steps back. §1's widening rung measures the reach; §2's positive control is what reddens.",
     kills=[SUITE]),
# ── B. THE NEW READER ARM ────────────────────────────────────────────────────
dict(id="D474-arm-defaults-the-unresolvable-noun", file=EFF, find=ARM_RET,
     replace=('    return per >= 1\n'
              '      ? { kind: "perHeads", flips: { kind: "pokemonInPlay", filter: filter ?? { kind: "anyPokemon" } }, per }\n'
              '      : null;'),
     what="🛑 THE VOCABULARY GUARD DEFAULTS INSTEAD OF STAYING LOUD. An unresolvable printed noun becomes *every* body in play, so a constructed *\"…for each Ancient Pokémon you have in play.\"* derives to a count over the whole board — D440's exact refusal at a new address: no `cardSchema` column classifies the banner, and a filter that answers a WRONG number forever while `BUILT.attack` steps for it is strictly worse than an unbuilt sentence (D190b/D199 at the instrument layer). §2 drives five unresolvable nouns against the resolvable admission one line above (D424).",
     kills=[SUITE]),
dict(id="D474-arm-drops-the-positive-per-guard", file=EFF, find=ARM_RET,
     replace=('    return filter !== null && per >= 0\n'
              '      ? { kind: "perHeads", flips: { kind: "pokemonInPlay", filter }, per }\n'
              '      : null;'),
     what="the `per >= 1` floor every arm of the coin family carries becomes `>= 0`, so a printed *\"does 0 damage for each heads\"* would spend a flip — and an `rngState` step — to add nothing, while marking the sentence SIMULATED. ⚠️ The two guards on this arm refuse for two DIFFERENT reasons and neither subsumes the other, which is why this row and `D474-arm-defaults-the-unresolvable-noun` both exist.",
     kills=[SUITE]),
dict(id="D474-arm-emits-the-neighbouring-flip-member", file=EFF, find=ARM_RET,
     replace=('    return filter !== null && per >= 1\n'
              '      ? { kind: "perHeads", flips: { kind: "attachedEnergy", energy: null }, per }\n'
              '      : null;'),
     what="🛑 **THE NEAREST WRONG SIBLING, AND THE ROW THIS SLICE'S ATTRIBUTION CONTROL IS BUILT ON (D469 → D470 → D472 → D473, a fifth address).** The arm emits the SHIPPED `attachedEnergy` member — the one the arm directly above it produces — in place of the new one, so the flip count comes off the attacker's Energy pile instead of its bodies in play. **Both census suites stay GREEN under it**: the sentence still reads, `resolvedByAnyReader` is still true, RESIDUE still falls 1/2 and `BUILT.attack` still steps 2. What reddens is §3, on a board built so the two readings answer 7 and 3.",
     kills=[SUITE]),
dict(id="D474-arm-reads-the-noun-from-the-damage-group", file=EFF, find=ARM_HEAD,
     replace=("  const inPlayBodies = ATTACK_COIN_PER_BODY_IN_PLAY.exec(effect);\n"
              "  if (inPlayBodies !== null) {\n"
              "    const per = Number(inPlayBodies[1]);"),
     what="the two capture groups are crossed — `per` is read from the NOUN slot, so `Number(\"{D} Pokémon\")` is `NaN`, `NaN >= 1` is false and the printed sentence falls silently off the built set. D458's rule: a group-index defect COMPILES every way it can be spelled, and this family's pair is loud in one direction (this one) and quiet in the other, so both are worth a row. Its quiet twin is `D474-arm-defaults-the-unresolvable-noun` one field over.",
     kills=[SUITE]),
# ── C. THE `takeFlips` ARM ───────────────────────────────────────────────────
dict(id="D474-flip-count-crosses-the-seat", file=ATK, find=SW_BODY,
     replace="      flips = countPokemonInPlay(state, otherSeat(attackerSeat), count.filter);",
     what="🛑 THE SEAT CROSSING — the count reads the DEFENDER's board, which D447/D454 name as the two worst uncaught defects this run has produced, and which `opcoverage`'s stopping rule is built around. §3's board fields exactly one {D} body on the opponent's side against three on the attacker's, so the mutation answers ONE flip where the real build answers three; both are legal flip counts and both produce plausible damage, so nothing but the row count separates them.",
     kills=[SUITE]),
dict(id="D474-flip-count-drops-the-printed-filter", file=ATK, find=SW_BODY,
     replace='      flips = countPokemonInPlay(state, attackerSeat, { kind: "anyPokemon" });',
     what="the printed `{D}` narrowing is dropped at the FLIP SITE rather than at the anchor, so the derived value is right and the board answer is wrong — the failure D461 calls the QUIET direction, because dropping a narrowing yields a SUPERSET: more flips, more damage, no `ATTACK_EFFECT_SKIPPED` and no count that goes down. §3's board answers 5 under it and 3 under the real build.",
     kills=[SUITE]),
dict(id="D474-flip-count-reads-the-bench-only", file=ATK, find=SW_BODY,
     replace="      flips = benchBodies(state, attackerSeat, count.filter);",
     what="🛑 `benchBodies` INSTEAD OF `countPokemonInPlay` — the sibling walk eight lines up in this same file, which is exactly the mistake a reader who met the Bench trio first would make. §4's §1.2 reading is what refuses it: *\"you have in play\"* is Active + Bench, so the mutation answers 2 where the real build answers 3, and **ZERO on the one-match board where the attacker is the only {D} body** — a printed sentence that flips no coins at all. Two boards, two different wrong answers, which is why §3 and §4 both drive it.",
     kills=[SUITE]),
# ── D. THE COVERAGE DEBT — rows against PRE-EXISTING machinery ───────────────
dict(id="D474-debt-takeflips-attached-energy-reads-the-defender", file=ATK, find=SW_ENERGY,
     replace=('      flips = countAttachedEnergy(\n'
              '        state,\n'
              '        state.players[otherSeat(attackerSeat)].active ?? attacker,\n'
              '        count.energy,\n'
              '      );'),
     what="🛑 **COVERAGE DEBT (D452/D453), NOT THIS SLICE'S ARM.** D128's `attachedEnergy` member counts Energy on the ATTACKER; this crosses it to the defender. Measured with D453's SPAN predicate at the base commit, **ZERO of the 2,142 corpus rows intersected `takeFlips`, the `AttackFlipCount` declaration, `countAttachedEnergy`'s definition or `ATTACK_COIN_PER_ENERGY`** — machinery driven hard by four shipped suites and pinned by nothing, so no green sweep had ever said it discriminates. The killer is deliberately the PRE-EXISTING suite: `perEnergyFlip.test.ts` fields Torkoal on 1 Fire + 2 Water and reads the flip ROW COUNT, which is 1 on the attacker and 0 on the defender.",
     kills=[PER_ENERGY]),
dict(id="D474-debt-takeflips-printed-count-is-a-literal", file=ATK, find=SW_PRINTED,
     replace='    case "printed":\n      flips = 2;\n      break;',
     what="COVERAGE DEBT. D127's `printed` member stops being a parameter and answers the literal the commonest printing carries, so *\"Flip 4 coins.\"* takes two. Killed by the PRE-EXISTING `multiCoinFlip.test.ts` and `coinFlipDamage.test.ts`, which are the suites that own the printed-count family — the point of the row is that nothing in the corpus had ever asked them to prove it.",
     kills=[MULTI, COIN]),
dict(id="D474-debt-takeflips-loop-takes-one-flip-too-many", file=ATK, find=LOOP,
     replace="  for (let flip = 0; flip <= flips; flip += 1) {",
     what="COVERAGE DEBT — the classic off-by-one on the shared flip loop EVERY member reaches. It spends one extra `rngState` step and files one extra `ATTACK_EFFECT_COIN_FLIP` row on every board in the engine, including the ZERO-count board, where it turns *no flip at all* into one. Killed by the PRE-EXISTING `perEnergyFlip.test.ts` (its rngState account recomputes the whole sequence by hand) and `multiCoinFlip.test.ts`.",
     kills=[PER_ENERGY, MULTI]),
dict(id="D474-debt-takeflips-never-advances-the-generator", file=ATK, find=LOOP_BODY,
     replace="    const [face, next] = flipCoin(state.rngState);\n    faces.push(face);\n    rng = next;",
     what="🛑 COVERAGE DEBT, D455's SHAPE. Every flip in a multi-flip sequence draws from the SAME generator state, so the faces are all identical and the board still looks entirely normal — a four-coin attack deals 0 or 4×, never anything between. The write-back at the end is untouched, so the returned state still advances by ONE step. Killed by the PRE-EXISTING `perEnergyFlip.test.ts` and `multiCoinFlip.test.ts`, both of which recompute the sequence face by face rather than counting heads.",
     kills=[PER_ENERGY, MULTI]),
dict(id="D474-debt-takeflips-returns-the-unspent-generator", file=ATK, find=RET,
     replace="  return [faces, state.rngState];",
     what="🛑 COVERAGE DEBT, D455's exact defect at a second consumer. The flips are really taken and really announced, and the generator is handed back UNSPENT — so the next flip in the match replays the same faces and every later shuffle repeats a permutation. **Every board assertion in this repo stays green**: the cards move, the rows are filed, the damage is right. Only a comparison ACROSS the consumption can see it. Killed by the PRE-EXISTING `perEnergyFlip.test.ts` and `multiCoinFlip.test.ts`.",
     kills=[PER_ENERGY, MULTI]),
dict(id="D474-debt-until-tails-returns-the-unspent-generator", file=ATK, find=UT_RET,
     replace="    return [faces, state.rngState];",
     what="COVERAGE DEBT, the same defect on the OTHER return of the same function — D456's rule that a row on one call site is not coverage of the function, applied to a function with two exits. `untilTails` (D129) draws a variable number of faces, so the unspent generator loses MORE state here than on the bounded path. Killed by the PRE-EXISTING `untilTailsFlip.test.ts`.",
     kills=[UNTIL, PROG]),
dict(id="D474-debt-per-energy-anchor-drops-its-optional-filter", file=EFF, find=PE_ANCHOR,
     replace="  /^Flip a coin for each (?:(.+) )Energy attached to this Pokémon\\. This attack does (\\d+) damage for each heads\\.$/;",
     what="COVERAGE DEBT on D128's SHIPPED anchor: the optional type filter becomes MANDATORY, so the two UNTYPED printings (Ambipom `swsh10.5-057`, Bellossom `sv03-003`) fall silently off the built set while the typed one keeps working. The group index is untouched, so nothing downstream compiles differently — this is the direction D442 calls observable (*it cannot DROP a spelling the column carries*). Killed by the PRE-EXISTING `perEnergyFlip.test.ts`.",
     kills=[PER_ENERGY]),
dict(id="D474-debt-per-energy-arm-defaults-an-unresolvable-token", file=EFF, find=PE_TYPED,
     replace=('      const energy = literalClauseRow(CLAUSE_ENERGY_TOKENS, token);\n'
              '      return per >= 1\n'
              '        ? { kind: "perHeads", flips: { kind: "attachedEnergy", energy: energy ?? null }, per }\n'
              '        : null;'),
     what="COVERAGE DEBT on D128's SHIPPED arm, and the twin of this slice's own vocabulary row: an unresolvable printed token collapses into the UNFILTERED reading rather than staying LOUD, so a `{C}` filter — deliberately absent from `ENERGY_TYPE_BY_CODE` because Colorless is the provision fallback for every unauthored Special Energy — would quietly count every attached card. Killed by the PRE-EXISTING `perEnergyFlip.test.ts`, whose *\"unresolvable tokens stay LOUD\"* section is the thing no corpus row had ever asked to prove itself.",
     kills=[PER_ENERGY]),
dict(id="D474-debt-count-attached-energy-unfiltered-counts-specials", file=CON, find=CAE_NULL,
     replace="  if (energy === null) return specialEnergyUids(state, pokemon).length;",
     what="🛑 COVERAGE DEBT on `countAttachedEnergy` itself — the NEIGHBOURING ARM'S REAL CODE COPIED VERBATIM (D190b/D199's rule for what a mutant should be), which is the mistake an author tidying three one-line arms would actually make. The UNFILTERED reading is D121's *cards, not units*; the `\"special\"` reading is a CARD CLASS. On a mixed pile the two disagree, and the disagreement is exactly what `perEnergyFlip.test.ts`'s three-readings-of-one-pile section was written for — a section that, until this row, no sweep had ever shown to discriminate.",
     kills=[PER_ENERGY]),
dict(id="D474-debt-count-attached-energy-typed-arm-drops-provision", file=CON, find=CAE_TYPED,
     replace="  return pokemon.energy.length;",
     what="COVERAGE DEBT on `countAttachedEnergy`'s third arm: the TYPED count stops asking `providesEnergyType` and answers the whole pile, so a `{R}` clause counts a Water card. This is the D118 provision rule deleted, and it is the same shape as `D474-flip-count-drops-the-printed-filter` one layer down — the QUIET direction, a superset, more damage and no loud row. Killed by the PRE-EXISTING `perEnergyFlip.test.ts`, whose Torkoal board answers 1 flip against the mutation's 3.",
     kills=[PER_ENERGY]),
]

SURVIVOR = dict(
    id="D474-body-arm-moves-ahead-of-the-energy-one",
    file=EFF,
    find=("  const perEnergy = ATTACK_COIN_PER_ENERGY.exec(effect);\n  if (perEnergy !== null) {"),
    replace=("  const bodiesFirst = ATTACK_COIN_PER_BODY_IN_PLAY.exec(effect);\n"
             "  if (bodiesFirst !== null) {\n"
             "    const bodyPer = Number(bodiesFirst[2]);\n"
             "    const bodyFilter = inPlayBodyFilter(bodiesFirst[1] ?? \"\");\n"
             "    return bodyFilter !== null && bodyPer >= 1\n"
             "      ? { kind: \"perHeads\", flips: { kind: \"pokemonInPlay\", filter: bodyFilter }, per: bodyPer }\n"
             "      : null;\n"
             "  }\n"
             "  const perEnergy = ATTACK_COIN_PER_ENERGY.exec(effect);\n  if (perEnergy !== null) {"),
    what=("THE NEW BODY ARM IS HOISTED AHEAD OF D128's ENERGY ARM. Written to test the placement claim in "
          "`ATTACK_COIN_PER_BODY_IN_PLAY`'s block: that the ORDER of these two arms is LEGIBILITY, because the "
          "disjointness is STRUCTURAL rather than guarded. Paired with `D474-anchor-widens-the-printed-subject` "
          "(KILLED), the two rows are the two halves of one claim — the ORDER is legibility and the printed "
          "SUBJECT is behaviour."),
    kills=[SUITE, PER_ENERGY],
    survives=dict(
        kind="equivalent",
        reason=("The two anchors are STRUCTURALLY disjoint (D468's SECOND kind, and the kind that carries NO GUARD "
                "— correctly none, because a lookahead here would be unkillable by construction, which D205/D208/D467 "
                "call a vacuous guard). Both are `^…$` over the whole sentence and both end with the identical run "
                "`\\. This attack does (\\d+) damage for each heads\\.$`; the MANDATORY bytes immediately before that run "
                "disagree — `… you have in play` here, `…Energy attached to this Pokémon` there — and a string cannot "
                "end two ways, so no input reaches both arms and either order computes the identical function. "
                "⚠️ THE DECLARATION IS PREFERRED OVER DELETING THE ROW FOR D427's REASON, AND ITS TRIGGER IS THE EDIT "
                "A SUCCESSOR IS ACTUALLY LIKELY TO MAKE: corpus file line 231 (*\"Flip a coin for each Energy attached "
                "to both Active Pokémon.\"*) is the next row in this family, and the moment either pattern's tail is "
                "loosened to admit it — an optional scope on the Energy anchor, or a `(?: you have)?` on this one — the "
                "two overlap, this mutation becomes observable and the row reports STALE-SURVIVOR. ⚠️ AND THE MAINTENANCE "
                "OBLIGATION IS THE OPPOSITE OF A GUARDED EQUIVALENCE'S (D467): a guarded one must be re-derived whenever "
                "either pattern moves; a structural one cannot be broken without changing the sentence an anchor spells, "
                "so this row is the thing that will notice."),
    ),
)


def emit(row):
    out = ["  {"]
    out.append(f"    id: {json.dumps(row['id'])},")
    out.append('    decision: "D474",')
    out.append(f"    what: {json.dumps(row['what'], ensure_ascii=False)},")
    if "survives" in row:
        out.append("    survives: {")
        out.append(f"      kind: {json.dumps(row['survives']['kind'])},")
        out.append("      reason:")
        out.append(f"        {json.dumps(row['survives']['reason'], ensure_ascii=False)},")
        out.append("    },")
    out.append(f"    file: {json.dumps(row['file'])},")
    out.append(f"    find: {json.dumps(row['find'], ensure_ascii=False)},")
    out.append(f"    replace: {json.dumps(row['replace'], ensure_ascii=False)},")
    out.append("    expectKilledBy: [" + ", ".join(json.dumps(k) for k in row["kills"]) + "],")
    out.append("  },")
    return "\n".join(out)

HEADER = (
"  // ── D474 — THE BOARD-COUNTED COIN FLIP OVER BODIES. Twenty rows, and the SHAPE of\n"
"  //    the set is the point: TEN are on this slice's own anchor, arm and `takeFlips`\n"
"  //    case, and TEN pay a COVERAGE DEBT on machinery that was already there.\n"
"  //\n"
"  //    🛑 THE DEBT, MEASURED WITH D453's SPAN PREDICATE AT THE BASE COMMIT: of 2,142\n"
"  //    corpus rows, **ZERO** intersected `takeFlips`'s body, the `AttackFlipCount`\n"
"  //    declaration, `countAttachedEnergy`'s definition, `ATTACK_COIN_PER_ENERGY`'s\n"
"  //    declaration or its reader arm. ⚠️ THE BRIEF THAT COMMISSIONED THIS SLICE SAID\n"
"  //    \"ZERO test rungs AND ZERO mutant rows\", AND ONLY THE SECOND HALF IS TRUE:\n"
"  //    `perEnergyFlip.test.ts` (1,668 lines), `multiCoinFlip.test.ts`,\n"
"  //    `coinFlipDamage.test.ts` and `untilTailsFlip.test.ts` drive every one of these\n"
"  //    lines hard, on real boards. What was missing was any evidence that they\n"
"  //    DISCRIMINATE — D452's rule that a family with no rows is indistinguishable\n"
"  //    from a family that passes. So the ten debt rows deliberately name the\n"
"  //    PRE-EXISTING suites as their killers, never this slice's own.\n"
"  //\n"
"  //    A slice that adds a fourth member to an unpinned union and pins only its own\n"
"  //    arm has made the union harder to change, not easier.\n")

marker = "];\n"
assert text.endswith(marker), "corpus does not end as expected"
body = HEADER + "\n".join(emit(r) for r in ROWS) + "\n" + emit(SURVIVOR) + "\n"
out = text[: -len(marker)] + body + marker
payload = out.encode("utf-8")
with open(P, "wb") as fh:
    fh.write(payload)
now = open(P, "rb").read()
print("before", len(orig), "after", len(now), "delta", len(now) - len(orig))
print("rows added:", len(ROWS) + 1)
