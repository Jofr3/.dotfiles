import hashlib, subprocess, sys, os
ROOT = "/home/jofre/projects/luminous_ui"
os.chdir(ROOT)

def sha(p): return hashlib.sha256(open(p, "rb").read()).hexdigest()
def size(p): return os.path.getsize(p)

def run_suite(suite):
    r = subprocess.run(["bunx","vitest","run","--pool=forks","--maxWorkers=2",suite],
                       capture_output=True, text=True, timeout=900)
    return "RED  " if r.returncode != 0 else "green"

# (label, layer, file, find, replace)
MUTATIONS = [
  ("READER: the gated arm loses its seat", "reader",
   "packages/engine/src/effects.ts",
   '''  if (FLIP_HEADS_DEFENDER_CANT_ATTACK.test(effect)) {
    return [
      {
        op: "coinFlipGate",
        // biome-ignore lint/suspicious/noThenProperty: `then` is the effect contract's gated-step list, not a thenable (arrays are not callable).
        then: [{ op: "preventAttack", target: "defender" }],
      },
    ];
  }''',
   '''  if (FLIP_HEADS_DEFENDER_CANT_ATTACK.test(effect)) {
    return [
      {
        op: "coinFlipGate",
        // biome-ignore lint/suspicious/noThenProperty: `then` is the effect contract's gated-step list, not a thenable (arrays are not callable).
        then: [{ op: "preventAttack" }],
      },
    ];
  }'''),
  ("EXECUTOR: preventAttack crosses the table", "executor",
   "packages/engine/src/interpreter.ts",
   '  const seat = op.target === "defender" ? otherSeat(ctx.seat) : ctx.seat;',
   '  const seat = op.target === "defender" ? ctx.seat : otherSeat(ctx.seat);'),
]

SUITES = [
  "packages/engine/src/flipDefenderAttackLock.test.ts",
  "packages/engine/src/bareAttackLock.test.ts",
  "packages/engine/src/defenderLock.test.ts",
  "packages/engine/src/censusAtHead.test.ts",
  "packages/engine/src/compoundCompose.test.ts",
  "packages/engine/src/attackLock.test.ts",
]

for label, layer, path, find, repl in MUTATIONS:
    original = open(path, "rb").read()
    s0, h0 = size(path), sha(path)
    text = original.decode("utf-8")
    n = text.count(find)
    if n != 1:
        print(f"!! {label}: find occurs {n}×  — SKIPPED"); continue
    try:
        parts = text.split(find)
        assert len(parts) == 2
        open(path, "wb").write((parts[0] + repl + parts[1]).encode("utf-8"))
        assert sha(path) != h0, "mutation was inert"
        print(f"\n=== {label}  [{layer} layer]")
        for suite in SUITES:
            print(f"   {run_suite(suite)}  {suite}")
    finally:
        open(path, "wb").write(original)
        print(f"   restored: size {size(path)} == {s0} -> {size(path)==s0}; "
              f"sha256 {sha(path)[:16]}… == {h0[:16]}… -> {sha(path)==h0}")
