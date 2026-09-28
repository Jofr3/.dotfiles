import re, sys, os

ROOT = "/home/jofre/projects/luminous_ui/"
TERM = " - 1 /* D502, corpus FILE LINE 440, 1 sentence / 1 printing */"

def code_spans(line: str):
    """Return a list of (start, end) spans of the line that are CODE (outside
    /*..*/ and //-comments and outside string literals)."""
    spans = []
    i = 0
    n = len(line)
    start = 0
    while i < n:
        if line.startswith("/*", i):
            spans.append((start, i))
            j = line.find("*/", i + 2)
            i = n if j < 0 else j + 2
            start = i
        elif line.startswith("//", i):
            spans.append((start, i))
            return spans
        elif line[i] in "\"'`":
            q = line[i]; j = i + 1
            while j < n and line[j] != q:
                if line[j] == "\\": j += 1
                j += 1
            i = j + 1
        else:
            i += 1
    spans.append((start, n))
    return spans

def in_code(spans, at):
    return any(a <= at < b for a, b in spans)

CHAINS = [
    ("packages/engine/src/basicEnergyScaling.test.ts", 670, "resolvedNow.length"),
    ("packages/engine/src/basicEnergyScaling.test.ts", 671, "units(resolvedNow)"),
    ("packages/engine/src/censusAtHead.test.ts", 6112, "BUILT.attack"),
    ("packages/engine/src/censusAtHead.test.ts", 6215, "BUILT.attack"),
    ("packages/engine/src/opponentBenchCount.test.ts", 949, "resolving.length"),
    ("packages/engine/src/opponentBenchCount.test.ts", 949, "units(resolving)"),
    ("packages/engine/src/precociousEvolution.test.ts", 697, "head"),
    ("packages/engine/src/retreatCostBonus.test.ts", 1061, "resolving.length"),
    ("packages/engine/src/retreatCostBonus.test.ts", 1061, "units(resolving)"),
    ("packages/engine/src/retreatCostBonus.test.ts", 1130, "resolving.length"),
    ("packages/engine/src/retreatCostBonus.test.ts", 1130, "units(resolving)"),
]

byfile = {}
for f, l, h in CHAINS:
    byfile.setdefault(f, []).append((l, h))

dry = "--apply" not in sys.argv
for f, items in byfile.items():
    path = ROOT + f
    text = open(path, encoding="utf-8").read()
    before = len(text)
    lines = text.split("\n")
    for l, h in items:
        line = lines[l - 1]
        spans = code_spans(line)
        needle = h + " - "
        hits = [m.start() for m in re.finditer(re.escape(needle), line) if in_code(spans, m.start())]
        if len(hits) != 1:
            raise SystemExit(f"{f}:{l} {h!r}: {len(hits)} CODE occurrences (cols {hits}) — refusing")
        at = hits[0]
        cut = at + len(h)
        # Append to the HEAD and keep the WHOLE tail (D463): the term carries its own
        # sign and the existing " - " is untouched.
        lines[l - 1] = line[:cut] + TERM + line[cut:]
        print(f"  {f}:{l} {h!r} front term inserted at col {at} (line {len(line)} -> {len(lines[l-1])})")
    out = "\n".join(lines)
    grew = len(out) - before
    expect = sum(len(TERM) for _ in items)
    if grew != expect:
        raise SystemExit(f"{f}: grew {grew} bytes, expected {expect}")
    if not dry:
        payload = out.encode("utf-8")           # ENCODE FIRST (D463)
        with open(path, "wb") as fh:
            fh.write(payload)
        assert len(open(path, encoding="utf-8").read()) == before + expect, f"{f}: size check failed"
    print(f"  {f}: +{grew} bytes {'(dry run)' if dry else 'WRITTEN'}")
