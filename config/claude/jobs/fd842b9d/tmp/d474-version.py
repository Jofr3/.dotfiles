import os, subprocess
ROOT = "/home/jofre/projects/luminous_ui"
OLD, NEW = "0.371.0", "0.372.0"
# Files EXCLUDED because their hit records a PREVIOUS bump (D443) or is this slice's own.
EXCLUDE = {
    "packages/engine/src/handCostDraw.test.ts",   # "// 0.370.0 → 0.371.0" — history
    "packages/engine/src/inPlayFlipCount.test.ts",# "// 0.371.0 → 0.372.0" — this slice's own header
}
out = subprocess.run(["git", "grep", "-l", OLD, "--", "*.ts", "*.tsx", "*.json"],
                     cwd=ROOT, capture_output=True, text=True)
files = [f for f in out.stdout.split("\n") if f]
total_before = 0
touched = []
for rel in files:
    if rel in EXCLUDE:
        print("SKIP (history/own):", rel, open(os.path.join(ROOT, rel), encoding="utf-8").read().count(OLD))
        continue
    p = os.path.join(ROOT, rel)
    text = open(p, encoding="utf-8").read()
    n = text.count(OLD)
    total_before += n
    payload = text.replace(OLD, NEW).encode("utf-8")
    with open(p, "wb") as fh:
        fh.write(payload)
    after = open(p, encoding="utf-8").read()
    assert after.count(OLD) == 0 and after.count(NEW) >= n, rel
    touched.append((rel, n))
for rel, n in touched:
    print(f"  {n}x  {rel}")
print("FILES", len(touched), "OCCURRENCES", total_before)
