import re, io, sys

FRONT = ("- 1 /* \U0001f195\U0001f195\U0001f195 D495 — a `- 1` term at the FRONT: "
         "THE DEFENDER ATTACK LOCK BEHIND THE WINNING FACE OF A COIN, "
         "`censusAttackCorpus.ts` FILE LINE 250, **1 sentence / 1 legal printing** — "
         "SENTENCE AND PRINTING STEPS AGREE AT 1 AND 1, so every chain in this repo takes the "
         "same term whatever its unit (D451/D464). Claimed WHOLE by `deriveAttackEffect` through "
         "ONE new anchor `FLIP_HEADS_DEFENDER_CANT_ATTACK` and ONE arm: ZERO new readers "
         "(surface unmoved at 13), ZERO new ops, ZERO new op FIELDS, ZERO new op VALUES, and "
         "`MATCH_RECORD_VERSION` unmoved at 29. */ ")

# ---- A. literal steps, keyed by (file, line, old, new) ----
LITS = []
def lit(f, lines, old, new):
    for l in lines: LITS.append((f"packages/engine/src/{f}", l, old, new))

lit("censusAtHead.test.ts", [464], 1611, 1612)          # BUILT.attack
lit("censusAtHead.test.ts", [6283], 121, 120)           # unbuiltAttack
lit("censusAtHead.test.ts", [6339], 112, 111)
lit("censusAtHead.test.ts", [6353], 86, 85)
lit("censusAtHead.test.ts", [8304], 528, 529)
lit("censusAtHead.test.ts", [8321], 1561, 1562)
lit("censusAtHead.test.ts", [8147], 171, 170)           # RAW_UNBUILT_ATTACK_UNITS
lit("benchNamedBonus.test.ts", [842], 528, 529)
lit("benchNamedBonus.test.ts", [854], 1561, 1562)
lit("classedBoardSpread.test.ts", [1004], 112, 111)
lit("classedBoardSpread.test.ts", [1004], 171, 170)
lit("compoundCompose.test.ts", [612], 200, 201)
lit("defenderStatusTriple.test.ts", [532], 528, 529)
lit("defenderStatusTriple.test.ts", [532], 1561, 1562)
lit("exOnlyActive.test.ts", [190], 528, 529)
lit("exOnlyActive.test.ts", [202], 1561, 1562)
lit("exOnlyActive.test.ts", [214], 112, 111)
lit("exOnlyActive.test.ts", [222], 171, 170)
lit("flipStatusEnergyDiscard.test.ts", [559], 528, 529)
lit("flipStatusEnergyDiscard.test.ts", [559], 1561, 1562)
lit("flipStatusHeadsTails.test.ts", [731], 528, 529)
lit("flipStatusHeadsTails.test.ts", [731], 1561, 1562)
lit("handDiscardScaledSnipe.test.ts", [1026], 528, 529)
lit("handDiscardScaledSnipe.test.ts", [1026], 1561, 1562)
lit("inPlayTypeBonus.test.ts", [628], 528, 529)
lit("inPlayTypeBonus.test.ts", [628], 1561, 1562)
lit("moreEnergyBonus.test.ts", [618], 528, 529)
lit("moreEnergyBonus.test.ts", [630], 1561, 1562)
lit("opponentBenchCount.test.ts", [691], 528, 529)
lit("opponentBenchCount.test.ts", [691], 1561, 1562)
lit("perHeadsEnergyDiscard.test.ts", [661], 528, 529)
lit("perHeadsEnergyDiscard.test.ts", [661], 1561, 1562)
lit("precociousEvolution.test.ts", [548], 1561, 1562)
lit("retreatCostBonus.test.ts", [800], 528, 529)
lit("retreatCostBonus.test.ts", [800], 1561, 1562)
lit("sameEnergyBonus.test.ts", [808], 528, 529)
lit("sameEnergyBonus.test.ts", [820], 1561, 1562)
lit("sawkRequirementSplit.test.ts", [249], 528, 529)
lit("sawkRequirementSplit.test.ts", [261], 1561, 1562)
lit("sawkRequirementSplit.test.ts", [269], 112, 111)
lit("sawkRequirementSplit.test.ts", [277], 171, 170)
lit("selfDamagePerCounter.test.ts", [185], 528, 529)
lit("selfDamagePerCounter.test.ts", [185], 1561, 1562)

# ---- B. front-term splices: (file, line, head-marker) ----
HEADS = [
  ("benchNamedBonus.test.ts", 948, "resolved.length - "),
  ("benchNamedBonus.test.ts", 1129, "units(resolved) - "),
  ("censusAtHead.test.ts", 6112, "BUILT.attack - "),
  ("censusAtHead.test.ts", 6215, "BUILT.attack - "),
  ("inPlayTypeBonus.test.ts", 772, "resolving.length - "),
  ("inPlayTypeBonus.test.ts", 809, "units(resolving) - "),
  ("moreEnergyBonus.test.ts", 760, "resolved.length - "),
  ("moreEnergyBonus.test.ts", 803, "units(resolved) - "),
  ("opponentBenchCount.test.ts", 835, "resolving.length - "),
  ("opponentBenchCount.test.ts", 872, "units(resolving) - "),
  ("opponentBenchCount.test.ts", 949, "resolving.length - "),
  ("opponentBenchCount.test.ts", 949, "units(resolving) - "),
  ("precociousEvolution.test.ts", 697, "head - "),
  ("retreatCostBonus.test.ts", 944, "resolving.length - "),
  ("retreatCostBonus.test.ts", 981, "units(resolving) - "),
  ("retreatCostBonus.test.ts", 1061, "resolving.length - "),
  ("retreatCostBonus.test.ts", 1061, "units(resolving) - "),
  ("retreatCostBonus.test.ts", 1130, "resolving.length - "),
  ("retreatCostBonus.test.ts", 1130, "units(resolving) - "),
  ("sameEnergyBonus.test.ts", 967, "resolved.length - "),
  ("sameEnergyBonus.test.ts", 1026, "units(resolved) - "),
]

files = {}
def load(p):
    if p not in files: files[p] = open(p, encoding="utf-8").read().split("\n")
    return files[p]

backup = {}
try:
    # literals
    litdone = 0
    for p, ln, old, new in LITS:
        lines = load(p); backup.setdefault(p, list(lines))
        s = lines[ln-1]
        # only inside the CODE region: strip a trailing `//` comment and any /* */ blocks
        pat = re.compile(r"(?<![\d.])%d(?![\d.])" % old)
        # find occurrences that are NOT inside a comment
        code_end = len(s)
        m = re.search(r"//", s)
        if m: code_end = m.start()
        # blank out /* */ regions for the search
        masked = list(s[:code_end])
        for bm in re.finditer(r"/\*.*?\*/", s[:code_end], re.S):
            for k in range(bm.start(), bm.end()): masked[k] = "\x00"
        masked = "".join(masked)
        hits = [mm for mm in pat.finditer(masked)]
        if len(hits) != 1:
            print(f"!! {p}:{ln} expected 1 code occurrence of {old}, got {len(hits)}: {s[:120]}")
            continue
        h = hits[0]
        lines[ln-1] = s[:h.start()] + str(new) + s[h.end():]
        litdone += 1
    print(f"literals patched: {litdone}/{len(LITS)}")

    # front terms — append to the head, keep the whole tail (D463)
    hdone = 0
    for f, ln, marker in HEADS:
        p = f"packages/engine/src/{f}"
        lines = load(p); backup.setdefault(p, list(lines))
        s = lines[ln-1]
        # take the FIRST occurrence of the marker that is NOT already followed by our term
        at = -1
        for mm in re.finditer(re.escape(marker), s):
            if s.startswith(marker + FRONT.split(" ")[0], mm.start()) and "D495" in s[mm.start():mm.start()+len(marker)+80]:
                continue
            at = mm.start(); break
        if at < 0:
            print(f"!! {p}:{ln} marker {marker!r} not found"); continue
        if "D495" in s[at:at+len(marker)+90]:
            print(f"!! {p}:{ln} already stepped"); continue
        lines[ln-1] = s[:at] + marker + FRONT + s[at+len(marker):]
        hdone += 1
    print(f"front terms spliced: {hdone}/{len(HEADS)}")

    for p, lines in files.items():
        payload = "\n".join(lines).encode("utf-8")
        with open(p, "wb") as fh: fh.write(payload)
    print("written:", len(files), "files")
except Exception:
    for p, lines in backup.items():
        with open(p, "wb") as fh: fh.write("\n".join(lines).encode("utf-8"))
    raise
