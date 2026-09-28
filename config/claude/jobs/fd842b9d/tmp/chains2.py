import re, glob
HEADS = ["BUILT.attack - ", "resolving.length - ", "units(resolving) - ",
         "resolved.length - ", "units(resolved) - ", "rawHead - ", "head - ",
         "ids.length - ", "raw.length - ", "units(raw) - "]
for path in sorted(set(glob.glob("packages/engine/src/**/*.ts", recursive=True))):
    with open(path, "rb") as fh: text = fh.read().decode("utf-8")
    lines = text.split("\n")
    for i, line in enumerate(lines):
        for h in HEADS:
            idx = 0
            while True:
                at = line.find(h, idx)
                if at < 0: break
                idx = at + len(h)
                m = re.match(r"(\d+)", line[idx:])
                if not m: continue
                after = line[idx + len(m.group(1)):]
                # a census chain: the term is followed by ' /*' or ' - ' (another term)
                if after.startswith(" /*") or after.startswith(" - "):
                    print(f"{path}:{i+1}  col{at}  head={h!r} first-term={m.group(1)}")
