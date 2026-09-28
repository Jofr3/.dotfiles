import hashlib, io, json, os, subprocess, sys

ROOT = "/home/jofre/projects/luminous_ui"
TARGET = os.path.join(ROOT, "packages/engine/src/effects.ts")

FIND = '''      if (costNarrowing !== undefined) {
        return [
          { op: "discardEnergy", from: "yourActive", filter, count: cost },
          {
            op: "damageChosen",
            target: benchSide,
            amount: hit,
            count: bodies,
            source: "attack",
            deals: true,
            filter: costNarrowing,
          },
        ];
      }
'''
REPLACE = ""

def digest(path):
    b = io.open(path, "rb").read()
    return len(b), hashlib.sha256(b).hexdigest()

original = io.open(TARGET, "rb").read()
size0, sha0 = len(original), hashlib.sha256(original).hexdigest()
print(f"BEFORE  size={size0} sha256={sha0}")

results = {}
try:
    src = original.decode("utf-8")
    assert src.count(FIND) == 1, src.count(FIND)
    # ENCODE FIRST, WRITE SECOND (D463) — `open(p,"w")` truncates before `.write()` runs.
    patched = src.replace(FIND, REPLACE, 1).encode("utf-8")
    io.open(TARGET, "wb").write(patched)
    ps, pss = digest(TARGET)
    print(f"PATCHED size={ps} sha256={pss}  (delta {ps - size0} bytes)")
    assert pss != sha0
    for suite in [
        "packages/engine/src/classNarrowedBenchSnipe.test.ts",
        "packages/engine/src/costBenchSnipe.test.ts",
    ]:
        r = subprocess.run(["npx", "vitest", "run", suite], cwd=ROOT,
                           capture_output=True, text=True, timeout=900)
        red = r.returncode != 0
        results[suite] = "RED" if red else "GREEN (would NOT have killed it alone)"
        print(f"  {suite}: {results[suite]}")
finally:
    io.open(TARGET, "wb").write(original)
    s1, sh1 = digest(TARGET)
    print(f"RESTORED size={s1} sha256={sh1}")
    print("RESTORE OK" if (s1, sh1) == (size0, sha0) else "🛑 RESTORE MISMATCH")
