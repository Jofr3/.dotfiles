import re

NEW = "\U0001f195\U0001f195"
WARN = "⚠️"
NOTE = (
    f"({NEW} D475 +1 sentence / +1 printing — THE COIN FLIP COUNTED OVER BOTH ACTIVES — "
    "`censusAttackCorpus.ts` **FILE LINE 231**, *\"Flip a coin for each Energy attached to both "
    "Active Pokémon. This attack does 60 damage for each heads.\"*, **1 sentence / 1 legal "
    "printing**, claimed WHOLE by `deriveAttackCoinFlip` through ONE new anchor and a FIFTH, "
    "NULLARY `AttackFlipCount` member `bothActivesEnergy`. "
    f"{WARN} **THE SENTENCE STEP AND THE PRINTING STEP AGREE AT 1 AND 1** — D472's disagreed "
    "at 1 and 2, D473's agreed at 2 and 2, D474's disagreed at 1 and 2, so this term was DERIVED "
    "at this head and not carried from the previous slice (D451/D461/D464). RAW summand ALONE: no "
    "registry row, no gate split, no trailing split, D464's compound route measured EMPTY, reader "
    "surface still 13, and **NO new `FIXTURE_POOL` id** — the printed sentence has sat on "
    "`fix-bothactives` index 2 as a refusal witness since D196, so every id ladder takes a ZERO "
    "term.)"
)

def edit(path, subs):
    with open(path, "r", encoding="utf-8") as fh:
        text = fh.read()
    for find, repl, n in subs:
        got = text.count(find)
        assert got == n, f"{path}: {find[:60]!r} occurs {got}x, expected {n}"
        text = text.replace(find, repl)
    with open(path, "wb") as fh:
        fh.write(text.encode("utf-8"))
    print("live-head OK", path)

C = "packages/engine/src/censusAtHead.test.ts"
edit(C, [
    ("  attack: 1582, //", f"  attack: 1583, // {NOTE} //", 1),
    ("expect(units - built).toBe(396); //", f"expect(units - built).toBe(395); // {NOTE} //", 1),
    ("expect(unbuiltAttack).toBe(150); //", f"expect(unbuiltAttack).toBe(149); // {NOTE} //", 1),
    ("expect(rawUnbuiltSentences.length).toBe(134); //", f"expect(rawUnbuiltSentences.length).toBe(133); // {NOTE} //", 1),
    ("const RAW_UNBUILT_ATTACK_UNITS = 200; //", f"const RAW_UNBUILT_ATTACK_UNITS = 199; // {NOTE} //", 1),
    ("expect(resolved.length).toBe(506);", f"expect(resolved.length).toBe(507); // {NOTE}", 1),
    ("expect(resolved.reduce((sum, [units]) => sum + units, 0)).toBe(1532);",
     f"expect(resolved.reduce((sum, [units]) => sum + units, 0)).toBe(1533); // {NOTE}", 1),
])

for path, subs in {
    "packages/engine/src/benchNamedBonus.test.ts": [
        ("expect(resolved).toHaveLength(506);", f"expect(resolved).toHaveLength(507); // {NOTE}", 1),
        ("expect(units(resolved)).toBe(1532);", f"expect(units(resolved)).toBe(1533); // {NOTE}", 1)],
    "packages/engine/src/compoundCompose.test.ts": [
        ("expect(claimedWhole).toHaveLength(182);", f"expect(claimedWhole).toHaveLength(183); // {NOTE} ⚠️ AND THIS SITE MOVES WHERE D474's DID NOT: `claimedWhole` counts sentences that are MULTI-CLAUSE **and** claimed whole (D461), and this one is two `. `-joined clauses, so its second conjunct holds. A slice that stepped by analogy would have got this wrong in either direction.", 1)],
    "packages/engine/src/defenderStatusTriple.test.ts": [
        ("expect([resolved.length, units(resolved)]).toEqual([506, 1532]);", f"expect([resolved.length, units(resolved)]).toEqual([507, 1533]); // {NOTE}", 1)],
    "packages/engine/src/exOnlyActive.test.ts": [
        ("expect(resolved).toHaveLength(506);", f"expect(resolved).toHaveLength(507); // {NOTE}", 1),
        ("expect(resolvedP).toBe(1532);", f"expect(resolvedP).toBe(1533); // {NOTE}", 1),
        ("expect(residue).toHaveLength(134);", f"expect(residue).toHaveLength(133); // {NOTE}", 1),
        ("expect(residueP).toBe(200);", f"expect(residueP).toBe(199); // {NOTE}", 1)],
    "packages/engine/src/flipStatusEnergyDiscard.test.ts": [
        ("expect([resolved.length, units(resolved)]).toEqual([506, 1532]);", f"expect([resolved.length, units(resolved)]).toEqual([507, 1533]); // {NOTE}", 1)],
    "packages/engine/src/inPlayTypeBonus.test.ts": [
        ("expect([resolving.length, units(resolving)]).toEqual([506, 1532]);", f"expect([resolving.length, units(resolving)]).toEqual([507, 1533]); // {NOTE}", 1)],
    "packages/engine/src/moreEnergyBonus.test.ts": [
        ("expect(resolved).toHaveLength(506);", f"expect(resolved).toHaveLength(507); // {NOTE}", 1),
        ("expect(units(resolved)).toBe(1532);", f"expect(units(resolved)).toBe(1533); // {NOTE}", 1)],
    "packages/engine/src/opponentBenchCount.test.ts": [
        ("expect([resolving.length, units(resolving)]).toEqual([506, 1532]);", f"expect([resolving.length, units(resolving)]).toEqual([507, 1533]); // {NOTE}", 1)],
    "packages/engine/src/perHeadsEnergyDiscard.test.ts": [
        ("expect([resolved.length, units(resolved)]).toEqual([506, 1532]);", f"expect([resolved.length, units(resolved)]).toEqual([507, 1533]); // {NOTE}", 1)],
    "packages/engine/src/precociousEvolution.test.ts": [
        ("expect(rawHead).toBe(1532);", f"expect(rawHead).toBe(1533); // {NOTE}", 1),
        ("expect(head).toBe(1582);", f"expect(head).toBe(1583); // {NOTE}", 1)],
    "packages/engine/src/retreatCostBonus.test.ts": [
        ("expect([resolving.length, units(resolving)]).toEqual([506, 1532]);", f"expect([resolving.length, units(resolving)]).toEqual([507, 1533]); // {NOTE}", 1)],
    "packages/engine/src/sameEnergyBonus.test.ts": [
        ("expect(resolved).toHaveLength(506);", f"expect(resolved).toHaveLength(507); // {NOTE}", 1),
        ("expect(units(resolved)).toBe(1532);", f"expect(units(resolved)).toBe(1533); // {NOTE}", 1)],
    "packages/engine/src/sawkRequirementSplit.test.ts": [
        ("expect(resolved).toHaveLength(506);", f"expect(resolved).toHaveLength(507); // {NOTE}", 1),
        ("expect(p(resolved)).toBe(1532);", f"expect(p(resolved)).toBe(1533); // {NOTE}", 1),
        ("expect(residue).toHaveLength(134);", f"expect(residue).toHaveLength(133); // {NOTE}", 1),
        ("expect(p(residue)).toBe(200);", f"expect(p(residue)).toBe(199); // {NOTE}", 1)],
    "packages/engine/src/selfDamagePerCounter.test.ts": [
        ("expect([resolved.length, units(resolved)]).toEqual([506, 1532]);", f"expect([resolved.length, units(resolved)]).toEqual([507, 1533]); // {NOTE}", 1)],
}.items():
    edit(path, subs)
