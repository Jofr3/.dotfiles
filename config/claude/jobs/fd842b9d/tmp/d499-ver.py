"""D499 engine version bump 0.390.0 -> 0.391.0.

⚠️ **A MECHANICAL BUMP MUST EXCLUDE THE PROSE THAT RECORDS WHAT A PREVIOUS BUMP WAS
(D443).** The exception list is DERIVED here rather than inherited — the inherited one
has been wrong on three separate slices, each time because the note counting it was
itself a match (D488/D490/D494).

Exceptions, by (file, line), each read individually:
  1. packages/engine/src/index.ts:19798      — the 0.390.0 CHANGELOG HEADING ("0.389.0
                                                → **0.390.0**"). History.
  2. packages/engine/src/flipDefenderAttackLock.test.ts:21 — D495's suite header
                                                ("0.389.0 → 0.390.0"). History.
  3. packages/engine/src/cancelThenPrevent.test.ts:28 — THIS slice's own header
                                                ("0.390.0 → 0.391.0"). Its LEFT operand
                                                is history the moment it is written.
⚠️ Exception 3 is the SELF-REFERENCE case (D488): the paragraph exists only because this
pass is being written, and it is counted BEFORE the pass runs.
"""

import re, sys, subprocess

ROOT = "/home/jofre/projects/luminous_ui/"
OLD, NEW = "0.390.0", "0.391.0"
EXCEPT = {
    ("packages/engine/src/index.ts", 19798),
    ("packages/engine/src/flipDefenderAttackLock.test.ts", 21),
    ("packages/engine/src/cancelThenPrevent.test.ts", 28),
}

out = subprocess.run(
    ["grep", "-rln", OLD, "--include=*.ts", "--include=*.tsx", "--include=*.json",
     "packages/", "apps/", "src/", "scripts/"],
    cwd=ROOT, capture_output=True, text=True,
)
files = [f for f in out.stdout.split("\n") if f]
total_before = 0
stepped = 0
skipped = []
for f in files:
    raw = open(ROOT + f, encoding="utf-8").read()
    L = raw.split("\n")
    n0 = len(L)
    for i, line in enumerate(L):
        hits = line.count(OLD)
        if hits == 0:
            continue
        total_before += hits
        if (f, i + 1) in EXCEPT:
            skipped.append((f, i + 1, hits))
            continue
        # a literal replacement, never a regex/`$`-interpreting one (D462/D470)
        L[i] = line.replace(OLD, NEW)
        stepped += hits
    assert len(L) == n0, f"{f}: line count moved"
    payload = "\n".join(L).encode("utf-8")
    with open(ROOT + f, "wb") as fh:
        fh.write(payload)

print(f"files scanned: {len(files)}")
print(f"occurrences of {OLD} before: {total_before}")
print(f"stepped: {stepped}")
print(f"exceptions LEFT ALONE: {len(skipped)} -> {skipped}")

# RE-MEASURE after the edit, and the exception list with it (D490's procedural rule).
after = subprocess.run(
    ["grep", "-roE", re.escape(OLD), "--include=*.ts", "--include=*.tsx", "--include=*.json",
     "packages/", "apps/", "src/", "scripts/"],
    cwd=ROOT, capture_output=True, text=True,
).stdout.strip().split("\n")
after = [a for a in after if a]
print(f"occurrences of {OLD} AFTER: {len(after)}  (should equal the exception count)")
for a in after:
    print("   remaining:", a)
newcount = subprocess.run(
    ["grep", "-roE", re.escape(NEW), "--include=*.ts", "--include=*.tsx", "--include=*.json",
     "packages/", "apps/", "src/", "scripts/"],
    cwd=ROOT, capture_output=True, text=True,
).stdout.strip().split("\n")
print(f"occurrences of {NEW} AFTER: {len([n for n in newcount if n])}")
