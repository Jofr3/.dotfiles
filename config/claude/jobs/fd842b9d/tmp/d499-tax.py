"""D499 census tax, line-targeted (D492) with a front-insert that keeps the whole
tail byte-for-byte (D463's eaten-minus-sign trap).  ENCODE FIRST, WRITE SECOND (D463)."""

import re, sys

ROOT = "/home/jofre/projects/luminous_ui/packages/engine/src/"

NOTE = (
    "/* \U0001f195\U0001f195\U0001f195 D499 — a `- {N}` term at the FRONT: THE PRINTED CANCEL "
    "WITH A HEADS CONSEQUENT ON THE SAME FLIP, `censusAttackCorpus.ts` FILE LINE 268, "
    "**1 sentence / 2 legal printings**, claimed WHOLE by `deriveAttackCoinFlip` "
    "through ONE new anchor and ONE new `AttackCoinFlip` member "
    "`cancelOnTailsElseProgram`. ⚠️ THE TWO STEPS DISAGREE, 1 AND 2. */"
)

# (file, 1-based line, old-substring, new-substring) — LIVE HEADS, stepped in place.
HEADS = [
    ("benchNamedBonus.test.ts", 842, "toHaveLength(529)", "toHaveLength(530)"),
    ("benchNamedBonus.test.ts", 854, "toBe(1562)", "toBe(1564)"),
    ("censusAtHead.test.ts", 4231, "expect(built).toBe(2017)", "expect(built).toBe(2019)"),
    ("censusAtHead.test.ts", 6283, "expect(unbuiltAttack).toBe(120)", "expect(unbuiltAttack).toBe(118)"),
    ("censusAtHead.test.ts", 6339, "expect(rawUnbuiltSentences.length).toBe(111)", "expect(rawUnbuiltSentences.length).toBe(110)"),
    ("censusAtHead.test.ts", 6353, "expect(residueSentences.length).toBe(85)", "expect(residueSentences.length).toBe(84)"),
    ("censusAtHead.test.ts", 8147, "RAW_UNBUILT_ATTACK_UNITS = 170", "RAW_UNBUILT_ATTACK_UNITS = 168"),
    ("censusAtHead.test.ts", 8304, "expect(resolved.length).toBe(529)", "expect(resolved.length).toBe(530)"),
    ("censusAtHead.test.ts", 8321, "0)).toBe(1562)", "0)).toBe(1564)"),
    ("classedBoardSpread.test.ts", 1004, "toEqual([111, 170])", "toEqual([110, 168])"),
    ("compoundCompose.test.ts", 612, "toHaveLength(201)", "toHaveLength(202)"),
    ("defenderStatusTriple.test.ts", 532, "toEqual([529, 1562])", "toEqual([530, 1564])"),
    ("defenderStatusTriple.test.ts", 546, "toEqual([528, 1560])", "toEqual([529, 1562])"),
    ("exOnlyActive.test.ts", 190, "toHaveLength(529)", "toHaveLength(530)"),
    ("exOnlyActive.test.ts", 202, "toBe(1562)", "toBe(1564)"),
    ("exOnlyActive.test.ts", 214, "toHaveLength(111)", "toHaveLength(110)"),
    ("exOnlyActive.test.ts", 222, "toBe(170)", "toBe(168)"),
    ("flipDefenderAttackLock.test.ts", 705, "toEqual([529, 1562])", "toEqual([530, 1564])"),
    ("flipDefenderAttackLock.test.ts", 709, "toEqual([528, 1561])", "toEqual([529, 1563])"),
    ("flipStatusEnergyDiscard.test.ts", 559, "toEqual([529, 1562])", "toEqual([530, 1564])"),
    ("flipStatusEnergyDiscard.test.ts", 565, "toEqual([528, 1560])", "toEqual([529, 1562])"),
    ("flipStatusHeadsTails.test.ts", 731, "toEqual([529, 1562])", "toEqual([530, 1564])"),
    ("flipStatusHeadsTails.test.ts", 735, "toEqual([528, 1560])", "toEqual([529, 1562])"),
    ("handDiscardScaledSnipe.test.ts", 1026, "toEqual([529, 1562])", "toEqual([530, 1564])"),
    ("inPlayTypeBonus.test.ts", 628, "toEqual([529, 1562])", "toEqual([530, 1564])"),
    ("moreEnergyBonus.test.ts", 618, "toHaveLength(529)", "toHaveLength(530)"),
    ("moreEnergyBonus.test.ts", 630, "toBe(1562)", "toBe(1564)"),
    ("opponentBenchCount.test.ts", 691, "toEqual([529, 1562])", "toEqual([530, 1564])"),
    ("perHeadsEnergyDiscard.test.ts", 661, "toEqual([529, 1562])", "toEqual([530, 1564])"),
    ("perHeadsEnergyDiscard.test.ts", 667, "toEqual([527, 1560])", "toEqual([528, 1562])"),
    ("precociousEvolution.test.ts", 548, "expect(rawHead).toBe(1562)", "expect(rawHead).toBe(1564)"),
    ("retreatCostBonus.test.ts", 800, "toEqual([529, 1562])", "toEqual([530, 1564])"),
    ("sameEnergyBonus.test.ts", 808, "toHaveLength(529)", "toHaveLength(530)"),
    ("sameEnergyBonus.test.ts", 820, "toBe(1562)", "toBe(1564)"),
    ("sawkRequirementSplit.test.ts", 249, "toHaveLength(529)", "toHaveLength(530)"),
    ("sawkRequirementSplit.test.ts", 261, "toBe(1562)", "toBe(1564)"),
    ("sawkRequirementSplit.test.ts", 269, "toHaveLength(111)", "toHaveLength(110)"),
    ("sawkRequirementSplit.test.ts", 277, "toBe(170)", "toBe(168)"),
    ("selfDamagePerCounter.test.ts", 185, "toEqual([529, 1562])", "toEqual([530, 1564])"),
    ("selfDamagePerCounter.test.ts", 190, "toEqual([528, 1561])", "toEqual([529, 1563])"),
]

# (file, 1-based line, head, N) — CHAINS with a FROZEN TAIL: a term at the FRONT.
CHAINS = [
    ("benchNamedBonus.test.ts", 948, "resolved.length ", 1),
    ("benchNamedBonus.test.ts", 1129, "units(resolved) ", 2),
    ("inPlayTypeBonus.test.ts", 772, "resolving.length ", 1),
    ("inPlayTypeBonus.test.ts", 809, "units(resolving) ", 2),
    ("moreEnergyBonus.test.ts", 760, "resolved.length ", 1),
    ("moreEnergyBonus.test.ts", 803, "units(resolved) ", 2),
    ("opponentBenchCount.test.ts", 835, "resolving.length ", 1),
    ("opponentBenchCount.test.ts", 872, "units(resolving) ", 2),
    ("opponentBenchCount.test.ts", 949, "resolving.length ", 1),
    ("precociousEvolution.test.ts", 697, "head ", 2),
    ("retreatCostBonus.test.ts", 944, "resolving.length ", 1),
    ("retreatCostBonus.test.ts", 981, "units(resolving) ", 2),
    ("retreatCostBonus.test.ts", 1061, "resolving.length ", 1),
    ("retreatCostBonus.test.ts", 1130, "resolving.length ", 1),
    ("sameEnergyBonus.test.ts", 967, "resolved.length ", 1),
    ("sameEnergyBonus.test.ts", 1026, "units(resolved) ", 2),
]


def code_end(line: str) -> int:
    i = line.find("//")
    return len(line) if i < 0 else i


files: dict[str, list[str]] = {}
sizes: dict[str, int] = {}


def load(f: str) -> list[str]:
    if f not in files:
        raw = open(ROOT + f, encoding="utf-8").read()
        sizes[f] = len(raw.split("\n"))
        files[f] = raw.split("\n")
    return files[f]


problems = []
for f, ln, old, new in HEADS:
    L = load(f)
    line = L[ln - 1]
    at = line.find(old)
    if at < 0 or at >= code_end(line):
        problems.append(f"HEAD {f}:{ln} — {old!r} not in the CODE region")
        continue
    if line.count(old) != 1 or line.find(old, at + 1) != -1 and line.find(old, at + 1) < code_end(line):
        problems.append(f"HEAD {f}:{ln} — {old!r} occurs twice in the code region")
        continue
    L[ln - 1] = line[:at] + new + line[at + len(old):]

for f, ln, head, n in CHAINS:
    L = load(f)
    line = L[ln - 1]
    ce = code_end(line)
    term = "- {} {} ".format(n, NOTE.replace("{N}", str(n)))
    out = line
    count = 0
    pos = 0
    while True:
        at = out.find(head + "- ", pos)
        if at < 0 or at >= code_end(out):
            break
        # FRONT-INSERT: append to the head, keep the whole tail byte-for-byte.
        cut = at + len(head)
        out = out[:cut] + term + out[cut:]
        pos = cut + len(term) + 1
        count += 1
    if count == 0:
        problems.append(f"CHAIN {f}:{ln} — head {head!r} + '- ' not found in the code region")
        continue
    print(f"CHAIN {f}:{ln} — {count} occurrence(s) of {head!r}")
    L[ln - 1] = out

if problems:
    print("REFUSING TO WRITE:")
    for p in problems:
        print("  " + p)
    sys.exit(1)

for f, L in files.items():
    assert len(L) == sizes[f], f"{f}: line count moved {sizes[f]} -> {len(L)}"
    payload = "\n".join(L).encode("utf-8")
    with open(ROOT + f, "wb") as fh:
        fh.write(payload)
    print(f"wrote {f} ({len(L)} lines, unchanged)")
print(f"{len(HEADS)} head sites, {len(CHAINS)} chain sites, {len(files)} files")
