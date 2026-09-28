import os, re, sys, json

ROOT = "/home/jofre/projects/luminous_ui"
# (relpath, line, old, new)  — LIVE HEADS only: a bare live expression on the LHS.
EDITS = json.load(open(sys.argv[1], encoding="utf-8"))

def patch(rel, line, old, new):
    full = os.path.join(ROOT, rel)
    lines = open(full, encoding="utf-8").read().split("\n")
    i = line - 1
    code_end = lines[i].find("//")
    if code_end == -1:
        code_end = len(lines[i])
    code, rest = lines[i][:code_end], lines[i][code_end:]
    n = code.count(old)
    if n == 0:
        raise SystemExit(f"{rel}:{line} code region has no {old}: {code!r}")
    parts = code.split(old)
    assert len(parts) == n + 1
    lines[i] = new.join(parts) + rest
    payload = "\n".join(lines).encode("utf-8")   # ENCODE FIRST (D463)
    with open(full, "wb") as fh:
        fh.write(payload)
    return n

total = 0
for rel, line, old, new in EDITS:
    total += patch(rel, line, str(old), str(new))
print(f"stepped {total} live-head occurrence(s) across {len({e[0] for e in EDITS})} file(s)")
