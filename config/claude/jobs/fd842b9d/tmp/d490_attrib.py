import hashlib, io, os, subprocess, sys
P = "/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts"
orig = open(P, "rb").read()
before = (len(orig), hashlib.sha256(orig).hexdigest())
FIND = b'        { op: "discardDeckTop", whose: "eachPlayer", count: 1, recordAs: "discarded" },'
REPL = b'        { op: "discardDeckTop", whose: "self", count: 1, recordAs: "discarded" },'
assert orig.count(FIND) == 1, orig.count(FIND)
try:
    open(P, "wb").write(REPL.join(orig.split(FIND)))
    SUITES = [
        "packages/engine/src/censusAtHead.test.ts",
        "packages/engine/src/compoundCompose.test.ts",
        "packages/engine/src/clauseApostrophe.test.ts",
        "packages/engine/src/precociousEvolution.test.ts",
        "packages/engine/src/eachDeckMillBoost.test.ts",
        "packages/engine/src/deckMillFilteredScale.test.ts",
        "packages/engine/src/benchDiscardBoost.test.ts",
        "packages/engine/src/discardScaledDamage.test.ts",
        "packages/engine/src/deckTopMill.test.ts",
        "packages/engine/src/exOnlyActive.test.ts",
        "packages/engine/src/sawkRequirementSplit.test.ts",
    ]
    for s in SUITES:
        r = subprocess.run(["bunx", "vitest", "run", s], cwd="/home/jofre/projects/luminous_ui",
                           capture_output=True, text=True)
        tail = [l for l in (r.stdout + r.stderr).split("\n") if l.strip().startswith("Tests ")]
        print(f"{'RED  ' if r.returncode != 0 else 'GREEN'}  {s}   {tail[-1].strip() if tail else '?'}")
finally:
    open(P, "wb").write(orig)
    now = open(P, "rb").read()
    after = (len(now), hashlib.sha256(now).hexdigest())
    print("\nRESTORED:", "size", before[0], "==", after[0], before[0] == after[0],
          "| sha256", before[1][:16], "==", after[1][:16], before[1] == after[1])
