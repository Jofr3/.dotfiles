import json
NEW = "\U0001f195\U0001f195"
N = (f"({NEW} D475 +1 sentence / +1 printing — THE COIN FLIP COUNTED OVER BOTH ACTIVES, "
     "`censusAttackCorpus.ts` **FILE LINE 231**, claimed WHOLE by `deriveAttackCoinFlip`. "
     "⚠️ FOUND ON THE SECOND `check` ROUND, BEHIND A SITE IN THE SAME `it` THAT THREW FIRST — "
     "D462's rule: vitest stops an `it` at its first throw, so a spelling-keyed pass is always "
     "short and the round count is the measurement.)")

def edit(path, subs):
    with open(path, "r", encoding="utf-8") as fh:
        t = fh.read()
    for a, b in subs:
        assert t.count(a) == 1, f"{path}: {a!r} x{t.count(a)}"
        t = t.replace(a, b)
    with open(path, "wb") as fh:
        fh.write(t.encode("utf-8"))
    print("OK", path)

edit("packages/engine/src/censusAtHead.test.ts", [
    ("expect(built).toBe(1987); //", f"expect(built).toBe(1988); // {N} //"),
    ("expect(residueSentences.length).toBe(108); //", f"expect(residueSentences.length).toBe(107); // {N} //"),
])
edit("packages/engine/src/compoundCompose.test.ts", [
    ("expect(units(claimedWhole)).toBe(472); //", f"expect(units(claimedWhole)).toBe(473); // {N} //"),
])
edit("packages/engine/src/defenderStatusTriple.test.ts", [
    ("expect([withoutOxford.length, units(withoutOxford)]).toEqual([505, 1530]); //",
     f"expect([withoutOxford.length, units(withoutOxford)]).toEqual([506, 1531]); // {N} //"),
])
edit("packages/engine/src/flipStatusEnergyDiscard.test.ts", [
    ("expect([without.length, units(without)]).toEqual([505, 1530]); //",
     f"expect([without.length, units(without)]).toEqual([506, 1531]); // {N} //"),
])
edit("packages/engine/src/perHeadsEnergyDiscard.test.ts", [
    ("expect([without.length, units(without)]).toEqual([504, 1530]); //",
     f"expect([without.length, units(without)]).toEqual([505, 1531]); // {N} //"),
])
edit("packages/engine/src/selfDamagePerCounter.test.ts", [
    ("expect([without.length, units(without)]).toEqual([505, 1531]); //",
     f"expect([without.length, units(without)]).toEqual([506, 1532]); // {N} //"),
])
