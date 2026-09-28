import re, io, sys
NOTE_S = ("- 1 /* \U0001f195\U0001f195\U0001f195 D490 — a `- 1` term at the FRONT: THE MILL OF BOTH DECKS SCALED BY "
          "THE ENERGY AMONG WHAT IT MILLED, corpus FILE LINE 130, ONE sentence / TWO printings, claimed by "
          "`deriveAttackDiscardScaledBoost`'s new `eachDeckMill` member. The frozen endpoint is UNTOUCHED "
          "(D426/D437/D462): a tail that moves with the head asserts `head === head`. */")
NOTE_P = ("- 2 /* \U0001f195\U0001f195\U0001f195 D490 — a `- 2` term at the FRONT: THE MILL OF BOTH DECKS SCALED BY "
          "THE ENERGY AMONG WHAT IT MILLED, corpus FILE LINE 130, ONE sentence / TWO **printings** — the two "
          "steps DISAGREE, so this site takes 2 where a `.length` site takes 1 (D451/D464). The frozen endpoint "
          "is UNTOUCHED (D426/D437/D462). */")
NOTES = {"units(resolved)": NOTE_P, "units(resolving)": NOTE_P, "BUILT.attack": NOTE_P,
         "resolved.length": NOTE_S, "resolving.length": NOTE_S, "head": NOTE_P}
TARGETS = {
    "opponentBenchCount.test.ts": [(835, "resolving.length"), (872, "units(resolving)"),
                                   (949, "resolving.length"), (949, "units(resolving)")],
    "precociousEvolution.test.ts": [(697, "head")],
    "retreatCostBonus.test.ts": [(944, "resolving.length"), (981, "units(resolving)"),
                                 (1061, "resolving.length"), (1061, "units(resolving)"),
                                 (1130, "resolving.length"), (1130, "units(resolving)")],
    "sameEnergyBonus.test.ts": [(967, "resolved.length"), (1026, "units(resolved)")],
}
BASE = "/home/jofre/projects/luminous_ui/packages/engine/src/"
def in_code(line, pos):
    # a match is in CODE iff every /* before it has a matching */
    return line.count("/*", 0, pos) == line.count("*/", 0, pos)
total = 0
for fname, sites in TARGETS.items():
    p = BASE + fname
    lines = io.open(p, encoding="utf-8").read().split("\n")
    byline = {}
    for (ln, head) in sites: byline.setdefault(ln, []).append(head)
    for ln, heads in byline.items():
        line = lines[ln - 1]
        spots = []
        for head in heads:
            found = None
            for m in re.finditer(re.escape(head) + r" - \d+ /\*", line):
                if in_code(line, m.start()):
                    found = m; break
            if found is None:
                sys.stderr.write("NO CODE SPOT %s:%d %s\n" % (fname, ln, head)); raise SystemExit(2)
            spots.append((found.start() + len(head), NOTES[head]))
        for at, note in sorted(spots, reverse=True):
            line = line[:at] + " " + note + line[at:]
            total += 1
        lines[ln - 1] = line
    open(p, "wb").write("\n".join(lines).encode("utf-8"))
    print("stepped", fname, len(sites))
print("TOTAL front terms inserted:", total)
