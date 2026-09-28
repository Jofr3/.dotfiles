"""D214/D440/D469/D489/D491 — THE ATTRIBUTION CONTROL AT BOTH LAYERS.

Two mutations, each the NEAREST WRONG SIBLING at one layer, each run against each
candidate killer ALONE.  The file is restored from an in-memory backup in a
`finally`, and both its SIZE and its sha256 are asserted afterwards (D459/D462/D463).
"""
import hashlib, subprocess, sys, os

ROOT = "/home/jofre/projects/luminous_ui/"
SUITES = [
    "packages/engine/src/censusAtHead.test.ts",
    "packages/engine/src/derivedBenchSearch.test.ts",
    "packages/engine/src/derivedBenchSearchMove.test.ts",
    "packages/engine/src/compoundCompose.test.ts",
    "packages/engine/src/derivedSelfEnergyMove.test.ts",
]

MUTATIONS = [
    ("READER   (effects.ts, the deriver arm)",
     "packages/engine/src/effects.ts",
     '            destRecorded: "moved",\n',
     ''),
    ("EXECUTOR (interpreter.ts, the narrowing)",
     "packages/engine/src/interpreter.ts",
     "          (refPokemon(state, ref)?.stack ?? []).some((uid) => filed.has(uid)),",
     "          (refPokemon(state, ref)?.stack ?? []).length >= 0,"),
]

def run_suite(path):
    r = subprocess.run(["bunx", "vitest", "run", path], cwd=ROOT,
                       capture_output=True, text=True, timeout=600)
    return r.returncode

for label, rel, find, repl in MUTATIONS:
    path = ROOT + rel
    original = open(path, "rb").read()
    size0, sha0 = len(original), hashlib.sha256(original).hexdigest()
    text = original.decode("utf-8")
    n = text.count(find)
    if n != 1:
        sys.exit(f"{rel}: find occurs {n}× — refusing")
    print(f"\n### {label}")
    print(f"    baseline {rel}: {size0} bytes  sha256 {sha0[:16]}…")
    try:
        # FUNCTION replacement (D462: `String.replace` with a string interprets `$`)
        mutated = text.replace(find, repl, 1)
        assert mutated != text
        open(path, "wb").write(mutated.encode("utf-8"))
        for s in SUITES:
            code = run_suite(s)
            print(f"      {'RED  ' if code != 0 else 'green'}  {s.replace('packages/engine/src/', '')}")
    finally:
        open(path, "wb").write(original)
        back = open(path, "rb").read()
        print(f"    restored: {len(back)} bytes (expected {size0}) "
              f"sha256 {hashlib.sha256(back).hexdigest()[:16]}… "
              f"{'OK' if back == original else 'MISMATCH'}")
        assert len(back) == size0 and hashlib.sha256(back).hexdigest() == sha0
