ROOT = "/home/jofre/projects/luminous_ui/"
src = open(ROOT + "packages/engine/src/effects.ts", encoding="utf-8").read()
lines = src.split("\n")
# The whole D468 block, comment included: from the "🆕🆕 D468" comment line to its closing brace.
start = next(i for i, l in enumerate(lines) if l.startswith("  // 🆕🆕 D468 — the same op"))
end = next(i for i in range(start, len(lines)) if lines[i] == "  }")
BLOCK = "\n".join(lines[start:end + 1])
BARE_ARM = '  if (ATTACK_SELF_SWITCH.test(effect)) {\n    return [{ op: "switchActive" }];\n  }'
assert src.count(BLOCK) == 1, src.count(BLOCK)
assert src.count(BARE_ARM) == 1
FIND = BARE_ARM + "\n" + BLOCK
REPLACE = BLOCK + "\n" + BARE_ARM
assert src.count(FIND) == 1, "FIND occurs %d×" % src.count(FIND)
print("FIND ok (1×), %d chars" % len(FIND))

import json
p = ROOT + "scripts/mutation/mutants.ts"
backup = open(p, encoding="utf-8").read()
# The bad row's current find/replace, written by the previous script.
OLD_FIND_LINE = None
for line in backup.split("\n"):
    if line.startswith("    find: ") and "ATTACK_SELF_SWITCH.test(effect)" in line and "typedSwitch" in line:
        OLD_FIND_LINE = line
assert OLD_FIND_LINE is not None
OLD_REPLACE_LINE = None
for line in backup.split("\n"):
    if line.startswith("    replace: ") and "typedSwitch" in line and "ATTACK_SELF_SWITCH.test(effect)" in line:
        OLD_REPLACE_LINE = line
assert OLD_REPLACE_LINE is not None
new_find = "    find: %s," % json.dumps(FIND, ensure_ascii=False)
new_replace = "    replace: %s," % json.dumps(REPLACE, ensure_ascii=False)
assert backup.count(OLD_FIND_LINE) == 1 and backup.count(OLD_REPLACE_LINE) == 1
out = backup.replace(OLD_FIND_LINE, new_find, 1).replace(OLD_REPLACE_LINE, new_replace, 1)
assert out != backup
try:
    with open(p, "wb") as fh:
        fh.write(out.encode("utf-8"))
    print("mutants.ts re-anchored: %d -> %d bytes" % (len(backup), len(out)))
except Exception as e:
    with open(p, "wb") as fh:
        fh.write(backup.encode("utf-8"))
    print("RESTORED after", e); raise
