import re
NOTE = ("\U0001f195\U0001f195 **D474 — A `- {n}` TERM FRONT-INSERTED AHEAD OF D473's, AND THE FROZEN "
        "ENDPOINT IS UNTOUCHED (D426/D437/D461/D462).** (THE BOARD-COUNTED COIN FLIP OVER BODIES — "
        "`censusAttackCorpus.ts` **FILE LINE 233**, *\"Flip a coin for each {{D}} Pokémon you have in "
        "play. This attack does 60 damage for each heads.\"*, **1 sentence / 2 legal printings**, claimed "
        "WHOLE by `deriveAttackCoinFlip` through ONE new anchor and ONE new `AttackFlipCount` member. "
        "⚠️ **THE SENTENCE STEP AND THE PRINTING STEP DISAGREE, 1 AND 2** — the opposite of "
        "D473's 2-and-2 — so READ THE HEAD NAME AT EVERY SITE (D451/D461/D464): a `.length` chain "
        "counts SENTENCES and a `units(…)` / `BUILT.attack` / `head` chain counts PRINTINGS. The step "
        "arrives through the RAW summand ALONE — no registry row, no gate split, no trailing split, "
        "and D464's compound route measured EMPTY — and the reader surface stands still at 13.) "
        "⚠️ EDITED AT THE FRONT, NEVER AT THE END.")
FILES = [
 "packages/engine/src/benchNamedBonus.test.ts","packages/engine/src/censusAtHead.test.ts",
 "packages/engine/src/inPlayTypeBonus.test.ts","packages/engine/src/moreEnergyBonus.test.ts",
 "packages/engine/src/opponentBenchCount.test.ts","packages/engine/src/precociousEvolution.test.ts",
 "packages/engine/src/retreatCostBonus.test.ts","packages/engine/src/sameEnergyBonus.test.ts",
]
total = 0
for f in FILES:
    src = open(f, encoding="utf-8").read()
    before = src
    for n in (1, 2):
        term = f"{n} /* {NOTE.format(n=n)} */ "
        fixed = f"{n} /* {NOTE.format(n=n)} */ - "
        count = src.count(term)
        if count == 0:
            continue
        # every occurrence must currently be followed by a digit (the old front term)
        for m in re.finditer(re.escape(term), src):
            nxt = src[m.end():m.end() + 1]
            assert nxt.isdigit(), f"{f}: term followed by {nxt!r}, not a digit"
        src = src.replace(term, fixed)
        total += count
        print(f"  {f}: {count} x '- {n}'")
    assert src != before, f"{f}: nothing repaired"
    with open(f, "wb") as fh:
        fh.write(src.encode("utf-8"))
print("REPAIRED TERMS:", total)
