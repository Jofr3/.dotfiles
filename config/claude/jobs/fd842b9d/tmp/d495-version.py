import subprocess, re
OLD, NEW = "0.389.0", "0.390.0"
HISTORY = {("packages/engine/src/index.ts", 19798)}  # prose recording the PREVIOUS bump
out = subprocess.run(["grep","-rlo",OLD,"--include=*.ts","--include=*.tsx","--include=*.json","."],
                     capture_output=True, text=True).stdout.split()
files = [f[2:] if f.startswith("./") else f for f in out if "node_modules" not in f]
changed = 0; skipped = 0
for p in files:
    lines = open(p, encoding="utf-8").read().split("\n")
    dirty = False
    for i, s in enumerate(lines, 1):
        if OLD not in s: continue
        if (p, i) in HISTORY:
            skipped += s.count(OLD); continue
        # never step a line that RECORDS an arrow between two versions
        if re.search(r"0\.\d+\.0\s*(→|->)\s*\*{0,2}" + re.escape(OLD), s):
            skipped += s.count(OLD); continue
        changed += s.count(OLD)
        lines[i-1] = s.replace(OLD, NEW); dirty = True
    if dirty:
        open(p, "wb").write("\n".join(lines).encode("utf-8"))
print(f"stepped {changed} occurrence(s); left {skipped} history occurrence(s) alone across {len(files)} files")
