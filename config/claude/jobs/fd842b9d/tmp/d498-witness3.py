# D498 witness classifier, v3.
# PATTERN (published, D419/D425): strip /*…*/ and //… comments first (D455), then for
# every `resolvedByAnyReader(` CALL, scan forward to the matching `)` and then up to
# 40 further chars for `.toBe(true|false)` / `=== true|false`; a `!` immediately before
# the call, or a `.filter/.some/.every(` enclosing it, is a POPULATION use.
# CANNOT SEE: a call whose verdict is stored in a variable and asserted elsewhere;
# a rung whose subject is `attackReaderSurface()` rather than this predicate.
import re,subprocess,os,collections
root="/home/jofre/projects/luminous_ui"
files = subprocess.run(["grep","-rl","resolvedByAnyReader(","--include=*.ts","packages/engine/src","scripts"],cwd=root,capture_output=True,text=True).stdout.split()
files=[f for f in files if not f.endswith("censusAttackCorpus.ts")]
def strip(s):
    s=re.sub(r"/\*.*?\*/", lambda m:" "*len(m.group(0)), s, flags=re.S)
    s=re.sub(r"(?m)^(\s*)//.*$", lambda m:m.group(1), s)
    s=re.sub(r"(?<![:'\"])//[^\n]*", "", s)
    return s
per={}; g=collections.Counter()
for f in files:
    s=strip(open(os.path.join(root,f),encoding="utf-8").read())
    t=fa=pop=other=0
    for m in re.finditer(r"resolvedByAnyReader\(", s):
        i=m.end()-1; d=0
        while i < len(s):
            if s[i]=="(": d+=1
            elif s[i]==")":
                d-=1
                if d==0: break
            i+=1
        pre=s[max(0,m.start()-120):m.start()]
        if pre.rstrip().endswith("!"): pop+=1; continue
        if re.search(r"\.(filter|some|every|map)\(\s*(\([^)]*\)|\w+)\s*=>\s*[^;]*$", pre): pop+=1; continue
        win=s[i:i+60]
        mt=re.search(r"\.toBe\((true|false)\)|===\s*(true|false)", win)
        if mt:
            if (mt.group(1) or mt.group(2))=="true": t+=1
            else: fa+=1
        else: other+=1
    per[f]=(t,fa,pop,other)
    g[("T" if t else "")+("F" if fa else "")+("P" if pop else "")+("?" if other else "")]+=1
tot=[sum(x[i] for x in per.values()) for i in range(4)]
print("files CALLING resolvedByAnyReader (excl. its own definition):",len(files),
      "| test files:",sum(1 for f in files if f.endswith('.test.ts')))
print(f"assertions: CLAIM-TRUE={tot[0]}  CLAIM-FALSE={tot[1]}  POPULATION={tot[2]}  unclassified={tot[3]}  calls={sum(tot)}")
print("\nAXIS CLASS -> file count")
for k,v in g.most_common(): print(f"   {v:4d}  {k or 'none (prose-only or unclassified)'}")
sees_narrow = sum(1 for t,fa,p,o in per.values() if t or p)
sees_widen  = sum(1 for t,fa,p,o in per.values() if fa or p)
sees_both   = sum(1 for t,fa,p,o in per.values() if (t or p) and (fa or p))
sees_none   = sum(1 for t,fa,p,o in per.values() if not (t or fa or p))
print(f"\nfiles that can see a NARROWING (claims fewer): {sees_narrow}")
print(f"files that can see a WIDENING  (claims more):  {sees_widen}")
print(f"files that can see BOTH: {sees_both}   files that can see NEITHER: {sees_none}")
print("\nNARROWING-ONLY files:", sum(1 for t,fa,p,o in per.values() if (t or p) and not (fa or p)))
print("WIDENING-ONLY  files:", sum(1 for t,fa,p,o in per.values() if (fa or p) and not (t or p)))
print("\nsee-NEITHER files:")
for f,(t,fa,p,o) in per.items():
    if not(t or fa or p): print("   ",f,"(unclassified calls:",o,")")
