#!/usr/bin/env python3
"""D500 attribution control, at BOTH layers, each killer alone.

Rule set obeyed here:
  · D459/D496 — a probe that patches a source file restores it in a `finally`.
  · D470/D496 — the patch is LITERAL (split/join with a len==2 assertion); Python's
    str.replace never interprets `$`, and a function argument would TypeError.
  · D463     — ENCODE FIRST, WRITE SECOND: the bytes are built before open(w).
  · D496     — size AND sha256 verified after restore, against the pre-probe values.
"""
import hashlib, io, json, os, subprocess, sys

ROOT = "/home/jofre/projects/luminous_ui"
JOB = "/home/jofre/.claude/jobs/fd842b9d/tmp"

LAYERS = [
    # (label, file, find, replace, which layer the mutation lives in)
    ("READER  (the vocabulary row takes its neighbour's value)",
     "packages/engine/src/effects.ts",
     '  ["Basic", "basic"] as [string, BasicEnergyType | "special" | "basic"],',
     '  ["Basic", "special"] as [string, BasicEnergyType | "special" | "basic"],'),
    ("EVALUATOR (the category arm reads PROVISION)",
     "packages/engine/src/continuous.ts",
     '  return pokemon.energy.filter((uid) => matchesFilter(cardOfUid(state, uid), BASIC_ENERGY_CARD));',
     '  return pokemon.energy.filter((uid) => providesEnergyType(state, pokemon, uid, "Water"));'),
]

WITNESSES = [
    ("census            (censusAtHead.test.ts)", "packages/engine/src/censusAtHead.test.ts"),
    ("reader-value      (selfEnergyScaling.test.ts)", "packages/engine/src/selfEnergyScaling.test.ts"),
    ("behavioural       (basicEnergyScaling.test.ts)", "packages/engine/src/basicEnergyScaling.test.ts"),
    ("loud controls     (boardWideEnergyScaling.test.ts)", "packages/engine/src/boardWideEnergyScaling.test.ts"),
]

def digest(path):
    b = io.open(path, "rb").read()
    return len(b), hashlib.sha256(b).hexdigest()

def run_suite(rel):
    p = subprocess.run(
        ["npx", "vitest", "run", "--pool=forks", rel],
        cwd=ROOT, capture_output=True, text=True, timeout=900,
    )
    return "RED " if p.returncode != 0 else "green"

def main():
    pre = {f: digest(os.path.join(ROOT, f)) for _, f, _, _ in LAYERS}
    io.open(os.path.join(JOB, "D500-attrib-pre.json"), "w").write(json.dumps(pre, indent=1))
    results = []
    for label, rel, find, repl in LAYERS:
        abs_path = os.path.join(ROOT, rel)
        original = io.open(abs_path, encoding="utf-8").read()
        parts = original.split(find)
        assert len(parts) == 2, f"find occurs {len(parts)-1}x in {rel}"
        patched = repl.join(parts)          # ENCODE FIRST
        assert patched != original
        try:
            io.open(abs_path, "w", encoding="utf-8").write(patched)   # WRITE SECOND
            row = [label]
            for wlabel, wrel in WITNESSES:
                verdict = run_suite(wrel)
                row.append(f"{wlabel}: {verdict}")
                print(f"  [{label[:9]}] {wlabel} -> {verdict}", flush=True)
            results.append(row)
        finally:
            io.open(abs_path, "w", encoding="utf-8").write(original)
            n, h = digest(abs_path)
            assert (n, h) == pre[rel], f"RESTORE MISMATCH on {rel}: {(n,h)} != {pre[rel]}"
            print(f"  restored {rel}: {n} bytes, sha256 {h[:16]}… OK", flush=True)
    io.open(os.path.join(JOB, "D500-attrib.json"), "w").write(json.dumps(results, indent=1))
    print(json.dumps(results, indent=1))

main()
