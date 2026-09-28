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

# (file, line, col, head, unit) — collected by the scan, unit chosen by reading the head name.
SITES = [
    ("packages/engine/src/benchNamedBonus.test.ts", 948, "resolved.length", 1),
    ("packages/engine/src/benchNamedBonus.test.ts", 1129, "units(resolved)", 2),
    ("packages/engine/src/censusAtHead.test.ts", 6112, "BUILT.attack", 2),
    ("packages/engine/src/censusAtHead.test.ts", 6215, "BUILT.attack", 2),
    ("packages/engine/src/inPlayTypeBonus.test.ts", 772, "resolving.length", 1),
    ("packages/engine/src/inPlayTypeBonus.test.ts", 809, "units(resolving)", 2),
    ("packages/engine/src/moreEnergyBonus.test.ts", 760, "resolved.length", 1),
    ("packages/engine/src/moreEnergyBonus.test.ts", 803, "units(resolved)", 2),
    ("packages/engine/src/opponentBenchCount.test.ts", 835, "resolving.length", 1),
    ("packages/engine/src/opponentBenchCount.test.ts", 872, "units(resolving)", 2),
    ("packages/engine/src/opponentBenchCount.test.ts", 949, "resolving.length", 1),
    ("packages/engine/src/opponentBenchCount.test.ts", 949, "units(resolving)", 2),
    ("packages/engine/src/precociousEvolution.test.ts", 697, "head", 2),
    ("packages/engine/src/retreatCostBonus.test.ts", 944, "resolving.length", 1),
    ("packages/engine/src/retreatCostBonus.test.ts", 981, "units(resolving)", 2),
    ("packages/engine/src/retreatCostBonus.test.ts", 1061, "resolving.length", 1),
    ("packages/engine/src/retreatCostBonus.test.ts", 1061, "units(resolving)", 2),
    ("packages/engine/src/retreatCostBonus.test.ts", 1130, "resolving.length", 1),
    ("packages/engine/src/retreatCostBonus.test.ts", 1130, "units(resolving)", 2),
    ("packages/engine/src/sameEnergyBonus.test.ts", 967, "resolved.length", 1),
    ("packages/engine/src/sameEnergyBonus.test.ts", 1026, "units(resolved)", 2),
]

by_file = {}
for f, ln, head, unit in SITES:
    by_file.setdefault(f, []).append((ln, head, unit))

done = 0
for f, entries in by_file.items():
    src = open(f, encoding="utf-8").read()
    lines = src.split("\n")
    # group by line so several markers on one physical line are patched right-to-left
    per_line = {}
    for ln, head, unit in entries:
        per_line.setdefault(ln, []).append((head, unit))
    for ln, marks in per_line.items():
        line = lines[ln - 1]
        cuts = []
        for head, unit in marks:
            marker = head + " - "
            at = line.find(marker)
            assert at >= 0, f"{f}:{ln} marker {marker!r} not found"
            cuts.append((at, marker, unit))
        # right-to-left so earlier offsets stay valid
        for at, marker, unit in sorted(cuts, reverse=True):
            term = f"{unit} /* {NOTE.format(n=unit)} */ "
            line = line[:at] + marker + term + line[at + len(marker):]
            done += 1
        lines[ln - 1] = line
    payload = "\n".join(lines).encode("utf-8")
    with open(f, "wb") as fh:
        fh.write(payload)
    print("patched", f, len(entries), "term(s)")
print("TOTAL FRONT TERMS:", done)
