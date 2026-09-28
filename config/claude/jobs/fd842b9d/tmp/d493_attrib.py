import hashlib, io, subprocess, sys

EFFECTS = "packages/engine/src/effects.ts"
ATTACK  = "packages/engine/src/attack.ts"

READER_FIND = "  ) {\n    return { weakness: true };\n  }\n  const match = DAMAGE_SUPPRESSION.exec(trimmed);"
READER_REPL = "  ) {\n    return { weakness: true, resistance: true };\n  }\n  const match = DAMAGE_SUPPRESSION.exec(trimmed);"
EXEC_FIND   = "      damageSuppression?.weakness === true ||"
EXEC_REPL   = "      damageSuppression?.resistance === true ||"

WITNESSES = {
  "CENSUS  censusAtHead.test.ts":            "packages/engine/src/censusAtHead.test.ts",
  "CENSUS  compoundCompose.test.ts":         "packages/engine/src/compoundCompose.test.ts",
  "READER  benchNounScaling.test.ts §10":    "packages/engine/src/benchNounScaling.test.ts",
  "READER  opponentHandScaling.test.ts §2":  "packages/engine/src/opponentHandScaling.test.ts",
  "READER  damageSuppression.test.ts":       "packages/engine/src/damageSuppression.test.ts",
  "BEHAV.  benchCounterSuppressed.test.ts":  "packages/engine/src/benchCounterSuppressed.test.ts",
}

def sha(p): return hashlib.sha256(io.open(p,"rb").read()).hexdigest()
def size(p): return len(io.open(p,"rb").read())

def patch(path, find, repl):
    src = io.open(path, encoding="utf-8").read()
    parts = src.split(find)
    assert len(parts) == 2, f"{path}: find occurs {len(parts)-1}x"   # D470: split/join, never str.replace
    out = repl.join(parts)
    assert out != src
    io.open(path, "wb").write(out.encode("utf-8"))

def run_one(suite):
    r = subprocess.run(["bunx","vitest","run",suite,"--pool=forks","--maxWorkers=1"],
                       capture_output=True, text=True)
    return "GREEN" if r.returncode == 0 else "RED"

def control(label, path, find, repl):
    before_sha, before_size = sha(path), size(path)
    backup = io.open(path,"rb").read()
    print(f"\n=== ATTRIBUTION CONTROL — {label} ===")
    print(f"    file {path}  sha256 {before_sha[:16]}…  {before_size} bytes")
    try:
        patch(path, find, repl)
        print(f"    mutated: sha256 {sha(path)[:16]}…  {size(path)} bytes")
        for name, suite in WITNESSES.items():
            print(f"      {name:42s} -> {run_one(suite)}")
    finally:
        io.open(path,"wb").write(backup)                # never git; the bytes are held
        after_sha, after_size = sha(path), size(path)
        ok = after_sha == before_sha and after_size == before_size
        print(f"    RESTORED: sha256 {after_sha[:16]}…  {after_size} bytes  MATCH={ok}")
        if not ok: sys.exit(2)

control("LAYER 1, the READER — the new arm emits the NEIGHBOURING pair {weakness, resistance}",
        EFFECTS, READER_FIND, READER_REPL)
control("LAYER 2, the EXECUTOR — attack.ts's §8.5 Weakness step reads the WRONG boolean",
        ATTACK, EXEC_FIND, EXEC_REPL)
print("\nBASELINE (unmutated), the same six witnesses:")
for name, suite in WITNESSES.items():
    print(f"      {name:42s} -> {run_one(suite)}")
