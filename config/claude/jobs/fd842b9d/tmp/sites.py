import os
import re
import sys

ROOT = "/home/jofre/projects/luminous_ui/packages/engine/src"
NUMS = [int(x) for x in sys.argv[1:]] or [502, 1526, 1576, 206, 138]
pat = re.compile(r"\b(" + "|".join(str(n) for n in NUMS) + r")\b")

for fn in sorted(os.listdir(ROOT)):
    if not fn.endswith(".ts"):
        continue
    p = os.path.join(ROOT, fn)
    with open(p, encoding="utf-8") as fh:
        lines = fh.read().split("\n")
    for i, line in enumerate(lines, 1):
        # strip a trailing line comment so prose figures do not dominate
        code = line.split("//")[0]
        if not pat.search(code):
            continue
        print(f"{fn}:{i}: {code.strip()[:200]}")
