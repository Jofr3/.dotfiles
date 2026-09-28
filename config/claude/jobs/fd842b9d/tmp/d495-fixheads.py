import re
FRONT = ("- 1 /* \U0001f195\U0001f195\U0001f195 D495 — a `- 1` term at the FRONT: "
         "THE DEFENDER ATTACK LOCK BEHIND THE WINNING FACE OF A COIN, "
         "`censusAttackCorpus.ts` FILE LINE 250, **1 sentence / 1 legal printing** — "
         "SENTENCE AND PRINTING STEPS AGREE AT 1 AND 1, so every chain in this repo takes the "
         "same term whatever its unit (D451/D464). Claimed WHOLE by `deriveAttackEffect` through "
         "ONE new anchor `FLIP_HEADS_DEFENDER_CANT_ATTACK` and ONE arm: ZERO new readers "
         "(surface unmoved at 13), ZERO new ops, ZERO new op FIELDS, ZERO new op VALUES, and "
         "`MATCH_RECORD_VERSION` unmoved at 29. */ ")
HEADS = [
  ("benchNamedBonus.test.ts", 948, "resolved.length"),
  ("benchNamedBonus.test.ts", 1129, "units(resolved)"),
  ("censusAtHead.test.ts", 6112, "BUILT.attack"),
  ("censusAtHead.test.ts", 6215, "BUILT.attack"),
  ("inPlayTypeBonus.test.ts", 772, "resolving.length"),
  ("inPlayTypeBonus.test.ts", 809, "units(resolving)"),
  ("moreEnergyBonus.test.ts", 760, "resolved.length"),
  ("moreEnergyBonus.test.ts", 803, "units(resolved)"),
  ("opponentBenchCount.test.ts", 835, "resolving.length"),
  ("opponentBenchCount.test.ts", 872, "units(resolving)"),
  ("opponentBenchCount.test.ts", 949, "resolving.length"),
  ("opponentBenchCount.test.ts", 949, "units(resolving)"),
  ("precociousEvolution.test.ts", 697, "head"),
  ("retreatCostBonus.test.ts", 944, "resolving.length"),
  ("retreatCostBonus.test.ts", 981, "units(resolving)"),
  ("retreatCostBonus.test.ts", 1061, "resolving.length"),
  ("retreatCostBonus.test.ts", 1061, "units(resolving)"),
  ("retreatCostBonus.test.ts", 1130, "resolving.length"),
  ("retreatCostBonus.test.ts", 1130, "units(resolving)"),
  ("sameEnergyBonus.test.ts", 967, "resolved.length"),
  ("sameEnergyBonus.test.ts", 1026, "units(resolved)"),
]
files={}
def load(p):
    if p not in files: files[p]=open(p,encoding="utf-8").read().split("\n")
    return files[p]
backup={}
try:
    # STEP 1 — undo: strip every inserted FRONT occurrence (undo LINES, not VALUES)
    removed=0
    for f, ln, _ in HEADS:
        p=f"packages/engine/src/{f}"; lines=load(p); backup.setdefault(p,list(lines))
        s=lines[ln-1]; n=s.count(FRONT)
        if n: lines[ln-1]=s.replace(FRONT,""); removed+=n
    print("FRONT occurrences removed:", removed)
    # STEP 2 — re-splice with the head EXCLUDING its minus sign (D463)
    done=0
    for f, ln, head in HEADS:
        p=f"packages/engine/src/{f}"; lines=load(p)
        s=lines[ln-1]
        needle=head+" - "
        at=s.find(needle)
        if at<0: print(f"!! {p}:{ln} {needle!r} not found"); continue
        if not (0<=at<120): print(f"!! {p}:{ln} first occurrence at col {at}, outside the code region"); continue
        if "D495" in s[at:at+len(head)+120]: print(f"!! {p}:{ln} already stepped"); continue
        lines[ln-1]=s[:at]+head+" "+FRONT+s[at+len(head)+1:]
        done+=1
    print(f"front terms spliced: {done}/{len(HEADS)}")
    for p,lines in files.items():
        with open(p,"wb") as fh: fh.write("\n".join(lines).encode("utf-8"))
    print("written:", len(files))
except Exception:
    for p,lines in backup.items():
        with open(p,"wb") as fh: fh.write("\n".join(lines).encode("utf-8"))
    raise
