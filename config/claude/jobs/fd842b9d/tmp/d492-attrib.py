import hashlib, os, subprocess, sys

ROOT = "/home/jofre/projects/luminous_ui"

CASES = [
    (
        "READER (effects.ts arm emits the wrong scope)",
        "packages/engine/src/effects.ts",
        '          op: "damageChosen",\n          target: "opponentAny",\n          amount,\n          count: "all",',
        '          op: "damageChosen",\n          target: "opponentBench",\n          amount,\n          count: "all",',
    ),
    (
        "EXECUTOR (interpreter.ts reads `all` as an arity of one)",
        "packages/engine/src/interpreter.ts",
        '      const ceiling = op.count === "all" ? candidates.length : op.count;',
        '      const ceiling = op.count === "all" ? 1 : op.count;',
    ),
]

SUITES = [
    ("census        ", "packages/engine/src/censusAtHead.test.ts"),
    ("reader value  ", "packages/engine/src/classNarrowedBenchSnipe.test.ts"),
    ("loud control  ", "packages/engine/src/boardWideSpread.test.ts"),
    ("behavioural   ", "packages/engine/src/classedBoardSpread.test.ts"),
]


def sha(p):
    return hashlib.sha256(open(p, "rb").read()).hexdigest()


for label, rel, find, repl in CASES:
    p = os.path.join(ROOT, rel)
    original = open(p, "rb").read()
    size0, sha0 = len(original), hashlib.sha256(original).hexdigest()
    text = original.decode("utf-8")
    assert text.count(find) == 1, (rel, text.count(find))
    parts = text.split(find)
    assert len(parts) == 2
    print(f"\n### {label}")
    try:
        open(p, "wb").write((parts[0] + repl + parts[1]).encode("utf-8"))
        assert open(p, encoding="utf-8").read().count(repl) >= 1
        for name, suite in SUITES:
            r = subprocess.run(
                ["bunx", "vitest", "run", "--pool=forks", "--maxWorkers=2", suite],
                capture_output=True, text=True, cwd=ROOT,
            )
            verdict = "RED  " if r.returncode != 0 else "green"
            print(f"    {name} {verdict}  {suite}")
    finally:
        open(p, "wb").write(original)
        size1, sha1 = os.path.getsize(p), sha(p)
        print(f"    restored: size {size0} -> {size1} ({'OK' if size0 == size1 else 'MISMATCH'}), "
              f"sha256 {sha0[:16]}… -> {sha1[:16]}… ({'OK' if sha0 == sha1 else 'MISMATCH'})")
        if sha0 != sha1:
            sys.exit(1)
