import re, sys
ROOT="/home/jofre/projects/luminous_ui/"
TERM=" - 1 /* D502, corpus FILE LINE 440, 1 sentence / 1 printing */"
def code_spans(line):
    spans=[];i=0;n=len(line);start=0
    while i<n:
        if line.startswith("/*",i):
            spans.append((start,i)); j=line.find("*/",i+2); i=n if j<0 else j+2; start=i
        elif line.startswith("//",i):
            spans.append((start,i)); return spans
        elif line[i] in "\"'`":
            q=line[i];j=i+1
            while j<n and line[j]!=q:
                if line[j]=="\\": j+=1
                j+=1
            i=j+1
        else: i+=1
    spans.append((start,n)); return spans
def in_code(sp,at): return any(a<=at<b for a,b in sp)
E="packages/engine/src/"
CHAINS=[(E+"benchNamedBonus.test.ts",948,"resolved.length"),
        (E+"benchNamedBonus.test.ts",1129,"units(resolved)"),
        (E+"inPlayTypeBonus.test.ts",772,"resolving.length"),
        (E+"inPlayTypeBonus.test.ts",809,"units(resolving)"),
        (E+"moreEnergyBonus.test.ts",760,"resolved.length"),
        (E+"moreEnergyBonus.test.ts",803,"units(resolved)"),
        (E+"opponentBenchCount.test.ts",835,"resolving.length"),
        (E+"opponentBenchCount.test.ts",872,"units(resolving)"),
        (E+"retreatCostBonus.test.ts",944,"resolving.length"),
        (E+"retreatCostBonus.test.ts",981,"units(resolving)"),
        (E+"sameEnergyBonus.test.ts",967,"resolved.length"),
        (E+"sameEnergyBonus.test.ts",1026,"units(resolved)")]
dry="--apply" not in sys.argv
byfile={}
for f,l,h in CHAINS: byfile.setdefault(f,[]).append((l,h))
for f,items in byfile.items():
    path=ROOT+f; text=open(path,encoding="utf-8").read(); before=len(text)
    lines=text.split("\n")
    for l,h in sorted(items):
        line=lines[l-1]; sp=code_spans(line)
        hits=[m.start() for m in re.finditer(re.escape(h)+" - ",line) if in_code(sp,m.start())]
        if len(hits)!=1: raise SystemExit(f"{f}:{l} {h}: {len(hits)} code hits {hits}")
        cut=hits[0]+len(h)
        lines[l-1]=line[:cut]+TERM+line[cut:]
        print(f"  {f}:{l} {h} @col{hits[0]}")
    out="\n".join(lines); grew=len(out)-before
    if grew!=len(TERM)*len(items): raise SystemExit(f"{f}: grew {grew}")
    if not dry:
        payload=out.encode("utf-8")
        open(path,"wb").write(payload)
        assert len(open(path,encoding="utf-8").read())==before+grew
    print(f"  {f}: +{grew} {'(dry)' if dry else 'WRITTEN'}")
