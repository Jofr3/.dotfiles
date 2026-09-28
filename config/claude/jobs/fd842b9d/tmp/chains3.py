import re, glob
HEADS = ["BUILT.attack - ", "resolving.length - ", "units(resolving) - ",
         "resolved.length - ", "units(resolved) - ", "rawHead - ", "head - ",
         "ids.length - ", "raw.length - ", "units(raw) - "]
def strip_comments(line):
    # blank out /* ... */ spans and trailing //, preserving length
    out = list(line)
    for m in re.finditer(r"/\*.*?\*/", line):
        for k in range(m.start(), m.end()): out[k] = " "
    s = "".join(out)
    at = s.find("//")
    if at >= 0: s = s[:at] + " " * (len(s) - at)
    return s
for path in sorted(set(glob.glob("packages/engine/src/**/*.ts", recursive=True))):
    with open(path, "rb") as fh: text = fh.read().decode("utf-8")
    for i, line in enumerate(text.split("\n")):
        s = strip_comments(line)
        for h in HEADS:
            idx = 0
            while True:
                at = s.find(h, idx)
                if at < 0: break
                idx = at + len(h)
                m = re.match(r"(\d+)", s[idx:])
                if not m: continue
                after = s[idx + len(m.group(1)):].lstrip()
                if after.startswith("-") or line[idx + len(m.group(1)):].startswith(" /*"):
                    print(f"{path}:{i+1}  col={at}  head={h!r}  first={m.group(1)}")
