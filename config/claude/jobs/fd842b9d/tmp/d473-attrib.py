"""D473 attribution control.

Applies the NEAREST WRONG SIBLING of the new arm — the §9.2 `recordGate` deleted, so
the draw runs whatever the payment did — BY HAND, runs each candidate observer ALONE,
restores in a `finally`, and verifies the restore by SIZE and SHA256.

⚠️ Python's `str.replace` REJECTS a function second argument (conventions, D471), so the
substitution is `find`-split + join with a `len(parts) == 2` assertion — otherwise a
swallowed TypeError silently measures the UNMUTATED file.
"""

import hashlib, os, subprocess, sys

REPO = "/home/jofre/projects/luminous_ui"
EFFECTS = os.path.join(REPO, "packages/engine/src/effects.ts")

PAY = '        { op: "payFromHand", count: 1, to: "discard", recordAs: "paid" },'
IGNORE = "        // biome-ignore lint/suspicious/noThenProperty: `then` is the effect contract's gated-step list, not a thenable (arrays are not callable).\n"
GATE = '        { op: "recordGate", slot: "paid", then: [{ op: "drawCards", count: drawn }] },'
FIND = PAY + "\n" + IGNORE + GATE
REPLACE = PAY + "\n" + '        { op: "drawCards", count: drawn },'

OBSERVERS = [
    "packages/engine/src/handEnergyCancel.test.ts",
    "packages/engine/src/handCostDraw.test.ts",
    "packages/engine/src/optionalDraw.test.ts",
    "packages/engine/src/opRecord.test.ts",
    "packages/engine/src/censusAtHead.test.ts",
    "packages/engine/src/compoundCompose.test.ts",
    "packages/engine/src/exOnlyActive.test.ts",
    "packages/engine/src/sawkRequirementSplit.test.ts",
    "packages/engine/src/precociousEvolution.test.ts",
    "packages/engine/src/discardHandDraw.test.ts",
    "packages/engine/src/payFromHand.test.ts",
]

original = open(EFFECTS, "rb").read()
size0, sha0 = len(original), hashlib.sha256(original).hexdigest()
print(f"baseline effects.ts: {size0} bytes  sha256={sha0}")

try:
    text = original.decode("utf-8")
    parts = text.split(FIND)
    assert len(parts) == 2, f"find occurs {len(parts) - 1}x"
    mutated = REPLACE.join(parts)
    assert mutated != text
    payload = mutated.encode("utf-8")
    with open(EFFECTS, "wb") as fh:
        fh.write(payload)
    print(f"mutated:            {len(payload)} bytes\n")

    for suite in OBSERVERS:
        proc = subprocess.run(
            ["bunx", "vitest", "run", "--pool=forks", "--maxWorkers=2", suite],
            cwd=REPO, capture_output=True, text=True, timeout=1200,
        )
        tail = [ln for ln in proc.stdout.split("\n") if "Tests " in ln or "Test Files" in ln]
        verdict = "RED " if proc.returncode != 0 else "GREEN"
        print(f"{verdict}  {suite}   {' | '.join(t.strip() for t in tail)}")
finally:
    with open(EFFECTS, "wb") as fh:
        fh.write(original)
    back = open(EFFECTS, "rb").read()
    ok = len(back) == size0 and hashlib.sha256(back).hexdigest() == sha0
    print(f"\nRESTORED: size {len(back)} == {size0} -> {len(back) == size0}; "
          f"sha256 match -> {hashlib.sha256(back).hexdigest() == sha0}")
    if not ok:
        sys.exit(1)
