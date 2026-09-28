"""The ORDERING claim, driven: with `BENCH_SEARCH_TAIL`'s `$` dropped
(`D230-anchor-drops-the-tail`, authored at D230 and whose own `what` names THIS
printing as its witness), the head anchor claims D502's sentence FIRST and drops its
§9.2 tail — so both suites must redden."""
import hashlib, subprocess, sys
ROOT = "/home/jofre/projects/luminous_ui/"
rel = "packages/engine/src/effects.ts"
find = 'const BENCH_SEARCH_TAIL = " onto your Bench\\\\. Then, shuffle your deck\\\\.$";'
repl = 'const BENCH_SEARCH_TAIL = " onto your Bench\\\\. Then, shuffle your deck\\\\.";'
path = ROOT + rel
original = open(path, "rb").read()
size0, sha0 = len(original), hashlib.sha256(original).hexdigest()
text = original.decode("utf-8")
if text.count(find) != 1:
    sys.exit(f"find occurs {text.count(find)}×")
print(f"baseline: {size0} bytes sha256 {sha0[:16]}…")
try:
    open(path, "wb").write(text.replace(find, repl, 1).encode("utf-8"))
    # …and confirm the mutation really re-points THIS sentence, by asking the reader.
    probe = subprocess.run(
        ["bun", "-e",
         'const {deriveAttackEffect}=await import("./packages/engine/src/effects.ts");'
         'const S="Search your deck for a Basic Pokémon and put it onto your Bench. Then, shuffle your deck. '
         'If you put any Pokémon onto your Bench in this way, move an Energy from this Pokémon to the new Benched Pokémon.";'
         'console.log(JSON.stringify((deriveAttackEffect(S)??[]).map(o=>o.op)));'],
        cwd=ROOT, capture_output=True, text=True, timeout=300)
    print("  under the mutation, the sentence derives to:", probe.stdout.strip() or probe.stderr.strip()[:200])
    for s in ["packages/engine/src/derivedBenchSearch.test.ts",
              "packages/engine/src/derivedBenchSearchMove.test.ts"]:
        code = subprocess.run(["bunx", "vitest", "run", s], cwd=ROOT,
                              capture_output=True, text=True, timeout=600).returncode
        print(f"  {'RED  ' if code else 'green'}  {s.replace('packages/engine/src/','')}")
finally:
    open(path, "wb").write(original)
    back = open(path, "rb").read()
    print(f"restored: {len(back)} bytes sha256 {hashlib.sha256(back).hexdigest()[:16]}… "
          f"{'OK' if back == original else 'MISMATCH'}")
    assert back == original
