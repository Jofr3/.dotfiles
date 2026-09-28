import io, sys

BODY = (" — THE PRINTED *“any number of”* AND A PROPER NAME AS THE DECK-SEARCH NOUN** — "
  "`censusAttackCorpus.ts` **FILE LINE 657**, *\"You may search your deck for any number of Fennel cards, "
  "reveal them, and put them into your hand. Then, shuffle your deck.\"*, **1 sentence / 2 legal printings**, "
  "claimed by `deriveAttackEffect`. \U0001f6d1 **TWO BLOCKERS AND THEY ARE A CONJUNCTION, MEASURED**: the 2⁴ "
  "lattice reads `0/1 · 0/4 · 1/6 · 2/4 · 1/1` (**4 of 16**) with COUNT and NOUN each flipping "
  "the verdict at **4 of 8** cells and OPENER and REVEAL at **0 of 8** — D507's eighth shape — and **16 of "
  "16 with every axis at 0 of 8 after**. **The `You may` wrapper the standing pricing named as a THIRD mechanism was "
  "already FREE and had been since D231.** ✅ **ZERO new `CardFilter` members**: `byName { cardNoun }` has spelled "
  "*\"⟨Name⟩ cards\"* since D264 and `ATTACK_BENCH_SEARCH` has captured a proper name into `byName` since "
  "D230 — the NAMED deck search shipped as a reader arm 284 decisions before this row, one destination over. ONE "
  "op-field WIDENING (`searchDeck.max: number | \"any\"`, `lookAtTopN.max`'s D333 member at a third op) and ONE new "
  "resolver (`namedCardNounFilter`, ordered LAST behind the closed noun table and REFUSING the three printed BANNERS, "
  "which is the one axis D440 refused `^(.+) card$` on). ✅ ZERO new ops, prompt kinds, choice kinds, events, error "
  "codes, registry rows or `packages/schema` bytes. `MATCH_RECORD_VERSION` **HELD at 30**.)")

HEADS = {
  "BOTH":     "(\U0001f195\U0001f195\U0001f195 **D514 +1 sentence / +2 printings",
  "SENT":     "(\U0001f195\U0001f195\U0001f195 **D514 +1 sentence",
  "UNITS":    "(\U0001f195\U0001f195\U0001f195 **D514 +2 printings",
  "NEGBOTH":  "(\U0001f195\U0001f195\U0001f195 **D514 −1 sentence / −2 printings",
  "NEGSENT":  "(\U0001f195\U0001f195\U0001f195 **D514 −1 sentence",
  "NEGUNITS": "(\U0001f195\U0001f195\U0001f195 **D514 −2 printings",
  "WHOLE":    "(\U0001f195\U0001f195\U0001f195 **D514 +1 multi-clause sentence claimed WHOLE",
}

# (file, 1-based line, old, new, kind)
SITES = [
 ("basicEnergyScaling.test.ts", 672, "toEqual([534, 1569]);", "toEqual([535, 1571]);", "BOTH"),
 ("benchNamedBonus.test.ts", 842, "toHaveLength(540);", "toHaveLength(541);", "SENT"),
 ("bothBenchSpread.test.ts", 1023, "toEqual([100, 154]);", "toEqual([99, 152]);", "NEGBOTH"),
 ("cancelThenPrevent.test.ts", 662, "toEqual([540, 1578]);", "toEqual([541, 1580]);", "BOTH"),
 ("censusAtHead.test.ts", 464, "attack: 1628,", "attack: 1630,", "BOTH"),
 ("censusAtHead.test.ts", 6352, "toBe(100);", "toBe(99);", "NEGSENT"),
 ("censusAtHead.test.ts", 8160, "RAW_UNBUILT_ATTACK_UNITS = 154;", "RAW_UNBUILT_ATTACK_UNITS = 152;", "NEGUNITS"),
 ("censusAtHead.test.ts", 8317, "toBe(540);", "toBe(541);", "SENT"),
 ("classedBoardSpread.test.ts", 1004, "toEqual([100, 154]);", "toEqual([99, 152]);", "NEGBOTH"),
 ("compoundCompose.test.ts", 612, "toHaveLength(208);", "toHaveLength(209);", "WHOLE"),
 ("confusionDamage.test.ts", 210, "toBe(498);", "toBe(499);", "SENT"),
 ("defenderStatusTriple.test.ts", 544, "toEqual([540, 1578]);", "toEqual([541, 1580]);", "BOTH"),
 ("derivedBenchSearchMove.test.ts", 1204, "toEqual([540, 1578]);", "toEqual([541, 1580]);", "BOTH"),
 ("exOnlyActive.test.ts", 190, "toHaveLength(540);", "toHaveLength(541);", "SENT"),
 ("flipDefenderAttackLock.test.ts", 705, "toEqual([540, 1578]);", "toEqual([541, 1580]);", "BOTH"),
 ("flipStatusEnergyDiscard.test.ts", 569, "toEqual([540, 1578]);", "toEqual([541, 1580]);", "BOTH"),
 ("flipStatusHeadsTails.test.ts", 806, "toEqual([540, 1578]);", "toEqual([541, 1580]);", "BOTH"),
 ("handDiscardScaledSnipe.test.ts", 1026, "toEqual([540, 1578]);", "toEqual([541, 1580]);", "BOTH"),
 ("inPlayTypeBonus.test.ts", 628, "toEqual([540, 1578]);", "toEqual([541, 1580]);", "BOTH"),
 ("moreEnergyBonus.test.ts", 618, "toHaveLength(540);", "toHaveLength(541);", "SENT"),
 ("opponentBenchCount.test.ts", 691, "toEqual([540, 1578]);", "toEqual([541, 1580]);", "BOTH"),
 ("perHeadsEnergyDiscard.test.ts", 661, "toEqual([540, 1578]);", "toEqual([541, 1580]);", "BOTH"),
 ("precociousEvolution.test.ts", 548, "toBe(1578);", "toBe(1580);", "UNITS"),
 ("retreatCostBonus.test.ts", 800, "toEqual([540, 1578]);", "toEqual([541, 1580]);", "BOTH"),
 ("sameEnergyBonus.test.ts", 808, "toHaveLength(540);", "toHaveLength(541);", "SENT"),
 ("sawkRequirementSplit.test.ts", 249, "toHaveLength(540);", "toHaveLength(541);", "SENT"),
 ("scaledBenchSpread.test.ts", 865, "toEqual([100, 154]);", "toEqual([99, 152]);", "NEGBOTH"),
 ("selfDamagePerCounter.test.ts", 185, "toEqual([540, 1578]);", "toEqual([541, 1580]);", "BOTH"),
]

BASE = "/home/jofre/projects/luminous_ui/packages/engine/src/"
by_file = {}
for f, ln, old, new, kind in SITES:
    by_file.setdefault(f, []).append((ln, old, new, kind))

for f, sites in by_file.items():
    p = BASE + f
    lines = io.open(p, encoding="utf-8").read().split("\n")
    for ln, old, new, kind in sites:
        i = ln - 1
        L = lines[i]
        if old not in L:
            print(f"SKIP-MISS {f}:{ln}  old={old!r}"); sys.exit(1)
        if L.count(old) != 1:
            print(f"SKIP-DUP {f}:{ln}"); sys.exit(1)
        L2 = L.replace(old, new)
        note = HEADS[kind] + BODY
        marker = "  // ("
        if marker in L2:
            j = L2.index(marker)
            L2 = L2[:j] + "  // " + note + " " + L2[j + len(marker) - 1:]
        elif "; // " in L2:
            j = L2.index("; // ")
            L2 = L2[:j] + "; // " + note + " " + L2[j + len("; // "):]
        elif "; /* " in L2 or " /* " in L2:
            print(f"BLOCKCOMMENT {f}:{ln}"); sys.exit(1)
        else:
            L2 = L2 + "  // " + note
        lines[i] = L2
        print(f"OK {f}:{ln} {old} -> {new} [{kind}]")
    io.open(p, "w", encoding="utf-8").write("\n".join(lines))
print("done")
