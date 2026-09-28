import os
import sys

ROOT = "/home/jofre/projects/luminous_ui/packages/engine/src"

NOTE_S = (
    "\U0001f195\U0001f195 **D472 — A `- 1` TERM FRONT-INSERTED AHEAD OF D470's, AND THE "
    "FROZEN ENDPOINT IS UNTOUCHED (D426/D437/D461/D462).** (THE BOARD-CLAUSE GATE OVER THIS "
    "FAMILY'S STATUS CONSEQUENT — `censusAttackCorpus.ts` **FILE LINE 384**, *\"If your "
    "opponent's Active Pokémon is a {N} Pokémon, it is now Paralyzed.\"*, **1 sentence "
    "/ 2 legal printings**, claimed WHOLE by `deriveAttackEffect` through the new "
    "`CLAUSE_GATED_DEFENDER_NOW` anchor — ONE anchor, ONE arm, and ZERO new ops, op fields, "
    "op values, `BoardCondition` members or vocabulary: the consequent is arm 1's and the gate "
    "is arm 6a's. ⚠️ **THE SENTENCE STEP AND THE PRINTING STEP DISAGREE, 1 vs 2** — "
    "measure each site (D451/D461). RAW summand ALONE; the reader surface stands still at 13.)"
)
NOTE_P = NOTE_S.replace("A `- 1` TERM", "A `- 2` TERM")


def code_positions(line: str) -> list[bool]:
    """True at every index of `line` that is OUTSIDE a /* ... */ block comment."""
    out = [True] * len(line)
    i = 0
    depth = False
    while i < len(line):
        if not depth and line.startswith("/*", i):
            depth = True
            out[i] = out[i + 1] = False
            i += 2
            continue
        if depth and line.startswith("*/", i):
            depth = False
            out[i] = out[i + 1] = False
            i += 2
            continue
        if depth:
            out[i] = False
        i += 1
    return out


def splice_chain(line: str, head: str, occurrence: int, term: int, note: str) -> str:
    marker = head + " - "
    ok = code_positions(line)
    found = []
    start = 0
    while True:
        at = line.find(marker, start)
        if at < 0:
            break
        if ok[at]:
            found.append(at)
        start = at + 1
    if len(found) <= occurrence:
        raise SystemExit(f"chain head {head!r} occurrence {occurrence} not found in code region")
    at = found[occurrence]
    pos = at + len(marker)
    return line[:pos] + f"{term} /* {note} */ - " + line[pos:]


def replace_literal(line: str, old: str, new: str) -> str:
    ok = code_positions(line)
    start = 0
    while True:
        at = line.find(old, start)
        if at < 0:
            raise SystemExit(f"literal {old!r} not found in code region of: {line[:120]}")
        if ok[at]:
            return line[:at] + new + line[at + len(old) :]
        start = at + 1


# (file, 1-based line, kind, payload)
#   kind "lit": (old, new)
#   kind "chain": (head, occurrence, term, unit)
EDITS = [
    # ── LIVE HEADS (D461: a bare `expect(live)` is edited at the LITERAL) ──
    ("benchNamedBonus.test.ts", 842, "lit", ("toHaveLength(502)", "toHaveLength(503)")),
    ("benchNamedBonus.test.ts", 854, "lit", ("toBe(1526)", "toBe(1528)")),
    ("censusAtHead.test.ts", 464, "lit", ("attack: 1576,", "attack: 1578,")),
    ("censusAtHead.test.ts", 6339, "lit", ("toBe(138)", "toBe(137)")),
    ("censusAtHead.test.ts", 8146, "lit", ("= 206;", "= 204;")),
    ("censusAtHead.test.ts", 8303, "lit", ("toBe(502)", "toBe(503)")),
    ("censusAtHead.test.ts", 8320, "lit", ("toBe(1526)", "toBe(1528)")),
    ("defenderStatusTriple.test.ts", 532, "lit", ("[502, 1526]", "[503, 1528]")),
    ("exOnlyActive.test.ts", 190, "lit", ("toHaveLength(502)", "toHaveLength(503)")),
    ("exOnlyActive.test.ts", 202, "lit", ("toBe(1526)", "toBe(1528)")),
    ("exOnlyActive.test.ts", 214, "lit", ("toHaveLength(138)", "toHaveLength(137)")),
    ("exOnlyActive.test.ts", 222, "lit", ("toBe(206)", "toBe(204)")),
    ("flipStatusEnergyDiscard.test.ts", 559, "lit", ("[502, 1526]", "[503, 1528]")),
    ("inPlayTypeBonus.test.ts", 628, "lit", ("[502, 1526]", "[503, 1528]")),
    ("moreEnergyBonus.test.ts", 618, "lit", ("toHaveLength(502)", "toHaveLength(503)")),
    ("moreEnergyBonus.test.ts", 630, "lit", ("toBe(1526)", "toBe(1528)")),
    ("opponentBenchCount.test.ts", 691, "lit", ("[502, 1526]", "[503, 1528]")),
    ("perHeadsEnergyDiscard.test.ts", 648, "lit", ("[502, 1526]", "[503, 1528]")),
    ("precociousEvolution.test.ts", 548, "lit", ("toBe(1526)", "toBe(1528)")),
    ("precociousEvolution.test.ts", 635, "lit", ("toBe(1576)", "toBe(1578)")),
    ("retreatCostBonus.test.ts", 800, "lit", ("[502, 1526]", "[503, 1528]")),
    ("sameEnergyBonus.test.ts", 808, "lit", ("toHaveLength(502)", "toHaveLength(503)")),
    ("sameEnergyBonus.test.ts", 820, "lit", ("toBe(1526)", "toBe(1528)")),
    ("sawkRequirementSplit.test.ts", 249, "lit", ("toHaveLength(502)", "toHaveLength(503)")),
    ("sawkRequirementSplit.test.ts", 261, "lit", ("toBe(1526)", "toBe(1528)")),
    ("sawkRequirementSplit.test.ts", 269, "lit", ("toHaveLength(138)", "toHaveLength(137)")),
    ("sawkRequirementSplit.test.ts", 277, "lit", ("toBe(206)", "toBe(204)")),
    ("selfDamagePerCounter.test.ts", 185, "lit", ("[502, 1526]", "[503, 1528]")),
    # ── FROZEN-TAIL CHAINS (D426/D437/D461: edited at the FRONT) ──
    ("benchNamedBonus.test.ts", 948, "chain", ("resolved.length", 0, 1, "S")),
    ("benchNamedBonus.test.ts", 1129, "chain", ("units(resolved)", 0, 2, "P")),
    ("censusAtHead.test.ts", 6112, "chain", ("BUILT.attack", 0, 2, "P")),
    ("censusAtHead.test.ts", 6215, "chain", ("BUILT.attack", 0, 2, "P")),
    ("inPlayTypeBonus.test.ts", 772, "chain", ("resolving.length", 0, 1, "S")),
    ("inPlayTypeBonus.test.ts", 809, "chain", ("units(resolving)", 0, 2, "P")),
    ("moreEnergyBonus.test.ts", 760, "chain", ("resolved.length", 0, 1, "S")),
    ("moreEnergyBonus.test.ts", 803, "chain", ("units(resolved)", 0, 2, "P")),
    ("opponentBenchCount.test.ts", 835, "chain", ("resolving.length", 0, 1, "S")),
    ("opponentBenchCount.test.ts", 872, "chain", ("units(resolving)", 0, 2, "P")),
    ("opponentBenchCount.test.ts", 949, "chain", ("units(resolving)", 0, 2, "P")),
    ("opponentBenchCount.test.ts", 949, "chain", ("resolving.length", 0, 1, "S")),
    ("precociousEvolution.test.ts", 697, "chain", ("head", 0, 2, "P")),
    ("retreatCostBonus.test.ts", 944, "chain", ("resolving.length", 0, 1, "S")),
    ("retreatCostBonus.test.ts", 981, "chain", ("units(resolving)", 0, 2, "P")),
    ("retreatCostBonus.test.ts", 1061, "chain", ("units(resolving)", 0, 2, "P")),
    ("retreatCostBonus.test.ts", 1061, "chain", ("resolving.length", 0, 1, "S")),
    ("retreatCostBonus.test.ts", 1130, "chain", ("units(resolving)", 0, 2, "P")),
    ("retreatCostBonus.test.ts", 1130, "chain", ("resolving.length", 0, 1, "S")),
    ("sameEnergyBonus.test.ts", 967, "chain", ("resolved.length", 0, 1, "S")),
    ("sameEnergyBonus.test.ts", 1026, "chain", ("units(resolved)", 0, 2, "P")),
]

files: dict[str, list[str]] = {}
originals: dict[str, str] = {}
for fn, *_ in EDITS:
    if fn in files:
        continue
    p = os.path.join(ROOT, fn)
    with open(p, encoding="utf-8") as fh:
        text = fh.read()
    originals[fn] = text
    files[fn] = text.split("\n")

try:
    for fn, ln, kind, payload in EDITS:
        line = files[fn][ln - 1]
        if kind == "lit":
            old, new = payload
            files[fn][ln - 1] = replace_literal(line, old, new)
        else:
            head, occ, term, unit = payload
            files[fn][ln - 1] = splice_chain(
                line, head, occ, term, NOTE_S if unit == "S" else NOTE_P
            )
    for fn, lines in files.items():
        new_text = "\n".join(lines)
        old_text = originals[fn]
        if new_text == old_text:
            raise SystemExit(f"{fn}: no change produced")
        payload = new_text.encode("utf-8")  # ENCODE FIRST (D463)
        with open(os.path.join(ROOT, fn), "wb") as fh:
            fh.write(payload)
        print(
            f"{fn}: {len(old_text)} -> {len(new_text)} bytes-ish, "
            f"lines {old_text.count(chr(10))} -> {new_text.count(chr(10))}"
        )
except SystemExit:
    raise
except Exception as exc:  # pragma: no cover
    print("FAILED, nothing written:", exc, file=sys.stderr)
    raise
