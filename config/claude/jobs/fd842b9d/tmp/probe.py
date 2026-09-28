import subprocess, sys, os, json
ROOT="/home/jofre/projects/luminous_ui"
P=os.path.join(ROOT,"packages/engine/src/censusAttackCorpus.ts")

PRED='      if (name.startsWith("deriveAttack") && typeof value === "function") {'
SORT='    found.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));'
MEMO='  if (SURFACE === null) {'

MUTS={
 "R1-prefix-conjunct-dropped": (PRED,'      if (typeof value === "function") {'),
 "R2-prefix-narrowed":         (PRED,'      if (name.startsWith("deriveAttackDamage") && typeof value === "function") {'),
 "R3-sort-inverted":           (SORT,'    found.sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0));'),
 "R4-sort-dropped":            (SORT,'    // D497 probe: sort removed'),
 "S1-typeof-conjunct-dropped": (PRED,'      if (name.startsWith("deriveAttack")) {'),
 "S2-memo-always-recomputes":  (MEMO,'  if (true) {'),
 "X-includes-not-startsWith":  (PRED,'      if (name.includes("deriveAttack") && typeof value === "function") {'),
}

name=sys.argv[1]; suites=sys.argv[2:]
find,repl=MUTS[name]
orig=open(P,encoding="utf-8").read()
n=orig.count(find)
assert n==1, f"find occurs {n}x — refusing"
assert find!=repl, "find === replace — inert by construction"
# literal, non-$-interpreting replacement via split/join (D470/D465 rule)
parts=orig.split(find)
assert len(parts)==2, "split did not yield 2 parts"
mutated=parts[0]+repl+parts[1]
assert mutated!=orig
try:
    payload=mutated.encode("utf-8")          # ENCODE FIRST (D463)
    with open(P,"wb") as fh: fh.write(payload)
    got=open(P,encoding="utf-8").read()
    assert len(got)==len(mutated), "size mismatch after write"
    print(f"### {name}: patched ({len(orig)} -> {len(mutated)} bytes)", flush=True)
    for s in suites:
        r=subprocess.run(["bunx","vitest","run","--pool=forks","--maxWorkers=2",
                          f"packages/engine/src/{s}.test.ts"],cwd=ROOT,
                          capture_output=True,text=True)
        out=r.stdout+r.stderr
        verdict="RED" if r.returncode!=0 else "GREEN"
        print(f"--- {s}: {verdict} (exit {r.returncode})", flush=True)
        if verdict=="RED":
            lines=out.splitlines()
            # first FAIL block + first AssertionError context
            for i,l in enumerate(lines):
                if l.strip().startswith("FAIL") or "AssertionError" in l:
                    print("\n".join(lines[i:i+14])); break
        else:
            for l in out.splitlines():
                if "Tests " in l or "Test Files" in l: print("    "+l.strip())
finally:
    payload=orig.encode("utf-8")
    with open(P,"wb") as fh: fh.write(payload)
    back=open(P,encoding="utf-8").read()
    assert back==orig, "RESTORE FAILED"
    print(f"### {name}: restored, {len(back)} bytes", flush=True)
