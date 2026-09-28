import hashlib, os, subprocess
ROOT = "/home/jofre/projects/luminous_ui"; os.chdir(ROOT)
def sha(b): return hashlib.sha256(b).hexdigest()
FILES = ["packages/engine/src/effects.ts", "packages/engine/src/interpreter.ts"]
ORIG = {f: open(f, "rb").read() for f in FILES}
def patch(path, find, repl):
    t = open(path, "rb").read().decode("utf-8")
    parts = t.split(find); assert len(parts) == 2, (path, len(parts))
    open(path, "wb").write((parts[0] + repl + parts[1]).encode("utf-8"))
def vitest(files, name=None):
    a = ["bunx", "vitest", "run", "--pool=forks", "--maxWorkers=2", *files]
    if name: a += ["-t", name]
    r = subprocess.run(a, capture_output=True, text=True)
    return ("RED" if r.returncode else "green"), r.stdout
SUITE = ["packages/engine/src/energyInPlaySuppressed.test.ts"]
TYPED = ["packages/engine/src/typedEnergyThreshold.test.ts"]
MUTS = {
  "READER   (suppression arm → wrong boolean)": (FILES[0],
    "    deriveAttackDamageBonus(trimmed) !== null\n  ) {\n    return { weakness: true };",
    "    deriveAttackDamageBonus(trimmed) !== null\n  ) {\n    return { resistance: true };"),
  "READER   (clause row → the neighbour's type)": (FILES[0],
    '  ["you have 3 or more Energy in play", { kind: "yourEnergyInPlayAtLeast", energy: null, count: 3 }],',
    '  ["you have 3 or more Energy in play", { kind: "yourEnergyInPlayAtLeast", energy: "Darkness", count: 3 }],'),
  "EXECUTOR (conditionHolds arm → the other seat)": (FILES[1],
    "      return countEnergyInPlay(state, seat, cond.energy) >= cond.count;",
    "      return countEnergyInPlay(state, otherSeat(seat), cond.energy) >= cond.count;"),
  "EXECUTOR (conditionHolds arm → strict >)": (FILES[1],
    "      return countEnergyInPlay(state, seat, cond.energy) >= cond.count;",
    "      return countEnergyInPlay(state, seat, cond.energy) > cond.count;"),
}
try:
    print(f"{'mutation':46s} {'§2 VALUE':10s} {'§5 BOARD':10s} {'typedEnergyThreshold':20s}")
    for label, m in MUTS.items():
        patch(*m)
        v, _ = vitest(SUITE, "TWO readers own it")
        b, _ = vitest(SUITE, "the board")
        t, _ = vitest(TYPED)
        print(f"{label:46s} {v:10s} {b:10s} {t:20s}")
        open(m[0], "wb").write(ORIG[m[0]])
finally:
    ok = True
    for f, b in ORIG.items():
        open(f, "wb").write(b)
        now = open(f, "rb").read()
        s = len(now) == len(b) and sha(now) == sha(b); ok = ok and s
        print(f"RESTORED {f}: {len(now)} bytes sha256={sha(now)[:16]} {'OK' if s else '!!! MISMATCH'}")
    print("ALL RESTORED:", ok)
