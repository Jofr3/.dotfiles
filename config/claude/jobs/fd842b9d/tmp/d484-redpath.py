import hashlib, io, os, subprocess
REPO = "/home/jofre/projects/luminous_ui"; os.chdir(REPO)
p = "scripts/mutation/mutants.ts"
orig = io.open(p, "rb").read()
size0, sha0 = len(orig), hashlib.sha256(orig).hexdigest()
text = orig.decode("utf8")
# A CLONE of a live row under a new id: identical in every runner-visible field.
clone = '''  {
    id: "SCRATCH-clone-of-D192-resistance",
    decision: "D999",
    what: "scratch — a byte-identical twin of a live row, to exercise the red path",
    file: "packages/engine/src/attack.ts",
    find: "damageSuppression?.resistance === true ? null : resistanceOf(attacker, defenderCard)",
    replace: "resistanceOf(attacker, defenderCard)",
    expectKilledBy: ["packages/engine/src/damageSuppression.test.ts"],
  },
'''
assert text.endswith("];\n")
try:
    io.open(p, "wb").write((text[:-3] + clone + "];\n").encode("utf8"))
    r = subprocess.run(["bun", "scripts/mutation/partition-gate.ts"], capture_output=True, text=True)
    print("exit=%d" % r.returncode)
    print(r.stdout + r.stderr)
finally:
    io.open(p, "wb").write(orig)
b = io.open(p, "rb").read()
assert (len(b), hashlib.sha256(b).hexdigest()) == (size0, sha0), "RESTORE FAILED"
print("restored %d bytes / sha256 %s" % (size0, sha0))
