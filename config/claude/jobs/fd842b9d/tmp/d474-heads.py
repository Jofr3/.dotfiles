NOTE = (" // \U0001f195\U0001f195 D474 +1 sentence / +2 printings (THE BOARD-COUNTED COIN FLIP OVER BODIES — "
        "`censusAttackCorpus.ts` **FILE LINE 233**, *\"Flip a coin for each {D} Pokémon you have in play. "
        "This attack does 60 damage for each heads.\"*, **1 sentence / 2 legal printings**, claimed WHOLE by "
        "`deriveAttackCoinFlip` through ONE new anchor and ONE new `AttackFlipCount` member `pokemonInPlay`. "
        "⚠️ **THIS IS A LIVE HEAD, NOT A FROZEN TAIL** (D461/D462): the literal moves and there is no "
        "front term to add. ⚠️ **AND THE TWO UNITS DISAGREE, 1 AND 2** — the opposite of D473's "
        "2-and-2 — so the number here was read off THIS assertion's head rather than copied from a sibling "
        "site. RAW summand ALONE: no registry row, no gate split, no trailing split, D464's compound route "
        "measured EMPTY, reader surface still 13.)")

SITES = [
    ("packages/engine/src/benchNamedBonus.test.ts", 842, "expect(resolved).toHaveLength(505);", "expect(resolved).toHaveLength(506);"),
    ("packages/engine/src/censusAtHead.test.ts", 4231, "expect(built).toBe(1985);", "expect(built).toBe(1987);"),
    ("packages/engine/src/censusAtHead.test.ts", 6283, "expect(unbuiltAttack).toBe(152);", "expect(unbuiltAttack).toBe(150);"),
    ("packages/engine/src/censusAtHead.test.ts", 8147, "const RAW_UNBUILT_ATTACK_UNITS = 202;", "const RAW_UNBUILT_ATTACK_UNITS = 200;"),
    ("packages/engine/src/censusAtHead.test.ts", 8304, "expect(resolved.length).toBe(505);", "expect(resolved.length).toBe(506);"),
    ("packages/engine/src/compoundCompose.test.ts", 612, "expect(claimedWhole).toHaveLength(181);", "expect(claimedWhole).toHaveLength(182);"),
    ("packages/engine/src/compoundCompose.test.ts", 622, "expect(units(claimedWhole)).toBe(470);", "expect(units(claimedWhole)).toBe(472);"),
    ("packages/engine/src/defenderStatusTriple.test.ts", 532, "toEqual([505, 1530]);", "toEqual([506, 1532]);"),
    ("packages/engine/src/exOnlyActive.test.ts", 190, "expect(resolved).toHaveLength(505);", "expect(resolved).toHaveLength(506);"),
    ("packages/engine/src/flipStatusEnergyDiscard.test.ts", 559, "toEqual([505, 1530]);", "toEqual([506, 1532]);"),
    ("packages/engine/src/inPlayTypeBonus.test.ts", 628, "toEqual([505, 1530]);", "toEqual([506, 1532]);"),
    ("packages/engine/src/moreEnergyBonus.test.ts", 618, "expect(resolved).toHaveLength(505);", "expect(resolved).toHaveLength(506);"),
    ("packages/engine/src/opponentBenchCount.test.ts", 691, "toEqual([505, 1530]);", "toEqual([506, 1532]);"),
    ("packages/engine/src/perHeadsEnergyDiscard.test.ts", 648, "toEqual([505, 1530]);", "toEqual([506, 1532]);"),
    ("packages/engine/src/precociousEvolution.test.ts", 548, "expect(rawHead).toBe(1530);", "expect(rawHead).toBe(1532);"),
    ("packages/engine/src/retreatCostBonus.test.ts", 800, "toEqual([505, 1530]);", "toEqual([506, 1532]);"),
    ("packages/engine/src/sameEnergyBonus.test.ts", 808, "expect(resolved).toHaveLength(505);", "expect(resolved).toHaveLength(506);"),
    ("packages/engine/src/sawkRequirementSplit.test.ts", 249, "expect(resolved).toHaveLength(505);", "expect(resolved).toHaveLength(506);"),
    ("packages/engine/src/selfDamagePerCounter.test.ts", 185, "toEqual([505, 1530]);", "toEqual([506, 1532]);"),
]

by_file = {}
for f, ln, old, new in SITES:
    by_file.setdefault(f, []).append((ln, old, new))

count = 0
for f, entries in by_file.items():
    lines = open(f, encoding="utf-8").read().split("\n")
    for ln, old, new in entries:
        line = lines[ln - 1]
        occ = line.count(old)
        assert occ == 1, f"{f}:{ln} old occurs {occ}x: {old!r}"
        lines[ln - 1] = line.replace(old, new + NOTE, 1)
        count += 1
    with open(f, "wb") as fh:
        fh.write("\n".join(lines).encode("utf-8"))
    print("patched", f, len(entries))
print("LIVE HEADS STEPPED:", count)
