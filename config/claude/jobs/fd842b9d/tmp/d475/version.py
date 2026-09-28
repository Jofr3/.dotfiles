import os, subprocess
OLD, NEW = "0.372.0", "0.373.0"
SKIP = {
    ("packages/engine/src/inPlayFlipCount.test.ts", "// 0.371.0 → 0.372.0"),
    ("packages/engine/src/bothActivesFlipCount.test.ts", "// 0.372.0 → 0.373.0"),
}
out = subprocess.run(["grep","-rl","--include=*.ts","--include=*.tsx","--include=*.json",OLD,"."],
                     capture_output=True, text=True).stdout.split()
files = [f for f in out if "node_modules" not in f]
moved = kept = 0
for f in files:
    p = f[2:] if f.startswith("./") else f
    with open(p, "r", encoding="utf-8") as fh:
        lines = fh.read().split("\n")
    changed = False
    for i, line in enumerate(lines):
        if OLD not in line:
            continue
        # leave PROSE that records a PREVIOUS transition (D443)
        if "→ " + OLD in line or OLD + " →" in line:
            kept += line.count(OLD)
            continue
        n = line.count(OLD)
        lines[i] = line.replace(OLD, NEW)
        moved += n
        changed = True
    if changed:
        payload = "\n".join(lines).encode("utf-8")
        with open(p, "wb") as fh:
            fh.write(payload)
print(f"files={len(files)} moved={moved} kept_prose={kept}")
