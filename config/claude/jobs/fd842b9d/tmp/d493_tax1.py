import io, sys
NOTE_S = "🆕🆕🆕 D493 +1 sentence / +1 printing (corpus FILE LINE 529, the Cynthia bench-counter fold with its printed Weakness-only suppression rider). "
def patch(path, edits):
    """edits: list of (1-based line, old_literal, new_literal)"""
    s = io.open(path, encoding="utf-8").read()
    lines = s.split("\n")
    for ln, old, new in edits:
        i = ln - 1
        assert lines[i].count(old) == 1, f"{path}:{ln} expected exactly one {old!r} in {lines[i][:160]!r} (got {lines[i].count(old)})"
        lines[i] = lines[i].replace(old, new, 1)
    out = "\n".join(lines)
    payload = out.encode("utf-8")           # D463: encode BEFORE opening for write
    with io.open(path, "wb") as fh: fh.write(payload)
    print(f"patched {path}: {len(edits)} site(s)")

E = "packages/engine/src/"
patch(E+"censusAtHead.test.ts", [
    (464, "attack: 1609,", "attack: 1610,"),
    (6283, "toBe(123)", "toBe(122)"),
    (6339, "toBe(114)", "toBe(113)"),
    (6353, "toBe(88)", "toBe(87)"),
    (8147, "= 173;", "= 172;"),
    (8304, "toBe(526)", "toBe(527)"),
    (8321, "toBe(1559)", "toBe(1560)"),
])
patch(E+"exOnlyActive.test.ts", [(190,"toHaveLength(526)","toHaveLength(527)"),(202,"toBe(1559)","toBe(1560)")])
patch(E+"defenderStatusTriple.test.ts", [(532,"[526, 1559]","[527, 1560]")])
patch(E+"precociousEvolution.test.ts", [(548,"toBe(1559)","toBe(1560)")])
patch(E+"sawkRequirementSplit.test.ts", [(249,"toHaveLength(526)","toHaveLength(527)"),(261,"toBe(1559)","toBe(1560)")])
patch(E+"flipStatusHeadsTails.test.ts", [(731,"[526, 1559]","[527, 1560]")])
patch(E+"handDiscardScaledSnipe.test.ts", [(1026,"[526, 1559]","[527, 1560]")])
patch(E+"retreatCostBonus.test.ts", [(800,"[526, 1559]","[527, 1560]")])
patch(E+"selfDamagePerCounter.test.ts", [(185,"[526, 1559]","[527, 1560]")])
patch(E+"sameEnergyBonus.test.ts", [(808,"toHaveLength(526)","toHaveLength(527)"),(820,"toBe(1559)","toBe(1560)")])
patch(E+"inPlayTypeBonus.test.ts", [(628,"[526, 1559]","[527, 1560]")])
patch(E+"perHeadsEnergyDiscard.test.ts", [(661,"[526, 1559]","[527, 1560]")])
patch(E+"benchNamedBonus.test.ts", [(842,"toHaveLength(526)","toHaveLength(527)"),(854,"toBe(1559)","toBe(1560)")])
patch(E+"moreEnergyBonus.test.ts", [(618,"toHaveLength(526)","toHaveLength(527)"),(630,"toBe(1559)","toBe(1560)")])
patch(E+"opponentBenchCount.test.ts", [(691,"[526, 1559]","[527, 1560]")])
patch(E+"flipStatusEnergyDiscard.test.ts", [(559,"[526, 1559]","[527, 1560]")])
