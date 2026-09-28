import re

NEW = "\U0001f195\U0001f195"
FRONT = (
    f"- 1 /* {NEW} **D475 — A `- 1` TERM FRONT-INSERTED AHEAD OF D474's, AND THE FROZEN "
    "ENDPOINT IS UNTOUCHED (D426/D437/D461/D462).** (THE COIN FLIP COUNTED OVER BOTH ACTIVES — "
    "`censusAttackCorpus.ts` **FILE LINE 231**, *\"Flip a coin for each Energy attached to both "
    "Active Pokémon. This attack does 60 damage for each heads.\"*, **1 sentence / 1 legal "
    "printing**, claimed WHOLE by `deriveAttackCoinFlip` through ONE new anchor and a FIFTH, "
    "NULLARY `AttackFlipCount` member `bothActivesEnergy`. ⚠️ **THE SENTENCE STEP AND THE "
    "PRINTING STEP AGREE AT 1 AND 1 HERE**, where D474's disagreed at 1 and 2 — so the term was "
    "read off THIS head rather than copied from the sibling above it. RAW summand ALONE, and NO "
    "new `FIXTURE_POOL` id: the printed sentence has sat on `fix-bothactives` index 2 since D196, "
    "so every `ids.length` ladder takes a ZERO term. EDITED AT THE FRONT, NEVER AT THE END. */ "
)

SITES = {
    "packages/engine/src/benchNamedBonus.test.ts": [(948, "resolved.length "), (1129, "units(resolved) ")],
    "packages/engine/src/censusAtHead.test.ts": [(6112, "BUILT.attack "), (6215, "BUILT.attack ")],
    "packages/engine/src/inPlayTypeBonus.test.ts": [(772, "resolving.length "), (809, "units(resolving) ")],
    "packages/engine/src/moreEnergyBonus.test.ts": [(760, "resolved.length "), (803, "units(resolved) ")],
    "packages/engine/src/opponentBenchCount.test.ts": [(835, "resolving.length "), (872, "units(resolving) "), (949, "resolving.length "), (949, "units(resolving) ")],
    "packages/engine/src/precociousEvolution.test.ts": [(697, "head ")],
    "packages/engine/src/retreatCostBonus.test.ts": [(944, "resolving.length "), (981, "units(resolving) "), (1061, "resolving.length "), (1061, "units(resolving) "), (1130, "resolving.length "), (1130, "units(resolving) ")],
    "packages/engine/src/sameEnergyBonus.test.ts": [(967, "resolved.length "), (1026, "units(resolved) ")],
}

total = 0
for path, sites in SITES.items():
    with open(path, "r", encoding="utf-8") as fh:
        lines = fh.read().split("\n")
    for ln, head in sites:
        i = ln - 1
        line = lines[i]
        m = re.search(re.escape(head) + r"- \d+", line)
        assert m is not None, f"{path}:{ln} head {head!r} not found"
        at = m.start()
        # 🛑 D463: the marker is not unique on the line, so this takes the FIRST match
        # and requires it to be in the CODE region rather than inside a chain's comment.
        # A second chain on the same physical line (D456) is spliced on the NEXT pass,
        # which is why `resolving.length` runs before `units(resolving)` for line 949.
        assert at < 21000, f"{path}:{ln} first {head!r} at col {at} — inside a comment?"
        cut = at + len(head)
        lines[i] = line[:cut] + FRONT + line[cut:]
        total += 1
    with open(path, "wb") as fh:
        fh.write("\n".join(lines).encode("utf-8"))
    print("chains OK", path, len(sites))
print("TOTAL front terms:", total)
