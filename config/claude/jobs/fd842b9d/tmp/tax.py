# -*- coding: utf-8 -*-
import io, sys, os
os.chdir("/home/jofre/projects/luminous_ui")
NEW = "\U0001f195\U0001f195"

NOTE = (
    NEW + " D476 +1 sentence / +1 printing — THE FACE AXIS, THE LAST OPEN AXIS OF THE PRINTED "
    "PER-FACE FAMILY — `censusAttackCorpus.ts` **FILE LINE 217**, *\"Flip 3 coins. For each tails, "
    "discard an Energy from this Pokémon.\"*, **1 sentence / 1 legal printing**, claimed WHOLE by "
    "`deriveAttackCoinFlip` through ONE new anchor (`ATTACK_COIN_SELF_ENERGY_PER_TAILS`) and ONE "
    "**REQUIRED** `face: CoinFace` FIELD on the shipped `programPerHeads` member. ⚠️ **THE SENTENCE "
    "STEP AND THE PRINTING STEP AGREE AT 1 AND 1** — D472's disagreed at 1 and 2, D473's agreed at 2 "
    "and 2, D474's disagreed at 1 and 2, D475's agreed at 1 and 1 — so this term was DERIVED at this "
    "head and not carried from the previous slice (D451/D461/D464). RAW summand ALONE: no registry row, "
    "no gate split, no trailing split, reader surface still 13, and **ZERO new `FIXTURE_POOL` ids** "
    "(file-local `cardPool`, D414), so every id ladder takes a ZERO term. ZERO new `EffectOp` members, "
    "op FIELDS, op VALUES, prompts, events, error codes or `AttackCoinFlip` MEMBERS — the op is "
    "`SELF_DISCARD_ONE`'s output byte for byte, and the FACE rides the member that already shipped."
)

CHAIN_NOTE = (
    NEW + " **D476 — A `- 1` TERM FRONT-INSERTED AHEAD OF D475's, AND THE FROZEN ENDPOINT IS "
    "UNTOUCHED (D426/D437/D461/D462).** (" + NOTE + ")"
)

def read(p):
    return io.open(p, encoding="utf-8").read()

def write(p, s):
    payload = s.encode("utf-8")
    with open(p, "wb") as f:
        f.write(payload)

# ── live heads: (file, exact assertion prefix ending in the literal + ");", new literal) ──
HEADS = [
    ("packages/engine/src/censusAtHead.test.ts", "  attack: 1583,", "  attack: 1584,"),
    ("packages/engine/src/censusAtHead.test.ts", "    expect(built).toBe(1988);", "    expect(built).toBe(1989);"),
    ("packages/engine/src/censusAtHead.test.ts", "    expect(units - built).toBe(395);", "    expect(units - built).toBe(394);"),
    ("packages/engine/src/censusAtHead.test.ts", "    expect(unbuiltAttack).toBe(149);", "    expect(unbuiltAttack).toBe(148);"),
    ("packages/engine/src/censusAtHead.test.ts", "    expect(rawUnbuiltSentences.length).toBe(133);", "    expect(rawUnbuiltSentences.length).toBe(132);"),
    ("packages/engine/src/censusAtHead.test.ts", "    expect(residueSentences.length).toBe(107);", "    expect(residueSentences.length).toBe(106);"),
    ("packages/engine/src/censusAtHead.test.ts", "const RAW_UNBUILT_ATTACK_UNITS = 199;", "const RAW_UNBUILT_ATTACK_UNITS = 198;"),
    ("packages/engine/src/censusAtHead.test.ts", "    expect(resolved.length).toBe(507);", "    expect(resolved.length).toBe(508);"),
    ("packages/engine/src/censusAtHead.test.ts", "    expect(resolved.reduce((sum, [units]) => sum + units, 0)).toBe(1533);", "    expect(resolved.reduce((sum, [units]) => sum + units, 0)).toBe(1534);"),
    ("packages/engine/src/sawkRequirementSplit.test.ts", "    expect(resolved).toHaveLength(507);", "    expect(resolved).toHaveLength(508);"),
    ("packages/engine/src/sawkRequirementSplit.test.ts", "    expect(p(resolved)).toBe(1533);", "    expect(p(resolved)).toBe(1534);"),
    ("packages/engine/src/sawkRequirementSplit.test.ts", "    expect(residue).toHaveLength(133);", "    expect(residue).toHaveLength(132);"),
    ("packages/engine/src/sawkRequirementSplit.test.ts", "    expect(p(residue)).toBe(199);", "    expect(p(residue)).toBe(198);"),
    ("packages/engine/src/exOnlyActive.test.ts", "    expect(resolved).toHaveLength(507);", "    expect(resolved).toHaveLength(508);"),
    ("packages/engine/src/exOnlyActive.test.ts", "    expect(resolvedP).toBe(1533);", "    expect(resolvedP).toBe(1534);"),
    ("packages/engine/src/exOnlyActive.test.ts", "    expect(residue).toHaveLength(133);", "    expect(residue).toHaveLength(132);"),
    ("packages/engine/src/exOnlyActive.test.ts", "    expect(residueP).toBe(199);", "    expect(residueP).toBe(198);"),
    ("packages/engine/src/retreatCostBonus.test.ts", "    expect([resolving.length, units(resolving)]).toEqual([507, 1533]);", "    expect([resolving.length, units(resolving)]).toEqual([508, 1534]);"),
    ("packages/engine/src/opponentBenchCount.test.ts", "    expect([resolving.length, units(resolving)]).toEqual([507, 1533]);", "    expect([resolving.length, units(resolving)]).toEqual([508, 1534]);"),
    ("packages/engine/src/inPlayTypeBonus.test.ts", "    expect([resolving.length, units(resolving)]).toEqual([507, 1533]);", "    expect([resolving.length, units(resolving)]).toEqual([508, 1534]);"),
    ("packages/engine/src/sameEnergyBonus.test.ts", "    expect(resolved).toHaveLength(507);", "    expect(resolved).toHaveLength(508);"),
    ("packages/engine/src/sameEnergyBonus.test.ts", "    expect(units(resolved)).toBe(1533);", "    expect(units(resolved)).toBe(1534);"),
    ("packages/engine/src/moreEnergyBonus.test.ts", "    expect(resolved).toHaveLength(507);", "    expect(resolved).toHaveLength(508);"),
    ("packages/engine/src/moreEnergyBonus.test.ts", "    expect(units(resolved)).toBe(1533);", "    expect(units(resolved)).toBe(1534);"),
    ("packages/engine/src/benchNamedBonus.test.ts", "    expect(resolved).toHaveLength(507);", "    expect(resolved).toHaveLength(508);"),
    ("packages/engine/src/benchNamedBonus.test.ts", "    expect(units(resolved)).toBe(1533);", "    expect(units(resolved)).toBe(1534);"),
    ("packages/engine/src/precociousEvolution.test.ts", "    expect(rawHead).toBe(1533);", "    expect(rawHead).toBe(1534);"),
    ("packages/engine/src/precociousEvolution.test.ts", "    expect(head).toBe(1583);", "    expect(head).toBe(1584);"),
    ("packages/engine/src/selfDamagePerCounter.test.ts", "    expect([resolved.length, units(resolved)]).toEqual([507, 1533]);", "    expect([resolved.length, units(resolved)]).toEqual([508, 1534]);"),
    ("packages/engine/src/selfDamagePerCounter.test.ts", "    expect([without.length, units(without)]).toEqual([506, 1532]);", "    expect([without.length, units(without)]).toEqual([507, 1533]);"),
    ("packages/engine/src/perHeadsEnergyDiscard.test.ts", "    expect([resolved.length, units(resolved)]).toEqual([507, 1533]);", "    expect([resolved.length, units(resolved)]).toEqual([508, 1534]);"),
    ("packages/engine/src/perHeadsEnergyDiscard.test.ts", "    expect([without.length, units(without)]).toEqual([505, 1531]);", "    expect([without.length, units(without)]).toEqual([506, 1532]);"),
    ("packages/engine/src/flipStatusEnergyDiscard.test.ts", "    expect([resolved.length, units(resolved)]).toEqual([507, 1533]);", "    expect([resolved.length, units(resolved)]).toEqual([508, 1534]);"),
    ("packages/engine/src/flipStatusEnergyDiscard.test.ts", "    expect([without.length, units(without)]).toEqual([506, 1531]);", "    expect([without.length, units(without)]).toEqual([507, 1532]);"),
    ("packages/engine/src/defenderStatusTriple.test.ts", "    expect([resolved.length, units(resolved)]).toEqual([507, 1533]);", "    expect([resolved.length, units(resolved)]).toEqual([508, 1534]);"),
    ("packages/engine/src/defenderStatusTriple.test.ts", "    expect([withoutOxford.length, units(withoutOxford)]).toEqual([506, 1531]);", "    expect([withoutOxford.length, units(withoutOxford)]).toEqual([507, 1532]);"),
]

by_file = {}
for p, old, new in HEADS:
    by_file.setdefault(p, []).append((old, new))

total = 0
for p, pairs in by_file.items():
    s = read(p)
    for old, new in pairs:
        marker = old + " // ("
        c = s.count(marker)
        if c != 1:
            print("!! HEAD count %d for %r in %s" % (c, old, p)); sys.exit(1)
        s = s.replace(marker, new + " // (" + NOTE + ") // (")
        total += 1
    write(p, s)
    print("head-ok", p, len(pairs))
print("live heads stepped:", total)
