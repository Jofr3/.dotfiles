import io, re

NOTE = (
    " // (\U0001f195\U0001f195\U0001f195 D482 %s — THE WHOLE-SIDE SPREAD, `censusAttackCorpus.ts` FILE LINE **572**, "
    "*\"This attack does 30 damage to each of your opponent's Pokémon. (Don't apply Weakness and Resistance for "
    "Benched Pokémon.)\"*, **1 sentence / 1 legal printing**, claimed WHOLE by `deriveAttackEffect` arm 6a-bis "
    "through ONE new anchor `SPREAD_EACH_OPPONENT_POKEMON` over a TWO-OP PROGRAM OF SHIPPED OPS "
    "(`damageDefender` flat + `spreadDamage { target: \"opponentBench\" }`) — **ZERO new op members, fields, "
    "values or `interpreter.ts` bytes**, reader surface still 13. RAW summand ALONE: no registry row, no gate "
    "split, no trailing split. ⚠️ SENTENCE STEP AND PRINTING STEP AGREE AT 1 AND 1.)"
)

# (file, 1-based line, old, new, direction-word)
EDITS = [
    ("benchNamedBonus.test.ts", 842, "toHaveLength(513)", "toHaveLength(514)", "+1 sentence"),
    ("benchNamedBonus.test.ts", 854, "toBe(1542)", "toBe(1543)", "+1 printing"),
    ("censusAtHead.test.ts", 4231, "toBe(1997)", "toBe(1998)", "+1 printing"),
    ("censusAtHead.test.ts", 8147, "= 190;", "= 189;", "−1 printing"),
    ("censusAtHead.test.ts", 8304, "toBe(513)", "toBe(514)", "+1 sentence"),
    ("censusAtHead.test.ts", 8321, "toBe(1542)", "toBe(1543)", "+1 printing"),
    ("compoundCompose.test.ts", 612, "toHaveLength(189)", "toHaveLength(190)", "+1 multi-clause sentence claimed whole"),
    ("defenderStatusTriple.test.ts", 532, "toEqual([513, 1542])", "toEqual([514, 1543])", "+1 sentence / +1 printing"),
    ("exOnlyActive.test.ts", 190, "toHaveLength(513)", "toHaveLength(514)", "+1 sentence"),
    ("exOnlyActive.test.ts", 202, "toBe(1542)", "toBe(1543)", "+1 printing"),
    ("exOnlyActive.test.ts", 214, "toHaveLength(127)", "toHaveLength(126)", "−1 sentence"),
    ("exOnlyActive.test.ts", 222, "toBe(190)", "toBe(189)", "−1 printing"),
    ("flipStatusEnergyDiscard.test.ts", 559, "toEqual([513, 1542])", "toEqual([514, 1543])", "+1 sentence / +1 printing"),
    ("flipStatusHeadsTails.test.ts", 731, "toEqual([513, 1542])", "toEqual([514, 1543])", "+1 sentence / +1 printing"),
    ("inPlayTypeBonus.test.ts", 628, "toEqual([513, 1542])", "toEqual([514, 1543])", "+1 sentence / +1 printing"),
    ("moreEnergyBonus.test.ts", 618, "toHaveLength(513)", "toHaveLength(514)", "+1 sentence"),
    ("moreEnergyBonus.test.ts", 630, "toBe(1542)", "toBe(1543)", "+1 printing"),
    ("opponentBenchCount.test.ts", 691, "toEqual([513, 1542])", "toEqual([514, 1543])", "+1 sentence / +1 printing"),
    ("perHeadsEnergyDiscard.test.ts", 661, "toEqual([513, 1542])", "toEqual([514, 1543])", "+1 sentence / +1 printing"),
    ("precociousEvolution.test.ts", 548, "toBe(1542)", "toBe(1543)", "+1 printing"),
    ("retreatCostBonus.test.ts", 800, "toEqual([513, 1542])", "toEqual([514, 1543])", "+1 sentence / +1 printing"),
    ("sameEnergyBonus.test.ts", 808, "toHaveLength(513)", "toHaveLength(514)", "+1 sentence"),
    ("sameEnergyBonus.test.ts", 820, "toBe(1542)", "toBe(1543)", "+1 printing"),
    ("sawkRequirementSplit.test.ts", 249, "toHaveLength(513)", "toHaveLength(514)", "+1 sentence"),
    ("sawkRequirementSplit.test.ts", 261, "toBe(1542)", "toBe(1543)", "+1 printing"),
    ("sawkRequirementSplit.test.ts", 269, "toHaveLength(127)", "toHaveLength(126)", "−1 sentence"),
    ("sawkRequirementSplit.test.ts", 277, "toBe(190)", "toBe(189)", "−1 printing"),
    ("selfDamagePerCounter.test.ts", 185, "toEqual([513, 1542])", "toEqual([514, 1543])", "+1 sentence / +1 printing"),
]

by_file = {}
for fn, line, old, new, word in EDITS:
    by_file.setdefault(fn, []).append((line, old, new, word))

for fn, items in sorted(by_file.items()):
    p = "packages/engine/src/" + fn
    with io.open(p, encoding="utf-8") as fh:
        lines = fh.readlines()
    for line, old, new, word in items:
        idx = line - 1
        ln = lines[idx]
        code = ln.split("//")[0]
        if old not in code:
            raise SystemExit("MISS %s:%d — %r not in %r" % (fn, line, old, code.strip()[:90]))
        parts = code.split(old)
        if len(parts) != 2:
            raise SystemExit("AMBIG %s:%d — %d occurrences" % (fn, line, len(parts) - 1))
        rest = ln[len(code):].rstrip("\n")
        lines[idx] = parts[0] + new + parts[1].rstrip("\n") + (NOTE % word) + rest + "\n"
        print("ok %s:%d  %s -> %s" % (fn, line, old, new))
    with io.open(p, "w", encoding="utf-8") as fh:
        fh.writelines(lines)
