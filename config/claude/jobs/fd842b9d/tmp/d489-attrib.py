import hashlib, io, os, subprocess, sys
ROOT = "/home/jofre/projects/luminous_ui"
P = os.path.join(ROOT, "packages/engine/src/effects.ts")
orig = io.open(P, "rb").read()
sha0 = hashlib.sha256(orig).hexdigest(); size0 = len(orig)
print(f"BASELINE  size={size0}  sha256={sha0}")

# The central arm broken at its NEAREST WRONG SIBLING: arm 9b (D401) reads the
# printed self-discard head as `discardEnergy { from: "yourActive" }`. Reading THIS
# sentence's hand head that way is the mistake an author copying the neighbour makes.
FIND = b'''          op: "payFromHand",
          count: "any",
          cap,
          to: "discard",
          filter: { kind: "anyEnergy" },
          recordAs: "discarded",'''
REPL = b'''          op: "discardEnergy",
          from: "yours",
          filter: { kind: "anyEnergy" },
          count: "any",
          cap,
          recordAs: "discarded",'''
assert orig.count(FIND) == 1, orig.count(FIND)

SUITES = [
  "packages/engine/src/handDiscardScaledSnipe.test.ts",
  "packages/engine/src/handEnergyCancel.test.ts",
  "packages/engine/src/discardScaledDamage.test.ts",
  "packages/engine/src/scaledAnySnipe.test.ts",
  "packages/engine/src/anyTargetSnipe.test.ts",
  "packages/engine/src/censusAtHead.test.ts",
  "packages/engine/src/deckMillFilteredScale.test.ts",
  "packages/engine/src/payFromHand.test.ts",
]
try:
    payload = orig.replace(FIND, REPL, 1)
    with open(P, "wb") as fh: fh.write(payload)
    cur = io.open(P, "rb").read()
    print(f"MUTATED   size={len(cur)}  sha256={hashlib.sha256(cur).hexdigest()}  (delta {len(cur)-size0} bytes)")
    for s in SUITES:
        r = subprocess.run(["bunx","vitest","run","--pool=forks","--maxWorkers=2",s],
                           cwd=ROOT, capture_output=True, text=True)
        verdict = "RED " if r.returncode != 0 else "green"
        print(f"  {verdict}  {s}")
finally:
    with open(P, "wb") as fh: fh.write(orig)
    back = io.open(P, "rb").read()
    print(f"RESTORED  size={len(back)}  sha256={hashlib.sha256(back).hexdigest()}  identical={back == orig}")
