import re, glob, sys
HEADS = ["BUILT.attack - ", "resolving.length - ", "units(resolving) - ",
         "resolved.length - ", "units(resolved) - ", "rawHead - ", "head - ",
         "ids.length - ", "raw.length - ", "units(raw) - ", "residueP - ", "resolvedP - "]
total = {}
for path in sorted(glob.glob("packages/engine/src/**/*.ts", recursive=True) + glob.glob("src/**/*.ts*", recursive=True)):
    with open(path, "rb") as fh:
        text = fh.read().decode("utf-8")
    for h in HEADS:
        # count occurrences followed by digits (a chain term)
        n = 0
        idx = 0
        while True:
            at = text.find(h, idx)
            if at < 0: break
            idx = at + len(h)
            if re.match(r"\d", text[idx:idx+1]):
                n += 1
        if n:
            total.setdefault(h, []).append((path, n))
for h, rows in total.items():
    print(f"\n### {h!r}  total {sum(n for _, n in rows)}")
    for p, n in rows:
        print(f"   {n:3d}  {p}")
