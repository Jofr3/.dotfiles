import hashlib, io, os, subprocess, sys, json
ROOT = "/home/jofre/projects/luminous_ui"
os.chdir(ROOT)

def sha(b): return hashlib.sha256(b).hexdigest()

FILES = {
    "packages/engine/src/effects.ts": None,
    "packages/engine/src/interpreter.ts": None,
    "packages/engine/src/energyInPlaySuppressed.test.ts": None,
    "packages/engine/src/opponentHandScaling.test.ts": None,
}
ORIG = {f: open(f, "rb").read() for f in FILES}
for f, b in ORIG.items():
    print(f"BASELINE {f}: {len(b)} bytes sha256={sha(b)[:16]}")

def patch(path, find, repl):
    b = open(path, "rb").read()
    t = b.decode("utf-8")
    assert t.count(find) == 1, (path, t.count(find), find[:60])
    # literal replacement, never String.replace-style: split/join with a length assert
    parts = t.split(find)
    assert len(parts) == 2
    payload = (parts[0] + repl + parts[1]).encode("utf-8")   # ENCODE FIRST (D463)
    with open(path, "wb") as fh:
        fh.write(payload)

def vitest(files):
    r = subprocess.run(["bunx", "vitest", "run", "--pool=forks", "--maxWorkers=2", *files],
                       capture_output=True, text=True)
    return r.returncode

# The two engine mutations, one per LAYER.
READER_MUT = (
    "packages/engine/src/effects.ts",
    "    deriveAttackDamageBonus(trimmed) !== null\n  ) {\n    return { weakness: true };",
    "    deriveAttackDamageBonus(trimmed) !== null\n  ) {\n    return { resistance: true };",
)
EXEC_MUT = (
    "packages/engine/src/interpreter.ts",
    "      return countEnergyInPlay(state, seat, cond.energy) >= cond.count;",
    "      return countEnergyInPlay(state, otherSeat(seat), cond.energy) >= cond.count;",
)

CENSUS = ["packages/engine/src/censusAtHead.test.ts"]
POP    = ["packages/engine/src/opponentHandScaling.test.ts"]
SUITE  = ["packages/engine/src/energyInPlaySuppressed.test.ts"]

results = {}
try:
    for label, mut in (("READER (effects.ts arm → the wrong boolean)", READER_MUT),
                       ("EXECUTOR (interpreter.ts arm → the other seat)", EXEC_MUT)):
        patch(*mut)
        row = {}
        row["census (censusAtHead)"] = vitest(CENSUS)
        row["dual-claim POPULATION rung"] = vitest(POP)
        row["behavioural + value suite"] = vitest(SUITE)
        results[label] = row
        # restore this file before the next mutation
        with open(mut[0], "wb") as fh: fh.write(ORIG[mut[0]])
        print(f"\n== {label} ==")
        for k, v in row.items(): print(f"   {k:34s} {'RED' if v else 'green'}")
finally:
    for f, b in ORIG.items():
        with open(f, "wb") as fh: fh.write(b)
    ok = True
    for f, b in ORIG.items():
        now = open(f, "rb").read()
        same = len(now) == len(b) and sha(now) == sha(b)
        ok = ok and same
        print(f"RESTORED {f}: {len(now)} bytes sha256={sha(now)[:16]} {'OK' if same else '!!! MISMATCH'}")
    print("ALL RESTORED:", ok)
