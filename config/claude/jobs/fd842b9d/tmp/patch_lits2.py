import re, sys
ROOT="/home/jofre/projects/luminous_ui/"
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
SITES=[(E+"cancelThenPrevent.test.ts",667,[("531","532"),("1564","1565")]),
 (E+"defenderStatusTriple.test.ts",558,[("531","532"),("1564","1565")]),
 (E+"flipDefenderAttackLock.test.ts",709,[("531","532"),("1565","1566")]),
 (E+"flipStatusEnergyDiscard.test.ts",575,[("531","532"),("1564","1565")]),
 (E+"flipStatusHeadsTails.test.ts",810,[("531","532"),("1564","1565")]),
 (E+"perHeadsEnergyDiscard.test.ts",667,[("530","531"),("1564","1565")]),
 (E+"selfDamagePerCounter.test.ts",190,[("531","532"),("1565","1566")]),
 (E+"censusAtHead.test.ts",4231,[("2021","2022")]),
 (E+"compoundCompose.test.ts",622,[("501","502")])]
dry="--apply" not in sys.argv
n=0
byfile={}
for f,l,s in SITES: byfile.setdefault(f,[]).append((l,s))
for f,items in byfile.items():
    path=ROOT+f; lines=open(path,encoding="utf-8").read().split("\n")
    for l,subs in items:
        line=lines[l-1]
        for old,new in subs:
            sp=code_spans(line)
            hits=[m.start() for m in re.finditer(r'(?<![\d.])'+old+r'(?![\d.])',line) if in_code(sp,m.start())]
            if len(hits)!=1: raise SystemExit(f"{f}:{l} {old}: {len(hits)} code hits {hits}")
            at=hits[0]; line=line[:at]+new+line[at+len(old):]; n+=1
        lines[l-1]=line
        print(f"  {f}:{l} {subs} -> {line[:110]}")
    if not dry: open(path,"wb").write("\n".join(lines).encode("utf-8"))
print("subs:",n,"(dry)" if dry else "WRITTEN")
