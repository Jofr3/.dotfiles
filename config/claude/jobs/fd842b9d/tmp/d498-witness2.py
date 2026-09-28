import re,subprocess,os,collections
root="/home/jofre/projects/luminous_ui"
files = subprocess.run(["grep","-rl","resolvedByAnyReader(","--include=*.ts","packages/engine/src","scripts"],cwd=root,capture_output=True,text=True).stdout.split()
files=[f for f in files if not f.endswith("censusAttackCorpus.ts")]
CALL=re.compile(r"resolvedByAnyReader\(")
per={}; g=collections.Counter()
for f in files:
    s=open(os.path.join(root,f),encoding="utf-8").read()
    t=fa=neg=other=0
    for m in CALL.finditer(s):
        pre = s[max(0,m.start()-30):m.start()]
        win = s[m.start(): m.start()+220]
        if pre.rstrip().endswith("!") or pre.endswith("!"):
            neg+=1; continue
        mt = re.search(r"\.toBe\((true|false)\)|===\s*(true|false)", win)
        if mt:
            v = mt.group(1) or mt.group(2)
            if v=="true": t+=1
            else: fa+=1
        else: other+=1
    per[f]=(t,fa,neg,other)
    k=("T" if t else "")+("F" if fa else "")+("N" if neg else "")+("?" if other else "")
    g[k]+=1
print("files CALLING resolvedByAnyReader:",len(files))
print("test files:",sum(1 for f in files if f.endswith(".test.ts")),"  non-test:",[f for f in files if not f.endswith(".test.ts")])
tot=[sum(x[i] for x in per.values()) for i in range(4)]
print(f"assertions: CLAIM-TRUE={tot[0]}  CLAIM-FALSE={tot[1]}  negated(!…)={tot[2]}  other-use={tot[3]}  total={sum(tot)}")
print("\nfiles by axis-class (T=claims-true rung, F=claims-false rung, N=negated/population, ?=folded into an expression):")
for k,v in g.most_common(): print(f"   {v:4d}  {k or 'none'}")
print("\n-- WIDENING-ONLY visible (F but no T, no N): --")
for f,(t,fa,n,o) in sorted(per.items(), key=lambda kv: os.path.getsize(os.path.join(root,kv[0]))):
    if fa and not t and not n: print(f"   {f}  T={t} F={fa} N={n} ?={o}  {os.path.getsize(os.path.join(root,f))//1024}KB")
print("\n-- NARROWING-ONLY visible (T but no F, no N): --")
c=0
for f,(t,fa,n,o) in sorted(per.items(), key=lambda kv: os.path.getsize(os.path.join(root,kv[0]))):
    if t and not fa and not n:
        print(f"   {f}  T={t} F={fa} N={n} ?={o}  {os.path.getsize(os.path.join(root,f))//1024}KB"); c+=1
        if c>=6: break
print("\n-- files with NO boolean rung at all (blind to BOTH polarity axes): --")
c=0
for f,(t,fa,n,o) in per.items():
    if not t and not fa and not n: print("   ",f); c+=1
print("   count:",c)
