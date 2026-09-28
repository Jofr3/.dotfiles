import hashlib, io, json, os, subprocess, sys

REPO = "/home/jofre/projects/luminous_ui"
os.chdir(REPO)

rows = json.load(io.open("/home/jofre/.claude/jobs/fd842b9d/tmp/d484-rows.json", encoding="utf8"))

def digest(p):
    b = io.open(p, "rb").read()
    return len(b), hashlib.sha256(b).hexdigest()

results = []
for r in rows:
    path = r["file"]
    orig_bytes = io.open(path, "rb").read()
    size0, sha0 = len(orig_bytes), hashlib.sha256(orig_bytes).hexdigest()
    text = orig_bytes.decode("utf8")
    assert text.count(r["find"]) == 1, r["id"]
    # ENCODE FIRST, WRITE SECOND.
    mutated = text.replace(r["find"], r["replace"], 1).encode("utf8")
    try:
        io.open(path, "wb").write(mutated)
        p = subprocess.run(["bun", "scripts/mutation/partition-gate.ts"],
                           capture_output=True, text=True)
        out = (p.stdout + p.stderr).strip().replace("\n", " ⏎ ")
        results.append((r["id"], p.returncode, out[:220]))
    finally:
        io.open(path, "wb").write(orig_bytes)
    size1, sha1 = digest(path)
    assert (size0, sha0) == (size1, sha1), "RESTORE FAILED for " + path
    results[-1] = results[-1] + ("restored %d/%s" % (size1, sha1[:12]),)

for rid, rc, out, rest in results:
    print(("KILLED " if rc != 0 else "SURVIVED ") + "exit=%d  %s" % (rc, rid))
    print("    " + out)
    print("    " + rest)
