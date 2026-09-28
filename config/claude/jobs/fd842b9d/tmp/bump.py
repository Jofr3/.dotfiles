import re, sys, glob, os
ROOT="/home/jofre/projects/luminous_ui/"
OLD="0.393.0"; NEW="0.394.0"
# HISTORY sites: a line recording what a PREVIOUS bump was (D443). Excluded.
HIST=[("packages/engine/src/confusionDamage.test.ts",27),("packages/engine/src/index.ts",19802)]
files=set()
for pat in ("packages/**/*.ts","packages/**/*.tsx","src/**/*.ts","src/**/*.tsx","apps/**/*.ts","apps/**/*.tsx","scripts/**/*.ts","packages/*/package.json","package.json","apps/*/package.json"):
    files.update(glob.glob(ROOT+pat, recursive=True))
dry="--apply" not in sys.argv
tot=0; touched=[]; skipped=[]
for path in sorted(files):
    if "/node_modules/" in path: continue
    try: text=open(path,encoding="utf-8").read()
    except Exception: continue
    if OLD not in text: continue
    rel=os.path.relpath(path,ROOT)
    lines=text.split("\n"); n=0
    for i,line in enumerate(lines):
        if OLD not in line: continue
        if (rel,i+1) in HIST or re.search(r'0\.39[0-9]\.0 (→|->)', line):
            skipped.append(f"{rel}:{i+1}"); continue
        c=line.count(OLD); n+=c
        lines[i]=line.replace(OLD,NEW)
    if n:
        tot+=n; touched.append(f"{rel} ({n})")
        if not dry: open(path,"wb").write("\n".join(lines).encode("utf-8"))
print(f"occurrences stepped: {tot} across {len(touched)} files {'(dry)' if dry else 'WRITTEN'}")
print("HISTORY sites left alone:", skipped)
