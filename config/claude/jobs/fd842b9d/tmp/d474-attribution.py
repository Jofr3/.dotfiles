import subprocess, hashlib, sys
ROOT = "/home/jofre/projects/luminous_ui"
P = ROOT + "/packages/engine/src/effects.ts"

# THE CENTRAL ROW: D474-arm-emits-the-neighbouring-flip-member — the NEAREST WRONG
# SIBLING (requirement 3). Under it the sentence still READS, resolvedByAnyReader is
# still true, RESIDUE still falls 1/2 and BUILT.attack still steps 2.
FIND = ('    return filter !== null && per >= 1\n'
        '      ? { kind: "perHeads", flips: { kind: "pokemonInPlay", filter }, per }\n'
        '      : null;')
REPL = ('    return filter !== null && per >= 1\n'
        '      ? { kind: "perHeads", flips: { kind: "attachedEnergy", energy: null }, per }\n'
        '      : null;')

CANDIDATES = [
    "packages/engine/src/inPlayFlipCount.test.ts",   # this slice's own suite
    "packages/engine/src/censusAtHead.test.ts",      # census — must stay GREEN
    "packages/engine/src/compoundCompose.test.ts",   # census — must stay GREEN
    "packages/engine/src/exOnlyActive.test.ts",      # census — must stay GREEN
    "packages/engine/src/sawkRequirementSplit.test.ts",  # census — must stay GREEN
    "packages/engine/src/precociousEvolution.test.ts",   # census — must stay GREEN
    "packages/engine/src/perEnergyFlip.test.ts",     # the SHIPPED member's own suite
    "packages/engine/src/multiCoinFlip.test.ts",
    "packages/engine/src/coinFlipDamage.test.ts",
]

orig = open(P, "rb").read()
sha_before = hashlib.sha256(orig).hexdigest()
print(f"baseline  size={len(orig)}  sha256={sha_before}")
text = orig.decode("utf-8")
parts = text.split(FIND)
assert len(parts) == 2, f"find occurs {len(parts) - 1}x"
assert FIND != REPL

results = {}
try:
    payload = REPL.join(parts).encode("utf-8")
    with open(P, "wb") as fh:
        fh.write(payload)
    mutated = open(P, "rb").read()
    assert mutated != orig, "the write was a no-op"
    print(f"mutated   size={len(mutated)}  sha256={hashlib.sha256(mutated).hexdigest()}")
    for suite in CANDIDATES:
        r = subprocess.run(
            ["bunx", "vitest", "run", "--pool=forks", "--maxWorkers=2", suite],
            cwd=ROOT, capture_output=True, text=True, timeout=600,
        )
        verdict = "RED " if r.returncode != 0 else "GREEN"
        tail = [l for l in r.stdout.split("\n") if l.strip().startswith("Tests")]
        results[suite] = (verdict, tail[-1].strip() if tail else "")
        print(f"  {verdict}  {suite}   {results[suite][1]}")
finally:
    with open(P, "wb") as fh:
        fh.write(orig)
    now = open(P, "rb").read()
    sha_after = hashlib.sha256(now).hexdigest()
    print(f"restored  size={len(now)}  sha256={sha_after}")
    print("IDENTICAL BY SIZE AND SHA256" if (len(now) == len(orig) and sha_after == sha_before) else "🛑 MISMATCH")
