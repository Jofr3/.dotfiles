import io, re, sys, subprocess, os
ROOT="/home/jofre/projects/luminous_ui"
ANN = ("  // \U0001f195\U0001f195\U0001f195 **D490 +1 sentence / +2 printings — THE MILL OF BOTH DECKS, SCALED BY THE "
       "ENERGY AMONG WHAT IT MILLED** (`censusAttackCorpus.ts` FILE LINE 130; the LAST unbuilt member of the "
       "`discarded in this way` family, claimed by `deriveAttackDiscardScaledBoost`'s new `eachDeckMill` member — "
       "the reader SURFACE stands still at 13). ⚠️ THE TWO STEPS DISAGREE, 1 AND 2.")
SKIP = {("packages/engine/src/censusAtHead.test.ts", 797),
        ("packages/engine/src/censusAtHead.test.ts", 4233),
        ("packages/engine/src/censusAtHead.test.ts", 4363)}
out = subprocess.run(["grep","-rlnE",r"\b(522|1552)\b","--include=*.test.ts","packages/engine/src/","src/"],
                     cwd=ROOT, capture_output=True, text=True)
files=[f for f in out.stdout.split("\n") if f]
stepped=0; touched=0
for rel in files:
    p=os.path.join(ROOT,rel)
    lines=io.open(p,encoding="utf-8").read().split("\n")
    changed=False
    for i,line in enumerate(lines):
        if (rel,i+1) in SKIP: continue
        if not re.search(r"^\s*expect\(", line): continue
        n522=len(re.findall(r"\b522\b", line)); n1552=len(re.findall(r"\b1552\b", line))
        if n522+n1552==0: continue
        new=re.sub(r"\b522\b","523",line); new=re.sub(r"\b1552\b","1554",new)
        # annotate: append after the assertion's `;` at the first `);` if no comment yet
        lines[i]=new+ANN
        stepped+=n522+n1552; changed=True
        print(f"  {rel}:{i+1}  +{n522+n1552}")
    if changed:
        open(p,"wb").write("\n".join(lines).encode("utf-8")); touched+=1
print("files:",touched,"literals stepped:",stepped)
