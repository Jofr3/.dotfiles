NOTE = (" // \U0001f195\U0001f195 D474 +1 sentence / +2 printings (THE BOARD-COUNTED COIN FLIP OVER BODIES — "
        "`censusAttackCorpus.ts` **FILE LINE 233**, **1 sentence / 2 legal printings**, claimed WHOLE by "
        "`deriveAttackCoinFlip`. ⚠️ **FOUND ON THE SECOND `check` ROUND, BEHIND A SITE THAT THREW FIRST** "
        "— D462's rule: vitest stops an `it` at its first throw, so a spelling-keyed pass is always short. "
        "The head name was read at THIS site rather than copied from the sibling above it.)")

SITES = [
    ("packages/engine/src/benchNamedBonus.test.ts", 854, "expect(units(resolved)).toBe(1530);", "expect(units(resolved)).toBe(1532);"),
    ("packages/engine/src/censusAtHead.test.ts", 4361, "expect(units - built).toBe(398);", "expect(units - built).toBe(396);"),
    ("packages/engine/src/censusAtHead.test.ts", 6339, "expect(rawUnbuiltSentences.length).toBe(135);", "expect(rawUnbuiltSentences.length).toBe(134);"),
    ("packages/engine/src/censusAtHead.test.ts", 8321, "expect(resolved.reduce((sum, [units]) => sum + units, 0)).toBe(1530);", "expect(resolved.reduce((sum, [units]) => sum + units, 0)).toBe(1532);"),
    ("packages/engine/src/defenderStatusTriple.test.ts", 546, "toEqual([504, 1528]);", "toEqual([505, 1530]);"),
    ("packages/engine/src/exOnlyActive.test.ts", 202, "expect(resolvedP).toBe(1530);", "expect(resolvedP).toBe(1532);"),
    ("packages/engine/src/flipStatusEnergyDiscard.test.ts", 565, "toEqual([504, 1528]);", "toEqual([505, 1530]);"),
    ("packages/engine/src/moreEnergyBonus.test.ts", 630, "expect(units(resolved)).toBe(1530);", "expect(units(resolved)).toBe(1532);"),
    ("packages/engine/src/perHeadsEnergyDiscard.test.ts", 654, "toEqual([503, 1528]);", "toEqual([504, 1530]);"),
    ("packages/engine/src/precociousEvolution.test.ts", 635, "expect(head).toBe(1580);", "expect(head).toBe(1582);"),
    ("packages/engine/src/sameEnergyBonus.test.ts", 820, "expect(units(resolved)).toBe(1530);", "expect(units(resolved)).toBe(1532);"),
    ("packages/engine/src/sawkRequirementSplit.test.ts", 261, "expect(p(resolved)).toBe(1530);", "expect(p(resolved)).toBe(1532);"),
    ("packages/engine/src/selfDamagePerCounter.test.ts", 190, "toEqual([504, 1529]);", "toEqual([505, 1531]);"),
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
print("ROUND-2 LIVE HEADS STEPPED:", count)
