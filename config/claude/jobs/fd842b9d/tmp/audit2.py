import re, subprocess
FILES=["inPlayTypeBonus","opponentBenchCount","retreatCostBonus","moreEnergyBonus",
       "sameEnergyBonus","benchNamedBonus"]
# an assertion whose LEFT side carries subtraction terms is a FROZEN-TAIL rung
PAT=re.compile(r"expect\(\[([^\]]*?)\]\)\s*\.toEqual\(\[(\d{2,4}),\s*(\d{3,4})\]\)", re.S)
def frozen(rev, f):
    try:
        t=subprocess.run(["git","show",f"{rev}:packages/engine/src/{f}.test.ts"],
                         capture_output=True,text=True,check=True).stdout
    except subprocess.CalledProcessError: return None
    out={}
    for m in PAT.finditer(t):
        left=m.group(1)
        if " - " in left:                      # a chain, not the live head
            key=left.count(" - ")              # number of terms distinguishes rungs
            out.setdefault(key,[]).append((m.group(2),m.group(3)))
    return out
print(f"{'file':22} {'pre-D425 (8d146be)':28} {'now (HEAD)':28} verdict")
for f in FILES:
    a=frozen("8d146be",f); b=frozen("HEAD",f)
    if a is None or b is None: continue
    va=sorted(v for vs in a.values() for v in vs)
    vb=sorted(v for vs in b.values() for v in vs)
    ok = va==vb
    print(f"{f:22} {str(va)[:27]:28} {str(vb)[:27]:28} {'OK restored' if ok else '⚠ DIFFERS'}")
