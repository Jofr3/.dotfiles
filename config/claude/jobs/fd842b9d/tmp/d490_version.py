import io, os, subprocess, sys
ROOT = "/home/jofre/projects/luminous_ui"
OLD, NEW = "0.384.0", "0.385.0"
# The FIVE history occurrences, RE-DERIVED this slice (D488: re-derive the LIST, not
# only the total). D489's close-out named FOUR and missed its own changelog HEADING.
EXCLUDE = {
    ("packages/engine/src/handDiscardScaledSnipe.test.ts", 27),
    ("packages/engine/src/handDiscardScaledSnipe.test.ts", 1032),
    ("packages/engine/src/index.ts", 19798),
    ("packages/engine/src/index.ts", 19869),
    ("scripts/mutation/mutants.ts", 5233),
}
out = subprocess.run(
    ["grep", "-rl", OLD.replace(".", "\\."), "--include=*.ts", "--include=*.tsx", "--include=*.json",
     "packages/", "src/", "apps/", "scripts/"],
    cwd=ROOT, capture_output=True, text=True)
files = [f for f in out.stdout.split("\n") if f]
stepped = 0
touched = 0
for rel in files:
    p = os.path.join(ROOT, rel)
    lines = io.open(p, encoding="utf-8").read().split("\n")
    changed = False
    for i, line in enumerate(lines):
        n = line.count(OLD)
        if n == 0:
            continue
        if (rel, i + 1) in EXCLUDE:
            continue
        lines[i] = line.replace(OLD, NEW)
        stepped += n
        changed = True
    if changed:
        payload = "\n".join(lines).encode("utf-8")
        open(p, "wb").write(payload)
        touched += 1
print("files touched:", touched, "occurrences stepped:", stepped)
