import hashlib, os, subprocess
ROOT = "/home/jofre/projects/luminous_ui"; os.chdir(ROOT)
def sha(b): return hashlib.sha256(b).hexdigest()
F = "packages/engine/src/interpreter.ts"
ORIG = open(F, "rb").read()
CANDS = ["packages/engine/src/energyInPlay.test.ts",
         "packages/engine/src/basicEnergyDiscard.test.ts",
         "packages/engine/src/clauseApostrophe.test.ts",
         "packages/engine/src/typedEnergyThreshold.test.ts",
         "packages/engine/src/energyInPlaySuppressed.test.ts"]
MUTS = {
 "seat inverted": ("      return countEnergyInPlay(state, seat, cond.energy) >= cond.count;",
                   "      return countEnergyInPlay(state, otherSeat(seat), cond.energy) >= cond.count;"),
 "strict >":      ("      return countEnergyInPlay(state, seat, cond.energy) >= cond.count;",
                   "      return countEnergyInPlay(state, seat, cond.energy) > cond.count;"),
}
def patch(find, repl):
    t = ORIG.decode("utf-8"); parts = t.split(find); assert len(parts) == 2
    open(F, "wb").write((parts[0] + repl + parts[1]).encode("utf-8"))
try:
    for label, m in MUTS.items():
        patch(*m)
        print(f"\n== {label} ==")
        for c in CANDS:
            r = subprocess.run(["bunx","vitest","run","--pool=forks","--maxWorkers=2",c],
                               capture_output=True, text=True)
            print(f"   {c:56s} {'KILLS' if r.returncode else 'green'}")
        open(F, "wb").write(ORIG)
finally:
    open(F, "wb").write(ORIG)
    now = open(F, "rb").read()
    print("RESTORED", F, len(now), "bytes sha256=" + sha(now)[:16],
          "OK" if (len(now)==len(ORIG) and sha(now)==sha(ORIG)) else "!!! MISMATCH")
