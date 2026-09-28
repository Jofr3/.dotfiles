import re, sys
ROOT = "/home/jofre/projects/luminous_ui/"

def code_spans(line: str):
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

def in_code(spans,at): return any(a<=at<b for a,b in spans)

E = "packages/engine/src/"
# (file, line, [(old, new), …])
SITES = [
 (E+"censusAtHead.test.ts", 464, [("1616","1617")]),                    # BUILT.attack
 (E+"censusAtHead.test.ts", 8147, [("166","165")]),                     # RAW_UNBUILT_ATTACK_UNITS
 (E+"censusAtHead.test.ts", 6283, [("116","115")]),
 (E+"censusAtHead.test.ts", 6339, [("108","107")]),
 (E+"censusAtHead.test.ts", 6353, [("82","81")]),
 (E+"censusAtHead.test.ts", 8304, [("532","533")]),
 (E+"censusAtHead.test.ts", 8321, [("1566","1567")]),
 (E+"benchNamedBonus.test.ts", 842, [("532","533")]),
 (E+"benchNamedBonus.test.ts", 854, [("1566","1567")]),
 (E+"cancelThenPrevent.test.ts", 662, [("532","533"),("1566","1567")]),
 (E+"classedBoardSpread.test.ts", 1004, [("108","107"),("166","165")]),
 (E+"compoundCompose.test.ts", 612, [("203","204")]),
 (E+"confusionDamage.test.ts", 210, [("493","494")]),
 (E+"defenderStatusTriple.test.ts", 544, [("532","533"),("1566","1567")]),
 (E+"exOnlyActive.test.ts", 190, [("532","533")]),
 (E+"exOnlyActive.test.ts", 202, [("1566","1567")]),
 (E+"exOnlyActive.test.ts", 214, [("108","107")]),
 (E+"exOnlyActive.test.ts", 222, [("166","165")]),
 (E+"flipDefenderAttackLock.test.ts", 705, [("532","533"),("1566","1567")]),
 (E+"flipStatusEnergyDiscard.test.ts", 569, [("532","533"),("1566","1567")]),
 (E+"flipStatusHeadsTails.test.ts", 806, [("532","533"),("1566","1567")]),
 (E+"handDiscardScaledSnipe.test.ts", 1026, [("532","533"),("1566","1567")]),
 (E+"inPlayTypeBonus.test.ts", 628, [("532","533"),("1566","1567")]),
 (E+"moreEnergyBonus.test.ts", 618, [("532","533")]),
 (E+"moreEnergyBonus.test.ts", 630, [("1566","1567")]),
 (E+"opponentBenchCount.test.ts", 691, [("532","533"),("1566","1567")]),
 (E+"perHeadsEnergyDiscard.test.ts", 661, [("532","533"),("1566","1567")]),
 (E+"precociousEvolution.test.ts", 548, [("1566","1567")]),
 (E+"precociousEvolution.test.ts", 635, [("1616","1617")]),
 (E+"retreatCostBonus.test.ts", 800, [("532","533"),("1566","1567")]),
 (E+"sameEnergyBonus.test.ts", 808, [("532","533")]),
 (E+"sameEnergyBonus.test.ts", 820, [("1566","1567")]),
 (E+"sawkRequirementSplit.test.ts", 249, [("532","533")]),
 (E+"sawkRequirementSplit.test.ts", 261, [("1566","1567")]),
 (E+"sawkRequirementSplit.test.ts", 269, [("108","107")]),
 (E+"sawkRequirementSplit.test.ts", 277, [("166","165")]),
 (E+"selfDamagePerCounter.test.ts", 185, [("532","533"),("1566","1567")]),
]
dry = "--apply" not in sys.argv
byfile={}
for f,l,subs in SITES: byfile.setdefault(f,[]).append((l,subs))
changed=0
for f,items in byfile.items():
    path=ROOT+f
    text=open(path,encoding="utf-8").read()
    lines=text.split("\n")
    for l,subs in items:
        line=lines[l-1]
        for old,new in subs:
            spans=code_spans(line)
            pat=re.compile(r'(?<![\d.])'+old+r'(?![\d.])')
            hits=[m.start() for m in pat.finditer(line) if in_code(spans,m.start())]
            if len(hits)!=1:
                raise SystemExit(f"{f}:{l} {old!r}: {len(hits)} CODE occurrences {hits} — refusing")
            at=hits[0]
            line=line[:at]+new+line[at+len(old):]
            changed+=1
        lines[l-1]=line
        print(f"  {f}:{l}  {subs}  ->  {line[:120]}")
    out="\n".join(lines)
    if not dry:
        payload=out.encode("utf-8")
        with open(path,"wb") as fh: fh.write(payload)
print("substitutions:",changed, "(dry run)" if dry else "WRITTEN")
