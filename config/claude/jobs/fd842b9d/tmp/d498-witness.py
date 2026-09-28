import re, subprocess, collections, os
root="/home/jofre/projects/luminous_ui"
files = subprocess.run(["grep","-rl","resolvedByAnyReader(","--include=*.ts","packages/engine/src","scripts"],
                       cwd=root, capture_output=True, text=True).stdout.split()
files=[f for f in files if not f.endswith("censusAttackCorpus.ts")]
POS=re.compile(r"resolvedByAnyReader\([^\n]*?\)\s*\)?\s*\.(toBe\(true\)|toBe\(false\))")
cls=collections.Counter(); per={}
for f in files:
    s=open(os.path.join(root,f),encoding="utf-8").read()
    # count assertion polarities in the several spellings the repo uses
    t_true  = len(re.findall(r"resolvedByAnyReader\(.*?\)\s*\)\.toBe\(true\)", s))
    t_false = len(re.findall(r"resolvedByAnyReader\(.*?\)\s*\)\.toBe\(false\)", s))
    e_true  = len(re.findall(r"resolvedByAnyReader\(.*?\)\s*===\s*true", s))
    e_false = len(re.findall(r"resolvedByAnyReader\(.*?\)\s*===\s*false", s))
    neg     = len(re.findall(r"!resolvedByAnyReader\(", s))
    filt    = len(re.findall(r"\.filter\([^\n]*resolvedByAnyReader", s)) + len(re.findall(r"\.some\([^\n]*resolvedByAnyReader", s)) + len(re.findall(r"\.every\([^\n]*resolvedByAnyReader", s))
    total   = len(re.findall(r"resolvedByAnyReader\(", s))
    per[f]=dict(true=t_true+e_true, false=t_false+e_false, neg=neg, popn=filt, total=total)
def axis(d):
    a=[]
    if d["true"]: a.append("CLAIM-TRUE")
    if d["false"]: a.append("CLAIM-FALSE")
    if d["neg"] or d["popn"]: a.append("POPULATION")
    return "+".join(a) or "OTHER/uncounted"
g=collections.Counter()
for f,d in per.items(): g[axis(d)]+=1
print("files calling resolvedByAnyReader (excl. its own file):", len(files))
for k,v in g.most_common(): print(f"  {v:4d}  {k}")
print()
print("POPULATION-bearing files:")
for f,d in sorted(per.items()):
    if "POPULATION" in axis(d): print(f"   {f}: true={d['true']} false={d['false']} neg={d['neg']} popn={d['popn']} total={d['total']}")
print()
tt=sum(d["true"] for d in per.values()); tf=sum(d["false"] for d in per.values())
tn=sum(d["neg"] for d in per.values()); tp=sum(d["popn"] for d in per.values()); tc=sum(d["total"] for d in per.values())
print(f"assertion tallies: CLAIM-TRUE={tt} CLAIM-FALSE={tf} negated-uses={tn} population-folds={tp} total-calls={tc}")
