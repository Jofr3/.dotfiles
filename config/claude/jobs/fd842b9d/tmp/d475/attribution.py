import hashlib, os, subprocess, sys

P = "packages/engine/src/effects.ts"
FIND = '    return per >= 1 ? { kind: "perHeads", flips: { kind: "bothActivesEnergy" }, per } : null;'
REPL = ('    return per >= 1\n'
        '      ? { kind: "perHeads", flips: { kind: "attachedEnergy", energy: null }, per }\n'
        '      : null;')

OBSERVERS = [
    # the three the row NAMES as killers
    "packages/engine/src/bothActivesFlipCount.test.ts",
    "packages/engine/src/selfEnergyScaling.test.ts",
    "packages/engine/src/inPlayFlipCount.test.ts",
    # the suites that MUST stay green — five census instruments and the three
    # pre-existing coin suites (D469: a census measures whether a sentence is
    # CLAIMED, never whether it is claimed CORRECTLY)
    "packages/engine/src/censusAtHead.test.ts",
    "packages/engine/src/compoundCompose.test.ts",
    "packages/engine/src/exOnlyActive.test.ts",
    "packages/engine/src/defenderStatusTriple.test.ts",
    "packages/engine/src/selfDamagePerCounter.test.ts",
    "packages/engine/src/perEnergyFlip.test.ts",
    "packages/engine/src/multiCoinFlip.test.ts",
    "packages/engine/src/coinFlipDamage.test.ts",
    "packages/engine/src/untilTailsFlip.test.ts",
]

orig_bytes = open(P, "rb").read()
size0, sha0 = len(orig_bytes), hashlib.sha256(orig_bytes).hexdigest()
print(f"BEFORE  size={size0}  sha256={sha0}")

try:
    text = orig_bytes.decode("utf-8")
    # 🛑 Python's str.replace REJECTS a function second argument, so the safe form is
    # find-split + join with a len(parts) == 2 assertion (conventions, D462's rule
    # carried across languages).
    parts = text.split(FIND)
    assert len(parts) == 2, f"find occurs {len(parts)-1}x"
    payload = REPL.join(parts).encode("utf-8")   # ENCODE FIRST (D463)
    with open(P, "wb") as fh:
        fh.write(payload)
    mut = open(P, "rb").read()
    print(f"MUTATED size={len(mut)}  sha256={hashlib.sha256(mut).hexdigest()}")
    for suite in OBSERVERS:
        r = subprocess.run(["bunx", "vitest", "run", "--pool=forks", "--maxWorkers=2", suite],
                           capture_output=True, text=True)
        out = r.stdout + r.stderr
        line = [l for l in out.split("\n") if l.strip().startswith("Tests ")]
        verdict = "RED " if r.returncode != 0 else "green"
        print(f"  {verdict}  {os.path.basename(suite):38s} {line[-1].strip() if line else '(no summary)'}")
finally:
    with open(P, "wb") as fh:
        fh.write(orig_bytes)
    back = open(P, "rb").read()
    print(f"AFTER   size={len(back)}  sha256={hashlib.sha256(back).hexdigest()}")
    print("RESTORED IDENTICAL:", len(back) == size0 and hashlib.sha256(back).hexdigest() == sha0)
