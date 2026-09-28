import re, glob, io, os, sys

NOTE_S = ("- 1 /* \U0001f195\U0001f195\U0001f195 D490 — a `- 1` term at the FRONT: THE MILL OF BOTH DECKS SCALED BY "
          "THE ENERGY AMONG WHAT IT MILLED, corpus FILE LINE 130, ONE sentence / TWO printings, claimed by "
          "`deriveAttackDiscardScaledBoost`'s new `eachDeckMill` member. The frozen endpoint is UNTOUCHED "
          "(D426/D437/D462): a tail that moves with the head asserts `head === head`. */")
NOTE_P = ("- 2 /* \U0001f195\U0001f195\U0001f195 D490 — a `- 2` term at the FRONT: THE MILL OF BOTH DECKS SCALED BY "
          "THE ENERGY AMONG WHAT IT MILLED, corpus FILE LINE 130, ONE sentence / TWO **printings** — the two "
          "steps DISAGREE, so this site takes 2 where a `.length` site takes 1 (D451/D464). The frozen endpoint "
          "is UNTOUCHED (D426/D437/D462). */")

HEADS = [
    ("units(resolved)", NOTE_P),
    ("units(resolving)", NOTE_P),
    ("BUILT.attack", NOTE_P),
    ("resolved.length", NOTE_S),
    ("resolving.length", NOTE_S),
    ("head", NOTE_P),
]
TARGETS = {
    "benchNamedBonus.test.ts": [(948, "resolved.length"), (1129, "units(resolved)")],
    "censusAtHead.test.ts": [(6112, "BUILT.attack"), (6215, "BUILT.attack")],
    "inPlayTypeBonus.test.ts": [(772, "resolving.length"), (809, "units(resolving)")],
    "moreEnergyBonus.test.ts": [(760, "resolved.length"), (803, "units(resolved)")],
    "opponentBenchCount.test.ts": [(835, "resolving.length"), (872, "units(resolving)"),
                                   (949, "resolving.length"), (949, "units(resolving)")],
    "precociousEvolution.test.ts": [(697, "head")],
    "retreatCostBonus.test.ts": [(944, "resolving.length"), (981, "units(resolving)"),
                                 (1061, "resolving.length"), (1061, "units(resolving)"),
                                 (1130, "resolving.length"), (1130, "units(resolving)")],
    "sameEnergyBonus.test.ts": [(967, "resolved.length"), (1026, "units(resolved)")],
}
NOTES = dict(HEADS)
BASE = "/home/jofre/projects/luminous_ui/packages/engine/src/"
total = 0
for fname, sites in TARGETS.items():
    p = BASE + fname
    lines = io.open(p, encoding="utf-8").read().split("\n")
    # group by line, insert right-to-left
    bylinenum = {}
    for (ln, head) in sites:
        bylinenum.setdefault(ln, []).append(head)
    for ln, heads in bylinenum.items():
        line = lines[ln - 1]
        # locate each head's occurrence followed by " - <digits> /*"
        spots = []
        for head in heads:
            m = re.search(re.escape(head) + r" - \d+ /\*", line)
            if m is None:
                sys.stderr.write("NO SPOT %s:%d %s\n%s\n" % (fname, ln, head, line[:200])); raise SystemExit(2)
            at = m.start() + len(head)
            if not (0 <= m.start() < 120):
                sys.stderr.write("HEAD OUTSIDE CODE REGION %s:%d col %d\n" % (fname, ln, m.start())); raise SystemExit(2)
            spots.append((at, NOTES[head]))
        for at, note in sorted(spots, reverse=True):
            line = line[:at] + " " + note + line[at:]
            total += 1
        lines[ln - 1] = line
    open(p, "wb").write("\n".join(lines).encode("utf-8"))
    print("stepped", fname, len(sites))
print("TOTAL front terms inserted:", total)
