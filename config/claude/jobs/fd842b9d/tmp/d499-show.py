import re, sys, os
ROOT = "/home/jofre/projects/luminous_ui/"
# Show the CODE PREFIX of every line in the given files that carries one of the
# moving literals, so a line-targeted patch can be written from what it really says.
PAT = re.compile(r"\b(529|1562|528|1560|1612|1614|111|170|85|120|2017|2019|201|153|430)\b")

def code_prefix(line: str) -> str:
    i = line.find("//")
    return line if i < 0 else line[:i]

for f in sys.argv[1:]:
    p = ROOT + f
    if not os.path.exists(p):
        print("MISSING", f); continue
    for n, line in enumerate(open(p, encoding="utf-8").read().split("\n"), 1):
        cp = code_prefix(line)
        if not PAT.search(cp):
            continue
        if not re.search(r"expect|toBe|toEqual|toHaveLength|= \d+;|- \d+ /\*", cp):
            continue
        print(f"{f}:{n}: {cp.rstrip()[:200]}")
