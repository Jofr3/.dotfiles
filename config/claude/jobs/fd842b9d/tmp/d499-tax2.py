"""D499 census tax, wave 2 — the sites masked behind an earlier throw in the same `it`."""
ROOT = "/home/jofre/projects/luminous_ui/packages/engine/src/"

NOTE = (
    "/* \U0001f195\U0001f195\U0001f195 D499 — a `- {N}` term at the FRONT: THE PRINTED CANCEL "
    "WITH A HEADS CONSEQUENT ON THE SAME FLIP, `censusAttackCorpus.ts` FILE LINE 268, "
    "**1 sentence / 2 legal printings**, claimed WHOLE by `deriveAttackCoinFlip` "
    "through ONE new anchor and ONE new `AttackCoinFlip` member "
    "`cancelOnTailsElseProgram`. ⚠️ THE TWO STEPS DISAGREE, 1 AND 2. "
    "EDITED AT THE FRONT, NEVER AT THE END (D426/D461/D462). */"
)

HEADS = [("censusAtHead.test.ts", 4361, "expect(units - built).toBe(366)", "expect(units - built).toBe(364)")]
CHAINS = [
    ("censusAtHead.test.ts", 6112, "BUILT.attack ", 2),
    ("censusAtHead.test.ts", 6215, "BUILT.attack ", 2),
]

def code_end(line: str) -> int:
    i = line.find("//")
    return len(line) if i < 0 else i

p = ROOT + "censusAtHead.test.ts"
raw = open(p, encoding="utf-8").read()
L = raw.split("\n")
n0 = len(L)

for f, ln, old, new in HEADS:
    line = L[ln - 1]
    at = line.find(old)
    assert 0 <= at < code_end(line), f"{f}:{ln} head not in the code region"
    L[ln - 1] = line[:at] + new + line[at + len(old):]
    print(f"HEAD {f}:{ln} {old} -> {new}")

for f, ln, head, n in CHAINS:
    line = L[ln - 1]
    term = "- {} {} ".format(n, NOTE.replace("{N}", str(n)))
    at = line.find(head + "- ")
    # ⚠️ D463: `BUILT.attack - ` occurs TWICE on some lines (once as code, once inside
    # a comment quoting the count). Take the FIRST and assert its column is code.
    assert 0 <= at < 120, f"{f}:{ln} chain head at column {at}, outside the code region"
    cut = at + len(head)
    L[ln - 1] = line[:cut] + term + line[cut:]
    total = line.count(head + "- ")
    print(f"CHAIN {f}:{ln} head at col {at}; the marker occurs {total}x on this line, FIRST taken")

assert len(L) == n0, "line count moved"
payload = "\n".join(L).encode("utf-8")
with open(p, "wb") as fh:
    fh.write(payload)
print(f"wrote censusAtHead.test.ts ({len(L)} lines, unchanged)")
