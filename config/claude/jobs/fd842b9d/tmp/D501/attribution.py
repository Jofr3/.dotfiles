"""D501 — THE ATTRIBUTION CONTROL AT BOTH LAYERS (D214/D469/D489/D490/D491).

Each killer is run ALONE. The originals are held in memory and written back in a
`finally`; both SIZE and SHA256 are verified against the pre-patch bytes before the
script exits (D459/D462: a patch script must assert its own file after writing).
`find`-split/join with a length assertion rather than str.replace — D462's rule
carried across languages (D470): Python's str.replace never interprets `$`, but the
substitution must still be asserted to have happened.
"""
import hashlib, pathlib, subprocess, sys

ROOT = pathlib.Path("/home/jofre/projects/luminous_ui")

LAYERS = {
    "census (censusAtHead)":              ["packages/engine/src/censusAtHead.test.ts"],
    "loud controls / refusal witnesses":  ["packages/engine/src/defenderStatusTriple.test.ts",
                                           "packages/engine/src/flipStatusEnergyDiscard.test.ts",
                                           "packages/engine/src/checkup.test.ts"],
    "reader-value re-point (D501 §1-§3)": ["packages/engine/src/confusionDamage.test.ts"],
    "behavioural (D501 §4-§8)":           ["packages/engine/src/confusionDamage.test.ts"],
}

MUTATIONS = {
    "READER   (arm emits the POISON rider — the nearest wrong sibling)": (
        "packages/engine/src/effects.ts",
        "          confusionDamage: counters * 10,",
        "          poisonDamage: counters * 10,",
    ),
    "EXECUTOR (attack.ts reads a hard-coded 30 — the pre-slice build)": (
        "packages/engine/src/attack.ts",
        "      const confusionDamage = active.conditions.confusionDamage;",
        "      const confusionDamage = 30;",
    ),
}

def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()

def run(files, name_filter=None):
    cmd = ["bunx", "vitest", "run", "--pool=forks", "--maxWorkers=2", *files]
    if name_filter: cmd += ["-t", name_filter]
    r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    return "RED " if r.returncode != 0 else "green"

originals = {}
try:
    for label, (rel, find, repl) in MUTATIONS.items():
        p = ROOT / rel
        before_bytes, before_sha, before_size = p.read_bytes(), sha(p), p.stat().st_size
        originals[rel] = (before_bytes, before_sha, before_size)
        parts = before_bytes.decode("utf-8").split(find)
        assert len(parts) == 2, f"find occurs {len(parts)-1}× in {rel}"
        p.write_bytes(repl.join(parts).encode("utf-8"))
        assert p.read_text(encoding="utf-8").count(repl) == 1
        print(f"\n### {label}")
        for layer, files in LAYERS.items():
            nf = "§1|§2|§3" if layer.startswith("reader-value") else ("§4|§5|§6|§7|§8" if layer.startswith("behavioural") else None)
            print(f"   {run(files, nf)}  {layer}")
        p.write_bytes(before_bytes)
        assert sha(p) == before_sha and p.stat().st_size == before_size
finally:
    bad = []
    for rel, (b, s, size) in originals.items():
        p = ROOT / rel
        p.write_bytes(b)
        if sha(p) != s or p.stat().st_size != size: bad.append(rel)
    print("\n### RESTORE VERIFIED (size AND sha256):", "ALL CLEAN" if not bad else f"MISMATCH {bad}")
    for rel, (_, s, size) in originals.items():
        p = ROOT / rel
        print(f"   {rel}: {p.stat().st_size} bytes, sha256 {sha(p)[:16]}…  expected {size} / {s[:16]}…")
